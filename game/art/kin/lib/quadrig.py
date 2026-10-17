"""quadrig - the rig, weights and run for a four-legged kin from a short spec (Ashkit's rig layout).

root -> cog (ground pivot) -> stretch (launch axis) -> body -> hips (-> tail1 -> tail2 -> tail3),
chest (-> head -> ear.L / ear.R); the four legs hang from root so planted paws never slide; a 'blink' shape
key. The kin's 'battle' head-turn shape key (made by its model.py) is baked into the rest mesh first and the
head/ear bones are placed on the turned head. Clips: quad.py. Usage (see ../cindertail/anim.py):

    from quadrig import run_quad
    run_quad(SPEC, HERE)

SPEC keys (world units, +X forward, +Z up, the kin's rest model; ear and tail may be left out):
  name, blend, turn=(deg, lift_deg, pivot), head_zone=(z0, z1, x0, x1, zx0, zx1, xback0, xback1)
  ear=dict(c, rx, ry, w=(0.17, 0.31), axis=None (long axis; default the ellipsoid's local +Z: an upright ear)), legs=dict(front_x, hind_x, y, top, hind_lean=0.04, reach=0.24, ground_band=0 (z below it: nearest leg only), seg={leg: (top, foot, radius[, (slots, r)])} for legs that are not vertical; the optional claim makes those materials within r of the foot ride the leg rigidly), anchor=(x, y, z),
  body_c, hips=(head, tail), chest=(head, tail), head=(head, tail), tail=[p0, p1, p2, p3],
  tail_zone=(x0, x1, z0, z1, z2a, z2b, z3a, z3b), tail_axis='z' ('x': segment splits z2/z3 are -x values), tail_pitch=1.0 (multiplies the clips' tail pitch), faint_head=1.0 (multiplies the faint's head pitch), faint_front=1.0 (the same for the front legs' pitch), chest_split=(x0, x1), eye_centre, motion=dict(scale, faint_drop, faint_leg)
"""
import os, math
import numpy as np
from sheetkit import Kit, sm
from common import vertex_slot_mask
from mathutils import Vector, Euler
from quad import build as quad_clips


