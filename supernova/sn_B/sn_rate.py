"""
Route B: stress-tensor / linear-response evaluation of phi-PAIR emission from NN collisions
for L_int = -(phi^2 / 2 M^2) O,  O = T^mu_mu (mostly-minus; = m_N NbarN + ... for nucleons).

Exact identity from energy-momentum conservation (q = (w, kvec), kappa = |k|/w):
    O(q) = (k_i k_j / w^2 - delta_ij) T^ij(q)  ==  P_ij T^ij
so pair emission is controlled by the STRESS spectral function (shear + bulk parts) of the medium.

Pair emissivity (derived in NOTES.md):
    Q = 1/(64 pi^4 M^4) * int dw w^4 int_0^1 kappa^2 dkappa < S_O(w, kappa) >_{khat}
    <|P:X|^2>_khat = kappa^4 (2/15) X^T:X^T + (1 - kappa^2/3)^2 |X_ii|^2
    int kappa^6 = 1/7 ;  int kappa^2 (1-kappa^2/3)^2 = 68/315
Traceless part  : leading soft pole  X^T = T_NN (k'k' - kk)^T/(mu w)   (== HPRS KK-dilaton LO)
Trace part      : X_ii = (1 + k d/dk) T_NN  (Hellmann-Feynman + dimensional analysis; exact at w->0)
                  -> integrated over final directions: sigma_tr = sum (2J+1)(d delta/dk)^2 (time-delay x-section)
Nucleons: Maxwell-Boltzmann, vacuum phase shifts (nn_phase.py).
"""
import numpy as np
from nn_phase import sigma_el, sigma_tr, angular_moments, kmax_valid

HBARC = 197.327          # MeV fm
MN = 938.92              # MeV
MU = MN / 2
MeV5_to_cgs = 1.602177e-6 * (1 / (HBARC * 1e-13)) ** 3 / 6.582120e-22  # erg cm^-3 s^-1 per MeV^5
GCC_PER_FM3 = MN * 1.602177e-6 / (2.99792458e10) ** 2 * 1e39  # g/cm^3 for n=1 fm^-3 (rest mass only)

# ---- precompute cross-section tables on a k grid (k in MeV) ----
_kf = np.linspace(0.05, kmax_valid(), 70)       # fm^-1
TAB = {}
for s in ('nn', 'np'):
    s0 = np.zeros_like(_kf); sc2 = np.zeros_like(_kf)
    for i, k in enumerate(_kf):
        s0[i], sc2[i] = angular_moments(k, s, n=120)
    TAB[s] = dict(s0=s0 / HBARC ** 2, sc2=sc2 / HBARC ** 2,                 # MeV^-2
                  str=sigma_tr(_kf, s) / HBARC ** 2)
_kM = _kf * HBARC


def _tab(s, key, kMeV):
    return np.interp(kMeV, _kM, TAB[s][key])   # constant extrapolation beyond table (k>~2.9 fm^-1)


def S_integrand(system, T, trace_scale=1.0, sigma_scale=1.0, nk=160, nw=64):
    """returns (A_traceless, A_trace) = int d^3k P(k) int_0^E dw w^4 v' [ ... ]  per unit pair density, MeV^?"""
    kmax = np.sqrt(2 * MU * T * 40)
    ks = np.linspace(1e-3, kmax, nk)
    dk = ks[1] - ks[0]
    Pk = 4 * np.pi * ks ** 2 * (2 * np.pi * MU * T) ** -1.5 * np.exp(-ks ** 2 / (2 * MU * T))
    At = 0.0; Ab = 0.0
    xg, wg = np.polynomial.legendre.leggauss(nw)
    for k, P in zip(ks, Pk):
        E = k ** 2 / (2 * MU)
        w = 0.5 * E * (xg + 1); ww = 0.5 * E * wg
        kp2 = k ** 2 - 2 * MU * w
        kp = np.sqrt(np.maximum(kp2, 0))
        vp = kp / MU
        kbar = np.sqrt(0.5 * (k ** 2 + kp2))
        s0 = _tab(system, 's0', kbar) * sigma_scale
        sc2 = _tab(system, 'sc2', kbar) * sigma_scale
        st = _tab(system, 'str', kbar) * sigma_scale
        Sig2 = (s0 * (k ** 4 + kp2 ** 2 - (4. / 3) * (MU * w) ** 2) - 2 * k ** 2 * kp2 * sc2) / (MU * w) ** 2
        At += P * dk * np.sum(ww * w ** 4 * vp * (2. / 105) * Sig2)
        Ab += P * dk * np.sum(ww * w ** 4 * vp * (68. / 315) * st * trace_scale)
    return At, Ab


