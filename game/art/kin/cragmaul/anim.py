"""Cragmaul - rig cragmaul_final.blend and render its sprite frames with the shared quad rig and clips
(../lib/quadrig.py, ../lib/quad.py). A knuckle-walker: the "front legs" are the arms, from the shoulders down to the
crystal fists (segment legs); no ears, no tail. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK,
MOTION_SCALE, FAINT_DROP, FAINT_LEG.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from quadrig import run_quad

SPEC = dict(
    name='cragmaul', blend='cragmaul_final.blend',
    turn=(14.0, 3.0, (0.62, 0.0, 1.18)),                       # as model.py's 'battle' key
    head_zone=(9.0, 9.1, 0.62, 0.74, 0.95, 1.02, 0.50, 0.60),
    legs=dict(front_x=0.74, hind_x=-0.18, y=0.37, top=0.70, hind_lean=0.0, reach=0.26, ground_band=0.22,
              seg={'leg_f.L': ((0.32, 0.62, 1.34), (0.62, 0.70, 0.30), 0.40, (('fist', 'crystal'), 0.75)),
                   'leg_f.R': ((0.32, -0.62, 1.34), (0.86, -0.74, 0.30), 0.40, (('fist', 'crystal'), 0.75))}),
    body_c=(0.0, 0, 0.95),
    hips=((-0.45, 0, 0.95), (0.0, 0, 1.00)), chest=((0.0, 0, 1.00), (0.62, 0, 1.18)), head=((0.62, 0, 1.18), (0.95, 0, 1.30)),
    chest_split=(-0.25, 0.30), faint_front=0.0, eye_centre=(0.78, 0.0, 1.22), anchor=(0.30, 0.0, 0.0),
    motion=dict(scale=1.3, faint_drop=-0.07, faint_leg=-0.04),
)
run_quad(SPEC, HERE)