def run_quad(S, here):
    kit = Kit(os.path.join(here, S['blend']), S['name'])
    o = kit.o; co0 = kit.co0; n = len(co0)
    TURN, LIFT, PIV = S['turn'][0], S['turn'][1], np.asarray(S['turn'][2], float)
    hz = S['head_zone']

    def head_w(c):
        w = np.maximum(sm(hz[0], hz[1], c[:, 2]), sm(hz[2], hz[3], c[:, 0]) * sm(hz[4], hz[5], c[:, 2]))
        return w * sm(hz[6], hz[7], c[:, 0])

    def head_xform(p, w=1.0):
        p = np.atleast_2d(np.asarray(p, float)); w = np.broadcast_to(np.asarray(w, float), (len(p),))
        a = math.radians(-TURN) * w; b = math.radians(-LIFT) * w
        r = p - PIV
        x1 = r[:, 0] * np.cos(b) + r[:, 2] * np.sin(b); z1 = -r[:, 0] * np.sin(b) + r[:, 2] * np.cos(b); y1 = r[:, 1]
        x2 = x1 * np.cos(a) - y1 * np.sin(a); y2 = x1 * np.sin(a) + y1 * np.cos(a)
        return np.stack([x2, y2, z1], 1) + PIV

    kit.bake_shape_key('battle')

    EAR = S.get('ear'); ew = EAR.get('w', (0.17, 0.31)) if EAR else None

    def ear_R(s):
        return np.array(Euler([math.radians(a) for a in (EAR['rx'] * s, EAR['ry'], 0)], 'XYZ').to_matrix())

    L = S['legs']
    LEGS = {'leg_f.L': (L['front_x'], L['y']), 'leg_f.R': (L['front_x'], -L['y']),
            'leg_b.L': (L['hind_x'], L['y']), 'leg_b.R': (L['hind_x'], -L['y'])}
    SEG = L.get('seg', {})     # legs given as 3-D segments (top, foot, radius[, claim]): arms reaching down to knuckles
    for nm, sg in SEG.items():
        LEGS[nm] = (sg[1][0], sg[1][1])
    lean = L.get('hind_lean', 0.04)
    kit.begin_bones()
    bone = kit.bone
    LAUNCH = Vector((math.cos(math.radians(28)), 0, math.sin(math.radians(28))))
    BODYC = Vector(S['body_c'])
    reach = 0.4 * S['motion'].get('scale', 1.0)
    bone('root', (0, 0, 0), (0.3, 0, 0), deform=False)
    bone('cog', (BODYC.x, 0, 0), (BODYC.x, 0, 0.5), 'root', deform=False)
    bone('stretch', BODYC, BODYC + LAUNCH * reach, 'cog', deform=False)
    bone('body', BODYC, BODYC + Vector((reach, 0, 0)), 'stretch', deform=False)
    bone('hips', *S['hips'], 'body')
    bone('chest', *S['chest'], 'body')
    hh = head_xform(list(S['head']))
    bone('head', hh[0], hh[1], 'chest')
    for s, side in (((1, 'L'), (-1, 'R')) if EAR else ()):
        R = ear_R(s); c = np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))
        ax = np.array(EAR['axis']) * np.array((1, s, 1)) if 'axis' in EAR else R @ np.array((0, 0, 1.0))   # the ear's long axis
        p = head_xform([c - ax * 0.12, c + ax * 0.46])
        bone(f'ear.{side}', p[0], p[1], 'head')
    for nm, (x, y) in LEGS.items():
        if nm in SEG:
            bone(nm, SEG[nm][0], SEG[nm][1], 'root')
        else:
            bone(nm, (x + (lean if x < 0 else 0.0), y, L['top']), (x + 0.02, y, 0.04), 'root')
    T = S.get('tail')
    if T:
        bone('tail1', T[0], T[1], 'hips'); bone('tail2', T[1], T[2], 'tail1'); bone('tail3', T[2], T[3], 'tail2')
    kit.end_bones()

    # ---------------------------------------------------------------- procedural weights (symmetric basis)
    x, y, z = co0[:, 0], co0[:, 1], co0[:, 2]
    W = {}
    Lsum = np.zeros(n)
    for nm, (lx, ly) in LEGS.items():
        if nm in SEG:
            a, b, r = (np.asarray(SEG[nm][0], float), np.asarray(SEG[nm][1], float), SEG[nm][2])
            ab = b - a; t = np.clip(((co0 - a) @ ab) / (ab @ ab), 0, 1)
            d = np.linalg.norm(co0 - (a + t[:, None] * ab), axis=1)
            W[nm] = sm(0.0, 0.25, t) * sm(r, r * 0.66, d)     # fades in below the shoulder
            if len(SEG[nm]) > 3:   # claim=(slots, radius): those parts near the foot ride the leg rigidly (a boulder fist must not shear)
                slots, cr = SEG[nm][3]
                W[nm] = np.maximum(W[nm], (vertex_slot_mask(o, set(slots)) & (np.linalg.norm(co0 - b, axis=1) < cr)).astype(float))
        else:
            cx = lx + (0.0 if lx < 0 else 0.04)
            d = np.sqrt(((x - cx) / 1.35) ** 2 + (y - ly) ** 2)
            W[nm] = sm(L['top'], L['top'] - 0.26, z) * sm(L.get('reach', 0.24), L.get('reach', 0.24) * 0.66, d)
        Lsum += W[nm]
    band = L.get('ground_band', 0.0)
    if band:   # everything near the ground (paws, claws) belongs fully to its nearest leg
        names = list(LEGS)
        dist = np.stack([np.hypot(x - (LEGS[nm][0] + (0.0 if LEGS[nm][0] < 0 else 0.04)), y - LEGS[nm][1]) for nm in names], 1)
        near = np.argmin(dist, 1)
        low = z < band
        for j, nm in enumerate(names):
            W[nm][low] = (near[low] == j).astype(float)
        Lsum = sum(W[nm] for nm in names)
    over = np.maximum(Lsum, 1.0)
    for nm in LEGS:
        W[nm] /= over
    Lsum = np.minimum(Lsum, 1.0)
    rem = 1 - Lsum
    H = head_w(co0) * rem
    tz = S.get('tail_zone') or (-99, -99.1, 0, 0.1, 0, 0.1, 0, 0.1)
    emb = vertex_slot_mask(o, {'ember', 'ember_core'}) & (x < tz[0] + 0.3)
    Tw = sm(tz[0], tz[1], x) * sm(tz[2], tz[3], z) if T else np.zeros(n)
    Tw[emb] = 1.0
    Tw *= rem
    Tw = np.minimum(Tw, rem - H)
    body = np.clip(rem - H - Tw, 0, 1)
    cs = S['chest_split']
    cf = sm(cs[0], cs[1], x)
    W['chest'] = body * cf; W['hips'] = body * (1 - cf)
    esum = np.zeros(n)
    for s, side in (((1, 'L'), (-1, 'R')) if EAR else ()):
        l = (co0 - np.array((EAR['c'][0], EAR['c'][1] * s, EAR['c'][2]))) @ ear_R(s)
        rad = (l[:, 0] / ew[0]) ** 2 + (l[:, 1] / ew[1]) ** 2
        e = sm(-0.24, -0.04, l[:, 2]) * sm(1.15, 0.85, rad) * (np.sign(y) == s)
        W[f'ear.{side}'] = H * e; esum += e
    W['head'] = H * (1 - esum)
    tc = -x if S.get('tail_axis', 'z') == 'x' else z     # a tail lying back along the ground splits along -X
    f2 = sm(tz[4], tz[5], tc); f3 = sm(tz[6], tz[7], tc)
    f2[emb] = 1; f3[emb] = 1
    if T:
        W['tail1'] = Tw * (1 - f2); W['tail2'] = Tw * f2 * (1 - f3); W['tail3'] = Tw * f2 * f3
    kit.set_weights(W)
    kit.add_blink(head_centre=S['eye_centre'])

    # ---------------------------------------------------------------- clips, views, run
    M = S['motion']
    CLIPS, TRAVEL, REST = quad_clips(LEGS, scale=float(os.environ.get('MOTION_SCALE', M.get('scale', 1.0))),
                                     faint_drop=float(os.environ.get('FAINT_DROP', M.get('faint_drop', 0.0))),
                                     faint_leg_drop=float(os.environ.get('FAINT_LEG', M.get('faint_leg', 0.0))))
    tp = S.get('tail_pitch', 1.0)    # the clips pitch an upright tail; a tail lying back along the ground needs it flipped
    if tp != 1.0:
        seen = set()
        for poses in CLIPS.values():
            for P in poses:
                if id(P) in seen:      # a pose held over several frames is one object: flip it once
                    continue
                seen.add(id(P))
                for b in ('tail1', 'tail2', 'tail3'):
                    if b in P and 'r' in P[b]:
                        r = P[b]['r']; P[b] = {**P[b], 'r': (r[0], r[1] * tp, r[2])}
    fh = S.get('faint_head', 1.0)    # tusks / horns: a kin that cannot droop its head that far in the faint
    if fh != 1.0:
        seen = set()
        for P in CLIPS['faint']:
            if id(P) in seen or 'head' not in P or 'r' not in P['head']:
                continue
            seen.add(id(P))
            r = P['head']['r']; P['head'] = {**P['head'], 'r': (r[0], r[1] * fh, r[2])}
    ff = S.get('faint_front', 1.0)   # knuckle-walkers: arms angled forward would swing the fists up; 0 keeps them planted
    if ff != 1.0:
        seen = set()
        for P in CLIPS['faint']:
            if id(P) in seen:
                continue
            seen.add(id(P))
            for b in ('leg_f.L', 'leg_f.R'):
                if b in P and 'r' in P[b]:
                    r = P[b]['r']; P[b] = {**P[b], 'r': (r[0], r[1] * ff, r[2])}
    head_back = float(os.environ.get('HEAD_BACK', S.get('head_back', 20)))
    VIEWS = {'front': dict(yaw=35.0, elev=12.0),
             'back': dict(yaw=float(os.environ.get('YAW_BACK', -12)), elev=float(os.environ.get('ELEV_BACK', 30)), head_yaw=-head_back)}
    ANCHOR_W = S.get('anchor') or ((L['front_x'] + L['hind_x']) / 2 + 0.07, 0.0, 0.0)   # middle of the four paws (toes forward)
    return kit.run(CLIPS, VIEWS, ANCHOR_W, ground_mask=co0[:, 2] < 0.03,
                   rig_out=os.path.join(here, f"{S['name']}_rig.blend"), rest_pose=REST, travel=TRAVEL,
                   ground_snap={'faint': [7, 8, 9]}, ground_lift={'faint': [4, 5, 6], 'attack': list(range(1, 13)), 'hit': [1, 2, 3, 4]})
