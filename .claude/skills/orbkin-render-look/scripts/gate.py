#!/usr/bin/env python3
"""Blind pairwise visual gate (fallback when the orbkin-visual-gate skill is not installed).
Same protocol as the calibrated gate (judge-calibration §6): canary first, then full frames in BOTH
display orders × --votes, through a fresh tool-less `claude -p` per vote with the images inline.

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/gate.py --candidate AFTER.clean.png --baseline BEFORE.clean.png \
      [--crop x0,y0,x1,y1 | --crop subjects] [--votes 2] [--model opus] [--view desk|phone] [--out verdict.json] [--no-canary] [--reasons]

Decision: `better` only when the candidate won ≥ 75 % of the full-frame votes AND won in both orders
AND mean confidence ≥ 2.5; `worse` symmetrically; everything else is `no_difference` (a first-class
outcome: near-equal pairs are decided by display order). Crops (2× nearest, fractions of width/height)
are a separate signal: a full-frame `better` with a crop `worse` becomes `no_difference`.
Canary: baseline vs a degraded baseline (½-res bilinear + 1.2 px blur) in both orders; if the judge
does not pick the clean frame both times the run is `invalid` (exit 3). Exit 0 better, 1 worse /
no_difference, 3 invalid. DoF/blur pairs: crops of defocused bands judge blur QUALITY (banding,
dither, mosaic), never strength; strength is the owner's call.
`--crop subjects` takes the union box of the scene's focal subjects from the capture's sidecar meta
(`<candidate>.json` next to the PNG, written by capture.mjs). Judge reasons are written to --out only;
`--reasons` prints them too (the generator should not read judge vocabulary: let the owner read the JSON).
Cost ≈ $0.03–0.05 and 5–60 s per vote; a pair with one crop = 2 (canary) + 4 + 4 = 10 calls.
"""
import argparse, base64, io, json, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageFilter

SHOW_REASONS = False

PROMPT_FULL = ('You are an experienced game art director judging two candidate frames (A, B) of an HD-2D pixel-art creature game '
               'with original characters. Decide which frame is the better professional game screenshot: composition and focal '
               'hierarchy, depth layering, light and colour, sprite integration, readability of what matters on this screen, and '
               'crispness/finish. You must pick one, even if they are close. '
               'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}')
PROMPT_CROP = ('You are a pixel-art lead. These are 2x nearest crops of the same region from two candidate frames (A, B) of an '
               'HD-2D pixel-art game. Judge only what is inside the crops: pixel craft, edge quality, blur quality (smooth vs '
               'blocky/dithered), readability. Do not reward more or less blur as such. You must pick one. '
               'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}')

def img_block(im):
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(buf.getvalue()).decode()}}

def fit(im):
    # Keep the long edge ≤ 2576 px (native tier); phones at 2.75 dpr are 2341 px tall and pass as is.
    m = max(im.size)
    if m > 2576:
        s = 2576 / m
        im = im.resize((round(im.width * s), round(im.height * s)), Image.NEAREST)
    return im

def call(model, a, b, prompt):
    content = [{'type': 'text', 'text': 'Image A:'}, img_block(a), {'type': 'text', 'text': 'Image B:'}, img_block(b), {'type': 'text', 'text': prompt}]
    msg = json.dumps({'type': 'user', 'message': {'role': 'user', 'content': content}})
    env = {k: v for k, v in os.environ.items() if k != 'CLAUDECODE'}
    cmd = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', model, '--tools', '', '--max-turns', '1', '--no-session-persistence']
    try:
        p = subprocess.run(cmd, input=msg, capture_output=True, text=True, env=env, timeout=240)
    except subprocess.TimeoutExpired:
        return {'winner': None, 'confidence': 0, 'reason': 'timeout'}
    result = None
    for line in p.stdout.splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        if d.get('type') == 'result':
            result = d.get('result')
    if not result:
        return {'winner': None, 'confidence': 0, 'reason': f'no result (exit {p.returncode}): {p.stderr[-300:]}'}
    try:
        s = result[result.index('{'):result.rindex('}') + 1]
        d = json.loads(s)
        return {'winner': d.get('winner'), 'confidence': int(d.get('confidence', 0)), 'reason': str(d.get('reason', ''))[:200]}
    except (ValueError, TypeError):
        return {'winner': None, 'confidence': 0, 'reason': f'unparseable: {result[:200]}'}

def vote_pair(model, cand, base, prompt, votes, label):
    out = []
    for order in ('cb', 'bc'):
        for rep in range(votes):
            a, b = (cand, base) if order == 'cb' else (base, cand)
            v = call(model, a, b, prompt)
            cand_won = (v['winner'] == 'A') if order == 'cb' else (v['winner'] == 'B')
            out.append({'label': label, 'order': order, 'rep': rep, 'candidateWon': bool(cand_won) if v['winner'] in ('A', 'B') else None, **v})
            print(f'[gate] {label} {order} #{rep}: {"candidate" if cand_won else "baseline"} (conf {v["confidence"]})' + (f' {v["reason"]}' if SHOW_REASONS else ''), file=sys.stderr)
    return out

