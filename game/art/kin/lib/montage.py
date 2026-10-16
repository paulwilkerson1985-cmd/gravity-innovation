"""montage.py OUT.png scale cols img... -> grey-backed grid with labels"""
import sys
from PIL import Image, ImageDraw
out, scale, cols, files = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGBA') for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
M = Image.new('RGBA', (cols * w, rows * (h + 14)), (200, 206, 214, 255))
d = ImageDraw.Draw(M)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * (h + 14)
    M.alpha_composite(im.resize((w, h), Image.LANCZOS), (x, y + 14))
    d.text((x + 3, y + 1), '/'.join(f.split('/')[-3:]), fill=(20, 20, 20, 255))
M.convert('RGB').save(out)
