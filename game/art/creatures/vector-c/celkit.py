"""Tiny hand-authored cel-shaded SVG kit for the Orbkin art bake-off (approach C).

Style contract
- Two-pass ink: every structural Part is drawn once in the ink colour with a fat round-joined
  stroke (outer silhouette line), then again with its fill and a thinner stroke (interior
  lines).  Because the fill pass covers the fat strokes wherever there is colour, the fat
  line survives only on the outer silhouette -> natural line-weight variation.
- Cel shading: per Part, a list of shade shapes (shadow / core shadow / highlight) drawn
  clipped to the part.  Light is from the upper-left for every creature.
- Markings (fur masks, stripes) are shade shapes with no ink; eyes & details are Raw overlays.
"""
import math
import subprocess
import os

from PIL import Image

W = H = 1024
GROUND = 900.0
TARGET_H = 820.0


def fmt(v):
    if isinstance(v, float):
        return ("%.2f" % v).rstrip("0").rstrip(".")
    return str(v)


class Shape:
    def __init__(self, tag, **attrs):
        self.tag = tag
        self.attrs = attrs

    def svg(self, **over):
        a = dict(self.attrs)
        a.update(over)
        parts = []
        for k, v in a.items():
            if v is None:
                continue
            parts.append('%s="%s"' % (k.replace("_", "-"), fmt(v)))
        return "<%s %s/>" % (self.tag, " ".join(parts))

    def moved(self, dx, dy, s=1.0):
        t = "translate(%s %s) scale(%s)" % (fmt(dx), fmt(dy), fmt(s))
        prev = self.attrs.get("transform")
        a = dict(self.attrs)
        a["transform"] = t if not prev else t + " " + prev
        return Shape(self.tag, **a)


def ellipse(cx, cy, rx, ry=None, rot=0):
    ry = rx if ry is None else ry
    tr = None
    if rot:
        tr = "rotate(%s %s %s)" % (fmt(rot), fmt(cx), fmt(cy))
    return Shape("ellipse", cx=cx, cy=cy, rx=rx, ry=ry, transform=tr)


def circle(cx, cy, r):
    return Shape("circle", cx=cx, cy=cy, r=r)


def path(d, rot=None):
    tr = None
    if rot:
        tr = "rotate(%s %s %s)" % tuple(fmt(x) for x in rot)
    return Shape("path", d=d, transform=tr)


def poly(pts, close=True):
    d = "M" + " L".join("%s,%s" % (fmt(x), fmt(y)) for x, y in pts)
    return path(d + (" Z" if close else ""))


def blob(pts, tension=0.5, close=True):
    """Smooth closed Catmull-Rom spline through pts -> cubic path (organic forms)."""
    n = len(pts)
    if n < 3:
        return poly(pts, close)
    out = ["M%s,%s" % (fmt(pts[0][0]), fmt(pts[0][1]))]
    rng = range(n) if close else range(n - 1)
    for i in rng:
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        if not close:
            p0 = pts[max(i - 1, 0)]
            p3 = pts[min(i + 2, n - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3)
        c2 = (p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3)
        out.append("C%s,%s %s,%s %s,%s" % tuple(fmt(v) for v in (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1])))
    if close:
        out.append("Z")
    return path(" ".join(out))


def tuft_outline(cx, cy, rx, ry, n, depth, phase=0.0, sharp=0.55, rot=0.0):
    """Fluffy fur ball: ellipse with n pointed tufts (alternating radius)."""
    pts = []
    for i in range(2 * n):
        a = phase + math.pi * i / n
        r = 1.0 if i % 2 == 0 else 1.0 - depth
        x = cx + math.cos(a) * rx * r
        y = cy + math.sin(a) * ry * r
        pts.append((x, y))
    if rot:
        cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))
        pts = [(cx + (x - cx) * cr - (y - cy) * sr, cy + (x - cx) * sr + (y - cy) * cr) for x, y in pts]
    return blob(pts, tension=sharp)


class Part:
    """Structural form: participates in the ink pass. shades = [(Shape, fill, opacity), ...]."""

    def __init__(self, shape, fill, lw=8, shades=None, ink=True, line=True, extra=None, tf=None):
        self.tf = tf        # optional transform applied to the whole part (shape + shades)
        self.shape = shape
        self.fill = fill
        self.lw = lw
        self.shades = shades or []
        self.ink = ink      # contributes to the fat silhouette pass
        self.line = line    # draws its own thin interior line
        self.extra = extra or []  # raw svg strings drawn after the shades, clipped to the part


class Raw:
    def __init__(self, svg):
        self.svg = svg


