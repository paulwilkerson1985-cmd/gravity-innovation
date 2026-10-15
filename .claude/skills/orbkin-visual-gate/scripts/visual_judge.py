#!/usr/bin/env python3
"""visual_judge.py - blind pairwise gate: is CANDIDATE better than the last ACCEPTED frame (BASELINE)?

  python3 -I visual_judge.py --candidate NEW.png --baseline OLD.png [--view full|crop|element|ui|blur]
         [--focal x0,y0,x1,y1 ...] [--layout capture.json:ID] [--votes 2] [--no-ref] [--no-canary]
         [--no-critique] [--fast] [--role target|control|calibration] [--expect worse] [--run RUN]
         [--model opus] [--sealed DIR] [--out verdict.json]

Fresh-context, tool-less Opus judges through `claude -p` (one process per vote, images inline, no repo
access). Every vote is asked in BOTH display orders. A CANARY pair (baseline vs a degraded baseline,
recipe sealed) must be judged correctly in both orders or the whole run is INVALID.

Views (match the view to the change; frozen mid-impact frames judge motion wrongly):
  full     whole frame; adds a 2x nearest focal-crop vote set when --focal/--layout gives creature boxes.
           The thumbnail reference anchor (sealed ref.png) is shown as image R if present.
  crop     only the 2x nearest creature crop (sprite / ground read). No reference.
  element  2x nearest crop of one environment element: pass ONE --focal box. No reference.
  ui       interface only: no reference ever (a reference-anchored judge rewards copying its HUD).
  blur     2x crop of a defocused region (--focal): judges blur QUALITY, never strength (strength is the owner's).

Decision (printed JSON, also --out):
  better         won >= 75% of votes AND won in both orders            exit 0
  worse          won <= 25% AND lost in both orders                    exit 1
  no_difference  anything else, incl. order-flipping = cannot tell     exit 1  (common and honest)
  invalid        canary failed or too many judge errors                exit 3  (do not use; report it)
  (full view) frame better but crop worse -> no_difference; frame no_difference but crop decided -> crop decides.
Also printed: "critique" (located gaps from a SEPARATE critic call: the only text a generator should read),
"franchise_hits" (judge reasons naming franchise characters -> run ip_check.py), "sealed" (anchors present?).
Cost and time (measured 2026-10-15 on the 4-core cloud box at load 20-40; list prices, subscription absorbs them):
  per call ~$0.02-0.03 and 30-60 s; default run = 2 canary + 4 main + 1 critique = $0.10-0.15 and 3.5-4.5 min;
  with --layout crop votes (+4 calls) $0.20-0.30 and 5-6 min; --no-critique saves ~$0.03; an idle box is ~2x faster.
  Rule for --layout: keep the crop votes for sprite / kin / UI-near-sprite changes; drop them for grade, light and
  dressing sweeps or when the per-change budget is under $0.60 (the crop measures sprite/ground read only).
Early exit (saves calls on invisible changes): after the first round, when both orders came back confidence <= 1 with
  "identical"/"no difference" in the reason, the result is no_difference without the second round. With --fast, a
  first round that is 2/2 at confidence 5 in the same direction also skips the second round (decision from 2 votes;
  the verdict says "early_exit": "fast"). Never use --fast for anything that will be ACCEPTED on this verdict alone.
Roles: --role target (default) is a real change; --role control is a synthetic degradation, identical pair or other
  instrument check and must say what the instrument should do with --expect (e.g. --expect worse, --expect
  no_difference): report.sh then lists controls in an "Instrument checks" table with pass/fail and keeps their
  critique OUT of the improvement signal. Every result carries "provenance" (sha256 of each input, RUN-relative
  paths, model used, seconds, cost): report.sh refuses a verdict whose hashes no longer match the files beside it.
Calibration (judge-calibration.md): 42/42 known pairs correct at native size; near-equal pairs follow display
order 60-64% -> the both-orders rule turns that into no_difference. Never read tools/verify/sealed yourself.
"""
import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import judgelib as J  # noqa: E402

