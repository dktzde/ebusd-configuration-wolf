Please find here some ebusd configuration files for my Wolf heating system.

Verified:
- CHA 07/10 and COB-15 (Field "CHA Status" is still work in progress, since I have some difficulty with decoding this bitmask in ebusd. Might have to do some post-processing here in Node-RED)
- MM-2 (Most messages have to be requested by polling and have to be chosen according to the configuration of the MM-2)
- BM-2 at the moment only contain a few select parameters which control a directly connected heating circuit.

Note: MM-2 configuration file includes only status fields. Configuration parameters are not included.

Note: Wolf devices may identify themselves as "Kromschroeder" on the eBUS, so `scanconfig` may not work reliably. Use `--configpath` to load these files directly.

Additional base files from [john30/ebusd-configuration](https://github.com/john30/ebusd-configuration/tree/master/archived/de):
- `_templates.csv` - data type templates
- `broadcast.csv` - standard eBUS broadcast messages
- `memory.csv` - memory addresses
