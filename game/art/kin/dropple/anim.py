"""Dropple - rig dropple_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py). Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='dropple', blend='dropple_final.blend', turn=16.0, height=1.62,
    apps=[dict(bone='tip1', head=(-0.03, 0, 1.12), tail=(-0.12, 0, 1.40), radius=0.30, root_fade=0.35),
          dict(bone='tip2', head=(-0.12, 0, 1.40), tail=(-0.40, 0, 1.64), parent='tip1', radius=0.24, root_fade=0.15),
          dict(bone='fin.L', head=(0.16, 0.58, 0.36), tail=(-0.10, 0.88, 0.32), radius=0.14, root_fade=0.05),
          dict(bone='fin.R', head=(0.16, -0.58, 0.36), tail=(-0.10, -0.88, 0.32), radius=0.14, root_fade=0.05)],
    eye_centre=(0.0, 0.0, 0.70), scale=1.0,
)
run_hop(SPEC, HERE)
