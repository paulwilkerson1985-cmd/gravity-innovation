"""Maelstrode - rig maelstrode_final.blend and render its sprite frames with the serpent rig and clips
(../lib/serpentrig.py, ../lib/serpent.py) along the centre line in shape.py. Env: as sheetkit.Kit.run plus YAW_BACK,
ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from serpentrig import run_serpent
from shape import path, HEAD_C

SPEC = dict(
    name='maelstrode', blend='maelstrode_final.blend', turn=16.0, path=path(), head_c=HEAD_C,
    eye_slots=('eye', 'pupil'), blend_w=0.06, scale=1.0, faint_down=-66,   # the barbel tips just touch the floor
)
run_serpent(SPEC, HERE)
