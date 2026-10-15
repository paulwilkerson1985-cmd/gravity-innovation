"""glbinfo: dependency-free GLB summary + budget assertions (plain python3; works on packed files
because accessor counts, materials and extensions stay in the JSON chunk).

  python3 -I glbinfo.py file.glb                      # JSON summary
  python3 -I glbinfo.py file.glb --max-tris 5000 --max-kb 150 --one-mesh --one-material \
      --require-attrs POSITION,NORMAL,TEXCOORD_0 --no-double-sided \
      --require-ext EXT_meshopt_compression --forbid-ext KHR_draco_mesh_compression,KHR_texture_basisu \
      --max-image-px 512 [--max-joints 20] [--require-clips Idle,Hop]
Exit 0 when every assertion holds, 1 when one fails (the JSON lists `failures`), 2 on a bad file.
Image pixel sizes are read from the PNG/WebP headers inside the binary chunk.
"""
import sys; sys.dont_write_bytecode = True  # -I ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo
import json, struct, sys, argparse


def load(path):
    b = open(path, 'rb').read()
    if b[:4] != b'glTF':
        raise ValueError('not a GLB (magic)')
    n = len(b); off = 12; js = None; bin_ = b''
    while off < n:
        ln, typ = struct.unpack('<II', b[off:off + 8])
        chunk = b[off + 8:off + 8 + ln]
        if typ == 0x4E4F534A:
            js = json.loads(chunk)
        elif typ == 0x004E4942:
            bin_ = chunk
        off += 8 + ln
    return js, bin_, n


def image_size(data, mime):
    try:
        if mime == 'image/png' and data[:8] == b'\x89PNG\r\n\x1a\n':
            return struct.unpack('>II', data[16:24])
        if mime == 'image/webp' and data[:4] == b'RIFF':
            tag = data[12:16]
            if tag == b'VP8X':
                w = 1 + int.from_bytes(data[24:27], 'little'); h = 1 + int.from_bytes(data[27:30], 'little'); return w, h
            if tag == b'VP8L':
                bits = int.from_bytes(data[21:25], 'little'); return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
            if tag == b'VP8 ':
                w, h = struct.unpack('<HH', data[26:30]); return w & 0x3FFF, h & 0x3FFF
        if mime == 'image/jpeg':
            i = 2
            while i < len(data):
                if data[i] != 0xFF:
                    i += 1; continue
                m = data[i + 1]
                if m in (0xC0, 0xC1, 0xC2):
                    h, w = struct.unpack('>HH', data[i + 5:i + 9]); return w, h
                i += 2 + struct.unpack('>H', data[i + 2:i + 4])[0]
    except Exception:
        pass
    return None


