# neff_2ch: dispersive two-channel trace form factors for the thermal-relic ΔN_eff (Q4, 12 Oct 2026)

Replaces the single-channel Omnès hadronic rate of `../neff_proper/` with a two-channel (ππ, KK̄) Muskhelishvili–Omnès
solution for θ_π(s) = ⟨ππ|Θ|0⟩ and θ_K(s) = ⟨KK̄|Θ|0⟩ (DGL/Moussallam method). Input: a coupled-channel model fitted to the
CGL Roy phase below 0.8 GeV and δ₀⁰(2m_K) = 226.5°, and, above the KK̄ threshold, the measured ππ→KK̄ phase and modulus
(Peláez & Rodas 2018 CFD). Result (Fable-reviewed): ΔN_eff < 0.107 excludes **M ≲ 7.4 TeV (7.0–8.2)** for reheating above a
few GeV (7.3 TeV at 1 GeV, 6.2–6.6 at 0.2–0.5 GeV). Full write-up: `Q4-dispersive-neff.md`.

Needs `../neff_proper/saikawa_shirai_2018_gstar.dat` (see `../neff_proper/README_DATA.md`); numpy, scipy; sympy for the sign check.

Run order (revision 2, adopted):
1. `python test_single.py`: MO solver vs the exact single-channel Omnès function.
2. `python fit_data.py avg; python fit_data.py CFD_B; python fit_data.py CFD_C`: model fits (the JSON outputs are included).
3. `python scalar_radius_H.py`: pion scalar radius (≈ 0.635 fm²) and scalar form-factor shape.
4. `python ffhybrid.py` (~7 min) → `ffcache/H*.npz`; `python make_frozenH.py`.
5. `python scanH.py` (~8 min) → `scanH_results.json`; `python analyzeH.py` → `bandsH.json`; `python freezeinH.py` → `freezeinH_results.json`.
Optional: `python chpt_sign.py` (LO ππ→KK̄ sign), `python review_t21_variant.py t21up|t21dn` (review-2 variant).

Revision-1 files (superseded; pure chiral-model KK̄ phase, rejected in review 1) are kept for the record:
`fit_dr*.py`, `fit_model2.py`, `formfactors.py`, `ffvariants.py` (still provides the `RS` grid), `scan2ch.py`, `analyze.py`,
`freezein2ch.py`, `scalar_radius.py`, `make_cont_variants.py`, `plot_q4.py`, `rate_compare.py` and their JSON outputs.
