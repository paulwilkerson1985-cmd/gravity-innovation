"""STEP 2 - rig ashkit_final.blend, author 4 clips at 12 fps, render sprite frames from two cameras.

Rig (procedural weights from the rest model's geometry; the union mesh is one piece so heat weights
are avoided):  root -> cog (ground pivot, vertical squash) -> stretch (launch-axis stretch) -> body
-> hips (-> tail1 -> tail2 -> tail3), chest (-> head -> ear.L / ear.R);  legs parented to root so
planted paws never slide when the body breathes or crouches.  'blink' shape key closes the eyes.
The step-1 'battle' head turn is baked into the rest mesh first (bones placed on the turned head).

Env: VIEWS=front,back  CLIPS=idle,attack,hit,faint  FRAMES=0,3 (subset)  SPP=12  SIZE=512
     OUT=<frames dir>  ELEV_BACK=30  YAW_BACK=-12  HEAD_BACK=20  DRY=1 (no render; framing + checks only)
Gate-1 fixes (2026-10-16, ../review/GATE.md): the back view (your kin) moved from -35 to -12 yaw so the face
shows (owner default); hind legs follow the model (under the hips); a deeper attack crouch that reads from
above and behind; faint paws stay on the ground plane.
Gate-2 round 2: at -12 the two ears line up into one spike (every judge), so the back view also turns the
head HEAD_BACK degrees further toward the camera (on top of the baked 16 deg battle turn): the ears separate
and more of the face shows. Back view only; the front view is unchanged.
"""
import sys, os, time, math, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mathutils import Vector, Quaternion, Matrix, Euler
from common import camera_basis, set_light_dir, vertex_slot_mask, link, activate

T0 = time.perf_counter()
HERE = os.path.dirname(os.path.abspath(__file__))
PRE = os.path.dirname(HERE)
bpy.ops.wm.open_mainfile(filepath=os.path.join(PRE, 'ashkit_final.blend'))
sc = bpy.context.scene
o = bpy.data.objects['ashkit']
for c in [x for x in bpy.data.objects if x.type == 'CAMERA']:
    bpy.data.objects.remove(c, do_unlink=True)

FPS = 12
SIZE = int(os.environ.get('SIZE', 512))
SPP = int(os.environ.get('SPP', 12))


def sm(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


me = o.data
n = len(me.vertices)
co0 = np.empty(n * 3); me.vertices.foreach_get('co', co0); co0 = co0.reshape(-1, 3)   # symmetric basis

# ------------------------------------------------------------------ bake the battle head turn into the rest mesh
TURN, LIFT, PIV = 16.0, 4.0, np.array((0.26, 0.0, 0.92))


def head_w(c):
    w = np.maximum(sm(0.86, 1.08, c[:, 2]), sm(0.48, 0.66, c[:, 0]) * sm(0.55, 0.72, c[:, 2]))
    return w * sm(-0.40, -0.20, c[:, 0])


def head_xform(p, w=1.0):
    """The step-1 'battle' shape key deformation (per-point weight w) - used to place bones on the turned head."""
    p = np.atleast_2d(np.asarray(p, float)); w = np.broadcast_to(np.asarray(w, float), (len(p),))
    a = math.radians(-TURN) * w; b = math.radians(-LIFT) * w
    r = p - PIV
    x1 = r[:, 0] * np.cos(b) + r[:, 2] * np.sin(b); z1 = -r[:, 0] * np.sin(b) + r[:, 2] * np.cos(b); y1 = r[:, 1]
    x2 = x1 * np.cos(a) - y1 * np.sin(a); y2 = x1 * np.sin(a) + y1 * np.cos(a)
    return np.stack([x2, y2, z1], 1) + PIV


kb = me.shape_keys.key_blocks
kb['battle'].value = 1.0
o.active_shape_key_index = 1
activate(o)
bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
co = np.empty(n * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
print('battle turn baked, max move', float(np.abs(co - co0).max()))

# ------------------------------------------------------------------ armature
EAR = dict(c=(0.30, 0.34, 1.70), s=(0.13, 0.30, 0.50), rx=-26, ry=-10)


def ear_R(s):
    return np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())


HIND_X = -0.40   # as ashkit_v2.py (hind legs under the hips)
LEGS = {'leg_f.L': (0.25, 0.26), 'leg_f.R': (0.25, -0.26), 'leg_b.L': (HIND_X, 0.27), 'leg_b.R': (HIND_X, -0.27)}
arm_d = bpy.data.armatures.new('rig'); arm = link(bpy.data.objects.new('rig', arm_d))
activate(arm); bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones


def bone(name, head, tail, parent=None, deform=True):
    b = eb.new(name); b.head = tuple(map(float, head)); b.tail = tuple(map(float, tail)); b.use_deform = deform; b.roll = 0
    if parent:
        b.parent = eb[parent]; b.use_connect = False
    return b


LAUNCH = Vector((math.cos(math.radians(28)), 0, math.sin(math.radians(28))))
BODYC = Vector((-0.04, 0, 0.58))
bone('root', (0, 0, 0), (0.3, 0, 0), deform=False)
bone('cog', (0.03, 0, 0), (0.03, 0, 0.5), 'root', deform=False)                   # local Y = world up
bone('stretch', BODYC, BODYC + LAUNCH * 0.4, 'cog', deform=False)                 # local Y = launch axis
bone('body', BODYC, BODYC + Vector((0.4, 0, 0)), 'stretch', deform=False)
bone('hips', (-0.36, 0, 0.62), (-0.04, 0, 0.66), 'body')
bone('chest', (-0.04, 0, 0.66), (0.26, 0, 0.92), 'body')
hh = head_xform([(0.26, 0, 0.92), (0.66, 0, 1.30)])
bone('head', hh[0], hh[1], 'chest')
for s, side in ((1, 'L'), (-1, 'R')):
    R = ear_R(s); c = np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2])); ax = R @ np.array((0, 0, 1.0))
    p = head_xform([c - ax * 0.12, c + ax * 0.45])
    bone(f'ear.{side}', p[0], p[1], 'head')
