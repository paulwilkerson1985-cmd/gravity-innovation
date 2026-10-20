# Q10: independent finite-element cross-check of the symmetron benchmark (FEniCS/gmsh, the toolkit SELCIE uses)

*Daily run, 20 Oct 2026 (03:15–04:10 UTC). Orchestrator: Claude. Status: **Fable-reviewed (MINOR ISSUES, all fixed; adopted as a cross-check, no number changed)**, see §7. Code: `claude/code/q10/` (repo target `solver/fem_crosscheck/`).*

> **Note up front:** SELCIE's own solver is chameleon-only and was **not** used for any symmetron number here. The cross-check uses FEniCS (legacy dolfin 2019.1) and gmsh, the toolkit SELCIE is built on, with a symmetron weak form written for this check. SELCIE itself was only run on its own chameleon example, as a smoke test of the installation.

## 1. Plain-English summary (for Paul)

We wanted a second, completely different computer program to check the two key numbers in our white paper, instead of waiting for an expert to do it. The program experts would use (SELCIE, from Prof. Burrage's group) turned out to handle only the chameleon field, not our symmetron field. So we installed the same software toolkit SELCIE is built on (FEniCS and gmsh), confirmed SELCIE itself runs correctly, and wrote a separate symmetron solver on top of that toolkit. It agrees with our original solver to a few parts in ten thousand on the benchmark force (to two parts in a hundred thousand once the original solver's grid error is extrapolated away), and exactly, to the digits quoted, on the membrane loss. Nothing we sent needs correcting.

## 2. Question and inputs

- **Q10 (work queue):** reproduce the white paper's benchmark force F̃ = 1.195 ± 0.005 and the membrane loss (S/S₀ ≈ 0.922, 7.8%) with an independent solver, ideally SELCIE (github C-Briddon/SELCIE).
- **Model (as in the repo, `solver/symm.py`):** dimensionless symmetron, lengths in 1/μ, field in v = μ/√λ, force in v². Vacuum equation ∇²φ = −φ + φ³; dense bodies pinned (Dirichlet φ = 0); chamber walls Dirichlet φ = 0.
- **Benchmark geometry:** test sphere a₁ = 0.3 at z = 0; source sphere a₂ = 0.6 at z = −1.4 (centres 1.4 apart); closed cylinder R = 5, half-length 5 (at 1/μ = 10 cm: 3 cm and 6 cm Cu spheres, 14 cm apart, in a 1 m × 1 m chamber).
- **Membrane case:** a full-width zero-thickness Robin sheet at z = −0.55 (midway between the sphere surfaces), jump [∂ₙφ] = κφ with κ/μ = 0.1; signal S = F(source, sheet) − F(no source, sheet), compared with the open benchmark force F₀.
- **Repo reference values (run again in this container, 20 Oct):** `reproduce_benchmark.py --fine` gives F̃ = 1.1981 / 1.1957 / 1.1950 at h = 0.04 / 0.02 / 0.01 (cut-cell finite differences) and S/S₀ = 0.9224 (7.8%) at h = 0.05 (cut-cell finite differences with a nodal delta-function sheet, `symm_robin.py`). Full-precision values (rerun by the reviewer): F̃ = 1.198090 / 1.195732 / 1.194970; S/S₀ = 0.92242 at h = 0.05 and 0.92240 at h = 0.025, so the FD ratio is itself converged.

## 3. Finding on SELCIE itself

- SELCIE v1.9.0 (last commit 1 Apr 2025, 607684a) solves **only the chameleon** equation α∇²φ̂ = −φ̂^−(n+1) + ρ̂ (`SolverChameleon.py`; the 2021 paper, arXiv:2110.11917, lists other screened fields such as the symmetron as future work). It has no symmetron solver.
- SELCIE runs here: FEniCS (legacy dolfin) 2019.1.0, gmsh 4.15.2, meshio 5.3.5, Python 3.10 (conda-forge via micromamba). SELCIE pins gmsh 4.13.1 (its `environment.yml`); 4.15.2 worked for its example. SELCIE's own example `Analytic_solution_parallel_plates.py` (chameleon between two plates versus the exact solution) reproduces the analytic profile to a maximum relative error of 6.8×10⁻⁷ (`selcie_smoke.py`). This is SELCIE's own example, in which the analytic profile's amplitude is normalised to the numerical maximum, so it is a shape comparison and an installation smoke test, not an independent validation of SELCIE.
- **Consequence:** an expert cannot "just run SELCIE" on our benchmark; it would need a new symmetron weak form. That is what this cross-check supplies. Future outreach should not ask anyone to run SELCIE on the symmetron as if it were a one-line change.

