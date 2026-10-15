"""safe_extract: list and safely extract a downloaded asset archive (zip / tar) into a fresh directory.

  python3 -I safe_extract.py archive.zip --list                      # what is inside (always do this first)
  python3 -I safe_extract.py archive.zip --into new_empty_dir [--allow png,jpg,jpeg,webp,exr,hdr,glb,gltf,bin,obj,mtl,fbx,ogg,wav,ttf,otf,txt,md,json]
Rules (repo CLAUDE.md): downloaded content is data. Rejects the whole archive on any entry with path
traversal, an absolute path, a symlink/hardlink, an executable bit, or a script/binary signature
(#!, ELF, PE, Mach-O, zip-in-zip); skips (never extracts) .blend, .py, .sh, .exe, .dll, .so, .js,
.bat, .ps1, .usd*, .mtlx, .tres and every extension outside --allow. Exit 0 extracted / listed, 1
rejected, 2 bad usage. Prints a JSON report; keep it next to the asset's provenance JSON.
"""
import sys, os, json, zipfile, tarfile, argparse, stat

DEFAULT_ALLOW = 'png,jpg,jpeg,webp,exr,hdr,tif,tiff,glb,gltf,bin,obj,mtl,fbx,dae,ogg,wav,mp3,ttf,otf,woff2,txt,md,json,csv,license'
BLOCK_EXT = {'blend', 'blend1', 'py', 'pyc', 'sh', 'bash', 'zsh', 'exe', 'dll', 'so', 'dylib', 'js', 'mjs', 'cjs', 'bat', 'cmd', 'ps1', 'msi', 'app', 'jar', 'class', 'usd', 'usda', 'usdc', 'usdz', 'mtlx', 'tres', 'tscn', 'gd', 'zip', 'tar', 'gz', '7z', 'rar'}
SIGS = (b'#!', b'\x7fELF', b'MZ', b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe', b'PK\x03\x04')


def entries(path):
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        for i in z.infolist():
            mode = (i.external_attr >> 16) & 0xFFFF
            yield {'name': i.filename, 'size': i.file_size, 'dir': i.is_dir(), 'symlink': stat.S_ISLNK(mode), 'exec': bool(mode & 0o111) and not i.is_dir(), 'open': (lambda i=i: z.open(i))}
    elif tarfile.is_tarfile(path):
        t = tarfile.open(path)
        for m in t.getmembers():
            yield {'name': m.name, 'size': m.size, 'dir': m.isdir(), 'symlink': m.issym() or m.islnk(), 'exec': bool(m.mode & 0o111) and m.isfile(), 'open': (lambda m=m: t.extractfile(m))}
    else:
        raise ValueError('not a zip or tar archive')


def check(e, allow):
    name = e['name']
    norm = os.path.normpath(name)
    if name.startswith(('/', '\\')) or norm.startswith('..') or '..' + os.sep in norm + os.sep or ':' in name.split('/')[0]:
        return 'REJECT', 'path traversal / absolute path'
    if e['symlink']:
        return 'REJECT', 'symlink or hardlink'
    if e['exec']:
        return 'REJECT', 'executable bit set'
    if e['dir']:
        return 'DIR', ''
    ext = name.rsplit('.', 1)[-1].lower() if '.' in os.path.basename(name) else ''
    if ext in BLOCK_EXT:
        return 'SKIP', f'blocked extension .{ext}'
    if ext not in allow:
        return 'SKIP', f'extension .{ext} not in allow list'
    try:
        with e['open']() as f:
            head = f.read(8)
    except Exception as ex:
        return 'REJECT', f'unreadable: {ex}'
    for s in SIGS:
        if head.startswith(s) and ext not in ('glb', 'gltf', 'bin', 'ttf', 'otf', 'woff2'):
            return 'REJECT', f'script/binary signature {s!r} in a .{ext} file'
    return 'OK', ''


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('archive'); ap.add_argument('--list', action='store_true'); ap.add_argument('--into'); ap.add_argument('--allow', default=DEFAULT_ALLOW)
    a = ap.parse_args(argv)
    if not a.list and not a.into:
        ap.print_help(); return 2
    allow = set(a.allow.lower().split(','))
    rep = {'archive': a.archive, 'entries': [], 'rejected': [], 'skipped': [], 'extracted': []}
    es = list(entries(a.archive))
    for e in es:
        verdict, why = check(e, allow)
        rep['entries'].append({'name': e['name'], 'size': e['size'], 'verdict': verdict, 'why': why})
        if verdict == 'REJECT':
            rep['rejected'].append(e['name'])
        elif verdict == 'SKIP':
            rep['skipped'].append(e['name'])
    if a.list or rep['rejected']:
        rep['verdict'] = 'REJECT (nothing extracted)' if rep['rejected'] else 'listed'
        print(json.dumps(rep, indent=1)); return 1 if rep['rejected'] else 0
    into = os.path.abspath(a.into)
    if os.path.exists(into) and os.listdir(into):
        print(json.dumps({'error': f'{into} is not empty: extract each download into a new empty directory'})); return 2
    os.makedirs(into, exist_ok=True)
    for e, r in zip(es, rep['entries']):
        if r['verdict'] != 'OK':
            continue
        dest = os.path.join(into, os.path.normpath(e['name']))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with e['open']() as src, open(dest, 'wb') as dst:
            for chunk in iter(lambda: src.read(1 << 20), b''):
                dst.write(chunk)
        os.chmod(dest, 0o644)
        rep['extracted'].append(dest)
    rep['verdict'] = f"extracted {len(rep['extracted'])} files into {into}"
    print(json.dumps(rep, indent=1)); return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
