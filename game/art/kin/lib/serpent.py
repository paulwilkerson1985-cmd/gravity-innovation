"""serpent - shared clips for a coiled serpent (12 fps): idle sway, attack (rear back and strike), hit, faint (the
neck topples onto the floor).

For kin that rest on a coil and rise into a neck (Maelstrode). Bones (see serpentrig.py): root, cog (ground pivot),
coil (the body on the floor), tail (rises from the coil), n1..n4 (the neck, base to top) and head. World-axis
rotations (sheetkit.wq): on the upright neck a positive pitch_up leans back, negative leans forward; rotations add up
down the chain, so the head counter-pitches to stay level (keep). Translations scale with k.

    from serpent import build
    CLIPS, TRAVEL, REST = build(scale=1.0)
"""
import math
from sheetkit import blend, keyed

k = 1.0
NECK = ('n1', 'n2', 'n3', 'n4')
DOWN = -76.0       # the faint's fall at the neck base (per kin: build(down=...))
REST = {}

# The strike reaches with the neck, so the sprite travels less than a pouncing kin (fractions of the game's reach).
ATTACK_TRAVEL = [0.0, -0.06, -0.12, -0.12, 0.25, 0.70, 0.85, 0.85, 0.50, 0.12, -0.08, -0.04, -0.01, 0.0]
ATTACK_EASE = ['hold', 'hold', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'hold', 'hold']


def K(*v):
    return tuple(k * c for c in v)


def neck(p=(0, 0, 0, 0), y=(0, 0, 0, 0), keep=0.8, nod=0.0, turn=0.0, tail=0.0, roll=0.0):
    """Neck pose: per-bone pitch (positive leans back) and yaw; the head keeps `keep` of its level against the neck's
    total pitch, plus a nod (positive raises the nose) and a turn; the tail swings by `tail` (yaw)."""
    d = {nm: dict(r=(0, p[i], y[i])) for i, nm in enumerate(NECK)}
    d['head'] = dict(r=(roll, -sum(p) * keep + nod, -sum(y) * 0.5 + turn))
    d['tail'] = dict(r=(0, 0, tail))
    return d


def clip_idle():
    """12-frame loop: a slow S-wave travels up the neck (pitch and yaw out of phase), the head stays nearly level and
    looks about, the coil breathes, the fluke sways."""
    out = []
    for f in range(12):
        ph = 2 * math.pi * f / 12
        p = tuple(3.0 * math.sin(ph - 0.7 * i) for i in range(4))
        y = tuple(4.0 * math.sin(ph - 0.7 * i + 0.8) for i in range(4))
        br = 0.5 - 0.5 * math.cos(ph)
        out.append({'cog': dict(s=(1 + 0.008 * br, 1 + 0.008 * br, 1 - 0.012 * br)),
                    **neck(p, y, keep=0.85, nod=2 * math.sin(ph - 2.5), tail=12 * math.sin(ph - 1.0))})
    return out


