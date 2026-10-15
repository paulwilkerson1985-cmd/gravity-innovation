#!/usr/bin/env bash
# fetch_cc0.sh: download CC0 assets (data only) into a NEW EMPTY directory with a provenance JSON.
#
#   fetch_cc0.sh polyhaven <asset_id> <dir> [--res 1k] [--maps Diffuse,AO,Displacement,nor_gl,Rough] [--type textures|models|hdris]
#   fetch_cc0.sh ambientcg <asset_id> <dir> [--res 1K] [--fmt JPG|PNG]       # zip -> listed, then safe_extract.py
#   fetch_cc0.sh kenney <slug> <dir>                                          # e.g. nature-kit -> zip -> safe_extract.py
#   fetch_cc0.sh row <provenance.json>                                        # print the game/ASSETS.md table row
# Sources: api.polyhaven.com / dl.polyhaven.org (CC0), ambientcg.com (CC0), kenney.nl (CC0). Anything
# else: ask the owner. Never downloads executables, never opens .blend files, never pipes into a
# shell. What this is for: height/AO maps as mask inputs (pbr_to_masks.py) and shape references;
# never a drop-in look (CC0 props lost 3-0 to code props in-game). Record every asset in game/ASSETS.md.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UA="orbkin-blender-forge/1.0 (headless asset fetch; CC0 only)"
cmd="${1:-}"; shift || true
need_empty() { mkdir -p "$1"; [ -z "$(ls -A "$1")" ] || { echo "ERROR: $1 is not empty; use a new empty directory per download" >&2; exit 2; }; }
get() { curl -sSL --retry 3 --retry-delay 2 -A "$UA" -o "$2" "$1"; }
case "$cmd" in
  polyhaven)
    id="$1"; dir="$2"; shift 2; res=1k; maps="Diffuse,AO,Displacement,nor_gl,Rough"; type=textures
    while [ $# -gt 0 ]; do case "$1" in --res) res="$2"; shift 2;; --maps) maps="$2"; shift 2;; --type) type="$2"; shift 2;; *) shift;; esac; done
    need_empty "$dir"
    get "https://api.polyhaven.com/files/$id" "$dir/files.json"
    get "https://api.polyhaven.com/info/$id" "$dir/info.json"
    python3 -I - "$dir" "$id" "$res" "$maps" "$type" <<'PY'
import json, sys, os, urllib.request, hashlib
d, id_, res, maps, typ = sys.argv[1:6]
files = json.load(open(os.path.join(d, 'files.json'))); info = json.load(open(os.path.join(d, 'info.json')))
UA = 'orbkin-blender-forge/1.0 (headless asset fetch; CC0 only)'
got = []
def fetch(url, out, md5=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req) as r, open(out, 'wb') as f:
        f.write(r.read())
    h = hashlib.md5(open(out, 'rb').read()).hexdigest()
    ok = (md5 is None) or (h == md5)
    got.append({'file': os.path.basename(out), 'url': url, 'md5': h, 'md5_matches_api': ok, 'bytes': os.path.getsize(out)})
    if not ok:
        print('WARNING md5 mismatch', out, file=sys.stderr)
if typ == 'hdris':
    e = files['hdri'][res]['hdr']; fetch(e['url'], os.path.join(d, f'{id_}_{res}.hdr'), e.get('md5'))
elif typ == 'models':
    e = files['gltf'][res]['gltf']; fetch(e['url'], os.path.join(d, f'{id_}_{res}.gltf'), e.get('md5'))
    for name, inc in e.get('include', {}).items():
        out = os.path.join(d, name.replace('/', '_')); fetch(inc['url'], out, inc.get('md5'))
else:
    for m in maps.split(','):
        if m not in files:
            print('no map', m, 'have', sorted(k for k in files if k not in ('blend', 'gltf', 'mtlx')), file=sys.stderr); continue
        fmts = files[m][res]
        fmt = 'png' if 'png' in fmts and m in ('Displacement', 'nor_gl', 'nor_dx') else ('jpg' if 'jpg' in fmts else next(iter(fmts)))
        e = fmts[fmt]; fetch(e['url'], os.path.join(d, f'{id_}_{m.lower()}_{res}.{fmt}'), e.get('md5'))
prov = {'source': 'Poly Haven', 'asset_id': id_, 'page': f'https://polyhaven.com/a/{id_}', 'license': 'CC0 1.0 (https://polyhaven.com/license)',
        'author': ', '.join(info.get('authors', {}).keys()) or info.get('author'), 'resolution': res, 'type': typ, 'files': got,
        'use': 'masks / shape reference only; never shipped raw', 'assets_md_row': True}
json.dump(prov, open(os.path.join(d, 'provenance.json'), 'w'), indent=1)
print(json.dumps({'dir': d, 'files': [g['file'] for g in got], 'provenance': os.path.join(d, 'provenance.json')}))
PY
    ;;
  ambientcg)
    id="$1"; dir="$2"; shift 2; res=1K; fmt=JPG
    while [ $# -gt 0 ]; do case "$1" in --res) res="$2"; shift 2;; --fmt) fmt="$2"; shift 2;; *) shift;; esac; done
    need_empty "$dir"
    get "https://ambientcg.com/api/v2/full_json?id=$id&include=downloadData" "$dir/api.json"
    url="$(python3 -I -c "import json,sys; j=json.load(open(sys.argv[1])); a=j['foundAssets'][0]; d=[x for x in a['downloadFolders']['default']['downloadFiletypeCategories']['zip']['downloads'] if x['attribute']=='$res-$fmt']; print(d[0]['downloadLink'] if d else '')" "$dir/api.json")"
    [ -n "$url" ] || { echo "ERROR: no $res-$fmt zip for $id (see $dir/api.json)" >&2; exit 1; }
    get "$url" "$dir/${id}_${res}-${fmt}.zip"
    python3 -I "$HERE/safe_extract.py" "$dir/${id}_${res}-${fmt}.zip" --list >/dev/null || { echo "archive rejected by safe_extract.py" >&2; exit 1; }
    python3 -I "$HERE/safe_extract.py" "$dir/${id}_${res}-${fmt}.zip" --into "$dir/extracted" | tail -3
    python3 -I - "$dir" "$id" "$url" "$res-$fmt" <<'PY'
import json, sys, os, hashlib
d, id_, url, res = sys.argv[1:5]
zips = [f for f in os.listdir(d) if f.endswith('.zip')]
files = [{'file': f, 'sha256': hashlib.sha256(open(os.path.join(d, f), 'rb').read()).hexdigest(), 'bytes': os.path.getsize(os.path.join(d, f))} for f in zips]
prov = {'source': 'ambientCG', 'asset_id': id_, 'page': f'https://ambientcg.com/view?id={id_}', 'license': 'CC0 1.0 (https://docs.ambientcg.com/license/)', 'resolution': res, 'url': url, 'files': files,
        'extracted': sorted(os.listdir(os.path.join(d, 'extracted'))) if os.path.isdir(os.path.join(d, 'extracted')) else [], 'note': '.blend/.usd/.mtlx sidecars in the zip are skipped by safe_extract.py', 'use': 'masks / shape reference only; never shipped raw'}
json.dump(prov, open(os.path.join(d, 'provenance.json'), 'w'), indent=1); print(json.dumps({'dir': d, 'provenance': os.path.join(d, 'provenance.json')}))
PY
    ;;
  kenney)
    slug="$1"; dir="$2"; need_empty "$dir"
    get "https://kenney.nl/media/pages/assets/$slug/" "$dir/page.html" || true
    url="https://kenney.nl/media/pages/assets/$slug/kenney_$slug.zip"
    # the zip link on kenney.nl carries a cache hash; find it on the asset page instead of guessing
    found="$(grep -o 'https://kenney.nl/media/pages/assets/[^"]*\.zip' "$dir/page.html" 2>/dev/null | head -1 || true)"
    [ -z "$found" ] && { get "https://kenney.nl/assets/$slug" "$dir/page.html"; found="$(grep -o 'https://kenney.nl/media/pages/assets/[^"]*\.zip' "$dir/page.html" | head -1 || true)"; }
    [ -n "$found" ] && url="$found"
    get "$url" "$dir/kenney_$slug.zip"
    python3 -I "$HERE/safe_extract.py" "$dir/kenney_$slug.zip" --list >/dev/null || { echo "archive rejected by safe_extract.py" >&2; exit 1; }
    python3 -I "$HERE/safe_extract.py" "$dir/kenney_$slug.zip" --into "$dir/extracted" | tail -3
    python3 -I - "$dir" "$slug" "$url" <<'PY'
import json, sys, os, hashlib
d, slug, url = sys.argv[1:4]
z = os.path.join(d, f'kenney_{slug}.zip')
prov = {'source': 'Kenney', 'asset_id': slug, 'page': f'https://kenney.nl/assets/{slug}', 'license': 'CC0 1.0 (License.txt in the zip)', 'url': url,
        'files': [{'file': os.path.basename(z), 'sha256': hashlib.sha256(open(z, 'rb').read()).hexdigest(), 'bytes': os.path.getsize(z)}], 'use': 'shape / blockout reference only; re-surface through our painters and ramps'}
json.dump(prov, open(os.path.join(d, 'provenance.json'), 'w'), indent=1); print(json.dumps({'dir': d, 'provenance': os.path.join(d, 'provenance.json')}))
PY
    ;;
  row)
    python3 -I -c "import json,sys; p=json.load(open(sys.argv[1])); print('| %s | %s | %s | %s | %s |' % (p.get('asset_id'), p.get('source'), p.get('page'), p.get('license'), p.get('use')))" "$1"
    ;;
  *) echo "usage: fetch_cc0.sh polyhaven|ambientcg|kenney <id> <new_dir> [opts] | row provenance.json" >&2; exit 2 ;;
esac
