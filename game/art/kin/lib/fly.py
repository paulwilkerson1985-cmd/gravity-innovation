"""fly - shared clips for flying kin (12 fps): idle hover, attack (swoop), hit, faint (flutter down to the floor).

For kin that hover (Flickwing, Stormoth, Cyclonyx, Petalwisp): the model is built hovering (its lowest point `hover`
above the floor; docs/CREATURES.md: fliers hover modestly). Same bones as hop.py (rigged by hoprig.py with
clips='fly'): cog (translations only here: scaling it would pivot on the floor), stretch (along the leap), body (the
breath: scaled about the body centre), and appendages: fin.L/fin.R are the wings (positive = up, as hop.py),
ear.L/ear.R antennae, tip1/tip2 a tail or streamers, leaf1/leaf2 arms. Wing speed is per kin: `beats` wingbeats per
12-frame idle (6 = up/down on alternate drawings, a buzz), `flap` = (up, down) degrees. Translations scale with k.

    from fly import build
    CLIPS, TRAVEL, REST = build(scale=1.0, hover=0.25, beats=2, flap=(50, -30))
"""
import math
from sheetkit import blend, keyed

k = 1.0
HOVER = 0.25
BEATS = 2
FLAP = (50.0, -30.0)

REST = {}

# Attack travel (as quad.py / hop.py): rise back, swoop to the target, pull up and drift back behind the start.
ATTACK_TRAVEL = [0.0, -0.08, -0.16, -0.18, 0.30, 0.80, 1.0, 1.0, 0.60, 0.15, -0.12, -0.06, -0.02, 0.0]
ATTACK_EASE = ['hold', 'hold', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'hold', 'hold']


def K(*v):
    return tuple(k * c for c in v)


def wing(a):
    """Wing angle for a in [-1 (down stroke), 1 (up)]."""
    up, down = FLAP
    return down + (up - down) * (a + 1) / 2


def app(w=0.0, tip=0.0, ear=0.0, sway=0.0, arm=0.0):
    """Appendage pose: wings at angle w (deg, positive up), tail/streamer pitch, antennae pitch, sway (yaw), arms."""
    return {'fin.L': dict(r=(-w, 0, 0)), 'fin.R': dict(r=(w, 0, 0)),
            'tip1': dict(r=(0, tip, sway)), 'tip2': dict(r=(0, tip * 1.4, sway * 1.5)),
            'ear.L': dict(r=(0, ear, 0)), 'ear.R': dict(r=(0, ear, 0)),
            'leaf1': dict(r=(-arm, 0, sway)), 'leaf2': dict(r=(arm, 0, -sway))}


def clip_idle():
    """12-frame loop: a hover bob (the body lifts on each down stroke), the breath, the tail and antennae sway with
    follow-through."""
    out = []
    for f in range(12):
        ph = 2 * math.pi * f / 12
        a = math.cos(BEATS * ph)                      # +1 up, -1 down
        bob = 0.03 * math.sin(ph)
        br = 0.5 - 0.5 * math.cos(ph)
        sw = math.sin(ph - 2 * math.pi / 12)
        out.append({'cog': dict(l=K(0, 0, bob)), 'body': dict(r=(0, 2 * math.sin(ph + 1.0), 0), s=(1 + 0.02 * br, 1 + 0.02 * br, 1 - 0.025 * br)),
                    **app(w=wing(a), tip=6 * sw, ear=-5 * a, sway=6 * sw, arm=10 * sw)})
    return out


