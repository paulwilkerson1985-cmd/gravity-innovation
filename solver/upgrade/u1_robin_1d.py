import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U1: 1D validation of Robin and slab (two-port) sheets in the axisymmetric grid (neumann_r -> exactly 1D).
(a) symmetric Robin sheet at z=0, walls at z=+-8: phi(foil) vs finite-domain BVP and infinite-domain tanh matching,
    plus profile error vs tanh((|z|+x0)/sqrt2) for |z|<4; h = 0.04/0.02/0.01.
(b) transmission test: sheet at z = 7 with a subcritical gap (width 1) to the top wall; the field in the gap exists only
    through leakage; compare phi at gap middle with exact BVP (Robin and two-port).
(c) slab two-port vs fully resolved nonlinear slab (m, t) and vs a single Robin sheet with kappa_eff = 2m tanh(mt/2):
    symmetric pinning agrees; transmission through thick slabs is exp(-mt) smaller than the Robin sheet predicts."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, plus_copy
import symm_robin
from ref_robin_1d import T_inf, x0_inf, interface_bvp

L = 8.0


def run1d(h, zf, kind, par):
    g = RGrid(2 * h, L, h, neumann_r=True)
    if kind == 'robin':
        g.zsheet(zf, 0, 1, kappa=par[0])
    else:
        g.zsheet(zf, 0, 1, m=par[0], t=par[1])
    phi, res, allv, _ = solve(g, return_all=True)
    j = int(round((zf - g.z[0]) / h))
    pp = plus_copy(g, allv)[0, j] if kind != 'robin' else phi[0, j]
    return g, phi[0, :], phi[0, j], pp, res


print('--- (a) symmetric Robin sheet, walls at +-8')
for k in [0.1, 1, 10, 100, 1e3, 1e4]:
    pm_ex, _, fex = interface_bvp(-L, 0, L, 'robin', (k,))
    out = []
    for h in [0.04, 0.02, 0.01]:
        g, p, ps, _, res = run1d(h, 0.0, 'robin', (k,))
        sel = np.abs(g.z) < 4
        eprof = np.max(np.abs(p[sel] - fex(g.z[sel])))
        etanh = np.max(np.abs(p[sel] - np.tanh((np.abs(g.z[sel]) + x0_inf(k)) / np.sqrt(2))))
        out.append('h=%.2f phi_f=%.6e (rel.err %+.1e) prof.err %.1e tanh.err %.1e' % (h, ps, ps / pm_ex - 1, eprof, etanh))
    print('kappa=%-6g exact(L=8)=%.6e  T_inf=%.6e sqrt2/k=%.3e' % (k, pm_ex, T_inf(k), np.sqrt(2) / k))
    for o in out:
        print('     ' + o)
    sys.stdout.flush()

print('--- (b) transmission into a subcritical gap: sheet at z=7, gap width 1 to wall at z=8; phi at z=7.5')
for k in [1, 10, 100, 1e3, 1e4]:
    pm_ex, pp_ex, fex = interface_bvp(-L, 7.0, L, 'robin', (k,))
    s = []
    for h in [0.04, 0.02, 0.01]:
        g, p, ps, _, res = run1d(h, 7.0, 'robin', (k,))
        jm = int(np.floor((7.5 - g.z[0]) / h + 1e-9))   # grid node at/below z=7.5 (compare at that node)
        s.append('h=%.2f z=%.2f %.5e (%+.1e)' % (h, g.z[jm], p[jm], p[jm] / fex(g.z[jm]) - 1))
    print('Robin kappa=%-6g phi(7.5) exact=%.5e | ' % (k, fex(7.5)) + ' | '.join(s))
    sys.stdout.flush()

print('--- (c) slab: two-port vs resolved nonlinear slab vs Robin(kappa_eff=2m tanh(mt/2))')
for m, t in [(30, 0.001), (30, 0.01), (30, 0.1), (100, 0.01), (100, 0.03), (100, 0.1), (300, 0.01)]:
    keff = 2 * m * np.tanh(m * t / 2)
    # symmetric
    pm_r, _, _ = interface_bvp(-L, 0, L, 'resolved', (m, t))
    pm_p, _, _ = interface_bvp(-L, 0, L, 'port', (m, t))
    g, p, ps, pps, res = run1d(0.02, 0.0, 'slab', (m, t))
    g1, p1, ps1, pps1, _ = run1d(0.01, 0.0, 'slab', (m, t))
    print('m=%g t=%g (mt=%.2f, kappa_eff=%.1f, m^2t=%.1f): SYM phi_surf resolved=%.5e port-BVP=%.5e grid h=.02 %.5e h=.01 %.5e | Robin T_inf(keff)=%.5e' % (
        m, t, m * t, keff, m * m * t, pm_r, pm_p, ps, ps1, T_inf(keff)))
    # transmission
    _, _, fr = interface_bvp(-L, 7.0, L, 'resolved', (m, t))
    _, _, fp = interface_bvp(-L, 7.0, L, 'port', (m, t))
    _, _, fk = interface_bvp(-L, 7.0, L, 'robin', (keff,))
    vals = []
    for h in [0.02, 0.01]:
        g, p, ps, pps, res = run1d(h, 7.0, 'slab', (m, t))
        vals.append(p[int(round((7.5 - g.z[0]) / h))])
    print('      TRANS phi(7.5): resolved=%.4e port-BVP=%.4e grid h=.02 %.4e h=.01 %.4e | Robin(keff)=%.4e (ratio Robin/resolved=%.2f)' % (
        fr(7.5), fp(7.5), vals[0], vals[1], fk(7.5), fk(7.5) / fr(7.5)))
    sys.stdout.flush()
