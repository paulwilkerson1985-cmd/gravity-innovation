import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Quick chiral-EFT LO cross-check of the finite-omega trace-channel enhancement (S waves).
Local LO chiral potential (Gezerlis et al. 2013/2014 form):
   V_LO(r) = V_OPE(r) [1 - exp(-(r/R0)^4)] + (C_S + C_T s1.s2) delta_R0(r),  delta_R0 = exp(-(r/R0)^4)/(pi Gamma(3/4) R0^3)
   V_OPE(r) = (f^2/4pi)(m_pi/3) t1.t2 [ s1.s2 Y(x) + S12 T(x) ],  x = m_pi r,  f^2/4pi = g_A^2 m_pi^2/(16 pi f_pi^2)
C_1S0 = C_S - 3 C_T and C_3S1 = C_S + C_T are fitted to the PWA93 np 1S0 / 3S1 phase shifts at T_lab = 10 MeV
for R0 = 1.0 and 1.2 fm.  We then compare, channel by channel and thermally averaged, the exact finite-omega trace
matrix element <f|2V + rV'|i> with its omega->0 (time-delay) limit -- the same 'fin/soft' ratio computed for
AV18/Reid93/NijmII in trace_thermal.py -- restricted to the 1S0 and 3S1-3D1 channels so that LO EFT and AV18 are
compared on the same footing.  (LO EFT has no contacts in P and higher waves; those are OPE-only and are not
compared here.)
"""
import numpy as np, sys
from scipy.special import gamma as Gamma
from scipy.optimize import brentq
import pw_solver as ps
from trace_thermal import A_trace, MU, HBARC
import json

HBARC = 197.327; MPI = 138.0; GA = 1.267; FPI = 92.4
F2_4PI = GA ** 2 * MPI ** 2 / (16 * np.pi * FPI ** 2)     # 0.0715
PREF = F2_4PI * MPI / 3.0                                # MeV
pwa = json.load(open((_GI + '/supernova/sn_A/data/pwa93_phases.json')))


def ope_parts(r):
    x = MPI * r / HBARC
    Y = np.exp(-x) / x
    Tt = (1 + 3 / x + 3 / x ** 2) * Y
    return Y, Tt


def pot_chiral(R0, C1S0, C3S1):
    """returns a callable (ch, system, r) -> V(n,2,2) [MeV] for the LO local chiral potential"""
    def V(ch, system, r):
        name, l, S, J, T, coupled = ch
        r = np.asarray(r, float)
        Y, Tt = ope_parts(r)
        flong = 1 - np.exp(-(r / R0) ** 4)
        delta = np.exp(-(r / R0) ** 4) / (np.pi * Gamma(0.75) * R0 ** 3) * HBARC ** 3   # MeV fm^3 -> MeV (delta in fm^-3 x hbarc^3? no: C in MeV fm^3)
        ss = 4 * S - 3; tt = 4 * T - 3
        out = np.zeros((len(r), 2, 2))
        Vc = PREF * tt * ss * Y * flong
        Vt = PREF * tt * Tt * flong
        # contact: C (MeV fm^3) x delta (fm^-3) -> MeV ; delta here carries hbarc^3 factor removed below
        dl = np.exp(-(r / R0) ** 4) / (np.pi * Gamma(0.75) * R0 ** 3)   # fm^-3
        if name == '1S0':
            out[:, 0, 0] = Vc + C1S0 * dl
        elif name == '3S1':
            out[:, 0, 0] = Vc + C3S1 * dl           # S12 = 0 in 3S1 diag
            out[:, 0, 1] = out[:, 1, 0] = np.sqrt(8.0) * Vt    # <3S1|S12|3D1> = sqrt(8)
            out[:, 1, 1] = Vc - 2 * Vt                          # <3D1|S12|3D1> = -2
        else:
            raise ValueError('only 1S0 and 3S1 implemented')
        return out
    return V


_orig = ps.potential
ps.potential = lambda pot, ch, system, r: pot(ch, system, r) if callable(pot) else _orig(pot, ch, system, r)

CH_1S0 = ('1S0', 0, 0, 0, 1, False); CH_3S1 = ('3S1', 0, 1, 1, 0, True)


def phase_at(potfun, ch, Ecm):
    c = ps.Channel(potfun, ch, 'np', np.array([Ecm]), rmax=16.0, h=0.004)
    d1, d2, e = c.bar_phases()
    return d1[0] % 180 if ch[0] == '3S1' else d1[0]


def fit(R0):
    t10_1S0 = pwa['np']['10']['1S0']; t10_3S1 = pwa['np']['10']['3S1'] % 180

    def bracket_root(f, Cs):
        vals = [f(C) for C in Cs]
        for a, b, fa, fb in zip(Cs[:-1], Cs[1:], vals[:-1], vals[1:]):
            if fa * fb < 0 and abs(fa - fb) < 90:     # avoid the 180-degree jump at a bound-state threshold
                return brentq(f, a, b, xtol=1e-3)
        raise RuntimeError('no bracket: ' + str(list(zip(Cs, [round(v, 1) for v in vals]))))
    Cs = np.linspace(-20, -900, 23)
    f1 = lambda C: (phase_at(pot_chiral(R0, C, 0.0), CH_1S0, 5.0) % 180) - t10_1S0
    C1 = bracket_root(f1, Cs)
    f3 = lambda C: (phase_at(pot_chiral(R0, C1, C), CH_3S1, 5.0) % 180) - t10_3S1
    C3 = bracket_root(f3, Cs)
    return C1, C3


class STable:
    """S-wave-only trace table (1S0 + 3S1-3D1, np) with the TraceTable interface used by A_trace"""
    def __init__(self, potfun, E):
        from scipy.interpolate import RegularGridInterpolator
        self.E = E; self.Ecap = None
        H = 0; soft = 0; el = 0
        for ch in (CH_1S0, CH_3S1):
            J = ch[3]
            c = ps.Channel(potfun, ch, 'np', E, rmax=16.0, h=0.004)
            I, G = c.trace_matrix()
            H = H + (2 * J + 1) * np.sum(I ** 2, axis=(2, 3))
            soft = soft + (2 * J + 1) * c.trace_softlimit()
            self.__dict__[f'ph_{ch[0]}'] = c.bar_phases()
        self.H = {'np': RegularGridInterpolator((E, E), H, bounds_error=False, fill_value=None)}
        self.soft = {'np': (E, np.pi * soft)}
        self.Hraw = H; self.softraw = np.pi * soft
        self.k = np.sqrt(ps.U_FAC * E)

    def sigma_tr(self, system, Ef, Ei):
        Efc = np.maximum(Ef, self.E[0])
        Hv = self.H['np'](np.stack([Efc, Ei], -1))
        return np.pi * Hv / (ps.U_FAC * Efc * ps.U_FAC * Ei)

    def sigma_soft(self, system, E):
        return np.interp(E, *self.soft['np'])


if __name__ == '__main__':
    EG = np.concatenate([np.linspace(0.5, 20, 14), np.linspace(24, 180, 40), np.linspace(190, 400, 22)])
    tabs = {}
    print('LO chiral fits (np, phases at T_lab = 10 MeV):')
    for R0 in (1.0, 1.2):
        C1, C3 = fit(R0)
        pf = pot_chiral(R0, C1, C3)
        tabs[f'chiLO R0={R0}'] = STable(pf, EG)
        print(f'  R0={R0} fm: C_1S0={C1:.1f}, C_3S1={C3:.1f} MeV fm^3')
    tabs['AV18'] = STable('AV18', EG)
    print('\nphase shifts (deg) vs PWA93 [1S0 | 3S1 | 3D1 | eps1] at T_lab = 50, 100, 200, 300 MeV:')
    for lab, t in tabs.items():
        for Tl in (50, 100, 200, 300):
            i = int(np.argmin(np.abs(EG - Tl / 2)))
            d1 = t.ph_1S0[0][i]; d3 = t.ph_3S1
            ref = pwa['np'][str(Tl)]
            print(f'  {lab:14s} T_lab~{2*EG[i]:4.0f}: 1S0 {d1:6.1f}/{ref["1S0"]:6.1f}  3S1 {d3[0][i]%180:6.1f}/{ref["3S1"]%180:6.1f}  3D1 {d3[1][i]:6.1f}/{ref["3D1"]:6.1f}  eps1 {d3[2][i]:5.1f}/{ref["E1"]:5.1f}')
    print('\ndiagonal check sigma_tr(E,E)/soft (should be 1) and finite-omega ratio |F(E_f,E_i)|^2 / |F_soft(kbar)|^2 at w/E = 0.5, 0.8:')
    for lab, t in tabs.items():
        row = []
        for E in (25., 50., 100., 150.):
            i = int(np.argmin(np.abs(EG - E)))
            diag = t.sigma_tr('np', np.array([EG[i]]), np.array([EG[i]]))[0] / t.sigma_soft('np', EG[i])
            rr = []
            for wf in (0.5, 0.8):
                Ef = EG[i] * (1 - wf); kbar2 = 0.5 * (EG[i] + Ef)
                rr.append(t.sigma_tr('np', np.array([Ef]), np.array([EG[i]]))[0] / t.sigma_soft('np', kbar2))
            row.append(f'E={EG[i]:.0f}: diag {diag:.3f}, r(0.5)={rr[0]:.2f}, r(0.8)={rr[1]:.2f}')
        print(f'  {lab:14s} ' + ' | '.join(row))
    print('\nthermal S-wave trace integral (np, MB): A_fin/A_soft and A_fin relative to AV18')
    ref = None
    for T in (20., 30., 40.):
        line = f'  T={T:.0f}: '
        for lab, t in tabs.items():
            Af = A_trace(t, 'np', T, soft=False); As = A_trace(t, 'np', T, soft=True)
            if lab == 'AV18': ref = (Af, As)
            line += f'{lab}: fin/soft={Af/As:.2f} (A_fin={Af:.3e})  '
        for lab, t in tabs.items():
            if lab != 'AV18':
                Af = A_trace(t, 'np', T, soft=False); As = A_trace(t, 'np', T, soft=True)
                line += f'[{lab}/AV18: fin {Af/ref[0]:.2f}, soft {As/ref[1]:.2f}] '
        print(line, flush=True)
