"""3D nonlinear symmetron solver for the HUST-09 geometry (quarter domain x>=0, y>=0, reflection symmetry planes).
Vertex-centred finite volumes on a non-uniform tensor grid (mm).  Discrete energy (units v^2/mu, lengths in 1/mu):
   E' = mu * [ 1/2 phi^T S phi + mu^2 sum_free dV (V(phi) + 1/4) ],   V = -phi^2/2 + phi^4/4
(S = weighted graph Laplacian with Dirichlet phi=0 on pinned nodes; the +1/4 shift makes the broken-phase bulk zero).
Newton on the energy with CG + pyamg smoothed-aggregation preconditioner (Hessian is SPD at the stable minimum).
Pinned (screened) bodies: chamber (r>=225), pedestal+disk (r<=Rped, z<=0), shield tube, two spheres, pendulum block,
clamp+ferrule+mirror.  Pendulum orientation 'x' (along the sphere axis = NEAR) or 'y' (FAR)."""
import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla, pyamg, time, sys

def axis(hf, xf, xmin, xmax, ratio=1.15, sym0=True):
    """nodes: uniform hf on [xmin_f.., xf], graded outward to xmax. If sym0, starts at 0 (symmetry plane)."""
    pts = list(np.arange(0 if sym0 else xmin, xf + 1e-9, hf))
    d = hf
    while pts[-1] < xmax:
        d = min(d * ratio, 8.0); pts.append(pts[-1] + d)
    return np.array(pts)

def zaxis(hf, z0f, z1f, zmin, zmax, ratio=1.15):
    mid = list(np.arange(z0f, z1f + 1e-9, hf))
    up = []; d = hf; z = mid[-1]
    while z < zmax:
        d = min(d * ratio, 8.0); z = z + d; up.append(z)
    dn = []; d = hf; z = mid[0]
    while z > zmin:
        d = min(d * ratio, 8.0); z = z - d; dn.append(z)
    return np.array(dn[::-1] + mid + up)

def dual(x, sym0):
    dx = np.diff(x); w = np.zeros_like(x)
    w[1:-1] = 0.5 * (dx[:-1] + dx[1:])
    w[0] = 0.5 * dx[0] if sym0 else 0.5 * dx[0]
    w[-1] = 0.5 * dx[-1]
    return w

