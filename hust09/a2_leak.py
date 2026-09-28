import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""A2: nonlinear axisymmetric solutions (staircase, h = 0.5 mm) for 1/mu = 15..60 mm.
Reports the chamber condensate, the field at the cup mouth and inside the cup at the pendulum location, with and without
the shield, with the source spheres as a torus, and for bottom-gap variants.  Saves phi arrays to npz."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/hust09')); sys.path.insert(0, (_GI + '/solver'))
import symm
from axisym import build, interp
h = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
imus = [15., 20., 30., 40., 50., 60.]
pts = [('axis, mouth z=92', 0, 92.), ('axis z=77 (mirror top)', 0, 77.), ('r=30 z=60', 30, 60.),
       ('r=30 z=47.4 (pend top)', 30, 47.4), ('r=30 z=34.2 (pend ctr ht)', 30, 34.2), ('r=40 z=34.2', 40, 34.2),
       ('outside r=60 z=92', 60, 92.), ('outside r=78.6 z=100', 78.6, 100.), ('chamber ctr r=0 z=200', 0, 200.)]
variants = [('nominal (shield, torus, pend cyl, gap 2)', dict()),
            ('no shield', dict(shield=False)),
            ('no torus', dict(torus=False)),
            ('gap 5 mm', dict(gap=5.0)),
            ('pend none', dict(pend='none'))]
res_all = {}
for imu in imus:
    mu = 1 / imu
    print('=== 1/mu = %.0f mm' % imu); sys.stdout.flush()
    for vname, kw in variants:
        if imu >= 50 and vname not in ('nominal (shield, torus, pend cyl, gap 2)', 'no shield'):
            continue
        t = time.time()
        g = build(h, mu_mm=mu, **kw)
        phi, res = symm.solve(g)
        vals = [interp(g, phi, r, z) for _, r, z in pts]
        print('  %-42s phimax=%.4f res=%.0e (%.0fs)' % (vname, phi.max(), res, time.time() - t))
        print('     ' + '  '.join('%s: %.3e' % (n, v) for (n, _, _), v in zip(pts, vals)))
        sys.stdout.flush()
        res_all['%g_%s' % (imu, vname.split(' ')[0] + vname.split(' ')[1] if ' ' in vname else vname)] = phi
        if vname.startswith('nominal') or vname == 'no shield':
            np.savez_compressed((_GI + '/hust09/axi_phi_imu%g_%s.npz') % (imu, 'nom' if vname.startswith('nominal') else 'noshield'),
                                phi=phi.astype(np.float32), h=h, imu=imu, zoff=g.zoff)
