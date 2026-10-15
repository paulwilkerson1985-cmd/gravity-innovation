#!/usr/bin/env python3
"""screen_judge.py - blind pairwise judge for a SCREEN (title, starter, route map, evolution, catch,
menus, battle; UI pass) with per-screen prompts. No reference image is ever shown: this is the
no-reference pass; the anchor-role context and the sealed numbers belong to orbkin-visual-gate.

Protocol (judge-calibration.md §5-6, non-battle-screens-overworld.md §6): fresh-context, tool-less
`claude -p` Opus per vote, images inline at native size (phone frames scaled to 1600 px long side),
both display orders x --votes reps, canary first (baseline vs a softened baseline must be judged
correctly in both orders or the run is INVALID). Optional element crop (2x nearest of --box) as a
separate vote set: a full-vs-crop contradiction becomes no_difference ("a human looks").

Run isolated:
  python3 -I screen_judge.py --screen route --candidate NEW.png --baseline OLD.png
          [--box x0,y0,x1,y1 --what "the island's top trees"] [--votes 2] [--canary]
          [--model opus] [--out verdict.json] [--cache DIR] [--dry-run]

  --screen   route | title | starter | evolution | catch | menu | battle | ui
             (ui = the HUD/menus are what changed; the prompt judges UI craft and cohesion, no
             reference, as ui-hud-typography.md requires)
  --dry-run  validate the images, print the plan and the prompts; make no calls (free).

Decision: better = candidate won >= 75 % of votes AND won in both orders (exit 0);
worse = <= 25 % and lost in both orders (exit 1); no_difference = anything else, including
order-flipping (exit 1); invalid = canary failed or too many errors (exit 3). Exit 2 = bad input.
Cost: about $0.03-0.05 per call; default run = 2 canary + 4 full (+ 4 crop) calls, ~1 min.
"""
import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageFilter

SCREENS = {
    'route': "the exploration/route map screen (a diorama of the current area with the player character, hotspots to explore and trainers, under the game's menu panel)",
    'title': 'the title screen (logo, key-art scene and start menu)',
    'starter': 'the starter-selection screen (three first creatures to choose from)',
    'evolution': 'the evolution cutscene (a creature transforming into its next form)',
    'catch': 'the catch sequence in battle (an orb holding a wild creature, shaking)',
    'menu': 'a menu screen (party, box, bag, shop or bestiary: a lit room with the creature on a plinth under list panels)',
    'battle': 'the battle screen (two creatures facing off on a lit diorama, with HUD panels)',
    'ui': 'the battle screen; only the HUD/menu UI differs between the two versions',
}
FULL = ('You are an experienced art director who has shipped HD-2D (pixel sprites in a lit 3D diorama) console RPGs. '
        'Images A and B are two versions of {what} from the same pixel-art creature-collector game; only the art direction differs. '
        'Which version would impress a seasoned game designer more as a professional, shippable screen: composition and focal hierarchy, '
        'depth (foreground / playfield / background layers), lighting and atmosphere, readability of what matters on this screen, '
        'crispness and consistency of the pixel art? You must pick one, even if they are close.\n'
        'Reply with only JSON: {{"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}}')
UI = ('You are an experienced UI/UX lead for console RPGs. Images A and B show the same moment of {what}. '
      'Which looks more like a polished, professional commercial release? Consider how well the UI belongs to the world\'s art style, '
      'legibility and hierarchy, how much the panels compete with the scene, and craft (frames, type, states). You must pick one, even if they are close.\n'
      'Reply with only JSON: {{"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}}')
CROP = ('You are an experienced pixel-art lead on HD-2D console RPGs. Images A and B are 2x nearest-neighbour enlarged crops of the same '
        'region of two versions of {what}. Look only at {el}. Which crop looks more polished and professional (readable shapes, convincing depth '
        'and light, clean pixel clusters, no noise or mush)? You must pick one, even if they are close.\n'
        'Reply with only JSON: {{"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}}')

LOCK = threading.Lock()


# ----------------------------------------------------------------------------- judge plumbing
def img_block(im):
    b = io.BytesIO()
    im.save(b, 'PNG', compress_level=1)
    data = b.getvalue()
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(data).decode()}}, hashlib.sha1(data).hexdigest()[:12]


def extract_json(text):
    if not text:
        return None
    m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.S)
    cand = m.group(1) if m else None
    if cand is None:
        i, j = text.find('{'), text.rfind('}')
        cand = text[i:j + 1] if i >= 0 and j > i else None
    try:
        return json.loads(cand) if cand else None
    except json.JSONDecodeError:
        return None


