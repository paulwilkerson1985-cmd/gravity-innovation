"""Surgeray's centre line, shared by model.py (the neck and tail are tubes along it) and anim.py (the serpent rig's bones
and weights by arclength along it). Plain Python: no bpy. Units: world, +X forward, +Z up, before the battle turn.

The path runs tail -> body -> neck -> head: the whip tail rises behind the cape, the body runs along the ridge of the
ray's disc on the floor (the serpent rig's 'coil' bone: the cape stays rigid), the neck rises from the front of the
disc and carries the head. The neck's first point sits well above the disc, so the cape's leading edges are nearer
the body line than the neck and do not bend with it.
"""

TAIL = [((-0.92, 0.20, 0.66), 0.020), ((-0.97, 0.17, 0.50), 0.026), ((-0.94, 0.11, 0.33), 0.032), ((-0.84, 0.05, 0.19), 0.038),
        ((-0.71, 0.01, 0.11), 0.044)]
BODY = [((-0.58, 0.0, 0.10), 0.05), ((-0.42, 0.0, 0.12), 0.10), ((-0.22, 0.0, 0.14), 0.13), ((-0.02, 0.0, 0.15), 0.14),
        ((0.12, 0.0, 0.18), 0.15), ((0.19, 0.0, 0.25), 0.15)]
NECK = [((0.23, 0.0, 0.36), 0.15), ((0.26, 0.0, 0.50), 0.13), ((0.27, 0.0, 0.64), 0.115), ((0.27, 0.0, 0.77), 0.105),
        ((0.30, 0.0, 0.88), 0.098)]
HEAD = [((0.39, 0.0, 0.95), 0.09), ((0.55, 0.0, 0.96), 0.06)]
HEAD_C = (0.40, 0.0, 0.955)          # the head's centre (the head is built round the last path points)
EYE_CENTRE = (0.33, 0.0, 0.96)       # behind the eyes: the blink and the far-eye test measure from here


def path():
    """[(point, radius)] from the tail tip to the snout, and the indices where the body, the neck and the head begin."""
    out = TAIL + BODY + NECK + HEAD
    return out, len(TAIL), len(TAIL) + len(BODY), len(TAIL) + len(BODY) + len(NECK)
