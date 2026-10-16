"""Cindertail - rig cindertail_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). Env: as sheetkit.Kit.run (VIEWS, CLIPS, FRAMES, SPP, SIZE, OUT, DRY) plus
YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE, FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='cindertail', blend='cindertail_final.blend',
    turn=(16.0, 4.0, (0.40, 0.0, 1.10)),                       # as model.py's 'battle' key
    head_zone=(1.28, 1.48, 0.62, 0.80, 1.10, 1.30, -0.20, 0.05),
    ear=dict(c=(0.44, 0.27, 2.10), rx=-22, ry=-26),
    legs=dict(front_x=0.26, hind_x=-0.50, y=0.20, top=0.82),
    body_c=(-0.12, 0, 0.92),
    hips=((-0.58, 0, 0.96), (-0.12, 0, 1.00)), chest=((-0.12, 0, 1.00), (0.40, 0, 1.10)), head=((0.40, 0, 1.10), (0.86, 0, 1.68)),
    tail=[(-0.66, 0.02, 1.00), (-0.84, 0.04, 1.16), (-0.97, 0.06, 1.34), (-1.06, 0.07, 1.95)],
    tail_zone=(-0.55, -0.70, 0.86, 1.02, 1.10, 1.22, 1.30, 1.45),
    chest_split=(-0.35, 0.10), eye_centre=(0.64, 0.0, 1.66),
    motion=dict(scale=1.25, faint_drop=0.29, faint_leg=0.26),
)
run_quad(SPEC, HERE)
