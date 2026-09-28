import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Validate the 3D FV solver against the axisymmetric solver (symm.py, h=0.5 mm) for an axisymmetric configuration:
chamber + pedestal + shield (no spheres, no pendulum), 1/mu = 30 mm and 20 mm.  Compare phi at probe points."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/hust09')); sys.path.insert(0, (_GI + '/solver'))
import h3d, symm
from axisym import build, interp
from scipy.interpolate import RegularGridInterpolator
hf = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5
G = h3d.Geom(hf=hf)
fx = G.mask(shield=True, spheres=None, pend=None)
t = time.time(); S, dV, free = G.operators(fx); print('operators %.0fs, free=%d' % (time.time() - t, free.sum()))
pts = [(0, 0, 92.), (0, 0, 60.), (30, 0, 34.2), (0, 30, 34.2), (21.2, 21.2, 34.2), (60, 0, 92.), (0, 0, 200.), (150, 0, -100.)]
for imu in [30., 20.]:
    mu = 1 / imu
    t = time.time(); pf, E, res = h3d.solve(S, dV, mu, verbose=False)
    phi = np.zeros(fx.size); phi[free] = pf; phi = phi.reshape(fx.shape)
    I = RegularGridInterpolator((G.x, G.y, G.z), phi)
    g = build(0.5, mu_mm=mu, torus=False, pend='none'); pa, _ = symm.solve(g)
    print('1/mu=%g: 3D solve %.0fs res=%.1e E=%.6f' % (imu, time.time() - t, res, E))
    for p in pts:
        r = np.hypot(p[0], p[1])
        print('   (%5.1f,%5.1f,%6.1f)  3D %.5f   axisym %.5f' % (p[0], p[1], p[2], I([p])[0], float(interp(g, pa, r, p[2]))))
    sys.stdout.flush()
