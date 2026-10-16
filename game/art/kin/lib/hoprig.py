"""hoprig - the rig, weights and run for a round, hopping kin from a short spec (clips: hop.py).

root -> cog (ground pivot) -> stretch (leap axis) -> body (deforms everything not claimed by an appendage); the
appendages hang from body (tip2 from tip1). The kin's 'battle' shape key (its model.py turns the whole body toward
the camera) is baked first. The back view's extra yaw turns 'body' (there is no separate head). Usage:

    from hoprig import run_hop
    run_hop(SPEC, HERE)

SPEC keys (world units, +X forward, +Z up, before the battle turn): name, blend, turn (deg, as model.py), height (rest height: sets the cog and leap bones),
apps=[dict(bone, head, tail, parent='body', radius, falloff=0.6, slots=None)] (capsule weights along head->tail;
slots: material names that belong fully to the bone), eye_centre, scale (motion), head_back=20, anchor=(x, y, 0).
"""
import os, math
import numpy as np
from sheetkit import Kit, sm
from common import vertex_slot_mask
from mathutils import Vector
from hop import build as hop_clips


def capsule_dist(co, a, b):
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    t = np.clip(((co - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(co - (a + t[:, None] * ab), axis=1), t


def run_hop(S, here):
    kit = Kit(os.path.join(here, S['blend']), S['name'])
    kit.yaw_bone = 'body'
    o = kit.o; co0 = kit.co0; n = len(co0)
    kit.bake_shape_key('battle')
    h = S['height']
    LAUNCH = Vector((math.cos(math.radians(40)), 0, math.sin(math.radians(40))))
    C = Vector((0, 0, h * 0.45))
    kit.begin_bones()
    bone = kit.bone
    bone('root', (0, 0, 0), (0.3, 0, 0), deform=False)
    bone('cog', (0, 0, 0), (0, 0, h * 0.5), 'root', deform=False)
    bone('stretch', C, C + LAUNCH * h * 0.4, 'cog', deform=False)
    bone('body', C, C + Vector((0, 0, h * 0.4)), 'stretch')
    ta = math.radians(-S.get('turn', 0.0))     # the battle key turned the whole body: turn the bones with it

    def turned(p):
        return (p[0] * math.cos(ta) - p[1] * math.sin(ta), p[0] * math.sin(ta) + p[1] * math.cos(ta), p[2])
    for a in S.get('apps', []):
        bone(a['bone'], turned(a['head']), turned(a['tail']), a.get('parent', 'body'))
    kit.end_bones()

    W = {}
    claimed = np.zeros(n)
    for a in S.get('apps', []):
        d, t = capsule_dist(co0, a['head'], a['tail'])
        r = a['radius']
        w = sm(r, r * a.get('falloff', 0.6), d) * sm(0.0, a.get('root_fade', 0.2), t)
        if a.get('slots'):
            w = np.maximum(w, vertex_slot_mask(o, set(a['slots'])).astype(float))
        w = np.minimum(w, 1 - claimed)
        W[a['bone']] = w; claimed += w
    W['body'] = np.clip(1 - claimed, 0, 1)
    kit.set_weights(W)
    kit.add_blink(head_centre=S['eye_centre'])

    CLIPS, TRAVEL, REST = hop_clips(scale=float(os.environ.get('MOTION_SCALE', S.get('scale', 1.0))))
    head_back = float(os.environ.get('HEAD_BACK', S.get('head_back', 20)))
    VIEWS = {'front': dict(yaw=35.0, elev=12.0),
             'back': dict(yaw=float(os.environ.get('YAW_BACK', -12)), elev=float(os.environ.get('ELEV_BACK', 30)), head_yaw=-head_back)}
    return kit.run(CLIPS, VIEWS, S.get('anchor', (0.0, 0.0, 0.0)), ground_mask=co0[:, 2] < 0.03,
                   rig_out=os.path.join(here, f"{S['name']}_rig.blend"), rest_pose=REST, travel=TRAVEL, ground_lock=True)
