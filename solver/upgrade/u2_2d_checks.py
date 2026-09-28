import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U2: 2D consistency checks of the new boundary models.
(a) sub-grid axis rod (Dirichlet and weak/unscreened q) vs exact radial ODE (z-independent test via neumann_z).
(b) Robin kappa -> infinity and thick slab (m t >> 1) reproduce the Dirichlet foil pair / closed can residuals.
(c) timing of a benchmark solve with sheets."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve
from ref_rod_ode import rod_profile
from configs import residual, bench, F_test

print('--- (a) thin rod on axis, chamber Rc=6 (phi(Rc)=0), z-independent; phi at r=0.2/0.5/1.0 vs ODE')
for a, q in [(1e-4, np.inf), (1e-3, np.inf), (2e-4, 0.0116), (1e-3, 1.0)]:
    f = rod_profile(a, 6.0, q=q)
    ex = f(np.array([0.2, 0.5, 1.0]))
    s = []
    for h in [0.04, 0.02, 0.01]:
        if a >= 0.1404 * h:
            continue
        g = RGrid(6.0, 2 * h, h, neumann_z=True); g.rod(-1, 1, a, q)
        phi, res = solve(g)
        num = np.array([phi[int(round(r / h)), 2] for r in (0.2, 0.5, 1.0)])
        s.append('h=%.2f err=%s' % (h, np.array2string(num - ex, precision=1, formatter={'float': lambda v: '%+.1e' % v})))
    print(' a=%g q=%g exact=%s | ' % (a, q, np.round(ex, 5)) + ' | '.join(s))
    sys.stdout.flush()

print("--- (b) kappa->inf and thick slab vs Dirichlet (h=0.05, 0.025)")
#: source-dependent residual / no-foil force')
for h in [0.05, 0.025]:
  g = bench(h); phi, _ = solve(g); F0 = F_test(g, phi)
  print(' h=%.3f F0 (cut-cell) = %.5f' % (h, F0))
  for label, kw in [('foil pair W=1', lambda mdl: dict(foilpair=(1.0, mdl))),
                  ('can Rs=.5 hole=.2', lambda mdl: dict(can=(0.5, 0.2, mdl)))]:
    out = []
    for mdl in [('dir',), ('robin', 1e8), ('slab', 3000.0, 0.02)]:
        r, _, dt = residual(h, F0=F0, **kw(mdl))
        out.append('%s: %.3e (%.0fs)' % (mdl[0], r, dt))
    print('   %-18s ' % label + ' | '.join(out))
    sys.stdout.flush()
