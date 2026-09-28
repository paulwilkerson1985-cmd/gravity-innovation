#!/usr/bin/env python3
"""
Quick reach estimates for OTHER screened / environment-dependent models in the
Gravity Innovation benchmark geometry:
  Cu spheres 1 kg (R1 = 3.0 cm) and 8.1 kg (R2 = 6.0 cm), centres 14 cm apart,
  inside a 1 m diameter (R_ch = 0.5 m) unshielded vacuum chamber.
  Tier 1 ~ 3e-11 N, Tier 2 ~ 3e-13 N differential force.

Natural units: eV. hbar c = 1.97327e-7 eV m.  1 eV^2 of "v^2" = 8.12e-13 N.
Author: Fable 5 (26 Sep 2026). Order-of-magnitude only; point-like Yukawa
geometry factor, no finite-size correction (the validated symmetron solver
gives F~ = 1.195 vs 0.68 point-like at 1/mu = 10 cm, i.e. the estimates
below are conservative by up to ~1.8x in the geometry factor).
"""
import math

hbarc = 1.97327e-7          # eV m
eV2_to_N = 8.12e-13         # N per eV^2 (force = v^2 * dimensionless geometry)
MPl = 2.435e27              # reduced Planck mass, eV
rho_gcc = 4.30e18           # eV^4 per g/cm^3
rho_Cu = 8.96 * rho_gcc
rho_air = 1.2e-3 * rho_gcc
G = 6.674e-11

R1, R2, r = 0.03, 0.06, 0.14           # m
m1, m2 = 1.0, 8.1                      # kg
R_ch = 0.5                             # m
F_N = G * m1 * m2 / r**2
tier1, tier2 = 3e-11, 3e-13

def to_inv_eV(length_m):
    return length_m / hbarc

def yukawa(m_eV, r_m):
    x = m_eV * to_inv_eV(r_m)
    return (1 + x) * math.exp(-x)

print(f"Newtonian force between benchmark spheres: {F_N:.2e} N")
print(f"Tier 1 = {tier1:.0e} N = {tier1/F_N:.1e} F_N ;  Tier 2 = {tier2:.0e} N = {tier2/F_N:.1e} F_N\n")

# ---------------------------------------------------------------------------
# 1. CHAMELEON  V = L^4 + L^(4+n)/phi^n, A = 1 + phi/M
#    chamber field  phi_bg = xi (n(n+1) L^(4+n) R^2)^(1/(n+2)), xi = 0.55 (sphere)
#    field mass at phi_bg:  m^2 = n(n+1) L^(4+n)/phi_bg^(n+2)
#    two deeply screened spheres:  F = 4 pi phi_bg^2 R1 R2 / r^2 * Yukawa  (M-independent)
#    thin-shell factor lam_i = 3 M phi_bg /(rho_i R_i^2)  (screened if < 1)
# ---------------------------------------------------------------------------
print("=== 1. Chameleon: force between screened Cu spheres in 1 m chamber ===")
L_DE = 2.4e-3  # eV
xi = 0.55
Rch = to_inv_eV(R_ch)
for n in (1, 2, 3, 4):
    for L_over_LDE in (1.0, 0.5, 2.0):
        L = L_DE * L_over_LDE
        phi_bg = xi * (n*(n+1) * L**(4+n) * Rch**2)**(1.0/(n+2))
        m_bg = math.sqrt(n*(n+1) * L**(4+n) / phi_bg**(n+2))
        rng = hbarc / m_bg
        F = 4*math.pi * phi_bg**2 * (R1*R2/r**2) * yukawa(m_bg, r) * eV2_to_N
        lam1 = 3*MPl*phi_bg/(rho_Cu*to_inv_eV(R1)**2)   # at M = M_Pl (largest M of interest)
        print(f" n={n} L={L_over_LDE:3.1f} L_DE: phi_bg={phi_bg:8.3e} eV  range={rng*100:6.1f} cm"
              f"  F={F:8.2e} N ({F/F_N:7.1e} F_N)  lam1(M=M_Pl)={lam1:7.1e}")
# Lambda needed for Tier 2 at n=1: F ∝ L^(10/3)
n = 1
L = L_DE
phi_bg = xi * (2 * L**5 * Rch**2)**(1/3)
m_bg = math.sqrt(2*L**5/phi_bg**3)
F1 = 4*math.pi*phi_bg**2*(R1*R2/r**2)*yukawa(m_bg, r)*eV2_to_N
print(f" n=1: Lambda needed for Tier 2 = {L_DE*(tier2/F1)**(3/10)*1e3:.2f} meV,"
      f" for Tier 1 = {L_DE*(tier1/F1)**(3/10)*1e3:.2f} meV  (point-like geometry; x1.8 finite-size gain possible)")
print(" Chamber scaling: F ∝ R_ch^(4/3) at n=1 -> 2 m chamber gives x2.5; 6 cm chamber gives x0.06 (that is why small chambers")
print("   never saw it with macroscopic bodies).  Status: n=1 at Lambda_DE excluded for ALL M (Jaffe17 + Yin22 + Eot-Wash).\n")

