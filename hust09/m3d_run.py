import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""Main 3D runs: scalar-field energy for NEAR (pendulum || sphere axis) and FAR (pendulum perpendicular) configurations,
with the shield and without it (free-pendulum reference).  Delta K' = -4 (E_near - E_far) (cos 2psi dominance),
units v^2/mu.  Usage: python3 m3d_run.py hf imu1,imu2,...  -> appends JSON lines to m3d_results.jsonl"""
import sys, time, json, numpy as np
sys.path.insert(0, (_GI + '/hust09'))
import h3d
from scipy.interpolate import RegularGridInterpolator
hf = float(sys.argv[1]); imus = [float(s) for s in sys.argv[2].split(',')]
zd = float(sys.argv[3]) if len(sys.argv) > 3 else 200.0
confs = sys.argv[4].split(',') if len(sys.argv) > 4 else ['near', 'far', 'near0', 'far0', 'nosph']
gap = float(sys.argv[5]) if len(sys.argv) > 5 else 2.0
G = h3d.Geom(hf=hf, zd=zd, gap=gap)
spec = {'near': dict(shield=True, spheres='x', pend='x'), 'far': dict(shield=True, spheres='x', pend='y'),
        'near0': dict(shield=False, spheres='x', pend='x'), 'far0': dict(shield=False, spheres='x', pend='y'),
        'nosph': dict(shield=True, spheres=None, pend='x')}
ops = {}
for c in confs:
    fx = G.mask(**spec[c]); S, dV, free = G.operators(fx); ops[c] = (fx, S, dV, free)
probes = [(0, 0, 92.), (0, 0, 80.), (30, 0, 50.), (0, 30, 50.), (30, 10, 34.2), (10, 30, 34.2), (60, 0, 92.), (0, 60, 92.)]
for imu in imus:
    mu = 1 / imu; out = dict(hf=hf, imu=imu, zd=zd, gap=gap); prev = None; prev_shield = None
    for c in confs:
        fx, S, dV, free = ops[c]
        p0 = None
        if prev is not None and spec[c]['shield'] == prev_shield:   # warm start only between same-shield configs
            p0 = prev[free]; p0 = np.where(p0 == 0, 0.5, p0)
        t = time.time(); pf, E, res = h3d.solve(S, dV, mu, p0=p0, verbose=False)
        if res > 1e-10:
            print('   (not converged, res=%.1e; restarting from phi=1)' % res)
            pf, E, res = h3d.solve(S, dV, mu, p0=None, verbose=False)
        prev_shield = spec[c]['shield']
        phi = np.zeros(fx.size); phi[free] = pf; prev = phi.copy(); phi = phi.reshape(fx.shape)
        I = RegularGridInterpolator((G.x, G.y, G.z), phi)
        pv = [float(I([p])[0]) for p in probes]
        out[c] = dict(E=E, res=res, phimax=float(phi.max()), probes=pv, t=time.time() - t)
        print('1/mu=%g %-6s E=%.12f res=%.1e phimax=%.4f  probes %s  (%.0fs)' %
              (imu, c, E, res, phi.max(), ' '.join('%.3e' % v for v in pv), time.time() - t)); sys.stdout.flush()
        if c == 'near' and hf <= 1.5:
            np.save((_GI + '/hust09/phi3d_near_imu%g_h%g.npy') % (imu, hf), phi.astype(np.float32))
    if 'near' in out and 'far' in out:
        dE = out['near']['E'] - out['far']['E']; out['dE'] = dE; out['dKp'] = -4 * dE
        print('  => shielded: E_near - E_far = %.4e   Delta K\' = %.4e (v^2/mu)' % (dE, -4 * dE))
    if 'near0' in out and 'far0' in out:
        dE0 = out['near0']['E'] - out['far0']['E']; out['dE0'] = dE0; out['dKp0'] = -4 * dE0
        print('  => no shield: E_near - E_far = %.4e   Delta K\' = %.4e (v^2/mu)' % (dE0, -4 * dE0))
    sys.stdout.flush()
    with open((_GI + '/hust09/m3d_results.jsonl'), 'a') as f:
        f.write(json.dumps(out) + '\n')
