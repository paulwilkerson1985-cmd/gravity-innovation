"""3D estimate of the 'far position' correction: atoms on the cylinder axis 4 mm above the top face; source toggled
between near (on axis) and far (slid horizontally by d).  Box chamber, Dirichlet x=0 on walls and source (staircase, h=1 mm).
Liouville solved by damped Newton with AMG-preconditioned CG.  Reports R = (g_near-g_far)/(g_near-g_none), g = x dz x."""
import numpy as np, scipy.sparse as sp, pyamg, sys, time
from scipy.sparse.linalg import cg
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__))); from dilaton_atoms import kinv_m
RO, RI, HS = 0.0127, 0.0050, 0.0254

def lap3d(n, h):
    def d2(m):
        e = np.ones(m); return sp.diags([e[:-1], -2 * e, e[:-1]], [-1, 0, 1]) / h**2
    Ix, Iy, Iz = [sp.identity(m) for m in n]
    return (sp.kron(sp.kron(d2(n[0]), Iy), Iz) + sp.kron(sp.kron(Ix, d2(n[1])), Iz) + sp.kron(sp.kron(Ix, Iy), d2(n[2]))).tocsr()

def run(Lx, Ly, Lz, h, lam, src_x):
    xs = np.arange(-Lx + h, Lx - h / 2, h); ys = np.arange(-Ly + h, Ly - h / 2, h); zs = np.arange(-Lz + h, Lz - h / 2, h)
    n = (len(xs), len(ys), len(zs))
    X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
    fixed = np.zeros(n, bool)
    if src_x is not None:
        rr = np.sqrt((X - src_x)**2 + Y**2)
        fixed |= (rr >= RI) & (rr <= RO) & (np.abs(Z) <= HS / 2)
    L = lap3d(n, h)            # walls are the (implicit) zero ghost layer outside the grid
    fi = np.where(~fixed.ravel())[0]
    Lff = L[fi][:, fi].tocsr()
    k2 = 1 / kinv_m(lam)**2
    x = np.zeros(len(fi))
    for it in range(40):
        e = np.exp(-x); F = Lff @ x + k2 * e; res = np.abs(F).max() / k2
        if res < 1e-7: break
        A = (-(Lff) + sp.diags(k2 * e)).tocsr()          # SPD
        ml = pyamg.smoothed_aggregation_solver(A)
        d, info = cg(A, F, rtol=1e-10, M=ml.aspreconditioner(), maxiter=300)
        s = 1.0
        while True:
            xn = x + s * d
            if np.abs(Lff @ xn + k2 * np.exp(-xn)).max() / k2 < res or s < 1e-3: break
            s *= 0.5
        x = xn
    full = np.zeros(np.prod(n)); full[fi] = x; full = full.reshape(n)
    i0 = np.argmin(np.abs(xs)); j0 = np.argmin(np.abs(ys))
    col = full[i0, j0, :]
    g = np.gradient(0.5 * col**2, h)
    return zs, col, g, res

if __name__ == '__main__':
    h = 1e-3; za = HS / 2 + 0.004
    for (Lx, Ly, Lz) in [(0.061, 0.035, 0.061), (0.061, 0.061, 0.061)]:
        for lam in [1e27, 3e27, 1e28]:
            t0 = time.time()
            zs, c0, g0, r0 = run(Lx, Ly, Lz, h, lam, None)
            zs, cn, gn, rn = run(Lx, Ly, Lz, h, lam, 0.0)
            gnone = np.interp(za, zs, g0); gnear = np.interp(za, zs, gn)
            out = []
            for d in [0.025, 0.040]:
                zs, cf, gf, rf = run(Lx, Ly, Lz, h, lam, d)
                gfar = np.interp(za, zs, gf)
                out.append('d=%.1fcm: R=%.3f' % (d * 100, (gnear - gfar) / (gnear - gnone)))
            print('box %.1fx%.1fx%.1f cm half-widths, lam=%.0e: D(near-none)=%.4g /m  %s  [%.0fs]' % (
                Lx * 100, Ly * 100, Lz * 100, lam, gnear - gnone, '  '.join(out), time.time() - t0)); sys.stdout.flush()
