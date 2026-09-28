import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Environment-dependent dilaton (Damour-Polyakov type; Brax-Fischer-Kaeding-Pitschmann 2022, arXiv:2203.12512)
in the benchmark torsion geometry, solved with the validated cut-cell axisymmetric grid (validation/symm_sw.GridSW).

Model: V = V0 exp(-lambda phi/M_Pl),  A = 1 + A2 phi^2/(2 M_Pl^2).  In dense matter (rho A2/M_Pl^2 >> k^2) the field sits
at phi_rho ~ 0 with in-matter mass m_rho^2 = rho A2/M_Pl^2 (Cu: 1/m_rho = 0.16 mm at A2 = 2.4e29) -> screened bodies and
chamber walls are Dirichlet psi = 0.  In vacuum there is no minimum: with psi = lambda phi/M_Pl and lengths in units of
1/k, k^2 = lambda^2 V0/M_Pl^2, the field obeys the Liouville equation  lap psi = -exp(-psi)  and is set by the cavity size.
Stress tensor T_ij = d_i psi d_j psi - delta_ij (|grad psi|^2/2 + exp(-psi)) in units (M_Pl/lambda)^2 k^2, so the force
between screened bodies is  F = (M_Pl/lambda)^2 F~_dil(geometry x k)  [eV^2 -> N via 8.12e-13].
We fix V0 = rho_Lambda (the dilaton is the dark energy) so that 1/k = 9.5 cm x (1e27/lambda)."""
import sys, json, time, numpy as np, scipy.sparse as sp, scipy.sparse.linalg as spla
sys.path.insert(0, (_GI + '/solver')); sys.path.insert(0, (_GI + '/solver/validation'))
from symm_sw import GridSW

EV2_N = 8.12e-13
MPL = 2.435e27            # reduced Planck mass, eV
RHO_L = 2.56e-11          # rho_Lambda, eV^4  ((2.25 meV)^4)
HBARC = 1.973269804e-7    # eV m


def kinv_m(lam, V0=RHO_L):
    k = lam * np.sqrt(V0) / MPL          # eV
    return HBARC / k


def solve_liouville(g, tol=1e-10, maxit=60):
    Lap = g.laplacian()
    N = g.Nr * g.Nz; fi = np.where(~g.fixed.ravel())[0]
    Lff = Lap[fi][:, fi].tocsc()
    psi = np.zeros(N)
    for it in range(maxit):
        pf = psi[fi]; e = np.exp(-pf)
        F = Lff @ pf + e; res = np.max(np.abs(F))
        if res < tol:
            break
        J = Lff - sp.diags(e)
        d = spla.spsolve(J.tocsc(), -F)
        # damped step to keep exp(-psi) sane
        s = 1.0
        while s > 1e-3:
            pn = pf + s * d
            if np.max(np.abs(np.exp(-pn) + Lff @ pn)) < res or s < 0.01:
                break
            s *= 0.5
        psi[fi] = pn
    return psi.reshape(g.Nr, g.Nz), res


def force_z_liouville(g, psi, rho_s, z_lo, z_hi):
    h = g.h
    pr = np.gradient(psi, h, axis=0); pz = np.gradient(psi, h, axis=1)
    V = np.exp(-psi)
    Tzz = 0.5 * (pz**2 - pr**2) - V
    Tzr = pz * pr
    i_s = int(round(rho_s / h)); j_lo = int(round((z_lo - g.z[0]) / h)); j_hi = int(round((z_hi - g.z[0]) / h))
    rr = g.r[: i_s + 1]
    top = np.trapezoid(Tzz[: i_s + 1, j_hi] * 2 * np.pi * rr, rr)
    bot = np.trapezoid(Tzz[: i_s + 1, j_lo] * 2 * np.pi * rr, rr)
    zz = g.z[j_lo: j_hi + 1]
    side = np.trapezoid(Tzr[i_s, j_lo: j_hi + 1] * 2 * np.pi * g.r[i_s], zz)
    return -(top - bot + side)


def signal(kinv_cm, Dc_m=1.0, a1_cm=3.0, a2_cm=6.0, d_cm=14.0, ncell=8):
    """S~ = F(source) - F(no source) on the test sphere, units (M_Pl/lambda)^2; lengths scaled by k."""
    a1, a2, D, R = a1_cm / kinv_cm, a2_cm / kinv_cm, d_cm / kinv_cm, 50 * Dc_m / kinv_cm
    h0 = a1 / ncell
    n = max(int(round(R / h0)), 20); h = R / n
    out = []
    for src in (True, False):
        g = GridSW(R, R, h); g.sphere(0.0, a1)
        if src:
            g.sphere(-D, a2)
        psi, res = solve_liouville(g)
        mg = max(0.08 * a1 / 0.3, 3 * h); mg = min(mg, 0.5 * (D - a1 - a2))
        F = -force_z_liouville(g, psi, a1 + mg, -a1 - mg, a1 + mg)
        out.append((F, psi.max(), res))
    (Fs, pm, r1), (Fn, _, r2) = out
    return Fs - Fn, Fs, Fn, pm, h, max(r1, r2)


if __name__ == '__main__':
    res = {}
    print('V0 = rho_Lambda; 1/k = %.2f cm x (1e27/lambda)' % (kinv_m(1e27) * 100))
    print('\n=== benchmark bodies (3 cm / 6 cm Cu, 14 cm apart) in a 1 m chamber: signal vs lambda ===')
    for lam in [2e26, 5e26, 1e27, 2e27, 4e27, 8e27]:
        kinv = kinv_m(lam) * 100
        t0 = time.time()
        S, Fs, Fn, pm, h, r = signal(kinv)
        pref = (MPL / lam) ** 2                     # eV^2
        F_N = pref * S * EV2_N
        res['lam=%g' % lam] = dict(lam=lam, kinv_cm=kinv, S=S, Fs=Fs, Fn=Fn, psi_max=pm, h=h, F_newton=F_N)
        print('lambda=%.0e  1/k=%6.2f cm  (M_Pl/lambda)^2=%.3g eV^2  psi_max=%.3f  S~=%.4f (F_src=%.4f F_nosrc=%+.4f)  '
              'F=%.2e N  [h=%.3f res=%.0e %.0fs]' % (lam, kinv, pref, pm, S, Fs, Fn, F_N, h, r, time.time() - t0))
        sys.stdout.flush()
    print('\n=== chamber-size dependence at lambda = 1e27 (1/k = 9.5 cm) ===')
    for Dc in [0.12, 0.25, 0.5, 1.0, 2.0]:
        t0 = time.time()
        S, Fs, Fn, pm, h, r = signal(kinv_m(1e27) * 100, Dc_m=Dc, ncell=8 if Dc >= 0.5 else 12)
        pref = (MPL / 1e27) ** 2
        res['Dc=%g' % Dc] = dict(Dc=Dc, S=S, psi_max=pm, F_newton=pref * S * EV2_N)
        print('D_chamber=%.2f m  psi_max=%.3f  S~=%.4f  F=%.2e N  [%.0fs]' % (Dc, pm, S, pref * S * EV2_N, time.time() - t0))
        sys.stdout.flush()
    # screening / air conditions
    print('\n=== screening and air, A2 dependence (lambda-independent) ===')
    rho_cu = 8.96 * 4.3101e18; rho_air = 1.2e-3 * 4.3101e18
    for A2 in [1e26, 1e27, 1e28, 1e29, 1e30, 1e31]:
        m_cu = np.sqrt(rho_cu * A2) / MPL; m_air = np.sqrt(rho_air * A2) / MPL
        k = 1e27 * np.sqrt(RHO_L) / MPL
        print('A2=%.0e  M_eff=M_Pl/sqrt(A2)=%.2e eV  1/m_rho(Cu)=%.3g mm  1/m_air=%.3g cm  psi_air~k^2/m_air^2=%.2e (lambda=1e27)' % (
            A2, MPL / np.sqrt(A2), HBARC / m_cu * 1e3, HBARC / m_air * 1e2, k**2 / m_air**2))
    json.dump(res, open((_GI + '/models/dilaton_reach.json'), 'w'), indent=1)
