"""One-command reproduction of the benchmark force quoted in the white paper's "What we ask" section.

Benchmark force F~ (dimensionless, units of v^2): Cu spheres of radius 0.3/mu (test, 3 cm) and 0.6/mu (source, 6 cm),
centres 1.4/mu (14 cm) apart, pinned (screened), inside a closed cylinder of radius 5/mu and length 10/mu
(1 m x 1 m at 1/mu = 10 cm).  Expected: F~ = 1.195 +- 0.005 (cut-cell solver; 1.1957 at h = 0.02).

Usage:  python reproduce_benchmark.py            (about 1-5 minutes on a laptop)
        python reproduce_benchmark.py --fine     (adds h = 0.01; slower)
Requires numpy and scipy.  Units: lengths in 1/mu, field in v = mu/sqrt(lambda), force in v^2 (1 eV^2 = 8.12e-13 N).
"""
import os, sys, time
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'solver'))
sys.path.insert(0, os.path.join(ROOT, 'solver', 'validation'))

from symm_sw import GridSW, solve, force_z  # second-order cut-cell solver (validated)


def benchmark(h):
    g = GridSW(5, 5, h)          # cylinder radius 5, half-length 5 (units of 1/mu)
    g.sphere(0, 0.3)             # test sphere at z = 0
    g.sphere(-1.4, 0.6)          # source sphere, centre 1.4 below
    phi, res = solve(g)
    F = force_z(g, phi, 0.3 + 0.08, -0.3 - 0.08, 0.3 + 0.08)   # stress-tensor force on the test sphere
    return F, res


if __name__ == '__main__':
    hs = [0.04, 0.02] + ([0.01] if '--fine' in sys.argv else [])
    print('Benchmark |F~| (attractive, toward the source; expected 1.195 +- 0.005; 1.1981 / 1.1957 / 1.1950 at h = 0.04 / 0.02 / 0.01)')
    for h in hs:
        t = time.time(); F, res = benchmark(h)
        print('   h = %.3f   F~ = %.4f   residual = %.0e   (%.0f s)' % (h, abs(F), res, time.time() - t))
