#!/usr/bin/env python3
"""Lint an attack (or hit) key table in texels before you capture anything.

  python3 keys_lint.py --table keys.json --species kin19 [--facts facts.json] [--kind lunge|hit]
  python3 keys_lint.py --ts src/render/creature.ts --name LUNGE_KEYS --archetype quad --species kin19
Table format (JSON or a plain-literal TS object; numbers only, no arithmetic):
  { "keys": [ { "beat": "windup", "frames": 9,  "sq": 0.74, "lean": -0.30, "fwd": -0.20, "up": 0.0, "ease": "outCubic" },
              { "beat": "hold",   "frames": 4,  "sq": 0.72, "lean": -0.32, "fwd": -0.20 },
              { "beat": "strike", "frames": 5,  "sq": 1.38, "lean": 0.38,  "fwd": 0.95, "up": 0.14, "smear": true },
              { "beat": "contact","frames": 4,  "sq": 0.78, "lean": 0.2,   "fwd": 0.95, "impact": true },
              { "beat": "recover","frames": 12, "sq": 1.0,  "lean": 0.0,   "fwd": -0.08, "up": 0.22 },
              { "beat": "land",   "frames": 5,  "sq": 0.80, "fwd": 0.0 },
              { "beat": "settle", "frames": 10, "sq": 1.0,  "ease": "outBack" } ] }
  Missing fields carry over from the previous key (rest = sq 1, lean 0, fwd 0, up 0). `fwd` is in
  model-height units H (1.0 = one body height toward the target) unless "units": "world".
Rules (character-animation-craft §4.1, §8; all amplitudes converted to texels at the species'
battle size, 28/34/40 texels by stage):
  WINDUP   anticipation travel (max |fwd| before the strike) >= 10% H  (>= 3 texels at 34)
  HOLD     a held key of >= 2 frames at the wind-up extreme (4-5 recommended)
  STRETCH  strike stretch sq >= 1.25 (25% H) on the smear key
  SQUASH   a squash <= 0.85 (15% H) somewhere (wind-up or contact)
  STRIKE   strike <= 8 frames, wind-up : strike between 1.5 and 4 (2-3 : 1 is the reference)
  OVERSHOOT a key past rest on recovery (fwd < 0 by >= 1 texel, or lean past upright, or a settle ring)
  SUBTEXEL every key moves >= 1 texel from the previous key (|dfwd| + |dup| + 0.5 |dsq| H)
  TOTAL    0.8-1.1 s total (48-66 f); heavy archetype up to 1.5 s
  MASS     no explicit sxz/sx/sz in keys (the player must derive xz from 1/sqrt(sy)); if given, within 3%
Exit 0 clean, 1 findings, 2 bad input. Prints JSON with per-key texel amplitudes and findings.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

HEIGHT_TEXELS = {1: 28, 2: 34, 3: 40}


def parse_ts(path, name, archetype):
    src = Path(path).read_text()
    m = re.search(r'(?:const|let|var)\s+' + re.escape(name) + r'\b[^=]*=\s*', src)
    if not m:
        sys.exit(f'error: {name} not found in {path}')
    i = m.end()
    depth, j = 0, i
    while j < len(src):
        if src[j] == '{': depth += 1
        elif src[j] == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    lit = src[i:j + 1]
    lit = re.sub(r'//[^\n]*', '', lit)
    lit = re.sub(r'/\*.*?\*/', '', lit, flags=re.S)
    lit = re.sub(r"'([^']*)'", r'"\1"', lit)
    lit = re.sub(r'([{,]\s*)([A-Za-z_]\w*)\s*:', r'\1"\2":', lit)
    lit = re.sub(r',\s*([}\]])', r'\1', lit)
    try:
        obj = json.loads(lit)
    except ValueError as e:
        sys.exit(f'error: could not parse {name} as a plain literal ({e}); keep the table to numbers, strings and booleans')
    if archetype:
        if archetype not in obj:
            sys.exit(f'error: archetype {archetype} not in {name} (have {list(obj)})')
        obj = obj[archetype]
    return obj if 'keys' in obj else {'keys': obj}


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--table')
    p.add_argument('--ts')
    p.add_argument('--name', default='LUNGE_KEYS')
    p.add_argument('--archetype')
    p.add_argument('--species', required=True)
    p.add_argument('--facts', help='facts.json from read_sheet/lineup (for the model height and stage); else --height/--stage')
    p.add_argument('--height', type=float, help='model height in model units (bbox y)')
    p.add_argument('--stage', type=int, default=2, help='1, 2, 3 (single-stage rares are 2)')
    p.add_argument('--kind', default='lunge', choices=['lunge', 'hit'])
    p.add_argument('--out')
    a = p.parse_args()
    table = parse_ts(a.ts, a.name, a.archetype) if a.ts else json.loads(Path(a.table).read_text())
    if a.facts:
        f = json.loads(Path(a.facts).read_text())['species'][a.species]
        H, stage = f['bbox']['y'], f['stage']
    else:
        if not a.height:
            sys.exit('error: pass --facts facts.json or --height')
        H, stage = a.height, a.stage
    texel_h = HEIGHT_TEXELS[stage]
    tx_per_unit = texel_h / H  # texels per model unit
    units = table.get('units', 'H')
    scale = H if units == 'H' else 1.0  # fwd/up in H-units -> model units
    keys = table['keys']
    state = {'sq': 1.0, 'lean': 0.0, 'fwd': 0.0, 'up': 0.0}
    rows, findings = [], []
    t = 0
    prev = dict(state)
    for k in keys:
        cur = dict(prev)
        for f in ('sq', 'lean', 'fwd', 'up'):
            if f in k:
                cur[f] = float(k[f])
        fr = int(k.get('frames', 0))
        travel_tx = (abs(cur['fwd'] - prev['fwd']) * scale + abs(cur['up'] - prev['up']) * scale + 0.5 * abs(cur['sq'] - prev['sq']) * H) * tx_per_unit
        rows.append({'beat': k.get('beat', '?'), 'frames': fr, 't0': t, 'sq': cur['sq'], 'lean': cur['lean'], 'fwdTexels': round(cur['fwd'] * scale * tx_per_unit, 2), 'upTexels': round(cur['up'] * scale * tx_per_unit, 2), 'moveTexels': round(travel_tx, 2), 'squashTexels': round((1 - cur['sq']) * H * tx_per_unit, 2)})
        if fr > 0 and travel_tx < 1 and not k.get('hold') and k.get('beat') != 'hold' and abs(cur['lean'] - prev['lean']) < 0.05:
            findings.append(f"SUBTEXEL key '{k.get('beat', '?')}' moves {travel_tx:.2f} texels (< 1): invisible or boils; merge it or enlarge it")
        t += fr
        prev = cur
        for f in ('sx', 'sz', 'sxz'):
            if f in k:
                want = 1 / math.sqrt(max(0.05, cur['sq']))
                if abs(float(k[f]) - want) / want > 0.03:
                    findings.append(f"MASS key '{k.get('beat')}' {f}={k[f]} but 1/sqrt(sq)={want:.3f}: volume not preserved")
    total = t
    strike_i = next((i for i, k in enumerate(keys) if k.get('smear') or k.get('beat') == 'strike'), None)
    if a.kind == 'lunge':
        if strike_i is None:
            findings.append('STRIKE no key marked "smear": true (or beat "strike")')
        else:
            pre = rows[:strike_i]
            windup_f = sum(r['frames'] for r in pre)
            back_tx = max([-r['fwdTexels'] for r in pre] + [0])
            hold_f = max([r['frames'] for r in pre if abs(r['moveTexels']) < 0.75 or keys[rows.index(r)].get('beat') == 'hold'] + [0]) if pre else 0
            strike_f = rows[strike_i]['frames']
            stretch = rows[strike_i]['sq']
            if back_tx < 0.10 * texel_h:
                findings.append(f'WINDUP anticipation travel {back_tx:.1f} texels < 10% H ({0.1 * texel_h:.1f}); Emerald uses 12.5%')
            if hold_f < 2:
                findings.append(f'HOLD no held key >= 2 f at the wind-up extreme (have {hold_f}); hold 4-5 f')
            if stretch < 1.25:
                findings.append(f'STRETCH strike sq {stretch} < 1.25 (25% H)')
            if strike_f > 8:
                findings.append(f'STRIKE {strike_f} f > 8: the smear is one short cel')
            ratio = windup_f / max(1, strike_f)
            if not 1.5 <= ratio <= 4:
                findings.append(f'STRIKE wind-up:strike = {windup_f}:{strike_f} = {ratio:.1f}, want 2-3 : 1')
            post = rows[strike_i + 1:]
            min_sq = min([r['sq'] for r in rows])
            if min_sq > 0.85:
                findings.append(f'SQUASH deepest squash sq {min_sq} > 0.85 (15% H)')
            over = any(r['fwdTexels'] <= -1 for r in post) or any(r['lean'] < -0.08 for r in post) or any(r['sq'] > 1.05 for r in post[1:])
            if not over:
                findings.append('OVERSHOOT recovery never passes rest (fwd < -1 texel, lean past upright, or a settle ring > 1.05)')
            lo, hi = (48, 66) if table.get('archetype') != 'heavy' else (48, 92)
            if not lo <= total <= hi:
                findings.append(f'TOTAL {total} f = {total / 60:.2f} s outside {lo}-{hi} f')
    else:
        first = rows[0] if rows else None
        if not first or first['frames'] < 4 or first['frames'] > 6:
            findings.append('HIT first (strongest) recoil cel should be held 4-6 f')
        if first and first['sq'] > 0.85:
            findings.append(f"HIT recoil squash sq {first['sq']} > 0.85")
        if first and abs(first['fwdTexels']) < 2:
            findings.append(f"HIT recoil {first['fwdTexels']} texels: want 2-3 texels back")
        if not 14 <= total <= 30:
            findings.append(f'TOTAL hit {total} f: Cassette Beasts hurt = 18 f (0.3 s); keep 14-30 f')
    out = {'species': a.species, 'kind': a.kind, 'heightUnits': H, 'texelHeight': texel_h, 'texelsPerUnit': round(tx_per_unit, 2), 'totalFrames': total, 'seconds': round(total / 60, 2), 'keys': rows, 'findings': findings}
    s = json.dumps(out, indent=1)
    if a.out:
        Path(a.out).write_text(s)
    print(s)
    sys.exit(1 if findings else 0)


if __name__ == '__main__':
    main()
