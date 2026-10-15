#!/usr/bin/env python3
"""ip_check.py - blind originality check for creature / character designs and (--composition) environment layouts.

  python3 -I ip_check.py IMAGE [IMAGE ...] [--runs 3] [--scene | --composition [--hud]] [--raw-out DIR]
                         [--role target|control] [--expect PASS] [--run RUN] [--sealed DIR] [--out ip.json]

IMAGE: a lineup render (front/back, all stages; capture.mjs kind "lineup" or "baked"), or with --scene a 2x crop of an
in-game battle (then human trainers are checked too: use the `<id>.scene.png` crop from crop.py, which covers mine,
foe, player AND trainer boxes; the `<id>.crop.png` covers mine/foe only), or with --composition the FULL desk frame
(`<id>.png`): the judge then names the closest known game location / screen layout and rates layout similarity
(set dressing, light shafts, stairs, platforms, camera, where the combatants stand). It prefers the UI-free sibling
`<id>.clean.png` when one sits beside the given frame (the environment verdict must not be driven by the HUD);
pass --hud to judge the raw frame instead: the HUD then comes back as a SEPARATE `hud` block (closest battle-screen
layout, similarity) with its own `hud_decision`, which is a ui_skin question for the owner, never an arena block.
Run lineup + scene for any new or changed design; run --composition for any new or recomposed arena (rule 5: staging
and camera must not reproduce the reference's layout, not only its shapes, palettes and names); run --composition
--hud once per UI skin change. 3 fresh Opus runs per image, 4 in parallel.

Output per image: decision, run_verdicts, flags (similarity >= 5 or distinctive), fixes, and ALWAYS the full
`creatures` table (one row per creature/figure per run: where, closest, similarity, overlap) or `locations` table
(--composition), so a clean PASS still records which franchise character or place was closest. --raw-out DIR keeps
every raw judge JSON as DIR/<image-stem>.run<k>.json (tied to the image by name).
Decision per image (majority over runs): FAIL if >= 2 runs say FAIL (>= 7 + distinctive), REVIEW if any run says
FAIL/REVIEW, else PASS. Exit 0 all PASS, 1 any REVIEW, 4 any FAIL, 2 bad input. FAIL blocks the change; REVIEW goes
to the owner with the listed one-line fixes. Cost ~$0.02-0.06 per run (~$0.06-0.16 per image at 3 runs); 25-80 s per
image on the loaded cloud box. The JSON carries "provenance" (sha256 per image, RUN-relative paths, model, seconds,
cost) and, with --role control --expect PASS|REVIEW|FAIL, a "control" block (report.sh "Instrument checks").
Calibrated (judge-calibration.md section 8): franchise crops -> similarity 10/10, FAIL 3/3; Orbkin lineups mostly
3-5 generic. An LLM opinion, not a legal test. The lineup is the unbaked mesh on a grey stage; what ships is the
toon-baked sprite, so the scene crop (or a capture.mjs "baked" sheet) is the one that counts for the shipped look.
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judgelib as J  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+'); ap.add_argument('--runs', type=int, default=3)
    ap.add_argument('--scene', action='store_true', help='2x battle crop: creatures AND human figures')
    ap.add_argument('--composition', action='store_true', help='full frame: closest known game location / layout')
    ap.add_argument('--hud', action='store_true', help='with --composition: judge the raw frame (HUD visible) and report the HUD separately')
    ap.add_argument('--raw-out', help='directory for every raw judge JSON (<stem>.run<k>.json)')
    ap.add_argument('--sealed'); ap.add_argument('--out')
    ap.add_argument('--model', default='opus')
    J.add_role_args(ap)
    a = ap.parse_args()
    T0 = time.time(); RUN = J.run_dir_of(a.out, a.run)
    if a.scene and a.composition:
        print('error: --scene and --composition are different checks; run them separately', file=sys.stderr); sys.exit(2)
    for p in a.images:
        if not os.path.exists(p):
            print(f'error: {p} not found', file=sys.stderr); sys.exit(2)
    swapped = {}
    if a.composition and not a.hud:
        for i, p in enumerate(a.images):
            if p.endswith('.png') and not p.endswith('.clean.png'):
                c = p[:-4] + '.clean.png'
                if os.path.isfile(c):
                    swapped[c] = p; a.images[i] = c
        if swapped:
            print(f'[ip_check] --composition uses the UI-free frames: {", ".join(os.path.basename(c) for c in swapped)} (pass --hud to judge the HUD too)', file=sys.stderr)
    S = J.load_sealed(a.sealed)
    P = S['prompts']
    if a.composition:
        if 'ip_composition' not in P:
            print('error: sealed prompts.json predates --composition; re-run seal_init.py --force (owner session) or use the built-in defaults (unset ORBKIN_SEALED)', file=sys.stderr); sys.exit(2)
        prompt = P['ip_composition']
        mode = 'composition'
    else:
        prompt = P['ip'].format(what=P['ip_scene'] if a.scene else P['ip_lineup'])
        mode = 'scene' if a.scene else 'lineup'
    jobs = [(p, k) for p in a.images for k in range(a.runs)]
    if a.raw_out:
        os.makedirs(a.raw_out, exist_ok=True)
    models = []

    def one(j):
        p, k = j
        b, _ = J.img_block(p, 1600 if mode != 'composition' else 2576)
        out = J.call([b, {'type': 'text', 'text': prompt}], model=a.model)
        if out.get('model'):
            models.append(out['model'])
        if a.raw_out:
            stem = os.path.splitext(os.path.basename(p))[0]
            with open(os.path.join(a.raw_out, f'{stem}.run{k}.json'), 'w') as fh:
                json.dump({'image': p, 'run': k, 'mode': mode, 'json': out.get('json'), 'text': out.get('text'),
                           'cost': out.get('cost'), 'ms': out.get('ms'), 'error': out.get('error'), 'model': out.get('model')}, fh, indent=1)
        return p, k, out.get('json'), out.get('cost') or 0, out.get('error')
    with ThreadPoolExecutor(4) as ex:
        res = list(ex.map(one, jobs))
    report, worst = [], 0
    rows_key = 'locations' if mode == 'composition' else 'creatures'
    for p in a.images:
        runs = [(k, js) for q, k, js, c, e in res if q == p and js]
        errs = [e for q, k, js, c, e in res if q == p and e]
        verdicts = [js.get('verdict') for _, js in runs]
        if len(runs) < max(1, a.runs - 1):
            decision = 'REVIEW'; note = f'too many judge errors ({errs})'
        else:
            decision = 'FAIL' if verdicts.count('FAIL') >= 2 else 'REVIEW' if any(v in ('FAIL', 'REVIEW') for v in verdicts) else 'PASS'
            note = ''
        table = []
        for k, js in runs:
            for c in js.get(rows_key, []) or []:
                table.append({'run': k, 'where': c.get('where'), 'closest': c.get('closest'), 'similarity': c.get('similarity'),
                              'overlap': c.get('overlap'), 'shared': c.get('shared'), 'change_to_differentiate': c.get('change_to_differentiate')})
        flags = sorted({(r['closest'], r['similarity'], r['overlap']) for r in table
                        if (r['similarity'] or 0) >= 5 or r['overlap'] == 'distinctive'}, key=lambda t: -(t[1] or 0))
        max_sim = max([r['similarity'] or 0 for r in table] or [0])
        entry = {'image': p, 'image_rel': J.rel_to(p, RUN), 'mode': mode, 'decision': decision, 'run_verdicts': verdicts,
                 'max_similarity': max_sim, 'flags': flags,
                 'fixes': sorted({r['change_to_differentiate'] for r in table if (r['similarity'] or 0) >= 5} - {None}),
                 rows_key: table, 'why': [js.get('why') for _, js in runs], 'note': note}
        if mode == 'composition':
            entry['camera_and_staging'] = [js.get('camera_and_staging') for _, js in runs]
            entry['clean_frame_for'] = swapped.get(p)
            huds = [js.get('hud') for _, js in runs if isinstance(js.get('hud'), dict)]
            if huds:
                hs = [h.get('similarity') or 0 for h in huds]
                dist = sum(1 for h in huds if (h.get('similarity') or 0) >= 7 and h.get('overlap') == 'distinctive')
                entry['hud'] = huds
                entry['hud_decision'] = 'FAIL' if dist >= 2 else 'REVIEW' if any(x >= 5 for x in hs) or any(h.get('overlap') == 'distinctive' for h in huds) else 'PASS'
                entry['hud_note'] = 'HUD layout similarity is a ui_skin decision for the owner (families.md); it never blocks an arena change and is not part of this decision'
            else:
                entry['hud'] = None
        report.append(entry)
        worst = max(worst, {'PASS': 0, 'REVIEW': 1, 'FAIL': 4}[decision])
    overall = 'FAIL' if worst == 4 else 'REVIEW' if worst == 1 else 'PASS'
    cost = round(sum(c for _, _, _, c, _ in res), 3)
    out = {'results': report, 'decision': overall, 'mode': mode, 'sealed': S['sealed'], 'cost_usd': cost, 'role': a.role, 'expect': a.expect,
           'how_to_read': 'FAIL blocks (>= 7 + distinctive in >= 2 runs); REVIEW -> owner decides; the creatures/locations table '
                          'names the closest match per run even on PASS; an LLM opinion, not a legal test'}
    out['provenance'] = J.provenance({f'image{i}': p for i, p in enumerate(a.images)}, RUN, T0, cost, a.model,
                                     models[0] if models else None, a.role, a.expect, 'ip_check.py')
    out['control'] = J.control_outcome(a.role, a.expect, overall)
    J.write_result(out, a.out)
    sys.exit(worst)


if __name__ == '__main__':
    main()
