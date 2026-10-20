# Q4: early-universe (ΔN_eff) bound with a dispersive two-channel trace form factor

*Weekly work run, 12 Oct 2026 (Claude, orchestrator).*
- *Status: **FINAL, Fable-reviewed, ADOPTED 12 Oct 2026.***
  - *Revision 1 got "MAJOR ERROR" in Fable review 1.*
  - *Revision 2 constrains the coupled-channel input with data. Fable review 2 gave "MINOR ISSUES (adopt after fixes)"; all fixes are applied (see §9).*
- *Supersedes, for the hadronic (ππ, KK̄ → φφ) channels, the single-channel Omnès "central" and the LO/×3 band of `claude/fable/neff_proper-SUMMARY.md` §3b–§6.*
- *Code: `claude/code/q4/` (repo target `cosmology/neff_2ch/`).*

## 0. Plain-English summary (for Paul)

The early-universe limit on our field depends on how strongly pions and kaons in the hot early universe turn into pairs of the new particle. Last month that step carried a factor-of-two uncertainty, so the limit read "7.5 TeV, anywhere from 5.9 to 9.6". We have now done that step the standard, more rigorous way: a "dispersive" calculation that treats pions and kaons together and is tied to measured pion and kaon scattering data. **The limit stays at about 7.4–7.5 TeV, and the uncertainty shrinks to 7.0–8.2 TeV.** Nothing the experts were sent changes. The proposed experiment is unaffected, because its signal does not depend on this number.

## 1. What was computed

Model and conventions as in `neff_proper-SUMMARY.md` §0:
- L = −(φ²/2M²)Θ with Θ = T^μ_μ.
- Gondolo–Gelmini (Maxwell–Boltzmann) pair-production rate density γ.
- Two-moment Boltzmann solution, with ΔN_eff = ρ_φ/ρ_ν(1 species) at 5 MeV.
- Central value = mean of the two energy-exchange treatments.

Only the hadronic channels change:
- **ππ → φφ:** Σ|M|² = 3|θ_π(s)|²/M⁴, S = ½. Previously 3(s+2m_π²)²|Ω_1ch(s)|²/M⁴.
- **KK̄ → φφ:** Σ|M|² = 4|θ_K(s)|²/M⁴, S = ½. Previously LO, 4(s+2m_K²)²/M⁴.

Unchanged: η and η′ (LO), quarks, gluons (trace anomaly), leptons, the Higgs portal, the tanh crossover (T_c = 155 MeV, ΔT = 15 MeV) and the Saikawa–Shirai equation of state. Here θ_P(s) ≡ ⟨PP̄|Θ|0⟩.

## 2. Method: two-channel Muskhelishvili–Omnès (DGL/Moussallam)

**Form factors.** The form-factor vector in the I = 0 unitary-normalized basis is F = (√(3/2) θ_π, √2 θ_K), with unitarity Im F = t* Σ F, S = 1 + 2i√Σ t √Σ and Σ = diag(σ_π, σ_K θ(s − 4m_K²)). Then F(s) = Ω(s)[A + B s]. The polynomial is fixed by the exact low-energy theorem θ_P(0) = 2m_P² and the LO slopes θ′_P(0) = 1, which are varied.

**Omnès matrix.** Ω solves Im Ω = t* Σ Ω with Ω(0) = 1 and Ω ~ 1/s. It is computed numerically from the unsubtracted dispersion relation (Nyström, 1 MeV grid in √s, singularity subtraction). The two-dimensional decaying null space is found by SVD and normalized by Ω(0) = 1.