def decide(votes):
    valid = [v for v in votes if v['candidateWon'] is not None]
    if not valid:
        return 'invalid', 0, 0
    rate = sum(v['candidateWon'] for v in valid) / len(valid)
    conf = sum(v['confidence'] for v in valid) / len(valid)
    won = {o: [v['candidateWon'] for v in valid if v['order'] == o] for o in ('cb', 'bc')}
    both_win = all(any(w) and sum(w) >= len(w) / 2 for w in won.values() if w)
    both_lose = all(not all(w) and sum(w) <= len(w) / 2 for w in won.values() if w)
    if rate >= 0.75 and both_win and conf >= 2.5:
        return 'better', rate, conf
    if rate <= 0.25 and both_lose and conf >= 2.5:
        return 'worse', rate, conf
    return 'no_difference', rate, conf

def degrade(im):
    small = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BILINEAR)
    return small.resize(im.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))

def crop2x(im, box):
    x0, y0, x1, y1 = box
    c = im.crop((int(x0 * im.width), int(y0 * im.height), int(x1 * im.width), int(y1 * im.height)))
    return c.resize((c.width * 2, c.height * 2), Image.NEAREST)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--candidate', required=True); ap.add_argument('--baseline', required=True)
    ap.add_argument('--crop', action='append', default=[]); ap.add_argument('--votes', type=int, default=2)
    ap.add_argument('--model', default='opus'); ap.add_argument('--view', default=''); ap.add_argument('--out'); ap.add_argument('--no-canary', action='store_true'); ap.add_argument('--reasons', action='store_true')
    a = ap.parse_args()
    global SHOW_REASONS
    SHOW_REASONS = a.reasons
    if not shutil.which('claude'):
        sys.exit('claude CLI not found on PATH: the fallback gate needs it (or install orbkin-visual-gate)')
    cand, base = fit(Image.open(a.candidate).convert('RGB')), fit(Image.open(a.baseline).convert('RGB'))
    if cand.size != base.size:
        sys.exit(f'candidate {cand.size} and baseline {base.size} differ in size: captures must match')
    res = {'candidate': a.candidate, 'baseline': a.baseline, 'view': a.view, 'model': a.model, 'votes': []}
    if not a.no_canary:
        cv = vote_pair(a.model, base, degrade(base), PROMPT_FULL, 1, 'canary')
        res['votes'] += cv
        res['canary'] = 'passed' if all(v['candidateWon'] for v in cv) else 'FAILED'
        if res['canary'] != 'passed':
            res['decision'] = 'invalid'
            print(json.dumps(res, indent=1)); _save(a, res); sys.exit(3)
    fv = vote_pair(a.model, cand, base, PROMPT_FULL, a.votes, 'full')
    res['votes'] += fv
    d, rate, conf = decide(fv)
    res['full'] = {'decision': d, 'candidateWinRate': round(rate, 2), 'meanConfidence': round(conf, 2)}
    res['crops'] = []
    crops = []
    for c in a.crop:
        if c == 'subjects':
            meta = os.path.splitext(a.candidate)[0]
            meta = (meta[:-6] if meta.endswith('.clean') else meta) + '.json'
            try:
                u = json.load(open(meta)).get('subjectsUnion')
            except (OSError, ValueError):
                u = None
            if not u:
                sys.exit(f'--crop subjects: no subjectsUnion in {meta} (capture.mjs writes it for scenes with subjects())')
            pad = 0.02
            crops.append([max(0, u[0] - pad), max(0, u[1] - pad), min(1, u[2] + pad), min(1, u[3] + pad)])
        else:
            crops.append([float(v) for v in c.split(',')])
    for i, box in enumerate(crops):
        cv = vote_pair(a.model, crop2x(cand, box), crop2x(base, box), PROMPT_CROP, max(1, a.votes // 2), f'crop{i}')
        res['votes'] += cv
        cd, cr, cc = decide(cv)
        lean = 'baseline' if cr == 0 else 'candidate' if cr == 1 else None
        res['crops'].append({'box': box, 'decision': cd, 'candidateWinRate': round(cr, 2), 'meanConfidence': round(cc, 2), 'lean': lean, 'note': 'unanimous low-confidence lean: attach the crop pair to the owner check, do not re-run' if lean and cc <= 2 and cd == 'no_difference' else None})
    final = d
    if d == 'better' and any(c['decision'] == 'worse' for c in res['crops']):
        final = 'no_difference'
        res['note'] = 'full frame better but a crop worse: a human looks'
    if d == 'invalid':
        final = 'invalid'
    res['decision'] = final
    res['reasons'] = [f"{v['label']}/{v['order']}: {'C' if v['candidateWon'] else 'B'} ({v['confidence']}) {v['reason']}" for v in res['votes']]
    shown = {k: v for k, v in res.items() if k not in ('votes',) and (a.reasons or k != 'reasons')}
    print(json.dumps(shown, indent=1))
    _save(a, res)
    sys.exit(0 if final == 'better' else 3 if final == 'invalid' else 1)

def _save(a, res):
    if a.out:
        os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
        with open(a.out, 'w') as f:
            json.dump(res, f, indent=1)

if __name__ == '__main__':
    main()
