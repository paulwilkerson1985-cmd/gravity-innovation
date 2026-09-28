> **Working log, superseded where it differs from `docs/`.** This file records the 26–27 Sep 2026 working calculations as they were done. The adopted numbers are in `docs/white_paper_v2.md` and `docs/sn_technical_note_v2.md`. In particular: Tier 1 reaches v² ≈ 2–3×10⁻¹¹ N, about **3** decades below HUST-09 (not 5), and the inverse-square-law gain needs Tier 2. HUST-09 uses the 50 ppm column (v² ≳ 1–5×10⁻⁸ N at 1.5–4 cm). A full-width 2 µm Al-Mylar membrane has κ/μ ≈ 0.14 × (1/μ/10 cm)(15 TeV/M)², ≈ 11% loss at the benchmark and 18–72% along the M ≈ 7.5 TeV floor. The electrostatic baseline is that membrane, not "no shield".

# Experiment design: fixed-mass modulation, light sources, AI coefficient, 3D check, cheapest Tier-1

*Fable 5 · 26 Sep 2026 (revised after the 3D run; v1 kept as `SUMMARY_v1_backup.md`) · Gravity Innovation · scripts and outputs in this folder: `mod_schemes.py/.out/.json` (gas, liner, disk, sheet scans), `light_source.py/.out/.json` (foil-disk source), `convection.py/.out`, `pair_potential.py/.out/.json`, `torque3d.py`, `torque3d_pair.py`, `torque3d_harm.py` + `torque3d_*.out`, `torque3d_results.jsonl` (3D), `ai_coefficient.py/.out/.json`, `design_numbers.py/.out/.json`. Solvers: `solver/upgrade/symm_robin.py` (validated cut-cell axisymmetric, h = 0.05/0.025) and `hust09/h3d.py` (3D finite volume, Newton + AMG). Units: lengths 1/μ, field v, force v² (1 eV² = 8.12e-13 N). Benchmark: 1 m × 1 m chamber (R = L/2 = 5 at 1/μ = 10 cm), Cu test sphere a1 = 0.3 (3 cm), Cu source a2 = 0.6 (6 cm, 8.10 kg), centres 1.4 apart (14 cm); S = F(source) − F(no source) = 1.20 v². Tier 1 = 3e-11 N, Tier 2 = 3e-13 N.*

## 0. Headline changes to the design

1. **The Newtonian background can be cut ~1e3–1e4× without touching the scalar signal, by making the *source* a thin screened foil and the *test bodies* hollow shells.** The screened-body force is fixed by surface geometry and saturates once κ/μ = t/t* ≳ 10 (t* = μM²/ρ = 2.3 µm Cu at 10 cm/15 TeV), while gravity keeps growing with mass. Solver (`light_source.out`): a **5 cm-radius Cu disk 4 cm from the test body pulls it with 1.04 v² at κ/μ = 10 (23 µm, 1.6 g at M = 15 TeV) and 1.29 v² at κ/μ = 30 (68 µm, 4.8 g)** — as much as the 8.1 kg sphere at 14 cm (1.20 v²). Its Newtonian pull on a 0.2 kg hollow shell is 3.2e-12 N (κ = 10) to 9.5e-12 N (κ = 30), i.e. **13–30× the Tier-2 signal instead of 2e4× (hollow shell + sphere) or 1e5× (solid + sphere)**. The foil-thickness series separates the two: F_scalar(t) saturates (0.60 → 1.04 → 1.29 → 1.45 v² for κ/μ = 3, 10, 30, ∞), F_N ∝ t. Reach at the high-M edge needs thicker foil (M = 36 TeV, κ/μ = 10: 130 µm, 9 g, F_N = 1.8e-11 N — still 300× better than the sphere).
2. **Gas modulation is not a clean fixed-mass switch, even at Tier 1** (this corrects v1 of this file, which used the Rayleigh–Bénard criterion; that applies only to bottom heating). A *lateral* temperature difference drives flow at any Grashof number: Batchelor slot flow u ≈ gβΔT L²/(125ν) at ρ_off(10 TeV) = 0.053 kg/m³ gives u = 0.6 mm/s for 1 mK across 1 m, Stokes drag 8e-9 N per 3 cm body and a differential torque ≈ 6e-11 N m = **70× the Tier-1 torque (8.5e-13 N m), 7000× Tier 2**; a 30 cm membrane windbreak at 0.3 mK still leaves 6× Tier 1 (`convection.out`). He and Xe at equal ρ have the same ν and η, so the He/Xe comparison does **not** discriminate convection (it does discriminate radiometric effects). The gas test survives as a *shape* fingerprint with a stepped source (kink at ρ = 0.584 ρ_crit against a background linear in ρ) and gives M; it is not the primary modulation.
3. **The 3D torsion calculation is done**: the true 2ω torque is 0.90 ± 0.04 of the pairwise proxy built from the axisymmetric pair potential, and the scalar/Newtonian *torque* ratio in the dumbbell geometry is 4.4e7 per N of v², within 3% of the on-axis force ratio 4.3e7 used in the signal table. **Signal table confirmed (5%, well inside the 20% asked).**
4. Recommended primary: **rotating light-source attractor (foil disks on a spoked table) + hollow-shell dumbbell + end-plate/cylinder liner switch**, with gas, foil thickness, composition and distance law as fingerprints.

