"""Sudden-approximation (Weizsacker-Williams) estimate of pair emission accompanying two-body pion absorption
and its inverse (pi^- n p <-> n n, and NN -> NN pi): scalar charge changes by Delta S(w) ~ (m_pi^2/E_pi + E_pi) - w.
dE/dw = (Delta S)^2 w^2/(192 pi^4 M^4)  (K->0 monopole, kappa^2 dkappa integrated).  Absorption width from
pionic-atom phenomenology: Gamma_abs ~ 4pi(1+m/2M) ImB0 rho^2/w + p-wave ImC0 term; ImB0=0.042, ImC0=0.08 (m_pi units)."""
import numpy as np
mpi=139.57; mN=938.9; M=1e6
rho0=0.16; rho=0.18            # fm^-3 (3e14 g/cc)
mpi_fm=mpi/197.327
rho_u = rho/mpi_fm**3         # in m_pi^3
Gs = 4*np.pi*(1+mpi/2/mN)*0.042*rho_u**2 * mpi          # MeV, s-wave, w=m_pi
k = 130.0                                                # thermal pion momentum ~ sqrt(3 m_pi T)
Gp = 4*np.pi*0.08*rho_u**2*(k/mpi)**2/(1+mpi/2/mN) * mpi
Gam = Gs+Gp
Epi = 190.0
w = np.linspace(0, Epi + mpi**2/Epi, 2000)
dS = (mpi**2/Epi + Epi) - w
Epair = np.trapezoid(dS**2 * w**2, w)/(192*np.pi**4*M**4)   # MeV per event at M=1 TeV
Ypi=0.01; nB=0.18
n_pi = Ypi*nB*1e39                                        # cm^-3
rate = 2*n_pi*Gam/6.582e-22                              # events cm^-3 s^-1 (absorption + production)
Q = rate*Epair*1.602e-6                                   # erg cm^-3 s^-1
eps = Q/3e14
print(f"Gamma_abs(s,p,total) = {Gs:.1f}, {Gp:.1f}, {Gam:.1f} MeV at rho=3e14; E_pair/event = {Epair:.2e} MeV (1 TeV)")
print(f"eps_2body(1 TeV, Y_pi=1%) = {eps:.2e} erg/g/s   vs one-body pi^- p -> n phi phi: 4.1e22 (x0.7 incl.) -> ratio {eps/4.1e22:.3f}")
