# Thermal-relic ΔN_eff for the universally coupled symmetron: proper calculation

*Fable 5 · 27 Sep 2026 · Gravity Innovation · replaces `../neff_estimate.py` (rough)*

STATUS: complete (27 Sep 2026). Sections were appended as finished; §2–3 first table is superseded by §3b. **The reheating threshold in §5a/§5d is superseded by §6: the 7.5 TeV exclusion needs T_RH ≳ 3 GeV (7.3 TeV at 1 GeV).**

## 0. Setup and conventions (done)

Model: L_int = −(φ²/2M²) Θ, Θ = T^μ_μ (canonical, metric-variation stress tensor: the conformal coupling g̃ = A²g with A = 1 + φ²/2M²). φ is one real d.o.f., effectively massless for T ≫ 1 eV (m_eff² = ⟨Θ⟩/M² ≪ T²). Units GeV; M_Pl = 1.22e19 GeV; H = 1.66 √g_*(T) T²/M_Pl.

Pair production rate density (φφ pairs per volume per time) from any operator Θ with Wightman function Π^>_Θ(q) = ∫d⁴x e^{iqx}⟨Θ(x)Θ(0)⟩:

  γ = (1/(16π M⁴)) ∫ d⁴q/(2π)⁴ Π^>_Θ(q) θ(q⁰) θ(q²)

(the 1/(16π) is the identical-massless-pair two-body phase space; equivalently the pair is one scalar of mass² s with measure ds/(32π²M⁴), the form used in the SN note §2 — checked).

In quasiparticle (kinetic) theory with Maxwell–Boltzmann statistics this is (Gondolo–Gelmini form)

  γ = S · (T/(64π⁴)) ∫ ds (√λ(s,m₁²,m₂²)/√s) K₁(√s/T) · Σ_dof|M(s)|² /(16π),   S = 1/2 if the two initial species are identical, else 1,

where Σ_dof sums over spins, colours, isospin of the initial pair. The per-φ interaction rate is Γ = 2γ/n_φ^eq with n_φ^eq = ζ(3)T³/π².

Matrix elements (derived here, checked against the SN note where overlapping):
- fermion f (Θ_f = m_f ψ̄ψ): f f̄ → φφ, Σ|M|² = 2 N_c m_f² (s − 4m_f²)/M⁴, i.e. σ = m_f² β/(64π M⁴). [Rough estimate used m²/(16πM⁴): 4× too large.]
- scalar meson, one real d.o.f. (Θ = −(∂π)² + 2m²π², no improvement term — from the Jordan-frame chiral Lagrangian: kinetic term × A², mass term × A⁴): ⟨0|Θ|ππ⟩ = s + 2m², Σ|M|² = n_real (s+2m²)²/M⁴, S = 1/2. This is the "2m_π² + s" vertex of the SN note §5. The s-term dominates for T ≳ 70 MeV.
- gluons (trace anomaly Θ_g = (β/2g) G^aG^a = −(b₀α_s/8π) G^aG^a, b₀ = 11 − 2n_f/3): Σ_{pol,col}|⟨gg|G²|0⟩|² = 64 s² (checked against Γ(h→gg) = α_s²m_h³/(72π³v²)), so Σ|M|² = 64 c² s², c = b₀α_s(μ)/(8πM²), S = 1/2, giving γ_g = 24 c² T⁸/π⁵.
- Higgs sector: classically Θ_SM = −m_h²|H|² (the only dimensionful SM parameter) + anomalies. So the coupling to Θ *is* the Higgs portal λ_p φ²|H|² with λ_p = m_h²/2M² above the EW scale, and it reproduces the contact m_f ψ̄ψ form at q² ≪ m_h² via h-exchange (low-energy theorem). γ_H = λ_p² T⁴/(32π⁵) in the symmetric phase; Γ/H ∝ 1/T there.

ΔN_eff for one real scalar decoupling at T_dec (verified): ΔN_eff = (4/7)(g_*s(T_ν,dec)/g_*s(T_dec))^{4/3} with g_*s(T_ν,dec) = 10.75; = 0.0268 at g_*s = 106.75, 0.0555 at 61.75, 0.30 at 17.25.


## 1. Rates vs T — first pass (M = 5 TeV, LO hadrons, perturbative QGP) (done; the Omnès-enhanced central model raises the hadronic-phase Γ/H by ×3–5, see the figure)

