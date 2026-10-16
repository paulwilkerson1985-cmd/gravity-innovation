"""Flickwing - rig flickwing_final.blend and render its sprite frames with the shared rig (../lib/hoprig.py) and the
flier clips (../lib/fly.py): buzzing wings (a beat every other drawing) on fin.L/fin.R, the zig-zag antennae on
ear.L/ear.R, the lantern tail swaying on tip1. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK,
MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='flickwing', blend='flickwing_final.blend', turn=16.0, height=1.42, clips='fly', beats=6, flap=(38.0, -22.0),
    apps=[dict(bone='fin.L', head=(-0.10, 0.30, 0.94), tail=(-0.20, 0.82, 1.00), radius=0.01, slots=('wingL',)),
          dict(bone='fin.R', head=(-0.10, -0.30, 0.94), tail=(-0.20, -0.82, 1.00), radius=0.01, slots=('wingR',)),
          dict(bone='ear.L', head=(0.25, 0.12, 1.00), tail=(0.28, 0.26, 1.46), radius=0.01, slots=('antL', 'sparkL')),
          dict(bone='ear.R', head=(0.25, -0.12, 1.00), tail=(0.28, -0.26, 1.46), radius=0.01, slots=('antR', 'sparkR')),
          dict(bone='tip1', head=(-0.30, 0, 0.58), tail=(-0.72, 0, 0.44), radius=0.01, slots=('lantern', 'band'))],
    eye_centre=(0.0, 0.0, 0.66), scale=1.0,
)
run_hop(SPEC, HERE)
