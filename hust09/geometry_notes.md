# HUST-09 geometry (from Tu et al. PRD 82, 022001 (2010) and Luo et al. PRL 102, 240801 (2009))

Sources fetched: Tu2010_PRD82_022001.pdf (APS harvest full text, 36 pp) -> Tu2010.txt; Luo2009_PRL102_240801.pdf -> Luo2009.txt.
Figures extracted to figs/ (fig3 cutaway = figs/img4-000.png, chamber photos figs/photo_upper.png, figs/photo_lower.png,
zoom of the shield cup figs/photo_cup_zoom.png, clamp/ferrule inset figs/img8-001.png).

## Shield
- PRD Sec. II E 9: "a 0.7-mm-thick, 94-mm inner diameter, 90-mm-high, hollow gold-coated aluminum cylinder is inserted
  between the pendulum and the source masses (as shown in Fig. 3)". It is inserted LAST, after all alignment
  ("Finally, a thin hollow aluminum cylinder acting as an electrostatic shield is inserted to surround the pendulum").
- Fig. 3 labels a "Shielding cylinder holder" (rod from the chamber lid); Fig. 4 lower photo shows the cylinder hung from
  two rods/brackets, with an OPEN TOP: the gold-coated interior and the clamp/ferrule/mirror are visible from above
  (also PRD Fig. 9 inset: "closeup photo of the suspended pendulum surrounded by the hollow gold-coated aluminum cylinder",
  taken looking down into the cup). No lid, no fibre tube over the cup.
- Bottom: "hollow cylinder" (tube). It is held from the fixed chamber lid while the Zerodur disk under it rotates, so its
  lower edge must clear the rotating (Al-foil-covered) disk by a small gap (not stated; photo consistent with a few mm).
  Effectively the bottom is closed by the pinned 25-mm Zerodur disk + foil; leakage through a mm-scale slot is negligible
  (checked in axisym runs with gap = 2 mm).
- Optical lever (Fig. 33) views the mirror on top of the ferrule horizontally; the mirror (~72-77 mm above the disk) is
  below the rim (~92 mm), so there must be a small window/hole in the shield wall (not described). Ignored (<~1 mm^2 hole).

## Pendulum
- "rectangular block made from JGS1 far UV optical quartz glass", gold (over Cu) coated; L x W x H =
  91.465 x 12.015 x 26.216 mm; vacuum mass 63.38388 g (PRL: "gold-coated rectangular quartz block").
- Centre height 34.250 [34.205] mm above the Zerodur disk top surface (Exp I [II]) -> body spans z = 21.1 ... 47.4 mm.
- Clamp (Al) on top: cylinder d = 12.04 mm, h = 10.13 mm + cone; ferrule d = 6.10 mm, h = 15.1 mm; mirror cube 4.08 mm
  on top of the ferrule -> top of hardware ~ 77 mm above the disk.
- Ends of the block are at r = 45.73 mm, i.e. 1.27 mm from the shield inner wall (r = 47.0 mm).
- Depth below the rim (rim at ~ 90 mm + gap): top face ~ 45 mm, centre ~ 58 mm, bottom face ~ 71 mm.

## Source masses / turntable
- SS316 spheres, D = 57.151 mm, 778.18 g; centre separation 157.16154 [157.37011] mm -> centres at r = 78.58 mm;
  centre height 34.18-34.23 mm above the disk; sphere surface nearest the axis at r = 50.0 mm -> 2.3 mm outside the shield.
- Zerodur disk D = 240 mm, t = 25 mm (PRL says 11 mm), on a Huber 410 goniometer ("mounted on the lower floor of the chamber").
- Four Zerodur rings (ID 30.4 mm, h = 10 mm): 2 support spheres, 2 counterbalance at 90 deg. Al foil covers disk+rings (Exp II).
- Background run WITHOUT spheres (turntable rotated near/far): Delta(omega^2)_b = 30(12)e-12 s^-2, subtracted (PRL).
  -> turntable-fixed parts (rings, disk) are subtracted; the sphere-dependent scalar effect is NOT.

## Chamber
- "The main body of the vacuum chamber is a stainless steel cylinder with an inner diameter of 450 mm and a height of
  500 mm"; pumps at the bottom; ion pump behind; 1e-5 Pa. Fig. 3: domed/conical top with a fibre neck (damper tube),
  turntable on a pedestal. Height of the disk above the floor is NOT given (Fig. 3 suggests ~40% of the height);
  modelled as z_d = 150-250 mm, pedestal radius 100-140 mm.
- External photo: large front door/port (dished) -> some extra volume not modelled (makes condensation slightly easier).

## Measurement principle (TOS)
- omega_n,f^2 = (K_n,f + G C_gn,gf)/I;  G = I Delta(omega^2)/Delta C_g (1 - DeltaK/(I Delta omega^2) + damper term).
- Delta C_g/I = 25202.85 kg m^-3 (Exp I), I = 4.5057e-5 kg m^2 -> Delta C_g = 1.1356 kg^2/m ->
  Delta K_g = G Delta C_g = 7.58e-11 N m/rad.  Fibre K = 6.25e-9 N m/rad; period 535 s; Delta T = 3.23 s.
- Any extra, source-orientation-dependent torsional stiffness Delta K_phi = K_phi(near) - K_phi(far) biases
  G by delta G/G = Delta K_phi / Delta K_g.  With E(psi) the scalar energy vs. pendulum-sphere angle,
  Delta K_phi = E''(0) - E''(pi/2) ~= -4 [E(0) - E(pi/2)] (cos 2psi dominated). Attractive-like (E(0) < E(pi/2)) -> G biased UP.
- 26 ppm <-> Delta K = 2.0e-15 N m/rad.
