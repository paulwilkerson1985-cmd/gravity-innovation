"""sheetkit - shared machinery for pre-rendered kin sprite sheets (headless bpy 5.2).

A kin's anim script supplies what is specific to it (the rig's bones and procedural weights, the blink, the
clips and the views) and calls Kit for the rest: the world-axis pose API, keyed clips, ground checks, one
orthographic camera per view fitted to every frame of every clip, the Freestyle ink scaled to the creature's
size, the render loop and frames/meta.json for pack.py. First client: ../../ashkit/scripts/anim.py.

Env read by Kit.run: VIEWS=front,back  CLIPS=idle,attack,hit,faint  FRAMES=0,3 (subset)  SPP=12  SIZE=512
OUT=<frames dir>  DRY=1 (framing and checks only, no render).
"""
import os, time, math, json
import bpy
import numpy as np
from mathutils import Vector, Quaternion

from common import camera_basis, set_light_dir, vertex_slot_mask, link, activate


def sm(e0, e1, x):
    """Smoothstep from e0 to e1 (e0 > e1 gives a falling edge)."""
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ clip authoring (pure python)
def wq(roll=0.0, pitch_up=0.0, yaw_l=0.0):
    """World-axis rotation: roll about +X (forward), pitch_up raises the +X tip, yaw_l swings +X toward +Y."""
    return (Quaternion((0, 0, 1), math.radians(yaw_l)) @ Quaternion((0, 1, 0), math.radians(-pitch_up))
            @ Quaternion((1, 0, 0), math.radians(roll)))


def lerp(a, b, t):
    if isinstance(a, (tuple, list)):
        return tuple(lerp(u, v, t) for u, v in zip(a, b))
    return a + (b - a) * t


def blend(A, B, t):
    """Blend two poses ({bone: dict(r, l, s)}, 'blink': float)."""
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