## 1. Modulation with fixed masses — solver results

With every mass fixed the Newtonian torque is constant and the switch reads the scalar force directly; the null test needs only *stability* of the Newtonian torque over one switch cycle, not its absolute value.

### (a) Gas density switch (He or Xe, ρ_gas → 0.584 ρ_crit)
Field mass² → μ²(1 − g), g = ρ_gas/ρ_crit, ρ_crit = M²μ². Linear onset with bodies g_c = 0.584 (empty chamber 0.670). Solver signal (h = 0.05):

| g | 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.55 | 0.58 | ≥0.60 |
|---|---|---|---|---|---|---|---|---|---|
| S/S0 | 1 | 0.858 | 0.710 | 0.555 | 0.386 | 0.194 | 0.083 | 0.010 | 0 |

Fit: S/S0 ≈ (1 − g/0.584)^1.15 (±0.02 for g ≤ 0.5). Depth 100% for g ≥ 0.6. Switch-off pressures at 293 K (`design_numbers.out` §1): at 1/μ = 10 cm, **Xe 1.6 / 3.5 / 9.8 / 22 / 127 mbar for M = 4 / 6 / 10 / 15 / 36 TeV; He 33× higher**. Scaling P_off ∝ M²μ²/m_mol.

Systematics: convection (item 0.2) dominates; photophoresis (Knudsen, slip regime) 5–7e-13 N per mK across the body at ρ_off(6 TeV) (≈ 2× Tier 2 per mK); gas damping Q ≈ 300, thermal torque noise 4e-14 N m/√Hz (1e-14 N in 1 h, irrelevant); buoyancy 2e-5 N vertical (tilt–twist coupling makes it negligible for a balanced dumbbell); radiometric forces peak during pump-down through the transition regime (P ~ 1e-3–1e-2 mbar, ~5e-11 N per mK), so only the end states are usable; a moving source stirs the gas (rotation at 1 mm/s → 1e-8 N drag at the turntable frequency), so the source must be stepped and the gas allowed L²/ν ≈ 40 min to settle. **Verdict: fingerprint at Tier 1 (shape of S(ρ), gives M), not a modulation.**

### (b) Liner (metal cylinder around the pendulum axis, or end plates)
Dirichlet shell radius R_l, full chamber height (open ends):

| R_l | 5 | 4.5 | 4.0 | 3.5 | 3.2 | 3.0 | ≤2.8 |
|---|---|---|---|---|---|---|---|
| S/S0 | 1 | 0.951 | 0.848 | 0.621 | 0.360 | 0.142 | 0 |

