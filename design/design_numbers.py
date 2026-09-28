import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Physical numbers for the modulation schemes and the Tier-1 torsion-balance spec.
Benchmark: Cu test sphere 3 cm (1.01 kg), Cu source 6 cm (8.10 kg), centres 14 cm apart, 1 m chamber.
Tier 1 = 3e-11 N (1e-3 of F_N = 2.8e-8 N); Tier 2 = 3e-13 N.  All estimates order-of-magnitude unless stated."""
import numpy as np, json, sys
sys.path.insert(0, (_GI + '/solver/upgrade'))
import units as U

kB = 1.380649e-23; T0 = 293.0; G = 6.674e-11; NA = 6.022e23
out = {}
mod = json.load(open((_GI + '/design/mod_schemes.json')))
g_c = mod['g_c']
print(f'gas switch-off density: rho_off = {g_c:.3f} rho_crit  (rho_crit = M^2 mu^2)')

# ---- (1) gas switch pressures ----
print('\n(1) GAS SWITCH: pressure for rho_gas = rho_off = 0.584 rho_crit at 293 K (ideal gas), He (4.003) and Xe (131.3 g/mol)')
rows = []
for L in (4, 7, 10, 15, 20):
    for M in (4, 6, 10, 15, 36):
        if M > U.M_max_TeV(L):
            continue
        rc = U.rho_crit_gcc(M, L) * 1e3            # kg/m^3
        roff = g_c * rc
        pHe = roff * 8.314 * T0 / 4.003e-3 / 100   # mbar
        pXe = roff * 8.314 * T0 / 131.3e-3 / 100
        rows.append(dict(Linv=L, M=M, rho_crit_kgm3=rc, rho_off=roff, p_He_mbar=pHe, p_Xe_mbar=pXe))
        print(f'  1/mu={L:2d} cm M={M:2d} TeV: rho_crit={rc:.2e} kg/m3  rho_off={roff:.2e}  P_off: He {pHe:8.1f} mbar  Xe {pXe:8.2f} mbar')
out['gas_pressures'] = rows

# ---- (2) gas systematics ----
print('\n(2) GAS SYSTEMATICS (order of magnitude)')
# Photophoretic / Knudsen force on a sphere with a surface temperature gradient, slip-flow regime (Kn << 1):
# F = (9 pi/2) eta^2 R grad(T_s) / (rho_gas T)   (Yalamov/Reed; O(1) creep-coefficient factors omitted)
eta = {'He': 1.96e-5, 'Xe': 2.3e-5}   # Pa s
for gas in ('He', 'Xe'):
    for (L, M) in ((10, 6), (10, 36)):
        roff = g_c * U.rho_crit_gcc(M, L) * 1e3
        for dT in (1e-3, 1e-4):
            F = 4.5 * np.pi * eta[gas] ** 2 * 0.03 * (dT / 0.06) / (roff * T0)
            print(f'  photophoretic force, {gas} at rho_off({L} cm,{M} TeV)={roff:.1e} kg/m3, dT={dT*1e3:.1f} mK across the 3 cm sphere: ~{F:.1e} N')
lam = {'He': 1.013e5 * 1.9e-7, 'Xe': 1.013e5 * 3.7e-8}
for gas in ('He', 'Xe'):
    roff = g_c * U.rho_crit_gcc(6, 10) * 1e3; p = roff * 8.314 * T0 / ({'He': 4.003e-3, 'Xe': 131.3e-3}[gas])
    print(f'  {gas}: Knudsen number at rho_off(10 cm, 6 TeV): lambda/R = {lam[gas]/p/0.03:.1e} (continuum); Rayleigh number of the 1 m chamber at dT=10 mK: {9.81/T0*0.01*1.0**3/((eta[gas]/roff)**2):.0f} (<1700: no convection)')
# gas damping: Q of a 1 kg pendulum on a 50 um W fibre in He at 100 mbar (viscous drag on a 3 cm sphere, Stokes)
eta = {'He': 1.96e-5, 'Xe': 2.3e-5}   # Pa s
for gas, e in eta.items():
    b = 6 * np.pi * e * 0.03           # N s/m per sphere (Stokes)
    r_arm = 0.06; I = 2 * 1.01 * r_arm ** 2; kap = 9.8e-8; w0 = np.sqrt(kap / I)
    gam = 2 * b * r_arm ** 2 / I       # torque damping rate (two spheres)
    Q = w0 / gam
    Sn = np.sqrt(4 * kB * T0 * kap / (w0 * Q))
    print(f'  {gas}: Stokes drag on two 3 cm spheres at r_arm=6 cm -> Q ~ {Q:.0f} (period {2*np.pi/w0:.0f} s); thermal torque noise {Sn:.1e} N m/rtHz = {Sn/r_arm:.1e} N/rtHz force-equivalent')
# buoyancy
for L, M in ((10, 6), (10, 15)):
    roff = g_c * U.rho_crit_gcc(M, L) * 1e3
    V = 4 / 3 * np.pi * 0.03 ** 3
    print(f'  buoyancy on the 1 kg sphere at rho_off({L} cm,{M} TeV): {roff*V*9.81:.1e} N (vertical; torque only through arm asymmetry)')
# dielectric change of electrostatic force: (eps_r - 1) at 100 mbar He ~ 7e-6 -> negligible

# ---- (3) liner: Newtonian torque from a moving Al liner ----
print('\n(3) LINER: open Al cylinder radius R_l = 2.8/mu (28 cm at 1/mu=10 cm), height 1 m, 1 mm wall -> mass and Newtonian residual')
Rl, Hl, t = 0.28, 1.0, 1e-3; ml = 2 * np.pi * Rl * Hl * t * 2700
# force on a 1 kg body at distance x off-axis inside a finite cylinder: numerical ring integration
def cyl_force_x(x, zb=0.0, n=400):
    th = np.linspace(0, 2 * np.pi, n, endpoint=False); zz = np.linspace(-Hl / 2, Hl / 2, n)
    dm = ml / (n * n)
    TH, ZZ = np.meshgrid(th, zz, indexing='ij')
    dx = Rl * np.cos(TH) - x; dy = Rl * np.sin(TH); dz = ZZ - zb
    r3 = (dx ** 2 + dy ** 2 + dz ** 2) ** 1.5
    return G * 1.0 * dm * np.sum(dx / r3)
Fx = [cyl_force_x(x) for x in (0.0, 0.06, 0.10, 0.15)]
print(f'  liner mass {ml:.1f} kg; radial Newtonian force on a 1 kg body at x = 0, 6, 10, 15 cm off-axis (mid-height): ' + ', '.join(f'{f:.1e}' for f in Fx) + ' N')
print(f'  dumbbell torque cancels by symmetry; a 1 mm centring error at x=6 cm gives ~{abs(cyl_force_x(0.061)-cyl_force_x(0.059))/2*1e-3/1e-3:.1e} N differential (F(x) slope x 1 mm)')

# ---- (4) foil / can Newtonian and electrostatic ----
print('\n(4) FOIL/CAN: 25 um Cu (kappa/mu >= 10 at 10 cm, 15 TeV -> full switch) disk of radius 20 cm: mass and pull on the 1 kg body at 7 cm')
mf = np.pi * 0.2 ** 2 * 25e-6 * 8960
print(f'  foil mass {mf*1e3:.0f} g; Newtonian force at 7 cm (disk, on-axis): ~{2*np.pi*G*1.0*25e-6*8960*(1-0.07/np.hypot(0.07,0.2)):.1e} N  -> must be static (not switched) at Tier 1')
print(f'  symmetron pull of a pinned disk on the test body (solver, disk W=0.5..1.5 at D/2): static = +1.2..1.5 v^2 > signal 1.2 v^2  -> a one-sided movable foil is NOT a usable switch')
print(f'  electrostatic: unshielded two-sphere force 4.3e-12 N (dV/1 V)^2 -> a switched shield needs dV < {np.sqrt(3e-12/4.3e-12):.2f} V for 10% of Tier 1, < {np.sqrt(3e-14/4.3e-12)*1e3:.0f} mV for 10% of Tier 2')

# ---- (5) Tier-1 pendulum thermal noise and readout ----
print('\n(5) TIER-1 PENDULUM options: (A) 2 x 1.01 kg solid Cu spheres, 150 um W fibre; (B) 2 x 0.2 kg hollow Cu shells (3 cm, 2 mm wall), 75 um W fibre; r_arm = 6 cm, fibre 1 m')
for lab, mtest, d in (('A solid', 1.01, 150e-6), ('B hollow', 0.20, 75e-6)):
    Lf, Gw = 1.0, 1.6e11
    kap = np.pi * d ** 4 * Gw / (32 * Lf); I = 2 * mtest * 0.06 ** 2; w0 = np.sqrt(kap / I)
    stress = 2 * mtest * 9.81 / (np.pi * (d / 2) ** 2) / 1e9
    Q = 3e3
    Sn = np.sqrt(4 * kB * T0 * kap / (w0 * Q))
    tau1 = 3e-11 * 0.06
    FN = G * mtest * 8.10 / 0.14 ** 2
    print(f'  {lab}: kappa_f={kap:.2e} N m/rad, period {2*np.pi/w0:.0f} s, fibre stress {stress:.2f} GPa (W UTS ~3 GPa), Q={Q:.0e}: torque noise {Sn:.1e} N m/rtHz -> {Sn/0.06:.1e} N/rtHz, 1-h average {Sn/0.06/np.sqrt(3600):.1e} N')
    print(f'      Tier-1 torque {tau1:.1e} N m -> twist {tau1/kap*1e6:.2f} urad (autocollimator 1e-8 rad: margin {tau1/kap/1e-8:.0f}x); Newtonian F_N={FN:.1e} N -> Tier 1 is {3e-11/FN:.1e} of F_N')
print('  Tier-1 stability: the Newtonian torque is constant across the switch; needs 1e-3 (solid) / 5e-3 (hollow) stability per switch cycle (~1 h):')
print('      source position 70 um / 350 um; fibre zero drift << twist (alternating on/off cancels linear drift); tilt via tiltmeter; T stability ~10 mK (calibration), ~1 mK gradient (photophoresis).')

json.dump(out, open((_GI + '/design/design_numbers.json'), 'w'), indent=1)
