"""Stormoth — big moth, wide storm wings held in a V, indigo wings with a yellow lightning
bolt and cloud spots, white storm-cloud ruff, feathery antennae.  Gold fuzzy body.
3/4 front (head turned to the right), lowest point on the ground line."""
import math
from celkit import *

INK = "#1b1440"
GOLD = "#f2b53c"
GOLD_SH = "#c9842a"
GOLD_CORE = "#a0601e"
GOLD_HI = "#ffe08a"
IND = "#3d2fa0"
IND_SH = "#2a1f74"
VIO = "#7a55e0"
VIO_HI = "#a78cf5"
CLOUD = "#f6f4ff"
CLOUD_SH = "#cfc7f0"
BOLT = "#ffe24a"
BOLT_CORE = "#ffb41e"
EYE = "#1a1340"
IRIS = "#9d7dff"

RECT = Shape("rect", x=0, y=0, width=W, height=H)
AX = 526.0  # body axis for mirroring


def mx(x):
    return 2 * AX - x


def bolt_shape(p0, p1, w):
    """Lightning bolt polygon from thick base p0 to tip p1."""
    L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
    u = ((p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L)
    n = (-u[1], u[0])
    loc = [(0, -0.5), (0.42, -0.22), (0.34, -0.78), (1.0, -0.05), (0.58, 0.14), (0.66, 0.52), (0.0, 0.5)]
    pts = []
    for a, b in loc:
        x = p0[0] + u[0] * a * L + n[0] * b * w
        y = p0[1] + u[1] * a * L + n[1] * b * w
        pts.append((x, y))
    return poly(pts)


def cloud(cx, cy, s, col, shade=None):
    out = []
    circles = [(cx - 0.62 * s, cy + 0.12 * s, 0.5 * s), (cx + 0.02 * s, cy - 0.26 * s, 0.64 * s), (cx + 0.66 * s, cy + 0.14 * s, 0.46 * s)]
    if shade:
        for x, y, r in circles:
            out.append((circle(x + 0.1 * s, y + 0.16 * s, r), shade))
        out.append((ellipse(cx + 0.1 * s, cy + 0.48 * s, 1.1 * s, 0.26 * s), shade))
    for x, y, r in circles:
        out.append((circle(x, y, r), col))
    out.append((ellipse(cx, cy + 0.34 * s, 1.08 * s, 0.26 * s), col))
    return out


def feather(x0, y0, x1, y1, w, n=11):
    L = math.hypot(x1 - x0, y1 - y0)
    u = ((x1 - x0) / L, (y1 - y0) / L)
    nr = (-u[1], u[0])
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        px, py = x0 + u[0] * L * t, y0 + u[1] * L * t
        half = w * (0.18 + 0.82 * math.sin(math.pi * min(t, 0.999)) ** 0.8)
        if i == n:
            half = 0
        elif i % 2 == 1:
            half *= 0.5
        # barbs lean toward the tip
        lean = 0.12 * L / n
        left.append((px + nr[0] * half + u[0] * lean * (i % 2), py + nr[1] * half + u[1] * lean * (i % 2)))
        right.append((px - nr[0] * half + u[0] * lean * (i % 2), py - nr[1] * half + u[1] * lean * (i % 2)))
    pts = left + right[::-1]
    return poly(pts)


def build():
    d = Doc(ink=INK, outer=22)

    # ---------------- hindwings (back) ----------------
    hwL = path("M 500,626 C 410,636 300,682 220,760 Q 186,820 222,896 Q 270,904 300,862 Q 350,868 372,836 C 420,790 470,740 520,730 Z")
    hwR = path("M 552,626 C 642,636 752,682 832,760 Q 866,820 830,896 Q 782,904 752,862 Q 702,868 680,836 C 632,790 582,740 532,730 Z")
    for hw, side in ((hwL, -1), (hwR, 1)):
        shades = [(RECT, CLOUD_SH), (hw.moved(side * 4, -16), VIO), (hw.moved(side * 12, -46), IND)]
        shades += cloud(300 if side < 0 else mx(300), 798, 22, CLOUD, CLOUD_SH)
        shades.append((ellipse(560 if side > 0 else 470, 720, 110, 60, rot=side * -25), IND_SH, 0.9 if side > 0 else 0.35))
        d.part(hw, IND, shades=shades, tf=("translate(%s 0) scale(%s 1) translate(-%s 0)" % (fmt(AX), "1.05" if side < 0 else "0.84", fmt(AX))))

    # ---------------- forewings (held up in a V) ----------------
    fwL = path("M 492,548 C 392,470 236,306 112,150 Q 84,224 122,290 Q 96,348 126,400 Q 112,468 150,522 C 260,560 380,606 480,634 Z")
    fwR = path("M 560,548 C 660,470 816,306 940,150 Q 968,224 930,290 Q 956,348 926,400 Q 940,468 902,522 C 792,560 672,606 572,634 Z")
    for fw, side in ((fwL, -1), (fwR, 1)):
        shades = [(RECT, CLOUD_SH), (fw.moved(side * -22, 6), VIO), (fw.moved(side * -62, 14), IND)]
        # lit side highlight band near the leading edge (upper-left light)
        if side < 0:
            shades.append((path("M 492,548 C 392,470 236,306 112,150 C 150,210 240,300 320,380 C 380,440 440,500 492,548 Z"), VIO_HI, 0.35))
        # cel shadow on the trailing third (wing curves away from the light)
        if side < 0:
            shades.append((path("M 150,522 C 260,560 380,606 480,634 L 500,600 C 420,560 300,520 170,470 Z"), IND_SH, 0.9))
        else:
            shades.append((path("M 902,522 C 792,560 672,606 572,634 L 552,600 C 632,560 752,520 882,470 Z"), IND_SH, 0.9))
        # lightning bolt
        if side < 0:
            shades.append((bolt_shape((404, 520), (150, 236), 82), BOLT_CORE))
            shades.append((bolt_shape((398, 508), (160, 246), 64), BOLT))
        else:
            shades.append((bolt_shape((mx(404), 520), (mx(150), 236), 82), BOLT_CORE))
            shades.append((bolt_shape((mx(398), 508), (mx(160), 246), 64), BOLT))
        # cloud spots
        if side < 0:
            shades += cloud(216, 446, 38, CLOUD, CLOUD_SH)
            shades += cloud(186, 292, 26, CLOUD, CLOUD_SH)
        else:
            shades += cloud(mx(216), 446, 38, CLOUD, CLOUD_SH)
            shades += cloud(mx(186), 292, 26, CLOUD, CLOUD_SH)
        p = d.part(fw, IND, shades=shades, tf=("translate(%s 0) scale(%s 1) translate(-%s 0)" % (fmt(AX), "1.06" if side < 0 else "0.84", fmt(AX))))
        # veins
        if side < 0:
            p.extra.append('<path d="M 480,600 C 380,500 250,380 150,300 M 480,600 C 360,540 240,470 140,420 M 470,580 C 380,420 280,300 180,200" '
                           'fill="none" stroke="%s" stroke-width="4" opacity="0.35"/>' % INK)
        else:
            p.extra.append('<path d="M 572,600 C 672,500 802,380 902,300 M 572,600 C 692,540 812,470 912,420 M 582,580 C 672,420 772,300 872,200" '
                           'fill="none" stroke="%s" stroke-width="4" opacity="0.35"/>' % INK)

    # ---------------- abdomen ----------------
    abd = blob([(478, 612), (592, 612), (608, 700), (588, 800), (558, 880), (520, 882), (478, 800), (464, 700)], 0.55)
    ashades = [(RECT, GOLD_SH), (abd.moved(-16, -10), GOLD)]
    for y, h in ((690, 26), (758, 24), (822, 20)):
        ashades.append((path("M 440,%s Q 536,%s 632,%s L 632,%s Q 536,%s 440,%s Z" % (y, y + 24, y, y + h, y + h + 24, y + h)), VIO))
    ashades.append((Shape("rect", x=540, y=600, width=120, height=300), IND_SH, 0.22))
    ashades.append((ellipse(500, 690, 16, 60, rot=4), GOLD_HI, 0.8))
    d.part(abd, GOLD, shades=ashades)

    # ---------------- legs (small gold hooks under the thorax) ----------------
    for dpath in ("M 474,636 C 446,652 436,676 448,696", "M 574,636 C 602,652 612,676 600,696"):
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="22" stroke-linecap="round"/>' % (dpath, INK))
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="10" stroke-linecap="round"/>' % (dpath, GOLD_SH))

    # ---------------- thorax (fuzzy gold ball) ----------------
    th = tuft_outline(522, 562, 106, 94, n=18, depth=0.07, sharp=0.6)
    d.part(th, GOLD, shades=sphere_shades(522, 562, 106, 94, GOLD_SH, GOLD_HI, base=GOLD, k=0.16, core=GOLD_CORE, hi_scale=0.32, hi_off=(-0.46, -0.5)))

    # ---------------- storm-cloud ruff ----------------
    ruff = tuft_outline(530, 500, 178, 70, n=9, depth=0.22, sharp=1.0, phase=0.3)
    d.part(ruff, CLOUD, shades=[(RECT, CLOUD_SH), (ruff.moved(-12, -20), CLOUD),
                                 (ellipse(440, 476, 60, 22, rot=-10), "#ffffff", 0.8)])

    # ---------------- antennae (behind head) ----------------
    def plume(x0, y0, x1, y1, w, n=13, col=GOLD):
        L = math.hypot(x1 - x0, y1 - y0)
        u = ((x1 - x0) / L, (y1 - y0) / L)
        nr = (-u[1], u[0])
        barbs = []
        for i in range(1, n + 1):
            t = i / (n + 1)
            px, py = x0 + u[0] * L * t, y0 + u[1] * L * t
            ln = w * (0.35 + 0.65 * math.sin(math.pi * t) ** 0.7)
            for sgn in (1, -1):
                ex = px + (nr[0] * sgn * 0.75 + u[0] * 0.65) * ln
                ey = py + (nr[1] * sgn * 0.75 + u[1] * 0.65) * ln
                barbs.append("M %s,%s L %s,%s" % (fmt(px), fmt(py), fmt(ex), fmt(ey)))
        stalk = "M %s,%s L %s,%s" % (fmt(x0), fmt(y0), fmt(x1), fmt(y1))
        bd = " ".join(barbs)
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="13" stroke-linecap="round"/>' % (bd, INK))
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="15" stroke-linecap="round"/>' % (stalk, INK))
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round"/>' % (bd, col))
        d.raw('<path d="%s" fill="none" stroke="%s" stroke-width="7" stroke-linecap="round"/>' % (stalk, GOLD_SH))

    plume(518, 372, 296, 98, 36)
    plume(588, 368, 790, 96, 34)

    # ---------------- head ----------------
    head = tuft_outline(556, 420, 86, 80, n=14, depth=0.06, sharp=0.6, phase=0.2)
    d.part(head, GOLD, shades=sphere_shades(556, 420, 86, 80, GOLD_SH, GOLD_HI, base=GOLD, k=0.16, hi_scale=0.34, hi_off=(-0.44, -0.5)))

    # eyes: big slanted almonds (stage 2), dark with violet glow
    def eye(cx, cy, rx, ry, rot, look):
        # almond: pointed outer-upper corner, round inner-lower
        shp = path("M %s,%s C %s,%s %s,%s %s,%s C %s,%s %s,%s %s,%s Z" % (
            fmt(cx - rx), fmt(cy + ry * 0.1), fmt(cx - rx * 0.9), fmt(cy - ry * 0.9), fmt(cx + rx * 0.3), fmt(cy - ry * 1.25),
            fmt(cx + rx * 1.05), fmt(cy - ry * 0.75), fmt(cx + rx * 0.95), fmt(cy + ry * 0.4), fmt(cx + rx * 0.2), fmt(cy + ry * 1.0),
            fmt(cx - rx * 0.6), fmt(cy + ry * 0.9)), rot=(rot, cx, cy))
        d.part(shp, EYE, lw=6, ink=False, shades=[
            (ellipse(cx + 2, cy + 8, rx * 0.9, ry * 0.8, rot=rot), "#2d2470"),
            (ellipse(cx + look[0], cy + look[1], rx * 0.5, ry * 0.42, rot=rot), IRIS),
            (ellipse(cx + look[0], cy + look[1] + 2, rx * 0.3, ry * 0.26, rot=rot), EYE),
            (ellipse(cx - rx * 0.36, cy - ry * 0.42, rx * 0.3, ry * 0.18, rot=rot - 20), "#ffffff"),
            (ellipse(cx + rx * 0.3, cy + ry * 0.5, rx * 0.14, ry * 0.1, rot=rot), "#ffffff", 0.85),
        ])
        # slanted upper lid
        d.raw('<path d="M %s,%s C %s,%s %s,%s %s,%s" fill="none" stroke="%s" stroke-width="12" stroke-linecap="round" transform="rotate(%s %s %s)"/>' % (
            fmt(cx - rx * 1.02), fmt(cy + ry * 0.05), fmt(cx - rx * 0.9), fmt(cy - ry * 0.95), fmt(cx + rx * 0.3), fmt(cy - ry * 1.3), fmt(cx + rx * 1.1), fmt(cy - ry * 0.78), INK, fmt(rot), fmt(cx), fmt(cy)))

    eye(528, 426, 36, 40, 10, (6, 6))
    eye(606, 418, 30, 38, 0, (6, 6))
    # small determined mouth
    d.raw('<path d="M 560,478 Q 582,490 604,474" fill="none" stroke="%s" stroke-width="6" stroke-linecap="round"/>' % INK)
    return d


if __name__ == "__main__":
    import sys
    work = os.path.dirname(os.path.abspath(__file__))
    outdir = sys.argv[1] if len(sys.argv) > 1 else work
    png, bb, s = fit_and_render(build, "stormoth", work, outdir)
    print(png, bb, "scale", round(s, 3))
