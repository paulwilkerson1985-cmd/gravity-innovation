"""Vulcrag - rare Flame/Terra single (docs/CREATURES.md): a squat volcano-cone golem, upright, wide base, crater top.

Signature: an erupting crater with a lava pool, glowing magma veins, molten fists, glowing eyes and mouth. Palette:
basalt, magma orange, lava yellow. Built with the Ashkit recipe (a stacked-ball cone chipped into rock facets as
Pebblet); 'battle' key turns the whole body toward the camera. Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(eye_y=0.16, eye_z=0.84, turn=16.0)

BASALT = srgb('#5c4e4c'); BASALT_D = srgb('#2e2828'); BASALT_L = srgb('#7a6662'); MAGMA = srgb('#ff6a1a'); LAVA = srgb('#ffd23a')
MAGMA_D = '#b0360a'    # ink of the glowing parts: a dark magma line, not a near-black dashed one
INK = '#140a08'

# ------------------------------------------------------------------ the cone: a lathed volcano profile (flared base,
# concave flanks, a raised rim around a sunken crater), remeshed, then chipped into rock facets as Pebblet
PROFILE = [(0.0, 0.0), (0.80, 0.0), (0.80, 0.07), (0.70, 0.19), (0.58, 0.37), (0.49, 0.58), (0.43, 0.80), (0.39, 1.00),
           (0.38, 1.10), (0.35, 1.17), (0.29, 1.16), (0.25, 1.07), (0.0, 1.04)]
bmo = bmesh.new(); SEG = 40
rings = [[bmo.verts.new((r * math.cos(2 * math.pi * i / SEG), r * math.sin(2 * math.pi * i / SEG), z)) for i in range(SEG)] if r > 0 else
         [bmo.verts.new((0, 0, z))] for r, z in PROFILE]
for ra, rb in zip(rings, rings[1:]):
    for i in range(SEG):
        j = (i + 1) % SEG
        if len(ra) == 1:
            bmo.faces.new((ra[0], rb[j], rb[i]))
        elif len(rb) == 1:
            bmo.faces.new((ra[i], ra[j], rb[0]))
        else:
            bmo.faces.new((ra[i], ra[j], rb[j], rb[i]))
bmesh.ops.recalc_face_normals(bmo, faces=bmo.faces)
me = bpy.data.meshes.new('vulcrag'); bmo.to_mesh(me); bmo.free()
body = link(bpy.data.objects.new('vulcrag', me))
activate(body)
body.data.remesh_voxel_size = 0.03; bpy.ops.object.voxel_remesh()
displace(body, strength=0.05, scale=0.45, tex_type='VORONOI')
m = body.modifiers.new('chip', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(8)
activate(body); bpy.ops.object.modifier_apply(modifier='chip')
m = body.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')
FACETS = [(body.data.copy(), 'cone')]               # rock facets: colour zones are chosen per facet (paint_facets)
m = body.modifiers.new('cut', 'SUBSURF'); m.subdivision_type = 'SIMPLE'; m.levels = 2
bpy.ops.object.modifier_apply(modifier='cut')
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], 0.0)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)
ztop = co[:, 2].max()


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


mat_body = toon_material('body', attr='Col', ink=INK)
mat_glow = toon_material('glow', LAVA, glow=1.0, ink=MAGMA_D)
mat_magma = toon_material('magma', MAGMA, glow=0.85, ink=MAGMA_D)
mat_eye = toon_material('eye', LAVA, glow=1.0, ink='#7a2a00')        # own slot: the rig's blink finds it
# per-side arm and fist materials so the rig can claim each arm exactly (they hang too close to the body for capsules);
# the arm (and the fist's basalt crust and knuckles) take the facet colours, the fist's molten core glows between them
mat_arm = {s: toon_material(f'arm{"L" if s > 0 else "R"}', attr='Col', ink=INK) for s in (-1, 1)}
mat_fist = {s: toon_material(f'fist{"L" if s > 0 else "R"}', MAGMA, glow=0.85, ink=MAGMA_D) for s in (-1, 1)}
assign(body, mat_body)
parts = []

# glowing slanted eyes (no brow: dark ovals read as a second pair of eyes) and a glowing jagged mouth
for s in (-1, 1):
    p, n = snap((1.0, P['eye_y'] * s, P['eye_z']), (0, P['eye_y'] * s, P['eye_z']))
    parts.append(assign(ellipsoid(f'eye{s}', p + n * 0.012, (0.11, 0.06, 0.04), track=n, roll=90 + 22 * s, taper=0.35, taper_axis=0), mat_eye))
mouth = [snap((1.0, y, 0.62 + dz), (0, y, 0.62 + dz)) for y, dz in ((-0.16, 0.03), (-0.10, -0.01), (-0.05, 0.02), (0.0, -0.02), (0.05, 0.02), (0.10, -0.01), (0.16, 0.03))]
parts.append(assign(tube('mouth', [tuple(p + n * 0.01) for p, n in mouth], [0.02, 0.034, 0.03, 0.036, 0.03, 0.034, 0.02], res=2), mat_glow))

# the eruption: one metaball lava body (the pool filling the crater, a bubbling tongue rising out of it that carries
# the spit), and a drip that spills over the rim toward the battle camera and runs down the flank
LB = Blob('lava', resolution=0.02)
LB.add((0, 0, 1.08), 0.27, size=(1.0, 1.0, 0.28), stiff=2.5)                       # the pool filling the crater
for co_, r_ in (((0.03, 0.0, 1.12), 0.17), ((0.10, -0.08, 1.14), 0.09), ((-0.09, 0.08, 1.14), 0.10), ((-0.02, 0.03, 1.21), 0.11)):
    LB.add(co_, r_, stiff=2.4)                                                       # a bubbling dome, not a scoop
parts.append(assign(LB.mesh(voxel=0.014, smooth_iters=2), mat_glow))
# one splash of lava rising out of the dome: a teardrop fused to it (no floating balls, no stalk)
parts.append(assign(ellipsoid('splash', (-0.03, 0.04, 1.29), (0.075, 0.075, 0.11), rot=(-14, -10, 0), taper=0.7), mat_glow))
drip = []
for z, da in ((1.17, 0), (1.11, 2), (1.04, -3), (0.97, 2), (0.91, -2), (0.86, 0)):
    a = math.radians(-76 + da)
    hit, n = snap((3 * math.cos(a), 3 * math.sin(a), z), (0, 0, z))
    drip.append((hit + n * 0.012, n))
drip[0] = (Vector((0.30 * math.cos(math.radians(-76)), 0.30 * math.sin(math.radians(-76)), 1.12)), drip[0][1])   # starts in the pool
parts.append(assign(tube('drip', [tuple(p) for p, _ in drip], [0.045, 0.04, 0.036, 0.034, 0.032, 0.036], res=6), mat_glow))
parts.append(assign(ellipsoid('dripend', drip[-1][0] - Vector((0, 0, 0.02)) + drip[-1][1] * 0.005, (0.045, 0.045, 0.052)), mat_glow))

# magma cracks: three meandering, branching cracks from the crater rim (the face stays clear), two reaching the base so
# the cone looks lit from within. Each is a MAGMA tube with a hotter LAVA core riding on its crest.
def crack(name, a0, z0, z1, wob, r0, n=7):
    pts = []
    for j, z in enumerate(np.linspace(z0, z1, n)):
        a = math.radians(a0 + wob[j % len(wob)])
        hit, nn = snap((3 * math.cos(a), 3 * math.sin(a), z), (0, 0, z))
        pts.append((hit, nn))
    rr = [r0 * (1 - 0.65 * j / (n - 1)) for j in range(n)]
    parts.append(assign(tube(name, [tuple(p - q * 0.006) for p, q in pts], rr, res=3), mat_magma))
    parts.append(assign(tube(name + '_core', [tuple(p + q * (r * 0.55 - 0.006)) for (p, q), r in zip(pts, rr)],
                             [r * 0.45 for r in rr], res=3), mat_glow))
    return pts


for i, (a0, z1, wob, br) in enumerate(((72, 0.42, (0, 7, 2, 9, 3, 10, 5), (3, 1, 24)),
                                       (178, 0.06, (0, -8, -2, -11, -4, -10, -6), (2, 1, -26)),
                                       (242, 0.06, (0, 7, 1, 9, 2, 8, 3), (3, 1, -22)))):
    pts = crack(f'crack{i}', a0, 1.12, z1, wob, 0.035)
    j, sgn, dz = br[0], br[1], br[2]                        # a short branch leaving the main crack sideways-down
    zb = pts[j][0].z
    crack(f'crack{i}b', a0 + wob[j], zb, max(0.25, zb - 0.30), (0, dz * 0.4, dz * 0.7, dz), 0.026, n=4)

# stubby arms: a shoulder ball on the cone's side, then out to a visible elbow (a gap of air between arm and cone),
# down to a fist that rests near the floor; chipped into rock facets like the body
ARM_FACETS = {}
for s in (-1, 1):
    sh, _ = snap((0.0, 3.0 * s, 0.74), (0, 0, 0.74))
    ys = abs(sh.y)
    AB = Blob(f'arm{s}', resolution=0.025)
    AB.add((sh.x - 0.02, (ys - 0.06) * s, 0.72), 0.18, stiff=2.2)                       # shoulder
    AB.chain((0.0, (ys + 0.06) * s, 0.68), (0.04, (ys + 0.28) * s, 0.48), 0.155, 0.15, n=5, stiff=2.0)
    AB.chain((0.04, (ys + 0.28) * s, 0.48), (0.14, (ys + 0.27) * s, 0.30), 0.15, 0.145, n=4, stiff=2.0)
    arm = AB.mesh(voxel=0.03)
    displace(arm, strength=0.03, scale=0.35, tex_type='VORONOI', seed=s)
    m = arm.modifiers.new('chip', 'DECIMATE'); m.decimate_type = 'DISSOLVE'; m.angle_limit = math.radians(10)
    activate(arm); bpy.ops.object.modifier_apply(modifier='chip')
    m = arm.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier='tri')
    FACETS.append((arm.data.copy(), 'arm'))
    parts.append(assign(arm, mat_arm[s]))
    # the fist: a flattened molten core under a cracked basalt crust (three plates) with three basalt knuckles
    fc = Vector((0.18, (ys + 0.27) * s, 0.22))
    parts.append(assign(ellipsoid(f'fist{s}', fc, (0.21, 0.19, 0.15)), mat_fist[s]))
    crust = []
    for k, (off, sc_, rot_) in enumerate((((-0.07, 0.07, 0.085), (0.13, 0.11, 0.075), (12, -14, 20)),
                                          ((-0.07, -0.08, 0.08), (0.12, 0.11, 0.075), (-12, -14, -15)),
                                          ((0.08, 0.0, 0.095), (0.12, 0.15, 0.07), (0, 12, 0)))):
        crust.append(ellipsoid(f'crust{s}{k}', fc + Vector(off), sc_, rot=rot_, segs=9, rings=6))
    for k in (-1, 0, 1):
        crust.append(ellipsoid(f'knuckle{s}{k}', fc + Vector((0.18, 0.075 * k, 0.03)), (0.06, 0.05, 0.055), segs=8, rings=5))
    for c_ in crust:
        FACETS.append((c_.data.copy(), 'arm'))
        parts.append(assign(c_, mat_arm[s]))

body = union(body, parts)
set_smooth(body, angle=14)


def paint_facets(o, facets, slots, pick, attr='Col'):
    """Flat per-facet colour for a faceted kin (no blending: a vertex blend over crisp facets reads as a stain): a
    FACE_CORNER attribute where every corner of a polygon in `slots` takes the colour of the facet (from `facets`, (mesh,
    tag) pairs before the fine cut) it lies on. pick(centroid, normal, hash, tag) -> rgb per facet."""
    from mathutils.bvhtree import BVHTree as _B
    V, F, fcol = [], [], []
    for fm, tag in facets:
        off = len(V)
        V += [v.co[:] for v in fm.vertices]
        for p in fm.polygons:
            F.append([off + i for i in p.vertices])
            c = p.center
            h = (math.sin(c.x * 127.1 + c.y * 311.7 + c.z * 74.7) * 43758.5453) % 1.0
            fcol.append(pick(c, p.normal, h, tag))
    fb = _B.FromPolygons(V, F)
    me = o.data
    sidx = [i for i, m in enumerate(me.materials) if m and m.name in slots]
    n = len(me.polygons)
    cen = np.empty(n * 3); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
    pm = np.empty(n, dtype=np.int32); me.polygons.foreach_get('material_index', pm)
    ls = np.empty(n, dtype=np.int32); me.polygons.foreach_get('loop_start', ls)
    lt = np.empty(n, dtype=np.int32); me.polygons.foreach_get('loop_total', lt)
    col = np.tile(np.array(BASALT + (1.0,)), (len(me.loops), 1))
    for i in np.where(np.isin(pm, sidx))[0]:
        _, _, fi, _ = fb.find_nearest(Vector(cen[i]))
        if fi is not None:
            col[ls[i]:ls[i] + lt[i], :3] = fcol[fi]
    a = me.color_attributes.new(attr, 'FLOAT_COLOR', 'CORNER')
    a.data.foreach_set('color', col.ravel())
    me.update()


def pick(c, nrm, h, tag):
    if tag == 'arm':
        return BASALT_L if nrm.z > 0.45 else BASALT      # the tops of the arms and the fist crust catch the light
    if c.z > 1.0 and nrm.z > 0.3:
        return BASALT_L                                  # the rim
    if c.z < 0.09:
        return BASALT_D                                  # a darker, ashy foot
    return BASALT


paint_facets(body, FACETS, {'body', 'armL', 'armR'}, pick)


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
setup_render(samples=SPP, ink_px=6.0 * SIZE / 1024, inner_px=3.2 * SIZE / 1024, crease_deg=115)    # 115: no stray short crease ink on the flank near the arms
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'vulcrag_final.blend')))
print(f'VULCRAG total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)} ztop {ztop:.3f}')
