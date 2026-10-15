#!/usr/bin/env python3
"""judge_motion.py - blind pairwise judge for animation FRAME STRIPS (candidate vs last accepted), canary first.

  python3 -I judge_motion.py --candidate DIR|strip.png --baseline DIR|strip.png --kind attack|sync|idle
         [--votes 2] [--canary blur|hitstop|none] [--model opus] [--sealed DIR] [--out verdict.json]

DIR = a strip.mjs capture dir with strips/ from make_strips.py (attack -> strips/attacker.png, sync ->
strips/sync.png, idle -> strips/idle.png). Every vote is asked in both orders; same decision rule and exit
codes as visual_judge.py (0 better, 1 worse/no_difference, 3 invalid, 2 bad input).
Canaries (baseline strip vs a degraded baseline strip, both orders):
  blur     tiles softened (default). Calibrated for stills (100 %); same recipe here.
  hitstop  held frames removed from the attacker strip (needs a capture DIR). Judges the motion read itself;
           medium confidence only (skill-pilot-ablation.md: the strip judge needs more known orderings). A
           failed hitstop canary invalidates the run like blur does; pass --canary none to skip canaries.
Why strips: the frozen mid-impact still judged a correct timing fix "worse" 8/8 (the target was white-flashed
on that frame). Pilot result on strips: P(skill-arm attack beats baseline) 0.67-0.72. Judge the attacker strip
for attack craft and the sync strip for hit feedback; report both.
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judgelib as J  # noqa: E402
from visual_judge import decide, run_set  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
KIND_FILE = {'attack': 'attacker.png', 'sync': 'sync.png', 'idle': 'idle.png'}
KIND_PROMPT = {'attack': 'attack_strip', 'sync': 'sync_strip', 'idle': 'idle_strip'}


def resolve(p, kind):
    if os.path.isdir(p):
        f = os.path.join(p, 'strips', KIND_FILE[kind])
        if not os.path.isfile(f):
            r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'make_strips.py'), p] + (['--idle'] if kind == 'idle' else []),
                               capture_output=True, text=True)
            if not os.path.isfile(f):
                raise FileNotFoundError(f'{f} missing and make_strips.py could not build it: {r.stderr[-300:]}')
        return f, p
    return p, None


def canary_image(kind, base_png, base_dir):
    if kind == 'blur':
        r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'make_strips.py'), base_dir or '.', '--canary', 'blur', '--strip', base_png], capture_output=True, text=True)
        out = base_png.replace('.png', '.canary-blur.png')
        if not os.path.isfile(out):
            raise RuntimeError('blur canary failed: ' + r.stderr[-300:])
        return out
    if kind == 'hitstop':
        if not base_dir:
            raise ValueError('hitstop canary needs the baseline as a capture DIR')
        r = subprocess.run([sys.executable, '-I', os.path.join(HERE, 'make_strips.py'), base_dir, '--canary', 'hitstop'], capture_output=True, text=True)
        out = os.path.join(base_dir, 'strips', 'attacker.canary-hitstop.png')
        if not os.path.isfile(out):
            raise RuntimeError('hitstop canary failed: ' + r.stderr[-300:])
        return out
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--candidate', required=True); ap.add_argument('--baseline', required=True)
    ap.add_argument('--kind', required=True, choices=['attack', 'sync', 'idle'])
    ap.add_argument('--votes', type=int, default=2); ap.add_argument('--canary', default='blur', choices=['blur', 'hitstop', 'none'])
    ap.add_argument('--model', default='opus'); ap.add_argument('--sealed'); ap.add_argument('--out')
    a = ap.parse_args()
    try:
        cand_png, _ = resolve(a.candidate, a.kind)
        base_png, base_dir = resolve(a.baseline, a.kind)
        cand = Image.open(cand_png).convert('RGB'); base = Image.open(base_png).convert('RGB')
    except (OSError, ValueError, FileNotFoundError) as e:
        print(f'error: {e}', file=sys.stderr); sys.exit(2)
    S = J.load_sealed(a.sealed)
    prompt = S['prompts'][KIND_PROMPT[a.kind]]
    res = {'candidate': cand_png, 'baseline': base_png, 'kind': a.kind, 'sealed': S['sealed'], 'model': a.model, 'votes': []}
    if a.canary != 'none' and not (a.canary == 'hitstop' and a.kind != 'attack'):
        try:
            cpath = canary_image(a.canary, base_png, base_dir)
        except (RuntimeError, ValueError) as e:
            print(f'error: {e}', file=sys.stderr); sys.exit(2)
        can = run_set(base, Image.open(cpath).convert('RGB'), prompt, None, 1, a.model, 'canary-' + a.canary)
        res['votes'] += can
        cd, _ = decide(can)
        res['canary'] = {'kind': a.canary, 'decision': cd}
        if cd != 'better':
            res['decision'] = 'invalid'; res['why'] = f'{a.canary} canary failed: the judge did not prefer the undegraded baseline strip in both orders'
            res['cost_usd'] = round(sum(v['cost'] for v in res['votes']), 3)
            print(json.dumps(res, indent=1))
            if a.out: json.dump(res, open(a.out, 'w'), indent=1)
            sys.exit(3)
    main_votes = run_set(cand, base, prompt, None, a.votes, a.model, 'main')
    res['votes'] += main_votes
    d, r = decide(main_votes)
    res['main'] = {'decision': d, 'candidate_win_rate': round(r, 2)}
    res['decision'] = d
    if d == 'no_difference' and 0.6 <= r < 0.75 and a.votes < 3:
        res['hint'] = 'win rate 0.6-0.75: one more vote per order may decide it'
    res['franchise_hits'] = J.franchise_hits([v['reason'] for v in main_votes], S['franchise'])
    res['cost_usd'] = round(sum(v['cost'] for v in res['votes']), 3)
    res['reasons'] = [f"{v['set']}/{v['order']}: {'cand' if v['candidate_won'] else 'base'} (c{v['confidence']}) - {v['reason']}" for v in main_votes]
    print(json.dumps(res, indent=1))
    if a.out: json.dump(res, open(a.out, 'w'), indent=1)
    sys.exit(0 if d == 'better' else 3 if d == 'invalid' else 1)


if __name__ == '__main__':
    main()
