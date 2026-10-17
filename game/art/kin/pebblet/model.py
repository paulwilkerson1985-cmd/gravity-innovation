"""Pebblet - Terra line stage 1 (docs/CREATURES.md): a faceted pebble with a face and a little nose (it sneezes).

Signature: cyan crystal sprouts on its back. Palette: sandstone brown, light face, cyan crystals. Built with the
Ashkit recipe, except the body is a faceted low-subdivision rock (flat facets read as stone; Cragmaul's crystals).
'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.19, eye_z=0.62, eye_w=0.11, eye_h=0.13, eye_d=0.045, eye_out=0.016, eye_fwd=0.14, turn=16.0)   # eyes toward the front: the far-eye glint stays off the silhouette

SAND = srgb('#c9935e'); SAND_D = srgb('#a8744a'); FACE = srgb('#f0d6ae'); CYAN = srgb('#5ce9ff'); EYE = srgb('#2a1a14')
WHITE = srgb('#ffffff'); NOSE = srgb('#8a5a3a')
INK = '#2a1a12'

# ------------------------------------------------------------------ the pebble: a squashed, faceted rock
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=(0, 0, 0))
body = bpy.context.object; body.name = 'pebblet'
body.scale = (0.62, 0.58, 0.46); body.location = (0, 0, 0.44)
apply_xform(body)
displace(body, strength=0.07, scale=0.55, tex_type='VORONOI')
# chip it: merge near-coplanar faces into a few big facets, then cut them finely (flat) so colour zones have vertices
m = body.modifiers.new('chip', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(9)
activate(body); bpy.ops.object.modifier_apply(modifier='chip')
m = body.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')
FACETS = body.data.copy()                 # the big flat facets: colour zones are chosen per facet (see paint_facets)
m = body.modifiers.new('cut', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 3
bpy.ops.object.modifier_apply(modifier='cut')
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)                     # a flat underside: it sits on the floor
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
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
mat_nose = toon_material('nose', NOSE, ink=INK)
mat_cry = toon_material('crystal', CYAN, glow=0.45, ink='#0e5a70')
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (0, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f), mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.038), (-0.55, 0.018))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        parts.append(assign(ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.013), track=f), mat_glint))
# the little nose (a round nub between and below the eyes) and a small smile
np_, nn = snap((1.0, 0, 0.52), (0, 0, 0.52))
parts.append(assign(ellipsoid('nose', np_ + nn * 0.02, (0.055, 0.065, 0.05), track=nn), mat_nose))
pts = [snap((1.0, y, 0.42 + 0.02 * (abs(y) / 0.10) ** 2), (0, y, 0.42 + 0.02 * (abs(y) / 0.10) ** 2))[0] for y in (-0.10, -0.05, 0.0, 0.05, 0.10)]
parts.append(assign(tube('mouth', [tuple(p) for p in pts], [0.007, 0.010, 0.011, 0.010, 0.007], res=8), mat_nose))
# cyan crystal sprouts on the back, leaning back and out
for i, (x, y, h, r, rx, ry) in enumerate([(-0.18, 0.0, 0.42, 0.085, 0, -28), (-0.05, 0.16, 0.30, 0.065, -24, -12), (-0.30, -0.14, 0.32, 0.07, 22, -38),
                                           (-0.36, 0.16, 0.22, 0.055, -18, -48), (0.02, -0.14, 0.22, 0.05, 20, -8)]):
    top, _ = snap((x, y, 3.0), (x, y, 0.4))
    parts.append(assign(crystal(f'cry{i}', (top.x, top.y, top.z - 0.06), r, h, rot=(rx, ry, 0)), mat_cry))

body = union(body, parts)
set_smooth(body, angle=12)              # keep the rock's facets

def paint_facets(o, facets, base_rgb, pick, attr='Col', slot='body'):
    """Flat per-facet colour for a faceted kin: a FACE_CORNER attribute where every corner of a polygon takes the
    colour of the stone facet it lies on (the facet mesh before the fine cut). pick(centroid, normal, hash) -> rgb or
    None per facet. No blending: a vertex blend over crisp facets reads as a smeared stain."""
    from mathutils.bvhtree import BVHTree as _B
    fb = _B.FromPolygons([v.co[:] for v in facets.vertices], [p.vertices[:] for p in facets.polygons])
    fcol = []
    for p in facets.polygons:
        c = p.center
        h = (math.sin(c.x * 127.1 + c.y * 311.7 + c.z * 74.7) * 43758.5453) % 1.0
        fcol.append(pick(c, p.normal, h) or base_rgb)
    me = o.data
    sidx = [i for i, m in enumerate(me.materials) if m and m.name == slot]
    n = len(me.polygons)
    cen = np.empty(n * 3); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
    pm = np.empty(n, dtype=np.int32); me.polygons.foreach_get('material_index', pm)
    ls = np.empty(n, dtype=np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(n, dtype=np.int32); me.polygons.foreach_get('loop_total', lt)
    col = np.tile(np.array(base_rgb + (1.0,)), (len(me.loops), 1))
    for i in np.where(np.isin(pm, sidx))[0]:
        loc, _, fi, _ = fb.find_nearest(Vector(cen[i]))
        if fi is not None:
            col[ls[i]:ls[i] + lt[i], :3] = fcol[fi]
    a = me.color_attributes.new(attr, 'FLOAT_COLOR', 'CORNER')
    a.data.foreach_set('color', col.ravel())
    me.update()


def pick(c, nrm, h):
    if c.x > 0.24 and (c.y / 0.38) ** 2 + ((c.z - 0.46) / 0.30) ** 2 < 1:
        return FACE                                                   # the light face (oval centre lowered: no beard)
    if c.x < -0.10 and (c.z < 0.10 or (nrm.z < 0.2 and c.z > 0.10)):
        return SAND_D                                                 # the shaded back and base
    if h < 0.07 and not (c.x > 0.20 and abs(c.y) < 0.40):
        return SAND_D                                                 # stone flecks: whole facets, off the face
    return None


paint_facets(body, FACETS, SAND, pick)
print('  facets', len(FACETS.polygons))


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
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=100)
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'pebblet_final.blend')))
print(f'PEBBLET total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
