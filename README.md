ebusd configuration files for some Wolf devices.

## Verified

- **CHA 07/10** and **COB-15** (Field "CHA Status" is still work in progress, since I have some difficulty with decoding this bitmask in ebusd. Might have to do some post-processing here in Node-RED)
- **MM-2** (Most messages have to be requested by polling and have to be chosen according to the configuration of the MM-2)
- **BM-2** at the moment only contain a few select parameters which control a directly connected heating circuit.
- **BM** (the older module, `config_bm.csv`) – operating mode, summer/winter
  switchover temperature, DHW setpoint, DHW minimum and the real time clock,
  all readable *and writable*, verified on a COB-15.

Note: MM-2 configuration file includes only status fields. Configuration parameters are not included.

Note: Wolf devices may identify themselves as "Kromschroeder" on the eBUS, so `scanconfig` may not work reliably. Use `--configpath` to load these files directly.

---

## The first ID byte is a CRC8 – not a fixed prefix

This is the single most important thing to know about the Wolf `5022`/`5023`
parameter protocol, and it was wrong in every file of this repository until
2026-09-20.

The common assumption is that the message ID is `<fixed prefix><parameter>`
with `CC` meaning "read" and `00` meaning "write". **That is not the case.**
The first byte is a CRC8 over all following data bytes:

```
read :  <ZZ> 5022 03 <CRC8> <TelegramNr LE16>
write:  <ZZ> 5023 09 <CRC8> <TelegramNr LE16> <value LE16> <suffix 4 byte>
```

`TelegramNr` is the Wolf SmartSet parameter number, little endian.

### The algorithm

| Property | Value |
| --- | --- |
| Style | eBUS style, **bitwise shift-in** (not the usual `crc ^= byte`) |
| Polynomial | **0x5C** |
| Init | 0x00 |
| Reflection / final XOR | none |
| Covers | **all** following data bytes |

```js
function crc8(bytes) {
  let c = 0;
  for (let byte of bytes) {
    let b = byte;
    for (let i = 0; i < 8; i++) {
      const hi = c & 0x80;
      c = (c << 1) & 0xff;
      if (b & 0x80) c |= 1;
      if (hi) c ^= 0x5c;
      b = (b << 1) & 0xff;
    }
  }
  return c;
}
```

Use `tools/ebus_crc8.js` to compute or verify IDs:

```
$ node tools/ebus_crc8.js 0E00 0D00 5A00
0E00    ->      CC0E00
0D00    ->      280D00
5A00    ->      285A00

$ node tools/ebus_crc8.js --check config_cha.csv
config_cha.csv: 148 read IDs correct, 0 wrong, 67 write IDs skipped
```

`--fix` rewrites the IDs of a file in place. Write rows are skipped on
purpose, see "Why write messages were *not* changed" below.

### Why `CC` appeared to work for so long

Two reasons, and together they are very convincing as a false lead:

1. **Not every device checks the CRC.** The BM control module accepts any
   first byte – `CC`, the correct CRC, even `FF` all return the same value.
   On such a device the prefix theory is indistinguishable from the truth.
2. **`CC` happens to be the correct CRC of `0E 00`** (TelegramNr 14, domestic
   hot water temperature) – usually the very first register anyone tries.

Devices that *do* check the CRC answer `ERR: read timeout` on a mismatch,
which looks exactly like "this device does not have that register".

### Evidence

Measured on a Wolf COB-15 (slave `08`), 2026-09-20. Same register, once with
the `CC` prefix this repository used to ship, once with the correct CRC:

| Register | old ID | result | corrected ID | result |
| --- | --- | --- | --- | --- |
| kesselsolltemperatur | `CC0200` | `ERR: read timeout` | `B80200` | `023200` → 5.0 °C |
| aussentemperatur | `CC0C00` | `ERR: read timeout` | `740C00` | `02aa00` → 17.0 °C |
| kesseltemperatur | `CC0D00` | `ERR: read timeout` | `280D00` | `025802` → 60.0 °C |
| warmwassertemperatur | `CC0E00` | `024402` → 58.0 °C | `CC0E00` | (CRC already correct) |
| warmwassersolltemperatur | `CC1300` | `ERR: read timeout` | `541300` | `022602` → 55.0 °C |
| ruecklauftemperatur | `CC1600` | `ERR: read timeout` | `241600` | `020080` → n/v, no sensor fitted |

All **156** read IDs of `config_cha.csv` that target slave `08` were then
polled with corrected CRCs:

