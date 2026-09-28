import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V3: condensation threshold.
(a) empty cylinder (radius R, length 2L): discrete lowest eigenvalue of -Lap (Dirichlet) vs (2.405/R)^2+(pi/2L)^2;
    field condenses iff lambda_min < 1 (units mu^2).
(b) nonlinear onset for R = L_half (cylinder radius R, full length 2R): phi_max^2 -> 0 at R_c = sqrt(2.405^2+(pi/2)^2)=2.8725.
(c) same with the benchmark bodies inside (test sphere a=0.3 at z=0, source a=0.6 at z=-1.4): onset from eigenvalue, 3 grids."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
import scipy.sparse.linalg as spla
from scipy.optimize import brentq
j01 = 2.404825557695773

def lam_min(g):
    Lap = g.laplacian(); fi = np.where(~g.fixed.ravel())[0]
    A = -Lap[fi][:, fi].tocsc()
    vals = spla.eigs(A, k=1, sigma=0.0, which='LM', return_eigenvectors=False)
    return float(np.real(vals[0]))

print('--- (a) empty cylinder eigenvalue')
for (R, Lh) in [(2.8725, 2.8725), (4.0, 1.5), (3.0, 5.0)]:
    out = []
    for h in [0.04, 0.02, 0.01]:
        g = Grid(R, Lh, h); Re = (g.Nr - 1) * h; Le = (g.Nz - 1) * h   # grid rounds R, 2L to multiples of h
        ex = (j01 / Re)**2 + (np.pi / Le)**2
        out.append('h=%.2f: %.5f (exact %.5f for R=%.3f,2L=%.3f)' % (h, lam_min(g), ex, Re, Le))
    print(' R=%.4f 2L=%.3f  ' % (R, 2 * Lh) + ' | '.join(out))

print('--- (b) nonlinear onset, empty cylinder R = L_half (full length 2R); exact R_c=%.4f' % np.hypot(j01, np.pi / 2))
h = 0.02
Rs, p2 = [], []
for R in [2.80, 2.86, 2.88, 2.90, 2.94, 3.00, 3.10]:
    g = Grid(R, R, h); phi, res = solve(g)
    print('  R=%.2f  phi_max=%.5f  res=%.0e' % (R, phi.max(), res))
    if phi.max() > 1e-6: Rs.append(R); p2.append(phi.max()**2)
c = np.polyfit(Rs[:3], p2[:3], 1)
print('  linear extrapolation of phi_max^2 -> 0 : R_c(num)=%.4f   (exact %.4f)' % (-c[1] / c[0], np.hypot(j01, np.pi / 2)))

print('--- (c) chamber threshold with benchmark bodies inside (R = L_half)')
for h in [0.04, 0.02, 0.01]:
    def f(R):
        # use exact multiples of h for R so that the geometry is well defined
        g = Grid(R, R, h); g.sphere(0, 0.3); g.sphere(-1.4, 0.6); return lam_min(g) - 1.0
    Rgrid = np.round(np.arange(3.0, 3.61, 0.1) / h) * h
    vals = [f(R) for R in Rgrid]
    i = np.where(np.diff(np.sign(vals)))[0][0]
    Rc_lin = Rgrid[i] - vals[i] * (Rgrid[i + 1] - Rgrid[i]) / (vals[i + 1] - vals[i])
    print('  h=%.2f lambda_min-1 at R=%s : %s  => onset R_c ~ %.4f' % (h, np.round(Rgrid, 2), np.round(vals, 4), Rc_lin))
    sys.stdout.flush()
