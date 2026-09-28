import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""All orientations on ONE half-domain grid (z mirror only) -> interaction energies W(th) and harmonics E2, E4.
usage: python3 torque3d_harm.py hf b"""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/design'))
from torque3d import TorsionGeom, run, A_T, A_S
hf = float(sys.argv[1]); b = float(sys.argv[2]); mu = 0.01; rs = b + 140.0
yf = b + A_T + 10; xf0, xf1 = -(b + A_T + 10), rs + A_S + 10
G = TorsionGeom(hf, xf0, xf1, yf, A_S + 10, ymirror=False)
src = (rs, 0.0, 0.0, A_S); c = np.cos(np.pi / 4)
E = {}
for th in [0, 30, 45, 60, 90]:
    t = np.radians(th); bod = [(b * np.cos(t), b * np.sin(t), 0, A_T), (-b * np.cos(t), -b * np.sin(t), 0, A_T)]
    E['src%d' % th], r1, t1, _ = run(G, bod + [src], mu)
    E['no%d' % th], r2, t2, _ = run(G, bod, mu)
    print('th=%2d  E(src)=%.8f E(nosrc)=%.8f  W=%.6f  (%.0fs)' % (th, E['src%d' % th], E['no%d' % th], E['src%d' % th] - E['no%d' % th], t1 + t2)); sys.stdout.flush()
W = {th: E['src%d' % th] - E['no%d' % th] for th in [0, 30, 45, 60, 90]}
# fit W(th) = E0 + E2 cos2th + E4 cos4th (+E6 cos6th) by least squares on 5 angles
ths = np.radians(np.array([0, 30, 45, 60, 90])); Wv = np.array([W[t] for t in [0, 30, 45, 60, 90]])
A = np.vstack([np.ones_like(ths), np.cos(2 * ths), np.cos(4 * ths), np.cos(6 * ths)]).T
coef, *_ = np.linalg.lstsq(A, Wv, rcond=None)
E0, E2, E4, E6 = coef
print('hf=%.1f b=%.0f: W(0)-W(90)=%.5f ; fit E0=%.5f E2=%.5f E4=%.5f E6=%.5f  (E4/E2=%.3f)' % (hf, b, W[0] - W[90], E0, E2, E4, E6, E4 / E2))
tt = np.linspace(0, np.pi / 2, 181); tau = 2 * E2 * np.sin(2 * tt) + 4 * E4 * np.sin(4 * tt) + 6 * E6 * np.sin(6 * tt)
i = np.argmax(np.abs(tau))
print('torque(th) = -dW/dth: 2th-amplitude 2|E2| = %.5f ; max |tau| = %.5f at th = %.1f deg ; tau(45)= %.5f  [v^2/mu]' % (2 * abs(E2), abs(tau[i]), np.degrees(tt[i]), abs(2 * E2)))
with open('torque3d_results.jsonl', 'a') as f:
    f.write(json.dumps(dict(harm=True, hf=hf, b=b, W={str(k): v for k, v in W.items()}, E0=E0, E2=E2, E4=E4, E6=E6, taumax=float(abs(tau[i])), th_max=float(np.degrees(tt[i])))) + '\n')