## 4. Method (independent of the repo's solvers)

- **Discretisation:** continuous Lagrange finite elements, P2 and P3, on unstructured triangular meshes from gmsh (OpenCASCADE geometry: the rectangle r ∈ [0, 5], z ∈ [−5, 5] minus the two half-discs; mesh vertices lie exactly on the sphere surfaces, but the elements are straight-sided, so each surface is a polygon with sagitta ≤ h²/8a, about 1.6×10⁻⁴ at the coarsest level and 3×10⁻⁶ at h_min = 0.0025; the membrane is an embedded line). Boundary tags were checked edge by edge on seven meshes by the reviewer: no misassigned edge, axis natural along its whole length. The repo's solvers are finite differences on a uniform grid (staircase or cut-cell spheres).
- **Weak form (axisymmetric, r-weighted):** ∫ [∇φ·∇v + (φ³ − φ) v] r dr dz + κ ∫_sheet φ v r dr = 0, with Dirichlet φ = 0 on the spheres and the walls and the natural condition on the axis. Newton's method (MUMPS), started from the product of exact 1D kinks tanh(d/√2) from each surface; converged in 5 iterations in every run (absolute tolerance 10⁻¹¹; 5×10⁻¹⁴ on the reviewer's reruns). Every solution is strictly ≥ 0 (positive branch, no domain walls).
- **Force on the test sphere:** a virtual-work volume integral, F_z = ∫ (T_zr ∂_rχ + T_zz ∂_zχ) dV with T_ij = ∂ᵢφ∂ⱼφ − δᵢⱼ(½|∇φ|² + V), V = −φ²/2 + φ⁴/4, and χ a C¹ cutoff equal to 1 within distance ρ₁ of the test-sphere centre and 0 beyond ρ₂. On-shell this equals minus the closed-surface stress-tensor integral around the test sphere (the repo's definition, `symm.force_z`), for any cutoff whose support avoids the other bodies; the spread over four (ρ₁, ρ₂) choices is a built-in accuracy check. For comparison the repo's own box surface integral (r < 0.38, |z| < 0.38) is also evaluated on the FEM solution. For the membrane runs the cutoffs stay clear of the sheet (ρ₂ ≤ 0.53 < 0.55); in the benchmark runs ρ₂ ≤ 0.78 < 0.80 (the nearest point of the source sphere).
- **Energy-derivative check (no stress tensor at all; `ale_check.py`, suggested by the reviewer):** the mesh near the test sphere is moved by ±δχẑ, the field re-solved and F = −dE/dδ taken by central differences. On the 0.01 / 0.1 P2 mesh this gives −1.194579 for δ = 0.01, 0.005 and 0.0025 (δ-independent), against the virtual-work value −1.194505 on the same mesh (7×10⁻⁵ apart, same sign). This closes the one shared-convention loophole: the force is minus the energy gradient, independently of how the stress tensor is written.

## 5. Results

**Benchmark |F̃|** (units of v²; four virtual-work cutoffs (0.34, 0.50), (0.40, 0.75), (0.31, 0.60), (0.45, 0.78), then the box stress integral):

| Mesh (h_min / h_max) | Elements | DOFs | Virtual work (4 cutoffs) | Box integral |
|---|---|---|---|---|
| 0.02 / 0.2, P2 | 4,401 | 9,108 | 1.19414 – 1.19433 | 1.19555 |
| 0.02 / 0.2, P3 | 4,401 | 20,263 | 1.19407 – 1.19431 | 1.19420 |
| 0.01 / 0.1, P2 | 14,249 | 29,084 | 1.19439 – 1.19459 | 1.19486 |
| 0.01 / 0.1, P3 | 14,249 | 64,999 | 1.19444 – 1.19457 | 1.19457 |
| 0.005 / 0.05, P2 | 51,024 | 103,191 | 1.19453 – 1.19468 | 1.19468 |
| 0.005 / 0.05, P3 | 51,024 | 231,322 | 1.19454 – 1.19468 | 1.19467 |
| 0.0025 / 0.05, P2 | 57,036 | 115,753 | 1.19468 – 1.19476 | 1.19435 |
| 0.0025 / 0.05, P3 | 57,036 | 259,183 | 1.19468 – 1.19478 | 1.19471 |
| 0.0025 / 0.025, P2 | 192,797 | 387,828 | 1.19469 – 1.19470 | 1.19467 |

- All nine runs are listed (the table is the whole of `bench_runs.jsonl`). The largest outlier is the box integral on the 0.0025 / 0.05 P2 mesh (1.19435), a sampling effect of the surface integral; the virtual-work values on that mesh agree with the finer ones.
- **FEM converged value: F̃ = 1.1947 ± 0.0002** (attractive, toward the source). The band covers every value with h_min ≤ 0.005; the wide cutoffs converge monotonically to 1.19470, the narrowest one (0.34–0.50) wanders by ±1.3×10⁻⁴. The refinement series mixes h_min/h_max ratios and P2/P3, so no formal convergence order was extracted.
- **Repo finite differences (full precision):** 1.198090 / 1.195732 / 1.194970 at h = 0.04 / 0.02 / 0.01. The difference ratio is 3.1 (observed order ≈ 1.6, i.e. roughly but not quite second order). Richardson extrapolation from h = 0.02 and 0.01 gives 1.19472 assuming order 2, or 1.19461 with the observed order.
- **Agreement:** 1.1947 (FEM) vs 1.1946–1.1947 (FD extrapolated) vs 1.1950 (FD at h = 0.01): 2.3 parts in 10⁴ from the finest FD value, about 2 parts in 10⁵ from the order-2 extrapolation, and well inside the quoted 1.195 ± 0.005. The adopted benchmark is confirmed; no number changes.

**Membrane signal** (S/S₀ with F₀ = 1.19470 from the finest benchmark mesh; P2):

| κ/μ | Mesh (h_min / h_max) | F(source, sheet) | F(no source, sheet) | S/S₀ | Loss |
|---|---|---|---|---|---|
| 0.10 | 0.01 / 0.1 | 1.20635 | 0.10444 | 0.9223 | 7.77% |
| 0.10 | 0.005 / 0.05 | 1.20648 | 0.10442 | 0.9225 | 7.75% |
| 0.10 | 0.0025 / 0.025 | 1.20645 | 0.10446 | 0.9224 | 7.76% |
| 0.14 | 0.005 / 0.05 | 1.21018 | 0.14332 | 0.8930 | 10.70% |

- **κ/μ = 0.1:** S/S₀ = 0.9224 (7.8% loss), identical to the repo's 0.9224 (0.92242 at h = 0.05, 0.92240 at h = 0.025). Confirmed.
- **κ/μ = 0.14** (the real 2 µm Al-Mylar membrane at 1/μ = 10 cm, M = 15 TeV, per the repo README): 10.7% loss (S/S₀ = 0.8930), against the repo FD's 0.89296 / 0.89295 at h = 0.05 / 0.025 (reviewer's rerun) and the README's "about 11%".
- **Sheet condition check (reviewer):** one-sided extrapolated gradients on the 0.005 / 0.05 mesh give [∂_zφ]/(κφ) = 1.004, 1.010, 0.991, 0.999 at r = 0, 0.25, 0.5, 1.0, so the FEM sheet term has the repo's sign and normalisation.
- The sheet on its own (no source) pulls the test sphere toward it with |F| ≈ 0.104 (κ = 0.1), which is why the signal is defined as a source-on minus source-off difference.

