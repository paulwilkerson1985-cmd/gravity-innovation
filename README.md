# Gravity Innovation: density-gated scalar fields in a metre-scale open vacuum

Code and outputs behind *A Macroscopic-Mass Test of Density-Gated Scalar Fields in a Metre-Scale Open Vacuum*, a proposed torsion-balance search for symmetron-type fields with range 1/μ ≈ 2–30 cm.

> **Status and provenance.** Working drafts, **not peer reviewed**. The analysis was produced by an independent, non-academic project with extensive AI assistance (Anthropic's Claude), including independent derivations and adversarial internal reviews. Every number needs expert verification, and that is why this repository is public. Corrections are very welcome.

## Quick start (under a minute)

```bash
pip install -r requirements.txt
python reproduce_benchmark.py
```

Expected output (`reproduce_benchmark.out`):

| Quantity | Expected |
|---|---|
| Benchmark force \|F̃\| (units of v²) | 1.1981 / 1.1957 at h = 0.04 / 0.02 (converged 1.195 ± 0.005; add `--fine` for h = 0.01 → 1.1950) |

**Benchmark geometry.** Everything is in units of 1/μ; at 1/μ = 10 cm the physical sizes are:
- a pinned (screened) test sphere of radius 0.3 (3 cm, 1 kg Cu);
- a source sphere of radius 0.6 (6 cm, 8.1 kg Cu), centres 1.4 apart (14 cm);
- a closed cylinder of radius 5 and half-length 5 (1 m × 1 m).

**Units and model.**
- Lengths are in 1/μ, the field is in v = μ/√λ, and force is in v². 1 eV² corresponds to 8.12×10⁻¹³ N.
- Model: V = −μ²φ²/2 + λφ⁴/4 with matter coupling A(φ) = 1 + φ²/2M².
- Dense bodies are Dirichlet (φ = 0).
- Thin foils and membranes are Robin sheets, with jump condition [∂ₙφ] = κφ and κ = ρt/M².

## Layout

| Path | Contents |
|---|---|
| `solver/symm.py` | Axisymmetric nonlinear finite-difference solver (Newton) and stress-tensor force |
| `solver/validation/symm_sw.py` | Second-order cut-cell (Shortley–Weller) spheres; used by the benchmark. See `solver/validation/README.md` |
| `solver/validation/ref_sphere_ode.py`, `ref_1d_exact.py` | Exact references: single pinned sphere (radial ODE) and 1D two-wall (elliptic) solutions, with `.out` |
| `solver/upgrade/symm_robin.py` | Robin and thick foils, membranes, wire grids, rods, domain-wall searches. See `solver/upgrade/README.md` |
| `figures/wedge_map_v2.py` | Figure 1 of the white paper (`wedge_map.png`) |

## Still to be added

This first release contains the solver core and the one-command benchmark. The following are being uploaded separately:
- the membrane case of the white paper's "What we ask" (full-width Robin sheet, κ/μ = 0.1; expected S/S₀ ≈ 0.92);
- the validation scripts `v*.py` and upgrade scripts `u1`–`u11` with their `.out`/`.json` files;
- the HUST-09 leakage model, design studies, model-space notes and the SN1987A calculations;
- the white paper and supernova technical note in Markdown.

## Not included (third-party material)

- **NN potential source codes** (AV18, Reid93, Nijmegen-II) are not redistributed; obtain them from their authors.
- **Published papers** downloaded during the literature review are not included; they are cited in the notes.

## How to help

We would especially value:
1. an independent solver run (e.g. SELCIE) on the benchmark;
2. any experiment we missed in which two screened bodies share an unshielded vacuum larger than about 7/μ, at 1/μ ≳ 2 cm;
3. a check of the supernova trace and pion channels against a real 1-s proto-neutron-star profile.

Please open an issue.

## Licence

MIT (see `LICENSE`).
