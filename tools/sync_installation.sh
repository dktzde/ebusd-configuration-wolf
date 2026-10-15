#!/bin/sh
# Copies the live ebusd configuration of the reference installation into
# installation/ (verbatim snapshot, no edits). Run from the repo root:
#   sh tools/sync_installation.sh [/path/to/live/configpath]
set -e
SRC="${1:-/share/ebusd_config}"
DST="$(dirname "$0")/../installation"
[ -d "$SRC" ] || { echo "not found: $SRC" >&2; exit 1; }
find "$DST" -name '*.csv' -delete 2>/dev/null || true
(cd "$SRC" && find . -name '*.csv') | while read -r f; do
  mkdir -p "$DST/$(dirname "$f")"
  cp "$SRC/$f" "$DST/$f"
done
date +%Y-%m-%d > "$DST/SNAPSHOT_DATE"
echo "snapshot of $SRC -> installation/ ($(cat "$DST/SNAPSHOT_DATE"))"
