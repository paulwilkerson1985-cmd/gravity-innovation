import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""A1: condensation threshold of the HUST-09 chamber with hardware (axisymmetric proxy, linear eigenvalue).
The field condenses anywhere iff lambda_min(-Lap, Dirichlet on all pinned surfaces) < mu^2  ->  1/mu_c = lambda_min^-1/2."""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/hust09'))
from axisym import build, lam_min
j01 = 2.404825557695773
print('exact empty cylinder R=225, H=500: 1/mu_c = %.2f mm' % (1 / np.sqrt((j01 / 225)**2 + (np.pi / 500)**2)))
cases = [
    ('empty chamber', dict(ped=False, shield=False, torus=False, pend='none')),
    ('pedestal only zd=200 Rped=125', dict(shield=False, torus=False, pend='none')),
    ('NOMINAL zd=200 Rped=125 +shield+torus+pend(cyl)', dict()),
    ('nominal, pend=disk', dict(pend='disk')),
    ('zd=150', dict(zd=150.)),
    ('zd=250', dict(zd=250.)),
    ('Rped=100', dict(Rped=100.)),
    ('Rped=140', dict(Rped=140.)),
    ('everything below disk plane pinned (Rped=225)', dict(Rped=225.)),
    ('worst: zd=250, Rped=225', dict(zd=250., Rped=225.)),
]
for h in [1.0, 0.5]:
    print('--- h = %.2f mm' % h)
    for name, kw in cases:
        if h < 1 and name not in ('empty chamber', 'NOMINAL zd=200 Rped=125 +shield+torus+pend(cyl)'):
            continue
        t = time.time(); g = build(h, **kw); lam = lam_min(g)
        print('  %-50s lambda_min = %.4e mm^-2  -> 1/mu_c = %.2f mm   (%.0fs)' % (name, lam, 1 / np.sqrt(lam), time.time() - t))
        sys.stdout.flush()