# ------------------------------------------------------------------ the kit
class Kit:
    def __init__(self, blend_path, obj_name, fps=12):
        self.t0 = time.perf_counter()
        bpy.ops.wm.open_mainfile(filepath=blend_path)
        self.sc = bpy.context.scene
        self.o = bpy.data.objects[obj_name]
        for c in [x for x in bpy.data.objects if x.type == 'CAMERA']:
            bpy.data.objects.remove(c, do_unlink=True)
        self.fps = fps
        self.size = int(os.environ.get('SIZE', 512))
        self.spp = int(os.environ.get('SPP', 12))
        self.head_yaw = 0.0
        self.yaw_bone = 'head'             # the bone a view's extra yaw turns (a blob kin turns its whole 'body')
        self.co0 = self.coords()           # the symmetric basis

    def coords(self):
        me = self.o.data
        co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', co)
        return co.reshape(-1, 3)

    def bake_shape_key(self, name):
        """Apply a shape key (e.g. the 'battle' head turn) into the rest mesh; returns the new coordinates."""
        me = self.o.data
        me.shape_keys.key_blocks[name].value = 1.0
        self.o.active_shape_key_index = list(me.shape_keys.key_blocks.keys()).index(name)
        activate(self.o)
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
        co = self.coords()
        print(f'{name} baked, max move', float(np.abs(co - self.co0).max()))
        self.co = co
        return co

    # -------------------------------------------------------------- rig
    def begin_bones(self):
        self.arm_d = bpy.data.armatures.new('rig')
        self.arm = link(bpy.data.objects.new('rig', self.arm_d))
        activate(self.arm); bpy.ops.object.mode_set(mode='EDIT')

    def bone(self, name, head, tail, parent=None, deform=True):
        eb = self.arm_d.edit_bones
        b = eb.new(name); b.head = tuple(map(float, head)); b.tail = tuple(map(float, tail)); b.use_deform = deform; b.roll = 0
        if parent:
            b.parent = eb[parent]; b.use_connect = False
        return b

    def end_bones(self):
        bpy.ops.object.mode_set(mode='OBJECT')

    def set_weights(self, W):
        """W: {bone: per-vertex weight array} on the rest basis; the sums should be 1."""
        tot = sum(W.values())
        print('weights: sum min/max', float(tot.min()), float(tot.max()))
        o = self.o
        o.vertex_groups.clear()
        for nm, w in W.items():
            g = o.vertex_groups.new(name=nm)
            for i in np.where(w > 1e-4)[0]:
                g.add([int(i)], float(w[i]), 'REPLACE')
        md = o.modifiers.new('arm', 'ARMATURE'); md.object = self.arm
        o.parent = self.arm
        for pb in self.arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.RQ = {b.name: b.matrix_local.to_quaternion() for b in self.arm_d.bones}
        self.RM = {b.name: b.matrix_local.to_3x3() for b in self.arm_d.bones}
        self.BONES = [b.name for b in self.arm_d.bones]

    def add_blink(self, head_centre, eye_slots=('eye',), glint_slots=('glint',), lid=0.36, squeeze=0.10, sink=0.07):
        """A 'blink' shape key: each eye squeezes to a lid line, its glints shrink and sink under the lid."""
        o = self.o; co = self.co; co0 = self.co0
        eye_m = vertex_slot_mask(o, set(eye_slots)); gl_m = vertex_slot_mask(o, set(glint_slots))
        self.eyes = {}
        o.shape_key_add(name='Basis')
        kbl = o.shape_key_add(name='blink'); kbl.value = 0
        bco = co.copy()
        for s in (1, -1):
            side = (np.sign(co0[:, 1]) == s)
            em = eye_m & side & ~gl_m
            if not em.any():
                continue
            ez = co[em, 2]; zc = ez.min() + lid * (ez.max() - ez.min())
            cen = co[em].mean(0)
            sel = (eye_m | gl_m) & side
            bco[sel, 2] = zc + (co[sel, 2] - zc) * squeeze
            g = gl_m & side
            f = cen - np.array(head_centre); f /= np.linalg.norm(f)
            bco[g] = cen + (bco[g] - cen) * 0.25 - f * sink
            print(f'  eye {s}: centre {np.round(cen, 3)}, lid line z {zc:.3f}, verts {int(sel.sum())}')
            self.eyes[s] = (cen, np.array(head_centre, float), sel)
        kbl.data.foreach_set('co', bco.ravel())
        # 'hide<side>': that eye (and its glints) shrinks into the head. run() switches it on in a view where the eye
        # only grazes the silhouette: a far eye at tangency reads as a sliver or a third eye (Fable review 1).
        for s, (cen, hc, sel) in self.eyes.items():
            f = cen - hc; f /= np.linalg.norm(f)
            ext = float(np.max((co[sel] - cen) @ f))
            hco = co.copy()
            hco[sel] = cen - f * (1.5 * ext + 0.01) + (co[sel] - cen) * 0.05
            kh = o.shape_key_add(name=f'hide{s}'); kh.value = 0
            kh.data.foreach_set('co', hco.ravel())

    # -------------------------------------------------------------- posing
    def apply_pose(self, P):
        """P: {bone: dict(r=(roll,pitch_up,yaw_l), l=(x,y,z) world, s=float|(sa,sy,sa))}; 'blink': 0..1.
        self.head_yaw (set per view) is added to the yaw of self.yaw_bone ('head' by default)."""
        for nm in self.BONES:
            pb = self.arm.pose.bones[nm]; p = P.get(nm, {})
            r = p.get('r', (0, 0, 0))
            if nm == self.yaw_bone:
                r = (r[0], r[1], r[2] + self.head_yaw)
            q = wq(*r)
            pb.rotation_quaternion = self.RQ[nm].inverted() @ q @ self.RQ[nm]
            pb.location = self.RM[nm].inverted() @ Vector(p.get('l', (0, 0, 0)))
            s = p.get('s', 1.0)
            if isinstance(s, (int, float)):   # volume-keeping stretch along the bone's own axis
                pb.scale = (1 / math.sqrt(s), s, 1 / math.sqrt(s))
            else:
                pb.scale = s
        ks = self.o.data.shape_keys
        if ks and 'blink' in ks.key_blocks:
            ks.key_blocks['blink'].value = P.get('blink', 0.0)
        for sd, v in getattr(self, 'hide', {}).items():
            if ks and f'hide{sd}' in ks.key_blocks:
                ks.key_blocks[f'hide{sd}'].value = v

    def eval_pts(self):
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = self.o.evaluated_get(dg); m = ev.to_mesh()
        p = np.empty(len(m.vertices) * 3); m.vertices.foreach_get('co', p); p = p.reshape(-1, 3)
        M = np.array(self.o.matrix_world); ev.to_mesh_clear()
        return p @ M[:3, :3].T + M[:3, 3]

    def sample(self, clips, head_yaw=0.0):
        self.head_yaw = head_yaw
        out = {}
        for cn, poses in clips.items():
            for f, P in enumerate(poses):
                self.apply_pose(P); out[(cn, f)] = self.eval_pts()
        return out

    # -------------------------------------------------------------- the run
    def run(self, clips, views, anchor_w, ground_mask, rig_out, rest_pose, travel=None, ink=(6.0, 3.2, 820.0), ground_lock=False,
            ground_snap=None, ground_lift=None):
        """clips: {name: [pose per frame]}; views: {name: dict(yaw, elev, head_yaw)}; anchor_w: the feet point
        (world, the same pixel in every frame of a view); ground_mask: rest vertices that must stay planted in
        idle (soles); rig_out: where to save the rigged .blend; rest_pose: the pose the .blend is saved in;
        travel: {clip: dict(fwd=[...], ease=[...])} for the sheet player; ink: (outer px, inner px, at a creature
        this many px tall), scaled per view to the creature's rest height; ground_lock: lift any frame whose lowest
        point is under the floor back onto it (round kin with no legs); ground_snap: {clip: [frames]} that lie on the
        floor, moved up or down so their lowest point is exactly on it; ground_lift: {clip: [frames]} lifted only when
        a point is under the floor."""
        sc = self.sc; size = self.size
        if ground_lock:   # a round body tilting about its centre swings its rim under the floor: lift those frames back onto it
            for cn, poses in clips.items():
                fixed = {}
                for f, P in enumerate(poses):
                    if id(P) in fixed:
                        poses[f] = fixed[id(P)]; continue
                    self.apply_pose(P); zmin = float(self.eval_pts()[:, 2].min())
                    Q = P
                    if zmin < -0.002:
                        cog = dict(P.get('cog', {})); l = cog.get('l', (0, 0, 0))
                        cog['l'] = (l[0], l[1], l[2] - zmin); Q = {**P, 'cog': cog}
                    fixed[id(P)] = Q; poses[f] = Q
        # ground_snap: these drawings lie on the floor (lowest point exactly at 0); ground_lift: lifted only if under it
        for table, lift_only in ((ground_snap, False), (ground_lift, True)):
            for cn, frames in (table or {}).items():
                fixed = {}
                for f in frames:
                    P = clips[cn][f]
                    if id(P) in fixed:
                        clips[cn][f] = fixed[id(P)]; continue
                    self.apply_pose(P); zmin = float(self.eval_pts()[:, 2].min())
                    Q = P
                    if not lift_only or zmin < -0.002:   # move 'root': quad legs hang from it, not from 'cog'
                        rb = 'root' if 'root' in self.BONES else 'cog'
                        r_ = dict(P.get(rb, {})); l = r_.get('l', (0, 0, 0))
                        r_['l'] = (l[0], l[1], l[2] - zmin); Q = {**P, rb: r_}
                    fixed[id(P)] = Q; clips[cn][f] = Q
        root_motion = {k: [tuple(p.get('cog', {}).get('l', (0, 0, 0))) for p in v] for k, v in clips.items()}
        pts = self.sample(clips)
        rest = pts[('idle', 0)]
        checks = {}
        for cn in clips:
            drift = [float(np.abs(pts[(cn, f)][ground_mask] - rest[ground_mask]).max()) for f in range(len(clips[cn]))]
            checks[cn] = dict(sole_max_move=max(drift), zmin=[round(float(pts[(cn, f)][:, 2].min()), 4) for f in range(len(clips[cn]))])
        print('checks', json.dumps(checks))
        # where it sinks: the dominant bone of the lowest vertex in every frame below the ground
        groups = {g.index: g.name for g in self.o.vertex_groups}
        for cn in clips:
            for f in range(len(clips[cn])):
                p = pts[(cn, f)]; i = int(np.argmin(p[:, 2]))
                if p[i, 2] < -0.01:
                    vg = max(self.o.data.vertices[i].groups, key=lambda g: g.weight, default=None)
                    print(f'  sinks: {cn}/{f:02d} z {p[i, 2]:.3f} at {np.round(p[i], 2)} rest {np.round(self.co0[i], 2)} bone {groups.get(vg.group) if vg else None}')

        anchor_w = np.asarray(anchor_w, float)
        CAM = {}
        for vn, v in views.items():
            yaw, elev, hy = v['yaw'], v['elev'], v.get('head_yaw', 0.0)
            vc = self.sample(clips, hy) if hy else pts
            allp = np.vstack([q[::7] for q in vc.values()]); vrest = vc[('idle', 0)]
            d, rot, right, up = camera_basis(yaw, elev)
            R, U = np.array(right), np.array(up)
            xs, ys = allp @ R, allp @ U
            ry = vrest @ U
            ortho = max((ys.max() - ys.min()) / 0.92, (xs.max() - xs.min()) / 0.92)
            px = size / ortho
            # union box centred; anchor snapped to a whole pixel
            cx, cy = (xs.max() + xs.min()) / 2, (ys.max() + ys.min()) / 2
            ax = (anchor_w @ R - cx) * px + size / 2; ay = size / 2 - (anchor_w @ U - cy) * px
            cx += (ax - round(ax)) / px; cy -= (ay - round(ay)) / px
            anchor = (int(round(ax)), int(round(ay)))
            CAM[vn] = dict(yaw=yaw, elev=elev, head_yaw=hy, ortho=ortho, center=(right * cx + up * cy), d=d, rot=rot,
                           right=right, up=up, anchor=anchor, px_per_unit=px, rest_h_px=(ry.max() - ry.min()) * px)
            print(f'view {vn}: ortho {ortho:.3f}, {px:.1f} px/unit, rest creature {CAM[vn]["rest_h_px"]:.0f} px tall, anchor {anchor}')
        self.head_yaw = 0.0
        # a far eye that only grazes the silhouette in a view is hidden in that view (FAR_EYE_T: the facing below which)
        T = float(os.environ.get('FAR_EYE_T', 0.25))
        for vn, c in CAM.items():
            a = math.radians(c['head_yaw'])
            Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
            c['hide'] = {}
            for sd, (cen, hc, sel) in getattr(self, 'eyes', {}).items():
                fac = float((Rz @ ((cen - hc) / np.linalg.norm(cen - hc))) @ np.array(c['d']))
                c['hide'][sd] = 1.0 if fac < T else 0.0
                print(f'  view {vn}: eye {sd} faces the camera {fac:.2f}' + (' -> hidden' if fac < T else ''))

        cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.clip_end = 100
        cam = link(bpy.data.objects.new('cam', cd)); sc.camera = cam

        def set_view(vn):
            c = CAM[vn]
            self.head_yaw = c['head_yaw']; self.hide = c['hide']
            cd.ortho_scale = c['ortho']
            cam.location = c['center'] + c['d'] * 30
            cam.rotation_euler = c['rot'].to_euler()
            set_light_dir((-0.55 * c['right'] + 0.72 * c['up'] + 0.42 * c['d']).normalized())
            k = c['rest_h_px'] / ink[2]
            fs = sc.view_layers[0].freestyle_settings
            for ls in fs.linesets:
                base = ink[0] if ls.name == 'outer' else ink[1]
                st = ls.linestyle; st.thickness = base * k
                for m in st.thickness_modifiers:
                    if m.type == 'CALLIGRAPHY':
                        m.thickness_min = base * k * 0.7; m.thickness_max = base * k * 1.25

        sc.render.resolution_x = sc.render.resolution_y = size
        sc.render.resolution_percentage = 100
        sc.cycles.samples = self.spp
        sc.cycles.use_denoising = True; sc.cycles.denoiser = 'OPENIMAGEDENOISE'
        sc.cycles.use_adaptive_sampling = False
        sc.render.fps = self.fps
        try:
            sc.render.threads_mode = 'FIXED'; sc.render.threads = 4
        except Exception:
            pass

        OUTF = os.environ.get('OUT') or os.path.join(os.path.dirname(rig_out), 'frames')
        meta = dict(kin=self.o.name, fps=self.fps, size=size, spp=self.spp, views={}, clips={k: len(v) for k, v in clips.items()},
                    checks=checks, timing={}, travel=travel or {})
        for vn, c in CAM.items():
            meta['views'][vn] = dict(yaw=c['yaw'], elev=c['elev'], ortho=c['ortho'], anchor=c['anchor'], px_per_unit=c['px_per_unit'], hidden_eyes=c['hide'],
                                     rest_h_px=c['rest_h_px'],
                                     root_px={cn: [[round(float(np.dot(np.array(l), np.array(c['right'])) * c['px_per_unit']), 2),
                                                    round(float(-np.dot(np.array(l), np.array(c['up'])) * c['px_per_unit']), 2)] for l in root_motion[cn]]
                                              for cn in clips})
        os.makedirs(OUTF, exist_ok=True)
        sel_v = os.environ.get('VIEWS', ','.join(views)).split(',')
        sel_c = os.environ.get('CLIPS', ','.join(clips)).split(',')
        sel_f = os.environ.get('FRAMES')
        dry = bool(os.environ.get('DRY'))
        mp = os.path.join(OUTF, 'meta.json')
        # A partial render (CLIPS / VIEWS / FRAMES subset) must not mix camera framings: the framing is fitted to
        # every clip, so a pose change in one clip can move the camera for all of them.
        if os.path.exists(mp) and (set(sel_c) != set(clips) or set(sel_v) != set(CAM) or sel_f) and not dry:
            old_v = json.load(open(mp)).get('views', {})
            for vn, c in CAM.items():
                if vn in old_v and abs(old_v[vn]['ortho'] - c['ortho']) > 1e-4:
                    raise SystemExit(f'framing of view {vn} changed ({old_v[vn]["ortho"]:.4f} -> {c["ortho"]:.4f}): '
                                     'the frames already in OUT were rendered with the old camera; re-render every clip')
        if not dry:
            for vn in sel_v:
                set_view(vn)
                for cn in sel_c:
                    frames = range(len(clips[cn])) if not sel_f else [int(v) for v in sel_f.split(',') if int(v) < len(clips[cn])]
                    for f in frames:
                        self.apply_pose(clips[cn][f])
                        bpy.context.view_layer.update()
                        path = os.path.join(OUTF, vn, cn, f'{f:02d}.png')
                        os.makedirs(os.path.dirname(path), exist_ok=True)
                        sc.render.filepath = path
                        t = time.perf_counter()
                        bpy.ops.render.render(write_still=True)
                        dt = time.perf_counter() - t
                        meta['timing'][f'{vn}/{cn}/{f:02d}'] = round(dt, 2)
                        print(f'  {vn}/{cn}/{f:02d}: {dt:.1f}s', flush=True)
        if os.path.exists(mp) and sel_f:
            old = json.load(open(mp)); old['timing'].update(meta['timing']); meta['timing'] = old['timing']
        json.dump(meta, open(mp, 'w'), indent=1, default=lambda v: list(v))
        self.head_yaw = 0.0; self.hide = {}
        self.apply_pose(rest_pose)
        bpy.ops.wm.save_as_mainfile(filepath=rig_out, compress=True)
        print(f'ANIM total {time.perf_counter() - self.t0:.1f}s')
        return meta
