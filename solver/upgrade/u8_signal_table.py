import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""U8: signal table.  Fixed physical bodies: Cu test sphere radius 3 cm (1.01 kg) at z=0, Cu source sphere radius 6 cm
(8.10 kg) centred 14 cm below; cylindrical chamber of diameter Dc = height (Dirichlet walls); 1/mu varies.
F~ = force on the test mass in units of v^2 (cut-cell solver, h ~ a1/10), physical F = v^2 F~.
usage: python3 u8_signal_table.py <Dc_m> [Linv list]   -> prints rows, appends JSON to u8_signal_table.json"""
import sys, json, time, os, numpy as np
sys.path.insert(0, (_GI + '/solver/upgrade'))
from symm_robin import RGrid, solve, force_z

G = 6.674e-11
m1 = 4 / 3 * np.pi * 0.03**3 * 8960; m2 = 4 / 3 * np.pi * 0.06**3 * 8960
FN = G * m1 * m2 / 0.14**2
Dc = float(sys.argv[1])
Ls = [float(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else [4, 7, 10, 15, 20]
fn = 'u8_signal_table_Dc%g.json' % Dc
db = json.load(open(fn)) if os.path.exists(fn) else {}
for L in Ls:
    a1, a2, dist, R = 3 / L, 6 / L, 14 / L, 50 * Dc / L
    out = []
    for fac in (1.0, 2.0):
        h0 = min(0.075 if L < 5 else 0.05, a1 / 10)
        h = R / round(R / h0) * fac          # R (= L_half) an exact multiple of h so z=0 is a grid node
        t0 = time.time()
        g = RGrid(R, R, h); g.sphere(0, a1); g.sphere(-dist, a2)
        phi, res = solve(g)
        mg = min(max(0.08, 3 * h), 0.5 * (dist - a1 - a2))   # pillbox >= 3 cells off the sphere
        F = -force_z(g, phi, a1 + mg, -a1 - mg, a1 + mg)
        out.append((h, F, phi.max(), time.time() - t0))
    (h, F, pm, dt), (h2, F2, _, _) = out
    Fx = F + (F - F2) / 3          # Richardson (2nd order)
    key = '%g,%g' % (Dc, L)
    db[key] = dict(Dc=Dc, Linv=L, R_mu=R, h=h, F=F, F_coarse=F2, F_rich=Fx, phi_max=pm)
    print('Dc=%.1f m 1/mu=%2g cm  R=L_half=%.2f/mu  phi_max=%.3f  F~=%.4f (h=%.3f; 2h: %.4f; extrap %.4f)  '
          'F[N] @v2=2.4e-13: %.2e  @2.4e-11: %.2e   F/F_N: %.2e / %.2e   (%.0fs)' % (
              Dc, L, R, pm, F, h, F2, Fx, 2.4e-13 * Fx, 2.4e-11 * Fx, 2.4e-13 * Fx / FN, 2.4e-11 * Fx / FN, dt))
    sys.stdout.flush()
    json.dump(db, open(fn, 'w'), indent=1)
print('F_Newton (1.01 kg / 8.10 kg Cu at 14 cm) = %.3e N' % FN)
