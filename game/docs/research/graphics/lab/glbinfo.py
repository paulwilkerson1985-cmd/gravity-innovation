"""Print a GLB's JSON essentials (no deps): meshes/attributes/targets, skins, animations+channels, extensions."""
import json, struct, sys
def load(p):
    b = open(p, 'rb').read()
    assert b[:4] == b'glTF'
    ln = struct.unpack('<I', b[12:16])[0]
    return json.loads(b[20:20 + ln]), len(b)
j, n = load(sys.argv[1])
print('bytes', n, 'extensionsUsed', j.get('extensionsUsed'))
for m in j.get('meshes', []):
    for p in m['primitives']:
        print('mesh', m.get('name'), 'attrs', sorted(p['attributes']), 'targets', len(p.get('targets', [])), 'targetNames', m.get('extras', {}).get('targetNames'))
for s in j.get('skins', []):
    print('skin joints', len(s['joints']))
for a in j.get('animations', []):
    paths = {}
    for c in a['channels']:
        paths[c['target']['path']] = paths.get(c['target']['path'], 0) + 1
    acc = j['accessors'][a['samplers'][0]['input']]
    print('anim', a['name'], 'channels', paths, 'duration', acc.get('max'))
print('materials', [(m.get('name'), 'doubleSided=%s' % m.get('doubleSided'), [k for k in m if k.endswith('Texture')] + list(m.get('pbrMetallicRoughness', {}).keys()), list(m.get('extensions', {}).keys())) for m in j.get('materials', [])])
print('images', [(i.get('mimeType'), j['bufferViews'][i['bufferView']]['byteLength'] if 'bufferView' in i else i.get('uri')) for i in j.get('images', [])])
