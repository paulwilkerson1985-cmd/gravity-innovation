import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V4: benchmark convergence.  Test sphere a1=0.3 at z=0, source a2=0.6 at z=-D, chamber radius 5, length 10 (1 m x 1 m
for 1/mu=10 cm).  Force on the test sphere from the stress tensor on two different pillboxes, force on the source,
for D=1.4 (benchmark), 2.0, 3.0 (distance law) at a sequence of grid spacings."""
import sys, time, json, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
a1, a2 = 0.3, 0.6
hs = [float(x) for x in sys.argv[1].split(',')] if len(sys.argv) > 1 else [0.04, 0.025, 0.02, 0.0125, 0.01, 0.008]
Ds = [1.4, 2.0, 3.0]
out = {}
for h in hs:
    for D in Ds:
        t = time.time()
        g = Grid(5, 5, h); g.sphere(0, a1); g.sphere(-D, a2)
        phi, res = solve(g)
        Ft = [force_z(g, phi, a1 + mm, -a1 - mm, a1 + mm) for mm in (0.08, 0.2)]
        Fs = force_z(g, phi, a2 + 0.1, -D - a2 - 0.1, -D + a2 + 0.1)
        out['%g_%g' % (h, D)] = dict(h=h, D=D, F_test=Ft, F_src=Fs, res=res)
        print('h=%.4f D=%.1f  F_test=%.5f / %.5f (two surfaces)  F_source=%+.5f  res=%.0e  t=%.0fs' % (h, D, Ft[0], Ft[1], Fs, res, time.time() - t))
        sys.stdout.flush()
json.dump(out, open('v4_results_%s.json' % ('_'.join('%g' % h for h in hs)), 'w'), indent=1)