**T-matrix input (revision 2, "hybrid data input"):**
- **Below the KK̄ threshold:** a unitarized chiral coupled-channel model (Oller–Oset LO kernels, dimensional-regularization loops with channel-dependent subtraction constants, V₁₁ → c·V₁₁^LO + d, V₁₂ → g₁₂V₁₂, V₂₂ → g₂₂V₂₂). It is fitted to:
  - the CGL 2001 Roy phase δ₀⁰ on 0.32–0.78 GeV;
  - δ₀⁰(2m_K) = 226.5° (GKPY value as quoted by Peláez & Rodas 2018);
  - the ππ → KK̄ phase and inelasticity on 1.0–1.4 GeV (loosely).

  Central-fit parameters ("avg"): a_π = −0.741, a_K = −4.505, c = 0.802, d = 0.0596, g₁₂ = 0.462, g₂₂ = 0.425. Below 0.8 GeV it matches CGL within ±0.5°. It provides t₁₁ below the threshold and t₂₁ in the unphysical region 4m_π² < s < 4m_K², where Im F_K = t₂₁* σ_π F_π needs it.
- **From the KK̄ threshold to u_m = 1.47 GeV:** S is built from:
  - δ₁(s) from the fitted model, which rises from 226° at threshold to 254° at 1.47 GeV;
  - **the measured ππ → KK̄ phase φ₀⁰(s) = δ₁ + δ₂**, so δ₂ = φ₀⁰ − δ₁;
  - **the inelasticity η = √(1 − 4σ_πσ_K|g₀⁰|²)** from the measured modulus.

  Both φ₀⁰ and |g₀⁰| come from the **Peláez & Rodas 2018 CFD parametrization** (arXiv:1807.04543, Eqs. 18–23, Tables III–V). Central uses the average of their CFD_B and CFD_C fits; the variants use each alone. The CFD_B/CFD_C split reflects the Brookhaven-II vs Argonne+Brookhaven-I modulus discrepancy: η ≈ 0.34–0.71 vs 0.70–0.85 at 1.02–1.4 GeV.

  At the threshold:
  - The phase is continuous: model 224° vs data 226°, and δ₂(2m_K) ≈ 0.
  - The modulus has a 15–20% step. The model's below-threshold |t₂₁| at the last solver nodes is 1.24–1.29 (threshold cusp), against the data value 1.05. Fable's ±50% scaling test of |t₂₁| below threshold bounds the effect at ≤ 0.05 TeV.
  - The normalization S₁₂ = 2i√(σ_πσ_K) g (i.e. g ≡ t₁₂) was checked by Fable. It reproduces the known Brookhaven-II vs ππ-inelasticity tension (η(1.05 GeV) = 0.39 for B, 0.72 for C). A factor-2 larger normalization would violate unitarity; a factor-2 smaller one would give η ≈ 0.95, against data.
- **From 1.47 GeV to u_a = 2.0 GeV:** (δ₁, δ₂, η) are interpolated smoothly to (π, π, 1), and S = 1 beyond. The variants are (2π, 0), u_a = 1.8 / 2.5, and u_m = 1.3.
- **The ππ → KK̄ sign** was derived from the LO chiral Lagrangian (`chpt_sign.py`): M₁₂^{I=0} = +√3 s/(4f²) in the basis where θ_K(0) = +2m_K². The hybrid input inherits this sign from the model at threshold.

## 3. Validation

| Check | Result |
|---|---|
| Solver vs exact single-channel Omnès (CGL phase → π) | \|Ω\|² to ≤ 2×10⁻⁴; phase to 0.1° |
| Solver internals (Fable, review 1) | Im Ω real to 3×10⁻¹³; unsubtracted DR satisfied at nodes to < 0.1%; Ω(0) = 1; Ω′(0) matches finite differences; null space two-dimensional (10⁻¹⁴ vs 5×10⁻²) |
| Hybrid S-matrix unitarity, 1.0–1.9 GeV | ≤ 10⁻¹⁵ |
| Discretization (h = 1 vs 2 MeV, revision 1) | form factors 0.2–0.5% below 0.95 GeV, 1.3% at 1.0 GeV; ΔN_eff unchanged at 3 digits |
| **Pion scalar radius** from the same Ω (one subtraction, Γ_π(0) = m_π², Γ_K(0) = m_π²/2) | **0.635 fm²** (avg); 0.645 / 0.634 (B / C); ±0.04 for Γ_K(0)/m_π² = 0–1. Reference: 0.61 ± 0.04 fm² (CGL 2001) |
| **Pion scalar form-factor shape** \|Γ_π(s)/Γ_π(0)\| | 1.8 (0.5 GeV), 1.7 (0.7), 1.8 (0.85), **2.6–3.1 peak at 0.95**, 1.7–2.2 (0.98), dip to 0.4–0.6 at 1.05 GeV: the standard dispersive shape (peak below the KK̄ threshold, then a dip). Revision 1 lacked the peak |

