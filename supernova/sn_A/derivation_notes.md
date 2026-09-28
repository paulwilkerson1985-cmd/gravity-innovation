# SN1987A bound on the conformally coupled symmetron: derivation notes

*Gravity Innovation, gating calculation A, 26 Sep 2026. Scripts are in this folder. Units: ħ = c = 1, MeV.*

## 0. Model and conventions

- Coupling: A(φ) = 1 + h, with h = φ²/(2M²).
- Einstein-frame interaction: L_int = −h·(−T^μ_μ).
- Uniform A rescales every mass scale (m_N, Λ_QCD, m_π, f_π) by A and every length by 1/A.
- For non-relativistic nucleons with a potential V:
  - H(A) = Σ_a [A m + p_a²/(2Am)] + A V(A r)
  - The pair couples to the scalar-charge operator S ≡ ∂H/∂A at A = 1.

**Scalar charge.**

```
S = Σ_a (m − p_a²/2m) + V + r·∇V                    (1)
```

- The classical point-particle form is m√(1−v²) δ³(x − x(t)), i.e. m²/E.
- It has two parts: a relativistic "scalar minus vector density" piece (−p²/2m) and an interaction ("virial/pressure") piece (V + r·∇V).

**Pair emission from a classical source J = s(x)/M², with L = −½ J φ².**

```
dN = d⁴K/(2π)⁴ · β/(16π) · |J̃(K)|² ,   β = (1 − 4m_eff²/K²)^½   (the 1/2 for identical φ is included)   (2)
```

In a binary collision, J̃ = (1/M²)·F̂, and F̂ multiplies the NN amplitude.

## 1. Multipole structure (why Olive–Pospelov overestimates)

Expand F̂ = Σ_a η_a (m²/E_a)/(ω − K·v_a) in K·v/ω, working in the CM frame with relative momenta p → p′.

| Order | Term | Size | Why |
|---|---|---|---|
| (m/ω)·O(1) | monopole, Σ Δm | 0 | baryon number is conserved |
| (m/ω)·O(v) | dipole, Σ m Δv | 0 | momentum is conserved (equal masses) |
| **(m/ω)·O(v²)** | **quadrupole (Q) term** | **O(E/ω)** | **leading soft term, fixed by on-shell NN data** |
| O(ω⁰) | isotropic "NLO" terms | O(1) × T_NN | see below |

The quadrupole (Q) term is:

```
F̂_Q = (2/(m ω³)) K_i K_j A_ij ,   A_ij = p′_i p′_j − p_i p_j
⟨|F̂_Q|²⟩_K̂ = (4/(15 m² ω⁶)) K⁴ [ (Tr A)² + 2 A:A ] ,   2A:A = 4p⁴ sin²θ  (elastic)
```

The O(ω⁰) "NLO" terms are isotropic and of order T_NN. They come from:
- recoil (the pair carries away energy ω, so Σ ΔE_kin = −ω);
- the −p²/2m (scalar − vector density) term;
- the relativistic s/(2mω) and ω/2m propagator terms (the pair analogue of the m_φ⁴/ω⁴ term of Dev–Mohapatra–Zhang and Hardy–Sokolov–Stubbs);
- the interaction term V + r·∇V (emission from the exchanged mesons).

**Exact identity.** At K⃗ → 0, between exact NN eigenstates, using −T = V − H:

```
⟨f|S|i⟩ = ⟨f| 2V + r·V′ |i⟩      (E_f = E_i − ω ≠ E_i)       (3)
```

So the full monopole equals a "virial" matrix element: exact to all orders in V and valid at finite ω.
- Its Born/contact limit gives c₀ = −1.
- For one-pion exchange (OPE), c₀ = −(1 + q∂_q ln Ṽ) ≈ −1.1 to −1.5.

**Olive–Pospelov estimate.** Their Weizsäcker–Williams estimate (eq. 3.13) takes F̂ ~ m_N/ω, i.e. an O(1) change of the scalar charge m_N in each collision. It therefore omits the conservation-law suppression. Physically, the radiating charge is ~T, not m_N.

## 2. Leading-soft (SRA) emissivity, with data

For massless φ (valid in supernovae, since m_eff ≈ 36 keV·(TeV/M)·(ρ/3e14)^½ ≪ T):

