"""Petalwisp - rig petalwisp_final.blend and render its sprite frames with the shared rig (../lib/hoprig.py) and the
flier clips (../lib/fly.py): no wings; the leaf arms swing on leaf1 (left) / leaf2 (right), the wind-wisp tail sways
on tip1. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='petalwisp', blend='petalwisp_final.blend', turn=16.0, height=1.39, clips='fly', beats=2,
    apps=[dict(bone='leaf1', head=(0.02, 0.12, 0.62), tail=(0.04, 0.56, 0.52), radius=0.01, slots=('leafL',)),
          dict(bone='leaf2', head=(0.02, -0.12, 0.62), tail=(0.04, -0.56, 0.52), radius=0.01, slots=('leafR',)),
          dict(bone='tip1', head=(-0.02, 0, 0.48), tail=(-0.30, 0, 0.14), radius=0.01, slots=('wisp',))],
    eye_centre=(0.02, 0.0, 0.90), scale=1.0,
)
run_hop(SPEC, HERE)
