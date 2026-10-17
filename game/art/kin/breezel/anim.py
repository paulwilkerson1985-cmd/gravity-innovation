"""Breezel - rig breezel_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): the swirl tuft on tip1/tip2, the stubby wings on fin.L/fin.R. Env: as
sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='breezel', blend='breezel_final.blend', turn=16.0, height=1.70,
    apps=[dict(bone='tip1', head=(0.04, 0, 1.44), tail=(0.05, 0, 1.58), radius=0.15, root_fade=0.3),
          dict(bone='tip2', head=(0.05, 0, 1.58), tail=(0.16, 0.1, 1.72), parent='tip1', radius=0.17, root_fade=0.1),
          dict(bone='fin.L', head=(0.16, 0.50, 0.70), tail=(-0.24, 0.74, 0.46), radius=0.05, root_fade=0.05, slots=('wing.L',)),
          dict(bone='fin.R', head=(0.16, -0.50, 0.70), tail=(-0.24, -0.74, 0.46), radius=0.05, root_fade=0.05, slots=('wing.R',))],
    eye_centre=(0.08, 0.0, 1.02), scale=1.0,
)
run_hop(SPEC, HERE)
