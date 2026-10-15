#!/usr/bin/env python3
"""Blind pairwise motion-strip judge (canary-validated, both orders) for battle FX changes.

  python3 strip_judge.py --candidate AFTER.png --baseline BEFORE.png [--votes 2] [--model opus]
                         [--out verdict.json] [--view motion|frame] [--no-canary]

Each vote is a fresh `claude -p` process with no tools and no session: the judge sees only the two
images (inline, native size, unlabeled) and the prompt below, so it cannot read file names, code or
earlier votes. Protocol (the gate protocol in SKILL.md S6): 1) canary: baseline vs a degraded baseline (half-res
bilinear + 1.2 px blur) in both orders; the judge must prefer the clean strip both times or the run
is INVALID (exit 3); 2) `votes` votes per display order (A=candidate,B=baseline and the reverse);
`better` only if the candidate wins the majority in BOTH orders (exit 0); wins in one order only =
`no_difference` (exit 1); loses both = `worse` (exit 1). The JSON written to --out lists every vote
with its reason (the critique feed). Cost about $0.03-0.05 per vote. Use --view frame only for a
static (non-timing) change; motion work is judged on the 8-frame strip, never on a frozen frame.
"""
import base64, io, json, os, subprocess, sys, tempfile

PROMPT_MOTION = (
    "You are a seasoned game animator and VFX lead judging hit feel. Image A and Image B are 8-frame motion strips of "
    "the same attack in a pixel-art HD-2D creature battle: frames every 10 at 60 fps, left to right, labelled +0f to +70f "
    "from the moment the effect launches. Decide which strip makes the hit LAND better as a professional battler would: "
    "a readable impact frame on contact (contrast, then a white flash over the target); the target's reaction (flash, "
    "blink, knockback, a camera kick) starting on the impact frame, not several frames later; a hit-stop that reads as "
    "weight; the effect dissipating by shape (shrinking, breaking into clumps, sparks falling) rather than a checkerboard "
    "dither; FX pixels the same size as the sprite pixels, with no smooth 3D ribbons or gradients; snappy, not lingering. "
    "Count these AGAINST a strip: a bloom halo or glow larger than the target that hides it, the target held pure white for more "
    "than a few frames, effect pieces occluded behind the target, cells after the hit with nothing left of the effect, a bolt or "
    "body so thin or so close to the set's own colour that it has no silhouette. Busier or brighter earns nothing. You must pick "
    "one, even if they are close. "
    'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}'
)
PROMPT_FRAME = (
    "You are an experienced game art director. Image A and Image B are two candidate frames of a pixel-art HD-2D "
    "creature-battle effect. Decide which reads as the more professional, hand-crafted pixel effect: crisp FX pixels at "
    "the sprites' pixel size, a value structure (dark edge, mid, hot core), shape-based dissipation with no checkerboard "
    "dither, light that sits on the set and the sprites, nothing smooth or mixed-resolution. You must pick one. "
    'Reply with only JSON: {"winner": "A" or "B", "confidence": 1-5, "reason": "<= 25 words"}'
)


def img_block(path):
    with open(path, 'rb') as f:
        data = f.read()
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(data).decode()}}


def degrade(path):
    from PIL import Image, ImageFilter
    im = Image.open(path).convert('RGB')
    small = im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.BILINEAR)
    back = small.resize(im.size, Image.BILINEAR).filter(ImageFilter.GaussianBlur(1.2))
    fd, p = tempfile.mkstemp(suffix='.png'); os.close(fd)
    back.save(p)
    return p


