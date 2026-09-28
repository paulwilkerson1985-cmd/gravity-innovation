import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V1: single pinned sphere (a=0.3 and a=0.6) at the centre of a large chamber vs the exact
radial ODE (ref_sphere_ode.py).  Checks the axisymmetric Laplacian (incl. axis), Newton solve,
staircase error, and the far-field Yukawa decay with mass sqrt(2) mu."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
from ref_sphere_ode import sphere_profile, m
from scipy.interpolate import interp1d

Rc = 7.0
for a in [0.3, 0.6]:
    sol, Q = sphere_profile(a)
    print('=== a=%.1f  exact ODE: Q=%.5f' % (a, Q))
    for h in [0.04, 0.02, 0.01]:
        t = time.time()
        g = Grid(Rc, Rc, h); g.sphere(0, a)
        phi, res = solve(g)
        j0 = int(round(Rc / h))
        # radial line at z=0 and axial line at r=0
        rline = g.r; prof_r = phi[:, j0]
        zline = g.z[j0:] ; prof_z = phi[0, j0:]
        errs = []
        for dist in [0.1, 0.3, 0.6, 1.0, 2.0, 3.0]:
            rr = a + dist
            ex = sol.sol(rr)[0]
            num_r = np.interp(rr, rline, prof_r)
            num_z = np.interp(rr, zline, prof_z)
            errs.append((dist, ex, num_r, num_z))
        # tail fit: log(delta*r) vs r on the radial line, r in [2.5, 4.5]
        sel = (rline > 2.5) & (rline < 4.5)
        dl = 1 - prof_r[sel]
        slope, icpt = np.polyfit(rline[sel], np.log(dl * rline[sel]), 1)
        Qnum = np.median(dl * rline[sel] * np.exp(m * rline[sel]))
        print(' h=%.3f res=%.0e t=%.1fs  tail slope=%.4f (exact -sqrt2=%.4f)  Q_num=%.4f (exact %.4f, rel err %.1f%%)' % (
            h, res, time.time() - t, slope, -m, Qnum, Q, 100 * (Qnum / Q - 1)))
        for dist, ex, nr, nz in errs:
            print('    r-a=%.1f exact=%.5f  num(radial)=%.5f  num(axial)=%.5f  err=%.1e/%.1e' % (dist, ex, nr, nz, nr - ex, nz - ex))
        sys.stdout.flush()