Closed liner (caps at ±Z_l = R_l): S/S0 = 0.753 (4.0), 0.290 (3.5), 0 (≤3.3). **An open tube of radius 2.8/μ (28 cm at 10 cm) switches the field fully off**; as 25 µm Cu foil (κ/μ = 11) it weighs 0.4 kg, as 1 mm Al 4.8 kg. Alternative: two end plates moved from the chamber ends to ±1.5/μ (±15 cm) with pendulum and attractor in the mid-plane (with bodies the empty-cylinder budget (2.405/R)² + (π/2L)² must exceed 1/1.35 for switch-off). Newtonian pull of the tube on a body 6 cm off-axis 5e-11 N (1 kg) — radial and symmetric, dumbbell torque cancels; 1 mm centring error → 8e-13 N on 1 kg, 1.6e-13 N on 0.2 kg shells. Electrostatics unchanged if the grounded membrane (below) is permanent. **Depth 100%, no gas, one slow in-vacuum linear motion; ranks first.** Run it as liner-in/liner-out with the attractor running: the attractor-synchronous torque is Newtonian + scalar (out) vs Newtonian only (in); the Newtonian part cancels to the geometric reproducibility (µm).

### (c) Iris / movable foil between the bodies
A pinned disk of radius W ≥ 0.5 at the mid-plane kills the source signal to |S/S0| ≤ 1–2% (W ≥ 3: < 1e-3); a full-width Robin sheet needs κ/μ ≥ 10 for 99%. **But the disk itself pulls the test body with 1.2–1.5 v² — more than the signal it switches.** A movable single-sided foil is therefore not a switch: it is a *source*, and a very good one (item 0.1). Only a closed, centred can around the test body is a clean switch (interior exactly zero below threshold; residual < 1e-4 for a 1 cm fibre hole).

### (d) Domain-wall switch
`u9/u9b`: no metastable wall exists in the 1 m chamber (R = 5–7/μ; every initial condition relaxes to one domain); at R ≥ 8/μ (≥ 1.6 m) a wall pinned across the bodies is metastable and changes F_test by −3.0% (R = 8) to −5.3% (R = 10). Creating or removing it needs a re-condensation (gas cycle) with a random 50% outcome. **Depth 3–5%, stochastic, chamber ≥ 1.6 m: not a switch.** It is an *observable*: a bimodal run-to-run force distribution in a large chamber is a unique signature (cf. Clements et al. 2024), and the wall tension 0.94 μv² × perimeter ≈ 1.8 v² for a 3 cm body means a wall can mimic a source at the 100% level if it forms — one more reason to keep the chamber at 5–7/μ.

### Ranking (fixed-mass modulation)
1. **Liner / end plates** — 100% depth, in-vacuum, Newtonian-neutral by symmetry; the only clean fixed-mass switch. Combine with the light source.
2. **Closed foil can around the test body** — clean but mechanically the hardest (clamshell around the fibre).
3. **Gas** — fingerprint only (convection); Tier-1 shape test, gives M.
4. **Domain wall** — observable, not a switch.
Permanent baseline: full-width grounded 2 µm Al-Mylar membrane between attractor and pendulum (κ/μ = 0.14 at 10 cm/15 TeV → 8% signal loss, `u10`; 35% at 4 cm/5 TeV), so no switch changes the electrostatics.

## 2. Recommended primary design (light-source rotating attractor)

