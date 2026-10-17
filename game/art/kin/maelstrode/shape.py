"""Maelstrode's centre line, shared by model.py (the body is a tube along it) and anim.py (bones and weights by
arclength along it). Plain Python: no bpy. Units: world, +X forward, +Z up, before the battle turn.

The path runs tail -> coil -> neck -> head: the fluke rises from the coil's centre, the body spirals out along the floor
(the whirlpool), leaves the coil at the front and rises into an S-neck to the head.
"""
import math

TURNS = 1.35


def path():
    """[(point, radius)] from the fluke tip to the snout, and the indices where the coil, the neck and the head begin."""
    out = []
    for p, r in (((-0.02, 0.0, 0.48), 0.035), ((0.0, 0.0, 0.36), 0.06), ((0.03, 0.0, 0.22), 0.085)):   # the tail rising from the centre
        out.append((p, r))
    i_coil = len(out)
    n = 44
    for j in range(n):
        t = j / (n - 1)
        a = -TURNS * 2 * math.pi * (1 - t)            # ends at angle 0: the coil leaves toward +X
        rr = 0.10 + 0.36 * t
        rad = 0.09 + 0.06 * t
        out.append(((rr * math.cos(a), rr * math.sin(a), rad + 0.12 * (1 - t) ** 1.2), rad))   # inner turns ride higher: a whirlpool
    i_neck = len(out)
    for p, r in (((0.53, 0.04, 0.26), 0.15), ((0.57, 0.02, 0.44), 0.145), ((0.49, 0.0, 0.63), 0.14), ((0.41, 0.0, 0.81), 0.13),
                 ((0.45, 0.0, 0.99), 0.125), ((0.55, 0.0, 1.10), 0.12)):
        out.append((p, r))
    i_head = len(out)
    for p, r in (((0.66, 0.0, 1.15), 0.12), ((0.80, 0.0, 1.16), 0.09)):
        out.append((p, r))
    return out, i_coil, i_neck, i_head


HEAD_C = (0.68, 0.0, 1.17)          # the head's centre (the head is an ellipsoid over the last path points)
