"""U5: planar periodic wire grid (wires along y, spacing s, radius a, in the plane z=0), 2D (x,z) half-cell
x in [0, s/2] with mirror (Neumann) sides, z in [-Z, Z].  Wires use the sub-grid log model (lattice point ~ radius
0.1985 h; flux into wire Q = q phi(a); q=inf for a screened/conducting wire).
 (1) symmetron: phi -> 1 at z = +-Z (Z=8).  The x-averaged far field is fitted to tanh((|z|+x0)/sqrt2), giving the
     grid's equivalent Robin constant kappa_sym (units mu).  Compared with the homogenised thin-wire formula
         kappa_hom = (q/s) / (1 + (q/2pi) ln(s/(2 pi a)))      (q=inf: 2 pi / (s ln(s/(2 pi a))))
 (2) electrostatics (Laplace, wires grounded conductors): potential 1 at z=-Zb, 0 at z=+Zb; the grid's effective
     kappa_es from the mean potential at the grid: phi_g = (1/Zb) / (2/Zb + kappa_es).
All in units of 1/mu (for electrostatics the unit is arbitrary: the Laplace problem is scale-free)."""
import sys, numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla
REFF_2D = np.exp(-np.euler_gamma) / (2 * np.sqrt(2))


def qeff(q, a, h):
    ell = np.log(REFF_2D * h / a); assert ell > 0
    return 2 * np.pi / ell if np.isinf(q) else q / (1 + q * ell / (2 * np.pi))


def lap2d(nx, nz, h):
    ex = np.ones(nx); Dx = sp.diags([ex[:-1], -2 * ex, ex[:-1]], [-1, 0, 1]).tolil()
    Dx[0, 1] = 2; Dx[-1, -2] = 2          # mirror (Neumann) at x=0 and x=s/2
    ez = np.ones(nz); Dz = sp.diags([ez[:-1], -2 * ez, ez[:-1]], [-1, 0, 1])
    return (sp.kron(Dx.tocsr(), sp.identity(nz)) + sp.kron(sp.identity(nx), Dz)) / h**2


def grid_setup(s, h, Z):
    nx = int(round(s / 2 / h)) + 1
    nz = int(round(2 * Z / h)) + 1
    z = -Z + np.arange(nz) * h
    return nx, nz, z


def symmetron(s, a, h, q=np.inf, Z=8.0, tol=1e-11):
    nx, nz, z = grid_setup(s, h, Z)
    L = lap2d(nx, nz, h).tolil()
    j0 = nz // 2; w = 0 * nz + j0
    L[w, w] = L[w, w] - qeff(q, a, h) / h**2
    L = L.tocsr()
    fixed = np.zeros((nx, nz), bool); fixed[:, 0] = fixed[:, -1] = True
    fi = np.where(~fixed.ravel())[0]; bi = np.where(fixed.ravel())[0]
    Aff = L[fi][:, fi].tocsc(); Afb = L[fi][:, bi]
    phi = np.ones(nx * nz); rhs_b = Afb @ phi[bi]
    for it in range(60):
        p = phi[fi]; F = Aff @ p + rhs_b + p - p**3
        if np.max(np.abs(F)) < tol:
            break
        phi[fi] = p + spla.spsolve((Aff + sp.diags(1 - 3 * p**2)).tocsc(), -F)
    P = phi.reshape(nx, nz)
    wts = np.ones(nx); wts[0] = wts[-1] = 0.5
    pbar = (wts @ P) / wts.sum()
    sel = (z > 2.0) & (z < 4.0)
    x0 = np.median(np.sqrt(2) * np.arctanh(np.clip(pbar[sel], 0, 1 - 1e-15)) - z[sel])
    u = x0 / np.sqrt(2)
    kap = np.sqrt(2) / np.cosh(u)**2 / np.tanh(u)
    return kap, pbar[j0], P[-1, j0], P[0, j0]


