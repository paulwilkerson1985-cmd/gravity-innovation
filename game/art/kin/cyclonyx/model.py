"""Cyclonyx - Gale line stage 2 (docs/CREATURES.md): a sleek raptor, wings raised in a V, hooked beak, fierce brow. It
hovers (lowest point HOVER above the floor).

Signature: two long tail streamers with orange tips; a swept crest; orange primaries. Palette: sky blue, light
underwings, white, orange. Built with the Ashkit recipe; the head is its own mesh joined by a boolean (a neck
crease); each wing (top, underwing, primaries) has its own materials so the rig claims it exactly; 'battle' key turns
the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
HOVER = 0.14
H = Vector((0.24, 0.0, HOVER + 0.80))          # head
P = dict(eye_y=0.10, eye_z=H.z + 0.03, eye_w=0.075, eye_h=0.085, eye_d=0.036, eye_out=0.013, eye_fwd=0.12, turn=16.0)

SKY = srgb('#4aa8f0'); SKY_D = srgb('#2f7fd0'); WHITE_B = srgb('#f4f8ff'); UNDER = srgb('#cfeaff'); ORANGE = srgb('#ff8a2a')
BEAK = srgb('#ffc04a'); EYE = srgb('#14203a'); WHITE = srgb('#ffffff')
INK = '#10203a'

B = Blob('cyclonyx', resolution=0.03)
B.add((0.04, 0, HOVER + 0.44), 0.30, size=(1.1, 0.95, 1.0))      # chest
B.add((-0.20, 0, HOVER + 0.38), 0.24, size=(1.2, 0.95, 0.9))     # back and belly
B.add((-0.42, 0, HOVER + 0.36), 0.13, size=(1.3, 1.0, 0.7))      # the tail root
B.add((0.16, 0, HOVER + 0.64), 0.17)                             # the neck
body = B.mesh(voxel=0.016)
HB = Blob('head', resolution=0.03)
HB.add(H, 0.22, size=(1.1, 1.0, 0.95))
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
mat_beak = toon_material('beak', BEAK, ink='#7a4a10')
mat_brow = toon_material('brow', SKY_D, ink=INK)
mat_crest = toon_material('crest', SKY_D, ink=INK)
mat_fan = toon_material('fan', WHITE_B, ink=INK)
mat_talon = toon_material('talon', ORANGE, ink='#7a3a10')
mat_streamer = toon_material('streamer', SKY_D, ink=INK)
mat_stip = toon_material('stip', ORANGE, glow=0.1, ink='#7a3a10')
mat_wing = {s: toon_material(f'wing{side(s)}', SKY, ink=INK) for s in (-1, 1)}
mat_under = {s: toon_material(f'under{side(s)}', UNDER, ink=INK) for s in (-1, 1)}
mat_prim = {s: toon_material(f'prim{side(s)}', ORANGE, ink='#7a3a10') for s in (-1, 1)}
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
    for k, (off, r) in enumerate(((0.45, 0.028), (-0.55, 0.013))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.010), track=f), mat_glint))
    # the fierce brow: a slanted ridge cutting across the top of the eye, low over the beak
    bp, bn = snap((1.0, P['eye_y'] * s * 0.9, P['eye_z'] + 0.075), (H.x - 0.05, P['eye_y'] * s * 0.9, P['eye_z'] + 0.075))
    parts.append(assign(ellipsoid(f'brow{s}', bp - bn * 0.006, (0.035, 0.12, 0.026), track=bn, roll=90 + 24 * s), mat_brow))   # sunk in (review 2 #5)   # inner ends low: fierce, not worried
# the hooked beak: thick at the base, hooking down at the tip
b0, bn0 = snap((1.0, 0, H.z - 0.04), (H.x - 0.05, 0, H.z - 0.04))
hook = [tuple(b0 - bn0 * 0.04), tuple(b0 + Vector((0.08, 0, -0.005))), tuple(b0 + Vector((0.15, 0, -0.03))), tuple(b0 + Vector((0.17, 0, -0.09)))]
parts.append(assign(tube('beak', hook, [0.07, 0.05, 0.03, 0.01], res=8), mat_beak))
# the swept crest: three feathers raking back from the crown
top, _ = snap((H.x - 0.04, 0, 3.0), (H.x - 0.04, 0, H.z))
for i, (y, l, ry) in enumerate(((0.0, 0.24, 62), (0.05, 0.19, 56), (-0.05, 0.19, 56))):
    parts.append(assign(ellipsoid(f'crest{i}', top + Vector((-0.10, y, 0.04)), (l, 0.035, 0.03), rot=(0, -ry + 90 - 70, 180), taper=0.8, taper_axis=0), mat_crest))
# tucked talons: three curled toes a foot (review 2 #4: two beads read as nothing)
for s in (-1, 1):
    f0 = Vector((0.06, 0.10 * s, HOVER + 0.17))
    for k, a in enumerate((-26, 0, 26)):
        dv = Vector((math.cos(math.radians(a)), math.sin(math.radians(a)) * s * 0.8, 0))
        toe = [tuple(f0 - dv * 0.01 + Vector((0, 0, 0.04))), tuple(f0 + dv * 0.04), tuple(f0 + dv * 0.075 + Vector((0, 0, -0.02))),
               tuple(f0 + dv * 0.085 + Vector((0, 0, -0.05)))]
        parts.append(assign(tube(f'toe{s}{k}', toe, [0.024, 0.02, 0.015, 0.006], res=6), mat_talon))
# a white tail fan (one slab, five points, lifted so the battle camera sees it) and the two long streamers with
# orange tips (review 2 #4)
fan = []
for k in range(5):
    a = math.radians(-34 + 17 * k)
    if k:
        b = math.radians(-34 + 17 * k - 8.5)
        fan.append((-0.25 * math.cos(b), 0.25 * math.sin(b)))
    fan.append((-0.31 * math.cos(a), 0.31 * math.sin(a)))
fan = [(0.03, -0.05)] + fan + [(0.03, 0.05)]
# (already clockwise: slab() folds a concave counter-clockwise outline, see cw() below)
parts.append(assign(slab('fan', fan, 0.022, loc=(-0.44, 0, HOVER + 0.38), rot=(0, 45, 0), plane='XY', bevel=0.004), mat_fan))   # cocked up: faces the battle and the back cameras
for s in (-1, 1):
    st = [(-0.46, 0.04 * s, HOVER + 0.36), (-0.74, 0.07 * s, HOVER + 0.30), (-0.98, 0.10 * s, HOVER + 0.34), (-1.12, 0.12 * s, HOVER + 0.46)]
    parts.append(assign(tube(f'streamer{s}', st, [0.032, 0.026, 0.02, 0.016], res=8), mat_streamer))
    parts.append(assign(ellipsoid(f'stip{s}', (-1.14, 0.125 * s, HOVER + 0.55), (0.03, 0.05, 0.10), rot=(0, -20, 0), taper=0.6, taper_axis=2), mat_stip))

# the wings (review 2 #2/#3): one outline with a scalloped trailing edge (five primary points), the primaries one
# orange zone and the underwing one pale zone, both flush with the sky-blue slab (+0.0015 a side, inked by the decal
# lineset), the slab thinning from 0.03 at the root to 0.008 at the tip; raised in a V in a plane that faces the
# front (leaning back), so the battle camera sees the pale underwings and the back camera the sky-blue tops
WING = smooth_closed([(0.10, 0.03), (0.17, 0.28), (0.17, 0.55), (0.12, 0.74),
                      (0.07, 1.00), (0.02, 0.85), (-0.03, 0.97), (-0.06, 0.81), (-0.12, 0.90), (-0.13, 0.75),
                      (-0.20, 0.80), (-0.20, 0.65), (-0.26, 0.66), (-0.24, 0.46), (-0.20, 0.22), (-0.10, 0.03)], subdiv=4)


def cut_g(p):                 # > 0 beyond the hand line: the primaries
    return p[1] - (0.72 + (p[0] - 0.12) * (0.18 / 0.37))


def clip_half(poly, g, keep_pos=True, off=0.0):
    """Sutherland-Hodgman against one half-plane g(p) >= off (keep_pos) or g(p) <= -off."""
    out = []
    v = [(np.array(p, float), (g(p) - off) if keep_pos else (-g(p) - off)) for p in poly]
    for i in range(len(v)):
        (p, dp), (q, dq) = v[i], v[(i + 1) % len(v)]
        if dp >= 0:
            out.append(tuple(p))
        if (dp >= 0) != (dq >= 0):
            out.append(tuple(p + (q - p) * (dp / (dp - dq))))
    return out


def cw(poly):
    """slab() triangulates a concave outline correctly only when it runs clockwise (a counter-clockwise one folds
    triangles over each other: ragged primaries, stray ink), so every outline goes in clockwise."""
    P_ = np.array(poly, float)
    a_ = np.sum(P_[:, 0] * np.roll(P_[:, 1], -1) - np.roll(P_[:, 0], -1) * P_[:, 1])
    return list(poly) if a_ < 0 else list(poly)[::-1]


def scaled(poly, k):
    c = np.mean(np.array(poly), axis=0)
    return [tuple(c + (np.array(p) - c) * k) for p in poly]


def wing_frame(s, sweep, dihedral, chord_hint):
    """Rotation taking the wing's own plane (x = chord toward the leading edge, y = span, z = normal) to the world:
    the span raised by dihedral and swept back by sweep, the chord turned toward chord_hint (x, z); for s < 0 the
    mirror (the outline is built mirrored, y * m)."""
    sw, dh = math.radians(sweep), math.radians(dihedral)
    sp = Vector((-math.sin(sw) * math.cos(dh), math.cos(sw) * math.cos(dh), math.sin(dh)))
    h = Vector((chord_hint[0], 0, chord_hint[1]))
    ch = (h - sp * h.dot(sp)).normalized()
    F = Matrix((ch, sp, ch.cross(sp))).transposed()
    if s < 0:
        Mi = Matrix.Diagonal((1, -1, 1)); F = Mi @ F @ Mi
    return F


INNER = clip_half(WING, cut_g, False, off=-0.012)              # the arm, overlapping the hand by 0.012
PRIM = scaled(clip_half(WING, cut_g, True), 1.012)             # the hand: a hair outside the outline
UNDR = clip_half(scaled(INNER, 1.012), cut_g, False, off=-0.006)   # the pale underside of the arm, wrapping its walls
WT = 0.03
d_bat = Vector((d_cam.x * math.cos(math.radians(P['turn'])) - d_cam.y * math.sin(math.radians(P['turn'])),
                d_cam.x * math.sin(math.radians(P['turn'])) + d_cam.y * math.cos(math.radians(P['turn'])), d_cam.z))
WROOT = {s: Vector((-0.06, 0.18 * s, HOVER + 0.58)) for s in (-1, 1)}
for s in (-1, 1):
    m = 1 if s > 0 else -1
    top_w = slab(f'wtop{s}', cw([(x, y * m) for x, y in INNER]), WT, plane='XY', bevel=0.004)
    # proud amounts differ (hand 0.0022, underside 0.001) so no two faces are coplanar where they overlap
    prim = slab(f'wprim{s}', cw([(x, y * m) for x, y in PRIM]), WT + 0.0044, plane='XY')
    und = slab(f'wund{s}', cw([(x, y * m) for x, y in UNDR]), WT / 2, loc=(0, 0, -WT / 4 - 0.001), plane='XY')
    assign(top_w, mat_wing[s]); assign(prim, mat_prim[s]); assign(und, mat_under[s])
    wing = union(top_w, [prim, und])
    co_ = np.empty(len(wing.data.vertices) * 3); wing.data.vertices.foreach_get('co', co_); co_ = co_.reshape(-1, 3)
    t_ = np.clip(np.abs(co_[:, 1]) / 1.0, 0, 1); t_ = t_ * t_ * (3 - 2 * t_)
    co_[:, 2] *= 1.0 + (0.008 / WT - 1.0) * t_                    # thin toward the tip
    wing.data.vertices.foreach_set('co', co_.ravel()); wing.data.update()
    F = wing_frame(s, sweep=6, dihedral=44, chord_hint=(-0.25, 1.0))
    wing.location = WROOT[s]
    wing.rotation_euler = F.to_euler('XYZ')
    apply_xform(wing)
    for dd, lab in ((d_cam, 'yaw35'), (d_bat, 'battle')):
        v = facing(wing, dd, label=f'wing{side(s)} {lab}')
        assert v >= 0.5 or lab != 'battle', f'wing {side(s)} edge-on to the {lab} camera ({v:.2f})'
    parts.append(wing)

body = union(body, parts)
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, SKY, [], mask=bm)


def sd_bib(co, nm):
    """The white chest and belly as a designed bib (review 2 #1): an ellipse in the side profile (XZ), its width
    narrowing up toward the throat."""
    e = (np.sqrt(((co[:, 0] - 0.16) / 0.40) ** 2 + ((co[:, 2] - (HOVER + 0.28)) / 0.42) ** 2) - 1.0) * 0.40
    w = 0.30 - 0.75 * np.clip(co[:, 2] - (HOVER + 0.40), 0, None)
    return np.maximum(e, np.abs(co[:, 1]) - w)


sd_cheek = sd_ellipse((H.x + 0.12, 0, H.z - 0.13), (0.15, 0.13, 0.12))      # white cheeks under the beak


def sd_back(co, nm):          # the darker back
    return np.maximum.reduce([(0.5 - nm[:, 2]) * 0.1, co[:, 0] - 0.10, (HOVER + 0.50) - co[:, 2]])


paint_soft(body, [(sd_back, SKY_D), (sd_bib, WHITE_B), (sd_cheek, WHITE_B)], mask=bm, edge=0.012)


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'cyclonyx_final.blend')))
co, _ = mesh_arrays(body)
print(f'CYCLONYX total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
