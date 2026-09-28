import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U3b: effect of the pinned corner rings used by slab-mode cans: closed can (Rs=0.5, no hole), Robin foils with the
two corner rings pinned vs Robin corners.  C(kappa) = R(Robin corners)/R(pinned corners) corrects slab-mode cans."""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from configs import residual, bench, F_test
from symm_robin import solve
h = float(sys.argv[1])
g = bench(h); phi, _ = solve(g); F0 = F_test(g, phi)
out = {}
for k in [1, 3, 10, 30, 100, 300, 1000, 3000, 10000]:
    ra, _, _ = residual(h, F0=F0, can=(0.5, 0.0, ('robin', k)))
    rb, _, _ = residual(h, F0=F0, can=(0.5, 0.0, ('robin', k), True))
    out[k] = [ra, rb]
    print('h=%.3f kappa=%-6g closed can: Robin corners %.3e | pinned corners %.3e | C=%.3f' % (h, k, ra, rb, ra / rb)); sys.stdout.flush()
json.dump(out, open('u3b_corner_h%g.json' % h, 'w'))
