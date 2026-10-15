"""sprite_passes: Cycles 1-spp emission sprite passes (albedo + normal) for offline sprite sheets.

  "$ORBKIN_BPY" -I sprite_passes.py -- in.blend --object Kin --out sheet_dir --height 48 --ss 4 \
      [--facings 2] [--frames 8] [--clip Idle] [--fps 10] [--elev 30] [--yaw 35] [--key -0.5,-0.6,0.8] [--vertex-color Col]
Why Cycles 1 spp emission: 0.05-0.12 s per frame; EEVEE costs >= 1.8 s per frame on llvmpipe and
Workbench is dull (lab.md 8). Output is pixel-identical to EEVEE on the same emission material.
Material: half-Lambert (N.L*0.5+0.5) -> CONSTANT 4-stop hue-shifted ramp x base colour (vertex colour
or baseColor texture), as an emission shader (no lights needed, max_bounces 0, filter_size 0, film
transparent, Standard view). Passes per frame: albedo_<f>_<k>.png (toon) and normal_<f>_<k>.png (world
normal packed 0..1, for a runtime-lit sprite). Renders at --ss x height; sprite_post.py mode-downs.
Rules: NLA tracks are all active at once in Blender, so the chosen clip's track is SOLOed before
rendering; the camera is orthographic at --elev, framed to the posed bounding box of frame 0 so the
sheet does not jitter; facings rotate a pivot empty (0 and 180 deg for 2 facings; 8 x 45 deg for 8).
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import bpy, sys, os, json, math, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, orbkin_compat as oc
from mathutils import Vector


def toon_emission(key, vertex_color=None, image=None, tones=((0.0, (0.42, 0.36, 0.55)), (0.38, (0.70, 0.66, 0.78)), (0.58, (1.0, 0.98, 0.96)), (0.86, (1.18, 1.10, 0.95)))):
    m = bpy.data.materials.new('sprite_toon'); nt = m.node_tree; nt.nodes.clear(); N, L = nt.nodes.new, nt.links.new
    geo = N('ShaderNodeNewGeometry')
    dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = Vector(key).normalized()
    half = N('ShaderNodeMath'); half.operation = 'MULTIPLY_ADD'; half.inputs[1].default_value = 0.5; half.inputs[2].default_value = 0.5
    ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'; els = ramp.color_ramp.elements
    while len(els) < len(tones):
        els.new(0.5)
    for e, (pos, c) in zip(els, tones):
        e.position = pos; e.color = (*c, 1)
    L(geo.outputs['Normal'], dot.inputs[0]); L(dot.outputs['Value'], half.inputs[0]); L(half.outputs[0], ramp.inputs['Fac'])
    mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    if vertex_color:
        col = N('ShaderNodeVertexColor'); col.layer_name = vertex_color; L(col.outputs['Color'], mul.inputs[6])
    elif image is not None:
        t = N('ShaderNodeTexImage'); t.image = image; t.interpolation = 'Closest'; L(t.outputs['Color'], mul.inputs[6])
    else:
        mul.inputs[6].default_value = (0.8, 0.8, 0.8, 1)
    L(ramp.outputs['Color'], mul.inputs[7])
    em = N('ShaderNodeEmission'); L(mul.outputs[2], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); L(em.outputs[0], out.inputs['Surface'])
    return m


def normal_emission():
    m = bpy.data.materials.new('sprite_normal'); nt = m.node_tree; nt.nodes.clear(); N, L = nt.nodes.new, nt.links.new
    geo = N('ShaderNodeNewGeometry')
    ma = N('ShaderNodeVectorMath'); ma.operation = 'MULTIPLY_ADD'; ma.inputs[1].default_value = (0.5, 0.5, 0.5); ma.inputs[2].default_value = (0.5, 0.5, 0.5)
    L(geo.outputs['Normal'], ma.inputs[0])
    em = N('ShaderNodeEmission'); L(ma.outputs[0], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); L(em.outputs[0], out.inputs['Surface'])
    return m


def solo_track(obj, clip):
    """Solo the NLA track named `clip` on the armature (and shape keys) so other clips do not blend in."""
    done = False
    for holder in (obj.find_armature() or obj, obj, getattr(obj.data, 'shape_keys', None)):
        ad = getattr(holder, 'animation_data', None) if holder is not None else None
        if not ad:
            continue
        for tr in ad.nla_tracks:
            tr.is_solo = (tr.name == clip); tr.mute = False
            done = done or tr.name == clip
    return done


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('blend'); ap.add_argument('--object', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--height', type=int, default=48); ap.add_argument('--ss', type=int, default=4)
    ap.add_argument('--facings', type=int, default=2); ap.add_argument('--frames', type=int, default=8); ap.add_argument('--clip')
    ap.add_argument('--fps', type=float, default=10.0); ap.add_argument('--elev', type=float, default=30.0); ap.add_argument('--yaw', type=float, default=35.0)
    ap.add_argument('--key', default='-0.5,-0.6,0.8'); ap.add_argument('--vertex-color'); ap.add_argument('--no-normal', action='store_true')
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    oc.deterministic_png()
    os.makedirs(a.out, exist_ok=True)
    sc = bpy.context.scene; obj = bpy.data.objects[a.object]
    key = [float(x) for x in a.key.split(',')]
    for o in sc.objects:  # hide every other mesh: an overlapping high poly or a floor z-fights into speckles
        if o.type == 'MESH' and o is not obj:
            o.hide_render = True
    if a.clip:
        if not solo_track(obj, a.clip):
            print(f'WARNING: no NLA track named {a.clip!r}; rendering the current pose', file=sys.stderr)
    # pivot for facings
    pivot = bpy.data.objects.new('sprite_pivot', None); sc.collection.objects.link(pivot)
    arm = obj.find_armature(); top = arm if arm else obj
    top.parent = pivot; top.matrix_parent_inverse = pivot.matrix_world.inverted()
    # camera framed to frame 0 of the posed mesh
    sc.frame_set(sc.frame_start)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(dg); me = ev.to_mesh()
    pts = [obj.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
    el, yaw = math.radians(a.elev), math.radians(a.yaw)
    d = Vector((math.cos(el) * math.sin(yaw), -math.cos(el) * math.cos(yaw), math.sin(el)))
    rot = (-d).to_track_quat('-Z', 'Y'); right, up = rot @ Vector((1, 0, 0)), rot @ Vector((0, 1, 0))
    ctr = sum(pts, Vector()) / len(pts)
    radius = max((p - ctr).length for p in pts) * 1.08  # radius-based so every facing/frame fits
    cd = bpy.data.cameras.new('spr'); cd.type = 'ORTHO'; cd.ortho_scale = radius * 2; cd.clip_end = 100
    cam = bpy.data.objects.new('spr', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = ctr + d * 20; cam.rotation_euler = rot.to_euler()
    r = sc.render; r.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1; sc.cycles.use_denoising = False
    sc.cycles.use_adaptive_sampling = False; sc.cycles.max_bounces = 0; r.use_persistent_data = True
    r.film_transparent = True; r.filter_size = 0.0; r.dither_intensity = 0.0
    sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
    oc.new_world(0.0)
    px = a.height * a.ss; r.resolution_x = r.resolution_y = px; r.resolution_percentage = 100
    base_img = None
    for m in obj.data.materials:
        if m:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and base_img is None:
                    base_img = n.image
    toon = toon_emission(key, a.vertex_color, base_img); nrm = normal_emission()
    orig = list(obj.data.materials)
    frames = []
    t_all = time.perf_counter()
    f0 = sc.frame_start; f1 = sc.frame_end if a.clip else sc.frame_start
    step = max(1, int(round(sc.render.fps / a.fps))) if a.clip else 1
    frame_list = list(range(f0, f1 + 1, step))[:a.frames] if a.clip else [f0]
    for fi in range(a.facings):
        pivot.rotation_euler = (0, 0, fi * math.tau / a.facings)
        for k, fr in enumerate(frame_list):
            sc.frame_set(fr)
            for passname, mat in (('albedo', toon), ('normal', nrm)):
                if passname == 'normal' and a.no_normal:
                    continue
                obj.data.materials.clear(); obj.data.materials.append(mat)
                r.filepath = os.path.join(os.path.abspath(a.out), f'{passname}_f{fi}_{k:02d}.png')
                t = time.perf_counter(); oc.ops_ok(bpy.ops.render.render(write_still=True), 'render')
                frames.append({'pass': passname, 'facing': fi, 'frame': k, 'blender_frame': fr, 'file': r.filepath, 'seconds': round(time.perf_counter() - t, 3)})
    obj.data.materials.clear()
    for m in orig:
        obj.data.materials.append(m)
    rep = {'out': a.out, 'height': a.height, 'ss': a.ss, 'facings': a.facings, 'frames': len(frame_list), 'clip': a.clip, 'key': key, 'elev': a.elev, 'yaw': a.yaw,
           'renders': frames, 'total_seconds': round(time.perf_counter() - t_all, 2), 'load_avg': oc.loadavg()}
    json.dump(rep, open(os.path.join(a.out, 'passes.json'), 'w'), indent=1)
    print(json.dumps({k: v for k, v in rep.items() if k != 'renders'}))


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
