#!/usr/bin/env python
"""Headless Blender (bpy 5.2 LTS, Cycles CPU) sources for pixel flipbooks: electric arc, splash, fire.

  "$ORBKIN_BPY" -I blender_fx.py -- arc|splash|fire OUT_DIR [--size 96] [--frames 12] [--spp 1] [--seed 7]
                                        [--aspect 2:3] [--no-blanks]

Renders OUT_DIR/f00.png .. (RGBA, transparent film, orthographic camera, view transform Standard)
for book_from_renders.py. Modes and what they cost here (4-core cloud box, no GPU):
  arc     midpoint-displaced polylines (depth 5, roughness 0.42) re-seeded every 2 frames, 1-3
          branches, bevelled curves: a thin white core over a wider yellow glow; electric "on twos":
          blank frames at 2 and 5 and every other frame after 60 % (--no-blanks keeps them).
          Emission only, so --spp 1 is enough: ~0.3 s for 12 frames at 128 px.
  splash  metaballs per frame (no fluid sim): a column h = 1.9 sin(pi t / 0.75)^0.8, a 20x4 crown ring
          flaring out and up, 34 ballistic droplets (g = 9) with 3-ball tails, a base pool; Principled
          under a sun lamp, 8 spp: ~2 s for 12 frames at 128 px.
  fire    a cube with a procedural volume: 4D noise (scale 4.2, detail 4, W = 2.5 t), radial falloff
          1 - |p - c(t)| / R(t), R(t) = 0.18 + 0.72 (1 - (1 - 1.6 t)^3), burn-out ((t - 0.25) / 0.75)^1.2 * 1.45,
          heat -> ColorRamp (black, ember red, orange, yellow, cream) -> Emission x60 + a little absorption.
          ~7 s per frame at 128 px / 8 spp: use --size 96 --spp 6 for a first look.
Mantaflow does NOT work in the pip bpy module (LevelsetGrid.setConst abort): do not plan on it.
Pure Blender output reads as a blob; book_from_renders.py + hand-ruled impact frames make it authored.
ORBKIN_BPY: the Blender-python interpreter (a venv with bpy==5.2.2). Exit 2 on usage errors.
"""
import math, os, random, sys

try:
    import bpy
    from mathutils import Vector
except ImportError:
    sys.exit('blender_fx: run this with the Blender python: "$ORBKIN_BPY" -I blender_fx.py -- MODE OUT_DIR '
             '(ORBKIN_BPY = a venv python with bpy==5.2.2; create one with: python3.13 -m venv DIR && DIR/bin/pip install bpy==5.2.2)')


def args():
    av = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if len(av) < 2 or av[0] not in ('arc', 'splash', 'fire'):
        print(__doc__); sys.exit(2)
    o = {'size': 96, 'frames': 12, 'spp': {'arc': 1, 'splash': 8, 'fire': 8}[av[0]], 'seed': 7, 'aspect': None, 'blanks': True}
    i = 2
    while i < len(av):
        k = av[i].lstrip('-')
        if k == 'no-blanks':
            o['blanks'] = False; i += 1; continue
        o[k] = av[i + 1]; i += 2
    o['size'] = int(o['size']); o['frames'] = int(o['frames']); o['spp'] = int(o['spp']); o['seed'] = int(o['seed'])
    return av[0], av[1], o


def fresh_scene(size_w, size_h, spp, seed):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = spp
    sc.cycles.use_denoising = False
    sc.cycles.seed = seed
    sc.render.resolution_x, sc.render.resolution_y = size_w, size_h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    sc.render.filter_size = 1.0
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0, 0, 0, 1); bg.inputs[1].default_value = 0
    cam_d = bpy.data.cameras.new('cam'); cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, -10, 0); cam.rotation_euler = (math.pi / 2, 0, 0)
    return sc, cam


def emission(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1); em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


# ------------------------------------------------------------------ arc

def midpoint_line(a, b, depth, rough, rng):
    pts = [a, b]
    amp = (b - a).length * rough
    for _ in range(depth):
        nxt = [pts[0]]
        for p, q in zip(pts, pts[1:]):
            m = (p + q) / 2
            m.x += rng.uniform(-amp, amp); m.z += rng.uniform(-amp, amp) * 0.35
            nxt += [m, q]
        pts = nxt; amp *= 0.5
    return pts


