"""Delta N_eff scan for the hybrid (data-constrained) form factors. Merges into scanH_results.json."""
import numpy as np, sys, json, time, warnings, os
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_2ch import RateModel2ch
import neff_calc
from neff_model import PI
MS = [3, 4, 5, 6, 7, 8, 9, 10]
RUNS = {k: (k, {}) for k in ["H", "H-B", "H-C", "H-2pi0", "H-ua1.8", "H-ua2.5", "H-um1.3", "H-d1+10", "H-d1-10",
                              "H-sk0.8", "H-sk1.2", "H-sp0.95", "H-sp1.05", "H-frozen"]}
RUNS.update({
  "H-stat1.3": ("H", dict(stat_fac=1.3)),
  "H-qgp3": ("H", dict(qgp_fac=3.0)), "H-qgp0.5": ("H", dict(qgp_fac=0.5)),
  "H-mu=piT": ("H", dict(mu_fac=PI)), "H-mu=4piT": ("H", dict(mu_fac=4 * PI)),
  "H-Tc150": ("H", dict(Tc=0.150)), "H-Tc160": ("H", dict(Tc=0.160)), "H-dT30": ("H", dict(dT=0.030)),
  "H-gs+1": ("H", dict(gs_shift=1.0)), "H-gs-1": ("H", dict(gs_shift=-1.0)),
})
if __name__ == "__main__":
    sel = sys.argv[1:] or list(RUNS)
    fn = "scanH_results.json"
    res = json.load(open(fn)) if os.path.exists(fn) else {}
    for name in sel:
        tab, kw = RUNS[name]
        p = f"ffcache/{tab}.npz"
        if not os.path.exists(p): print("missing", p); continue
        t0 = time.time()
        rm = RateModel2ch(dict(np.load(p)), label=name, **kw).build()
        out = {}
        for m in MS:
            a = rm.solve(m * 1e3)["dNeff_final"]; b = rm.solve(m * 1e3, elastic=1.0)["dNeff_final"]
            out[str(m)] = dict(dN=a, dN_el=b, dN_mean=0.5 * (a + b))
        neff_calc.GS_SHIFT = 0.0
        res[name] = out; json.dump(res, open(fn, "w"), indent=1)
        print(f"[{time.time()-t0:4.0f}s] {name:12s} " + " ".join(f"{m}:{out[str(m)]['dN_mean']:.3f}" for m in MS), flush=True)
