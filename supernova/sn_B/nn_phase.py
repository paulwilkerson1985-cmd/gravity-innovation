"""
NN phase shifts (approximate Nijmegen PWA93 up to 350 MeV, SAID-like extrapolation to 800 MeV lab),
spin-summed differential cross sections from partial waves (tensor mixing eps_J neglected),
and the 'time-delay' (scale-derivative) cross section that controls the TRACE (dilaton-like)
coupling:  sigma_tr = sum_channels w (2J+1) (d delta/dk)^2.

Conventions:
  k      : CM relative momentum [fm^-1];  E_lab = 2 k^2 hbar^2 / m  (non-relativistic)
  np     : distinguishable,  sigma = (pi/k^2) sum_{lSJ} (2J+1) sin^2 delta
  nn(pp) : identical, only l+S even channels, sigma = (2pi/k^2) sum (2J+1) sin^2 delta
           (sigma defined as 1/2 of the 4pi integral of the symmetrised dsigma/dOmega)
  sigma_tr: same weights with sin^2(delta)/k^2 -> (d delta/dk)^2   [fm^2]
Values are from memory of standard tables; accuracy ~ few degrees; adequate for +-20% rates.
"""
import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.special import sph_harm_y
from sympy.physics.wigner import clebsch_gordan
from functools import lru_cache

HBARC = 197.327
MN = 938.92
Elab = np.array([0., 10, 25, 50, 100, 150, 200, 250, 300, 350, 400, 500, 600, 800])

# (l, S, J): phase shifts in degrees vs Elab.  T=1 channels (l+S even), T=0 channels (l+S odd)
# np 1S0 differs from pp/nn at low E (charge dependence); use separate rows.
PS_T1 = {
    (0, 0, 0): [0, 55.2, 48.7, 39.0, 25.0, 15.0, 7.0, 0.1, -6.0, -11.1, -15.5, -22.5, -27.5, -34.],   # pp/nn 1S0 (nuclear)
    (1, 1, 0): [0, 3.73, 8.62, 11.58, 9.45, 4.74, -0.37, -5.43, -10.39, -15.30, -19.5, -26., -31., -37.],
    (1, 1, 1): [0, -2.06, -4.88, -8.25, -13.26, -17.43, -21.08, -24.34, -27.25, -29.96, -32., -35., -37., -40.],
    (1, 1, 2): [0, 0.65, 2.49, 5.86, 11.01, 13.98, 15.63, 16.59, 17.17, 17.51, 17.5, 17.3, 17.0, 16.],
    (2, 0, 2): [0, 0.16, 0.70, 1.71, 3.79, 5.61, 7.06, 8.27, 9.42, 9.99, 10.5, 11.0, 12.0, 14.],
    (3, 1, 2): [0, 0.01, 0.11, 0.34, 0.81, 1.20, 1.42, 1.51, 1.41, 1.25, 1.1, 0.8, 0.5, 0.],
    (3, 1, 3): [0, -0.03, -0.23, -0.69, -1.47, -2.00, -2.35, -2.55, -2.66, -2.75, -2.8, -3.0, -3.1, -3.2],
    (3, 1, 4): [0, 0.00, 0.02, 0.11, 0.46, 0.97, 1.54, 2.10, 2.60, 3.00, 3.3, 3.8, 4.2, 4.8],
    (4, 0, 4): [0, 0.00, 0.04, 0.15, 0.42, 0.70, 0.97, 1.20, 1.40, 1.60, 1.8, 2.1, 2.4, 2.9],
}
PS_1S0_np = [0, 59.96, 50.90, 40.54, 26.78, 16.94, 8.94, 2.03, -4.46, -10.10, -15., -22., -27., -34.]
PS_T0 = {
    (0, 1, 1): [180, 102.61, 80.63, 62.77, 43.23, 30.72, 21.22, 13.39, 6.60, 0.52, -5., -14., -21., -32.],  # 3S1 (Levinson: deuteron)
    (1, 0, 1): [0, -3.06, -6.31, -9.67, -14.52, -18.65, -22.18, -25.13, -27.58, -29.66, -31., -34., -37., -41.],
    (2, 1, 1): [0, -0.18, -2.80, -6.43, -12.23, -16.48, -19.71, -22.21, -24.14, -25.61, -27., -29., -31., -34.],
    (2, 1, 2): [0, 0.84, 3.71, 8.97, 17.28, 22.13, 24.51, 25.36, 25.52, 25.47, 25., 24., 23., 21.],
    (2, 1, 3): [0, 0.00, 0.03, 0.26, 1.08, 1.94, 2.63, 3.09, 3.21, 3.40, 3.5, 3.6, 3.7, 3.8],
    (3, 0, 3): [0, -0.07, -0.42, -1.12, -2.13, -2.72, -3.12, -3.45, -3.70, -3.90, -4.1, -4.5, -4.8, -5.3],
}


def k_of_Elab(E):  # fm^-1
    return np.sqrt(MN * E / 2.0) / HBARC


