"""Scan variants x M: Gamma/H, T_dec, Delta N_eff (instantaneous and Boltzmann). Writes scan_results.json."""
import numpy as np, json, time, sys
from neff_model import RateModel, dNeff_instant, PI
import neff_calc

MS = [3, 4, 5, 6, 8, 10]

def K_upper(T, Tc=0.155):   # QGP K-factor variant (non-perturbative enhancement near Tc)
    return 1 + 4 * np.exp(-(T - Tc) / Tc) if T > Tc else 5.0

variants = {
    "central":        dict(hadrons="omnes"),
    "LO-hadrons":     dict(hadrons="LO"),
    "HRG":            dict(hadrons="HRG"),
    "HRG-massonly":   dict(hadrons="HRG-massonly"),
    "had x0.5":       dict(hadrons="omnes", had_fac=0.5),
    "had x3":         dict(hadrons="omnes", had_fac=3.0),
    "qgp x3":         dict(hadrons="omnes", qgp_fac=3.0),
    "qgp x0.5":       dict(hadrons="omnes", qgp_fac=0.5),
    "mu=piT":         dict(hadrons="omnes", mu_fac=PI),
    "mu=4piT":        dict(hadrons="omnes", mu_fac=4*PI),
    "dT=30MeV":       dict(hadrons="omnes", dT=0.030),
    "dT=8MeV":        dict(hadrons="omnes", dT=0.008),
    "Tc=150":         dict(hadrons="omnes", Tc=0.150),
    "Tc=160":         dict(hadrons="omnes", Tc=0.160),
    "sum-phases":     dict(hadrons="omnes", combine="sum"),
    "gs+1sig":        dict(hadrons="omnes", gs_shift=+1.0),
    "gs-1sig":        dict(hadrons="omnes", gs_shift=-1.0),
    "no-Higgs":       dict(hadrons="omnes", higgs=False),
}
sel = sys.argv[1:] or list(variants)
results = {}
try:
    results = json.load(open("scan_results.json"))
except Exception:
    pass
for name in sel:
    kw = variants[name]
    t0 = time.time()
    rm = RateModel(label=name, **kw).build()
    res = {"label": name, "kw": {k: (v if not isinstance(v, float) else float(v)) for k, v in kw.items()}, "M": {}}
    # store Gamma/H curve for M=5
    Ts = np.logspace(-2.3, 1.7, 120)
    res["GoverH_5TeV"] = [[float(T), float(rm.Gamma_over_H(T, 5e3))] for T in Ts]
    for MTeV in MS:
        M = MTeV * 1e3
        Td, r, Tg = rm.T_dec(M)
        sol = rm.solve(M)
        sole = rm.solve(M, elastic=1.0)
        res["M"][str(MTeV)] = dict(Tdec_MeV=(Td * 1e3 if Td else None),
                                  dN_inst=(dNeff_instant(Td) if Td else None),
                                  dN_boltz=sol["dNeff_final"], dN_boltz_el=sole["dNeff_final"],
                                  GoverH_min_100_300=float(min(rm.Gamma_over_H(T, M) for T in np.linspace(0.1, 0.3, 30))))
    results[name] = res
    neff_calc.GS_SHIFT = 0.0
    json.dump(results, open("scan_results.json", "w"), indent=1)
    print(f"[{time.time()-t0:5.0f}s] {name:14s} " + "  ".join(f"M{m}: Td={res['M'][str(m)]['Tdec_MeV'] and round(res['M'][str(m)]['Tdec_MeV']):>4} dN={res['M'][str(m)]['dN_boltz']:.3f}({res['M'][str(m)]['dN_inst'] and round(res['M'][str(m)]['dN_inst'],3)})" for m in MS), flush=True)