def summarize(path):
    js, bin_, size = load(path)
    acc = js.get('accessors', [])
    bvs = js.get('bufferViews', [])
    meshes = []; tris = 0; verts = 0
    for m in js.get('meshes', []):
        for p in m.get('primitives', []):
            mode = p.get('mode', 4)
            cnt = acc[p['indices']]['count'] if 'indices' in p else acc[p['attributes']['POSITION']]['count']
            t = cnt // 3 if mode == 4 else (cnt - 2 if mode in (5, 6) else 0)
            tris += t; verts += acc[p['attributes']['POSITION']]['count']
            meshes.append({'mesh': m.get('name'), 'attrs': sorted(p['attributes']), 'tris': t, 'targets': len(p.get('targets', [])), 'material': p.get('material')})
    mats = [{'name': m.get('name'), 'doubleSided': bool(m.get('doubleSided', False)), 'alphaMode': m.get('alphaMode', 'OPAQUE'),
             'textures': [k for k in m if k.endswith('Texture')] + [k for k in m.get('pbrMetallicRoughness', {}) if k.endswith('Texture')],
             'extensions': list(m.get('extensions', {}).keys())} for m in js.get('materials', [])]
    images = []
    for im in js.get('images', []):
        d = {'mimeType': im.get('mimeType'), 'uri': im.get('uri')}
        if 'bufferView' in im:
            bv = bvs[im['bufferView']]; data = bin_[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
            d['bytes'] = bv['byteLength']; d['size'] = image_size(data, im.get('mimeType'))
        images.append(d)
    anims = []
    for a in js.get('animations', []):
        paths = {}
        for c in a['channels']:
            paths[c['target']['path']] = paths.get(c['target']['path'], 0) + 1
        dur = max(acc[s['input']].get('max', [0])[0] for s in a['samplers'])
        anims.append({'name': a.get('name'), 'channels': paths, 'duration': round(dur, 3)})
    return {'file': path, 'bytes': size, 'kb': round(size / 1024, 1), 'generator': js.get('asset', {}).get('generator'),
            'extensionsUsed': js.get('extensionsUsed', []), 'extensionsRequired': js.get('extensionsRequired', []),
            'nodes': len(js.get('nodes', [])), 'meshes': len(js.get('meshes', [])), 'primitives': meshes, 'tris': tris, 'verts': verts,
            'materials': mats, 'images': images, 'textures': len(js.get('textures', [])), 'samplers': js.get('samplers', []),
            'skins': [len(s['joints']) for s in js.get('skins', [])], 'animations': anims}


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('glb'); ap.add_argument('--max-tris', type=int); ap.add_argument('--max-kb', type=float)
    ap.add_argument('--one-mesh', action='store_true'); ap.add_argument('--one-material', action='store_true')
    ap.add_argument('--require-attrs'); ap.add_argument('--no-double-sided', action='store_true')
    ap.add_argument('--require-ext'); ap.add_argument('--forbid-ext'); ap.add_argument('--max-image-px', type=int)
    ap.add_argument('--max-joints', type=int); ap.add_argument('--require-clips'); ap.add_argument('--json', help='write the summary here too')
    a = ap.parse_args(argv)
    try:
        s = summarize(a.glb)
    except Exception as e:
        print(json.dumps({'error': str(e)})); return 2
    f = []
    if a.max_tris is not None and s['tris'] > a.max_tris: f.append(f"tris {s['tris']} > {a.max_tris}")
    if a.max_kb is not None and s['kb'] > a.max_kb: f.append(f"size {s['kb']} KB > {a.max_kb}")
    if a.one_mesh and (s['meshes'] != 1 or len(s['primitives']) != 1): f.append(f"meshes {s['meshes']} / primitives {len(s['primitives'])} != 1")
    if a.one_material and len(s['materials']) != 1: f.append(f"materials {len(s['materials'])} != 1")
    if a.require_attrs:
        for p in s['primitives']:
            miss = [x for x in a.require_attrs.split(',') if x not in p['attrs']]
            if miss: f.append(f"mesh {p['mesh']} lacks {miss}")
    if a.no_double_sided and any(m['doubleSided'] for m in s['materials']): f.append('doubleSided material (set use_backface_culling=True before export)')
    if a.require_ext:
        for e in a.require_ext.split(','):
            if e not in s['extensionsUsed']: f.append(f'missing extension {e}')
    if a.forbid_ext:
        for e in a.forbid_ext.split(','):
            if e in s['extensionsUsed']: f.append(f'forbidden extension {e}')
    if a.max_image_px:
        for im in s['images']:
            if im.get('size') and max(im['size']) > a.max_image_px: f.append(f"image {im['size']} > {a.max_image_px}")
    if a.max_joints is not None and any(j > a.max_joints for j in s['skins']): f.append(f"joints {s['skins']} > {a.max_joints}")
    if a.require_clips:
        names = [x['name'] for x in s['animations']]
        for c in a.require_clips.split(','):
            if c not in names: f.append(f'missing clip {c} (have {names})')
    s['failures'] = f; s['pass'] = not f
    if a.json:
        json.dump(s, open(a.json, 'w'), indent=1)
    print(json.dumps(s, indent=1))
    return 0 if not f else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
