"""Fast version of monopole_thermal: precompute S-wave wavefunctions on an energy grid and
the matrix I_W(E_i,E_f); returns thermal ratios Q_M/Q_Q for nn and np (non-degenerate)."""
import numpy as np
from scipy.interpolate import RegularGridInterpolator
from monopole_exact import solve, POTS, U_FAC
from nn_xsec import dsigma, MN, smatrix, kcm
m = MN
EG = np.concatenate([np.linspace(0.5, 20, 25), np.linspace(21, 450, 90)])

def fM_table(Vname):
    V = POTS[Vname]
    sols = [solve(V, E) for E in EG]
    r = sols[0][0]; U = U_FAC * V(r); W = 2 * U + r * np.gradient(U, r)
    n = len(EG); F = np.zeros((n, n), complex)
    for i, (_, ui, di, ki) in enumerate(sols):
        for j, (_, uf, df, kf) in enumerate(sols):
            I = np.trapezoid(uf * W * ui, r)
            F[i, j] = -np.exp(1j * (di + df)) * I / (ki * kf)
    return RegularGridInterpolator((EG, EG), np.abs(F) ** 2, bounds_error=False, fill_value=None)

def partial_sigma_S(chan, Tlab):
    Sm = smatrix(chan, Tlab); k = kcm(Tlab)
    s = abs((Sm[(0, 0)][(0, 0)] - 1) / (2j * k)) ** 2 * 4 * np.pi / 4
    if chan == 'np':
        s += abs((Sm[(1, 1)][(0, 0)] - 1) / (2j * k)) ** 2 * 4 * np.pi * 3 / 4
    return (4.0 if chan == 'nn' else 1.0) * s * 10

def run(T, chan, t1, t3, c0hi=1.2, nE=60, nw=30, Emax_cut=None):
    x, wx = np.polynomial.legendre.leggauss(48)
    Es = np.linspace(2, min(12 * T + 60, 440), nE)
    XQ = np.zeros(nE); XM = np.zeros(nE); XMhi = np.zeros(nE)
    for i, E in enumerate(Es):
        p = np.sqrt(m * E)
        ds = dsigma(chan, 2 * E, np.arccos(x)); sig_tot = 2 * np.pi * np.sum(wx * ds)
        sigS = partial_sigma_S(chan, 2 * E)
        for w in (np.arange(nw) + 0.5) / nw * E:
            pf = np.sqrt(max(p * p - m * w, 0))
            TrA = pf ** 2 - p ** 2; AA = pf ** 4 + p ** 4 - 2 * (p * pf * x) ** 2
            GQ = (TrA ** 2 + 2 * AA) * w / (1680 * np.pi ** 4 * m ** 2)
            XQ[i] += E / nw * w * (pf / p) * 2 * np.pi * np.sum(wx * ds * GQ)
            GM = w ** 3 / (192 * np.pi ** 4)
            sM = t1((E, max(E - w, 0.5))) * 4 * np.pi / 4
            if chan == 'np': sM += t3((E, max(E - w, 0.5))) * 4 * np.pi * 3 / 4
            sM *= (4.0 if chan == 'nn' else 1.0) * 10
            XM[i] += E / nw * w * (pf / p) * sM * GM
            XMhi[i] += E / nw * w * (pf / p) * c0hi ** 2 * max(sig_tot - sigS, 0) * GM
    wt = Es * np.exp(-Es / T)
    if Emax_cut: wt = wt * (Es <= Emax_cut)
    return [np.trapezoid(wt * X, Es) for X in (XQ, XM, XMhi)]

if __name__ == '__main__':
    tabs = {k: fM_table(k) for k in POTS}
    print('tables done', flush=True)
    for T in (20.0, 30.0, 40.0):
        for chan in ('nn', 'np'):
            for V1 in ('Reid68-1S0', 'MT3-1S0'):
                QQ, QM, QMhi = run(T, chan, tabs[V1], tabs['MT3-3S1'])
                print(f"T={T} {chan} [{V1} + MT3-3S1]: Q_M(S exact)/Q_Q={QM/QQ:.2f}  Q_M(L>=1,c0=1.2)/Q_Q={QMhi/QQ:.2f}"
                      f"  (Q+M)/Q={(QQ+QM+QMhi)/QQ:.2f}", flush=True)
        # sensitivity: cut collisions with E_cm > 175 MeV (beyond PWA93 range)
        QQ, QM, QMhi = run(T, 'np', tabs['Reid68-1S0'], tabs['MT3-3S1'], Emax_cut=175)
        print(f"   T={T} np, E_cm<=175 MeV only: (Q+M)/Q={(QQ+QM+QMhi)/QQ:.2f}", flush=True)
