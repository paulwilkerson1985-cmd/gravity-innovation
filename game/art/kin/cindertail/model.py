"""Cindertail - Ashkit's evolution: a lanky adolescent fox (docs/CREATURES.md, Flame line).

Long legs, a long snout, swept-back ears and slanted eyes. Signature: a bushy tail ending in a big flame plume,
a cream flame ruff on the chest, tall soot boots. Palette: vermilion, cream, charcoal, gold.
Built with the Ashkit recipe (../../ashkit/scripts/ashkit_v2.py): metaball blockout -> voxel remesh -> face parts
snapped onto the skull with a BVH ray cast -> Boolean union -> vertex-colour zones -> 'battle' head turn shape
key. Keeps Ashkit's lineage marks: dark ear backs, sooty ear tips, cream mask below the eyes, ember tail.
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND (default ./cindertail_final.blend).
"""
import sys, os, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(
    eye_y=0.22, eye_z=1.70, eye_w=0.115, eye_h=0.15, eye_d=0.045, eye_out=0.014, eye_fwd=0.12, eye_slant=16.0,
    snout=(1.00, 0.0, 1.55), snout_r=0.19, snout_size=(1.75, 0.78, 0.70),
    head_turn=16.0, head_lift=4.0,
)

ORANGE = srgb('#f0502a'); CREAM = srgb('#ffdca6'); SOOT = srgb('#34263b'); GOLD = srgb('#ffcc33')
EMBER = srgb('#ffb02a'); EMBER_CORE = srgb('#fff3b0'); EYE = srgb('#2b1a1e'); WHITE = srgb('#ffffff'); NOSE = srgb('#2b1a1e')
EAR_BACK = srgb('#4a2a26')
INK = '#2a1418'

# ------------------------------------------------------------------ blockout (metaballs)
C = Vector((0.64, 0.0, 1.66))          # head centre (smaller than the kit's, relative to the body)
B = Blob('cindertail', resolution=0.035)
B.add((-0.12, 0, 0.92), 0.40, size=(1.45, 0.82, 0.78))         # long body
B.add((0.28, 0, 1.02), 0.31, size=(1.0, 0.92, 1.08))           # deep chest
B.chain((0.36, 0, 1.12), (0.56, 0, 1.46), 0.24, 0.21, n=5)     # neck, rising forward
B.add(C, 0.37, size=(1.06, 1.0, 0.88))                         # head
for s in (-1, 1):
    B.add((0.80, 0.27 * s, 1.52), 0.15)                        # cheek fluff
B.add(P['snout'], P['snout_r'], size=P['snout_size'], stiff=3.0)  # long snout
B.add((0.76, 0, 1.44), 0.17, size=(1.4, 0.9, 0.8))            # jaw / throat fill (no fold under the snout)
GROUND = 0.0
FRONT_X, HIND_X = 0.26, -0.50
for s in (-1, 1):
    y = 0.20 * s
    # front legs: straight, long, under the shoulders
    B.add((FRONT_X - 0.02, y, 0.92), 0.21)                     # shoulder
    B.chain((FRONT_X, y, 0.86), (FRONT_X + 0.01, y, 0.16), 0.125, 0.10, n=7)
    B.add((FRONT_X + 0.07, y, GROUND + 0.085), 0.12, size=(1.45, 0.95, 0.68), stiff=2.5)   # paw
    # hind legs: haunch, then thigh back to a hock, then a long cannon down to the paw
    B.add((HIND_X + 0.04, y, 0.86), 0.25, size=(1.1, 0.82, 1.05))   # haunch
    B.chain((HIND_X + 0.02, y, 0.80), (HIND_X - 0.10, y, 0.40), 0.15, 0.115, n=5)
    B.chain((HIND_X - 0.10, y, 0.40), (HIND_X - 0.02, y, 0.15), 0.11, 0.10, n=4)
    B.add((HIND_X + 0.05, y, GROUND + 0.085), 0.12, size=(1.45, 0.95, 0.68), stiff=2.5)
# bushy tail: thickens as it rises up and back from the rump
for co, r in [((-0.70, 0.02, 1.02), 0.16), ((-0.84, 0.04, 1.16), 0.22), ((-0.97, 0.06, 1.34), 0.26), ((-1.04, 0.07, 1.54), 0.25)]:
    B.add(co, r, size=(1.0, 0.92, 1.0))
B.add((-1.08, 0.07, 1.70), 0.20)                               # tail ball: the plume grows out of fur (polish review 2)
B.add((-0.52, 0, 0.90), 0.24, stiff=1.6)                      # rump fill: no inked cleft between the haunches
body = B.mesh(voxel=0.018)
co, nm = mesh_arrays(body)
co[:, 2] = np.maximum(co[:, 2], GROUND)
body.data.vertices.foreach_set('co', co.ravel()); body.data.update()
print('  blockout tris', tri_count(body), f'{time.perf_counter() - T0:.1f}s', 'zmin', co[:, 2].min())



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


