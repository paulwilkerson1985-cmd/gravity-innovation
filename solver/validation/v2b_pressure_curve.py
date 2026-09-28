import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V2b: Brax-Pitschmann pressure-vs-separation curve with (nearly) semi-infinite outer vacuum (width 12/mu)."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
import ref_1d_exact as ex
Rc, t_pl, lout, rho, h = 20.0, 0.5, 12.0, 2.0, 0.05
dcR = np.pi / np.sqrt(1 - (2.404826 / Rc)**2)
print('Rc=%.0f: closed-cylinder onset d_c(Rc)=%.4f ; 1D (Brax-Pitschmann) d_c=pi=%.4f' % (Rc, dcR, np.pi))
for d in [1.0, 2.0, 3.0, 3.1, 3.2, 3.3, 3.5, 4.0, 4.5, 5.0, 6.0]:
    Lh = d / 2 + t_pl + lout
    g = Grid(Rc, Lh, h); tol = 1e-7
    g.fixed |= (g.Z >= d / 2 - tol) & (g.Z <= d / 2 + t_pl + tol)
    g.fixed |= (g.Z <= -d / 2 + tol) & (g.Z >= -d / 2 - t_pl - tol)
    phi, res = solve(g)
    j0 = int(round(Lh / h))
    F = force_z(g, phi, rho, d / 2 - 0.2 * min(d / 2, 1), d / 2 + t_pl + 0.3)
    Pn = -F / (np.pi * rho**2); Pe = ex.pressure_plate(d, d_out=lout)
    print(' d=%.2f phi0 num=%.4f exact=%.4f | P/V0 num=%.4f exact=%.4f (abs err %.1e)' % (d, phi[0, j0], ex.phi0_of_d(d), Pn / .25, Pe / .25, (Pn - Pe) / .25))
    sys.stdout.flush()
