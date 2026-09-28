import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V1b: far-field (linearised) decay of a single pinned sphere. Large chamber (R=L=10/mu),
empty-chamber background subtracted: delta_s = phi_empty - phi_sphere.
Expect delta_s -> Q exp(-sqrt2 r)/r with Q from the exact ODE."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
from ref_sphere_ode import sphere_profile, m
Rc = 10.0
for h in [0.04, 0.02]:
    g0 = Grid(Rc, Rc, h); ph0, _ = solve(g0)
    j0 = int(round(Rc / h))
    print('h=%.2f empty chamber phi(centre)=%.6f' % (h, ph0[0, j0]))
    for a in [0.3, 0.6]:
        sol, Q = sphere_profile(a)
        g = Grid(Rc, Rc, h); g.sphere(0, a); ph, res = solve(g)
        for name, x, ds in [('radial', g.r, ph0[:, j0] - ph[:, j0]), ('axial', g.z[j0:], ph0[0, j0:] - ph[0, j0:])]:
            sel = (x > 2.0) & (x < 5.0)
            slope, _ = np.polyfit(x[sel], np.log(ds[sel] * x[sel]), 1)
            Qn = np.median(ds[sel] * x[sel] * np.exp(m * x[sel]))
            ex = 1 - sol.sol(x[sel])[0]
            print('  a=%.1f %-6s tail r in[2,5]: slope=%.4f (exact %.4f, err %.2f%%)  Q=%.4f (ODE %.4f, err %.1f%%)  max|delta_num/delta_exact-1|=%.3f' % (
                a, name, slope, -m, 100 * (slope / -m - 1), Qn, Q, 100 * (Qn / Q - 1), np.max(np.abs(ds[sel] / ex - 1))))
        sys.stdout.flush()
