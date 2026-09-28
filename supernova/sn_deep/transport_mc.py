import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Semi-trapped transport of phi pairs in a proto-neutron star: vectorised Monte Carlo random walk with
  * elastic phi-N scattering through the contact vertex, sigma = m_N^2/(4 pi M^4) = 2.7e-41 cm^2 (TeV/M)^4,
    isotropic in CM, full kinematics against Maxwellian nucleons at the local T (-> thermalisation),
  * re-absorption (inverse of the production processes) with rate Gamma_abs(r) = Q(r)/u_BB(r) (detailed balance,
    energy-averaged; u_BB = pi^2 T^4/30 for one real scalar),
  * production positions from Q(r) (NN + pion channels), production energies from the channel spectra
    (NN: omega_pair ~ Gamma(6,T) i.e. <omega_pair> = 6T; pion: <omega_pair> = 190 MeV), split flat between the two phi.
Profiles: parametrised 'cold'/'hot' (sn_A/profile_bound.py).  Emissivities (1 TeV):
  eps_NN^FD = 5.4e21 (rho/3e14)^0.75 (T/30)^5.7 g(Yp)   [fit to nn_emissivity_new.json: AV18 finite-omega trace + FD]
  eps_pi    = 4.1e22 (Ypi/1%)(Yp/0.3)(rho/3e14)(T/30)^1.9, Ypi(T) = Y0 exp[-(m_pi-80)(1/T-1/37)] (<= 5 Y0)  [note eq. 4.1]
