"""serpentrig - the rig, weights and run for a coiled serpent from its centre line (clips: serpent.py).

root -> cog (ground pivot) -> coil (the body on the floor) -> tail (the fluke rising from the centre) and n1 -> n2 ->
n3 -> n4 (the neck, equal arclength) -> head. Every vertex is weighted by where it sits along the centre line (the
arclength of its nearest point), with a smooth hand-over at each joint, so parts (fins, frills, barbels) follow the
stretch of body they sit on. The kin's 'battle' shape key (the whole body turned toward the camera) is baked first and
the bones are turned with it. Usage:

    from serpentrig import run_serpent
    run_serpent(SPEC, HERE)

SPEC keys (world units, +X forward, +Z up, before the battle turn): name, blend, turn (deg, as model.py),
path=(points, i_coil, i_neck, i_head) as shape.path() returns, head_c (the head's centre, for the blink), blend_w
(the hand-over half-width along the line), eye_slots, scale (motion), faint_down (deg, the neck base's fall in the faint), head_back=20, anchor=(x, y, 0).
"""
import os, math
import numpy as np
from sheetkit import Kit, sm
from mathutils import Vector
from mathutils.kdtree import KDTree
from serpent import build as serpent_clips


def run_serpent(S, here):
    kit = Kit(os.path.join(here, S['blend']), S['name'])
    o = kit.o; co0 = kit.co0; n = len(co0)
    kit.bake_shape_key('battle')
    pts, i_coil, i_neck, i_head = S['path']
    P = np.array([p for p, r in pts], float)

    # a dense centre line with arclength
    dense, sv = [P[0]], [0.0]
    for a, b in zip(P, P[1:]):
        for j in range(1, 9):
            q = a + (b - a) * j / 8
            sv.append(sv[-1] + float(np.linalg.norm(q - dense[-1]))); dense.append(q)
    dense = np.array(dense); sv = np.array(sv)
    s_at = lambda i: sv[i * 8]                     # arclength of path point i
    kd = KDTree(len(dense))
    for i, q in enumerate(dense):
        kd.insert(Vector(q), i)
    kd.balance()
    sv_v = np.array([sv[kd.find(Vector(c))[1]] for c in co0])

    def at(s):
        j = int(np.clip(np.searchsorted(sv, s), 1, len(sv) - 1))
        t = (s - sv[j - 1]) / max(1e-9, sv[j] - sv[j - 1])
        return dense[j - 1] + (dense[j] - dense[j - 1]) * t

    ta = math.radians(-S.get('turn', 0.0))

    def turned(p):
        return (p[0] * math.cos(ta) - p[1] * math.sin(ta), p[0] * math.sin(ta) + p[1] * math.cos(ta), p[2])

    s_coil, s_neck, s_head, s_end = s_at(i_coil), s_at(i_neck), s_at(i_head), sv[-1]
    knots = [s_neck + (s_head - s_neck) * j / 4 for j in range(5)]
    kit.begin_bones()
    bone = kit.bone
    bone('root', (0, 0, 0), (0.3, 0, 0), deform=False)
    bone('cog', (0, 0, 0), (0, 0, 0.5), 'root', deform=False)
    bone('coil', turned(at(s_neck - 0.3)), turned(at(s_neck)), 'cog')
    bone('tail', turned(at(s_coil)), turned(P[0]), 'coil')
    parent = 'coil'
    for j, nm in enumerate(('n1', 'n2', 'n3', 'n4')):
        bone(nm, turned(at(knots[j])), turned(at(knots[j + 1])), parent); parent = nm
    tip = P[-1] + (P[-1] - P[-2]) / max(1e-9, np.linalg.norm(P[-1] - P[-2])) * 0.08
    bone('head', turned(at(s_head)), turned(tip), 'n4')
    kit.end_bones()

    # ---------------------------------------------------------------- weights by arclength, smooth hand-overs
    w = S.get('blend_w', 0.06)
    edges = [s_coil, s_neck] + knots[1:4] + [s_head]          # tail | coil | n1 | n2 | n3 | n4 | head
    names = ['tail', 'coil', 'n1', 'n2', 'n3', 'n4', 'head']
    W = {}
    for j, nm in enumerate(names):
        rise = np.ones(n) if j == 0 else sm(edges[j - 1] - w, edges[j - 1] + w, sv_v)
        fall = np.ones(n) if j == len(names) - 1 else 1 - sm(edges[j] - w, edges[j] + w, sv_v)
        W[nm] = rise * fall
    kit.set_weights(W)
    kit.add_blink(head_centre=S['head_c'], eye_slots=S.get('eye_slots', ('eye',)))

    CLIPS, TRAVEL, REST = serpent_clips(scale=float(os.environ.get('MOTION_SCALE', S.get('scale', 1.0))), down=S.get('faint_down', -76.0))
    head_back = float(os.environ.get('HEAD_BACK', S.get('head_back', 20)))
    VIEWS = {'front': dict(yaw=35.0, elev=12.0),
             'back': dict(yaw=float(os.environ.get('YAW_BACK', -12)), elev=float(os.environ.get('ELEV_BACK', 30)), head_yaw=-head_back)}
    return kit.run(CLIPS, VIEWS, S.get('anchor', (0.15, 0.0, 0.0)), ground_mask=co0[:, 2] < 0.03,
                   rig_out=os.path.join(here, f"{S['name']}_rig.blend"), rest_pose=REST, travel=TRAVEL)
