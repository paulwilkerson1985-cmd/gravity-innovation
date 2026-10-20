"""Q6a: electrostatic (contact- and patch-potential) budget for the recommended primary design
(design/SUMMARY.md §2): Au-flashed hollow Cu shells (a = 3 cm) on a dumbbell (arm b = 6 cm), W fibre (conducting:
the pendulum is grounded/biased through it), foil-disk attractor 4 cm below the shell surfaces on a turntable,
a permanent full-width grounded metallised membrane between them, and an end-plate (+/-15 cm) or 28 cm liner switch.
Order-of-magnitude estimates with exact sphere-plane capacitances; SI units. Prints the budget table.

Model pieces
 (1) sphere-plane capacitance (bispherical image series): C = 4 pi eps0 a sinh(al) sum_n 1/sinh(n al), cosh(al) = d/a,
     d = centre height; vertical force F = 1/2 V^2 dC/dd (attractive). A vertical force makes no twist torque.
 (2) lateral force from a potential pattern dV cos(kx) on a plane, on a conducting sphere of net charge Q = C V at
     height d: to first order in dV the interaction energy is Q phi_ext(centre) (mean-value property of harmonic
     functions over the sphere surface), phi_ext = dV cos(kx) exp(-k d), so F1 = Q dV k exp(-k d).
     Second order (rev. 2, after the Fable review): the pattern field also polarises the shell (induced dipole
     4 pi eps0 a^3 E), F2 = PF * 4 pi eps0 a^3 k^3 dV^2 exp(-2 k d), with a proximity factor PF = 3 (the reviewer's
     proximity-force estimate is 2-3x the dipole value at the 2 cm membrane gap). F = F1 + F2 is maximised over k.
     F2 dominates when the shell is nulled (V << dV). Image corrections otherwise O(1) (factor-2 uncertainty).
 (3) membrane flexing by the attractor's own contact potential: pressure p = eps0 E^2 / 2, E = V_a / g_a, on a disk of
     radius R_d of a tensioned membrane (tension T, clamped at radius L): w0 = p R_d^2/(4T) (1 + 2 ln(L/R_d)).
     The shell sees a modulated gap: dF_vert = 1/2 V_s^2 |d2C/dd2| w0 (vertical).
 Torque = 2 b x (tangential force): both shells, forces taken fully tangential and adding (upper bound; rms sqrt(2) b F).
 Drift and noise (Pollack et al. 2008) are of the MEAN contact potential, so they multiply the static pattern dV.
"""
import numpy as np
eps0 = 8.8541878128e-12
a, b = 0.03, 0.06                  # shell radius, arm (m)
tier2_F, tier2_tau = 3e-13, 8.5e-15  # design/SUMMARY.md §2 (Tier-2 force and torque)
tier1_tau = 100 * tier2_tau
therm_1h = 2e-16                   # thermal torque noise in 1 h (design table), N m

def C_sphere_plane(d, a=a, nmax=4000):
    al = np.arccosh(d / a); n = np.arange(1, nmax + 1)
    with np.errstate(over='ignore'):
        return 4 * np.pi * eps0 * a * np.sinh(al) * np.sum(1 / np.sinh(n * al))

def dC(d, h=1e-6):  return (C_sphere_plane(d + h) - C_sphere_plane(d - h)) / (2 * h)
def d2C(d, h=1e-5): return (C_sphere_plane(d + h) - 2 * C_sphere_plane(d) + C_sphere_plane(d - h)) / h**2

def F_lat_max(C, V, dV, d, PF=3.0):
    """max over k of the first-order (C V dV k e^-kd) plus second-order (induced-dipole) lateral force"""
    k = np.logspace(-1, 3, 4000) / d
    F = C * V * dV * k * np.exp(-k * d) + PF * 4 * np.pi * eps0 * a**3 * k**3 * dV**2 * np.exp(-2 * k * d)
    return F.max()

def F_cross(C, Vchg, dV, d):
    """first-order force from a CHANGE Vchg of the shell's mean potential acting on a static pattern dV (k = 1/d)"""
    return C * Vchg * dV / (np.e * d)

rows = []
def add(name, sync, F, tau, note):
    rows.append((name, sync, F, tau, note))

print("Sphere-plane numbers (a = 3 cm):")
for s in [0.01, 0.02, 0.03, 0.04, 0.12, 0.19]:
    d = a + s
    print("  gap %4.0f mm: C = %.3e F (isolated 4 pi eps0 a = %.3e), dC/dd = %.3e F/m, vertical F per V^2 = %.2e N, d2C/dd2 = %.2e F/m^2"
          % (1e3 * s, C_sphere_plane(d), 4 * np.pi * eps0 * a, dC(d), 0.5 * abs(dC(d)), d2C(d)))

# --- (A) shell vs membrane (gap 2 cm), pendulum biased to null the mean contact potential to +/- V_null
s_m = 0.02; d_m = a + s_m; C_m = C_sphere_plane(d_m)
for Vs, lab in [(0.002, "bias-nulled, 2 mV"), (0.1, "not nulled, Au-Au 100 mV"), (1.0, "not nulled, Au vs Al ~1 V")]:
    F = 0.5 * Vs**2 * abs(dC(d_m))
    add("A1 uniform shell-membrane CPD (%s)" % lab, "static", F, 0.0, "vertical only: no twist torque")
for Vs, dV, lab in [(0.002, 0.03, "nulled 2 mV, pattern 30 mV"), (0.1, 0.1, "100 mV, pattern 100 mV"), (1.0, 0.3, "1 V, pattern 300 mV")]:
    F = F_lat_max(C_m, Vs, dV, d_m)
    add("A2 membrane large-scale pattern x shell CPD (%s)" % lab, "static", F, 2 * b * F, "constant torque; absorbed")
