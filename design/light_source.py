import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Light screened source: scalar force on the test sphere (a1 = 0.3) from a thin Cu foil DISK (radius W, Robin kappa or
Dirichlet) at z = -zf (gap zf - a1 from the surface), no sphere source -- versus its Newtonian pull.  The screened-body
force is set by surface geometry and saturates once kappa/mu >~ 10, while gravity keeps growing with areal density:
Newtonian background falls ~1e4x relative to the 8.1 kg sphere.  Units v^2; 1 m chamber; h = 0.05."""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z
import units as U
h = 0.05; R = 5.0; a1 = 0.3
G = 6.674e-11
def F_test(g, phi): return -force_z(g, phi, a1 + 0.08, -a1 - 0.08, a1 + 0.08)
def disk_force(W, zf, kappa):
    g = RGrid(R, R, h); g.sphere(0.0, a1)
    if kappa is None:
        tol = 1e-9; g.fixed |= (np.abs(g.Z + zf) <= tol) & (g.R <= W + tol)
    else:
        g.zsheet(-zf, 0.0, W, kappa=kappa)
    phi, res = solve(g); return F_test(g, phi), phi.max(), res
def newton_disk(sigma, W_m, z_m, m_test):
    return 2 * np.pi * G * sigma * m_test * (1 - z_m / np.sqrt(z_m**2 + W_m**2))
out = {}
print('sphere-source reference: S = 1.2005 v^2 (8.10 kg Cu at 14 cm); F_N on 1.01 kg = 2.80e-8 N, on 0.20 kg hollow = 5.5e-9 N')
for W, zf in [(0.5, 0.7), (1.0, 0.7), (1.0, 1.0), (2.0, 1.0)]:
    print('\n--- Cu foil disk radius W=%.1f/mu (%.0f cm), centre-to-foil %.1f/mu (gap %.0f cm at 1/mu=10 cm) ---' % (W, 10 * W, zf, 10 * (zf - a1)))
    for kappa in [1, 3, 10, 30, 100, 300, None]:
        F, pm, res = disk_force(W, zf, kappa)
        row = dict(W=W, zf=zf, kappa=kappa, F=F)
        line = 'kappa/mu=%-5s F_scalar=%.4f v^2' % ('Dir' if kappa is None else '%g' % kappa, F)
        if kappa is not None:
            for M in [6, 15, 36]:
                t = kappa * U.t_star_m(8.96, M, 10)             # thin-sheet thickness for this kappa at 1/mu=10 cm
                sigma = 8960 * t; mass = sigma * np.pi * (0.1 * W)**2
                FN = newton_disk(sigma, 0.1 * W, 0.1 * zf, 0.20)
                row['M%d' % M] = dict(t_um=t * 1e6, mass_g=mass * 1e3, FN_hollow=FN, ratio_T2=F * 2.4e-13 / FN)
                line += ' | M=%2d TeV: t=%7.1f um m=%6.1f g F_N(0.2 kg)=%.1e N  F_sc/F_N@T2=%.2g' % (M, t * 1e6, mass * 1e3, FN, F * 2.4e-13 / FN)
        print(line); sys.stdout.flush()
        out['W%g_z%g_k%s' % (W, zf, kappa)] = row
json.dump(out, open('light_source.json', 'w'), indent=1)
print('\nsolid 3 cm Cu sphere on the same 0.2 kg hollow test body at 14 cm: F_N = %.1e N ; scalar/Newton at Tier 2 = %.1e' % (
    G * 8.10 * 0.2 / 0.14**2, 1.2005 * 2.4e-13 / (G * 8.10 * 0.2 / 0.14**2)))
