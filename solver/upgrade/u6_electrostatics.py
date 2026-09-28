import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U6: electrostatic systematics for the shield options (SI units).
(a) no shield: exact two-sphere force at potential difference V (image-charge series, test sphere grounded through the
    fibre, source at V): F = (1/2) V^2 dC11/dc.  Benchmark: test radius 3 cm, source radius 6 cm, centres 14 cm.
    -> the residual contact-potential difference that bias nulling must reach.
(b) grid / membrane shields: effective Robin constants.  Electrostatics sees a grounded wire grid as
    kappa_es = 2 pi / (s ln(s / 2 pi a)) (conductors), a continuous metal film as kappa_es = infinity (perfect DC screen);
    the symmetron sees only areal mass: kappa_sym = rho t / M^2 (thin, unscreened wires or films).
    Field transmission of a Fourier mode k through a Robin sheet: T = 2k / (2k + kappa)."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
import units as U

EPS0 = 8.8541878128e-12
K4 = 4 * np.pi * EPS0


def C11_C21(a, b, c, nmax=400):
    """sphere 1 (radius a) at V=1, sphere 2 (radius b) grounded, centre distance c.  Returns (Q1, Q2) = (C11, C21)."""
    # charges on sphere 1 at positions x (from centre 1 along the axis toward 2); on sphere 2 at positions x from c.
    q1 = [K4 * a]; x1 = [0.0]; q2 = []; x2 = []
    qa, xa = K4 * a, 0.0      # last charge in sphere 1
    for n in range(nmax):
        d = c - xa                                   # distance from centre 2
        qb, xb = -qa * b / d, c - b**2 / d          # image in sphere 2
        q2.append(qb); x2.append(xb)
        d2 = xb                                      # distance of qb from centre 1
        qa, xa = -qb * a / d2, a**2 / d2            # image in sphere 1 (keeps sphere 1 at V=1 with the first charge)
        q1.append(qa); x1.append(xa)
        if abs(qa) < 1e-16 * K4 * a:
            break
    return sum(q1), sum(q2)


def force_V(V, a=0.03, b=0.06, c=0.14):
    dc = 1e-6
    Cp, _ = C11_C21(a, b, c + dc); Cm, _ = C11_C21(a, b, c - dc)
    return 0.5 * V**2 * (Cp - Cm) / (2 * dc)       # negative = attractive


if __name__ == '__main__':
    print('--- (a) no shield: two-sphere electrostatic force (test r=3 cm grounded, source r=6 cm at V, centres 14 cm)')
    k = force_V(1.0)
    print(' F = %.3e N x (V/1 V)^2   (attractive)' % abs(k))
    for thr, lab in [(2.4e-13, 'Tier-2 threshold v^2=2.4e-13 N'), (2.4e-14, '10% of threshold'), (2.4e-15, '1% of threshold')]:
        print('   V for F = %.1e N (%s): %.1f mV' % (thr, lab, 1e3 * np.sqrt(thr / abs(k))))
    # force *gradient* matters for torsion modulation: dF/dc
    dF = (force_V(1.0, c=0.14 + 1e-4) - force_V(1.0, c=0.14 - 1e-4)) / 2e-4
    print(' dF/dc = %.3e N/m x V^2 ;  F falls as c^-%.1f near 14 cm' % (dF, -dF * 0.14 / k))
    print(' check vs point-charge estimate 4 pi eps0 a^2 b V^2/c^3 ~ %.2e N' % (K4 * 0.03**2 * 0.06 / 0.14**3))

    print('--- (b) shield options: symmetron kappa/mu (areal mass) vs electrostatic screening')
    films = [('100 nm SiN + 20 nm Au (small windows)', 1e-5 * 3.1 + 2e-6 * 19.3),
             ('0.9 um Mylar + 30 nm Au', 0.9e-4 * 1.39 + 3e-6 * 19.3),
             ('2 um Mylar + 50 nm Al (solar-sail film)', 2e-4 * 1.39 + 5e-6 * 2.7),
             ('6 um aluminised Mylar', 6e-4 * 1.39 + 5e-6 * 2.7),
             ('12.7 um Kapton + 100 nm Al', 12.7e-4 * 1.42 + 1e-5 * 2.7),
             ('W mesh 10 um wire, 1 mm pitch (2 axes)', 2 * np.pi * (5e-4)**2 / 0.1 * 19.3),
             ('10 um BeCu (Eot-Wash-type shield)', 10e-4 * 8.3),
             ('25 um Cu foil', 25e-4 * 8.96)]
    pts = [(4, 5), (4, 14.6), (10, 15), (10, 36), (15, 15), (15, 55)]
    print(' areal density Sigma [g/cm^2] and kappa/mu = Sigma / (rho_crit * 1/mu) at (1/mu cm, M TeV):')
    print(' %-42s %-9s ' % ('film', 'Sigma') + ' '.join('(%g,%g)' % p for p in pts))
    for name, S in films:
        ks = [S / (U.rho_crit_gcc(M, L) * L) for L, M in pts]
        print(' %-42s %-9.2e ' % (name, S) + ' '.join('%-8.3g' % v for v in ks))
    print(' electrostatic: continuous metal film -> kappa_es = inf (complete DC screening, independent of thickness);')
    for s_mm, a_um in [(1.0, 5.0), (0.25, 5.0), (5.0, 25.0), (20.0, 50.0)]:
        s = s_mm * 1e-3; a = a_um * 1e-6
        kes = 2 * np.pi / (s * np.log(s / (2 * np.pi * a)))    # 1/m, one wire direction
        T = [2 * kk / (2 * kk + kes) for kk in (1 / 0.02, 1 / 0.05, 1 / 0.10)]
        print('   wire grid s=%.2f mm a=%.0f um: kappa_es=%.0f /m ; field transmission of modes k=1/(2,5,10 cm): %s' % (
            s_mm, a_um, kes, ', '.join('%.3f' % t for t in T)))
