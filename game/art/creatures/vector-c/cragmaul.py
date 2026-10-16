"""Cragmaul — hunched boulder brute, tiny head sunk between huge shoulders, knuckle-walking.
Crystal-studded fists resting on the ground, crystal cluster on the back, cyan eyes under a
rock brow.  Brown rock, light chest, dark fists, cyan.  3/4 front, facing right."""
import math
from celkit import *

INK = "#1f1614"
RK = "#8d5f3c"
RK_SH = "#60402a"
RK_CORE = "#43291a"
RK_HI = "#b08258"
CH = "#d8b78e"      # light chest plates
CH_SH = "#ad8b62"
FI = "#4c3b35"      # dark fists / feet
FI_SH = "#2f2420"
FI_HI = "#6e5a51"
CY = "#4fe3ff"
CY_LT = "#c9f9ff"
CY_DK = "#1aa6c8"
CY_CORE = "#0d7391"
EYE = "#7cf7ff"

RECT = Shape("rect", x=0, y=0, width=W, height=H)


def rot_pts(pts, cx, cy, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return [(cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def crystal(d, cx, by, w, h, tilt=0.0, lw=7, glow=True):
    """Hexagonal-prism crystal standing on (cx, by), height h, tilted `tilt` degrees (+ = leans right)."""
    ty = by - h
    bl = (cx - w / 2, by)
    ls = (cx - w / 2, ty + 0.26 * h)
    tip = (cx, ty)
    rs = (cx + w / 2, ty + 0.32 * h)
    br = (cx + w / 2, by)
    mid_top = (cx + w * 0.06, ty + 0.36 * h)
    cb = (cx + w * 0.06, by)
    R = lambda pts: rot_pts(pts, cx, by, tilt)
    body = poly(R([bl, ls, tip, rs, br]))
    light = poly(R([bl, ls, tip, mid_top, cb]))
    dark = poly(R([cb, mid_top, rs, br]))
    darker = poly(R([(cx + w * 0.3, by), (cx + w * 0.26, ty + 0.5 * h), rs, br]))
    sliver = poly(R([(cx - w / 2 + 4, by), (cx - w / 2 + 5, ty + 0.3 * h), (cx - w / 2 + 16, ty + 0.3 * h), (cx - w / 2 + 15, by)]))
    if glow:
        gx, gy = R([(cx, by - h * 0.5)])[0]
        d.raw('<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="url(#cyglow)"/>' % (fmt(gx), fmt(gy), fmt(w * 1.8), fmt(h * 0.9)))
    d.part(body, CY, lw=lw, shades=[(light, CY_LT), (dark, CY_DK), (darker, CY_CORE), (sliver, "#ffffff", 0.85)])


def build():
    d = Doc(ink=INK, outer=24, defs='''
<radialGradient id="cyglow"><stop offset="0" stop-color="#7cf7ff" stop-opacity="0.5"/><stop offset="1" stop-color="#4fe3ff" stop-opacity="0"/></radialGradient>
<radialGradient id="eyeglow"><stop offset="0" stop-color="#9ffbff" stop-opacity="0.9"/><stop offset="1" stop-color="#4fe3ff" stop-opacity="0"/></radialGradient>
''')

    # ---------------- crystal cluster on the back (behind the torso) ----------------
    crystal(d, 318, 372, 62, 170, tilt=-26)
    crystal(d, 500, 356, 60, 160, tilt=22)
    crystal(d, 412, 362, 92, 250, tilt=-3)
    crystal(d, 360, 346, 40, 110, tilt=-12, glow=False)
    crystal(d, 462, 350, 36, 96, tilt=12, glow=False)

    # ---------------- far arm + fist ----------------
    farArm = blob([(700, 400), (812, 420), (836, 520), (870, 640), (890, 790), (786, 806), (760, 640), (724, 520)], 0.45)
    d.part(farArm, RK_SH, shades=[(poly([(770, 404), (812, 420), (890, 790), (840, 800)]), RK_CORE)])
    farFist = blob([(742, 806), (770, 776), (806, 760), (826, 772), (856, 758), (886, 772), (914, 806), (926, 850), (912, 886),
                    (880, 902), (770, 902), (740, 870)], 0.5)
    d.part(farFist, FI_SH, shades=[(farFist.moved(-12, -14), FI), (ellipse(800, 790, 22, 10), FI_HI, 0.5)],
           extra=['<path d="M 826,772 C 836,800 836,826 824,850 M 882,774 C 892,800 892,826 880,850" fill="none" stroke="%s" stroke-width="5" opacity="0.7"/>' % INK])
    crystal(d, 806, 784, 30, 76, tilt=-20, lw=5, glow=False)
    crystal(d, 858, 786, 28, 66, tilt=18, lw=5, glow=False)

    # ---------------- far shoulder boss ----------------
    farSh = blob([(690, 336), (776, 318), (846, 362), (870, 436), (842, 508), (756, 528), (690, 486)], 0.5)
    d.part(farSh, RK_SH, shades=[(ellipse(748, 384, 60, 40, rot=-20), RK, 0.8)])

    # ---------------- legs (tuck under the torso) ----------------
    def leg(x, w, far=False):
        shp = path("M %s,700 L %s,%s C %s,%s %s,%s %s,%s L %s,700 Z" % (
            fmt(x - w / 2), fmt(x - w / 2 - 12), fmt(GROUND - 40), fmt(x - w / 2 - 22), fmt(GROUND + 4),
            fmt(x + w / 2 + 26), fmt(GROUND + 6), fmt(x + w / 2 + 14), fmt(GROUND - 40), fmt(x + w / 2)))
        shades = [(Shape("rect", x=x + w * 0.15, y=600, width=w, height=400), RK_CORE if far else RK_SH),
                  (path("M %s,%s Q %s,%s %s,%s L %s,%s L %s,%s Z" % (fmt(x - w), fmt(GROUND - 66), fmt(x), fmt(GROUND - 86), fmt(x + w), fmt(GROUND - 60),
                                                                 fmt(x + w), fmt(GROUND + 20), fmt(x - w), fmt(GROUND + 20))), FI_SH if far else FI)]
        p = d.part(shp, RK_SH if far else RK, shades=shades)
        p.extra.append('<path d="M %s,%s v 26 M %s,%s v 30" stroke="%s" stroke-width="6" stroke-linecap="round" fill="none"/>' % (
            fmt(x - w * 0.12), fmt(GROUND - 30), fmt(x + w * 0.24), fmt(GROUND - 32), INK))
        return p

    leg(476, 122)
    leg(632, 114)

    # ---------------- torso (boulder; wide and low) ----------------
    torso = blob([(196, 560), (222, 430), (316, 320), (466, 270), (626, 278), (736, 346), (796, 456), (808, 580),
                  (760, 700), (650, 784), (500, 806), (350, 782), (240, 706)], 0.42)
    tsh = [(RECT, RK_SH), (torso.moved(-26, -28), RK),
           (path("M 650,784 C 760,700 808,580 796,456 L 860,490 C 870,640 810,780 660,830 Z"), RK_CORE),
           (ellipse(430, 350, 130, 50, rot=-20), RK_HI, 0.75),
           (ellipse(700, 520, 140, 76, rot=-20), RK_CORE, 0.7)]          # head/brow cast shadow
    chest = blob([(392, 572), (480, 528), (590, 526), (686, 568), (716, 650), (672, 742), (566, 786), (440, 772), (380, 690)], 0.5)
    tsh.append((chest, CH))
    tsh.append((path("M 566,610 C 650,610 700,630 716,650 C 720,710 672,742 566,786 C 520,780 500,770 470,750 C 544,730 566,690 566,610 Z"), CH_SH))
    tsh.append((ellipse(468, 596, 54, 22, rot=-20), "#ffffff", 0.35))
    p = d.part(torso, RK, shades=tsh)
    # plate seams + cracks (angular, like split stone)
    p.extra.append('<path d="M 400,626 L 486,650 L 600,644 L 700,652 M 548,650 L 560,720 L 540,780 '
                   'M 296,380 L 350,430 L 334,470 M 560,306 L 594,352 M 240,580 L 290,598 L 282,640" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="0.75"/>' % INK)
    p.extra.append('<path d="M 296,388 L 350,438 M 560,314 L 594,360" fill="none" stroke="%s" stroke-width="4" stroke-linecap="round" opacity="0.5"/>' % RK_HI)

    # ---------------- near shoulder boss ----------------
    nearSh = blob([(178, 380), (226, 284), (330, 232), (446, 242), (516, 300), (500, 384), (420, 436), (296, 444), (206, 426)], 0.5)
    d.part(nearSh, RK, shades=[(RECT, RK_SH), (nearSh.moved(-22, -26), RK), (ellipse(300, 300, 70, 34, rot=-25), RK_HI),
                               (path("M 500,384 L 516,300 L 556,340 L 536,436 Z"), RK_CORE)],
           extra=['<path d="M 366,310 L 406,342 L 394,386" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" opacity="0.7"/>' % INK])

    # ---------------- near arm (massive, slight bend, lumpy) + fist ----------------
    nearArm = blob([(214, 372), (300, 376), (410, 402), (398, 500), (374, 600), (378, 700), (386, 800), (176, 812),
                    (146, 700), (136, 600), (160, 500), (176, 430)], 0.45)
    d.part(nearArm, RK, shades=[(RECT, RK_SH), (nearArm.moved(-30, -20), RK),
                                (poly([(372, 392), (410, 402), (386, 800), (334, 806)]), RK_CORE),
                                (poly([(214, 372), (260, 374), (196, 800), (158, 790)]), RK_HI, 0.75),
                                (ellipse(214, 470, 36, 60, rot=10), RK_HI, 0.5)],
           extra=['<path d="M 286,520 L 316,556 L 298,600 M 230,660 L 262,676" fill="none" stroke="%s" stroke-width="5" stroke-linecap="round" opacity="0.6"/>' % INK])
    nearFist = blob([(104, 842), (130, 782), (166, 752), (200, 742), (222, 756), (250, 732), (286, 740), (306, 758), (340, 744),
                     (380, 764), (410, 806), (414, 858), (392, 896), (350, 904), (140, 904), (106, 880)], 0.5)
    d.part(nearFist, FI, shades=[(RECT, FI_SH), (nearFist.moved(-16, -22), FI),
                                 (ellipse(170, 790, 36, 14, rot=-20), FI_HI, 0.8),
                                 (ellipse(262, 764, 20, 8, rot=-10), FI_HI, 0.6)],
           extra=['<path d="M 222,756 C 236,790 236,824 220,854 M 306,758 C 320,790 318,824 300,854 M 364,772 C 374,800 372,830 358,856" '
                  'fill="none" stroke="%s" stroke-width="6" stroke-linecap="round" opacity="0.85"/>' % INK])
    crystal(d, 170, 772, 44, 116, tilt=-34, lw=6, glow=False)
    crystal(d, 252, 752, 54, 146, tilt=-6, lw=6, glow=False)
    crystal(d, 330, 760, 46, 120, tilt=24, lw=6, glow=False)
    crystal(d, 210, 760, 28, 70, tilt=-18, lw=5, glow=False)

    # ---------------- head (tiny, sunk between the shoulders) ----------------
    d.raw('<ellipse cx="676" cy="446" rx="130" ry="80" fill="url(#eyeglow)" opacity="0.45"/>')
    head = blob([(592, 440), (606, 392), (654, 362), (716, 362), (764, 396), (774, 452), (746, 502), (688, 524), (624, 508)], 0.5)
    d.part(head, RK, shades=[(RECT, RK_SH), (head.moved(-14, -16), RK),
                             # deep shadow under the brow ledge
                             (path("M 576,380 L 806,376 L 806,436 C 740,452 660,452 576,436 Z"), RK_CORE),
                             (path("M 600,480 C 650,510 720,510 774,452 L 780,520 L 600,530 Z"), RK_CORE, 0.6)])
    # eyes: angry glowing slits in the brow shadow (no ink; they are light sources)
    for pts in ([(600, 436), (666, 448), (668, 462), (606, 452)], [(702, 450), (766, 434), (762, 452), (704, 464)]):
        cx = sum(p[0] for p in pts) / 4
        cy = sum(p[1] for p in pts) / 4
        d.raw('<ellipse cx="%s" cy="%s" rx="56" ry="30" fill="url(#eyeglow)"/>' % (fmt(cx), fmt(cy)))
        d.part(poly(pts), CY, lw=0, ink=False, line=False, shades=[(poly(pts).moved(0, 4), CY_DK, 0.6), (ellipse(cx, cy + 1, 22, 4, rot=(8 if cx < 690 else -12)), "#f2ffff")])
    # rock brow: heavy ledge overhanging the eyes, jagged front
    brow = poly([(568, 414), (586, 366), (648, 340), (730, 338), (796, 362), (818, 408), (776, 404), (744, 414), (702, 402), (662, 416), (624, 404), (592, 416)])
    d.part(brow, RK_SH, shades=[(RECT, RK_CORE), (brow.moved(-12, -16), RK_SH), (ellipse(650, 364, 48, 12, rot=-12), RK, 0.9),
                                (poly([(568, 414), (592, 416), (624, 404), (662, 416), (702, 402), (744, 414), (776, 404), (818, 408), (818, 430), (568, 430)]), RK_CORE)])
    # grim wide mouth with under-bite teeth
    d.raw('<path d="M 628,490 Q 690,506 754,482" fill="none" stroke="%s" stroke-width="7" stroke-linecap="round"/>' % INK)
    d.raw('<path d="M 646,492 L 656,472 L 668,496 Z M 700,502 L 710,480 L 722,500 Z M 738,492 L 746,472 L 756,488 Z" fill="#f2e6d0" stroke="%s" stroke-width="3" stroke-linejoin="round"/>' % INK)
    return d


if __name__ == "__main__":
    import sys
    work = os.path.dirname(os.path.abspath(__file__))
    outdir = sys.argv[1] if len(sys.argv) > 1 else work
    png, bb, s = fit_and_render(build, "cragmaul", work, outdir)
    print(png, bb, "scale", round(s, 3))
