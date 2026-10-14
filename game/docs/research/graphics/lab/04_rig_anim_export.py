"""Lab 04 - rig + animate + export GLB with animation, headless.

Run:  $BPY 04_rig_anim_export.py [blend]     (default out/labkin.blend, vertex-colour LabKin)
Steps (timed): armature by script (14 bones), automatic weights, weight hygiene (limit 4, normalise),
two actions (Idle loop 48f, Hop 24f) + one shape key 'Squash' animated inside Hop, each pushed
onto NLA tracks with the same name so the exporter merges skeleton + morph channels per clip.
Export: out/04_labkin_anim.glb (+ .gltf json dump of animations) and report.
"""
import bpy, os, sys, time, math, json
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
src = sys.argv[-1] if sys.argv[-1].endswith('.blend') else os.path.join(OUT, 'labkin.blend')
bpy.ops.wm.open_mainfile(filepath=src)
sc = bpy.context.scene
kin = next(o for o in sc.objects if o.type == 'MESH' and o.name.startswith(('LabKin', 'Low')))
times = {}


def T(k, t0):
    times[k] = round(time.perf_counter() - t0, 3); print(k, times[k], flush=True)


def activate(o):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.selected_objects:
        x.select_set(False)
    o.select_set(True)


# ---------------- armature (bone positions measured off the LabKin layout)
t0 = time.perf_counter()
arm_d = bpy.data.armatures.new('KinRig'); arm = bpy.data.objects.new('KinRig', arm_d)
sc.collection.objects.link(arm); activate(arm)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones


def bone(name, head, tail, parent=None, deform=True):
    b = eb.new(name); b.head = head; b.tail = tail; b.use_deform = deform
    if parent:
        b.parent = eb[parent]; b.use_connect = False
    return b


bone('root', (0, 0, 0), (0, 0, 0.3), deform=False)
bone('hips', (-0.25, 0, 0.7), (0.15, 0, 0.75), 'root')
bone('chest', (0.15, 0, 0.75), (0.5, 0, 0.95), 'hips')
bone('head', (0.55, 0, 1.05), (0.9, 0, 1.35), 'chest')
for s, side in ((1, 'L'), (-1, 'R')):
    bone(f'ear.{side}', (0.48, 0.30 * s, 1.5), (0.26, 0.40 * s, 1.92), 'head')
    bone(f'leg_f.{side}', (0.44, 0.28 * s, 0.6), (0.50, 0.28 * s, 0.08), 'chest')
    bone(f'leg_b.{side}', (-0.36, 0.28 * s, 0.6), (-0.30, 0.28 * s, 0.08), 'hips')
bone('tail1', (-0.5, 0, 0.7), (-0.8, 0, 0.85), 'hips')
bone('tail2', (-0.8, 0, 0.85), (-0.85, 0, 1.15), 'tail1')
bone('tail3', (-0.85, 0, 1.15), (-0.62, 0, 1.38), 'tail2')
bpy.ops.object.mode_set(mode='OBJECT')
T('armature', t0)

# ---------------- automatic weights
t0 = time.perf_counter()
activate(kin); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
T('auto weights (heat)', t0)
# weight hygiene for glTF: limit to 4 influences, normalise (heat weights can sum to 1.0000004)
t0 = time.perf_counter()
activate(kin)
bpy.ops.object.mode_set(mode='WEIGHT_PAINT')
bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
bpy.ops.object.mode_set(mode='OBJECT')
# PITFALL: bone heat only weights the connected surface; separate islands (eyes, glints, horn) get
# weights from whatever bone is nearest and DETACH from the head when it turns. Rebind every
# small island 100% to 'head' (measured: without this the eyes float off during Hop).
import bmesh
bm = bmesh.new(); bm.from_mesh(kin.data); bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, isl = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop(); isl.append(x.index)
        for e in x.link_edges:
            o = e.other_vert(x)
            if o.index not in seen:
                seen.add(o.index); stack.append(o)
    islands.append(isl)
bm.free()
big = max(islands, key=len)
small = [i for isl in islands if isl is not big for i in isl]
for g in kin.vertex_groups:
    g.remove(small)
kin.vertex_groups['head'].add(small, 1.0, 'REPLACE')
print('islands', len(islands), 'rebound to head:', len(small), 'verts')
empty_groups = [g.name for g in kin.vertex_groups if not any(g.index in [x.group for x in v.groups] for v in kin.data.vertices[:2000])]
T('weights limit+normalise', t0)

# ---------------- shape key
t0 = time.perf_counter()
kin.shape_key_add(name='Basis')
sk = kin.shape_key_add(name='Squash')
for i, v in enumerate(kin.data.vertices):
    co = v.co
    sk.data[i].co = Vector((co.x * 1.08, co.y * 1.12, co.z * 0.86))
T('shape key', t0)

# ---------------- actions
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'BEZIER'
sc.render.fps = 24


