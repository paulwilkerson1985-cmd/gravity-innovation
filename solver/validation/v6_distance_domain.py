import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V6: distance law vs chamber size and vs linearised theory (h=0.02).
 * nonlinear force on test sphere, chambers R=L_half = 5 (benchmark 1 m), 6.5, 8
 * linearised theory (delta=1-phi obeys lap(delta)=2 delta, delta=1 on bodies, quadratic stress tensor) in the same grid
 * asymptotic two-body formula F = 4 pi Q1 Q2 (1+sqrt2 D) e^{-sqrt2 D}/D^2 with exact nonlinear / linear charges."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
import scipy.sparse as sp, scipy.sparse.linalg as spla
from ref_sphere_ode import sphere_profile, linear_Q, F_asym
a1, a2, h = 0.3, 0.6, float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
Q1 = sphere_profile(a1)[1]; Q2 = sphere_profile(a2)[1]

def solve_linear(g):
    Lap = g.laplacian(); N = g.Nr * g.Nz
    fixed = g.fixed.ravel(); fi = np.where(~fixed)[0]
    # bodies: delta=1 ; chamber walls: delta=1 too (phi=0 there) -> same Dirichlet value on all fixed nodes
    dfix = np.ones(N)
    A = Lap[fi][:, fi] - 2 * sp.identity(len(fi))
    rhs = -(Lap[fi][:, np.where(fixed)[0]] @ dfix[fixed])
    d = dfix.copy(); d[fi] = spla.spsolve(A.tocsc(), rhs)
    return d.reshape(g.Nr, g.Nz)

def force_z_lin(g, d, rho_s, z_lo, z_hi):
    pr = np.gradient(d, h, axis=0); pz = np.gradient(d, h, axis=1)
    Tzz = 0.5 * (pz**2 - pr**2) - d**2          # V_lin = -1/4 + delta^2 (constant irrelevant)
    Tzr = pz * pr
    i_s = int(round(rho_s / h)); j_lo = int(round((z_lo - g.z[0]) / h)); j_hi = int(round((z_hi - g.z[0]) / h))
    rr = g.r[:i_s + 1]
    top = np.trapezoid(Tzz[:i_s + 1, j_hi] * 2 * np.pi * rr, rr); bot = np.trapezoid(Tzz[:i_s + 1, j_lo] * 2 * np.pi * rr, rr)
    side = np.trapezoid(Tzr[i_s, j_lo:j_hi + 1] * 2 * np.pi * g.r[i_s], g.z[j_lo:j_hi + 1])
    return -(top - bot + side)

res = {}
for C in [5.0, 6.5, 8.0]:
    for D in [1.4, 2.0, 3.0, 4.0]:
        t = time.time()
        g = Grid(C, C, h); g.sphere(0, a1); g.sphere(-D, a2)
        phi, r = solve(g)
        F = force_z(g, phi, a1 + 0.08, -a1 - 0.08, a1 + 0.08)
        dl = solve_linear(g)
        Fl = force_z_lin(g, dl, a1 + 0.08, -a1 - 0.08, a1 + 0.08)
        res[(C, D)] = (F, Fl)
        print('chamber %.1f D=%.1f  F_nonlin=%.5f  F_lin=%.5f | F_asym(nonlin Q)=%.5f  F_point(lin Q)=%.5f  t=%.0fs' % (
            C, D, -F, -Fl, F_asym(D, Q1, Q2), F_asym(D, linear_Q(a1), linear_Q(a2)), time.time() - t))
        sys.stdout.flush()
    print('  chamber %.1f ratios F(1.4)/F(3.0): nonlinear %.2f, linear %.2f, point-Yukawa %.2f ; F(1.4)/F(2.0): nonlinear %.2f' % (
        C, res[(C, 1.4)][0] / res[(C, 3.0)][0], res[(C, 1.4)][1] / res[(C, 3.0)][1], F_asym(1.4, 1, 1) / F_asym(3.0, 1, 1), res[(C, 1.4)][0] / res[(C, 2.0)][0]))
