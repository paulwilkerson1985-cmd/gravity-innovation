import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Shared geometry builders for the upgrade runs (units 1/mu; benchmark = 1/mu = 10 cm):
chamber R = L_half = 5 (1 m x 1 m), test sphere a1 = 0.3 at z = 0, source sphere a2 = 0.6 at z = -D = -1.4."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z, lam_min

A1, A2, D = 0.3, 0.6, 1.4


def sheet_kw(model):
    """model: ('dir',) | ('robin', kappa) | ('slab', m, t)"""
    if model[0] == 'robin':
        return dict(kappa=model[1])
    if model[0] == 'slab':
        return dict(m=model[1], t=model[2])
    return None


def add_disk(g, zf, r0, r1, model):
    if model[0] == 'dir':
        tol = 1e-9
        g.fixed |= (np.abs(g.Z - zf) <= tol) & (g.R >= r0 - tol) & (g.R <= r1 + tol)
    else:
        g.zsheet(zf, r0, r1, **sheet_kw(model))


def add_shell(g, rf, z0, z1, model):
    if model[0] == 'dir':
        tol = 1e-9
        g.fixed |= (np.abs(g.R - rf) <= tol) & (g.Z >= z0 - tol) & (g.Z <= z1 + tol)
    else:
        g.rsheet(rf, z0, z1, **sheet_kw(model))


def bench(h, R=5.0, Lh=None, source=True, a1=A1, a2=A2, dist=D, foilpair=None, can=None, membrane=None, extra=None):
    """foilpair=(W, model): disks radius W at z=+-dist/2.  can=(Rs, hole, model): closed cylinder around the test mass.
    membrane=(zf, W, model): single sheet (W=None -> full chamber radius).  extra: callable(g) for more hardware."""
    Lh = R if Lh is None else Lh
    g = RGrid(R, Lh, h)
    g.sphere(0.0, a1)
    if source:
        g.sphere(-dist, a2)
    if foilpair is not None:
        W, model = foilpair
        add_disk(g, -dist / 2, 0, W, model); add_disk(g, dist / 2, 0, W, model)
    if can is not None:
        Rs, hole, model = can[:3]
        pin_corners = len(can) > 3 and can[3]
        add_disk(g, -Rs, 0, Rs, model)
        add_disk(g, Rs, hole, Rs, model) if hole < Rs else None
        add_shell(g, Rs, -Rs + (0 if model[0] == 'dir' else h), Rs - (0 if model[0] == 'dir' else h), model)
        if model[0] == 'slab' or pin_corners:   # corners pinned explicitly (a ring of width h)
            add_shell(g, Rs, -Rs, -Rs, ('dir',)); add_shell(g, Rs, Rs, Rs, ('dir',))
    if membrane is not None:
        zf, W, model = membrane
        add_disk(g, zf, 0, (g.r[-2] if W is None else W), model)
    if extra is not None:
        extra(g)
    return g


def F_test(g, phi, a1=A1, margin=0.08):
    return -force_z(g, phi, a1 + margin, -a1 - margin, a1 + margin)


def residual(h, F0=None, **kw):
    """source-dependent force on the test mass with the switch in, relative to the open (no switch) force."""
    t0 = time.time()
    if F0 is None:
        g = bench(h); phi, _ = solve(g); F0 = F_test(g, phi)
    g = bench(h, source=True, **kw); phi, r1 = solve(g); Fs = F_test(g, phi)
    g = bench(h, source=False, **kw); phi, r2 = solve(g); Fn = F_test(g, phi)
    return (Fs - Fn) / F0, F0, time.time() - t0
