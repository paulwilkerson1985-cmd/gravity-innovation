"""orbkin_compat: Blender version shim + the few helpers every forge script starts with.

Pinned target: Blender 5.2 LTS (bpy 5.2.2). The shim keeps scripts running on 4.2-5.x and names
the renames that landed in 5.0 (EEVEE id, boolean FAST->FLOAT, compositor tree, bake settings,
Action.fcurves). Import it first in every script:

    import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # when copied next to kit.py
    import orbkin_compat as oc; oc.fresh_scene()

Facts encoded here (each from a measured failure, see references/gotchas.md):
- bpy.ops return {'CANCELLED'} instead of raising -> ops_ok() raises.
- 5.2.2 leaves an EMPTY material slot after an EXACT boolean on a slot-less mesh; a material appended
  later lands in slot 1 and the GLB loses it -> drop_empty_material_slots() / assign before booleans.
- Material.use_nodes is deprecated in 5.x (always on) -> new_material() never touches it.
- PNGs are byte-identical across runs only with render stamps off and use_stamp_labels=True
  -> deterministic_png().
- The pip wheel has no Draco/meshopt bridge: export raw, compress with glTF-Transform.
"""
import bpy, os, sys, json, hashlib

VERSION = bpy.app.version  # (major, minor, patch)
EEVEE = 'BLENDER_EEVEE' if VERSION >= (5, 0, 0) else 'BLENDER_EEVEE_NEXT'


def fresh_scene():
    """Factory-empty scene. In background mode resets everything; in an interactive Blender (owner's
    desktop via the MCP) it creates and switches to a new scene instead of wiping the open file."""
    if bpy.app.background:
        bpy.ops.wm.read_factory_settings(use_empty=True)
    else:  # pragma: no cover (desktop)
        sc = bpy.data.scenes.new('orbkin')
        bpy.context.window.scene = sc
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.view_settings.view_transform = 'Standard'   # matches three.js output; AgX desaturates
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    deterministic_png(sc)
    return sc


def deterministic_png(sc=None):
    """Byte-stable PNGs: stamps off, but keep use_stamp_labels=True (False makes Cycles write a
    render_time text chunk that differs per run)."""
    sc = sc or bpy.context.scene
    sc.render.use_stamp = False
    sc.render.use_stamp_labels = True
    sc.render.use_stamp_note = False
    return sc


def ops_ok(res, what='operator'):
    """bpy.ops returns a set; CANCELLED never raises. Call: ops_ok(bpy.ops.object.foo(), 'foo')."""
    if 'FINISHED' not in res:
        raise RuntimeError(f'{what} returned {res} (bpy.ops CANCELLED is not an exception)')
    return res


def boolean_solver(preferred='MANIFOLD'):
    """'FLOAT' (5.0+) was 'FAST'; 'MANIFOLD' exists from 4.5. Returns an id that exists here."""
    ids = [i.identifier for i in bpy.types.BooleanModifier.bl_rna.properties['solver'].enum_items]
    for cand in (preferred, 'MANIFOLD', 'EXACT', 'FLOAT', 'FAST'):
        if cand in ids:
            return cand
    return ids[0]


def compositor_tree(sc=None):
    """5.0+: scene.compositing_node_group (a node group); before: scene.node_tree."""
    sc = sc or bpy.context.scene
    if hasattr(sc, 'compositing_node_group'):
        if sc.compositing_node_group is None:
            sc.compositing_node_group = bpy.data.node_groups.new('orbkin_comp', 'CompositorNodeTree')
        return sc.compositing_node_group
    sc.use_nodes = True
    return sc.node_tree


def new_material(name, color=None, roughness=0.8, metallic=0.0, backface_culling=True):
    """Principled material (the only shader the glTF exporter understands). color is linear RGB.
    backface_culling=True or the exporter writes doubleSided:true."""
    m = bpy.data.materials.new(name)
    if VERSION < (5, 0, 0):
        m.use_nodes = True
    m.use_backface_culling = backface_culling
    b = m.node_tree.nodes.get('Principled BSDF')
    if b is None:
        b = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        m.node_tree.links.new(b.outputs[0], m.node_tree.nodes['Material Output'].inputs['Surface'])
    if color is not None:
        b.inputs['Base Color'].default_value = (*color[:3], 1.0)
    b.inputs['Roughness'].default_value = roughness
    b.inputs['Metallic'].default_value = metallic
    return m


def new_world(strength=1.0, color=(0.05, 0.05, 0.06)):
    w = bpy.data.worlds.new('orbkin_world')
    if VERSION < (5, 0, 0):
        w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*color, 1.0)
    bg.inputs['Strength'].default_value = strength
    bpy.context.scene.world = w
    return w


def drop_empty_material_slots(obj):
    """5.2.2: EXACT booleans on a slot-less mesh leave an empty slot; GN apply leaves a None slot.
    Either way the first real material is not slot 0 and the GLB comes out white/black."""
    me = obj.data
    removed = 0
    i = 0
    while i < len(me.materials):
        if me.materials[i] is None:
            me.materials.pop(index=i); removed += 1
        else:
            i += 1
    return removed


def iter_fcurves(action):
    """Action.fcurves was removed in 5.0 (slots/layers/channelbags)."""
    if hasattr(action, 'fcurves'):
        return list(action.fcurves)
    out = []
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                out.extend(bag.fcurves)
    return out


EXPORT_DEFAULTS = dict(
    export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
    export_texcoords=True, export_normals=True, export_tangents=False,
    export_materials='EXPORT', export_image_format='AUTO',
    export_vertex_color='MATERIAL', export_attributes=True,
    export_skins=True, export_def_bones=False, export_influence_nb=4,
    export_morph=True, export_morph_normal=True,
    export_animations=True, export_animation_mode='NLA_TRACKS',
    export_force_sampling=True, export_optimize_animation_size=True,
    export_anim_slide_to_zero=True, export_reset_pose_bones=True,
    export_extras=True, export_lights=False, export_cameras=False, export_gpu_instances=False,
)


def export_glb(filepath, objects=None, **overrides):
    """Raw GLB export with the verified defaults (asset-pipeline.md 7). Unknown kwargs for this
    Blender version are dropped (filtered by RNA), so the same call works on 4.2-5.2.
    objects=None exports the selection as-is. Returns the file size in bytes."""
    if objects is not None:
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        for o in objects:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objects[0]
    kw = dict(EXPORT_DEFAULTS); kw.update(overrides)
    valid = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    kw = {k: v for k, v in kw.items() if k in valid}
    os.makedirs(os.path.dirname(os.path.abspath(filepath)) or '.', exist_ok=True)
    ops_ok(bpy.ops.export_scene.gltf(filepath=filepath, **kw), 'export_scene.gltf')
    return os.path.getsize(filepath)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def argv_after_dashes():
    """Script args after `--` (both `python script.py -- a b` and `blender -b -P script.py -- a b`)."""
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return sys.argv[1:]


def loadavg():
    try:
        return [round(x, 2) for x in os.getloadavg()]
    except Exception:
        return None
