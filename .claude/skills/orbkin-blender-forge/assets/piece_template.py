"""piece_template: an environment hero piece, end to end (copy this file next to your work, edit
blockout() and PIECE, run it; everything else is the tested path).

  "$ORBKIN_BPY" -I piece_template.py -- --out out_dir [--seed 7] [--atlas 256] [--tris 5000] [--ramp boulder]
      [--voxel 0.02] [--fillet 4] [--low voxel|chisel] [--low-voxel 0.06] [--bake 512] [--no-bake] [--skip-sheets]

Path (modelling.md form/retopo/detail; procedural-texturing masks->rules):
  blockout (boxes/ellipsoids/capsules + cutters) -> join -> SDF fuse (+ DIFFERENCE cuts) -> rock displacement
  = HIGH (100-300k tris) -> LOW = voxel remesh at --low-voxel then decimate to --tris (or chisel: planar dissolve,
  faceted) -> block-local texel-aligned UVs at 16 texels/unit -> uv_check (16 +/- 0.5) -> mask bake with the
  floor/neighbours present -> compose to the ramp atlas (PNG, <= 7 colours) -> raw GLB (one mesh, one material,
  backface culling, nearest sampler) -> contact sheets (Workbench) + Cycles beauty -> report.json.
Then (outside Blender): pack.mjs --preset static-pixel, glbinfo.py asserts, shoot.mjs, manifest.py.
Everything is deterministic for a seed; timings and load average are logged in report.json.
"""
import bpy, sys, os, json, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
for cand in (os.path.join(HERE, '..', 'scripts'), HERE, os.environ.get('ORBKIN_SKILL_SCRIPTS', '')):
    if cand and os.path.exists(os.path.join(cand, 'kit.py')):
        sys.path.insert(0, os.path.abspath(cand)); break
else:
    raise SystemExit('kit.py not found: set ORBKIN_SKILL_SCRIPTS=<skill>/scripts or keep this file under <skill>/assets')
import kit, gn, orbkin_compat as oc
from uv_blocks import block_uvs
from uv_check import density_report
from bake_masks import bake_masks

PIECE = {
    'name': 'ledge',                 # file stem
    'size': (3.0, 1.2, 1.4),         # x (width), y (depth), z (height) in world units; sized for its arena slot
    'floor': True,                   # a floor plane under the piece so AO gets a contact shadow at the base
}


