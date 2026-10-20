"""Q10: summary table from bench_runs.jsonl and memb_runs.jsonl."""
import json
B = {json.loads(l)['label']: json.loads(l) for l in open('bench_runs.jsonl')}
M = {json.loads(l)['label']: json.loads(l) for l in open('memb_runs.jsonl')}
print('Benchmark |F~| (virtual-work cutoffs ... | box stress integral)')
for k, o in B.items():
    print('  %-6s cells %7d dofs %7d newton %d  ' % (k, o['cells'], o['dofs'], o['newton_its'])
          + ' '.join('%.5f' % abs(v) for v in o['F_vw'].values()) + ' | %.5f' % abs(o['F_box']))
F0 = B['b5_P2']['F_vw']['0.40-0.75']
print('Reference F0 = %.5f (b5_P2, cutoff 0.40-0.75)' % abs(F0))
for lev, k in [('m2', ''), ('m3', ''), ('m4', ''), ('m3', '_k014')]:
    s = M[lev + '_src' + k]['F_vw']['0.34-0.50']; n = M[lev + '_nosrc' + k]['F_vw']['0.34-0.50']
    kap = M[lev + '_src' + k]['kappa']
    print('Membrane kappa = %.2f, %s: F(src) = %.5f, F(no src) = %.5f, S/S0 = %.4f, loss %.2f%%'
          % (kap, lev, abs(s), abs(n), (s - n) / F0, 100 * (1 - (s - n) / F0)))
