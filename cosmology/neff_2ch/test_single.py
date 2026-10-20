import numpy as np, sys, time
import _gi_path  # noqa: F401  (adds cosmology/neff_proper to sys.path)
from mo_solver import MOSolver, MPI
from neff_model import delta00, omnes_sq
def t1(s):
    d = delta00(s); sg = np.sqrt(1 - 4*MPI**2/s)
    return np.array([[np.exp(1j*d)*np.sin(d)/sg]])
for h in (0.002, 0.001):
    t0=time.time()
    mo = MOSolver(t1, nch=1, ua=1.2, h=h).solve()
    print(f"h={h}: smallest svals {mo.svals}, time {time.time()-t0:.1f}s, Omega(0) check {mo.omega(-1e-9)}")
    for rs in [0.3, 0.5, 0.7, 0.8, 0.9, 0.95, 0.97]:
        s = rs*rs
        o = mo.omega(s)[0,0]
        print(f"   rs={rs}: |Om|^2 solver {abs(o)**2:8.4f}  exact omnes_sq {omnes_sq(s):8.4f}   phase {np.degrees(np.angle(o)):7.2f} vs delta {np.degrees(delta00(s)):7.2f}")
    for s in [-1.0, -0.2, 0.05]:
        print(f"   s={s}: solver {mo.omega(s)[0,0].real:.5f}  exact {np.sqrt(omnes_sq(s)) if s>0 else float('nan'):.5f}")
