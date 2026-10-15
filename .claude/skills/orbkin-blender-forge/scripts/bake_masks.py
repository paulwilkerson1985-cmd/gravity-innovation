"""bake_masks: bake form masks (not colours) from a high poly onto a low poly's UV atlas, with the
neighbours present so AO lands where pieces meet. Three cheap Cycles EMIT/AO bakes, then compose.py
paints world-space cells from them.

  "$ORBKIN_BPY" -I bake_masks.py -- in.blend --high Hi --low Low [--neighbours Floor,Wall] \
      --out masks_dir --size 512 [--samples 16] [--key -0.5,-0.6,0.8] [--crack-ao 0.25] [--contact-ao 0.7] [--material-id 0]
Writes to <out>/ (all Non-Color, alpha 0 = unbaked texel):
  masks.png   R = top-facing (0.65 x LOW normal z + 0.35 x high normal z), G = crack cavity (max(Voronoi
              cracks, 1.4 x (1 - AO at --crack-ao distance): valleys and tight seams), B = convexity
              (Cycles Pointiness on the high: lit lips), A = 255 - 16 x material id
  form.png    R = LOW normal z (top-facing), G = key-facing (dot(LOW normal, --key) * 0.5 + 0.5), B = 0.5
  pos.png     world position of the LOW surface, normalised by its bbox (bake.json has bbox_min/size);
              compose.py keys its 3-5-texel cells on it so cells stay continuous across UV islands
  contact.png AO at --contact-ao distance with the floor/neighbours present (soft contact darkening, at
              most -1 shade in the composer; it must not compete with the seam rule)
  ao.png      the same as contact.png (inspection), bake.json (timings, load average, settings, key)
Bake at 2x the final atlas (512 for a 256 atlas) and let compose.py reduce it; 16 spp is enough.
Rules enforced here: pass toggles reset before baking; low poly selected+active, high selected,
neighbours only renderable (never selected); masks to Non-Color images; margin 4 EXTEND; bake rays
are world-space so high and low must overlap (checked); the key vector matches shoot.mjs / the game
(upper-left key, Blender xyz with z up).
"""
import sys; sys.dont_write_bytecode = True
import bpy, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, orbkin_compat as oc
import numpy as np
from mathutils import Vector


def _emit_material(name, build):
    m = bpy.data.materials.new(name); nt = m.node_tree; nt.nodes.clear()
    N, L = nt.nodes.new, nt.links.new
    colour_socket = build(N, L)
    em = N('ShaderNodeEmission'); L(colour_socket, em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); L(em.outputs[0], out.inputs['Surface'])
    return m


