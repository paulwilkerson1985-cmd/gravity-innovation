"""Exact 1D symmetron solutions (dimensionless: lengths 1/mu, field v, energy density mu^2 v^2).
phi'' = -phi + phi^3.
 * single pinned wall, broken phase:     phi = tanh(x/sqrt2)
 * two pinned walls a distance d apart:  phi = phi0 sn( sqrt(1-phi0^2/2) x , k^2 ),  k^2 = phi0^2/(2-phi0^2),
   with d = 2K(k^2)/sqrt(1-phi0^2/2).  phi0 -> 0 as d -> d_c = pi  (Brax & Pitschmann 2012.12752).
 * conserved stress in a 1D region: T_zz = phi'^2/2 - V = -V(phi0) = phi0^2/2 - phi0^4/4.
 * pressure on a plate between a gap (phi0) and semi-infinite vacuum (phi->1):
   P = (1-phi0^2)^2/4  (attractive), = 1/4 = V0/(mu^2 v^2) for d < pi."""
import numpy as np
from scipy.special import ellipk, ellipj
from scipy.optimize import brentq

def d_of_phi0(p0):
    k2 = p0**2 / (2 - p0**2)
    return 2 * ellipk(k2) / np.sqrt(1 - p0**2 / 2)

def phi0_of_d(d):
    if d <= np.pi:
        return 0.0
    return brentq(lambda p: d_of_phi0(p) - d, 1e-12, 1 - 1e-15, xtol=1e-15)

def profile(x, d):
    p0 = phi0_of_d(d)
    if p0 == 0: return np.zeros_like(x)
    k2 = p0**2 / (2 - p0**2)
    sn, cn, dn, ph = ellipj(np.sqrt(1 - p0**2 / 2) * np.asarray(x), k2)
    return p0 * sn

def T1d(p0):
    return p0**2 / 2 - p0**4 / 4

def pressure_plate(d, d_out=np.inf):
    """attractive pressure on a plate with gap d on one side and a region of width d_out
    (bounded by another pinned wall) on the other."""
    Tout = 0.25 if np.isinf(d_out) else T1d(phi0_of_d(d_out))
    return Tout - T1d(phi0_of_d(d))

if __name__ == '__main__':
    for d in [3.0, 3.1416, 3.2, 3.5, 4.0, 5.0, 6.0, 8.0]:
        print('d=%.4f phi0=%.6f  P=%.6f (x V0: %.4f)' % (d, phi0_of_d(d), pressure_plate(d), pressure_plate(d) / 0.25))