| Item | Spec | Number |
|---|---|---|
| Chamber | ≥ 1 m × 1 m, 1e-6 mbar, valved; borrowed | onset 67 cm at 10 cm (3.33/μ), hardware → 3.7/μ (`u7`) |
| Pendulum | dumbbell, 2 hollow Cu shells r = 3 cm, 2 mm wall (0.2 kg each; κ/μ ≥ 400, Dirichlet across the wedge), Au-flashed, arm b = 6 cm; 75 µm × 1 m W fibre (κ_f = 5e-7 N m/rad, T = 340 s, 0.9 GPa) | thermal torque noise 1.2e-14 N m/√Hz (Q = 3000) → 2e-16 N m in 1 h; Tier-2 torque 8.5e-15 N m: **SNR 40 per hour** |
| Attractor | 2 (or 3) Cu foil disks, r = 5 cm, on a spoked wheel, 4 cm from the shells, stepped or rotated at 2ω; thickness series 23 / 68 / 230 µm | scalar 1.04 / 1.29 / 1.40 v² (κ/μ = 10 / 30 / 100 at 15 TeV); F_N = 3.2e-12 / 9.5e-12 / 3.2e-11 N on 0.2 kg |
| Turntable rule | hub and plate ≥ 1.5–2/μ from the shells; spokes ≤ 3 mm (anything thicker than ~10 µm is Dirichlet) | plate at 0.3/μ costs 40% of S (`u7`); ≥ 1.5/μ costs 9–13% |
| Switch | end plates ±15 cm ↔ chamber ends (or 28 cm foil tube), one motion per hour | §1(b) |
| Readout | autocollimator 1e-8 rad/√Hz | Tier-2 twist 1.7e-8 rad (κ_f = 5e-7): 1 h; Tier 1 1.7 µrad |
| Electrostatics | membrane + bias nulling; sphere–plane at 4 cm: 8e-12 N (ΔV/V)² | ΔV_rms 30 mV → 7e-15 N (2% of Tier 2) |
| Thermal | 10 mK/h drift, 1 mK gradient (UHV run: no gas) | foil–shell distance stable to 40 µm/h for 1e-3 of F_N |

Newtonian budget at Tier 2 (15 TeV): F_N = 3.2e-12 N known to 1% from foil mass (weighed to 0.1%) and geometry (0.1 mm) → residual 3e-14 N = 0.1 signal; the liner switch and the thickness series remove even that. Sphere design for comparison: F_N = 5.5e-9 N (hollow shells) would need 5e-5 knowledge.

## 3. 3D check (task 3) — `torque3d_*.out`

Setup: dumbbell (2 × 3 cm Cu at ±6 cm) and the 6 cm source at 14 cm from the near body (r_s = 20 cm), all in the mid-plane of the 1 m chamber; energies E(θ) for pendulum angle θ; torque = −dE/dθ; 0.22–0.82 M nodes, residual ≤ 3e-12.
- Interaction energy W(θ) on one grid at θ = 0, 30, 45, 60, 90°: E2 = −0.1596, E4/E2 = 0.089, E6/E2 = 0.006 (v²/μ); **2ω amplitude τ_2 = 2|E2| = 0.319 (h = 5 mm), 0.329 (2.5 mm) → 0.34 extrapolated**; max torque 0.333 at θ = 35°.
- Pairwise proxy from the axisymmetric on-axis pair potential U(d) (`pair_potential.out`: U(1.4) = −0.851, U(2.6) = −0.130, U(2.09) = −0.301): τ_2 = 0.379 = **0.526 S·b**; E4/E2 = 0.092 (same harmonic content).
- 3D solver calibrated on the on-axis pair in the same grids: W_3D/U = 0.893 (5 mm), 0.932 (2.5 mm) → 0.97 extrapolated (residual staircase bias ~3%). Discretisation-consistent geometry factor (τ_2/W_pair)_3D/(0.379/0.851) = 0.942 (5 mm), 0.932 (2.5 mm) → 0.92; raw extrapolation 0.90. **Take 3D/proxy = 0.90 ± 0.04** (walls nearer the off-axis source, second body). b = 10 cm: 0.533 vs proxy 0.626 → 0.85 raw, the same factor after calibration.
- Consequence: scalar/Newtonian torque ratio in the dumbbell = 4.9e7 (pairwise) × 0.90 = **4.4e7 per N of v², vs 4.3e7 from the on-axis force ratio**. The signal table stands; use τ_2 = 0.47 S b (v²/μ) and multiply reach lines by S/S0 = 0.9 (3D) × hardware factor (0.87–0.93 with the turntable ≥ 1.5/μ away; 0.57–0.60 with a plate at 0.3/μ). Not modelled: arm and fibre (≤ 1–4% from `u7`).

