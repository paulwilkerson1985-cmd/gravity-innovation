"""Ashkit — chubby fox kit, head as big as the body, stubby legs, huge ears,
sooty ear tips and socks, glowing ember on a short fluffy tail.  3/4 front, facing right."""
from celkit import *

INK = "#2b181c"
OR = "#ff7a2e"      # base orange
OR_SH = "#d9501f"   # cel shadow
OR_CORE = "#b8391a"  # core shadow
OR_HI = "#ffa661"   # highlight
CR = "#fff0d6"      # cream mask / belly
CR_SH = "#efc99a"
SOOT = "#3b3236"
SOOT_SH = "#241d21"
SOOT_HI = "#5a4f55"
EMB_Y = "#ffe14a"
EMB_O = "#ff8a1a"
EMB_R = "#ff4d1a"
EYE = "#2a1518"
IRIS = "#f7a21b"
IRIS_SH = "#b9560d"

RECT = Shape("rect", x=0, y=0, width=W, height=H)


def build():
    d = Doc(ink=INK, outer=24, defs='''
<radialGradient id="glow"><stop offset="0" stop-color="#ffd23a" stop-opacity="0.9"/>
<stop offset="0.4" stop-color="#ff8a1a" stop-opacity="0.4"/><stop offset="1" stop-color="#ff6a00" stop-opacity="0"/></radialGradient>
''')

    # ---------------- tail (behind everything), curling up-left ----------------
    tail = blob([(330, 640), (300, 700), (250, 722), (204, 700), (172, 660), (150, 630), (178, 618), (166, 574),
                 (184, 562), (176, 520), (204, 512), (210, 476), (236, 468), (262, 496), (286, 548), (322, 600)], tension=0.5)
    d.part(tail, OR, shades=[
        (RECT, OR_SH),
        (tail.moved(-20, -22, 1.0), OR),
        (ellipse(226, 560, 22, 46, rot=12), OR_HI),
    ])
    # ember glow halo (soft)
    d.raw('<circle cx="232" cy="455" r="130" fill="url(#glow)"/>')
    # ember flame at the tail tip
    ember = path("M 236,380 C 268,420 292,452 288,488 C 284,520 258,540 234,538 C 206,536 182,516 184,486 "
                 "C 186,460 206,444 210,420 C 212,442 226,450 238,444 C 226,424 228,402 236,380 Z")
    d.part(ember, EMB_O, lw=7, shades=[
        (path("M 240,416 C 258,444 272,466 268,494 C 264,516 250,524 236,522 C 216,520 206,506 208,488 "
              "C 210,470 222,460 224,446 C 232,456 240,448 240,416 Z"), EMB_Y),
        (ellipse(266, 500, 22, 34, rot=-20), EMB_R, 0.55),
        (ellipse(226, 486, 10, 16), "#fff7b0"),
    ])

    # ---------------- legs (all behind the body so their tops tuck under it) ----------------
    def leg(x, top, w=78, sockh=64, far=False):
        bottom = GROUND
        sh = path("M %s,%s L %s,%s C %s,%s %s,%s %s,%s L %s,%s Z" % (
            fmt(x - w / 2), fmt(top), fmt(x - w / 2 - 5), fmt(bottom - 32),
            fmt(x - w / 2 - 8), fmt(bottom + 2), fmt(x + w / 2 + 16), fmt(bottom + 4), fmt(x + w / 2 + 7), fmt(bottom - 32),
            fmt(x + w / 2), fmt(top)))
        fill = OR_SH if far else OR
        st = bottom - sockh
        # tufted sock edge: zigzag
        sock = path("M %s,%s L %s,%s L %s,%s L %s,%s L %s,%s L %s,%s L %s,%s L %s,%s Z" % (
            fmt(x - w), fmt(st + 10), fmt(x - w * 0.42), fmt(st + 14), fmt(x - w * 0.22), fmt(st - 14),
            fmt(x - w * 0.02), fmt(st + 12), fmt(x + w * 0.2), fmt(st - 16), fmt(x + w * 0.42), fmt(st + 10),
            fmt(x + w), fmt(st + 2), fmt(x + w), fmt(bottom + 30)))
        sock_sh = path("M %s,%s L %s,%s L %s,%s L %s,%s Z" % (
            fmt(x + w * 0.1), fmt(st - 20), fmt(x + w), fmt(st - 20), fmt(x + w), fmt(bottom + 30), fmt(x + w * 0.16), fmt(bottom + 30)))
        shades = [
            (Shape("rect", x=x + w * 0.16, y=top, width=w, height=bottom - top), OR_CORE if far else OR_SH),
            (sock, SOOT_SH if far else SOOT),
            (sock_sh, SOOT_SH),
            # toe separations
        ]
        if not far:
            shades.append((ellipse(x - w * 0.2, bottom - 30, w * 0.2, 12, rot=-10), SOOT_HI))
            shades.append((path("M %s,%s L %s,%s L %s,%s" % (fmt(x - w * 0.5), fmt(st - 8), fmt(x - w * 0.5), fmt(st - 8), fmt(x - w * 0.5), fmt(st))), SOOT))
        p = d.part(sh, fill, shades=shades)
        if not far:
            # toe lines
            p.extra.append('<path d="M %s,%s v 16 M %s,%s v 18" stroke="%s" stroke-width="5" stroke-linecap="round" fill="none"/>' % (
                fmt(x - w * 0.14), fmt(bottom - 18), fmt(x + w * 0.2), fmt(bottom - 18), INK))
        return p

    leg(322, 700, w=72, far=True)     # far hind
    leg(486, 700, w=70, far=True)     # far fore (peeks between the near legs)
    leg(392, 700, w=82)               # near hind
    leg(572, 690, w=88)               # near fore (planted forward)

    # ---------------- body ----------------
    body = ellipse(447, 660, 194, 152, rot=-7)
    bshades = sphere_shades(447, 660, 194, 152, OR_SH, OR_HI, base=OR, k=0.15, core=OR_CORE, hi_scale=0.3, hi_off=(-0.5, -0.45))
    bshades.append((ellipse(588, 590, 196, 126, rot=-10), OR_CORE, 0.8))          # cast shadow from the head
    bshades.append((blob([(392, 690), (430, 630), (505, 606), (590, 620), (642, 690), (612, 780), (540, 820), (450, 826), (393, 790)], 0.6), CR))
    bshades.append((blob([(440, 680), (520, 650), (610, 680), (644, 750), (602, 812), (520, 830), (470, 822), (438, 780)], 0.6), CR_SH))
    bshades.append((blob([(406, 706), (450, 640), (512, 614), (580, 628), (618, 676), (587, 738), (520, 762), (460, 760), (418, 746)], 0.6), CR))
    bshades.append((ellipse(588, 590, 196, 126, rot=-10), OR_CORE, 0.35))
    d.part(body, OR, shades=bshades)

    # chest ruff (cream tuft at the front, below the chin)
    ruff = path("M 570,596 C 610,588 648,598 672,622 C 686,640 690,662 682,684 C 668,666 652,670 644,690 "
                "C 628,672 606,672 592,690 C 580,672 562,670 548,676 Z")
    # (ruff dropped after critique: read as a pasted-on bib)

    # ---------------- ears (behind head) ----------------
    earL = path("M 392,330 C 380,250 396,160 440,86 C 486,150 530,200 556,246 C 520,262 460,300 392,330 Z")
    earR = path("M 592,236 C 626,196 676,142 722,92 C 748,170 744,260 732,330 C 690,300 640,262 592,236 Z")
    innerL = path("M 414,312 C 410,250 420,186 444,130 C 476,176 500,206 520,242 C 488,258 450,286 414,312 Z")
    innerR = path("M 606,244 C 636,210 674,170 712,130 C 728,190 726,250 718,302 C 684,278 648,256 606,244 Z")
    d.part(earL, OR, shades=[
        (innerL, CR),
        (path("M 404,200 C 410,150 420,116 440,86 C 466,124 488,160 506,190 C 470,196 436,200 404,200 Z"), SOOT),
        (path("M 416,180 C 422,150 430,120 440,96 C 456,124 470,148 482,170 Z"), SOOT_HI, 0.5),
        (path("M 500,210 C 520,230 540,244 560,250 L 540,258 Z"), OR_SH),
        (path("M 470,230 C 490,236 510,248 530,262 L 556,246 L 520,200 Z"), CR_SH),
    ])
    d.part(earR, OR, shades=[
        (innerR, CR),
        (path("M 650,172 C 674,142 698,116 722,92 C 736,134 742,170 742,206 C 712,196 680,186 650,172 Z"), SOOT),
        (path("M 700,150 C 708,130 716,112 722,100 C 730,124 734,146 736,166 Z"), SOOT_HI, 0.45),
        (path("M 700,250 C 724,266 736,296 734,336 L 760,300 Z"), OR_SH),
        (path("M 660,250 C 690,262 712,286 724,310 L 734,330 L 740,250 Z"), CR_SH),
    ])

    # ---------------- cheek fluff (behind the head; only the spikes show) ----------------
    cheekL = path("M 420,430 C 380,440 356,452 336,470 C 352,476 362,484 358,502 C 340,504 326,516 320,536 "
                  "C 342,536 356,544 356,566 C 372,560 384,564 390,584 L 440,520 Z")
    d.part(cheekL, OR, shades=[(RECT, OR_SH), (cheekL.moved(-10, -16), OR)])
    # forehead tuft
    tuftF = path("M 520,256 C 526,228 548,210 572,196 C 574,226 590,238 612,246 Z")
    d.part(tuftF, OR, shades=[(path("M 560,240 C 568,222 578,210 572,196 C 574,226 590,238 612,246 Z"), OR_SH)])

    # ---------------- head (big, snout folded into the contour) ----------------
    head = blob([(360, 420), (380, 330), (440, 262), (545, 232), (650, 248), (728, 298), (768, 366),
                 (796, 440), (818, 500), (806, 554), (768, 594), (700, 626), (610, 644), (505, 638),
                 (420, 610), (372, 552), (352, 490)], tension=0.55)
    hshades = sphere_shades(570, 436, 215, 200, OR_SH, OR_HI, base=OR, k=0.14, core=None, hi_scale=0.34, hi_off=(-0.46, -0.52))
    # cream mask: cheeks + muzzle, orange blaze down the nose bridge
    mask = path("M 356,470 C 380,420 430,418 468,446 C 500,470 522,500 544,470 C 566,440 606,418 660,430 "
                "C 720,444 790,452 830,490 C 834,560 780,610 700,632 C 600,650 450,620 356,520 Z")
    hshades.append((mask, CR))
    hshades.append((path("M 560,560 C 640,566 720,560 790,520 L 836,480 C 834,560 780,610 700,632 "
                         "C 640,644 560,640 500,626 C 530,612 556,596 560,560 Z"), CR_SH))
    # muzzle: soft bridge shadow so the snout reads as a form
    hshades.append((ellipse(740, 520, 90, 54, rot=14), CR_SH, 0.9))
    hshades.append((ellipse(722, 500, 84, 48, rot=14), CR))
    hshades.append((ellipse(700, 486, 34, 16, rot=-18), "#ffffff", 0.75))
    d.part(head, OR, shades=hshades)

    # ---------------- mouth: open yip ----------------
    mouth = path("M 696,570 C 730,566 772,560 804,546 C 798,588 770,618 732,616 C 706,614 694,596 696,570 Z")
    d.part(mouth, "#5a1d22", lw=6, ink=False, shades=[
        (ellipse(752, 616, 36, 24), "#ff7d8c"),
        (path("M 696,570 C 730,566 772,560 804,546 L 802,562 C 772,574 730,580 696,584 Z"), "#ffffff"),
    ])
    d.raw('<path d="M 716,572 L 724,590 L 734,570 Z" fill="#ffffff" stroke="%s" stroke-width="3"/>' % INK)
    # nose
    nose = path("M 792,440 C 816,434 838,446 840,464 C 840,480 822,488 806,482 C 792,476 786,458 792,440 Z")
    d.part(nose, "#2a1518", lw=6, shades=[(ellipse(808, 452, 12, 7, rot=-25), "#7a5a60")])

    # ---------------- eyes ----------------
    def eye(cx, cy, rx, ry, look=(8, 4)):
        sclera = ellipse(cx, cy, rx, ry, rot=-6)
        shade = [(ellipse(cx + 4, cy + 6, rx, ry, rot=-6), "#d9d2dc"), (ellipse(cx - 2, cy - 2, rx * 0.96, ry * 0.96, rot=-6), "#ffffff")]
        d.part(sclera, "#ffffff", lw=7, shades=shade, ink=False)
        ir = rx * 0.8
        iris = ellipse(cx + look[0], cy + look[1], ir, ir * 1.05)
        d.part(iris, IRIS, lw=5, ink=False, shades=[
            (ellipse(cx + look[0] + 2, cy + look[1] + ir * 0.5, ir, ir * 0.9), IRIS_SH),
            (ellipse(cx + look[0] + 1, cy + look[1] + 2, ir * 0.58, ir * 0.6), EYE),
            (ellipse(cx + look[0] - ir * 0.42, cy + look[1] - ir * 0.42, ir * 0.3, ir * 0.24, rot=-30), "#ffffff"),
            (ellipse(cx + look[0] + ir * 0.34, cy + look[1] + ir * 0.44, ir * 0.14, ir * 0.12), "#ffffff", 0.9),
        ])
        d.raw('<path d="M %s,%s Q %s,%s %s,%s" fill="none" stroke="%s" stroke-width="12" stroke-linecap="round"/>' % (
            fmt(cx - rx * 1.05), fmt(cy - ry * 0.55), fmt(cx), fmt(cy - ry * 1.3), fmt(cx + rx * 1.02), fmt(cy - ry * 0.7), INK))

    eye(502, 440, 54, 60, look=(10, 6))
    eye(660, 428, 44, 56, look=(10, 6))
    d.raw('<path d="M 440,352 Q 496,340 550,364" fill="none" stroke="%s" stroke-width="10" stroke-linecap="round"/>' % INK)
    d.raw('<path d="M 618,350 Q 660,336 704,358" fill="none" stroke="%s" stroke-width="9" stroke-linecap="round"/>' % INK)
    # whisker ticks
    for (x, y, dx, dy) in [(372, 540, -30, 8), (378, 566, -30, 14), (824, 560, 28, 4), (816, 584, 26, 12)]:
        d.raw('<path d="M %s,%s l %s,%s" stroke="%s" stroke-width="5" stroke-linecap="round"/>' % (
            fmt(x), fmt(y), fmt(dx), fmt(dy), INK))
    return d


if __name__ == "__main__":
    import sys
    work = os.path.dirname(os.path.abspath(__file__))
    outdir = sys.argv[1] if len(sys.argv) > 1 else work
    png, bb, s = fit_and_render(build, "ashkit", work, outdir)
    print(png, bb, "scale", round(s, 3))
