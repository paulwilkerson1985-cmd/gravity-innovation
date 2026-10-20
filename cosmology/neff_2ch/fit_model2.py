import numpy as np, sys
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from twochannel import *
from neff_model import delta00
from scipy.optimize import least_squares

class TC3(TwoChannel):
    """LO kernels, channel-dependent cutoffs (q_pi for the pi pi loop, q_K for the K Kbar loop), optional
    V11 *= (1 + b s)."""
    def __init__(self, qpi=1.0, qk=1.0, b=0.0, **kw):
        self.qpi, self.qk, self.b = qpi, qk, b
        super().__init__(qmax=qk, **kw)
    def V(self, s):
        v = super().V(s)
        v[0, 0] *= (1 + self.b * s)
        return v
    def Gt(self, s):
        return np.diag([-16 * PI * G_oo(s, self.mpi, self.qpi), -16 * PI * G_oo(s, self.mk, self.qk)])
    def _Dreal(self, s):
        if abs(s) < 1e-12: s = 1e-12
        if s > 0: return self.D(s).real
        Gs = []
        for m, q in ((self.mpi, self.qpi), (self.mk, self.qk)):
            a = np.sqrt(1 + m * m / q ** 2); sg = np.sqrt(1 - 4 * m * m / s)
            Gs.append((sg * np.log((sg * a + 1) / (sg * a - 1)) - 2 * np.log(q / m * (1 + a))) / (16 * PI ** 2))
        return np.eye(2) - self.V(s) @ np.diag([-16 * PI * Gs[0], -16 * PI * Gs[1]])

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
def resid(p, withb):
    qpi, qk = p[:2]; b = p[2] if withb else 0.0
    tc = TC3(qpi=qpi, qk=qk, b=b)
    d = delta_curve(tc, RS_ALL)
    d_fit = np.interp(rs_fit, RS_ALL, d)
    d982 = np.interp(0.982, RS_ALL, d)
    return np.concatenate([(d_fit - cgl) / 2.0, [(d982 - 180.0) / 5.0]])
if __name__ == "__main__":
    for withb in (False, True):
        best=None
        for qp in (0.4, 0.6, 0.8):
            for qk in (0.8, 1.0, 1.2):
                x0 = [qp, qk] + ([0.0] if withb else [])
                lb = [0.2, 0.5] + ([-1.0] if withb else []); ub = [2.0, 2.5] + ([1.0] if withb else [])
                try:
                    r = least_squares(resid, x0, args=(withb,), bounds=(lb, ub))
                except Exception as e:
                    continue
                if best is None or r.cost < best.cost: best = r
        print("withb", withb, "best", best.x, "cost", best.cost, "max|res|", np.max(np.abs(best.fun)))
