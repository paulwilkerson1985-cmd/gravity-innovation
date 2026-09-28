import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Axisymmetric proxy model of the HUST-09 vacuum chamber for the symmetron (uses ../solver/symm.py, staircase bodies).
Geometry in mm, z = 0 at the top surface of the Zerodur disk.  Everything pinned (Dirichlet phi = 0):
  chamber wall r = 225 mm, floor z = -zd, lid z = 500 - zd; pedestal+turntable+disk r <= Rped, z <= 0;
  shield tube r in [47.0, 47.7] mm, z in [gap, gap + 90]; source spheres -> torus (R = 78.58, a = 28.576, zc = 34.2);
  pendulum proxy: 'cyl' = cylinder of equal volume (r = 18.70 mm) z in [21.1, 47.4]; 'disk' = full 45.7 mm radius slab;
  'none'; clamp (r 6.02, z 47.4-57.5) + ferrule (r 3.05, z 57.5-72.6) + mirror (r 2.3, z 72.6-76.7).
Solve in units of 1/mu: the Grid is built with lengths multiplied by mu (mm^-1)."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver'))
import symm
import scipy.sparse.linalg as spla

RCH, HCH = 225.0, 500.0

def build(h_mm, mu_mm=1.0, zd=200.0, Rped=125.0, gap=2.0, shield=True, torus=True, pend='cyl', hardware=True,
          ped=True):
    """returns Grid in units where lengths are multiplied by mu_mm (mu in 1/mm). mu_mm=1 -> Grid in mm."""
    s = mu_mm
    L = HCH / 2
    g = symm.Grid(RCH * s, L * s, h_mm * s)
    zoff = -(L - zd)          # z_grid(mm) = z_phys + zoff  -> z_phys = z_grid - zoff
    R = g.R / s; Z = g.Z / s - zoff
    fx = g.fixed
    if ped:
        fx |= (R <= Rped + 1e-9) & (Z <= 1e-9)
    if shield:
        fx |= (R >= 47.0 - 1e-9) & (R <= 47.7 + h_mm * 0.51) & (Z >= gap - 1e-9) & (Z <= gap + 90 + 1e-9)
    if torus:
        fx |= (R - 78.58)**2 + (Z - 34.2)**2 <= 28.576**2
    if pend == 'cyl':
        fx |= (R <= 18.70) & (Z >= 21.1) & (Z <= 47.4)
    elif pend == 'disk':
        fx |= (R <= 45.73) & (Z >= 21.1) & (Z <= 47.4)
    if hardware and pend != 'none':
        fx |= (R <= 6.02) & (Z >= 47.4) & (Z <= 57.5)
        fx |= (R <= 3.05) & (Z >= 57.5) & (Z <= 72.6)
        fx |= (R <= 2.3) & (Z >= 72.6) & (Z <= 76.7)
    g.fixed = fx
    g.zoff = zoff; g.s = s
    g.Rmm = R; g.Zmm = Z
    return g

def lam_min(g):
    Lap = g.laplacian(); fi = np.where(~g.fixed.ravel())[0]
    A = -Lap[fi][:, fi].tocsc()
    v = spla.eigs(A, k=1, sigma=0.0, which='LM', return_eigenvectors=False)
    return float(np.real(v[0]))

def interp(g, phi, r_mm, z_mm):
    """bilinear interpolation of phi at physical (r, z) in mm"""
    h = g.h / g.s
    ri = r_mm / h; zi = (z_mm + g.zoff + HCH / 2) / h
    i = int(np.floor(ri)); j = int(np.floor(zi)); fr = ri - i; fz = zi - j
    return ((1 - fr) * (1 - fz) * phi[i, j] + fr * (1 - fz) * phi[i + 1, j] + (1 - fr) * fz * phi[i, j + 1]
            + fr * fz * phi[i + 1, j + 1])
