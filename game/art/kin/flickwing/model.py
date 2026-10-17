"""Flickwing - Spark line stage 1 (docs/CREATURES.md): a static-charged firefly, one round fuzzy body whose fur stands on
end, lifted orange wing cases, fast-buzzing pale-cyan wings. It hovers (lowest point HOVER above the floor).

Signature: a glowing lantern tail, zig-zag lightning-bolt antennae with cyan spark tips, a static-fluffed crest. Palette:
yellow, lantern pale yellow, orange cases, cyan sparks. Built with the Ashkit recipe; the wings, antennae and sparks have
per-side materials so the rig claims each exactly; 'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR,
MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.22
P = dict(eye_y=0.16, eye_z=HOVER + 0.50, eye_w=0.11, eye_h=0.14, eye_d=0.045, eye_out=0.016, eye_fwd=0.10, turn=16.0)

YELLOW = srgb('#ffd83a'); YELLOW_D = srgb('#e8a820'); FACE = srgb('#fff2b0'); LANTERN = srgb('#fff9c0'); ORANGE = srgb('#ff8a2a')
WING = srgb('#bff4ff'); WING_BLUR = srgb('#e8fcff'); SPARK = srgb('#4fe8ff'); EYE = srgb('#2a1a10'); WHITE = srgb('#ffffff')
INK = '#3a2208'

C = Vector((0.0, 0.0, HOVER + 0.42))
B = Blob('flickwing', resolution=0.03)
B.add(C, 0.42)                                                     # the round fuzzy body
# fur standing on end: small stiff tufts all over the back and sides (not the face)
for i in range(22):
    th = math.acos(1 - 2 * (i + 0.5) / 22); ph = i * 2.39996
    d = Vector((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))
    if d.x > 0.35 or d.z < -0.5:
        continue
    if d.z > 0.45 and abs(d.y) > 0.25:      # under the wing cases: a tuft there pokes through the case (review 2 #1)
        continue
    B.add(C + d * 0.40, 0.09, stiff=3.0)
body = B.mesh(voxel=0.016)
# fuzz on the back and sides only: noise on the face bends the normals and the cel ramp speckles it (review 2 #2)
def _keep(co):
    t = np.clip((0.10 - co[:, 0]) / 0.16, 0, 1)
    return t * t * (3 - 2 * t)


displace(body, strength=0.010, scale=0.10, tex_type='CLOUDS', depth=2, keep=_keep)
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#6a3a10'), ink=INK)
mat_lantern = toon_material('lantern', LANTERN, glow=0.9, ink='#8a6a10')
mat_lanrim = toon_material('lanrim', srgb('#ffffe8'), glow=1.0, ink='#8a6a10')
mat_band = toon_material('band', ORANGE, ink=INK)
mat_case = toon_material('case', ORANGE, ink=INK)
mat_tuft = toon_material('tuft', YELLOW, ink=INK)
mat_ant = {s: toon_material(f'ant{"L" if s > 0 else "R"}', srgb('#5a3a14'), ink=INK) for s in (-1, 1)}
mat_spark = {s: toon_material(f'spark{"L" if s > 0 else "R"}', SPARK, glow=0.9, ink='#0e6a80') for s in (-1, 1)}
mat_wing = {s: toon_material(f'wing{"L" if s > 0 else "R"}', WING, glow=0.25, ink='#3a8aa0') for s in (-1, 1)}
# the buzz blur: a paler ghost of each wing at the bottom of its stroke, its ink the fill colour (no drawn edge)
mat_wblur = {s: toon_material(f'wblur{"L" if s > 0 else "R"}', WING_BLUR, glow=0.5, ink='#c4eef6') for s in (-1, 1)}
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.040), (-0.55, 0.019))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.013), track=f), mat_glint))
mz = C.z - 0.06
pts = [snap((1.0, y, mz + 0.025 * (abs(y) / 0.10) ** 2), (C.x, y, mz + 0.025 * (abs(y) / 0.10) ** 2))[0] for y in (-0.10, -0.05, 0.0, 0.05, 0.10)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.007, 0.010, 0.011, 0.010, 0.007], res=8), mat_mouth))
# the static-fluffed crest: spiky tufts fanning up from the crown
top, _ = snap((C.x + 0.06, 0, 3.0), (C.x + 0.06, 0, C.z))
for i, (y, rx, ry, l) in enumerate(((0.0, 0, -6, 0.20), (0.07, -26, -2, 0.12), (-0.07, 26, -2, 0.12), (0.04, -12, -30, 0.13), (-0.04, 12, -30, 0.13))):
    parts.append(assign(ellipsoid(f'crest{i}', top + Vector((-0.02, y, l * 0.55)), (0.05, 0.04, l), rot=(rx, ry, 0), taper=0.85, taper_axis=2), mat_tuft))
# the lantern tail: a glowing segment hanging behind. Built along its own axis (UV rings across the axis) so the two
# orange bands, the glowing rim and the orange cap are face materials on the one surface: flush, no side walls, inked
# only where the materials meet (review 2 #4)
L0 = Vector((C.x - 0.46, 0, C.z - 0.10))
LA = Vector((0.94, 0, 0.34)).normalized()                        # lantern axis, toward the body
lan = ellipsoid('lantern', L0, (0.21, 0.20, 0.25), segs=40, rings=56, taper=0.25, taper_axis=2, track=LA)
lan.data.materials.clear()
for m_ in (mat_lantern, mat_band, mat_lanrim):
    lan.data.materials.append(m_)
_fc = np.empty(len(lan.data.polygons) * 3); lan.data.polygons.foreach_get('center', _fc); _fc = _fc.reshape(-1, 3)
_u = (_fc - np.array(L0)) @ np.array(LA)                         # position along the axis, -0.25 (tip) .. 0.25 (root)
_mi = np.zeros(len(_u), dtype=np.int32)
for c_ in (0.13, 0.0):
    _mi[np.abs(_u - c_) < 0.022] = 1                              # two bands
_mi[(_u < -0.185) & (_u >= -0.205)] = 2                          # a glowing rim ring around the cap
_mi[_u < -0.205] = 1                                             # the orange cap
lan.data.polygons.foreach_set('material_index', _mi); lan.data.update()
parts.append(lan)
# lifted orange wing cases on the back, opened up and out
for s in (-1, 1):
    parts.append(assign(ellipsoid(f'case{s}', (C.x - 0.10, 0.17 * s, C.z + 0.39), (0.26, 0.15, 0.07), rot=(-34 * s, -26, 14 * s)), mat_case))


def place_wing(name, root, span, normal_hint, length, width, thick, taper=0.0, inset=0.06):
    """An ellipsoid wing from a root along a span direction, its flat face turned toward normal_hint (orthogonalised
    against the span). taper narrows the root end. Returns the object (unassigned)."""
    sp = Vector(span).normalized()
    n = Vector(normal_hint); n = (n - sp * n.dot(sp)).normalized()
    ch = (-sp).cross(n)
    M = Matrix((ch, -sp, n)).transposed()                         # local x = chord, -y = span (taper end), z = normal
    eul = M.to_euler('XYZ')
    ctr = Vector(root) + sp * (length - inset)
    return ellipsoid(name, ctr, (width, length, thick), rot=tuple(math.degrees(a) for a in eul), taper=taper, taper_axis=1)


# the buzzing wings: thin, pale cyan, fanned up and out behind the body with their faces toward the front, so the
# battle camera (and the back view) sees their shape, not their edge (review 2 #3); a paler blur wing lower in the
# stroke makes the buzz read from every angle
D_BATTLE = Vector((d_cam.x * math.cos(math.radians(P['turn'])) - d_cam.y * math.sin(math.radians(P['turn'])),
                   d_cam.x * math.sin(math.radians(P['turn'])) + d_cam.y * math.cos(math.radians(P['turn'])), d_cam.z))
WROOT = {s: Vector((C.x - 0.10, 0.26 * s, C.z + 0.24)) for s in (-1, 1)}
WSPAN = {s: Vector((-0.10, 0.82 * s, 0.56)).normalized() for s in (-1, 1)}
for s in (-1, 1):
    w = assign(place_wing(f'wing{s}', WROOT[s], WSPAN[s], (1, 0, 0.15), 0.34, 0.17, 0.012, taper=0.3), mat_wing[s])
    wb = assign(place_wing(f'wblur{s}', WROOT[s] + Vector((-0.04, 0, -0.02)), (-0.18, 0.94 * s, 0.18), (1, 0, 0.30),
                           0.32, 0.15, 0.010, taper=0.3), mat_wblur[s])
    for o_, lab in ((w, 'wing'), (wb, 'blur')):
        facing(o_, d_cam, label=f'{lab}{s} yaw35'); facing(o_, D_BATTLE, label=f'{lab}{s} battle')
    parts += [w, wb]
# zig-zag lightning-bolt antennae with cyan spark tips
for s in (-1, 1):
    a0, _ = snap((C.x + 0.24, 0.16 * s, 3.0), (C.x + 0.24, 0.16 * s, C.z))
    zz = [(0, 0, -0.03), (0.04, 0.04 * s, 0.10), (-0.02, 0.08 * s, 0.17), (0.06, 0.13 * s, 0.28), (0.02, 0.17 * s, 0.34)]   # leaning out, clear of the crest
    pts = [tuple(a0 + Vector(c)) for c in zz]
    parts.append(assign(tube(f'ant{s}', pts, [0.022, 0.02, 0.018, 0.016, 0.014], res=1), mat_ant[s]))
    parts.append(assign(ellipsoid(f'spark{s}', Vector(pts[-1]) + Vector((0.0, 0.0, 0.04)), (0.05, 0.05, 0.05)), mat_spark[s]))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, YELLOW, [], mask=bm)


def sd_face(co, nm):          # the cream face: an ellipse on the front of the ball, as a designed edge (review 2 #2)
    e = (np.sqrt((co[:, 1] / 0.36) ** 2 + ((co[:, 2] - (C.z - 0.03)) / 0.28) ** 2) - 1.0) * 0.28
    return np.maximum(e, 0.16 - co[:, 0])


def sd_back(co, nm):          # the darker crown of the back
    return np.maximum.reduce([co[:, 0] - 0.05, (C.z + 0.2) - co[:, 2], (0.3 - nm[:, 2]) * 0.1])


paint_soft(body, [(sd_back, YELLOW_D), (sd_face, FACE)], mask=bm, edge=0.014)


def add_battle_key(o, turn_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    co, _ = mesh_arrays(o)
    a = math.radians(-turn_deg)
    out = co.copy()
    out[:, 0] = co[:, 0] * math.cos(a) - co[:, 1] * math.sin(a)
    out[:, 1] = co[:, 0] * math.sin(a) + co[:, 1] * math.cos(a)
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['turn'])
OUTDIR = os.environ.get('OUTDIR', os.path.join(HERE, 'rounds', 'r1'))
os.makedirs(OUTDIR, exist_ok=True)
SPP = int(os.environ.get('SPP', 12)); SIZE = int(os.environ.get('SIZE', 768)); MODE = os.environ.get('MODE', 'both')
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100, decal_px=1.5 * SIZE / 512)
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
if MODE in ('turn', 'both'):
    from turn import turnaround
    key.value = 0.0
    turnaround(body, OUTDIR, size=SIZE, spp=SPP, ground_px=int(SIZE * 0.9))
if MODE in ('battle', 'both'):
    key.value = 1.0
    cam, info = frame_camera([body], yaw=35, elev=12, size=SIZE, ground_px=int(SIZE * 900 / 1024))
    render(os.path.join(OUTDIR, 'battle.png'), 'battle')
    key.value = 0.0
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'flickwing_final.blend')))
co, _ = mesh_arrays(body)
print(f'FLICKWING total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