class Cache:
    def __init__(self, path):
        self.path = path
        self.d = {}
        if path and os.path.exists(path):
            with open(path) as f:
                for line in f:
                    try:
                        rec = json.loads(line)
                        self.d[rec['key']] = rec
                    except (json.JSONDecodeError, KeyError):
                        pass

    def get(self, key):
        return self.d.get(key)

    def put(self, rec):
        if not self.path:
            return
        with LOCK:
            self.d[rec['key']] = rec
            with open(self.path, 'a') as f:
                f.write(json.dumps(rec) + '\n')


def claude_call(blocks, model, workdir, timeout=600):
    """One fresh, tool-less `claude -p` process; returns {text, json, cost, ms, error}."""
    msg = {'type': 'user', 'message': {'role': 'user', 'content': blocks}}
    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_SESSION_ID')}
    cmd = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
           '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config',
           '--disable-slash-commands', '--max-turns', '2']
    t0 = time.time()
    try:
        p = subprocess.run(cmd, input=json.dumps(msg) + '\n', capture_output=True, text=True, timeout=timeout, cwd=workdir, env=env)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout', 'ms': int((time.time() - t0) * 1000)}
    except FileNotFoundError:
        return {'error': 'claude CLI not found on PATH', 'ms': 0}
    res = None
    for line in p.stdout.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get('type') == 'result':
            res = e
    if res is None:
        return {'error': 'no result: ' + (p.stderr[-400:] if p.stderr else p.stdout[-400:]), 'ms': int((time.time() - t0) * 1000)}
    txt = res.get('result')
    return {'text': txt, 'json': extract_json(txt), 'cost': res.get('total_cost_usd'), 'ms': res.get('duration_ms'),
            'error': 'is_error' if res.get('is_error') else None}


# ----------------------------------------------------------------------------- images
def load(path, max_side=1600):
    im = Image.open(path).convert('RGB')
    if max(im.size) > max_side:  # phone captures are 1081x2340; keep the judge input moderate
        s = max_side / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    return im


def degrade(im):
    """Canary: soften pixel crispness (the subtlest defect the calibrated judge caught 100 %) + mild blur."""
    w, h = im.size
    return im.resize((w // 2, h // 2), Image.NEAREST).resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))


def crop2x(path, box):
    im = Image.open(path).convert('RGB').crop(box)
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)


# ----------------------------------------------------------------------------- votes
def vote(a_img, b_img, prompt, model, cache, workdir, key_parts):
    a, ha = img_block(a_img)
    b, hb = img_block(b_img)
    key = hashlib.sha1(json.dumps([prompt, ha, hb, model, key_parts], sort_keys=True).encode()).hexdigest()[:16]
    hit = cache.get(key)
    if hit:
        return hit['winner'], hit['reason'], 0.0, hit.get('confidence')
    out = claude_call([{'type': 'text', 'text': 'Image A:'}, a, {'type': 'text', 'text': 'Image B:'}, b, {'type': 'text', 'text': prompt}], model, workdir)
    js = out.get('json') or {}
    w = js.get('winner') if js.get('winner') in ('A', 'B') else None
    rec = {'key': key, 'winner': w, 'reason': js.get('reason') or out.get('error'), 'confidence': js.get('confidence'), 'cost': out.get('cost') or 0.0}
    if w is not None:
        cache.put(rec)
    return w, rec['reason'], rec['cost'], rec['confidence']


def run_set(cand, base, prompt, votes, model, label, cache, workdir):
    jobs = [(o, k) for k in range(votes) for o in ('CB', 'BC')]

    def one(j):
        o, k = j
        first, second = (cand, base) if o == 'CB' else (base, cand)
        w, why, cost, conf = vote(first, second, prompt, model, cache, workdir, [label, o, k])
        cand_won = None if w is None else ((w == 'A') == (o == 'CB'))
        return {'set': label, 'order': o, 'rep': k, 'candidate_won': cand_won, 'confidence': conf, 'reason': why, 'cost': cost}
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(one, jobs))


