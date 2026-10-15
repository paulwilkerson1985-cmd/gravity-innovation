#!/usr/bin/env python3
"""Blind pairwise visual judge, motion-strip judge and originality (IP) check, run through a
fresh tool-less `claude -p` per vote (the model never sees your reasoning, only the images).

This is the orbkin-sprite-creature stand-in for orbkin-visual-gate: same protocol (canary first,
both display orders, `better` only when it wins in both orders), simpler surface. Prefer the gate
skill's scripts when they exist (`.claude/skills/orbkin-visual-gate/`).

  judge.py pair  --candidate NEW.png --baseline OLD.png [--crop] [--votes 2] [--out v.json]
      exit 0 better | 1 worse / no_difference | 3 invalid (canary failed: the run is unusable)
      --crop: also judge 2x nearest crops of the subject boxes read from NEW/OLD's capture JSON
              (the <name>.json next to each PNG, or pass --crop-box x,y,w,h in CSS px).
  judge.py strip --candidate A.png --baseline B.png [--votes 3] [--out v.json]
      motion strips (attacker only, every 2nd frame); neutral rubric; same verdict rule.
  judge.py ip    IMAGE [IMAGE...] [--runs 3] [--out ip.json]
      exit 0 PASS | 1 REVIEW | 4 FAIL  (FAIL = similarity >= 7 with distinctive overlap)
  judge.py floor --candidate NEW.png --baseline OLD.png
      free defect floor (value range, squint contrast, sharpness) printed as WARN lines; never a target.
Options: --model opus (default; haiku has a 63% first-position bias and is only for dry runs).
Cost: about $0.05-0.10 per opus vote; a pair with crops is ~10 votes.
"""
import argparse
import base64
import io
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image, ImageFilter
    import numpy as np
except ImportError:  # pragma: no cover
    print('error: needs Pillow and numpy (python3 -m pip install --user is NOT allowed here; use the game venv or the system packages)', file=sys.stderr)
    sys.exit(2)

PAIR_PROMPT = (
    'You are an experienced game art director judging two candidate frames from an HD-2D pixel-art '
    'creature-battle game with original characters. Decide which candidate is the better professional '
    'game screenshot: sprite quality and readability (silhouette, face, colour blocks, outline), how well '
    'the subjects sit in the lit scene, composition and crispness. Ignore the HUD text. You must pick one, '
    'even if they are close. Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}'
)
CROP_PROMPT = (
    'You are an experienced pixel artist. These are 2x nearest-neighbour crops of the two creature sprites in '
    'a battle frame, from two candidate builds of an original creature game. Decide which crop reads better as a '
    'hand-made sprite: clear silhouette, eyes and face readable, 3-5 clean tones per colour, no muddy blending into '
    'the ground, no orphan pixels, a proper 1-texel outline. You must pick one. '
    'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}'
)
STRIP_PROMPT = (
    'These are two frame strips (left to right, top to bottom, every 2nd frame at 60 fps, frame numbers on the tiles) '
    'of the same creature sprite performing its attack animation in a turn-based creature game. Judge ONLY the '
    'creature\'s own motion: which attack animation is better? You must pick one. '
    'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}'
)
IP_PROMPT = (
    'You are a character-design IP reviewer. For EVERY creature or human character you can see in this image, name '
    'the closest existing franchise character (Pokemon, Digimon, Palworld, Temtem, Dragon Quest, Monster Hunter, '
    'Cassette Beasts, Nexomon, Coromon, Yo-kai Watch, Ni no Kuni, or any other), give a similarity 0-10 '
    '(10 = the same character or a recolour; 7 = most fans would say "that is X"; 4 = same archetype only), the '
    'shared features, whether the overlap is generic (an archetype any designer could reach) or distinctive '
    '(specific silhouette + markings + colour + signature part), and one change that would differentiate it. '
    'Reply with only JSON: {"characters": [{"subject": "<where in the image>", "closest": "<franchise character>", '
    '"similarity": 0-10, "shared": "<features>", "overlap": "generic" or "distinctive", "change": "<one line>"}]}'
)


def b64img(path):
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(Path(path).read_bytes()).decode()}}


def ask(blocks, model, timeout=240):
    """One fresh, tool-less claude -p turn with inline images; returns parsed JSON (or None) and raw text."""
    msg = {'type': 'user', 'message': {'role': 'user', 'content': blocks}}
    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_SESSION_ID')}
    r = subprocess.run(['claude', '-p', '--model', model, '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--tools', '', '--max-turns', '1'],
                       input=json.dumps(msg) + '\n', capture_output=True, text=True, env=env, timeout=timeout)
    text, cost = '', 0.0
    for line in r.stdout.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get('type') == 'result':
            text = ev.get('result') or ''
            cost = ev.get('total_cost_usd') or 0.0
    m = re.search(r'\{.*\}', text, re.S)
    try:
        return (json.loads(m.group(0)) if m else None), text, cost
    except ValueError:
        return None, text, cost


