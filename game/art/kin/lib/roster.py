"""roster.py OUT.png [view=front] [clip=idle] [frame=0] -> every kin's sheet frame on one labelled grid, at a shared
world scale (each sheet's camera pxPerUnit), standing on a common ground line. Reads ../../ashkit/sheets and
../<kin>/sheets next to this file; kin without sheets are skipped (listed at the end)."""
import sys, os, json
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
out = sys.argv[1]
view = sys.argv[2] if len(sys.argv) > 2 else 'front'
clip = sys.argv[3] if len(sys.argv) > 3 else 'idle'
fi = int(sys.argv[4]) if len(sys.argv) > 4 else 0
PPU = 95.0                       # roster px per world unit
COLS, CW, CH = 6, 340, 260

dirs = [('ashkit', os.path.join(HERE, '..', '..', 'ashkit', 'sheets'))]
dirs += [(k, os.path.join(HERE, '..', k, 'sheets')) for k in sorted(os.listdir(os.path.join(HERE, '..')))
         if k != 'lib' and os.path.isdir(os.path.join(HERE, '..', k))]
tiles, missing = [], []
for kin, d in dirs:
    jp = os.path.join(d, f'{kin}_{clip}_{view}.json')
    if not os.path.exists(jp):
        missing.append(kin); continue
    J = json.load(open(jp))
    fr = J['frames'][min(fi, len(J['frames']) - 1)]
    im = Image.open(os.path.join(d, J['image'])).convert('RGBA').crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h']))
    s = PPU / J['camera']['pxPerUnit']
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    tiles.append((kin, im, J['anchor']['x'] * s, J['anchor']['y'] * s))
rows = (len(tiles) + COLS - 1) // COLS
M = Image.new('RGBA', (COLS * CW, rows * CH), (200, 206, 214, 255))
dr = ImageDraw.Draw(M)
for i, (kin, im, ax, ay) in enumerate(tiles):
    x0, y0 = (i % COLS) * CW, (i // COLS) * CH
    gy = y0 + CH - 40                                   # the ground line
    dr.line((x0 + 20, gy, x0 + CW - 20, gy), fill=(150, 156, 166, 255), width=2)
    M.alpha_composite(im, (int(x0 + CW / 2 - ax), int(gy - ay)))
    dr.text((x0 + 8, y0 + CH - 28), kin, fill=(20, 20, 20, 255))
M.convert('RGB').save(out, quality=90)
print(f'{len(tiles)} kin -> {out}' + (f'; no sheets: {", ".join(missing)}' if missing else ''))
