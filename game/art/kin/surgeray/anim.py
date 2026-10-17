"""Surgeray - rig surgeray_final.blend and render its sprite frames with the serpent rig and clips
(../lib/serpentrig.py, ../lib/serpent.py) along the centre line in shape.py: the cape (the ray's disc on the floor) rides
the 'coil' bone whole, the neck n1..n4 and the head strike and sway, the whip tail (its bolt with it) rides 'tail'.
The wing-tip nodes sit on the rigid cape, so they never shear. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK,
HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
sys.path.insert(0, HERE)
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from serpentrig import run_serpent
from shape import path, EYE_CENTRE

SPEC = dict(
    name='surgeray', blend='surgeray_final.blend', turn=16.0, path=path(), head_c=EYE_CENTRE,
    eye_slots=('eye', 'pupil'), blend_w=0.06, scale=1.0, faint_down=-70,
)
run_serpent(SPEC, HERE)
