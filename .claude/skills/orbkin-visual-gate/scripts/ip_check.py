#!/usr/bin/env python3
"""ip_check.py - blind originality check for creature / character designs (3 fresh Opus runs per image).

  python3 -I ip_check.py IMAGE [IMAGE ...] [--runs 3] [--scene] [--sealed DIR] [--out ip.json]

IMAGE: a lineup render (front/back, all stages) or, with --scene, a 2x crop of an in-game battle (then human
trainers are checked too). Run it on the lineup AND the battle crop: the sprite bake can create a resemblance
the 3D lineup does not (Maelstrode scored 5-6 in the lineup but 7-9 in the battle crop). The judge names the
closest franchise character, rates similarity 0-10 (7 = "most fans would say that's X"), lists shared features
and says whether the overlap is a generic archetype or a distinctive signature.

Decision per image (majority over runs): FAIL if >= 2 runs say FAIL (>= 7 + distinctive), REVIEW if any run
says FAIL/REVIEW, else PASS. Exit 0 all PASS, 1 any REVIEW, 4 any FAIL, 2 bad input. FAIL blocks the change;
REVIEW goes to the owner with the listed one-line fixes. Cost ~$0.03 per run.
Calibrated (judge-calibration.md section 8): franchise crops -> similarity 10/10, FAIL 3/3; Orbkin lineups mostly
3-5 generic. An LLM opinion, not a legal test.
"""
import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judgelib as J  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('images', nargs='+'); ap.add_argument('--runs', type=int, default=3)
    ap.add_argument('--scene', action='store_true'); ap.add_argument('--sealed'); ap.add_argument('--out')
    ap.add_argument('--model', default='opus')
    a = ap.parse_args()
    for p in a.images:
        if not os.path.exists(p):
            print(f'error: {p} not found', file=sys.stderr); sys.exit(2)
    S = J.load_sealed(a.sealed)
    P = S['prompts']
    prompt = P['ip'].format(what=P['ip_scene'] if a.scene else P['ip_lineup'])
    jobs = [(p, k) for p in a.images for k in range(a.runs)]

    def one(j):
        p, k = j
        b, _ = J.img_block(p, 1600)
        out = J.call([b, {'type': 'text', 'text': prompt}], model=a.model)
        return p, out.get('json'), out.get('cost') or 0, out.get('error')
    with ThreadPoolExecutor(4) as ex:
        res = list(ex.map(one, jobs))
    report, worst = [], 0
    for p in a.images:
        runs = [js for q, js, c, e in res if q == p and js]
        errs = [e for q, js, c, e in res if q == p and e]
        verdicts = [js.get('verdict') for js in runs]
        if len(runs) < max(1, a.runs - 1):
            decision = 'REVIEW'; note = f'too many judge errors ({errs})'
        else:
            decision = 'FAIL' if verdicts.count('FAIL') >= 2 else 'REVIEW' if any(v in ('FAIL', 'REVIEW') for v in verdicts) else 'PASS'
            note = ''
        flags = sorted({(c.get('closest'), c.get('similarity'), c.get('overlap')) for js in runs for c in js.get('creatures', [])
                        if (c.get('similarity') or 0) >= 5 or c.get('overlap') == 'distinctive'}, key=lambda t: -(t[1] or 0))
        report.append({'image': p, 'decision': decision, 'run_verdicts': verdicts, 'flags': flags,
                       'fixes': sorted({c.get('change_to_differentiate') for js in runs for c in js.get('creatures', []) if (c.get('similarity') or 0) >= 5} - {None}),
                       'note': note})
        worst = max(worst, {'PASS': 0, 'REVIEW': 1, 'FAIL': 4}[decision])
    out = {'results': report, 'sealed': S['sealed'], 'cost_usd': round(sum(c for _, _, c, _ in res), 3),
           'how_to_read': 'FAIL blocks (>= 7 + distinctive in >= 2 runs); REVIEW -> owner decides; an LLM opinion, not a legal test'}
    print(json.dumps(out, indent=1))
    if a.out:
        json.dump(out, open(a.out, 'w'), indent=1)
    sys.exit(worst)


if __name__ == '__main__':
    main()
