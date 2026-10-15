"""build_template: creature body, path A (geometry swap): metaball blockout -> voxel -> QuadriFlow ->
numpy colour zones -> crisp bevelled parts (eyes, horn) -> _RIGP/_RIGK/_RIGB vertex attributes -> raw GLB.

  "$ORBKIN_BPY" -I build_template.py -- --out out_dir [--seed 3] [--faces 900] [--stage 1] [--name kin]
Edit metaballs(), ZONES and RIG for the species; everything else is the tested path (lab_creature.py,
creature-design.md 6, lab.md 2). Budgets: stage 1 <= 2,500 tris, stage 2 <= 3,500, stage 3 <= 4,500
(incl. eyes); one mesh, one material (vertex colours COLOR_0); eyes at surface + 0.3 x eye size along the
normal (0.08 sank under the remesh). Path A keeps CreatureView, the rig shader and the SpriteBaker:
the GLB only replaces the designs.ts geometry. Custom attributes export as _RIGP (pivot xyz, FLOAT_VECTOR),
_RIGK (kind: 0 body, 1 head, 2 tail, 3 ear, 4 leg; FLOAT), _RIGB (amp, phase, freq; FLOAT_VECTOR);
GLTFLoader lower-cases them (geometry.attributes._rigp). Then pack.mjs --preset static-pixel (no textures)
or animated when clips exist; a kin must win the in-game A/B and pass ip_check before it ships.
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import bpy, sys, os, json, time, math
HERE = os.path.dirname(os.path.abspath(__file__))
_tb = os.environ.get('ORBKIN_TOOLS_BIN', '')
for cand in (os.path.join(HERE, '..', 'scripts'), HERE, os.environ.get('ORBKIN_SKILL_SCRIPTS', ''), os.path.join(_tb, '..', '..', '..') if _tb else ''):
    if cand and os.path.exists(os.path.join(cand, 'kit.py')):
        sys.path.insert(0, os.path.abspath(cand)); break
else:
    raise SystemExit('kit.py not found: eval "$(bash <skill>/scripts/bootstrap.sh paths)" first, or set ORBKIN_SKILL_SCRIPTS=<skill>/scripts')
import numpy as np
import kit, orbkin_compat as oc
from mathutils import Vector, Matrix

PALETTE = {'back': '#c85a2e', 'belly': '#f6dba0', 'accent': '#2f8c9e', 'dark': '#1b1016', 'horn': '#efe9d6'}


def metaballs(mb, seed):
    """Blended volumes only (never intersecting primitives): body, head, snout, ears, legs, tail.
    Radii x1.25 / stiffness 2 so the parts FUSE (at x1.0 a creature came out as 8 shells)."""
    def ball(co, r, typ='BALL', size=None, stiff=2.0):
        e = mb.elements.new(type=typ); e.co = co; e.radius = r; e.stiffness = stiff
        if size:
            e.size_x, e.size_y, e.size_z = size
    ball((0.00, 0, 0.62), 0.60, 'ELLIPSOID', (1.15, 0.85, 0.85))
    ball((0.35, 0, 0.78), 0.45); ball((0.62, 0, 1.22), 0.52)
    for s in (-1, 1):
        ball((0.70, 0.26 * s, 1.08), 0.26)
    ball((0.98, 0, 1.10), 0.25, stiff=1.6)
    for s in (-1, 1):
        for i in range(5):
            f = i / 4; ball((0.48 - 0.26 * f, (0.30 + 0.10 * f) * s, 1.55 + 0.36 * f), 0.20 - 0.07 * f, stiff=1.5)
        for x in (-0.38, 0.42):
            for i in range(5):
                ball((x + 0.02 * i, 0.28 * s, 0.58 - 0.12 * i), 0.22 - 0.012 * i, stiff=1.6)
            ball((x + 0.09, 0.30 * s, 0.07), 0.17, 'ELLIPSOID', (1.4, 1.0, 0.7))
    for i in range(9):
        t = i / 8 * 2.6; ball((-0.48 - 0.38 * math.sin(t) * 0.9, 0, 0.66 + 0.55 * (1 - math.cos(t)) * 0.6), 0.24 - 0.016 * i, stiff=1.6)


ZONES = [  # (mask(co, nr) -> bool[nv], colour); hard thresholds for pixel-crisp blocks
    (lambda co, nr: ((nr[:, 2] < -0.25) & (co[:, 2] < 1.0)) | ((co[:, 0] > 0.55) & (co[:, 2] < 1.18) & (nr[:, 0] > 0.2)) | (co[:, 2] < co[:, 2].min() + 0.10), PALETTE['belly']),
    (lambda co, nr: ((co[:, 2] > 1.72) & (np.abs(co[:, 1]) > 0.25)) | ((co[:, 0] < -0.85) & (co[:, 2] > 1.05)), PALETTE['accent']),
]
RIG = [  # (mask(co) -> bool[nv], kind, pivot, amp, phase, freq): what the game's vertex rig wiggles
    (lambda co: co[:, 0] < -0.5, 2, (-0.5, 0, 0.7), 0.12, 0.0, 1.6),      # tail
    (lambda co: co[:, 2] > 1.5, 3, (0.48, 0, 1.5), 0.06, 1.0, 1.2),        # ears
    (lambda co: co[:, 0] > 0.5, 1, (0.55, 0, 1.05), 0.03, 0.5, 0.9),       # head
]


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', required=True); ap.add_argument('--seed', type=int, default=3); ap.add_argument('--faces', type=int, default=900)
    ap.add_argument('--stage', type=int, default=1); ap.add_argument('--name', default='kin'); ap.add_argument('--skip-sheets', action='store_true')
    a = ap.parse_args(argv)
    out = os.path.abspath(a.out); os.makedirs(out, exist_ok=True)
    budget = {1: 2500, 2: 3500, 3: 4500}[a.stage]
    rep = {'name': a.name, 'seed': a.seed, 'stage': a.stage, 'budget_tris': budget, 'timings': {}, 'bpy': bpy.app.version_string}
    T = time.perf_counter()
    def lap(k):
        rep['timings'][k] = round(time.perf_counter() - T, 2); print(k, rep['timings'][k], 's', flush=True)
    sc = oc.fresh_scene()
    mb = bpy.data.metaballs.new(a.name + '_mb'); mb.resolution = mb.render_resolution = 0.035; mb.threshold = 0.5
    metaballs(mb, a.seed)
    mo = bpy.data.objects.new(a.name + '_mbobj', mb); sc.collection.objects.link(mo)
    kit.activate(mo); oc.ops_ok(bpy.ops.object.convert(target='MESH'), 'convert metaball')
    body = bpy.context.object; body.name = a.name
    if kit.components(body) != 1:
        raise RuntimeError(f'metaball blockout is {kit.components(body)} shells: raise radii x1.25 / stiffness 2 so parts fuse')
    kit.voxel_remesh(body, 0.012)
    rep['high'] = {'tris': kit.tri_count(body)}
    lap('blockout+voxel')
    kit.quadriflow(body, a.faces)
    rep['low'] = {'tris': kit.tri_count(body), **kit.mesh_manifold_report(body)}
    lap('quadriflow')
    mat = kit.pbr(a.name + '_mat', '#ffffff', roughness=0.55, vertex_color='Col'); kit.assign(body, mat)
    kit.zones_numpy(body, PALETTE['back'], ZONES)
    # crisp parts: eyes (dark ellipsoid + white glint) and a horn; bevelled, flat/smooth as fits
    parts = []
    co, nr, lv = kit.mesh_arrays(body)
    for s in (-1, 1):
        target = np.array([0.98, 0.25 * s, 1.30]); i = np.argmin(((co - target) ** 2).sum(1))
        p = co[i] + nr[i] * 0.3 * 0.11  # surface + 0.3 x eye size along the normal
        e = kit.ellipsoid('eye', (0.06, 0.09, 0.12), tuple(p), segments=12, rings=8); parts.append((e, PALETTE['dark']))
        g = kit.ellipsoid('glint', (0.03, 0.03, 0.03), tuple(p + nr[i] * 0.08 + np.array([0.0, -0.02 * s, 0.03])), segments=6, rings=4); parts.append((g, '#ffffff'))
    horn = kit.cone('horn', 0.075, 0.01, 0.45, (0.76, 0, 1.68), (0.35, 0, 0), segments=8); kit.bevel_normals(horn, 0.008, 1); parts.append((horn, PALETTE['horn']))
    for o, colour in parts:
        kit.apply_transforms(o)
        kit.zones_numpy(o, colour, [])
        for p in o.data.polygons:
            p.use_smooth = True
    # rig attributes on the body before joining (parts inherit the nearest kind at join by position)
    me = body.data; nv = len(me.vertices)
    rigp = np.zeros((nv, 3), np.float32); rigk = np.zeros(nv, np.float32); rigb = np.zeros((nv, 3), np.float32)
    for mask, kind, pivot, amp, phase, freq in RIG:
        m = mask(co); rigp[m] = pivot; rigk[m] = kind; rigb[m] = (amp, phase, freq)
    for name, data, typ in (('_RIGP', rigp, 'FLOAT_VECTOR'), ('_RIGK', rigk, 'FLOAT'), ('_RIGB', rigb, 'FLOAT_VECTOR')):
        at = me.attributes.new(name, typ, 'POINT'); at.data.foreach_set('vector' if typ == 'FLOAT_VECTOR' else 'value', data.ravel())
    for o, _ in parts:  # same attributes on the parts: eyes/horn follow the head
        pm = o.data; n = len(pm.vertices)
        for name, val, typ in (('_RIGP', (0.55, 0, 1.05), 'FLOAT_VECTOR'), ('_RIGK', 1.0, 'FLOAT'), ('_RIGB', (0.03, 0.5, 0.9), 'FLOAT_VECTOR')):
            at = pm.attributes.new(name, typ, 'POINT'); at.data.foreach_set('vector' if typ == 'FLOAT_VECTOR' else 'value', np.tile(np.array(val, np.float32), n).ravel())
    body = kit.join([body] + [o for o, _ in parts], a.name)
    kit.assign(body, mat)
    me = body.data; me.color_attributes.active_color = me.color_attributes['Col']
    bpy.context.view_layer.update()
    zmin = min((body.matrix_world @ v.co).z for v in me.vertices); me.transform(Matrix.Translation((0, 0, -zmin)))  # feet on y=0 (glTF Y-up)
    rep['final'] = {'tris': kit.tri_count(body), 'verts': len(me.vertices), 'islands': len(kit.islands(body)), 'attributes': sorted(at.name for at in me.attributes if at.name.startswith('_'))}
    if rep['final']['tris'] > budget:
        raise RuntimeError(f"{rep['final']['tris']} tris > stage {a.stage} budget {budget}: lower --faces")
    lap('parts+zones+rig')
    if not a.skip_sheets:
        kit.contact_sheet([body], os.path.join(out, f'{a.name}_sheet.png'), res=256, color_type='VERTEX')
        kit.contact_sheet([body], os.path.join(out, f'{a.name}_sheet_cycles.png'), res=256, engine='CYCLES', samples=8)
        lap('sheets')
    raw = os.path.join(out, f'{a.name}_raw.glb')
    rep['export'] = {'raw_glb': raw, 'bytes': oc.export_glb(raw, [body], export_vertex_color='MATERIAL', export_attributes=True)}
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out, f'{a.name}.blend'))
    rep['total_seconds'] = round(time.perf_counter() - T, 2); rep['load_avg'] = oc.loadavg()
    json.dump(rep, open(os.path.join(out, 'report.json'), 'w'), indent=1, default=str)
    print(json.dumps(rep, default=str))
    print(f'NEXT: node <skill>/scripts/pack.mjs {raw} {os.path.join(out, a.name + ".glb")} --preset static-pixel --validate && python3 <skill>/scripts/glbinfo.py {os.path.join(out, a.name + ".glb")} --max-tris {budget} --one-mesh --one-material --require-attrs POSITION,NORMAL,COLOR_0,_RIGP,_RIGK,_RIGB')


if __name__ == '__main__':
    main(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
