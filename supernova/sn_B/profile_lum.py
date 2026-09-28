"""
Luminosity criterion with an ILLUSTRATIVE proto-neutron-star profile at t_pb ~ 1 s
(shape modelled on published SFHo-18.8-like profiles: dense cool centre, hot mantle T_peak ~ 40 MeV
at r ~ 10 km; 'hot' variant T_peak ~ 55 MeV).  NOT a simulation output -- treat as +-factor-2 in L.
L_phi(M) = int 4 pi r^2 Q dr ;  M_min = 1 TeV * (L(1 TeV)/L_crit)^(1/4)
"""
import numpy as np
from sn_rate import Q_pair, GCC_PER_FM3, MeV5_to_cgs, Mmin_raffelt
from pion import pion_rate, HBARC

r_km = np.array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20.])
rho14 = np.array([6.5, 6.4, 6.2, 5.9, 5.5, 5.0, 4.4, 3.8, 3.2, 2.6, 2.0, 1.5, 1.05, 0.7, 0.45, 0.28, 0.17, 0.06, 0.02])  # tuned: M(<20km)~1.25 Msun
T_cold = np.array([21, 21.5, 23, 25, 28, 31, 34, 37, 39, 40, 39.5, 37, 33, 28, 23, 19, 16, 12, 9.])
T_hot = np.array([26, 27, 29, 33, 37, 42, 47, 51, 54, 55, 53, 49, 43, 36, 29, 23, 19, 14, 10.])
Yp = np.interp(r_km, [0, 8, 12, 16, 20], [0.33, 0.25, 0.15, 0.08, 0.06])
M1 = 1e6
DEG = 0.85   # average degeneracy factor (degeneracy.py: 0.66-0.9 in the relevant zones)


def lum(Tprof, Ypi):
    LNN = []; Lpi = []
    for rk, rh, T, yp in zip(r_km, rho14, Tprof, Yp):
        nB = rh * 1e14 / GCC_PER_FM3
        q = Q_pair(T, nB, yp, M1)['total'] * DEG
        LNN.append(q)
        if Ypi > 0:
            r, dr, _ = pion_rate(T, nB * yp, nB * (1 - yp), Npts=600, seed=int(rk))
            Lpi.append(Ypi * nB * nB * yp * HBARC ** 6 * r / M1 ** 4)
        else:
            Lpi.append(0.0)
    rcm = r_km * 1e5
    f = lambda Q: np.trapezoid(4 * np.pi * rcm ** 2 * np.array(Q) * MeV5_to_cgs, rcm)
    return f(LNN), f(Lpi)


if __name__ == '__main__':
    mass = np.trapezoid(4 * np.pi * (r_km * 1e5) ** 2 * rho14 * 1e14, r_km * 1e5) / 1.989e33
    print(f"profile enclosed mass (r<20 km) = {mass:.2f} Msun")
    for lab, Tp in (('cold (Tpeak 40)', T_cold), ('hot (Tpeak 55)', T_hot)):
        for Ypi in (0.0, 0.01, 0.03):
            LNN, Lpi = lum(Tp, Ypi)
            for Lc in (3e52, 1e53):
                Mnn = (LNN / Lc) ** 0.25; Mtot = ((LNN + Lpi) / Lc) ** 0.25
                print(f"{lab:16s} Ypi={Ypi:.2f} Lcrit={Lc:.0e}: L_NN(1TeV)={LNN:.2e} L_pi={Lpi:.2e} erg/s"
                      f" -> M_min NN-only {Mnn:.2f} TeV, NN+pi {Mtot:.2f} TeV")
