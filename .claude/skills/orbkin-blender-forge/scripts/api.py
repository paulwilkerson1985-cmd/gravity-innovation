"""Live Blender API lookup so nothing is guessed from memory (sockets, enums, operator args).

Run with the Blender python:
  "$ORBKIN_BPY" -I api.py node GeometryNodeGridToMesh        # sockets + defaults of a node type
  "$ORBKIN_BPY" -I api.py node ShaderNodeTexVoronoi
  "$ORBKIN_BPY" -I api.py op object.quadriflow_remesh         # operator properties + enum items
  "$ORBKIN_BPY" -I api.py op export_scene.gltf
  "$ORBKIN_BPY" -I api.py enum BooleanModifier.solver          # enum identifiers of an RNA property
  "$ORBKIN_BPY" -I api.py props BakeSettings                   # all properties of an RNA struct
  "$ORBKIN_BPY" -I api.py find SDF                              # node/struct type names containing text
Output is JSON on stdout. Exit 2 on an unknown name.
Why: node sockets are addressed by index or name, enum ids changed in 5.0 (FAST->FLOAT), and the
GridToMesh threshold default (0.1) is wrong for SDF grids; reading bl_rna avoids all of that.
"""
import bpy, sys, json


def _enum_items(prop):
    try:
        return [i.identifier for i in prop.enum_items]
    except Exception:
        return []


def _prop(p):
    d = {'name': p.identifier, 'type': p.type}
    if p.type == 'ENUM':
        d['items'] = _enum_items(p)
        d['default'] = getattr(p, 'default', None)
    elif p.type in ('FLOAT', 'INT', 'BOOLEAN', 'STRING'):
        d['default'] = getattr(p, 'default_array', None) if getattr(p, 'is_array', False) else getattr(p, 'default', None)
        if d['default'] is not None and not isinstance(d['default'], (int, float, str, bool)):
            d['default'] = list(d['default'])
    d['description'] = p.description[:120]
    return d


def node_info(type_name):
    if not hasattr(bpy.types, type_name):
        return None
    cls = getattr(bpy.types, type_name)
    tree_type = 'GeometryNodeTree' if type_name.startswith(('GeometryNode', 'FunctionNode')) else (
        'CompositorNodeTree' if type_name.startswith('CompositorNode') else 'ShaderNodeTree')
    ng = bpy.data.node_groups.new('_probe', tree_type) if tree_type != 'ShaderNodeTree' else None
    if ng is None:
        mat = bpy.data.materials.new('_probe'); nt = mat.node_tree
    else:
        nt = ng
    try:
        n = nt.nodes.new(type_name)
    except Exception as e:
        return {'type': type_name, 'error': f'cannot instantiate: {e}'}
    def sock(s):
        d = {'name': s.name, 'identifier': s.identifier, 'type': s.type}
        if hasattr(s, 'default_value'):
            try:
                v = s.default_value
                d['default'] = list(v) if hasattr(v, '__len__') and not isinstance(v, str) else v
            except Exception:
                pass
        return d
    props = [_prop(p) for p in cls.bl_rna.properties if p.identifier not in bpy.types.Node.bl_rna.properties.keys()]
    out = {'type': type_name, 'inputs': [sock(s) for s in n.inputs], 'outputs': [sock(s) for s in n.outputs], 'properties': props}
    if ng is not None:
        bpy.data.node_groups.remove(ng)
    else:
        bpy.data.materials.remove(mat)
    return out


def op_info(path):
    mod, name = path.split('.', 1)
    try:
        op = getattr(getattr(bpy.ops, mod), name)
        rna = op.get_rna_type()
    except Exception:
        return None
    return {'op': path, 'description': rna.description, 'properties': [_prop(p) for p in rna.properties if p.identifier != 'rna_type']}


def main(argv):
    if len(argv) < 2:
        print(__doc__); return 64
    kind, name = argv[0], argv[1]
    if kind == 'node':
        out = node_info(name)
    elif kind == 'op':
        out = op_info(name)
    elif kind == 'enum':
        struct, prop = name.split('.')
        p = getattr(bpy.types, struct).bl_rna.properties.get(prop)
        out = None if p is None else {'enum': name, 'items': _enum_items(p), 'default': getattr(p, 'default', None)}
    elif kind == 'props':
        cls = getattr(bpy.types, name, None)
        out = None if cls is None else {'struct': name, 'properties': [_prop(p) for p in cls.bl_rna.properties]}
    elif kind == 'find':
        out = {'matches': sorted(t for t in dir(bpy.types) if name.lower() in t.lower())}
    else:
        print(__doc__); return 64
    if out is None:
        print(json.dumps({'error': f'unknown {kind} {name}'})); return 2
    print(json.dumps(out, indent=1, default=str))
    return 0


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    sys.exit(main(argv))
