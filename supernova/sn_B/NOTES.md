# sn_B: independent red-team check of the SN1987A bound on symmetron phi-pair emission (26 Sep 2026)

Model: L_int = -(phi^2/2M^2) O, with O = T^mu_mu (mostly-minus metric; = m_N NbarN + m_pi^2 pi^2 + ... on shell).
This matches Olive & Pospelov 2008 eq. (2.10): -(m_N/2M*^2) phi^2 NbarN, so M here is their M*.
OP's formula (3.14) is reproduced exactly by `Q_OP()` and gives M_min = 14.7 TeV at T=30 MeV, rho=3e14 g/cc, with eps < 1e19 erg/g/s.

## 1. Method (route B: stress tensor + conservation, not the soft/Weizsacker-Williams estimate)
* Exact identity, from d_mu T^{mu nu} = 0, for pair 4-momentum q = (w, k), with kappa = |k|/w <= 1:
  O(q) = (k_i k_j / w^2 - delta_ij) T^ij(q) = P_ij T^ij(q).
  So the monopole (baryon number) and the dipole (momentum, equal n/p couplings) cancel identically.
  Pair emission measures the **stress** spectral function at w ~ T. Its shear part is the quadrupole; its bulk (trace) part is the virial.
* Pair phase space: the pair can be treated as a single scalar of mass^2 s. Q_pair = Int ds/(32 pi^2 M^4) Q_1(s). This gives
  Q = 1/(64 pi^4 M^4) Int dw w^4 Int_0^1 kappa^2 dkappa <S_O(w,kappa)>,
  <|P:X|^2>_khat = kappa^4 (2/15) X^T:X^T + (1-kappa^2/3)^2 |X_ii|^2, with no cross term.
  Integrating over kappa gives the weights (2/105) for the traceless part and (68/315) for the trace part.
* Nucleon matrix elements, NR, CM relative momenta k -> k', mu = m/2:
  - Traceless: X^T = T_NN (k'k' - kk)^T/(mu w). This is the leading soft pole and is identical in structure to the KK-dilaton leading-order result of Hanhart-Phillips-Reddy-Savage (2001), eq. (38).
    It is fixed by dsigma/dOmega through the sin^2-weighted moments.
  - Trace: X_ii = -<f|W|i>, with W = 2V + r.grad V (scale breaking of the NN force).
    Hellmann-Feynman plus dimensional analysis (all masses scale together under the conformal coupling) gives the exact result at w -> 0:
    **X_ii = (1 + k d/dk) T_NN at fixed angle**.
    In partial waves, (1 + k d/dk) f_l = e^{2i delta_l} d(delta_l)/dk, which is the Wigner time delay. It vanishes in the unitary, scale-invariant limit, as it should.
    Integrated over final directions this gives sigma_tr = pi * Sum (2J+1)(d delta/dk)^2 for np, and 2 pi * Sum over allowed channels for nn.
    Born limit: (1 + q d/dq) V(q).
* Validation (`check_feynman.py`): a full relativistic tree-level OPE calculation of pp -> pp + (phi phi) was compared with the NR identity result.
  It includes the nucleon legs, the pion line (vertex 2m_pi^2 + s) and the phi-phi-pi-NN contact (Gamma(q) - Gamma(x)), using Einstein-frame rules derived from A = 1 + phi^2/2M^2.
  The ratio |M_rel|^2/(2m)^4|O_NR|^2 = 1.000 +- 0.01 at p = 30-60 MeV and within 10-50% at p = 250-350 MeV (relativistic corrections).
  Individual diagrams are O(m/w) and cancel down to O(p^2/m w).
* Data: approximate Nijmegen/SAID phase shifts (`nn_phase.py`).
  Reproduced cross sections: sigma_np(100 MeV) = 72 mb, sigma_pp(nucl) = 22-30 mb.
  sin^2-weighted fraction is 0.55 (np) and 0.6-0.67 (nn).
  **c_tr^2 = sigma_tr/sigma_el = 2.3-3.0 for E_lab = 100-300 MeV.** The OPE-Born estimate is about 1.3-1.7.