def electro(s, a, h, Zb=None):
    Zb = max(4 * s, 2.0) if Zb is None else Zb
    nx, nz, z = grid_setup(s, h, Zb)
    L = lap2d(nx, nz, h).tolil()
    j0 = nz // 2
    L[j0, j0] = L[j0, j0] - qeff(np.inf, a, h) / h**2
    L = L.tocsr()
    fixed = np.zeros((nx, nz), bool); fixed[:, 0] = fixed[:, -1] = True
    val = np.zeros((nx, nz)); val[:, 0] = 1.0
    fi = np.where(~fixed.ravel())[0]; bi = np.where(fixed.ravel())[0]
    phi = val.ravel().copy()
    phi[fi] = spla.spsolve(L[fi][:, fi].tocsc(), -(L[fi][:, bi] @ phi[bi]))
    P = phi.reshape(nx, nz)
    # mean potential far from the grid is linear on each side; extrapolate both sides to z=0 (removes near-field)
    wts = np.ones(nx); wts[0] = wts[-1] = 0.5
    pbar = (wts @ P) / wts.sum()
    up = (z > 0.5 * Zb) & (z < 0.9 * Zb); dn = (z < -0.5 * Zb) & (z > -0.9 * Zb)
    cu = np.polyfit(z[up], pbar[up], 1); cd = np.polyfit(z[dn], pbar[dn], 1)
    Eup, Edn = -cu[0], -cd[0]
    phig = cu[1]                          # extrapolated mean potential at grid (upper side)
    kap = (Edn - Eup) / phig
    return kap, Eup / Edn


def kappa_hom(s, a, q=np.inf):
    ell = np.log(s / (2 * np.pi * a))
    return 2 * np.pi / (s * ell) if np.isinf(q) else (q / s) / (1 + q * ell / (2 * np.pi))


if __name__ == '__main__':
    print('--- electrostatic kappa of a grid of grounded wires (scale-free; units 1/s x s): numeric vs 2pi/(s ln(s/2pi a))')
    for s, a in [(1.0, 1e-3), (1.0, 1e-2), (1.0, 3e-2)]:
        r = []
        for h in [s / 40, s / 80, s / 160]:
            if a < REFF_2D * h:
                k, T = electro(s, a, h, Zb=4 * s)
                r.append('h=s/%d: %.4f' % (round(s / h), k))
        print(' s=%g a=%g  kappa_hom=%.4f  numeric: %s' % (s, a, kappa_hom(s, a), ', '.join(r)))
    print('--- symmetron: equivalent Robin kappa of a Dirichlet (screened) wire grid, units mu; a = wire radius x mu')
    for a in [1e-4, 1e-3]:
        for s in [0.03, 0.1, 0.3, 1.0, 3.0, 10.0]:
            r = []
            for fac in [1, 2]:
                h = min(s / 20, 0.05) / fac
                if a >= REFF_2D * h:
                    continue
                k, pbar0, pmid, pw = symmetron(s, a, h)
                r.append('h=%.4f kappa=%.4f phibar(0)=%.4f phi_midway=%.4f' % (h, k, pbar0, pmid))
            print(' a=%g s=%-5g kappa_hom=%.4f | %s' % (a, s, kappa_hom(s, a), ' | '.join(r)))
            sys.stdout.flush()
    print('--- symmetron: unscreened thin wires (q = pi a^2 m_in^2), a=1e-4 (10 um at 1/mu=10 cm)')
    for q in [1e-3, 1e-2, 0.1]:
        for s in [0.03, 0.1, 1.0]:
            h = min(s / 20, 0.05)
            k, pbar0, pmid, pw = symmetron(s, 1e-4, h, q=q)
            print(' q=%g s=%g  kappa=%.5f  kappa_hom=%.5f  q/s=%.5f' % (q, s, k, kappa_hom(s, 1e-4, q), q / s))
            sys.stdout.flush()
