# Q2b: Do existing atom-interferometer data already exclude part of the dilaton corner?

*Weekly run, 5 Oct 2026. Status: **done; Fable-reviewed (minor issues, all applied).** Panda-based numbers cleared for adoption; Jaffe 2017 columns are indicative only. Code: `claude/code/q2b/` (`dilaton_atoms.py` solver, `thresholds.py` → `thresholds.out`, `validate.py`, `far3d.py`); repo target `models/q2b/`.*

## Plain-English answer (for Paul)

Yes, partly. Two published atom experiments from Berkeley (2017 and 2024) were not designed to look for our "second target" field, but we worked out what that field would have done to their atoms. The 2024 experiment would have seen it for the shortest-range versions of the field and for the strongest-coupled versions. So that slice of our second target is already ruled out by existing data. A large part of the second target is still untested, and the main target (the symmetron) is not affected at all. Nothing we sent is wrong: the white paper called this corner "unverified" and asked the experts exactly this question. The Vienna email will now say what we found.

## Question

The white paper (sent 27 Sep) says a Tier-2 null would exclude 5×10²⁵ ≲ λ ≲ 2.5×10²⁸ for A₂ ≳ 10²⁸(λ/10²⁷)², for V = V₀e^(−λφ/M_Pl), A = 1 + A₂φ²/2M_Pl², V₀ = ρ_Λ, and calls the corner "plausibly open, unverified". Q2 (28 Sep) found no published bound but flagged that unscreened atoms might already reach part of it. This item computes that.

## Method

**Field equation.** With x = λφ/M_Pl and k² = λ²V₀/M_Pl² (1/k = 9.50 cm × 10²⁷/λ):
∇²x = k²[−e^(−x) + (ρA₂/λ²V₀) x].

- **Walls and source are Dirichlet x = 0.** Across the corner the tungsten source and steel/glass walls are deeply screened (in-matter x ≲ 10⁻³, skin depth ≲ 0.6 mm at the thresholds found below, ≲ 1 mm at the extreme large-λ end). Residual gas (≲ 10⁻¹⁴ kg/m³) is negligible.
- **In vacuum the field obeys the Liouville equation** ∇²x = −k²e^(−x). So the profile depends only on k (that is, on λ) and on geometry. It does **not** depend on A₂.
- **Atoms are unscreened.** For the Cs nucleus, m_ρR ≈ 10⁻³ even at A₂ = 10³¹. A test atom feels a = −c²∇ln A = −c²(A₂/λ²) x∇x, which points towards lower x, i.e. towards matter (attractive).
- **Signal.** The experiments measure the source-induced pull: the part of the vertical acceleration that flips sign above versus below the mass, taken as the near-minus-far difference. We compute
  D(λ) = [x ∂_z x]_near − [x ∂_z x]_no source on the axis at the atoms, so the pull is P = c²(A₂/λ²) D.
- **Exclusion.** The excluded region is A₂/λ² > a_bound / (c² D(λ)). It is a ceiling: everything above it is excluded. There's no upper end inside the corner, because atoms stay unscreened up to A₂ ~ 10³⁷ and EFT validity, (A₂/λ²)x²/2 ≪ 1, holds everywhere.

**Geometry (axisymmetric model).**
- **Source mass.** A tungsten hollow cylinder, OD = height = 25.4 mm with a 10.0 mm bore. Both papers use this design: Jaffe et al. 2017, arXiv:1612.05171, "0.19 kg, h = d = 2.54 cm, axial through-hole radius 0.5 cm, slot 0.5 cm"; Panda et al. 2024, arXiv:2310.01344, "inner diameter 10.0 mm, slot 5.7 mm". The bore is modelled; the slot is not.
- **Atoms** are on the cylinder axis (the cavity mode passes through the bore), above or below the mass.
  - *Panda 2024:* "the atoms never come closer to the source-mass surface than about 4 mm". Our Newtonian check is consistent: the on-axis pull of this cylinder is 34 nm/s² at 4 mm, against their calculated 35.2 nm/s². Baseline s = 4 mm from the face.
  - *Jaffe 2017:* a_cyl = a_near − a_far, with the mass toggled horizontally through the slot and the atoms launched from below (1.4 cm free fall). Their a_grav = 65 nm/s² is a trajectory average, yet it exceeds the on-axis maximum of this cylinder (≈ 38 nm/s² anywhere on the axis, including inside the bore). The geometry is therefore not understood; the "two-sided" reading is a guess, and the trajectory average is not modelled. **Jaffe columns are indicative only and are not to be quoted externally.** Baseline s = 5 mm. Panda carries the verdict.
