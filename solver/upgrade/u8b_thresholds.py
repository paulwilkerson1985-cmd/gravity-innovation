import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U8b: minimum chamber size for condensation with the fixed physical benchmark bodies (3 cm / 6 cm Cu spheres, 14 cm
apart), cylinder of diameter = height: R_c (units 1/mu, R = L_half) where lambda_min(-Lap) = 1; D_min = 2 R_c / mu."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, lam_min
for L in [4, 7, 10, 15, 20]:
    a1, a2, dist = 3 / L, 6 / L, 14 / L
    h = min(0.05, a1 / 8)
    def f(n):
        g = RGrid(n * h, n * h, h); g.sphere(0, a1); g.sphere(-dist, a2); return lam_min(g)[0] - 1
    nl, nh = int(round(2.8 / h)), int(round(4.5 / h)); fl, fh = f(nl), f(nh)
    while nh - nl > 1:
        nm = (nl + nh) // 2; fm = f(nm)
        if fm > 0: nl, fl = nm, fm
        else: nh, fh = nm, fm
    Rc = h * (nl + fl / (fl - fh))
    print('1/mu=%2d cm: R_c=%.3f/mu  -> minimum chamber diameter (=height) %.0f cm  (empty-chamber value 2.872/mu -> %.0f cm)' % (L, Rc, 2 * Rc * L, 2 * 2.8724 * L))
    sys.stdout.flush()
