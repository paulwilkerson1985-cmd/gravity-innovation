import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U9b: metastable domain walls vs chamber size (R = L_half), benchmark bodies, IC = planar wall at z_w; relaxed by
pseudo-transient continuation (+ saddle kicks); reports the wall position (sign change of phi on the axis and at
r = R/2), stability (lowest Hessian eigenvalue), energy excess and forces.  usage: python3 u9b_wall_scan.py <h>"""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade')); sys.path.insert(0, (_GI + '/solver/validation'))
from symm_robin import RGrid, solve, force_z, hessian_min
from symm_sw import energy_consistent
h = float(sys.argv[1]); a1, a2, D = 0.3, 0.6, 1.4


def relax(g, ic):
    for attempt in range(4):
        phi, res, allv, AF = solve(g, phi0=ic, ptc=True, dt0=0.02, return_all=True)
        ev, vv = hessian_min(allv, AF, k=2, vec=True)
        if ev[0] > 0:
            return phi, ev[0], attempt
        full = np.zeros(allv.shape); full[AF[1]] = vv[:, 0] / np.max(np.abs(vv[:, 0]))
        ic = phi + 0.3 * full[:g.Nr * g.Nz].reshape(g.Nr, g.Nz)
    return phi, ev[0], attempt


def crossing(z, p):
    s = np.where(np.diff(np.sign(p[np.abs(p) > 1e-3] if False else p)) != 0)[0]
    s = [i for i in s if abs(p[i]) > 1e-4 or abs(p[i + 1]) > 1e-4]
    return ', '.join('%.2f' % (z[i] - p[i] * (z[i + 1] - z[i]) / (p[i + 1] - p[i])) for i in s) if s else '-'


for R, bodies, zw in [(5, 'both', -0.7), (6, 'both', -0.7), (6.5, 'both', -0.7), (7, 'both', -0.7), (8, 'both', -0.7),
                      (8, 'both', 1.0), (8, 'test only', -0.5), (8, 'none', -0.7), (10, 'both', -0.7), (10, 'both', 1.5)]:
    t0 = time.time()
    def mk():
        g = RGrid(R, R, h)
        if bodies in ('both', 'test only'):
            g.sphere(0, a1)
        if bodies == 'both':
            g.sphere(-D, a2)
        g.laplacian(); return g
    g = mk(); p0, _ = solve(g); E0 = energy_consistent(g, p0)
    Ft0 = -force_z(g, p0, a1 + .08, -a1 - .08, a1 + .08) if bodies != 'none' else 0
    g = mk(); ic = np.sign(g.Z - zw) + (g.Z == zw)
    phi, hmin, kicks = relax(g, ic)
    wall = phi.min() < -0.05 and phi.max() > 0.05
    Ft = -force_z(g, phi, a1 + .08, -a1 - .08, a1 + .08) if bodies != 'none' else 0
    Fs = -force_z(g, phi, a2 + .08, -D - a2 - .08, -D + a2 + .08) if bodies == 'both' else 0
    ih = int(round(R / 2 / h))
    print('R=%-4g bodies=%-9s IC z_w=%+.1f -> %-18s wall z(axis)=%s z(r=R/2)=%s  E-E0=%+.2f  F_test=%.4f (ground %.4f)  F_src=%+.4f  Hess_min=%+.4f kicks=%d (%.0fs)' % (
        R, bodies, zw, ('METASTABLE WALL' if (wall and hmin > 0) else ('saddle' if wall else 'single domain')),
        crossing(g.z, phi[0]) if wall else '-', crossing(g.z, phi[ih]) if wall else '-', energy_consistent(g, phi) - E0, Ft, Ft0, Fs, hmin, kicks, time.time() - t0))
    sys.stdout.flush()
