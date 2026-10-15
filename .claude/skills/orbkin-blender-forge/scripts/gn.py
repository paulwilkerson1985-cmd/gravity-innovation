"""gn: a small geometry-nodes builder for headless bpy (Blender 5.2), including the SDF nodes.

    from gn import GN, sdf_fuse, displace_rock
    g = GN('Fuse')
    m2s = g.node('GeometryNodeMeshToSDFGrid', **{'Voxel Size': 0.02, 'Band Width': 3})
    fil = g.node('GeometryNodeSDFGridFillet', Iterations=4)
    g2m = g.node('GeometryNodeGridToMesh', Threshold=0.0)        # 0.0: SDF convention (default 0.1 -> empty mesh)
    g.link(g.inp, 0, m2s, 'Mesh'); g.link(m2s, 0, fil, 0); g.link(fil, 0, g2m, 'Grid'); g.out_from(g2m)
    g.apply(obj)                                                  # adds the modifier, applies it, clears the None slot

Sockets are addressed by name or index; node properties (enum fields like `feature`, `mode`) by keyword
with a leading underscore: g.node('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE', Scale=1.6).
Look sockets up with api.py before using a node you have not used before.
"""
import bpy, math
from mathutils import Vector


class GN:
    def __init__(self, name='orbkin_gn'):
        self.tree = bpy.data.node_groups.new(name, 'GeometryNodeTree')
        self.tree.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
        self.tree.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
        self.inp = self.tree.nodes.new('NodeGroupInput')
        self.out = self.tree.nodes.new('NodeGroupOutput')
        self._x = 0

    def node(self, type_name, **kw):
        n = self.tree.nodes.new(type_name)
        self._x += 220; n.location = (self._x, 0)
        for k, v in kw.items():
            if k.startswith('_'):
                setattr(n, k[1:], v)
            else:
                s = n.inputs.get(k) if isinstance(k, str) else n.inputs[k]
                if s is None:
                    raise KeyError(f'{type_name} has no input socket {k!r}; inputs: {[i.name for i in n.inputs]}')
                s.default_value = v
        return n

    def link(self, a, out_sock, b, in_sock):
        oa = a.outputs[out_sock] if isinstance(out_sock, int) else a.outputs[out_sock]
        ib = b.inputs[in_sock] if isinstance(in_sock, int) else b.inputs[in_sock]
        return self.tree.links.new(oa, ib)

    def out_from(self, n, sock=0):
        self.tree.links.new(n.outputs[sock], self.out.inputs[0])

    def modifier(self, obj, name='gn'):
        m = obj.modifiers.new(name, 'NODES'); m.node_group = self.tree
        return m

    def apply(self, obj, name='gn'):
        """Add + apply the modifier (GN output exists only as a modifier result), then clear the None
        material slot the apply leaves behind (else EMIT bakes come out black)."""
        keep = [m for m in obj.data.materials if m is not None]  # GN output drops the material slots
        self.modifier(obj, name)
        bpy.context.view_layer.objects.active = obj
        for o in bpy.context.selected_objects:
            o.select_set(False)
        obj.select_set(True)
        res = bpy.ops.object.modifier_apply(modifier=name)
        if 'FINISHED' not in res:
            raise RuntimeError(f'modifier_apply({name}) -> {res}')
        me = obj.data
        i = 0
        while i < len(me.materials):
            if me.materials[i] is None:
                me.materials.pop(index=i)
            else:
                i += 1
        if not len(me.materials) and keep:
            me.materials.append(keep[0])
        return obj


