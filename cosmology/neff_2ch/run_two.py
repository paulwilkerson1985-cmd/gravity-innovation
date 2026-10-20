import numpy as np, sys, time
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from formfactors import models
from tinput import TInput
from mo_solver import MOSolver
from neff_model import omnes_sq
from twochannel import NORM
MPI, MK = 0.13957, 0.4957
class FF:
    def __init__(self, mo, slope_pi=1.0, slope_k=1.0):
        self.mo = mo
        F0 = NORM * np.array([2 * MPI ** 2, 2 * MK ** 2]); F1 = NORM * np.array([slope_pi, slope_k])
        Op = mo.omega_prime0().real
        self.A0 = F0; self.B0 = F1 - Op @ F0
    def theta(self, s):
        F = self.mo.omega(s) @ (self.A0 + self.B0 * s)
        return F / NORM
if __name__ == "__main__":
    ms = models()
    out = {}
    for name in ("A", "B"):
        ti = TInput(ms[name], um=1.3, ua=2.0)
        print(name, "delta1(1.3)=%.1f deg, delta2(1.3)=%.1f deg, eta=%.3f, xi=%+d" % (np.degrees(ti.d1m), np.degrees(ti.d2m), ti.etam, ti.xi))
        t0 = time.time(); mo = MOSolver(ti, nch=2, ua=2.0, h=0.001).solve()
        print("  solve %.1fs, smallest svals" % (time.time() - t0), mo.svals)
        print("  Omega(0)=", np.round(mo.omega(-1e-9), 6).tolist())
        print("  max |Im(f)|/max|f| (reality of Im Omega):", np.abs(mo.f.imag).max() / np.abs(mo.f).max())
        out[name] = FF(mo)
    print(" rs     |th_pi|A |th_pi|B  1ch(s+2m2)Om   |th_K|A |th_K|B   LO_K   phase(th_pi)A")
    for rs in [0.3,0.4,0.5,0.6,0.7,0.8,0.85,0.9,0.95,0.97,0.98,0.99,1.0,1.02,1.05,1.1,1.2,1.3,1.4,1.5,1.7,2.0,2.5,3.0]:
        s = rs * rs
        a = out["A"].theta(s); b = out["B"].theta(s)
        om = np.sqrt(omnes_sq(s)) * (s + 2 * MPI ** 2)
        print(f"{rs:.2f}  {abs(a[0]):8.3f} {abs(b[0]):8.3f}  {om:8.3f}     {abs(a[1]):8.3f} {abs(b[1]):8.3f}  {s+2*MK**2:6.3f}   {np.degrees(np.angle(a[0])):7.1f}")
