#!/usr/bin/env bash
# Capture + tile the motion strips of one species as the foe in the meadow arena (frozen clock):
#   bash strips.sh <species> <out dir> [actions: lunge hit faint idle] [--game DIR] [--facts facts.json]
#                  [--extra "motion=tween"] [--suffix -tween]     (A/B baseline: same strip with extra URL params)
# Uses orbkin-visual-gate's strip tool when it exists, else this skill's capture.mjs + strips.py.
# Each strip: attacker only, every 2nd frame, 36 tiles, frame numbers on the tiles. Judge the
# strips with `judge.py strip`; never judge motion from a frozen frame.
set -euo pipefail
if [ "${1:-}" = "--help" ] || [ -z "${1:-}" ]; then sed -n 2,8p "$0"; exit 0; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPECIES="${1:?species id}"; OUT="${2:?out dir}"; shift 2
ACTIONS=(); GAME=""; FACTS=""; EXTRA=""; SUFFIX=""
while [ $# -gt 0 ]; do case "$1" in --game) GAME="$2"; shift 2;; --facts) FACTS="$2"; shift 2;; --extra) EXTRA="&$2"; shift 2;; --suffix) SUFFIX="$2"; shift 2;; *) ACTIONS+=("$1"); shift;; esac; done
[ ${#ACTIONS[@]} -eq 0 ] && ACTIONS=(lunge hit faint idle)
GAME="${GAME:-${ORBKIN_GAME:-$HERE/../../../../game}}"
GATE="$HERE/../../orbkin-visual-gate/scripts/strip.mjs"
mkdir -p "$OUT"
URL="scene=battle&route=meadow&hotspot=tall-grass&gfx=hd2d&foe=${SPECIES}&seed=7${EXTRA}"
for A in "${ACTIONS[@]}"; do
  FR=72; [ "$A" = idle ] && FR=72; [ "$A" = faint ] && FR=90
  if [ -f "$GATE" ]; then
    node "$GATE" --url "$URL" --action "$A" --out "$OUT" --name "${SPECIES}-${A}${SUFFIX}" --frames "$FR" --every 2
  else
    (cd "$GAME" && node "$HERE/capture.mjs" strip --game "$GAME" --url "$URL" --out "$OUT" --name "${SPECIES}-${A}${SUFFIX}" --action "$A" --frames "$FR" --every 2 >/dev/null)
    python3 -I "$HERE/strips.py" --capture "$OUT/${SPECIES}-${A}${SUFFIX}.json" --out "$OUT/${SPECIES}-${A}${SUFFIX}.png" ${FACTS:+--facts "$FACTS" --species "$SPECIES"} || true
  fi
  echo "strip: $OUT/${SPECIES}-${A}${SUFFIX}.png  (lint: $OUT/${SPECIES}-${A}${SUFFIX}.json next to it; per-frame log in the capture JSON)"
done
# Run gates one at a time afterwards: judge.py votes in parallel hit the nested CLI's timeout.
