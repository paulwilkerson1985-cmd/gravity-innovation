#!/usr/bin/env python3
"""Read an `ORBKIN_BENCH {json}` line (pasted by the owner) against the tier's ms budget.

  python3 -I ${CLAUDE_SKILL_DIR}/scripts/bench_read.py BENCH.txt|BENCH.json [--tier low|T1|desk] [--budget perf-budget.json] [--json]

Prints per case: gpu (or sync) p50/p90, cpu p50, raf over20/over34 %, enterMs, links, calls, tris,
internal; then the ablation costs (bloom = cave-low − cave-low-nobloom, grade+tilt = nobloom − nopost,
high tier = cave-high − cave-low, thermal drift) and the verdict per decision rule (mobile-perf §6.4):
  adopt for the tier only if the tier's cave case stays within the GPU frame budget AND raf.over20 ≤ 5 %
  after the thermal check (drift ≤ 15 %, else rerun cold); enterMs > 2500 or links > 40 → fix scene
  build / program count before adding content. Exit 1 when the verdict is OVER.
`gpuMs` is preferred; `syncMs` is an upper bound (adds the CPU submit + a readPixels round trip ≈ 1 ms).
Store each run as a dated JSON next to the budget and compare runs on the same phone only.
"""
import argparse, json, os, sys

def load(path):
    txt = open(path).read()
    i = txt.find('ORBKIN_BENCH')
    if i >= 0:
        txt = txt[i + len('ORBKIN_BENCH'):]
    txt = txt[txt.find('{'):]
    return json.loads(txt[:txt.rfind('}') + 1])

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('file'); ap.add_argument('--tier', default='low'); ap.add_argument('--budget'); ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    b = json.load(open(a.budget or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'perf-budget.json')))
    ms = b['tiers'][a.tier]['ms']
    d = load(a.file)
    cases = d.get('cases', {})
    frame = lambda c: (c.get('gpuMs') or {}).get('p50', c['syncMs']['p50'])
    rows = []
    for cid, c in cases.items():
        if cid == 'warmup':
            continue
        rows.append({'case': cid, 'frameMs': frame(c), 'src': 'gpu' if c.get('gpuMs') else 'sync', 'p90': (c.get('gpuMs') or c['syncMs'])['p90'], 'cpuP50': c['cpuMs']['p50'], 'over20': c['raf']['over20'], 'over34': c['raf']['over34'], 'enterMs': c['enterMs'], 'links': c['links'], 'calls': c['calls'], 'tris': c['tris'], 'internal': c['internal']})
    g = lambda cid: frame(cases[cid]) if cid in cases else None
    costs = {}
    if g('cave-low') is not None and g('cave-low-nobloom') is not None: costs['bloom'] = round(g('cave-low') - g('cave-low-nobloom'), 1)
    if g('cave-low-nobloom') is not None and g('cave-low-nopost') is not None: costs['gradeTilt'] = round(g('cave-low-nobloom') - g('cave-low-nopost'), 1)
    if g('cave-high') is not None and g('cave-low') is not None: costs['highTier'] = round(g('cave-high') - g('cave-low'), 1)
    for k in ('cave-low-fa-l', 'cave-low-fa-h2', 'cave-low-fa-h', 'cave-low-fa-n', 'cave-low-ires2', 'cave-low-native', 'cave-low-native-msaa4'):
        if g(k) is not None and g('cave-low') is not None: costs[k] = round(g(k) - g('cave-low'), 1)
    main_case = {'low': 'cave-low', 'T1': 'cave-low-ires2', 'desk': 'cave-high'}[a.tier]
    verdict, notes = 'PASS', []
    drift = d.get('thermalDriftPct')
    if drift is not None and abs(drift) > ms['thermalDriftPct']: notes.append(f'thermal drift {drift} % > {ms["thermalDriftPct"]} %: rerun cold or treat as sustained numbers')
    mc = cases.get(main_case)
    if mc:
        if frame(mc) > ms['gpuFrame']: verdict = 'OVER'; notes.append(f'{main_case} frame {frame(mc)} ms > {ms["gpuFrame"]} ms budget')
        if mc['raf']['over20'] > ms['rafOver20Pct']: verdict = 'OVER'; notes.append(f'{main_case} raf.over20 {mc["raf"]["over20"]} % > {ms["rafOver20Pct"]} %')
        if mc['enterMs'] > ms['enterMs']: notes.append(f'{main_case} enterMs {mc["enterMs"]} > {ms["enterMs"]}: fix scene build before adding content')
        if mc['links'] > 40: notes.append(f'{main_case} links {mc["links"]} > 40 programs per scene entry')
    else:
        notes.append(f'no {main_case} case in this run')
    if 'cave-low-ires2' in cases and frame(cases['cave-low-ires2']) <= 14: notes.append('cave-low-ires2 ≤ 14 ms: this device class can take T1 (internal × 1.5–2)')
    out = {'tier': a.tier, 'device': d.get('device', {}).get('gpu'), 'ua': d.get('device', {}).get('ua'), 'timer': bool(d.get('device', {}).get('ext', {}).get('timer')), 'rows': rows, 'costsMs': costs, 'thermalDriftPct': drift, 'probe': d.get('probe'), 'verdict': verdict, 'notes': notes}
    if a.json:
        print(json.dumps(out, indent=1))
    else:
        print(f"device: {out['device']}  timer queries: {out['timer']}  tier budget: {a.tier} (frame ≤ {ms['gpuFrame']} ms, raf.over20 ≤ {ms['rafOver20Pct']} %)")
        print(f"{'case':22} {'frame':>7} {'p90':>7} {'cpu':>6} {'>20ms%':>7} {'>34ms%':>7} {'enter':>7} {'links':>5} {'calls':>5} {'tris':>7}  internal")
        for r in rows:
            print(f"{r['case']:22} {r['frameMs']:7.1f} {r['p90']:7.1f} {r['cpuP50']:6.1f} {r['over20']:7.1f} {r['over34']:7.1f} {r['enterMs']:7.0f} {r['links']:5d} {r['calls']:5d} {r['tris']:7d}  {'x'.join(map(str, r['internal']))}")
        print('costs (ms):', costs, ' thermal drift %:', drift)
        if out['probe']: print('probe:', out['probe'])
        for n in notes: print('note:', n)
        print('VERDICT:', verdict)
    sys.exit(1 if verdict == 'OVER' else 0)

if __name__ == '__main__':
    main()