def vote_pair(a, b, prompt, model):
    blocks = [{'type': 'text', 'text': 'Image A:'}, b64img(a), {'type': 'text', 'text': 'Image B:'}, b64img(b), {'type': 'text', 'text': prompt}]
    j, text, cost = ask(blocks, model)
    w = (j or {}).get('winner')
    return {'winner': w if w in ('A', 'B') else None, 'confidence': (j or {}).get('confidence'), 'reason': (j or {}).get('reason', text[:200]), 'cost': cost}


def both_orders(cand, base, prompt, votes, model, label):
    """votes per order; returns verdict for the candidate + the raw votes."""
    out = {'label': label, 'votes': [], 'cost': 0.0}
    cand_first = cand_second = 0
    for i in range(votes):
        v = vote_pair(cand, base, prompt, model)  # candidate shown first (A)
        v['order'] = 'cand-first'
        out['votes'].append(v)
        out['cost'] += v['cost']
        cand_first += v['winner'] == 'A'
        v = vote_pair(base, cand, prompt, model)  # candidate shown second (B)
        v['order'] = 'cand-second'
        out['votes'].append(v)
        out['cost'] += v['cost']
        cand_second += v['winner'] == 'B'
    out['candidateWins'] = {'shownFirst': f'{cand_first}/{votes}', 'shownSecond': f'{cand_second}/{votes}'}
    won_first, won_second = cand_first > votes / 2, cand_second > votes / 2
    lost_first, lost_second = cand_first < votes / 2, cand_second < votes / 2
    out['verdict'] = 'better' if won_first and won_second else 'worse' if lost_first and lost_second else 'no_difference'
    return out


