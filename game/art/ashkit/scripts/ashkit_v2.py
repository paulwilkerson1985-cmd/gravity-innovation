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
Gate-1 fixes (2026-10-16, game/art/ashkit/review/GATE.md):
  * dark ear backs (a red-fox marking), so the near ear reads against the orange skull from behind;
  * a shorter, gently upturned mouth with no philtrum line, and a chin fill under the snout so the
    cream jaw no longer folds into a second ink line under the mouth;
  * hind legs set back under the hips with a slight hock angle (front and hind read differently);
  * socks stay sooty (round 1 tried lighter, shorter socks; every judge preferred the dark paws that ground
    the creature, so they went back) and now also cover the set-back hind paws.
Env: SPP, SIZE, OUTDIR, MODE=turn|battle|both, BLEND.
"""
import sys, os, time, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'kin', 'lib'))   # common, turn
from common import *
from mathutils.bvhtree import BVHTree

T0 = time.perf_counter()
sc = reset_scene()
P = dict(  # tunables (round-by-round)
    eye_y=float(os.environ.get('EYE_Y', 0.275)), eye_z=1.245, eye_w=0.135, eye_h=0.165, eye_d=0.05, eye_out=0.016, eye_fwd=float(os.environ.get('EYE_FWD', 0.12)),
    snout=(0.87, 0.0, 0.975), snout_r=0.235, snout_size=(1.36, 0.86, 0.74),
    head_turn=float(os.environ.get('TURN', 16)), head_lift=float(os.environ.get('LIFT', 4)),
)

ORANGE = srgb('#ff7a2e'); CREAM = srgb('#ffe9c6'); SOOT = srgb('#3b2d33'); EAR_BACK = srgb('#4a2a26'); EMBER = srgb('#ffb02a'); EMBER_CORE = srgb('#fff3b0')
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
B.add((0.70, 0, 0.84), 0.28, size=(1.3, 1.1, 0.8))           # chin + throat fill: no fold (ink line) under the snout
                                                              # (r 0.28, polish review 2: no jowl ink back from the mouth)
# legs: all four planted on z=0. Front legs under the shoulders, hind legs under the hips;
# a small haunch / shoulder mass above each so the legs grow out of the body instead of pegs.
GROUND = 0.0
# Hind legs sit under the hips (set back 0.09 from the first pass) and lean back from the hip to a
# hock above the paw, so front and hind legs read differently in profile.
HIND_X, HOCK = -0.40, 0.05
legs = [(0.25, 0.26), (0.25, -0.26), (HIND_X, 0.27), (HIND_X, -0.27)]
for (x, y) in legs:
    hind = x < 0
    top = Vector((x + (HOCK if hind else 0), y, 0.50)); foot = Vector((x, y, 0.15))
    B.chain(top, foot, 0.148, 0.135, n=5)
    B.add((x + 0.06, y, GROUND + 0.105), 0.15, size=(1.35, 1.0, 0.70), stiff=2.5)   # paw, toes forward
for s in (-1, 1):
    B.add((HIND_X + 0.03, 0.25 * s, 0.56), 0.26, size=(1.1, 0.9, 1.0))  # haunch
    B.add((0.24, 0.24 * s, 0.58), 0.21)                        # shoulder
# short fluffy tail rising from the rump and curling up (slightly to the far side so it reads in 3/4)
for co, r in [((-0.50, 0.03, 0.74), 0.23), ((-0.64, 0.07, 0.88), 0.22), ((-0.71, 0.10, 1.04), 0.19)]:
    B.add(co, r)
B.add((-0.52, 0, 0.58), 0.38, stiff=1.6)                                # rump fill: the haunch pair left an inked cleft (polish 3: r 0.38, lower)
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
    teardrop in EVERY view. A core mesh inside the flame is swallowed by the union, and one pushed toward the battle
    camera showed as an off-centre sliver from behind (polish review 2, cross-kin 3). Candidate for lib/common.py."""
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
# ears: as D (big tapered slabs, inner face forward, tilted outward and back), seated deep in the skull
EAR = dict(c=(0.30, 0.34, 1.70), s=(0.13, 0.30, 0.50), rx=-26, ry=-10)
for s in (-1, 1):
    # denser than the 32x16 default so the inner-ear and tip bands are cel edges, not an airbrushed gradient
    e = ellipsoid(f'ear{s}', (EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]), EAR['s'], rot=(EAR['rx'] * s, EAR['ry'], 0), taper=0.92,
                  segs=64, rings=48)
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
    # a short smile: the corner ends under the front edge of the eye and turns gently up (no down-hook)
    lobe[s] = [snap((x, s, z), (x, 0, z))[0] for (x, z) in ((1.135, zf - 0.036), (1.10, zf - 0.028), (1.06, zf - 0.015), (1.025, zf + 0.002))]
    print('  mouth lobe', s, [tuple(round(v, 3) for v in q) for q in lobe[s]])
