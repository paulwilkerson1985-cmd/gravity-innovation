#!/usr/bin/env python3
"""verdict_risk.py - predict what the pairwise judge will PUNISH before paying for a gate round.

Compares two critique.py JSONs (the accepted baseline and the candidate, same view) against the
metric signatures of the verdict words the judge used on real Orbkin frames. One-sided by design: a
triggered signature predicts `worse`; no signature predicts nothing (the judge still decides).

Evidence (look-bible §judge-punishes): volcanic pilot 2026-10-15, variants H and J, 0/4 desk and 0/4
phone each. H: "washed out, bleached, pasted on"; J: "washed out, light source pasted on, cooler
flatter sprites". The signatures below separate base from H and J on both views; they have NOT been
tested against a change the judge accepted, so treat a clean pass as "no known punishment", never as
"will win".

Run isolated:
  python3 -I verdict_risk.py BEFORE.json AFTER.json [--json]
      BEFORE/AFTER come from critique.py with the same --layout/--subjects (and --emitter when the
      arena has a light source on the floor: lava, window pool, fire, lamp).
Exit codes: 0 no signature triggered, 1 at least one triggered (explain or fix before S5), 2 bad input.
"""
import argparse
import json
import sys


def g(d, k, default=None):
    v = d.get(k, default)
    return default if v is None else v


def ratio(a, b):
    try:
        return a / b if b not in (0, None) and a is not None else None
    except TypeError:
        return None