REF_MAX = 640  # the reference is a THUMBNAIL anchor only (judge-calibration 5.5: at native size judges penalise it)


def parse_boxes(focal, layout):
    boxes = [[int(float(v)) for v in f.split(',')] for f in focal]
    if layout:
        path, sid = layout.rsplit(':', 1)
        for sh in json.load(open(path))['shots']:
            if sh['id'] == sid:
                lay = sh.get('layout') or (sh.get('stats') or {}).get('layout') or []
                boxes += [[b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']] for b in lay if b['name'] in ('mine', 'foe')]
    return boxes


def crop2x(im, boxes, grow=1.25, min_w=480):
    x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w = max(min_w, (x1 - x0) * grow); h = max(w * 9 / 16, (y1 - y0) * grow); w = max(w, h * 16 / 9)
    w, h = min(w, im.width), min(h, im.height)
    l = min(max(0, cx - w / 2), im.width - w); t = min(max(0, cy - h / 2), im.height - h)
    c = im.crop((round(l), round(t), round(l + w), round(t + h)))
    return c.resize((c.width * 2, c.height * 2), Image.NEAREST)


def crop_box2x(im, box, pad=8):
    x0, y0, x1, y1 = box
    c = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
    return c.resize((c.width * 2, c.height * 2), Image.NEAREST)


def degrade(im, recipe):
    """Canary degradation from the sealed recipe (default: subtle softening, the subtlest defect the judge caught 100%)."""
    w, h = im.size
    out = im
    if recipe.get('half_res_nearest_then_bilinear', True):
        out = out.resize((max(1, w // 2), max(1, h // 2)), Image.NEAREST).resize((w, h), Image.BILINEAR)
    blur = float(recipe.get('gaussian_blur_px', 1.2))
    if blur > 0:
        out = out.filter(ImageFilter.GaussianBlur(blur))
    return out


def vote(a_img, b_img, prompt, ref_img, model):
    blocks = []
    if ref_img is not None:
        r, _ = J.img_block(ref_img, REF_MAX)
        blocks += [{'type': 'text', 'text': 'Image R (reference):'}, r]
    a, _ = J.img_block(a_img); b, _ = J.img_block(b_img)
    blocks += [{'type': 'text', 'text': 'Image A:'}, a, {'type': 'text', 'text': 'Image B:'}, b, {'type': 'text', 'text': prompt}]
    out = J.call(blocks, model=model)
    js = out.get('json') or {}
    w = js.get('winner') if js.get('winner') in ('A', 'B') else None
    return w, js.get('reason'), js.get('confidence'), out.get('cost') or 0.0, out.get('error'), out.get('model')


MODEL_USED = []  # model ids reported by the CLI (init event), for provenance


def run_set(cand, base, prompt, ref, votes, model, label, reps=None):
    """votes per order; `reps` restricts to given rep indices (early-exit rounds)."""
    jobs = [(o, k) for k in (reps if reps is not None else range(votes)) for o in ('CB', 'BC')]

    def one(j):
        o, k = j
        first, second = (cand, base) if o == 'CB' else (base, cand)
        w, why, conf, cost, err, used = vote(first, second, prompt, ref, model)
        if used:
            MODEL_USED.append(used)
        cand_won = None if w is None else ((w == 'A') == (o == 'CB'))
        return {'set': label, 'order': o, 'rep': k, 'candidate_won': cand_won, 'confidence': conf, 'reason': why, 'cost': cost, 'error': err}
    with ThreadPoolExecutor(4) as ex:
        return list(ex.map(one, jobs))


_IDENT = re.compile(r'identical|no (?:discernible|meaningful|visible|real)? ?differen|same image|cannot (?:tell|see) (?:a|any) differen', re.I)


def early_exit(first_round, fast):
    """After round 0 (one vote per order): 'identical' when both votes are confidence <= 1 and say so;
    'fast' when --fast and both are confidence 5 in the same direction. Else None."""
    ok = [v for v in first_round if v['candidate_won'] is not None]
    if len(ok) != 2:
        return None
    confs = [int(v.get('confidence') or 0) for v in ok]
    if all(c <= 1 for c in confs) and all(_IDENT.search(str(v.get('reason') or '')) for v in ok):
        return 'identical'
    if fast and all(c >= 5 for c in confs) and len({v['candidate_won'] for v in ok}) == 1:
        return 'fast'
    return None


def run_main(cand, base, prompt, ref, votes, model, label, fast):
    """The main vote set with the early-exit rule: round 0 first, then the rest unless consensus."""
    first = run_set(cand, base, prompt, ref, votes, model, label, reps=[0])
    ex = early_exit(first, fast)
    if ex or votes <= 1:
        return first, ex
    rest = run_set(cand, base, prompt, ref, votes, model, label, reps=list(range(1, votes)))
    return first + rest, None


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


def critique(cand, base, ref, prompt, model):
    """Separate critic call. Its text is the generator's improvement signal; the gate's numbers are not."""
    blocks = []
    if ref is not None:
        r, _ = J.img_block(ref, REF_MAX)
        blocks += [{'type': 'text', 'text': 'Image R (quality-bar thumbnail):'}, r]
    a, _ = J.img_block(base); b, _ = J.img_block(cand)
    blocks += [{'type': 'text', 'text': 'Image A (previous accepted):'}, a, {'type': 'text', 'text': 'Image B (candidate):'}, b,
               {'type': 'text', 'text': prompt.replace('{refnote}', ' and a quality-bar thumbnail (image R)' if ref is not None else '')}]
    out = J.call(blocks, model=model)
    js = out.get('json') or {}
    return {'gaps': js.get('gaps') or [], 'better_than_before': js.get('better_than_before'), 'cost': out.get('cost') or 0.0,
            'error': out.get('error') or (None if js else 'no JSON')}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--candidate', required=True); ap.add_argument('--baseline', required=True)
    ap.add_argument('--view', default='full', choices=['full', 'crop', 'element', 'ui', 'blur'])
    ap.add_argument('--focal', nargs='*', default=[]); ap.add_argument('--layout')
    ap.add_argument('--votes', type=int, default=2)
    ap.add_argument('--no-ref', action='store_true'); ap.add_argument('--no-canary', action='store_true')
    ap.add_argument('--no-critique', action='store_true')
    ap.add_argument('--fast', action='store_true', help='skip the second round when round 1 is 2/2 at confidence 5')
    ap.add_argument('--model', default='opus'); ap.add_argument('--sealed'); ap.add_argument('--out')
    J.add_role_args(ap)
    a = ap.parse_args()
    T0 = time.time()
    RUN = J.run_dir_of(a.out, a.run)
    try:
        cand = Image.open(a.candidate).convert('RGB'); base = Image.open(a.baseline).convert('RGB')
        boxes = parse_boxes(a.focal, a.layout)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as e:
        print(f'error: {e}', file=sys.stderr); sys.exit(2)
    if cand.size != base.size:
        print('warning: candidate and baseline sizes differ; captures must come from the same harness settings', file=sys.stderr)
    if a.view in ('element', 'blur') and len(boxes) != 1:
        print(f'error: --view {a.view} needs exactly one --focal box', file=sys.stderr); sys.exit(2)
    if a.view == 'crop' and not boxes:
        print('error: --view crop needs --focal or --layout boxes', file=sys.stderr); sys.exit(2)
    S = J.load_sealed(a.sealed)
    P = S['prompts']
    ref = None
    if a.view == 'full' and not a.no_ref and S.get('ref'):
        ref = Image.open(S['ref']).convert('RGB')
    # the pair of images and the prompt the main vote set sees
    if a.view == 'full':
        A, B, prompt = cand, base, (P['full_ref'] if ref is not None else P['full_noref'])
    elif a.view == 'crop':
        A, B, prompt = crop2x(cand, boxes), crop2x(base, boxes), P['crop']
    elif a.view == 'element':
        A, B, prompt = crop_box2x(cand, boxes[0]), crop_box2x(base, boxes[0]), P['element']
    elif a.view == 'ui':
        A, B, prompt = cand, base, P['ui']
    else:
        A, B, prompt = crop_box2x(cand, boxes[0]), crop_box2x(base, boxes[0]), P['blur_quality']
    res = {'candidate': a.candidate, 'baseline': a.baseline, 'view': a.view, 'sealed': S['sealed'],
           'ref_shown': ref is not None, 'model': a.model, 'role': a.role, 'expect': a.expect, 'votes': []}
    inputs = {'candidate': a.candidate, 'baseline': a.baseline}
    if a.layout:
        inputs['layout'] = a.layout.rsplit(':', 1)[0]

    def finish(code):
        res['cost_usd'] = round(sum(v['cost'] for v in res['votes']) + (res.get('critique') or {}).get('cost', 0.0), 3)
        res['provenance'] = J.provenance(inputs, RUN, T0, res['cost_usd'], a.model, MODEL_USED[0] if MODEL_USED else None,
                                         a.role, a.expect, 'visual_judge.py')
        res['control'] = J.control_outcome(a.role, a.expect, res.get('decision'))
        J.write_result(res, a.out)
        sys.exit(code)
    if not a.no_canary:
        can = run_set(B, degrade(B, S['canary']), prompt, ref, 1, a.model, 'canary')
        res['votes'] += can
        cd, _ = decide(can)
        res['canary'] = cd
        res['canary_confidence'] = [v.get('confidence') for v in can]
        if cd != 'better':
            res['decision'] = 'invalid'
            res['why'] = 'canary failed: the judge did not prefer the undegraded baseline in both orders (judge errors: %s)' % [v['error'] for v in can if v['error']]
            finish(3)
    main_votes, ex = run_main(A, B, prompt, ref, a.votes, a.model, 'main', a.fast)
    res['votes'] += main_votes
    d_main, r_main = decide(main_votes)
    if ex == 'identical':
        d_main = 'no_difference'
    res['main'] = {'decision': d_main, 'candidate_win_rate': round(r_main, 2), 'votes_cast': len(main_votes)}
    if ex:
        res['early_exit'] = ex
        res['early_exit_note'] = ('both first-round votes confidence <= 1 and "identical": no second round'
                                  if ex == 'identical' else '--fast: first round 2/2 at confidence 5; second round skipped')
    decision = d_main
    if a.view == 'full' and boxes and ex != 'identical':
        crop = run_set(crop2x(cand, boxes), crop2x(base, boxes), P['crop'], None, a.votes, a.model, 'crop')
        res['votes'] += crop
        d_crop, r_crop = decide(crop)
        res['crop'] = {'decision': d_crop, 'candidate_win_rate': round(r_crop, 2)}
        if d_main == 'better' and d_crop == 'worse':
            decision = 'no_difference'      # frame got nicer but the subjects got worse: a human looks
            res['note'] = 'full frame better but focal crop worse: not auto-accepted'
        elif d_main == 'no_difference' and d_crop in ('better', 'worse'):
            decision = d_crop
            res['note'] = 'full frame undecided; the focal crop decided'
    if decision == 'no_difference' and 0.6 <= r_main < 0.75 and a.votes < 3:
        res['hint'] = 'win rate 0.6-0.75: one more vote per order (--votes 3) may decide it; beyond 3 nothing changes'
    res['decision'] = decision
    reasons = [v['reason'] for v in res['votes'] if v['set'] != 'canary']
    res['franchise_hits'] = J.franchise_hits(reasons, S['franchise'])
    if not a.no_critique and decision != 'invalid' and ex != 'identical':
        res['critique'] = critique(cand, base, ref, P['critique'], a.model)
        res['franchise_hits'] = sorted(set(res['franchise_hits']) | set(J.franchise_hits(
            [g.get('what', '') + ' ' + g.get('fix', '') for g in res['critique'].get('gaps', [])], S['franchise'])))
    res['reasons'] = [f"{v['set']}/{v['order']}: {'cand' if v['candidate_won'] else 'base'} (c{v['confidence']}) - {v['reason']}"
                      for v in res['votes'] if v['set'] != 'canary']
    finish(0 if decision == 'better' else 3 if decision == 'invalid' else 1)


if __name__ == '__main__':
    main()
