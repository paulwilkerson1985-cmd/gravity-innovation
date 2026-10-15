#!/usr/bin/env python3
"""report.py - S5: write the gate report from a run directory (report.sh is a thin wrapper). ~1 s, $0.

  python3 -I report.py RUN_DIR [--title "what changed"] [--out RUN_DIR/report.md] [--force]

What it reads (every JSON is schema-checked by CONTENT, not by filename; non-dict or foreign JSON is skipped with a
warning that names the file): run.json (gate_init.sh), capture.json / compare.json / repeat.json at the root AND
one level down (cap1/, cap2/, base/, cand/, repeat/...), floor-*.json (artgate_compare), verdict-*.json
(visual_judge / judge_motion), ip-*.json (ip_check), lint-*.json (motionlint), kit/key.json (owner_kit).
What it proves: every result with "provenance" has the sha256 of each input re-checked against the file beside it
(the recorded path, or RUN-relative when the run dir moved); a mismatch is printed as REFUSED and its decision
is not counted. Results without provenance (older format) are listed as "unproven".
Roles: rows with role control/calibration go to an "Instrument checks" table (expected vs got, pass/fail) and
their critique never enters "Top critic gaps"; only target verdicts feed the improvement signal and the decision.
Also: a runtime column (seconds from provenance / capture ms), the capture section per capture dir, the repeat
proof, a warning for files older than run.json (another run's artefacts in this dir), the franchise tripwire banner
only when a hit survives the stoplist, sealed state (unsealed verdicts = pilot / self-test evidence, never an
acceptance), and the honest blanks to fill. Refuses to overwrite an existing report.md without --force.
Exit 0 written, 1 refused (report exists), 2 bad input.
"""
import argparse
import glob
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judgelib as J  # noqa: E402


def load(p):
    try:
        with open(p) as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return None


def classify(d):
    if not isinstance(d, dict):
        return None
    if 'votes' in d and 'decision' in d:
        return 'verdict'
    if 'findings' in d and 'pass' in d:
        return 'floor'
    if 'results' in d and 'how_to_read' in d:
        return 'ip'
    if 'flags' in d and 'beats' in d:
        return 'lint'
    if 'per_id' in d and 'identical' in d:
        return 'repeat'
    if 'shots' in d and 'frameDt' in d:
        return 'capture'
    if 'changed' in d and 'baseline' in d:
        return 'compare'
    if 'pairs' in d and 'images' in d:
        return 'key'
    if 'changed_pct' in d and 'identical' in d:
        return 'pixdiff'
    return None


def resolve(entry, run):
    """Find the file a provenance entry points at: recorded abs, else RUN-relative, else basename beside run."""
    for c in (entry.get('abs'), os.path.join(run, entry.get('path') or ''), os.path.join(run, os.path.basename(entry.get('path') or ''))):
        if c and os.path.isfile(c):
            return c
    return None


def verify(d, run):
    """-> (status, detail): 'ok' | 'MISMATCH' | 'missing' | 'unproven'."""
    pv = d.get('provenance')
    if not pv or not pv.get('inputs'):
        return 'unproven', 'no provenance block (older result format): inputs cannot be proven'
    bad, miss = [], []
    for name, e in pv['inputs'].items():
        if not e.get('sha256'):
            continue
        f = resolve(e, run)
        if not f:
            miss.append(name); continue
        if J.sha256_file(f) != e['sha256']:
            bad.append(name)
    if bad:
        return 'MISMATCH', f'sha256 differs for {bad}: the file beside this result is not the one that was judged'
    if miss:
        return 'missing', f'input file(s) not found: {miss} (recorded under {pv.get("run")})'
    return 'ok', ''


def secs(d):
    pv = d.get('provenance') or {}
    return pv.get('seconds')


