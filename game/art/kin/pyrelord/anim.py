"""Pyrelord - rig pyrelord_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE,
FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='pyrelord', blend='pyrelord_final.blend',
    turn=(16.0, 4.0, (0.62, 0.0, 1.52)),                       # as model.py's 'battle' key
    head_zone=(1.70, 1.92, 0.92, 1.10, 1.55, 1.75, 0.10, 0.35),
    ear=dict(c=(0.80, 0.30, 2.42), rx=-24, ry=-30, w=(0.15, 0.27)),
    legs=dict(front_x=0.40, hind_x=-0.68, y=0.30, top=1.10, reach=0.30, ground_band=0.30),
    body_c=(-0.20, 0, 1.26),
    hips=((-0.80, 0, 1.30), (-0.20, 0, 1.34)), chest=((-0.20, 0, 1.34), (0.62, 0, 1.52)), head=((0.62, 0, 1.52), (1.18, 0, 2.10)),
    tail=[(-0.88, 0.0, 1.32), (-1.10, 0.02, 1.52), (-1.28, 0.04, 1.82), (-1.38, 0.05, 2.50)],
    tail_zone=(-0.80, -0.92, 1.20, 1.34, 1.46, 1.58, 1.70, 1.86),
    chest_split=(-0.45, 0.15), eye_centre=(0.95, 0.0, 2.05),
    motion=dict(scale=1.55, faint_drop=0.35, faint_leg=0.29),
)
run_quad(SPEC, HERE)
