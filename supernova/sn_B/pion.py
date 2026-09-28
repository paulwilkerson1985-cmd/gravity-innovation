"""
Pion-induced pair emission  pi^- p -> n (phi phi)  with the SAME Einstein-frame Feynman rules
validated in check_feynman.py (NN->NN phi phi reproduces the exact-identity Born result).

Diagrams: s-channel N pole (D1), u-channel N pole (D2), pion-line emission (D3), contact (D4).
Rate:  Q_pi = n_pi- n_p < (1/(4 E_pi E_p)) (1/2) Int dPhi_3 |M|^2 omega > (x Pauli blocking of n)
dPhi_3 = ds/(2 pi) * (1/(8 pi)) * |p*| dOmega*/(16 pi^2 sqrt(S))       (massless pair, invariant mass^2 s)
"""
import numpy as np
from check_feynman import slash, dot, g0, g5, u as spinor, m as MN
import check_feynman as cf

HBARC = 197.327
gA = 1.27; fpi = 92.4; mpi = 139.57
G = gA * np.sqrt(2) / (2 * fpi)          # MeV^-1, charged-pion vertex (tau_- -> sqrt 2)
cf.G = G; cf.mpi = mpi


def Gam(x):
    return -G * slash(x) @ g5


def Sprop(P):
    return (slash(P) + MN * np.eye(4)) / (dot(P, P) - MN * MN)


def amp2(l, p1, p2, q, parts=False):
    """spin-summed/averaged |M|^2 (M in units of 1/M^2 -> multiply by M^-4) for pi(l) p(p1) -> n(p2) pair(q)"""
    s = dot(q, q)
    D1 = MN * Sprop(p1 + l) @ Gam(l)
    D2 = MN * Gam(l) @ Sprop(p1 - q)
    lq = l - q
    D3 = Gam(lq) * (2 * mpi ** 2 + s) / (dot(lq, lq) - mpi ** 2)
    D4 = Gam(q) - Gam(l)
    tot = 0.0
    comp = np.zeros(4)
    for s1 in (0, 1):
        u1 = spinor(p1[1:], s1)
        for s2 in (0, 1):
            b2 = spinor(p2[1:], s2).conj() @ g0
            terms = [b2 @ D @ u1 for D in (D1, D2, D3, D4)]
            tot += abs(sum(terms)) ** 2
            if parts:
                comp += np.array([abs(t) ** 2 for t in terms])
    if parts:
        return 0.5 * tot, 0.5 * comp
    return 0.5 * tot


def boost(p, beta):
    b2 = beta @ beta
    if b2 < 1e-30:
        return p.copy()
    g = 1 / np.sqrt(1 - b2)
    bp = beta @ p[1:]
    E = g * (p[0] + bp)
    pv = p[1:] + ((g - 1) * bp / b2 + g * p[0]) * beta
    return np.concatenate([[E], pv])


def fermi_mu(n_fm3, T):
    """non-rel FD chemical potential (kinetic) for density n (2 spin states)"""
    from scipy.optimize import brentq
    from scipy.integrate import quad

    def dens(mu):
        f = lambda p: p * p / (np.exp(min((p * p / (2 * MN) - mu) / T, 700)) + 1)
        return quad(f, 0, np.sqrt(2 * MN * (max(mu, 0) + 40 * T)))[0] / np.pi ** 2 / HBARC ** 3
    return brentq(lambda mu: dens(mu) - n_fm3, -40 * T, 400)



_CDF = {}
def _cdf(T):
    if T not in _CDF:
        lg = np.linspace(0, 40 * T, 4000)
        pdf = lg ** 2 * np.exp(-(np.sqrt(lg ** 2 + mpi ** 2) - mpi) / T)
        c = np.cumsum(pdf); c /= c[-1]
        _CDF[T] = (lg, c)
    return _CDF[T]

