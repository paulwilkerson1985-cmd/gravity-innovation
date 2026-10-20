# Q6a: electrostatic (contact- and patch-potential) budget for the primary design

*Daily run, 20 Oct 2026. Orchestrator: Claude. First slice of work-queue item Q6 (design pack). Status: **Fable-reviewed (MINOR ISSUES; all ten points folded in by the orchestrator, revision 2, not re-reviewed)**, see §8. Code: `claude/code/q6/q6a_electrostatics.py` (output `q6a_electrostatics.out`). No adopted number is changed by this item; it produces design rules and a budget table.*

## 1. Plain-English summary (for Paul)

Stray electric charges on metal surfaces ("patch potentials") are the classic way a sensitive torsion balance fools itself. We estimated every electrical effect we and the reviewer could think of for the recommended design. To imitate the signal, an effect would have to switch on and off with two independent motions at once (the rotating source and the "switch" plates), and a thin grounded metal sheet between the source and the balance blocks the source's electric fields. The effects that can do both are all below about a tenth of a percent of the faint signal, as long as a few build rules are kept: gold on every surface the balance can see, no holes in the shielding sheet, gold-coated and electrically adjustable switch plates, and clean, well-filtered electronics. With bare aluminium plates the switch would kick the balance by ten to forty times the signal, though at a different rhythm from the signal itself.

## 2. Design assumed (from `design/SUMMARY.md` §2 in the public repo)