def sdf_fuse(obj, voxel=0.02, fillet=4, offset=0.0, band=3, cut_objects=(), add_after_cut=(), threshold=0.0, name='sdf_fuse'):
    """Fuse a joined mesh of overlapping volumes into one watertight skin:
    MeshToSDFGrid -> [SDFGridBoolean DIFFERENCE with each cutter] -> SDFGridOffset -> SDFGridFillet -> GridToMesh(0).
    voxel ~ 1/150 of the piece size; fillet radius ~ iterations x voxel; offset>0 rounds/grows, <0 erodes.
    cut_objects: mesh objects subtracted (arch openings, bites). add_after_cut: mesh objects UNIONed
    after the cuts (stalactites hanging inside an opening, parts that a cutter would otherwise delete).
    Applies and returns obj; the cutters/adds are left in the scene (remove them yourself)."""
    g = GN(name)
    m2s = g.node('GeometryNodeMeshToSDFGrid', **{'Voxel Size': voxel, 'Band Width': band})
    g.link(g.inp, 0, m2s, 'Mesh')
    last = m2s
    for co in cut_objects:
        oi = g.node('GeometryNodeObjectInfo', _transform_space='RELATIVE'); oi.inputs['Object'].default_value = co
        c2s = g.node('GeometryNodeMeshToSDFGrid', **{'Voxel Size': voxel, 'Band Width': band})
        g.link(oi, 'Geometry', c2s, 'Mesh')
        bo = g.node('GeometryNodeSDFGridBoolean', _operation='DIFFERENCE')
        g.link(last, 0, bo, 0); g.link(c2s, 0, bo, 1)
        last = bo
    for ao in add_after_cut:
        oi = g.node('GeometryNodeObjectInfo', _transform_space='RELATIVE'); oi.inputs['Object'].default_value = ao
        a2s = g.node('GeometryNodeMeshToSDFGrid', **{'Voxel Size': voxel, 'Band Width': band})
        g.link(oi, 'Geometry', a2s, 'Mesh')
        bo = g.node('GeometryNodeSDFGridBoolean', _operation='UNION')
        # UNION/INTERSECT disable 'Grid 1' and take every operand on the multi-input socket inputs[1];
        # linking the running grid into inputs[0] silently kept only the hanger (pilot 2 lost the whole body)
        g.link(last, 0, bo, 1); g.link(a2s, 0, bo, 1)
        last = bo
    if offset:
        of = g.node('GeometryNodeSDFGridOffset', Distance=offset)
        g.link(last, 0, of, 'Grid'); last = of
    if fillet:
        fi = g.node('GeometryNodeSDFGridFillet', Iterations=int(fillet))
        g.link(last, 0, fi, 'Grid'); last = fi
    g2m = g.node('GeometryNodeGridToMesh', Threshold=threshold)
    g.link(last, 0, g2m, 'Grid'); g.out_from(g2m)
    return g.apply(obj, name)


