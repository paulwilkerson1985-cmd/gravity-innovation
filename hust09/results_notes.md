# HUST-09 as a symmetron constraint: results (2026-09-26)

Geometry sources and TOS principle: see geometry_notes.md. Summary: shield = open-topped hollow Al tube (0.7 mm wall, ID 94,
H 90 mm), hung from the lid, lower edge just above the rotating Zerodur disk; pendulum = quartz block 91.5x12.0x26.2 mm,
63.4 g, top face ~45 mm and centre ~58 mm below the rim; spheres 2.3 mm outside the wall. Not lidded -> calculation done.

## 1. Chamber condensation (a1_threshold.py/.out, axisymmetric linear eigenvalue)
Empty 450x500 mm chamber: 1/mu_c = 80.7 mm. With pedestal/turntable, shield, spheres (torus) and pendulum:
59.2 mm nominal (disk 200 mm above floor), range 51-66 mm for disk height 250-150 mm; pedestal radius irrelevant.
-> 8 cm: never condenses (no constraint). 6 cm: marginal (3D model phi_max = 0.33 nominal, 0.66 for zd=150; axisym says just
below threshold). <= 5 cm: condensed (phi_max 0.79 at 5 cm, 0.93 at 4 cm, >0.98 at <= 3 cm).

## 2. Leakage (a2_leak.out axisym; m3d_*.out 3D)
Field at the cup mouth (axis): 0.82 / 0.65 / 0.45 / 0.34 / 0.25 v at 1/mu = 1.5/2/3/4/5 cm.
Field 4 mm from the pendulum broad face (mid-height, 3D): 1.3e-2 / 4.7e-3 / 1.9e-3 / 1.3e-3 / 8.5e-4 v, vs 0.17 / 0.12 / 0.070 /
0.049 / 0.033 v for the same pendulum with no shield (suppression 13-40x in field).
Near-far torsional-stiffness signal Delta K' (3D, units v^2/mu): shielded / unshielded = 4.5e-6 ... 7e-6 (the sphere-induced
m=2 pattern must enter over the rim and decay ~exp(-kappa_2 d), kappa_2 ~ sqrt((5.14/47 mm)^2 - mu^2), d ~ 45-70 mm).
Sign: E_near < E_far -> attractive-like -> G biased UP.

## 3. 3D method (h3d.py, m3d_run.py)
Quarter-domain (x,y >= 0 reflection planes) vertex-centred FV on a graded tensor grid (1.5 mm fine region 0-112 mm, <= 8 mm
outside), whole 450x500 mm chamber; bodies pinned (Dirichlet): pedestal+disk, shield (thickened outward to 2.25 mm), two
spheres, pendulum box, clamp/ferrule/mirror. Newton + AMG-preconditioned CG, residual <= 6e-12.
Delta K' = -4 (E_near - E_far) (cos 2psi dominance; the same shortcut on the Newtonian analogue gives 0.81 of the exact
Delta K_g -- grav_check.py; the leaked field is m=2-dominated so the scalar case should be closer).
Validation vs axisymmetric solver: 5-10 % (t3d_validate_h1.5.out). x<->y mirror symmetry exact.
Resolution: Delta K'(h = 2.0/1.5/1.0 mm) = 1.60/1.40/1.28e-5 (2 cm), 2.77/2.37/2.22e-6 (4 cm) -> continuum ~0.8 x h=1.5.
Geometry: disk height 150-250 mm: <= 2 % at 4 cm, +7/-29 % at 5 cm. Bottom clearance (unknown): gap 6 mm -> x0.44-0.58;
gap 12 mm -> x3.8 at 2 cm (slot next to the spheres becomes the main path), x0.66 at 4 cm.

## 4. Constraint (analyze.py/.out)  delta G/G = Delta K' v^2 (1/mu) / Delta K_g,  Delta K_g = 7.58e-11 N m/rad
Best estimate (gap 2 mm, zd 200 mm, x0.8 continuum):
| 1/mu | dG/G per v^2 | v2 excl. 26 ppm | 50 ppm | 300 ppm | (no-shield counterfactual, 26 ppm) |
| 1.5 cm | 4.3e3 /N | 6e-9 N | 1.2e-8 | 7e-8 | 2e-14 |
| 2 | 3.0e3 | 9e-9 | 1.7e-8 | 1.0e-7 | 3e-14 |
| 3 | 1.6e3 | 1.6e-8 | 3.1e-8 | 1.9e-7 | 7e-14 |
| 4 | 1.0e3 | 2.6e-8 | 5.0e-8 | 3.0e-7 | 1.4e-13 |
| 5 | 5.0e2 | 5e-8 | 1.0e-7 | 6e-7 | 3e-13 |
| 6 | ~60 (if condensed) | ~5e-7 or none | ~9e-7 | ~5e-6 | -- |
| 8 | 0 | none | none | none | -- |
Uncertainty: factor ~3 either way (gap, rim hardware/rods not modelled, higher harmonics, staircase), larger at 6 cm.
Verdict: HUST-09 excludes only v^2 >~ 1e-8 N (2-4 cm) -- 4.5-5.5 decades above the Tier-2 floor 2e-13 N. It trims the top of
the wedge (1e-8 ... 1e-5 N) in the 1.5-5 cm corner; it does not touch the floor. Without its electrostatic cup the same
apparatus would have reached 2e-14 - 3e-13 N.