class Doc:
    def __init__(self, ink="#231a1e", outer=22, defs=""):
        self.items = []
        self.ink = ink
        self.outer = outer
        self.defs = defs

    def add(self, *items):
        for it in items:
            self.items.append(it)
        return items[-1] if items else None

    def part(self, shape, fill, **kw):
        p = Part(shape, fill, **kw)
        self.items.append(p)
        return p

    def raw(self, svg):
        self.items.append(Raw(svg))

    def render(self, transform=None):
        parts = [it for it in self.items if isinstance(it, Part)]
        ids = {id(p): "p%d" % i for i, p in enumerate(parts)}
        defs = [self.defs]
        for p in parts:
            # the clip is referenced from inside the part's transformed group, so no tf here
            defs.append('<clipPath id="c%s">%s</clipPath>' % (ids[id(p)], p.shape.svg()))
        out = ['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
               'viewBox="0 0 %d %d" width="%d" height="%d">' % (W, H, W, H)]
        out.append("<defs>%s</defs>" % "".join(defs))
        out.append('<g transform="%s">' % transform if transform else "<g>")
        # ink pass
        out.append('<g stroke="%s" stroke-width="%s" stroke-linejoin="round" stroke-linecap="round" fill="%s">'
                   % (self.ink, fmt(self.outer), self.ink))
        for p in parts:
            if p.ink:
                if p.tf:
                    out.append('<g transform="%s">%s</g>' % (p.tf, p.shape.svg()))
                else:
                    out.append(p.shape.svg())
        out.append("</g>")
        # fill pass
        out.append('<g stroke-linejoin="round" stroke-linecap="round">')
        for it in self.items:
            if isinstance(it, Raw):
                out.append(it.svg)
                continue
            p = it
            pid = ids[id(p)]
            if p.tf:
                out.append('<g transform="%s">' % p.tf)
            if p.line:
                out.append(p.shape.svg(fill=p.fill, stroke=self.ink, stroke_width=p.lw))
            else:
                out.append(p.shape.svg(fill=p.fill, stroke="none"))
            if p.shades or p.extra:
                out.append('<g clip-path="url(#c%s)">' % pid)
                for sh in p.shades:
                    shp, fill = sh[0], sh[1]
                    op = sh[2] if len(sh) > 2 else None
                    out.append(shp.svg(fill=fill, stroke="none", opacity=op))
                for e in p.extra:
                    out.append(e)
                out.append("</g>")
            # redraw the thin line on top so shades never cover the ink
            if p.line and (p.shades or p.extra):
                out.append(p.shape.svg(fill="none", stroke=self.ink, stroke_width=p.lw))
            if p.tf:
                out.append("</g>")
        out.append("</g></g></svg>")
        return "\n".join(out)


# ---------- shading helpers ----------
def sphere_shades(cx, cy, rx, ry, shadow, hi, base=None, k=0.16, core=None, hi_scale=0.36, hi_off=(-0.42, -0.45)):
    """Standard cel sphere: shadow crescent lower-right, highlight blob upper-left."""
    out = []
    # shadow: fill everything with shadow, then put the base colour back offset to upper-left
    out.append((Shape("rect", x=0, y=0, width=W, height=H), shadow))
    out.append((ellipse(cx - rx * k, cy - ry * k, rx * 1.02, ry * 1.02), base))
    if core:
        out.append((Shape("rect", x=0, y=0, width=W, height=H), core))
        out.append((ellipse(cx - rx * k * 1.9, cy - ry * k * 1.9, rx * 1.1, ry * 1.1), shadow))
        out.append((ellipse(cx - rx * k, cy - ry * k, rx * 1.02, ry * 1.02), base))
    out.append((ellipse(cx + rx * hi_off[0], cy + ry * hi_off[1], rx * hi_scale, ry * hi_scale * 0.7, rot=-30), hi))
    return out


def rasterise(svg_text, svg_path, png_path):
    with open(svg_path, "w") as f:
        f.write(svg_text)
    subprocess.run(["inkscape", svg_path, "-w", str(W), "-h", str(H), "--export-type=png", "-o", png_path],
                   check=True, stderr=subprocess.DEVNULL, timeout=180)


def bbox(png_path, thr=24):
    im = Image.open(png_path).convert("RGBA")
    a = im.getchannel("A").point(lambda v: 255 if v > thr else 0)
    return a.getbbox()


def fit_and_render(build, name, workdir, outdir, outer_ink=10):
    """Render once, measure alpha bbox, then re-render with a transform so the art is
    TARGET_H tall, centred at x=512 and standing on GROUND (the fat outer ink is included)."""
    doc = build()
    svg1 = os.path.join(workdir, name + "_raw.svg")
    png1 = os.path.join(workdir, name + "_raw.png")
    rasterise(doc.render(), svg1, png1)
    x0, y0, x1, y1 = bbox(png1)
    h = y1 - y0
    s = TARGET_H / h
    cx = (x0 + x1) / 2
    # scale about origin then translate: new = s*p + t
    tx = W / 2 - s * cx
    ty = GROUND - s * y1
    tr = "translate(%s %s) scale(%s)" % (fmt(tx), fmt(ty), fmt(s))
    svg2 = os.path.join(workdir, name + ".svg")
    png2 = os.path.join(outdir, name + ".png")
    print("raw bbox", (x0, y0, x1, y1))
    for _ in range(3):
        rasterise(build().render(transform=tr), svg2, png2)
        bx0, by0, bx1, by1 = bbox(png2)
        dy = GROUND - by1
        dx = W / 2 - (bx0 + bx1) / 2
        if abs(dx) <= 1 and abs(dy) <= 1:
            break
        tx += dx
        ty += dy
        tr = "translate(%s %s) scale(%s)" % (fmt(tx), fmt(ty), fmt(s))
    bb = bbox(png2)
    return png2, bb, s


def contact_sheet(pngs, out, bg=(236, 232, 224)):
    n = len(pngs)
    sheet = Image.new("RGBA", (512 * n, 512), bg + (255,))
    for i, p in enumerate(pngs):
        im = Image.open(p).convert("RGBA").resize((512, 512), Image.LANCZOS)
        sheet.alpha_composite(im, (512 * i, 0))
    sheet.save(out)
