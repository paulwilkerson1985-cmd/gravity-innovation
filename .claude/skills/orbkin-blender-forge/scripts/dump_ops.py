"""Dump every property of one or more operators of the running Blender to a text file.

  "$ORBKIN_BPY" -I dump_ops.py --out props.txt export_scene.gltf object.quadriflow_remesh object.bake
Default operators: export_scene.gltf, object.bake, object.quadriflow_remesh, object.voxel_remesh,
uv.smart_project, uv.pack_islands. Use it when an export/bake kwarg errors: the file lists the real
names, types, enum items and defaults for THIS version (5.2.40 exporter has 113 properties).
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import bpy, sys, os

DEFAULT = ['export_scene.gltf', 'object.bake', 'object.quadriflow_remesh', 'object.voxel_remesh', 'uv.smart_project', 'uv.pack_islands']


def dump(path):
    mod, name = path.split('.', 1)
    rna = getattr(getattr(bpy.ops, mod), name).get_rna_type()
    lines = [f'## {path}: {rna.description}']
    for p in rna.properties:
        if p.identifier == 'rna_type':
            continue
        extra = ''
        if p.type == 'ENUM':
            extra = ' items=' + ','.join(i.identifier for i in p.enum_items)
        default = getattr(p, 'default', None)
        lines.append(f'{p.identifier:40s} {p.type:8s} default={default!r}{extra}')
    return '\n'.join(lines)


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
out = None
if '--out' in argv:
    i = argv.index('--out'); out = argv[i + 1]; argv = argv[:i] + argv[i + 2:]
ops = argv or DEFAULT
text = f'# Blender {bpy.app.version_string}\n' + '\n\n'.join(dump(o) for o in ops) + '\n'
if out:
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    open(out, 'w').write(text); print('wrote', out, len(text.splitlines()), 'lines')
else:
    print(text)
