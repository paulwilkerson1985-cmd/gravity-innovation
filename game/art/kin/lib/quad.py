"""quad - shared clips for four-legged kin (12 fps): idle, attack (pounce), hit, faint.

Authored on Ashkit (game/art/ashkit/scripts/anim.py, gates 1-2). Bones: root, cog, stretch, body, hips, chest,
head, ear.L, ear.R, tail1-3 and the four legs named in LEGS (front names start with 'leg_f'). Translations are
in Ashkit units and scale with k (a kin's size relative to Ashkit); rotations do not scale. A bone a kin does
not have is simply ignored by Kit.apply_pose.

    from quad import build
    CLIPS, TRAVEL, REST = build(LEGS, k=1.0)
"""
import math
import numpy as np
from sheetkit import blend, keyed

LEGS = {}
k = 1.0
FD = 0.0    # faint: extra body drop (world units, beyond the scaled Ashkit drop) for a kin with a higher belly
FL = 0.0    # faint: extra leg drop, so long legs fold under the lowered body instead of hanging from the hips


def K(*v):
    """A translation in Ashkit units, scaled to this kin."""
    return tuple(k * c for c in v)


def LD():
    """The faint legs' drop: Ashkit's, scaled, plus FL."""
    return tuple(np.add(K(0, 0, -0.031), (0, 0, -FL)))


def legs(rot=None, loc=(0, 0, 0), front=None, back=None):
    d = {}
    for nm in LEGS:
        r = (front if nm.startswith('leg_f') else back) or rot or (0, 0, 0)
        d[nm] = dict(r=r, l=loc)
    return d


# ------------------------------------------------------------------ clips (12 fps)
def clip_idle():
    """12-frame loop: breath (chest swells, body lifts 1 %), head nods with the breath one frame late,
    tail sways with follow-through down the chain, left ear flicks on frames 7-9. Paws never move."""
    out = []
    for f in range(12):
        ph = 2 * math.pi * f / 12
        br = 0.5 - 0.5 * math.cos(ph)                       # 0 exhale .. 1 inhale (frame 6)
        br1 = 0.5 - 0.5 * math.cos(ph - 2 * math.pi / 12)
        sw = lambda lag: math.sin(ph - lag * 2 * math.pi / 12)
        eflick = {7: 1.0, 8: 0.55, 9: 0.15}.get(f, 0.0)
        out.append({
            'cog': dict(l=K(0, 0, 0.010 * br)),
            'chest': dict(s=(1 + 0.022 * br, 1 + 0.010 * br, 1 + 0.022 * br)),
            'head': dict(r=(0, 2.2 * br1 - 1.0, 0)),
            'ear.L': dict(r=(-14 * eflick, -10 * eflick, 0)),
            'ear.R': dict(r=(0, 1.5 * br1, 0)),
            'tail1': dict(r=(0, 0, 9 * sw(0))),
            'tail2': dict(r=(0, 0, 9 * sw(1))),
            'tail3': dict(r=(0, 0, 10 * sw(2))),
        })
    return out


REST = {}


# Attack travel toward the target per drawing (fraction of the game's reach, at the drawing's start) and how
# the game moves between drawings: 'hold' = the position snaps with the drawing (keyed, no slide), 'lin' =
# moves through the drawing (the leap and the hop back). Written into the sheet JSON (pack.py) and played by
# the sheet player in place of a per-kin table. Weight goes back in the crouch, the hop back lands BEHIND the
# start (overshoot) and settles forward.
ATTACK_TRAVEL = [0.0, -0.14, -0.26, -0.28, 0.35, 0.85, 1.0, 1.0, 0.55, 0.10, -0.24, -0.12, -0.03, 0.0]
ATTACK_EASE = ['hold', 'hold', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'lin', 'lin', 'hold', 'hold', 'hold', 'hold']