def decide(votes):
    ok = [v for v in votes if v['candidate_won'] is not None]
    if len(ok) < max(2, 0.75 * len(votes)):
        return 'invalid', 0.0
    rate = sum(v['candidate_won'] for v in ok) / len(ok)
    per_order = {o: [v['candidate_won'] for v in ok if v['order'] == o] for o in ('CB', 'BC')}
    won_both = all(vs and sum(vs) / len(vs) > 0.5 for vs in per_order.values())
    lost_both = all(vs and sum(vs) / len(vs) < 0.5 for vs in per_order.values())
    if rate >= 0.75 and won_both:
        return 'better', rate
    if rate <= 0.25 and lost_both:
        return 'worse', rate
    return 'no_difference', rate


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--screen', required=True, choices=sorted(SCREENS))
    ap.add_argument('--candidate', required=True)
    ap.add_argument('--baseline', required=True)
    ap.add_argument('--box', help='element crop x0,y0,x1,y1 in candidate pixels (same box used on the baseline)')
    ap.add_argument('--what', default='the changed element')
    ap.add_argument('--votes', type=int, default=2)
    ap.add_argument('--canary', action='store_true')
    ap.add_argument('--model', default='opus')
    ap.add_argument('--out')
    ap.add_argument('--cache', help='JSONL vote cache (default: <out>.cache.jsonl when --out is given)')
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args()
    try:
        cand, base = load(a.candidate), load(a.baseline)
    except OSError as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    if cand.size != base.size:
        print(f'error: candidate {cand.size} and baseline {base.size} differ in size', file=sys.stderr)
        sys.exit(2)
    what = SCREENS[a.screen]
    full_prompt = (UI if a.screen == 'ui' else FULL).format(what=what)
    bx = None
    if a.box:
        bx = tuple(int(float(v)) for v in a.box.split(','))
        if len(bx) != 4 or bx[2] <= bx[0] or bx[3] <= bx[1]:
            print('error: --box needs x0,y0,x1,y1 with x1>x0, y1>y0', file=sys.stderr)
            sys.exit(2)
    plan = {'screen': a.screen, 'candidate': a.candidate, 'baseline': a.baseline, 'size': cand.size,
            'calls': (2 if a.canary else 0) + 2 * a.votes + (2 * a.votes if bx else 0), 'crop_box': bx, 'model': a.model}
    if a.dry_run:
        plan['full_prompt'] = full_prompt
        if bx:
            plan['crop_prompt'] = CROP.format(what=what, el=a.what)
            crop2x(a.candidate, bx)
        print(json.dumps(plan, indent=1))
        return
    cache_path = a.cache or (a.out + '.cache.jsonl' if a.out else None)
    cache = Cache(cache_path)
    workdir = os.path.dirname(os.path.abspath(a.out)) if a.out else os.getcwd()
    res = {'plan': plan, 'votes': []}
    if a.canary:
        can = run_set(base, degrade(base), full_prompt, 1, a.model, 'canary', cache, workdir)
        res['votes'] += can
        res['canary'] = decide(can)[0]
        if res['canary'] != 'better':
            res['decision'] = 'invalid'
            res['note'] = 'canary failed: the judge did not prefer the undegraded baseline in both orders; do not use this run'
            print(json.dumps({k: v for k, v in res.items() if k != 'votes'}))
            if a.out:
                with open(a.out, 'w') as f:
                    json.dump(res, f, indent=1)
            sys.exit(3)
    full = run_set(cand, base, full_prompt, a.votes, a.model, 'full', cache, workdir)
    res['votes'] += full
    d, rate = decide(full)
    res['full'] = {'decision': d, 'candidate_win_rate': round(rate, 2)}
    decision = d
    if bx:
        cr = run_set(crop2x(a.candidate, bx), crop2x(a.baseline, bx), CROP.format(what=what, el=a.what), a.votes, a.model, 'crop', cache, workdir)
        res['votes'] += cr
        d2, r2 = decide(cr)
        res['crop'] = {'decision': d2, 'candidate_win_rate': round(r2, 2), 'box': bx, 'what': a.what}
        if {d, d2} == {'better', 'worse'}:
            decision = 'no_difference'
            res['note'] = 'full frame and element crop contradict each other: a human looks'
    if d == 'invalid':
        decision = 'invalid'
    res['decision'] = decision
    res['cost_usd'] = round(sum(v['cost'] or 0 for v in res['votes']), 3)
    res['reasons'] = [f"{v['set']} {v['order']} {'cand' if v['candidate_won'] else 'base' if v['candidate_won'] is not None else '?'}: {v['reason']}" for v in res['votes']]
    print(json.dumps({k: v for k, v in res.items() if k != 'votes'}, indent=1))
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(res, f, indent=1)
    sys.exit({'better': 0, 'worse': 1, 'no_difference': 1, 'invalid': 3}[decision])


if __name__ == '__main__':
    main()
