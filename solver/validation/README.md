# Validation of `symm.py` (axisymmetric nonlinear symmetron solver)

Dimensionless units: lengths are in 1/mu, the field is in v, energy density is in mu^2 v^2 (V0 = 1/4), and force is in v^2.
Every script here imports the unmodified `../symm.py`, except the cut-cell variant `symm_sw.py`.
Run any script with `python3 <script>`; its output is saved next to it as `.out`.

## Verdict
The PDE discretisation, boundary conditions, Newton solve and stress-tensor force are correct: they match exact
results to between 1e-5 and 1e-3. The main numerical weakness is the first-order *staircase* representation of the spheres.
It biases forces low by about 3% at h = 0.02 (the resolution behind F~ = 1.16). The energy-derivative cross-check is also
weaker than claimed (1-9%, not 0.05%).

## Exact / analytic checks
| script | check | result |
|---|---|---|
| v2_plates_1d | half-kink tanh(x/sqrt2) and two-wall elliptic (sn) solution | max error 2e-5 (h = 0.025) |
| v2, v2b | Brax-Pitschmann two-mirror: phi0(d), d_c, pressure (1-phi0^2)^2/4 -> V0 | error <= 3e-4 away from d_c; onset at the closed-cylinder value pi/sqrt(1-(2.405/Rc)^2) |
| v1b_tail | linearised far field exp(-sqrt2 r)/r | slope -1.408 to -1.412 (exact -1.4142) |
| v1, v7a | single pinned sphere vs exact radial ODE (`ref_sphere_ode.py`) | staircase: O(h), Q about 3% low at h = 0.02; cut-cell: 0.1% |
| v3_threshold | empty-cylinder eigenvalue (2.405/R)^2 + (pi/L)^2; nonlinear onset (R = L/2) | 1e-5; R_c = 2.8716 (exact 2.8724) |
| v8 | two-body force at large D vs 4 pi Q1 Q2 (1+sqrt2 D) e^{-sqrt2 D}/D^2 (Q from the exact ODE) | F/F_asym = 0.97, 1.00, 1.02 at D = 3, 4, 5 |
| v10b | finite plates, small gap: V0*A + sigma*2piR with sigma = sqrt2/3 | ratio 1.09, 1.04, 1.02 for R = 2, 3, 4 |

## Benchmark and claims (1 m x 1 m chamber: R = 5, half-length 5; a1 = 0.3, a2 = 0.6, D = 1.4)
- F~ = **1.195 +- 0.005**. The cut-cell solver gives 1.1981, 1.1957 and 1.1950 at h = 0.04, 0.02 and 0.01. The original staircase solver gives 1.119 (h = 0.04), 1.157 (0.02) and 1.179 (0.008), which extrapolates to 1.19-1.21. In a 1.6 m chamber the value rises to about 1.27, because the 1 m chamber only reaches phi_max = 0.93.
- Condensation threshold with the bodies inside: R = L/2 = **3.332 +- 0.005** (claimed 3.25-3.4). With no bodies it is 2.872. The force is exactly 0 below this threshold and grows linearly above it.
- Gas onset: rho_gas/rho_crit = **0.585** (claimed about 0.6).
- Distance law F(14 cm)/F(30 cm) = **10.90 +- 0.05** in the 1 m chamber (claimed 11x) and 12.8 in a 1.6 m chamber. F(14)/F(20) = 2.22.
  The back-of-envelope estimate of about 40x is wrong for two reasons:
  1. The formula omits the (1+sqrt2 mu D) factor. With that factor included, a point-Yukawa law gives 25x.
  2. The far-field law only holds for D >~ 3/mu. At 14 cm it overestimates the force by 2.2x, because of finite body size and nonlinear effects.

  Linearised Dirichlet theory (no nonlinearity) gives 19.7x (v6).
- Foil pair: residual/no-foil = 6.5e-2, 1.4e-3 and 7e-7 for W = 0.5, 1 and 2. These are converged to about 10% and agree with the claims.
- Closed can (Rs = 0.5): the residual is **not converged**. For the 1 cm hole it is 3.3e-7, 5.9e-7 and 8.0e-7 at h = 0.04, 0.02 and 0.01. For the 2 cm hole it is 1.1e-5, 3.0e-5 and 3.5e-5, so the claimed 1e-5 is about 3.5x too low. The 4 mm hole is only 1 grid cell wide, so the claimed 2e-12 is not meaningful. What is robust is that the can suppresses the force by more than 1e4.

## Issues found and fixed (fixes live here; `../symm.py` is untouched)
1. **Staircase spheres (first order).** The effective radius is about a - 0.3h. This is fixed in `symm_sw.py` (`GridSW`), which uses a Shortley-Weller cut-cell stencil and is second order.
2. **`energy()` is inconsistent with the finite-difference scheme.** It uses np.gradient across body boundaries, which gives 2-9% errors in dE/dX. `symm_sw.energy_consistent` is the discrete energy that the scheme actually minimises; with it the agreement with the stress tensor is 0.1-2.4% (v5).
3. **`solve()` never reports non-convergence.** The comment says "damped step", but the step is s = 1. `symm_sw.solve` now warns. All runs here converged (res <= 2e-11).
4. **`Grid` silently rounds Rc and L to multiples of h.** This is minor.
5. **Dirichlet values are hard-wired to 0.** The solver cannot model finite-kappa (Robin) foils or partially screened bodies.
6. **Wall forces are physical, not a bug, but they are large.** At D = 1.4 the walls take 0.43 v^2, so the force on the source is 0.76 while the force on the test mass is 1.195. At D = 3 the end wall pulls the source with 1.83 v^2.

## Not validated
- Real 3D apparatus geometry (torsion arm, turntable, fibre).
- Robin/thin foils and the t* threshold.
- Can residuals for small holes.
- Domain-wall and metastable states (all runs start from phi = +1).