for nm, (x, y) in LEGS.items():
    top = x + (0.06 if x < 0 else 0.03)   # hind legs lean back from the hip to the hock (ashkit_v2.py HOCK)
    bone(nm, (top, y, 0.46), (x + 0.01 if x < 0 else x + 0.03, y, 0.04), 'root')
bone('tail1', (-0.50, 0.03, 0.78), (-0.64, 0.07, 0.95), 'hips')
bone('tail2', (-0.64, 0.07, 0.95), (-0.71, 0.10, 1.13), 'tail1')
bone('tail3', (-0.71, 0.10, 1.13), (-0.73, 0.11, 1.55), 'tail2')
bpy.ops.object.mode_set(mode='OBJECT')

# ------------------------------------------------------------------ procedural weights (on the symmetric basis co0)
x, y, z = co0[:, 0], co0[:, 1], co0[:, 2]
W = {}
Lsum = np.zeros(n)
for nm, (lx, ly) in LEGS.items():
    d = np.sqrt(((x - (lx + 0.05)) / 1.25) ** 2 + (y - ly) ** 2)
    W[nm] = sm(0.46, 0.28, z) * sm(0.27, 0.19, d)
    Lsum += W[nm]
over = np.maximum(Lsum, 1.0)
for nm in LEGS:
    W[nm] /= over
