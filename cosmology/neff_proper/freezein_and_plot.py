"""Freeze-in (low T_RH) scan and the summary figure. Reads scan_results.json (from scan.py)."""
import numpy as np, json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from neff_model import RateModel, dNeff_instant, PI
from neff_calc import g_s, hubble

res = json.load(open("scan_results.json"))
MS = [3, 4, 5, 6, 8, 10]

# ---------------- freeze-in: start with n = rho = 0 at T_RH (instantaneous reheating, radiation domination)
rm = RateModel(hadrons="omnes").build()
TRH = [0.03, 0.05, 0.07, 0.1, 0.13, 0.16, 0.2, 0.3, 0.5, 1.0, 3.0]
import os
fi = {}
if os.path.exists("freezein_results.json"):
    fi = {int(k): v for k, v in json.load(open("freezein_results.json")).items()}
for MTeV in ([] if fi else [4, 5, 6, 8]):
    row = []
    for T in TRH:
        s0 = rm.solve(MTeV * 1e3, T_start=T, start_frac=0.0)
        s1 = rm.solve(MTeV * 1e3, T_start=T, start_frac=0.0, elastic=1.0)
        row.append((T, s0["dNeff_final"], s1["dNeff_final"]))
    fi[MTeV] = row
    print(f"M={MTeV} TeV freeze-in: " + "  ".join(f"TRH={T*1e3:.0f}MeV:{a:.3f}/{b:.3f}" for T, a, b in row), flush=True)
json.dump({str(k): v for k, v in fi.items()}, open("freezein_results.json", "w"), indent=1)

# ---------------- bands
def arr(v, key):
    return np.array([res[v]["M"][str(m)][key] for m in MS])

central = 0.5 * (arr("central", "dN_boltz") + arr("central", "dN_boltz_el"))
lo = np.minimum.reduce([arr(v, "dN_boltz") for v in res])                      # lowest over variants, no elastic
hi = np.maximum.reduce([arr(v, "dN_boltz_el") for v in res])                   # highest over variants, with elastic
lo_had = arr("LO-hadrons", "dN_boltz")
hi_had = arr("had x3", "dN_boltz_el")
inst = arr("central", "dN_inst")
rough = np.array([0.392, 0.304, 0.056, 0.056, 0.056, 0.056])

print("\nM   central   band(lo-hi)   LO-had   had x3+el   instantaneous   rough")
for i, m in enumerate(MS):
    print(f"{m:2d}   {central[i]:.3f}   {lo[i]:.3f}-{hi[i]:.3f}   {lo_had[i]:.3f}   {hi_had[i]:.3f}   {inst[i]:.3f}   {rough[i]:.3f}")

# ---------------- figure
fig, axs = plt.subplots(1, 3, figsize=(15, 4.8))
ax = axs[0]
Ts = np.logspace(-2, 1.5, 200)
for MTeV, c in [(3, "#7b3294"), (5, "#c2a5cf"), (6, "#1b7837"), (8, "#5aae61"), (10, "#a6dba0")]:
    ax.loglog(Ts * 1e3, [rm.Gamma_over_H(T, MTeV * 1e3) for T in Ts], color=c, lw=1.8, label=f"M = {MTeV} TeV")
ax.axhline(1, color="k", lw=0.8, ls="--")
ax.axvspan(140, 170, color="0.85", zorder=0)
ax.set_xlabel("T [MeV]"); ax.set_ylabel(r"$\Gamma_{\phi\phi\leftrightarrow X}/H$")
ax.set_ylim(1e-3, 1e4); ax.set_xlim(10, 3e4)
ax.set_title("Pair-interaction rate vs Hubble (central model)")
ax.legend(fontsize=8, loc="upper left")
ax.text(155, 2e-3, "crossover", ha="center", fontsize=8, color="0.4")

ax = axs[1]
Mg = np.array(MS, float)
ax.fill_between(Mg, lo, hi, color="#c6dbef", label="full band (all variants; MB stats, w/o and w/ elastic exchange)")
ax.fill_between(Mg, lo_had, hi_had, color="#6baed6", alpha=0.7, label="hadronic-rate band (LO ChPT … ×3 Omnès)")
ax.plot(Mg, central, "k-o", lw=2, label="central (Omnès ππ; mean of energy-exchange treatments)")
ax.plot(Mg, inst, "k:", lw=1, label=r"instantaneous $\Gamma=H$ criterion (central rates)")
ax.plot(Mg, rough, color="0.5", ls="--", lw=1, label="rough estimate (Sep 26, superseded)")
for lim, lab, c in [(0.107, "Goldstein–Hill 2026 BBN+CMB+BAO 95%", "#d62728"), (0.131, "CMB-SPA 2025 (SPT+ACT+Planck)", "#ff7f0e"),
                    (0.162, "ACT DR6 P-ACT-LB", "#e7ba52"), (0.30, "Planck 2018+BAO", "0.4")]:
    ax.axhline(lim, color=c, lw=1.2, ls="-.")
    ax.text(2.9, lim + 0.004, lab, fontsize=7, va="bottom", color=c)
ax.set_xlabel("M [TeV]"); ax.set_ylabel(r"$\Delta N_{\rm eff}$"); ax.set_ylim(0, 0.45); ax.set_xlim(2.8, 10.2)
ax.set_title(r"Thermal-relic $\Delta N_{\rm eff}$ (standard thermal history, $T_{\rm RH}\gtrsim 1$ GeV)")
ax.legend(fontsize=6.5, loc="upper right")

ax = axs[2]
for MTeV, c in [(4, "#7b3294"), (5, "#c2a5cf"), (6, "#1b7837"), (8, "#5aae61")]:
    row = np.array(fi[MTeV])
    ax.semilogx(row[:, 0] * 1e3, 0.5 * (row[:, 1] + row[:, 2]), "-o", color=c, ms=3, label=f"M = {MTeV} TeV")
    ax.fill_between(row[:, 0] * 1e3, row[:, 1], row[:, 2], color=c, alpha=0.2)
ax.axhline(0.107, color="#d62728", lw=1.2, ls="-.")
ax.set_xlabel(r"$T_{\rm RH}$ [MeV]  (instantaneous reheating, $n_\phi(T_{\rm RH})=0$)", fontsize=9); ax.set_ylabel(r"$\Delta N_{\rm eff}$")
ax.set_title("Freeze-in, low reheating temperature (central rates)"); ax.legend(fontsize=8); ax.set_ylim(0, 0.35)
plt.tight_layout()
plt.savefig("neff_vs_M.png", dpi=170)
print("saved neff_vs_M.png")
