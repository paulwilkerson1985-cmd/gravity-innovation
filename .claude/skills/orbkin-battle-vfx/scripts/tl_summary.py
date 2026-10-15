#!/usr/bin/env python3
"""Summarise one or two fx timelines (timeline.json from timeline.mjs) as a frame table.

Usage:
  python3 tl_summary.py AFTER/timeline.json                 # one run
  python3 tl_summary.py BEFORE/timeline.json AFTER/timeline.json   # before/after table + budget verdicts
Options: --json (machine output on stdout), --severity normal|super-effective|critical (expected
severity for the hit-stop check; default = the run's own severity text).
Exit 0 = every checked beat inside the beat sheet, 1 = at least one beat outside it, 2 = usage.
Checks (60 fps frames; see references/timing.md): impact->reaction <= 2, flash on the impact frame
(impact->flash <= 1), hit-stop by severity (normal 3, super-effective 5-6, critical 8-10, KO 10-12;
not-very-effective 0-2), launch->settle <= 60, text->launch reported only (project decision).
"""
import json, sys, os

HITSTOP = {'normal': (3, 3), 'super-effective': (5, 6), 'critical': (8, 10), 'ko': (10, 12), 'not-very-effective': (0, 2)}


def load(p):
    with open(p) as f:
        return json.load(f)


def row(r):
    e, c = r['events'], r['counters']
    sev = 'ko' if e.get('ko') else e.get('severity', 'normal')
    lo, hi = HITSTOP[sev]
    hs = e.get('hitStop')
    return {
        'move': r['config']['moveName'], 'severity': sev, 'hpBefore': e.get('hpBefore'), 'hpAfter': e.get('hpAfter'),
        'text->launch': e['textToLaunch'], 'launch->impact': e['launchToImpact'], 'impact->flash': e['impactToFlash'],
        'impact->reaction': e['impactToReaction'], 'hit-stop': hs, 'hit-stop target': f'{lo}-{hi}' if lo != hi else str(lo),
        'attacker held': e.get('attackerHeld'), 'shake frames': e['shake']['frames'], 'shake peak px': e['shake']['peakPx'],
        'shake kind': 'kick' if e['shake']['directional'] else ('buzz' if e['shake']['directional'] is False else '-'),
        'hp drain f': e['hpDrainFrames'], 'launch->settle': e['launchToSettle'],
        'draw calls idle': c['idleCalls'], 'draw calls peak': c['peakCalls'], 'extra calls': c['extraCalls'],
        'programs': f"{c['programsIdle']}->{c['programsPeak']}", 'point lights': c['pointLights'], 'lit peak': c['litPointLightsPeak'],
        'points peak': c['pointsAlivePeak'], '3D fx meshes': c['meshes3dAdded'], 'fx objects peak': c['fxObjectsPeak'],
        'page errors': len(r.get('pageErrors', [])),
    }


def checks(r, severity=None):
    e, c = r['events'], r['counters']
    sev = severity or ('ko' if e.get('ko') else e.get('severity', 'normal'))
    lo, hi = HITSTOP[sev]
    out = []
    def chk(name, ok, detail):
        out.append({'check': name, 'ok': bool(ok), 'detail': detail})
    ir = e['impactToReaction']
    chk('impact->reaction <= 2 f', ir is not None and 0 <= ir <= 2, f'{ir} f')
    fl = e['impactToFlash']
    chk('flash on the impact frame (<= 1 f)', fl is not None and 0 <= fl <= 1, f'{fl} f')
    hs = e['hitStop']
    chk(f'hit-stop {lo}-{hi} f for {sev}', hs is not None and lo <= hs <= hi, f'{hs} f')
    ls = e['launchToSettle']
    chk('launch->settle <= 60 f', ls is not None and ls <= 60, f'{ls} f')
    sh = e['shake']
    chk('shake is a directional kick (not a buzz)', sh['frames'] == 0 or sh['directional'] is True, f"{sh['frames']} f, peak {sh['peakPx']} px, {sh['pattern'][:4]}")
    chk('programs unchanged idle->impact (light pre-allocated)', c['programsPeak'] == c['programsIdle'], f"{c['programsIdle']} -> {c['programsPeak']}")
    chk('no page errors', not r.get('pageErrors'), '; '.join(r.get('pageErrors', [])[:3]))
    return out


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    as_json = '--json' in argv
    sev = None
    if '--severity' in argv:
        sev = argv[argv.index('--severity') + 1]
        args = [a for a in args if a != sev]
    if not args or len(args) > 2:
        print(__doc__); return 2
    runs = [load(p) for p in args]
    rows = [row(r) for r in runs]
    chk = checks(runs[-1], sev)
    if as_json:
        print(json.dumps({'runs': args, 'rows': rows, 'checks': chk}, indent=1))
        return 0 if all(c['ok'] for c in chk) else 1
    labels = ['before', 'after'] if len(runs) == 2 else ['run']
    keys = list(rows[0].keys())
    w = max(len(k) for k in keys)
    print(f"{'beat / counter'.ljust(w)}  " + '  '.join(l.rjust(10) for l in labels))
    for k in keys:
        print(f"{k.ljust(w)}  " + '  '.join(str(rw[k]).rjust(10) for rw in rows))
    print()
    print(f"checks on {args[-1]}:")
    for c in chk:
        print(f"  [{'ok' if c['ok'] else 'FAIL'}] {c['check']}: {c['detail']}")
    print(f"text->launch is reported, not gated ({rows[-1]['text->launch']} f; the playbook target is <= 30 f and trimming it is a project decision).")
    return 0 if all(c['ok'] for c in chk) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
