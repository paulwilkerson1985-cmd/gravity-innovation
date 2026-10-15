#!/usr/bin/env bash
# report.sh - S5: write the gate report from a run directory (thin wrapper over report.py). ~1 s, $0.
#   bash report.sh RUN_DIR [--title "what changed"] [--out RUN_DIR/report.md] [--force]
# Schema-checks every JSON by content, walks RUN/*/capture.json, compare.json and repeat.json, re-checks the
# sha256 of every judged input (REFUSES mismatches), splits target rows from "Instrument checks" (controls),
# takes critic gaps from target verdicts only, adds a runtime column, warns about files older than run.json,
# prints the franchise banner only when a hit survives the stoplist and refuses to overwrite an existing
# report.md without --force. `python3 -I report.py --help` has the details. Exit 0 written, 1 refused, 2 bad input.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ $# -eq 0 || "$1" == -h || "$1" == --help ]] && { sed -n '2,9p' "$0"; exit 2; }
exec python3 -I "$HERE/report.py" "$@"
