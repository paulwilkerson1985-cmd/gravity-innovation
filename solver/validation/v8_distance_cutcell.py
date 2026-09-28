import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V8: distance law with the cut-cell solver: 1 m chamber (R=L_half=5) and a large chamber (8) vs the exact
large-separation formula F_asym = 4 pi Q1 Q2 (1+sqrt2 D) e^{-sqrt2 D}/D^2 (Q from exact ODE)."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/validation'))
from symm_sw import GridSW, solve, force_z
from ref_sphere_ode import sphere_profile, F_asym
Q1 = sphere_profile(0.3)[1]; Q2 = sphere_profile(0.6)[1]
h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
for C in [5.0, 8.0]:
    F = {}
    for D in [1.4, 2.0, 3.0, 4.0, 5.0]:
        if C == 5.0 and D > 3.0: continue
        t = time.time()
        g = GridSW(C, C, h); g.sphere(0, 0.3); g.sphere(-D, 0.6); phi, res = solve(g)
        F[D] = -force_z(g, phi, 0.38, -0.38, 0.38)
        print('chamber %.0f h=%.3f D=%.1f  F=%.5f  F_asym=%.5f  F/F_asym=%.3f  t=%.0fs' % (C, h, D, F[D], F_asym(D, Q1, Q2), F[D] / F_asym(D, Q1, Q2), time.time() - t))
        sys.stdout.flush()
    print('  chamber %.0f: F(1.4)/F(2.0)=%.2f  F(1.4)/F(3.0)=%.2f' % (C, F[1.4] / F[2.0], F[1.4] / F[3.0]))
