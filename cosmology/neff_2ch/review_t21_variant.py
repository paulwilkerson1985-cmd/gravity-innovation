"""Fable review 2 (12 Oct 2026): |t21| scaling below the K Kbar threshold (eps = +-0.5) and a delta1 bump test, on the hybrid input.
Usage: python review_t21_variant.py {base|t21up|t21dn|bumpup|bumpdn}; then scan the saved tables with scanH-style code."""
import numpy as np, sys, time, warnings, pickle
warnings.filterwarnings("ignore")
import _gi_path  # noqa: F401
from tinput_hybrid import TInputHybrid, load_model, PI
from mo_solver import MOSolver
from run_two import FF
from ffvariants import RS
MPI, MK = 0.13957, 0.4957
SK, SP = 4*MK**2, 4*MPI**2
class Wrap:
    """modify the hybrid input below the KK threshold: t21 modulus scaling (eps) and delta1 bump (deg) on 0.8-2mK."""
    def __init__(self, base, eps=0.0, bump=0.0):
        self.base, self.eps, self.bump = base, eps, bump
        self.nch = 2
    def __call__(self, s):
        t = self.base(s)
        if s < SK:
            u = np.sqrt(s)
            lam = 1 + self.eps*(SK - s)/(SK - SP)
            d = np.angle(1 + 2j*np.sqrt(1-SP/s)*t[0,0])/2   # delta1 mod pi
            if self.bump != 0.0 and 0.8 < u < 2*MK:
                dd = np.radians(self.bump)*np.sin(np.pi*(u-0.8)/(2*MK-0.8))
                dn = d + dd; sg = np.sqrt(1-SP/s)
                t = t.copy()
                t[0,0] = np.exp(1j*dn)*np.sin(dn)/sg
                t[1,0] = abs(t[1,0])*np.exp(1j*dn)*np.sign(np.cos(np.angle(t[1,0])-d)) ; t[0,1] = t[1,0]
            t = t.copy(); t[1,0] *= lam; t[0,1] *= lam
        return t
def run(label, eps=0.0, bump=0.0, h=0.002):
    base = TInputHybrid(load_model("avg"))
    ti = Wrap(base, eps, bump)
    mo = MOSolver(ti, nch=2, ua=2.0, h=h).solve(); ff = FF(mo)
    ref = dict(np.load('ffcache/H.npz'))
    print(f"== {label}: svals {mo.svals[-3:]}  Omega'(0) {np.round(mo.omega_prime0().real,3).tolist()}")
    for rs in [0.5,0.7,0.8,0.85,0.9,0.95,0.97,1.0,1.05,1.1,1.2]:
        s=rs*rs; th=ff.theta(s); i=np.argmin(abs(ref['rs']-rs))
        print(f"  {rs:.2f} |thpi|^2 {abs(th[0])**2:8.3f} (H {ref['thpi2'][i]:8.3f}, x{abs(th[0])**2/ref['thpi2'][i]:.2f})  |thK|^2 {abs(th[1])**2:8.3f} (H {ref['thk2'][i]:8.3f}, x{abs(th[1])**2/ref['thk2'][i]:.2f})")
    np.savez(f'ffcache/review_{label}.npz', rs=RS, thpi2=np.array([abs(ff.theta(r*r)[0])**2 for r in RS]), thk2=np.array([abs(ff.theta(r*r)[1])**2 for r in RS]))
which = sys.argv[1]
if which=="base": run("H_base")
if which=="t21up": run("H_t21x1.5", eps=0.5)
if which=="t21dn": run("H_t21x0.5", eps=-0.5)
if which=="bumpup": run("H_d1bump+10", bump=10.0)
if which=="bumpdn": run("H_d1bump-10", bump=-10.0)