def clip_attack():
    """Strike, 14 drawings: 0 rest | 1 rear back, head cocked down | 2-3 coiled high (held) | 4 lash forward | 5 the
    neck extends | 6-7 the bite, neck reaching forward and down (held; contact on 6, as quad.py) | 8-9 recoil |
    10 drawn back | 11 overshoot | 12 settle | 13 rest."""
    rear = {'cog': dict(s=(1.02, 1.02, 0.97)), **neck((10, 14, 10, 4), keep=0.7, nod=-10, tail=-14)}
    coil = {'cog': dict(s=(1.03, 1.03, 0.95)), **neck((16, 20, 14, 6), keep=0.7, nod=-14, tail=-22)}
    lash = {'cog': dict(l=K(0.03, 0, 0)), **neck((-12, -8, 0, 0), keep=0.8, nod=4, tail=18)}
    reach = {'cog': dict(l=K(0.06, 0, 0)), **neck((-20, -12, 6, 4), keep=0.8, nod=2, tail=24)}
    bite = {'cog': dict(l=K(0.08, 0, 0)), **neck((-26, -14, 10, 6), keep=0.75, nod=-8, tail=20)}      # the S straightens toward the target
    bite2 = {**bite, **neck((-25, -13, 9, 6), keep=0.75, nod=-6, tail=16)}
    recoil = {'cog': dict(l=K(0.03, 0, 0)), **neck((6, 10, 8, 2), keep=0.8, nod=4, tail=-8)}
    back = {**neck((10, 12, 8, 4), keep=0.85, nod=2, tail=-10)}
    over = {**neck((-4, -4, -2, 0), keep=0.85, tail=4)}
    settle = {**neck((1, 1, 0, 0), keep=0.85, tail=-1)}
    keys = {0: REST, 1: rear, 2: blend(rear, coil, 0.7), 3: coil, 4: lash, 5: reach, 6: bite, 7: bite2, 8: recoil,
            9: blend(recoil, back, 0.5), 10: back, 11: over, 12: settle, 13: REST}
    return keyed(keys, 14)


def clip_hit():
    """6 frames: 1 = the one strong recoil (the neck thrown back and aside, the head knocked up, eyes squeezed) | 2 hold
    | 3-4 rebound | 5 rest."""
    recoil = {**neck((14, 18, 12, 6), (4, 6, 6, 4), keep=0.6, nod=10, turn=10, roll=8, tail=-16), 'blink': 0.7}
    hold = blend(REST, recoil, 0.8); hold['blink'] = 0.55
    reb = {**neck((-4, -5, -3, -1), (-1, -2, -2, -1), keep=0.8, tail=6)}
    keys = {0: REST, 1: recoil, 2: hold, 3: reb, 4: blend(REST, reb, 0.3), 5: REST}
    return keyed(keys, 6)


def clip_faint():
    """10 frames: 1 flinch | 2-3 the neck sways side to side | 4-6 it sags | 7-9 it topples forward onto the floor, the
    head flat on the ground, eyes shut, the fluke limp."""
    flinch = {**neck((8, 10, 6, 2), keep=0.7, nod=6, tail=-8), 'blink': 0.5}
    sway1 = {**neck((0, 2, 2, 0), (6, 8, 8, 4), keep=0.8, tail=10), 'blink': 0.35}
    sway2 = {**neck((-2, 0, 0, 0), (-6, -8, -8, -4), keep=0.8, tail=-10), 'blink': 0.45}
    sag = {'cog': dict(s=(1.02, 1.02, 0.97)), **neck((-22, -6, 4, 4), (2, 2, 2, 0), keep=0.8, nod=-10, tail=-14), 'blink': 0.8}
    # the base falls forward and the upper neck un-curls, so the neck lies along the floor and the head rests level on it
    down = {'cog': dict(s=(1.03, 1.03, 0.94)), **neck((DOWN, -8, -16, 8), (4, 4, 4, 2), keep=1.0, nod=-6, tail=-24), 'blink': 1.0}
    settle = {**down, **neck((DOWN - 1, -9, -17, 8), (4, 4, 4, 2), keep=1.0, nod=-7, tail=-26), 'blink': 1.0}
    keys = {0: REST, 1: flinch, 2: sway1, 3: sway2, 5: sag, 7: down, 8: settle, 9: settle}
    return keyed(keys, 10, kinds={5: 'in'})


def build(scale=1.0, down=-76.0):
    """Returns (clips, travel, rest), translations scaled by `scale`; `down` is the faint's fall at the neck base (deg)."""
    global k, DOWN
    k, DOWN = float(scale), float(down)
    clips = {'idle': clip_idle(), 'attack': clip_attack(), 'hit': clip_hit(), 'faint': clip_faint()}
    return clips, {'attack': dict(fwd=ATTACK_TRAVEL, ease=ATTACK_EASE)}, REST
