"""Wedge map v2 for the density-gated scalar (symmetron benchmark) large-vacuum proposal (Gravity Innovation, 2026-09-27).
Panel A: where the field could hide (range 1/mu vs coupling M).
Panel B: how strong it could be (field strength v^2 vs range), with existing exclusions and proposed reach.
SN1987A (round 1, transport MC): floor ~3 (2.2-3.9), NN-only 3.5-6.0, central 5.3-7.9 -> 'M >~ 6 (5-8)';
thermal-relic Delta N_eff rough estimate: <~4 TeV disfavoured, 4-6 marginal; design factor S/S0 = 0.81 (3D 0.90 x hardware 0.90).
Output: figures/wedge_map.png (next to this script)."""
import os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

SURF = "#fcfcfb"; INK = "#0b0b0b"; INK2 = "#52514e"; MUTED = "#8a8984"; GRID = "#e6e5e1"
EXCL = "#dcdbd6"; EXCL2 = "#ecebe7"
BLUE = "#2a78d6"; BLUE_D = "#184f95"; ORANGE = "#eb6834"; AQUA = "#1baf7a"
NEFF_EDGE = "#9a99a6"; NEFF_TXT = "#5b5a6a"

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9.5, "axes.edgecolor": MUTED, "axes.labelcolor": INK,
    "xtick.color": INK2, "ytick.color": INK2, "axes.titlecolor": INK, "figure.facecolor": SURF,
    "axes.facecolor": SURF, "savefig.facecolor": SURF, "hatch.linewidth": 0.6,
})

fig, (axA, axB) = plt.subplots(1, 2, figsize=(12.5, 5.8), gridspec_kw={"wspace": 0.28})

# ---------------- Panel A ----------------
x = np.logspace(np.log10(1.0), np.log10(40.0), 400)      # 1/mu in cm
M_air = 3.65 * x                                          # TeV, air-pinning ceiling (mu*M < 7.2e7 eV^2)
M_floor, M_design, M_central, M_op = 3.0, 4.0, 6.0, 15.0
ylo, yhi = 1.0, 200.0

axA.fill_between(x, ylo, M_design, color=EXCL, lw=0, zorder=1)
axA.fill_between(x, np.maximum(M_air, ylo), yhi, color=EXCL2, lw=0, hatch="////", edgecolor="#cfcec8", zorder=1)
mask = M_air > M_design
axA.fill_between(x[mask], np.full(mask.sum(), M_design), M_air[mask], color=BLUE, alpha=0.16, lw=0, zorder=2)
mask2 = M_air > M_central
axA.fill_between(x[mask2], np.full(mask2.sum(), M_central), M_air[mask2], color=BLUE, alpha=0.22, lw=0, zorder=2)
axA.plot(x, M_air, color=INK2, lw=1.4, zorder=3)

# x < 2 cm: reachable by existing R <= 6 cm chambers, but no analysis published there
xs2 = x[(x <= 2.0) & (M_air > M_design)]
axA.fill_between(xs2, M_design, 3.65 * xs2, color="none", hatch="xxxx", edgecolor="#b9b8b2", lw=0, zorder=2.5)

# thermal-relic Delta N_eff marginal band (rough decoupling estimate)
axA.fill_between(x, 4.0, np.minimum(6.0, np.maximum(M_air, 4.0)), facecolor="none", hatch="\\\\\\\\",
                 edgecolor=NEFF_EDGE, lw=0, zorder=2.6)
axA.text(1.08, 5.05, "thermal-relic ΔN_eff: marginal (rough estimate)", color=NEFF_TXT, fontsize=7.4,
         va="center", zorder=5)

for yv, ls, lab, ytxt in [
    (M_floor, (0, (1, 2)), "≈3 TeV: SN floor, traceless channel only (2.2–3.9)", M_floor * 0.965),
    (M_design, "-", "4 TeV: design floor (NN-only SN bound 3.5–6; ΔN_eff ≈ 0.3)", M_design * 0.985),
    (M_central, "--", "≈6 TeV: central SN1987A bound (5–8; transport incl.; this work)", M_central * 1.05),
]:
    axA.axhline(yv, color=BLUE_D, lw=1.4, ls=ls, zorder=3)
    axA.text(1.08, ytxt, lab, color=INK, fontsize=7.8, va="bottom" if yv == M_central else "top", zorder=5)
axA.axhline(M_op, color=MUTED, lw=1.0, ls=(0, (4, 3)), zorder=3)
axA.text(1.08, M_op * 1.06, "15 TeV — Olive & Pospelov 2008 (rough estimate)", color=INK2, fontsize=7.8, va="bottom")

axA.text(24, 150, "Field on in room air;\nbounded only at ~10⁻³\nby in-air Cavendish work", color=INK2, fontsize=8.0,
         ha="center", va="top")
axA.text(6.5, 1.5, "Excluded by supernova energy loss (our re-derivation, transport included)", color=INK2,
         fontsize=7.8, ha="center")
