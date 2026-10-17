"""Surgeray - rig surgeray_final.blend and render its sprite frames with the serpent rig and clips
(../lib/serpentrig.py, ../lib/serpent.py) along the centre line in shape.py: the cape (the ray's disc on the floor) rides
the 'coil' bone whole, the neck n1..n4 and the head strike and sway, the whip tail and its gold electrode fork (material
slot 'ttip', at the tail's end: weighted to the 'tail' bone alone, so it stays rigid) ride 'tail'. The wing-tip nodes
sit on the rigid cape, so they never shear. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.

Attack (review 3, nice): the shared serpent anticipation curls the neck back with the head pitched down, which knots
the head onto Surgeray's chest; here the anticipation pulls the head back and UP (the base leans back, the upper neck
stays upright, the body stretches, the tail cocks away from the lifted head), then the shared strike (frames 4-13) follows unchanged. Swapped in through the
clip builder serpentrig calls, so lib/ stays untouched.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
import sheetkit  # noqa: F401  (imports bpy before mathutils)
import serpent
import serpentrig
from sheetkit import blend
from serpentrig import run_serpent
from shape import path, EYE_CENTRE

SPEC = dict(
    name='surgeray', blend='surgeray_final.blend', turn=16.0, path=path(), head_c=EYE_CENTRE,
    eye_slots=('eye', 'pupil'), blend_w=0.06, scale=1.0, faint_down=-70,
)


def attack_head_up():
    """serpent.clip_attack with frames 1-3 replaced: rear back with the head lifted (not cocked down onto the chest)."""
    neck, K = serpent.neck, serpent.K
    shared = serpent.clip_attack()
    rear = {'cog': dict(s=(0.99, 0.99, 1.03)), **neck((8, 6, -2, -6), keep=0.85, nod=6, tail=8)}
    coil = {'cog': dict(s=(0.98, 0.98, 1.05), l=K(-0.02, 0, 0)), **neck((14, 10, -4, -10), keep=0.85, nod=10, tail=12)}
    out = list(shared)
    out[1], out[2], out[3] = rear, blend(rear, coil, 0.7), coil
    return out


_build = serpentrig.serpent_clips


def _clips(scale=1.0, down=-76.0):
    clips, travel, rest = _build(scale=scale, down=down)
    clips['attack'] = attack_head_up()
    # faint: the shared clip only swings the tail sideways, so the whip tail stayed upright with the fork in the air
    # while the neck lay on the floor; let it droop back toward the floor as the body sags
    droop = float(os.environ.get('TAIL_DROOP', 30))     # 38+ sinks the tail under the floor
    seen = set()
    for f, P in enumerate(clips['faint']):
        if id(P) in seen:
            continue
        seen.add(id(P))
        k = min(1.0, max(0.0, (f - 3) / 4.0))           # from the sag (f4) to lying (f7)
        r = P.get('tail', {}).get('r', (0, 0, 0))
        P['tail'] = {**P.get('tail', {}), 'r': (r[0], r[1] + droop * k, r[2])}
    return clips, travel, rest


serpentrig.serpent_clips = _clips
run_serpent(SPEC, HERE)