def blockout(seed):
    """Primary masses only. Return (parts_to_union, cutters_to_subtract). Parts must OVERLAP (the SDF
    fuses them); every part is a kit primitive placed in world units with z up and the base at z = 0."""
    W, D, H = PIECE['size']
    parts = [
        kit.box('base', (W, D, H * 0.45), (0, 0, H * 0.225)),
        kit.ellipsoid('b1', (W * 0.26, D * 0.55, H * 0.36), (-W * 0.22, 0, H * 0.62)),
        kit.ellipsoid('b2', (W * 0.22, D * 0.5, H * 0.30), (W * 0.2, D * 0.05, H * 0.66)),
        kit.capsule('b3', D * 0.25, W * 0.3, (W * 0.05, -D * 0.1, H * 0.9), (0, math.pi / 2, 0.3)),
    ]
    cutters = [kit.ellipsoid('bite', (W * 0.14, D * 0.4, H * 0.22), (W * 0.42, D * 0.2, H * 0.5))]
    return parts, cutters


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', required=True); ap.add_argument('--seed', type=int, default=7); ap.add_argument('--atlas', type=int, default=256)
    ap.add_argument('--tris', type=int, default=5000); ap.add_argument('--ramp', default='boulder'); ap.add_argument('--voxel', type=float, default=0.02)
    ap.add_argument('--fillet', type=int, default=4); ap.add_argument('--low', default='voxel'); ap.add_argument('--low-voxel', type=float, default=0.06)
    ap.add_argument('--bake', type=int, default=512); ap.add_argument('--no-bake', action='store_true'); ap.add_argument('--skip-sheets', action='store_true')
    ap.add_argument('--angle', type=float, default=16.0)
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out); os.makedirs(out, exist_ok=True)
    name = PIECE['name']
    rep = {'name': name, 'seed': a.seed, 'args': vars(a), 'timings': {}, 'load_avg_start': oc.loadavg(), 'bpy': bpy.app.version_string}
    T = time.perf_counter()
    def lap(k):
        rep['timings'][k] = round(time.perf_counter() - T, 2); print(k, rep['timings'][k], 's', flush=True)

    sc = oc.fresh_scene()
    mat = kit.pbr(f'{name}_mat', '#83502f', roughness=0.9)
    parts, cutters = blockout(a.seed)
    high = kit.join(parts, 'High'); kit.assign(high, mat)          # material BEFORE booleans / GN
    for c in cutters:
        kit.apply_transforms(c)
    rep['blockout'] = {'parts': len(parts), 'cutters': len(cutters), 'tris': kit.tri_count(high), 'components_before_fuse': kit.components(high)}
    if not a.skip_sheets:
        kit.contact_sheet([high] + cutters, os.path.join(out, f'{name}_s2_blockout.png'), res=256)
    lap('blockout')

    gn.sdf_fuse(high, voxel=a.voxel, fillet=a.fillet, cut_objects=cutters)
    for c in cutters:
        bpy.data.objects.remove(c)
    if kit.components(high) != 1:
        raise RuntimeError(f'fused high poly has {kit.components(high)} shells: parts must overlap')
    gn.displace_rock(high, seed=a.seed)
    rep['high'] = {'tris': kit.tri_count(high), 'bbox': [round(x, 3) for x in kit.bbox(high)[2]], **kit.mesh_manifold_report(high)}
    lap('sdf+displace')

    low = high.copy(); low.data = high.data.copy(); low.name = 'Low'; sc.collection.objects.link(low)
    kit.voxel_remesh(low, a.low_voxel)
    if a.low == 'chisel':
        kit.chisel(low, angle_deg=12)
    if kit.tri_count(low) > a.tris:
        kit.decimate(low, a.tris)
    kit.assign(low, mat)
    rep['low'] = {'mode': a.low, 'tris': kit.tri_count(low), 'bbox': [round(x, 3) for x in kit.bbox(low)[2]], **kit.mesh_manifold_report(low)}
    dev = max(abs(rep['low']['bbox'][i] - rep['high']['bbox'][i]) / rep['high']['bbox'][i] for i in range(3))
    rep['low']['bbox_deviation'] = round(dev, 4)
    if dev > 0.02:
        raise RuntimeError(f'low poly bbox deviates {dev:.1%} from the high poly')
    lap('low')

    atlas = a.atlas
    while True:
        try:
            rep['uv'] = block_uvs(low, atlas, 16.0, a.angle); break
        except RuntimeError as e:
            if atlas >= 512:
                raise
            print(f'{e} -> retrying with atlas {atlas * 2}', flush=True); atlas *= 2
    a.atlas = atlas; rep['atlas'] = atlas
    rep['uv_check'] = density_report(low, atlas, 16.0, 0.5)
    if not rep['uv_check']['pass']:
        raise RuntimeError(f"texel density outside 16 +/- 0.5: {rep['uv_check']}")
    lap('uv')

    floor = None
    if PIECE['floor']:
        W, D, H = PIECE['size']
        floor = kit.box('Floor', (W * 3, D * 3, 0.05), (0, 0, -0.025)); kit.apply_transforms(floor); kit.assign(floor, kit.pbr('floor', '#9a7049'))
    if not a.skip_sheets:
        kit.contact_sheet([low], os.path.join(out, f'{name}_s3_low.png'), res=256)
    atlas_png = os.path.join(out, f'{name}_atlas.png')
    if not a.no_bake:
        mrep = bake_masks(high, low, os.path.join(out, 'masks'), size=a.bake, samples=16, neighbours=[floor] if floor else [])
        rep['bake'] = mrep
        lap('bake')
        import subprocess
        ramps = os.path.join(os.path.dirname(os.path.abspath(kit.__file__)), '..', 'assets', 'ramps.json')
        cmd = [sys.executable if 'python' in os.path.basename(sys.executable) else 'python3', '-I', os.path.join(os.path.dirname(os.path.abspath(kit.__file__)), 'compose.py'),
               mrep['files']['masks'], '--ramps', ramps, '--ramp', a.ramp, '--factor', str(max(1, a.bake // a.atlas)), '--out', atlas_png, '--mips', '--report', os.path.join(out, f'{name}_atlas.json')]
        try:
            r = subprocess.run(cmd, capture_output=True, text=True, check=True); rep['compose'] = json.loads(r.stdout.strip().splitlines()[-1])
        except Exception as e:
            rep['compose'] = {'error': f'{e}; run compose.py by hand with python3 (needs numpy + Pillow)', 'cmd': ' '.join(cmd)}
            raise
        lap('compose')
        img = bpy.data.images.load(atlas_png); img.colorspace_settings.name = 'sRGB'
        final = kit.pbr(f'{name}_px', '#ffffff', roughness=0.95, image=img)
        kit.assign(low, final)
    # export: one mesh, one material, backface culling (set in pbr), raw GLB, textures embedded
    high.hide_render = True; high.hide_viewport = True
    raw = os.path.join(out, f'{name}_raw.glb')
    rep['export'] = {'raw_glb': raw, 'bytes': oc.export_glb(raw, [low], export_image_format='AUTO')}
    lap('export')
    if not a.skip_sheets:
        kit.contact_sheet([low], os.path.join(out, f'{name}_s4_atlas_sheet.png'), res=320, color_type='TEXTURE')
        kit.camera_fit([low], 30, 28, ortho=False, res=512)
        if not any(o.type == 'LIGHT' for o in sc.objects):
            kit.three_point(max(kit.bbox(low)[2]), key=(2, -3, 4))
        oc.new_world(0.4, (0.35, 0.4, 0.55))
        floor_v = floor.hide_render if floor else None
        rep['beauty'] = {'file': os.path.join(out, f'{name}_beauty.png'), 'seconds': kit.render(os.path.join(out, f'{name}_beauty.png'), samples=32, res=512)}
        lap('sheets')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{name}.blend'))
    rep['load_avg_end'] = oc.loadavg(); rep['total_seconds'] = round(time.perf_counter() - T, 2)
    json.dump(rep, open(os.path.join(out, 'report.json'), 'w'), indent=1, default=str)
    print(json.dumps({k: rep[k] for k in ('name', 'high', 'low', 'uv', 'timings', 'total_seconds')}, default=str))
    print(f'NEXT: node <skill>/scripts/pack.mjs {raw} {os.path.join(out, name + ".glb")} --preset static-pixel --validate')


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
