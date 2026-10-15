"""judgelib.py - fresh-context, tool-less Claude judge calls on inline images, plus the sealed-asset loader.

Each call starts a new `claude -p` process (no session persistence, no tools, no MCP, no skills), sends ONE
user message with text + base64 images via --input-format stream-json and parses a JSON object from the
reply. The judge cannot read files, the repo or earlier calls: blind by construction.

Hygiene: CLAUDECODE and CLAUDE_CODE_SESSION_ID are removed from the child environment so the nested
CLI neither refuses to start nor writes into the live session.

Sealed assets (prompts, canary recipe, franchise list, anchors) live OUTSIDE the skill, by default in
<project>/game/tools/verify/sealed (override with ORBKIN_SEALED or --sealed). Generator sessions must not
read that directory. When it is missing, the built-in defaults are used (seal_init.defaults()); the
verdict JSON then says "sealed": false so the report can say the run was unsealed.

Not a library for generators: run visual_judge.py / ip_check.py / judge_motion.py with --help instead.
"""
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

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK = threading.Lock()
_IMG_CACHE = {}


def project_root():
    """The repo root: cwd when it holds game/, else the skill's grandparent (.claude/skills/<name>)."""
    cwd = os.getcwd()
    if os.path.isdir(os.path.join(cwd, 'game')):
        return cwd
    return os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))


def sealed_dir(explicit=None):
    return explicit or os.environ.get('ORBKIN_SEALED') or os.path.join(project_root(), 'game', 'tools', 'verify', 'sealed')


def load_sealed(explicit=None):
    """Return {'sealed': bool, 'dir': path, 'prompts': {...}, 'canary': {...}, 'franchise': [...], 'ref': path|None}."""
    d = sealed_dir(explicit)
    sys.path.insert(0, HERE)
    import seal_init  # noqa: E402  (same directory)
    out = seal_init.defaults()
    out['dir'] = d
    out['sealed'] = False
    pj = os.path.join(d, 'prompts.json')
    if os.path.isfile(pj):
        try:
            out['prompts'].update(json.load(open(pj)))
            out['sealed'] = True
        except (OSError, json.JSONDecodeError) as e:
            print(f'warning: sealed prompts unreadable ({e}); using defaults', file=sys.stderr)
    cj = os.path.join(d, 'canary.json')
    if os.path.isfile(cj):
        try:
            out['canary'].update(json.load(open(cj)))
        except (OSError, json.JSONDecodeError):
            pass
    fj = os.path.join(d, 'franchise.txt')
    if os.path.isfile(fj):
        out['franchise'] = [l.strip() for l in open(fj) if l.strip() and not l.startswith('#')]
    for name in ('ref.png', 'ref.jpg', 'ref.webp'):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            out['ref'] = p
            break
    else:
        out['ref'] = None
    return out


def img_block(path_or_img, max_side=None, fmt='PNG'):
    ck = (path_or_img, max_side, fmt) if isinstance(path_or_img, str) else None
    if ck and ck in _IMG_CACHE:
        return _IMG_CACHE[ck]
    out = _img_block(path_or_img, max_side, fmt)
    if ck:
        with LOCK:
            _IMG_CACHE[ck] = out
    return out


def _img_block(path_or_img, max_side=None, fmt='PNG'):
    im = Image.open(path_or_img).convert('RGB') if isinstance(path_or_img, str) else path_or_img
    if max_side and max(im.size) > max_side:
        s = max_side / max(im.size)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    b = io.BytesIO()
    if fmt == 'JPEG':
        im.save(b, 'JPEG', quality=92)
        mt = 'image/jpeg'
    else:
        im.save(b, 'PNG', compress_level=1)
        mt = 'image/png'
    data = b.getvalue()
    return ({'type': 'image', 'source': {'type': 'base64', 'media_type': mt, 'data': base64.b64encode(data).decode()}},
            hashlib.sha1(data).hexdigest()[:12])


def extract_json(text):
    if text is None:
        return None
    m = re.search(r'```(?:json)?\s*(\{.*\})\s*```', text, re.S)
    cand = m.group(1) if m else None
    if cand is None:
        i, j = text.find('{'), text.rfind('}')
        cand = text[i:j + 1] if i >= 0 and j > i else None
    try:
        return json.loads(cand) if cand else None
    except json.JSONDecodeError:
        return None


def call(blocks, model='opus', timeout=600, system=None, effort=None, workdir=None):
    """blocks: list of content blocks (text/image). Returns dict(text, json, cost, ms, error, model)."""
    ws = workdir or os.environ.get('ORBKIN_JUDGE_WS') or os.path.join(os.environ.get('TMPDIR', '/tmp'), 'orbkin-judge-ws')
    os.makedirs(ws, exist_ok=True)
    msg = {'type': 'user', 'message': {'role': 'user', 'content': blocks}}
    env = {k: v for k, v in os.environ.items() if k not in ('CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT')}
    cmd = ['claude', '-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
           '--model', model, '--tools', '', '--no-session-persistence', '--strict-mcp-config',
           '--disable-slash-commands', '--max-turns', '2']
    if system:
        cmd += ['--append-system-prompt', system]
    if effort:
        cmd += ['--effort', effort]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, input=json.dumps(msg) + '\n', capture_output=True, text=True, timeout=timeout, cwd=ws, env=env)
    except subprocess.TimeoutExpired:
        return {'error': 'timeout', 'ms': int((time.time() - t0) * 1000)}
    except FileNotFoundError:
        return {'error': 'claude CLI not found on PATH', 'ms': 0}
    res = None
    model_used = None
    for line in p.stdout.splitlines():
        try:
            e = json.loads(line)
        except json.JSONDecodeError:
            continue
        if e.get('type') == 'system' and e.get('subtype') == 'init':
            model_used = e.get('model')
        if e.get('type') == 'result':
            res = e
    if res is None:
        return {'error': 'no result: ' + (p.stderr[-400:] if p.stderr else p.stdout[-400:]), 'ms': int((time.time() - t0) * 1000)}
    txt = res.get('result')
    return {'text': txt, 'json': extract_json(txt), 'cost': res.get('total_cost_usd'), 'ms': res.get('duration_ms'),
            'error': 'is_error' if res.get('is_error') else None, 'model': model_used}


def franchise_hits(texts, names):
    """Free tripwire: judge reasons that name a franchise character (case-insensitive whole words)."""
    hits = set()
    for t in texts:
        if not t:
            continue
        low = ' ' + re.sub(r'[^a-z0-9]+', ' ', str(t).lower()) + ' '
        for n in names:
            if ' ' + n.lower() + ' ' in low:
                hits.add(n)
    return sorted(hits)


class Cache:
    """JSONL cache keyed by a hash of (protocol, prompt, image hashes, rep): re-runs pay only for new calls."""
    def __init__(self, path):
        self.path = path
        self.d = {}
        if path and os.path.exists(path):
            for l in open(path):
                try:
                    r = json.loads(l)
                    self.d[r['key']] = r
                except (json.JSONDecodeError, KeyError):
                    pass

    def get(self, key):
        return self.d.get(key)

    def put(self, rec):
        with LOCK:
            self.d[rec['key']] = rec
            if self.path:
                with open(self.path, 'a') as fh:
                    fh.write(json.dumps(rec) + '\n')


def key_of(*parts):
    return hashlib.sha1(json.dumps(parts, sort_keys=True).encode()).hexdigest()[:16]


if __name__ == '__main__':
    print(__doc__)
