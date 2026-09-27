"""symm_robin.py -- upgraded axisymmetric symmetron solver (new module; symm.py and validation/symm_sw.py untouched).

Dimensionless units as before: lengths 1/mu, field v, force v^2.  PDE: lap(phi) = -(1-g) phi + phi^3 in vacuum.
Builds on validation/symm_sw.GridSW (second-order cut-cell spheres, Dirichlet chamber walls) and adds:

 1. Robin sheets (zero-thickness foils):  jump [d_n phi] = kappa phi across the sheet, phi continuous.
    Discretised node-on-sheet: the sheet adds -kappa/h to the diagonal of its node row (a discrete delta function);
    second-order accurate for a sheet on a grid line.  kappa = rho t / M^2 (units mu).  zsheet()/rsheet(kappa=...).
 2. Slab sheets (thick foils as a linear two-port): a slab of in-matter mass m (units mu) and thickness t (units 1/mu,
    may be << h) sits between the two copies ("minus"/"plus") of a doubled grid node.  Outside faces obey
       phi'(-) = m(-C phi_- + phi_+)/S ,  phi'(+) = m(-phi_- + C phi_+)/S ,  C=cosh(mt), S=sinh(mt)
    (exact for the linear interior phi''=m^2 phi, i.e. rho/rho_crit >> 1).  Each copy gets a half control volume
    (ghost-point Neumann style).  Captures both the pinning (symmetric) and the exp(-mt) transmission of thick foils,
    which a single Robin constant cannot.  zsheet()/rsheet(m=..., t=...).  Nodes shared by a slab z-sheet and a slab
    r-sheet (can corners) are pinned (phi=0) -- a ring of width h; slightly conservative (less leakage).
 3. Thin axis rod (fibre / support column) of radius a << h, sub-grid log model: lattice axis node ~ rod of radius
    r_eff = h e^{-gamma}/4 = 0.1404 h.  Rod surface condition 2 pi a phi'(a) = q phi(a); q = inf (Dirichlet rod) or
    q = pi a^2 m_in^2 (unscreened thin rod, a << 1/m_in).   rod(z0, z1, a, q).
 4. Thin ring wire (axisymmetric wire grid) at a node, radius a << h, 2D lattice r_eff = h e^{-gamma}/(2 sqrt2) = 0.1985 h.
    ring(r, z, a, q).
 5. Optional Neumann outer radial wall (neumann_r=True) for exact 1D tests.
Solver: Newton (optionally pseudo-transient continuation for metastable-state searches), with convergence warning.
Force: symm.force_z (stress tensor on a pillbox that must not cut sheets).
"""
import os, sys, warnings
import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_here, '..')); sys.path.insert(0, os.path.join(_here, '..', 'validation'))
from symm import force_z
from symm_sw import GridSW

REFF_AXIS = np.exp(-np.euler_gamma) / 4               # 0.1404 (axisymmetric axis node)
REFF_2D = np.exp(-np.euler_gamma) / (2 * np.sqrt(2))  # 0.1985 (5-point 2D lattice point)


def q_eff(q, a, reff):
    """sink strength of a thin wire/rod (per unit length) seen by the lattice node."""
    ell = np.log(reff / a)
    assert ell > 0, 'wire/rod radius must be < lattice r_eff (%.3g); resolve it instead' % reff
    if np.isinf(q):
        return 2 * np.pi / ell
    return q / (1 + q * ell / (2 * np.pi))


