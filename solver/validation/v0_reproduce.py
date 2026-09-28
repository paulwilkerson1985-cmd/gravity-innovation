import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
# Reproduce the original benchmark numbers with the unmodified solver.
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
a1, a2 = 0.3, 0.6
for h in [0.04]:
    for D in [1.4, 2.0, 3.0]:
        t = time.time()
        g = Grid(5, 5, h); g.sphere(0, a1); g.sphere(-D, a2)
        phi, res = solve(g)
        Fs = [force_z(g, phi, a1 + m, -a1 - m, a1 + m) for m in (0.08, 0.2, 0.4)]
        print('h=%.3f D=%.2f res=%.1e F(surfaces m=.08,.2,.4)=%s  t=%.1fs' % (h, D, res, np.round(Fs, 4), time.time() - t)); sys.stdout.flush()