def Q_pair(T, nB, Yp, M, **kw):
    """pair emissivity [MeV^5] for T [MeV], nB [fm^-3], M [MeV]; returns dict of channel contributions"""
    nn_ = nB * (1 - Yp) * HBARC ** 3; np_ = nB * Yp * HBARC ** 3   # MeV^3
    pref = 1 / (64 * np.pi ** 4 * M ** 4)
    out = {}
    for lab, sys_, w in (('nn', 'nn', nn_ ** 2 / 2), ('pp', 'nn', np_ ** 2 / 2), ('np', 'np', nn_ * np_)):
        At, Ab = S_integrand(sys_, T, **kw)
        out[lab] = (pref * w * At, pref * w * Ab)
    out['traceless'] = sum(out[x][0] for x in ('nn', 'pp', 'np'))
    out['trace'] = sum(out[x][1] for x in ('nn', 'pp', 'np'))
    out['total'] = out['traceless'] + out['trace']
    return out


def Q_OP(T, rho_gcc, M, sigma_mb=25.0):
    nN = rho_gcc / GCC_PER_FM3 * HBARC ** 3
    sig = sigma_mb * 0.1 / HBARC ** 2
    return sig * nN ** 2 * T ** 3.5 * MN ** 1.5 / (12 * np.pi ** 4 * M ** 4)


def Mmin_raffelt(Qfun_at_1TeV, rho_gcc, eps_max=1e19):
    """Q scales as M^-4: M_min = 1 TeV * (Q(1TeV)/Qmax)^(1/4)"""
    Qmax = eps_max * rho_gcc / MeV5_to_cgs
    return 1.0 * (Qfun_at_1TeV / Qmax) ** 0.25   # TeV


if __name__ == '__main__':
    M1 = 1e6  # 1 TeV in MeV
    print(f"1 MeV^5 = {MeV5_to_cgs:.3e} erg/cm3/s ; n=1 fm^-3 -> {GCC_PER_FM3:.3e} g/cc")
    rho = 3e14; nB = rho / GCC_PER_FM3
    print(f"OP check: rho=3e14, T=30: M_min(OP formula) = {Mmin_raffelt(Q_OP(30, rho, M1), rho):.1f} TeV")
    print()
    print(" T   rho     Yp | Q_tl/Q_OP  Q_tr/Q_OP  tot/Q_OP |  (T/m)^2  ratio/(T/m)^2 | M_min[TeV]: OP  traceless-only  total")
    for T in (20, 30, 40):
        for rho in (1e14, 3e14):
            nB = rho / GCC_PER_FM3
            Yp = 0.3
            q = Q_pair(T, nB, Yp, M1)
            qop = Q_OP(T, rho, M1)
            r_tl = q['traceless'] / qop; r_tr = q['trace'] / qop; r = q['total'] / qop
            tm2 = (T / MN) ** 2
            print(f"{T:3.0f} {rho:.0e} {Yp:.1f} | {r_tl:9.2e} {r_tr:9.2e} {r:9.2e} | {tm2:.2e}  {r/tm2:6.2f}      |"
                  f"  {Mmin_raffelt(qop, rho):5.1f}   {Mmin_raffelt(q['traceless'], rho):5.2f}   {Mmin_raffelt(q['total'], rho):5.2f}")
    # channel breakdown at the reference point
    T = 30; rho = 3e14; nB = rho / GCC_PER_FM3
    q = Q_pair(T, nB, 0.3, M1)
    print("\nReference T=30, rho=3e14, Yp=0.3 channel breakdown (traceless, trace) [fraction of total]:")
    for lab in ('nn', 'pp', 'np'):
        print(f"  {lab}: {q[lab][0]/q['total']:.3f}  {q[lab][1]/q['total']:.3f}")
    print(f"  epsilon at M=1 TeV: {q['total']*MeV5_to_cgs/rho:.3e} erg/g/s")