`python3 neff_calc.py 5` gives Γ/H = 0.015 (20 MeV), 0.20 (100), 0.59 (140), 0.59 (155), 0.39 (200), 0.69 (300), 1.5 (400), 22 (1 GeV), 1.3e3 (5 GeV), 1.2e5 (30 GeV), 1.5e6 (100 GeV), 6e8 (1 TeV).
Dominant channels: pions (ππ→φφ, vertex s+2m_π²) below T_c with K, η at 10–25%; gluons (anomaly) from T_c to 400 MeV; c c̄ from 0.5 to 2 GeV; b b̄ 2–10 GeV; Higgs portal + gluons above 30 GeV. Electrons, u, d never matter (m² coupling).
**Γ/H is nearly flat at 0.4–0.6 from 120 to 300 MeV** because both the pion rate (γ_π ∝ (s+2m²)² → T⁸) and the gluon rate (γ_g ∝ α_s²T⁸) scale the same way and happen to have similar coefficients at T_c. Consequences: (i) the instantaneous Γ = H criterion gives T_dec = 353 MeV and ΔN_eff = 0.067, but the Boltzmann solution, in which φ stays partially coupled through the crossover and shares in the entropy release, gives **ΔN_eff = 0.13** (0.16 if elastic energy exchange at the same rate is added); (ii) the answer is set by the hadronic rate at 100–160 MeV, not by the step in g_*.

Thermalization at high T: Γ/H ≈ 1e6 at the EW scale (Higgs-portal channel gives Γ/H ∝ m_h⁴/(M⁴T), gluon anomaly ∝ α_s²T³/M⁴). The synthesis' "1e8" was an overestimate but immaterial: φ is in equilibrium for any T_RH ≳ 1 GeV, with or without the Higgs-portal completion (below ~30 GeV the two coincide; above, the portal is what "coupling to Θ_SM" means, since Θ_SM = −m_h²|H|² + anomalies).

### 1a. The hadronic vertex: canonical vs improved trace (important)
The canonical trace of a scalar field gives ⟨0|Θ|ππ⟩ = s + 2m²; the CCJ-improved trace gives 2m² (the s piece is exactly the improvement term ½∂²(π²)). For pions the physical answer is the canonical one: the QCD trace Θ = m q̄q + (β/2g)G² matched onto the chiral Lagrangian gives ⟨ππ|Θ|0⟩ = s + 2m_π² + O(p⁴) (Voloshin–Zakharov 1980; Novikov–Shifman 1981; Donoghue–Gasser–Leutwyler 1990), i.e. the gluon anomaly operator has O(s) matrix elements between pions. So the s-term is real and the pion channel is 10–50× larger than a pure mass-term coupling would give at T ~ 100–150 MeV. (A Proca vector meson would give 2m², but that is not a QCD statement.)