## 4. Atom-interferometer coefficient (validated)

a = −∇ ln A = −∇(φ²)/(2M²) → **a = C · K_AI · (v²/eV²) · (10 cm/(1/μ)) · (5 TeV/M)², K_AI = 1.80e-8 m s⁻² per eV²**, C = |∇̃(φ̃²)|:

| d above surface (1/μ) | 0.05 | 0.1 | 0.2 | 0.3 | 0.5 | 0.7 | 1.0 | 1.5 |
|---|---|---|---|---|---|---|---|---|
| C, isolated 6 cm sphere (exact ODE) | 0.53 | 0.85 | 1.11 | 1.13 | 0.92 | 0.68 | 0.39 | 0.16 |
| C, 1 m chamber (h = 0.025) | 0.49 | 0.78 | 1.03 | 1.06 | 0.87 | 0.65 | 0.38 | 0.14 |
| C, 0.75 m chamber | 0.28 | 0.46 | 0.62 | 0.65 | 0.58 | 0.46 | 0.29 | 0.09 |

**C_max = 1.06 at d = 0.2–0.3/μ (2–3 cm) in the 1 m chamber** (the white paper's 0.8 was the right order but placed the atoms at 1–3/μ, where C = 0.38–0.02); a 3 cm sphere gives 1.59; atoms in the gap between two bodies see |C| ≤ 0.2. A planar wall gives only 0.27, so a foil source is *worse* for atoms: the AI wants a compact sphere. Reach: **v²_min[N] = 4.3e-15 × (1/μ / 10 cm) × (M/5 TeV)² for δa = 1e-10 m/s²** (3.8e-14 N at 15 TeV, 2.2e-13 N at 36 TeV, 10 cm): the AI covers the low-M half of the wedge to 100× below Tier 2, the balance the high-M half.

## 5. Cheapest credible Tier-1 (≤ 12 months, partner lab)

- **Chamber:** a 0.6–0.7 m chamber is sensible *only* for 1/μ ≤ 7–8 cm (onset 3.4/μ with bodies → 0.48 m at 7 cm, 0.67 m at 10 cm; near-full signal needs 1.4× that). It covers the 2–7 cm end where HUST-09 already trims the top; **1 m is the right first machine** (≤ 10 cm fully, 15 cm at 15% signal).
- **Components (lab-standard):** W fibre 75 µm (Goodfellow), autocollimator (Elcomat-class, ~$20 k) or optical lever, in-vacuum stepper/piezo turntable with a spoked Al wheel, machined Cu hemispheres (2 mm wall, Au flash), 2 µm Al-Mylar membrane, capacitance manometer + MFC for the gas fingerprint, turbo + scroll, mu-metal, passive thermal enclosure, tiltmeter.
- **Noise without electrostatic shield (membrane only):** thermal 2e-13 N/√Hz force-equivalent (hollow dumbbell) → 3e-15 N per hour; patch potentials: sphere–plane 8e-12 N (ΔV)², ΔV_rms 30–100 mV → 7e-15–8e-14 N modulated with the attractor, so **Tier 1 is unaffected (≤ 0.3%); Tier 2 needs bias nulling and Au surfaces (≤ 30 mV)**. Mitigation: Au-flash both surfaces, bias parabola to ±2 mV weekly, Kelvin-probe map of the foils, membrane as DC screen (95–99%), liner switch (patch force unchanged when the field is off).
- **Cost:** pumps 20 k, gas handling 10 k, pendulum/fibre 5 k, autocollimator 20 k, attractor + table 8 k, membrane 1 k, thermal/tilt 15 k, DAQ 10 k, isolation 10 k → **≈ $100–130 k with a borrowed chamber, ≈ $200 k if bought**; one student-year.
- **Switch schedule:** weeks 1–4 commissioning at UHV, attractor at 2ω (period 20 min), 100 h; weeks 5–8 liner in/out alternating hourly, 200 h; weeks 9–12 foil thickness series (23/68/230 µm) and an Al/W solid-source cross-check; then the Xe shape scan at 3 pressures (stepped source, 2 h settle) and a 14→30 cm distance point.
- **Publishable result:** a null at 3e-11 N × (S/S0 = 0.8) gives **v² < 4e-11 N for 1/μ = 2–10 cm (≈ the dark-energy line V0 = ρ_Λ, v² = 2e-11 N at 10 cm), 5 decades below HUST-09, the first macroscopic-mass bound in the band**, plus a ~10× inverse-square-law improvement at 10–30 cm as a by-product. A PRD-class exclusion regardless of the symmetron.

## 6. Red flags found

1. **Heavy solid masses were never needed** (source or test): screened-body forces are surface-set; the 8 kg sphere bought 1e5× Newtonian background for nothing. Light foils + hollow shells are the single largest credibility gain (item 0.1).
2. **Gas-switch convection** (item 0.2): lateral gradients, not Rayleigh–Bénard, set the limit; He/Xe does not cancel it.
3. **Everything solid is Dirichlet**: turntable, arm, mounts pin the field (κ/μ ≳ 100 for anything ≥ 0.1 mm); only µm foils and ≤ 20 µm wires are transparent. Design rule: no bulk metal within 1.5–2/μ of the bodies except the attractor; spoked table.
4. **The AI atoms belong at 2–3 cm from the source, not 10–30 cm**, and the AI wants a compact sphere while the balance wants a foil — the two arms need different attractors.
5. **Domain walls** can mimic a 100% signal in chambers ≥ 8/μ; keep R ≈ 5–7/μ or treat bimodality as an observable.
6. The white paper's "wire grids offer no transmission window" contradicts `u6/u10`: a full-width 2 µm Al-Mylar membrane costs 8% and screens DC. Make it the baseline.
7. A single-sided movable foil "iris" modulates its own 1.2–1.5 v² pull — never present it as a switch.

## 7. Sensitivity lines for Fig. 1B (v²_min in N vs 1/μ in cm)

- Torsion, 1 m chamber, sphere or foil attractor: v²_min = F_tier/(0.9 · f_hw · F̃(1/μ)), F̃ = 1.58, 1.45, 1.20, 0.18, 0 at 1/μ = 4, 7, 10, 15, 20 cm (1.5 m chamber: 1.58, 1.45, 1.27, 1.02, 0.62), f_hw = 0.9. Tier 1 (3e-11 N): 2.3e-11, 2.6e-11, 3.1e-11, 2.1e-10 N at 4, 7, 10, 15 cm; Tier 2: 100× lower. The foil attractor gives the same F̃ within 15% for κ/μ ≥ 10 (M ≤ 15 TeV at 23 µm); at the high-M edge scale the foil thickness ∝ M².
- AI (1e-10 m/s², atoms at 0.25/μ from a 6 cm sphere in a 1 m chamber): v²_min = 4.3e-15 × (1/μ/10 cm) × (M/5 TeV)² N; draw for M = 5, 15, 36 TeV.
- Dark-energy line: V0 = ρ_Λ ↔ v² = 4ρ_Λ/μ² = 2.0e-11 N × (1/μ/10 cm)².
- HUST-09 (existing): 6e-9, 9e-9, 1.6e-8, 2.6e-8, 5e-8 N at 1.5, 2, 3, 4, 5 cm; none above 6 cm.