Lsum = np.minimum(Lsum, 1.0)
rem = 1 - Lsum
H = head_w(co0) * rem
emb = vertex_slot_mask(o, {'ember', 'ember_core'})
Tw = sm(-0.40, -0.55, x) * sm(0.80, 0.98, z)
Tw[emb] = 1.0
Tw *= rem
Tw = np.minimum(Tw, rem - H)
body = np.clip(rem - H - Tw, 0, 1)
cf = sm(-0.25, 0.20, x)
W['chest'] = body * cf; W['hips'] = body * (1 - cf)
esum = np.zeros(n)
for s, side in ((1, 'L'), (-1, 'R')):
    l = (co0 - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ ear_R(s)
    rad = (l[:, 0] / 0.19) ** 2 + (l[:, 1] / 0.36) ** 2
    e = sm(-0.24, -0.04, l[:, 2]) * sm(1.15, 0.85, rad) * (np.sign(y) == s)
    W[f'ear.{side}'] = H * e; esum += e
W['head'] = H * (1 - esum)
f2 = sm(0.98, 1.10, z); f3 = sm(1.12, 1.25, z)
f2[emb] = 1; f3[emb] = 1
W['tail1'] = Tw * (1 - f2); W['tail2'] = Tw * f2 * (1 - f3); W['tail3'] = Tw * f2 * f3
tot = sum(W.values())
print('weights: sum min/max', float(tot.min()), float(tot.max()))
o.vertex_groups.clear()
for nm, w in W.items():
    g = o.vertex_groups.new(name=nm)
    idx = np.where(w > 1e-4)[0]
    for i in idx:
        g.add([int(i)], float(w[i]), 'REPLACE')
md = o.modifiers.new('arm', 'ARMATURE'); md.object = arm
o.parent = arm

# ------------------------------------------------------------------ blink shape key (eyes squeeze to a lid line)
eye_m = vertex_slot_mask(o, {'eye'}); gl_m = vertex_slot_mask(o, {'glint'})
o.shape_key_add(name='Basis')
kbl = o.shape_key_add(name='blink'); kbl.value = 0
bco = co.copy()
for s in (1, -1):
    side = (np.sign(co0[:, 1]) == s)
    em = eye_m & side & ~gl_m
    ez = co[em, 2]; zc = ez.min() + 0.36 * (ez.max() - ez.min())
    cen = co[em].mean(0)
    sel = (eye_m | gl_m) & side
    bco[sel, 2] = zc + (co[sel, 2] - zc) * 0.10
    g = gl_m & side
    f = cen - np.array((0.40, 0.0, 1.16)); f /= np.linalg.norm(f)
    bco[g] = cen + (bco[g] - cen) * 0.25 - f * 0.07     # glints shrink and sink under the lid
    print(f'  eye {s}: centre {np.round(cen, 3)}, lid line z {zc:.3f}, verts {int(sel.sum())}')
kbl.data.foreach_set('co', bco.ravel())

# ------------------------------------------------------------------ pose API (world-axis authoring)
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
RQ = {b.name: b.matrix_local.to_quaternion() for b in arm_d.bones}
RM = {b.name: b.matrix_local.to_3x3() for b in arm_d.bones}
BONES = [b.name for b in arm_d.bones]


def wq(roll=0.0, pitch_up=0.0, yaw_l=0.0):
    """World-axis rotation: roll about +X (forward), pitch_up raises the +X tip, yaw_l swings +X toward +Y."""
    return (Quaternion((0, 0, 1), math.radians(yaw_l)) @ Quaternion((0, 1, 0), math.radians(-pitch_up))
            @ Quaternion((1, 0, 0), math.radians(roll)))


HEAD_BACK = float(os.environ.get('HEAD_BACK', 20))
VIEW_HEAD_YAW = {'front': 0.0, 'back': -HEAD_BACK}   # extra head yaw per view (negative swings the snout toward -Y, the camera side)
head_yaw = 0.0


def apply_pose(P):
    """P: {bone: dict(r=(roll,pitch_up,yaw_l), l=(x,y,z) world, s=float|(sa,sy,sa))}; 'blink': 0..1.
    The global head_yaw (set per view) is added to the head's yaw."""
    for nm in BONES:
        pb = arm.pose.bones[nm]; p = P.get(nm, {})
        r = p.get('r', (0, 0, 0))
        if nm == 'head':
            r = (r[0], r[1], r[2] + head_yaw)
        q = wq(*r)
        pb.rotation_quaternion = RQ[nm].inverted() @ q @ RQ[nm]
        pb.location = RM[nm].inverted() @ Vector(p.get('l', (0, 0, 0)))
        s = p.get('s', 1.0)
        if isinstance(s, (int, float)):   # volume-keeping stretch along the bone's own axis
            pb.scale = (1 / math.sqrt(s), s, 1 / math.sqrt(s))
        else:
            pb.scale = s
    o.data.shape_keys.key_blocks['blink'].value = P.get('blink', 0.0)


def lerp(a, b, t):
    if isinstance(a, (tuple, list)):
        return tuple(lerp(u, v, t) for u, v in zip(a, b))
    return a + (b - a) * t


def blend(A, B, t):
    out = {}
    for k in set(A) | set(B):
        if k == 'blink':
            out[k] = lerp(A.get(k, 0.0), B.get(k, 0.0), t); continue
        a, b = A.get(k, {}), B.get(k, {})
        d = {}
        for ch, dv in (('r', (0, 0, 0)), ('l', (0, 0, 0)), ('s', 1.0)):
            va, vb = a.get(ch, dv), b.get(ch, dv)
            if isinstance(va, (int, float)) != isinstance(vb, (int, float)):
                va = (1 / math.sqrt(va), va, 1 / math.sqrt(va)) if isinstance(va, (int, float)) else va
                vb = (1 / math.sqrt(vb), vb, 1 / math.sqrt(vb)) if isinstance(vb, (int, float)) else vb
            d[ch] = lerp(va, vb, t)
        out[k] = d
    return out


def ease(t, kind='io'):
    if kind == 'lin':
        return t
    if kind == 'in':
        return t * t
    if kind == 'out':
        return 1 - (1 - t) ** 2
    return t * t * (3 - 2 * t)


def keyed(keys, nframes, kinds=None):
    """keys: {frame: pose}. In-between frames interpolate (ease per segment, default in-out)."""
    fr = sorted(keys)
    out = []
    for f in range(nframes):
        if f in keys:
            out.append(keys[f]); continue
        i = max(k for k in fr if k < f); j = min(k for k in fr if k > f)
        t = (f - i) / (j - i)
        out.append(blend(keys[i], keys[j], ease(t, (kinds or {}).get(i, 'io'))))
    return out


def legs(rot=None, loc=(0, 0, 0), front=None, back=None):
    d = {}
    for nm in LEGS:
        r = (front if nm.startswith('leg_f') else back) or rot or (0, 0, 0)
        d[nm] = dict(r=r, l=loc)
    return d


# ------------------------------------------------------------------ clips (12 fps)
def clip_idle():
    """12-frame loop: breath (chest swells, body lifts 1 %), head nods with the breath one frame late,
    tail sways with follow-through down the chain, left ear flicks on frames 7-9. Paws never move."""
    out = []
    for f in range(12):
        ph = 2 * math.pi * f / 12
        br = 0.5 - 0.5 * math.cos(ph)                       # 0 exhale .. 1 inhale (frame 6)
        br1 = 0.5 - 0.5 * math.cos(ph - 2 * math.pi / 12)
        sw = lambda lag: math.sin(ph - lag * 2 * math.pi / 12)
        eflick = {7: 1.0, 8: 0.55, 9: 0.15}.get(f, 0.0)
        out.append({
            'cog': dict(l=(0, 0, 0.010 * br)),
            'chest': dict(s=(1 + 0.022 * br, 1 + 0.010 * br, 1 + 0.022 * br)),
            'head': dict(r=(0, 2.2 * br1 - 1.0, 0)),
            'ear.L': dict(r=(-14 * eflick, -10 * eflick, 0)),
            'ear.R': dict(r=(0, 1.5 * br1, 0)),
            'tail1': dict(r=(0, 0, 9 * sw(0))),
            'tail2': dict(r=(0, 0, 9 * sw(1))),
            'tail3': dict(r=(0, 0, 10 * sw(2))),
        })
    return out


REST = {}


def clip_attack():
    """Pounce, 14 frames: 0 rest | 1-3 anticipation crouch (weight back, ears pinned, tail up) | 4 launch
    (stretch 1.12 along the leap) | 5 airborne reach | 6-7 contact squash, held one frame | 8 rebound hop |
    9-10 land back | 11-13 settle with a small overshoot."""
    # a deep crouch (body low, head pushed down toward the target) so the anticipation reads from above
    # and behind as well as from the front
    crouch = {'cog': dict(l=(-0.09, 0, -0.11), s=(1.08, 0.85, 1.08)), 'body': dict(r=(0, 6, 0)),
              'chest': dict(r=(0, -10, 0)), 'head': dict(r=(0, -9, 0)),
              'ear.L': dict(r=(0, -24, 0)), 'ear.R': dict(r=(0, -24, 0)),
              'tail1': dict(r=(0, 14, 0)), 'tail2': dict(r=(0, 10, 0)), 'tail3': dict(r=(0, 6, 0)),
              **legs(front=(0, -6, 0), back=(0, 4, 0))}
    # launch: hind paws still on the ground pushing off (legs stay planted at the top, swing back, lengthen
    # 8 %), front paws already lifting; the stretch runs along the leap and the head leads, eyes on the target.
    launch = {'cog': dict(l=(0.13, 0, 0.05)), 'stretch': dict(s=1.12), 'body': dict(r=(0, 3, 0)),
              'chest': dict(r=(0, 1, 0)), 'head': dict(r=(0, -5, 0)),
              'ear.L': dict(r=(0, -30, 0)), 'ear.R': dict(r=(0, -30, 0)),
              'tail1': dict(r=(0, -16, 0)), 'tail2': dict(r=(0, -10, 0)), 'tail3': dict(r=(0, -6, 0)),
              'leg_f.L': dict(r=(0, 30, 0), l=(0.16, 0, 0.09)), 'leg_f.R': dict(r=(0, 26, 0), l=(0.16, 0, 0.09)),
              'leg_b.L': dict(r=(0, -24, 0), l=(0.11, 0, 0.03), s=1.08), 'leg_b.R': dict(r=(0, -21, 0), l=(0.11, 0, 0.03), s=1.08)}
    air = {'cog': dict(l=(0.30, 0, 0.13)), 'stretch': dict(s=1.06), 'body': dict(r=(0, -2, 0)),
           'chest': dict(r=(0, -2, 0)), 'head': dict(r=(0, -4, 0)),
           'ear.L': dict(r=(0, -12, 0)), 'ear.R': dict(r=(0, -12, 0)),
           'tail1': dict(r=(0, -8, 0)), 'tail2': dict(r=(0, -14, 0)), 'tail3': dict(r=(0, -10, 0)),
           'leg_f.L': dict(r=(0, 40, 0), l=(0.31, 0, 0.17)), 'leg_f.R': dict(r=(0, 34, 0), l=(0.31, 0, 0.17)),
           'leg_b.L': dict(r=(0, -30, 0), l=(0.29, 0, 0.12)), 'leg_b.R': dict(r=(0, -26, 0), l=(0.29, 0, 0.12))}
    contact = {'cog': dict(l=(0.36, 0, -0.02), s=(1.07, 0.88, 1.07)), 'body': dict(r=(0, -7, 0)),
               'chest': dict(r=(0, -5, 0)), 'head': dict(r=(0, 6, 0)),
               'ear.L': dict(r=(0, 12, 0)), 'ear.R': dict(r=(0, 12, 0)),
               'tail1': dict(r=(0, 12, 0)), 'tail2': dict(r=(0, 6, 0)), 'tail3': dict(r=(0, -8, 0)),
               'leg_f.L': dict(r=(0, 12, 0), l=(0.36, 0, 0.0)), 'leg_f.R': dict(r=(0, 10, 0), l=(0.36, 0, 0.0)),
               'leg_b.L': dict(r=(0, -8, 0), l=(0.34, 0, 0.0)), 'leg_b.R': dict(r=(0, -8, 0), l=(0.34, 0, 0.0))}
    contact2 = blend(contact, {**contact, 'cog': dict(l=(0.36, 0, -0.015), s=(1.05, 0.91, 1.05)),
                               'tail3': dict(r=(0, 6, 0))}, 1.0)
    hop = {'cog': dict(l=(0.22, 0, 0.07)), 'body': dict(r=(0, 6, 0)), 'head': dict(r=(0, 2, 0)),
           'ear.L': dict(r=(0, -6, 0)), 'ear.R': dict(r=(0, -6, 0)),
           'tail1': dict(r=(0, 6, 0)), 'tail2': dict(r=(0, 10, 0)), 'tail3': dict(r=(0, 8, 0)),
           'leg_f.L': dict(r=(0, 18, 0), l=(0.24, 0, 0.08)), 'leg_f.R': dict(r=(0, 16, 0), l=(0.24, 0, 0.08)),
           'leg_b.L': dict(r=(0, -10, 0), l=(0.20, 0, 0.07)), 'leg_b.R': dict(r=(0, -10, 0), l=(0.20, 0, 0.07))}
    land = {'cog': dict(l=(0.02, 0, -0.03), s=(1.04, 0.94, 1.04)), 'body': dict(r=(0, 2, 0)),
            'head': dict(r=(0, -3, 0)), 'ear.L': dict(r=(0, 8, 0)), 'ear.R': dict(r=(0, 8, 0)),
            'tail1': dict(r=(0, -4, 0)), 'tail2': dict(r=(0, -8, 0)), 'tail3': dict(r=(0, -6, 0))}
    over = {'cog': dict(l=(0, 0, 0.008), s=(0.99, 1.02, 0.99)), 'head': dict(r=(0, 1.5, 0)),
            'ear.L': dict(r=(0, -4, 0)), 'ear.R': dict(r=(0, -4, 0)), 'tail2': dict(r=(0, 4, 0)), 'tail3': dict(r=(0, 4, 0))}
    keys = {0: REST, 3: crouch, 4: launch, 5: air, 6: contact, 7: contact2, 8: hop, 10: land, 12: over, 13: REST}
    return keyed(keys, 14, kinds={0: 'out', 8: 'in'})


def clip_hit():
    """6 frames: 1 = the one strong recoil (head snaps back and away, body shoved back + squashed,
    eyes squeezed, ears pinned, tail whips forward) | 2 hold at 80 % | 3-4 rebound past rest | 5 rest."""
    recoil = {'cog': dict(l=(-0.10, 0, 0.0), s=(1.05, 0.92, 1.05)), 'body': dict(r=(4, 6, 0)),
              'chest': dict(r=(0, 4, 0)), 'head': dict(r=(-6, 16, 8)),
              'ear.L': dict(r=(-10, -30, 0)), 'ear.R': dict(r=(10, -30, 0)),
              'tail1': dict(r=(0, -12, 0)), 'tail2': dict(r=(0, -16, 0)), 'tail3': dict(r=(0, -10, 0)),
              **legs(front=(0, 8, 0), back=(0, -4, 0)), 'blink': 0.7}
    hold = blend(REST, recoil, 0.8); hold['blink'] = 0.55
    hold['tail3'] = dict(r=(0, -18, 0))
    reb = {'cog': dict(l=(0.02, 0, 0), s=(0.98, 1.03, 0.98)), 'head': dict(r=(0, -4, -2)),
           'ear.L': dict(r=(0, 8, 0)), 'ear.R': dict(r=(0, 8, 0)), 'tail2': dict(r=(0, 8, 0)), 'tail3': dict(r=(0, 10, 0))}
    keys = {0: REST, 1: recoil, 2: hold, 3: reb, 4: blend(REST, reb, 0.3), 5: REST}
    return keyed(keys, 6)


def clip_faint():
    """10 frames: 1 hurt flinch | 2-3 wobble (sway away, then back) | 4-6 legs give way, body sinks and
    rolls a little away from camera, head droops | 7-9 flat on the ground, eyes shut, ears and tail limp."""
    flinch = {'cog': dict(l=(-0.04, 0, 0.02), s=(0.97, 1.04, 0.97)), 'head': dict(r=(0, 10, 4)),
              'ear.L': dict(r=(0, -20, 0)), 'ear.R': dict(r=(0, -20, 0)), 'tail2': dict(r=(0, -8, 0)), 'blink': 0.5}
    sway1 = {'cog': dict(l=(-0.03, 0.02, 0.0)), 'body': dict(r=(7, 0, 0)), 'head': dict(r=(9, -4, 0)),
             'ear.L': dict(r=(10, -10, 0)), 'ear.R': dict(r=(10, -10, 0)),
             'tail1': dict(r=(0, -6, 6)), 'tail2': dict(r=(0, -8, 8)), 'blink': 0.35}
    sway2 = {'cog': dict(l=(-0.02, -0.02, -0.02)), 'body': dict(r=(-5, -2, 0)), 'head': dict(r=(-6, -8, 0)),
             'ear.L': dict(r=(-10, -14, 0)), 'ear.R': dict(r=(-10, -14, 0)),
             'tail1': dict(r=(0, -10, -4)), 'tail2': dict(r=(0, -12, -6)), 'blink': 0.45}
    buckle = {'cog': dict(l=(0.0, 0, -0.10), s=(1.04, 0.90, 1.04)), 'body': dict(r=(6, -4, 0)),
              'chest': dict(r=(0, -4, 0)), 'head': dict(r=(4, -14, 0)),
              'ear.L': dict(r=(8, -20, 0)), 'ear.R': dict(r=(-8, -20, 0)),
              'tail1': dict(r=(0, -18, 0)), 'tail2': dict(r=(0, -20, 0)), 'tail3': dict(r=(0, -10, 0)),
              **legs(front=(0, 30, 0), back=(0, -30, 0)), 'blink': 0.8}
    down = {'cog': dict(l=(0.0, 0, -0.16), s=(1.05, 0.88, 1.05)), 'body': dict(r=(10, -3, 0)),
            'chest': dict(r=(0, -6, 0)), 'head': dict(r=(8, -20, -4)),
            'ear.L': dict(r=(12, -26, 0)), 'ear.R': dict(r=(-10, -26, 0)),
            'tail1': dict(r=(0, -34, 0)), 'tail2': dict(r=(0, -34, 0)), 'tail3': dict(r=(0, -18, 0)),
            # legs fold flat; lowered only as far as keeps the paws ON the ground plane (was -0.04: a 2 px sink)
            'leg_f.L': dict(r=(0, 62, 0), l=(0, 0, -0.031)), 'leg_f.R': dict(r=(0, 62, 0), l=(0, 0, -0.031)),
            'leg_b.L': dict(r=(0, -62, 0), l=(0, 0, -0.031)), 'leg_b.R': dict(r=(0, -62, 0), l=(0, 0, -0.031)), 'blink': 1.0}
    settle = blend(down, {**down, 'cog': dict(l=(0.0, 0, -0.164), s=(1.06, 0.87, 1.06)),
                          'head': dict(r=(8, -22, -4))}, 1.0)
    keys = {0: REST, 1: flinch, 2: sway1, 3: sway2, 5: buckle, 7: down, 8: settle, 9: settle}
    return keyed(keys, 10, kinds={5: 'in'})


CLIPS = {'idle': clip_idle(), 'attack': clip_attack(), 'hit': clip_hit(), 'faint': clip_faint()}
ROOT_MOTION = {k: [tuple(p.get('cog', {}).get('l', (0, 0, 0))) for p in v] for k, v in CLIPS.items()}

# ------------------------------------------------------------------ evaluation helpers
dg = bpy.context.evaluated_depsgraph_get()


def eval_pts():
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg); m = ev.to_mesh()
    p = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('co', p); p = p.reshape(-1, 3)
    M = np.array(o.matrix_world); ev.to_mesh_clear()
    return p @ M[:3, :3].T + M[:3, 3]


