"""
Axisymmetric (r,z) nonlinear symmetron solver in dimensionless units.
Lengths in units of 1/mu, field in units of v = mu/sqrt(lambda).
Energy density in units of mu^2 v^2 (so V0 = 1/4).
Equation: lap(phi) = -phi + phi^3 (broken phase phi=1), screened bodies = Dirichlet phi=0.
(Optionally a uniform 'gas' term g: lap(phi) = (g-1) phi + phi^3, g = rho_gas/(M^2 mu^2).)
Force on a body from Maxwell-like stress tensor T_ij = d_i phi d_j phi - delta_ij (|grad phi|^2/2 + V),
F_i = - closed_surface_integral T_ij n_j dS.  Force unit = v^2 (SI: newtons).
"""
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla


class Grid:
    def __init__(self, Rc, L, h):
        self.h = h
        self.Nr = int(round(Rc / h)) + 1
        self.Nz = int(round(2 * L / h)) + 1
        self.r = np.arange(self.Nr) * h
        self.z = -L + np.arange(self.Nz) * h
        self.R, self.Z = np.meshgrid(self.r, self.z, indexing="ij")
        self.fixed = np.zeros((self.Nr, self.Nz), bool)
        self.fixed[-1, :] = True
        self.fixed[:, 0] = True
        self.fixed[:, -1] = True

    def sphere(self, zc, a):
        self.fixed |= self.R**2 + (self.Z - zc) ** 2 <= a**2

    def disk(self, zf, W, t=None):
        t = self.h if t is None else t
        self.fixed |= (np.abs(self.Z - zf) <= t / 2 + 1e-12) & (self.R <= W + 1e-12)

    def cyl_shell(self, Rs, z0, z1, t=None):
        t = self.h if t is None else t
        self.fixed |= (np.abs(self.R - Rs) <= t / 2 + 1e-12) & (self.Z >= z0) & (self.Z <= z1)

    def box(self, r0, r1, z0, z1):
        self.fixed |= (self.R >= r0) & (self.R <= r1) & (self.Z >= z0) & (self.Z <= z1)

    def laplacian(self):
        Nr, Nz, h = self.Nr, self.Nz, self.h
        N = Nr * Nz
        idx = np.arange(N).reshape(Nr, Nz)
        rows, cols, vals = [], [], []
        r = self.r
        for i in range(Nr):
            if i == 0:
                # axis: 4(phi1-phi0)/h^2
                rows += [idx[0, :], idx[0, :]]
                cols += [idx[1, :], idx[0, :]]
                vals += [np.full(Nz, 4 / h**2), np.full(Nz, -4 / h**2)]
            elif i < Nr - 1:
                rp = (r[i] + h / 2) / r[i]
                rm = (r[i] - h / 2) / r[i]
                rows += [idx[i, :], idx[i, :], idx[i, :]]
                cols += [idx[i + 1, :], idx[i - 1, :], idx[i, :]]
                vals += [np.full(Nz, rp / h**2), np.full(Nz, rm / h**2), np.full(Nz, -(rp + rm) / h**2)]
        # z part
        for i in range(Nr):
            j = np.arange(1, Nz - 1)
            rows += [idx[i, j], idx[i, j], idx[i, j]]
            cols += [idx[i, j + 1], idx[i, j - 1], idx[i, j]]
            vals += [np.full(Nz - 2, 1 / h**2)] * 2 + [np.full(Nz - 2, -2 / h**2)]
        rows = np.concatenate(rows); cols = np.concatenate(cols); vals = np.concatenate(vals)
        return sp.csr_matrix((vals, (rows, cols)), shape=(N, N))


def solve(g, gas=0.0, phi0=None, tol=1e-10, maxit=40, verbose=False):
    Lap = g.laplacian()
    N = g.Nr * g.Nz
    free = ~g.fixed.ravel()
    fi = np.where(free)[0]
    Lff = Lap[fi][:, fi].tocsc()
    phi = np.zeros(N)
    phi[fi] = 1.0 if phi0 is None else phi0.ravel()[fi]
    m2 = 1.0 - gas
    for it in range(maxit):
        pf = phi[fi]
        F = Lff @ pf + m2 * pf - pf**3
        res = np.max(np.abs(F))
        if verbose:
            print(it, res)
        if res < tol:
            break
        J = Lff + sp.diags(m2 - 3 * pf**2)
        d = spla.spsolve(J.tocsc(), -F)
        # damped step
        s = 1.0
        phi[fi] = pf + s * d
    return phi.reshape(g.Nr, g.Nz), res


def energy(g, phi, gas=0.0):
    h = g.h
    pr = np.gradient(phi, h, axis=0)
    pz = np.gradient(phi, h, axis=1)
    m2 = 1.0 - gas
    # shift so that bulk broken phase (phi^2 = m2) has zero density
    e = 0.5 * (pr**2 + pz**2) - m2 * phi**2 / 2 + phi**4 / 4 + m2**2 / 4
    w = 2 * np.pi * g.R
    w[0, :] = 2 * np.pi * h / 8  # axis cell weight approx
    return np.sum(e * w) * h * h


def force_z(g, phi, rho_s, z_lo, z_hi, gas=0.0):
    """Force (z) on everything inside cylinder r<rho_s, z_lo<z<z_hi."""
    h = g.h
    m2 = 1.0 - gas
    pr = np.gradient(phi, h, axis=0)
    pz = np.gradient(phi, h, axis=1)
    V = -m2 * phi**2 / 2 + phi**4 / 4
    Tzz = 0.5 * (pz**2 - pr**2) - V
    Tzr = pz * pr
    i_s = int(round(rho_s / h))
    j_lo = int(round((z_lo - g.z[0]) / h))
    j_hi = int(round((z_hi - g.z[0]) / h))
    rr = g.r[: i_s + 1]
    top = np.trapezoid(Tzz[: i_s + 1, j_hi] * 2 * np.pi * rr, rr)
    bot = np.trapezoid(Tzz[: i_s + 1, j_lo] * 2 * np.pi * rr, rr)
    zz = g.z[j_lo : j_hi + 1]
    side = np.trapezoid(Tzr[i_s, j_lo : j_hi + 1] * 2 * np.pi * g.r[i_s], zz)
    return -(top - bot + side)


def annulus(g, zf, rin, rout, t=None):
    t = g.h if t is None else t
    g.fixed |= (np.abs(g.Z - zf) <= t / 2 + 1e-12) & (g.R >= rin - 1e-12) & (g.R <= rout + 1e-12)