class RGrid(GridSW):
    def __init__(self, Rc, L, h, neumann_r=False, neumann_z=False, theta_min=0.02):
        super().__init__(Rc, L, h, theta_min)
        self.neumann_r = neumann_r; self.neumann_z = neumann_z
        if neumann_r:
            self.fixed[-1, 1:-1] = False
        if neumann_z:
            self.fixed[:-1, 0] = False; self.fixed[:-1, -1] = False
        self.sheets = []   # (orient, mask, model)
        self.diag_extra = np.zeros((self.Nr, self.Nz))

    # ---------------- geometry -----------------
    def _model(self, kappa, m, t):
        if kappa is not None:
            return ('robin', float(kappa))
        assert m is not None and t is not None
        return ('slab', float(m), float(t))

    def zsheet(self, zf, r0, r1, kappa=None, m=None, t=None):
        j = int(round((zf - self.z[0]) / self.h)); assert abs(self.z[j] - zf) < 1e-7, 'sheet must be on a grid line'
        mask = np.zeros_like(self.fixed)
        mask[:, j] = (self.r >= r0 - 1e-9) & (self.r <= r1 + 1e-9)
        if not self.neumann_r:
            mask[-1, j] = False
        self.sheets.append(('z', mask, self._model(kappa, m, t)))

    def rsheet(self, rf, z0, z1, kappa=None, m=None, t=None):
        i = int(round(rf / self.h)); assert abs(self.r[i] - rf) < 1e-7 and i > 0
        mask = np.zeros_like(self.fixed)
        mask[i, 1:-1] = (self.z[1:-1] >= z0 - 1e-9) & (self.z[1:-1] <= z1 + 1e-9)
        self.sheets.append(('r', mask, self._model(kappa, m, t)))

    def rod(self, z0, z1, a, q=np.inf):
        sel = (self.z >= z0 - 1e-9) & (self.z <= z1 + 1e-9)
        self.diag_extra[0, sel] += -4 * q_eff(q, a, REFF_AXIS * self.h) / (np.pi * self.h**2)

    def ring(self, r, z, a, q=np.inf):
        i = int(round(r / self.h)); j = int(round((z - self.z[0]) / self.h))
        self.diag_extra[i, j] += -q_eff(q, a, REFF_2D * self.h) / self.h**2

    # ---------------- operator -----------------
    def build(self):
        """Linear operator A (Laplacian + sheet/rod/wire terms) on the extended unknown set.
        Returns A (n x n CSR), fixed mask (Nr x Nz), ext (Nr x Nz int, index of plus-copy or -1)."""
        Lap = self.laplacian()          # GridSW: finalizes sphere near-surface pins, cut-cell rows
        Nr, Nz, h = self.Nr, self.Nz, self.h
        N = Nr * Nz
        idx = lambda i, j: i * Nz + j
        fixed = self.fixed.copy()
        sphere_mask = np.zeros_like(fixed)
        for zc, a in self.spheres:
            sphere_mask |= self.R**2 + (self.Z - zc)**2 <= (a + 1.5 * h)**2
        # slab bookkeeping
        zs = np.zeros_like(fixed); rs = np.zeros_like(fixed); par = {}
        kap = np.zeros((Nr, Nz))
        for orient, mask, mod in self.sheets:
            if mod[0] == 'slab':
                assert not np.any(mask & sphere_mask), 'slab sheets must not touch cut-cell sphere rows'
            if mod[0] == 'robin':
                kap[mask] = np.maximum(kap[mask], mod[1])
            else:
                (zs if orient == 'z' else rs)[mask] = True
                for i, j in zip(*np.where(mask)):
                    par[(i, j)] = mod[1:]
        fixed |= zs & rs                     # slab corners pinned
        zs &= ~fixed; rs &= ~fixed
        ext = -np.ones((Nr, Nz), int); n = N
        for i, j in zip(*np.where(zs | rs)):
            ext[i, j] = n; n += 1
        coo = Lap.tocoo()
        A = sp.coo_matrix((coo.data, (coo.row, coo.col)), shape=(n, n)).tolil()
        if self.neumann_r:
            i = Nr - 1; r = self.r[i]; V = (h / 2) * (r - h / 4); c = (r - h / 2) / (h * V)
            for j in range(1, Nz - 1):
                A[idx(i, j), idx(i - 1, j)] = A[idx(i, j), idx(i - 1, j)] + c
                A[idx(i, j), idx(i, j)] = A[idx(i, j), idx(i, j)] - c
        if self.neumann_z:
            for i in range(Nr - 1):
                for j, jn in ((0, 1), (Nz - 1, Nz - 2)):
                    A[idx(i, j), idx(i, jn)] = A[idx(i, j), idx(i, jn)] + 2 / h**2
                    A[idx(i, j), idx(i, j)] = A[idx(i, j), idx(i, j)] - 2 / h**2
        # diagonal terms: Robin sheets, rods, rings
        dg = (-kap / h + self.diag_extra).ravel()
        for p in np.where(dg != 0)[0]:
            A[p, p] = A[p, p] + dg[p]

        def adm(m, t):
            x = m * t
            if x > 30:
                return 2 * m * np.exp(-x), m      # y (transfer), yd (self)
            return m / np.sinh(x), m / np.tanh(x)

        orig = {}
        for i, j in zip(*np.where(zs | rs)):
            p = idx(i, j); orig[p] = dict(zip(A.rows[p], A.data[p]))
        newrows = {}
        moves = []   # (row k, old col p, list of (col, weight))
        for i, j in zip(*np.where(zs)):
            p = idx(i, j); e = ext[i, j]; y, yd = adm(*par[(i, j)])
            up, dn = idx(i, j + 1), idx(i, j - 1)
            row = orig[p]
            rad = {k: v for k, v in row.items() if k not in (up, dn, p)}
            raddiag = row.get(p, 0.0) + 2 / h**2
            rp = dict(rad); rp[p] = raddiag - 2 / h**2 - 2 * yd / h; rp[dn] = 2 / h**2; rp[e] = 2 * y / h
            re = {}
            for k, v in rad.items():
                ki, kj = divmod(k, Nz)
                re[ext[ki, kj] if zs[ki, kj] else k] = v
                if not zs[ki, kj] and not fixed[ki, kj]:
                    moves.append((k, p, [(p, 0.5), (e, 0.5)]))        # edge: regular radial neighbour
            re[e] = raddiag - 2 / h**2 - 2 * yd / h; re[up] = 2 / h**2; re[p] = 2 * y / h
            newrows[p] = rp; newrows[e] = re
            assert not (zs[i, j + 1] or rs[i, j + 1] or zs[i, j - 1])
            moves.append((up, p, [(e, 1.0)]))
        for i, j in zip(*np.where(rs)):
            p = idx(i, j); e = ext[i, j]; y, yd = adm(*par[(i, j)])
            rf = self.r[i]; Vm = (h / 2) * (rf - h / 4); Vp = (h / 2) * (rf + h / 4)
            ki_, ko = idx(i - 1, j), idx(i + 1, j)
            row = orig[p]
            zpart = {k: v for k, v in row.items() if k not in (ki_, ko, p)}
            rp = dict(zpart); rp[ki_] = (rf - h / 2) / (h * Vm)
            rp[p] = -2 / h**2 - (rf - h / 2) / (h * Vm) - rf * yd / Vm; rp[e] = rf * y / Vm
            re = {}
            for k, v in zpart.items():
                ki, kj = divmod(k, Nz)
                re[ext[ki, kj] if rs[ki, kj] else k] = v
                if not rs[ki, kj] and not fixed[ki, kj]:
                    moves.append((k, p, [(p, Vm / (rf * h)), (e, Vp / (rf * h))]))   # tube end
            re[ko] = (rf + h / 2) / (h * Vp); re[e] = -2 / h**2 - (rf + h / 2) / (h * Vp) - rf * yd / Vp; re[p] = rf * y / Vp
            newrows[p] = rp; newrows[e] = re
            assert not (zs[i + 1, j] or rs[i + 1, j] or rs[i - 1, j])
            moves.append((ko, p, [(e, 1.0)]))
        for r_, cols in newrows.items():
            A.rows[r_] = []; A.data[r_] = []
            for k in sorted(cols):
                A.rows[r_].append(k); A.data[r_].append(cols[k])
        for k, p, targets in moves:
            if k in newrows:
                continue
            c = A[k, p]
            if c == 0:
                continue
            A[k, p] = 0.0
            for col, w in targets:
                A[k, col] = A[k, col] + c * w
        self._ext = ext; self._fixed_full = fixed
        return A.tocsr(), fixed, ext

    def free_index(self):
        A, fixed, ext = self.build()
        n = A.shape[0]; N = self.Nr * self.Nz
        free = np.concatenate([~fixed.ravel(), np.ones(n - N, bool)])
        fi = np.where(free)[0]
        return A, fi, fixed, ext


