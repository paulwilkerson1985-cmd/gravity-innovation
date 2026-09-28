import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U3: switch residuals (source-dependent force on the test mass with the switch in / open-chamber force) for
finite-kappa (Robin) foils and thick-slab (two-port) foils, benchmark geometry (1 m chamber, 1/mu = 10 cm scale).
 configs:  pairW1, pairW2 : foil disks radius W at z=+-0.7 (between source and test, and above the test)
           can0, can1, can2 : closed cylinder Rs=0.5 around the test mass, top hole radius 0 / 0.1 / 0.2
usage: python3 u3_foil_scan.py robin <h> [kappas]      -> u3_robin_h<h>.json
       python3 u3_foil_scan.py slab  <h>               -> u3_slab_h<h>.json  (m x mt grid)"""
import sys, json, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from configs import residual, bench, F_test
from symm_robin import solve

mode, h = sys.argv[1], float(sys.argv[2])
CONF = {'pairW1': lambda mdl: dict(foilpair=(1.0, mdl)), 'pairW2': lambda mdl: dict(foilpair=(2.0, mdl)),
        'can0': lambda mdl: dict(can=(0.5, 0.0, mdl)), 'can1': lambda mdl: dict(can=(0.5, 0.1, mdl)),
        'can2': lambda mdl: dict(can=(0.5, 0.2, mdl))}
confs = sys.argv[4].split(',') if len(sys.argv) > 4 else list(CONF)
g = bench(h); phi, _ = solve(g); F0 = F_test(g, phi)
print('h=%.4f F0=%.5f' % (h, F0)); sys.stdout.flush()
out = {'h': h, 'F0': F0, 'data': {}}
fn = 'u3_%s_h%g%s.json' % (mode, h, ('_' + sys.argv[4].replace(',', '-')) if len(sys.argv) > 4 else '')
if mode == 'robin':
    kappas = [float(x) for x in sys.argv[3].split(',')] if len(sys.argv) > 3 and sys.argv[3] != 'all' else \
        [1, 3, 10, 30, 100, 300, 1e3, 3e3, 1e4]
    for c in confs:
        out['data'][c] = {}
        for k in kappas:
            r, _, dt = residual(h, F0=F0, **CONF[c](('robin', k)))
            out['data'][c][k] = r
            print('%-7s kappa=%-7g residual=%+.3e  (%.0fs)' % (c, k, r, dt)); sys.stdout.flush()
        rd, _, _ = residual(h, F0=F0, **CONF[c](('dir',)))
        out['data'][c]['dir'] = rd
        print('%-7s Dirichlet     residual=%+.3e' % (c, rd)); sys.stdout.flush()
        json.dump(out, open(fn, 'w'), indent=1)
else:
    ms = [25, 50, 100, 200, 400, 800, 1600]
    mts = [0.3, 1, 2, 3, 5, 8]
    for c in confs:
        out['data'][c] = {}
        for m in ms:
            for mt in mts:
                r, _, dt = residual(h, F0=F0, **CONF[c](('slab', float(m), mt / m)))
                out['data'][c]['%g,%g' % (m, mt)] = r
                print('%-7s m=%-5g mt=%-4g residual=%+.3e (%.0fs)' % (c, m, mt, r, dt)); sys.stdout.flush()
            json.dump(out, open(fn, 'w'), indent=1)
json.dump(out, open(fn, 'w'), indent=1)
print('done')
