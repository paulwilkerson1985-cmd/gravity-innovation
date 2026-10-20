"""Q2b: environment-dependent dilaton acceleration on unscreened atoms near a screened source mass in a screened
vacuum chamber (axisymmetric model of the Berkeley tungsten-cylinder geometry: Jaffe et al. 2017, Panda et al. 2024).

Model (Brax-Fischer-Kading-Pitschmann): V = V0 exp(-lam*phi/M_Pl), A = 1 + A2 phi^2/(2 M_Pl^2), V0 = rho_Lambda.
With x = lam*phi/M_Pl:  lap x = k^2 [ -exp(-x) + (rho A2/(lam^2 V0)) x ],   k^2 = lam^2 V0 / M_Pl^2.
Walls and source (W, steel/glass) are deeply screened over the whole corner (skin depth <= 0.5 mm, x_in ~ 1e-5),
so they are Dirichlet x = 0 surfaces; the residual gas is negligible.  In vacuum: lap x = -k^2 exp(-x) (Liouville),
so the field profile depends only on k (i.e. lam) and geometry, NOT on A2.
Unscreened test atom (Cs nucleus: k_m R ~ 1e-3 even at A2 = 1e31):  a = -c^2 grad ln A = -c^2 (A2/lam^2) x grad x.
So the source-induced pull towards the source is  P = c^2 (A2/lam^2) * D,  D = [x dz x]_near - [x dz x]_nosource,
evaluated on the axis at the atoms.  Exclusion: A2/lam^2 > a_bound / (c^2 D(lam)).
"""
import numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla, sys, json, time

MPL = 2.435e27; RHO_L = 2.56e-11; HBARC = 1.973269804e-7; C2 = 8.98755e16
def kinv_m(lam, V0=RHO_L):
    return HBARC / (lam * np.sqrt(V0) / MPL)

class Grid:
    def __init__(self, Rc, Hc, h):
        self.h = h
        self.r = np.arange(0, Rc + h / 2, h); self.z = np.arange(-Hc, Hc + h / 2, h)
        self.Nr, self.Nz = len(self.r), len(self.z)
        self.R, self.Z = np.meshgrid(self.r, self.z, indexing='ij')
        self.fixed = np.zeros((self.Nr, self.Nz), bool)
        self.fixed[-1, :] = True; self.fixed[:, 0] = True; self.fixed[:, -1] = True   # chamber walls
    def hollow_cyl(self, zc, Ri, Ro, H):
        m = (self.R >= Ri - 1e-12) & (self.R <= Ro + 1e-12) & (np.abs(self.Z - zc) <= H / 2 + 1e-12)
        self.fixed |= m
    def laplacian(self):
        Nr, Nz, h = self.Nr, self.Nz, self.h
        idx = np.arange(Nr * Nz).reshape(Nr, Nz)
        rows, cols, vals = [], [], []
        def add(a, b, v):
            rows.append(a.ravel()); cols.append(b.ravel()); vals.append(np.broadcast_to(v, a.shape).ravel())
        I = idx[:, 1:-1]
        add(I, I, -2 / h**2); add(I, idx[:, :-2], 1 / h**2); add(I, idx[:, 2:], 1 / h**2)          # z part
        r = self.r[1:-1, None] * np.ones((1, Nz - 2))
        J = idx[1:-1, 1:-1]
        add(J, J, -2 / h**2); add(J, idx[:-2, 1:-1], 1 / h**2 - 1 / (2 * h * r)); add(J, idx[2:, 1:-1], 1 / h**2 + 1 / (2 * h * r))
        J0 = idx[0, 1:-1]
        add(J0, J0, -4 / h**2); add(J0, idx[1, 1:-1], 4 / h**2)                                     # axis
        L = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(Nr * Nz, Nr * Nz))
        return L

def solve(g, k, tol=1e-9, maxit=80, x0=None):
    L = g.laplacian(); fi = np.where(~g.fixed.ravel())[0]
    Lff = L[fi][:, fi].tocsc()
    x = np.zeros(g.Nr * g.Nz) if x0 is None else x0.ravel().copy()
    k2 = k * k
    for it in range(maxit):
        xf = x[fi]; e = np.exp(-xf)
        F = Lff @ xf + k2 * e; res = np.max(np.abs(F)) / k2
        if res < tol: break
        d = spla.spsolve((Lff - sp.diags(k2 * e)).tocsc(), -F)
        s = 1.0
        while True:
            xn = xf + s * d
            rn = np.max(np.abs(Lff @ xn + k2 * np.exp(-xn))) / k2
            if rn < res or s < 1e-3: break
            s *= 0.5
        x[fi] = xn
    return x.reshape(g.Nr, g.Nz), res

def axis_g(g, x, za):
    """x * dx/dz on the axis at height za (quadratic interpolation of x^2/2 derivative)."""
    q = 0.5 * x[0, :] ** 2
    dq = np.gradient(q, g.h)
    return np.interp(za, g.z, dq), np.interp(za, g.z, x[0, :])

# source: tungsten cylinder, OD = H = 25.4 mm, bore radius 5.0 mm (slot not modelled; azimuthal)
RO, RI, HS = 0.0127, 0.0050, 0.0254

def D_of(lam, Rc, Hc, s_list, h=2e-4, zsrc=0.0):
    k = 1.0 / kinv_m(lam)
    out = {}
    gN = Grid(Rc, Hc, h); gN.hollow_cyl(zsrc, RI, RO, HS)
    xN, rN = solve(gN, k)
    g0 = Grid(Rc, Hc, h)
    x0, r0 = solve(g0, k)
    for s in s_list:
        za = zsrc + HS / 2 + s
        gn, xn_a = axis_g(gN, xN, za); g0v, x0_a = axis_g(g0, x0, za)
        out[s] = dict(D=gn - g0v, g_near=gn, g_none=g0v, x_near=xn_a, x_none=x0_a)
    return out, xN.max(), x0.max(), max(rN, r0)

if __name__ == '__main__':
    lams = [3e25, 1e26, 3e26, 1e27, 3e27, 1e28, 2.5e28]
    s_list = [0.003, 0.004, 0.005, 0.007, 0.010, 0.013]
    chambers = [(0.025, 0.061), (0.035, 0.061), (0.061, 0.061)]
    h = float(sys.argv[1]) if len(sys.argv) > 1 else 2e-4
    res = {}
    for Rc, Hc in chambers:
        print('\n=== chamber: radius %.1f cm, half-height %.1f cm (h = %.2f mm) ===' % (Rc * 100, Hc * 100, h * 1e3))
        for lam in lams:
            t0 = time.time()
            o, xmN, xm0, r = D_of(lam, Rc, Hc, s_list, h=h)
            line = ' '.join('s=%gmm:D=%.3g' % (s * 1e3, o[s]['D']) for s in s_list)
            print('lam=%.1e 1/k=%7.2f cm xmax(near/none)=%.3f/%.3f res=%.0e  %s  [%.0fs]' % (
                lam, kinv_m(lam) * 100, xmN, xm0, r, line, time.time() - t0)); sys.stdout.flush()
            res['%g_%g_%g' % (Rc, Hc, lam)] = dict(Rc=Rc, Hc=Hc, lam=lam, kinv=kinv_m(lam),
                                                   D={str(s): o[s] for s in s_list}, xmax_near=xmN, xmax_none=xm0)
    json.dump(res, open('dilaton_atoms_h%g.json' % h, 'w'), indent=1)
