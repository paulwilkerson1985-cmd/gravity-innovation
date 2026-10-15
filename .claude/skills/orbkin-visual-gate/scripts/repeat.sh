#!/usr/bin/env bash
# repeat.sh - standing rule 1 as ONE command: capture the same ids twice from one build and prove every file is
# pixel-identical (sha256 of raw / clean / crop / scene per id + pixdiff --tol 0). ~2x one capture (desk 4-7 min
# each on the loaded cloud box; phone 1.5-2 min). Cost $0.
#   bash repeat.sh --out RUN/repeat --ids cavebrann-desk,cavebrann-phone [--game game] [--dist DIR]
#                  [-- capture.mjs options e.g. --shots-json x.json --url '?scene=...' --id cavebrann --vp desk,phone]
# Builds once into OUT/dist (or reuses --dist), runs capture.mjs into OUT/cap1 and OUT/cap2 with --self-check none
# (this IS the self-check, for every id), then writes OUT/repeat.json {identical: bool, per_id: {id: {files:
# {name: {sha_a, sha_b, equal}}, pixdiff}}, seconds} and OUT/repeat-sha256.txt. report.sh reads repeat.json.
# Exit 0 all identical, 1 a difference (the clock is not frozen for that shot: do not judge it), 2 capture failed.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT=""; IDS=""; GAME="game"; DIST=""; EXTRA=()
while [[ $# -gt 0 ]]; do case "$1" in
  --out) OUT="$2"; shift 2;; --ids) IDS="$2"; shift 2;; --game) GAME="$2"; shift 2;; --dist) DIST="$2"; shift 2;;
  -h|--help) sed -n '2,12p' "$0"; exit 0;; --) shift; EXTRA=("$@"); break;; *) EXTRA+=("$1"); shift;; esac; done
[[ -z "$OUT" ]] && { echo "usage: repeat.sh --out DIR --ids ids [--dist DIR] [-- capture options]" >&2; exit 2; }
mkdir -p "$OUT"; T0=$(date +%s)
IDARG=(); [[ -n "$IDS" ]] && IDARG=(--ids "$IDS")
if [[ -z "$DIST" ]]; then
  DIST="$OUT/dist"
  echo "[repeat] building $GAME -> $DIST" >&2
  (cd "$GAME" && npx vite build --outDir "$DIST" --emptyOutDir > "$OUT/build.log" 2>&1) || { echo "error: vite build failed, see $OUT/build.log" >&2; exit 2; }
fi
for k in 1 2; do
  echo "[repeat] capture $k/2" >&2
  node "$HERE/capture.mjs" --out "$OUT/cap$k" --game "$GAME" --dist "$DIST" --self-check none --no-crop "${IDARG[@]}" "${EXTRA[@]}" > "$OUT/cap$k.log" 2> "$OUT/cap$k.err" || { echo "error: capture $k failed: $(tail -c 400 "$OUT/cap$k.log")" >&2; exit 2; }
  python3 -I "$HERE/crop.py" "$OUT/cap$k" > /dev/null 2>&1 || true
done
python3 -I - "$OUT" "$HERE" "$T0" <<'PY'
import json, hashlib, os, subprocess, sys, time
out, here, t0 = sys.argv[1], sys.argv[2], float(sys.argv[3])
def sha(p): return hashlib.sha256(open(p, 'rb').read()).hexdigest()
a = json.load(open(os.path.join(out, 'cap1', 'capture.json'))); b = json.load(open(os.path.join(out, 'cap2', 'capture.json')))
B = {s['id']: s for s in b['shots']}
res = {'identical': True, 'per_id': {}, 'lines': []}
for s in a['shots']:
    t = B.get(s['id'])
    if not s.get('ok') or not t or not t.get('ok'):
        res['identical'] = False; res['per_id'][s['id']] = {'error': 'a capture failed'}; continue
    files = {}
    for name in ('raw', 'clean', 'crop', 'scene', 'late'):
        pa, pb = s.get(name), t.get(name)
        if pa and pb and os.path.isfile(pa) and os.path.isfile(pb):
            ha, hb = sha(pa), sha(pb)
            files[name] = {'sha_a': ha, 'sha_b': hb, 'equal': ha == hb}
            res['lines'].append(f"{os.path.basename(pa)} {ha} {hb} {'EQUAL' if ha == hb else 'DIFFERENT'}")
    d = subprocess.run([sys.executable, '-I', os.path.join(here, 'pixdiff.py'), s['raw'], t['raw'], '--tol', '0'], capture_output=True, text=True)
    try: pd = json.loads(d.stdout.strip().splitlines()[-1])
    except Exception: pd = {'error': d.stderr[-200:]}
    ok = all(f['equal'] for f in files.values()) and bool(pd.get('identical'))
    res['per_id'][s['id']] = {'files': files, 'pixdiff': pd, 'frame_a': s.get('frame'), 'frame_b': t.get('frame'), 'identical': ok,
                              'seconds_a': round((s.get('ms') or 0) / 1000), 'seconds_b': round((t.get('ms') or 0) / 1000)}
    if not ok: res['identical'] = False
res['seconds'] = round(time.time() - t0); res['dist'] = a.get('dist'); res['settings'] = {k: a.get(k) for k in ('frameDt', 'settleFrames', 'minFrame', 'extraQs')}
json.dump(res, open(os.path.join(out, 'repeat.json'), 'w'), indent=1)
open(os.path.join(out, 'repeat-sha256.txt'), 'w').write('\n'.join(res['lines']) + '\n')
print(json.dumps({'identical': res['identical'], 'ids': {k: v.get('identical') for k, v in res['per_id'].items()}, 'seconds': res['seconds'], 'out': os.path.join(out, 'repeat.json')}))
sys.exit(0 if res['identical'] else 1)
PY
