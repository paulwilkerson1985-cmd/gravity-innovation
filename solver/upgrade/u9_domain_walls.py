import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U9: domain walls, metastable states and initial-condition sensitivity (benchmark: R=L_half=5, bodies as usual).
Each initial state is relaxed by pseudo-transient continuation (implicit gradient flow -> ends in a *stable* state,
not a saddle); stability is confirmed with the lowest eigenvalue of the second variation (>0 = local minimum).
ICs: +1 everywhere (reference); planar wall sign(z - z_w) for several z_w (through source equator, test equator,
the gap, empty regions); a phi=-1 bubble around the test mass; small random noise.
usage: python3 u9_domain_walls.py <h> [R]"""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade')); sys.path.insert(0, (_GI + '/solver/validation'))
from symm_robin import RGrid, solve, force_z, hessian_min
from symm_sw import energy_consistent

h = float(sys.argv[1]); R = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
a1, a2, D = 0.3, 0.6, 1.4


def grid():
    g = RGrid(R, R, h); g.sphere(0, a1); g.sphere(-D, a2); g.laplacian(); return g


def F_of(g, phi):
    return (-force_z(g, phi, a1 + 0.08, -a1 - 0.08, a1 + 0.08), -force_z(g, phi, a2 + 0.08, -D - a2 - 0.08, -D + a2 + 0.08))


g0 = grid()
phi0, _, all0, AF0 = solve(g0, return_all=True)
E0 = energy_consistent(g0, phi0)
Ft0, Fs0 = F_of(g0, phi0)
print('h=%.3f R=%.1f reference (+1 IC): F_test=%.4f F_source=%.4f E=%.4f  lowest Hessian eig=%.4f' % (
    h, R, Ft0, Fs0, E0, hessian_min(all0, AF0, k=2)[0]))
rng = np.random.default_rng(1)
ics = [('wall z_w=-1.40 (source equator)', lambda G: np.sign(G.Z + 1.4) + (G.Z == -1.4)),
       ('wall z_w=-0.70 (gap)', lambda G: np.sign(G.Z + 0.7) + (G.Z == -0.7)),
       ('wall z_w= 0.00 (test equator)', lambda G: np.sign(G.Z + 1e-9)),
       ('wall z_w=+2.50 (empty, upper)', lambda G: np.sign(G.Z - 2.5) + (G.Z == 2.5)),
       ('wall z_w=-3.00 (empty, lower)', lambda G: np.sign(G.Z + 3.0) + (G.Z == -3.0)),
       ('cylindrical wall r_w=2.5', lambda G: np.sign(2.5 - G.R) + (G.R == 2.5)),
       ('phi=-1 bubble r<0.8 around test', lambda G: np.where(G.R**2 + G.Z**2 < 0.64, -1.0, 1.0)),
       ('random noise +-0.01', lambda G: 0.01 * rng.standard_normal(G.R.shape)),
       ('uniform small +0.001', lambda G: 0.001 * np.ones_like(G.R))]
for name, f in ics:
    t0 = time.time()
    g = grid()
    ic = f(g); kicks = 0
    for attempt in range(4):
        phi, res, allv, AF = solve(g, phi0=ic, ptc=True, dt0=0.02, return_all=True)
        ev, vv = hessian_min(allv, AF, k=2, vec=True); hmin = ev[0]
        if hmin > 0:
            break
        # saddle: push along the unstable direction and relax again
        kicks += 1
        full = np.zeros(allv.shape); full[AF[1]] = vv[:, 0] / np.max(np.abs(vv[:, 0]))
        ic = phi + 0.3 * full[:g.Nr * g.Nz].reshape(g.Nr, g.Nz)
    E = energy_consistent(g, phi)
    Ft, Fs = F_of(g, phi)
    wall = (phi.min() < -0.05) and (phi.max() > 0.05)
    sgn = '+' if phi.max() > abs(phi.min()) else '-'
    name = name + (' [%d saddle kicks]' % kicks if kicks else '')
    print('%-34s -> %s  E-E0=%+.4f  F_test=%+.4f  F_source=%+.4f  min/max phi=%+.3f/%+.3f  Hess_min=%+.4f  res=%.0e (%.0fs)' % (
        name, ('WALL (metastable)' if (wall and hmin > 0) else ('WALL (saddle?)' if wall else 'ground state %s' % sgn)),
        E - E0, Ft, Fs, phi.min(), phi.max(), hmin, res, time.time() - t0))
    sys.stdout.flush()