mid, _ = snap((sx + 1, 0, zf - 0.040), (sx, 0, zf - 0.040))   # the smile's low point is its centre
smile = list(reversed(lobe[-1])) + [mid] + lobe[1]
parts.append(assign(tube('mouth', [tuple(q) for q in smile], [0.007, 0.010, 0.012, 0.012, 0.012, 0.012, 0.012, 0.010, 0.007], res=8), mat_nose))
MOUTH = smile
# ember flame on the tail tip: outer teardrop + pale core (as D)
fl = ellipsoid('ember', (-0.73, 0.11, 1.27), (0.19, 0.19, 0.30), rot=(0, -12, 0), taper=0.88)
parts.append(assign(fl, mat_ember))
# (the pale core is the flame material's camera-facing band: centred in every view, polish review 2)

body = union(body, parts)
set_smooth(body, angle=50)

# ------------------------------------------------------------------ colour zones (vertex colours)


def ear_local(co, s):
    R = np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())
    return (co - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ R


# ear zones as signed distances (negative inside) for paint_soft: cel edges along the designed curve
def ear_sdf(fn):
    def f(co, nm):
        return np.minimum(fn(ear_local(co, -1)), fn(ear_local(co, 1)))
    return f


def inner_ear_l(l):
    t = np.clip((l[:, 2] + 0.05) / 0.45, 0, 1)
    return np.maximum.reduce([np.abs(l[:, 1]) - 0.21 * (1 - t) ** 0.8, -0.05 - l[:, 2], l[:, 2] - 0.33, -l[:, 0]])


def ear_tip_l(l):
    return 0.27 - l[:, 2]


def ear_back_l(l):
    """The back of each ear above its root: dark brown, so the near ear reads against the orange skull."""
    k = np.sqrt((l[:, 0] / 0.16) ** 2 + (l[:, 1] / 0.33) ** 2 + (l[:, 2] / 0.53) ** 2)
    return np.maximum.reduce([(k - 1.0) * 0.16, l[:, 0] - 0.02, -0.10 - l[:, 2]])


def mask_sd(co, nm):
    # fox mask: snout + cheeks. Seen from the side the top edge runs from just under the eye
    # diagonally back and down along the jaw (no vertical cut); toward the flanks it sweeps up the cheek.
    ay = np.abs(co[:, 1])
    ztop = (P['eye_z'] - P['eye_h'] - 0.035) + 0.14 * np.clip((ay - 0.30) / 0.30, 0, 1) ** 1.5
    jaw = 1.07 + 0.85 * (co[:, 0] - 0.74) + 0.22 * np.clip((ay - 0.22) / 0.4, 0, 1)
    back = (co[:, 0] - 0.30) - 0.6 * (0.98 - co[:, 2])          # diagonal back edge, meets the chest bib
    return np.maximum.reduce([co[:, 2] - np.minimum(ztop, jaw), 0.60 - co[:, 2], -back / 1.17])


ZONES = [
    (lambda co, nm: np.maximum.reduce([0.26 - co[:, 2], co[:, 2] - 0.42, np.abs(co[:, 1]) - 0.30, -0.40 - co[:, 0], co[:, 0] - 0.16]), CREAM),  # belly
    (sd_ellipse((0.56, 0, 0.66), (0.26, 0.30, 0.30)), CREAM),                                                     # chest bib
    (mask_sd, CREAM),
    (lambda co, nm: np.maximum(co[:, 2] - 0.27, -0.62 - co[:, 0]), SOOT),          # sooty socks, same height on all four
    (ear_sdf(inner_ear_l), CREAM), (ear_sdf(ear_back_l), EAR_BACK), (ear_sdf(ear_tip_l), SOOT)]
# every zone is a signed distance (unit gradient along the skin) painted with paint_soft on a mesh split fine under its
# edge (polish 3, cross-kin 4: boolean zones + smoothstep_blend and the one-voxel vertex-colour ramp read as airbrush)
crisp_zones(body, [f for f, _ in ZONES], edge=0.012)
bm = vertex_slot_mask(body, {'body'})
paint_zones(body, ORANGE, [], mask=bm)
paint_soft(body, [(unit_sd(body, f), c) for f, c in ZONES], mask=bm, edge=0.012)


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
OUTDIR = os.environ.get('OUTDIR', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'rounds', 'r1'))
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
save_blend(os.environ.get('BLEND', os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ashkit_final.blend')))
print(f'ASHKIT v2 total {time.perf_counter() - T0:.1f}s, tris {tri_count(body)}')
