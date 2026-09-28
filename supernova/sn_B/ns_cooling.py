"""
Order-of-magnitude check: phi-pair emission from DEGENERATE nn collisions in a cold neutron-star core,
traceless (quadrupole) soft pole only (chi = w m/p_F^2 << 1, so the trace part is negligible here).
Fermi-surface formula (derived in NOTES.md):
  Q = (1/(64 pi^4 M^4)) (2/105) T^6 * 63.1 * (1/2)(2pi)^-8 (pF m*)^4 * 8 pi^2 * int dc12 (2pi/(P pF^2))
        < |T|^2 2 k^4 sin^2(theta') / mu*^2 >_phi
  with |T|^2 = (4 pi^2/mu^2) dsigma/dOmega (vacuum nn cross section at k = pF sin(theta12/2)).
Compared to modified Urca Q_MU ~ 1e21 T9^8 erg/cm^3/s (Yakovlev et al. 2001, order of magnitude)
and to photon cooling era.  M_min where Q_phiphi = Q_MU.
"""
import numpy as np
from nn_phase import dsig_dOmega
from sn_rate import MeV5_to_cgs, HBARC, MN

def Q_ns(T_MeV, n_n=0.3, mstar=0.8, M=1e6, nc=60, nphi=24):
    pF = (3 * np.pi ** 2 * n_n) ** (1 / 3) * HBARC
    ms = mstar * MN; mu = ms / 2; muv = MN / 2
    c12s, wc = np.polynomial.legendre.leggauss(nc)
    acc = 0.0
    for c12, w in zip(c12s, wc):
        th12 = np.arccos(c12)
        k = pF * np.sin(th12 / 2); P = 2 * pF * np.cos(th12 / 2)
        if P < 1e-6 or k < 1e-3:
            continue
        # k' on circle perpendicular to P, |k'|=k ; angle between k and k': k is also perp to P (|p1|=|p2|)
        phis = np.linspace(0, 2 * np.pi, nphi, endpoint=False)
        cos_t = np.cos(phis)            # k and k' both perpendicular to P -> relative angle = azimuth
        ds = dsig_dOmega(k / HBARC, np.arccos(cos_t), 'nn') * HBARC ** -2 * 0.5  # symmetrised |T|^2 with 1/2 for identical final-state double counting (x 1/2 initial in pref)
        T2 = 4 * np.pi ** 2 / muv ** 2 * ds
        G = T2 * 2 * k ** 4 * (1 - cos_t ** 2) / mu ** 2
        acc += w * (2 * np.pi / (P * pF ** 2)) * G.mean()
    pref = (1 / (64 * np.pi ** 4 * M ** 4)) * (2 / 105) * T_MeV ** 6 * 63.1 * 0.5 * (2 * np.pi) ** -8 * (pF * ms) ** 4 * 8 * np.pi ** 2
    return pref * acc * MeV5_to_cgs   # erg/cm^3/s

if __name__ == '__main__':
    for T9 in (1.0, 0.5, 0.2, 0.1):
        T = T9 * 1e9 * 8.617e-11  # MeV
        q1 = Q_ns(T)                      # at M = 1 TeV
        qmu = 1e21 * T9 ** 8
        Mmin = (q1 / qmu) ** 0.25
        print(f"T9={T9}: Q_phiphi(M=1TeV)={q1:.2e} erg/cm3/s ; Q_MU~{qmu:.1e} ; M where equal: {Mmin:.2f} TeV")