- **156 answers, 0 timeouts.** With the `CC` prefix all but one of them
  timed out.
- 6 registers returned real values (the boiler-side temperatures above),
  7 returned counter values, the remaining 143 returned `0x8000`.

`0x8000` means **"value not available"** – the register exists, the sensor or
function does not. Those are the heat-pump specific registers a COB-15
simply has no hardware for, so this is the expected and correct answer.

**This is the key diagnostic distinction:**

| Answer | Meaning |
| --- | --- |
| `ERR: read timeout` | wrong CRC, or the device does not know the TelegramNr |
| `020080` (`0x8000`) | register exists, value not available |
| anything else | real value, usually SIN/D2B little endian, divisor 10 |

A blanket timeout across a whole address range is almost always a format
error, not a device limitation.

### Independent confirmation

The finding was first brute-forced here (3 algorithm families × 256
polynomials × 4 init values, checked against 8 own bus captures – exactly one
combination matched 8/8), then confirmed against 22 foreign telegrams from
forums and issues (22/22). It also exists in the literature:

- [forum.fhem.de thread 50352, page 2](https://forum.fhem.de/index.php?topic=50352.0) – *"Prüfsumme CRC8 mit Polynom 5C der nachfolgenden Daten"*
- ebusd issue [#167](https://github.com/john30/ebusd/issues/167) – *"d8 is a CRC-8 checksum of the 8 bytes that follow"*
- `john30/ebusd-configuration`, `src/wolf/_templates.tsp` – `// todo 0x00 should rather be crc8 of following bytes, see issue #167`

The official `kromschroeder/08..hc.csv` shipped by ebusd has the same bug: it
hardcodes `00` as the first byte, so `Hwctemp`, `Flowtemp` and `Returntemp`
run into permanent read timeouts on any device that verifies the CRC.

### Why write messages were *not* changed

For a `5023` write the CRC has to cover the value as well, and the value is
only known at runtime. A static ID column in an ebusd CSV therefore **cannot**
carry a correct CRC for a write, no matter what byte is put there. The `00`
prefix of the `w` rows was left untouched – it works on devices that ignore
the CRC, which is the only place those rows ever worked anyway.

The alternative that *does* work is the short form without the CRC byte
(`NN` one lower), which is what `config_bm.csv` uses:

```
read :  <ZZ> 5022 02 <TelegramNr LE16>
write:  <ZZ> 5023 08 <TelegramNr LE16> <value LE16> <suffix 4 byte>
```

---

## Writing the operating mode (BM)

`config_bm.csv` adds summer/winter control for the older BM module, verified
on a COB-15:

```
write -c bm betriebsart Zeitschaltuhr     # winter, heating programme active
write -c bm betriebsart nur_Warmwasser    # summer, DHW only
```

Three things have to be right, and getting any of them wrong produces the
same misleading "acknowledged but no effect" behaviour:

1. **TelegramNr 274 (`0x0112`)**, not TelegramNr 90. TelegramNr 90 is a
   read-only mirror – it always tracks 274 but silently discards writes.
2. **Target the master address `f1`**, not the slave `f6`.
3. **The 4 byte suffix `5d010000` is mandatory** for this message. Without it
   the BM acknowledges and discards.

Effect was verified through four independent channels (TelegramNr 274,
TelegramNr 90, broadcast bit 6, and a real boiler setpoint jump from 5.0 °C
frost protection to 36.8 °C).

Note that the BM writes its own parameter internally when operated at the
device, so nothing appears on the bus when you change the mode by hand
(known Wolf behaviour, ebusd [#484](https://github.com/john30/ebusd/issues/484)).
That is not evidence that no write path exists.

A Wolf ISM7 gateway is **not** required for any of this.

---

## Looking up TelegramNr instead of scanning for it

Wolf parameter numbers do not have to be brute-forced. The ISM7 parameter
database is public in [`zivillian/ism7mqtt`](https://github.com/zivillian/ism7mqtt),
`src/ism7mqtt/Resources/`:

| File | Content |
| --- | --- |
| `parameter.xml` | PTID → name, min/max, step size, decimals |
| `converter.xml` | CTID → **TelegramNr** and type (`SS10` = signed 16 bit, divisor 10) |
| `device.xml` | device templates (`DTID`) with their `ParameterReference` lists |

For the BM families PTID = CTID, so `device.xml` → `DTID` → the referenced
PTIDs is enough to get a complete register list.

Two caveats, both learned the hard way:

- **A TelegramNr is only unique within a device template.** TelegramNr 385 is
  "DHW maximum temperature" in the boiler templates and does not exist at all
  in `DTID 30000 "BM"`. Always pick the matching `DTID` first.
- **The database describes the product family, not your installation.** A hit
  there is a hypothesis, not a proof – verify it on your own bus
  (`hex f6502202 <TelegramNr LE16>`) before relying on it. See the next
  section for a register that is neatly documented and simply not implemented.

---

## 1x DHW

"1x Warmwasser bereiten" – the one-shot DHW charge button on the control
module. **On a BM this is not triggerable over the bus.** Verified 2026-09-22
on a COB-15 with a BM at master `f1` / slave `f6`:

| TelegramNr | Source | Result |
| --- | --- | --- |
| 708 (`0x02C4`) | vendor template `DTID 30000 "BM"`, PTID 30073–30081 | `020080` at every bus participant (`08`, `15`, `35`, `75`, `f6`) |
| 10117 (`0x2785`) | BM-2 register, see `config_bm2.csv` | same |
| 362 (`0x016A`) | boiler "Warmwasserschnellstart" | same |

`0x8000` means "register unknown / not available". A countdown register that
existed would read `0` when idle, not `0x8000` – and it still answered
`0x8000` **while a charge started from the BM keypad was running**. Seven
write variants (both ID forms, both addresses, minutes and flag values) were
acknowledged and had no effect. A `grab` of the real keypress contains no
matching parameter telegram at all: the BM is a master itself and handles the
function internally, exactly like the manual operating-mode change described
above.

The commented-out `warmwasser_1x` rows in `config_bm.csv` are kept as a
record of that, not as something to uncomment and expect to work.

### What does work

Operating mode **3 "Heizbetrieb"** releases the DHW charge immediately and for
as long as it is set, regardless of the DHW time programme:

```
write -c bm betriebsart Heizbetrieb    # start
write -c bm betriebsart nur_Warmwasser # back to where you were
```

In the `hc RcTarget` broadcast the `hwc` bit goes to 1 and the DHW setpoint
commanded to the boiler jumps from the 10.0 °C blocking value to the real
setpoint. That `hwc` bit is the only reliable indicator of a running charge,
including charges started at the module itself.

Side effect: in winter this also heats the rooms while it is set. In summer
the automatic summer/winter switchover suppresses that. Restore the previous
mode when the tank is full.

### What does not work, although it looks like it should

| Attempt | Why it fails |
| --- | --- |
| Raising the DHW setpoint (TelegramNr 19) | while the time programme blocks, the controller keeps commanding 10.0 °C to the boiler no matter what the setpoint says |
| Raising the DHW minimum A13 (TelegramNr 408) | same |

Both registers are cleanly writable, they just have no effect in that state.

One more caveat when driving a charge from outside: the boiler only starts
once the tank has dropped below the setpoint by the **DHW hysteresis**
(TelegramNr 320 at the boiler, 5.0 K here). Within that band nothing happens
and the mode change only looks broken.

---

## Files

| File | Content |
| --- | --- |
| `config_cha.csv` | CHA 07/10 heat pump and COB-15 boiler, slave `08` |
| `config_bm.csv` | BM control module – operating mode, Wi/So switchover, DHW setpoint, DHW minimum, real time clock (all read/write), summer/winter broadcast flag |
| `config_bm2.csv` | BM-2 control module, slave `35` |
| `config_mm.csv` | MM-2 mixer module, slave `51` |
| `_templates.csv` | data type templates |
| `broadcast.csv` | standard eBUS broadcast messages |
| `memory.csv` | memory addresses |
| `tools/ebus_crc8.js` | compute / check / fix the leading CRC8 byte |

Base files `_templates.csv`, `broadcast.csv` and `memory.csv` are taken from
[john30/ebusd-configuration](https://github.com/john30/ebusd-configuration/tree/master/archived/de).

Addresses are installation specific. Check `ebusctl info` and adjust the `ZZ`
column if your modules sit elsewhere on the bus.

---

## Gotchas

- **`reload` is not enough after changing a CSV.** It reloads the local files
  but drops the manufacturer file loaded by `--scanconfig`. Restart ebusd
  instead.
- **Do not run a full register scan and normal reads at the same time.** The
  eBUS is a single serial medium; concurrent access makes ordinary reads run
  into timeouts.
- **The telnet `define` command splits on whitespace**, so definitions with
  spaces in the comment columns cannot be pasted into it. Loading the same
  line from a CSV file works fine.