A further check (Fable, review 2): the curvature of the pion scalar form factor from the same Ω is c_S = 11.7 GeV⁻⁴, against ≈ 11 ± 1 quoted by CGL 2001. The reference value is from memory and not verified.

The scalar radius alone does not discriminate between inputs (Fable: revision-1 variants spanning M_excl 6.7–7.5 all passed). The form-factor shape and the data constraint on φ₀⁰ are what fix revision 1's problem.

## 4. What changes physically (vs the old single-channel model)

- **|θ_π|²** stays close to the old (s+2m_π²)²|Ω_1ch|² below 0.7 GeV: 0.25 vs 0.31 GeV⁴ at 0.5 GeV, 0.85 vs 1.19 at 0.7. It is lower at 0.8 GeV (1.7 vs 3.4) and much higher at the f0(980) peak (21 GeV⁴ at 0.97 GeV), which now sits where the data put the rapid phase rise (δ₀⁰ ≈ 140° at 0.95 GeV, 226.5° at 2m_K).
- **|θ_K|²** is strongly enhanced near the KK̄ threshold (≈ 14 GeV⁴ at 1.0 GeV vs LO 2.2; ≈ 4 at 1.1 GeV vs 2.9).
- **Net effect:** the thermal hadronic rate is close to the old central. ΔN_eff agrees with the old central to within 0.01 for M = 3–10 TeV.
- **The revision-1 mechanism statement ("destructive KK̄ interference") was wrong** (Fable). Below the KK̄ threshold the Ω₁₁ and Ω₁₂ terms in θ_π share the phase δ₁ and add.
  - The near-zero of Ω₁₁ at the f0(980)/KK̄ threshold is a generic feature of the two-channel Omnès matrix (Ω₁₁ ∝ the cofactor D₂₂). It is present in revision 2 too (|Ω₁₁| = 0.04 at 0.98 GeV).
  - What changed between revisions is the KK̄-source term. |Ω₁₂| at 0.9 / 0.97 GeV rose from 1.03 / 2.6 to 1.49 / 3.6, and δ₁(2m_K) moved from 213° to 226°.
  - So from about 0.85 GeV up, θ_π is dominated by Ω₁₂·θ_K(0), the KK̄ source feeding the ππ channel.

## 5. Results: ΔN_eff(M), standard thermal history (T_RH ≳ 1–3 GeV)

The central value is the hybrid input above. The band combines in quadrature the hadronic envelope and the QGP/EoS envelope, each taken as min (no elastic) to max (with elastic) over its variants:
- **Hadronic variants:** Peláez–Rodas CFD_B and CFD_C, each with its own refitted model below threshold; asymptotics (2π, 0); u_a = 1.8 / 2.5; u_m = 1.3; δ₁ above threshold ±10° (φ₀⁰ held fixed); θ′_K(0) = 0.8 / 1.2; θ′_π(0) = 0.95 / 1.05; form factors frozen above 1.47 GeV; quantum statistics ×1.3. Also, from review 2: |t₂₁| below threshold ×(1 ± 0.5), M_excl 7.26–7.56, inside the envelope.
- **QGP/EoS variants:** QGP rate ×3 / ×0.5; α_s scale πT / 4πT; T_c = 150 / 160 MeV; ΔT = 30 MeV; g_*s ± 1σ.

