"""Rillback - rig rillback_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). The paddle tail lies back along the ground (tail_axis 'x'). Env: as
sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE, FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='rillback', blend='rillback_final.blend',
    turn=(16.0, 4.0, (0.66, 0.0, 0.96)),                       # as model.py's 'battle' key
    head_zone=(9.0, 9.1, 0.74, 0.92, 0.80, 0.98, 0.60, 0.75),  # (no height-only term: the board is not head)
    ear=dict(c=(0.92, 0.36, 1.62), rx=-20, ry=-10, w=(0.12, 0.16)),
    legs=dict(front_x=0.48, hind_x=-0.70, y=0.32, top=0.62, hind_lean=0.02, reach=0.24, ground_band=0.14),
    body_c=(-0.18, 0, 0.78),
    hips=((-0.90, 0, 0.78), (-0.18, 0, 0.82)), chest=((-0.18, 0, 0.82), (0.66, 0, 0.96)), head=((0.66, 0, 0.96), (1.20, 0, 1.36)),
    tail=[(-0.95, 0, 0.66), (-1.20, 0, 0.52), (-1.44, 0, 0.40), (-1.80, 0, 0.36)],
    tail_zone=(-0.88, -1.02, -1.0, -0.9, 1.10, 1.22, 1.34, 1.46), tail_axis='x', tail_pitch=-0.15,
    chest_split=(-0.40, 0.20), eye_centre=(1.08, 0.0, 1.30),
    motion=dict(scale=1.05, faint_drop=0.075, faint_leg=0.05),
)
run_quad(SPEC, HERE)