def displace_rock(obj, crack=0.05, crack_scale=1.6, plate=0.03, plate_scale=1.3, strata=0.02, strata_scale=1.1,
                  lump=0.04, lump_scale=0.9, seed=0, name='rock_detail'):
    """Rock surface detail along the normal (blender-llm.md 3.3): thin crack valleys (Voronoi distance
    to edge), chiselled plates (Voronoi F1 colour), sedimentary strata (Wave bands, saw), low-frequency
    lumps (Noise). Amplitudes in world units; set any to 0 to skip. Needs a dense mesh (voxel output)."""
    g = GN(name)
    pos = g.node('GeometryNodeInputPosition')
    nrm = g.node('GeometryNodeInputNormal')
    off = Vector((seed * 7.31, seed * 3.17, seed * 1.93))
    terms = []
    def shifted():
        a = g.node('ShaderNodeVectorMath', _operation='ADD'); a.inputs[1].default_value = off
        g.link(pos, 0, a, 0); return a
    if crack:
        v = g.node('ShaderNodeTexVoronoi', _feature='DISTANCE_TO_EDGE', Scale=crack_scale)
        g.link(shifted(), 0, v, 'Vector')
        m = g.node('ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 0.06, 'To Min': -crack, 'To Max': 0.0})
        g.link(v, 'Distance', m, 'Value'); terms.append(m)
    if plate:
        v = g.node('ShaderNodeTexVoronoi', _feature='F1', Scale=plate_scale)
        g.link(shifted(), 0, v, 'Vector')
        m = g.node('ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': -plate, 'To Max': plate * 1.6})
        g.link(v, 'Color', m, 'Value'); terms.append(m)
    if strata:
        w = g.node('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Z', _wave_profile='SAW', Scale=strata_scale, Distortion=3.0, Detail=1.0)
        g.link(shifted(), 0, w, 'Vector')
        m = g.node('ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': 1.0, 'To Min': 0.0, 'To Max': strata})
        g.link(w, 'Fac', m, 'Value'); terms.append(m)
    if lump:
        n = g.node('ShaderNodeTexNoise', Scale=lump_scale, Detail=2.0)
        g.link(shifted(), 0, n, 'Vector')
        m = g.node('ShaderNodeMapRange', **{'From Min': 0.3, 'From Max': 0.7, 'To Min': -lump, 'To Max': lump})
        g.link(n, 'Fac', m, 'Value'); terms.append(m)
    total = terms[0]
    for t in terms[1:]:
        a = g.node('ShaderNodeMath', _operation='ADD'); g.link(total, 0, a, 0); g.link(t, 0, a, 1); total = a
    sc = g.node('ShaderNodeVectorMath', _operation='SCALE')
    g.link(nrm, 0, sc, 0); g.link(total, 0, sc, 'Scale')
    sp = g.node('GeometryNodeSetPosition')
    g.link(g.inp, 0, sp, 'Geometry'); g.link(sc, 0, sp, 'Offset'); g.out_from(sp)
    return g.apply(obj, name)


def scatter(target, collection, density_min_dist=0.16, seed=0, zmin=None, scale=(0.5, 1.4), name='scatter'):
    """Poisson scatter of collection children on target faces, random rotation/scale, realized.
    Returns a new mesh object (realized instances) parented to nothing; join it yourself."""
    g = GN(name)
    dp = g.node('GeometryNodeDistributePointsOnFaces', _distribute_method='POISSON', **{'Distance Min': density_min_dist, 'Density Max': 50.0, 'Seed': seed})
    g.link(g.inp, 0, dp, 'Mesh')
    if zmin is not None:
        pos = g.node('GeometryNodeInputPosition'); sep = g.node('ShaderNodeSeparateXYZ')
        g.link(pos, 0, sep, 0)
        gt = g.node('ShaderNodeMath', _operation='GREATER_THAN'); gt.inputs[1].default_value = zmin
        g.link(sep, 'Z', gt, 0); g.link(gt, 0, dp, 'Selection')
    ci = g.node('GeometryNodeCollectionInfo', _transform_space='ORIGINAL', **{'Separate Children': True, 'Reset Children': True})
    ci.inputs['Collection'].default_value = collection
    rv = g.node('FunctionNodeRandomValue', _data_type='FLOAT_VECTOR'); rv.inputs['Min'].default_value = (0, 0, 0); rv.inputs['Max'].default_value = (0.4, 0.4, math.tau); rv.inputs['Seed'].default_value = seed
    rs = g.node('FunctionNodeRandomValue', _data_type='FLOAT'); rs.inputs['Min'].default_value = scale[0]; rs.inputs['Max'].default_value = scale[1]; rs.inputs['Seed'].default_value = seed + 1
    iop = g.node('GeometryNodeInstanceOnPoints', **{'Pick Instance': True})
    g.link(dp, 'Points', iop, 'Points'); g.link(ci, 0, iop, 'Instance')
    g.link(rv, 'Value', iop, 'Rotation'); g.link(rs, 'Value', iop, 'Scale')
    ri = g.node('GeometryNodeRealizeInstances'); g.link(iop, 0, ri, 0); g.out_from(ri)
    g.apply(target, name)
    return target