| M [TeV] | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|
| **ΔN_eff central (new)** | **0.343** | **0.298** | **0.231** | **0.164** | **0.119** | **0.092** | **0.077** | **0.067** |
| band (new) | 0.337–0.354 | 0.283–0.317 | 0.209–0.264 | 0.145–0.199 | 0.106–0.147 | 0.083–0.112 | 0.070–0.091 | 0.062–0.078 |
| hadronic envelope | 0.338–0.353 | 0.285–0.316 | 0.211–0.261 | 0.148–0.193 | 0.108–0.140 | 0.085–0.107 | 0.072–0.087 | 0.063–0.074 |
| QGP/EoS envelope | 0.340–0.347 | 0.291–0.305 | 0.220–0.246 | 0.154–0.184 | 0.111–0.137 | 0.086–0.106 | 0.072–0.087 | 0.063–0.075 |
| old central (27 Sep) | 0.35 | 0.30 | 0.24 | 0.17 | — | 0.094 | — | 0.067 |
| old band | 0.30–0.38 | 0.21–0.35 | 0.14–0.32 | 0.10–0.27 | — | 0.07–0.16 | — | 0.056–0.10 |

Central values without / with elastic exchange: 0.341/0.346, 0.293/0.303, 0.224/0.237, 0.159/0.169, 0.116/0.122, 0.090/0.095, 0.075/0.078, 0.066/0.068.

**Excluded M (95%)**, by log–log interpolation (old values in brackets):

| Limit | M excluded below: central [band] |
|---|---|
| **ΔN_eff < 0.107 (Goldstein & Hill 2026, BBN+Planck+ACT+SPT+DESI DR2)** | **7.4 TeV [7.0–8.2]** (old 7.5 [5.9–9.6]) |
| < 0.13 (CMB-SPA 2025) | 6.7 [6.3–7.4] (old 6.8 [5.2–8.8]) |
| < 0.16 (ACT DR6 P-ACT-LB) | 6.1 [5.7–6.7] (old 6.1 [4.7–8.0]) |
| < 0.20 (BBN only, Yeh+22) | 5.4 [5.1–6.0] (old 5.5 [4.1–7.1]) |
| < 0.30 (Planck 2018+BAO) | 3.9 [3.6–4.3] (old 4.1 [<3–5.4]) |

Notes on the band:
- The plain envelope over all variants gives 7.0–8.0 TeV.
- **The band is 1.25 TeV wide instead of 3.7 TeV**, about a third of the old width, against the work item's target of halving it.
- Per-variant M_excl: 7.15 (θ′_K = 0.8) and 7.25 (QGP ×0.5) to 7.84 (α_s at πT) and 7.89 (statistics ×1.3).
- The data-input variants (CFD_B/C, δ₁ ± 10°, u_m, u_a, asymptotics) span only 7.31–7.44.

**Reheating dependence** (freeze-in from n_φ = 0 at T_RH, central input):

| T_RH [GeV] | 0.13 | 0.16 | 0.2 | 0.3 | 0.5 | 1 | 3 |
|---|---|---|---|---|---|---|---|
| M excluded below (TeV), ΔN_eff < 0.107 | 5.4 | 6.1 | 6.2 | 6.3 | 6.6 | 7.3 | 7.4 |

This matches the adopted wording to within 0.1 TeV: "7.5 if reheating exceeded a few GeV; 7.3 at 1 GeV; 6.2–6.6 at 0.2–0.5 GeV".

## 6. Caveats