# cream flame ruff on the chest: three tapered tongues fused into the chest (polish 3: five boolean tongues inked a
# hairline at every overlap and the side pair hung below the chin as a blade). The middle tongue is the long one; the
# side pair is sunk in the chest, so from the side the ruff is a chest bulge. Thickness (minor axis) 0.16.
RUFF = [((0.50, 0.0, 0.94), (0.16, 0.17, 0.40), 0.0), ((0.44, 0.13, 0.97), (0.16, 0.15, 0.32), 12.0),
        ((0.44, -0.13, 0.97), (0.16, 0.15, 0.32), -12.0)]
tongues = [ellipsoid(f'ruff{i}', c, sz, rot=(-rx, 158, 0), taper=0.92, segs=64, rings=48) for i, (c, sz, rx) in enumerate(RUFF)]
# smooth the roots and the valleys between the tongues, not their free tips
body = fuse(body, tongues, 0.014, lambda co: sm(0.42, 0.30, np.linalg.norm((co - (0.50, 0, 0.98)) / (1.0, 1.25, 1.2), axis=1))
            * sm(0.66, 0.80, co[:, 2]))
co, nm = mesh_arrays(body)
print('  ruff fused, tris', tri_count(body))

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
mat_eye = toon_material('eye', EYE, ink=INK)
mat_glint = toon_material('glint', WHITE, glow=1.0, ink='#ffffff')
mat_nose = toon_material('nose', NOSE, ink=INK)


def flame_material(name, outer, core, thr=0.80, glow_outer=0.75, glow_core=1.0, ink='#c8481c'):
    """Toon flame whose pale core is the part of the surface facing the camera (N . I > thr): a centred inner
    teardrop in every view (polish review 2, cross-kin 3; a core mesh pushed toward the battle camera showed as an
    off-centre sliver from behind, and a centred one is swallowed by the union). Candidate for lib/common.py."""
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


mat_ember = flame_material('ember', EMBER, EMBER_CORE)
assign(body, mat_body)
parts = []
# ears: tall, swept back and tilted outward, seated deep in the skull
EAR = dict(c=(0.44, 0.27, 2.10), s=(0.11, 0.25, 0.48), rx=-22, ry=-26)
for s in (-1, 1):
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92,
                  segs=64, rings=48)      # dense: the inner-ear and tip bands are cel edges, not an airbrush
    parts.append(assign(e, mat_body))

d_cam, rot, right, up = camera_basis()
Lw = (-0.55 * right + 0.72 * up + 0.42 * d_cam).normalized()
for s in (-1, 1):
    p, n = snap((C.x + 1.0, P['eye_y'] * s, P['eye_z']), (C.x, P['eye_y'] * s, P['eye_z']))
    f = (n + Vector((1, 0, 0)) * P['eye_fwd']).normalized()
    ec = p - f * (P['eye_d'] - P['eye_out'])
    # slanted: the outer corner lifts (roll about the eye's own axis)
    e = ellipsoid(f'eye{s}', ec, (P['eye_w'], P['eye_h'], P['eye_d']), track=f, roll=P['eye_slant'] * s)
    parts.append(assign(e, mat_eye))
    t = (Lw - f * Lw.dot(f)).normalized()
    upv = Vector((0, 0, 1)) - f * f.z; upv.normalize()
    for k, (off, r) in enumerate(((0.45, 0.040), (-0.55, 0.019))):
        dirv = (t if off > 0 else (-t * 0.6 - upv * 0.8).normalized())
        u = abs(off)
        loc = ec + dirv * (u * P['eye_w']) + f * (P['eye_d'] * math.sqrt(max(0.0, 1 - u * u)) - 0.004)
        g = ellipsoid(f'glint{s}{k}', loc, (r, r * 1.1, 0.014), track=f)
        parts.append(assign(g, mat_glint))
    print('  eye', s, tuple(round(v, 3) for v in p))

# nose on the snout tip; a short upturned smile whose low point is its centre (as Ashkit after gate 1)
sx, sy, sz = P['snout']
tip, tn = snap((sx + 1, 0, sz + 0.04), (sx, 0, sz + 0.04))
nose = ellipsoid('nose', tip - tn * 0.02, (0.052, 0.080, 0.058), rot=(180, 0, 0), taper=0.45)
parts.append(assign(nose, mat_nose))
zf = sz - 0.06
xt = sx + 0.25          # the smile's centre sits a little behind the nose; ray origins stay inside the snout
mid, _ = snap((sx + 1, 0, zf - 0.035), (sx, 0, zf - 0.035))
lobe = {}
for s in (-1, 1):
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((xt - 0.03, zf - 0.031), (xt - 0.08, zf - 0.024), (xt - 0.13, zf - 0.012), (xt - 0.17, zf + 0.004))]
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.006, 0.009, 0.011, 0.011, 0.011, 0.011, 0.011, 0.009, 0.006], res=8), mat_nose))
# flame plume on the tail tip (big); its pale core is the flame material's camera-facing band (centred in every view)
fl = ellipsoid('ember', (-1.06, 0.07, 1.90), (0.27, 0.27, 0.44), rot=(0, -14, 0), taper=0.9)
parts.append(assign(fl, mat_ember))
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


