"""
Thermal-relic Delta N_eff for a symmetron with quadratic matter coupling phi^2 T^mu_mu / (2 M^2).
Rough referee estimate (order-of-magnitude), 26 Sep 2026.

Logic:
  * In the early universe the symmetron sits in the symmetric phase (rho >> mu^2 M^2) with
    m_eff^2 = (rho - 3p)/M^2 << T^2, so it is a light real scalar with 1 d.o.f.
  * Elastic scattering phi psi -> phi psi via the contact operator (m_psi/M^2) phi^2 psibar psi has
    sigma ~ m_psi^2 / (16 pi M^4)  (relativistic psi; NR is similar within O(1)).
    Gamma = sum_i n_i sigma_i ; for a species with T^mu_mu contribution (rho-3p)_i = m_i n_i (NR) we
    can write Gamma ~ sum_i (rho-3p)_i m_i / (16 pi M^4).
  * Compare to H = 1.66 sqrt(g*) T^2 / M_Pl.
  * Delta N_eff = (4/7) (g*s(T_nu dec)/g*s(T_dec))^(4/3), with g*s(T_nu dec) = 10.75.
Everything in eV.
"""
import numpy as np

MPL = 1.22e28  # eV (non-reduced)
ZETA3 = 1.202

# species: name, mass (eV), dof (g), fermion?
species = [
    ("e", 0.511e6, 4, True), ("mu", 105.7e6, 4, True), ("tau", 1777e6, 4, True),
    ("pi", 138e6, 3, False), ("K", 494e6, 4, False), ("eta", 548e6, 1, False),
    ("rho", 775e6, 9, False), ("omega", 783e6, 3, False), ("N", 939e6, 8, True),
    ("u", 2.2e6, 12, True), ("d", 4.7e6, 12, True), ("s", 95e6, 12, True),
    ("c", 1270e6, 12, True), ("b", 4180e6, 12, True), ("t", 173e9, 12, True),
    ("W", 80.4e9, 6, False), ("Z", 91.2e9, 3, False), ("h", 125e9, 1, False),
]
TQCD = 155e6


def n_eq(m, g, T, fermion):
    """number density (Maxwell-Boltzmann with correct relativistic limit interpolation)"""
    x = m / T
    if x < 1e-2:
        n = (ZETA3 / np.pi**2) * g * T**3 * (0.75 if fermion else 1.0)
    else:
        # MB: g (m T/2pi)^(3/2) e^{-x} (1 + 15/(8x) ...) ; use K2 form
        from scipy.special import kn
        n = g * m**2 * T * kn(2, x) / (2 * np.pi**2)
    return n


def gstar(T):
    # crude g*s table
    if T > 200e9: return 106.75
    if T > 100e9: return 100.
    if T > 5e9: return 86.25
    if T > 1.5e9: return 75.75
    if T > TQCD: return 61.75
    if T > 100e6: return 17.25
    if T > 20e6: return 14.25
    if T > 0.5e6: return 10.75
    return 3.91


def Gamma(T, M):
    tot = 0.0
    for name, m, g, fer in species:
        # hadrons only below T_QCD, quarks/gluon-era only above
        hadron = name in ("pi", "K", "eta", "rho", "omega", "N")
        quark = name in ("u", "d", "s", "c", "b", "t")
        if hadron and T > TQCD: continue
        if quark and T < TQCD: continue
        n = n_eq(m, g, T, fer)
        tot += n * m**2 / (16 * np.pi * M**4)
    # QCD trace anomaly (gluons) above T_QCD: (rho-3p) ~ 0.3..4 T^4 near T_c; model as c T^4 with c=1
    if T > TQCD:
        c_anom = 4.0 * np.exp(-(T - TQCD) / (150e6))  # peaks ~4 near T_c, falls off
        tot += c_anom * T**4 * T / (16 * np.pi * M**4)  # effective "mass" ~ T
    return tot


def H(T):
    return 1.66 * np.sqrt(gstar(T)) * T**2 / MPL


def T_dec(M):
    Ts = np.logspace(np.log10(10e6), np.log10(300e9), 2000)
    ratio = np.array([Gamma(T, M) / H(T) for T in Ts])
    # decoupling = lowest T at which Gamma/H >= 1 (coupled above, decoupled below)
    idx = np.where(ratio >= 1)[0]
    if len(idx) == 0:
        return None, ratio.max()
    return Ts[idx[0]], ratio.max()


if __name__ == "__main__":
    print("M [TeV]   T_dec [MeV]   g*s(T_dec)   Delta N_eff")
    for M_TeV in [2, 3, 4, 5, 6, 8, 10, 15, 20, 36, 55, 100]:
        M = M_TeV * 1e12
        Td, rmax = T_dec(M)
        if Td is None:
            print(f"{M_TeV:6.0f}   never thermalised (max Gamma/H = {rmax:.2e})")
            continue
        gs = gstar(Td)
        dN = (4 / 7) * (10.75 / gs) ** (4 / 3)
        print(f"{M_TeV:6.0f}   {Td/1e6:10.0f}   {gs:8.2f}   {dN:8.3f}")
    print("\nReference: real scalar decoupling after e+e- annihilation gives 0.57; between mu and QCD 0.39;")
    print("just after QCD crossover (g*=17.25) 0.30; above QCD (61.75) 0.055; above EW (106.75) 0.027.")
    print("Planck18+BAO 95% : Delta N_eff <~ 0.3 ; BBN+CMB (Yeh+22) <~ 0.15-0.2 ; CMB-S4 forecast sigma~0.03.")
