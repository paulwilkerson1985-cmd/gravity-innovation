"""
Neutron-star-core pair emission  n n -> n n phi phi  (strongly degenerate neutrons), leading soft
(quadrupole) term, which is enhanced by (E_F/omega)^2 in degenerate matter (monopole negligible).
Degenerate phase-space reduction (all momenta on the Fermi surface, omega << E_F):
 Q = c g_s^2 (m p_F)^4/(2pi)^8 * 16 pi^2/m^2 * (8 pi^3/p_F^3) * int_0^pi d th12 sin th12/cos(th12/2)
     * (1/2pi) int dphi' (dsig/dOmega)(E_rel, phi') * int dw w G_Q(w; p, phi') T^3 J(w/T) / M^4,
 with p = p_F sin(th12/2) (relative momentum), E_rel = p^2/m, J(y) = y(y^2+4pi^2)/(6(e^y-1)),
 G_Q = 16 p^4 sin^2(phi') /(15*64 pi^4 m^2 w^6) * int_0^{sqrt(w^2-4 meff^2)} K^6 beta dK,
 meff = sqrt(rho)/M (in-medium phi mass at phi=0), c = 1/4 (identical neutrons).
Vacuum PWA93 cross sections (in-medium reduction ~ factor 2-3 is a noted uncertainty).
No superfluidity (it would suppress nn bremsstrahlung by ~exp(-2Delta/T) where neutrons pair).
"""
import numpy as np
from nn_xsec import dsigma, HBARC, MN
from sra import MEV_PER_GCC

KEV = 1e-3
def Jfun(y):
    return y * (y ** 2 + 4 * np.pi ** 2) / (6 * np.expm1(y))

def IK(w, meff, n=400):
    """int_0^Kmax K^6 beta dK  (MeV^7)."""
    Kmax2 = w ** 2 - 4 * meff ** 2
    if Kmax2 <= 0: return 0.0
    K = np.linspace(0, np.sqrt(Kmax2), n)
    beta = np.sqrt(np.clip(1 - 4 * meff ** 2 / np.maximum(w ** 2 - K ** 2, 1e-300), 0, 1))
    return np.trapezoid(K ** 6 * beta, K)

def Q_ns(T_keV, rho_gcc, Yp, M_TeV, m=MN):
    T = T_keV * KEV
    nB = rho_gcc / 1.66054e-24 * 1e-39
    nn = nB * (1 - Yp)
    pF = (3 * np.pi ** 2 * nn) ** (1 / 3) * HBARC
    rho = rho_gcc * MEV_PER_GCC
    meff = np.sqrt(rho) / (M_TeV * 1e6)
    # omega integral (independent of angles except via p^4 sin^2)
    ws = np.linspace(max(2 * meff, 1e-9), 2 * meff + 40 * T, 400)
    Wint = np.trapezoid([w * IK(w, meff) / w ** 6 * T ** 3 * Jfun(w / T) for w in ws], ws)  # int dw w IK/w^6 T^3 J
    # angular integrals with PWA93 nn cross sections
    th12 = np.linspace(1e-3, np.pi - 1e-3, 120)
    phi = np.linspace(0, 2 * np.pi, 121)[:-1]
    acc = 0.0
    for t in th12:
        p = pF * np.sin(t / 2)
        E = p ** 2 / m
        ds = dsigma('nn', max(2 * E, 0.5), phi) * 0.1 / HBARC ** 2   # MeV^-2
        # <|Fhat_Q|^2> = (2/(m w^3))^2 <(K.A.K)^2> = 4/(m^2 w^6) * K^4/15 * 2A:A ,  2A:A = 4 p^4 sin^2
        # (a factor 4 was missing in the first version; caught by MC cross-check, see summary)
        ang = np.mean(ds * np.sin(phi) ** 2) * 4 * 4 * p ** 4 / (15 * 64 * np.pi ** 4 * m ** 2)
        acc += np.sin(t) / np.cos(t / 2) * ang * (th12[1] - th12[0])
    c, gs2 = 0.25, 4
    Q = c * gs2 * (m * pF) ** 4 / (2 * np.pi) ** 8 * 16 * np.pi ** 2 / m ** 2 * 8 * np.pi ** 3 / pF ** 3 * acc * Wint / (M_TeV * 1e6) ** 4
    return Q, meff, pF

def L_ns(T_keV, M_TeV, rho_gcc=4e14, Yp=0.07, Rcore_km=10.0):
    Q, meff, pF = Q_ns(T_keV, rho_gcc, Yp, M_TeV)
    # MeV^5 -> erg/cm^3/s : MeV^5 = MeV * MeV^3 * MeV ; MeV^3 -> cm^-3 ; MeV -> s^-1
    Q_cgs = Q * 1.602176634e-6 / (HBARC * 1e-13) ** 3 / 6.582119569e-22
    V = 4 / 3 * np.pi * (Rcore_km * 1e5) ** 3
    return Q_cgs * V, meff, pF

if __name__ == '__main__':
    # Compare with standard cooling luminosities of a 1.4 Msun NS (order of magnitude):
    #   L_nu(modified Urca) ~ 1e40 T9^8 erg/s (no superfluidity);  L_gamma = 4 pi R^2 sigma T_s^4,
    #   T_s = 0.87e6 K (g14=1.6)^(1/4) (T_b/1e8 K)^0.55  (Gudmundsson et al. 1983), R = 12 km.
    sig = 5.670374e-5
    for T9 in (0.05, 0.1, 0.2, 0.3, 0.5, 1.0):
        T_keV = T9 * 1e9 * 8.617333262e-8
        Ms = [1, 1.5, 2, 3, 5, 7, 10, 15, 20]
        Ls = [L_ns(T_keV, M)[0] for M in Ms]
        Lnu = 1e40 * T9 ** 8
        Ts = 0.87e6 * 1.6 ** 0.25 * (T9 * 10) ** 0.55
        Lg = 4 * np.pi * (1.2e6) ** 2 * sig * Ts ** 4
        j = int(np.argmax(Ls))
        print(f"T_b={T9:.2f}e9 K ({T_keV:5.1f} keV): L_phi(M=1,3,5,10 TeV)=" + ', '.join(f"{L:.1e}" for L, M in zip(Ls, Ms) if M in (1, 3, 5, 10))
              + f" | max {Ls[j]:.1e} at M={Ms[j]} TeV | L_nu(MU)~{Lnu:.1e}, L_gamma~{Lg:.1e} erg/s | max L_phi/(L_nu+L_g)={Ls[j]/(Lnu+Lg):.1e}")
