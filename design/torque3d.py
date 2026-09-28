import os as _gi_os
def _gi_root():
    d = _gi_os.path.dirname(_gi_os.path.abspath(__file__))
    while not _gi_os.path.exists(_gi_os.path.join(d, 'GI_REPO_ROOT')) and _gi_os.path.dirname(d) != d:
        d = _gi_os.path.dirname(d)
    return d
_GI = _gi_root()  # repository root (portable replacement for original absolute paths)
"""3D check of the torsion-balance signal (task 3): dumbbell pendulum + off-axis source in the 1 m chamber, solved with the
HUST-09 3D finite-volume machinery (hust09/h3d.py: vertex-centred FV, graded tensor grid, Newton + AMG-CG).
Units: mm; field v; energy E' in v^2/mu (see h3d docstring).  1/mu = 100 mm.

Geometry (design Tier-1 pendulum): two Cu spheres r = 30 mm at (+-b, 0, 0) [dumbbell along x], source sphere r = 60 mm
centred at (r_s cos th, r_s sin th, 0) with r_s = b + 140 mm (14 cm centre distance to the near body at th = 0).
Chamber: cylinder R = 500 mm, |z| <= 500 mm, Dirichlet.  Mirror planes: z = 0 always; y = 0 for th = 0 and 90 deg
(source on x axis / dumbbell on y axis), so those are quarter domains; th = 45 deg is a half domain.
E(th) = E0 + E2 cos 2th + ... ; torque on the pendulum tau(th) = -dE/dth; 2th-amplitude tau_2 = |E(0) - E(90)| (E6 neglected).
Proxy: pairwise superposition of the axisymmetric on-axis pair potential U(d) (integrated F~(d) of the validated solver).
usage: python3 torque3d.py <hf_mm> <b_mm> [configs]"""
import sys, time, json, numpy as np
sys.path.insert(0, (_GI + '/hust09'))
import h3d
from h3d import dual

DMAX = 20.0   # max graded step (mm); field scale is 1/mu = 100 mm, so 20 mm far from bodies is adequate


def axis(hf, xf, xmin, xmax, ratio=1.15):
    pts = list(np.arange(0.0, xf + 1e-9, hf)); d = hf
    while pts[-1] < xmax:
        d = min(d * ratio, DMAX); pts.append(pts[-1] + d)
    return np.array(pts)


def zaxis(hf, z0f, z1f, zmin, zmax, ratio=1.15):
    mid = list(np.arange(z0f, z1f + 1e-9, hf)); up = []; d = hf; z = mid[-1]
    while z < zmax:
        d = min(d * ratio, DMAX); z += d; up.append(z)
    dn = []; d = hf; z = mid[0]
    while z > zmin:
        d = min(d * ratio, DMAX); z -= d; dn.append(z)
    return np.array(dn[::-1] + mid + up)

R_CH, Z_CH = 500.0, 500.0
A_T, A_S = 30.0, 60.0


class TorsionGeom:
    def __init__(self, hf, xf0, xf1, yf, zf, ymirror=True):
        # x: fine on [xf0, xf1], graded to +-R_CH (no mirror); y: mirror at 0 or full; z: mirror at 0
        self.x = zaxis(hf, xf0, xf1, -R_CH, R_CH)
        self.y = axis(hf, yf, 0, R_CH + 1e-6) if ymirror else zaxis(hf, -yf, yf, -R_CH, R_CH)
        self.z = axis(hf, zf, 0, Z_CH + 1e-6)
        self.ymirror = ymirror
        X, Y, Z = np.meshgrid(self.x, self.y, self.z, indexing='ij')
        self.X, self.Y, self.Z = X, Y, Z
        self.dVx = dual(self.x, False); self.dVy = dual(self.y, ymirror); self.dVz = dual(self.z, True)
        self.base = (X**2 + Y**2 >= R_CH**2) | (np.abs(Z) >= Z_CH - 1e-9)
        print('grid %d x %d x %d = %.2fM nodes (hf=%.2f)' % (len(self.x), len(self.y), len(self.z), X.size / 1e6, hf)); sys.stdout.flush()

    def mask(self, bodies):
        fx = self.base.copy()
        for (cx, cy, cz, a) in bodies:
            fx |= (self.X - cx)**2 + (self.Y - cy)**2 + (self.Z - cz)**2 <= a**2
        return fx

    def operators(self, fixed):
        return h3d.Geom.operators(self, fixed)


