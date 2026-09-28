import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U7: torsion-balance proxy geometry (axisymmetric), units 1/mu (reference 1/mu = 10 cm).
Chamber R = L_half (default 5 = 1 m x 1 m).  Test sphere a1=0.3 at z=0, source a2=0.6 at z=-1.4 (bottom at -2.0).
Hardware (all optional):
  fibre   : axis rod from z=0.45 (1.5 cm gap above the test mass, keeps the force pillbox clean) to the top wall;
            'unscr' = W fibre a=20 um unscreened (q = pi a^2 m_in^2, m_in/mu=308 at M=15 TeV -> q=0.012),
            'dir'   = same radius but fully pinning (worst case), 'col' = 5 mm Dirichlet column (resolved).
  housing : Dirichlet tube radius Rh from z_bot up to the top wall (pendulum thermal/vacuum housing).
  turntable: Dirichlet disk radius Rt, 1 cm thick, top surface at z = -2.0 - gap, + pedestal rod (r=0.1) up to the
            source if gap>0, + shaft rod r=0.15 down to the floor.
Outputs F~ (force on the test mass, v^2) and the condensation threshold R_c (chamber R = L_half at lambda_min=1).
usage: python3 u7_proxy.py <h> <part>"""
import sys, time, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z, lam_min
import units as U

A1, A2, D = 0.3, 0.6, 1.4
Q_W15 = np.pi * (2e-4)**2 * U.m_in_over_mu(19.3, 15, 10)**2


def proxy(h, R=5.0, fibre=None, housing=None, turntable=None, source=True, test=True):
    g = RGrid(R, R, h)
    Lh = g.z[-1]
    if test:
        g.sphere(0.0, A1)
    if source:
        g.sphere(-D, A2)
    tol = 1e-9
    if fibre == 'unscr':
        g.rod(0.45, Lh, 2e-4, Q_W15)
    elif fibre == 'dir':
        g.rod(0.45, Lh, 2e-4, np.inf)
    elif fibre == 'col':
        g.fixed |= (g.R <= 0.05 + tol) & (g.Z >= 0.45 - tol)
    if housing is not None:
        Rh, zb = housing
        g.fixed |= (np.abs(g.R - Rh) <= tol) & (g.Z >= zb - tol)
        g.fixed |= (g.R <= Rh + tol) & (np.abs(g.Z - Lh) <= tol)
    if turntable is not None:
        Rt, gap = turntable
        ztop = -D - A2 - gap
        g.fixed |= (g.R <= Rt + tol) & (g.Z <= ztop + tol) & (g.Z >= ztop - 0.1 - tol)
        if gap > 0:
            g.fixed |= (g.R <= 0.1 + tol) & (g.Z <= -D - A2 + 0.05) & (g.Z >= ztop - tol)
        g.fixed |= (g.R <= 0.15 + tol) & (g.Z <= ztop - 0.1 + tol)
    return g


def Ftest(g, phi):
    return -force_z(g, phi, A1 + 0.08, -A1 - 0.08, A1 + 0.08)


def run(h, **kw):
    """returns (signal S = F(source) - F(no source), phi_max, static force F(no source))"""
    g = proxy(h, **kw); phi, res = solve(g); Fs = Ftest(g, phi); pm = phi.max()
    g = proxy(h, source=False, **kw); phi, res = solve(g); Fn = Ftest(g, phi)
    return Fs - Fn, pm, Fn


def threshold(h, lo=3.0, hi=4.2, **kw):
    """R_c for chamber R = L_half (hardware fixed in units of 1/mu): integer bisection on grid-aligned R where
    lambda_min(R) - 1 changes sign, then linear interpolation between the bracketing grid sizes."""
    f = lambda n: lam_min(proxy(h, R=n * h, **kw))[0] - 1.0
    nl, nh = int(round(lo / h)), int(round(hi / h))
    fl, fh = f(nl), f(nh)
    while fh > 0:
        nl, fl = nh, fh; nh = int(nh * 1.3); fh = f(nh)
    while nh - nl > 1:
        nm = (nl + nh) // 2; fm = f(nm)
        if fm > 0:
            nl, fl = nm, fm
        else:
            nh, fh = nm, fm
    return h * (nl + fl / (fl - fh))


if __name__ == '__main__':
    h = float(sys.argv[1]); part = sys.argv[2]
    F0, pm, Fn0 = run(h)
    print('h=%.3f baseline S~=F~=%.4f phi_max=%.3f static=%.1e  (q_fibre(W,20um,M=15TeV,1/mu=10cm)=%.4f)' % (h, F0, pm, Fn0, Q_W15)); sys.stdout.flush()
    if part == 'items':
        cases = [('fibre unscreened W 20um', dict(fibre='unscr')),
                 ('fibre fully pinning 20um', dict(fibre='dir')),
                 ('5 mm support column', dict(fibre='col'))]
        for Rh in [0.3, 0.5]:
            for zb in [0.75, 1.0, 1.5, 2.0, 3.0]:
                cases.append(('housing Rh=%.1f z_bot=%.2f' % (Rh, zb), dict(fibre='unscr', housing=(Rh, zb))))
        for Rt in [1.0, 2.0, 3.0]:
            for gap in [0.0, 0.3, 0.6, 1.0]:
                cases.append(('turntable Rt=%.0f gap=%.1f' % (Rt, gap), dict(turntable=(Rt, gap))))
        for name, kw in cases:
            t0 = time.time(); F, pm, Fn = run(h, **kw)
            print('  %-32s signal S~=%.4f  S/S0=%.4f  static(no source)=%+.4f  phi_max=%.3f  (%.0fs)' % (name, F, F / F0, Fn, pm, time.time() - t0)); sys.stdout.flush()
    if part == 'full':
        for name, kw in [('baseline', {}),
                         ('turntable Rt=2 gap=0.3', dict(turntable=(2.0, 0.3))),
                         ('proxy A: fibre+housing(0.5,1.5)+tt(2,0.3)', dict(fibre='unscr', housing=(0.5, 1.5), turntable=(2.0, 0.3))),
                         ('proxy B: fibre+housing(0.3,1.0)+tt(2,0.0)', dict(fibre='unscr', housing=(0.3, 1.0), turntable=(2.0, 0.0)))]:
            t0 = time.time()
            F, pm, Fn = run(h, **kw)
            Rc = threshold(h, **kw)
            print('  %-44s S~=%.4f S/S0=%.4f (static %+.3f) R_c=%.3f (=chamber diameter %.0f cm at 1/mu=10 cm)  (%.0fs)' % (
                name, F, F / F0, Fn, Rc, 20 * Rc, time.time() - t0)); sys.stdout.flush()
