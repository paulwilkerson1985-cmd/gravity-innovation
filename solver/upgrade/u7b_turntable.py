import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U7b: turntable clearance design rule: signal S/S0 vs gap between source bottom and turntable top (Dirichlet disk,
1 cm thick, radius Rt) with a 1 cm pedestal rod; plus a thin (unscreened-equivalent) turntable modelled as a Robin disk."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from u7_proxy import run, proxy, Ftest
from symm_robin import solve
h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.05
S0, _, _ = run(h)
for Rt in [1.0, 2.0]:
    for gap in [1.5, 2.0, 2.5]:
        S, pm, Fn = run(h, turntable=(Rt, gap))
        print('Rt=%.0f gap=%.1f/mu: S/S0=%.4f static=%+.4f' % (Rt, gap, S / S0, Fn)); sys.stdout.flush()
# source on a pedestal of height gap (r=0.1 pinned rod) but NO turntable plate: isolates the plate effect
for gap in [0.3, 1.0]:
    def ped(g, gap=gap):
        tol = 1e-9; zt = -2.0 - gap
        g.fixed |= (g.R <= 0.1 + tol) & (g.Z <= -1.95) & (g.Z >= zt - tol)
        g.fixed |= (g.R <= 0.15 + tol) & (g.Z <= zt + tol)
    gs = proxy(h); ped(gs); p, _ = solve(gs); Fs = Ftest(gs, p)
    gn = proxy(h, source=False); ped(gn); p, _ = solve(gn); Fn = Ftest(gn, p)
    print('pedestal+shaft only (no plate), source bottom at -2.0, shaft below -%.1f: S/S0=%.4f' % (2.0 + gap, (Fs - Fn) / S0))