def clip_attack():
    """Pounce, 14 drawings (motion pass 2026-10-16: deeper, held wind-up, bolder leap, a real landing):
    0 rest | 1 crouch | 2-3 coiled wind-up, held (weight back, ears pinned, tail up) | 4 launch (stretch 1.18) |
    5 airborne reach | 6-7 contact squash, held | 8-9 rebound hop up and down | 10 land squash behind the start |
    11 recoil up | 12 settle overshoot | 13 rest. Contact stays on drawing 6 (no added latency)."""
    # a deep crouch (body low, head pushed down toward the target) so the anticipation reads from above
    # and behind as well as from the front
    crouch = {'cog': dict(l=K(-0.09, 0, -0.11), s=(1.08, 0.85, 1.08)), 'body': dict(r=(0, 6, 0)),
              'chest': dict(r=(0, -10, 0)), 'head': dict(r=(0, -9, 0)),
              'ear.L': dict(r=(0, -24, 0)), 'ear.R': dict(r=(0, -24, 0)),
              'tail1': dict(r=(0, 14, 0)), 'tail2': dict(r=(0, 10, 0)), 'tail3': dict(r=(0, 6, 0)),
              **legs(front=(0, -6, 0), back=(0, 4, 0))}
    # launch: hind paws still on the ground pushing off (legs stay planted at the top, swing back, lengthen
    # 8 %), front paws already lifting; the stretch runs along the leap and the head leads, eyes on the target.
    launch = {'cog': dict(l=K(0.13, 0, 0.06)), 'stretch': dict(s=1.18), 'body': dict(r=(0, 3, 0)),
              'chest': dict(r=(0, 1, 0)), 'head': dict(r=(0, -5, 0)),
              'ear.L': dict(r=(0, -30, 0)), 'ear.R': dict(r=(0, -30, 0)),
              'tail1': dict(r=(0, -16, 0)), 'tail2': dict(r=(0, -10, 0)), 'tail3': dict(r=(0, -6, 0)),
              'leg_f.L': dict(r=(0, 30, 0), l=K(0.16, 0, 0.09)), 'leg_f.R': dict(r=(0, 26, 0), l=K(0.16, 0, 0.09)),
              'leg_b.L': dict(r=(0, -24, 0), l=K(0.11, 0, 0.03), s=1.08), 'leg_b.R': dict(r=(0, -21, 0), l=K(0.11, 0, 0.03), s=1.08)}
    air = {'cog': dict(l=K(0.30, 0, 0.15)), 'stretch': dict(s=1.10), 'body': dict(r=(0, -2, 0)),
           'chest': dict(r=(0, -2, 0)), 'head': dict(r=(0, -4, 0)),
           'ear.L': dict(r=(0, -12, 0)), 'ear.R': dict(r=(0, -12, 0)),
           'tail1': dict(r=(0, -8, 0)), 'tail2': dict(r=(0, -14, 0)), 'tail3': dict(r=(0, -10, 0)),
           'leg_f.L': dict(r=(0, 40, 0), l=K(0.31, 0, 0.17)), 'leg_f.R': dict(r=(0, 34, 0), l=K(0.31, 0, 0.17)),
           'leg_b.L': dict(r=(0, -30, 0), l=K(0.29, 0, 0.12)), 'leg_b.R': dict(r=(0, -26, 0), l=K(0.29, 0, 0.12))}
    contact = {'cog': dict(l=K(0.36, 0, -0.02), s=(1.07, 0.88, 1.07)), 'body': dict(r=(0, -7, 0)),
               'chest': dict(r=(0, -5, 0)), 'head': dict(r=(0, 6, 0)),
               'ear.L': dict(r=(0, 12, 0)), 'ear.R': dict(r=(0, 12, 0)),
               'tail1': dict(r=(0, 12, 0)), 'tail2': dict(r=(0, 6, 0)), 'tail3': dict(r=(0, -8, 0)),
               'leg_f.L': dict(r=(0, 12, 0), l=K(0.36, 0, 0.0)), 'leg_f.R': dict(r=(0, 10, 0), l=K(0.36, 0, 0.0)),
               'leg_b.L': dict(r=(0, -8, 0), l=K(0.34, 0, 0.0)), 'leg_b.R': dict(r=(0, -8, 0), l=K(0.34, 0, 0.0))}
    contact2 = blend(contact, {**contact, 'cog': dict(l=K(0.36, 0, -0.015), s=(1.05, 0.91, 1.05)),
                               'tail3': dict(r=(0, 6, 0))}, 1.0)
    hop = {'cog': dict(l=K(0.22, 0, 0.07)), 'body': dict(r=(0, 6, 0)), 'head': dict(r=(0, 2, 0)),
           'ear.L': dict(r=(0, -6, 0)), 'ear.R': dict(r=(0, -6, 0)),
           'tail1': dict(r=(0, 6, 0)), 'tail2': dict(r=(0, 10, 0)), 'tail3': dict(r=(0, 8, 0)),
           'leg_f.L': dict(r=(0, 18, 0), l=K(0.24, 0, 0.08)), 'leg_f.R': dict(r=(0, 16, 0), l=K(0.24, 0, 0.08)),
           'leg_b.L': dict(r=(0, -10, 0), l=K(0.20, 0, 0.07)), 'leg_b.R': dict(r=(0, -10, 0), l=K(0.20, 0, 0.07))}
    land = {'cog': dict(l=K(0.02, 0, -0.03), s=(1.04, 0.94, 1.04)), 'body': dict(r=(0, 2, 0)),
            'head': dict(r=(0, -3, 0)), 'ear.L': dict(r=(0, 8, 0)), 'ear.R': dict(r=(0, 8, 0)),
            'tail1': dict(r=(0, -4, 0)), 'tail2': dict(r=(0, -8, 0)), 'tail3': dict(r=(0, -6, 0))}
    over = {'cog': dict(l=K(0, 0, 0.008), s=(0.99, 1.02, 0.99)), 'head': dict(r=(0, 1.5, 0)),
            'ear.L': dict(r=(0, -4, 0)), 'ear.R': dict(r=(0, -4, 0)), 'tail2': dict(r=(0, 4, 0)), 'tail3': dict(r=(0, 4, 0))}
    # the wind-up: one drawing to get most of the way down, then a coiled hold that keeps moving slightly
    coil = {**crouch, 'cog': dict(l=K(-0.10, 0, -0.13), s=(1.10, 0.83, 1.10)), 'head': dict(r=(0, -12, 0)),
            'tail1': dict(r=(0, 18, 0)), 'tail2': dict(r=(0, 14, 0)), 'tail3': dict(r=(0, 10, 0))}
    hop_up = {**hop, 'cog': dict(l=K(0.22, 0, 0.13)), 'body': dict(r=(0, 9, 0)),
              'leg_f.L': dict(r=(0, 26, 0), l=K(0.24, 0, 0.14)), 'leg_f.R': dict(r=(0, 24, 0), l=K(0.24, 0, 0.14)),
              'leg_b.L': dict(r=(0, -16, 0), l=K(0.20, 0, 0.13)), 'leg_b.R': dict(r=(0, -16, 0), l=K(0.20, 0, 0.13))}
    hop_down = {**hop, 'cog': dict(l=K(0.10, 0, 0.06)), 'body': dict(r=(0, 3, 0)), 'head': dict(r=(0, -2, 0)),
                'tail1': dict(r=(0, 10, 0)), 'tail2': dict(r=(0, 14, 0)), 'tail3': dict(r=(0, 12, 0)),
                'leg_f.L': dict(r=(0, 6, 0), l=K(0.10, 0, 0.05)), 'leg_f.R': dict(r=(0, 6, 0), l=K(0.10, 0, 0.05)),
                'leg_b.L': dict(r=(0, -4, 0), l=K(0.10, 0, 0.05)), 'leg_b.R': dict(r=(0, -4, 0), l=K(0.10, 0, 0.05))}
    land_sq = {**land, 'cog': dict(l=K(0.0, 0, -0.06), s=(1.09, 0.86, 1.09)), 'head': dict(r=(0, -6, 0)),
               'ear.L': dict(r=(0, 14, 0)), 'ear.R': dict(r=(0, 14, 0)), 'tail2': dict(r=(0, -14, 0)), 'tail3': dict(r=(0, -12, 0))}
    recoil_up = {'cog': dict(l=K(0, 0, 0.015), s=(0.97, 1.05, 0.97)), 'head': dict(r=(0, 3, 0)),
                 'ear.L': dict(r=(0, -8, 0)), 'ear.R': dict(r=(0, -8, 0)), 'tail2': dict(r=(0, 8, 0)), 'tail3': dict(r=(0, 10, 0))}
    keys = {0: REST, 1: blend(REST, crouch, 0.7), 2: crouch, 3: coil, 4: launch, 5: air, 6: contact, 7: contact2,
            8: hop_up, 9: hop_down, 10: land_sq, 11: recoil_up, 12: over, 13: REST}
    return keyed(keys, 14)


