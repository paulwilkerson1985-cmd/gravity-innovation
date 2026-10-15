#!/usr/bin/env bash
# report.sh - S5: write the gate report skeleton from a run directory. Prints the report path. ~1 s.
#   bash report.sh RUN_DIR [--title "what changed"] [--out RUN_DIR/report.md]
# RUN_DIR is where this run's artefacts were written: capture.json / compare.json (capture.mjs), any
# floor-*.json (artgate_compare.py --out), verdict-*.json (visual_judge.py / judge_motion.py --out),
# ip-*.json (ip_check.py --out), lint-*.json (motionlint.py --out), kit/key.json (owner_kit.py).
# The skeleton has: per-shot table (view, defect floor, judge decision, win rate, canary, cost), total cost,
# the top-3 critic gaps, owner minutes for queued pairs, pending approvals, and the honest blanks you fill:
# "still weak", "not verified". Never write "looks better" where the verdict file says otherwise.
set -u
RUN="${1:-}"; [[ -z "$RUN" || "$RUN" == -h || "$RUN" == --help ]] && { sed -n '2,10p' "$0"; exit 2; }
shift
TITLE="(what changed)"; OUT="$RUN/report.md"
while [[ $# -gt 0 ]]; do case "$1" in --title) TITLE="$2"; shift 2;; --out) OUT="$2"; shift 2;; *) echo "unknown arg $1" >&2; exit 2;; esac; done
python3 -I - "$RUN" "$TITLE" "$OUT" <<'PY'
import glob, json, os, sys
run, title, out = sys.argv[1], sys.argv[2], sys.argv[3]
def load(p):
    try: return json.load(open(p))
    except Exception: return None
L = []
L.append(f'# Visual gate report: {title}\n')
L.append(f'Run dir: `{run}`\n')
cap = load(os.path.join(run, 'capture.json')); cmp_ = load(os.path.join(run, 'compare.json'))
if cap:
    ok = [s for s in cap['shots'] if s.get('ok')]
    L.append(f"## Capture\n- frozen clock: dt {cap.get('frameDt')} ms, settle {cap.get('settleFrames')}, min frame {cap.get('minFrame')}; {len(ok)}/{len(cap['shots'])} shots ok; extra qs `{cap.get('extraQs') or '-'}`")
    sc = [s for s in cap['shots'] if s.get('selfCheck')]
    for s in sc: L.append(f"- self-check {s['id']}: {'pixel-identical' if s['selfCheck'].get('identical') else 'DIFFERS (capture invalid)'}")
    for s in cap['shots']:
        if s.get('warnings'): L.append(f"- warning {s['id']}: " + ' | '.join(s['warnings']))
        if not s.get('ok'): L.append(f"- FAILED {s['id']}: " + ' | '.join((s.get('errors') or [])[:2]))
    if cmp_:
        L.append(f"- vs baseline `{cmp_.get('baseline')}`: changed {cmp_.get('changed')}; identical {cmp_.get('identical')}")
        if cmp_.get('outside_changed'): L.append(f"- pixels changed OUTSIDE the creature boxes (confound unless frame-wide change): {cmp_['outside_changed']}")
        if cmp_.get('frame_mismatch'): L.append(f"- ABSOLUTE FRAME MISMATCH (invalid A/B): {cmp_['frame_mismatch']}")
    L.append('')
floors = {os.path.basename(p): load(p) for p in sorted(glob.glob(os.path.join(run, 'floor*.json')))}
verdicts = {os.path.basename(p): load(p) for p in sorted(glob.glob(os.path.join(run, 'verdict*.json')))}
ips = {os.path.basename(p): load(p) for p in sorted(glob.glob(os.path.join(run, 'ip*.json')))}
lints = {os.path.basename(p): load(p) for p in sorted(glob.glob(os.path.join(run, 'lint*.json')))}
L.append('## Verdicts (one line per shot; copy the decision words, never paraphrase them)\n')
L.append('| shot / file | view | defect floor | judge | win rate | crop | canary | cost $ |')
L.append('|---|---|---|---|---|---|---|---|')
cost = 0.0; gaps = []; hits = set(); decisions = []
for name, f in floors.items():
    if not f: continue
    L.append(f"| {name} | floor | {'pass' if f.get('pass') else 'FAIL'} {[x['rule'] for x in f.get('findings', [])] or ''} | | | | | 0 |")
for name, v in verdicts.items():
    if not v: continue
    d = v.get('decision'); decisions.append(d); cost += v.get('cost_usd') or 0
    main = v.get('main') or {}; crop = v.get('crop') or {}
    can = v.get('canary'); can = can.get('decision') if isinstance(can, dict) else can
    L.append(f"| {name} | {v.get('view') or v.get('kind')} | | **{d}** | {main.get('candidate_win_rate', '')} | {crop.get('decision', '')} | {can or ''} | {v.get('cost_usd', 0)} |")
    for g in (v.get('critique') or {}).get('gaps', []) or []: gaps.append((name, g))
    hits.update(v.get('franchise_hits') or [])
    if not v.get('sealed'): L.append(f"| | | | unsealed run (no anchors) | | | | |")
for name, ip in ips.items():
    if not ip: continue
    cost += ip.get('cost_usd') or 0
    for r in ip.get('results', []):
        L.append(f"| {name}: {os.path.basename(r['image'])} | originality | | **{r['decision']}** {r.get('flags') or ''} | | | | |")
for name, li in lints.items():
    if not li: continue
    L.append(f"| {name} | motion lint | | flags {li.get('flags')} | amp {li.get('amplitude_texels')} tx, antic {li.get('antic_frames')} f, hold {li.get('hold_frames')} f, strike {li.get('strike_frames')} f | | | 0 |")
L.append(f'\nTotal judge cost: ${cost:.2f}. Decision rule: ACCEPTED only when no shot is `worse`, no defect floor FAILed, at least one target shot is `better` (or the change was meant to be invisible and all are `no_difference`), no originality FAIL, and the family is judge-trusted; otherwise it goes to the owner batch or back to the generator.\n')
if any(d == 'invalid' for d in decisions): L.append('**INVALID judge run present (canary failed): nothing above may be claimed; re-run or report the failure.**\n')
if hits: L.append(f'**Franchise tripwire hit:** {sorted(hits)} - run ip_check.py on the lineup and the battle crop before anything else.\n')
L.append('## Top critic gaps (located; this is the improvement signal, not the gate numbers)\n')
for i, (name, g) in enumerate(gaps[:3], 1): L.append(f"{i}. [{name}] {g.get('where')}: {g.get('what')} -> {g.get('fix')}")
if not gaps: L.append('(no critique in this run)')
L.append('')
key = load(os.path.join(run, 'key.json')) or load(os.path.join(run, 'kit', 'key.json'))
if key:
    n = len(key.get('pairs', {})) + len(key.get('repeats', []))
    fams = sorted({p.get('family') for p in key['pairs'].values() if p.get('kind') == 'main'})
    L.append(f'## Owner batch\n- {n} trials queued ({fams}); estimated owner time {n * 25 / 60 + 2:.0f} min (~25 s per pair + 2 min). Kit: `{os.path.join(run, "kit")}`; score the export with agree.py.\n')
else:
    L.append('## Owner batch\n- none queued (0 owner minutes). Human-gated families (density, DoF strength, UI skin, grade strength, outline weight, palette) must be queued, not claimed.\n')
L.append('## Pending approvals (owner)\n- [ ] sealed dir / deny rule present? (doctor.sh says)\n- [ ] any new package, binary or download in this change? (list, or "none")\n')
L.append('## Still weak (honest, at least 2, ranked)\n1. \n2. \n')
L.append('## Not verified / inferred\n- \n')
L.append('## Files changed\n- \n')
open(out, 'w').write('\n'.join(L) + '\n')
print(json.dumps({'report': out, 'verdicts': decisions, 'cost_usd': round(cost, 2), 'critic_gaps': len(gaps), 'franchise_hits': sorted(hits)}))
PY
