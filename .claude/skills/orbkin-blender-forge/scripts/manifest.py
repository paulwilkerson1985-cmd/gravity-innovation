"""manifest: provenance manifest for a forge output (what ships next to every GLB / atlas / sheet).

  python3 -I manifest.py --out piece.manifest.json --script assets/piece_template.py --args "--seed 7 ..." \
      --seed 7 --files out/piece.glb out/piece_atlas.png [--assets none | --assets provenance1.json ...] \
      [--bpy-version 5.2.2] [--note "..."] [--approved false]
Records: script path + sha256, args, seed, bpy version (read from the venv's dist-info or --bpy-version),
glTF-Transform / meshoptimizer / three versions (from the lockfiles), sha256 + bytes of every output,
third-party assets ('no third-party assets' or the provenance JSONs written by fetch_cc0.sh, which must
also have a row in game/ASSETS.md), the gate state (approved: false until an in-game blind A/B through
orbkin-visual-gate is won), host facts (cpus, load average) and a UTC timestamp.
Exit 1 if an output file is missing.
"""
import sys, os, json, hashlib, argparse, datetime, glob, platform


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for ch in iter(lambda: f.read(1 << 20), b''):
            h.update(ch)
    return h.hexdigest()


def tool_versions(skill_dir):
    v = {}
    lock = os.path.join(skill_dir, 'scripts', 'requirements-linux-x86_64.lock')
    if os.path.exists(lock):
        for line in open(lock):
            if line.startswith('bpy=='):
                v['bpy'] = line.split()[0].split('==')[1]
    pl = os.path.join(skill_dir, 'scripts', 'node', 'package-lock.json')
    if os.path.exists(pl):
        j = json.load(open(pl)); pk = j.get('packages', {})
        for name in ('@gltf-transform/core', 'meshoptimizer', 'gltfpack', 'sharp'):
            if f'node_modules/{name}' in pk:
                v[name] = pk[f'node_modules/{name}'].get('version')
    bpy_env = os.environ.get('ORBKIN_BPY')
    if bpy_env:
        for d in glob.glob(os.path.join(os.path.dirname(os.path.dirname(bpy_env)), 'lib', 'python3.*', 'site-packages', 'bpy-*.dist-info')):
            v['bpy_installed'] = os.path.basename(d)[4:-10]
    repo = os.path.dirname(os.path.dirname(os.path.dirname(skill_dir)))
    tp = os.path.join(repo, 'game', 'node_modules', 'three', 'package.json')
    if os.path.exists(tp):
        v['three'] = json.load(open(tp)).get('version')
    return v


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', required=True); ap.add_argument('--script', required=True); ap.add_argument('--args', default='')
    ap.add_argument('--seed', type=int); ap.add_argument('--files', nargs='+', required=True); ap.add_argument('--assets', nargs='*', default=['none'])
    ap.add_argument('--bpy-version'); ap.add_argument('--note', default=''); ap.add_argument('--approved', default='false'); ap.add_argument('--name')
    a = ap.parse_args(argv)
    skill_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    missing = [f for f in a.files if not os.path.exists(f)]
    if missing:
        print(json.dumps({'error': f'missing outputs: {missing}'})); return 1
    assets = []
    if a.assets and a.assets != ['none']:
        for p in a.assets:
            j = json.load(open(p)); j['provenance_file'] = p; assets.append(j)
    ver = tool_versions(skill_dir)
    if a.bpy_version:
        ver['bpy'] = a.bpy_version
    try:
        load = [round(x, 2) for x in os.getloadavg()]
    except Exception:
        load = None
    m = {
        'name': a.name or os.path.splitext(os.path.basename(a.files[0]))[0],
        'generated_utc': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'script': {'path': a.script, 'sha256': sha256(a.script) if os.path.exists(a.script) else None},
        'args': a.args, 'seed': a.seed,
        'versions': ver,
        'outputs': [{'file': f, 'bytes': os.path.getsize(f), 'sha256': sha256(f)} for f in a.files],
        'third_party_assets': assets if assets else 'no third-party assets',
        'gate': {'approved': a.approved.lower() == 'true', 'rule': 'not shippable until it wins an in-game blind A/B through orbkin-visual-gate (desk + phone + element crop, canary-validated, both orders)'},
        'host': {'platform': platform.platform(), 'cpus': os.cpu_count(), 'load_avg': load, 'cloud': os.environ.get('CLAUDE_CODE_REMOTE') == 'true'},
        'note': a.note,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)) or '.', exist_ok=True)
    json.dump(m, open(a.out, 'w'), indent=1)
    print(json.dumps({'wrote': a.out, 'outputs': len(m['outputs']), 'versions': ver, 'approved': m['gate']['approved']}))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
