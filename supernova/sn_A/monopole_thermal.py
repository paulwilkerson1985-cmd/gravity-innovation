"""
Thermal comparison (non-degenerate) of
  Q_Q : leading soft (quadrupole) SRA emissivity with PWA93 data (all partial waves), and
  Q_M : exact NR monopole (K->0) emissivity from S waves, <f|2V+rV'|i> with Reid68 (1S0) and
        Malfliet-Tjon III (1S0, 3S1) potentials; higher partial waves estimated as |c0|^2 sigma_{L>=1}
        with c0 = -(1 + q d ln V/dq) ~ -1.2 (OPE Born).
All in units where the common prefactor n1 n2 c_ch g_s^2/M^4 ... cancels in the ratio.
"""
import numpy as np
from monopole_exact import solve, POTS, U_FAC
from nn_xsec import dsigma, HBARC, MN, smatrix, kcm

m = MN
def fM_S(Vname, Ei, Ef):
    V = POTS[Vname]
    r, ui, di, ki = solve(V, Ei)
    _, uf, df, kf = solve(V, Ef)
    U = U_FAC * V(r); W = 2 * U + r * np.gradient(U, r)
    I = np.trapezoid(uf * W * ui, r)
    return -np.exp(1j * (di + df)) * I / (ki * kf)  # fm

def f_S(Vname, E):
    _, _, d, k = solve(POTS[Vname], E)
    return np.exp(1j * d) * np.sin(d) / k

def partial_sigma_S(chan, Tlab):
    """S-wave part of spin-averaged 4pi-integrated elastic sigma from PWA93 (mb), same
    normalization conventions as dsigma (nn: x4 amplitude^2, integrate 4pi, then c=1/4 applied later)."""
    Sm = smatrix(chan, Tlab); k = kcm(Tlab)
    s1 = abs((Sm[(0, 0)][(0, 0)] - 1) / (2j * k)) ** 2 * 4 * np.pi * (1 / 4)
    s3 = 0.0
    if chan == 'np':
        s3 = abs((Sm[(1, 1)][(0, 0)] - 1) / (2j * k)) ** 2 * 4 * np.pi * (3 / 4)
    fac = 4.0 if chan == 'nn' else 1.0
    return fac * (s1 + s3) * 10

def run(T=30.0, chan='np', V1='Reid68-1S0', V3='MT3-3S1', c0hi=1.2, nE=40, nw=24):
    x, wx = np.polynomial.legendre.leggauss(64)
    Es = np.linspace(2, 12 * T + 60, nE)
    XQ = np.zeros(nE); XM = np.zeros(nE); XMhi = np.zeros(nE); XQ_S = np.zeros(nE)
    for i, E in enumerate(Es):
        p = np.sqrt(m * E)
        ds = dsigma(chan, 2 * E, np.arccos(x))            # mb/sr (identical-doubled for nn)
        sig_tot = 2 * np.pi * np.sum(wx * ds)             # full 4pi
        sigS = partial_sigma_S(chan, 2 * E)
        ws = (np.arange(nw) + 0.5) / nw * E
        for w in ws:
            pf = np.sqrt(max(p * p - m * w, 0))
            TrA = pf ** 2 - p ** 2
            AA = pf ** 4 + p ** 4 - 2 * (p * pf * x) ** 2
            GQ = (TrA ** 2 + 2 * AA) * w / (1680 * np.pi ** 4 * m ** 2)
            XQ[i] += E / nw * w * (pf / p) * 2 * np.pi * np.sum(wx * ds * GQ)
            GM = w ** 3 / (192 * np.pi ** 4)
            # exact S-wave monopole 'cross section' (mb), spin-weighted
            fm1 = fM_S(V1, E, E - w)
            sM = abs(fm1) ** 2 * 4 * np.pi * (1 / 4)
            if chan == 'np':
                sM += abs(fM_S(V3, E, E - w)) ** 2 * 4 * np.pi * (3 / 4)
            sM *= (4.0 if chan == 'nn' else 1.0) * 10
            XM[i] += E / nw * w * (pf / p) * sM * GM
            XMhi[i] += E / nw * w * (pf / p) * c0hi ** 2 * max(sig_tot - sigS, 0) * GM
    wt = Es * np.exp(-Es / T)
    QQ, QM, QMhi = (np.trapezoid(wt * X, Es) for X in (XQ, XM, XMhi))
    return QQ, QM, QMhi

if __name__ == '__main__':
    for T in (30.0,):
        for chan in ('nn', 'np'):
            for V1 in ('Reid68-1S0', 'MT3-1S0'):
                QQ, QM, QMhi = run(T, chan, V1=V1)
                print(f"T={T} {chan} [{V1}]: Q_M(S-wave exact)/Q_Q = {QM/QQ:.2f} ; "
                      f"Q_M(L>=1, c0=1.2)/Q_Q = {QMhi/QQ:.2f} ; total (Q+M)/Q = {(QQ+QM+QMhi)/QQ:.2f}", flush=True)