def clip_hit():
    """6 frames: 1 = the one strong recoil (head snaps back and away, body shoved back + squashed,
    eyes squeezed, ears pinned, tail whips forward) | 2 hold at 80 % | 3-4 rebound past rest | 5 rest."""
    recoil = {'cog': dict(l=K(-0.10, 0, 0.0), s=(1.05, 0.92, 1.05)), 'body': dict(r=(4, 6, 0)),
              'chest': dict(r=(0, 4, 0)), 'head': dict(r=(-6, 16, 8)),
              'ear.L': dict(r=(-10, -30, 0)), 'ear.R': dict(r=(10, -30, 0)),
              'tail1': dict(r=(0, -12, 0)), 'tail2': dict(r=(0, -16, 0)), 'tail3': dict(r=(0, -10, 0)),
              **legs(front=(0, 8, 0), back=(0, -4, 0)), 'blink': 0.7}
    hold = blend(REST, recoil, 0.8); hold['blink'] = 0.55
    hold['tail3'] = dict(r=(0, -18, 0))
    reb = {'cog': dict(l=K(0.02, 0, 0), s=(0.98, 1.03, 0.98)), 'head': dict(r=(0, -4, -2)),
           'ear.L': dict(r=(0, 8, 0)), 'ear.R': dict(r=(0, 8, 0)), 'tail2': dict(r=(0, 8, 0)), 'tail3': dict(r=(0, 10, 0))}
    keys = {0: REST, 1: recoil, 2: hold, 3: reb, 4: blend(REST, reb, 0.3), 5: REST}
    return keyed(keys, 6)


