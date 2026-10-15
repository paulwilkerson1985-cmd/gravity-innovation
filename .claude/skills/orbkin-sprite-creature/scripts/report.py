#!/usr/bin/env python3
"""Assemble the report skeleton from the JSON the scripts wrote, so every claim quotes a file.

  python3 report.py --species kin19 --dir OUTDIR [--out OUTDIR/report.md]
Looks for: sheet.json, lineup.json, keys-lint.json, hit-lint.json, blink.json, strips/*.json,
gate-*.json (judge.py pair / strip), ip-*.json in --dir (any missing one is listed as NOT RUN).
Fill the prose parts yourself: brief, divergence table, what is still weak, what was inferred.
"""
import argparse
import json
from pathlib import Path


def load(p):
    try:
        return json.loads(Path(p).read_text())
    except (OSError, ValueError):
        return None


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument('--species', required=True)
    a.add_argument('--dir', required=True)
    a.add_argument('--out')
    args = a.parse_args()
    d = Path(args.dir)
    s = args.species
    L = [f'# {s}: creature report', '', '## Brief and divergence', '(paste brief.md: role, element, stage, texels on screen, palette roles; the 3-concept table with scores and the pick)', '']
    sheet = load(d / 'sheet.json')
    L += ['## Geometry at battle size (read_sheet.py)']
    if sheet and s in sheet.get('species', {}):
        x = sheet['species'][s]
        L += [f"- tris {x['tris']}/{x['trisBudget']}, draw calls {x['drawCalls']}, grounded {x['grounded']}, {x['texelHeight']} texels tall", f"- eyes (pupil) {x.get('eyeTexels')} texels; colour blocks {x.get('colourBlocks')} shares {x.get('colourShares')}", f"- flags: {sheet.get('flags', {}).get(s, [])}"]
        if sheet.get('battle'):
            for v, b in sheet['battle'].items():
                L.append(f"- battle {v}: {b['file']} (crop {b['crop']}), draw calls {b['drawCalls']}, foe height px {b.get('foePxHeight')}")
    else:
        L.append('- NOT RUN')
    lu = load(d / 'lineup.json')
    L += ['', '## Silhouette lineup (lineup.py)']
    if lu:
        L += [f"- worst IoU {lu.get('worst')}; solidity {lu.get('solidityOf')} vs cast median {lu.get('solidityMedian')}", f"- flags: {lu.get('flags')}", f"- sheets: {lu.get('sheets')}"]
    else:
        L.append('- NOT RUN')
    for name, label in (('keys-lint.json', 'Attack key table (keys_lint.py)'), ('hit-lint.json', 'Hit key table (keys_lint.py)'), ('blink.json', 'Blink (blink_check.py)')):
        j = load(d / name)
        L += ['', f'## {label}']
        L.append(f"- {json.dumps({k: v for k, v in j.items() if k != 'keys'})}" if j else '- NOT RUN')
    L += ['', '## Motion strips (strips.py measured lint)']
    strips = sorted((d / 'strips').glob('*.json')) if (d / 'strips').exists() else []
    for p in strips:
        j = load(p)
        if j:
            L.append(f"- {p.stem}: {json.dumps({k: j[k] for k in ('anticipationFrames', 'backTexels', 'strikeFrames', 'maxStretch', 'minSquash', 'overshootTexels', 'totalFrames', 'flags') if k in j})} -> {j.get('strip')}")
    if not strips:
        L.append('- NOT RUN')
    L += ['', '## Gate verdicts (judge.py; quote the files, never "looks better")']
    gates = sorted(d.glob('gate-*.json'))
    for p in gates:
        j = load(p)
        if j:
            L.append(f"- {p.name}: {j.get('verdict')} (canary {j.get('canary', {}).get('verdict', 'n/a')}, {[ (r['label'], r['verdict'], r['candidateWins']) for r in j.get('results', [])]}, ${j.get('cost', 0):.2f})")
    if not gates:
        L.append('- NOT RUN')
    L += ['', '## Originality (judge.py ip)']
    ips = sorted(d.glob('ip-*.json'))
    for p in ips:
        j = load(p)
        if j:
            L.append(f"- {p.name}: {j.get('verdict')} " + '; '.join(f"{Path(i['image']).name}: {i['verdict']} max {i['maxSimilarity']}" for i in j.get('images', [])))
    if not ips:
        L.append('- NOT RUN')
    L += ['', '## Still weak', '- ', '', '## Inferred, not measured', '- ', '', '## Files changed', '- ']
    text = '\n'.join(L) + '\n'
    out = Path(args.out or d / 'report.md')
    out.write_text(text)
    print(text)


if __name__ == '__main__':
    main()
