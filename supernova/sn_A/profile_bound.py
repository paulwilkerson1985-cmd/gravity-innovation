import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
SN1987A bound on M from (i) the Raffelt criterion eps < 1e19 erg/g/s at reference conditions and
(ii) the luminosity criterion L_phi(1 s) < L_nu ~ 3e52 erg/s integrated over a PARAMETRIZED 1D
proto-neutron-star profile at t_pb ~ 1 s. The Garching SFHo-18.8 / LS220-s20.0 profiles are not public
(archive is password-protected), so two parametrized profiles ('cold' ~ SFHo-18.8-like, 'hot' ~ LS220-s20.0-like)
are built from anchor points read off published figures (Bollig+2020, Caputo+2022, Joseph+2026 Fig.2);
they are normalized to a baryonic PNS mass ~1.4-1.5 Msun.  Channels:
  NN  : data-driven SRA quadrupole (sra.py) x K_NLO  (K_NLO = 1 leading soft; 2.4 OPE-Born; 10 potential-model monopole)
  piN : pi^- p -> n phi phi (pion.py) with ideal-gas pions at mu_pi = mu_hat(r), optionally x3 ('interacting', virial-like)
Free streaming assumed (valid for M >~ 8 TeV; for 1-8 TeV phi diffuses out in < 1 ms, see summary).
"""
import numpy as np, json
import sra, pion
from nn_xsec import HBARC, MN

MSUN = 1.989e33
R = np.array([0, 2, 4, 6, 8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 25])  # km
PROF = {
 'cold': dict(rho=np.array([5.4e14, 5.25e14, 4.9e14, 4.4e14, 3.7e14, 2.8e14, 2.2e14, 1.55e14, 9e13, 4.5e13, 2.0e13, 9e12, 3e12, 1.2e12, 2e11]),
              T=np.array([19, 19.5, 21, 24, 28, 31, 31.5, 30, 26, 20, 15, 12, 8, 6, 3.5]),
              Yp=np.array([0.29, 0.28, 0.26, 0.22, 0.17, 0.12, 0.10, 0.08, 0.07, 0.07, 0.08, 0.09, 0.10, 0.12, 0.15])),
 'hot':  dict(rho=np.array([4.6e14, 4.5e14, 4.25e14, 3.85e14, 3.3e14, 2.6e14, 2.1e14, 1.5e14, 9.5e13, 5e13, 2.3e13, 1.0e13, 3.5e12, 1.4e12, 2.5e11]),
              T=np.array([28, 29, 31, 35, 39, 42, 42.5, 41, 36, 28, 20, 15, 9.5, 6.5, 3.5]),
              Yp=np.array([0.30, 0.29, 0.27, 0.23, 0.18, 0.13, 0.11, 0.09, 0.08, 0.07, 0.08, 0.09, 0.10, 0.12, 0.15])),
}

def mass(pr):
    r = np.linspace(0, 25, 500) * 1e5
    rho = np.exp(np.interp(r / 1e5, R, np.log(pr['rho'])))
    return np.trapezoid(4 * np.pi * r ** 2 * rho, r) / MSUN

def mu_hat(T, rho, Yp):
    """mu_n - mu_p: free NR Fermi gas + potential symmetry energy 4 S_pot(n)(1-2Yp), S_pot = 18 MeV (n/n0)^0.6."""
    nB = rho / 1.66054e-24 * 1e-39
    free = T * (sra.eta_from_n(nB * (1 - Yp), T) - sra.eta_from_n(nB * Yp, T))
    return free + 4 * 18.0 * (nB / 0.16) ** 0.6 * (1 - 2 * Yp)

def n_pi_ideal(T, mu):
    """pi^- density (fm^-3), ideal Bose gas, mu capped below m_pi."""
    mu = min(mu, pion.mpi - 5.0)
    k = np.linspace(0, 30 * T + 500, 6000)
    E = np.sqrt(k ** 2 + pion.mpi ** 2)
    return np.trapezoid(k ** 2 / np.expm1((E - mu) / T), k) / (2 * np.pi ** 2) / HBARC ** 3

_svw_cache = {}
def svw(T):
    Tk = round(T, 1)
    if Tk not in _svw_cache:
        _svw_cache[Tk] = pion.sigv_omega(Tk, N=60000, seed=5)[0]
    return _svw_cache[Tk]

def radial_table(name, nsamp=150000):
    pr = PROF[name]
    rows = []
    for r, rho, T, Yp in zip(R, pr['rho'], pr['T'], pr['Yp']):
        if rho < 5e11:
            rows.append(dict(r=float(r), rho=float(rho), T=float(T), Yp=float(Yp), eps_NN=0.0, eps_pi=0.0, Ypi=0.0, mu_hat=0.0, eps_pi_unit=0.0)); continue
        e = sra.emissivity(T, rho, Yp, 1.0, nsamp=nsamp, seed=11)['eps']
        mh = mu_hat(T, rho, Yp)
        npi = n_pi_ideal(T, mh)
        nB = rho / 1.66054e-24 * 1e-39
        Q = 2 * npi * HBARC ** 3 * (Yp * nB * HBARC ** 3) * svw(T) / 1e24
        eps_pi = Q / (rho * sra.MEV_PER_GCC) * sra.ERG_G_S_PER_MEV
        # anchored prescription: Y_pi(T) = Y0 * exp[-(m_pi - 80 MeV)(1/T - 1/37 MeV)], capped at 5 Y0; eps for Y0 = 1
        ypi_shape = min(np.exp(-(pion.mpi - 80.0) * (1 / T - 1 / 37.0)), 5.0)
        Qu = 2 * (ypi_shape * nB * HBARC ** 3) * (Yp * nB * HBARC ** 3) * svw(T) / 1e24
        eps_pi_unit = Qu / (rho * sra.MEV_PER_GCC) * sra.ERG_G_S_PER_MEV
        rows.append(dict(r=float(r), rho=float(rho), T=float(T), Yp=float(Yp), eps_NN=float(e), eps_pi=float(eps_pi),
                         Ypi=float(npi / nB), mu_hat=float(mh), eps_pi_unit=float(eps_pi_unit)))
        print(f"  {name} r={r:4.0f} km rho={rho:.1e} T={T:4.1f} Yp={Yp:.2f} mu_hat={mh:5.1f} Ypi(ideal)={npi/nB:.4f} "
              f"eps_NN(Q,1TeV)={e:.2e} eps_pi(ideal,1TeV)={eps_pi:.2e}", flush=True)
    return rows

def luminosity(rows, K_NLO=1.0, pi_boost=1.0, M_TeV=1.0, Y0=None):
    r = np.array([x['r'] for x in rows]) * 1e5
    rho = np.array([x['rho'] for x in rows])
    if Y0 is None:
        eps = K_NLO * np.array([x['eps_NN'] for x in rows]) + pi_boost * np.array([x['eps_pi'] for x in rows])
    else:
        eps = K_NLO * np.array([x['eps_NN'] for x in rows]) + Y0 * np.array([x['eps_pi_unit'] for x in rows])
    # log-interpolate onto fine grid
    rf = np.linspace(0, r[-1], 800)
    lr = np.interp(rf, r, np.log(rho)); le = np.interp(rf, r, np.log(np.maximum(eps, 1e-30)))
    return np.trapezoid(4 * np.pi * rf ** 2 * np.exp(lr + le), rf) / M_TeV ** 4

if __name__ == '__main__':
    out = {}
    for name in ('cold', 'hot'):
        print(name, 'baryonic mass ~ %.2f Msun' % mass(PROF[name]))
        rows = radial_table(name)
        out[name] = rows
    json.dump(out, open((_GI + '/supernova/sn_A/data/profile_emissivities.json'), 'w'), indent=1)
    print()
    for name in ('cold', 'hot'):
        rows = out[name]
        for K in (1.0, 2.4, 10.0):
            L1 = luminosity(rows, K, 0.0)
            print(f"{name:4s} NN only, K_NLO={K:4.1f}: L(1 TeV)={L1:.2e} erg/s -> M_min={(L1/3e52)**0.25:.2f} TeV (L<3e52), {(L1/5.7e52)**0.25:.2f} (L<5.7e52)")
        L1 = luminosity(rows, 0.0, 1.0)
        print(f"{name:4s} piN only, ideal-gas pions with mu_hat(r) [can approach condensation; upper-ish]: L={L1:.2e} -> M_min={(L1/3e52)**0.25:.2f} TeV")
        for Y0 in (0.003, 0.01, 0.03):
            L1 = luminosity(rows, 0.0, Y0=Y0)
            print(f"{name:4s} piN only, anchored Y_pi(37 MeV)={Y0}: L={L1:.2e} -> M_min={(L1/3e52)**0.25:.2f} TeV")
        for K, Y0 in ((1.0, 0.003), (2.4, 0.01), (10.0, 0.03)):
            L1 = luminosity(rows, K, Y0=Y0)
            print(f"{name:4s} TOTAL K_NLO={K}, Y0={Y0}: L={L1:.2e} -> M_min={(L1/3e52)**0.25:.2f} TeV (L<3e52), {(L1/5.7e52)**0.25:.2f} (L<5.7e52)")
