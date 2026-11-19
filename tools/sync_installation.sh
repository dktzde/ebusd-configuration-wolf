#!/bin/sh
# Copies the live ebusd configuration of the reference installation into
# installation/, plus the Home Assistant packages that use it (installation/
# home-assistant/). Verbatim snapshot; only notes naming the AI model used for
# an edit are stripped and private values (chat ID, user name) are replaced by
# placeholders. Run from the repo root:
#   sh tools/sync_installation.sh [/path/to/live/configpath] [/path/to/ha/packages]
set -e
SRC="${1:-/share/ebusd_config}"
HA_SRC="${2:-/homeassistant/packages}"
# Home Assistant packages to publish ("1x DHW" button rebuild + its writer)
HA_FILES="warmwasser_1x.yaml heizung_betriebsart_setzen.yaml"
DST="$(dirname "$0")/../installation"
[ -d "$SRC" ] || { echo "not found: $SRC" >&2; exit 1; }

clean() {
  sed -E \
    -e 's/ durch (Opus|Sonnet|Fable|Haiku) [0-9.]+(, Effort: (k\. A\.|[a-z]+))?//' \
    -e 's/, (Opus|Sonnet|Fable|Haiku) [0-9.]+//' \
    -e 's/ \((Opus|Sonnet|Fable|Haiku)[^)]*\)//' \
    -e 's/ \| (Opus|Sonnet|Fable|Haiku) [0-9.]+ \|$/ |/' \
    -e 's/ \| Modell +\|$/ |/' \
    -e 's/^(# \|-+\|-+\|)-+\|$/\1/' \
    -e 's/chat_id: [0-9]+/chat_id: 123456789  # placeholder/' \
    -e 's/Jessica ist keiner/nicht jeder Nutzer ist Admin/' \
    -e 's/Jessica/Mitbewohner/' \
    "$1"
}

find "$DST" -name '*.csv' -delete 2>/dev/null || true
(cd "$SRC" && find . -name '*.csv') | while read -r f; do
  mkdir -p "$DST/$(dirname "$f")"
  clean "$SRC/$f" > "$DST/$f"
done

if [ -d "$HA_SRC" ]; then
  mkdir -p "$DST/home-assistant"
  for f in $HA_FILES; do
    clean "$HA_SRC/$f" > "$DST/home-assistant/$f"
  done
fi

date +%Y-%m-%d > "$DST/SNAPSHOT_DATE"
echo "snapshot of $SRC (+ $HA_SRC) -> installation/ ($(cat "$DST/SNAPSHOT_DATE"))"
