import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""
Spin-averaged NN differential cross sections from Nijmegen PWA93 phase shifts
(nuclear-bar / Stapp convention), for
  - 'np' : neutron-proton (all partial waves, distinguishable particles)
  - 'nn' : identical-nucleon T=1 channel, using pp *nuclear* phase shifts with
           Coulomb switched off (standard approximation for nn; CIB/CSB ignored).

M-matrix in the |S m> basis (e.g. Gloeckle, "The Quantum Mechanical Few-Body Problem"):
 M^S_{m'm}(th) = sqrt(4pi)/(2ik) sum_{J L L'} i^{L-L'} sqrt(2L+1) <L0 S m|J m>
                 <L' m-m', S m'|J m> (S^J_{L'L} - delta) Y_{L'}^{m-m'}(th,0)
dsigma/dOmega = (1/4) sum |M|^2  (x4 amplitude factor 2 for identical particles,
                                   i.e. factor 4 in cross section, allowed waves only).
Validated against nn-online.org PWA93 DSG output (see validate()).
"""
import json, numpy as np
from functools import lru_cache
from sympy.physics.wigner import clebsch_gordan
from scipy.special import sph_harm_y

HBARC = 197.3269804  # MeV fm
MN = 938.918         # MeV (average nucleon)
DATA = json.load(open((_GI + '/supernova/sn_A/data/pwa93_phases.json')))

SPEC = 'SPDFGHIKLM'
def wave_name(L, S, J):
    return f"{2*S+1}{SPEC[L]}{J}"

@lru_cache(maxsize=None)
def cg(j1, m1, j2, m2, j, m):
    return float(clebsch_gordan(j1, j2, j, m1, m2, m))

def phases(chan, Tlab):
    """Interpolate phase shifts (degrees) in Tlab (MeV) -> dict."""
    tab = DATA['pp' if chan == 'nn' else 'np']
    Es = np.array(sorted(float(k) for k in tab))
    keys = tab[str(int(Es[0]))].keys()
    out = {}
    for key in keys:
        vals = np.array([tab[str(int(E))].get(key, 0.0) for E in Es])
        out[key] = float(np.interp(Tlab, Es, vals))
    return out

def smatrix(chan, Tlab, Jmax=8):
    """Return dict {(J,S): S-matrix (as dict {(L',L): value})}."""
    ph = phases(chan, Tlab)
    d = lambda k: np.deg2rad(ph.get(k, 0.0))
    Sm = {}
    for J in range(0, Jmax + 1):
        # singlet L=J
        for S in (0, 1):
            if S == 0:
                L = J
                if chan == 'nn' and (L + S) % 2 == 1:
                    continue
                Sm[(J, 0)] = {(L, L): np.exp(2j * d(wave_name(L, 0, J)))}
            else:
                blk = {}
                # uncoupled triplet L=J (not for J=0)
                if J >= 1 and not (chan == 'nn' and (J + 1) % 2 == 1):
                    blk[(J, J)] = np.exp(2j * d(wave_name(J, 1, J)))
                # coupled / J=0 triplet
                Lm, Lp = J - 1, J + 1
                allowed = not (chan == 'nn' and (Lp + 1) % 2 == 1)
                if allowed:
                    if J == 0:
                        blk[(1, 1)] = np.exp(2j * d('3P0'))
                    else:
                        d1 = d(wave_name(Lm, 1, J)); d2 = d(wave_name(Lp, 1, J))
                        e = d(f'E{J}')
                        c, s = np.cos(2 * e), np.sin(2 * e)
                        blk[(Lm, Lm)] = c * np.exp(2j * d1)
                        blk[(Lp, Lp)] = c * np.exp(2j * d2)
                        blk[(Lm, Lp)] = blk[(Lp, Lm)] = 1j * s * np.exp(1j * (d1 + d2))
                Sm[(J, 1)] = blk
    return Sm

def kcm(Tlab, m=MN):
    return np.sqrt(m * Tlab / 2.0) / HBARC  # fm^-1 (exact for equal masses)

def dsigma(chan, Tlab, theta):
    """Spin-averaged dsigma/dOmega in mb/sr at CM angle theta (radians, array)."""
    theta = np.atleast_1d(theta)
    k = kcm(Tlab)
    Sm = smatrix(chan, Tlab)
    tot = np.zeros_like(theta)
    for S in (0, 1):
        ms = range(-S, S + 1)
        M = {(mp, m): np.zeros_like(theta, dtype=complex) for mp in ms for m in ms}
        for (J, SS), blk in Sm.items():
            if SS != S:
                continue
            for (Lp, L), Sel in blk.items():
                T = Sel - (1.0 if Lp == L else 0.0)
                if abs(T) < 1e-14:
                    continue
                for m in ms:
                    c1 = cg(L, 0, S, m, J, m)
                    if c1 == 0: continue
                    for mp in ms:
                        mu = m - mp
                        if abs(mu) > Lp: continue
                        c2 = cg(Lp, mu, S, mp, J, m)
                        if c2 == 0: continue
                        Y = sph_harm_y(Lp, mu, theta, 0.0)
                        M[(mp, m)] += (1j) ** (L - Lp) * np.sqrt(2 * L + 1) * c1 * c2 * T * Y
        for key in M:
            M[key] *= np.sqrt(4 * np.pi) / (2j * k)
            tot += np.abs(M[key]) ** 2
    fac = 4.0 if chan == 'nn' else 1.0
    return fac * tot / 4.0 * 10.0  # fm^2 -> mb

def moments(chan, Tlab, n=200):
    """sigma_tot (conventional), sigma_T=int(1-cos), sigma_2=int sin^2 (all mb).
    For identical particles the conventional total is (1/2) int_{4pi}."""
    x, w = np.polynomial.legendre.leggauss(n)
    th = np.arccos(x)
    ds = dsigma(chan, Tlab, th)
    half = 0.5 if chan == 'nn' else 1.0
    s0 = half * 2 * np.pi * np.sum(w * ds)
    s2 = half * 2 * np.pi * np.sum(w * ds * (1 - x ** 2))
    sT = half * 2 * np.pi * np.sum(w * ds * (1 - x))
    return s0, sT, s2

def validate():
    ref = {  # nn-online PWA93 DSG (mb/sr), CM angles in degrees
        ('np', 50): {10: 16.505, 60: 12.397, 90: 11.673, 120: 13.115, 180: 19.743},
        ('np', 150): {10: 8.2835, 60: 2.8834, 90: 2.2774, 120: 4.0193, 180: 12.966},
        ('nn', 50): {60: 8.5895, 90: 8.4948},    # pp incl. Coulomb: only near 90 deg comparable
        ('nn', 150): {60: 3.8213, 90: 3.7504},
    }
    for (ch, T), d in ref.items():
        ths = np.deg2rad(list(d.keys()))
        mine = dsigma(ch, T, ths)
        print(ch, T, ' '.join(f"{a}deg: {m:.3f} vs {r:.3f}" for a, m, r in zip(d.keys(), mine, d.values())))

if __name__ == '__main__':
    validate()
    for ch in ('np', 'nn'):
        for T in (10, 25, 50, 100, 150, 200, 300):
            s0, sT, s2 = moments(ch, T)
            print(f"{ch} Tlab={T:4d}  sigma={s0:8.2f} mb  sigma_T={sT:8.2f}  sigma_2={s2:8.2f}  s2/s0={s2/s0:.3f}")