kgrid = k_of_Elab(Elab)


def _interp(row):
    return PchipInterpolator(kgrid, np.radians(np.array(row, float)), extrapolate=True)


def channels(system):
    """return list of ((l,S,J), interpolator) for 'nn' or 'np'"""
    out = []
    if system == 'nn':
        for key, row in PS_T1.items():
            out.append((key, _interp(row)))
    elif system == 'np':
        for key, row in PS_T1.items():
            if key == (0, 0, 0):
                out.append((key, _interp(PS_1S0_np)))
            else:
                out.append((key, _interp(row)))
        for key, row in PS_T0.items():
            out.append((key, _interp(row)))
    return out


CH = {s: channels(s) for s in ('nn', 'np')}


def kmax_valid():
    return kgrid[-1]


def _clip(k):
    return np.minimum(k, kgrid[-1])


def sigma_el(k, system):
    """total elastic cross section [fm^2]"""
    kk = _clip(k)
    w = 2.0 if system == 'nn' else 1.0
    s = 0.0
    for (l, S, J), f in CH[system]:
        s = s + (2 * J + 1) * np.sin(f(kk)) ** 2
    return w * np.pi * s / kk ** 2


def sigma_tr(k, system):
    """time-delay (scale-derivative) cross section: integral over final directions of
    |(1 + k d/dk) f|^2 summed/averaged over spins [fm^2]"""
    kk = _clip(k)
    w = 2.0 if system == 'nn' else 1.0
    s = 0.0
    for (l, S, J), f in CH[system]:
        s = s + (2 * J + 1) * f.derivative()(kk) ** 2
    return w * np.pi * s


@lru_cache(maxsize=None)
def _cg(l, m1, S, m2, J, M):
    return float(clebsch_gordan(l, S, J, m1, m2, M))


def dsig_dOmega(k, theta, system):
    """spin-averaged dsigma/dOmega [fm^2/sr] at scalar k, array theta; tensor mixing neglected.
    For 'nn' the amplitude is symmetrised (allowed channels doubled); integrate over 4pi and
    multiply by 1/2 to get sigma (half-sphere convention)."""
    kk = min(k, kgrid[-1])
    theta = np.atleast_1d(theta)
    fac = 2.0 if system == 'nn' else 1.0
    # singlet
    fs = np.zeros_like(theta, dtype=complex)
    # triplet amplitude M[m', m]
    Mt = np.zeros((3, 3, theta.size), dtype=complex)
    for (l, S, J), f in CH[system]:
        d = float(f(kk))
        a = np.exp(1j * d) * np.sin(d) / kk * fac
        if S == 0:
            fs += (2 * l + 1) * a * np.polynomial.legendre.legval(np.cos(theta), [0] * l + [1])
        else:
            for m in (-1, 0, 1):
                for mp in (-1, 0, 1):
                    mu = m - mp
                    if abs(mu) > l:
                        continue
                    c = _cg(l, 0, 1, m, J, m) * _cg(l, mu, 1, mp, J, m)
                    if c == 0.0:
                        continue
                    Y = sph_harm_y(l, mu, theta, 0.0)
                    Mt[mp + 1, m + 1] += np.sqrt(4 * np.pi * (2 * l + 1)) * c * a * Y
    return 0.25 * (np.abs(fs) ** 2 + np.sum(np.abs(Mt) ** 2, axis=(0, 1)))


def angular_moments(k, system, n=400):
    """returns sigma0 = int dsigma, sigma_c2 = int dsigma cos^2, using half-sphere convention for nn"""
    x, wx = np.polynomial.legendre.leggauss(n)
    th = np.arccos(x)
    ds = dsig_dOmega(k, th, system)
    s0 = 2 * np.pi * np.sum(wx * ds)
    sc2 = 2 * np.pi * np.sum(wx * ds * x ** 2)
    if system == 'nn':
        s0 *= 0.5
        sc2 *= 0.5
    return s0, sc2


if __name__ == '__main__':
    print("E_lab  k[fm-1]  sig_np[mb] (pw-sum / angular)  sig_nn[mb]   sig2/sig (np, nn)   sig_tr[mb](np,nn)  c_tr^2=sig_tr/sig (np,nn)")
    for E in [25, 50, 100, 150, 200, 300, 400, 500, 600]:
        k = k_of_Elab(E)
        out = []
        for s in ('np', 'nn'):
            s0, sc2 = angular_moments(k, s)
            out.append((sigma_el(k, s) * 10, s0 * 10, (s0 - sc2) / s0, sigma_tr(k, s) * 10))
        print(f"{E:5.0f} {k:6.3f}   {out[0][0]:7.1f} / {out[0][1]:7.1f}      {out[1][0]:7.1f}/{out[1][1]:6.1f}"
              f"     {out[0][2]:.3f} {out[1][2]:.3f}      {out[0][3]:7.1f} {out[1][3]:7.1f}    "
              f"{out[0][3]/out[0][0]:.2f} {out[1][3]/out[1][0]:.2f}")