class Geom:
    def __init__(self, hf=1.5, zd=200.0, Rped=125.0, gap=2.0, xf=112.0, zf1=112.0):
        self.x = axis(hf, xf, 0, 225.0 + 1e-6); self.y = self.x.copy()
        self.z = zaxis(hf, -3.0, zf1, -zd, 500.0 - zd)
        self.zd, self.Rped, self.gap, self.hf = zd, Rped, gap, hf
        X, Y, Z = np.meshgrid(self.x, self.y, self.z, indexing='ij')
        self.X, self.Y, self.Z = X, Y, Z
        R = np.sqrt(X**2 + Y**2); self.R = R
        base = (R >= 225.0) | (Z <= -zd + 1e-9) | (Z >= 500.0 - zd - 1e-9)
        base |= (R <= Rped) & (Z <= 0.0)
        self.base = base
        self.dVx, self.dVy, self.dVz = dual(self.x, True), dual(self.y, True), dual(self.z, False)
        print('grid %d x %d x %d = %.2fM nodes' % (len(self.x), len(self.y), len(self.z), X.size / 1e6))

    def mask(self, shield=True, spheres='x', pend='x', hardware=True):
        X, Y, Z, R = self.X, self.Y, self.Z, self.R
        fx = self.base.copy(); hf = self.hf; g = self.gap
        if shield:
            fx |= (R >= 47.0) & (R <= 47.0 + max(0.7, 1.5 * hf)) & (Z >= g) & (Z <= g + 90.0)
        a, Rs, zs = 28.576, 78.58, 34.2
        if spheres == 'x':
            fx |= (X - Rs)**2 + Y**2 + (Z - zs)**2 <= a**2
        elif spheres == 'y':
            fx |= X**2 + (Y - Rs)**2 + (Z - zs)**2 <= a**2
        Lh, Wh, z0, z1 = 45.733, 6.007, 21.14, 47.36
        if pend == 'x':
            fx |= (X <= Lh) & (Y <= Wh) & (Z >= z0) & (Z <= z1)
        elif pend == 'y':
            fx |= (Y <= Lh) & (X <= Wh) & (Z >= z0) & (Z <= z1)
        if hardware and pend is not None:
            fx |= (R <= 6.02) & (Z >= z1) & (Z <= 57.5)
            fx |= (R <= 3.05) & (Z >= 57.5) & (Z <= 72.6)
            fx |= (X <= 2.04) & (Y <= 2.04) & (Z >= 72.6) & (Z <= 76.7)
        return fx

    def operators(self, fixed):
        """S (free x free, mm units), dV (free), index map"""
        shp = fixed.shape; N = fixed.size
        free = ~fixed.ravel(); fid = -np.ones(N, np.int64); fid[free] = np.arange(free.sum())
        nf = int(free.sum())
        idx = np.arange(N).reshape(shp)
        diag = np.zeros(nf); rows = []; cols = []; vals = []
        dx, dy, dz = np.diff(self.x), np.diff(self.y), np.diff(self.z)
        Ay = self.dVy[None, :, None] * self.dVz[None, None, :]
        for ax in range(3):
            if ax == 0:
                a = idx[:-1, :, :]; b = idx[1:, :, :]
                w = (self.dVy[None, :, None] * self.dVz[None, None, :]) / dx[:, None, None] * np.ones(a.shape)
            elif ax == 1:
                a = idx[:, :-1, :]; b = idx[:, 1:, :]
                w = (self.dVx[:, None, None] * self.dVz[None, None, :]) / dy[None, :, None] * np.ones(a.shape)
            else:
                a = idx[:, :, :-1]; b = idx[:, :, 1:]
                w = (self.dVx[:, None, None] * self.dVy[None, :, None]) / dz[None, None, :] * np.ones(a.shape)
            a = a.ravel(); b = b.ravel(); w = w.ravel()
            fa, fb = fid[a], fid[b]
            ma = fa >= 0; mb = fb >= 0
            np.add.at(diag, fa[ma], w[ma]); np.add.at(diag, fb[mb], w[mb])
            both = ma & mb
            rows += [fa[both], fb[both]]; cols += [fb[both], fa[both]]; vals += [-w[both], -w[both]]
        rows = np.concatenate(rows + [np.arange(nf)]); cols = np.concatenate(cols + [np.arange(nf)])
        vals = np.concatenate(vals + [diag])
        S = sp.csr_matrix((vals, (rows, cols)), shape=(nf, nf))
        dV = (self.dVx[:, None, None] * self.dVy[None, :, None] * self.dVz[None, None, :]).ravel()[free]
        return S, dV, free

def energy(S, dV, pf, mu):
    return mu * (0.5 * pf @ (S @ pf) + mu**2 * np.sum(dV * (-pf**2 / 2 + pf**4 / 4 + 0.25)))

def solve(S, dV, mu, p0=None, tol=1e-11, maxit=40, verbose=True):
    """minimise E; returns pf, E', final max|grad|/dV (= PDE residual in units mu^2)"""
    nf = S.shape[0]; pf = np.ones(nf) if p0 is None else p0.copy()
    m2 = mu**2; ml = None; E = energy(S, dV, pf, mu)
    for it in range(maxit):
        grad = S @ pf + m2 * dV * (-pf + pf**3)
        res = np.max(np.abs(grad) / dV) / m2           # PDE residual in dimensionless units
        if verbose: print('    it %2d  E=%.12e  res=%.2e' % (it, E, res)); sys.stdout.flush()
        if res < tol: break
        H = (S + sp.diags(m2 * dV * (-1 + 3 * pf**2))).tocsr()
        if ml is None or it % 4 == 0:
            ml = pyamg.smoothed_aggregation_solver(H, symmetry='symmetric', max_coarse=500)
        M = ml.aspreconditioner(cycle='V')
        rtol = max(min(1e-3, 0.1 * res), 1e-12)
        d, info = spla.cg(H, -grad, rtol=rtol, maxiter=400, M=M)
        # line search on the energy
        s = 1.0
        for _ in range(20):
            pn = pf + s * d; En = energy(S, dV, pn, mu)
            if En <= E + 1e-14 * abs(E): break
            s *= 0.5
        pf, E = pn, En
    return pf, E, res
