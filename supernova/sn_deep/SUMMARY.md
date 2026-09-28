> **Working log (26–27 Sep 2026).** Kept as written. Where it differs from `docs/sn_technical_note_v2.md` (v2.1), the note wins: K_T = 12 (10–13) MB, 6.7–8.1 with Pauli blocking; universal bound M ≳ 6 TeV (5–8); nucleon-mass-only operator ≈ 4.5 TeV (3.8–5.8). The ΔN_eff discussion is superseded by `cosmology/neff_proper/`.

# SN deepening: running summary (updated incrementally)

Folder: `supernova/sn_deep/` of this repository. All numbers at M = 1 TeV unless stated; eps in erg/g/s.

## 0. Tooling (done)
- `nnpots.*.so` (f2py): AV18 (`av18pot.f`), Reid93 (`rreid93.f`), Nijmegen-II (`rnijm.f`) partial-wave potentials.
- `pw_solver.py`: Numerov coupled-channel solver (J <= 4, incl. 3S1-3D1, 3P2-3F2, 3D3-3G3, 3F4-3H4), K/S-matrix,
  bar phases, and the exact finite-omega trace matrix element <f|2V + r dV/dr|i> between eigenchannel standing waves.
  **Bug fixed this session**: sign of the cos-amplitude in the asymptotic matching (Cramer's rule) flipped all
  phase shifts; after the fix AV18/Reid93/NijmII reproduce PWA93 np phases to <~0.5 deg for T_lab <= 300 MeV
  (1S0, 3S1, 3D1, eps1, all P, D, F, G waves checked; `python3 pw_solver.py`).

## 1. Finite-omega trace channel and K_T (done)
Scripts: `trace_tables.py` (-> `trace_{AV18,Reid93,NijmII}.npz`), `trace_thermal.py`, `trace_degeneracy.py`,
`nn_emissivity_new.py` (-> `nn_emissivity_new.json`).

**Theorem check.** sigma_tr(E,E) from the exact <f|2V+rV'|i> equals the Wigner-time-delay form
w pi Sum(2J+1)(1/4)Tr|dS/dk|^2 to 0.1% for E_cm >= 10 MeV, all channels, all three potentials.
c_tr^2 = sigma_tr/sigma_el = 3.0-3.1 (nn), 2.75-2.8 (np) for T_lab = 180-380 MeV (B's approximate tables: 2.3-3.1).

**Finite omega.** The omega^4 phase space samples omega ~ E, where the exact matrix element exceeds the omega->0 form.
Thermal (Maxwell-Boltzmann) trace/traceless ratio at rho = 3e14, Y_p = 0.3:

| T (MeV) | K_T note (B, w->0 approx) | K_T (pot, w->0 at kbar) | **K_T (exact finite w)** | finite/soft |
|---|---|---|---|---|
| 20 | 6.4 | 6.7 | 11.6-11.8 | 1.86-1.90 |
| 30 | 6.4 | 6.8-7.2 | 12.1-12.3 | 1.82-1.92 |
| 40 | 5.9 | 6.7-7.6 | 11.6-12.1 | 1.69-1.86 |

Spread across AV18/Reid93/NijmII <= 3%; holding sigma_tr fixed above E_cm = 175 MeV (fit range) changes <= 3%.
So **K_T^MB = 12 +- 1**, confirming A's potential-model 8-14 and superseding the adopted 6.5 (4-14).

**Degeneracy.** The finite-omega enhancement lives at large omega (slow final nucleons) and is Pauli-blocked more
strongly than the soft form. R = Q_FD/Q_MB at (30 MeV, 3e14, Y_p=0.3): traceless 0.91-1.00 (A's 0.99 confirmed;
B's 0.85 was MC noise), trace w->0 0.74-0.89, **trace finite-w 0.55-0.76** (nn/np/pp). Net:

| T, rho, Y_p | K_T^FD | eps_NN^FD (new) | eps_NN note (6.5 x eps_T^FD) | ratio | M_min NN-only (Raffelt) new/old |
|---|---|---|---|---|---|
| 30, 3e14, 0.30 | 8.1 | 5.4e21 | 4.3e21 | 1.25 | 4.8 / 4.6 TeV |
| 40, 3e14, 0.30 | 9.1 | 2.7e22 | 1.9e22 | 1.41 | 7.2 / 6.5 |
| 20, 3e14, 0.30 | 6.3 | 4.9e20 | 5.1e20 | 0.96 | 2.65 / 2.75 |
| 42, 2.6e14, 0.13 (hot-profile peak) | 8.4 | 2.7e22 | 2.1e22 | 1.29 | - |
| 31, 2.8e14, 0.12 (cold-profile peak) | 7.0 | 4.8e21 | 4.5e21 | 1.08 | - |
| 30, 1e14, 0.30 | 10.5 | 2.4e21 | 1.5e21 | 1.62 | - |

**Bottom line for K_T:** replace "K_T = 6.5 (4-14)" by "K_T^MB = 12 +- 1 from exact finite-omega matrix elements of
AV18/Reid93/NijmII; with Fermi-Dirac blocking the effective K_T is 7-10 in the emitting zones". The NN-only bound
rises by 5-15% (profile-dependent); the central (pion-dominated) bound by <~5%. Residual trace-channel uncertainty
is now dominated by in-medium effects (m*, T-matrix, LPM), not by the omega-dependence.

## 1b. Chiral-EFT LO cross-check of the finite-omega enhancement (done, `chiral_lo_check.py/.out`)
Local LO chiral potential (regulated OPE + C_S, C_T contacts, delta_R0 = exp[-(r/R0)^4]/(pi Gamma(3/4) R0^3), R0 = 1.0 and
1.2 fm; contacts fitted to the PWA93 np 1S0/3S1 phases at T_lab = 10 MeV: C_1S0 = -355/-430, C_3S1 = -102/-349 MeV fm^3).
- The time-delay identity holds for these potentials too: sigma_tr(E,E)/soft = 1.000-1.005 (independent confirmation with a
  completely different short-range form).
- Per matrix element the finite-omega enhancement |F(E_f,E_i)|^2/|F_soft(kbar)|^2 is 1.6-1.8 at w/E = 0.8 (AV18: 1.7-2.1) and
  1.0-1.1 at w/E = 0.5 (AV18: 1.1-1.2): the effect is robust, its size mildly model dependent.
- Thermally (S waves, np, MB): fin/soft = 2.1-2.5 (LO, both R0) vs 3.0-3.1 (AV18) at T = 20-40 MeV. S waves carry 85-90% of the
  finite-omega trace channel, so an LO-EFT-like short-range dynamics would give K_T^MB ~ 10 instead of 12.
- Caveat: LO chiral phases are far from data above 50 MeV (1S0 at 300 MeV: +30 deg vs -4.5 deg), so only the *ratio* is
  meaningful; the AV18/Reid93/NijmII spread (<= 3%) understates the model dependence because those three share the fitted
  phases and similar cores. **Adopted: K_T^MB = 12 (10-13); K_T^FD = 6.7-8.1 at the Raffelt point** (R_tr/R_tl = 0.63), i.e.
  the NN-only Raffelt-point bound is 4.6-4.8 TeV. An N2LO/N3LO evaluation (data-quality phases, soft cores) is the check that
  would settle the last ~20%.

## 2. Transport in the semi-trapped regime (done)
Scripts: `transport_mc.py` (-> `transport_mc.json`), `diffusion_1d.py`.
Physics: phi-N contact scattering sigma = 2.7e-41 cm^2 (TeV/M)^4, isotropic in CM with full kinematics against
Maxwellian nucleons (energy degradation), re-absorption by detailed balance Gamma_abs = Q/u_BB (u_BB = pi^2 T^4/30),
production positions from Q(r) = Q_NN (new fit, K_T^FD) + Q_pi (note eq. 4.1), spectra <w_pair> = 6T (NN), 190 MeV (pi).
Monte Carlo ray-tracing through the inhomogeneous parametrised cold/hot profiles (bug fixed: direction kept across
sub-steps; earlier version added an artificial 3-km scattering atmosphere).

| profile / channels | M (TeV) | tau_c | f_esc = L_esc/L_prod | absorbed frac. | <E_esc>/<E_prod> | M_min self-consistent (free-streaming) |
|---|---|---|---|---|---|---|
| cold, NN only | 4 / 5 / 6 | 33 / 13 / 6.5 | 0.64 / 0.73 / 0.84 | 0.04 / 0.01 / 0 | 0.67 / 0.74 / 0.84 | **3.5 (4.1)** |
| cold, NN + pi (1%) | 4 / 5 / 6 | 33 / 13 / 6.5 | 0.50 / 0.68 / 0.77 | 0.20 / 0.04 / 0.01 | 0.63 / 0.71 / 0.78 | **5.3 (5.8)**; 4.3 (5.0) for 5.7e52 |
| hot, NN only | 4 / 5 / 6 | 29 / 12 / 5.7 | 0.60 / 0.71 / 0.82 | 0.05 / 0.01 / 0 | 0.63 / 0.72 / 0.82 | **6.0 (6.3)**; 4.9 (5.4) |
| hot, NN + pi (1%) | 5 / 6 / 8 | 12 / 5.7 / 1.8 | 0.75 / 0.84 / 0.94 | 0.04 / 0.01 / 0 | 0.78 / 0.84 / 0.94 | **7.9 (8.1)**; 6.7 (6.9) |

- The note's ad hoc factor M_min x (0.85-0.95) is confirmed and sharpened: **x0.92 (cold) - 0.98 (hot) for the central
  case, x0.85-0.95 for NN-only.** Energy degradation dominates; re-absorption matters only for M <~ 4 TeV.
- Lower edge of the band: the deterministic diffusion solve (no degradation) gives L_esc/3e52 = 1.2 (cold NN-only)
  to 3.9 (hot NN-only) at M = 1 TeV, peaking at M ~ 2-2.5 TeV (x4-30). With degradation (MC, M >= 2.5) the cold
  NN-only case is only x1.4-1.5 above 3e52 at 2.5-3 TeV. **The excluded band extends down to ~1-2 TeV**; the note's
  "~1 TeV" is right for the hot profile and marginal for the cold one. Important: the naive blackbody-at-the-phi-sphere
  argument overestimates L in the trapped regime by ~10-30x, because the phi "energy sphere" (t_abs < t_diff) lies
  far inside the scattering sphere (like nu_mu/nu_tau); this should be said in the note.

## 3. Public profiles (not obtained; exactly what was tried, 26 Sep 2026)
1. Garching CCSN archive (https://wwwmpa.mpa-garching.mpg.de/ccsnarchive/archive.html): index is public and lists
   `Bollig2016_radial_profiles/` (SFHo 20 Msun 1D muon models, PRL 119, 242702), `Bollig2020_TOV_solver`, `Bollig2021/`,
   `Heinlein2023/hydro/` and `hydroFiorilloEtAl23/` (1D PNS-cooling radial hydro profiles behind Fiorillo et al. 2023,
   arXiv:2308.01403), `Huedepohl2010-data`, `s9.0_radial_profiles`, `Ringler2020_profiles_16/20`, `Ertl*`, `Lella2026/`.
   Every one of these returns HTTP 401 (HTTP basic auth). The archive page states "Some of the archives are password
   protected. Please get in touch" (contact H.-T. Janka). So it is registration/request-based, not open.
   **Best target to request: `Heinlein2023/hydroFiorilloEtAl23` (SFHo, LS220, muons, 1D, times to 10 s).**
2. arXiv abstract pages checked for ancillary files: 2109.03244 (Caputo-Raffelt-Vitagliano), 2306.01048 (Lella+23),
   1906.11844 and 2010.02943 (Carenza+), 2308.01403 (Fiorillo+23), 1605.08780 (Fischer+16), 2410.17347 (Hardy+),
   2603.04513 (Joseph+26): none has ancillary data.
3. Nakazato Supernova Neutrino Database (asphwww.ph.noda.tus.ac.jp/snn): open, but contains neutrino spectra/luminosities
   only (intp*/integ* files), no hydro profiles. Zenodo records 5778224, 4632495, 20095084 (Nakazato/Suwa PNS-cooling
   spectra) likewise spectra only; 17053872 is an EOS/M-R table, not a profile.
4. GitHub code search is blocked from this environment; two web searches found no public SFHo-18.8 or other 1-s PNS
   T(r), rho(r), Y_e(r) files.
Parametrised cold/hot profiles therefore remain; their spread (x1.35 in M_min) is the leading "profile" error. Action for
the outreach email: ask the reviewer for one 1-s profile (T, rho, Y_e; Y_pi if available) from Heinlein2023 or the
Reddy/Carenza groups' SFHo-18.8.

## 4. Other channels and operator variants (estimates)
- `twobody_estimate.py`: bremsstrahlung from two-body pion absorption and its inverse (pi^- np <-> nn, NN <-> NN pi),
  scalar charge change Delta S ~ m_pi^2/E_pi + E_pi - w ~ 290 MeV - w (not conservation-suppressed); with pionic-atom
  absorption widths Gamma_abs ~ 50 MeV (rho/rho_0)^2 for thermal pions: eps ~ 5.6e21 (Y_pi/1%) erg/g/s at 1 TeV, i.e.
  **~13% of the one-body pi^- p -> n phi phi channel** (M_min +3%). Worth one sentence, not a recalculation.
- Delta(1232) ↔ N pi transitions (Y_Delta ~ 1e-4-1e-3): <~1% of the pion channel. No tree-level Delta pole in
  pi p -> n phi phi (T^mu_mu is diagonal in the baryon basis).
- pi pi -> phi phi: with the crossed vertex (2 m_pi^2 + s) and n_pi0/n_p ~ 4e-4 at 30 MeV: ~ few % of absorption
  (the note's 1e-3 looks low by ~10x but it is still negligible).
- **Operator variant (Olive-Pospelov's literal m_N NbarN phi^2, no pion/meson coupling):** trace matrix element becomes
  <f|V|i> instead of <f|2V + rV'|i> (`trace_tables.py --nucleon`): K_T^MB = 5.3 / 3.6 / 2.8 at T = 20/30/40 MeV
  (vs 12 universal); pion channel drops to the nucleon-leg diagrams alone (A's basis: 1.0e3/4.6e3 = 0.22x).
  So for OP's own operator the bound is weaker still (~x0.7 in M relative to the universal case). The note must say
  which operator it bounds; the "OP is too strong" statement should be made separately for both.

## 5. Net effect on the headline numbers (this session)
| | note | now |
|---|---|---|
| K_T (MB) | 6.5 (4-14) | 12 +- 1 (AV18/Reid93/NijmII exact finite-omega); K_T^FD = 7-10 in emitting zones |
| eps_NN^FD(30 MeV, 3e14) | 4.3e21 | 5.4e21 |
| NN-only, Raffelt point | 4.6 TeV | 4.8 TeV |
| NN-only, profiles, free streaming (3e52) | 4.15 / 6.1 | 4.1 / 6.3 |
| NN-only with transport | 3.5-5.8 (ad hoc x0.85-0.95) | 3.5 / 6.0 (MC) |
| central (NN + pi 1%), profiles, free streaming | 5.8 / 8.1 | 5.8 / 8.1 |
| **central with transport** | 5.0-7.7 (ad hoc) | **5.3 / 7.9 (MC)** -> "M >~ 6 TeV (5-8)" stands |
| floor (traceless only) | 2.2-3.9 | unchanged (2.2-3.9; x0.9-0.95 with transport at 3-4 TeV) |
| lower edge of band | ~1 TeV | 1-2 TeV (profile dependent) |
Dominant remaining uncertainties: Y_pi (x0.3-3 -> M x0.75-1.3), in-medium NN (m*, T-matrix, LPM: x0.5-2 -> M x0.85-1.2),
profile (x1.35 in M), two-body pion bremsstrahlung (+3%), operator identity (universal vs nucleon-only: x0.7).

## 6. Final numbers (this session), uncertainty budget, and what an expert should check first
| Quantity | old (note) | **new** |
|---|---|---|
| K_T (MB) | 6.5 (4-14) | **12 (10-13)**: AV18/Reid93/NijmII exact finite-omega 11.6-12.3; LO-EFT-like cores -> ~10 |
| K_T (FD, Raffelt point) | ~5.4 | **6.7-8.1** (7-10 in profile emitting zones) |
| eps_NN^FD(30 MeV, 3e14, Y_p=0.3), 1 TeV | 4.3e21 | **5.4e21** erg/g/s (fit: 5.4e21 (rho/3e14)^0.75 (T/30)^5.7 g(Y_p)) |
| NN-only, Raffelt point | 4.6 TeV | **4.6-4.8 TeV** |
| NN-only, profiles, with transport (L<3e52) | 3.5-5.8 (x0.85-0.95 by hand) | **3.5 (cold) / 6.0 (hot) TeV** (MC) |
| central NN+pi(1%), profiles, with transport | 5.0-7.7 (by hand) | **5.3 (cold) / 7.9 (hot) TeV**; 4.3 / 6.7 for L<5.7e52 |
| headline | M >~ 6 TeV (5-8) | **M >~ 6 TeV (5-8) stands; the number to defend in print is 5-6 TeV** |
| floor (traceless only, on-shell data) | 2.2-3.9 | unchanged 2.2-3.9 (x0.9-0.95 transport) |
| lower edge of the excluded band | ~1 TeV | **1-2 TeV** (profile dependent; blackbody-at-phi-sphere overestimates L by 10-30x) |
| two-body pion bremsstrahlung (new channel) | - | +13% of the pi channel (+3% in M) |
| OP's literal operator (m_N NbarN only) | - | K_T^MB 2.8-5.3, pion channel x0.22 -> M_min ~0.7x universal |

Uncertainty budget for the central bound (factor on M_min, roughly independent):
| input | range | effect on M_min | rank |
|---|---|---|---|
| Y_pi- and in-medium pion physics (Fore+23 mass shift, Delta-hole, blocking 0.4-0.7) | x0.3-3 in rate | **x0.75-1.3** | 1 |
| PNS profile (cold vs hot, single 1-s snapshot, criterion 3e52 vs 5.7e52) | x1.35 between profiles; x0.85 criterion | **x0.8-1.2** | 2 |
| in-medium NN (m*, T-matrix, LPM) on the trace channel | x0.5-2 in rate | x0.85-1.2 (NN-only); x0.95-1.05 (central) | 3 |
| K_T finite-omega / short-range model dependence | 10-13 (MB) | x0.95-1.02 (NN-only 4.6-4.8) | 4 |
| transport (energy degradation, re-absorption) | MC done; spectra +-30% | x0.97-1.03 | 5 |
| two-body pion processes, pi pi -> phi phi, Delta | +10-15% | x1.03 | 6 |

What an expert should check first (in order):
1. The identity <f|S|i> = <f|2V + r V'|i> and its omega->0 limit (1 + k d/dk)T -> e^{2i delta} delta'(k) (one page; our three-potential
   check reproduces it to 0.1%, `trace_tables.py` diagonal). This is the one new theorem everything else hangs on.
2. The kappa-weights (2/105 traceless, 68/315 trace) and the absence of a cross term in <|P:X|^2>.
3. The pi^- p -> n phi phi matrix element in one field basis (pion-line diagram dominance, vertex sign 2m_pi^2 + s) and the
   final-neutron blocking factor; then Y_pi- with the 2023 in-medium mass shift.
4. Whether the finite-omega enhancement survives with a soft (N3LO chiral) potential fitted to data: our LO check says ~0.8x.
5. Run the emissivity fits on a real 1-s profile (Heinlein2023 / SFHo-18.8) with the luminosity criterion over 1-10 s.

Scripts added this session (later part): `chiral_lo_check.py/.out`. Design-study work requested mid-session lives in
`design/` (own SUMMARY.md).
