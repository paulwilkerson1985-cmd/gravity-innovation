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
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
PRE = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(PRE, '..', 'kin', 'lib'))   # sheetkit, common
import numpy as np
from sheetkit import Kit, sm, blend, keyed          # imports bpy first (mathutils needs it)
from common import vertex_slot_mask
from mathutils import Vector, Euler

kit = Kit(os.path.join(PRE, 'ashkit_final.blend'), 'ashkit')
o = kit.o
co0 = kit.co0                                               # symmetric basis
n = len(co0)

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


co = kit.bake_shape_key('battle')

# ------------------------------------------------------------------ armature
EAR = dict(c=(0.30, 0.34, 1.70), s=(0.13, 0.30, 0.50), rx=-26, ry=-10)


def ear_R(s):
    return np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())


HIND_X = -0.40   # as ashkit_v2.py (hind legs under the hips)
LEGS = {'leg_f.L': (0.25, 0.26), 'leg_f.R': (0.25, -0.26), 'leg_b.L': (HIND_X, 0.27), 'leg_b.R': (HIND_X, -0.27)}
kit.begin_bones()
bone = kit.bone
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
kit.end_bones()

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
kit.set_weights(W)

# ------------------------------------------------------------------ blink shape key (eyes squeeze to a lid line)
kit.add_blink(head_centre=(0.40, 0.0, 1.16))

HEAD_BACK = float(os.environ.get('HEAD_BACK', 20))


from quad import build as quad_clips

CLIPS, TRAVEL, REST = quad_clips(LEGS, scale=1.0)
# One camera per view, shared by every clip. Back = your kin: -12 yaw, 30 elevation and the head turned a further
# HEAD_BACK degrees toward the camera (negative yaw swings the snout toward -Y, the camera side).
VIEWS = {'front': dict(yaw=35.0, elev=12.0),
         'back': dict(yaw=float(os.environ.get('YAW_BACK', -12)), elev=float(os.environ.get('ELEV_BACK', 30)), head_yaw=-HEAD_BACK)}
ANCHOR_W = ((0.25 + HIND_X) / 2 + 0.06, 0.0, 0.0)   # middle of the four paws (toes forward 0.06)
kit.run(CLIPS, VIEWS, ANCHOR_W, ground_mask=co0[:, 2] < 0.03, rig_out=os.path.join(PRE, 'ashkit_rig.blend'), rest_pose=REST,
        travel=TRAVEL, ground_snap={'faint': [7, 8, 9]}, ground_lift={'faint': [4, 5, 6], 'attack': list(range(1, 13)), 'hit': [1, 2, 3, 4]})
