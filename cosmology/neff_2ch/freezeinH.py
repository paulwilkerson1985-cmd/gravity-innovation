import numpy as np, sys, json, warnings
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from neff_2ch import RateModel2ch
rm = RateModel2ch(dict(np.load("ffcache/H.npz"))).build()
TRH = [0.07, 0.1, 0.13, 0.16, 0.2, 0.3, 0.5, 1.0, 3.0]
out = {}
for M in [5, 6, 7, 8]:
    row = []
    for T in TRH:
        a = rm.solve(M * 1e3, T_start=T, start_frac=0.0)["dNeff_final"]
        b = rm.solve(M * 1e3, T_start=T, start_frac=0.0, elastic=1.0)["dNeff_final"]
        row.append([T, a, b, 0.5 * (a + b)])
    out[str(M)] = row
    print(f"M={M}: " + "  ".join(f"{T*1e3:.0f}:{m:.3f}" for T, a, b, m in row), flush=True)
json.dump(out, open("freezeinH_results.json", "w"), indent=1)