def signatures(b, a):
    rows = []

    def row(name, words, triggered, numbers, fix, confidence):
        rows.append({'signature': name, 'judge_words': words, 'triggered': bool(triggered), 'numbers': numbers, 'fix': fix, 'confidence': confidence})

    # 1. washed out: the frame lost its chroma globally (grade saturation / gain cut / desaturated lights)
    cm = ratio(g(a, 'chroma_mean'), g(b, 'chroma_mean'))
    cs = g(a, 'chromatic_share')
    cf = ratio(g(a, 'colorfulness_hasler'), g(b, 'colorfulness_hasler'))
    row('washed_out', '"washed out", "desaturated", "flattening materials", "muddier palette"',
        (cm is not None and cm < 0.65) or (cs is not None and cs < 0.40) or (cf is not None and cf < 0.70),
        {'chroma_mean_ratio': cm, 'chromatic_share': cs, 'colorfulness_ratio': cf, 'limits': 'ratio >= 0.65, share >= 0.40, colourfulness ratio >= 0.70'},
        'reach the ranges from the shadow side (shadowTint, splitAmount, lift, hemisphere sky) and the far plane; keep saturation >= 0.85 and the key within 25 % unless that cut has its own A/B',
        'medium (base 0.57-0.67 vs H/J 0.30-0.36 on both views)')

    # 2. bleached: the subject is now lighter than its ring, or jumped toward it by lifting the body
    dLb, dLa = g(b, 'focal_dL_vs_ring'), g(a, 'focal_dL_vs_ring')
    subjL = (g(a, 'focal_mean_L_in_ring') or [None, None])[0]
    row('bleached_subject', '"bleached", "pale", "ghostly", "overexposed sprites"',
        (dLa is not None and dLa > 0 and (subjL or 0) > 55) or (dLa is not None and dLb is not None and dLa - dLb > 12),
        {'focal_dL_vs_ring_before': dLb, 'after': dLa, 'subject_mean_L': subjL, 'limits': 'dL stays <= 0 unless the subject L* <= 55; never +12 by lifting the body'},
        'separate by edge contrast (focal_edge_ratio 1.8-9.5), a key-side 1-texel rim, uLightRim on dark kin and a calm floor patch; keep spriteGain <= 1.15 and shade/highlight within 0.9-1.1',
        'medium-high (H +2.6 dL* at L* 65 -> 0/4 both views; base -16 / -21 was still the accepted frame)')

    # 3. pasted on (a): the sprite lost its internal contrast
    lsb, lsa = g(b, 'focal_Lstd_ratio'), g(a, 'focal_Lstd_ratio')
    cgb, cga = g(b, 'focal_contrast_gmean'), g(a, 'focal_contrast_gmean')
    lr, cr = ratio(lsa, lsb), ratio(cga, cgb)
    row('sprite_flattened', '"flat", "overlay", "pasted on", "no material definition"',
        (lr is not None and lr < 0.80) or (cr is not None and cr < 0.85),
        {'focal_Lstd_ratio_change': lr, 'focal_contrast_gmean_change': cr, 'limits': 'Lstd ratio >= 0.80x, contrast gmean >= 0.85x baseline'},
        'undo shade/highlight multipliers and spriteGain; check the 2x crop for 1-texel bands (a 2-3 px highlight band reads as an overlay)',
        'medium (H desk 0.75x -> flagged; J desk 0.95x -> not flagged, J lost on the environment)')

    # 4. pasted on (b): the sprite no longer carries the floor's light (its warmth fell with or without the ring)
    sb = (g(b, 'focal_mean_bstar_in_ring') or [None, None])[0]
    sa = (g(a, 'focal_mean_bstar_in_ring') or [None, None])[0]
    ringb = (g(b, 'focal_mean_bstar_in_ring') or [None, None])[1]
    wr = ratio(sa, sb) if (sb is not None and sb > 8) else None
    row('sprite_decoupled_from_light', '"lit by a different light", "pasted onto the background", "no lava-side rim"',
        wr is not None and wr < 0.70 and (ringb or 0) > 12,
        {'subject_bstar_before': sb, 'after': sa, 'ring_bstar_before': ringb, 'limits': 'subject b* >= 0.70x baseline when the ring is warm (b* > 12)'},
        'keep the sprite keyColor/rim in the emitter hue and the rim visible on the key side at 2x; tint shadows cool instead of cooling the key',
        'medium (H 0.54x, J 0.63x on desk; both "pasted on")')

    # 5. light source pasted on: the emitter-local warm falloff on the floor is gone
    fb, fa = g(b, 'falloff') or {}, g(a, 'falloff') or {}
    nb, na = ratio(fa.get('near_bstar'), fb.get('near_bstar')), ratio(fa.get('gradient_L'), fb.get('gradient_L'))
    row('light_source_pasted_on', '"warm bounce light is gone", "the emissive no longer lights its surroundings", "flat gray-beige floor"',
        (nb is not None and nb < 0.75) or (na is not None and na < 0.80),
        {'near_bstar_ratio': nb, 'gradient_L_ratio': na, 'before': {k: fb.get(k) for k in ('near_bstar', 'far_bstar', 'gradient_L')}, 'after': {k: fa.get(k) for k in ('near_bstar', 'far_bstar', 'gradient_L')},
         'limits': 'near b* >= 0.75x and L gradient >= 0.80x baseline (needs --emitter on both critiques)'},
        'cool the far plane and the shadows, not the lit pool: keep the key colour and intensity, move splitAmount/shadowTint/lift/hemisphere instead',
        'medium (J desk near b* 33.8 -> 19.9 = 0.59x; judged "light source looks pasted on")' if fb else 'not measured: run critique.py with --emitter on both frames')

    # 6. mush: the frame got softer
    hr = ratio(g(a, 'hf_ratio'), g(b, 'hf_ratio'))
    row('mush', '"blurry", "smeared", "soft", "mush"', hr is not None and hr < 0.85, {'hf_ratio_change': hr, 'limits': '>= 0.85x'},
        'never blur the subject or the hotspots; check tilt bands and any resampling', 'high (the canary degradations trigger it every time)')

    # 7. value structure: dark share left the range or the frame went light-dominant
    ds = g(a, 'dark_share')
    row('value_out_of_range', '"too dark to read" / "flat, light-dominant"', ds is not None and (ds < 0.35 or ds > 0.70),
        {'dark_share': ds, 'limits': '0.35-0.70 (bible 0.40-0.60)'}, 'phone needs its own lever (bottomShade, apron lift); do not fix the desk and assume the phone', 'low (range evidence only)')

    # 8. UI outranks the scene more than before
    ub, ua = g(b, 'ui_minus_scene_luma'), g(a, 'ui_minus_scene_luma')
    row('ui_outranks_scene', '"the HUD is the brightest thing"', ub is not None and ua is not None and ua - ub > 10 and ua > 40,
        {'before': ub, 'after': ua, 'limits': 'no increase > 10 when already > 40'}, 'a grade that darkens the scene without the UI makes the HUD the brightest mass; retune UI tone with it', 'low')
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('before')
    ap.add_argument('after')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    try:
        with open(a.before) as f:
            b = json.load(f)
        with open(a.after) as f:
            c = json.load(f)
    except (OSError, json.JSONDecodeError) as ex:
        print(f'error: {ex}', file=sys.stderr)
        sys.exit(2)
    if isinstance(b, list):
        b = b[0]
    if isinstance(c, list):
        c = c[0]
    if b.get('focal_subjects') != c.get('focal_subjects'):
        print(f'WARNING: focal subjects differ: {b.get("focal_subjects")} vs {c.get("focal_subjects")}; focal rows are not comparable', file=sys.stderr)
    rows = signatures(b, c)
    trig = [r['signature'] for r in rows if r['triggered']]
    out = {'before': a.before, 'after': a.after, 'predicted': ('worse' if trig else 'no known punishment (not a prediction of better)'),
           'triggered': trig, 'rows': rows,
           'note': 'one-sided: these signatures only predict punishments; the pairwise judge and the owner decide'}
    if a.json:
        print(json.dumps(out, indent=1))
    else:
        print(json.dumps({'predicted': out['predicted'], 'triggered': trig}))
        for r in rows:
            print(json.dumps({k: r[k] for k in ('signature', 'triggered', 'numbers')}))
    sys.exit(1 if trig else 0)


if __name__ == '__main__':
    main()
