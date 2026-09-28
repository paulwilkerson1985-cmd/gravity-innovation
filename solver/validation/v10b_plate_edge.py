import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V10b: analytic cross-check of the finite-plate force at small gap: F ~ V0*A + sigma*P, where sigma = sqrt2/3 (units
mu v^2) is the tension of a pinned surface (half-kink energy) exposed at the rim, P = 2 pi R. Plate thickness 0.3, gap 0.16."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
h, gap, sig = 0.04, 0.16, np.sqrt(2) / 3
for Rp in [2.0, 3.0, 4.0]:
    Rc = Rp + 4; g = Grid(Rc, 8, h); z0 = gap / 2; tol = 1e-7
    g.fixed |= (g.R <= Rp + tol) & (g.Z >= z0 - tol) & (g.Z <= z0 + 0.3 + tol)
    g.fixed |= (g.R <= Rp + tol) & (g.Z <= -z0 + tol) & (g.Z >= -z0 - 0.3 - tol)
    phi, res = solve(g)
    F = -force_z(g, phi, Rp + 0.12, z0 - 0.04, z0 + 0.38)
    est = 0.25 * np.pi * Rp**2 + sig * 2 * np.pi * Rp
    print('plate R=%.0f gap=%.2f: F=%.3f   V0*A=%.3f   V0*A+sigma*P=%.3f  (ratio %.3f)' % (Rp, gap, F, 0.25 * np.pi * Rp**2, est, F / est))
