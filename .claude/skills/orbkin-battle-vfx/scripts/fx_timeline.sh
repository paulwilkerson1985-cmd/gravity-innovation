#!/usr/bin/env bash
# Frame-exact timeline of one attack in the built HD-2D game (virtual 60 fps clock), then the
# beat table and checks. Builds the game first unless --no-build (or BASE is set).
#
#   bash fx_timeline.sh MOVE [--out DIR] [--foe cindertail --foe-level 30] [--lead stormoth --lead-level 24]
#        [--arena cave] [--seed 13] [--before DIR/timeline.json] [--no-build] [--game DIR] [-- extra timeline.mjs args]
#
# MOVE is the move id from src/data/moves.ts (storm-lance, pyre-crash, breaker-crush, ...).
# Writes DIR/timeline.json, DIR/events.txt, DIR/frames/*.png, DIR/strip-frames.json and prints the
# summary table (before/after when --before is given). Exit 1 when a checked beat is outside the
# beat sheet, 2 on a harness error. Repeat runs with the same arguments are pixel-identical.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
GAME="$ROOT/game"
if [ $# -lt 1 ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then sed -n '2,12p' "$0"; exit 0; fi
MOVE="$1"; shift
OUT=""; BEFORE=""; BUILD=1; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="$2"; shift 2;;
    --before) BEFORE="$2"; shift 2;;
    --no-build) BUILD=0; shift;;
    --game) GAME="$2"; shift 2;;
    --) shift; EXTRA+=("$@"); break;;
    *) EXTRA+=("$1"); shift;;
  esac
done
OUT="${OUT:-$ROOT/game/screenshots/fx-timeline/$MOVE}"
mkdir -p "$OUT"
if [ -n "${BASE:-}" ]; then
  EXTRA+=(--base "$BASE")
elif [ "$BUILD" = 1 ]; then
  if [ ! -d "$GAME/node_modules" ]; then echo "fx_timeline: $GAME/node_modules missing: run (cd game && npm ci)" >&2; exit 2; fi
  (cd "$GAME" && npx vite build --logLevel error >/dev/null) || { echo "fx_timeline: vite build failed" >&2; exit 2; }
fi
[ -d "$GAME/dist" ] || { echo "fx_timeline: no $GAME/dist (build failed or --no-build without a build)" >&2; exit 2; }
node "$HERE/timeline.mjs" --dist "$GAME/dist" --out "$OUT" --move "$MOVE" "${EXTRA[@]}" > "$OUT/summary.json"
echo "timeline: $OUT/events.txt"
if [ -n "$BEFORE" ]; then
  python3 -I "$HERE/tl_summary.py" "$BEFORE" "$OUT/timeline.json"
else
  python3 -I "$HERE/tl_summary.py" "$OUT/timeline.json"
fi