axA.text(18, 11.6, "SURVIVING WEDGE", color=BLUE_D, fontsize=9.5, weight="bold", ha="center", va="bottom")
axA.text(18, 11.2, "no published test; a 1 m chamber covers\n≤ 10 cm fully, 15 cm at ~15% signal", color=BLUE_D,
         fontsize=7.8, ha="center", va="top")

for xc, lab in [(4, "0.3"), (7, "0.5"), (10, "0.7"), (15, "1.0"), (20, "1.3"), (30, "~1.9 m")]:
    axA.plot([xc, xc], [yhi / 1.25, yhi], color=INK2, lw=1.0, zorder=4)
    axA.text(xc, yhi * 1.05, lab, color=INK2, fontsize=7.6, ha="center", va="bottom")
axA.text(1.04, yhi * 1.05, "Chamber Ø (m):", color=INK2, fontsize=7.6, ha="left", va="bottom")

axA.set_xscale("log"); axA.set_yscale("log")
axA.set_xlim(1.0, 40.0); axA.set_ylim(ylo, yhi)
axA.set_xticks([1, 2, 4, 7, 10, 20, 30]); axA.set_xticklabels(["1", "2", "4", "7", "10", "20", "30"])
axA.set_yticks([1, 3, 10, 30, 100]); axA.set_yticklabels(["1", "3", "10", "30", "100"])
axA.set_xlabel("Field range 1/μ (cm)")
axA.set_ylabel("Coupling scale M (TeV)")
axA.set_title("A.  Where the field could hide", loc="left", fontsize=11, weight="bold", pad=34)
axA.grid(True, which="major", color=GRID, lw=0.6, zorder=0)
for s in ["top", "right"]: axA.spines[s].set_visible(False)

# ---------------- Panel B ----------------
def interp_log(xq, xs, ys):
    return np.exp(np.interp(np.log(xq), np.log(xs), np.log(ys)))

# HUST-09 exclusion (50 ppm column), 1.5-6 cm, our estimate x3
hx = np.array([1.5, 2, 3, 4, 5, 6]); hv = np.array([1.2e-8, 1.7e-8, 3.1e-8, 5.0e-8, 1.0e-7, 8.6e-7])
axB.fill_between(hx, hv, 1e-4, color=EXCL, lw=0, zorder=1)
axB.fill_between(hx, hv / 3, hv * 3, color="#c9c8c2", alpha=0.6, lw=0, zorder=2)
axB.plot(hx, hv, color=INK2, lw=1.2, zorder=3)
axB.text(2.3, 3e-7, "Excluded by HUST-09\n(Tu et al. 2010)\nour estimate, ×3", color=INK2, fontsize=8.0, ha="center")

# torsion-balance reach with S/S0 factor
S_OVER_S0 = 0.90 * 0.90
T1, T2 = 3.0e-11, 3.0e-13
Fx_1m = np.array([2, 4, 7, 10, 13, 15]); Ft_1m = np.array([1.58, 1.58, 1.44, 1.19, 0.60, 0.18])
Fx_15 = np.array([2, 4, 7, 10, 15, 20]); Ft_15 = np.array([1.58, 1.58, 1.45, 1.27, 1.02, 0.62])
x1 = np.logspace(np.log10(2), np.log10(15), 120)
x15 = np.logspace(np.log10(2), np.log10(20), 120)
def reach(F_tier, xq, xs, ys):
    return F_tier / (S_OVER_S0 * interp_log(xq, xs, ys))
axB.plot(x1, reach(T2, x1, Fx_1m, Ft_1m), color=BLUE, lw=2.0, zorder=4)
axB.plot(x15, reach(T2, x15, Fx_15, Ft_15), color=BLUE, lw=2.0, ls="--", zorder=4)
axB.plot(x1, reach(T1, x1, Fx_1m, Ft_1m), color=BLUE, lw=2.0, ls=(0, (1, 1.5)), zorder=4)
axB.text(2.05, 3.4e-13, "Tier 2 torsion, 3×10⁻¹³ N (—— 1 m, - - 1.5 m)", color=INK, fontsize=7.8, va="bottom")
axB.text(2.05, 4.5e-11, "Tier 1 torsion, 3×10⁻¹¹ N, 1 m chamber", color=INK, fontsize=7.8, va="bottom")

# dark-energy line V0 = rho_Lambda: v^2 = 4 rho_Lambda / mu^2 = 2.0e-11 N (1/mu / 10 cm)^2
xl = np.logspace(np.log10(1.5), np.log10(30), 60)
axB.plot(xl, 2.0e-11 * (xl / 10.0) ** 2, color=AQUA, lw=1.4, ls="-.", zorder=3.5)
axB.text(19.5, 2.0e-11 * (19.5 / 10) ** 2 * 1.6, "V₀ = ρ_Λ", color=INK, fontsize=7.8, va="bottom", ha="center")

