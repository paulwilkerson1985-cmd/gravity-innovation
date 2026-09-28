import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Axisymmetric on-axis pair potential U(d) (units v^2/mu) between the test sphere (a1=0.3) and the source (a2=0.6) in
the 1 m chamber (R=L_half=5), from the validated cut-cell solver: F~(d) = -dU/dd, U(inf)=0 (Yukawa tail beyond d_max).
Used as the pairwise proxy for the dumbbell torque: dE_proxy(th) = sum_i U(d_i(th))."""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z
h = 0.05; R = 5.0
ds = np.arange(1.4, 4.01, 0.2)
F = []
for d in ds:
    g = RGrid(R, R, h); g.sphere(0.0, 0.3); g.sphere(-d, 0.6)
    phi, res = solve(g)
    Fd = -force_z(g, phi, 0.38, -0.38, 0.38)
    F.append(Fd); print('d=%.2f F~=%.4f res=%.0e' % (d, Fd, res)); sys.stdout.flush()
F = np.array(F)
# tail: fit F ~ C (1+sqrt2 d) e^{-sqrt2 d}/d^2 on the last three points, integrate analytically-ish numerically to 12
Cfit = np.mean(F[-3:] / ((1 + np.sqrt(2) * ds[-3:]) * np.exp(-np.sqrt(2) * ds[-3:]) / ds[-3:]**2))
dt = np.arange(ds[-1], 12.0, 0.05); Ft = Cfit * (1 + np.sqrt(2) * dt) * np.exp(-np.sqrt(2) * dt) / dt**2
Utail = np.trapezoid(Ft, dt)
U = np.zeros_like(F)
for i in range(len(ds)):
    U[i] = np.trapezoid(F[i:], ds[i:]) + Utail
U = -U   # attractive: U < 0, F = -dU/dd > 0
json.dump(dict(d=ds.tolist(), F=F.tolist(), U=U.tolist(), Cfit=Cfit, Utail=Utail), open('pair_potential.json', 'w'), indent=1)
print('tail C=%.3f Utail=%.4f' % (Cfit, Utail))
for d, f, u in zip(ds, F, U):
    print('d=%.2f  F~=%.4f  U=%.4f' % (d, f, u))
def Uof(d):
    return np.interp(d, ds, U)
b = 0.6; rs = b + 1.4
dn, df, dp = 1.4, 2 * b + 1.4, np.sqrt(b**2 + rs**2)
dE = Uof(dn) + Uof(df) - 2 * Uof(dp)
print('\nDumbbell b=%.1f: d_near=%.2f d_far=%.2f d_perp=%.3f -> U: %.4f %.4f %.4f' % (b, dn, df, dp, Uof(dn), Uof(df), Uof(dp)))
print('pairwise proxy  E(0)-E(90) = %.4f v^2/mu   |dE| = %.4f ;  S*b = %.4f ;  |dE|/(S b) = %.3f' % (dE, abs(dE), F[0] * b, abs(dE) / (F[0] * b)))
# 45 deg: bodies at (+-b/sqrt2, +-b/sqrt2), source (rs,0): distances
c = 1 / np.sqrt(2); d1 = np.sqrt((rs - b * c)**2 + (b * c)**2); d2 = np.sqrt((rs + b * c)**2 + (b * c)**2)
E45 = Uof(d1) + Uof(d2); E0 = Uof(dn) + Uof(df); E90 = 2 * Uof(dp)
E2 = (E0 - E90) / 2; E4 = (E0 + E90) / 2 - E45
print('pairwise harmonics: E2=%.4f E4=%.4f (E4/E2=%.3f)' % (E2, E4, E4 / E2))
# Newtonian pairwise, same geometry, SI: m_t = 1.01 kg (solid) or hollow, m_s = 8.10 kg
G = 6.674e-11
for mt, lab in [(1.01, 'solid 1.01 kg'), (0.2, 'hollow 0.2 kg')]:
    UN = lambda d: -G * mt * 8.10 / (d * 0.1)
    dEN = UN(dn) + UN(df) - 2 * UN(dp)
    FN = G * mt * 8.10 / 0.14**2
    print('Newton (%s): E(0)-E(90) = %.3e N m ; F_N b = %.3e N m ; ratio %.3f' % (lab, dEN, FN * 0.06, dEN / (FN * 0.06)))
    print('   scalar/Newton torque ratio per v2[N]: %.3e /N  vs on-axis force ratio S/F_N = %.3e /N  (with S=%.3f)' % (
        abs(dE) * 0.1 / abs(dEN), F[0] / FN, F[0]))
