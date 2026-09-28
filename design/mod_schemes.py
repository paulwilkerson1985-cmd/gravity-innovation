import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Modulation schemes with FIXED masses: solver-based modulation depth.
Benchmark (units 1/mu; 1/mu = 10 cm reference): 1 m x 1 m chamber R = L_half = 5, Cu test sphere a1 = 0.3 at z = 0,
Cu source a2 = 0.6 at z = -1.4.  Signal S = F(source) - F(no source) on the test mass, in v^2.
Schemes:
  (a) gas   : uniform gas density g = rho_gas/rho_crit (field mass^2 -> (1-g)); F(g)/F(0)
  (b) liner : Dirichlet cylindrical shell of radius R_l spanning the full chamber height (open ends at the walls);
              also a closed liner (with end caps at +-Z_l)
  (c) iris/foil disk : single Dirichlet disk of radius W at z = -D/2 (between the bodies); also Robin sheets (thin foils)
  (d) membrane baseline : full-width Robin sheet at z=-D/2 with kappa/mu (permanent electrostatic shield) -> loss
Outputs mod_schemes.json and mod_schemes.out.
"""
import sys, json, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z, lam_min

A1, A2, D = 0.3, 0.6, 1.4
h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.05
R = 5.0
out = {'h': h}
log = open((_GI + '/design/mod_schemes.out'), 'w')


def P(*a):
    s = ' '.join(str(x) for x in a); print(s); log.write(s + '\n'); log.flush()


def grid(source=True, liner=None, disk=None, sheet=None):
    g = RGrid(R, R, h)
    g.sphere(0.0, A1)
    if source:
        g.sphere(-D, A2)
    tol = 1e-9
    if liner is not None:
        Rl, Zl = liner
        g.fixed |= (np.abs(g.R - Rl) <= tol) & (np.abs(g.Z) <= Zl + tol)
        if Zl < R - tol:   # closed liner: end caps
            g.fixed |= (g.R <= Rl + tol) & (np.abs(np.abs(g.Z) - Zl) <= tol)
    if disk is not None:
        W = disk
        g.fixed |= (np.abs(g.Z + D / 2) <= tol) & (g.R <= W + tol)
    if sheet is not None:
        g.zsheet(-D / 2, 0, g.r[-2], kappa=sheet)
    return g


def Ftest(g, phi):
    return -force_z(g, phi, A1 + 0.08, -A1 - 0.08, A1 + 0.08)


def signal(gas=0.0, **kw):
    g = grid(**kw); phi, r1 = solve(g, gas=gas); Fs = Ftest(g, phi); pm = phi.max()
    g0 = grid(source=False, **kw); phi0, r2 = solve(g0, gas=gas); Fn = Ftest(g0, phi0)
    return Fs - Fn, Fn, pm


t0 = time.time()
S0, Fn0, pm0 = signal()
P(f'h={h}  baseline S0={S0:.4f} (static {Fn0:.1e}) phi_max={pm0:.3f}  [{time.time()-t0:.0f}s]')
out['S0'] = S0

# (a) gas
P('\n(a) GAS: g = rho_gas/rho_crit ; S(g)/S0 ; depth = 1 - S/S0')
gas_rows = []
for gm in [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.58, 0.6, 0.65]:
    S, Fn, pm = signal(gas=gm)
    gas_rows.append(dict(g=gm, S=S, ratio=S / S0, phi_max=pm))
    P(f'  g={gm:.2f}  S={S:.4f}  S/S0={S/S0:.4f}  depth={1-S/S0:.4f}  phi_max={pm:.3f}')
g_lin = grid(); lam = lam_min(g_lin)[0]
P(f'  linear onset with bodies: g_c = 1 - lambda_min = {1-lam:.4f}')
out['gas'] = gas_rows; out['g_c'] = 1 - lam

# (b) liner
P('\n(b) LINER (Dirichlet shell radius R_l, full height = open ends at chamber walls; and closed with caps at +-Z_l)')
liner_rows = []
for Rl in [5.0, 4.5, 4.0, 3.5, 3.2, 3.0, 2.8, 2.6, 2.4, 2.2, 2.0]:
    Rl_g = round(Rl / h) * h
    if Rl_g >= R - 1e-9:
        S, Fn, pm = S0, Fn0, pm0
    else:
        S, Fn, pm = signal(liner=(Rl_g, R))
    liner_rows.append(dict(Rl=Rl_g, Zl=R, S=S, ratio=S / S0, phi_max=pm, static=Fn))
    P(f'  open liner R_l={Rl_g:.2f}  S={S:.4f}  S/S0={S/S0:.4f}  depth={1-S/S0:.4f}  phi_max={pm:.3f}  static={Fn:+.3f}')
for Rl, Zl in [(4.0, 4.0), (3.5, 3.5), (3.3, 3.3), (3.0, 3.0), (2.6, 2.6), (3.0, 5.0)]:
    Rl_g = round(Rl / h) * h; Zl_g = round(Zl / h) * h
    S, Fn, pm = signal(liner=(Rl_g, Zl_g))
    liner_rows.append(dict(Rl=Rl_g, Zl=Zl_g, S=S, ratio=S / S0, phi_max=pm, static=Fn))
    P(f'  closed liner R_l={Rl_g:.2f} Z_l={Zl_g:.2f}  S={S:.4f}  S/S0={S/S0:.4f}  depth={1-S/S0:.4f}  phi_max={pm:.3f}  static={Fn:+.3f}')
out['liner'] = liner_rows

# (c) iris / foil disk between the bodies
P('\n(c) IRIS / FOIL DISK: single Dirichlet disk radius W at z=-D/2 (between source and test mass)')
disk_rows = []
for W in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0, 4.0, 4.95]:
    W_g = round(W / h) * h
    S, Fn, pm = signal(disk=W_g)
    disk_rows.append(dict(W=W_g, S=S, ratio=S / S0, phi_max=pm, static=Fn))
    P(f'  disk W={W_g:.2f}  S={S:.4f}  S/S0={S/S0:.2e}  depth={1-S/S0:.5f}  phi_max={pm:.3f}  static={Fn:+.3f}')
out['disk'] = disk_rows

# (d) full-width Robin sheet (thin foil / permanent membrane): signal retained vs kappa/mu
P('\n(d) FULL-WIDTH ROBIN SHEET at z=-D/2 (thin foil of areal density rho t: kappa/mu = (rho/rho_crit) mu t)')
sheet_rows = []
for kap in [0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0]:
    S, Fn, pm = signal(sheet=kap)
    sheet_rows.append(dict(kappa=kap, S=S, ratio=S / S0, phi_max=pm, static=Fn))
    P(f'  kappa/mu={kap:g}  S={S:.4f}  S/S0={S/S0:.3e}  loss={1-S/S0:.3e}  static={Fn:+.3f}')
out['sheet'] = sheet_rows
json.dump(out, open((_GI + '/design/mod_schemes.json'), 'w'), indent=1)
P(f'\ndone in {time.time()-t0:.0f}s')