def clip_attack():
    """Swoop, 14 drawings: 0 rest | 1 rise and lean back, wings up | 2-3 coiled high (held) | 4 wings slam down, launch
    | 5 diving | 6-7 strike at the target, low and pitched down, wings flared (held; contact on 6, as quad.py) |
    8 pull up on a down stroke | 9 climb | 10 drift back behind the start | 11 a beat | 12 settle | 13 rest."""
    up, down = FLAP
    rise = {'cog': dict(l=K(-0.04, 0, 0.10)), 'body': dict(r=(0, 10, 0)), **app(w=up, tip=-10, ear=-14, arm=-20)}
    coil = {'cog': dict(l=K(-0.08, 0, 0.18)), 'body': dict(r=(0, 18, 0)), **app(w=up * 1.15, tip=-16, ear=-22, arm=-34)}
    launch = {'cog': dict(l=K(0.02, 0, 0.12)), 'stretch': dict(s=1.18), 'body': dict(r=(0, -14, 0)), **app(w=down * 1.2, tip=14, ear=-30, arm=30)}
    dive = {'cog': dict(l=K(0.12, 0, 0.0)), 'stretch': dict(s=1.12), 'body': dict(r=(0, -22, 0)), **app(w=up * 0.6, tip=18, ear=-30, arm=40)}
    strike = {'cog': dict(l=K(0.18, 0, -HOVER * 0.7)), 'body': dict(r=(0, -26, 0), s=(1.06, 1.06, 0.92)), **app(w=up * 0.9, tip=10, ear=8, arm=50)}
    strike2 = {**strike, 'body': dict(r=(0, -24, 0), s=(1.04, 1.04, 0.95))}
    pull = {'cog': dict(l=K(0.10, 0, 0.06)), 'body': dict(r=(0, 8, 0)), **app(w=down * 1.1, tip=-8, ear=-10, arm=-10)}
    climb = {'cog': dict(l=K(0.02, 0, 0.12)), 'body': dict(r=(0, 6, 0)), **app(w=up, tip=-4, ear=-4, arm=-6)}
    drift = {'cog': dict(l=K(-0.04, 0, 0.06)), 'body': dict(r=(0, 4, 0)), **app(w=down, tip=6, ear=4)}
    beat = {'cog': dict(l=K(-0.01, 0, 0.03)), **app(w=up * 0.8, tip=2, ear=-2)}
    over = {'cog': dict(l=K(0, 0, 0.01)), **app(w=wing(0.0), tip=1)}
    keys = {0: REST, 1: rise, 2: blend(rise, coil, 0.7), 3: coil, 4: launch, 5: dive, 6: strike, 7: strike2,
            8: pull, 9: climb, 10: drift, 11: beat, 12: over, 13: REST}
    return keyed(keys, 14)


def clip_hit():
    """6 frames: 1 = the one strong recoil (knocked up and back, tumbling, wings thrown up, eyes squeezed) | 2 hold |
    3-4 rebound on a down stroke | 5 rest."""
    up, down = FLAP
    recoil = {'cog': dict(l=K(-0.08, 0, 0.06)), 'body': dict(r=(-10, 18, 8)), **app(w=up * 1.1, tip=-20, ear=-28, arm=-30), 'blink': 0.7}
    hold = blend(REST, recoil, 0.8); hold['blink'] = 0.55
    reb = {'cog': dict(l=K(0.01, 0, -0.02)), 'body': dict(r=(4, -5, -2)), **app(w=down, tip=8, ear=6, arm=8)}
    keys = {0: REST, 1: recoil, 2: hold, 3: reb, 4: blend(REST, reb, 0.3), 5: REST}
    return keyed(keys, 6)


def clip_faint():
    """10 frames: 1 flinch | 2-3 sputtering weak beats, sinking | 4-6 falling, wings dragging up, tipping over |
    7 lands (hoprig's ground lock puts the lowest point exactly on the floor) | 8-9 lying, wings limp, eyes shut."""
    up, down = FLAP
    flinch = {'cog': dict(l=K(0, 0, 0.04)), 'body': dict(r=(0, 10, 4)), **app(w=up, tip=-10, ear=-20, arm=-20), 'blink': 0.5}
    sput1 = {'cog': dict(l=(0, 0, -HOVER * 0.15)), 'body': dict(r=(8, 0, 0)), **app(w=down * 0.6, tip=-6, ear=-14), 'blink': 0.35}
    sput2 = {'cog': dict(l=(0, 0, -HOVER * 0.30)), 'body': dict(r=(-6, -4, 0)), **app(w=up * 0.5, tip=-8, ear=-16), 'blink': 0.45}
    fall = {'cog': dict(l=(0, 0, -HOVER * 0.75)), 'body': dict(r=(12, -10, 0)), **app(w=up * 0.9, tip=-14, ear=-24, arm=-20), 'blink': 0.8}
    land = {'cog': dict(l=(0, 0, -HOVER - 0.4)), 'body': dict(r=(16, -12, 0), s=(1.10, 1.10, 0.84)), **app(w=down * 0.5, tip=-30, ear=-30, arm=20), 'blink': 1.0}
    lie = {'cog': dict(l=(0, 0, -HOVER - 0.4)), 'body': dict(r=(18, -12, 0), s=(1.08, 1.08, 0.88)), **app(w=down * 0.9, tip=-36, ear=-34, arm=30), 'blink': 1.0}
    keys = {0: REST, 1: flinch, 2: sput1, 3: sput2, 5: fall, 7: land, 8: lie, 9: lie}
    return keyed(keys, 10, kinds={5: 'in'})


def build(scale=1.0, hover=0.25, beats=2, flap=(50.0, -30.0)):
    """Returns (clips, travel, rest), translations scaled by `scale`; `hover` is the rest gap under the kin."""
    global k, HOVER, BEATS, FLAP
    k, HOVER, BEATS, FLAP = float(scale), float(hover), int(beats), tuple(flap)
    clips = {'idle': clip_idle(), 'attack': clip_attack(), 'hit': clip_hit(), 'faint': clip_faint()}
    return clips, {'attack': dict(fwd=ATTACK_TRAVEL, ease=ATTACK_EASE)}, REST