def curve_obj(name, polylines, bevel, mat, y):
    cd = bpy.data.curves.new(name, 'CURVE'); cd.dimensions = '3D'
    cd.bevel_depth = bevel; cd.bevel_resolution = 2; cd.fill_mode = 'FULL'
    for pts in polylines:
        sp = cd.splines.new('POLY'); sp.points.add(len(pts) - 1)
        for p, v in zip(sp.points, pts):
            p.co = (v.x, y, v.z, 1)
    ob = bpy.data.objects.new(name, cd); ob.data.materials.append(mat)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def arc(out, o):
    w = o['size']; h = o['size']
    if o['aspect']:
        aw, ah = (int(v) for v in o['aspect'].split(':')); w = int(o['size'] * aw / ah)
    sc, cam = fresh_scene(w, h, o['spp'], o['seed'])
    cam.data.ortho_scale = 2.2 * max(1, h / w)
    # Core clips to white, the glow stays yellow (luminance ~0.8), so the ramp bands separate them.
    core = emission('core', (1, 1, 1), 20)
    glow = emission('glow', (1, 0.85, 0.25), 1.0)
    rng = random.Random(o['seed'])
    n = o['frames']
    blanks = set()
    if o['blanks']:
        blanks |= {2, 5} | {f for f in range(int(n * 0.6), n) if (f - int(n * 0.6)) % 2 == 1}
    lines = None
    for f in range(n):
        for ob in [x for x in sc.collection.objects if x.type == 'CURVE']:
            bpy.data.objects.remove(ob, do_unlink=True)
        if f in blanks:
            render(sc, os.path.join(out, f'f{f:02d}.png')); continue
        if f % 2 == 0 or lines is None:
            top = Vector((rng.uniform(-0.2, 0.2), 0, 1.0)); bot = Vector((0, 0, -0.95))
            main = midpoint_line(top, bot, 5, 0.42, rng)
            lines = [main]
            for _ in range(rng.randint(1, 3)):
                i = rng.randint(len(main) // 4, 3 * len(main) // 4)
                a = main[i]; b = a + Vector((rng.uniform(-0.6, 0.6), 0, rng.uniform(-0.6, -0.1)))
                lines.append(midpoint_line(a, b, 3, 0.4, rng))
        fade = 1.0 if f < n * 0.6 else max(0.25, 1 - (f - n * 0.6) / (n * 0.4))
        curve_obj('glow', lines, 0.075 * fade, glow, 0.05)
        curve_obj('core', lines, 0.028 * fade, core, 0.0)
        render(sc, os.path.join(out, f'f{f:02d}.png'))


# ------------------------------------------------------------------ splash

def splash(out, o):
    sc, cam = fresh_scene(o['size'], o['size'], o['spp'], o['seed'])
    cam.data.ortho_scale = 3.0
    sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 4.0
    sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
    mat = bpy.data.materials.new('water'); mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    if p:
        p.inputs['Base Color'].default_value = (0.25, 0.6, 1.0, 1); p.inputs['Roughness'].default_value = 0.2
    rng = random.Random(o['seed'])
    drops = [(rng.uniform(-1, 1), rng.uniform(2.0, 4.2), rng.uniform(-0.6, 0.6)) for _ in range(34)]
    n = o['frames']
    for f in range(n):
        for ob in [x for x in sc.collection.objects if x.type == 'META']:
            bpy.data.objects.remove(ob, do_unlink=True)
        t = f / max(1, n - 1)
        mb = bpy.data.metaballs.new('splash'); mb.resolution = 0.06; mb.threshold = 0.35
        ob = bpy.data.objects.new('splash', mb); sc.collection.objects.link(ob); ob.data.materials.append(mat)
        def ball(x, z, r):
            e = mb.elements.new(); e.co = (x, 0, z); e.radius = r
        col = 1.9 * max(0, math.sin(math.pi * min(t, 0.75) / 0.75)) ** 0.8
        for k in range(8):
            ball(0, -1.2 + col * k / 8, 0.28 - 0.02 * k)
        for i in range(20):
            a = i / 20 * 2 * math.pi
            for k in range(4):
                s = min(1, t * 1.6) * (0.4 + 0.25 * k)
                ball(math.cos(a) * s * 1.1, -1.2 + 0.35 * k * min(1, t * 1.6) + 0.15, 0.16)
        for (vx, vz, x0) in drops:
            for k in range(3):
                tt = max(0, t - 0.06 * k)
                x = x0 + vx * tt; z = -1.0 + vz * tt - 0.5 * 9 * tt * tt
                if z > -1.25:
                    ball(x, z, 0.12 - 0.02 * k)
        ball(0, -1.35, 0.5 + 0.3 * t)
        render(sc, os.path.join(out, f'f{f:02d}.png'))


# ------------------------------------------------------------------ fire

def fire(out, o):
    sc, cam = fresh_scene(o['size'], o['size'], o['spp'], o['seed'])
    cam.data.ortho_scale = 2.4
    bpy.ops.mesh.primitive_cube_add(size=2.2)
    cube = bpy.context.active_object
    mat = bpy.data.materials.new('fire'); mat.use_nodes = True
    nt = mat.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    out_n = N('ShaderNodeOutputMaterial')
    tex = N('ShaderNodeTexCoord')
    noise = N('ShaderNodeTexNoise'); noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 4.2; noise.inputs['Detail'].default_value = 4
    L(tex.outputs['Object'], noise.inputs['Vector'])
    # radial falloff: 1 - |p - c| / R
    sub = N('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'
    L(tex.outputs['Object'], sub.inputs[0])
    length = N('ShaderNodeVectorMath'); length.operation = 'LENGTH'; L(sub.outputs[0], length.inputs[0])
    div = N('ShaderNodeMath'); div.operation = 'DIVIDE'; L(length.outputs['Value'], div.inputs[0])
    fall = N('ShaderNodeMath'); fall.operation = 'SUBTRACT'; fall.inputs[0].default_value = 1.0; L(div.outputs[0], fall.inputs[1])
    nmul = N('ShaderNodeMath'); nmul.operation = 'MULTIPLY_ADD'; nmul.inputs[1].default_value = 1.6; nmul.inputs[2].default_value = -0.8
    L(noise.outputs['Fac'], nmul.inputs[0])
    heat0 = N('ShaderNodeMath'); heat0.operation = 'ADD'; L(fall.outputs[0], heat0.inputs[0]); L(nmul.outputs[0], heat0.inputs[1])
    heat = N('ShaderNodeMath'); heat.operation = 'SUBTRACT'; L(heat0.outputs[0], heat.inputs[0])
    ramp = N('ShaderNodeValToRGB'); L(heat.outputs[0], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    stops = [(0.0, (0, 0, 0)), (0.18, (0.35, 0.02, 0.0)), (0.4, (1.0, 0.25, 0.02)), (0.65, (1.0, 0.7, 0.1)), (0.9, (1.0, 0.95, 0.75))]
    while len(els) < len(stops):
        els.new(0.5)
    for e, (pos, c) in zip(els, stops):
        e.position = pos; e.color = (*c, 1)
    em = N('ShaderNodeEmission'); L(ramp.outputs['Color'], em.inputs['Color'])
    strength = N('ShaderNodeMath'); strength.operation = 'MULTIPLY'; strength.inputs[1].default_value = 60
    L(heat.outputs[0], strength.inputs[0]); L(strength.outputs[0], em.inputs['Strength'])
    absorb = N('ShaderNodeVolumeAbsorption'); absorb.inputs['Density'].default_value = 0.6
    add = N('ShaderNodeAddShader'); L(em.outputs[0], add.inputs[0]); L(absorb.outputs[0], add.inputs[1])
    L(add.outputs[0], out_n.inputs['Volume'])
    cube.data.materials.append(mat)
    n = o['frames']
    for f in range(n):
        t = f / max(1, n - 1)
        R = 0.18 + 0.72 * (1 - (1 - min(1, 1.6 * t)) ** 3)
        D = (max(0, (t - 0.25) / 0.75) ** 1.2) * 1.45
        noise.inputs['W'].default_value = 2.5 * t
        sub.inputs[1].default_value = (0, 0, -0.2 + 0.5 * t)
        div.inputs[1].default_value = R
        heat.inputs[1].default_value = D
        render(sc, os.path.join(out, f'f{f:02d}.png'))


if __name__ == '__main__':
    mode, out, o = args()
    os.makedirs(out, exist_ok=True)
    {'arc': arc, 'splash': splash, 'fire': fire}[mode](out, o)
    print(f'blender_fx: {mode} -> {out} ({o["frames"]} frames, {o["size"]} px, {o["spp"]} spp, seed {o["seed"]})')