def fmt_s(v):
    return '' if v is None else (f'{v:.0f} s' if v < 100 else f'{v / 60:.1f} min')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('run'); ap.add_argument('--title', default='(what changed)'); ap.add_argument('--out'); ap.add_argument('--force', action='store_true')
    a = ap.parse_args()
    run = os.path.abspath(a.run)
    if not os.path.isdir(run):
        print(f'error: {run} is not a directory', file=sys.stderr); sys.exit(2)
    out = a.out or os.path.join(run, 'report.md')
    if os.path.exists(out) and not a.force:
        print(json.dumps({'ok': False, 'error': f'{out} exists; pass --force to overwrite (or --out another path)'})); sys.exit(1)
    L, warns = [], []
    runmeta = load(os.path.join(run, 'run.json'))
    created = (runmeta or {}).get('created_epoch')
    L.append(f'# Visual gate report: {a.title}\n')
    L.append(f'Run dir: `{run}`' + (f" · label `{runmeta.get('label')}` · created {runmeta.get('created')} · git {runmeta.get('git_branch')}@{runmeta.get('git_rev')} · load {runmeta.get('load1')}" if runmeta else ' · (no run.json: start runs with gate_init.sh)') + f" · report written {time.strftime('%Y-%m-%dT%H:%M:%S')}\n")
    # ---- gather JSON by content
    files = sorted(glob.glob(os.path.join(run, '*.json')))
    nested = {}
    for sub in sorted(glob.glob(os.path.join(run, '*', ''))):
        for name in ('capture.json', 'compare.json', 'repeat.json'):
            p = os.path.join(sub, name)
            if os.path.isfile(p):
                nested.setdefault(os.path.basename(sub.rstrip('/')), {})[name] = p
    kinds = {'verdict': {}, 'floor': {}, 'ip': {}, 'lint': {}, 'repeat': {}, 'capture': {}, 'compare': {}, 'key': {}, 'pixdiff': {}}
    for p in files:
        if os.path.basename(p) in ('run.json',):
            continue
        d = load(p); k = classify(d)
        if k is None:
            warns.append(f'skipped `{os.path.basename(p)}`: not a gate result (not a dict or unknown schema)'); continue
        kinds[k][os.path.basename(p)] = d
        if created and os.path.getmtime(p) < created - 1:
            warns.append(f'`{os.path.basename(p)}` is OLDER than this run (mtime {time.strftime("%H:%M:%S", time.localtime(os.path.getmtime(p)))} < run start): another run\'s artefact in this dir?')
    for sub, m in nested.items():
        for name, p in m.items():
            d = load(p); k = classify(d)
            if k:
                kinds[k][f'{sub}/{name}'] = d
    kp = load(os.path.join(run, 'kit', 'key.json')) or load(os.path.join(run, 'key.json'))
    if classify(kp) == 'key':
        kinds['key']['key.json'] = kp
    # ---- sealed state
    sealed_flags = {v.get('sealed') for v in list(kinds['verdict'].values()) + list(kinds['ip'].values())}
    if sealed_flags and sealed_flags != {True}:
        L.append('> **UNSEALED run**: judge results carry `"sealed": false` (built-in prompts, no reference anchor, no anchors). Unsealed verdicts are pilot / self-test evidence only and never accept a change. Owner: `python3 -I seal_init.py --ref <thumb>` + the Read deny rule (setup.md section 5).\n')
    # ---- capture section (every capture dir)
    if kinds['capture']:
        L.append('## Capture (frozen clock; one block per capture dir)\n')
        for name, cap in kinds['capture'].items():
            ok = [s for s in cap['shots'] if s.get('ok')]
            L.append(f"- `{name}`: dt {cap.get('frameDt')} ms, settle {cap.get('settleFrames')}, min frame {cap.get('minFrame')}, qs `{cap.get('extraQs') or '-'}`, workers {cap.get('workers')}; {len(ok)}/{len(cap['shots'])} ok in {cap.get('seconds')} s; dist `{cap.get('dist')}`")
            for s in cap['shots']:
                sc = s.get('selfCheck')
                L.append(f"  - {s['id']}: {'ok' if s.get('ok') else 'FAILED'} frame {s.get('frame')} · {round((s.get('ms') or 0) / 1000)} s"
                         + (f" · self-check {'pixel-identical' if sc.get('identical') else 'DIFFERS (capture invalid)'}" if sc else '')
                         + (f" · calls {s.get('calls')}" if s.get('calls') is not None else '')
                         + (f" · lineup `{s['lineup'].get('label')}`" if s.get('lineup') else '')
                         + (' · WARN ' + ' | '.join(s['warnings']) if s.get('warnings') else '')
                         + (' · ERR ' + ' | '.join((s.get('errors') or [])[:2]) if not s.get('ok') else ''))
        for name, c in kinds['compare'].items():
            L.append(f"- `{name}` vs baseline `{c.get('baseline')}`: changed {c.get('changed')}; identical {c.get('identical')}"
                     + (f"; OUTSIDE-BOX CHANGES (confound unless frame-wide): {c['outside_changed']}" if c.get('outside_changed') else '')
                     + (f"; ABSOLUTE FRAME MISMATCH (invalid A/B): {c['frame_mismatch']}" if c.get('frame_mismatch') else ''))
        L.append('')
    if kinds['repeat'] or kinds['pixdiff']:
        L.append('## Repeat proof (standing rule 1: two captures from one build)\n')
        for name, pdx in kinds['pixdiff'].items():
            L.append(f"- `{name}`: {'identical' if pdx.get('identical') else 'DIFFERS ' + str(pdx.get('changed_pct')) + ' %'} (pixdiff, tol {pdx.get('tol', '?')})")
        for name, r in kinds['repeat'].items():
            L.append(f"- `{name}`: {'ALL IDENTICAL' if r.get('identical') else 'DIFFERENCES FOUND (do not judge the differing ids)'} in {r.get('seconds')} s")
            for sid, v in (r.get('per_id') or {}).items():
                fl = v.get('files') or {}
                L.append(f"  - {sid}: {'identical' if v.get('identical') else 'DIFFERS'} · files {', '.join(f'{k} {'=' if f['equal'] else '!='}' for k, f in fl.items())} · pixdiff tol 0 {('identical' if (v.get('pixdiff') or {}).get('identical') else (v.get('pixdiff') or {}).get('changed_pct'))} · frames {v.get('frame_a')}/{v.get('frame_b')} · {v.get('seconds_a')} s + {v.get('seconds_b')} s")
        L.append('')
    # ---- results: verify, split by role
    S = J.load_sealed(None)
    cost = 0.0; gaps = []; hits = set(); target_decisions = []; controls = []; refused = []
    rows = []
    for name, f in kinds['floor'].items():
        st, why = verify(f, run)
        role = f.get('role', 'target')
        dec = 'pass' if f.get('pass') else 'FAIL'
        rules = [x['rule'] for x in f.get('findings', []) if x.get('severity') == 'FAIL'] or [x['rule'] for x in f.get('findings', [])]
        if st == 'MISMATCH':
            refused.append((name, why)); continue
        if role != 'target':
            controls.append((name, 'floor', f.get('expect'), dec, (f.get('control') or {}).get('pass'), secs(f), st)); continue
        rows.append(f"| {name} | floor | {dec} {rules or ''} | | | | | 0 | {fmt_s(secs(f))} | {st} |")
        if not f.get('pass'):
            target_decisions.append('floor_FAIL')
    for name, v in kinds['verdict'].items():
        st, why = verify(v, run)
        role = v.get('role', 'target')
        d = v.get('decision')
        if st == 'MISMATCH':
            refused.append((name, why)); continue
        cost += v.get('cost_usd') or 0
        main = v.get('main') or {}; crop = v.get('crop') or {}
        can = v.get('canary'); can_s = ''
        if isinstance(can, list):
            can_s = ', '.join(f"{c.get('kind')} {c.get('decision')}{' (weak c' + str(c.get('confidence')) + ')' if c.get('strength') == 'weak' else ''}" for c in can)
        elif isinstance(can, dict):
            can_s = f"{can.get('kind')} {can.get('decision')}"
        else:
            can_s = str(can or '') + (f" (c{v.get('canary_confidence')})" if v.get('canary_confidence') else '')
        if role != 'target':
            controls.append((name, v.get('view') or v.get('kind'), v.get('expect'), d, (v.get('control') or {}).get('pass'), secs(v), st)); continue
        target_decisions.append(d)
        extra = (' · early exit ' + v['early_exit']) if v.get('early_exit') else ''
        rows.append(f"| {name} | {v.get('view') or v.get('kind')} | | **{d}**{extra} | {main.get('candidate_win_rate', '')} ({main.get('votes_cast', len([x for x in v.get('votes', []) if x.get('set') == 'main']))} votes) | {crop.get('decision', '')} | {can_s} | {v.get('cost_usd', 0)} | {fmt_s(secs(v))} | {st} |")
        for g in (v.get('critique') or {}).get('gaps', []) or []:
            gaps.append((name, g))
        texts = [x.get('reason') for x in v.get('votes', []) if x.get('set') == 'main'] + [(g.get('what') or '') + ' ' + (g.get('fix') or '') for g in (v.get('critique') or {}).get('gaps', []) or []]
        hits.update(J.franchise_hits(texts, S['franchise']))
    for name, ip in kinds['ip'].items():
        st, why = verify(ip, run)
        if st == 'MISMATCH':
            refused.append((name, why)); continue
        cost += ip.get('cost_usd') or 0
        role = ip.get('role', 'target')
        if role != 'target':
            controls.append((name, 'originality ' + str(ip.get('mode', '')), ip.get('expect'), ip.get('decision'), (ip.get('control') or {}).get('pass'), secs(ip), st)); continue
        for r in ip.get('results', []):
            key = 'locations' if r.get('mode') == 'composition' else 'creatures'
            closest = sorted({(c.get('closest'), c.get('similarity')) for c in r.get(key, []) or [] if c.get('closest')}, key=lambda t: -(t[1] or 0))[:6]
            hud = f" · HUD (ui_skin, owner): **{r['hud_decision']}** {max((h.get('similarity') or 0) for h in r['hud'])}/10" if r.get('hud_decision') else ''
            rows.append(f"| {name}: {os.path.basename(r['image'])} | originality {r.get('mode', '')} | | **{r['decision']}** max sim {r.get('max_similarity', '?')} {r.get('flags') or ''}{hud} | closest: {', '.join(f'{c} {s}' for c, s in closest) or 'n/a (older format)'} | | | | {fmt_s(secs(ip))} | {st} |")
            if r['decision'] == 'FAIL':
                target_decisions.append('ip_FAIL')
            elif r['decision'] == 'REVIEW':
                target_decisions.append('ip_REVIEW')
    for name, li in kinds['lint'].items():
        rows.append(f"| {name} | motion lint | | flags {li.get('flags')} | amp {li.get('amplitude_texels')} tx, antic {li.get('antic_frames')} f, hold {li.get('hold_frames')} f, strike {li.get('strike_frames')} f | | | 0 | | advisory |")
    L.append('## Verdicts on the change (target rows only; copy the decision words, never paraphrase them)\n')
    L.append('| file | view | defect floor | judge | win rate | crop | canary | cost $ | runtime | inputs proven |')
    L.append('|---|---|---|---|---|---|---|---|---|---|')
    L += rows or ['| (no target results in this run) | | | | | | | | | |']
    L.append(f'\nTotal judge cost this run (target + controls): ${cost:.2f}.\n')
    if refused:
        L.append('**REFUSED results (input hash does not match the file beside them; not counted):**')
        for n, w in refused:
            L.append(f'- `{n}`: {w}')
        L.append('')
    if controls:
        L.append('## Instrument checks (controls / calibration; these say nothing about the game)\n')
        L.append('| file | kind | expected | got | instrument | runtime | inputs proven |')
        L.append('|---|---|---|---|---|---|---|')
        for n, k, exp, got, ok, s_, st in controls:
            L.append(f"| {n} | {k} | {exp or '(no --expect)'} | **{got}** | {'PASS' if ok else ('FAIL' if ok is False else 'n/a')} | {fmt_s(s_)} | {st} |")
        bad = [n for n, k, exp, got, ok, s_, st in controls if ok is False]
        L.append('\n' + ('**An instrument check FAILED: the gate itself is suspect for this run; fix that before reading any target verdict.**' if bad else 'All instrument checks with an expectation passed.') + '\n')
    # ---- decision
    td = target_decisions
    L.append('## Decision rule applied\n')
    if not td:
        L.append('- No target verdicts: nothing is claimed about the change.')
    else:
        if 'invalid' in td:
            L.append('- **INVALID judge run present (canary failed): nothing above may be claimed; re-run or report the failure.**')
        if 'floor_FAIL' in td:
            L.append('- **A defect floor FAILed: NOT ACCEPTED until the defect is fixed.**')
        if 'ip_FAIL' in td:
            L.append('- **Originality FAIL: blocked; nothing claimed.**')
        if 'worse' in td:
            L.append('- **A target shot is `worse`: NOT ACCEPTED; rework with the critique or revert.**')
        if 'ip_REVIEW' in td:
            L.append('- Originality REVIEW: the owner decides (list the one-line fixes).')
        clean = not any(x in td for x in ('invalid', 'floor_FAIL', 'ip_FAIL', 'worse'))
        if clean and 'better' in td:
            L.append('- Floors pass, no `worse`, >= 1 `better`: ACCEPTED only if the family is judge-trusted AND the run is sealed; otherwise QUEUED for the owner (families.md).')
        elif clean:
            L.append('- Floors pass, all `no_difference`: keep only if the change was meant to be invisible; else not accepted.')
    L.append('')
    if hits:
        L.append(f'**Franchise tripwire hit (survived the stoplist):** {sorted(hits)} - run ip_check.py on the lineup, the scene crop and (new arena) --composition before anything else.\n')
    L.append('## Top critic gaps (target verdicts only; located; this is the improvement signal, not the gate numbers)\n')
    for i, (name, g) in enumerate(gaps[:3], 1):
        L.append(f"{i}. [{name}] {g.get('where')}: {g.get('what')} -> {g.get('fix')}")
    if not gaps:
        L.append('(no target critique in this run; control critiques are deliberately excluded)')
    L.append('')
    key = kinds['key'].get('key.json')
    if key:
        n = len(key.get('pairs', {})) + len(key.get('repeats', []))
        fams = sorted({p.get('family') for p in key['pairs'].values() if p.get('kind') == 'main'})
        L.append(f'## Owner batch\n- {n} trials queued ({fams}); estimated owner time {n * 25 / 60 + 2:.0f} min (~25 s per pair + 2 min). Kit: `{os.path.join(run, "kit")}`; score the export with agree.py.\n')
    else:
        L.append('## Owner batch\n- none queued (0 owner minutes). Human-gated families (density, DoF strength, UI skin, grade strength, outline weight, palette) must be queued, not claimed.\n')
    L.append('## Pending approvals (owner)\n- [ ] sealed dir / deny rule present? (doctor.sh says; unsealed = nothing accepted)\n- [ ] any new package, binary or download in this change? (list, or "none")\n')
    if warns:
        L.append('## Report warnings\n' + '\n'.join(f'- {w}' for w in warns) + '\n')
    L.append('## Still weak (honest, at least 2, ranked)\n1. \n2. \n')
    L.append('## Not verified / inferred\n- \n')
    L.append('## Files changed\n- \n')
    with open(out, 'w') as fh:
        fh.write('\n'.join(L) + '\n')
    print(json.dumps({'ok': True, 'report': out, 'target_decisions': td, 'controls': [(n, got, ok) for n, k, e, got, ok, s_, st in controls],
                      'refused': [n for n, _ in refused], 'cost_usd': round(cost, 2), 'critic_gaps': len(gaps), 'franchise_hits': sorted(hits), 'warnings': warns}))


if __name__ == '__main__':
    main()
