"""Verdantusk - rig verdantusk_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). The grove rides on the body bones; leaf ears stick out sideways. Env: as
sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE, FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='verdantusk', blend='verdantusk_final.blend',
    turn=(14.0, 3.0, (0.70, 0.0, 1.16)),                       # as model.py's 'battle' key
    head_zone=(9.0, 9.1, 0.76, 0.94, 0.40, 0.60, 0.40, 0.50),  # (no height-only term: the grove is not head)
    ear=dict(c=(0.82, 0.60, 1.50), rx=-10, ry=10, axis=(0.0, 1.0, 0.0), w=(0.14, 0.36)),
    legs=dict(front_x=0.48, hind_x=-0.76, y=0.42, top=0.86, hind_lean=0.02, reach=0.40, ground_band=0.40),
    body_c=(-0.20, 0, 1.12),
    hips=((-0.95, 0, 1.12), (-0.20, 0, 1.16)), chest=((-0.20, 0, 1.16), (0.70, 0, 1.16)), head=((0.70, 0, 1.16), (1.30, 0, 1.30)),
    tail=[(-0.96, 0, 1.12), (-1.06, 0, 1.16), (-1.16, 0, 1.21), (-1.32, 0, 1.30)],
    tail_zone=(-0.94, -1.00, 0.95, 1.00, 1.04, 1.10, 1.14, 1.20), tail_axis='x', tail_pitch=0.4,
    chest_split=(-0.45, 0.25), eye_centre=(1.06, 0.0, 1.22), faint_head=-0.2,
    motion=dict(scale=1.5, faint_drop=0.13, faint_leg=0.13),
)
run_quad(SPEC, HERE)