1. **Input above 1.47 GeV is interpolated** (no f0(1370)/f0(1500) dynamics). Freezing the form factors above 1.47 GeV, or changing u_a or the asymptotics, moves M_excl by ≤ 0.05 TeV.
2. **δ₁ above the KK̄ threshold** comes from the fitted model (226° → 254°), not a direct data parametrization; ±10° moves M_excl by ±0.04 TeV. The model's own φ₀⁰ deviates from Peláez–Rodas by up to 30° at 1.4 GeV (207.6° vs 237.3°). That only affects the fit, since the hybrid input uses the data φ₀⁰ directly.
   - A ±10° bump in δ₁ on 0.8–0.99 GeV, with fixed endpoints, moves M_excl by < 0.02 TeV (Fable).
3. **|t₂₁| below the KK̄ threshold** (needed for Im θ_K) comes from the fitted model. Its phase is fixed by Watson's theorem, but its modulus is pinned only near threshold, where it sits 15–20% above the data. Scaling it by 1 ± 0.5, tapered to 1 at 2m_K, gives M_excl = 7.26–7.56 TeV (Fable review 2; script copied as `review_t21_variant.py`). This variant is part of the hadronic band below; the band edges do not move.
4. **The ηη channel** (opens at 1.1 GeV; LO, no rescattering) and multi-pion states are not in the two-channel system. η and η′ annihilation stay at LO.
5. **Vacuum form factors in a dilute hadron gas,** as in the 27 Sep calculation (no in-medium σ/f0 modification). This is the main unquantified assumption.
6. **Quantum statistics** enter as a ×1.3 upper variant (Maxwell–Boltzmann central).
7. **The Peláez–Rodas parameters were read from the arXiv PDF text by a fetch tool.**
   - The functional form satisfies their stated threshold condition (φ(2m_K) = 226.5° exactly).
   - The shape (226.5° → 193° at 1.2 GeV → 274° at 1.47 GeV) and |g| (1.2 / 0.9 at threshold → 0.26 / 0.23 at 1.47 GeV) look qualitatively right to Fable, and |g| stays below the unitarity bound.
   - Not yet checked against the journal tables. One open detail: is their Chebyshev variable linear in √s (as implemented) or in s? This shifts the curves by about 20 MeV.
   - The GKPY anchor δ₀⁰(2m_K) = 226.5° is also taken as quoted.
8. **The universal coupling only.** For the nucleon-mass-only operator the ΔN_eff bound still does not apply.

## 7. Consequences for project documents (apply only after Fable finds no error)

- **Adopted-numbers table** (`gravity-innovation-path-v2.md`):
  - "Thermal-relic ΔN_eff" becomes 0.34 / 0.30 / 0.23 / 0.16 / 0.12 / 0.092 / 0.067 at M = 3 / 4 / 5 / 6 / 7 / 8 / 10 TeV, with a band of about ±10–20% (two-channel dispersive form factor + QGP/EoS).
  - "Cosmology bound" becomes **M ≲ 7.4 TeV (7.0–8.2)** if reheating exceeded a few GeV; the 7.3 / 6.2–6.6 TeV reheating statements are unchanged.
  - "Surviving wedge": M ≳ 7.4 TeV (standard thermal history) or ≳ 6 TeV (SN alone).
  - FAQ #9: "7.4 TeV (7.0–8.2)".
- **Derived numbers** quoted "on the 7.5 TeV floor" (membrane losses) change by < 3% in κ (κ ∝ 1/M²; (7.5/7.4)² = 1.03) and need no recomputation; keep them as stated.
- **Documents already sent** (white paper v2, SN note v2, Emails 1–2) say 7.5 TeV (5.9–9.6). The new result confirms the central value and narrows the band, so nothing sent is contradicted. **No erratum.** The narrower band can be mentioned at the next substantive expert contact.
- **Unsent documents** (one-pager, desk study, BRAIN) need no change beyond optional band wording.

## 8. Files (`claude/code/q4/`; repo target `cosmology/neff_2ch/`)

