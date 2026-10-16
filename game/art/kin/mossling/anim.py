"""Mossling - rig mossling_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): the sprout (stem + leaves) sways on one bone. Env: as sheetkit.Kit.run plus
YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='mossling', blend='mossling_final.blend', turn=16.0, height=1.40,
    apps=[dict(bone='leaf1', head=(-0.06, 0, 1.12), tail=(-0.03, 0, 1.40), radius=0.06, root_fade=0.01, slots=('leaf', 'stem'))],
    eye_centre=(0.0, 0.0, 0.62), scale=0.95,
)
run_hop(SPEC, HERE)
