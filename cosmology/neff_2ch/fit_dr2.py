import numpy as np, sys
from model_dr2 import *
from fit_dr import delta_curve, rs_fit, cgl, RS_ALL
from scipy.optimize import least_squares
def resid(p):
    tc = TCDR2(api=p[0], ak=p[1], c=p[2], d=p[3])
    d = delta_curve(tc, RS_ALL)
    return np.concatenate([(np.interp(rs_fit, RS_ALL, d) - cgl) / 2.0, [(np.interp(0.982, RS_ALL, d) - 180.0) / 5.0]])
best=None
for a0 in (-2.0, -0.5, 1.0):
    for k0 in (-2.0, -1.0):
        for c0 in (0.7, 1.0):
            for d0 in (-0.1, 0.0, 0.1):
                try: r = least_squares(resid, [a0, k0, c0, d0], bounds=([-6, -6, 0.2, -2], [4, 4, 3, 2]))
                except Exception: continue
                if best is None or r.cost < best.cost: best = r
print("best", list(best.x), "cost", best.cost, "max|res|", np.max(np.abs(best.fun)))
tc = TCDR2(api=best.x[0], ak=best.x[1], c=best.x[2], d=best.x[3])
grid = np.arange(0.30, 2.0001, 0.0025); dd = delta_curve(tc, grid)
from neff_model import delta00
for r in [0.4,0.5,0.6,0.7,0.8,0.9,0.95,0.98,0.99,1.0,1.02,1.05,1.1,1.2,1.3,1.4,1.5,1.7,2.0]:
    i = np.argmin(abs(grid-r)); _, eta, Sm = tc.phases(r*r)
    cg = np.degrees(delta00(r*r)) if r < 0.8 else float('nan')
    print(f"{r:.3f}  delta {dd[i]:6.1f}  CGL {cg:6.1f}  eta {eta:.3f}")
ss = np.linspace(-30.0, 4*MPI**2*0.999, 20000)
dets = np.array([np.linalg.det(tc._Dreal(s)) for s in ss])
print("det D (s<4mpi^2, down to -30): min", dets.min(), "max", dets.max(), "sign changes", np.sum(np.diff(np.sign(dets))!=0))
