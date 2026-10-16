"""Thistlehorn - rig thistlehorn_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). Leaf ears stick out sideways (ear axis +Y). Env: as sheetkit.Kit.run plus
YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE, FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='thistlehorn', blend='thistlehorn_final.blend',
    turn=(16.0, 4.0, (0.44, 0.0, 1.12)),                       # as model.py's 'battle' key
    head_zone=(1.30, 1.48, 0.62, 0.78, 1.12, 1.30, 0.40, 0.55),
    ear=dict(c=(0.60, 0.33, 1.66), rx=-24, ry=-20, axis=(0.0, 1.0, 0.0), w=(0.10, 0.34)),
    legs=dict(front_x=0.30, hind_x=-0.44, y=0.21, top=0.84, reach=0.22, ground_band=0.16),
    body_c=(-0.10, 0, 0.98),
    hips=((-0.52, 0, 1.00), (-0.10, 0, 1.02)), chest=((-0.10, 0, 1.02), (0.44, 0, 1.12)), head=((0.44, 0, 1.12), (0.92, 0, 1.56)),
    tail=[(-0.60, 0.0, 1.10), (-0.68, 0.0, 1.18), (-0.74, 0.02, 1.26), (-0.82, 0.04, 1.36)],
    tail_zone=(-0.58, -0.66, 1.02, 1.12, 1.16, 1.22, 1.24, 1.30),
    chest_split=(-0.30, 0.12), eye_centre=(0.72, 0.0, 1.50),
    motion=dict(scale=1.2, faint_drop=0.292, faint_leg=0.26),
)
run_quad(SPEC, HERE)
