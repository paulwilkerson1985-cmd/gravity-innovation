import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V10: finite-plate claim (disks radius 3, thickness 0.3, chamber R=7, L_half=8): force on upper plate vs gap,
two resolutions (geometry is grid-aligned, no staircase).  Claimed: 16.7 (gap 0.16) -> 11.6 (gap 1.6), V0*A=7.07."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
for h in [0.04, 0.02]:
    for gap in [0.16, 1.6]:
        t = time.time()
        g = Grid(7, 8, h); z0 = gap / 2; tol = 1e-7
        g.fixed |= (g.R <= 3.0 + tol) & (g.Z >= z0 - tol) & (g.Z <= z0 + 0.3 + tol)
        g.fixed |= (g.R <= 3.0 + tol) & (g.Z <= -z0 + tol) & (g.Z >= -z0 - 0.3 - tol)
        phi, res = solve(g)
        F1 = force_z(g, phi, 3.12, z0 - 0.08 if gap > 0.2 else z0 - 0.04, z0 + 0.38)
        F2 = force_z(g, phi, 3.4, z0 - 0.08 if gap > 0.2 else z0 - 0.04, z0 + 0.7)
        print('h=%.2f gap=%.2f  F_upper = %.3f / %.3f (two surfaces)   V0*A = %.3f  res=%.0e t=%.0fs' % (h, gap, -F1, -F2, 0.25 * np.pi * 9, res, time.time() - t))
        sys.stdout.flush()
