"""bake_masks: bake form masks (not colours) from a high poly onto a low poly's UV atlas, with the
neighbours present so AO lands where pieces meet. One Cycles EMIT bake does it all.

  "$ORBKIN_BPY" -I bake_masks.py -- in.blend --high Hi --low Low [--neighbours Floor,Wall] \
      --out masks_dir --size 512 [--samples 16] [--ao-distance 0.7] [--cage 0.1] [--max-ray 0.4] [--material-id 0]
Writes <out>/masks.png (RGBA, Non-Color):
  R = top-facing   (0.65 x LOW-poly normal z + 0.35 x high-poly normal z, 0..1: the big-form light
                    term plus a little per-plate variation; pure high-poly facing read as camouflage)
  G = cavity       (max(1 - AO with neighbours, cracks); dark seams, contact crevices)
  B = convexity    (Cycles Pointiness, high poly; lit lips / chipped edges)
  A = 255 - 16 * material id (0 = unbaked texel); one bake per material, compose.py picks the ramp per id
plus <out>/ao.png and <out>/bake.json (timings, load average, settings). Bake at 2x the final atlas
(512 for a 256 atlas) and let compose.py reduce it; 16 spp is enough for masks.
Rules enforced here: pass toggles reset before baking; low poly selected+active, high selected,
neighbours only renderable (never selected); masks to a Non-Color image; margin 4 px EXTEND;
rays are world-space so high and low must overlap (the script checks their bounding boxes).
"""
import bpy, sys, os, json, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit, orbkin_compat as oc


def mask_material(name='orbkin_masks', ao_distance=0.7, crack_scale=1.6, crack_width=0.03, pointy_lo=0.5, pointy_hi=0.56, material_id=0):
    """Emission shader whose colour is (top-facing, cavity, convexity) and alpha = material id."""
    m = bpy.data.materials.new(name)
    nt = m.node_tree; nt.nodes.clear(); N, L = nt.nodes.new, nt.links.new
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
    em = N('ShaderNodeEmission'); L(comb.outputs[0], em.inputs['Color'])
    out = N('ShaderNodeOutputMaterial'); L(em.outputs[0], out.inputs['Surface'])
    m['orbkin_material_id'] = material_id
    return m


def bake_masks(high, low, out_dir, size=512, samples=16, ao_distance=0.7, cage=0.1, max_ray=0.4, material_id=0, neighbours=(), crack_scale=1.6):
    os.makedirs(out_dir, exist_ok=True)
    sc = bpy.context.scene
    t_all = time.perf_counter(); rep = {'size': size, 'samples': samples, 'ao_distance': ao_distance, 'cage': cage, 'max_ray': max_ray, 'load_avg_start': oc.loadavg()}
    lo0, hi0, s0 = kit.bbox(high); lo1, hi1, s1 = kit.bbox(low)
    if (lo0 - lo1).length > 0.5 * max(s0) or (hi0 - hi1).length > 0.5 * max(s0):
        raise RuntimeError(f'high and low do not overlap in world space (bake rays are world-space): high {tuple(lo0)}..{tuple(hi0)} low {tuple(lo1)}..{tuple(hi1)}')
    keep_high_mats = list(high.data.materials)
    mm = mask_material(ao_distance=ao_distance, material_id=material_id, crack_scale=crack_scale)
    high.data.materials.clear(); high.data.materials.append(mm)
    if not low.data.materials or low.data.materials[0] is None:
        low.data.materials.clear(); low.data.materials.append(kit.pbr('low_bake', '#808080'))
    for n in neighbours:
        n.hide_render = False
    high.hide_render = False
    img = kit.new_image('masks', size, non_color=True)
    sc.cycles.use_denoising = False
    sc.render.bake.use_clear = True
    t = kit.bake('EMIT', low, img, high=high, samples=samples, cage=cage, max_ray=max_ray, margin=4, ao_distance=ao_distance)
    rep['emit_seconds'] = t
    import numpy as np
    px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
    cov = px[..., :3].sum(-1) > 0
    # form term: the LOW poly's own normal (smooth, per facet) so the value read follows the big form,
    # not the per-texel displacement noise of the high poly (that noise read as camouflage)
    low_mats = list(low.data.materials)
    fm = bpy.data.materials.new('orbkin_form'); nt = fm.node_tree; nt.nodes.clear()
    g = nt.nodes.new('ShaderNodeNewGeometry'); sp = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(g.outputs['Normal'], sp.inputs[0])
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = -1.0; mr.inputs['From Max'].default_value = 1.0; nt.links.new(sp.outputs['Z'], mr.inputs['Value'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(mr.outputs[0], em.inputs['Color'])
    ou = nt.nodes.new('ShaderNodeOutputMaterial'); nt.links.new(em.outputs[0], ou.inputs['Surface'])
    low.data.materials.clear(); low.data.materials.append(fm)
    form = kit.new_image('form', size, non_color=True)
    rep['form_seconds'] = kit.bake('EMIT', low, form, high=None, samples=1, margin=4)
    fp = np.array(form.pixels[:], np.float32).reshape(size, size, 4)
    low.data.materials.clear()
    for m in low_mats:
        low.data.materials.append(m)
    px[..., 0] = np.where(cov, 0.65 * fp[..., 0] + 0.35 * px[..., 0], px[..., 0])   # R = form (low) + plates (high)
    px[..., 3] = np.where(cov, (255 - 16 * material_id) / 255.0, 0.0)  # alpha 0 = unbaked; id = (255 - alpha) / 16
    img.pixels = px.ravel()
    kit.save_image(img, os.path.join(out_dir, 'masks.png'))
    kit.save_image(form, os.path.join(out_dir, 'form.png'))
    # a plain AO bake for inspection / the composer's optional second AO term
    ao = kit.new_image('ao', size, non_color=True)
    t = kit.bake('AO', low, ao, high=high, samples=samples, cage=cage, max_ray=max_ray, margin=4, ao_distance=ao_distance)
    rep['ao_seconds'] = t
    kit.save_image(ao, os.path.join(out_dir, 'ao.png'))
    high.data.materials.clear()
    for m in keep_high_mats:
        high.data.materials.append(m)
    rep['total_seconds'] = round(time.perf_counter() - t_all, 2); rep['load_avg_end'] = oc.loadavg()
    rep['files'] = {'masks': os.path.join(out_dir, 'masks.png'), 'ao': os.path.join(out_dir, 'ao.png')}
    json.dump(rep, open(os.path.join(out_dir, 'bake.json'), 'w'), indent=1)
    return rep


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('blend'); ap.add_argument('--high', required=True); ap.add_argument('--low', required=True)
    ap.add_argument('--neighbours', default=''); ap.add_argument('--out', required=True)
    ap.add_argument('--size', type=int, default=512); ap.add_argument('--samples', type=int, default=16)
    ap.add_argument('--ao-distance', type=float, default=0.7); ap.add_argument('--cage', type=float, default=0.1)
    ap.add_argument('--max-ray', type=float, default=0.4); ap.add_argument('--material-id', type=int, default=0)
    ap.add_argument('--crack-scale', type=float, default=1.6)
    a = ap.parse_args(argv)
    bpy.ops.wm.open_mainfile(filepath=os.path.abspath(a.blend))
    oc.deterministic_png()
    nb = [bpy.data.objects[n] for n in a.neighbours.split(',') if n]
    rep = bake_masks(bpy.data.objects[a.high], bpy.data.objects[a.low], a.out, a.size, a.samples, a.ao_distance, a.cage, a.max_ray, a.material_id, nb, a.crack_scale)
    print(json.dumps(rep))