def solve(g, gas=0.0, phi0=None, tol=1e-10, maxit=60, ptc=False, dt0=0.05, verbose=False, return_all=False):
    """Newton solve of A phi + (1-gas) phi - phi^3 = 0.  phi0: initial grid (Nr x Nz) or None (=1).
    ptc=True: pseudo-transient continuation (implicit gradient flow with growing dt) -> converges to a *stable*
    state near phi0 instead of an arbitrary saddle."""
    A, fi, fixed, ext = g.free_index()
    N = g.Nr * g.Nz; n = A.shape[0]
    Aff = A[fi][:, fi].tocsc()
    phi = np.zeros(n)
    init = np.ones(N) if phi0 is None else np.asarray(phi0, float).ravel()
    phi[:N] = init
    sel = ext.ravel() >= 0
    phi[ext.ravel()[sel]] = init[sel]
    phi[:N][fixed.ravel()] = 0.0
    m2 = 1.0 - gas
    I = sp.identity(len(fi), format='csc')
    dt = dt0; res_old = None
    for it in range(maxit if not ptc else 400):
        pf = phi[fi]
        F = Aff @ pf + m2 * pf - pf**3
        res = np.max(np.abs(F))
        if verbose:
            print(it, res, dt)
        if res < tol:
            break
        J = Aff + sp.diags(m2 - 3 * pf**2)
        if ptc:
            d = spla.spsolve((I / dt - J).tocsc(), F)
            if res_old is not None and res < res_old:
                dt = min(dt * 2.0, 1e12)
            res_old = res
        else:
            d = spla.spsolve(J.tocsc(), -F)
        phi[fi] = pf + d
    if res >= tol:
        warnings.warn('Newton did not converge: res=%.2e' % res)
    grid = phi[:N].reshape(g.Nr, g.Nz)
    if return_all:
        return grid, res, phi, (Aff, fi)
    return grid, res


