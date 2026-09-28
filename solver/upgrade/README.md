# Solver upgrade: Robin and thick foils, shields, torsion proxy, signal table, domain walls

Units are dimensionless. Lengths are in 1/μ, the field is in v, and force is in v² (1 eV² = 8.12e-13 N).
The benchmark geometry is: 1 m × 1 m chamber (R = L_half = 5), test sphere a1 = 0.3 at z = 0, source a2 = 0.6 at z = −1.4.
`../symm.py` and `../validation/symm_sw.py` are untouched. Every script writes a `.out` or `.json` file next to itself.

## Module `symm_robin.py` (extends `GridSW`, which has cut-cell spheres)

| feature | model | call |
|---|---|---|
| Robin foil (zero thickness) | [∂nφ] = κφ; the node on the sheet gets −κ/h | `zsheet(z, r0, r1, kappa=)`, `rsheet(r, z0, z1, kappa=)` |
| thick foil (linear two-port) | a doubled node with the exact slab relation φ'∓ = m(∓Cφ∓ ± φ±)/S, where m = m_in/μ and t may be ≪ h | `zsheet(..., m=, t=)` |
| thin axis rod (fibre, column) | sub-grid log model, r_eff = 0.1404h; Dirichlet (q = ∞) or unscreened (q = πa²m_in²) | `rod(z0, z1, a, q)` |
| thin ring wire | 2D lattice point, r_eff = 0.1985h | `ring(r, z, a, q)` |
| exact 1D tests | Neumann outer walls | `RGrid(..., neumann_r=True, neumann_z=True)` |

Other functions: `solve` (Newton; `ptc=True` gives an implicit gradient flow that ends in a stable state), `lam_min` (onset when it equals 1), and `hessian_min` (local-minimum test).
The slab model pins the corners where a slab z-sheet meets a slab r-sheet (a ring of width h). `u3b` quantifies this, and `u4` corrects for it.
`units.py` holds the conversions: ρ_crit = M²μ², κ/μ = (ρ/ρ_crit)μt, m_in/μ = √(ρ/ρ_crit − 1), κ_eff = 2m tanh(mt/2), and M_max.

## Validation
- **u1** (1D exact): the Robin sheet matches the tanh solution whose x0 is fixed by 2φ'(0⁺) = κφ(0). It is second order: relative error 1.3e-4, 3.3e-5 and 8e-6 at h = 0.04, 0.02 and 0.01, for κ from 0.1 to 1e4, and φ(foil) → √2/κ. Transmission into a subcritical gap has relative error ≤ 3e-5. The two-port slab matches a fully resolved nonlinear slab to about 1e-5 (symmetric and transmitted). A Robin sheet with the same pinning (κ_eff) overestimates transmission by 1.27×, 5.5× and 5500× at mt = 1, 3 and 10.
- **u2**: the rod sub-grid model agrees with the exact radial ODE to 1e-5 to 1e-6 and is second order. The Robin κ = 1e8 and thick-slab foils reproduce the Dirichlet foil-pair and can residuals (within 0 and 1–2% respectively).
- **u5**: planar wire grids. The electrostatic κ equals 2π/(s ln(s/2πa)) exactly. The symmetron κ agrees with it to <1% for s ≤ 1/μ and to 5–25% for s = 3–10/μ. Unscreened wires give κ = q/s (smeared mass).
- **u10** (ring grid vs homogenised Robin): agreement to 0.3% for s ≤ 0.2/μ. **u11**: the design numbers change by <0.5% between h = 0.05 and 0.025. **u3**: the Robin residuals change by 1–2% between h = 0.05 and 0.025 (hole/edge floors 8–40%).

## Results (see the `.out` files)
- **u3/u4**: foil switch residuals versus κ, and the minimum Cu/Al thickness across the wedge (`u4_thickness_map.out`).
- **u6/u10**: shield options (no shield, wire grid, metallised membrane). **u7/u7b**: torsion proxy geometry.
- **u8/u8b**: signal table and condensation thresholds. **u9/u9b**: domain walls and metastability.

## Not validated / open
- 3D geometry (torsion arm, orbiting source). The axisymmetric S = F(src) − F(no src) is only a proxy for modulation depth.
- Finite-κ test and source bodies (surface φ ≈ μ/(√2 m_in) ≈ 0.003–0.03, an O(1%) effect on F~).
- Hole floors are converged only to 15–40%. Slab corners are approximate; they are corrected with the Robin factor C(κ).
- Al at 1/μ = 4 cm uses m < 25 (extrapolated). Every geometry is scaled with 1/μ, except in `u8`.
