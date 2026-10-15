#!/usr/bin/env python3
"""ledger.py - the per-arena retune ledger: every captured or previewed variant with its parameters, the
critique.py numbers that matter, the prediction and the verdict, in ONE Markdown table per arena that lives
in the repo (game/docs/research/retunes/<arena>.md) and survives the session.

Why: the volcanic pilot's ten variants (A-J) existed only as scratch JSONs; the next agent would bracket
the same grades again. S3 reads the ledger before bracketing; S4/S5 append to it.

Run isolated:
  python3 -I ledger.py show  LEDGER.md                      # print the table (what S3 must read)
  python3 -I ledger.py add   LEDGER.md --variant F-env --view desk --kind captured|preview
         --params params.json|"text" --crit AFTER.json [--base BEFORE.json] [--risk risk.json]
         [--verdict verdict.json | --verdict-text "worse 0/4"] [--craft craft.json] [--note "..."]
         [--source "scratch path / run dir"] [--by "session id"]
      Appends one row. --crit / --base are critique.py JSONs (or grade_preview.py variant JSONs); the row
      records the numbers below as AFTER (BEFORE ratio in brackets when --base is given). --risk is
      verdict_risk.py --json output; --verdict a visual_judge.py verdict JSON (decision, win rate, sealed);
      --craft a craft_check.py JSON (verdict). Creates the file with a header when it does not exist.
  python3 -I ledger.py next  LEDGER.md --set|--show         # the "queued next experiment" block at the top

Columns: date | variant | view | kind | params (short) | b*L excl | C95 excl | chrom | cool | dark | dL foe |
  edge | near b* (x base) | grad L (x base) | predicted | craft | verdict | note
Exit 0; 2 bad input.
"""
import argparse
import datetime
import json
import os
import sys

HEADER = """# Retune ledger: {arena}

One row per variant that was previewed or captured for this arena (orbkin-art-direction S3-S5). Numbers are
critique.py's (`*_excl_emitter` = outside the protected emitter disc; `near b*` / `grad L` = the emitter
falloff, protected: keep >= 0.75x / 0.8x the accepted frame). `predicted` is verdict_risk.py; `verdict` is the
blind pairwise judge (unsealed = regressions only). Read this before bracketing; append after every capture.

## Queued next experiment
{next}

## Variants
| date | variant | view | kind | params | b*L excl | C95 excl | chrom | cool | dark | dL foe | edge | near b* | grad L | predicted | craft | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
"""


def load(p):
    if not p:
        return None
    with open(p) as f:
        d = json.load(f)
    if isinstance(d, list):
        d = d[0]
    return d


def num(d, k, nd=2):
    v = d.get(k) if d else None
    if v is None:
        v = d.get(k.replace('_excl_emitter', '')) if d else None
    if v is None:
        return '-'
    return f'{v:.{nd}f}' if isinstance(v, float) else str(v)


def ratio_cell(a, b, key, nd=1):
    va = (a.get('falloff') or {}).get(key) if a else None
    vb = (b.get('falloff') or {}).get(key) if b else None
    if va is None:
        return '-'
    s = f'{va:.{nd}f}'
    if vb:
        s += f' ({va / vb:.2f}x)'
    return s


def short_params(p):
    if os.path.exists(p):
        with open(p) as f:
            txt = f.read().strip()
        try:
            j = json.loads(txt)
            if isinstance(j, dict):
                return '; '.join(f'{k}={v}' for k, v in j.items())[:220]
        except json.JSONDecodeError:
            pass
        return ' '.join(txt.split())[:220]
    return p[:220]


def ensure(path, arena):
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w') as f:
            f.write(HEADER.format(arena=arena, next='- none queued'))


def add(a):
    arena = a.arena or os.path.splitext(os.path.basename(a.ledger))[0]
    ensure(a.ledger, arena)
    c, b, r, v, cr = load(a.crit), load(a.base), load(a.risk), load(a.verdict), load(a.craft)
    foe = (c.get('focal_by_subject') or {}).get('foe') if c else None
    dl = foe['dL_vs_ring'] if foe else (c.get('focal_dL_vs_ring') if c else None)
    edge = foe['edge_ratio'] if foe else (c.get('focal_edge_ratio') if c else None)
    pred = '-'
    if r:
        pred = r.get('predicted', '-')
        if r.get('triggered'):
            pred = 'worse: ' + ','.join(r['triggered'])
        elif r.get('unproven'):
            pred = 'UNPROVEN'
        else:
            pred = 'no known punishment'
    verdict = a.verdict_text or '-'
    if v:
        dec = v.get('decision') or v.get('verdict') or '-'
        wr = v.get('win_rate') or v.get('winrate')
        verdict = f"{dec}" + (f" ({wr})" if wr is not None else '') + ('' if v.get('sealed') else ' unsealed')
    craft = cr.get('verdict', '-') if cr else '-'
    row = [datetime.date.today().isoformat(), a.variant, a.view, a.kind, short_params(a.params).replace('|', '/'),
           num(c, 'bstar_lights_excl_emitter', 1), num(c, 'chroma_p95_excl_emitter', 1), num(c, 'chromatic_share', 3), num(c, 'cool_share', 3), num(c, 'dark_share', 3),
           '-' if dl is None else f'{dl:.1f}', '-' if edge is None else f'{edge:.2f}', ratio_cell(c, b, 'near_bstar'), ratio_cell(c, b, 'gradient_L'),
           pred, craft, verdict, (a.note or '').replace('|', '/') + (f' [{a.source}]' if a.source else '') + (f' by {a.by}' if a.by else '')]
    with open(a.ledger, 'a') as f:
        f.write('| ' + ' | '.join(row) + ' |\n')
    print(json.dumps({'ok': True, 'ledger': a.ledger, 'row': row}))


def show(a):
    with open(a.ledger) as f:
        print(f.read())


def next_(a):
    with open(a.ledger) as f:
        txt = f.read()
    head, _, rest = txt.partition('## Queued next experiment\n')
    block, _, tail = rest.partition('\n## Variants')
    if a.set:
        block = a.set.strip() + '\n'
        with open(a.ledger, 'w') as f:
            f.write(head + '## Queued next experiment\n' + block + '\n## Variants' + tail)
        print(json.dumps({'ok': True, 'next': block.strip()}))
    else:
        print(block.strip())


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('add')
    s.add_argument('ledger')
    s.add_argument('--arena')
    s.add_argument('--variant', required=True)
    s.add_argument('--view', required=True, choices=['desk', 'phone', 'both'])
    s.add_argument('--kind', required=True, choices=['captured', 'preview'])
    s.add_argument('--params', required=True, help='params JSON path or a short text')
    s.add_argument('--crit', required=True)
    s.add_argument('--base')
    s.add_argument('--risk')
    s.add_argument('--verdict')
    s.add_argument('--verdict-text')
    s.add_argument('--craft')
    s.add_argument('--note')
    s.add_argument('--source')
    s.add_argument('--by')
    s.set_defaults(fn=add)
    s2 = sub.add_parser('show')
    s2.add_argument('ledger')
    s2.set_defaults(fn=show)
    s3 = sub.add_parser('next')
    s3.add_argument('ledger')
    s3.add_argument('--set')
    s3.add_argument('--show', action='store_true')
    s3.set_defaults(fn=next_)
    a = ap.parse_args()
    try:
        a.fn(a)
    except (OSError, json.JSONDecodeError, KeyError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)


if __name__ == '__main__':
    main()