paw_m = co0[:, 2] < 0.03
pts_cache = {}
checks = {}
for cn, poses in CLIPS.items():
    for f, P in enumerate(poses):
        apply_pose(P)
        pts_cache[(cn, f)] = eval_pts()
rest = pts_cache[('idle', 0)]
# idle: planted paws (soles must not move) ; all clips: eye drift relative to the head bone
for cn in CLIPS:
    drift = []
    for f in range(len(CLIPS[cn])):
        p = pts_cache[(cn, f)]
        drift.append(float(np.abs(p[paw_m] - rest[paw_m]).max()))
    checks[cn] = dict(sole_max_move=max(drift), zmin=[round(float(pts_cache[(cn, f)][:, 2].min()), 4) for f in range(len(CLIPS[cn]))])
print('checks', json.dumps(checks))

# ------------------------------------------------------------------ cameras / framing (one camera per view, shared by all clips)
VIEWS = {'front': (35.0, 12.0), 'back': (float(os.environ.get('YAW_BACK', -12)), float(os.environ.get('ELEV_BACK', 30)))}
ANCHOR_W = np.array(((0.25 + HIND_X) / 2 + 0.06, 0.0, 0.0))   # middle of the four paws (toes forward 0.06)
restH = {}
CAM = {}
for vn, (yaw, elev) in VIEWS.items():
    head_yaw = VIEW_HEAD_YAW[vn]
    if head_yaw:   # frame this view on its own head turn
        vc = {}
        for cn, poses in CLIPS.items():
            for f, P in enumerate(poses):
                apply_pose(P); vc[(cn, f)] = eval_pts()
    else:
        vc = pts_cache
    allp = np.vstack([v[::7] for v in vc.values()]); rest = vc[('idle', 0)]
    d, rot, right, up = camera_basis(yaw, elev)
    R, U = np.array(right), np.array(up)
    xs, ys = allp @ R, allp @ U
    rx, ry = rest @ R, rest @ U
    ortho = max((ys.max() - ys.min()) / 0.92, (xs.max() - xs.min()) / 0.92)
    px = SIZE / ortho
    # union box centred; anchor snapped to a whole pixel
    cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
    ax = (ANCHOR_W @ R - cx) * px + SIZE / 2; ay = SIZE / 2 - (ANCHOR_W @ U - cy) * px
    cx += (ax - round(ax)) / px; cy -= (ay - round(ay)) / px
    anchor = (int(round(ax)), int(round(ay)))
    CAM[vn] = dict(yaw=yaw, elev=elev, ortho=ortho, center=(right * cx + up * cy), d=d, rot=rot, right=right, up=up,
                   anchor=anchor, px_per_unit=px, rest_h_px=(ry.max() - ry.min()) * px)
    print(f'view {vn}: ortho {ortho:.3f}, {px:.1f} px/unit, rest creature {CAM[vn]["rest_h_px"]:.0f} px tall, anchor {anchor}')

cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.clip_end = 100
cam = link(bpy.data.objects.new('cam', cd)); sc.camera = cam


def set_view(vn):
    global head_yaw
    head_yaw = VIEW_HEAD_YAW[vn]
    c = CAM[vn]
    cd.ortho_scale = c['ortho']
    cam.location = c['center'] + c['d'] * 30
    cam.rotation_euler = c['rot'].to_euler()
    set_light_dir((-0.55 * c['right'] + 0.72 * c['up'] + 0.42 * c['d']).normalized())
    k = c['rest_h_px'] / 820.0                     # D: 6 px outer / 3.2 px inner on an 820 px creature
    fs = sc.view_layers[0].freestyle_settings
    for ls in fs.linesets:
        base = 6.0 if ls.name == 'outer' else 3.2
        st = ls.linestyle; st.thickness = base * k
        for m in st.thickness_modifiers:
            if m.type == 'CALLIGRAPHY':
                m.thickness_min = base * k * 0.7; m.thickness_max = base * k * 1.25


sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.resolution_percentage = 100
sc.cycles.samples = SPP
sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
sc.cycles.use_adaptive_sampling = False
sc.render.fps = FPS
try:
    sc.render.threads_mode = 'FIXED'; sc.render.threads = 4
except Exception:
    pass

