#!/usr/bin/env node
/*
 * ebus_crc8.js - compute the leading CRC8 byte of a Wolf/Kromschroeder
 *                5022 (read) / 5023 (write) message ID.
 *
 * Background
 * ----------
 * In the Wolf "5022/5023" parameter protocol the message ID is NOT
 *
 *     <fixed prefix><parameter>
 *
 * as it is often assumed (the widespread "CC = read, 00 = write" rule of
 * thumb). The first byte is a CRC8 over all following data bytes:
 *
 *     read :  <ZZ> 5022 03 <CRC8> <TelegramNr LE16>
 *     write:  <ZZ> 5023 09 <CRC8> <TelegramNr LE16> <value LE16> <suffix 4 byte>
 *
 * Algorithm: eBUS style (bitwise shift-in, not the usual "crc ^= byte"),
 *            polynomial 0x5C, init 0x00, no reflection, no final XOR.
 *
 * Some devices verify the CRC (e.g. Wolf COB-15 boiler at slave 0x08) and
 * answer "ERR: read timeout" on a mismatch. Others ignore it completely
 * (e.g. the BM control module) - which is why the wrong "CC" prefix
 * appeared to work for years on some installations.
 *
 * See README.md, section "The first ID byte is a CRC8".
 *
 * Usage
 * -----
 *   node tools/ebus_crc8.js 0E00 0D00        # -> CC0E00, 280D00
 *   node tools/ebus_crc8.js CC0D00           # 3-byte input: first byte is
 *                                            #   replaced by the correct CRC
 *   node tools/ebus_crc8.js --check file.csv # verify all IDs in a config file
 *   node tools/ebus_crc8.js --fix   file.csv # rewrite all IDs in place
 *
 * Created: 2026-09-20
 */

'use strict';
const fs = require('fs');

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

const toBytes = (s) => {
  const out = [];
  for (let i = 0; i < s.length; i += 2) out.push(parseInt(s.substr(i, 2), 16));
  return out;
};
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

// Returns the ID with a correct leading CRC8 byte.
// 2-byte input  -> CRC is prepended.
// 3-byte input  -> the existing first byte is replaced.
function fixId(id) {
  const b = toBytes(id);
  const payload = b.length >= 3 ? b.slice(1) : b;
  return hex2(crc8(payload)) + id.slice(id.length >= 6 ? 2 : 0).toUpperCase();
}

const ID_RE = /^[0-9A-Fa-f]{6}(;[0-9A-Fa-f]{6})*$/;

// Walks an ebusd CSV and calls cb(ids) for every message row that carries
// a hex ID in column 8. Returns the (possibly rewritten) file content.
function walkCsv(file, cb) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line, n) => {
      if (!line.trim() || line.startsWith('#')) return line;
      const cols = line.split(',');
      const ids = (cols[7] || '').trim();
      if (!ids || !ID_RE.test(ids)) return line;
      // Write messages are skipped on purpose: their CRC has to cover the
      // value too, which a static ID column cannot express. See README.
      if ((cols[0] || '').startsWith('w')) {
        cb({ line: n + 1, name: cols[2], ids, fixed: ids, write: true });
        return line;
      }
      const fixed = ids.split(';').map(fixId).join(';');
      cb({ line: n + 1, name: cols[2], zz: cols[5], pbsb: cols[6], ids, fixed });
      cols[7] = fixed;
      return cols.join(',');
    })
    .join('\n');
}

const args = process.argv.slice(2);
const mode = args[0];

if (mode === '--check' || mode === '--fix') {
  let ok = 0;
  let skipped = 0;
  const wrong = [];
  for (const file of args.slice(1)) {
    const out = walkCsv(file, (r) => {
      if (r.write) skipped++;
      else if (r.ids.toUpperCase() === r.fixed) ok++;
      else wrong.push(`  line ${r.line}  ${r.name}: ${r.ids} -> ${r.fixed}`);
    });
    if (mode === '--fix') fs.writeFileSync(file, out);
    console.log(`${file}: ${ok} read IDs correct, ${wrong.length} wrong, ${skipped} write IDs skipped`);
    wrong.forEach((w) => console.log(w));
    ok = 0;
    skipped = 0;
    wrong.length = 0;
  }
} else if (args.length) {
  for (const id of args) console.log(`${id}\t->\t${fixId(id)}`);
} else {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 44).join('\n'));
  process.exit(1);
}
