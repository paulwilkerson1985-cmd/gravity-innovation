"""Pebblet - rig pebblet_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): solid stone, so no appendage bones (the crystals ride the body). Env: as
sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='pebblet', blend='pebblet_final.blend', turn=16.0, height=1.0,
    apps=[], eye_centre=(0.0, 0.0, 0.62), scale=0.9, squash=0.4,   # stone: it does not flatten like jelly
)
run_hop(SPEC, HERE)
