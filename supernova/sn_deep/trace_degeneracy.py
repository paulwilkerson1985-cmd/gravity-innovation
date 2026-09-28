import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Degeneracy (Fermi-Dirac initial states + Pauli blocking) correction R = Q_FD/Q_MB for the finite-omega
trace channel (realistic potential tables), mirroring sn_B/degeneracy.py (isotropic final directions, pair
recoil neglected) but vectorised, with a hotter importance-sampling proposal (T_prop = 1.6 T) so that the
E^5.5-weighted tail is sampled; N ~ 4e4 events -> MC error ~1-2%.
Returns R for [traceless (sn_B tables), trace omega->0 (sn_B tables), trace finite-omega (potential)]."""
import numpy as np, sys
sys.path.insert(0, (_GI + '/supernova/sn_B'))
from degeneracy import G_parts, eta_MB, fermi_mu, MU, MN, HBARC, GCC_PER_FM3
from trace_thermal import TraceTable


def R_deg(tab, system, T, na, nb, N=40000, nkf=24, nang=10, seed=0, Tprop_fac=1.6, chunk=2000):
    rng = np.random.default_rng(seed)
    mua, mub = fermi_mu(na, T), fermi_mu(nb, T)
    ea, eb = eta_MB(na, T), eta_MB(nb, T)
    Tp = Tprop_fac * T
    fFD = lambda E, mu: 1 / (np.exp(np.clip((E - mu) / T, -700, 700)) + 1)
    fMB = lambda E, e: np.exp(e - E / T)
    xg, wg = np.polynomial.legendre.leggauss(nkf)
    nh = rng.normal(size=(nang, 3)); nh /= np.linalg.norm(nh, axis=1)[:, None]
    num = np.zeros(3); den = np.zeros(3)
    for c0 in range(0, N, chunk):
        n = min(chunk, N - c0)
        p1 = rng.normal(size=(n, 3)) * np.sqrt(MN * Tp); p2 = rng.normal(size=(n, 3)) * np.sqrt(MN * Tp)
        E1 = (p1 ** 2).sum(1) / (2 * MN); E2 = (p2 ** 2).sum(1) / (2 * MN)
        # importance weights: target MB(T) / proposal MB(Tp)  (densities normalised to same n cancel in ratio)
        prop = (T / Tp) ** 1.5 * np.exp(-(E1 + E2) / T + (E1 + E2) / Tp)      # MB(T)/MB(Tp) per pair (x const)
        wFD = fFD(E1, mua) * fFD(E2, mub) / (fMB(E1, ea) * fMB(E2, eb))
        P = p1 + p2; kv = 0.5 * (p1 - p2); k = np.linalg.norm(kv, axis=1)
        kf = 0.5 * k[:, None] * (xg + 1)[None]; wkf = 0.5 * k[:, None] * wg[None]       # (n, nkf)
        w = (k[:, None] ** 2 - kf ** 2) / (2 * MU); Ef = kf ** 2 / (2 * MU); E = k ** 2 / (2 * MU)
        jac = kf / MU
        gt = np.zeros_like(kf); gb = np.zeros_like(kf)
        for j in range(n):
            gt[j], gb[j] = G_parts(system, k[j], w[j])
        st = tab.sigma_tr(system, Ef.ravel(), np.repeat(E, nkf)).reshape(kf.shape) / HBARC ** 2
        gfin = w ** 4 * (kf / MU) * st * (68. / 315)
        p3 = 0.5 * P[:, None, None, :] + kf[:, :, None, None] * nh[None, None, :, :]
        p4 = 0.5 * P[:, None, None, :] - kf[:, :, None, None] * nh[None, None, :, :]
        E3 = (p3 ** 2).sum(-1) / (2 * MN); E4 = (p4 ** 2).sum(-1) / (2 * MN)
        Bl = ((1 - fFD(E3, mua)) * (1 - fFD(E4, mub))).mean(-1)                      # (n, nkf)
        ints = np.stack([np.sum(wkf * jac * gt, 1), np.sum(wkf * jac * gb, 1), np.sum(wkf * gfin, 1)], 1)
        intsB = np.stack([np.sum(wkf * jac * gt * Bl, 1), np.sum(wkf * jac * gb * Bl, 1), np.sum(wkf * gfin * Bl, 1)], 1)
        den += (ints * prop[:, None]).sum(0)
        num += (intsB * (prop * wFD)[:, None]).sum(0)
    return num / den, (mua / T, mub / T)


if __name__ == '__main__':
    tab = TraceTable('AV18')
    print('R = Q_FD/Q_MB  [traceless, trace(B soft), trace(AV18 finite-omega)]   (N=4e4, importance sampled)')
    for T, rho, Yp in [(30, 3e14, 0.3), (20, 3e14, 0.3), (40, 3e14, 0.3), (30, 1e14, 0.3), (40, 1.5e14, 0.15), (30, 2e14, 0.12)]:
        nB = rho / GCC_PER_FM3; nn_, np_ = nB * (1 - Yp), nB * Yp
        res = {}
        for lab, a, b, s in (('nn', nn_, nn_, 'nn'), ('np', nn_, np_, 'np'), ('pp', np_, np_, 'nn')):
            R, eta = R_deg(tab, s, T, a, b)
            res[lab] = (R, eta)
        print(f"T={T} rho={rho:.1e} Yp={Yp}: eta_n={res['nn'][1][0]:.2f} eta_p={res['pp'][1][0]:.2f} | " +
              ' '.join(f"{lab}: {R[0]:.2f},{R[1]:.2f},{R[2]:.2f}" for lab, (R, _) in res.items()), flush=True)