```
G_Q(ω) ≡ ∫K²dK 4π/(2π)⁴ /(16π) ⟨|F̂_Q|²⟩ = [(TrA)² + 2A:A] ω /(1680 π⁴ m²)  →  E² ω sin²θ /(420 π⁴)
Q_NN = Σ_ch c_ch g_s² ∫d³p₁d³p₂/(2π)⁶ f₁f₂ v ∫dΩ′ (dσ/dΩ)(p′/p)(1−f₃)(1−f₄) ∫dω ω G_Q(ω) / M⁴
```

- c_ch = 1/4 for nn and pp, and 1 for np; g_s = 2.
- Cross sections are spin-averaged PWA93 values. nn uses the nuclear pp phase shifts with Coulomb removed.

**Non-degenerate closed form:**

```
Q_NN ≈ [4/(11025 π⁴ M⁴)] Σ_ab n_a n_b/(1+δ_ab) ⟨ v σ⁽²⁾(E) E⁵ ⟩ ,   σ⁽²⁾ = ∫dΩ (dσ/dΩ) sin²θ
     ⇒ Q_NN/Q_OP ≈ 7 (σ⁽²⁾/σ_OP)(Σ n_a n_b/(1+δ)/n²) (T/m_N)² ≈ 2–3 (T/m_N)²
```

**Monte Carlo result** (sra.py, Fermi–Dirac with Pauli blocking, ε at M = 1 TeV, scaling as M⁻⁴):

| T [MeV] | ρ [g/cm³] | ε_Q(1 TeV) [erg/g/s] | ε_OP(1 TeV) | S = ε_Q/ε_OP | M_min(Q only) | M_OP |
|---|---|---|---|---|---|---|
| 20 | 3e14 | 1.05e20 | 1.15e23 | 0.9e-3 | 1.8 TeV | 10.4 |
| 30 | 1e14 | 3.6e20 | 1.6e23 | 2.3e-3 | 2.4 | 11.2 |
| 30 | 3e14 | 1.02e21 | 4.75e23 | 2.1e-3 | 3.2 | 14.8 |
| 40 | 3e14 | 5.0e21 | 1.3e24 | 3.9e-3 | 4.7 | 19.0 |

- S_Q ≈ 2.2 (T/m_N)².
- Channel split: nn 40%, np 51%, pp 9%.
- Pauli blocking reduces the rate by ≤15%.
- Setting m* = 0.7m changes it by ≤13%.
- Evaluating σ at the final-state energy instead of the initial one gives ×2.9. This is a known SRA ambiguity, driven by the 1S0 low-energy resonance.

## 3. Beyond the leading soft term: the NLO factor K_NLO = Q_total/Q_Q

**(a) Relativistic tree-level OPE (ope.py).**
- Method: Dirac spinors, pseudovector πNN, and all five diagrams (h from the four nucleon legs plus the pion propagator), with t- and u-channels. The Feynman rules follow from Weyl-rescaling the nucleons with the pion left unrescaled:
  - NNh vertex: −m/M²
  - ππh vertex: (2k·k′ − 4m_π²)/M², which reproduces the chiral result ⟨π|θ|π⟩ = 2m_π² + t
- Soft-limit check: with ω < 0.05E, full/SRA-Q = 0.75 ± 0.1. This validates the Q-term normalization to about 25%.
- Over the full phase space, full/SRA-Q = 1.3 (nn) and 3.6 (np), roughly 2.4 on average.
- Emission from the pion line alone is 4–12 times the Q term, but it interferes destructively with the external-leg terms.

**(b) Exact monopole, eq. (3) (monopole_exact.py, monopole_thermal_fast.py).**
- Inputs: Reid68 soft-core potential (1S0) and Malfliet–Tjon III (1S0, 3S1), which reproduce PWA93 S-wave phases to a few degrees. L ≥ 1 waves use the Born value c₀ = 1.2.
- Result: thermal Q_total/Q_Q = 9–14 for nn and np at T = 20–40 MeV. This is stable against cutting E_cm > 175 MeV.
- The source is the steep short-range repulsion, since W = 2V + rV′ = V(1 − μr) for each Yukawa term. It is physical: the trace T^μ_μ = ε − 3P sees the collision pressure. But it depends on off-shell, short-distance behaviour and is model-dependent.

**Adopted:** K_NLO ∈ [2, 12], central 5.

## 4. Other channels