## 6. What this does and does not establish (caveats)

- **Independent:** the discretisation (unstructured P2/P3 finite elements vs a uniform finite-difference grid), the geometry representation (body-fitted polygonal boundaries vs cut-cell spheres on a uniform grid), the nonlinear solve, the Robin-sheet treatment (interior-facet term vs a nodal delta function) and the force extraction (volume virtual work, plus an energy derivative with no stress tensor, vs a surface stress integral).
- **Not independent:** the same model equations, units, Dirichlet idealisation of the dense bodies and problem definition, set up by the same AI orchestrator. A human expert's own setup would still add independence in the physics, which remains the outreach ask.
- **Geometry error:** straight-sided elements make an O(h²) geometric error (sagitta above); the refinement table absorbs it, and no curved (isoparametric) elements were used.
- **Not tested here:** finite-density (non-pinned) bodies, 3D effects of the off-axis hardware, and anything beyond the dimensionless benchmark (the mapping to newtons, M and 1/μ is unchanged and comes from the adopted-numbers table).
- SELCIE's own solver class was not used for the symmetron runs (it cannot be); only its toolchain was, and SELCIE itself was verified on its own analytic test.

## 7. Review

- **Fable (20 Oct 2026, one call): MINOR ISSUES, all fixed; adoptable as a cross-check.** Fable re-derived the virtual-work force and its sign, checked every boundary edge of seven meshes, reran two FEM cases bit-identically, reran the FD solvers at full precision, checked the Robin jump numerically and SELCIE's chameleon-only status, and ran an energy-derivative force check. Fixes applied: the FD membrane solver described as cut-cell (not staircase); "true curved boundaries" replaced by the polygonal description and a caveat; Richardson extrapolation redone from unrounded FD values (1.19472 at order 2, 1.19461 at the observed order 1.6); all nine benchmark runs shown; error bar widened to ± 0.0002 with its basis stated; title and a note up front say SELCIE's own solver was not used; the smoke test's amplitude normalisation stated; "one part in ten thousand" corrected; the energy-derivative check and the FD membrane ratio at h = 0.025 added. The fixes were applied by the orchestrator and not sent back for a second review (wording, table completeness and values Fable itself computed).