# ---------------------------------------------------------------------------
# 2. ENVIRONMENT-DEPENDENT DILATON  V = V0 exp(-lambda phi/M_Pl), A = 1 + A2 phi^2/(2 M_Pl^2)
#    In matter: symmetron-like with M_eff = M_Pl/sqrt(A2). In the chamber the field climbs
#    from ~0 at the walls to phi_V with V''(phi_V) ~ (2.4/R_ch)^2.  Force between screened
#    bodies ~ (Delta phi)^2 with Delta phi ~ c * M_Pl/lambda, c = O(1-3) (log).
# ---------------------------------------------------------------------------
print("=== 2. Dilaton: field jump in chamber and force ===")
for lam in (1e26, 1e27, 1e28, 1e29, 1e30):
    dphi = MPl/lam          # eV  (times O(1-3))
    F = 4*math.pi*dphi**2*(R1*R2/r**2)*0.7*eV2_to_N   # Yukawa ~0.7 for range ~ chamber
    print(f" lambda={lam:.0e}: M_Pl/lambda={dphi:8.2e} eV  -> F ~ {F:8.2e} N x c^2")
print(f" Tier 2 needs M_Pl/lambda >~ {math.sqrt(tier2/(4*math.pi*(R1*R2/r**2)*0.7*eV2_to_N)):.2f} eV, i.e. lambda <~ {MPl/math.sqrt(tier2/(4*math.pi*(R1*R2/r**2)*0.7*eV2_to_N)):.1e}")
print(" A2 for TeV-scale M_eff: A2 = (M_Pl/M)^2 =", f"{(MPl/5e12)**2:.1e}", "(M = 5 TeV);  qBounce-tested region is A2~1e40 (M~10 MeV).")
print(" -> A genuinely different corner (A2 ~ 1e29-1e30, lambda <~ 1e27) that FKP-2024 plots do not resolve; needs their code.\n")

# ---------------------------------------------------------------------------
# 3. UNSCREENED YUKAWA (e.g. radiatively-stable symmetron at weak coupling, or any
#    light boson):  F = alpha F_N (1 + r/lam) exp(-r/lam)
# ---------------------------------------------------------------------------
print("=== 3. Plain Yukawa reach (unscreened bodies), alpha at Tier 1 / Tier 2 ===")
for lam_m in (0.02, 0.05, 0.10, 0.30):
    yuk = (1 + r/lam_m)*math.exp(-r/lam_m)
    print(f" range={lam_m*100:5.1f} cm: alpha(Tier1)={tier1/(F_N*yuk):7.1e}  alpha(Tier2)={tier2/(F_N*yuk):7.1e}")
print(" Existing ISL bounds at 2-30 cm: |alpha| <~ 1e-4 (Hoskins 1985, 2-5 cm) to ~1e-3 (Spero/Moody-Paik, 10 cm-1 m);")
print(" Tier 2 would improve unscreened-Yukawa bounds at 10-30 cm by ~10-100x as a by-product (differential geometry permitting).\n")

# ---------------------------------------------------------------------------
# 4. NATURALNESS: one-loop shift of mu^2 from the phi^2 T/(2M^2) operator
#    delta mu^2 ~ Lambda_UV^4 / (16 pi^2 M^2)
# ---------------------------------------------------------------------------
print("=== 4. Naturalness ===")
mu = 1e-5   # eV (1/mu = 2 cm)
M = 5e12    # eV
for name, LUV in (("QCD 1 GeV", 1e9), ("m_top/EW 200 GeV", 2e11), ("1 TeV", 1e12), ("M itself", M)):
    dmu2 = LUV**4/(16*math.pi**2*M**2)
    print(f" cutoff {name:18s}: delta mu^2 = {dmu2:8.1e} eV^2  -> tuning mu^2/delta mu^2 = {mu**2/dmu2:8.1e}")
# Higgs-portal mapping: (1/2M^2) phi^2 rho  <-  lam_p phi^2 |H|^2 via h exchange: 1/(2M^2) = lam_p m_N/(m_h^2 ...)
mN, mh, vEW = 0.939e9, 125e9, 246e9
# lam_p phi^2 |H|^2 -> (lam_p v_EW) phi^2 h ; h-exchange to nucleons (m_N/v_EW)/m_h^2 -> lam_p m_N phi^2 NN / m_h^2
# match to (phi^2/2M^2) m_N NN  =>  lam_p = m_h^2/(2 M^2);  induced mass m_phi^2 = lam_p v_EW^2
lam_p = mh**2/(2*M**2)
m_phi2_portal = lam_p*vEW**2
print(f" Higgs-portal UV completion of M = 5 TeV: lambda_portal ~ {lam_p:.1e}; induced m_phi ~ {math.sqrt(m_phi2_portal)/1e9:.2f} GeV"
      f" -> tuning against mu^2: {mu**2/m_phi2_portal:.1e}")
