import numpy as np, sys, warnings
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_2ch import RateModel2ch
from neff_model import RateModel
from scipy.special import kn
d = dict(np.load("ffcache/A.npz"))
r2 = RateModel2ch(d); r1 = RateModel(hadrons="omnes"); r0 = RateModel(hadrons="LO")
def dense(T, m, f2, nr):
    rs = np.linspace(2*m*1.000001, 60*T, 200000); s = rs*rs
    lam = s*(s-4*m*m); x = rs/T
    integrand = s*np.sqrt(lam)/rs*kn(1, x)*nr*f2(rs) * (2*rs)  # ds = 2 rs drs ; gg uses d ln s -> s factor; here ds directly
    # gg_integral: S T/(64 pi^4) int ds sqrt(lam)/sqrt(s) K1 M2 /(16pi); above integrand has extra s from dlns -> remove
    integrand = np.sqrt(lam)/rs*kn(1,x)*nr*f2(rs)*(2*rs)
    return 0.5*T/(64*np.pi**4)*np.trapezoid(integrand, rs)/(16*np.pi)
print(" T(MeV)   pi: LO      1ch-Omnes   2ch-A   (dense check) | K: LO     2ch-A  | had total 1ch  2ch-A  ratio")
for T in [0.06, 0.08, 0.10, 0.12, 0.14, 0.155, 0.17]:
    c0 = r0.channels(T); c1 = r1.channels(T); c2 = r2.channels(T)
    dn = dense(T, 0.138, lambda rs: np.exp(r2._tp(rs)), 3)
    h1 = sum(c1[k] for k in ("pi","K","eta","etap") if k in c1); h2 = sum(c2[k] for k in ("pi","K","eta","etap") if k in c2)
    print(f"{T*1e3:5.0f}  {c0['pi']:.3e} {c1['pi']:.3e} {c2['pi']:.3e} ({dn:.3e}) | {c0['K']:.3e} {c2['K']:.3e} | {h1:.3e} {h2:.3e} {h2/h1:.3f}")