def run(G, bodies, mu, p0=None):
    fx = G.mask(bodies); S, dV, free = G.operators(fx)
    t = time.time(); pf, E, res = h3d.solve(S, dV, mu, p0=p0, verbose=False)
    if res > 1e-10:
        pf, E, res = h3d.solve(S, dV, mu, p0=None, verbose=False)
    # E' is the energy of the computed (mirrored) fraction of the chamber; scale to the full chamber
    frac = 2.0 if G.ymirror else 1.0     # z mirror
    frac *= 2.0
    return E * frac, res, time.time() - t, pf.max()


if __name__ == '__main__':
    hf = float(sys.argv[1]); b = float(sys.argv[2])
    confs = sys.argv[3].split(',') if len(sys.argv) > 3 else ['near', 'perp', 'diag', 'nosrc_x', 'nosrc_y', 'nosrc_d', 'srconly']
    imu = 100.0; mu = 1 / imu
    rs = b + 140.0
    out = dict(hf=hf, b=b, rs=rs)
    # quarter-domain grids: fine box must contain all bodies with margin
    xf0, xf1 = -(b + A_T + 10), rs + A_S + 10
    yf = max(b + A_T, A_S) + 10; zf = A_S + 10
    Gq = TorsionGeom(hf, xf0, xf1, yf, zf, ymirror=True)
    src = (rs, 0.0, 0.0, A_S)
    spec = {'near': [(b, 0, 0, A_T), (-b, 0, 0, A_T), src],
            'perp': [(0, b, 0, A_T), (0, -b, 0, A_T), src],      # quarter domain with y mirror: body at (0,b) mirrored -> both
            'nosrc_x': [(b, 0, 0, A_T), (-b, 0, 0, A_T)],
            'nosrc_y': [(0, b, 0, A_T), (0, -b, 0, A_T)],
            'srconly': [src]}
    for c in confs:
        if c in spec:
            E, res, t, pm = run(Gq, spec[c], mu)
            out[c] = dict(E=E, res=res, phimax=pm)
            print('%-8s E=%.10f res=%.0e phimax=%.4f (%.0fs)' % (c, E, res, pm, t)); sys.stdout.flush()
    if 'diag' in confs or 'nosrc_d' in confs:
        c45 = np.cos(np.pi / 4)
        Gh = TorsionGeom(hf, xf0, xf1, max(b * c45 + A_T, A_S) + 10, zf, ymirror=False)
        # half domain (z mirror only): dumbbell at 45 deg, source on x axis
        for c, bodies in [('diag', [(b * c45, b * c45, 0, A_T), (-b * c45, -b * c45, 0, A_T), src]),
                          ('nosrc_d', [(b * c45, b * c45, 0, A_T), (-b * c45, -b * c45, 0, A_T)])]:
            if c in confs:
                E, res, t, pm = run(Gh, bodies, mu)
                out[c] = dict(E=E, res=res, phimax=pm)
                print('%-8s E=%.10f res=%.0e phimax=%.4f (%.0fs)' % (c, E, res, pm, t)); sys.stdout.flush()
    if 'near' in out and 'perp' in out:
        # remove the (tiny) pendulum-orientation dependence of the no-source energy (grid anisotropy + walls)
        dE_raw = out['near']['E'] - out['perp']['E']
        dE0 = out['nosrc_x']['E'] - out['nosrc_y']['E'] if ('nosrc_x' in out and 'nosrc_y' in out) else 0.0
        out['dE_raw'] = dE_raw; out['dE0_nosrc'] = dE0; out['tau2'] = abs(dE_raw - dE0)
        print('E(near)-E(perp) = %.4e  (no-source orientation offset %.1e)  ->  tau_2 = |dE| = %.4e v^2/mu' % (dE_raw, dE0, out['tau2']))
        if 'diag' in out and 'nosrc_d' in out:
            Ed = out['diag']['E'] - out['nosrc_d']['E']; En = out['near']['E'] - out['nosrc_x']['E']; Ep = out['perp']['E'] - out['nosrc_y']['E']
            # interaction energies W(th) = E(th) - E(no source); fit E0 + E2 cos2th + E4 cos4th
            E0 = (En + Ep) / 2; E2 = (En - Ep) / 2; E4 = (En + Ep) / 2 - Ed   # from W(45) = E0 - E4
            out['W_near'], out['W_perp'], out['W_diag'] = En, Ep, Ed
            out['E2'], out['E4'] = E2, E4
            print('interaction energies W(0)=%.5f W(45)=%.5f W(90)=%.5f  -> E2=%.5f E4=%.5f (E4/E2=%.3f); '
                  'tau(45)=2E2 -> %.4e v^2/mu; tau_max includes 4th: check' % (En, Ed, Ep, E2, E4, E4 / E2 if E2 else 0, 2 * abs(E2)))
    with open((_GI + '/design/torque3d_results.jsonl'), 'a') as f:
        f.write(json.dumps(out) + '\n')