def mask_material(ao_distance=0.25, crack_scale=1.6, crack_width=0.03, pointy_lo=0.5, pointy_hi=0.56):
    def build(N, L):
        geo = N('ShaderNodeNewGeometry')
        sep = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], sep.inputs[0])
        top = N('ShaderNodeMapRange'); top.inputs['From Min'].default_value = -1.0; top.inputs['From Max'].default_value = 1.0
        L(sep.outputs['Z'], top.inputs['Value'])
        ao = N('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = ao_distance; ao.samples = 8; ao.only_local = False
        inv = N('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; L(ao.outputs['AO'], inv.inputs[1])
        gain = N('ShaderNodeMath'); gain.operation = 'MULTIPLY'; gain.inputs[1].default_value = 1.4; L(inv.outputs[0], gain.inputs[0])
        vor = N('ShaderNodeTexVoronoi'); vor.feature = 'DISTANCE_TO_EDGE'; vor.inputs['Scale'].default_value = crack_scale
        crack = N('ShaderNodeMapRange'); crack.inputs['From Min'].default_value = crack_width; crack.inputs['From Max'].default_value = 0.0
        L(vor.outputs['Distance'], crack.inputs['Value'])
        cav = N('ShaderNodeMath'); cav.operation = 'MAXIMUM'; L(gain.outputs[0], cav.inputs[0]); L(crack.outputs[0], cav.inputs[1])
        convex = N('ShaderNodeMapRange'); convex.inputs['From Min'].default_value = pointy_lo; convex.inputs['From Max'].default_value = pointy_hi
        L(geo.outputs['Pointiness'], convex.inputs['Value'])
        comb = N('ShaderNodeCombineXYZ'); L(top.outputs[0], comb.inputs['X']); L(cav.outputs[0], comb.inputs['Y']); L(convex.outputs[0], comb.inputs['Z'])
        return comb.outputs[0]
    return _emit_material('orbkin_masks', build)


def form_material(key):
    k = Vector(key).normalized()
    def build(N, L):
        geo = N('ShaderNodeNewGeometry')
        sep = N('ShaderNodeSeparateXYZ'); L(geo.outputs['Normal'], sep.inputs[0])
        top = N('ShaderNodeMapRange'); top.inputs['From Min'].default_value = -1.0; top.inputs['From Max'].default_value = 1.0; L(sep.outputs['Z'], top.inputs['Value'])
        dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = k; L(geo.outputs['Normal'], dot.inputs[0])
        kf = N('ShaderNodeMath'); kf.operation = 'MULTIPLY_ADD'; kf.inputs[1].default_value = 0.5; kf.inputs[2].default_value = 0.5; L(dot.outputs['Value'], kf.inputs[0])
        comb = N('ShaderNodeCombineXYZ'); L(top.outputs[0], comb.inputs['X']); L(kf.outputs[0], comb.inputs['Y']); comb.inputs['Z'].default_value = 0.5
        return comb.outputs[0]
    return _emit_material('orbkin_form', build)


def pos_material(bmin, bsize):
    def build(N, L):
        geo = N('ShaderNodeNewGeometry')
        sub = N('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = Vector(bmin); L(geo.outputs['Position'], sub.inputs[0])
        div = N('ShaderNodeVectorMath'); div.operation = 'DIVIDE'; div.inputs[1].default_value = Vector(bsize); L(sub.outputs[0], div.inputs[0])
        return div.outputs[0]
    return _emit_material('orbkin_pos', build)


def _bake_low_emit(low, mat, size, out_path):
    keep = list(low.data.materials)
    low.data.materials.clear(); low.data.materials.append(mat)
    img = kit.new_image(mat.name + '_img', size, non_color=True)
    t = kit.bake('EMIT', low, img, high=None, samples=1, margin=4)
    kit.save_image(img, out_path)
    low.data.materials.clear()
    for m in keep:
        low.data.materials.append(m)
    return t


def bake_masks(high, low, out_dir, size=512, samples=16, key=(-0.5, -0.6, 0.8), crack_ao=0.25, contact_ao=0.7, material_id=0, neighbours=(), crack_scale=1.6, cage=0.1, max_ray=0.4):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    t_all = time.perf_counter()
    rep = {'size': size, 'samples': samples, 'key': list(key), 'crack_ao': crack_ao, 'contact_ao': contact_ao, 'cage': cage, 'max_ray': max_ray, 'load_avg_start': oc.loadavg()}
    lo0, hi0, s0 = kit.bbox(high); lo1, hi1, s1 = kit.bbox(low)
    if (lo0 - lo1).length > 0.5 * max(s0) or (hi0 - hi1).length > 0.5 * max(s0):
        raise RuntimeError(f'high and low do not overlap in world space (bake rays are world-space): high {tuple(lo0)}..{tuple(hi0)} low {tuple(lo1)}..{tuple(hi1)}')
    rep['bbox_min'] = [round(x, 4) for x in lo1]; rep['bbox_size'] = [round(x, 4) for x in s1]
    if not low.data.materials or low.data.materials[0] is None:
        low.data.materials.clear(); low.data.materials.append(kit.pbr('low_bake', '#808080'))
    for n in neighbours:
        n.hide_render = False
    high.hide_render = False
    keep_high = list(high.data.materials)
    high.data.materials.clear(); high.data.materials.append(mask_material(ao_distance=crack_ao, crack_scale=crack_scale))
    sc.cycles.use_denoising = False; sc.render.bake.use_clear = True
    img = kit.new_image('masks', size, non_color=True)
    rep['masks_seconds'] = kit.bake('EMIT', low, img, high=high, samples=samples, cage=cage, max_ray=max_ray, margin=4, ao_distance=crack_ao)
    px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
    cov = px[..., :3].sum(-1) > 0
    high.data.materials.clear()
    for m in keep_high:
        high.data.materials.append(m)
    # low-poly passes (no selected-to-active): form (top + key facing) and world position
    rep['form_seconds'] = _bake_low_emit(low, form_material(key), size, os.path.join(out_dir, 'form.png'))
    fp = np.array(bpy.data.images['orbkin_form_img'].pixels[:], np.float32).reshape(size, size, 4)
    rep['pos_seconds'] = _bake_low_emit(low, pos_material(lo1, [max(x, 1e-6) for x in s1]), size, os.path.join(out_dir, 'pos.png'))
    # contact AO (floor + neighbours) from the high, soft
    ao = kit.new_image('contact', size, non_color=True)
    rep['contact_seconds'] = kit.bake('AO', low, ao, high=high, samples=samples, cage=cage, max_ray=max_ray, margin=4, ao_distance=contact_ao)
    kit.save_image(ao, os.path.join(out_dir, 'contact.png')); kit.save_image(ao, os.path.join(out_dir, 'ao.png'))
    px[..., 0] = np.where(cov, 0.65 * fp[..., 0] + 0.35 * px[..., 0], px[..., 0])
    px[..., 3] = np.where(cov, (255 - 16 * material_id) / 255.0, 0.0)
    img.pixels = px.ravel()
    kit.save_image(img, os.path.join(out_dir, 'masks.png'))
    rep['total_seconds'] = round(time.perf_counter() - t_all, 2); rep['load_avg_end'] = oc.loadavg()
    rep['files'] = {k: os.path.join(out_dir, k + '.png') for k in ('masks', 'form', 'pos', 'contact', 'ao')}
    json.dump(rep, open(os.path.join(out_dir, 'bake.json'), 'w'), indent=1)
    return rep


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('blend'); ap.add_argument('--high', required=True); ap.add_argument('--low', required=True)
    ap.add_argument('--neighbours', default=''); ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=512); ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--key', default='-0.5,-0.6,0.8'); ap.add_argument('--crack-ao', type=float, default=0.25); ap.add_argument('--contact-ao', type=float, default=0.7)
    ap.add_argument('--cage', type=float, default=0.1); ap.add_argument('--max-ray', type=float, default=0.4); ap.add_argument('--material-id', type=int, default=0)
    ap.add_argument('--crack-scale', type=float, default=1.6)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    oc.deterministic_png()
    nb = [bpy.data.objects[n] for n in a.neighbours.split(',') if n]
    rep = bake_masks(bpy.data.objects[a.high], bpy.data.objects[a.low], a.out, a.size, a.samples, [float(x) for x in a.key.split(',')], a.crack_ao, a.contact_ao, a.material_id, nb, a.crack_scale, a.cage, a.max_ray)
    print(json.dumps(rep))
