"""Pack rendered frames into one WebP atlas + JSON per clip/view, plus a contact sheet.
usage: python3 pack.py FRAMES_DIR SHEETS_DIR"""
import sys, os, json, math
import numpy as np
from PIL import Image, ImageDraw

FR, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(FR, 'meta.json')))
SC = float(os.environ.get('SCALE', 1))
PAD = 2          # transparent gutter around every cell (mip / bilinear safety)
EVENTS = {'attack': {'anticipation': 1, 'launch': 4, 'contact': 6, 'recover': 8},
          'hit': {'recoil': 1}, 'faint': {'down': 7}, 'idle': {}}
LOOP = {'idle': True, 'attack': False, 'hit': False, 'faint': False}


def bleed(a, iters=6):
    """Spread edge colours into transparent texels (straight alpha, no dark halos when filtered)."""
    rgb = a[..., :3].astype(np.float32); al = a[..., 3]
    filled = al > 0
    for _ in range(iters):
        acc = np.zeros_like(rgb); cnt = np.zeros(al.shape, np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
            m = np.roll(filled, (dy, dx), (0, 1)); c = np.roll(rgb, (dy, dx), (0, 1))
            acc += c * m[..., None]; cnt += m
        new = (~filled) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        filled |= new
    if (~filled).any() and filled.any():
        rgb[~filled] = rgb[filled].mean(0)
    out = a.copy(); out[..., :3] = np.clip(rgb + 0.5, 0, 255).astype(np.uint8)
    return out


report = {}
sheet_rows = []
for vn, vm in meta['views'].items():
    for cn, nf in meta['clips'].items():
        files = [os.path.join(FR, vn, cn, f'{f:02d}.png') for f in range(nf)]
        if not all(os.path.exists(f) for f in files):
            print('skip', vn, cn); continue
        ims = [Image.open(f).convert('RGBA') for f in files]
        if SC != 1:
            ims = [im.resize((round(im.width * SC), round(im.height * SC)), Image.LANCZOS) for im in ims]
        ims = [np.array(im) for im in ims]
        al = np.max([im[..., 3] for im in ims], 0)
        ys, xs = np.where(al > 0)
        x0, x1, y0, y1 = max(0, xs.min() - 1), min(al.shape[1], xs.max() + 2), max(0, ys.min() - 1), min(al.shape[0], ys.max() + 2)
        cw, ch = x1 - x0, y1 - y0
        best = None
        for cols in range(1, nf + 1):
            rows = math.ceil(nf / cols)
            W, H = cols * (cw + 2 * PAD), rows * (ch + 2 * PAD)
            score = (max(W, H) > 2048, W * H, max(W, H))
            if best is None or score < best[0]:
                best = (score, cols, rows, W, H)
        _, cols, rows, W, H = best
        atlas = np.zeros((H, W, 4), np.uint8)
        rects = []
        for i, im in enumerate(ims):
            cx, cy = (i % cols) * (cw + 2 * PAD), (i // cols) * (ch + 2 * PAD)
            cell = np.zeros((ch + 2 * PAD, cw + 2 * PAD, 4), np.uint8)
            cell[PAD:PAD + ch, PAD:PAD + cw] = im[y0:y1, x0:x1]
            atlas[cy:cy + ch + 2 * PAD, cx:cx + cw + 2 * PAD] = bleed(cell)
            rects.append(dict(x=cx + PAD, y=cy + PAD, w=int(cw), h=int(ch)))
        name = f'ashkit_{cn}_{vn}'
        wp = os.path.join(OUT, name + '.webp')
        Image.fromarray(atlas).save(wp, 'WEBP', lossless=True, quality=100, method=6, exact=True)
        ax, ay = vm['anchor']
        ax, ay = ax * SC, ay * SC
        j = dict(
            image=name + '.webp', kin='ashkit', clip=cn, view=vn,
            viewNote=('front 3/4 facing right (foe; mirror X to face left)' if vn == 'front'
                      else "back 3/4 from behind-left (your kin), facing right and away"),
            camera=dict(yaw=vm['yaw'], elevation=vm['elev'], ortho=round(vm['ortho'], 4), pxPerUnit=round(vm['px_per_unit'] * SC, 2)),
            fps=meta['fps'], loop=LOOP[cn], frameCount=nf, durationMs=round(1000 * nf / meta['fps']),
            atlasSize=dict(w=W, h=H),
            sourceSize=dict(w=round(meta['size'] * SC), h=round(meta['size'] * SC)),
            cellOffset=dict(x=int(x0), y=int(y0)),
            anchor=dict(x=ax - int(x0), y=ay - int(y0), note='feet: ground point under the rest paws, cell px; the same pixel in every frame and every clip of this view'),
            anchorSource=dict(x=ax, y=ay),
            restHeightPx=round(vm['rest_h_px'] * SC, 1),
            rootOffsetPx=[[round(a * SC, 2), round(b * SC, 2)] for a, b in vm['root_px'][cn]],
            events=EVENTS[cn],
            frames=rects,
        )
        json.dump(j, open(os.path.join(OUT, name + '.json'), 'w'), indent=1, default=int)
        b = os.path.getsize(wp)
        gpu = W * H * 4 / 2 ** 20
        report[name] = dict(atlas=f'{W}x{H}', cell=f'{cw}x{ch}', bytes=b, gpu_mb=round(float(gpu), 2), gpu_mb_mips=round(float(gpu) * 4 / 3, 2))
        print(name, report[name])
        sheet_rows.append((f'{vn} / {cn}  ({nf} f @ {meta["fps"]} fps)', [im[y0:y1, x0:x1] for im in ims], (ax - x0, ay - y0)))

# contact sheet
S = 0.42 / SC
maxn = max(len(r[1]) for r in sheet_rows)
cwm = max(int(r[1][0].shape[1] * S) for r in sheet_rows); chm = max(int(r[1][0].shape[0] * S) for r in sheet_rows)
sheet = Image.new('RGB', (maxn * (cwm + 6) + 10, len(sheet_rows) * (chm + 26) + 10), (198, 205, 214))
d = ImageDraw.Draw(sheet)
yy = 6
for label, ims, (ax, ay) in sheet_rows:
    d.text((8, yy), label, fill=(15, 15, 25))
    for i, im in enumerate(ims):
        p = Image.fromarray(im)
        p = p.resize((int(p.width * S), int(p.height * S)), Image.LANCZOS)
        x = 8 + i * (cwm + 6); y = yy + 16
        sheet.paste(p, (x, y), p)
        gx, gy = x + int(ax * S), y + int(ay * S)
        d.line((x, gy, x + p.width, gy), fill=(120, 130, 150))
        d.line((gx - 4, gy, gx + 4, gy), fill=(220, 30, 30)); d.line((gx, gy - 4, gx, gy + 4), fill=(220, 30, 30))
        d.text((x + 2, y + 2), str(i), fill=(60, 60, 80))
    yy += chm + 26
sp = os.path.join(OUT, 'contact_sheet.png')
sheet.save(sp)
tot_b = sum(v['bytes'] for v in report.values()); tot_g = sum(v['gpu_mb'] for v in report.values())
report['_total'] = dict(bytes=tot_b, gpu_mb=round(tot_g, 2), gpu_mb_mips=round(tot_g * 4 / 3, 2))
json.dump(report, open(os.path.join(OUT, 'sizes.json'), 'w'), indent=1)
print('total', report['_total'], 'sheet', sp)
