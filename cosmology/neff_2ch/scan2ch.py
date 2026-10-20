"""Delta N_eff scan with two-channel form factors.  Writes scan2ch_results.json (merges)."""
import numpy as np, sys, json, time, warnings, os
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_2ch import RateModel2ch
import neff_calc
from neff_model import PI
MS = [3, 4, 5, 6, 7, 8, 9, 10]
# (form-factor table, extra RateModel kwargs)
RUNS = {
  "2ch-A":            ("A", {}),
  "2ch-A-h0.002":     ("A-h0.002", {}),
  "2ch-B":            ("B", {}),
  "2ch-A-um1.2":      ("A-um1.2", {}),
  "2ch-A-um1.4":      ("A-um1.4", {}),
  "2ch-A-ua1.6":      ("A-ua1.6", {}),
  "2ch-A-ua2.5":      ("A-ua2.5", {}),
  "2ch-A-sk0.8":      ("A-sk0.8", {}),
  "2ch-A-sk1.2":      ("A-sk1.2", {}),
  "2ch-A-sp0.95":     ("A-sp0.95", {}),
  "2ch-A-sp1.05":     ("A-sp1.05", {}),
  "2ch-B-sk0.8":      ("B-sk0.8", {}),
  "2ch-B-sk1.2":      ("B-sk1.2", {}),
  "2ch-A-stat1.3":    ("A", dict(stat_fac=1.3)),
  "2ch-A-qgp3":       ("A", dict(qgp_fac=3.0)),
  "2ch-A-qgp0.5":     ("A", dict(qgp_fac=0.5)),
  "2ch-A-mu=piT":     ("A", dict(mu_fac=PI)),
  "2ch-A-mu=4piT":    ("A", dict(mu_fac=4*PI)),
  "2ch-A-Tc150":      ("A", dict(Tc=0.150)),
  "2ch-A-Tc160":      ("A", dict(Tc=0.160)),
  "2ch-A-dT30":       ("A", dict(dT=0.030)),
  "2ch-A-gs+1":       ("A", dict(gs_shift=1.0)),
  "2ch-A-gs-1":       ("A", dict(gs_shift=-1.0)),
  "2ch-A-frozen":     ("A-frozen", {}),
  "2ch-A-falling":    ("A-falling", {}),
  "2ch-A-LOgrowth":   ("A-LOgrowth", {}),
  "2ch-B-frozen":     ("B-frozen", {}),
  "2ch-B-falling":    ("B-falling", {}),
  "2ch-B-LOgrowth":   ("B-LOgrowth", {}),
}
if __name__ == "__main__":
    sel = sys.argv[1:] or list(RUNS)
    fn = "scan2ch_results.json"
    res = json.load(open(fn)) if os.path.exists(fn) else {}
    for name in sel:
        tab, kw = RUNS[name]
        p = f"ffcache/{tab}.npz"
        if not os.path.exists(p):
            print("missing", p); continue
        t0 = time.time()
        rm = RateModel2ch(dict(np.load(p)), label=name, **kw).build()
        out = {}
        for m in MS:
            a = rm.solve(m * 1e3)["dNeff_final"]; b = rm.solve(m * 1e3, elastic=1.0)["dNeff_final"]
            out[str(m)] = dict(dN=a, dN_el=b, dN_mean=0.5 * (a + b))
        neff_calc.GS_SHIFT = 0.0
        res[name] = out
        json.dump(res, open(fn, "w"), indent=1)
        print(f"[{time.time()-t0:4.0f}s] {name:16s} " + " ".join(f"{m}:{out[str(m)]['dN_mean']:.3f}" for m in MS), flush=True)
