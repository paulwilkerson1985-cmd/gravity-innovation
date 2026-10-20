import numpy as np, sys
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from model_dr2 import TCDR2
from fit_model2 import TC3
from neff_model import omnes_sq
MPI, MK = 0.13957, 0.4957
PA = dict(api=-0.532134929161736, ak=-1.6172497937707146, c=0.8524662928570524, d=0.04672238009882778)  # model A (DR loops)
PB = dict(qpi=0.68378489, qk=1.33674323, b=-0.36015915)                                                   # model B (cutoff loops)
def models(slope_pi=1.0, slope_k=1.0):
    return {"A": TCDR2(slope_pi=slope_pi, slope_k=slope_k, **PA), "B": TC3(slope_pi=slope_pi, slope_k=slope_k, **PB)}
if __name__ == "__main__":
    ms = models()
    print(" rs    |th_pi|A  |th_pi|B  1ch-omnes   LO(s+2m2)   |th_K|A  |th_K|B   LO_K")
    for rs in [0.3,0.4,0.5,0.6,0.7,0.8,0.85,0.9,0.95,0.97,0.98,0.99,1.0,1.02,1.05,1.1,1.2,1.3,1.35,1.4,1.5]:
        s = rs*rs
        tA = ms["A"].theta(s); tB = ms["B"].theta(s)
        om = np.sqrt(omnes_sq(s))*(s+2*MPI**2)
        print(f"{rs:.2f}  {abs(tA[0]):8.3f} {abs(tB[0]):8.3f}  {om:8.3f}   {s+2*MPI**2:8.3f}   {abs(tA[1]):8.3f} {abs(tB[1]):8.3f}  {s+2*MK**2:7.3f}")
    # check normalization at s ~ 0
    for k,m in ms.items():
        print(k, "theta(1e-6):", m.theta(1e-6), " expected", 2*MPI**2, 2*MK**2)