**π⁻p → nφφ (pion.py).**
- This is a leading-order chiral tree calculation. It is NOT conservation-suppressed, because the pion's rest mass and scalar charge disappear.
- ⟨σvω⟩ = (2.25, 4.6, 8.6)e3 MeV²/M⁴ at T = (20, 30, 40) MeV, and ⟨ω⟩ ≈ 190 MeV.
- The pion-line diagram dominates.
- ε_π(1 TeV) = 5.7e22 erg/g/s × (Y_π⁻/1%) at T = 30 MeV, ρ = 3e14, Y_p = 0.3. For Y_π ≳ 0.2% this beats NN.
- Y_π⁻ = 1–5% comes from the virial/interacting pion gas (Fore & Reddy 2020; Carenza et al. 2021, which gives 1.1% at t = 1 s). An ideal gas with μ_π = μ̂ gives 0.1–0.5%, rising toward condensation where μ̂ → m_π.
- Adopted: Y_π(37 MeV) ∈ [0.3%, 3%], central 1%, times 0.7 for final-state Pauli blocking and in-medium effects.

**Channels that turn out negligible:**
- πN → πNφφ: ~7% of absorption.
- π⁰π⁰ and π⁺π⁻ → φφ: ~1e-3 of absorption.
- e⁺e⁻ → φφ and eN → eNφφ: suppressed by (m_e/T)² and m_e²/M⁴.
- γγ → φφ via the trace anomaly: ξ_F ~ α/π, so M ≳ 0.3 TeV only.

## 5. Profiles and the bound (profile_bound.py)

- The Garching SFHo-18.8 and LS220-s20.0 profiles are password-protected. I therefore used two **parametrized** 1-second profiles ("cold" and "hot"), built from anchor points read off published figures.
  - Cold: baryonic mass 1.41 M☉, T_max 31.5 MeV.
  - Hot: baryonic mass 1.33 M☉, T_max 42.5 MeV.
- Criteria: L_φ < 3e52 erg/s (5.7e52 as the alternative), and the Raffelt criterion at (30 MeV, 3e14, Y_p = 0.3).

| Scenario (K_NLO, Y_π) | cold | hot | Raffelt point | π share |
|---|---|---|---|---|
| NN leading-soft only (K = 1, no π) | 2.9 | 4.2 | 3.2 | 0 |
| conservative (2, 0.21%) | 4.5 (3.8*) | 6.3 (5.3*) | 5.7 | 0.6 |
| **central (5, 0.7%)** | **5.9 (5.0*)** | **8.2 (7.0*)** | **7.6** | 0.7 |
| aggressive (12, 3%) | 8.2 (7.0*) | 11.3 (9.7*) | 10.7 | 0.8 |

All values in TeV; * marks the L < 5.7e52 criterion.

**Result:** M_min ≈ 6.5 (+4.5, −2.5) TeV. The conservative floor is about 4 TeV. Using only leading-soft NN and the coldest profile, the floor falls to about 2.5–3 TeV.

## 6. Trapping and escape

- φN elastic scattering through the contact term: σ = m_N²/(4πM⁴) ≈ 2.7e-41 cm² at M = 1 TeV.
- Mean free path: λ ≈ 2 m × (M/TeV)⁴ (3e14/ρ). At M = 6 TeV this is about 2.7 km.
- Diffusive escape takes ≪ 1 ms, and φ number is conserved. The energy is re-set to roughly the temperature at r ≈ 12 km, where T ≈ 25–35 MeV, so the loss is a factor below 2.
- λ_φ = λ_ν (≈ 0.3 m at 100 MeV) at M ≈ 0.6 TeV. For 0.6–3 TeV the φ carry at least as much energy as a neutrino species, so the exclusion extends down to about 1 TeV. The trapping regime lies below the band of interest.

## 7. Neutron stars and other stars

**Neutron stars (ns_cooling.py).**
- Setup: degenerate nn quadrupole; the monopole is negligible because the rate goes as (E_F/ω)²; m_eff threshold ω ≥ 2√ρ/M, with 2m_eff ≈ 93 keV/M_TeV at 4e14.
- Scaling: L_φ ∝ T⁶M⁻⁴, compared with T⁴ for a linearly coupled scalar.
- Result: max L_φ/(L_ν + L_γ) ≤ 0.1 for M ≥ 1 TeV at T_b = 5e7–1e9 K, and ≤ 1% for M ≥ 3 TeV. This is before superfluid suppression. **No competitive bound.**
- A factor-4 normalization error in the first version was caught by a Monte Carlo cross-check and fixed.

**Red giants, white dwarfs and the Sun.**
- The scalar charge is proportional to ion mass, so the dipole vanishes for ion–ion collisions. The quadrupole is (T/m)²-suppressed and the pair phase space goes as T⁶.
- Red giants give only M ≳ 0.1–0.2 TeV. The Sun and white dwarfs are weaker still.