def call(a, b, prompt, model):
    msg = {'type': 'user', 'message': {'role': 'user', 'content': [
        {'type': 'text', 'text': 'Image A:'}, img_block(a), {'type': 'text', 'text': 'Image B:'}, img_block(b), {'type': 'text', 'text': prompt}]}}
    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT')}
    cmd = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--model', model,
           '--tools', '', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--max-turns', '2']
    try:
        r = subprocess.run(cmd, input=json.dumps(msg) + '\n', capture_output=True, text=True, timeout=240, env=env)
    except FileNotFoundError:
        sys.exit('strip_judge: the `claude` CLI is not on PATH; run the judge where Claude Code is installed (exit 3)')
    text = ''
    for line in r.stdout.splitlines():
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if ev.get('type') == 'assistant':
            for blk in ev.get('message', {}).get('content', []):
                if blk.get('type') == 'text':
                    text += blk['text']
        elif ev.get('type') == 'result' and not text:
            text = ev.get('result', '') or ''
    s, e = text.find('{'), text.rfind('}')
    if s < 0 or e < 0:
        if 'limit' in text.lower() or '429' in r.stderr:
            sys.exit(f'strip_judge: the judge CLI is rate-limited ({text[:80]!r}); wait for the reset it names and re-run (exit 3)')
        return {'winner': None, 'confidence': 0, 'reason': f'unparseable: {text[:120]!r} {r.stderr[-200:]!r}'}
    try:
        v = json.loads(text[s:e + 1])
    except ValueError:
        return {'winner': None, 'confidence': 0, 'reason': f'bad json: {text[s:e + 1][:120]!r}'}
    v['winner'] = str(v.get('winner', '')).strip().upper()[:1]
    return v


def main(argv):
    if '--help' in argv:
        print(__doc__); return 0
    if '--candidate' not in argv or '--baseline' not in argv:
        print(__doc__); return 2
    o = {argv[i]: argv[i + 1] for i in range(len(argv) - 1) if argv[i].startswith('--') and not argv[i + 1].startswith('--')}
    cand, base = o['--candidate'], o['--baseline']
    votes = int(o.get('--votes', '2')); model = o.get('--model', 'opus')
    prompt = PROMPT_FRAME if o.get('--view', 'motion') == 'frame' else PROMPT_MOTION
    out = {'candidate': cand, 'baseline': base, 'model': model, 'view': o.get('--view', 'motion'), 'canary': [], 'votes': []}
    if '--no-canary' not in argv:
        deg = degrade(base)
        for order, (a, b) in (('clean-first', (base, deg)), ('degraded-first', (deg, base))):
            v = call(a, b, prompt, model); v['order'] = order
            v['passed'] = v['winner'] == ('A' if order == 'clean-first' else 'B')
            out['canary'].append(v)
            print(f"canary {order}: winner {v['winner']} conf {v.get('confidence')} {'ok' if v['passed'] else 'FAILED'}: {v.get('reason')}", file=sys.stderr)
        os.unlink(deg)
        if not all(v['passed'] for v in out['canary']):
            out['verdict'] = 'invalid'
            finish(out, o); return 3
    wins = {'cand-first': 0, 'base-first': 0}
    for order in ('cand-first', 'base-first'):
        a, b = (cand, base) if order == 'cand-first' else (base, cand)
        for i in range(votes):
            v = call(a, b, prompt, model); v['order'] = order; v['rep'] = i
            v['candidate_won'] = v['winner'] == ('A' if order == 'cand-first' else 'B')
            wins[order] += int(v['candidate_won'])
            out['votes'].append(v)
            print(f"vote {order} #{i}: candidate {'won' if v['candidate_won'] else 'lost'} (conf {v.get('confidence')}): {v.get('reason')}", file=sys.stderr)
    maj = votes / 2
    won = [wins[k] > maj for k in wins]
    out['wins'] = wins
    out['verdict'] = 'better' if all(won) else 'worse' if not any(won) and all(wins[k] < maj for k in wins) else 'no_difference'
    finish(out, o)
    return 0 if out['verdict'] == 'better' else 1


def finish(out, o):
    if '--out' in o:
        with open(o['--out'], 'w') as f:
            json.dump(out, f, indent=1)
    print(json.dumps({'verdict': out['verdict'], 'wins': out.get('wins'), 'canary': [v.get('passed') for v in out['canary']], 'out': o.get('--out')}))


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
