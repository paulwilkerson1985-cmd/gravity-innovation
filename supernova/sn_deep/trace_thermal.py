import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Thermal TRACE-channel emissivity with the exact finite-omega matrix element <f|2V + r dV/dr|i>
from realistic potentials (tables from trace_tables.py), compared with (i) the omega->0 Wigner-time-delay
form evaluated at kbar = sqrt((k^2+k'^2)/2) (as in sn_B/sn_rate.py) and (ii) the pure traceless channel
(sn_B/sn_rate.py, PWA93-like phases, Maxwell-Boltzmann).  Gives K_T = Q_tot/Q_traceless.

Rate per unit pair density (same measure as sn_B.S_integrand):
  A_tr = int d^3k P(k) int_0^E dw w^4 v'(k') (68/315) sigma_tr(k', k)
with k'^2 = k^2 - 2 mu w.  Change variable w -> k': dw v' sigma_tr = dk' w^4 (w pi H)/(mu^2 k^2)  (smooth at k'->0).
"""
import numpy as np, sys
from scipy.interpolate import RegularGridInterpolator
sys.path.insert(0, (_GI + '/supernova/sn_B'))
from sn_rate import S_integrand, MU, MN, HBARC, GCC_PER_FM3, MeV5_to_cgs, Q_OP, Mmin_raffelt

U_FAC = MN / HBARC ** 2


class TraceTable:
    def __init__(self, pot, Ecap=None):
        d = np.load((_GI + f'/supernova/sn_deep/trace_{pot}.npz'))
        self.E = d['E']; self.pot = pot; self.Ecap = Ecap
        self.H = {s: RegularGridInterpolator((self.E, self.E), d[f'H_{s}'], bounds_error=False, fill_value=None)
                  for s in ('nn', 'np')}
        self.soft = {s: (self.E, d[f'soft_{s}']) for s in ('nn', 'np')}
        self.el = {s: (self.E, d[f'el_{s}']) for s in ('nn', 'np')}

    def _cap(self, E):
        return np.minimum(E, self.Ecap) if self.Ecap else E

    def sigma_tr(self, system, Ef, Ei):
        """finite-omega trace cross section [fm^2]; Ef, Ei arrays (MeV, cm). With Ecap: evaluate H at capped
        energies but keep the kinematic 1/(k_i k_f)^2 -> mimics 'hold cross sections constant above cap'."""
        w = 2.0 if system == 'nn' else 1.0
        Efc, Eic = self._cap(np.maximum(Ef, self.E[0])), self._cap(Ei)
        H = self.H[system](np.stack([Efc, Eic], -1))
        kf2 = U_FAC * np.maximum(Ef, self.E[0]); ki2 = U_FAC * Ei
        if self.Ecap:   # rescale so that sigma_tr is held at its value at the cap (both k's capped consistently)
            kf2c = U_FAC * Efc; ki2c = U_FAC * Eic
            return w * np.pi * H / (kf2c * ki2c)
        return w * np.pi * H / (kf2 * ki2)

    def sigma_soft(self, system, E):
        Eg, s = self.soft[system]
        return np.interp(self._cap(E), Eg, s)


def A_trace(tab, system, T, nk=200, nkf=64, soft=False):
    """int d^3k P(k) int dw w^4 v' (68/315) sigma_tr  [same units as sn_B.S_integrand's Ab]"""
    kmax = np.sqrt(2 * MU * T * 40)
    ks = np.linspace(1e-3, kmax, nk); dk = ks[1] - ks[0]
    Pk = 4 * np.pi * ks ** 2 * (2 * np.pi * MU * T) ** -1.5 * np.exp(-ks ** 2 / (2 * MU * T))
    xg, wg = np.polynomial.legendre.leggauss(nkf)
    A = 0.0
    for k, P in zip(ks, Pk):
        E = k ** 2 / (2 * MU)
        kf = 0.5 * k * (xg + 1); wkf = 0.5 * k * wg           # k' from 0..k
        w = (k ** 2 - kf ** 2) / (2 * MU)
        Ef = kf ** 2 / (2 * MU)
        if soft:
            kbar = np.sqrt(0.5 * (k ** 2 + kf ** 2)); Eb = kbar ** 2 / (2 * MU)
            st = tab.sigma_soft(system, Eb)                    # fm^2
            integrand = w ** 4 * (kf / MU) * st * (kf / MU)    # dw = kf dkf/mu ; v' = kf/mu
        else:
            st = tab.sigma_tr(system, Ef, np.full_like(Ef, E))
            integrand = w ** 4 * (kf / MU) * st * (kf / MU)
        A += P * dk * np.sum(wkf * integrand) * (68. / 315) / HBARC ** 2   # fm^2 -> MeV^-2
    return A


def Q_channels(T, nB, Yp, tab, M=1e6, **kw):
    nn_ = nB * (1 - Yp) * HBARC ** 3; np_ = nB * Yp * HBARC ** 3
    pref = 1 / (64 * np.pi ** 4 * M ** 4)
    out = {'tl': 0.0, 'tr_B': 0.0, 'tr_soft': 0.0, 'tr_fin': 0.0}
    for lab, sys_, wgt in (('nn', 'nn', nn_ ** 2 / 2), ('pp', 'nn', np_ ** 2 / 2), ('np', 'np', nn_ * np_)):
        At, Ab = S_integrand(sys_, T)                          # sn_B: traceless & omega->0 trace with B's phases
        out['tl'] += pref * wgt * At
        out['tr_B'] += pref * wgt * Ab
        out['tr_soft'] += pref * wgt * A_trace(tab, sys_, T, soft=True, **kw)
        out['tr_fin'] += pref * wgt * A_trace(tab, sys_, T, soft=False, **kw)
    return out


if __name__ == '__main__':
    rho = 3e14; nB = rho / GCC_PER_FM3; Yp = 0.3
    pots = sys.argv[1:] or ['AV18', 'Reid93', 'NijmII']
    print('K_T = 1 + Q_trace/Q_traceless  (Maxwell-Boltzmann, rho=3e14, Yp=0.3; traceless from sn_B PWA93-like tables)')
    print(' pot      Ecap  T | K_T(B, w->0 approx tables) | K_T(pot, w->0 at kbar) | K_T(pot, exact finite w) | fin/soft |'
          ' eps_NN(1TeV) fin [erg/g/s] | M_min NN-only (Raffelt)')
    for pot in pots:
        for Ecap in (None, 175.0):
            tab = TraceTable(pot, Ecap=Ecap)
            for T in (20., 30., 40.):
                q = Q_channels(T, nB, Yp, tab)
                KB = 1 + q['tr_B'] / q['tl']; Ks = 1 + q['tr_soft'] / q['tl']; Kf = 1 + q['tr_fin'] / q['tl']
                eps = (q['tl'] + q['tr_fin']) * MeV5_to_cgs / rho
                print(f" {pot:7s} {str(Ecap):5s} {T:3.0f} |   {KB:6.2f}   |   {Ks:6.2f}   |   {Kf:6.2f}   |  {q['tr_fin']/q['tr_soft']:5.2f}  |"
                      f"  {eps:9.3e}  |  {Mmin_raffelt(q['tl']+q['tr_fin'], rho):5.2f} TeV", flush=True)