OUTF = os.environ.get('OUT', os.path.join(PRE, 'frames'))
meta = dict(fps=FPS, size=SIZE, spp=SPP, views={}, clips={k: len(v) for k, v in CLIPS.items()}, checks=checks, timing={})
for vn, c in CAM.items():
    meta['views'][vn] = dict(yaw=c['yaw'], elev=c['elev'], ortho=c['ortho'], anchor=c['anchor'], px_per_unit=c['px_per_unit'],
                             rest_h_px=c['rest_h_px'],
                             root_px={cn: [[round(float(np.dot(np.array(l), np.array(c['right'])) * c['px_per_unit']), 2),
                                            round(float(-np.dot(np.array(l), np.array(c['up'])) * c['px_per_unit']), 2)] for l in ROOT_MOTION[cn]]
                                      for cn in CLIPS})
os.makedirs(OUTF, exist_ok=True)
sel_v = os.environ.get('VIEWS', 'front,back').split(',')
sel_c = os.environ.get('CLIPS', 'idle,attack,hit,faint').split(',')
sel_f = os.environ.get('FRAMES')
if not os.environ.get('DRY'):
    for vn in sel_v:
        set_view(vn)
        for cn in sel_c:
            frames = range(len(CLIPS[cn])) if not sel_f else [int(v) for v in sel_f.split(',') if int(v) < len(CLIPS[cn])]
            for f in frames:
                apply_pose(CLIPS[cn][f])
                bpy.context.view_layer.update()
                path = os.path.join(OUTF, vn, cn, f'{f:02d}.png')
                os.makedirs(os.path.dirname(path), exist_ok=True)
                sc.render.filepath = path
                t = time.perf_counter()
                bpy.ops.render.render(write_still=True)
                dt = time.perf_counter() - t
                meta['timing'][f'{vn}/{cn}/{f:02d}'] = round(dt, 2)
                print(f'  {vn}/{cn}/{f:02d}: {dt:.1f}s', flush=True)
mp = os.path.join(OUTF, 'meta.json')
if os.path.exists(mp) and sel_f:
    old = json.load(open(mp)); old['timing'].update(meta['timing']); meta['timing'] = old['timing']
json.dump(meta, open(mp, 'w'), indent=1, default=lambda v: list(v))
head_yaw = 0.0
apply_pose(REST)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PRE, 'ashkit_rig.blend'), compress=True)
print(f'ANIM total {time.perf_counter() - T0:.1f}s')
