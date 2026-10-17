"""Pyrelord - the flame line's final stage (docs/CREATURES.md): a heavy, chest-high fox beast.

Thick gauntleted legs and a proud head. Signature: a flame crown between swept charcoal horns, a fiery mane
collar, a comet-flame tail, ember studs on the spine, golden eyes under a brow, gold claws and bands.
Palette: crimson, gold, charcoal, flame orange/yellow. Lineage marks kept from Ashkit and Cindertail: the fox
face with a cream (here gold) mask below the eyes, dark ear backs, sooty boots.
Built with the Ashkit recipe (see ../cindertail/model.py). Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(
    eye_y=0.27, eye_z=2.06, eye_w=0.11, eye_h=0.12, eye_d=0.045, eye_out=0.014, eye_fwd=0.15,
    snout=(1.30, 0.0, 1.93), snout_r=0.22, snout_size=(1.45, 0.92, 0.80),
    head_turn=16.0, head_lift=4.0,
)

CRIMSON = srgb('#d8321e'); GOLD = srgb('#ffcf7a'); GOLD_D = srgb('#e8a63a'); SOOT = srgb('#2c2230')
EMBER = srgb('#ff8a1e'); EMBER_CORE = srgb('#ffe14d'); IRIS = srgb('#ffd23f'); PUPIL = srgb('#2b1a1e')
WHITE = srgb('#ffffff'); EAR_BACK = srgb('#3a1f22')
INK = '#24121a'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.95, 0.0, 2.05))          # head centre
B = Blob('pyrelord', resolution=0.04)
B.add((-0.24, 0, 1.26), 0.52, size=(1.40, 0.80, 0.74))        # body, tapering to the waist
B.add((0.40, 0, 1.42), 0.54, size=(0.95, 1.0, 1.05))          # deep chest, the biggest mass, in front
B.chain((0.55, 0, 1.55), (0.86, 0, 1.92), 0.32, 0.28, n=5)    # thick neck
B.add(C, 0.43, size=(1.08, 1.0, 0.86))                        # proud head
for s in (-1, 1):
    B.add((1.10, 0.28 * s, 1.88), 0.16)                       # heavy cheeks
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)   # muzzle
B.add((1.06, 0, 1.80), 0.20, size=(1.4, 0.95, 0.8))           # jaw / throat fill
GROUND = 0.0
FRONT_X, HIND_X, LY = 0.40, -0.68, 0.30
for s in (-1, 1):
    y = LY * s
    B.add((FRONT_X - 0.04, y * 1.05, 1.24), 0.34)             # big shoulder
    B.chain((FRONT_X, y, 1.10), (FRONT_X + 0.02, y, 0.55), 0.23, 0.15, n=5)    # forearm tapers to the wrist
    B.add((FRONT_X + 0.03, y, 0.34), 0.21, size=(1.05, 1.0, 1.25))             # gauntlet cuff flares out
    B.add((FRONT_X + 0.09, y, GROUND + 0.11), 0.17, size=(1.45, 1.05, 0.66), stiff=2.5)   # big paw
    B.add((HIND_X + 0.04, y, 1.18), 0.34, size=(1.1, 0.85, 1.05))                         # haunch
    B.chain((HIND_X + 0.02, y, 1.08), (HIND_X - 0.12, y, 0.56), 0.24, 0.15, n=5)
    B.add((HIND_X - 0.06, y, 0.34), 0.20, size=(1.05, 1.0, 1.25))              # hind gauntlet cuff
    B.add((HIND_X + 0.07, y, GROUND + 0.11), 0.17, size=(1.45, 1.05, 0.66), stiff=2.5)
# long tail rising up and back from the rump
for co, r in [((-0.92, 0.0, 1.36), 0.15), ((-1.10, 0.02, 1.52), 0.14), ((-1.24, 0.04, 1.72), 0.13), ((-1.32, 0.05, 1.92), 0.12)]:
    B.add(co, r)
# mane collar: a stiff ring around the neck that the flame tongues grow out of (polish review 2: the tongues alone
# read as a row of dorsal fins)
# (polish 3: ring radius 0.34, twelve balls, so the tongue bases sit in one raised band)
NC = Vector((0.66, 0, 1.72)); AX = Vector((0.55, 0, 0.83)).normalized()
U = Vector((0, 1, 0)); Wv = AX.cross(U).normalized()
RING_R = 0.34
for i in range(12):
    a = (i / 12) * math.tau + 0.25
    out = U * math.cos(a) + Wv * math.sin(a)
    if out.z < -0.60:
        continue                                            # not under the throat (keeps the chest line)
    B.add(NC + out * RING_R, 0.14, stiff=3.2)
body = B.mesh(voxel=0.022)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], GROUND)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s')



def fuse(o, parts, voxel, region, iters=8):
    """Boolean-union parts into o, voxel-remesh the result and smooth it where region(co) > 0 (0..1), so the parts
    grow out of the body: no inked intersection rings and no hairlines where neighbouring parts overlap (polish 3).
    Candidate for lib/common.py."""
    union(o, parts)
    o.data.remesh_voxel_size = voxel; o.data.remesh_voxel_adaptivity = 0.0
    activate(o); bpy.ops.object.voxel_remesh()
    co, _ = mesh_arrays(o)
    w = np.clip(np.asarray(region(co), float), 0, 1)
    g = o.vertex_groups.new(name='fuse')
    for i in np.where(w > 1e-3)[0]:
        g.add([int(i)], float(w[i]), 'REPLACE')
    m = o.modifiers.new('fs', 'SMOOTH'); m.iterations = iters; m.factor = 0.5; m.vertex_group = 'fuse'
    activate(o); bpy.ops.object.modifier_apply(modifier='fs')
    o.vertex_groups.remove(o.vertex_groups['fuse'])
    set_smooth(o)
    return o


def sm(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# fiery mane collar: flame tongues fanning out of the collar ring, fused with the body BEFORE the ink (polish 3: as
# boolean parts every overlap between neighbours was inked, a row of crossed paper fins).
MANE = []
tongues = []
for i, a in enumerate(math.pi / 2 + k * 0.6 for k in (0, -1, 1, -2, 2, -3, 3)):
    # seven tongues, symmetric about the spine, on the top and upper sides of the ring only (the low ones fanned across
    # the neck from the side); the middle one and the second pair long, the others short
    out = U * math.cos(a) + Wv * math.sin(a)
    base = NC + out * RING_R
    dirn = (out * 0.50 + Vector((-0.55, 0, 0.72))).normalized()   # fan out and up (never end-on to the cameras)
    hgt = 0.42 if i in (0, 3, 4) else 0.34
    tongues.append(ellipsoid(f'mane{i}', base + dirn * hgt * 0.50, (0.15, 0.15, hgt), track=dirn, taper=0.9, segs=64, rings=48))
    MANE.append((np.array(base), np.array(dirn), hgt))


def collar_dist(co):
    """Distance from the collar ring's circle (the band's core)."""
    r = co - np.array(NC); ax = np.array(AX)
    h = r @ ax; rad = np.linalg.norm(r - h[:, None] * ax[None, :], axis=1)
    return np.hypot(h, rad - RING_R)


def tongue_axis(co):
    """Per tongue: (t along its axis from the base, distance from the axis); stacked over tongues."""
    T, D = [], []
    for base, dirn, hgt in MANE:
        r = co - base; t = r @ dirn
        T.append(t); D.append(np.linalg.norm(r - t[:, None] * dirn[None, :], axis=1))
    return np.array(T), np.array(D)


def fuse_region(co):
    # the band and the lower half of every tongue: roots and the valleys between neighbours melt, free tips stay sharp
    T, D = tongue_axis(co)
    tw = np.max(sm(0.30, 0.18, D) * sm(0.30, 0.20, T), axis=0)
    return np.maximum(sm(0.30, 0.18, collar_dist(co)), tw)


body = fuse(body, tongues, 0.016, fuse_region, iters=10)
print('  mane fused, tris', tri_count(body))

dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(body, dg)


def snap(target, origin):
    target, origin = Vector(target), Vector(origin)
    d = (target - origin).normalized()
    hit, n, _, _ = bvh.ray_cast(origin, d, 5.0)
    if hit is None:
        raise RuntimeError(f'no hit {target}')
    return hit, n.normalized()


def crisp_zones(o, sdfs, edge=0.012, passes=2):
    """Split the edges that a colour edge crosses (or comes within `edge` of), `passes` times, before paint_soft.
    Vertex colours interpolate linearly across a triangle, so on a 0.02-voxel body every zone edge was at least one
    voxel (3-4 px at 512) of airbrush whatever paint_soft's edge (polish review 2, cross-kin 4); two passes make the
    triangles under the edge a quarter voxel. Flat split (no smoothing): shading and silhouette are unchanged.
    Candidate for lib/common.py (paint_soft(..., crisp=True))."""
    import bmesh
    for _ in range(passes):
        co, nm = mesh_arrays(o)
        d = np.stack([np.asarray(f(co, nm), float) for f in sdfs], 1)
        bmx = bmesh.new(); bmx.from_mesh(o.data); bmx.verts.ensure_lookup_table(); bmx.edges.ensure_lookup_table()
        ev = np.array([(e.verts[0].index, e.verts[1].index) for e in bmx.edges], dtype=np.int64).reshape(-1, 2)
        a, b = d[ev[:, 0]], d[ev[:, 1]]
        hit = ((a * b < 0) | (np.minimum(np.abs(a), np.abs(b)) < edge)).any(1)
        sel = [bmx.edges[i] for i in np.where(hit)[0]]
        bmesh.ops.subdivide_edges(bmx, edges=sel, cuts=1, use_grid_fill=True)
        bmx.to_mesh(o.data); bmx.free(); o.data.update()
        print(f'  crisp_zones: split {len(sel)} edges -> {tri_count(o)} tris')


def unit_sd(o, f):
    """f's signed distance rescaled to unit gradient ALONG the surface (estimated over the mesh edges), so every zone
    edge is the same width: a 3-D ellipsoid that meets the skin at a grazing angle, or a normal-based term, changes
    slowly along the surface and painted a wide airbrushed band (polish 3, cross-kin 4)."""
    me = o.data
    ev = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)

    def g(co, nm):
        d = np.asarray(f(co, nm), float)
        ln = np.maximum(np.linalg.norm(co[ev[:, 0]] - co[ev[:, 1]], axis=1), 1e-6)
        gr = np.abs(d[ev[:, 0]] - d[ev[:, 1]]) / ln
        acc = np.zeros(len(d)); cnt = np.zeros(len(d))
        np.add.at(acc, ev[:, 0], gr); np.add.at(acc, ev[:, 1], gr); np.add.at(cnt, ev[:, 0], 1); np.add.at(cnt, ev[:, 1], 1)
        return d / np.clip(acc / np.maximum(cnt, 1), 0.25, 4.0)
    return g


# ------------------------------------------------------------------ hard parts
mat_body = toon_material('body', attr='Col', ink=INK)
mat_iris = toon_material('eye', IRIS, glow=0.35, ink=INK)
mat_pupil = toon_material('pupil', PUPIL, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', PUPIL, ink=INK)
mat_soot = toon_material('soot', SOOT, ink=INK)
mat_gold = toon_material('gold', GOLD_D, glow=0.15, ink='#8a5418')


def flame_material(name, outer, core, thr=0.80, glow_outer=0.75, glow_core=1.0, ink='#c8481c'):
    """Toon flame whose pale core is the part of the surface facing the camera (N . I > thr): a centred inner
    teardrop in every view (polish review 2, cross-kin 3; a core mesh pushed toward the battle camera showed as an
    off-centre sliver in the turn views, and a centred one is swallowed by the union). Candidate for lib/common.py."""
    m = toon_material(name, outer, glow=glow_outer, ink=ink)
    nt = m.node_tree; N = nt.nodes.new; L = nt.links.new
    grp = next(n for n in nt.nodes if n.type == 'GROUP')
    geo = N('ShaderNodeNewGeometry')
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    L(geo.outputs['Normal'], dot.inputs[0]); L(geo.outputs['Incoming'], dot.inputs[1])
    step = N('ShaderNodeMath'); step.operation = 'GREATER_THAN'; step.inputs[1].default_value = thr
    L(dot.outputs['Value'], step.inputs[0])
    mix = N('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MIX'
    mix.inputs[6].default_value = (*outer, 1); mix.inputs[7].default_value = (*core, 1)
    L(step.outputs[0], mix.inputs['Factor']); L(mix.outputs[2], grp.inputs['Base'])
    gl = N('ShaderNodeMath'); gl.operation = 'MULTIPLY_ADD'; gl.inputs[1].default_value = glow_core - glow_outer
    gl.inputs[2].default_value = glow_outer
    L(step.outputs[0], gl.inputs[0]); L(gl.outputs[0], grp.inputs['Glow'])
    return m


mat_ember = flame_material('ember', EMBER, EMBER_CORE, ink='#b2321a')
mat_stud = flame_material('stud', EMBER, EMBER_CORE, thr=0.55, ink='#b2321a')    # own slot: the rig claims 'ember' near the tail
# the mane is now body surface: its glow comes from a painted 'Glow' vertex attribute (0 on the body, 0.75 on the mane)
_nt = mat_body.node_tree
_ga = _nt.nodes.new('ShaderNodeVertexColor'); _ga.layer_name = 'Glow'
_nt.links.new(_ga.outputs['Color'], next(n for n in _nt.nodes if n.type == 'GROUP').inputs['Glow'])
assign(body, mat_body)
parts = []
d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()

# ears: smaller than the kit's relative to the head, swept back between the horns
EAR = dict(c=(0.80, 0.30, 2.42), s=(0.10, 0.21, 0.38), rx=-24, ry=-30)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92,
                  segs=64, rings=48)      # dense: the inner-ear band is a cel edge, not an airbrush
    parts.append(assign(e, mat_body))
    # swept charcoal horns: from the brow back over the skull
    h = tube(f'horn{s}', [(0.98, 0.20 * s, 2.30), (0.86, 0.32 * s, 2.50), (0.62, 0.44 * s, 2.64), (0.36, 0.50 * s, 2.66)],
             [0.075, 0.062, 0.042, 0.016], res=10)
    parts.append(assign(h, mat_soot))

# golden eyes (iris + pupil + glint) under a heavy soot brow
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    parts.append(assign(ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f, roll=12 * s), mat_iris))
    parts.append(assign(ellipsoid(f'pupil{s}', ec + f * 0.03, (P['eye_w'] * 0.45, P['eye_h'] * 0.62, 0.025), track=f), mat_pupil))
    t = (Lw - f * Lw.dot(f)).normalized()
    g = ellipsoid(f'glint{s}', ec + t * (0.42 * P['eye_w']) + f * 0.042, (0.030, 0.033, 0.012), track=f)
    parts.append(assign(g, mat_glint))
    # brow: a soot ridge over the eye, tilted down toward the nose (fierce, not angry)
    bp, bn = snap((C.x + 1.0, (P['eye_y'] - 0.01) * s, P['eye_z'] + 0.15), (C.x, (P['eye_y'] - 0.01) * s, P['eye_z'] + 0.15))
    brow = ellipsoid(f'brow{s}', bp - bn * 0.02, (0.16, 0.05, 0.045), track=bn, roll=-90 + 22 * s)
    parts.append(assign(brow, mat_soot))

# nose, a short grim-proud mouth line and two small fangs
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.05), (sx, 0, sz + 0.05))
parts.append(assign(ellipsoid('nose', tip - tn * 0.02, (0.06, 0.095, 0.066), rot=(180, 0, 0), taper=0.45), mat_nose))
zf = sz - 0.07
xt = sx + 0.20
mid, _ = snap((sx + 1, 0, zf - 0.02), (sx, 0, zf - 0.02))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.03, zf - 0.024), (xt - 0.09, zf - 0.024), (xt - 0.15, zf - 0.016), (xt - 0.20, zf - 0.004))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.007, 0.010, 0.012, 0.012, 0.012, 0.012, 0.012, 0.010, 0.007], res=8), mat_nose))
for s in (-1, 1):
    fp = lobe[s][0]
    parts.append(assign(ellipsoid(f'fang{s}', (fp.x - 0.005, fp.y * 0.9, fp.z - 0.035), (0.022, 0.022, 0.05), rot=(180, 0, 0), taper=0.9), mat_glint))

# flame crown between the horns
for i, (y, h, x) in enumerate(((0.0, 0.34, 0.90), (-0.11, 0.24, 0.86), (0.11, 0.24, 0.86))):
    parts.append(assign(ellipsoid(f'crown{i}', (x, y, 2.38 + h * 0.55), (0.10, 0.10, h), rot=(-14 * (y / 0.11 if y else 0), -12, 0), taper=0.9), mat_ember))
# (the crown's pale core is the flame material's camera-facing band: centred in every view)
# ember studs along the spine: round ember nubs seated 40% into the back (polish 3: as flame tongues they joined the
# collar into one stegosaurus row from the side)
for i, x in enumerate((0.12, -0.20, -0.50)):
    sp, sn = snap((x, 0, 3.0), (x, 0, 1.2))
    r = 0.105 - 0.012 * i
    parts.append(assign(ellipsoid(f'stud{i}', sp + sn * (0.2 * r), (r, r, r), segs=48, rings=24), mat_stud))
# comet flame on the tail tip (pale core from the flame material)
parts.append(assign(ellipsoid('ember', (-1.38, 0.05, 2.22), (0.27, 0.27, 0.50), rot=(0, -18, 0), taper=0.9), mat_ember))
# gold claws on every paw (big enough to survive 300 px)
for (lx, ly) in ((FRONT_X, LY), (FRONT_X, -LY), (HIND_X, LY), (HIND_X, -LY)):
    for j, dy in enumerate((-0.075, 0.0, 0.075)):
        c0 = Vector((lx + 0.30, ly + dy, 0.06))
        parts.append(assign(ellipsoid(f'claw{lx}{ly}{j}', c0, (0.05, 0.045, 0.09), rot=(0, 75, 0), taper=0.85), mat_gold))

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)


def ear_local(co, s):
    R = np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())
    return (co - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ R


# soft zones as signed distances (negative inside) for paint_soft: cel edges along the designed curve
def ear_sdf(fn):
    def f(co, nm):
        return np.minimum(fn(ear_local(co, -1)), fn(ear_local(co, 1)))
    return f


def inner_ear_l(l):
    t = np.clip((l[:, 2] + 0.05) / 0.36, 0, 1)
    return np.maximum.reduce([np.abs(l[:, 1]) - 0.16 * (1 - t) ** 0.8, -0.05 - l[:, 2], l[:, 2] - 0.26, -l[:, 0]])


def ear_back_l(l):
    k = np.sqrt((l[:, 0] / 0.13) ** 2 + (l[:, 1] / 0.24) ** 2 + (l[:, 2] / 0.41) ** 2)
    return np.maximum.reduce([(k - 1.0) * 0.13, l[:, 0] - 0.02, -0.08 - l[:, 2]])


def belly_sd(co, nm):
    # ellipsoid AND downward faces only; shorter in x (polish 3: its front end still smeared the inner forelegs)
    return np.maximum(sd_ellipse((-0.28, 0, 0.86), (0.34, 0.24, 0.22))(co, nm), (nm[:, 2] + 0.45) * 0.2)


def mane_sd(co, nm):
    # the collar band and every tongue (fused into the body surface, so the mane is a colour zone)
    T, D = tongue_axis(co)
    return np.minimum(collar_dist(co) - 0.17, np.min(np.maximum(D - 0.17, -T), axis=0))


def mane_tip(co, nm):
    T, D = tongue_axis(co)
    hg = np.array([h for _, _, h in MANE])[:, None]
    return np.min(np.maximum(1.22 * hg - T, D - 0.20), axis=0)


def mask_sd(co, nm):
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.03) + 0.12 * np.clip((ay - 0.26) / 0.26, 0, 1) ** 1.5
    jaw = 1.74 + 0.80 * (co[:, 0] - 1.12) + 0.20 * np.clip((ay - 0.22) / 0.4, 0, 1)
    back = (co[:, 0] - 0.80) - 0.6 * (1.78 - co[:, 2])
    return np.maximum.reduce([co[:, 2] - np.minimum(ztop, jaw), 1.40 - co[:, 2], -back / 1.17])


ZONES = [(mask_sd, GOLD),
         (lambda co, nm: np.maximum(co[:, 2] - 0.58, -1.25 - co[:, 0]), SOOT),                               # gauntlets
         (lambda co, nm: np.maximum.reduce([co[:, 2] - 0.66, 0.58 - co[:, 2], -1.25 - co[:, 0]]), GOLD_D),   # gold bands
         (belly_sd, GOLD),
         (sd_ellipse((0.78, 0, 1.40), (0.24, 0.34, 0.40)), GOLD),                                             # chest
         (ear_sdf(inner_ear_l), GOLD), (ear_sdf(ear_back_l), EAR_BACK),
         (mane_sd, EMBER), (mane_tip, EMBER_CORE)]
# every zone is a signed distance (unit gradient along the skin) painted with paint_soft on a mesh split fine under its
# edge (polish 3, cross-kin 4: boolean zones + smoothstep_blend and the one-voxel vertex-colour ramp read as airbrush)
crisp_zones(body, [f for f, _ in ZONES], edge=0.012)
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, CRIMSON, [], mask=bm)
paint_soft(body, [(unit_sd(body, f), c) for f, c in ZONES], mask=bm, edge=0.012)
paint_zones(body, (0.0, 0.0, 0.0), [], attr='Glow')
paint_soft(body, [(unit_sd(body, mane_sd), (0.75, 0.75, 0.75))], attr='Glow', mask=bm, edge=0.012)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.62, 0.0, 1.52))


def head_weight(co):
    w = np.maximum(smooth(1.70, 1.92, co[:, 2]), smooth(0.92, 1.10, co[:, 0]) * smooth(1.55, 1.75, co[:, 2]))
    return w * smooth(0.10, 0.35, co[:, 0])


def add_battle_key(o, turn_deg, lift_deg):
    o.shape_key_add(name='Basis')
    k = o.shape_key_add(name='battle')
    co, _ = mesh_arrays(o)
    w = head_weight(co)
    a = math.radians(-turn_deg); b = math.radians(-lift_deg)
    rel = co - PIV
    aw = a * w; bw = b * w
    x1 = rel[:, 0] * np.cos(bw) + rel[:, 2] * np.sin(bw)
    z1 = -rel[:, 0] * np.sin(bw) + rel[:, 2] * np.cos(bw)
    y1 = rel[:, 1]
    x2 = x1 * np.cos(aw) - y1 * np.sin(aw)
    y2 = x1 * np.sin(aw) + y1 * np.cos(aw)
    out = co.copy()
    out[:, 0], out[:, 1], out[:, 2] = x2 + PIV[0], y2 + PIV[1], z1 + PIV[2]
    k.data.foreach_set('co', out.ravel())
    return k


key = add_battle_key(body, P['head_turn'], P['head_lift'])

# ------------------------------------------------------------------ render
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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'pyrelord_final.blend')))
print(f'PYRELORD total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
