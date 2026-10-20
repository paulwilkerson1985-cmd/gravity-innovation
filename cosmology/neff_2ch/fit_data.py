import numpy as np, sys, json, warnings
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from model_data import TCData
from neff_model import delta00
from pr2018 import phi as phi_pr, eta_from_g, MK
from scipy.optimize import least_squares
from tinput import unwrap_phases
rs_cgl = np.arange(0.32, 0.80, 0.02); cgl = np.array([np.degrees(delta00(r * r)) for r in rs_cgl])
rs_hi = np.arange(1.00, 1.401, 0.025)
def target_eta(fit):
    if fit == "avg": return np.array([0.5 * (eta_from_g(r, "CFD_B") + eta_from_g(r, "CFD_C")) for r in rs_hi])
    return np.array([eta_from_g(r, fit) for r in rs_hi])
PHI_T = np.array([0.5 * (phi_pr(r, "CFD_B") + phi_pr(r, "CFD_C")) for r in rs_hi])
def curves(p):
    tc = TCData(api=p[0], ak=p[1], c=p[2], d=p[3], g12=p[4], g22=p[5])
    us, d1, uk, d2 = unwrap_phases(tc, 1.41, du=0.0025)
    return tc, us, np.degrees(d1), uk, np.degrees(d2)
def resid(p, etafit, sig_eta):
    try:
        tc, us, d1, uk, d2 = curves(p)
    except Exception:
        return np.full(len(rs_cgl) + 1 + 2 * len(rs_hi), 1e3)
    r1 = (np.interp(rs_cgl, us, d1) - cgl) / 1.0
    r2 = [(np.interp(2 * MK + 1e-4, us, d1) - 226.5) / 2.0]
    phim = np.interp(rs_hi, us, d1) + np.interp(rs_hi, uk, d2)
    r3 = (phim - PHI_T) / 4.0
    etam = np.array([abs(tc.S(r * r)[0, 0]) for r in rs_hi])
    r4 = (etam - target_eta(etafit)) / sig_eta
    return np.concatenate([r1, r2, r3, r4])
if __name__ == "__main__":
    etafit = sys.argv[1] if len(sys.argv) > 1 else "avg"
    sig_eta = 0.15 if etafit == "avg" else 0.07
    x0s = [[-0.53, -1.62, 0.85, 0.047, 1.0, 1.0], [-0.53, -1.62, 0.85, 0.047, 1.2, 0.9], [-0.3, -1.2, 0.9, 0.0, 0.8, 1.1], [-0.8, -2.0, 0.8, 0.1, 1.0, 1.2]]
    best = None
    for x0 in x0s:
        try:
            r = least_squares(resid, x0, args=(etafit, sig_eta), bounds=([-4, -5, 0.3, -1, 0.2, 0.2], [3, 3, 2.5, 1, 3, 3]))
        except Exception as e:
            print("fail", e); continue
        if best is None or r.cost < best.cost: best = r
    p = best.x
    print("eta target", etafit, "params", [round(v, 5) for v in p], "cost", round(best.cost, 3), "max|res|", round(np.max(np.abs(best.fun)), 2))
    tc, us, d1, uk, d2 = curves(p)
    print(" rs     d1     d2    phi  phi_PR | eta  eta_target  (CGL below 0.8)")
    for r in [0.4, 0.5, 0.6, 0.7, 0.78, 0.85, 0.9, 0.95, 0.97, 0.98, 0.99, 0.9915, 1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4]:
        a = np.interp(r, us, d1); b = np.interp(r, uk, d2) if r >= 2 * MK else 0.0
        eta = abs(tc.S(r * r)[0, 0])
        pt = 0.5 * (phi_pr(r, "CFD_B") + phi_pr(r, "CFD_C")) if r >= 2 * MK else float("nan")
        et = (0.5 * (eta_from_g(r, "CFD_B") + eta_from_g(r, "CFD_C")) if etafit == "avg" else eta_from_g(r, etafit)) if r >= 2 * MK else float("nan")
        cg = np.degrees(delta00(r * r)) if r < 0.8 else float("nan")
        print(f"{r:.4f} {a:6.1f} {b:6.1f} {a+b:6.1f} {pt:6.1f} | {eta:.3f} {et:.3f}   {cg:6.1f}")
    json.dump(dict(etafit=etafit, params=list(p), cost=best.cost), open(f"fit_data_{etafit}.json", "w"))
    # ghost check (s < 4 mpi^2 down to -30 GeV^2)
    ss = np.linspace(-30.0, 4 * 0.13957 ** 2 * 0.999, 6000)
    dets = np.array([np.linalg.det(tc._Dreal(s)) for s in ss])
    print("det D sign changes on s<4mpi^2:", int(np.sum(np.diff(np.sign(dets)) != 0)), "(irrelevant for the MO solution; reported for completeness)")
