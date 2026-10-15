"""Shared helpers for the orbkin-sprite-creature scripts (paths, running node/tsx, images)."""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
REPO = SKILL.parent.parent.parent  # .claude/skills/<name> -> repo root


def game_dir(arg=None):
    """The game directory: --game, $ORBKIN_GAME, else <repo>/game."""
    g = Path(arg or os.environ.get('ORBKIN_GAME') or REPO / 'game').resolve()
    if not (g / 'package.json').exists():
        die(f'game dir {g} has no package.json (pass --game DIR or set ORBKIN_GAME)', 2)
    if not (g / 'node_modules').exists():
        die(f'{g}/node_modules missing: run `npm ci` in {g} first', 2)
    return g


def die(msg, code=2):
    print(f'error: {msg}', file=sys.stderr)
    sys.exit(code)


def run(cmd, cwd=None, env=None, timeout=1800):
    """Run a command, stream stderr, return stdout text (dies on non-zero exit)."""
    e = dict(os.environ)
    if env:
        e.update(env)
    r = subprocess.run(cmd, cwd=cwd, env=e, text=True, capture_output=True, timeout=timeout)
    if r.stderr:
        sys.stderr.write(r.stderr[-4000:])
    if r.returncode != 0:
        die(f'{cmd[0]} exited {r.returncode}', 3)
    return r.stdout


def facts(game, out_dir, species=None, heights='32,64', views='front,q3,side', extra=None):
    """Run facts.ts and return the parsed facts.json."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = ['npx', 'tsx', str(HERE / 'facts.ts'), '--game', str(game), '--out', str(out_dir), '--heights', heights, '--views', views]
    if species:
        cmd += ['--species', ','.join(species)]
    if extra:
        cmd += ['--extra', ','.join(extra)]
    run(cmd, cwd=game, env={'NODE_PATH': str(Path(game) / 'node_modules')})
    return json.loads((out_dir / 'facts.json').read_text())


def capture(game, mode, url, out_dir, name, extra=(), dist=None):
    """Run capture.mjs and return its JSON report (dies on failure)."""
    cmd = ['node', str(HERE / 'capture.mjs'), mode, '--game', str(game), '--url', url, '--out', str(out_dir), '--name', name, *extra]
    if dist:
        cmd += ['--dist', str(dist)]
    run(cmd, cwd=game)
    return json.loads((Path(out_dir) / f'{name}.json').read_text())


def read_pgm(path):
    """P5 silhouette mask -> (w, h, bytes) where 0 = black (inside)."""
    data = Path(path).read_bytes()
    parts = data.split(b'\n', 3)
    w, h = map(int, parts[1].split())
    return w, h, parts[3][: w * h]


def emit(obj, out=None):
    s = json.dumps(obj, indent=1)
    if out:
        Path(out).write_text(s)
    print(s)
