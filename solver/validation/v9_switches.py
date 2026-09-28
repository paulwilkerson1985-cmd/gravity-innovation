import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V9: switch sanity checks.
(a) liner / chamber size: force vs chamber size R (=L_half) around the onset (cut-cell, h=0.02)
(b) gas: linear onset g_c = 1 - lambda_min(1 m chamber with bodies)   [force vanishes at rho_gas = g_c rho_crit]
(c) foil pair (disks radius W at z=+-D/2) and closed foil can (Rs=0.5, hole on top) with the ORIGINAL staircase
    solver at h=0.04/0.02/0.01, source-dependent residual relative to no-foil force."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver')); sys.path.insert(0, (_GI + '/solver/validation'))
import symm
from symm_sw import GridSW, solve as solve_sw, force_z
import scipy.sparse.linalg as spla
part = sys.argv[1]
a1, a2, D = 0.3, 0.6, 1.4
if part == 'a':
    h = 0.02
    for R in [3.20, 3.30, 3.34, 3.36, 3.40, 3.50, 3.60, 4.00, 4.50, 5.00, 6.00]:
        g = GridSW(R, R, h); g.sphere(0, a1); g.sphere(-D, a2); phi, res = solve_sw(g)
        print('R=L_half=%.2f  phi_max=%.4f  F=%.5f  res=%.0e' % (R, phi.max(), -force_z(g, phi, a1 + .08, -a1 - .08, a1 + .08), res)); sys.stdout.flush()
if part == 'b':
    for h in [0.04, 0.02, 0.01]:
        for bodies in [False, True]:
            g = symm.Grid(5, 5, h)
            if bodies: g.sphere(0, a1); g.sphere(-D, a2)
            Lap = g.laplacian(); fi = np.where(~g.fixed.ravel())[0]
            lam = np.real(spla.eigs(-Lap[fi][:, fi].tocsc(), k=1, sigma=0.0, return_eigenvectors=False)[0])
            print('h=%.2f bodies=%s lambda_min=%.5f  => gas onset g_c = rho_gas/rho_crit = %.4f' % (h, bodies, lam, 1 - lam)); sys.stdout.flush()
    for gm in [0.0, 0.2, 0.4, 0.5, 0.6, 0.65]:
        g = symm.Grid(5, 5, 0.02); g.sphere(0, a1); g.sphere(-D, a2); phi, res = symm.solve(g, gas=gm)
        print('  gas=%.2f F=%.4f phi_max=%.3f' % (gm, -symm.force_z(g, phi, a1 + .08, -a1 - .08, a1 + .08, gas=gm), phi.max())); sys.stdout.flush()
if part == 'c':
    hs = [float(x) for x in sys.argv[2].split(',')]
    for h in hs:
        def run(foilW=None, can=None, source=True):
            g = symm.Grid(5, 5, h); g.sphere(0, a1)
            if source: g.sphere(-D, a2)
            if foilW is not None: g.disk(-D / 2, foilW); g.disk(D / 2, foilW)
            if can is not None:
                Rs, hole = can; g.cyl_shell(Rs, -Rs, Rs); symm.annulus(g, -Rs, 0, Rs); symm.annulus(g, Rs, hole, Rs)
            phi, res = symm.solve(g)
            return symm.force_z(g, phi, a1 + 0.08, -a1 - 0.08, a1 + 0.08)
        F0 = run()
        print('h=%.3f no foil F=%.5f' % (h, F0))
        for W in [0.5, 1.0, 2.0]:
            r = (run(foilW=W) - run(foilW=W, source=False)) / F0
            print('  foil pair W=%.1f  source-dependent residual / no-foil = %.2e' % (W, r)); sys.stdout.flush()
        for hole in [0.1, 0.2]:
            r = (run(can=(0.5, hole)) - run(can=(0.5, hole), source=False)) / F0
            print('  can Rs=0.5 hole=%.2f (%.1f cells)  residual = %.2e' % (hole, hole / h, r)); sys.stdout.flush()