### 1b. Where the hadronic uncertainty lives
Thermal weight of the pair-production integrand ∝ s^{7/2}e^{−√s/T} peaks at √s ≈ 7T ≈ 0.7–1.1 GeV for T = 100–155 MeV: the f0(500)/f0(980) region, where LO ChPT is not reliable and ⟨0|Θ|ππ⟩ is enhanced by the I=0 S-wave (Omnès factor). Heavy resonances (HRG) dominate ⟨Θ⟩ = ε − 3P near T_c (pions give only 0.09 of the lattice 2.7 at 150 MeV) and may also dominate Θ–Θ fluctuations at ω ~ 1 GeV. Variants computed below: LO ChPT (π,K,η,η'); Omnès-unitarized pions (CGL 2001 phase); full HRG (states to 1.7 GeV, (s+2m²) vertices for mesons, m ψ̄ψ for baryons).

## 2–3. Boltzmann results, variant scan (done; `scan.py` → `scan_results.json`)

> **Correction (later the same day):** the table immediately below was produced with a flawed energy closure (pair-process energy exchange switched off near chemical equilibrium, so φ cooled unphysically). The corrected numbers are in §3b; the *qualitative* findings 1–5 stand. Kept for the record.

Two-moment Boltzmann system (n_φ and ρ_φ) integrated from T = 50 GeV (equilibrium start) to 5 MeV; ΔN_eff = ρ_φ/ρ_{1ν} at 5 MeV, no instantaneous-decoupling assumption. Entropy conservation with the Saikawa–Shirai g_*s(T) gives dt. Cross-checks: HRG interaction measure (my 75-state list) vs HotQCD 2014 fit: 1.72 vs 2.11 at 150 MeV, 3.7 vs 3.8 at 180 MeV (HRG list truncated at 1.8 GeV); pions alone give 0.08. Perturbative gluon (b₀/3)α_s² is 0.3–0.65 vs lattice 2–4 at 150–400 MeV (the one-point function is O(α_s²), the two-point function that sets the rate is O(α_s²) at *tree* level — different objects, so this ratio is not a rate correction; used only to motivate the K-factor variants).

ΔN_eff (Boltzmann; instantaneous-criterion value in brackets):

| variant | M=3 | 4 | 5 | 6 | 8 | 10 TeV |
|---|---|---|---|---|---|---|
| **central** (Omnès-unitarized ππ, LO K/η/η', pert. gluons α_s(2πT), tanh crossover T_c=155, ΔT=15) | 0.276 (0.36) | 0.251 (0.33) | 0.204 (0.28) | 0.149 (0.06) | 0.085 (0.053) | 0.062 (0.049) |
| LO ChPT hadrons (no Omnès) | 0.244 | 0.187 | 0.129 | 0.093 | 0.063 | 0.052 |
| full HRG (75 states, s+2m² vertices) | 0.276 | 0.251 | 0.206 | 0.150 | 0.086 | 0.062 |
| HRG, resonance vertex 2m² | 0.276 | 0.251 | 0.204 | 0.149 | 0.085 | 0.062 |
| hadronic rate ×0.5 | 0.261 | 0.218 | 0.156 | 0.110 | 0.069 | 0.055 |
| hadronic rate ×3 | 0.295 | 0.277 | 0.259 | 0.229 | 0.140 | 0.088 |
| QGP rate ×3 | 0.275 | 0.248 | 0.206 | 0.156 | 0.093 | 0.067 |
| QGP rate ×0.5 | 0.277 | 0.252 | 0.203 | 0.146 | 0.082 | 0.059 |
| α_s scale πT / 4πT | 0.274/0.277 | 0.247/0.252 | 0.207/0.203 | 0.159/0.146 | 0.094/0.083 | 0.067/0.060 |
| crossover width 30 / 8 MeV | 0.275/0.276 | 0.249/0.251 | 0.202/0.205 | 0.147/0.149 | 0.084/0.085 | 0.061/0.062 |
| T_c = 150 / 160 MeV | 0.276/0.276 | 0.251/0.250 | 0.202/0.206 | 0.146/0.151 | 0.084/0.087 | 0.061/0.062 |

Instantaneous T_dec (central): 64, 84, 112, 456, 656, 899 MeV for M = 3…10 TeV — the jump between 5 and 6 TeV is the artefact of Γ/H hovering at 0.5–1 through the crossover; the Boltzmann curve is smooth.

Findings:
1. **Heavy resonances are irrelevant** for the rate (n_R² suppression beats the m_R⁴ coupling): HRG = pions+K+η to 1%. The vertex ambiguity for resonances does not matter. Good.
2. **QCD-crossover modelling is not the dominant uncertainty**: K-factors of 0.5–3 on the QGP rate, α_s scale πT–4πT, T_c 150–160, width 8–30 MeV each move ΔN_eff by ≤ 0.01 (M ≤ 6) and ≤ 0.008 (M = 8–10). The synthesis' worry was about the *step* in g_*; with the smooth EoS and Boltzmann solution it is gone.
3. **The dominant uncertainty is the hadronic (ππ→φφ) rate at T = 80–160 MeV**, i.e. the ⟨0|Θ|ππ⟩ form factor at √s = 0.4–1 GeV. LO ChPT (lower) vs Omnès-unitarized (central) vs ×3 (upper, covering the unresolved f0(980)/KK̄ two-channel structure and the polynomial ambiguity) spans ΔN_eff = 0.13–0.26 at M = 5 TeV and 0.09–0.23 at M = 6 TeV.
4. Bose/Fermi statistics (MB used throughout) would raise all rates by ~1.2–1.5 → equivalent to "×1.3" on both rates: +0.01–0.02 at M = 5–6 TeV. Included in the upper band.
5. Compared with the rough estimate (0.39/0.30/0.06/0.056/0.056/0.056): lower at M = 3–4 (σ was 4× too big; the pion s-term partly compensates), **higher at M ≥ 5** (partial re-coupling through the crossover, which the instantaneous criterion misses). ΔN_eff falls smoothly with M, no cliff at 5 TeV.

Adopted band (min/max over hadronic variants incl. statistics, ⊕ QGP/EoS variants in quadrature-ish; central = Omnès):
M = 3: 0.28 (0.24–0.30); 4: 0.25 (0.19–0.28); 5: 0.20 (0.13–0.26); 6: 0.15 (0.09–0.23); 8: 0.085 (0.06–0.14); 10: 0.062 (0.05–0.09).
Pending: g_*s ±1σ, "sum" phase combination, no-Higgs, freeze-in T_RH scan, plot.

### 3b. Corrected two-moment closure and final numbers

Energy equation now: dρ/dt + 4Hρ = (2γ/n_eq)[ρ_eq − (n/n_eq)ρ] (production of pairs at the thermal mean energy minus annihilation loss at the φ mean energy), optionally + Γ_el[(ρ_eq/n_eq)n − ρ] with Γ_el = Γ_ann (elastic φX→φX energy exchange; crossing symmetry gives Γ_el/Γ_ann ≈ 0.3–0.5 for pions, ≈ 3 for gluons, so Γ_el = Γ_ann is a fair middle). Check: at T = 495 MeV, M = 5 TeV: n/n_eq = 0.97, ρ/ρ_eq = 0.96 (was 0.86 with the flawed closure).

ΔN_eff, Boltzmann, no elastic term (with elastic term in brackets where computed):

| variant | M=3 | 4 | 5 | 6 | 8 | 10 TeV |
|---|---|---|---|---|---|---|
| **central** (Omnès ππ) | 0.346 | 0.300 | 0.230 (0.255) | 0.163 | 0.092 | 0.066 |
| LO ChPT hadrons | 0.297 | 0.213 | 0.143 | 0.102 | 0.068 | 0.056 |
| hadronic ×0.5 | 0.323 | 0.252 | 0.173 | 0.120 | 0.075 | 0.059 |
| hadronic ×3 | 0.375 | 0.344 | 0.310 | 0.260 | 0.151 | 0.094 |
| QGP ×3 / ×0.5 | 0.346/0.346 | 0.301/0.299 | 0.237/0.227 | 0.174/0.158 | 0.101/0.088 | 0.073/0.063 |
| α_s scale πT / 4πT | 0.346/0.346 | 0.301/0.299 | 0.239/0.228 | 0.177/0.159 | 0.102/0.089 | 0.072/0.065 |
| T_c = 150/160; ΔT = 30 MeV | 0.346 | 0.299–0.300 | 0.227–0.233 | 0.159–0.166 | 0.090–0.093 | 0.065–0.067 |
| g_*s ± 1σ (Saikawa–Shirai errors) | 0.345–0.347 | 0.297–0.302 | 0.226–0.235 | 0.159–0.167 | 0.090–0.094 | 0.065–0.067 |
| instantaneous Γ = H (central rates) | 0.36 | 0.33 | 0.28 | 0.06 | 0.053 | 0.049 |
| rough estimate (superseded) | 0.39 | 0.30 | 0.06 | 0.056 | 0.056 | 0.056 |

Full HRG = central to 1% (checked with the old closure; the resonance contribution is < 1% of the rate). "Sum" phase combination and no-Higgs variants: irrelevant for ΔN_eff (only change T ≫ T_dec) — not completed.

## 4. Observational limits, September 2026 (done; web-checked)

| dataset | N_eff | 95% upper limit on ΔN_eff with the physical prior ΔN_eff ≥ 0 (truncated Gaussian, computed here) |
|---|---|---|
| Planck 2018 TT,TE,EE+lowE+lensing+BAO | 2.99 ± 0.17 | 0.30 |
| ACT DR6 P-ACT-LB (Louis+/Calabrese+ 2025, arXiv:2503.14454) | 2.86 ± 0.13 (2.89 ± 0.11 with BBN) | 0.16 (0.14) |
| SPT-3G D1 alone (Camphuis+ 2025, arXiv:2506.20707) | 3.18 +0.29/−0.33 | 0.70 |
| SPT+ACT ("ground") / CMB-SPA = SPT+ACT+Planck | 2.78 ± 0.17 / 2.82 ± 0.12 | 0.20 / 0.13 |
| DESI DR2 BAO + Planck + ACT (Elbers+ 2025, arXiv:2503.14744) | 3.23 +0.35/−0.34 (95%) | 0.49 |
| BBN only, Yeh–Shelton–Olive–Fields 2022 (arXiv:2207.13133) | 2.898 ± 0.141 | 0.20 (their "N_ν < 3.18 at 2σ") |
| **BBN (D, ⁴He) + Planck + ACT + SPT + DESI DR2, Goldstein & Hill 2026 (arXiv:2603.13226)** | **2.990 ± 0.070** | **0.107** (their quoted 95% bound; reproduced here as 0.106) |

Comments. (i) CMB-only combinations that include ACT and SPT sit 1.5–2σ *below* 3.044; with the ΔN ≥ 0 prior this yields tight limits (0.13–0.16) that are tail-dependent — if the low central values are systematic, these relax to ~0.2–0.3. (ii) DESI+CMB without BBN pulls the other way (3.23). (iii) The BBN+CMB+BAO combination is centred on 3.044 and is the most robust: **adopt ΔN_eff < 0.107 (95%) [Goldstein–Hill 2026]** as the headline, quote ΔN_eff < 0.13–0.16 (CMB-SPA / P-ACT-LB) as the CMB-only bracket, and ΔN_eff < 0.30 (Planck 2018+BAO) as the conservative pre-2025 value. Note that for our relic the BBN-epoch and CMB-epoch ΔN_eff are identical (decoupling at T ≫ 1 MeV), so BBN limits apply directly.

## 5. Verdict (done)

### 5a. Final ΔN_eff(M), standard thermal history (T_RH ≳ 200 MeV)
central = mean of the two energy-exchange treatments (Omnès ππ, pert. gluons, tanh crossover); band = envelope of all variants (LO ChPT … hadronic ×3, QGP ×0.5–3, α_s scale, T_c, ΔT, g_*s ± 1σ, with/without elastic energy exchange); `neff_vs_M.png`.

| M [TeV] | 3 | 4 | 5 | 6 | 8 | 10 |
|---|---|---|---|---|---|---|
| **ΔN_eff central** | **0.35** | **0.30** | **0.24** | **0.17** | **0.094** | **0.067** |
| band | 0.30–0.38 | 0.21–0.35 | 0.14–0.32 | 0.10–0.27 | 0.07–0.16 | 0.056–0.10 |
| LO-ChPT-hadrons (lower edge) | 0.30 | 0.21 | 0.14 | 0.10 | 0.068 | 0.056 |

Why the curve is smooth and higher than the old estimate at M ≥ 5: e.g. M = 8 TeV has Γ = H at 650 MeV (g_*s = 64) but the comoving φ number then grows by another 56 % — 9 % while the QGP rate hovers at Γ/H = 0.1–0.4, and 35 % between 160 and 70 MeV where the pion channel brings Γ/H back up to 0.22 while n_φ/n_eq has fallen to 0.4 (so the back-reaction factor is 0.8). The late-produced quanta are also hotter in comoving terms, so ρ_φa⁴ grows ×1.85. This is the entropy of the crossover leaking into φ; the instantaneous criterion cannot capture it.

### 5b. Excluded M for each limit (95 %), central [lower-band – upper-band]
| adopted limit | M excluded below |
|---|---|
| **ΔN_eff < 0.107 (Goldstein–Hill 2026, BBN+Planck+ACT+SPT+DESI DR2)** | **7.5 TeV [5.9 – 9.6]** |
| ΔN_eff < 0.13 (CMB-SPA 2025) | 6.8 [5.2 – 8.8] |
| ΔN_eff < 0.16 (ACT DR6 P-ACT-LB) | 6.1 [4.7 – 8.0] |
| ΔN_eff < 0.20 (BBN only, Yeh+22) | 5.5 [4.1 – 7.1] |
| ΔN_eff < 0.30 (Planck 2018+BAO, pre-2025) | 4.1 [<3 – 5.4] |

### 5c. Robustness
- **T_RH** (freeze-in from n_φ = 0 at T_RH, `freezein_results.json`): ΔN_eff reaches its thermal value for T_RH ≳ 200 MeV (M = 4–5) or ≳ 1 GeV (M = 6–8, where the QGP-phase production matters). At T_RH = 100 MeV: 0.16 / 0.07 / 0.03 / 0.01 for M = 4/5/6/8; at 70 MeV: 0.04 / 0.02 / 0.01 / 0.003. **A reheating temperature below ~100 MeV evades the bound entirely** (as does late entropy injection); BBN itself only requires T_RH ≳ 5 MeV. This is the one loophole.
- **QCD-crossover modelling**: ±0.01 in ΔN_eff (±0.3 TeV in M_excl). Not the issue any more.
- **Hadronic form factor ⟨0|Θ|ππ⟩ at √s = 0.5–1 GeV**: the dominant uncertainty, factor ~2 in ΔN_eff at M = 5–8 TeV, ±1.7 TeV in M_excl. Improvable with the dispersive two-channel (ππ, KK̄) trace form factor of Donoghue–Gasser–Leutwyler / Moussallam / Winkler 2019 — one afternoon for someone with that code.
- Quantum statistics (MB used): +20–50 % on rates, inside the band. Higgs-portal vs no completion: irrelevant (only T > 30 GeV).
- Operator: for OP's nucleon-only operator (1.2) the pion channel is absent and only quarks/gluons remain above T_c and nucleons below; the cosmological bound would then be set by the QGP rates alone (T_dec = 350–900 MeV, ΔN_eff ≈ 0.05–0.07): *not excluded*. The ΔN_eff bound is specific to the universal coupling.

### 5d. Wording
White paper §2 / SN note §8 (one sentence): *"Solving the Boltzmann equation for the relic φ with a lattice equation of state, the gluon trace anomaly above T_c and the unitarized ππ→φφ channel below it (the vertex ⟨0|Θ|ππ⟩ = s + 2m_π² of the Voloshin–Zakharov theorem), we find ΔN_eff = 0.24 (0.14–0.32) at M = 5 TeV, 0.17 (0.10–0.27) at 6 TeV and 0.07 at 10 TeV; the 2026 BBN+CMB+BAO limit ΔN_eff < 0.107 (95 %) then excludes M ≲ 7.5 TeV (5.9–9.6 TeV across the hadronic-rate band) for a standard thermal history with T_RH ≳ 200 MeV, and is evaded only if T_RH ≲ 100 MeV."*

Figure 1A: the hatched 4–6 TeV "marginal" band **should move**: gray (excluded, cosmology) up to ≈ 6 TeV (lower band edge, GH2026), hatched 6–9.6 TeV labelled "ΔN_eff-disfavoured (hadronic-rate band; T_RH ≳ 200 MeV)". The "≥ 6 TeV allowed" statement is no longer true under the 2026 limit; the cosmological floor now sits *above* the SN floor (5.3–7.9). The surviving wedge becomes 1/μ ≈ 2–30 cm with M ≳ 7.5 TeV (lower edge 6) up to the air ceiling M ≤ 3.65 TeV × (1/μ/cm), i.e. 1/μ ≳ 2 cm is still viable (ceiling 7.3 TeV at 2 cm, 36 TeV at 10 cm); the screened-body force is M-independent so the experimental reach is unchanged. If the team prefers the conservative Planck 2018+BAO limit, the statement is "≲ 4 TeV excluded, 4–5.4 marginal", i.e. close to the old hatched band — but that limit is three years and three experiments out of date.

## Files
- `neff_calc.py` — EoS (Saikawa–Shirai table `saikawa_shirai_2018_gstar.dat`; HotQCD 2014 fit), α_s running, GG integral, first-pass model, CLI rate table.
- `neff_model.py` — RateModel with variants (Omnès, HRG list of 75 states, K-factors, crossover), two-moment Boltzmann solver.
- `scan.py` → `scan_results.json` — variant × M scan (Γ/H curves, T_dec, ΔN_eff instantaneous / Boltzmann / with elastic).
- `freezein_and_plot.py` → `freezein_results.json`, `neff_vs_M.png` (Γ/H vs T; ΔN_eff(M) with bands and limits; freeze-in vs T_RH).
- `SUMMARY.md` — this file.

## 6. Note added in review (Claude, 27 Sep 2026): the reheating threshold for the 7.5 TeV number

§5d's wording ("excludes M ≲ 7.5 TeV … for a standard thermal history with T_RH ≳ 200 MeV") is too loose for the headline number. By §5c, ΔN_eff reaches its thermal value only for T_RH ≳ 1 GeV at M = 6–8 TeV. Interpolating `freezein_results.json` (mean of the two energy-exchange columns, log–log in M) gives the excluded M against ΔN_eff < 0.107:

| T_RH | 0.1 | 0.13 | 0.16 | 0.2 | 0.3 | 0.5 | 1 | 3 GeV |
|---|---|---|---|---|---|---|---|---|
| M excluded below (TeV) | 4.5 | 5.5 | 6.1 | 6.2 | 6.4 | 6.6 | 7.3 | 7.5 |

The adopted wording is therefore: **M ≲ 7.5 TeV (5.9–9.6) excluded if reheating exceeded a few GeV** (the standard case); 6.2–6.6 TeV for T_RH = 0.2–0.5 GeV; below the SN bound for T_RH ≲ 100 MeV. All outreach documents use this wording.