# atom interferometer, validated coefficient: v2_min = 4.3e-15 N (1/mu/10cm)(M/5TeV)^2 at 1e-10 m/s^2
xa = np.logspace(np.log10(2), np.log10(20), 100)
for M_TeV, ls in [(5.0, (0, (1, 1.5))), (15.0, (0, (3, 2))), (36.0, (0, (5, 2)))]:
    v2 = 4.3e-15 * (xa / 10.0) * (M_TeV / 5.0) ** 2
    axB.plot(xa, v2, color=ORANGE, lw=1.6, ls=ls, alpha=0.9, zorder=4)
    axB.text(xa[-1] * 1.04, v2[-1], f"AI, M = {M_TeV:g} TeV", color=INK, fontsize=7.6, va="center")

axB.text(6, 3e-6, "Open: no published test found", color=BLUE_D, fontsize=8.6, ha="left", weight="bold")
axB.set_xscale("log"); axB.set_yscale("log")
axB.set_xlim(1.5, 30); axB.set_ylim(3e-16, 1e-4)
axB.set_xticks([2, 4, 7, 10, 20, 30]); axB.set_xticklabels(["2", "4", "7", "10", "20", "30"])
axB.set_xlabel("Field range 1/μ (cm)")
axB.set_ylabel("Field strength v² (newtons)  — sets force size")
axB.set_title("B.  How strong it could be — and who could see it", loc="left", fontsize=11, weight="bold", pad=34)
axB.grid(True, which="major", color=GRID, lw=0.6, zorder=0)
for s in ["top", "right"]: axB.spines[s].set_visible(False)
axB.text(1.5, 2.5e-4, "Lines = smallest field strength each experiment could detect (below a line = invisible to it)",
         color=INK2, fontsize=7.8, ha="left", va="bottom")

handles = [Patch(facecolor=BLUE, alpha=0.25, label="Untested region (this proposal)"),
           Patch(facecolor=EXCL, label="Excluded"),
           Patch(facecolor=EXCL2, hatch="////", edgecolor="#cfcec8", label="Field on in room air (different regime)"),
           Patch(facecolor="none", hatch="xxxx", edgecolor="#b9b8b2", label="Reachable by existing ≤6 cm-radius chambers; no analysis published"),
           Patch(facecolor="none", hatch="\\\\\\\\", edgecolor=NEFF_EDGE, label="Thermal-relic ΔN_eff marginal (rough estimate)"),
           plt.Line2D([], [], color=BLUE, lw=2, label="Torsion balance reach"),
           plt.Line2D([], [], color=ORANGE, lw=1.6, ls=(0, (1, 1.5)), label="Atom interferometer, δa = 10⁻¹⁰ m s⁻² (validated coefficient)"),
           plt.Line2D([], [], color=AQUA, lw=1.4, ls="-.", label="V₀ = ρ_Λ")]
fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=8.0, bbox_to_anchor=(0.5, -0.09))
fig.text(0.5, -0.19,
         "Benchmark: symmetron with A(φ)=1+φ²/2M². SN1987A bound (our re-derivation, unrefereed; universal coupling; transport included): central ≈6 TeV (5–8 across profiles), "
         "NN-only 3.5–6, floor ≈3; ×0.7 for a nucleon-mass-only coupling.\nΔN_eff band: rough decoupling estimate, standard thermal history. HUST-09: our estimate, ×3. Air pinning: μM < 7.2×10⁷ eV². "
         "Chamber ticks: condensation onset with test bodies only (hardware +12%; near-full signal needs ≳1.4× threshold).\n"
         "Reach lines include S/S₀ = 0.81 (3D 0.90 × hardware 0.90); a foil attractor with κ/μ ≥ 10 gives the same F̃ within 15%. Atom-interferometer lines: solver-validated coefficient "
         "(C = 1.06, atoms 2–3 cm from a 6 cm sphere, 1 m chamber).\nNot shown: with an 8 kg attractor, Tier 2 corresponds to a plain-Yukawa |α| ≈ 1.8×10⁻⁵ (10 cm) – 1.2×10⁻⁵ (30 cm) vs current 10⁻⁴–10⁻³. "
         "Gravity Innovation — working draft, Sept 2026.",
         ha="center", fontsize=6.9, color=INK2)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "wedge_map.png")
fig.savefig(out, dpi=200, bbox_inches="tight")
print("saved", os.path.relpath(out))

# acceptance checks
for xv in [4, 7, 10, 15]:
    print(f"Tier1 1m reach at {xv} cm: {reach(T1, np.array([xv]), Fx_1m, Ft_1m)[0]:.2e} N")
print("rho_Lambda line at 10 cm:", 2.0e-11, " at 2 cm:", 2.0e-11 * 0.04)
print("AI M=36 @10cm:", 4.3e-15 * (36 / 5) ** 2, " M=5 @10cm:", 4.3e-15)
