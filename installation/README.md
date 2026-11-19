# Live configuration of the reference installation

Verbatim snapshot of the `--configpath` folder that runs on the reference
installation (Wolf COB-15 oil condensing boiler + BM control module, which
identifies itself as Kromschröder). Updated by hand every few months with
`sh tools/sync_installation.sh`; the date is in `SNAPSHOT_DATE`.

This is **not** the curated config of this repo (`config_*.csv` in the root),
it is what ebusd actually loads there, comments in German included:

| File | Content |
| --- | --- |
| `custom_wolf.csv` | all own definitions (BM + boiler): operating mode, time programs, DHW, room/setback temperature, heating curve, ECO/ABS, Wi/So switchover, RTC, COB state … – newest findings land here first |
| `kromschroeder/08..hc.csv` | official file with the CRC-less poll rows commented out (see the main README, "Gotchas") |
| `kromschroeder/50..mc.csv`, `kromschroeder/broadcast.csv`, `broadcast.csv`, `memory.csv` | unchanged base files |
| `home-assistant/warmwasser_1x.yaml` | Home Assistant package that rebuilds the BM button **"1x DHW"** (see below) |
| `home-assistant/heizung_betriebsart_setzen.yaml` | script used by it: writes the operating mode (TgNr 274) and confirms it by reading it back from the BM, up to 3 tries |
| `home-assistant/ebus_mqtt_weiterleitung.yaml` | **required** by the writer: forwards the event `ebus_mqtt_senden` to MQTT (`ebusd/<circuit>/<name>/get` or `/set`); the writer uses it to request the BM readback that confirms a mode change. Needed because recent Home Assistant versions allow `mqtt.publish` only for admin users |

## "1x DHW" button in Home Assistant

On this first-generation BM the one-time DHW function cannot be triggered over
eBUS: TelegramNr 708 (and 10117, 362) answers `0x8000` at every address, also
while the button is active, and a capture of a button press shows no parameter
telegram. The BM handles the button internally; the only visible effect is the
DHW release bit (`0x04`) in `1003 0800`.

Workaround used here: temporarily set the operating mode to **3 = heating
mode**. That releases DHW charging immediately, also outside the DHW time
program. The script waits until the tank reaches its setpoint (or a timeout)
and restores the previous mode; the previous mode is kept in an `input_text`,
so it is restored after a Home Assistant restart as well.
Side effect: during the heating season the rooms get heat too while it runs
(with DHW priority only after charging); in summer the Wi/So switchover keeps
heating off.

Install all three files as Home Assistant packages; without the forwarder every
mode change ends as "not confirmed". The packages are snapshots with German comments and the entity IDs of the
reference installation; adapt them to your own entities (MQTT discovery of
ebusd, `select` for the operating mode). Private values are replaced by
placeholders (e.g. the Telegram `chat_id`).

ebusd add-on (Home Assistant, ebusd 26.1) command line options:

```
--mqttjson --scanconfig --configpath=/share/ebusd_config/ --enablehex --enabledefine
```

Device: ebusd-esp over ENS (`ens:<ip>:3335`).
