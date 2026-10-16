"""Ashkit - anatomy pass on the bake-off D design (same silhouette, proportions, palette, ink).

Construction fixes vs bakeoff/D/work/ashkit.py:
  * face features are SNAPPED to the blockout surface with a BVH ray cast (eyes, glints, nose, mouth),
    so nothing floats or bulges past the head contour;
  * eyes sit on the front planes of the skull at the stop (just above the muzzle), symmetric about y=0;
  * a defined short snout with the nose at its tip, a philtrum + two-lobed mouth line on the muzzle;
  * cream mask boundary passes BELOW the eyes (eyes on orange, never half in/half out);
  * all four paws planted on one ground plane (the raised paw is gone), legs under shoulders / hips;
  * chest bib as a 3-D ellipsoid zone (no hard vertical edge in side view);
  * battle pose = a 'battle' shape key that turns the head toward the camera (rest mesh stays symmetric).
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(  # tunables (round-by-round)
    eye_y=float(os.environ.get('EYE_Y', 0.275)), eye_z=1.245, eye_w=0.135, eye_h=0.165, eye_d=0.05, eye_out=0.016, eye_fwd=float(os.environ.get('EYE_FWD', 0.12)),
    snout=(0.87, 0.0, 0.975), snout_r=0.235, snout_size=(1.36, 0.86, 0.74),
    head_turn=float(os.environ.get('TURN', 16)), head_lift=float(os.environ.get('LIFT', 4)),
)

ORANGE = srgb('#ff7a2e'); CREAM = srgb('#ffe9c6'); SOOT = srgb('#3b2d33'); EMBER = srgb('#ffb02a'); EMBER_CORE = srgb('#fff3b0')
EYE = srgb('#2b1a1e'); WHITE = srgb('#ffffff'); NOSE = srgb('#2b1a1e')
INK = '#2a1418'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.40, 0.0, 1.16))          # head centre
B = Blob('ashkit', resolution=0.035)
B.add((-0.06, 0, 0.62), 0.50, size=(1.05, 0.92, 0.86))        # body
B.add((0.16, 0, 0.84), 0.38)                                  # chest / neck
B.add((0.26, 0, 1.00), 0.32)                                  # neck fill (smooth back line)
B.add(C, 0.60, size=(0.95, 1.06, 0.92))                       # head (as big as the body)
for s in (-1, 1):
    B.add((0.60, 0.37 * s, 0.98), 0.27)                       # cheek fluff
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)  # short defined snout
# legs: all four planted on z=0. Front legs under the shoulders, hind legs under the hips;
# a small haunch / shoulder mass above each so the legs grow out of the body instead of pegs.
GROUND = 0.0
legs = [(0.25, 0.26), (0.25, -0.26), (-0.31, 0.27), (-0.31, -0.27)]
for (x, y) in legs:
    top = Vector((x, y, 0.50)); foot = Vector((x, y, 0.15))
    B.chain(top, foot, 0.148, 0.135, n=5)
    B.add((x + 0.06, y, GROUND + 0.105), 0.15, size=(1.35, 1.0, 0.70), stiff=2.5)   # paw, toes forward
for s in (-1, 1):
    B.add((-0.30, 0.25 * s, 0.56), 0.26, size=(1.1, 0.9, 1.0))  # haunch
    B.add((0.24, 0.24 * s, 0.58), 0.21)                        # shoulder
# short fluffy tail rising from the rump and curling up (slightly to the far side so it reads in 3/4)
for co, r in [((-0.50, 0.03, 0.74), 0.23), ((-0.64, 0.07, 0.88), 0.22), ((-0.71, 0.10, 1.04), 0.19)]:
    B.add(co, r)
body = B.mesh(voxel=0.018)
# flatten the paw soles exactly onto the ground plane (one plane for all four)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], GROUND)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s', 'zmin', co[:, 2].min())

dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    """Surface point on the ray origin->target (first hit from inside origin outward). Returns (p, n)."""
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


# ------------------------------------------------------------------ hard parts
mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', NOSE, ink=INK)
mat_ember = toon_material('ember', EMBER, glow=0.75, ink='#c8481c')
mat_core = toon_material('ember_core', EMBER_CORE, glow=1.0, ink='#ffb02a')
assign(body, mat_body)
parts = []
# ears: as D (big tapered slabs, inner face forward, tilted outward and back), seated deep in the skull
EAR = dict(c=(0.30, 0.34, 1.70), s=(0.13, 0.30, 0.50), rx=-26, ry=-10)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92)
    parts.append(assign(e, mat_body))

d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
EYES = []
for s in (-1, 1):
    # ray from the head centre out through the eye spot -> point on the skull's front plane
    p, n = snap((C.x + 1.0, P['eye_y'] * s * 1.0 / 0.55 * 0.55, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    # eye disc faces between the surface normal and straight ahead (cartoon eyes look forward)
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    e = ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f)
    parts.append(assign(e, mat_eye))
    # catch-lights on the eye dome: big one toward the key light (image upper-left), small one opposite
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.046), (-0.55, 0.022))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        g = ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.016), track=f)
        parts.append(assign(g, mat_glint))
    EYES.append((p, n, f))
    print('  eye', s, tuple(round(v, 3) for v in p), 'normal', tuple(round(v, 2) for v in n))

# nose: rounded inverted triangle snapped onto the snout tip
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.045), (sx, 0, sz + 0.045))
nose_c = tip - tn * 0.02
nose = ellipsoid('nose', nose_c, (0.058, 0.088, 0.064), rot=(180, 0, 0), taper=0.45)
parts.append(assign(nose, mat_nose))
# mouth: philtrum down from the nose, then a lobe to each side running back along the snout
mo = Vector((sx - 0.05, 0, sz - 0.02))       # cast origin inside the snout
nb, _ = snap((sx + 1, 0, sz - 0.035), mo)     # philtrum foot
MOUTH = []
top, _ = snap((sx + 1, 0, sz + 0.0), mo)
zf = sz - 0.05
nb, _ = snap((sx + 1, 0, zf), (sx, 0, zf))     # philtrum foot on the snout front
lobe = {}
for s in (-1, 1):
    # each lobe: cast sideways from the snout axis -> points ON the snout flank, a smile that dips then rises
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((1.135, zf - 0.030), (1.09, zf - 0.050), (1.04, zf - 0.044), (0.99, zf - 0.016), (0.955, zf + 0.012))]
    print('  mouth lobe', s, [tuple(round(v, 3) for v in q) for q in lobe[s]])
smile = list(reversed(lobe[-1])) + [nb] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.007, 0.010, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.012, 0.010, 0.007], res=8), mat_nose))
parts.append(assign(tube('philtrum', [tuple(top), tuple(top.lerp(nb, 0.45)), tuple(top.lerp(nb, 0.85))], [0.011, 0.011, 0.009], res=6), mat_nose))
MOUTH = smile
# ember flame on the tail tip: outer teardrop + pale core (as D)
fl = ellipsoid('ember', (-0.73, 0.11, 1.27), (0.19, 0.19, 0.30), rot=(0, -12, 0), taper=0.88)
parts.append(assign(fl, mat_ember))
fc = ellipsoid('ember_core', Vector((-0.72, 0.11, 1.23)) + d_cam * 0.13, (0.10, 0.10, 0.19), rot=(0, -12, 0), taper=0.9)
parts.append(assign(fc, mat_core))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)
bm = vertex_slot_mask(body, {'body'})


def ear_local(co, s):
    R = np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())
    return (co - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ R


def inner_ear(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        l = ear_local(co, s)
        t = np.clip((l[:, 2] + 0.05) / 0.45, 0, 1)
        m |= (l[:, 0] > 0.0) & (l[:, 2] > -0.05) & (l[:, 2] < 0.33) & (np.abs(l[:, 1]) < 0.21 * (1 - t) ** 0.8)
    return bm & m


def ear_tip(co, nm):
    m = np.zeros(len(co), dtype=bool)
    for s in (-1, 1):
        m |= ear_local(co, s)[:, 2] > 0.27
    return bm & m


def mask(co, nm):
    # fox mask: snout + cheeks. Seen from the side the top edge runs from just under the eye
    # diagonally back and down along the jaw (no vertical cut); toward the flanks it sweeps up the cheek.
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.035) + 0.14 * np.clip((ay - 0.30) / 0.30, 0, 1) ** 1.5
    jaw = 1.07 + 0.85 * (co[:, 0] - 0.74) + 0.22 * np.clip((ay - 0.22) / 0.4, 0, 1)
    back = (co[:, 0] - 0.30) > 0.6 * (0.98 - co[:, 2])          # diagonal back edge, meets the chest bib
    return bm & (co[:, 2] < np.minimum(ztop, jaw)) & (co[:, 2] > 0.60) & back


zones = [
    (lambda co, nm: bm & (co[:, 2] < 0.42) & (co[:, 2] > 0.26) & (np.abs(co[:, 1]) < 0.30) & (co[:, 0] > -0.40) & (co[:, 0] < 0.16), CREAM),  # belly
    (lambda co, nm: bm & (((co[:, 0] - 0.56) / 0.26) ** 2 + (co[:, 1] / 0.30) ** 2 + ((co[:, 2] - 0.66) / 0.30) ** 2 < 1), CREAM),       # chest bib
    (mask, CREAM),
    (inner_ear, CREAM),
    (ear_tip, SOOT),
    (lambda co, nm: bm & (co[:, 2] < 0.27) & (co[:, 0] > -0.55), SOOT),   # sooty socks, same height on all four
]
paint_zones(body, ORANGE, zones, mask=bm)
smoothstep_blend(body, 'Col', iters=1)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def add_battle_key(o, turn_deg, lift_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    co, _ = mesh_arrays(o)
    # head weight: everything above the neck line + the chin/snout in front; tail and legs excluded
    w = np.maximum(smooth(0.86, 1.08, co[:, 2]), smooth(0.48, 0.66, co[:, 0]) * smooth(0.55, 0.72, co[:, 2]))
    w *= smooth(-0.40, -0.20, co[:, 0])
    piv = np.array((0.26, 0.0, 0.92))
    a = math.radians(-turn_deg)        # -Z rotation: nose swings toward -Y (the camera side)
    b = math.radians(-lift_deg)        # rotation about Y: negative lifts the nose
    out = co.copy()
    rel = co - piv
    aw = a * w; bw = b * w
    # pitch (about Y) then yaw (about Z), per-vertex angle
    x1 = rel[:, 0] * np.cos(bw) + rel[:, 2] * np.sin(bw)
    z1 = -rel[:, 0] * np.sin(bw) + rel[:, 2] * np.cos(bw)
    y1 = rel[:, 1]
    x2 = x1 * np.cos(aw) - y1 * np.sin(aw)
    y2 = x1 * np.sin(aw) + y1 * np.cos(aw)
    out[:, 0], out[:, 1], out[:, 2] = x2 + piv[0], y2 + piv[1], z1 + piv[2]
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['head_turn'], P['head_lift'])

# ------------------------------------------------------------------ render
OUTDIR = os.environ.get('OUTDIR', os.path.join(OUT, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100)
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
if MODE in ('turn', 'both'):
    from turn import turnaround
    key.value = 0.0
    turnaround(body, OUTDIR, size=SIZE, spp=SPP, ground_px=int(SIZE * 0.9))
if MODE in ('battle', 'both'):
    key.value = 1.0
    cam, info = frame_camera([body], yaw=35, elev=12, size=1024 if os.environ.get('BATTLE1024') else SIZE,
                             ground_px=900 if os.environ.get('BATTLE1024') else int(SIZE * 900 / 1024))
    render(os.path.join(OUTDIR, 'battle.png'), 'battle')
    key.value = 0.0
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'ashkit_v2.blend')))
print(f'ASHKIT v2 total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
