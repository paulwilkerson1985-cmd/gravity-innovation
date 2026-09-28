"""
Nucleon degeneracy (Fermi-Dirac initial states + Pauli blocking of final states) correction to the
NN -> NN phi phi rate of sn_rate.py.  Monte Carlo: sample p1,p2 from Maxwell-Boltzmann (same density),
reweight to Fermi-Dirac, apply (1-f3)(1-f4) averaged over final directions (isotropic), with the
pair recoil neglected.  Returns R = Q_FD / Q_MB separately for traceless and trace parts.
"""
import numpy as np
from sn_rate import _tab, MU, MN, HBARC, GCC_PER_FM3
from pion import fermi_mu


def G_parts(system, k, w):
    kp2 = k ** 2 - 2 * MU * w
    kp = np.sqrt(np.maximum(kp2, 0)); vp = kp / MU
    kbar = np.sqrt(0.5 * (k ** 2 + kp2))
    s0 = _tab(system, 's0', kbar); sc2 = _tab(system, 'sc2', kbar); st = _tab(system, 'str', kbar)
    Sig2 = (s0 * (k ** 4 + kp2 ** 2 - (4. / 3) * (MU * w) ** 2) - 2 * k ** 2 * kp2 * sc2) / (MU * w) ** 2
    return w ** 4 * vp * (2. / 105) * Sig2, w ** 4 * vp * (68. / 315) * st


def eta_MB(n, T):
    lam3 = (2 * np.pi / (MN * T)) ** 1.5 * HBARC ** 3   # fm^3
    return np.log(n * lam3 / 2)


def R_deg(system, T, na, nb, N=20000, nw=24, nang=12, seed=0):
    rng = np.random.default_rng(seed)
    mua, mub = fermi_mu(na, T), fermi_mu(nb, T)
    ea, eb = eta_MB(na, T), eta_MB(nb, T)
    p1 = rng.normal(size=(N, 3)) * np.sqrt(MN * T)
    p2 = rng.normal(size=(N, 3)) * np.sqrt(MN * T)
    E1 = (p1 ** 2).sum(1) / (2 * MN); E2 = (p2 ** 2).sum(1) / (2 * MN)
    fFD = lambda E, mu: 1 / (np.exp((E - mu) / T) + 1)
    w1 = fFD(E1, mua) / np.exp(ea - E1 / T)
    w2 = fFD(E2, mub) / np.exp(eb - E2 / T)
    P = p1 + p2; kv = 0.5 * (p1 - p2); k = np.linalg.norm(kv, axis=1)
    E = k ** 2 / (2 * MU)
    xg, wg = np.polynomial.legendre.leggauss(nw)
    # final directions (fixed isotropic set)
    nh = rng.normal(size=(nang, 3)); nh /= np.linalg.norm(nh, axis=1)[:, None]
    I = np.zeros((2, 2))  # [MB/FD][traceless/trace]
    for i in range(N):
        w = 0.5 * E[i] * (xg + 1); ww = 0.5 * E[i] * wg
        gt, gb = G_parts(system, k[i], w)
        kp = np.sqrt(np.maximum(k[i] ** 2 - 2 * MU * w, 0))
        # blocking averaged over directions
        p3 = 0.5 * P[i][None, None, :] + kp[:, None, None] * nh[None, :, :]
        p4 = 0.5 * P[i][None, None, :] - kp[:, None, None] * nh[None, :, :]
        E3 = (p3 ** 2).sum(-1) / (2 * MN); E4 = (p4 ** 2).sum(-1) / (2 * MN)
        B = ((1 - fFD(E3, mua)) * (1 - fFD(E4, mub))).mean(1)
        I[0] += [np.sum(ww * gt), np.sum(ww * gb)]
        I[1] += [np.sum(ww * gt * B) * w1[i] * w2[i], np.sum(ww * gb * B) * w1[i] * w2[i]]
    return I[1] / I[0], (mua / T, mub / T)


if __name__ == '__main__':
    for T, rho, Yp in [(30, 3e14, 0.3), (30, 1e14, 0.3), (40, 1.3e14, 0.25), (20, 3e14, 0.3), (40, 3e14, 0.3)]:
        nB = rho / GCC_PER_FM3
        nn_, np_ = nB * (1 - Yp), nB * Yp
        out = []
        for sysl, a, b in (('nn', nn_, nn_), ('np', nn_, np_), ('nn', np_, np_)):
            R, eta = R_deg(sysl, T, a, b, N=4000)
            out.append((R, eta))
        print(f"T={T} rho={rho:.1e} Yp={Yp}: eta_n={out[0][1][0]:.2f} eta_p={out[2][1][0]:.2f} | "
              f"R_deg(traceless,trace): nn {out[0][0][0]:.2f},{out[0][0][1]:.2f}  np {out[1][0][0]:.2f},{out[1][0][1]:.2f}"
              f"  pp {out[2][0][0]:.2f},{out[2][0][1]:.2f}")
