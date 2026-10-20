import json, numpy as np
r = json.load(open("scanH_results.json"))
MS = [3, 4, 5, 6, 7, 8, 9, 10]
def curve(name, key="dN_mean"):
    return np.array([r[name][str(m)][key] for m in MS])
cen = curve("H")
HAD = [k for k in r if k != "H" and not any(x in k for x in ("qgp", "mu=", "Tc", "dT", "gs"))]
QGP = [k for k in r if any(x in k for x in ("qgp", "mu=", "Tc", "dT", "gs"))]
print("hadronic variants:", HAD); print("QGP/EoS variants:", QGP)
# envelopes (use no-elastic min and with-elastic max for the outer band, as in the original analysis)
def env(names, lo_key="dN", hi_key="dN_el"):
    lo = np.min([curve(n, lo_key) for n in names + ["H"]], axis=0)
    hi = np.max([curve(n, hi_key) for n in names + ["H"]], axis=0)
    return lo, hi
hl, hh = env(HAD); ql, qh = env(QGP)
lo = cen - np.sqrt((cen - hl) ** 2 + (cen - ql) ** 2)
hi = cen + np.sqrt((hh - cen) ** 2 + (qh - cen) ** 2)
lo_env = np.minimum(hl, ql); hi_env = np.maximum(hh, qh)
old_c = {3: 0.35, 4: 0.30, 5: 0.24, 6: 0.17, 8: 0.094, 10: 0.067}
old_b = {3: (0.30, 0.38), 4: (0.21, 0.35), 5: (0.14, 0.32), 6: (0.10, 0.27), 8: (0.07, 0.16), 10: (0.056, 0.10)}
print("\n M   central  had-env      qgp-env      band(quad)     band(env)    | old central (band)")
for i, m in enumerate(MS):
    o = f"{old_c[m]:.3f} ({old_b[m][0]:.3f}-{old_b[m][1]:.3f})" if m in old_c else ""
    print(f"{m:2d}   {cen[i]:.3f}   {hl[i]:.3f}-{hh[i]:.3f}  {ql[i]:.3f}-{qh[i]:.3f}  {lo[i]:.3f}-{hi[i]:.3f}  {lo_env[i]:.3f}-{hi_env[i]:.3f} | {o}")
def mexcl(c, lim):
    # log-log interpolation of dN(M) to find dN = lim (dN decreasing in M)
    lM = np.log(MS); lc = np.log(c)
    for i in range(len(MS) - 1):
        if c[i] >= lim >= c[i + 1]:
            f = (np.log(lim) - lc[i]) / (lc[i + 1] - lc[i]); return float(np.exp(lM[i] + f * (lM[i + 1] - lM[i])))
    return None if c[-1] > lim else (float('nan') if c[0] < lim else None)
print("\nlimit   M_excl central [band quad] [band env]")
for lim in (0.107, 0.13, 0.16, 0.20, 0.30):
    print(f"{lim:.3f}   {mexcl(cen, lim)}   [{mexcl(lo, lim)} - {mexcl(hi, lim)}]   [{mexcl(lo_env, lim)} - {mexcl(hi_env, lim)}]")
print("\nper-variant M_excl at 0.107 (mean of energy treatments):")
for k in sorted(r):
    print(f"  {k:18s} {mexcl(curve(k), 0.107)}")
json.dump(dict(MS=MS, central=cen.tolist(), lo=lo.tolist(), hi=hi.tolist(), lo_env=lo_env.tolist(), hi_env=hi_env.tolist(),
               had=[hl.tolist(), hh.tolist()], qgp=[ql.tolist(), qh.tolist()]), open("bandsH.json", "w"), indent=1)
