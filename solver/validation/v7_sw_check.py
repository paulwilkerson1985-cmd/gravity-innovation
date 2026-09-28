import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V7: cut-cell (Shortley-Weller) variant: (a) single-sphere charge Q vs exact ODE; (b) benchmark force convergence."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/validation'))
from symm_sw import GridSW, solve, force_z
from ref_sphere_ode import sphere_profile, m
import symm
mode = sys.argv[1] if len(sys.argv) > 1 else 'a'
if mode == 'a':
    Rc = 10.0
    for h in [0.04, 0.02]:
        g0 = symm.Grid(Rc, Rc, h); ph0, _ = symm.solve(g0); j0 = int(round(Rc / h))
        for a in [0.3, 0.6]:
            sol, Q = sphere_profile(a)
            g = GridSW(Rc, Rc, h); g.sphere(0, a); ph, res = solve(g)
            x = g.r; ds = ph0[:, j0] - ph[:, j0]; sel = (x > 2) & (x < 5)
            Qn = np.median(ds[sel] * x[sel] * np.exp(m * x[sel]))
            near = [(dd, ph[int(round((a + dd) / h)), j0] if abs((a + dd) / h - round((a + dd) / h)) < 1e-6 else np.nan, sol.sol(a + dd)[0]) for dd in (0.1, 0.2, 0.4)]
            print('h=%.2f a=%.1f  cut-cell Q=%.4f (ODE %.4f, err %+.2f%%)  near-field phi(num/exact): %s  res=%.0e' % (
                h, a, Qn, Q, 100 * (Qn / Q - 1), ' '.join('%.4f/%.4f' % (u, v) for _, u, v in near), res))
            sys.stdout.flush()
else:
    hs = [float(x) for x in sys.argv[2].split(',')]
    for h in hs:
        for D in [1.4, 2.0, 3.0]:
            t = time.time()
            g = GridSW(5, 5, h); g.sphere(0, 0.3); g.sphere(-D, 0.6); phi, res = solve(g)
            Ft = [force_z(g, phi, 0.3 + mm, -0.3 - mm, 0.3 + mm) for mm in (0.08, 0.2)]
            Fs = force_z(g, phi, 0.7, -D - 0.7, -D + 0.7)
            print('cut-cell h=%.4f D=%.1f F_test=%.5f / %.5f  F_source=%+.5f res=%.0e t=%.0fs' % (h, D, Ft[0], Ft[1], Fs, res, time.time() - t))
            sys.stdout.flush()
