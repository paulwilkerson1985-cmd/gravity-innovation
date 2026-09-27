"""Validation-only variant of symm.solve with a Shortley-Weller (cut-cell) treatment of spherical Dirichlet bodies:
free nodes next to a sphere use the exact distance to the sphere surface in their 3-point stencils, so the sphere
radius is represented exactly (2nd-order) instead of by the staircase of symm.py (1st-order, radius effectively
~a - O(h)).  Away from spheres the stencil is identical to symm.Grid.laplacian().  Chamber walls are grid-aligned.
Only spheres centred on the axis are supported.  Force evaluation reuses symm.force_z."""
import os, sys
import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from symm import Grid, force_z

class GridSW(Grid):
    def __init__(self, Rc, L, h, theta_min=0.02):
        super().__init__(Rc, L, h)
        self.spheres = []; self.theta_min = theta_min

    def sphere(self, zc, a):
        self.spheres.append((zc, a)); super().sphere(zc, a)

    def _finalize(self):
        # nodes extremely close to a surface (theta < theta_min in some direction) are pinned (phi~0 there anyway)
        h = self.h
        for zc, a in self.spheres:
            d = np.sqrt(self.R**2 + (self.Z - zc)**2) - a
            self.fixed |= (d > 0) & (d < self.theta_min * h * 0.5)

    def _theta(self, i, j, di, dj):
        """fraction of h to the sphere surface from free node (i,j) towards neighbour (i+di,j+dj) if that neighbour
        lies inside a sphere; else 1."""
        r0, z0 = self.r[i], self.z[j]
        r1, z1 = r0 + di * self.h, z0 + dj * self.h
        for zc, a in self.spheres:
            if r1**2 + (z1 - zc)**2 <= a**2:
                if dj != 0:
                    s = np.sqrt(max(a**2 - r0**2, 0.0))
                    zs = zc - s if dj > 0 else zc + s
                    return abs(zs - z0) / self.h
                else:
                    s = np.sqrt(max(a**2 - (z0 - zc)**2, 0.0))
                    return abs(s - r0) / self.h
        return 1.0

    def laplacian(self):
        self._finalize()
        Nr, Nz, h = self.Nr, self.Nz, self.h
        L = super().laplacian().tolil()
        # patch rows of free nodes that have a sphere-fixed neighbour
        fx = self.fixed
        inside = np.zeros_like(fx)
        for zc, a in self.spheres:
            inside |= self.R**2 + (self.Z - zc)**2 <= a**2
        idx = np.arange(Nr * Nz).reshape(Nr, Nz)
        cand = np.zeros_like(fx)
        cand[:, 1:] |= inside[:, :-1]; cand[:, :-1] |= inside[:, 1:]
        cand[1:, :] |= inside[:-1, :]; cand[:-1, :] |= inside[1:, :]
        cand &= ~fx
        for i, j in zip(*np.where(cand)):
            row = idx[i, j]
            tzm = self._theta(i, j, 0, -1); tzp = self._theta(i, j, 0, 1)
            coef = {}
            def add(k, v): coef[k] = coef.get(k, 0.0) + v
            # z part
            add(idx[i, j - 1], 2 / (tzm * (tzm + tzp) * h**2)); add(idx[i, j + 1], 2 / (tzp * (tzm + tzp) * h**2))
            add(row, -2 / (tzm * tzp * h**2))
            if i == 0:
                add(idx[1, j], 4 / h**2); add(row, -4 / h**2)
            else:
                trm = self._theta(i, j, -1, 0); trp = self._theta(i, j, 1, 0); r = self.r[i]
                add(idx[i - 1, j], 2 / (trm * (trm + trp) * h**2) - trp / (trm * (trm + trp) * h) / r)
                add(idx[i + 1, j], 2 / (trp * (trm + trp) * h**2) + trm / (trp * (trm + trp) * h) / r)
                add(row, -2 / (trm * trp * h**2) + (trp - trm) / (trm * trp * h) / r)
            L.rows[row] = []; L.data[row] = []
            for k, v in coef.items():
                L[row, k] = v   # entries for fixed neighbours are dropped later (Dirichlet value 0)
        return L.tocsr()

def solve(g, gas=0.0, tol=1e-10, maxit=40):
    Lap = g.laplacian()
    N = g.Nr * g.Nz; fi = np.where(~g.fixed.ravel())[0]
    Lff = Lap[fi][:, fi].tocsc()
    phi = np.zeros(N); phi[fi] = 1.0; m2 = 1.0 - gas
    for it in range(maxit):
        pf = phi[fi]; F = Lff @ pf + m2 * pf - pf**3; res = np.max(np.abs(F))
        if res < tol: break
        phi[fi] = pf + spla.spsolve((Lff + sp.diags(m2 - 3 * pf**2)).tocsc(), -F)
    if res >= tol:
        import warnings; warnings.warn('Newton did not converge: res=%.2e after %d its' % (res, maxit))
    return phi.reshape(g.Nr, g.Nz), res


def energy_consistent(g, phi, gas=0.0):
    """Discrete field energy E_h whose exact minimiser the (staircase) FD scheme of symm.py computes
    (edge-based gradients, node volumes matching Grid.laplacian).  Replaces symm.energy(), whose np.gradient
    differences across body boundaries give 2-9%% errors in dE/dX.  Energy of pinned (fixed) nodes excluded."""
    h = g.h; m2 = 1 - gas; r = g.r
    w = 2 * np.pi * r * h * h; w[0] = np.pi * h**3 / 4
    c = 2 * np.pi * (r[:-1] + h / 2)
    Er = 0.5 * np.sum(c[:, None] * (phi[1:, :] - phi[:-1, :])**2)
    Ez = 0.5 * np.sum(w[:, None] / h**2 * (phi[:, 1:] - phi[:, :-1])**2)
    Vs = -m2 * phi**2 / 2 + phi**4 / 4 + m2**2 / 4
    return Er + Ez + np.sum((w[:, None] * Vs)[~g.fixed])