## 2. NN results (Maxwell-Boltzmann, vacuum phase shifts; `sn_rate.py`)
| T (MeV) | Q/Q_OP | Q/Q_OP / (T/m)^2 | trace share | M_min Raffelt (TeV), rho=3e14: OP / traceless-only / total |
|---|---|---|---|---|
| 20 | 5.0e-3 | 11.1 | 84% | 10.3 / 1.7 / 2.75 |
| 30 | 9.4e-3 | 9.2 | 85% | 14.7 / 2.9 / 4.58 |
| 40 | 1.4e-2 | 7.8 | 83% | 18.9 / 4.2 / 6.52 |

* At fixed rho, Q scales roughly as T^5.2.
* The **trace (bulk/virial) channel dominates, 5-6x the quadrupole**, because the w^4 phase space pushes emission to w ~ E_coll, where chi = w m/p^2 ~ 1/2.
* Degeneracy correction (`degeneracy.py`: Fermi-Dirac initial states plus Pauli blocking) gives R = 0.66-0.84 at (30 MeV, 3e14), 0.9-0.96 at 1e14 and 0.44-0.84 at (20 MeV, 3e14).
  Raffelt at (30 MeV, 3e14) then gives **M_min = 4.2 TeV**.
* Luminosity criterion (`profile_lum.py`). This uses an illustrative, not simulated, 1 s profile of 1.25 Msun with degeneracy factor 0.85.
  NN only: M_min = 5.0 TeV (T_peak 40, L_crit 3e52) or 3.7 TeV (1e53); 7.2 TeV or 5.3 TeV (T_peak 55).

## 3. Channels that strengthen the bound
* **pi^- p -> n phi phi (`pion.py`)** uses the same validated rules. It absorbs the pion rest energy, which is itself a source of the trace, so there is no conservation suppression; the effective c^2 is about 3.
  All four diagrams interfere constructively; dropping any one of them reduces the rate about 4x.
  Q_pi/Q_NN = 7.7 (Y_pi = 1%) and 23 (3%) at (30 MeV, 3e14); 11-33 at 1e14; 4-13 at T=40 MeV.
  Pauli blocking of the final neutron is included (0.6-0.9). Fore-Reddy give Y_pi = 1-5%.
  Profile results: M_min = 5.6-7.6 TeV (Y_pi 1%, cold) up to 7.2-12.5 TeV (3%, hot).
  Caveats: the in-medium pion dispersion and Y_pi are uncertain (x5), and the rate per pion is uncertain (x2).
  If the pi-pi-phi-phi vertex had 2m^2 - s instead of 2m^2 + s, the rate would be 0.37x.
* Relativistic rho_s != rho_B: there is no escape from the suppression. The identity is exact, so every non-conserved piece (including -p^2/2m^2 and meson fields) sits in T^ij.
  The static mean-field offset does not radiate; its fluctuations are exactly the trace channel above.
* Spin-orbit/tensor terms are already inside T_NN and the potential stress. The explicit spin-orbit term in ubar u is about 1% of the rate.
* Coherent/collective emission: none. Sound and zero-sound modes are spacelike; gapped scalar modes (above ~400 MeV, 2m*) are suppressed by e^{-w/T}; the plasmon couples only via m_e.
* e, nu, gamma, mu: T^mu_mu is proportional to m^2 or to the QED anomaly (about alpha), so these are negligible.
* LPM (collision rate ~ 40 MeV, comparable to w) reduces the rate by <= 20-30%. In-medium m* and T-matrix effects: factor 0.5-2.

## 4. Other stars
* NS cooling (`ns_cooling.py`, degenerate Fermi-surface estimate, quadrupole only): Q proportional to T^6 versus modified Urca proportional to T^8.
  The emission rates are equal at M = 0.5 (T9 = 1), 1.1 (T9 = 0.2) and 1.5 TeV (T9 = 0.1). Photon-era comparison: M of roughly 0.5 TeV.
  So NS cooling gives about 1 TeV, weaker than the SN bound.
* Sun/HB/RG: nuclear and electron quadrupole bremsstrahlung and plasmon decay (via m_e delta n_e) all give M_min < ~0.2 TeV.
  Caveat (symmetron-specific): if rho_star < rho_crit anywhere, then phi = v != 0 and a LINEAR coupling m_N v/M^2 switches on. That gives much stronger, model-dependent bounds.
