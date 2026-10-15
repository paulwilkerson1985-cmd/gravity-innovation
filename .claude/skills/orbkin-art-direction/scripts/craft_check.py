#!/usr/bin/env python3
"""craft_check.py - automated pixel-craft regression check on the kin/people boxes of two captures.

Why: the volcanic pilot shipped a SpriteLight change whose 2x crops showed a 2-3 px highlight band, lost
1-texel ember cracks and a softened outline; the judge named all three, twice. Nobody had measured them.
This script measures them on the TEXEL GRID of the captured frame (texel = frame px / internal px, from
capture.json perf.internal: desk 2 px, phone 4 px) inside every layout box, BEFORE vs AFTER, and fails
when a protected craft feature regressed. It is a floor for sprite work (S4): no judge call while it fails.

Run isolated:
  python3 -I craft_check.py --before BASE_DIR --after CAND_DIR --id volcanic-desk [--change sprite|grade|light]
          [--subjects mine,foe,player] [--grow 2] [--out craft.json] [--json]
      DIRs are capture dirs (capture.json + raw/<id>.clean.png; falls back to raw/<id>.png).
  python3 -I craft_check.py --before BASE.png --after CAND.png --box x0,y0,x1,y1 --texel 2 [--name foe]
      the same on one hand-given box (frame px) when there is no capture.json.

Sprite mask: a flood fill from the crop border through non-outline texels (L* >= 14) stops at the dark
silhouette outline; a 3-texel morphological closing + hole fill bridges the key-side rim gaps (the rim is a
LIGHT tone on the silhouette, so the dark loop is open there) and fills the body. The mask comes from the
BEFORE frame and is applied to both (frozen layout), so every number describes the sprite, not the floor
around it (the first version counted the lit floor's warm texels as "accents" and failed every grade
change). The contact shadow under the feet stays inside the mask; the comparison is relative, so it cancels.
What it measures per box:
  mixel_share        texel blocks whose pixels are not uniform (max channel range > 12/255), whole crop. An
                     integer-scaled frame has ~0; device-res blur, a non-integer scale or a sub-texel offset raise it.
  sprite_texels      mask size; outline_texels = mask texels touching the background (the silhouette ring).
  outline_L          median L* of the silhouette ring; outline_contrast_bg = median L* of the background band
                     (2 texels outside) minus outline_L; outline_contrast_body = median L* of the body minus
                     outline_L. The outline reads when both stay large; a lifted or hue-shifted outline shrinks
                     them (a grade that lifts blacks shrinks them too, by less: judge the ratio, not the value).
  outline_2nd_ring   texels one step inside the ring that are as dark as the ring (L* < outline_L + 6), as a
                     share of the ring: a 1-texel outline keeps this low; a thickened / blurred outline raises it.
  highlight          sprite texels brighter than the sprite's median + 0.6 * (p98 - median); band_mode = the most
                     common min(h-run, v-run) in texels; thick_share = share with min-run >= 2 (1-texel band -> low).
  accent_bins        ACCENT texels per 30-degree hue bin: saturated (C* > 30) AND brighter than the body's median
                     L* + 12 (ember cracks, eye shine, type accents on the body). A bin with >= 6 texels before
                     that keeps < 50 % after = accent loss; accent_contrast = mean accent L* minus body median.
                     A bin with >= 20 texels after and < 3 before is a NEW hue on the sprite (WARN: intended rim,
                     or a shade multiplier colouring the shadows, as J's violet Maelstrode).
  edge_1texel_share  among strong 2-texel luminance steps (|dL| > 25) inside the mask + 1 texel, the share
                     realised within ONE texel step (>= 0.8 of the 2-texel step): crisp outline/rim -> high;
                     anti-aliased or gradient edges -> low.
  colours_4bit       distinct 4-bit RGB colours on the sprite (information only).

Verdict per box (FAIL when any): mixel_share_after > 0.03 | outline_contrast_bg fell below 0.70x before (WARN
  below 0.85x) | outline_2nd_ring rose by > 0.15 | highlight band_mode rose or thick_share rose by > 0.15 |
  any accent bin lost >= 50 % or accent_contrast fell below 0.7x (J's Vulcrag: 56.7 -> 35.0 L*, the "ember
  cracks lost" the judge named) | edge_1texel_share fell below 0.90x before. Thresholds were set on the volcanic pilot (base
  vs J / H fail on the named regressions; base vs base passes); they are NOT calibrated on an accepted sprite
  change yet, so a FAIL means "open the 2x crop and look", never "revert blindly".
Exit 0 pass, 1 fail, 2 bad input. JSON on stdout.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402
import adlib as A  # noqa: E402


def load_shot(d, sid):
    shot, _ = A.load_capture_shot(os.path.join(d, 'capture.json') + ':' + sid)
    raw = os.path.join(d, 'raw', sid + '.clean.png')
    if not os.path.exists(raw):
        raw = os.path.join(d, 'raw', sid + '.png')
    im = Image.open(raw).convert('RGB')
    internal = (shot.get('perf') or {}).get('internal')
    texel = im.width / internal[0] if internal else None
    scale = A.layout_scale(shot, im.width)
    boxes = dict(A.layout_entries(shot, scale))
    return im, texel, boxes, raw


def runs_min(mask):
    """Per True cell: min(horizontal run, vertical run) length containing it."""
    H, W = mask.shape
    hr = np.zeros((H, W), int)
    for y in range(H):
        x = 0
        while x < W:
            if mask[y, x]:
                x2 = x
                while x2 < W and mask[y, x2]:
                    x2 += 1
                hr[y, x:x2] = x2 - x
                x = x2
            else:
                x += 1
    vr = np.zeros((H, W), int)
    for x in range(W):
        y = 0
        while y < H:
            if mask[y, x]:
                y2 = y
                while y2 < H and mask[y2, x]:
                    y2 += 1
                vr[y:y2, x] = y2 - y
                y = y2
            else:
                y += 1
    return np.minimum(hr, vr)


def texel_grid(im, box, texel, grow):
    """Crop the box (grown by `grow` texels, snapped to the texel grid) and reduce it to texel blocks.
    Returns (rgb texels HxWx3, mixel_share)."""
    t = int(round(texel))
    x0, y0, x1, y1 = box
    x0 = max(0, (x0 // t - grow) * t)
    y0 = max(0, (y0 // t - grow) * t)
    x1 = min(im.width, (-(-x1 // t) + grow) * t)
    y1 = min(im.height, (-(-y1 // t) + grow) * t)
    a = np.asarray(im.crop((x0, y0, x1, y1)), np.float64)
    H, W = a.shape[0] // t * t, a.shape[1] // t * t
    a = a[:H, :W]
    blocks = a.reshape(H // t, t, W // t, t, 3)
    rng = blocks.max(axis=(1, 3)) - blocks.min(axis=(1, 3))
    mixel = float((rng.max(-1) > 12).mean()) if t > 1 else 0.0
    return blocks.mean(axis=(1, 3)), mixel, (x0, y0, x1, y1)


OUTLINE_L = 14.0   # L* below which a texel counts as silhouette-outline dark (#1a0d08 is L* 5; J's #2a1810 is 10)


def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]
    out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]
    out[:, :-1] |= m[:, 1:]
    return out


def components(m):
    """4-connected component labels of a boolean grid (small grids; plain BFS)."""
    H, W = m.shape
    lab = np.zeros((H, W), int)
    n = 0
    for y in range(H):
        for x in range(W):
            if m[y, x] and not lab[y, x]:
                n += 1
                stack = [(y, x)]
                lab[y, x] = n
                while stack:
                    cy, cx = stack.pop()
                    for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                        if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            stack.append((ny, nx))
    return lab, n


def erode(m):
    out = m.copy()
    out[1:, :] &= m[:-1, :]
    out[:-1, :] &= m[1:, :]
    out[:, 1:] &= m[:, :-1]
    out[:, :-1] &= m[:, 1:]
    return out


def fill_from_border(passable):
    """4-connected flood from the border through `passable`; returns the reached mask."""
    H, W = passable.shape
    reached = np.zeros((H, W), bool)
    stack = [(y, x) for y in range(H) for x in (0, W - 1) if passable[y, x]] + [(y, x) for x in range(W) for y in (0, H - 1) if passable[y, x]]
    for y, x in stack:
        reached[y, x] = True
    while stack:
        cy, cx = stack.pop()
        for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
            if 0 <= ny < H and 0 <= nx < W and passable[ny, nx] and not reached[ny, nx]:
                reached[ny, nx] = True
                stack.append((ny, nx))
    return reached


def largest_component(m):
    lab, n = components(m)
    if n <= 1:
        return m
    sizes = np.bincount(lab.ravel())[1:]
    return lab == int(sizes.argmax()) + 1


def sprite_mask(L, close=3):
    """The sprite's texels. The dark silhouette outline (L* < OUTLINE_L) is NOT a closed loop: the key-side
    1-texel rim replaces it with a light tone, so a plain flood fill only finds the outline band. Steps:
    (1) unreached-from-border through non-outline texels = the outline band plus attached dark texels;
    (2) morphological closing by `close` texels + hole fill bridges the rim gaps and fills the body;
    (3) keep the largest 4-connected component. The contact shadow touching the feet stays inside the mask
    (a few floor texels); every number is relative before/after on the same mask, so that cancels.
    Returns (mask, note)."""
    H, W = L.shape
    band = ~fill_from_border(L >= OUTLINE_L)
    if not band.any():
        return np.zeros((H, W), bool), 'no outline-dark texels: the outline is not dark at this threshold'
    m = band.copy()
    for _ in range(close):
        m = dilate(m)
    m = ~fill_from_border(~m)
    for _ in range(close):
        m = erode(m)
    m = ~fill_from_border(~(m | band))
    m = largest_component(m)
    note = None
    if m.sum() < 0.05 * H * W:
        note = f'sprite mask is only {int(m.sum())} texels ({m.mean():.1%} of the crop): the outline may be broken; numbers are weak'
    return m, note


def measure_box(tex, mask):
    lab = A.to_lab(tex)
    L, a_, b_ = lab[..., 0], lab[..., 1], lab[..., 2]
    C = np.hypot(a_, b_)
    out = {'sprite_texels': int(mask.sum())}
    if mask.sum() < 16:
        return out
    bg = ~mask
    ring = mask & dilate(bg)                 # silhouette ring: sprite texels touching the background
    inner = mask & ~ring & dilate(ring)      # one step inside the ring
    body = mask & ~ring
    band = dilate(dilate(mask)) & bg         # background band 2 texels outside
    out['outline_texels'] = int(ring.sum())
    oL = float(np.median(L[ring])) if ring.sum() else None
    out['outline_L'] = A.r(oL, 1)
    out['body_L'] = A.r(float(np.median(L[body])), 1) if body.sum() else None
    out['bg_L'] = A.r(float(np.median(L[band])), 1) if band.sum() else None
    if oL is not None:
        out['outline_contrast_bg'] = A.r(out['bg_L'] - oL, 1) if out['bg_L'] is not None else None
        out['outline_contrast_body'] = A.r(out['body_L'] - oL, 1) if out['body_L'] is not None else None
        out['outline_2nd_ring'] = A.r(float((L[inner] < oL + 6).sum() / max(1, ring.sum())))
    Ls = L[body] if body.sum() >= 16 else L[mask]
    med, p98 = np.percentile(Ls, [50, 98])
    hi = mask & (L > med + 0.6 * (p98 - med))
    out['highlight_texels'] = int(hi.sum())
    if hi.sum():
        mr = runs_min(hi)
        vals, cnt = np.unique(mr[hi], return_counts=True)
        out['highlight_band_mode'] = int(vals[cnt.argmax()])
        out['highlight_thick_share'] = A.r(float((mr[hi] >= 2).mean()))
    hue = (np.degrees(np.arctan2(b_, a_)) + 360) % 360
    # accent chroma threshold adapts to the sprite's own chroma (a grade that desaturates the frame lowers
    # every accent together; what must survive is the accent's share and its lightness pop)
    cthr = max(18.0, 0.5 * float(np.percentile(C[mask], 95)))
    out['accent_chroma_min'] = A.r(cthr, 1)
    sat = mask & (C > cthr) & (L > med + 12)
    bins = np.histogram(hue[sat], bins=12, range=(0, 360))[0]
    out['accent_bins'] = [int(v) for v in bins]
    out['accent_texels'] = int(sat.sum())
    out['accent_contrast'] = A.r(float(L[sat].mean() - med), 1) if sat.sum() else None
    out['saturated_bins_all'] = [int(v) for v in np.histogram(hue[mask & (C > 30)], bins=12, range=(0, 360))[0]]
    # strong 2-texel steps realised in one texel, inside the mask grown by one texel
    zone = dilate(mask)
    num = den = 0
    for ax in (0, 1):
        d2 = np.abs(np.diff(L, n=1, axis=ax))
        if ax == 0:
            two = np.abs(L[2:, :] - L[:-2, :])
            one = np.maximum(d2[1:, :], d2[:-1, :])
            z = zone[1:-1, :]
        else:
            two = np.abs(L[:, 2:] - L[:, :-2])
            one = np.maximum(d2[:, 1:], d2[:, :-1])
            z = zone[:, 1:-1]
        strong = (two > 25) & z
        den += int(strong.sum())
        num += int((one[strong] >= 0.8 * two[strong]).sum())
    out['edge_1texel_share'] = A.r(num / den) if den else None
    out['strong_edges'] = den
    q = (tex.astype(int) >> 4)
    out['colours_4bit'] = int(len(np.unique((q[..., 0] * 256 + q[..., 1] * 16 + q[..., 2])[mask])))
    return out


def compare(b, a, warns, change='sprite'):
    fails = []
    if a['mixel_share'] > 0.03:
        fails.append(f"mixel_share {a['mixel_share']} > 0.03 (non-uniform texel blocks: blur, non-integer scale or sub-texel offset)")
    if b.get('sprite_texels', 0) < 16:
        return ['no sprite mask (outline not a closed loop in the before frame): measure by hand on the 2x crop']
    cb, ca = b.get('outline_contrast_bg'), a.get('outline_contrast_bg')
    if cb and cb > 0 and ca is not None:
        if ca < 0.70 * cb:
            fails.append(f"outline_contrast_bg {cb} -> {ca} L* (the silhouette outline no longer separates from the ground)")
        elif ca < 0.85 * cb:
            warns.append(f"outline_contrast_bg {cb} -> {ca} L* (outline softer against the ground; open the 2x crop)")
    if b.get('outline_2nd_ring') is not None and a.get('outline_2nd_ring') is not None and a['outline_2nd_ring'] - b['outline_2nd_ring'] > 0.15:
        fails.append(f"outline_2nd_ring {b['outline_2nd_ring']} -> {a['outline_2nd_ring']} (outline thicker than 1 texel)")
    if b.get('highlight_band_mode') and a.get('highlight_band_mode') and a['highlight_band_mode'] > b['highlight_band_mode']:
        fails.append(f"highlight band mode {b['highlight_band_mode']} -> {a['highlight_band_mode']} texels")
    if b.get('highlight_thick_share') is not None and a.get('highlight_thick_share') is not None and a['highlight_thick_share'] - b['highlight_thick_share'] > 0.15:
        fails.append(f"highlight_thick_share {b['highlight_thick_share']} -> {a['highlight_thick_share']} (band wider than 1 texel)")
    names = ['red', 'orange', 'yellow', 'yellow-green', 'green', 'green-cyan', 'cyan', 'blue', 'blue-violet', 'violet', 'magenta', 'rose']
    lost = []
    for i, (nb, na) in enumerate(zip(b['accent_bins'], a['accent_bins'])):
        if nb >= 6 and na < 0.5 * nb:
            lost.append(f'{names[i]} {nb} -> {na}')
    if lost:
        (warns if change in ('grade', 'light') else fails).append('accent texels lost: ' + ', '.join(lost) + (' (chroma-based; WARN under a grade/light change: check accent_contrast and the 2x crop)' if change in ('grade', 'light') else ''))
    if b.get('accent_contrast') and a.get('accent_contrast') is not None and b['accent_contrast'] > 8 and a['accent_contrast'] < 0.7 * b['accent_contrast']:
        fails.append(f"accent_contrast {b['accent_contrast']} -> {a['accent_contrast']} L* (accents no longer pop off the body)")
    new = [f'{names[i]} {nb} -> {na}' for i, (nb, na) in enumerate(zip(b['saturated_bins_all'], a['saturated_bins_all'])) if na >= 20 and nb < 3]
    if new:
        warns.append('new saturated hue on the sprite: ' + ', '.join(new) + ' (intended rim/accent, or a shade multiplier colouring the shadows?)')
    if b.get('edge_1texel_share') and a.get('edge_1texel_share') is not None and a['edge_1texel_share'] < 0.90 * b['edge_1texel_share']:
        fails.append(f"edge_1texel_share {b['edge_1texel_share']} -> {a['edge_1texel_share']} (edges softened / anti-aliased)")
    return fails


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--before', required=True)
    ap.add_argument('--after', required=True)
    ap.add_argument('--id', help='shot id when --before/--after are capture dirs')
    ap.add_argument('--subjects', default='mine,foe,player,trainer,rival')
    ap.add_argument('--box', help='x0,y0,x1,y1 frame px (single-image mode)')
    ap.add_argument('--texel', type=float, help='frame px per texel (single-image mode; desk 2, phone 4)')
    ap.add_argument('--name', default='box')
    ap.add_argument('--grow', type=int, default=2, help='texels of margin around each box')
    ap.add_argument('--change', choices=['sprite', 'grade', 'light', 'any'], default='sprite', help='grade/light: a chroma-based accent-bin loss is a WARN (the grade moves every sprite\'s chroma by design); the L*-based tests (outline contrast, band width, accent contrast, edges, mixels) still fail')
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    warnings = []
    try:
        if a.id:
            imb, tb, boxes_b, rawb = load_shot(a.before, a.id)
            ima, ta, boxes_a, rawa = load_shot(a.after, a.id)
            if tb is None or ta is None:
                print('error: capture.json has no perf.internal (texel size unknown); pass single-image mode with --texel', file=sys.stderr)
                sys.exit(2)
            if abs(tb - ta) > 1e-6:
                warnings.append(f'texel size differs: before {tb} after {ta}')
            names = [n for n in a.subjects.split(',') if n in boxes_a]
            if not names:
                print(f'error: no layout boxes for {a.subjects} (after has {list(boxes_a)})', file=sys.stderr)
                sys.exit(2)
            pairs = []
            for n in names:
                if n in boxes_b and boxes_b[n] != boxes_a[n]:
                    dmax = max(abs(p - q) for p, q in zip(boxes_b[n], boxes_a[n]))
                    if dmax > 2:
                        warnings.append(f'{n}: layout box moved {boxes_b[n]} -> {boxes_a[n]} by {dmax} px (staging changed? rule 9)')
                    else:
                        warnings.append(f'{n}: layout box differs by {dmax} px ({boxes_b[n]} vs {boxes_a[n]}): CSS-vs-device px rounding between harness formats, harmless')
                pairs.append((n, boxes_b.get(n, boxes_a[n]), boxes_a[n]))
            texel = ta
        else:
            if not (a.box and a.texel):
                ap.error('single-image mode needs --box and --texel')
            imb = Image.open(a.before).convert('RGB')
            ima = Image.open(a.after).convert('RGB')
            rawb, rawa = a.before, a.after
            box = A.parse_box(a.box, ima.width, ima.height)
            pairs = [(a.name, box, box)]
            texel = a.texel
    except (OSError, ValueError, json.JSONDecodeError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    if abs(texel - round(texel)) > 0.05:
        warnings.append(f'texel {texel} is not an integer number of frame px: the frame is not integer-scaled; mixel_share is meaningless')
    res = {'before': rawb, 'after': rawa, 'texel_px': round(texel, 2), 'boxes': {}, 'warnings': warnings}
    any_fail = False
    for n, bb, ba in pairs:
        tb_, mb, cb = texel_grid(imb, bb, texel, a.grow)
        ta_, ma, ca = texel_grid(ima, ba, texel, a.grow)
        mask, mnote = sprite_mask(A.to_lab(tb_)[..., 0])
        if ta_.shape != tb_.shape:
            # the layout box moved: cut the after frame with the BEFORE box as well (a grade/light change must
            # not move boxes, rule 9) and say so
            ta_, ma, ca = texel_grid(ima, bb, texel, a.grow)
            warnings.append(f'{n}: after crop re-cut with the before box {bb}')
        B = measure_box(tb_, mask)
        B['mixel_share'] = A.r(mb, 4)
        Af = measure_box(ta_, mask)
        Af['mixel_share'] = A.r(ma, 4)
        warns = []
        fails = compare(B, Af, warns, a.change)
        any_fail |= bool(fails)
        res['boxes'][n] = {'crop_px_before': list(cb), 'crop_px_after': list(ca), 'texels': [int(ta_.shape[1]), int(ta_.shape[0])], 'mask_note': mnote,
                           'before': B, 'after': Af, 'verdict': 'FAIL' if fails else 'PASS', 'fails': fails, 'warns': warns}
    res['verdict'] = 'FAIL' if any_fail else 'PASS'
    res['note'] = 'floor for sprite / SpriteLight work: no judge call while it fails; thresholds set on the volcanic pilot (base vs J) and not yet calibrated on an accepted sprite change, so a FAIL means open the 2x crop and look'
    if a.out:
        with open(a.out, 'w') as f:
            json.dump(res, f, indent=1)
    if a.json:
        print(json.dumps(res, indent=1))
    else:
        print(json.dumps({'verdict': res['verdict'], 'texel_px': res['texel_px'], 'boxes': {n: (v['verdict'], v['fails'], v['warns']) for n, v in res['boxes'].items()}, 'warnings': warnings}))
    sys.exit(1 if any_fail else 0)


if __name__ == '__main__':
    main()
