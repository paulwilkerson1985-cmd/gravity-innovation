"""Form-factor tables for the hybrid (data-constrained) input variants."""
import numpy as np, sys, time, os, warnings
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from tinput_hybrid import TInputHybrid, load_model, PI
from mo_solver import MOSolver
from run_two import FF
from ffvariants import RS
V = {
 "H":          dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-B":        dict(fit="CFD_B", eta="CFD_B", phi="CFD_B", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-C":        dict(fit="CFD_C", eta="CFD_C", phi="CFD_C", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-2pi0":     dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=2*PI, d2i=0.0, sp=1.0, sk=1.0, d1s=0.0),
 "H-ua1.8":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=1.8, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-ua2.5":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.5, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-um1.3":    dict(fit="avg", eta="avg", phi="avg", um=1.30, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=0.0),
 "H-d1+10":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=10.0),
 "H-d1-10":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.0, d1s=-10.0),
 "H-sk0.8":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=0.8, d1s=0.0),
 "H-sk1.2":    dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.0, sk=1.2, d1s=0.0),
 "H-sp0.95":   dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=0.95, sk=1.0, d1s=0.0),
 "H-sp1.05":   dict(fit="avg", eta="avg", phi="avg", um=1.47, ua=2.0, d1i=PI, d2i=PI, sp=1.05, sk=1.0, d1s=0.0),
}
def build(name, h=0.001):
    fn = f"ffcache/{name}.npz"
    if os.path.exists(fn): return dict(np.load(fn))
    v = V[name]
    ti = TInputHybrid(load_model(v["fit"]), um=v["um"], ua=v["ua"], d1inf=v["d1i"], d2inf=v["d2i"], etafit=v["eta"], phifit=v["phi"], d1shift_deg=v["d1s"])
    mo = MOSolver(ti, nch=2, ua=v["ua"], h=h).solve()
    ff = FF(mo, slope_pi=v["sp"], slope_k=v["sk"])
    thp = np.array([abs(ff.theta(r * r)[0]) ** 2 for r in RS]); thk = np.array([abs(ff.theta(r * r)[1]) ** 2 for r in RS])
    out = dict(rs=RS, thpi2=thp, thk2=thk, svals=mo.svals); np.savez(fn, **out)
    return out
if __name__ == "__main__":
    for n in (sys.argv[1:] or list(V)):
        t0 = time.time(); d = build(n)
        g = lambda r, k: d[k][np.argmin(abs(d["rs"] - r))]
        print(f"{n:9s} {time.time()-t0:4.0f}s svals {d['svals'][-3]:.1e}/{d['svals'][-2]:.1e} |th_pi|^2 @0.5,0.7,0.8,0.9,0.97,1.1: " +
              " ".join(f"{g(r,'thpi2'):.3f}" for r in (0.5, 0.7, 0.8, 0.9, 0.97, 1.1)) + f"  |th_K|^2 @1.0,1.1,1.3: {g(1.0,'thk2'):.2f} {g(1.1,'thk2'):.2f} {g(1.3,'thk2'):.2f}", flush=True)
