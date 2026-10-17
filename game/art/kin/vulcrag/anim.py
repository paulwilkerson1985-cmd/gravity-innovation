"""Vulcrag - rig vulcrag_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): a heavy stomp-hop (motion scale 0.7); the arms and molten fists swing on
fin.L/fin.R (claimed by their per-side materials). Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK,
MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='vulcrag', blend='vulcrag_final.blend', turn=16.0, height=1.30,
    apps=[dict(bone='fin.L', head=(-0.02, 0.42, 0.66), tail=(0.20, 0.72, 0.22), radius=0.02, root_fade=0.05, slots=('armL', 'fistL'), gain=-0.8),
          dict(bone='fin.R', head=(-0.02, -0.42, 0.66), tail=(0.20, -0.72, 0.22), radius=0.02, root_fade=0.05, slots=('armR', 'fistR'), gain=-0.8)],
    eye_centre=(0.0, 0.0, 0.84), scale=0.7, squash=0.5,   # stone: it does not flatten like jelly
)
run_hop(SPEC, HERE)
