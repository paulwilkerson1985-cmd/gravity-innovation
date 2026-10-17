"""Surgeray - rare Tide/Spark single (docs/CREATURES.md): an electric ray resting on the ground; its wing-fin tips touch
the floor, its nose is slightly raised.

Signature: yellow lightning bolts on the wings and back, a bolt-tipped whip tail, electric-node antennae. Palette: royal
blue, pale belly, yellow. Built with the Ashkit recipe: the body is a lens-shaped slab (the ray outline, bulged in the
middle) bent so the wing tips droop to the floor and the nose lifts; bolts are glowing zig-zag tubes laid on the skin;
the antennae have per-side materials so the rig claims them exactly; 'battle' key turns the whole body toward the
camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.12, eye_w=0.10, eye_h=0.12, eye_d=0.045, eye_out=0.015, eye_fwd=0.20, turn=16.0)

ROYAL = srgb('#2a4ad8'); ROYAL_D = srgb('#1c34a8'); BELLY = srgb('#dfe8ff'); YELLOW = srgb('#ffe03a'); EYE = srgb('#141a3a')
WHITE = srgb('#ffffff')
INK = '#0c1440'

# ------------------------------------------------------------------ the ray: outline (x forward, y out), bulged into a lens
SPAN = 0.62                                   # wing half-span (shortened from 0.74: the side view read as a slug)
OUT = smooth_closed([(0.36, 0.0), (0.29, 0.21), (0.10, 0.44), (-0.06, SPAN), (-0.22, 0.51), (-0.40, 0.24), (-0.50, 0.0),
                     (-0.40, -0.24), (-0.22, -0.51), (-0.06, -SPAN), (0.10, -0.44), (0.29, -0.21)], subdiv=6)


def lens(name, pts2d, thickness, bulge):
    """common.slab for the XY plane, but with a beauty fill and plain (not even) solidify offset: the even offset on the
    fan's sliver triangles shot a spike out of the nose. Interior verts rise by bulge * sqrt(distance to the outline)."""
    bm_ = bmesh.new()
    f = bm_.faces.new([bm_.verts.new((a, b, 0)) for a, b in pts2d])
    bmesh.ops.triangulate(bm_, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
    bmesh.ops.beautify_fill(bm_, faces=bm_.faces[:], edges=bm_.edges[:])
    bmesh.ops.subdivide_edges(bm_, edges=bm_.edges[:], cuts=2, use_grid_fill=True)
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
    boundary = [v.co.copy() for v in bm_.verts if v.is_boundary]
    for v in bm_.verts:
        if not v.is_boundary:
            d = min((v.co - b).length for b in boundary)
            v.co.z += math.sqrt(d) * bulge
    me_ = bpy.data.meshes.new(name); bm_.to_mesh(me_); bm_.free()
    o = link(bpy.data.objects.new(name, me_))
    so = o.modifiers.new('so', 'SOLIDIFY'); so.thickness = thickness; so.offset = 0.0; so.use_even_offset = False
    activate(o); bpy.ops.object.modifier_apply(modifier='so')
    return o


body = lens('surgeray', OUT, 0.10, 0.45)


def bend(o):
    """Wing tips droop to the floor and the nose lifts. Applied BEFORE the subsurf, so the smoothing spreads the bend
    (bent after it, the lens creased into shading bands and a hard fold)."""
    co, _ = mesh_arrays(o)
    y = np.abs(co[:, 1]); x = co[:, 0]
    lift = 0.13 - 0.11 * np.clip(y / SPAN, 0, 1) ** 2.0 + 0.10 * np.clip(x / 0.36, 0, 1) ** 1.5
    co[:, 2] = co[:, 2] * (1.0 - 0.45 * np.clip(y / SPAN, 0, 1)) + lift     # tips keep enough thickness for a clean rim
    o.data.vertices.foreach_set('co', co.ravel()); o.data.update()


bend(body)
# even topology after the bend (the triangulated slab fill creased into ink rings), then a light smooth
activate(body); body.data.remesh_voxel_size = 0.01; body.data.remesh_voxel_adaptivity = 0.0; bpy.ops.object.voxel_remesh()
m = body.modifiers.new('sm0', 'SMOOTH'); m.iterations = 14; m.factor = 0.5    # a rounded rim: a knife rim inks as scratchy hairs
activate(body); bpy.ops.object.modifier_apply(modifier='sm0')
co, _ = mesh_arrays(body)
co[:, 2] -= co[:, 2].min()
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
# the head mound: a wide, low rise on the front of the back that carries the face, smoothed into the lens
ztop = co[np.abs(co[:, 1]) < 0.1][:, 2].max()
MOUND = Vector((0.14, 0, ztop - 0.05))
mound = ellipsoid('mound', MOUND, (0.36, 0.30, 0.14))
body = join(body, [mound])             # one volume: a voxel remesh unions them (a boolean on the dense lens trips the guard)
activate(body); body.data.remesh_voxel_size = 0.01; body.data.remesh_voxel_adaptivity = 0.0; bpy.ops.object.voxel_remesh()
m = body.modifiers.new('sm', 'SMOOTH'); m.iterations = 2; m.factor = 0.5
activate(body); bpy.ops.object.modifier_apply(modifier='sm')
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


def mid(x, y):
    """The middle of the body's thickness at (x, y): a ray start that is inside the lens."""
    top, _ = snap((x, y, -1.0), (x, y, 3.0)); bot, _ = snap((x, y, 3.0), (x, y, -1.0))
    return (top.z + bot.z) / 2


def side(s):
    return 'L' if s > 0 else 'R'


mat_body = toon_material('body', attr='Col', ink=INK)
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_mouth = toon_material('mouth', srgb('#0e1a5a'), ink=INK)
mat_bolt = toon_material('bolt', YELLOW, glow=0.6, ink='#7a5a00')
mat_tail = toon_material('tail', ROYAL_D, ink=INK)
mat_tbolt = toon_material('tbolt', YELLOW, glow=0.6, ink='#7a5a00')      # own slot: the rig's tail tip claims it whole
mat_ant = {s: toon_material(f'ant{side(s)}', ROYAL_D, ink=INK) for s in (-1, 1)}
mat_node = {s: toon_material(f'node{side(s)}', YELLOW, glow=0.8, ink='#7a5a00') for s in (-1, 1)}
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# eyes on the raised front edge, looking forward and up
for s in (-1, 1):
    zc = mid(0.14, P['eye_y'] * s)
    p, n = snap((1.0, P['eye_y'] * s, zc + 0.30), (0.14, P['eye_y'] * s, zc))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    EYE_Z = ec.z
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.030), (-0.55, 0.014))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.011), track=f), mat_glint))
# a small smile on the front rim
zm = mid(0.30, 0.0) - 0.01
pts = [snap((1.0, yy, zm + 0.015 * (abs(yy) / 0.08) ** 2), (0.20, yy, zm + 0.015 * (abs(yy) / 0.08) ** 2)) for yy in (-0.08, -0.04, 0.0, 0.04, 0.08)]
parts.append(assign(tube('mouth', [tuple(p + n * 0.01) for p, n in pts], [0.006, 0.009, 0.010, 0.009, 0.006], res=6), mat_mouth))   # proud of the skin: one clean arc
MOUTH_Z = pts[2][0].z


