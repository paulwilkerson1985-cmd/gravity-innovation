#!/usr/bin/env bash
# baseline.sh - capture the LAST ACCEPTED tree (git HEAD, or --rev) with the same harness and settings as the
# candidate: the A side of every pair. ~1 min build + 1-4 min per shot. Prints capture.mjs's JSON summary.
#   bash baseline.sh --out DIR --ids cave-desk,cave-phone [--rev HEAD] [--game game] [-- capture.mjs options]
# Exports `git archive <rev> game/` into DIR/tree/game (the working tree is never touched), links the real
# game/node_modules into it, and runs capture.mjs --game DIR/tree/game --out DIR. Reuse DIR for the whole
# session (pass it to capture.mjs --baseline and to visual_judge.py --baseline DIR/raw/<id>.png).
# If the accepted state is not HEAD (the owner accepted a run that is not committed), capture that run's
# tree the same way with --rev <commit>, or keep that run dir as the baseline. Exit codes = capture.mjs.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=""; IDS="cave-desk,cave-phone"; REV="HEAD"; GAME="game"; EXTRA=()
while [[ $# -gt 0 ]]; do case "$1" in
  --out) OUT="$2"; shift 2;; --ids) IDS="$2"; shift 2;; --rev) REV="$2"; shift 2;; --game) GAME="$2"; shift 2;;
  -h|--help) sed -n '2,10p' "$0"; exit 0;; --) shift; EXTRA=("$@"); break;; *) EXTRA+=("$1"); shift;; esac; done
[[ -z "$OUT" ]] && { echo "usage: baseline.sh --out DIR --ids ids [--rev HEAD] [--game game] [-- capture options]" >&2; exit 2; }
[[ -d "$GAME" ]] || { echo "error: game dir $GAME not found (run from the repo root or pass --game)" >&2; exit 2; }
ROOT="$(cd "$GAME/.." && pwd)"; GB="$(basename "$GAME")"
mkdir -p "$OUT/tree"
if [[ ! -f "$OUT/tree/$GB/package.json" || "$(cat "$OUT/tree/.rev" 2>/dev/null)" != "$(git -C "$ROOT" rev-parse "$REV")" ]]; then
  rm -rf "$OUT/tree/$GB"
  git -C "$ROOT" archive --format=tar "$REV" "$GB" | tar -x -C "$OUT/tree" || { echo "error: git archive $REV failed" >&2; exit 2; }
  git -C "$ROOT" rev-parse "$REV" > "$OUT/tree/.rev"
fi
ln -sfn "$(cd "$GAME/node_modules" && pwd)" "$OUT/tree/$GB/node_modules"
echo "[baseline] $REV ($(cat "$OUT/tree/.rev" | cut -c1-10)) -> $OUT/tree/$GB" >&2
exec node "$HERE/capture.mjs" --game "$OUT/tree/$GB" --out "$OUT" --ids "$IDS" "${EXTRA[@]}"