def pion_rate(T, n_p, n_n=None, Npts=4000, seed=0, blocking=True):
    """returns <(1/(4 E_pi E_p)) (1/2) int dPhi3 |M|^2 omega>  [MeV^-? per (n_pi n_p)], and diagnostics"""
    rng = np.random.default_rng(seed)
    mun = fermi_mu(n_n, T) if (blocking and n_n) else None
    acc = []; wts = []
    omegas = []
    for i in range(Npts):
        # pion momentum ~ l^2 exp(-(E-mpi)/T): inverse-CDF on a grid (fixed; earlier rejection sampler was biased)
        lm = np.interp(rng.random(), _cdf(T)[1], _cdf(T)[0])
        Epi = np.sqrt(lm ** 2 + mpi ** 2)
        lv = rng.normal(size=3); lv *= lm / np.linalg.norm(lv)
        l = np.concatenate([[Epi], lv])
        p1v = rng.normal(size=3) * np.sqrt(MN * T)
        p1 = np.concatenate([[np.sqrt(MN ** 2 + p1v @ p1v)], p1v])
        Ptot = l + p1
        S = dot(Ptot, Ptot); rS = np.sqrt(S)
        beta = Ptot[1:] / Ptot[0]
        smax = (rS - MN) ** 2
        s = rng.random() * smax
        pst = np.sqrt((S - (MN + np.sqrt(s)) ** 2) * (S - (MN - np.sqrt(s)) ** 2)) / (2 * rS)
        nh = rng.normal(size=3); nh /= np.linalg.norm(nh)
        p2c = np.concatenate([[np.sqrt(MN ** 2 + pst ** 2)], pst * nh])
        p2 = boost(p2c, beta)
        q = Ptot - p2
        A2 = amp2(l, p1, p2, q)
        omega = q[0]
        block = 1.0
        if mun is not None:
            Ek = p2[0] - MN
            block = 1 - 1 / (np.exp((Ek - mun) / T) + 1)
        phase = smax / (2 * np.pi) / (8 * np.pi) * 4 * np.pi * pst / (16 * np.pi ** 2 * rS)
        val = A2 / (4 * l[0] * p1[0]) * 0.5 * phase * omega * block
        acc.append(val); omegas.append(omega)
    acc = np.array(acc)
    return acc.mean(), acc.std() / np.sqrt(len(acc)), np.mean(omegas)


if __name__ == '__main__':
    from sn_rate import Q_pair, GCC_PER_FM3, MeV5_to_cgs, Q_OP
    M1 = 1e6
    print("Check rejection sampler bound & diagram hierarchy at a typical point:")
    T = 30.
    l = np.array([np.sqrt(mpi**2 + 150.**2), 150., 0, 0]); p1 = np.array([np.sqrt(MN**2+200.**2), 0, 200., 0])
    Ptot = l + p1
    # pick a final configuration
    p2v = np.array([60., 120., 30.]); p2 = np.array([np.sqrt(MN**2 + p2v@p2v), *p2v]); q = Ptot - p2
    tot, comp = amp2(l, p1, p2, q, parts=True)
    print(f"  |M|^2 total = {tot:.3e}; individual |D1|^2..|D4|^2 = {comp}")
    print()
    for T in (20., 30., 40.):
        for rho in (1e14, 3e14):
            nB = rho / GCC_PER_FM3; Yp = 0.3
            n_p = nB * Yp; n_n = nB * (1 - Yp)
            r, dr, wm = pion_rate(T, n_p, n_n, Npts=3000, seed=int(T))
            r0, dr0, _ = pion_rate(T, n_p, None, Npts=3000, seed=int(T), blocking=False)
            QNN = Q_pair(T, nB, Yp, M1)['total']
            for Ypi in (0.01, 0.03):
                n_pi = Ypi * nB
                Qpi = n_pi * n_p * HBARC ** 6 * r / M1 ** 4
                print(f"T={T:.0f} rho={rho:.0e} Ypi={Ypi:.2f}: Q_pi/Q_NN = {Qpi/QNN:6.2f}  "
                      f"(blocking factor {r/r0:.2f}, <omega>={wm:.0f} MeV, MC err {dr/r:.2f})")