def bolt_outline(path, w0, w1):
    """A lightning-bolt polygon around a zig-zag path: mitred offsets, the width tapering from w0 to w1 (a point)."""
    P = [np.array(p, float) for p in path]; n = len(P); L, R = [], []
    for i in range(n):
        d0 = P[i] - P[i - 1] if i > 0 else P[1] - P[0]
        d1 = P[i + 1] - P[i] if i < n - 1 else P[-1] - P[-2]
        n0 = np.array([-d0[1], d0[0]]) / np.linalg.norm(d0); n1 = np.array([-d1[1], d1[0]]) / np.linalg.norm(d1)
        m = n0 + n1; m /= np.linalg.norm(m)
        k = min(2.0, 1.0 / max(0.3, m @ n1))
        w = (w0 + (w1 - w0) * i / (n - 1)) / 2 * k
        L.append(tuple(P[i] + m * w)); R.append(tuple(P[i] - m * w))
    return L[:-1] + [tuple(P[-1] + (P[-1] - P[-2]) / np.linalg.norm(P[-1] - P[-2]) * 0.03)] + R[:-1][::-1]


def skin_bolt(path, name, w0, w1, mat):
    """A flat slab bolt conformed to the skin: every vertex dropped onto the body from above, keeping its thickness,
    so the bolt reads as one graphic shape (thin tubes fragmented into dashes)."""
    o = slab(name, bolt_outline(path, w0, w1), 0.03, plane='XY')
    co, _ = mesh_arrays(o)
    for i, (x, y, z) in enumerate(co):
        hit, _ = snap((x, y, -1.0), (x, y, 3.0))
        co[i, 2] = hit.z + z - 0.004
    o.data.vertices.foreach_set('co', co.ravel()); o.data.update()
    set_smooth(o, angle=60)
    return assign(o, mat)