def plus_copy(g, phi_all):
    """grid of plus-copy values at slab nodes (nan elsewhere)"""
    out = np.full((g.Nr, g.Nz), np.nan)
    sel = g._ext >= 0
    out[sel] = phi_all[g._ext[sel]]
    return out


def lam_min(g, k=1):
    """lowest eigenvalue(s) of -A (units mu^2).  The field condenses (from phi=0) iff lam_min < 1 - gas."""
    A, fi, fixed, ext = g.free_index()
    M = -A[fi][:, fi].tocsc()
    vals = spla.eigs(M, k=k, sigma=0.0, which='LM', return_eigenvectors=False)
    return np.sort(np.real(vals))


def hessian_min(phi_all, Aff_fi, gas=0.0, k=1, vec=False):
    """lowest eigenvalue of the second variation (-J) at a solution: >0 => local minimum (stable/metastable)."""
    Aff, fi = Aff_fi
    pf = phi_all[fi]
    J = Aff + sp.diags((1 - gas) - 3 * pf**2)
    vals, vecs = spla.eigs((-J).tocsc(), k=k, sigma=-0.5, which='LM')
    o = np.argsort(np.real(vals))
    if vec:
        return np.real(vals[o]), np.real(vecs[:, o])
    return np.real(vals[o])
