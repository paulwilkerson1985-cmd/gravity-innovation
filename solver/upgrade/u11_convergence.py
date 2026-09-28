import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U11: resolution check (h=0.05 vs 0.025) of key design numbers: proxy signals and membrane transmission."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from u7_proxy import run
from configs import bench, F_test
from symm_robin import solve
for h in [0.05, 0.025]:
    S0, _, _ = run(h)
    out = ['S0=%.4f' % S0]
    for name, kw in [('tt(2,0.3)', dict(turntable=(2.0, 0.3))), ('tt(2,2.0)', dict(turntable=(2.0, 2.0))),
                     ('fibre-dir', dict(fibre='dir')), ('housing(0.5,1.5)', dict(housing=(0.5, 1.5), fibre='unscr'))]:
        S, _, Fn = run(h, **kw); out.append('%s S/S0=%.4f static=%+.3f' % (name, S / S0, Fn))
    for k in [0.1, 1.0]:
        g = bench(h, membrane=(-0.55, None, ('robin', k))); p, _ = solve(g); Fs = F_test(g, p)
        g = bench(h, source=False, membrane=(-0.55, None, ('robin', k))); p, _ = solve(g); Fn = F_test(g, p)
        out.append('membrane k=%g S/F0=%.4f' % (k, (Fs - Fn) / S0))
    print('h=%.3f: ' % h + ' | '.join(out)); sys.stdout.flush()