# a bolt down the back and one across each wing
parts.append(skin_bolt([(0.10, 0.03), (0.00, -0.05), (-0.06, 0.05), (-0.18, -0.04), (-0.24, 0.04), (-0.36, -0.02)], 'bolt_back', 0.06, 0.016, mat_bolt))
for s in (-1, 1):
    parts.append(skin_bolt([(0.06, 0.20 * s), (-0.03, 0.29 * s), (0.06, 0.36 * s), (-0.05, 0.46 * s), (-0.01, 0.51 * s)], f'bolt{s}', 0.055, 0.015, mat_bolt))
# electric-node antennae on the head
for s in (-1, 1):
    a0, _ = snap((0.22, 0.10 * s, -1.0), (0.22, 0.10 * s, 3.0))
    stalk = [tuple(a0 + Vector((0, 0, -0.02))), tuple(a0 + Vector((0.02, 0.03 * s, 0.10))), tuple(a0 + Vector((0.0, 0.06 * s, 0.18)))]
    parts.append(assign(tube(f'ant{s}', stalk, [0.018, 0.015, 0.012], res=8), mat_ant[s]))
    parts.append(assign(ellipsoid(f'node{s}', Vector(stalk[-1]) + Vector((0, 0, 0.035)), (0.045, 0.045, 0.045)), mat_node[s]))
# the whip tail lies flat and curves to one side (standing up behind the head it read as a spear), ending in a flat bolt
tb, _ = snap((-0.46, 0, -1.0), (-0.46, 0, 3.0))
z = 0.05
tail = [(tb.x + 0.06, 0.0, tb.z * 0.5), (-0.68, -0.10, z), (-0.92, -0.28, z + 0.02), (-1.08, -0.40, z + 0.05)]
tail_o = assign(tube('tail', tail, [0.045, 0.028, 0.02, 0.014], res=8), mat_tail)     # joined, not unioned (see below)
tip = Vector(tail[-1])
BOLT = [(0.0, 0.0), (0.05, 0.10), (0.0, 0.10), (0.06, 0.22), (-0.06, 0.08), (-0.01, 0.08), (-0.05, 0.0)]
# the bolt continues the tail outward, lying low but tipped 40 deg toward the battle camera so it reads, not a sliver
tbolt = slab('tailbolt', [(bz * 1.2, -bx * 1.2) for bx, bz in BOLT], 0.03, loc=tuple(tip + Vector((-0.01, -0.01, 0.02))), rot=(-40, 0, -143), plane='XY')
set_smooth(tbolt, angle=60)
assign(tbolt, mat_tbolt)
body = union(body, parts)
body = join(body, [tail_o, tbolt])     # the bent tube refuses the boolean, and a joined tube then gets eaten by the next one
set_smooth(body, angle=50)

bm = vertex_slot_mask(body, {'body'})
paint_zones(body, ROYAL, [], mask=bm)
FACE_Z = MOUTH_Z + 0.04          # low on the mound front: the eyes sit on its top edge (a full mask read as a panda)


def sd_face(co, nm):      # the pale face: an ellipse on the mound front by position, not by normal (no streaks)
    k = np.sqrt((co[:, 1] / 0.22) ** 2 + ((co[:, 2] - FACE_Z) / 0.12) ** 2)
    return np.maximum((k - 1.0) * 0.16, MOUND.x + 0.06 - co[:, 0])


paint_soft(body, [(lambda co, nm: np.maximum((nm[:, 2] + 0.6) * 0.1, co[:, 2] - 0.14), BELLY),     # underside (not the mound overhang)
                  (lambda co, nm: np.maximum(0.36 - np.abs(co[:, 1]), (0.2 - nm[:, 2]) * 0.1), ROYAL_D),       # wing tips
                  (sd_face, BELLY)], mask=bm, edge=0.012)


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
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100, decal_px=1.5 * SIZE / 1024)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'surgeray_final.blend')))
co, _ = mesh_arrays(body)
print(f'SURGERAY total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}, zmin {co[:, 2].min():.3f} zmax {co[:, 2].max():.3f}')
