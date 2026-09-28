"""One-command reproduction of the two numbers quoted in the white paper's "What we ask" section.

  1. Benchmark force F~ (dimensionless, units of v^2): Cu spheres of radius 0.3/mu (test, 3 cm) and 0.6/mu (source, 6 cm),
     centres 1.4/mu (14 cm) apart, pinned (screened), inside a closed cylinder of radius 5/mu and length 10/mu
     (1 m x 1 m at 1/mu = 10 cm).  Expected: F~ = 1.195 +- 0.005 (cut-cell solver; 1.1957 at h = 0.02).
  2. Membrane case: a full-width Robin sheet with kappa/mu = 0.1, midway between the two sphere surfaces (z = -0.55/mu).
     Expected: signal S/S0 ~ 0.92 (7.8% loss) at h = 0.05.  (A real 2 um Al-Mylar membrane at 1/mu = 10 cm and
     M = 15 TeV has kappa/mu ~ 0.14, about 11% loss; kappa/mu scales as (1/mu)/M^2.)

Usage:  python reproduce_benchmark.py            (about 10 seconds on a laptop)
        python reproduce_benchmark.py --fine     (adds h = 0.01 for the benchmark; about a minute)
Requires numpy and scipy.  Units: lengths in 1/mu, field in v = mu/sqrt(lambda), force in v^2 (1 eV^2 = 8.12e-13 N).
"""
import os, sys, time
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'solver'))
sys.path.insert(0, os.path.join(ROOT, 'solver', 'validation'))
sys.path.insert(0, os.path.join(ROOT, 'solver', 'upgrade'))

from symm_sw import GridSW, solve, force_z  # second-order cut-cell solver (validated)


def benchmark(h):
    g = GridSW(5, 5, h)          # cylinder radius 5, half-length 5 (units of 1/mu)
    g.sphere(0, 0.3)             # test sphere at z = 0
    g.sphere(-1.4, 0.6)          # source sphere, centre 1.4 below
    phi, res = solve(g)
    F = force_z(g, phi, 0.3 + 0.08, -0.3 - 0.08, 0.3 + 0.08)   # stress-tensor force on the test sphere
    return F, res


def membrane(h=0.05, kappa=0.1):
    from configs import bench, F_test
    from symm_robin import solve as rsolve
    def sig(**kw):
        g = bench(h, **kw); p, _ = rsolve(g); Fs = F_test(g, p)
        g = bench(h, source=False, **kw); p, _ = rsolve(g); Fn = F_test(g, p)
        return Fs - Fn
    g = bench(h); p, _ = rsolve(g); F0 = F_test(g, p)
    S = sig(membrane=(-0.55, None, ('robin', kappa)))
    return F0, S / F0


if __name__ == '__main__':
    hs = [0.04, 0.02] + ([0.01] if '--fine' in sys.argv else [])
    print('1) Benchmark |F~| (attractive, toward the source; expected 1.195 +- 0.005; 1.1981 / 1.1957 / 1.1950 at h = 0.04 / 0.02 / 0.01)')
    for h in hs:
        t = time.time(); F, res = benchmark(h)
        print('   h = %.3f   F~ = %.4f   residual = %.0e   (%.0f s)' % (h, abs(F), res, time.time() - t))
    print('2) Full-width membrane, kappa/mu = 0.1 (expected S/S0 ~ 0.92, i.e. ~8% loss)')
    t = time.time(); F0, r = membrane()
    print('   h = 0.050   F0 = %.4f   S/S0 = %.4f   loss = %.1f%%   (%.0f s)' % (F0, r, 100 * (1 - r), time.time() - t))