- **Pendulum:** dumbbell of two hollow Cu shells, radius a = 3 cm, Au-flashed, arm b = 6 cm, on a 75 µm × 1 m W fibre (conducting, so the pendulum's potential is set through the fibre and it carries no free charge). Fibre constant κ_f = 5×10⁻⁷ N m/rad, free period 337 s (f₀ = 2.97 mHz), Q ≈ 3000.
- **Attractor:** Cu foil disks (radius 5 cm) on a spoked turntable, 4 cm below the shell surfaces, rotated or stepped at 2ω (≈ 0.83 mHz for a 20-minute period).
- **Membrane:** permanent, full-width, grounded metallised film between attractor and pendulum, horizontal; assumed at mid-gap (2 cm from the shell surfaces and from the foils).
- **Switch:** end plates moved from the chamber ends to ±15 cm. With a horizontal membrane only the **upper** plate (12 cm above the shell surfaces) is on the pendulum side; the lower plate is on the attractor side and screened. Alternative: a 28 cm-radius liner tube (≈ 19 cm from the nearest shell surface).
- **Targets:** Tier-2 force 3×10⁻¹³ N and torque 8.5×10⁻¹⁵ N m (= 0.47·b·F); Tier 1 is 100× larger; thermal torque noise 1.2×10⁻¹⁴ N m/√Hz, about 2×10⁻¹⁶ N m in one hour.
- **Measurement logic (design §1(b)):** the observable is the attractor-synchronous (2ω) torque, compared with the switch in and out. A systematic mimics the signal only if it is **both** at 2ω **and** changes with the switch.

## 3. Inputs from the literature

- **Pollack, Schlamminger & Gundlach, PRL 101, 071101 (2008), arXiv:0806.4765** (Eöt-Wash; Au-coated torsion pendulum 1 mm from an Au-coated Cu plate): surface-potential differences ≈ 25 mV and ≈ 120 mV on the two halves of one plate (upper limits, contact potential included). The ≈ 95 mV half-to-half difference supports the 50–100 mV large-scale pattern amplitudes assumed below. Fluctuations of the mean surface potential ≈ 30 µV/√Hz above 0.1 mHz, rising roughly as 1/f below. After venting and a bake-out the potential relaxed with a time constant of ≈ 2.5 days; drift ≈ 0.30 mV/day after 30 days and 0.15 mV/day after 50 days under vacuum. Patches of order 1 mm are reported by the Kelvin-probe work that paper cites; at our 2–20 cm gaps such small patches are exponentially irrelevant, and only cm-scale variations matter.
- **Work functions (handbook values):** Au ≈ 5.1–5.5 eV, Al ≈ 4.1–4.3 eV, so a bare Al surface facing an Au surface carries a contact potential of order 1 V (we use 1 V; oxide and adsorbates change it by tenths of a volt).
- Not read this run: the Trento / LISA Pathfinder patch-potential papers suggested in the queue (e.g. CQG 41, 195009, 2024). The budget uses the 2008 Eöt-Wash numbers; a later run should cross-check them against Trento's.

## 4. Method (order of magnitude)

1. **Sphere–plane capacitance**, exact bispherical image series, C = 4πε₀ a sinh α Σₙ 1/sinh(nα), cosh α = d/a with d the centre height. Vertical force F = ½V² |dC/dd|. Check: at a 4 cm gap this gives 8.7×10⁻¹² N per V², matching the design file's 8×10⁻¹² N. A vertical force exerts no twist torque on the fibre.
2. **Lateral force from a potential pattern** δV cos(kx) on a plane, acting on a conducting sphere at height d. First order in δV: with net charge Q = CV the interaction energy is Q φ_ext(centre) (mean-value property of harmonic functions on the sphere), φ_ext = δV cos(kx) e^(−kd), so F₁ = CV δV k e^(−kd). Second order: the pattern field also polarises the shell, F₂ = PF · 4πε₀a³k³δV² e^(−2kd), with a proximity factor PF = 3 (the reviewer's proximity-force estimate is 2–3× the dipole value at the 2 cm membrane gap). F₂ dominates when the shell is bias-nulled (V ≪ δV). We maximise F₁ + F₂ over k.
3. **Drift and noise** in Pollack et al. are of the *mean* contact potential, so a change ΔV of the shell's mean potential acts on the static pattern: F = C ΔV δV/(e d).
4. **Torque** = 2b × force: both shells, forces fully tangential and adding (upper bound; random orientation gives √2·bF).
5. **Membrane flexing by the attractor's own contact potential:** pressure p = ε₀E²/2 with E = V_a/g_a over a disk of radius R_d = 5 cm on a membrane of tension T (2–20 N/m, i.e. 1–10 MPa in a 2 µm film) clamped at L = 50 cm: w₀ = pR_d²/(4T)·(1 + 2 ln(L/R_d)). The shell then sees a 2ω modulation of its gap, δF = ½V_s²|d²C/dd²| w₀ (vertical); a torque needs an asymmetry, bounded at 1%.
6. **Holes in the membrane:** a hole of radius r at distance d passes a fraction ≈ (r/d)³ of the attractor-side pattern. This is conservative (the aperture-dipole result r³/(3π g_a d²) is about 4× smaller, and a hole directly under a shell gives no lateral force by symmetry).
7. **Upper end plate with the membrane present:** besides the two-conductor sphere–plane capacitance (3.7 pF, conservative), the table gives the shell–plate mutual capacitance with the grounded membrane 2 cm below, ≈ 1.1 pF (axisymmetric finite-difference calculation by the reviewer; 0.23 pF with the plate back at the chamber end).

## 5. Budget (from `q6a_electrostatics.out`, revision 2; torques compared with the Tier-2 torque 8.5×10⁻¹⁵ N m)

| Term | Synchronous with | Case | Torque (N m) | ÷ Tier 2 |
|---|---|---|---|---|
| A1 uniform shell–membrane contact potential | static | any V (force is vertical) | 0 | 0 |
| A2 large-scale membrane pattern × shell | static (absorbed by the fibre) | nulled to 2 mV, pattern 30 mV | 1.5×10⁻¹⁵ | 0.18 |
| | | 100 mV, pattern 100 mV | 5.5×10⁻¹⁴ | 6.5 |
| | | 1 V (Al vs Au), pattern 300 mV | 1.4×10⁻¹² | 160 |
| A3 mean-potential drift over one hour (0.3 mV/day) × pattern | slow drift | pattern 30 / 100 mV | 1.6×10⁻¹⁸ / 5.3×10⁻¹⁸ | vs 1-h thermal 2×10⁻¹⁶: ≤ 3% |
| A4 mean-potential noise 30 µV/√Hz × pattern | noise (per √Hz) | 2 mV & 30 mV / 0.1 V & 100 mV / 1 V & 300 mV | 4×10⁻¹⁸ / 2.6×10⁻¹⁷ / 1.7×10⁻¹⁶ | vs thermal 1.2×10⁻¹⁴: ≤ 1.4% |
| A5 2ω electrical pickup (1 mV) × membrane pattern | **2ω** only | pattern 30 / 100 mV | 1.3×10⁻¹⁶ / 4.3×10⁻¹⁶ | 0.015 / 0.05 per mV |
| B1 membrane flexing by the attractor | **2ω** only | V_a = 1 V, T = 2 N/m, V_s = 1 V (worst) | 4×10⁻²³ | 5×10⁻⁹ |
| B2 hole in the membrane near a shell | **2ω** (switch changes the shell charge only slightly) | r = 1 mm / 5 mm, 100 mV both sides | 3×10⁻¹⁹ / 4×10⁻¹⁷ | 4×10⁻⁵ / 5×10⁻³ |
| C upper end plate (12 cm) | switch (DC step, not 2ω) | Au, biased to 30 mV / 50 mV | 1.0×10⁻¹⁵ / 2.8×10⁻¹⁵ (membrane-screened C: 3.3×10⁻¹⁶ / 9.2×10⁻¹⁶) | 0.12 / 0.33 (0.04 / 0.11) |
| | | Au, unbiased 120 mV | 1.4×10⁻¹⁴ (4.3×10⁻¹⁵) | 1.6 (0.51) |
| | | bare Al, ~1 V | 3.3×10⁻¹³ (1.0×10⁻¹³) | 39 (12) |
| C2 2ω electrical pickup (1 mV) × upper-plate pattern | **2ω and switch** | pattern 50 / 100 mV, membrane-screened C | 1.6×10⁻¹⁷ / 3.2×10⁻¹⁷ | 0.002 / 0.004 per mV |
| C liner tube (19 cm) | switch (DC step, not 2ω) | Au, 30 / 50 / 120 mV | 6.6×10⁻¹⁶ / 1.8×10⁻¹⁵ / 8.8×10⁻¹⁵ | 0.08 / 0.22 / 1.0 |
| | | bare Al, ~1 V | 2.2×10⁻¹³ | 26 |

Further terms estimated by the reviewer (not in the script): a 5 mm–5 cm edge gap between the membrane and the chamber wall, ≈ 4×10⁻⁵–4×10⁻³ of Tier 2 at 2ω (V_s = 100 mV); a charged insulator in view of the pendulum, e.g. 100 V on a 5 cm autocollimator window 44 cm away, a switch-dependent DC step ≈ 0.2 of Tier 2 at V_s = 2 mV (10× at 100 mV); a cylindrical fibre feels no electrostatic twist torque; radiative heating of the membrane by the passing foils moves it by ~30 nm per mK, about 10³× the electrostatic flex of B1 but still negligible.

## 6. Conclusions and design rules

1. **No electrostatic path above about 10⁻³ of the Tier-2 torque mimics the double-modulated signal**, provided the rules below hold. The paths that are both at 2ω and switch-dependent are a 2ω electrical ripple acting on the upper plate's static pattern (C2, ≈ 0.002–0.004 of Tier 2 per mV of ripple), leakage through apertures and edges combined with the switch's small change of the shell charge (≲ 10⁻⁴), and, for the liner option, the slot where a tube would cross the membrane (≲ 10⁻⁴–10⁻³). A continuous grounded metal film screens quasi-static fields from the attractor side for all practical purposes (charge relaxation ~10⁻¹¹ s for ~1 Ω per square; the attractor-side Mylar face sits behind the metal), so the residuals come only from apertures, edges and electrical pickup. The white paper's "screens DC fields at 95–99%" is therefore conservative, not wrong.
2. **The switch electrodes give the largest electrostatic term, but as a DC step, not at 2ω:** ≈ 0.04–0.5 of Tier 2 for Au (biased to 30–120 mV; membrane-screened estimate) and ≈ 12× (screened) to 39× (conservative) for bare Al. In the primary scheme (2ω amplitude, switch in vs out) a DC step shifts the pendulum's rest angle (≈ 2–7×10⁻⁷ rad for bare Al, ≲ 3×10⁻⁸ rad for Au; κ_f = 5×10⁻⁷ N m/rad). **It also excites the free torsional mode** (f₀ = 2.97 mHz; ring-down time Q/πf₀ ≈ 3.7 days, longer than the hourly switch cadence). For Au this is benign. For bare Al the ringing is ≈ 12–39× the Tier-2 twist (1.7×10⁻⁸ rad) and can leak into the 2ω bin at the percent level with a rectangular one-hour window, unless the switch moves slowly compared with 337 s and the free mode is fitted out. A switch-only measurement (stationary source) would need Au electrodes biased to ≲ 10 mV **and** large-scale patterns ≲ 30 mV, since biasing cannot null a pattern.
3. **Static patch torques are large in the worst case but harmless:** up to ~160× Tier 2 with an unnulled 1 V contact potential, but constant, so the fibre absorbs them. Their drift over an hour and their noise stay below a few percent of the thermal noise.
4. **Rules for the design pack:**
   - Au on every surface the pendulum sees: shells, the membrane's pendulum-side face (the Au-on-Mylar option in the white paper, rather than Al), the switch electrodes or liner, and nearby mounts.
   - The membrane is continuous, grounded and full-width: no holes or slits, especially near the shells; check metallisation continuity by measuring sheet resistance across the span (thin Al on a 2 µm film can craze under tension, and floating islands pass the field capacitively); keep the edge gap at the chamber wall to a few millimetres.
   - The liner option needs a defined topology: a full-height tube must cross the full-width membrane (slot or split tube), which conflicts with the no-slit rule; this is a design question for the liner-mechanics slice of Q6. The end-plate option uses only the upper plate electrostatically.
   - Switch electrodes and liner are insulated from ground and individually biasable, so their contact potential to the pendulum can be nulled (Kelvin method: scan the bias, find the torque-step minimum); move the switch slowly compared with the 337 s free period and fit the free mode.
   - **Clean electronics at 2ω:** the turntable drive is electrically isolated, and the bias supplies and grounds are filtered so that the 2ω content of the pendulum bias, the switch-electrode bias and the membrane ground, relative to the fibre reference, is ≲ 0.1 mV (C2 then ≲ 4×10⁻⁴ of Tier 2).
   - No exposed insulators within sight of the pendulum: bare Mylar, Kapton, ceramic standoffs, mirror edges and adhesive on the pendulum, and the autocollimator viewport (behind a grounded mesh or aperture).
   - The pendulum bias nulls its contact potential to the membrane; weekly re-nulling to a few mV (as the design file says) is enough for this budget.
5. **On the sent white paper's spec** ("Tier 2 needs ΔV ≲ 30 mV"): 30 mV is sufficient here (worst 2ω path ≤ 5×10⁻³ of Tier 2 with the ≲ 0.1 mV ripple rule; DC step ≈ 0.04–0.12 of Tier 2 at 30 mV bias and 30 mV patterns), so it is conservative, not an error, and needs no erratum. Its original derivation (a vertical sphere–plane force without the membrane, "modulated with the attractor") is not the operative mechanism; a footnote in the next document version should say so.

## 7. Caveats

- Order of magnitude: single Fourier mode at the worst wavelength, forces fully tangential and adding on both shells. The A2 and C rows are upper bounds probably by a factor of a few; the C rows with the two-conductor capacitance are about 3× conservative compared with the membrane-screened value.
- The membrane position (mid-gap), tension (2–20 N/m), the 1 V Al–Au contact potential and the pattern amplitudes (30–300 mV at the 5–15 cm scale) are assumptions, bracketed in the table.
- Design-level issue found in passing (not electrostatic): a lower end plate at −15 cm would sit close to the turntable hub, against the design file's rule of keeping the hub and plate ≥ 1.5–2/μ from the shells. To be resolved in the liner-mechanics slice.
- Not covered here: magnetic systematics (ferromagnetic impurities in Cu foils, eddy currents from the turntable drive), thermal radiation pressure, fibre anelasticity and tilt–twist coupling. They belong to later Q6 slices.
- The Trento / LISA Pathfinder patch data have not yet been compared (§3).

## 8. Review

- **Fable (20 Oct 2026, one call): MINOR ISSUES; recordable as a reviewed design note once its points are folded in; changes no adopted number.** Fable reran the script (byte-identical output), recomputed the rows by hand, checked κ_f, the free period, the thermal noise and the Tier-2 torque against the design file, read Pollack et al. 2008 (values faithful) and ran a small finite-difference solve for the shell–plate mutual capacitance with the membrane present.
- Its points, all folded into revision 2: (1) at the nulled operating point the second-order (δV²) term dominates and Pollack's drift and noise multiply the static pattern, so the first-order rows were not upper bounds (fixed in the script; the nulled rows rose by about 3–15×, conclusions unchanged); (2) two shells, torque 2bF; (3) the C rows are about 3× conservative with the membrane present (screened values added); (4) "no effect mimics" was overstated: double-modulated paths exist (2ω electrical pickup on the upper plate's pattern, aperture × switch, liner slot), so the claim is now "no path above ~10⁻³ of Tier 2" and a clean-electronics rule was added; (5) the DC step excites the free mode (ring-down 3.7 days), now stated; (6) only the upper end plate is on the pendulum side; (7) extra rules (metallisation continuity, insulators on the pendulum and the viewport, edge gap, fibre, radiative membrane motion); (8) the hole-leakage estimate is conservative; (9) §3 wording on the drift timeline and patch sizes; (10) the white-paper spec is conservative; footnote for its derivation in the next version.
- The fixes were applied by the orchestrator and not sent back for a second review.