# drift of the mean CPD over one hour (0.3 mV/day; Pollack 2008, after 30 days under vacuum) times the static pattern
for dV in [0.03, 0.1]:
    F = F_cross(C_m, 0.3e-3 / 24, dV, d_m)
    add("A3 mean-CPD drift over 1 h (0.3 mV/day) x pattern %g mV" % (1e3 * dV), "slow drift", F, 2 * b * F, "vs thermal in 1 h 2e-16 N m")
# mean-CPD fluctuation 30 uV/rtHz times the static pattern (plus the same fluctuation on the pattern times V_s)
for Vs, dV in [(0.002, 0.03), (0.1, 0.1), (1.0, 0.3)]:
    F = F_cross(C_m, 30e-6, dV + Vs, d_m)
    add("A4 CPD noise 30 uV/rtHz, V_s = %g V, pattern %g mV, per rtHz" % (Vs, 1e3 * dV), "noise", F, 2 * b * F, "vs thermal 1.2e-14 N m/rtHz")
# 2w electrical pickup: a ripple on the pendulum bias / grounds synchronous with the attractor drive, acting on static patterns
for dV in [0.03, 0.1]:
    F = F_cross(C_m, 1e-3, dV, d_m)
    add("A5 2w pickup 1 mV on the membrane pattern %g mV" % (1e3 * dV), "attractor (2w)", F, 2 * b * F, "2w only (not switch-dependent)")

# --- (B) attractor-synchronous coupling through the membrane
# continuous grounded metal film: static (mHz) fields from the attractor side do not penetrate (conductor).
# B1: membrane flexing by the attractor-membrane CPD (foil 2 cm below the membrane)
for Va, T in [(0.1, 20.0), (1.0, 2.0)]:
    E = Va / 0.02; p = 0.5 * eps0 * E**2; Rd, L = 0.05, 0.5
    w0 = p * Rd**2 / (4 * T) * (1 + 2 * np.log(L / Rd))
    for Vs in [0.002, 1.0]:
        F = 0.5 * Vs**2 * abs(d2C(d_m)) * w0
        add("B1 membrane flex: V_a = %g V, T = %g N/m (w0 = %.1e m), V_s = %g V" % (Va, T, w0, Vs), "attractor (2w)",
            F, 2 * b * F * 1e-2, "vertical; torque only via 1% asymmetry (bound)")
# B2: a hole or gap in the membrane: attractor CPD leaks; field through an aperture of radius r_h at distance x ~ (r_h/x)^3
for rh in [0.001, 0.005]:
    leak = (rh / d_m)**3
    F = F_lat_max(C_m, 0.1, 0.1 * leak, d_m)
    add("B2 aperture r = %g mm near a shell (leak (r/d)^3 = %.0e), V_s = V_a = 100 mV" % (1e3 * rh, leak), "attractor (2w)",
        F, 2 * b * F, "conservative (aperture dipole ~4x less); keep the membrane continuous")

# --- (C) switch-synchronous: UPPER end plate at +15 cm (gap 12 cm; the lower plate is on the attractor side of the
# membrane and screened), or the 28 cm liner (gap 19 cm). Charge: Q = C V with C the two-conductor sphere-plane value
# (conservative) or, for the end plate, the shell-plate mutual capacitance with the grounded membrane 2 cm below,
# 1.1 pF (axisymmetric FD by the Fable reviewer, 20 Oct; 0.23 pF with the plate at the chamber end).
for s_p, lab, Cmut in [(0.12, "upper end plate", 1.1e-12), (0.19, "liner", None)]:
    d_p = a + s_p; C_p = C_sphere_plane(d_p)
    for Vsp, dV, lab2 in [(0.03, 0.03, "Au, biased to 30 mV, pattern 30 mV"), (0.05, 0.05, "Au, biased to 50 mV, pattern 50 mV"),
                          (0.12, 0.1, "Au, unbiased 120 mV, pattern 100 mV"), (1.0, 0.3, "bare Al ~1 V, pattern 300 mV")]:
        Fv = 0.5 * Vsp**2 * abs(dC(d_p))
        Fl = F_lat_max(C_p, Vsp, dV, d_p)
        note = "vertical %.1e N; DC step, not 2w" % Fv
        if Cmut is not None:
            Fm = F_lat_max(Cmut, Vsp, dV, d_p)
            note += "; with membrane-screened C: %.1e N m (%.2f T2)" % (2 * b * Fm, 2 * b * Fm / tier2_tau)
        add("C %s (%s)" % (lab, lab2), "switch (DC step)", Fl, 2 * b * Fl, note)
    if Cmut is not None:
        for dV in [0.05, 0.1]:
            F = F_cross(Cmut, 1e-3, dV, d_p)
            add("C2 2w pickup 1 mV x %s pattern %g mV (membrane-screened C)" % (lab, 1e3 * dV), "2w AND switch", F, 2 * b * F,
                "double-modulated: needs 2w ripple <~ 0.1 mV")

print("\nBudget (forces in N, torques in N m; Tier-2 torque %.1e, Tier-1 %.1e, thermal in 1 h %.0e):" % (tier2_tau, tier1_tau, therm_1h))
print("%-92s %-17s %9s %9s %9s  %s" % ("term", "synchronous with", "force", "torque", "tau/T2", "note"))
for name, sync, F, tau, note in rows:
    print("%-92s %-17s %9.1e %9.1e %9.1e  %s" % (name, sync, F, tau, tau / tier2_tau, note))
