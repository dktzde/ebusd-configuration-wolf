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

ebusd add-on (Home Assistant, ebusd 26.1) command line options:

```
--mqttjson --scanconfig --configpath=/share/ebusd_config/ --enablehex --enabledefine
```

Device: ebusd-esp over ENS (`ens:<ip>:3335`).
