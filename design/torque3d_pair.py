import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""3D on-axis pair (test at origin, source at (140,0,0)) in the same 3D solver -> interaction energy W_pair, to calibrate
the 3D staircase bias against the axisymmetric U(1.4) = -0.8510 v^2/mu.  usage: python3 torque3d_pair.py hf"""
import sys, json, numpy as np
sys.path.insert(0, (_GI + '/design'))
from torque3d import TorsionGeom, run, A_T, A_S
hf = float(sys.argv[1]); mu = 0.01
G = TorsionGeom(hf, -(A_T + 10), 140 + A_S + 10, A_S + 10, A_S + 10, ymirror=True)
E = {}
for c, bodies in [('both', [(0, 0, 0, A_T), (140, 0, 0, A_S)]), ('test', [(0, 0, 0, A_T)]), ('src', [(140, 0, 0, A_S)]), ('empty', [])]:
    E[c], res, t, pm = run(G, bodies, mu)
    print('%-6s E=%.10f res=%.0e phimax=%.4f (%.0fs)' % (c, E[c], res, pm, t)); sys.stdout.flush()
W = E['both'] - E['test'] - E['src'] + E['empty']
print('hf=%.2f  W_pair(1.4) = %.5f v^2/mu   (axisymmetric U = -0.8510)  ratio %.4f' % (hf, W, W / -0.8510))
with open('torque3d_results.jsonl', 'a') as f:
    f.write(json.dumps(dict(pair=True, hf=hf, E=E, W=W)) + '\n')
