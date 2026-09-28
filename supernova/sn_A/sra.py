import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Soft-radiation approximation (SRA) emissivity for  N N -> N N phi phi  with the
symmetron/conformal coupling  L = -(phi^2 / 2 M^2) m_N Nbar N  (plus the full T^mu_mu).

Pair source: J(x) = s(x)/M^2 with s = scalar charge density; pair of 4-momentum K=(w,Kvec):
   dN = d^4K/(2pi)^4 * beta/(16 pi) * |Jtilde(K)|^2      (beta = sqrt(1-4 m_eff^2/K^2), 1/2 for identical phi incl.)
Classical soft factor for one binary collision (CM frame, relative momenta p -> p'):
   Fhat = (1/M^2)[ Q-term + monopole NLO ],
   Q-term  = (2/(m w^3)) K_i K_j A_ij ,   A_ij = p'_i p'_j - p_i p_j      [leading, O(E/w)]
   <|Q|^2>_Khat = (4/(15 m^2 w^6)) K^4 [ (Tr A)^2 + 2 A:A ]
   G_Q(w) = int K^2 dK 4pi/(2pi)^4 /(16 pi) <|Q|^2> = [(TrA)^2 + 2A:A] w /(1680 pi^4 m^2)   (massless phi)
NLO isotropic term  c0 (O(w^0)): G_M(w) = c0^2 w^3 /(192 pi^4) (massless), added incoherently
(no interference with the traceless part after K-direction averaging).

Q_ch = c_ch g_s^2 int d^3p1 d^3p2/(2pi)^6 f1 f2 v int dOmega' (dsig/dOmega)(p'/p)(1-f3)(1-f4) int dw w G(w) / M^4
c_ch = 1/4 (nn, pp: identical in initial and final state, full 4pi) ; 1 (np).   g_s = 2.
Units: MeV.
"""
import numpy as np
from nn_xsec import dsigma, HBARC, MN

rng = np.random.default_rng(12345)
MEV_PER_GCC = 5.60958865e26 * (HBARC * 1e-13) ** 3   # 1 g/cm^3 in MeV^4 : (MeV/cm^3)*(hbar c in MeV cm)^3
ERG_G_S_PER_MEV = 1.0 / 6.582119569e-22 * (2.99792458e10) ** 2  # (MeV/MeV) per unit time -> erg/g/s : Q/rho [MeV] -> s^-1 * c^2

# ---------- cross-section table ----------
_TL = np.concatenate([np.arange(0.5, 20, 0.5), np.arange(20, 351, 2.5)])
_X = np.linspace(-1, 1, 81)
_tab = {}
def build_tables():
    for ch in ('nn', 'np'):
        arr = np.zeros((len(_TL), len(_X)))
        for i, T in enumerate(_TL):
            arr[i] = dsigma(ch, T, np.arccos(_X))
        _tab[ch] = arr
    np.savez((_GI + '/supernova/sn_A/data/dsig_table.npz'), TL=_TL, X=_X, nn=_tab['nn'], np=_tab['np'])

def load_tables():
    try:
        d = np.load((_GI + '/supernova/sn_A/data/dsig_table.npz'))
        _tab['nn'] = d['nn']; _tab['np'] = d['np']
    except FileNotFoundError:
        build_tables()

def dsig_interp(ch, Tlab, x):
    """bilinear interpolation of dsigma/dOmega [mb/sr]; Tlab clipped to [0.5,350]."""
    arr = _tab[ch]
    T = np.clip(Tlab, _TL[0], _TL[-1])
    i = np.clip(np.searchsorted(_TL, T) - 1, 0, len(_TL) - 2)
    t = (T - _TL[i]) / (_TL[i + 1] - _TL[i])
    j = np.clip(((x + 1) / 2 * (len(_X) - 1)).astype(int), 0, len(_X) - 2)
    u = (x - _X[j]) / (_X[j + 1] - _X[j])
    return ((1 - t) * (1 - u) * arr[i, j] + t * (1 - u) * arr[i + 1, j]
            + (1 - t) * u * arr[i, j + 1] + t * u * arr[i + 1, j + 1])

# ---------- thermodynamics ----------
def eta_from_n(n_fm3, T, m=MN):
    """degeneracy parameter eta=(mu-m)/T for NR free Fermi gas with 2 spin states."""
    n = n_fm3 * HBARC ** 3
    p = np.linspace(0, 12 * np.sqrt(2 * m * T) + 400, 6000)
    def dens(eta):
        f = 1 / (np.exp(np.clip(p ** 2 / (2 * m * T) - eta, -700, 700)) + 1)
        return np.trapezoid(p ** 2 * f, p) / np.pi ** 2
    lo, hi = -30, 60
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        if dens(mid) > n: hi = mid
        else: lo = mid
    return 0.5 * (lo + hi)

# ---------- emissivity ----------
def emissivity(T, rho_gcc, Yp, M_TeV=1.0, nsamp=400000, degenerate=True, c0=0.0,
               prescription='initial', quad='physical', mstar=MN, seed=1, sPsp=None, only=None):
    """Return dict of Q [MeV^5] per channel and eps [erg/g/s] for given M (TeV).
    prescription: energy at which dsigma is evaluated ('initial' | 'final' | 'mean')
    quad: 'physical' -> A with physical p' (incl. TrA); 'elastic' -> traceless, |p'|=|p|
    c0: NLO isotropic coefficient (monopole) added incoherently."""
    rng = np.random.default_rng(seed)
    if not _tab: load_tables()
    m = mstar
    M = M_TeV * 1e6
    nB = rho_gcc / 1.66054e-24 * 1e-39  # fm^-3
    nn_, np_ = nB * (1 - Yp), nB * Yp
    etas = {'n': eta_from_n(nn_, T, m) if degenerate else None,
            'p': eta_from_n(np_, T, m) if degenerate else None}
    def f(pvec, sp):
        e = np.sum(pvec ** 2, axis=-1) / (2 * m * T)
        if degenerate:
            return 1 / (np.exp(np.clip(e - etas[sp], -700, 700)) + 1)
        n = (nn_ if sp == 'n' else np_) * HBARC ** 3
        return n / 2 * (2 * np.pi / (m * T)) ** 1.5 * np.exp(-e)
    out = {}
    N = nsamp
    for ch, (a, b), cch, xs in (('nn', ('n', 'n'), 0.25, 'nn'), ('pp', ('p', 'p'), 0.25, 'nn'),
                                ('np', ('n', 'p'), 1.0, 'np')):
        # proposal: P ~ N(0, 2mT) per comp, p ~ N(0, mT/2) per comp
        if only and ch!=only: out[ch]=(0.0,0.0); continue
        sP, sp = (np.sqrt(2 * m * T), np.sqrt(m * T / 2)) if sPsp is None else sPsp
        P = rng.normal(0, sP, (N, 3)); p = rng.normal(0, sp, (N, 3))
        gP = np.exp(-np.sum(P ** 2, 1) / (2 * sP ** 2)) / (2 * np.pi * sP ** 2) ** 1.5
        gp = np.exp(-np.sum(p ** 2, 1) / (2 * sp ** 2)) / (2 * np.pi * sp ** 2) ** 1.5
        p1, p2 = P / 2 + p, P / 2 - p
        w12 = f(p1, a) * f(p2, b) / (gP * gp)
        pm = np.linalg.norm(p, axis=1)
        E = pm ** 2 / m            # CM kinetic energy
        v = 2 * pm / m
        # sample omega uniformly in (0,E), final direction isotropic
        u = rng.random(N); w = u * E
        pf = np.sqrt(np.maximum(pm ** 2 - m * w, 0))
        cth = rng.uniform(-1, 1, N); phi = rng.uniform(0, 2 * np.pi, N)
        # build unit vector of p and of p' (angle th relative to p)
        ez = p / pm[:, None]
        tmp = np.where(np.abs(ez[:, [0]]) < 0.9, np.array([[1, 0, 0]]), np.array([[0, 1, 0]]))
        e1 = np.cross(ez, tmp); e1 /= np.linalg.norm(e1, axis=1)[:, None]
        e2 = np.cross(ez, e1)
        sth = np.sqrt(1 - cth ** 2)
        nf = cth[:, None] * ez + (sth * np.cos(phi))[:, None] * e1 + (sth * np.sin(phi))[:, None] * e2
        pfv = pf[:, None] * nf
        p3, p4 = P / 2 + pfv, P / 2 - pfv
        if degenerate:
            block = (1 - f(p3, a)) * (1 - f(p4, b))
        else:
            block = 1.0
        # cross section (mb/sr -> MeV^-2)
        if prescription == 'initial': Tl = 2 * E
        elif prescription == 'final': Tl = 2 * (E - w)
        else: Tl = 2 * (E - w / 2)
        ds = dsig_interp(xs, Tl, cth) * 0.1 / HBARC ** 2
        # quadrupole factor
        if quad == 'physical':
            TrA = pf ** 2 - pm ** 2
            AA = pf ** 4 + pm ** 4 - 2 * (pm * pf * cth) ** 2
            GQ = (TrA ** 2 + 2 * AA) * w / (1680 * np.pi ** 4 * m ** 2)
        else:
            GQ = 4 * pm ** 4 * (1 - cth ** 2) * w / (1680 * np.pi ** 4 * m ** 2)
        GM = c0 ** 2 * w ** 3 / (192 * np.pi ** 4)
        integ = w12 / (2 * np.pi) ** 6 * v * ds * (pf / pm) * block * 4 * np.pi * E * w * (GQ + GM)
        Qch = cch * 4 * np.mean(integ) / M ** 4
        err = cch * 4 * np.std(integ) / np.sqrt(N) / M ** 4
        out[ch] = (Qch, err)
    Qtot = sum(v[0] for v in out.values())
    rho = rho_gcc * MEV_PER_GCC
    out['Q'] = Qtot
    out['eps'] = Qtot / rho * ERG_G_S_PER_MEV
    out['etas'] = etas
    return out

def olive_pospelov(T, rho_gcc, M_TeV=1.0, sigma_mb=25.0, m=MN):
    """OP08 eq. (3.14): Gamma = sigma n^2 T^{7/2} m^{3/2}/(12 pi^4 M^4); returns (Q [MeV^5], eps [erg/g/s])."""
    n = rho_gcc / 1.66054e-24 * 1e-39 * HBARC ** 3
    s = sigma_mb * 0.1 / HBARC ** 2
    Q = s * n ** 2 * T ** 3.5 * m ** 1.5 / (12 * np.pi ** 4 * (M_TeV * 1e6) ** 4)
    return Q, Q / (rho_gcc * MEV_PER_GCC) * ERG_G_S_PER_MEV

def M_bound(eps_at_1TeV, eps_max=1e19):
    return (eps_at_1TeV / eps_max) ** 0.25

if __name__ == '__main__':
    load_tables()
    print("check OP: ", olive_pospelov(30, 3e14, 15.0))
    for T in (20, 30, 40):
        for rho in (1e14, 2e14, 3e14):
            r = emissivity(T, rho, 0.3, 1.0, nsamp=300000)
            rnd = emissivity(T, rho, 0.3, 1.0, nsamp=300000, degenerate=False)
            op = olive_pospelov(T, rho, 1.0)[1]
            print(f"T={T} rho={rho:.0e}: eta_n={r['etas']['n']:.2f} eta_p={r['etas']['p']:.2f} | "
                  f"eps(1TeV)={r['eps']:.3e} (nondeg {rnd['eps']:.3e}) | OP={op:.3e} ratio={r['eps']/op:.2e} "
                  f"| M_min={M_bound(r['eps']):.2f} TeV (OP {M_bound(op):.1f}) | nn/np/pp = "
                  + ' '.join(f"{r[c][0]/r['Q']:.2f}" for c in ('nn','np','pp')))
