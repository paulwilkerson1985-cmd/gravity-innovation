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


# Franchise names that are also ordinary English words (or common colour/material words). A judge writing
# "the red banister" must not trip the wire; "Red (the trainer)" or "like Pokemon Red" should. These match only
# when capitalised in the source text, not preceded by an article/determiner, and (for colours) not followed by a
# plain noun; or when a franchise word co-occurs in the same sentence. Everything else stays case-insensitive.
COMMON_WORD_NAMES = {'red', 'blue', 'green', 'gold', 'silver', 'ruby', 'pearl', 'crystal', 'diamond', 'platinum',
                     'black', 'white', 'sun', 'moon', 'sword', 'shield', 'scarlet', 'violet', 'emerald', 'sapphire',
                     'brock', 'misty', 'slime', 'mario', 'kirby', 'zelda', 'link', 'octopath', 'yellow', 'x', 'y'}
FRANCHISE_WORDS = ('pokemon', 'pokémon', 'nintendo', 'game freak', 'digimon', 'palworld', 'temtem', 'nexomon', 'coromon',
                   'yo-kai', 'yokai', 'dragon quest', 'monster hunter', 'trainer', 'gym leader', 'champion', 'rival',
                   'franchise', 'series', 'version')
_ARTICLES = ('the', 'a', 'an', 'this', 'that', 'its', 'his', 'her', 'their', 'our', 'your', 'my', 'of', 'in', 'with',
             'and', 'or', 'to', 'bright', 'dark', 'deep', 'pale', 'warm', 'cool', 'hot', 'light', 'soft', 'rich',
             'same', 'more', 'less', 'too', 'very', 'muted', 'saturated', 'desaturated', 'vivid', 'dull')


def franchise_hits(texts, names, stoplist=True):
    """Free tripwire: judge reasons that name a franchise character.
    Multi-word and rare names: case-insensitive whole words. Single common-word names (COMMON_WORD_NAMES):
    only when Capitalised in the source, not preceded by an article/adjective ("the red", "warm Gold"), not at
    the start of a sentence unless a franchise word is nearby, or when a franchise word is in the same sentence.
    Returns sorted names. `stoplist=False` restores the old behaviour (used only for tests)."""
    hits = set()
    for t in texts:
        if not t:
            continue
        raw = str(t)
        low = ' ' + re.sub(r'[^a-z0-9]+', ' ', raw.lower()) + ' '
        sentences = re.split(r'(?<=[.!?;:])\s+', raw)
        for n in names:
            key = ' ' + n.lower() + ' '
            if key not in low:
                continue
            if not stoplist or n.lower() not in COMMON_WORD_NAMES:
                hits.add(n)
                continue
            # common-word name: needs capitalised use in a non-descriptive position, or a franchise word nearby
            for s in sentences:
                sl = s.lower()
                if (' ' + n.lower() + ' ') not in (' ' + re.sub(r'[^a-z0-9]+', ' ', sl) + ' '):
                    continue
                if any(w in sl for w in FRANCHISE_WORDS):
                    hits.add(n)
                    break
                for m in re.finditer(r'(?<![A-Za-z0-9])' + re.escape(n) + r'(?![A-Za-z0-9])', s):
                    before = s[:m.start()].rstrip()
                    prev = re.findall(r'[A-Za-z]+', before)
                    prev_word = prev[-1].lower() if prev else None
                    at_start = not before or before.endswith(('.', '!', '?', ':', ';', '(', '"', "'"))
                    if prev_word in _ARTICLES or at_start:
                        continue
                    after = s[m.end():].lstrip()
                    if re.match(r'(and|or|,|-|/)\s*(and\s+)?[a-z]', after) and n.lower() in ('red', 'blue', 'green', 'gold', 'silver', 'black', 'white', 'yellow'):
                        continue  # "Red and brown rocks" style colour lists
                    hits.add(n)
                    break
                if n in hits:
                    break
    return sorted(hits)


# ------------------------------------------------------------------ provenance (self-proving outputs)
def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def run_dir_of(out_path, explicit=None):
    """The RUN directory a result belongs to: --run, else $ORBKIN_RUN, else the --out file's directory."""
    if explicit:
        return os.path.abspath(explicit)
    if os.environ.get('ORBKIN_RUN'):
        return os.path.abspath(os.environ['ORBKIN_RUN'])
    if out_path:
        return os.path.abspath(os.path.dirname(out_path) or '.')
    return os.path.abspath(os.getcwd())


def rel_to(path, run):
    """RUN-relative path when the file is under RUN (so a moved run dir still resolves); else absolute."""
    if not path:
        return path
    ap = os.path.abspath(path)
    try:
        r = os.path.relpath(ap, run)
    except ValueError:
        return ap
    return r if not r.startswith('..') else ap


def provenance(inputs, run, t0, cost_usd, model_requested, model_used=None, role='target', expect=None, tool=None):
    """The block every judge/floor result carries. `inputs` = {name: path}. Also returns the sha256 map that
    report.sh re-checks against the files beside the result."""
    files = {}
    for name, p in inputs.items():
        if p and os.path.isfile(p):
            files[name] = {'path': rel_to(p, run), 'abs': os.path.abspath(p), 'sha256': sha256_file(p),
                           'bytes': os.path.getsize(p)}
        elif p:
            files[name] = {'path': rel_to(p, run), 'abs': os.path.abspath(p), 'sha256': None, 'bytes': None}
    return {'tool': tool or os.path.basename(sys.argv[0]), 'argv': sys.argv[1:], 'run': run, 'inputs': files,
            'role': role, 'expect': expect, 'model_requested': model_requested, 'model_used': model_used,
            'seconds': round(time.time() - t0, 1), 'cost_usd': round(cost_usd or 0.0, 4),
            'started': time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(t0)), 'host_load': _load1(),
            'format': 2}


def _load1():
    try:
        return round(os.getloadavg()[0], 1)
    except (OSError, AttributeError):
        return None


def control_outcome(role, expect, decision):
    """For a control / calibration run: did the instrument do what was expected? None for target runs."""
    if role == 'target' or not expect:
        return None
    want = [e.strip() for e in str(expect).split('|') if e.strip()]
    return {'expected': want, 'got': decision, 'pass': decision in want}


def write_result(res, out_path):
    s = json.dumps(res, indent=1)
    print(s)
    if out_path:
        with open(out_path, 'w') as fh:
            fh.write(s)


def add_role_args(ap):
    ap.add_argument('--role', default='target', choices=['target', 'control', 'calibration'],
                    help='target = a real change (feeds the report\'s critic gaps and decision); control = a '
                         'synthetic degradation / identical pair / instrument check (reported separately with --expect); '
                         'calibration = anchors and pilots')
    ap.add_argument('--expect', help='control runs: the decision(s) the instrument should produce, e.g. worse, '
                                     'no_difference, "better|no_difference", FAIL, PASS')
    ap.add_argument('--run', help='RUN directory (paths in the result are written relative to it; default: '
                                  '$ORBKIN_RUN or the --out file\'s directory)')


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
