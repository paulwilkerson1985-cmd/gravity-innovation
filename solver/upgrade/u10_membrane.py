import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U10: a thin 'electrostatic membrane' (Robin sheet, kappa = areal mass/M^2) between source and test mass at the gap
midplane z=-0.55 (2.5 cm from each surface at 1/mu=10 cm).  F~(kappa)/F~(0) and condensation threshold shift.
Variants: full chamber width; W=1.5 (15 cm) membrane held by a pinned frame ring (r 1.5-1.6, z -0.6..-0.5).
Also: a Dirichlet wire grid shield at the same plane (axisymmetric rings of wire radius a, pitch s) vs its homogenised
kappa = 2pi/(s ln(s/2pi a)) as a Robin sheet (checks the grid<->Robin equivalence inside the benchmark)."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from configs import bench, F_test
from symm_robin import solve, lam_min
h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.05
ZM = -0.55
g = bench(h); phi, _ = solve(g); F0 = F_test(g, phi)
print('h=%.3f F0=%.4f' % (h, F0))


def frame(g):
    tol = 1e-9
    g.fixed |= (g.R >= 1.5 - tol) & (g.R <= 1.6 + tol) & (g.Z >= -0.6 - tol) & (g.Z <= -0.5 + tol)


def sig(**kw):
    """source-dependent force on the test mass (what a moving/modulated source measures) and the static part."""
    g = bench(h, **kw); p, _ = solve(g); Fs = F_test(g, p)
    g = bench(h, source=False, **kw); p, _ = solve(g); Fn = F_test(g, p)
    return Fs - Fn, Fn


S, Fn = sig(extra=frame)
print('frame ring alone (no membrane): signal S/F0=%.4f  static force without source=%+.4f' % (S / F0, Fn))
print('S = F(source) - F(no source); static = F(no source) (constant offset, not modulated)')
for k in [0.001, 0.01, 0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0, 100.0]:
    S1, N1 = sig(membrane=(ZM, None, ('robin', k)))
    S2, N2 = sig(membrane=(ZM, 1.5, ('robin', k)), extra=frame)
    print('kappa/mu=%-6g full-width: S/F0=%.4f (1-S/F0=%+.2e) static=%+.4f | framed W=1.5: S/F0=%.4f static=%+.4f' % (
        k, S1 / F0, 1 - S1 / F0, N1, S2 / F0, N2))
    sys.stdout.flush()
# threshold shift (chamber R = L_half) with a full-width membrane
for k in [0.0, 0.1, 1.0]:
    f = lambda n: lam_min(bench(h, R=n * h, membrane=(ZM, None, ('robin', k)) if k > 0 else None))[0] - 1
    nl, nh = int(round(3.0 / h)), int(round(4.0 / h)); fl, fh = f(nl), f(nh)
    while nh - nl > 1:
        nm = (nl + nh) // 2; fm = f(nm)
        (nl, fl) = (nm, fm) if fm > 0 else (nl, fl)
        (nh, fh) = (nm, fm) if fm <= 0 else (nh, fh)
    print('threshold R_c (R=L_half) with membrane kappa=%g: %.3f' % (k, h * (nl + fl / (fl - fh))))
# wire-grid rings (Dirichlet wires) vs homogenised Robin sheet, pitch s, wire radius a (a < 0.1985 h)
for s, a in [(0.1, 1e-3), (0.2, 1e-3), (0.5, 1e-3), (1.0, 1e-3)]:
    def rings(g, s=s, a=a):
        rr = s / 2
        while rr < g.r[-1] - 2 * g.h:
            g.ring(round(rr / g.h) * g.h, ZM, a); rr += s
    Fr, _ = sig(extra=rings)
    kh = 2 * np.pi / (s * np.log(s / (2 * np.pi * a)))
    Fk, _ = sig(membrane=(ZM, None, ('robin', kh)))
    print('Dirichlet ring grid s=%.2f a=%g: S/F0=%.4f  | homogenised Robin kappa=%.2f: S/F0=%.4f' % (s, a, Fr / F0, kh, Fk / F0))
    sys.stdout.flush()