- **Chamber.** Neither paper gives its dimensions. Hamilton et al. 2015 (the same lab's earlier apparatus) used "a short cylinder, inner radius 6.1 cm" (Elder et al. 2016, arXiv:1603.06587). We bracket the chamber with a vertical cylinder centred on the source:
  - **A**, radius 2.5 cm and half-height 3.0 cm (most conservative; it also mimics in-vacuum mirrors or holders about 1.3 cm above the atoms);
  - **B**, 2.5 / 6.1 cm (conservative);
  - **C**, 6.1 / 6.1 cm (Hamilton-sized).

  In the wall-limited regime the signal grows with chamber size (∝ k⁴L^~2–3), so A and B are the conservative choices. **Assumption: no wall within 2.5 cm of the axis.** Panda's three-camera triangulation and six MOT beams at the mass height imply optical access there, so a narrow tube is unlikely. Fable checked what happens if this fails:
  - a CF40-class tube (radius 1.9 cm, half-height 3 cm) lowers D by ×2.2 / 2.0 / 1.7 / 1.4 at λ = 3×10²⁷ / 5×10²⁷ / 10²⁸ / 2.5×10²⁸;
  - radius 1.5 cm lowers it by ×4.6 / 4 / 3 / 2.

  A close Dirichlet surface *above* the atoms (wall 5 mm above them) barely changes D at s = 4 mm; it is the radial walls that matter.
- **Bounds used (95% CL).**
  - Panda 2024: a_mass = 33.3 ± 6.2 nm/s² against 35.2 ± 1.0 calculated; their |a_anomaly| < 13 nm/s². That is a two-sided folded-Gaussian bound; an attractive anomaly alone is bounded one-sided at ≈ 8.5 nm/s², so using 13 is conservative by ×1.5.
  - Jaffe 2017: a_cyl = 76 ± 19 ± 16 against 65 ± 5 nm/s²; their a_anomaly < 50 nm/s².

**Solver.** A finite-difference axisymmetric Newton solve, written for this item (staircase Dirichlet masks, h = 0.25 mm).
- **Grid convergence:** h = 0.4 vs 0.2 mm agree to ≤ 2%.
- **Validation:**
  1. Against the exact 1D-slab Liouville solution: the central value agrees to ≤ 1×10⁻⁴ (relative) at λ = 10²⁷, 10²⁸ and 2.5×10²⁸.
  2. Against the repo's validated cut-cell Liouville solver (`models/dilaton_reach.py` / `solver/validation/symm_sw.py`), for a 1.27 cm sphere source in a 3.5 × 12.2 cm chamber at λ = 3×10²⁷: D = 1.555 vs 1.546 m⁻¹ (0.6%) at h = 0.2 mm.

## Results

**Thresholds (source-induced pull = bound), atoms on axis.** Columns are A₂ above which the data exclude (A₂/λ² = value/λ²).

| λ | 1/k | D (m⁻¹), chamber B | **Panda 2024**, chamber A | **Panda**, B | **Panda**, C | Jaffe 2017, B | Jaffe, C | Tier-2 lower edge 10²⁸(λ/10²⁷)² |
|---|---|---|---|---|---|---|---|---|
| 10²⁶ | 95 cm | 5.9×10⁻⁷ | 2.1×10³³ | 2.5×10³³ | 1.6×10³² | 8.7×10³³ | 5.7×10³² | 10²⁶ |
| 5×10²⁶ | 19 cm | 3.6×10⁻⁴ | 8.5×10³¹ | 9.9×10³¹ | 6.6×10³⁰ | 3.5×10³² | 2.3×10³¹ | 2.5×10²⁷ |
| 10²⁷ | 9.5 cm | 5.7×10⁻³ | 2.2×10³¹ | 2.5×10³¹ | 1.8×10³⁰ | 8.8×10³¹ | 6.2×10³⁰ | 10²⁸ |
| 2×10²⁷ | 4.7 cm | 0.087 | 5.7×10³⁰ | 6.6×10³⁰ | 5.6×10²⁹ | 2.3×10³¹ | 2.0×10³⁰ | 4×10²⁸ |
| 3×10²⁷ | 3.2 cm | 0.41 | 2.8×10³⁰ | 3.2×10³⁰ | 3.4×10²⁹ | 1.1×10³¹ | 1.2×10³⁰ | 9×10²⁸ |
| 5×10²⁷ | 1.9 cm | 2.5 | 1.3×10³⁰ | 1.4×10³⁰ | 2.3×10²⁹ | 5.1×10³⁰ | 8.0×10²⁹ | 2.5×10²⁹ |
| 7×10²⁷ | 1.4 cm | 7.4 | 8.5×10²⁹ | 9.6×10²⁹ | 2.1×10²⁹ | 3.4×10³⁰ | 7.2×10²⁹ | 4.9×10²⁹ |
| 10²⁸ | 0.95 cm | 20 | 6.4×10²⁹ | 7.2×10²⁹ | 2.1×10²⁹ | 2.6×10³⁰ | 7.4×10²⁹ | 10³⁰ |
| 1.5×10²⁸ | 0.63 cm | 53 | 5.5×10²⁹ | 6.1×10²⁹ | 2.4×10²⁹ | 2.3×10³⁰ | 8.7×10²⁹ | 2.3×10³⁰ |
| 2.5×10²⁸ | 0.38 cm | 138 | 5.9×10²⁹ | 6.5×10²⁹ | 3.5×10²⁹ | 2.5×10³⁰ | 1.2×10³⁰ | 6.3×10³⁰ |

**Where the existing ceiling meets the Tier-2 lower edge** (whole Tier-2 band already excluded above this λ):

| Data | Chamber A | Chamber B | Chamber C | Narrow tube, radius 1.9 / 1.5 cm (Fable) |
|---|---|---|---|---|
| Panda 2024 | 8.5×10²⁷ | 8.9×10²⁷ | 4.8×10²⁷ | ≈ 1.1×10²⁸ / ≈ 1.3×10²⁸ (≈ 1.5×10²⁸ combined with the far-position worst case) |
| Jaffe 2017 (indicative only) | 1.5×10²⁸ | 1.5×10²⁸ | 8.6×10²⁷ | — |

**Dependence on atom height.** D rises with s up to about 7–10 mm and then falls; for example D(7 mm)/D(4 mm) = 1.1–1.25. So s ≥ 4 mm is conservative. Panda's 35.2 nm/s² also fits s ≈ 3.5 mm, which would lower D by ≤ 7% (D(3 mm)/D(4 mm) = 0.86).

**The "far" position (3D check).** We ran a box chamber of 12.2 × 7 × 12.2 cm at h = 1 mm, with AMG-Newton. If the retracted mass were only 2.5 cm (or 4 cm) off-axis, it would still pull the atoms, and the measured difference would be R = 0.43–0.62 (0.82–0.92) of the near-minus-none value. A 12.2 cm cube at λ = 10²⁷ gives R = 0.37 / 0.77.
- Panda et al. state that "in the fully retracted position the mass should cause no measurable difference (< 0.01 nm/s²)". By a Newtonian estimate that needs the mass ≳ 25 cm away, so R ≈ 1 for Panda.
- In the worst case (R = 0.4), the thresholds rise ×2.5 and the crossing moves up by ≈ 1.3×, to ≲ 1.2×10²⁸.
- For Jaffe the far position is unknown; apply R = 0.4–1.

## Verdict

1. **Existing data (Panda et al. 2024; our calculation, not a published bound) already exclude the whole Tier-2 dilaton band for λ ≳ (0.5–1.1)×10²⁸.**
   - The range reflects the unknown chamber size, assuming no wall within 2.5 cm of the axis; the worst case is ≲ 1.5×10²⁸ (narrow tube plus far-position worst case).
   - The white paper's upper end, 2.5×10²⁸, is not new territory. That holds with a ≥ ×5 margin even for a 1.5 cm-radius tube.
2. **For 10²⁷ ≲ λ ≲ 10²⁸ they exclude the strong-coupling part:**
   - A₂ ≳ (3–7)×10³⁰ at λ = 3×10²⁷, falling to ≈ (0.7–1.2)×10³⁰ at 10²⁸ (conservative chambers A/B, and a 1.9 cm tube);
   - 3–10× lower in a Hamilton-sized chamber.
3. **For λ ≲ 5×10²⁶ they reach nothing inside the corner** (A₂ ≤ 10³¹) with the conservative chambers; a Hamilton-sized chamber would give A₂ ≳ 7×10³⁰ at 5×10²⁶.
4. **What Tier 2 would still add:** 5×10²⁵ ≲ λ ≲ (0.5–1)×10²⁸, from the screening edge A₂ ≈ 10²⁸(λ/10²⁷)² up to the atom ceiling.
   - At λ = 3×10²⁷ that window is ≈ 31–35× in A₂ for chambers A/B (≈ 15× for a 1.9 cm tube; ≈ 4× in a Hamilton-sized chamber).
   - At λ ≲ 10²⁷ it is ≥ 2 decades.
   - So roughly two of the white paper's ~2.5 decades in λ remain new, with a ceiling on A₂ at the large-λ end.
5. **Jaffe 2017** has a ×4 weaker bound and a geometry we cannot reproduce (see Method). It is indicative only and adds nothing beyond Panda.
6. **Scaling to other V₀.** At V₀ = sρ_Λ the same physics holds at λ/√s, with the atom ceiling on A₂ divided by s.

**Is an erratum needed? No (technical decision; Fable agrees).** The sent white paper gives the Tier-2 dilaton *reach* (still correct as a reach) and explicitly calls the corner "unverified" while asking Burrage whether it is already excluded. Nothing it states is wrong. The new information goes:
- into Email 3, to the dilaton group, which is unsent;
- into the 11 Oct follow-up to Burrage, as one sentence answering our own question 3;
- into the same sentence for any other white-paper recipient at the next contact;
- into a dated note on the adopted-numbers row.

The sent white paper itself stays frozen (RUNBOOK §3.6); this doc is the addendum.

**Sentence for the Burrage follow-up (and other recipients at the next contact):**
> On our question 3, we have since estimated that existing atom-interferometer data (Panda et al., Nature 2024) already exclude the large-λ end of that dilaton corner (λ ≳ 10²⁸) and its strongest couplings, so the question now concerns roughly 5×10²⁵ ≲ λ ≲ 5×10²⁷.

## Email 3 paragraph (replaces the Q2 caveat paragraph; insert after "…and the cosmological subspace.")

> One caveat we should state up front: at this corner the dilaton cannot be the dark energy. At the cosmic mean density it sits at λφ/M_Pl ≈ 45–57, so its potential energy is ~10⁻²⁰–10⁻²⁵ ρ_Λ; V₀ = ρ_Λ is only a normalisation (for screened bodies the force scales as V₀ at fixed V₀λ² and A₂), consistent with your Sec. VI finding that large-λ dark-energy dilatons lie outside the EFT's validity. We have also looked at existing atom-interferometer data, since unscreened atoms feel a = c²(A₂/λ²)x∇x. Modelling the Berkeley tungsten-cylinder geometry (Panda et al., Nature 2024; |a_anomaly| < 13 nm/s²) with screened walls and source, our estimate suggests those data already exclude A₂ ≳ (3–7)×10³⁰ at λ = 3×10²⁷ and the whole band for λ ≳ (0.5–1.1)×10²⁸; the spread reflects the chamber geometry, which the paper does not give. The part that would be new is therefore roughly 5×10²⁵ ≲ λ ≲ 5×10²⁷ below that ceiling. We would value your view on whether this treatment is sound.

## Caveats

- **Chamber, mirrors and holders are not given in the papers.**
  - Chambers A–C bracket them, assuming no wall within 2.5 cm of the axis.
  - Narrower radial walls lower the signal (Fable's tube runs above); walls or mirrors above or below the atoms matter little.
- **Not modelled:** the slot (≈ 9% of the mass, one side) and the off-centre position of the source in the chamber. Both are expected to be ≲ 20% effects.
- **Effective boundary.** Real screening puts the effective Dirichlet surface slightly inside the source and walls, which reduces D slightly. The skin depths at every threshold are tiny: 0.03–0.07 mm in tungsten and ≤ 0.2 mm in glass, including A₂/λ² ≈ 10⁻²⁷ at λ = 2.5×10²⁸. So this is negligible.
- **Conservative choices:** Panda's 13 nm/s² is two-sided (one-sided for an attractive anomaly: ≈ 8.5 nm/s², ×1.5 stronger), and s ≥ 4 mm is used.
- **Status of the result.** This is our analysis of others' data, not a bound the experimenters published, and it must be stated as such. Fischer–Käding–Pitschmann 2023 describe qBounce + LLR as the first experimental constraints on this model, consistent with no existing analysis of these atom data.

## Review (Fable, 5 Oct 2026)

**Verdict: minor issues; no error in the physics or numerics. All findings applied.**

1. [MINOR] Chamber A is not a proven lower bound. A 1.9 cm (1.5 cm) radius tube lowers D by ×1.4–2.2 (×2–4.6); the Panda crossing moves to ≈ 1.1×10²⁸ (1.3×10²⁸), or ≈ 1.5×10²⁸ combined with the far-position worst case. **Applied:** the assumption is stated, verdict 1 is widened to (0.5–1.1)×10²⁸ (≲ 1.5×10²⁸ worst case), and the λ = 3×10²⁷ ceiling is quoted as (3–7)×10³⁰.
2. [MINOR] s = 4 mm is conservative only for s ≥ 4 mm; at s ≈ 3.5 mm, D is up to 7% lower. **Applied.**
3. [MINOR] Jaffe's 65 nm/s² is unexplained by the on-axis profile, and the trajectory average is not modelled. **Applied:** Jaffe is indicative only and not to be quoted externally.
4. [NIT] Panda's 13 nm/s² is two-sided (×1.5 conservative). **Applied.**
5. [NIT] The effective-boundary caveat had the wrong direction; the effect is negligible anyway. **Applied.**
6. [NIT] `validate.py` printed 2.5e28 as "2e+28"; the window at λ = 3×10²⁷ is 31× for chamber A (35× for B). **Applied.**

**Checks passed:**
- The field equation, k and 1/k, a = −c²(A₂/λ²)x∇x (sign, factor 2, c²), the unscreened Cs nucleus and EFT validity, all verified by hand.
- A spot check (Panda, chamber B, λ = 3×10²⁷): 13×10⁻⁹/(c² × 0.406) = 3.56×10⁻²⁵, so A₂ > 3.2×10³⁰. All table values and crossings match `thresholds.out`.
- The near-minus-far differencing and the above/below averaging match the single-sided comparison.
- Panda's "< 0.01 nm/s²" implies a retraction of ≳ 35–45 cm, so R ≈ 1 is justified.
- Solver stencils, masking and the Newton line search are correct. Convergence holds (h = 0.125 mm: 0.399 vs 0.406). `validate.py` reproduced, and it does test the source-induced D. `far3d` was reproduced too.

**Policy:** agrees no erratum is needed. Proportionate response: Email 3 paragraph ("our estimate suggests", wider range), one sentence to Burrage and to other recipients at the next contact, and a dated addendum.

**Cleared for adoption:**
- the D(λ) and threshold tables for chambers A–C as model outputs;
- the Panda crossings 8.5 / 8.9 / 4.8×10²⁷;
- "the 2.5×10²⁸ upper end is already excluded" (robust);
- the summary statements as adjusted above.

**Not cleared:** the Jaffe thresholds (indicative only).
