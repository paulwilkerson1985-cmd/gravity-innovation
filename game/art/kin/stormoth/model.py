"""Stormoth - Spark line stage 2 (docs/CREATURES.md): a big moth with wide storm wings held in a V; slower wingbeats,
hovers higher (lowest point HOVER above the floor).

Signature: indigo wings with a yellow lightning bolt and cloud spots, a white storm-cloud ruff, feathery antennae.
Palette: gold, indigo, violet, cloud white. Built with the Ashkit recipe; each wing (with its bolt and spots), each
antenna and the abdomen have their own materials so the rig claims them exactly; 'battle' key turns the whole body
toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.34
C = Vector((0.0, 0.0, HOVER + 0.36))          # thorax
H = Vector((0.30, 0.0, C.z + 0.10))           # head
P = dict(eye_y=0.11, eye_z=H.z + 0.03, eye_w=0.085, eye_h=0.105, eye_d=0.04, eye_out=0.014, eye_fwd=0.10, turn=16.0)

GOLD = srgb('#f0b432'); GOLD_D = srgb('#c88a1c'); FACE = srgb('#ffe4a0'); INDIGO = srgb('#3d2fa0'); VIOLET = srgb('#7a4ad0')
BOLT = srgb('#ffe23a'); CLOUD = srgb('#f4f6ff'); EYE = srgb('#1a1430'); WHITE = srgb('#ffffff')
INK = '#1a1030'
INK_W = '#07040f'     # the warm ink vanishes on indigo: the wings get a near-black (review 2 #3)

B = Blob('stormoth', resolution=0.03)
B.add(C, 0.30)                                # the fuzzy gold thorax
body = B.mesh(voxel=0.016)
displace(body, strength=0.018, scale=0.10, tex_type='CLOUDS', depth=2)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.24)
head = HB.mesh(voxel=0.014)
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(head, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


def side(s):
    return 'L' if s > 0 else 'R'


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#5a3410'), ink=INK)
mat_ruff = toon_material('ruff', CLOUD, ink=INK)
mat_abd = toon_material('abdomen', GOLD, ink=INK)
mat_aband = toon_material('aband', VIOLET, ink=INK)
mat_wing = {s: toon_material(f'wing{side(s)}', INDIGO, ink=INK_W) for s in (-1, 1)}
mat_bolt = {s: toon_material(f'bolt{side(s)}', BOLT, glow=0.6, ink='#7a5a00') for s in (-1, 1)}
mat_spot = {s: toon_material(f'spot{side(s)}', CLOUD, ink=INK_W) for s in (-1, 1)}
mat_ant = {s: toon_material(f'ant{side(s)}', GOLD_D, ink=INK) for s in (-1, 1)}
assign(body, mat_body)
parts = [assign(head, mat_body)]
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (H.x - 0.05, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.032), (-0.55, 0.015))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.011), track=f), mat_glint))
mz = H.z - 0.09
pts = [snap((1.0, y, mz + 0.02 * (abs(y) / 0.07) ** 2), (H.x - 0.05, y, mz + 0.02 * (abs(y) / 0.07) ** 2))[0] for y in (-0.07, -0.035, 0.0, 0.035, 0.07)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.006, 0.008, 0.009, 0.008, 0.006], res=8), mat_mouth))

# the white storm-cloud ruff: a ring of cloud puffs around the neck
RB = Blob('ruff', resolution=0.025)
for i in range(11):
    a = i * math.tau / 11
    RB.add((0.14, 0.25 * math.cos(a), C.z + 0.04 + 0.23 * math.sin(a)), 0.10 + 0.02 * (i % 2), stiff=3.0)
parts.append(assign(RB.mesh(voxel=0.014), mat_ruff))

# the abdomen: a gold segment hanging behind, tapering to a rounded point. Built along its own axis (UV rings across
# it) so the two violet bands are face materials on the one surface: flush, inked only where the colours meet
# (review 2 #4: the third band at the tip read as a stacked cup)
A0 = Vector((C.x - 0.40, 0, C.z - 0.14))
AT = Vector((-1.0, 0, -0.325)).normalized()                      # toward the tip
abd = ellipsoid('abdomen', A0, (0.20, 0.19, 0.32), segs=40, rings=56, taper=0.6, taper_axis=2, track=AT)
abd.data.materials.clear(); abd.data.materials.append(mat_abd); abd.data.materials.append(mat_aband)
_fc = np.empty(len(abd.data.polygons) * 3); abd.data.polygons.foreach_get('center', _fc); _fc = _fc.reshape(-1, 3)
_u = (_fc - np.array(A0)) @ np.array(AT)                        # -0.32 (root) .. 0.32 (tip)
_mi = np.zeros(len(_u), dtype=np.int32)
for c_ in (-0.10, 0.06):
    _mi[np.abs(_u - c_) < 0.03] = 1
abd.data.polygons.foreach_set('material_index', _mi); abd.data.update()
parts.append(abd)

# the wings: forewing + hindwing outlines in the wing's own plane (x forward, y out), the bolt and two cloud spots
# joined on, then raised into a V and swept back
FORE = smooth_closed([(0.08, 0.04), (0.22, 0.32), (0.30, 0.66), (0.20, 0.94), (-0.04, 0.90), (-0.18, 0.62), (-0.14, 0.30), (-0.04, 0.06)], subdiv=5)
HIND = smooth_closed([(-0.06, 0.04), (-0.14, 0.26), (-0.34, 0.50), (-0.50, 0.44), (-0.44, 0.20), (-0.22, 0.03)], subdiv=5)
BOLTP = [(0.17, 0.14), (0.01, 0.46), (0.13, 0.48), (-0.04, 0.84), (0.25, 0.40), (0.11, 0.38), (0.25, 0.14)]


def clip_convex(poly, clip, margin=0.0):
    """Sutherland-Hodgman: poly clipped to the convex CCW polygon clip, inset by margin."""
    out = [np.array(p, float) for p in poly]
    C_ = [np.array(p, float) for p in clip]
    for i in range(len(C_)):
        a, b = C_[i], C_[(i + 1) % len(C_)]
        e = b - a; L_ = np.linalg.norm(e)
        ins = lambda p: (e[0] * (p[1] - a[1]) - e[1] * (p[0] - a[0])) / L_ - margin
        src, out = out, []
        for j in range(len(src)):
            p, q = src[j], src[(j + 1) % len(src)]
            dp, dq = ins(p), ins(q)
            if dp >= 0:
                out.append(p)
            if (dp >= 0) != (dq >= 0):
                out.append(p + (q - p) * (dp / (dp - dq)))
        if not out:
            break
    return [tuple(p) for p in out]


# the bolt: 15% smaller, kept inside the forewing outline, and flush with the wing (+0.0015 a side): no side walls,
# the decal ink draws its edge (review 2 #2)
_bc = np.mean(np.array(BOLTP), axis=0)
BOLT2 = clip_convex([tuple(_bc + (np.array(p) - _bc) * 0.85) for p in BOLTP], FORE, margin=0.03)
SPOTS = ((0.16, 0.70, 0.06), (-0.34, 0.38, 0.065), (0.04, 0.87, 0.035))     # clear of the bolt
WT = 0.024


def cw(poly):
    """slab() triangulates a concave outline correctly only when it runs clockwise (a counter-clockwise one folds
    triangles over each other), so every outline goes in clockwise."""
    P_ = np.array(poly, float)
    a_ = np.sum(P_[:, 0] * np.roll(P_[:, 1], -1) - np.roll(P_[:, 0], -1) * P_[:, 1])
    return list(poly) if a_ < 0 else list(poly)[::-1]


def disc(r, n=20):
    return [(r * math.cos(i * math.tau / n), r * math.sin(i * math.tau / n)) for i in range(n)]


def wing_frame(s, sweep, dihedral, chord_hint):
    """Rotation taking the wing's own plane (x = chord toward the forewing's leading edge, y = span, z = normal) to
    the world: the span raised by dihedral and swept back by sweep, the chord turned toward chord_hint (x, z). Left
    and right are exact mirrors."""
    sw, dh = math.radians(sweep), math.radians(dihedral)
    sp = Vector((-math.sin(sw) * math.cos(dh), math.cos(sw) * math.cos(dh), math.sin(dh)))
    h = Vector((chord_hint[0], 0, chord_hint[1]))
    ch = (h - sp * h.dot(sp)).normalized()
    F = Matrix((ch, sp, ch.cross(sp))).transposed()
    if s < 0:
        Mi = Matrix.Diagonal((1, -1, 1)); F = Mi @ F @ Mi
    return F


# the wings: forewing + hindwing outlines in the wing's own plane, held as a display behind the thorax: the plane
# faces the front (leaning back 14 deg) and the V is in that plane, so the battle and back cameras see the shapes,
# not their edges (review 2 #1)
d_bat = Vector((d_cam.x * math.cos(math.radians(P['turn'])) - d_cam.y * math.sin(math.radians(P['turn'])),
                d_cam.x * math.sin(math.radians(P['turn'])) + d_cam.y * math.cos(math.radians(P['turn'])), d_cam.z))
WROOT = {s: Vector((C.x - 0.10, 0.14 * s, C.z + 0.10)) for s in (-1, 1)}
for s in (-1, 1):
    m = 1 if s > 0 else -1
    fore = slab(f'fore{s}', cw([(x, y * m) for x, y in FORE]), WT, plane='XY', bevel=0.004)
    hind = slab(f'hind{s}', cw([(x, y * m) for x, y in HIND]), WT - 0.002, plane='XY', bevel=0.004)
    bolt = slab(f'bolt{s}', cw([(x, y * m) for x, y in BOLT2]), WT + 0.003, plane='XY')
    spots = [slab(f'spot{s}{j}', cw([(x + a, (y + b) * m) for a, b in disc(r)]), WT + 0.003, plane='XY')
             for j, (x, y, r) in enumerate(SPOTS)]
    assign(fore, mat_wing[s]); assign(hind, mat_wing[s]); assign(bolt, mat_bolt[s])
    for o in spots:
        assign(o, mat_spot[s])
    wing = union(fore, [hind, bolt] + spots)
    F = wing_frame(s, sweep=8, dihedral=36, chord_hint=(-0.25, 1.0))   # the outline is already mirrored (y * m)
    wing.location = WROOT[s]
    wing.rotation_euler = F.to_euler('XYZ')
    apply_xform(wing)
    for dd, lab in ((d_cam, 'yaw35'), (d_bat, 'battle')):
        v = facing(wing, dd, label=f'wing{side(s)} {lab}')
        assert v >= 0.5, f'wing {side(s)} edge-on to the {lab} camera ({v:.2f})'
    parts.append(wing)

# feathery antennae: a stalk curving up and out, ending in a flat feather
for s in (-1, 1):
    a0, _ = snap((H.x + 0.06, 0.08 * s, 3.0), (H.x + 0.06, 0.08 * s, H.z))
    stalk = [tuple(a0 + Vector((0, 0, -0.03))), tuple(a0 + Vector((0.04, 0.05 * s, 0.10))), tuple(a0 + Vector((0.04, 0.11 * s, 0.20)))]
    parts.append(assign(tube(f'stalk{s}', stalk, [0.016, 0.014, 0.012], res=8), mat_ant[s]))
    # the feather: a flat comb, six barbs a side, its face toward the front like the wings (review 2 #5)
    comb = []
    for k in range(13):
        t = 0.06 + 0.9 * k / 12
        w = 0.085 * math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7 * (1.0 if k % 2 == 0 else 0.55)
        comb.append((w, 0.32 * t + (0.012 if k % 2 == 0 else 0.0)))
    comb = [(0.012, 0.0)] + comb + [(0.0, 0.33)] + [(-a, b) for a, b in reversed(comb)] + [(-0.012, 0.0)]
    parts.append(assign(slab(f'feather{s}', cw(comb), 0.012, plane='YZ', loc=tuple(a0 + Vector((0.04, 0.11 * s, 0.18))),
                             rot=(-22 * s, -12, 0)), mat_ant[s]))

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, GOLD, [], mask=bm)


def sd_face(co, nm):          # the pale face: an ellipse on the front of the head, a designed edge
    e = (np.sqrt((co[:, 1] / 0.18) ** 2 + ((co[:, 2] - (H.z - 0.05)) / 0.15) ** 2) - 1.0) * 0.15
    return np.maximum(e, (H.x + 0.06) - co[:, 0])


def sd_under(co, nm):         # the darker underside of the thorax
    return np.maximum(co[:, 2] - (C.z - 0.12), co[:, 0] - (H.x - 0.10))


paint_soft(body, [(sd_under, GOLD_D), (sd_face, FACE)], mask=bm, edge=0.012)


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'stormoth_final.blend')))
co, _ = mesh_arrays(body)
print(f'STORMOTH total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