- **Revision 2:**
  - `pr2018.py`: the Peláez–Rodas parametrization;
  - `model_data.py` and `fit_data.py`: the data-constrained model and its fits (`fit_data_{avg,CFD_B,CFD_C}.json`);
  - `tinput_hybrid.py`: the hybrid input;
  - `ffhybrid.py`: form-factor tables;
  - `make_frozenH.py`;
  - `scanH.py`: output `scanH_results.json`;
  - `analyzeH.py`: output `bandsH.json`;
  - `freezeinH.py`: output `freezeinH_results.json`;
  - `scalar_radius_H.py`.
- **Shared with revision 1:**
  - `twochannel.py`, `model_dr.py`, `model_dr2.py`: kernels and loops;
  - `mo_solver.py`: the solver;
  - `tinput.py`: unwrapping and interpolation;
  - `run_two.py`: `FF`;
  - `ffvariants.py`: provides `RS`;
  - `neff_2ch.py`: the rate model;
  - `chpt_sign.py`, `test_single.py`, `rate_compare.py`: checks;
  - `_gi_path.py`.
- **Revision-1 files kept for the record** (superseded): `fit_dr*.py`, `fit_model2.py`, `formfactors.py`, `scan2ch.py`, `analyze.py`, `freezein2ch.py`, `scalar_radius.py`, `make_cont_variants.py`, `plot_q4.py` and their JSON outputs.

## 9. Review

**Fable review 1 (12 Oct 2026, of revision 1): MAJOR ERROR, do not adopt.**
- Code, normalizations, solver and every quoted number were verified correct.
- Main issue: the KK̄ phase above threshold came from the unconstrained LO chiral model and was not varied. A data-like δ₂ moved M_excl from 6.9 back to 7.3–7.5 TeV.
- Also flagged: the §4 "destructive interference" mechanism was wrong; the (2π, 0) asymptotic variant was missing; δ₁ at 0.8–0.97 GeV was not fitted; the ηη caveat was missing; §3 overstated the checks; two numerical nits.
- Erratum: none needed.

**Response (revision 2):**
- The input above the KK̄ threshold is now the measured ππ → KK̄ phase and modulus (Peláez–Rodas 2018 CFD).
- The model below threshold is refitted to δ₀⁰(2m_K) = 226.5°, which moves the f0(980) phase rise to where data put it.
- Added: the (2π, 0), CFD_B/C, δ₁ ± 10° and u_m/u_a variants; the ηη caveat; the corrected §3 and §4 text.
- Result: M_excl = 7.4 TeV (7.0–8.2), consistent with Fable's expectation of "≈ 7.0–7.4, band ≈ 6.4–7.9".

**Fable review 2 (12 Oct 2026, of revision 2): MINOR ISSUES (adopt after fixes).**
- The review-1 MAJOR issue is resolved: the KK̄-channel input is external data. No remaining input freedom has leverage above ±0.15 TeV.
- All numbers in §3–§5 and §7 were reproduced. The hybrid S-matrix is unitary to 10⁻¹⁵, the null space is clean, and the scalar radius reproduces.

Issues and how each was handled:
1. The §4 mechanism text misattributed the Ω₁₁ near-zero. Fixed: it is generic; the change is in Ω₁₂·θ_K(0) and δ₁(2m_K).
2. |t₂₁| below threshold is residual freedom (M_excl 7.26–7.56). Added to the hadronic variants (caveat 3, §5); the band edges are unchanged.
3. The threshold matching was overstated: there is a 15–20% modulus step, with the phase continuous. Fixed in §2.
4. Caveat 2 understated the model–data φ difference (30°, not 13°, at 1.4 GeV). Fixed.
5. The Peláez–Rodas tables could not be verified without the journal. The normalization S₁₂ = 2i√(σσ)g was checked to about 30% via the η tension. Caveat 7 is kept and expanded.
6. Suggested the c_S = 11.7 GeV⁻⁴ check. Added to §3 (reference unverified).

Erratum: none. The sent 7.5 TeV (5.9–9.6) is confirmed, and adopting "7.4 TeV (7.0–8.2)" is justified.
