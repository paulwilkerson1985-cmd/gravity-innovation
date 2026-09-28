import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Atom-interferometer coefficient from solver profiles.
Unscreened atom in the symmetron profile: a = -grad ln A = -(phi grad phi)/M^2 = -grad(phi^2)/(2 M^2).
Dimensionless: phi = v phit, grad = mu gradt  =>  a = (v^2 mu / 2 M^2) * C,   C = |gradt(phit^2)|  (order unity near a body).
SI: a[m/s^2] = C * v^2[eV^2] * mu[eV] / (2 M^2[eV^2]) * c^2/(hbar c)  = C * 1.80e-8 m/s^2 * (v^2/eV^2)(10 cm / (1/mu))(5 TeV/M)^2.
This script: (1) exact isolated-sphere ODE C(r) for a = 0.3, 0.6 (1/mu units); (2) axisymmetric 1 m-chamber solver:
source sphere a2 = 0.6 alone (test mass removed = atoms in its place), C along the axis above the source and the
reduction from the finite chamber; (3) benchmark with both spheres present (atoms beside the test mass are not modelled;
axis values are quoted between the bodies).  Also the in-air/space caveat is not modelled (chamber only)."""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade')); sys.path.insert(0, (_GI + '/solver/validation'))
from symm_robin import RGrid, solve
from ref_sphere_ode import sphere_profile

HBARC_EV_M = 1.973269804e-7; C_LIGHT = 2.99792458e8
CONV = C_LIGHT ** 2 / HBARC_EV_M                     # 1 eV of acceleration -> m/s^2  (4.556e23)
mu10 = HBARC_EV_M / 0.10                              # eV at 1/mu = 10 cm
K_AI = CONV * mu10 / (2 * (5e12) ** 2)                # m/s^2 per (eV^2 * C) at 1/mu=10 cm, M=5 TeV
out = {'K_AI_m_s2_per_eV2_C(10cm,5TeV)': K_AI}
print(f'K_AI = {K_AI:.3e} m/s^2 per eV^2 of v^2 per unit C, at 1/mu = 10 cm and M = 5 TeV  (scales as (10cm/L)(5TeV/M)^2)')
print(f'   v^2 = 37 eV^2 (Tier-1 force level 3e-11 N): a = {K_AI*37:.2e} C m/s^2 ; v^2 = 0.37 eV^2 (Tier 2): a = {K_AI*0.37:.2e} C m/s^2')

# (1) isolated sphere, exact ODE
print('\n(1) isolated pinned sphere in unbounded vacuum: C(r) = 2 phi phi\' at distance d = r - a from the surface')
ds = np.array([0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0])
iso = {}
for a in (0.3, 0.6, 1.0):
    sol, Q = sphere_profile(a)
    r = a + ds
    phi, dphi = sol.sol(r)
    C = 2 * phi * dphi
    iso[str(a)] = dict(d=ds.tolist(), C=C.tolist(), phi=phi.tolist())
    print(f'  a={a}: ' + ' '.join(f'd={d:.2f}:C={c:.3f}' for d, c in zip(ds, C)))
out['isolated'] = iso

# (2) chamber solver: source sphere alone, axis above it
print('\n(2) 1 m chamber (R = L_half = 5 at 1/mu = 10 cm): source a2 = 0.6 at z = -1.4, no test mass; C on the axis above the source')


def axis_C(g, phi):
    z = g.z; p = phi[0, :]                      # axis values (r=0)
    dp2 = np.gradient(p ** 2, g.h)
    return z, p, dp2


res = {}
for h in (0.05, 0.025):
    for Rch, lab in ((5.0, '1m'), (7.5, '1.5m'), (3.75, '0.75m')):
        g = RGrid(Rch, Rch, h); g.sphere(-1.4, 0.6)
        phi, r = solve(g)
        z, p, dp2 = axis_C(g, phi)
        rows = []
        for d in ds:
            zz = -1.4 + 0.6 + d
            j = int(round((zz - z[0]) / h))
            rows.append((d, p[j], abs(dp2[j])))
        res[f'{lab}_h{h}'] = dict(R=Rch, h=h, phi_max=float(phi.max()), d=[x[0] for x in rows], phi=[x[1] for x in rows], C=[x[2] for x in rows])
        print(f'  chamber {lab} h={h}: phi_max={phi.max():.3f}  ' + ' '.join(f'd={d:.2f}:C={c:.3f}' for d, _, c in rows))
out['chamber_source_only'] = res

# (3) both bodies present (benchmark), C on the axis in the gap between source (top at -0.8) and test mass (bottom at -0.3)
print('\n(3) benchmark with both spheres: C on the axis in the 0.5/mu gap (z from -0.8 to -0.3)')
g = RGrid(5.0, 5.0, 0.025); g.sphere(0, 0.3); g.sphere(-1.4, 0.6); phi, r = solve(g)
z, p, dp2 = axis_C(g, phi)
sel = (z > -0.8) & (z < -0.3)
gap = dict(z=z[sel].tolist(), phi=p[sel].tolist(), C=dp2[sel].tolist())
print('  z:   ' + ' '.join(f'{x:6.2f}' for x in z[sel][::2]))
print('  phi: ' + ' '.join(f'{x:6.3f}' for x in p[sel][::2]))
print('  C:   ' + ' '.join(f'{x:6.3f}' for x in dp2[sel][::2]))
out['benchmark_gap'] = gap

# (4) tabulated acceleration for the design table: atoms 1 cm (d=0.1) and 3 cm (d=0.3) above the 6 cm source, 1 m chamber
print('\n(4) acceleration table, 1 m chamber, source only (h=0.025 values), atoms at d = 1 cm and 3 cm above the 6 cm sphere')
r1 = res['1m_h0.025']
C1, C3 = r1['C'][1], r1['C'][3]
tab = []
for L in (4, 7, 10, 15, 20):
    for M in (4, 6, 10, 15, 36):
        for v2N in (3e-11, 3e-13):
            v2 = v2N / 8.12e-13
            fac = (10 / L) * (5 / M) ** 2
            a1, a3 = K_AI * v2 * C1 * fac, K_AI * v2 * C3 * fac
            tab.append(dict(Linv_cm=L, M_TeV=M, v2_N=v2N, a_1cm=a1, a_3cm=a3))
        print(f'  1/mu={L:2d} cm M={M:2d} TeV: v2=3e-11 N -> a(1cm)={tab[-2]["a_1cm"]:.2e}, a(3cm)={tab[-2]["a_3cm"]:.2e} m/s^2 ;'
              f'  v2=3e-13 N -> {tab[-1]["a_1cm"]:.2e}, {tab[-1]["a_3cm"]:.2e}   (C(1cm),C(3cm) scaled from 10 cm geometry: {C1:.2f},{C3:.2f})')
out['accel_table'] = tab
json.dump(out, open((_GI + '/design/ai_coefficient.json'), 'w'), indent=1)
