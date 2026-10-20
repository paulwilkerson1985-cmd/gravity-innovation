import numpy as np, sys
from model_dr import *
from neff_model import delta00
from scipy.optimize import least_squares
def delta_curve(tc, rs_all):
    out=[]; prev=0.0
    for rs in rs_all:
        d1, eta, Sm = tc.phases(rs*rs)
        d = np.degrees(d1)
        while d - prev > 90: d -= 180
        while d - prev < -90: d += 180
        prev = d; out.append(d)
    return np.array(out)
rs_fit = np.arange(0.32, 0.80, 0.02)
cgl = np.array([np.degrees(delta00(r*r)) for r in rs_fit])
RS_ALL = np.arange(0.30, 0.9901, 0.0025)
def resid(p, r982=0.982):
    tc = TCDR(api=p[0], ak=p[1], b=p[2])
    d = delta_curve(tc, RS_ALL)
    return np.concatenate([(np.interp(rs_fit, RS_ALL, d) - cgl) / 2.0, [(np.interp(r982, RS_ALL, d) - 180.0) / 5.0]])
if __name__ == "__main__":
    best=None
    for a0 in (-2.0, -1.0, 0.0):
        for k0 in (-2.0, -1.0, 0.0):
            for b0 in (-0.4, 0.0):
                try: r = least_squares(resid, [a0, k0, b0], bounds=([-6, -6, -1.5], [4, 4, 1.5]))
                except Exception: continue
                if best is None or r.cost < best.cost: best = r
    print("best", list(best.x), "cost", best.cost, "max|res|", np.max(np.abs(best.fun)))
    tc = TCDR(api=best.x[0], ak=best.x[1], b=best.x[2])
    grid = np.arange(0.30, 2.0001, 0.0025); d = delta_curve(tc, grid)
    for r in [0.4,0.5,0.6,0.7,0.8,0.9,0.95,0.98,0.99,1.0,1.02,1.05,1.1,1.2,1.3,1.4,1.5,1.7,2.0]:
        i = np.argmin(abs(grid-r)); _, eta, Sm = tc.phases(r*r)
        cg = np.degrees(delta00(r*r)) if r < 0.8 else float('nan')
        print(f"{r:.3f}  delta {d[i]:6.1f}  CGL {cg:6.1f}  eta {eta:.3f}  |S12| {abs(Sm[0,1]) if r>0.9914 else 0:.3f}")
    ss = np.linspace(-5.0, 4*MPI**2*0.999, 4000)
    dets = np.array([np.linalg.det(tc._Dreal(s)) for s in ss])
    print("det D (s<4mpi^2): min", dets.min(), "max", dets.max(), "sign changes", np.sum(np.diff(np.sign(dets))!=0))