# quartic: lambda_4 = mu^2/v^2 with v^2 ~ 0.4 eV^2 (Tier 2)
v2 = tier2/eV2_to_N
print(f" quartic lambda = mu^2/v^2 = {mu**2/v2:.1e} for v^2 = {v2:.2f} eV^2 (Tier 2)")
print(" Same tuning class as every lab symmetron/chameleon (Upadhye–Hu–Khoury 2012); BCM-2016 radiative version lives at M~1e-5 M_Pl.\n")

# ---------------------------------------------------------------------------
# 5. COSMOLOGY COINCIDENCES: symmetron vacuum energy vs rho_Lambda; phase-transition epoch
# ---------------------------------------------------------------------------
print("=== 5. Cosmological numbers ===")
rho_L = (2.4e-3)**4
for inv_mu_cm, v2 in ((2, 0.4), (10, 0.4), (10, 1e7)):
    mu_ = hbarc/(inv_mu_cm*1e-2)
    dV = mu_**2*v2/4
    print(f" 1/mu={inv_mu_cm:3d} cm, v^2={v2:.0e} eV^2: |V_min| = {dV:.1e} eV^4 = {dV/rho_L:.1e} rho_Lambda (constant, negative: absorbed in Lambda)")
rho_crit = (hbarc/0.10)**2 * (5e12)**2       # mu^2 M^2 for 1/mu = 10 cm, M = 5 TeV
print(f" rho_crit(1/mu=10 cm, M=5 TeV) = {rho_crit:.1e} eV^4 = {rho_crit/rho_gcc:.1e} g/cm^3  (air = 1.2e-3 g/cm^3 -> field pinned in air iff mu M < 7.2e7 eV^2)")
print(f" nucleon-mass shift in the broken phase v^2/(2M^2) = {0.4/(2*M**2):.0e} (v^2=0.4 eV^2) .. {1e7/(2*M**2):.0e} (v^2=1e7): no BBN effect")
rho_b0 = 4.2e-31*rho_gcc
z_tr = (rho_crit/rho_b0)**(1/3)
print(f" cosmic baryon density crossed rho_crit at 1+z ~ {z_tr:.1e} (T ~ {2.35e-4*z_tr/1e3:.0f} keV): after BBN, before recombination; released energy mu^2 v^2/4 ~ 1e-13 eV^4 << rho_rad ~ 1e12 eV^4 -> no H0/N_eff effect")
print(" Vacuum mass sqrt(2) mu ~ 1e-5 eV >> H0 ~ 1e-33 eV: field frozen at its minimum since z~1e9 -> cannot be evolving dark energy (DESI w0-wa).\n")

# ---------------------------------------------------------------------------
# 6. QUADRATIC-COUPLED ULDM at M ~ TeV, m ~ ueV: skin depth and cavity exclusion
# ---------------------------------------------------------------------------
print("=== 6. phi^2-coupled ultralight DM with M = 5 TeV, m = 1e-5 eV ===")
m_dm = 1e-5
meff_Cu = math.sqrt(rho_Cu/M**2)
meff_air = math.sqrt(rho_air/M**2)
print(f" in Cu: m_eff = {meff_Cu:.1e} eV (skin depth {hbarc/meff_Cu*1e3:.2f} mm)  ; in air m_eff = {meff_air:.1e} eV vs m = {m_dm:.0e} eV")
k_cav = 2.405/Rch
print(f" lowest cavity wavenumber 2.405/R_ch = {k_cav:.1e} eV vs DM momentum m v ~ {m_dm*1e-3:.0e} eV -> DM wave cannot enter a 1 m metal cavity (needs R >~ {2.405/(m_dm*1e-3)*hbarc:.0f} m)")
phi0 = math.sqrt(2*3.1e-6)/m_dm   # rho_DM = 0.4 GeV/cm^3 = 3.1e-6 eV^4
print(f" free-space DM amplitude phi0 = {phi0:.0f} eV -> IF it filled the chamber, screened-body force ~ <phi^2> F~ ~ {0.5*phi0**2*1.2*eV2_to_N:.1e} N (~F_N!); it does not, so the test adds nothing.\n")

# ---------------------------------------------------------------------------
# 7. GALILEON / VAINSHTEIN
# ---------------------------------------------------------------------------
print("=== 7. Cubic galileon around Earth ===")
r_s = 2*G*5.97e24/(3e8)**2
r_c = 3e8/(2.2e-18)          # ~ c/H0
r_V = (r_s*r_c**2)**(1/3)
R_E = 6.371e6
print(f" r_V(Earth) = {r_V:.1e} m = {r_V/3.086e16:.1f} pc; residual fifth force at surface ~ (R_E/r_V)^(3/2) = {(R_E/r_V)**1.5:.1e} of gravity, universal; lab sources further suppressed inside Earth's Vainshtein region.")