def clip_faint():
    """10 frames: 1 hurt flinch | 2-3 wobble (sway away, then back) | 4-6 legs give way, body sinks and
    rolls a little away from camera, head droops | 7-9 flat on the ground, eyes shut, ears and tail limp."""
    flinch = {'cog': dict(l=K(-0.04, 0, 0.02), s=(0.97, 1.04, 0.97)), 'head': dict(r=(0, 10, 4)),
              'ear.L': dict(r=(0, -20, 0)), 'ear.R': dict(r=(0, -20, 0)), 'tail2': dict(r=(0, -8, 0)), 'blink': 0.5}
    sway1 = {'cog': dict(l=K(-0.03, 0.02, 0.0)), 'body': dict(r=(7, 0, 0)), 'head': dict(r=(9, -4, 0)),
             'ear.L': dict(r=(10, -10, 0)), 'ear.R': dict(r=(10, -10, 0)),
             'tail1': dict(r=(0, -6, 6)), 'tail2': dict(r=(0, -8, 8)), 'blink': 0.35}
    sway2 = {'cog': dict(l=K(-0.02, -0.02, -0.02)), 'body': dict(r=(-5, -2, 0)), 'head': dict(r=(-6, -8, 0)),
             'ear.L': dict(r=(-10, -14, 0)), 'ear.R': dict(r=(-10, -14, 0)),
             'tail1': dict(r=(0, -10, -4)), 'tail2': dict(r=(0, -12, -6)), 'blink': 0.45}
    buckle = {'cog': dict(l=tuple(np.add(K(0.0, 0, -0.10), (0, 0, -0.5 * FD))), s=(1.04, 0.90, 1.04)), 'body': dict(r=(6, -4, 0)),
              'chest': dict(r=(0, -4, 0)), 'head': dict(r=(4, -14, 0)),
              'ear.L': dict(r=(8, -20, 0)), 'ear.R': dict(r=(-8, -20, 0)),
              'tail1': dict(r=(0, -18, 0)), 'tail2': dict(r=(0, -20, 0)), 'tail3': dict(r=(0, -10, 0)),
              **legs(front=(0, 30, 0), back=(0, -30, 0), loc=(0, 0, -0.3 * FL)), 'blink': 0.8}
    down = {'cog': dict(l=tuple(np.add(K(0.0, 0, -0.16), (0, 0, -FD))), s=(1.05, 0.88, 1.05)), 'body': dict(r=(10, -3, 0)),
            'chest': dict(r=(0, -6, 0)), 'head': dict(r=(8, -20, -4)),
            'ear.L': dict(r=(12, -26, 0)), 'ear.R': dict(r=(-10, -26, 0)),
            'tail1': dict(r=(0, -34, 0)), 'tail2': dict(r=(0, -34, 0)), 'tail3': dict(r=(0, -18, 0)),
            # legs fold flat; lowered only as far as keeps the paws ON the ground plane (was -0.04: a 2 px sink)
            'leg_f.L': dict(r=(0, 62, 0), l=LD()), 'leg_f.R': dict(r=(0, 62, 0), l=LD()),
            'leg_b.L': dict(r=(0, -62, 0), l=LD()), 'leg_b.R': dict(r=(0, -62, 0), l=LD()), 'blink': 1.0}
    settle = blend(down, {**down, 'cog': dict(l=tuple(np.add(K(0.0, 0, -0.164), (0, 0, -FD))), s=(1.06, 0.87, 1.06)),
                          'head': dict(r=(8, -22, -4))}, 1.0)
    keys = {0: REST, 1: flinch, 2: sway1, 3: sway2, 5: buckle, 7: down, 8: settle, 9: settle}
    return keyed(keys, 10, kinds={5: 'in'})




def build(legs_map, scale=1.0, faint_drop=0.0, faint_leg_drop=0.0):
    """Returns (clips, travel, rest) for a kin with these leg bones, scaled by `scale`. faint_drop / faint_leg_drop:
    extra world-unit drops of the body and the legs in the faint for a kin whose belly sits higher than Ashkit's
    (check the faint zmin in the DRY run's checks: the last frames should sit at about 0)."""
    global LEGS, k, FD, FL
    LEGS = dict(legs_map); k = float(scale); FD = float(faint_drop); FL = float(faint_leg_drop)
    clips = {'idle': clip_idle(), 'attack': clip_attack(), 'hit': clip_hit(), 'faint': clip_faint()}
    return clips, {'attack': dict(fwd=ATTACK_TRAVEL, ease=ATTACK_EASE)}, REST