## 8. Reproduce

- Environment: `micromamba create -p ./fenv -c conda-forge python=3.10 fenics=2019.1.0 meshio scipy matplotlib python-gmsh libglu astropy` (≈ 5 minutes).
- `PY="micromamba run -p ./fenv python" bash run_q10.sh` (≈ 3 minutes; meshes, all runs and the summary table). Outputs: `bench_runs.jsonl`, `memb_runs.jsonl`.
- SELCIE smoke test: clone github C-Briddon/SELCIE, then `SELCIE_DIR=<clone> python selcie_smoke.py`.
- Energy-derivative check: `python ale_check.py` (≈ 30 s; needs `meshes/b2`).
- Files: `mesh_q10.py` (gmsh meshes), `fem_symmetron.py` (solver and forces), `summarize_q10.py`, `run_q10.sh`, `ale_check.py`, `selcie_smoke.py`.

## 9. Implications

- **Outreach:** the white paper's "please run an independent solver (e.g. SELCIE)" ask is now partly answered by us. Future emails (the parallel batch) can say that an independent finite-element check agrees to a few parts in 10⁴, and ask instead for a critique of the physics set-up (pinned bodies, the Robin-sheet model, the geometry), which is what this check cannot supply. They should not suggest that SELCIE runs the symmetron out of the box.
- **Repo:** bundle `solver/fem_crosscheck/` (the six files above, the two `.jsonl` outputs and this doc as `README.md`), plus one line under "How to help" item 1 in the repo README when it next changes: "An independent finite-element cross-check (FEniCS/gmsh) now agrees with the benchmark and the membrane case; see `solver/fem_crosscheck/`. SELCIE itself is chameleon-only." Sent documents stay frozen; nothing in them is contradicted.
- **Adopted numbers:** unchanged (benchmark 1.195 ± 0.005; membrane 7.8% at κ/μ = 0.1, about 11% for the real membrane). The adopted-numbers table may cite this doc as a cross-check.
