"""Physical-unit helpers for the symmetron wedge (natural units hbar=c=1, energies in eV).
Dimensionless solver units: lengths 1/mu, field v, force v^2 (v^2 in eV^2 -> newtons via EV2_N).

Key relations (rho_crit = M^2 mu^2 is the density at which matter restores the symmetry):
  thin sheet (t << 1/m_in):  kappa = rho t / M^2      ->  kappa/mu = (rho/rho_crit) * (mu t)
  in-matter mass:            m_in^2 = rho/M^2 - mu^2  ->  m_in/mu  = sqrt(rho/rho_crit - 1)
  slab of thickness t, symmetric (pinning) part:  kappa_eff = 2 m_in tanh(m_in t / 2)   (saturates at 2 m_in)
  air pinning (desk study): mu*M < sqrt(rho_air)  <=>  M < M_max = 3.65 TeV x (1/mu in cm)
"""
import numpy as np

HBARC_EV_M = 1.973269804e-7          # eV m
GCC_EV4 = 4.3101e18                  # 1 g/cm^3 in eV^4
EV2_N = 1.0 / HBARC_EV_M * 1.602176634e-19   # 1 eV^2 in newtons (8.12e-13 N)
RHO = {'Cu': 8.96, 'Al': 2.70, 'W': 19.3, 'Au': 19.3, 'Mylar': 1.39, 'Kapton': 1.42, 'SiN': 3.1,
       'air': 1.20e-3}             # g/cm^3


def mu_eV(Linv_cm):
    return HBARC_EV_M / (Linv_cm * 1e-2)


def rho_crit_gcc(M_TeV, Linv_cm):
    return (M_TeV * 1e12) ** 2 * mu_eV(Linv_cm) ** 2 / GCC_EV4


def M_max_TeV(Linv_cm):
    """air pinning: rho_crit(M_max) = rho_air"""
    return np.sqrt(RHO['air'] * GCC_EV4) / mu_eV(Linv_cm) / 1e12


def m_in_over_mu(rho_gcc, M_TeV, Linv_cm):
    return np.sqrt(np.maximum(rho_gcc / rho_crit_gcc(M_TeV, Linv_cm) - 1.0, 0.0))


def mu_t(t_m, Linv_cm):
    """thickness in units of 1/mu"""
    return t_m / (Linv_cm * 1e-2)


def kappa_thin(rho_gcc, t_m, M_TeV, Linv_cm):
    """kappa/mu of a thin sheet (areal density rho*t), valid for m_in t << 1"""
    return rho_gcc / rho_crit_gcc(M_TeV, Linv_cm) * mu_t(t_m, Linv_cm)


def kappa_slab_sym(rho_gcc, t_m, M_TeV, Linv_cm):
    """symmetric-mode equivalent Robin kappa/mu of a slab: 2 m tanh(m t/2)"""
    m = m_in_over_mu(rho_gcc, M_TeV, Linv_cm)
    return 2 * m * np.tanh(m * mu_t(t_m, Linv_cm) / 2)


def t_star_m(rho_gcc, M_TeV, Linv_cm):
    """thin-shell pinning thickness t* = mu M^2 / rho  (kappa = mu at t = t*)"""
    return (Linv_cm * 1e-2) * rho_crit_gcc(M_TeV, Linv_cm) / rho_gcc


def in_wedge(M_TeV, Linv_cm, M_min=15.0):
    return (M_TeV >= M_min) and (M_TeV <= M_max_TeV(Linv_cm))


if __name__ == '__main__':
    print('1 eV^2 = %.4g N' % EV2_N)
    for L in [4, 10, 15]:
        print('1/mu=%g cm: mu=%.3e eV  M_max=%.1f TeV' % (L, mu_eV(L), M_max_TeV(L)))
        for M in [5, 15, 36, 55]:
            print('   M=%2d TeV rho_crit=%.2e g/cc  Cu: t*=%.3g um  m_in/mu=%.0f (1/m_in=%.3g mm) kappa_max/mu=%.0f   '
                  'kappa(0.1mm)/mu=%.3g  phi_foil~%.3f   wedge(M_min=15)=%s' % (
                      M, rho_crit_gcc(M, L), t_star_m(8.96, M, L) * 1e6, m_in_over_mu(8.96, M, L),
                      L * 10 / m_in_over_mu(8.96, M, L), 2 * m_in_over_mu(8.96, M, L),
                      kappa_slab_sym(8.96, 1e-4, M, L), np.sqrt(2) / kappa_slab_sym(8.96, 1e-4, M, L), in_wedge(M, L)))