def degrade(path, out):
    """Canary: half-res bilinear + 1.2 px blur of the baseline (a known-worse frame)."""
    im = Image.open(path).convert('RGB')
    w, h = im.size
    im = im.resize((max(1, w // 2), max(1, h // 2)), Image.BILINEAR).resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
    im.save(out)


def crop_subjects(png, box=None, scale=2):
    """2x nearest crop of the subject union box (CSS px) read from the capture JSON next to the PNG."""
    png = Path(png)
    im = Image.open(png).convert('RGB')
    if box is None:
        meta = png.with_suffix('.json')
        # capture.mjs writes <name>.json with views; find the view whose file is this PNG.
        cands = sorted(png.parent.glob('*.json'))
        dpr, subs = 1, []
        for c in cands:
            try:
                d = json.loads(c.read_text())
            except ValueError:
                continue
            for v in (d.get('views') or {}).values():
                if v.get('file') and Path(v['file']).name == png.name:
                    dpr, subs = v.get('dpr', 1), [s for s in v.get('subjects', []) if s['name'] in ('mine', 'foe')]
        if not subs:
            raise SystemExit(f'no subject boxes found for {png}; pass --crop-box x,y,w,h')
        x0 = min(s['x'] for s in subs); y0 = min(s['y'] for s in subs)
        x1 = max(s['x'] + s['w'] for s in subs); y1 = max(s['y'] + s['h'] for s in subs)
        pad = 0.15 * max(x1 - x0, y1 - y0)
        box = (int((x0 - pad) * dpr), int((y0 - pad) * dpr), int((x1 + pad) * dpr), int((y1 + pad) * dpr))
    else:
        x, y, w, h = box
        box = (x, y, x + w, y + h)
    box = (max(0, box[0]), max(0, box[1]), min(im.width, box[2]), min(im.height, box[3]))
    c = im.crop(box)
    c = c.resize((c.width * scale, c.height * scale), Image.NEAREST)
    out = png.with_name(png.stem + '-crop.png')
    c.save(out)
    return out, box


def floor_metrics(path):
    im = np.asarray(Image.open(path).convert('L'), dtype=np.float32)
    lo, hi = np.percentile(im, 1), np.percentile(im, 99)
    small = np.asarray(Image.open(path).convert('L').resize((64, 36), Image.BOX), dtype=np.float32)
    blur = np.asarray(Image.open(path).convert('L').filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)
    hf = float(np.abs(im - blur).mean() / max(1e-6, im.std()))
    return {'valueRange': float(hi - lo), 'squintStd': float(small.std()), 'hfRatio': round(hf, 3)}


def cmd_pair(a):
    out = {'candidate': a.candidate, 'baseline': a.baseline, 'model': a.model, 'results': [], 'cost': 0.0}
    tmp = Path(a.candidate).with_name('canary-degraded.png')
    degrade(a.baseline, tmp)
    canary = both_orders(str(a.baseline), str(tmp), PAIR_PROMPT, 1, a.model, 'canary (baseline vs degraded baseline)')
    out['canary'] = canary
    out['cost'] += canary['cost']
    if canary['verdict'] != 'better':
        out['verdict'] = 'invalid'
        finish(out, a.out, 3)
    full = both_orders(a.candidate, a.baseline, PAIR_PROMPT, a.votes, a.model, 'full frame')
    out['results'].append(full)
    out['cost'] += full['cost']
    verdict = full['verdict']
    if a.crop:
        box = tuple(map(int, a.crop_box.split(','))) if a.crop_box else None
        ca, _ = crop_subjects(a.candidate, box)
        cb, _ = crop_subjects(a.baseline, box)
        crop = both_orders(str(ca), str(cb), CROP_PROMPT, a.votes, a.model, 'subject crop 2x')
        out['results'].append(crop)
        out['cost'] += crop['cost']
        if crop['verdict'] == 'worse' and verdict == 'better':
            verdict = 'no_difference'  # frame nicer, subjects worse: a human looks
        out['cropVerdict'] = crop['verdict']
    out['verdict'] = verdict
    # Franchise-name tripwire in the reasons.
    names = re.findall(r'\b(pokemon|pikachu|charmander|squirtle|bulbasaur|eevee|dragonair|geodude|digimon|slime|palworld|cubone|leafeon)\b', json.dumps(out), re.I)
    if names:
        out['ipTripwire'] = sorted(set(n.lower() for n in names))
    finish(out, a.out, 0 if verdict == 'better' else 1)


def cmd_strip(a):
    out = {'candidate': a.candidate, 'baseline': a.baseline, 'model': a.model, 'cost': 0.0}
    res = both_orders(a.candidate, a.baseline, STRIP_PROMPT, a.votes, a.model, 'attack strip (neutral rubric)')
    out['results'] = [res]
    out['cost'] = res['cost']
    out['verdict'] = res['verdict']
    finish(out, a.out, 0 if res['verdict'] == 'better' else 1)


def cmd_ip(a):
    out = {'images': [], 'model': a.model, 'cost': 0.0}
    worst = 'PASS'
    for img in a.images:
        runs = []
        for _ in range(a.runs):
            j, text, cost = ask([b64img(img), {'type': 'text', 'text': IP_PROMPT}], a.model)
            out['cost'] += cost
            chars = (j or {}).get('characters') or []
            verdict = 'PASS'
            for c in chars:
                sim = float(c.get('similarity') or 0)
                dist = str(c.get('overlap', '')).lower().startswith('dist')
                if sim >= 7 and dist:
                    verdict = 'FAIL'
                elif (sim >= 5 or dist) and verdict != 'FAIL':
                    verdict = 'REVIEW'
            runs.append({'verdict': verdict, 'characters': chars, 'raw': None if chars else text[:300]})
        maxsim = max([float(c.get('similarity') or 0) for r in runs for c in r['characters']] or [0])
        v = 'FAIL' if any(r['verdict'] == 'FAIL' for r in runs) else 'REVIEW' if any(r['verdict'] == 'REVIEW' for r in runs) else 'PASS'
        out['images'].append({'image': img, 'verdict': v, 'maxSimilarity': maxsim, 'runs': runs})
        worst = 'FAIL' if 'FAIL' in (worst, v) else 'REVIEW' if 'REVIEW' in (worst, v) else 'PASS'
    out['verdict'] = worst
    finish(out, a.out, {'PASS': 0, 'REVIEW': 1, 'FAIL': 4}[worst])


def cmd_floor(a):
    c, b = floor_metrics(a.candidate), floor_metrics(a.baseline)
    warns = []
    if c['valueRange'] < 55: warns.append(f"value range {c['valueRange']:.0f} < 55 (flat frame)")
    if c['squintStd'] < 12: warns.append(f"squint std {c['squintStd']:.1f} < 12 (no value structure)")
    for k in c:
        if b[k] > 0 and c[k] < 0.8 * b[k]: warns.append(f'{k} dropped {b[k]:.2f} -> {c[k]:.2f} vs baseline')
    out = {'candidate': c, 'baseline': b, 'warnings': warns, 'note': 'floors, not targets: exceeding them earns nothing'}
    finish(out, a.out, 1 if warns else 0)


def finish(out, path, code):
    s = json.dumps(out, indent=1)
    if path:
        Path(path).write_text(s)
    print(s)
    sys.exit(code)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    for name in ('pair', 'strip', 'floor'):
        s = sub.add_parser(name)
        s.add_argument('--candidate', required=True)
        s.add_argument('--baseline', required=True)
        s.add_argument('--votes', type=int, default=2 if name == 'pair' else 3)
        s.add_argument('--model', default='opus')
        s.add_argument('--out')
        if name == 'pair':
            s.add_argument('--crop', action='store_true')
            s.add_argument('--crop-box')
    s = sub.add_parser('ip')
    s.add_argument('images', nargs='+')
    s.add_argument('--runs', type=int, default=3)
    s.add_argument('--model', default='opus')
    s.add_argument('--out')
    a = p.parse_args()
    {'pair': cmd_pair, 'strip': cmd_strip, 'ip': cmd_ip, 'floor': cmd_floor}[a.cmd](a)


if __name__ == '__main__':
    main()
