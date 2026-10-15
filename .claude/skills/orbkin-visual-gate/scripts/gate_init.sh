#!/usr/bin/env bash
# gate_init.sh - create THIS run's directory and its run.json marker; prints the RUN path. < 1 s.
#   RUN=$(bash gate_init.sh <label> [--root DIR] [--reuse])
# RUN = ${--root:-${ORBKIN_RUNS:-/tmp/orbkin-gate}}/<mmdd-HHMM>-<label>. Refuses to use a directory that already
# holds files unless --reuse (then it warns and records "reused": true), so artefacts from an earlier run cannot
# end up beside yours. Writes RUN/run.json {label, created, cwd, git_rev, git_branch, load1, host} that report.sh
# uses to (a) warn about files older than the run and (b) print the run header. Also exports nothing: put the
# printed path in RUN yourself (`export ORBKIN_RUN=$RUN` makes every judge write RUN-relative paths without --run).
# Exit 0; 1 directory in use; 2 usage.
set -u
LABEL=""; ROOT="${ORBKIN_RUNS:-/tmp/orbkin-gate}"; REUSE=0
while [[ $# -gt 0 ]]; do case "$1" in --root) ROOT="$2"; shift 2;; --reuse) REUSE=1; shift;; -h|--help) sed -n '2,10p' "$0"; exit 0;; -*) echo "unknown arg $1" >&2; exit 2;; *) LABEL="$1"; shift;; esac; done
[[ -z "$LABEL" ]] && { echo "usage: RUN=\$(bash gate_init.sh <label> [--root DIR] [--reuse])" >&2; exit 2; }
LABEL="$(echo "$LABEL" | tr -c 'A-Za-z0-9._\n-' '-')"
RUN="$ROOT/$(date +%m%d-%H%M)-$LABEL"
if [[ -d "$RUN" && -n "$(ls -A "$RUN" 2>/dev/null)" ]]; then
  if [[ $REUSE -eq 0 ]]; then
    echo "error: $RUN already holds files ($(ls -A "$RUN" | head -5 | tr '\n' ' ')...). Pick another label, wait a minute, or pass --reuse to accept that earlier artefacts sit beside this run's." >&2
    exit 1
  fi
  echo "warning: reusing $RUN; report.sh will flag files older than this run.json" >&2
fi
mkdir -p "$RUN"
python3 - "$RUN" "$LABEL" "$REUSE" <<'PY'
import json, os, subprocess, sys, time
run, label, reuse = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
def git(*a):
    try: return subprocess.run(['git', *a], capture_output=True, text=True, timeout=5).stdout.strip() or None
    except Exception: return None
try: load1 = round(os.getloadavg()[0], 1)
except Exception: load1 = None
d = {'label': label, 'created': time.strftime('%Y-%m-%dT%H:%M:%S'), 'created_epoch': time.time(), 'cwd': os.getcwd(),
     'git_rev': git('rev-parse', '--short', 'HEAD'), 'git_branch': git('branch', '--show-current'), 'load1': load1,
     'host': os.uname().nodename, 'cpus': os.cpu_count(), 'reused': reuse, 'format': 1}
json.dump(d, open(os.path.join(run, 'run.json'), 'w'), indent=1)
PY
echo "$RUN"