def ear_k(l):
    return np.sqrt((l[:, 0] / 0.14) ** 2 + (l[:, 1] / 0.28) ** 2 + (l[:, 2] / 0.51) ** 2)


def inner_ear_l(l):
    t = np.clip((l[:, 2] + 0.05) / 0.45, 0, 1)
    return np.maximum.reduce([np.abs(l[:, 1]) - 0.19 * (1 - t) ** 0.8, -0.05 - l[:, 2], l[:, 2] - 0.33, -l[:, 0]])


def ear_back_l(l):
    return np.maximum.reduce([(ear_k(l) - 1.0) * 0.14, l[:, 0] - 0.02, -0.10 - l[:, 2]])


def ear_tip_l(l):
    # bounded to the ear itself: unbounded, the far side's test painted a soot patch under the tail plume
    return np.maximum(0.27 - l[:, 2], (ear_k(l) - 1.15) * 0.14)


def belly_sd(co, nm):
    # ellipsoid AND downward faces only: the box zone also painted the inner thighs (polish review 2, cross-kin 1)
    return np.maximum(sd_ellipse((-0.12, 0, 0.60), (0.34, 0.22, 0.22))(co, nm), (nm[:, 2] + 0.45) * 0.2)


def mask_sd(co, nm):
    # fox mask: snout, cheeks and jaw cream; the top edge passes below the eyes and sweeps up the cheek
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.03) + 0.12 * np.clip((ay - 0.26) / 0.26, 0, 1) ** 1.5
    jaw = 1.38 + 0.80 * (co[:, 0] - 0.80) + 0.20 * np.clip((ay - 0.20) / 0.4, 0, 1)
    back = (co[:, 0] - 0.50) - 0.6 * (1.40 - co[:, 2])
    return np.maximum.reduce([co[:, 2] - np.minimum(ztop, jaw), 1.02 - co[:, 2], -back / 1.17])


def ruff_sd(co, nm):
    # the ruff and the chest under it: one flat cream zone (front-facing, so the inner forelegs stay orange)
    return np.maximum(sd_ellipse((0.60, 0, 0.90), (0.18, 0.30, 0.36))(co, nm), (-0.25 - nm[:, 0]) * 0.2)


def ruff_gold(co, nm):
    # one hard gold tip zone: the middle tongue below a level line (no per-tongue gradient)
    return np.maximum.reduce([ruff_sd(co, nm), co[:, 2] - 0.72, np.abs(co[:, 1]) - 0.09])


chest_sd = sd_ellipse((0.56, 0, 1.10), (0.20, 0.25, 0.34))
boots_sd = lambda co, nm: np.maximum(co[:, 2] - 0.36, -0.75 - co[:, 0])     # tall soot boots
ZONES = [(belly_sd, CREAM), (chest_sd, CREAM), (ruff_sd, CREAM), (ruff_gold, GOLD), (mask_sd, CREAM), (boots_sd, SOOT),
         (ear_sdf(inner_ear_l), CREAM), (ear_sdf(ear_back_l), EAR_BACK), (ear_sdf(ear_tip_l), SOOT)]
# every zone is a signed distance painted with paint_soft on a mesh split fine under its edge (polish 3, cross-kin 4:
# the boolean zones + smoothstep_blend and the one-voxel vertex-colour ramp read as airbrush)
crisp_zones(body, [f for f, _ in ZONES], edge=0.012)
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, ORANGE, [], mask=bm)
paint_soft(body, [(unit_sd(body, f), c) for f, c in ZONES], mask=bm, edge=0.012)


# ------------------------------------------------------------------ battle pose: head turned toward the camera (shape key)
def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


PIV = np.array((0.40, 0.0, 1.10))


def head_weight(co):
    w = np.maximum(smooth(1.28, 1.48, co[:, 2]), smooth(0.62, 0.80, co[:, 0]) * smooth(1.10, 1.30, co[:, 2]))
    return w * smooth(-0.20, 0.05, co[:, 0])


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
save_blend(os.environ.get('BLEND', os.path.join(HERE, 'cindertail_final.blend')))
print(f'CINDERTAIL total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
