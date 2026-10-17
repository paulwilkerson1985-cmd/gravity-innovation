"""hop - shared clips for round, hopping kin (12 fps): idle, attack (hop-pounce), hit, faint.

For kin that are one round body with small appendages (Dropple, Mossling, Pebblet, Breezel): the motion is squash,
stretch and hops, not legs. Bones (see hoprig.py): root, cog (ground pivot: scaling it squashes onto the floor),
stretch (along the leap), body (everything; a view's extra yaw turns it), and optional appendages:
tip1/tip2 (a top tuft or droplet curl), fin.L/fin.R (side fins, wings, arms), ear.L/ear.R, leaf1/leaf2,
foot.L/foot.R (stay planted). A bone a kin does not have is ignored. Translations scale with k (kin size vs a
1-unit-tall body); rotations do not.

    from hop import build
    CLIPS, TRAVEL, REST = build(scale=1.0)
"""
import math
from sheetkit import blend, keyed

k = 1.0


def K(*v):
    return tuple(k * c for c in v)


REST = {}

# Attack travel toward the target per drawing (fraction of the game's reach) and how to move between drawings
# (as quad.py): weight back in the squash, a hop to the target, a rebound hop that lands behind the start.
ATTACK_TRAVEL = [0.0, -0.10, -0.20, -0.22, 0.35, 0.85, 1.0, 1.0, 0.55, 0.10, -0.20, -0.10, -0.03, 0.0]
ATTACK_EASE = ['hold', 'hold', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'hold', 'hold']


def app(tip=0.0, fin=0.0, ear=0.0, sway=0.0):
    """Appendage pose: tip pitch, fins flap (roll), ears back, everything swaying by `sway` (yaw)."""
    return {'tip1': dict(r=(0, tip, sway)), 'tip2': dict(r=(0, tip * 1.4, sway * 1.5)),
            'fin.L': dict(r=(-fin, 0, 0)), 'fin.R': dict(r=(fin, 0, 0)),
            'ear.L': dict(r=(0, ear, 0)), 'ear.R': dict(r=(0, ear, 0)),
            'leaf1': dict(r=(0, tip, sway * 1.2)), 'leaf2': dict(r=(0, tip * 1.2, -sway * 1.2))}


def clip_idle():
    """12-frame loop: a breathing bob (squash on the exhale, a small lift on the inhale), appendages sway with
    follow-through, the fins give one little flap on frames 7-9."""
    out = []
    for f in range(12):
        ph = 2 * math.pi * f / 12
        br = 0.5 - 0.5 * math.cos(ph)
        sw = math.sin(ph - 2 * math.pi / 12)
        flap = {7: 1.0, 8: 0.5, 9: 0.15}.get(f, 0.0)
        out.append({'cog': dict(l=K(0, 0, 0.012 * br), s=(1 + 0.03 * (1 - br), 1 - 0.035 * (1 - br), 1 + 0.03 * (1 - br))),
                    **app(tip=4 * sw, fin=18 * flap, ear=-4 * flap, sway=6 * sw)})
    return out


def clip_attack():
    """Hop-pounce, 14 drawings: 0 rest | 1 squash | 2-3 deep coiled squash, leaning back (held) | 4 launch (stretch
    along the leap) | 5 airborne | 6-7 contact squash, held | 8-9 rebound hop up and down | 10 land squash behind the
    start | 11 recoil up | 12 settle | 13 rest. Contact on drawing 6, as quad.py."""
    squash = {'cog': dict(s=(1.14, 0.80, 1.14)), 'body': dict(r=(0, 6, 0)), **app(tip=14, fin=-10, ear=-24)}
    coil = {'cog': dict(l=K(-0.02, 0, 0), s=(1.20, 0.72, 1.20)), 'body': dict(r=(0, 9, 0)), **app(tip=20, fin=-16, ear=-30)}
    launch = {'cog': dict(l=K(0.06, 0, 0.10)), 'stretch': dict(s=1.26), 'body': dict(r=(0, -6, 0)), **app(tip=-12, fin=30, ear=-34)}
    air = {'cog': dict(l=K(0.14, 0, 0.26)), 'stretch': dict(s=1.10), 'body': dict(r=(0, -8, 0)), **app(tip=-16, fin=40, ear=-20)}
    contact = {'cog': dict(l=K(0.16, 0, 0.0), s=(1.16, 0.80, 1.16)), 'body': dict(r=(0, -10, 0)), **app(tip=16, fin=-10, ear=10)}
    contact2 = {**contact, 'cog': dict(l=K(0.16, 0, 0.0), s=(1.12, 0.84, 1.12))}
    hop_up = {'cog': dict(l=K(0.10, 0, 0.20), s=(0.94, 1.10, 0.94)), 'body': dict(r=(0, 8, 0)), **app(tip=-10, fin=26, ear=-10)}
    hop_down = {'cog': dict(l=K(0.04, 0, 0.08), s=(0.97, 1.05, 0.97)), 'body': dict(r=(0, 4, 0)), **app(tip=-4, fin=12, ear=-4)}
    land = {'cog': dict(s=(1.18, 0.78, 1.18)), 'body': dict(r=(0, -3, 0)), **app(tip=16, fin=-12, ear=14)}
    recoil = {'cog': dict(l=K(0, 0, 0.02), s=(0.95, 1.07, 0.95)), **app(tip=-6, fin=8, ear=-6)}
    over = {'cog': dict(s=(1.02, 0.98, 1.02)), **app(tip=3, fin=-2, ear=2)}
    keys = {0: REST, 1: squash, 2: blend(squash, coil, 0.7), 3: coil, 4: launch, 5: air, 6: contact, 7: contact2,
            8: hop_up, 9: hop_down, 10: land, 11: recoil, 12: over, 13: REST}
    return keyed(keys, 14)


