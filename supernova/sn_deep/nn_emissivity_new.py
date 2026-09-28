import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Consolidated NN -> NN phi phi emissivity with (a) traceless channel from sn_B (PWA93-like), (b) finite-omega
trace channel from AV18 (exact <f|2V+r V'|i>), (c) Fermi-Dirac degeneracy factors per channel (trace_degeneracy.py).
Outputs eps(1 TeV) [erg/g/s], K_T^MB, K_T^FD, and the Raffelt-point M_min; also a fit of eps_NN(rho,T) for profile use."""
import numpy as np, sys, json
sys.path.insert(0, (_GI + '/supernova/sn_B'))
from sn_rate import S_integrand, HBARC, GCC_PER_FM3, MeV5_to_cgs, Q_OP, Mmin_raffelt
from trace_thermal import TraceTable, A_trace
from trace_degeneracy import R_deg

M1 = 1e6


def eps_NN(T, rho, Yp, tab, degenerate=True, Ndeg=20000):
    nB = rho / GCC_PER_FM3
    nn_ = nB * (1 - Yp) * HBARC ** 3; np_ = nB * Yp * HBARC ** 3
    pref = 1 / (64 * np.pi ** 4 * M1 ** 4)
    Qtl = Qtr = QtlFD = QtrFD = 0.0
    for lab, sys_, wgt, (na, nb) in (('nn', 'nn', nn_ ** 2 / 2, (nB * (1 - Yp),) * 2), ('pp', 'nn', np_ ** 2 / 2, (nB * Yp,) * 2),
                                    ('np', 'np', nn_ * np_, (nB * (1 - Yp), nB * Yp))):
        At, _ = S_integrand(sys_, T)
        Atr = A_trace(tab, sys_, T)
        qtl = pref * wgt * At; qtr = pref * wgt * Atr
        Qtl += qtl; Qtr += qtr
        if degenerate:
            R, _ = R_deg(tab, sys_, T, na, nb, N=Ndeg)
            QtlFD += qtl * R[0]; QtrFD += qtr * R[2]
    out = dict(T=T, rho=rho, Yp=Yp, eps_tl=Qtl * MeV5_to_cgs / rho, eps_tr=Qtr * MeV5_to_cgs / rho,
               K_MB=1 + Qtr / Qtl)
    if degenerate:
        out.update(eps_tl_FD=QtlFD * MeV5_to_cgs / rho, eps_tr_FD=QtrFD * MeV5_to_cgs / rho,
                   K_FD=1 + QtrFD / QtlFD, eps_NN_FD=(QtlFD + QtrFD) * MeV5_to_cgs / rho)
    return out


if __name__ == '__main__':
    tab = TraceTable('AV18')
    rows = []
    print(' T   rho    Yp | eps_tl(MB) eps_tr(MB) K_MB | eps_tl(FD) eps_tr(FD) K_FD | eps_NN(FD,1TeV) | M_min Raffelt | note eps_NN(K=6.5)')
    for T, rho, Yp in [(20, 3e14, 0.3), (30, 3e14, 0.3), (40, 3e14, 0.3), (30, 1e14, 0.3), (40, 1.5e14, 0.15),
                       (30, 2e14, 0.12), (42, 2.6e14, 0.13), (25, 4.4e14, 0.22), (31, 2.8e14, 0.12)]:
        o = eps_NN(T, rho, Yp, tab)
        rows.append(o)
        print(f"{T:3.0f} {rho:.1e} {Yp:.2f} | {o['eps_tl']:.2e} {o['eps_tr']:.2e} {o['K_MB']:5.2f} | "
              f"{o['eps_tl_FD']:.2e} {o['eps_tr_FD']:.2e} {o['K_FD']:5.2f} | {o['eps_NN_FD']:.3e} | "
              f"{Mmin_raffelt(o['eps_NN_FD'] * rho / MeV5_to_cgs, rho):5.2f} TeV | {6.5*o['eps_tl_FD']:.2e}", flush=True)
    json.dump(rows, open((_GI + '/supernova/sn_deep/nn_emissivity_new.json'), 'w'), indent=1)
