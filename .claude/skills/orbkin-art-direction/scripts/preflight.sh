#!/usr/bin/env bash
# preflight.sh - Step 0 of orbkin-art-direction: can this machine capture and judge right now?
# Runs orbkin-visual-gate's doctor.sh (the stand-in for the planned game/tools/bootstrap/bootstrap.sh,
# which does not exist yet) and adds the two checks that broke the volcanic pilot's captures and were
# reported "ok" by the harness: free disk (a full / gave blank frames and black materials) and load
# (SwiftShader on a shared 4-core box). Prints one JSON object; exit 0 go, 1 no-go (JSON says why), 2 usage.
#   bash preflight.sh [--min-free-gb 2] [--max-load-per-core 2.5] [--game game] [--scratch DIR]   (DIR = the session scratchpad)
set -u
MIN_GB=2; MAX_LPC=2.5; GAME="game"; SCRATCH_ARG=""
while [[ $# -gt 0 ]]; do case "$1" in
  --min-free-gb) MIN_GB="$2"; shift 2;; --max-load-per-core) MAX_LPC="$2"; shift 2;; --game) GAME="$2"; shift 2;; --scratch) SCRATCH_ARG="$2"; shift 2;;
  -h|--help) sed -n '2,8p' "$0"; exit 0;; *) echo "unknown arg $1" >&2; exit 2;; esac; done
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATE_DOCTOR="$HERE/../../orbkin-visual-gate/scripts/doctor.sh"
BOOTSTRAP="$GAME/tools/bootstrap/bootstrap.sh"
DOCTOR_JSON="{}"; DOCTOR_RC=1
if [[ -f "$GATE_DOCTOR" ]]; then
  DOCTOR_JSON="$(bash "$GATE_DOCTOR" --game "$GAME" 2>/dev/null)"; DOCTOR_RC=$?
  [[ -z "$DOCTOR_JSON" ]] && DOCTOR_JSON="{}"
fi
SCRATCH="${SCRATCH_ARG:-${CLAUDE_SCRATCHPAD_DIR:-${TMPDIR:-/tmp}}}"
python3 - "$DOCTOR_JSON" "$DOCTOR_RC" "$MIN_GB" "$MAX_LPC" "$SCRATCH" "$BOOTSTRAP" "$GATE_DOCTOR" "$(pwd)" <<'PY'
import json, os, shutil, sys
doc_raw, rc, min_gb, max_lpc, scratch, bootstrap, gate_doctor, cwd = sys.argv[1:9]
try:
    doc = json.loads(doc_raw)
except json.JSONDecodeError:
    doc = {'raw': doc_raw[:400]}
min_gb, max_lpc, rc = float(min_gb), float(max_lpc), int(rc)
nogo, warn = [], []
if not os.path.exists(gate_doctor):
    nogo.append(f'orbkin-visual-gate doctor.sh not found at {gate_doctor}: captures and judges come from that skill')
elif rc != 0:
    nogo.append('doctor.sh not ready: ' + '; '.join(doc.get('missing') or ['see doctor output']))
disk = {}
seen = set()
for name, path in (('scratch', scratch), ('tmp', '/tmp'), ('repo', cwd)):
    try:
        dev = os.stat(path).st_dev
        if dev in seen:
            disk[name] = {'path': path, 'same_filesystem_as': [k for k, v in disk.items() if v.get('dev') == dev][0]}
            continue
        seen.add(dev)
        u = shutil.disk_usage(path)
        gb = u.free / 2**30
        disk[name] = {'path': path, 'free_gb': round(gb, 2), 'dev': dev}
        if gb < min_gb:
            nogo.append(f'{name} ({path}) has {gb:.2f} GB free < {min_gb} GB: a full disk gave blank / black-material frames reported ok in the pilot; free space before capturing')
    except OSError as ex:
        disk[name] = {'path': path, 'error': str(ex)}
cpus = os.cpu_count() or 1
load1 = os.getloadavg()[0] if hasattr(os, 'getloadavg') else None
lpc = (load1 / cpus) if load1 is not None else None
capture_flags = '--workers 1'
if lpc is not None and lpc > max_lpc:
    warn.append(f'load1 {load1:.1f} on {cpus} cores ({lpc:.1f}/core > {max_lpc}): captures take 2-3x longer and may time out; use --workers 1 --timeout-s 600 and run desk and phone one after the other')
    capture_flags = '--workers 1 --timeout-s 600'
elif lpc is not None and lpc > 1.0:
    capture_flags = '--workers 1 --timeout-s 600'
bs = os.path.exists(bootstrap)
if not bs:
    warn.append(f'{bootstrap} does not exist yet (planned): doctor.sh is Step 0; the $ORBKIN_BPY / bootstrap lines in older skill text do not apply')
out = {'go': not nogo, 'nogo': nogo, 'warnings': warn, 'doctor_ready': doc.get('ready'), 'where': doc.get('where'), 'sealed': doc.get('sealed'),
       'deny_rule_for_sealed': doc.get('deny_rule_for_sealed'), 'git_branch': doc.get('git_branch'), 'claude_cli': doc.get('claude_cli'),
       'disk': disk, 'cpus': cpus, 'load1': None if load1 is None else round(load1, 2), 'capture_flags': capture_flags,
       'bootstrap_present': bs, 'doctor_missing': doc.get('missing'), 'doctor_notes': doc.get('notes'),
       'unsealed_rule': 'sealed != present => every verdict is pilot evidence: the best achievable outcome is "no regression + queued for the owner", never ACCEPTED; write success criteria that way' if doc.get('sealed') != 'present' else 'sealed present',
       'capture_check': 'open every raw/<id>.png with Read before measuring; check capture.json errors/warnings/selfCheck/layout/calls; a blank or black-walled frame is invalid even when ok:true'}
print(json.dumps(out, indent=1))
sys.exit(0 if not nogo else 1)
PY