def pose_key(action_name, frames):
    """frames: {frame: {bone: (rot_euler_xyz_deg, loc)}}"""
    act = bpy.data.actions.new(action_name)
    arm.animation_data_create(); arm.animation_data.action = act
    for pb in arm.pose.bones:
        pb.rotation_mode = 'XYZ'
    for f, bones in sorted(frames.items()):
        for bn, (rot, loc) in bones.items():
            pb = arm.pose.bones[bn]
            pb.rotation_euler = [math.radians(a) for a in rot]
            pb.location = loc
            pb.keyframe_insert('rotation_euler', frame=f)
            pb.keyframe_insert('location', frame=f)
    return act


t0 = time.perf_counter()
z = (0, 0, 0)
idle = pose_key('Idle', {
    1: {'chest': ((0, 0, 0), z), 'head': ((0, 0, 0), z), 'ear.L': ((0, 0, 0), z), 'ear.R': ((0, 0, 0), z), 'tail1': ((0, 0, 0), z), 'tail2': ((0, 0, 0), z), 'root': ((0, 0, 0), z)},
    13: {'chest': ((0, 0, 3), z), 'head': ((0, 4, -4), z), 'ear.L': ((0, 0, 12), z), 'tail1': ((0, 0, 15), z), 'tail2': ((0, 0, 18), z), 'root': ((0, 0, 0), (0, 0, 0.0))},
    25: {'chest': ((0, 0, 0), z), 'head': ((0, -2, 0), z), 'ear.L': ((0, 0, 0), z), 'ear.R': ((0, 0, -14), z), 'tail1': ((0, 0, -15), z), 'tail2': ((0, 0, -18), z)},
    37: {'chest': ((0, 0, -3), z), 'head': ((0, 3, 4), z), 'ear.R': ((0, 0, 0), z), 'tail1': ((0, 0, 8), z), 'tail2': ((0, 0, 10), z)},
    49: {'chest': ((0, 0, 0), z), 'head': ((0, 0, 0), z), 'ear.L': ((0, 0, 0), z), 'ear.R': ((0, 0, 0), z), 'tail1': ((0, 0, 0), z), 'tail2': ((0, 0, 0), z), 'root': ((0, 0, 0), z)},
})
hop = pose_key('Hop', {
    1: {'root': ((0, 0, 0), (0, 0, 0)), 'leg_f.L': ((0, 0, 0), z), 'leg_f.R': ((0, 0, 0), z), 'leg_b.L': ((0, 0, 0), z), 'leg_b.R': ((0, 0, 0), z), 'head': ((0, 0, 0), z)},
    5: {'root': ((0, 0, 0), (0, 0, -0.08)), 'head': ((0, 8, 0), z)},
    11: {'root': ((0, -10, 0), (0, 0, 0.55)), 'leg_f.L': ((0, 35, 0), z), 'leg_f.R': ((0, 35, 0), z), 'leg_b.L': ((0, -35, 0), z), 'leg_b.R': ((0, -35, 0), z), 'head': ((0, -10, 0), z)},
    18: {'root': ((0, 6, 0), (0, 0, 0.1)), 'leg_f.L': ((0, -10, 0), z), 'leg_f.R': ((0, -10, 0), z)},
    21: {'root': ((0, 0, 0), (0, 0, -0.06)), 'head': ((0, 6, 0), z), 'leg_b.L': ((0, 0, 0), z), 'leg_b.R': ((0, 0, 0), z)},
    25: {'root': ((0, 0, 0), (0, 0, 0)), 'leg_f.L': ((0, 0, 0), z), 'leg_f.R': ((0, 0, 0), z), 'head': ((0, 0, 0), z)},
})
# shape key action for Hop (squash on landing/take-off)
key = kin.data.shape_keys
key.animation_data_create()
sq = bpy.data.actions.new('Hop_Squash')
key.animation_data.action = sq
for f, v in ((1, 0), (5, 1), (9, 0), (19, 0), (21, 1), (25, 0)):
    key.key_blocks['Squash'].value = v
    key.key_blocks['Squash'].keyframe_insert('value', frame=f)
T('actions keyed', t0)

# ---------------- NLA: one track per clip, same name on armature + shape keys -> merged glTF clip
t0 = time.perf_counter()
arm.animation_data.action = None
for act in (idle, hop):
    tr = arm.animation_data.nla_tracks.new(); tr.name = act.name
    tr.strips.new(act.name, int(act.frame_range[0]), act)
key.animation_data.action = None
tr = key.animation_data.nla_tracks.new(); tr.name = 'Hop'
tr.strips.new('Hop', 1, sq)
T('nla', t0)

# ---------------- export
t0 = time.perf_counter()
glb = os.path.join(OUT, '04_labkin_anim.glb')
activate(kin); arm.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=glb, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_skins=True, export_morph=True, export_morph_animation=True,
    export_def_bones=False, export_optimize_animation_size=True,
    export_force_sampling=True, export_frame_step=1,
    export_vertex_color='MATERIAL', export_all_vertex_colors=False,
    export_apply=False, export_yup=True, export_extras=True,
)
T('gltf export', t0)
print('size KB', round(os.path.getsize(glb) / 1024, 1))
json.dump(dict(times=times, glb=glb, kb=round(os.path.getsize(glb) / 1024, 1)), open(os.path.join(OUT, '04_export.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, '04_labkin_rigged.blend'))
