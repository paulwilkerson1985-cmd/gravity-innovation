import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V2: 1D exact checks with the actual axisymmetric solver.
(a) half-kink at a pinned wall: chamber end wall, Rc=20 (radial wall far away), on-axis profile vs tanh(x/sqrt2)
    and vs the exact two-wall elliptic solution.
(b) Brax-Pitschmann two-mirror system: two full-radius plates (thickness 0.5) with gap d, outer vacuum regions
    of width 6 up to the chamber end walls.  On-axis midplane value phi0(d) and local pressure from force_z on a
    pillbox of radius 2 around the axis vs exact P(d).  NB: with a Dirichlet radial wall at Rc the gap is a closed
    cylinder, whose linear onset is d_c(Rc) = pi/sqrt(1-(2.405/Rc)^2) (=3.1646 for Rc=20), not pi."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
import ref_1d_exact as ex

Rc = 20.0
print('--- (a) half-kink / two-wall profile, chamber Rc=20, walls at z=+-L')
for (Lh, h) in [(5.0, 0.05), (5.0, 0.025), (2.0, 0.025)]:
    g = Grid(Rc, Lh, h); phi, res = solve(g)
    x = g.z + Lh; p = phi[0, :]
    sel = x <= Lh
    e_tanh = np.max(np.abs(p[sel] - np.tanh(x[sel] / np.sqrt(2))))
    e_ex = np.max(np.abs(p - ex.profile(x, 2 * Lh)))
    print(' d=%.1f h=%.3f  max|phi-tanh| (half domain)=%.2e   max|phi-exact two-wall|=%.2e   phi_mid=%.6f exact=%.6f' % (
        2 * Lh, h, e_tanh, e_ex, p[len(p) // 2], ex.phi0_of_d(2 * Lh)))
    sys.stdout.flush()

print('--- (b) two plates: phi0(d) and pressure (units mu^2 v^2; V0=0.25)')
t_pl, lout, rho = 0.5, 6.0, 2.0
for h in [0.05, 0.025]:
    for d in [2.0, 3.0, 3.5, 4.0, 5.0, 6.0, 8.0]:
        t0 = time.time()
        Lh = d / 2 + t_pl + lout
        g = Grid(Rc, Lh, h)
        tol = 1e-7
        g.fixed |= (g.Z >= d / 2 - tol) & (g.Z <= d / 2 + t_pl + tol)
        g.fixed |= (g.Z <= -d / 2 + tol) & (g.Z >= -d / 2 - t_pl - tol)
        phi, res = solve(g)
        j0 = int(round(Lh / h))
        F = force_z(g, phi, rho, d / 2 - 0.2 * min(d / 2, 1), d / 2 + t_pl + 0.3)
        Pnum = -F / (np.pi * rho**2)
        Pex = ex.pressure_plate(d, d_out=lout)
        print(' h=%.3f d=%.2f  phi0 num=%.5f exact(1D)=%.5f | P num=%.5f exact=%.5f  rel.err=%.1e  (P/V0=%.3f)  t=%.1fs' % (
            h, d, phi[0, j0], ex.phi0_of_d(d), Pnum, Pex, Pnum / Pex - 1, Pnum / 0.25, time.time() - t0))
        sys.stdout.flush()