Output: f_esc(M) = L_esc/L_prod, <E_esc>, absorbed fraction, and the self-consistent M_min from L_esc(M) = L_crit.
"""
import numpy as np, sys, json
sys.path.insert(0, (_GI + '/supernova/sn_A'))
from profile_bound import PROF, R as RKM

MN = 938.9; MPI = 139.57; C_CM = 2.99792458e10
MEV4_TO_ERG_CM3 = (1 / 197.327e-13) ** 3 * 1.602177e-6
KM = 1e5


class Star:
    def __init__(self, name, K_scale=1.0, Y0=0.01, rmax_km=25.0, n=500):
        pr = PROF[name]
        self.r = np.linspace(0, rmax_km, n) * KM
        rk = self.r / KM
        self.rho = np.exp(np.interp(rk, RKM, np.log(pr['rho'])))
        self.T = np.interp(rk, RKM, pr['T'])
        self.Yp = np.interp(rk, RKM, pr['Yp'])
        self.nB = self.rho / 1.66054e-24
        Yp = self.Yp
        g = 0.4 * ((1 - Yp) / 0.7) ** 2 + 0.51 * (Yp * (1 - Yp) / 0.21) + 0.09 * (Yp / 0.3) ** 2
        self.eps_NN = K_scale * 5.4e21 * (self.rho / 3e14) ** 0.75 * (self.T / 30) ** 5.7 * g
        ypi = Y0 * np.minimum(np.exp(-(MPI - 80.0) * (1 / self.T - 1 / 37.0)), 5.0)
        self.eps_pi = 4.1e22 * (ypi / 0.01) * (Yp / 0.3) * (self.rho / 3e14) * (self.T / 30) ** 1.9
        self.eps_pi[self.rho < 1e12] = 0.0
        self.Q_NN = self.eps_NN * self.rho; self.Q_pi = self.eps_pi * self.rho
        self.Q = self.Q_NN + self.Q_pi
        self.uBB = np.pi ** 2 / 30 * self.T ** 4 * MEV4_TO_ERG_CM3
        self.dV = 4 * np.pi * self.r ** 2 * np.gradient(self.r)
        self.L_NN = np.sum(self.Q_NN * self.dV); self.L_pi = np.sum(self.Q_pi * self.dV)

    def sigma_cm2(self, M_TeV):
        return 2.7e-41 / M_TeV ** 4

    def tau_center(self, M_TeV):
        return np.trapezoid(self.nB * self.sigma_cm2(M_TeV), self.r)

    def r_sphere(self, M_TeV, tau=2. / 3):
        """radius where the outward optical depth = tau, and T there."""
        tau_out = np.cumsum((self.nB * self.sigma_cm2(M_TeV) * np.gradient(self.r))[::-1])[::-1]
        i = np.searchsorted(-tau_out, -tau)
        i = min(i, len(self.r) - 1)
        return self.r[i] / KM, self.T[i]


def scatter_vec(rng, E, T):
    """elastic phi(E) + N(Maxwellian at T) -> isotropic in CM -> new lab energy (vectorised)."""
    n = len(E)
    p = rng.normal(size=(n, 3)) * np.sqrt(MN * T)[:, None]
    EN = np.sqrt(MN ** 2 + (p ** 2).sum(1))
    k = rng.normal(size=(n, 3)); k *= (E / np.linalg.norm(k, axis=1))[:, None]
    P0 = E + EN; Pv = k + p
    beta = Pv / P0[:, None]; b2 = (beta ** 2).sum(1); g = 1 / np.sqrt(1 - b2)
    Ecm = g * (E - (beta * k).sum(1))
    nh = rng.normal(size=(n, 3)); nh /= np.linalg.norm(nh, axis=1)[:, None]
    return g * (Ecm + Ecm * (beta * nh).sum(1))


def run(star, M_TeV, N=3000, seed=0, absorb=True, degrade=True, max_iter=200000, cap_km=1.0):
    """Random walk with correct handling of the inhomogeneous medium: each flight draws an optical depth
    tau_s ~ Exp(1) which is consumed along a straight ray in sub-steps of <= cap_km (direction is kept
    between sub-steps; only a real scattering randomises it)."""
    rng = np.random.default_rng(seed)
    sig = star.sigma_cm2(M_TeV)
    w = star.Q * star.dV; pdf = w / w.sum()
    j = rng.choice(len(pdf), size=N, p=pdf)
    is_pi = rng.random(N) < star.Q_pi[j] / (star.Q[j] + 1e-300)
    wpair = np.where(is_pi, rng.gamma(12.0, 190.0 / 12.0, N), rng.gamma(6.0, star.T[j]))
    x = rng.random(N)
    E = np.concatenate([wpair * x, wpair * (1 - x)])
    r0 = np.concatenate([star.r[j], star.r[j]])
    n2 = 2 * N
    pos = rng.normal(size=(n2, 3)); pos *= (r0 / np.linalg.norm(pos, axis=1))[:, None]
    dirn = rng.normal(size=(n2, 3)); dirn /= np.linalg.norm(dirn, axis=1)[:, None]
    tau_s = rng.exponential(1.0, n2)
    Eprod = E.sum(); Eesc = 0.0; Nesc = 0; Nabs = 0
    alive = np.ones(n2, bool); nsc = np.zeros(n2)
    rmax = star.r[-1]; cap = cap_km * KM
    Qr = star.Q / M_TeV ** 4
    for it in range(max_iter):
        idx = np.where(alive)[0]
        if len(idx) == 0:
            break
        r = np.linalg.norm(pos[idx], axis=1)
        esc = r >= rmax
        if esc.any():
            Eesc += E[idx[esc]].sum(); Nesc += esc.sum(); alive[idx[esc]] = False
            idx = idx[~esc]; r = r[~esc]
            if len(idx) == 0:
                break
        nB = np.interp(r, star.r, star.nB)
        lam = 1.0 / (nB * sig + 1e-300)
        s_full = tau_s[idx] * lam                     # distance to the scattering at local lambda
        s = np.minimum(s_full, cap)
        real = s_full <= cap
        if absorb:
            Gam = np.interp(r, star.r, Qr) / np.interp(r, star.r, star.uBB)
            pabs = 1 - np.exp(-Gam * s / C_CM)
            ab = rng.random(len(idx)) < pabs
            if ab.any():
                Nabs += ab.sum(); alive[idx[ab]] = False
                keep = ~ab
                idx = idx[keep]; s = s[keep]; lam = lam[keep]; real = real[keep]
                if len(idx) == 0:
                    continue
        pos[idx] += s[:, None] * dirn[idx]
        tau_s[idx] -= s / lam
        if real.any():
            ii = idx[real]
            nsc[ii] += 1
            if degrade:
                Tn = np.interp(np.linalg.norm(pos[ii], axis=1), star.r, star.T)
                E[ii] = scatter_vec(rng, E[ii], Tn)
            nd = rng.normal(size=(len(ii), 3)); nd /= np.linalg.norm(nd, axis=1)[:, None]
            dirn[ii] = nd
            tau_s[ii] = rng.exponential(1.0, len(ii))
    if alive.any():
        Eesc += E[alive].sum(); Nesc += alive.sum()
    return dict(f_esc=Eesc / Eprod, N_esc_frac=Nesc / n2, N_abs_frac=Nabs / n2,
                Eesc_mean=Eesc / max(Nesc, 1), Eprod_mean=Eprod / n2, nsc_mean=nsc.mean(), iters=it)


if __name__ == '__main__':
    out = {}
    Ms = (2.5, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 10.0)
    for name in ('cold', 'hot'):
        for Y0 in (0.0, 0.01):
            st = Star(name, Y0=Y0)
            L1 = st.L_NN + st.L_pi
            print(f"\n{name} profile, Y_pi(37)={Y0}: L_NN(1TeV)={st.L_NN:.2e}, L_pi={st.L_pi:.2e} erg/s;"
                  f" free-streaming M_min(3e52)={(L1/3e52)**0.25:.2f} TeV, (5.7e52) {(L1/5.7e52)**0.25:.2f} TeV")
            print("   M[TeV]  tau_c  r_sph[km] T_sph | f_esc  Nabs  <E_prod> <E_esc> <n_sc> | L_esc/3e52 | f(no abs) f(no degr)")
            res = []
            for M in Ms:
                r = run(st, M, N=2000, seed=1)
                rn = run(st, M, N=1000, seed=2, absorb=False)
                rd = run(st, M, N=1000, seed=3, degrade=False)
                Lesc = L1 / M ** 4 * r['f_esc']
                rs, Ts = st.r_sphere(M)
                res.append(dict(M=M, **r, Lesc=Lesc, r_sph=rs, T_sph=Ts))
                print(f"   {M:4.1f}  {st.tau_center(M):6.1f}  {rs:6.1f}  {Ts:5.1f} | {r['f_esc']:5.2f}  {r['N_abs_frac']:4.2f}"
                      f"  {r['Eprod_mean']:6.1f}  {r['Eesc_mean']:6.1f}  {r['nsc_mean']:6.1f} | {Lesc/3e52:8.3f} |"
                      f"  {rn['f_esc']:5.2f}     {rd['f_esc']:5.2f}", flush=True)
            Marr = np.array([x['M'] for x in res]); Larr = np.array([x['Lesc'] for x in res])
            for Lc in (3e52, 5.7e52):
                if Larr.min() < Lc < Larr.max():
                    Mmin = np.exp(np.interp(-np.log(Lc), -np.log(Larr), np.log(Marr)))
                    print(f"   -> self-consistent M_min(L_esc<{Lc:.1e}) = {Mmin:.2f} TeV  (free streaming {(L1/Lc)**0.25:.2f})")
            out[f'{name}_Y{Y0}'] = res
    json.dump(out, open((_GI + '/supernova/sn_deep/transport_mc.json'), 'w'), indent=1)
