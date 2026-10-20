"""Build tabulated |theta_pi(s)|^2, |theta_K(s)|^2 for each two-channel variant; cache to npz."""
import numpy as np, sys, time, json, os
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from formfactors import models
from tinput import TInput
from mo_solver import MOSolver
from run_two import FF
MPI, MK = 0.13957, 0.4957
VARIANTS = {
  "A":          dict(model="A", um=1.3, ua=2.0, sp=1.0, sk=1.0, h=0.001),
  "A-h0.002":   dict(model="A", um=1.3, ua=2.0, sp=1.0, sk=1.0, h=0.002),
  "B":          dict(model="B", um=1.3, ua=2.0, sp=1.0, sk=1.0, h=0.001),
  "A-um1.2":    dict(model="A", um=1.2, ua=2.0, sp=1.0, sk=1.0, h=0.001),
  "A-um1.4":    dict(model="A", um=1.4, ua=2.0, sp=1.0, sk=1.0, h=0.001),
  "A-ua1.6":    dict(model="A", um=1.3, ua=1.6, sp=1.0, sk=1.0, h=0.001),
  "A-ua2.5":    dict(model="A", um=1.3, ua=2.5, sp=1.0, sk=1.0, h=0.001),
  "A-sk0.8":    dict(model="A", um=1.3, ua=2.0, sp=1.0, sk=0.8, h=0.001),
  "A-sk1.2":    dict(model="A", um=1.3, ua=2.0, sp=1.0, sk=1.2, h=0.001),
  "A-sp0.95":   dict(model="A", um=1.3, ua=2.0, sp=0.95, sk=1.0, h=0.001),
  "A-sp1.05":   dict(model="A", um=1.3, ua=2.0, sp=1.05, sk=1.0, h=0.001),
  "B-sk0.8":    dict(model="B", um=1.3, ua=2.0, sp=1.0, sk=0.8, h=0.001),
  "B-sk1.2":    dict(model="B", um=1.3, ua=2.0, sp=1.0, sk=1.2, h=0.001),
}
RS = np.concatenate([np.arange(2*MPI + 1e-4, 2.6, 0.0005), np.exp(np.linspace(np.log(2.6), np.log(12.0), 300))])
def build(name, cache_dir="ffcache"):
    os.makedirs(cache_dir, exist_ok=True)
    fn = os.path.join(cache_dir, name + ".npz")
    if os.path.exists(fn):
        return dict(np.load(fn))
    v = VARIANTS[name]
    ms = models()
    ti = TInput(ms[v["model"]], um=v["um"], ua=v["ua"])
    mo = MOSolver(ti, nch=2, ua=v["ua"], h=v["h"]).solve()
    # form factors: slopes enter only through the polynomial, so build per slope
    ff = FF(mo, slope_pi=v["sp"], slope_k=v["sk"])
    thp = np.zeros(len(RS)); thk = np.zeros(len(RS))
    for i, rs in enumerate(RS):
        a = ff.theta(rs * rs)
        thp[i] = abs(a[0]) ** 2; thk[i] = abs(a[1]) ** 2
    out = dict(rs=RS, thpi2=thp, thk2=thk, svals=mo.svals)
    np.savez(fn, **out)
    return out
if __name__ == "__main__":
    names = sys.argv[1:] or list(VARIANTS)
    for n in names:
        t0 = time.time(); d = build(n)
        i7 = np.argmin(abs(d["rs"] - 0.7)); i9 = np.argmin(abs(d["rs"] - 0.97)); i11 = np.argmin(abs(d["rs"] - 1.1)); i15 = np.argmin(abs(d["rs"] - 1.5))
        print(f"{n:11s} {time.time()-t0:5.0f}s |th_pi|^2 @0.7,0.97,1.1,1.5: {d['thpi2'][i7]:.3f} {d['thpi2'][i9]:.3f} {d['thpi2'][i11]:.3f} {d['thpi2'][i15]:.3f}  |th_K|^2 @1.1,1.5: {d['thk2'][i11]:.3f} {d['thk2'][i15]:.3f}", flush=True)
