import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""V5: stress-tensor force vs. energy derivative.  Bodies are moved by whole grid cells (staircase shape unchanged).
F_source,z = +dE/dD (source at z=-D moved);  F_test,z = -dE/dz_test.
Two energies: (i) the original symm.energy() (np.gradient-based diagnostic), (ii) E_h, the discrete energy whose
exact minimiser the FD scheme computes (edge-based; Lap = -grad E_h / node volume)."""
import sys, numpy as np
sys.path.insert(0, (_GI + '/solver'))
from symm import *
a1, a2, D = 0.3, 0.6, 1.4

def energy_consistent(g, phi, gas=0.0):
    h = g.h; m2 = 1 - gas
    r = g.r
    w = 2 * np.pi * r * h * h; w[0] = np.pi * h**3 / 4          # node volumes
    c = 2 * np.pi * (r[:-1] + h / 2)                               # r-edge weights
    Er = 0.5 * np.sum(c[:, None] * (phi[1:, :] - phi[:-1, :])**2)
    Ez = 0.5 * np.sum(w[:, None] / h**2 * (phi[:, 1:] - phi[:, :-1])**2)
    Vs = -m2 * phi**2 / 2 + phi**4 / 4 + m2**2 / 4
    Ev = np.sum((w[:, None] * Vs)[~g.fixed])
    return Er + Ez + Ev

for h in [0.04, 0.02, 0.01]:
    def run(zt, zs):
        g = Grid(5, 5, h); g.sphere(zt, a1); g.sphere(zs, a2)
        phi, res = solve(g); return g, phi
    g, phi = run(0.0, -D)
    Ft = force_z(g, phi, a1 + 0.08, -a1 - 0.08, a1 + 0.08)
    Fs = force_z(g, phi, a2 + 0.1, -D - a2 - 0.1, -D + a2 + 0.1)
    runs = {k: run(*k) for k in [(0.0, -D - h), (0.0, -D + h), (h, -D), (-h, -D)]}
    for name, Ef in [('symm.energy', energy), ('E_h consistent', energy_consistent)]:
        E = {k: Ef(*v) for k, v in runs.items()}
        dEdD = (E[(0.0, -D - h)] - E[(0.0, -D + h)]) / (2 * h)
        dEdzt = (E[(h, -D)] - E[(-h, -D)]) / (2 * h)
        print('h=%.2f %-15s F_test: stress=%.5f  -dE/dz=%.5f (diff %.1f%%) | F_source: stress=%.5f  dE/dD=%.5f (diff %.1f%%)' % (
            h, name, Ft, -dEdzt, 100 * (-dEdzt / Ft - 1), Fs, dEdD, 100 * (dEdD / Fs - 1)))
    print('       walls take %.5f' % (-(Ft + Fs))); sys.stdout.flush()