def clip_hit():
    """6 frames: 1 = the one strong recoil (squashed, tipped back and away, eyes squeezed) | 2 hold | 3-4 rebound | 5 rest."""
    recoil = {'cog': dict(l=K(-0.06, 0, 0.0), s=(1.12, 0.82, 1.12)), 'body': dict(r=(-6, 14, 6)), **app(tip=-20, fin=24, ear=-30),
              'blink': 0.7}
    hold = blend(REST, recoil, 0.8); hold['blink'] = 0.55
    reb = {'cog': dict(l=K(0.01, 0, 0.01), s=(0.96, 1.05, 0.96)), 'body': dict(r=(0, -4, -2)), **app(tip=8, fin=-6, ear=6)}
    keys = {0: REST, 1: recoil, 2: hold, 3: reb, 4: blend(REST, reb, 0.3), 5: REST}
    return keyed(keys, 6)


def clip_faint():
    """10 frames: 1 flinch | 2-3 wobble side to side | 4-6 sag | 7-9 flat on the floor, eyes shut, appendages limp."""
    flinch = {'cog': dict(s=(0.96, 1.05, 0.96)), 'body': dict(r=(0, 8, 4)), **app(tip=-10, fin=10, ear=-20), 'blink': 0.5}
    sway1 = {'body': dict(r=(10, 0, 0)), **app(tip=-6, fin=-10, ear=-10), 'blink': 0.35}
    sway2 = {'body': dict(r=(-8, -2, 0)), **app(tip=-8, fin=10, ear=-14), 'blink': 0.45}
    sag = {'cog': dict(s=(1.12, 0.80, 1.12)), 'body': dict(r=(6, -6, 0)), **app(tip=-20, fin=-20, ear=-20), 'blink': 0.8}
    down = {'cog': dict(s=(1.26, 0.60, 1.26)), 'body': dict(r=(8, -8, 0)), **app(tip=-36, fin=-30, ear=-28), 'blink': 1.0}
    settle = {**down, 'cog': dict(s=(1.28, 0.58, 1.28))}
    keys = {0: REST, 1: flinch, 2: sway1, 3: sway2, 5: sag, 7: down, 8: settle, 9: settle}
    return keyed(keys, 10, kinds={5: 'in'})


def build(scale=1.0, squash=1.0):
    """Returns (clips, travel, rest), translations scaled by `scale`; `squash` scales the squash and stretch (a stone
    kin: 0.4, so a rock does not flatten like jelly)."""
    global k
    k = float(scale)
    clips = {'idle': clip_idle(), 'attack': clip_attack(), 'hit': clip_hit(), 'faint': clip_faint()}
    if squash != 1.0:
        seen = set()     # frames can share one pose dict: scale each once
        for frames in clips.values():
            for P in frames:
                if id(P) in seen:
                    continue
                seen.add(id(P))
                for b in ('cog', 'stretch'):
                    if b in P and 's' in P[b]:
                        v = P[b]['s']
                        v = 1 + (v - 1) * squash if isinstance(v, (int, float)) else tuple(1 + (c - 1) * squash for c in v)
                        P[b] = {**P[b], 's': v}
    return clips, {'attack': dict(fwd=ATTACK_TRAVEL, ease=ATTACK_EASE)}, REST
