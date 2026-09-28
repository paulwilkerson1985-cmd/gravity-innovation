"""
Pion-induced pair emission  pi N -> N phi phi  (e.g. pi^- p -> n phi phi) for the universal
conformal coupling, relativistic tree level, pseudovector piNN coupling (same Feynman rules as ope.py):
  M = -i (g/2f)(1/M^2) { m [u'(p+k+m) k g5 u]/P_a + m [u' k g5 (p-K+m) u]/P_b
                         - X [u' (k-K) g5 u]/D_c } ,   X = 2k.(k-K) - 4 m_pi^2
  (a) h from final nucleon, (b) h from initial nucleon, (c) h from the pion line.
Isospin: |tau^a|^2 = 2 for pi^- p -> n and pi^+ n -> p; 1 for pi^0 N -> N.
sigma v = 1/(4 E_pi E_N) (1/2) sum_spins int d^3K/((2pi)^3 2E') beta/(16 pi) |M|^2,   omega fixed by energy conservation.
Q_pi = sum_channels n_pi n_N < sigma v omega >.
"""
import numpy as np
from ope import spinors, bil, slash, dot, g5, I4, gpv, mpi
from sra import HBARC, MN, MEV_PER_GCC, ERG_G_S_PER_MEV

def M2_piN(p, k, K, parts=('a', 'b', 'c'), m=MN):
    pf = p + k - K
    u, uf = spinors(p), spinors(pf)
    mI = m * I4[None]
    Pa = dot(p + k, p + k) - m ** 2
    Pb = dot(p - K, p - K) - m ** 2
    kc = k - K
    Dc = dot(kc, kc) - mpi ** 2
    X = 2 * dot(k, kc) - 4 * mpi ** 2
    k5 = slash(k) @ g5
    tot = 0
    if 'a' in parts: tot = tot + (m / Pa)[:, None, None] * bil(uf, (slash(p + k) + mI) @ k5, u)
    if 'b' in parts: tot = tot + (m / Pb)[:, None, None] * bil(uf, k5 @ (slash(p - K) + mI), u)
    if 'c' in parts: tot = tot - (X / Dc)[:, None, None] * bil(uf, slash(kc) @ g5, u)
    return gpv ** 2 * np.sum(np.abs(tot) ** 2, axis=(1, 2))   # (1/M^2)^2 removed

def sigv_omega(T, N=200000, seed=0, parts=('a', 'b', 'c'), mu_pi=0.0, m=MN):
    """Returns <sigma v omega> averaged over MB nucleons and Bose pions with chemical potential mu_pi,
    per M^-4 [MeV^-1 * MeV^... -> units MeV^-3 * MeV = MeV^-2...]; plus <omega>."""
    rng = np.random.default_rng(seed)
    pv = rng.normal(0, np.sqrt(m * T), (N, 3))
    EN = np.sqrt(m ** 2 + np.sum(pv ** 2, 1))
    p = np.column_stack([EN, pv])
    # pion momentum: proposal ~ Maxwell-Boltzmann with scale sqrt(mpi T)*1.4 ; reweight to Bose
    s = 1.4 * np.sqrt(mpi * T)
    kv = rng.normal(0, s, (N, 3)); km = np.linalg.norm(kv, axis=1)
    Epi = np.sqrt(mpi ** 2 + km ** 2)
    prop = np.exp(-km ** 2 / (2 * s ** 2)) / (2 * np.pi * s ** 2) ** 1.5
    fB = 1 / (np.exp((Epi - mu_pi) / T) - 1)
    npi = None
    wpi = fB / (2 * np.pi) ** 3 / prop            # so that mean(wpi) = n_pi (per isospin state)
    k = np.column_stack([Epi, kv])
    # sample K uniformly in a ball of radius Kmax = E_pi + T (safe upper bound), check timelike
    Kmax = Epi + (EN - m)
    u3 = rng.random(N) ** (1 / 3)
    c = rng.uniform(-1, 1, N); ph = rng.uniform(0, 2 * np.pi, N); sn = np.sqrt(1 - c ** 2)
    Kv = (Kmax * u3)[:, None] * np.column_stack([sn * np.cos(ph), sn * np.sin(ph), c])
    pfv = pv + kv - Kv
    Ef = np.sqrt(m ** 2 + np.sum(pfv ** 2, 1))
    w = EN + Epi - Ef
    Km = np.linalg.norm(Kv, axis=1)
    ok = (w > Km)
    K = np.column_stack([w, Kv])
    vol = 4 / 3 * np.pi * Kmax ** 3
    M2 = np.where(ok, M2_piN(p, k, K, parts=parts), 0.0)
    sv = ok * (1 / (4 * Epi * EN)) * 0.5 * M2 * vol / ((2 * np.pi) ** 3 * 2 * Ef) / (16 * np.pi)
    npi = np.mean(wpi)
    val = np.mean(wpi * sv * w) / npi
    err = np.std(wpi * sv * w) / npi / np.sqrt(N)
    return val, err, npi / HBARC ** 3, np.mean(wpi * ok * w) / np.mean(wpi * ok)

def Q_pion(T, rho_gcc, Yp, Ypi_minus, M_TeV=1.0, **kw):
    """Q [MeV^5] from pi^- p -> n (isospin 2) using a given pi^- fraction Y_pi- = n_pi-/n_B.
    (pi^0 and pi^+ contributions neglected: suppressed by exp(-mu_hat/T).)"""
    val, err, _, wmean = sigv_omega(T, **kw)
    nB = rho_gcc / 1.66054e-24 * 1e-39 * HBARC ** 3
    Q = 2 * (Ypi_minus * nB) * (Yp * nB) * val / (M_TeV * 1e6) ** 4
    return Q, Q / (rho_gcc * MEV_PER_GCC) * ERG_G_S_PER_MEV, wmean

if __name__ == '__main__':
    for T in (20., 30., 40.):
        for mu in (0.0, 60.0, 100.0):
            v, e, npi, wm = sigv_omega(T, N=150000, mu_pi=mu, seed=2)
            print(f"T={T} mu_pi={mu}: <sv w>={v:.3e}+-{e:.1e} MeV^2(xM^-4)  n_pi(ideal, per state)={npi:.2e} fm^-3  <w>={wm:.0f} MeV")
        v_ab = sigv_omega(T, N=150000, mu_pi=60, seed=2, parts=('a', 'b'))[0]
        v_c = sigv_omega(T, N=150000, mu_pi=60, seed=2, parts=('c',))[0]
        print(f"   parts: nucleon-legs only {v_ab:.3e}, pion-line only {v_c:.3e}")
        for Ypi in (0.003, 0.01, 0.03):
            Q, eps, wm = Q_pion(T, 3e14, 0.3, Ypi, 1.0, N=150000, mu_pi=60, seed=3)
            print(f"   rho=3e14, Y_pi-={Ypi}: eps(1 TeV)={eps:.3e} erg/g/s -> M_min(Raffelt)={(eps/1e19)**0.25:.2f} TeV")
