# Gravity Innovation: density-gated scalar fields in a metre-scale open vacuum

Code, outputs and working notes behind two documents (v2.1, 27 September 2026):

- **`docs/white_paper_v2.md`**: *A Macroscopic-Mass Test of Density-Gated Scalar Fields in a Metre-Scale Open Vacuum*. A proposed torsion-balance search for symmetron-type fields with range 1/μ ≈ 2–30 cm.
- **`docs/sn_technical_note_v2.md`**: SN1987A bounds on quadratically coupled scalars, covering φφ pair emission with energy–momentum conservation, the trace channel, pions and transport, plus a Boltzmann calculation of the thermal-relic ΔN_eff (Section 8).

> **Status and provenance.** Working drafts, **not peer reviewed**. The analysis was produced by an independent, non-academic project with extensive AI assistance (Anthropic's Claude). That included independent derivations and adversarial internal reviews. Every number needs expert verification, and that is why this repository is public. Corrections are very welcome.

## Quick start (about 10 seconds)

```bash
pip install -r requirements.txt
python reproduce_benchmark.py
```

Expected output:

| Quantity | Expected |
|---|---|
| Benchmark force \|F̃\| (units of v²) | 1.1981 / 1.1957 at h = 0.04 / 0.02 (converged 1.195 ± 0.005; add `--fine` for h = 0.01 → 1.1950) |
| Full-width Robin sheet, κ/μ = 0.1, midway between the sphere surfaces | S/S₀ ≈ 0.922, i.e. 7.8% signal loss (a real 2 µm Al-Mylar membrane at 1/μ = 10 cm, M = 15 TeV has κ/μ ≈ 0.14, about 11%) |

**Benchmark geometry.** Everything is in units of 1/μ, and at 1/μ = 10 cm the physical sizes are:
- a pinned (screened) test sphere of radius 0.3 (3 cm, 1 kg Cu);
- a source sphere of radius 0.6 (6 cm, 8.1 kg Cu), with centres 1.4 apart (14 cm);
- a closed cylinder of radius 5 and half-length 5 (1 m × 1 m).

**Units and model.**
- Lengths are in 1/μ, the field is in v = μ/√λ, and force is in v². 1 eV² corresponds to 8.12×10⁻¹³ N.
- Model: V = −μ²φ²/2 + λφ⁴/4 with matter coupling A(φ) = 1 + φ²/2M².
- Dense bodies are Dirichlet (φ = 0).
- Thin foils and membranes are Robin sheets, with jump condition [∂ₙφ] = κφ and κ = ρt/M².

## Layout

| Folder | Contents |
|---|---|
| `solver/symm.py` | Axisymmetric nonlinear finite-difference solver (Newton) and stress-tensor force |
| `solver/validation/` | Validation against exact results: Brax–Pitschmann plates, tanh kink, Yukawa tail, cylinder eigenvalue, two-body asymptotics. Also `symm_sw.py` (second-order cut-cell spheres). See `README.md` there; each script `v*.py` has its `.out` |
| `solver/upgrade/` | `symm_robin.py`: Robin and thick foils, membranes, wire grids, hardware proxies, domain walls, signal tables (`u1`–`u11`, with `.out`/`.json`) |
| `hust09/` | Leakage of the field into the open-top shield of the HUST-09 G measurement. The axisymmetric and 3D finite-volume models give the exclusion used in the white paper (`results_notes.md`, `analyze.out`). Large field dumps are not included; rerun `m3d_run.py` to regenerate |
| `design/` | Experiment design: fixed-mass modulation schemes, convection estimate, light foil source with hollow shells, 3D torque check, atom-interferometer coefficient, Tier-1 numbers (`SUMMARY.md`) |
| `models/` | Model space beyond the symmetron: chameleon, environment-dependent dilaton reach, and the first, rough ΔN_eff estimate (superseded by `cosmology/`) (`SUMMARY.md`) |
| `cosmology/neff_proper/` | Thermal-relic ΔN_eff: rates (gluon trace anomaly, heavy quarks, Omnès-unitarized ππ → φφ), two-moment Boltzmann solver, variant scan, reheating (freeze-in) scan, figure (`SUMMARY.md`; needs one external table, see `README_DATA.md`) |
| `supernova/sn_A`, `supernova/sn_B` | Two independent first-pass derivations of the SN1987A pair-emission rate, with notes |
| `supernova/sn_deep/` | Exact finite-ω trace-channel matrix elements, thermal and Fermi–Dirac averages, Monte Carlo transport, chiral-LO check (`SUMMARY.md`); tabulated outputs (`trace_*.npz`, `*.json`) |
| `figures/` | Figure 1 of the white paper (`wedge_map_v3.py` → `wedge_map.png`) and the SN-note figure (`make_fig1_v2.py` → `fig1_Lesc_vs_M.png`) |
| `docs/` | The two documents in Markdown (images link to `figures/`) and as PDFs |

## Not included (third-party material)

**NN potential source codes.** AV18, Reid93 and Nijmegen-II are not redistributed here. Obtain them from their authors:
- AV18: R. B. Wiringa, Argonne.
- Reid93 and Nijm-II: NN-Online (Nijmegen).

To rebuild the Python module, compile them together with our `supernova/sn_deep/potwrap.f` using `f2py`, producing `nnpots`. The tabulated outputs (`trace_*.npz`) are included, so every downstream result can be checked without recompiling.

**NN cross-section pages.** The NN-OnLine output pages used to build `supernova/sn_A/data/dsig_table.npz` are not included; the tabulated values are.

**Equation-of-state table.** The Saikawa & Shirai (2018) g_*(T) table used by `cosmology/neff_proper/` is not included; `README_DATA.md` there says where to get it.

**Published papers.** PDFs and texts downloaded during the literature review are not included. They are cited in the notes.

**Paths.** Scripts locate the repository root through the marker file `GI_REPO_ROOT`. Some `.out` logs and `.json` outputs still show the original absolute paths of the machine they were run on.

**Working logs.** `design/SUMMARY.md`, `models/SUMMARY.md` and `supernova/sn_deep/SUMMARY.md` are the working logs as written; each has a banner, and where they differ from `docs/` the documents win.

## How to help

We would especially value:
1. an independent solver run (e.g. SELCIE) on the benchmark and membrane cases;
2. any experiment we missed in which two screened bodies share an unshielded vacuum larger than about 7/μ, at 1/μ ≳ 2 cm;
3. a check of the supernova trace and pion channels against a real 1-s proto-neutron-star profile.
4. a dispersive two-channel (ππ, KK̄) trace form factor ⟨0|Θ|ππ⟩ at √s ≈ 0.5–1 GeV, the dominant uncertainty in the ΔN_eff bound.

Please open an issue or email the contact given in the white paper.

## Licence

MIT (see `LICENSE`).
