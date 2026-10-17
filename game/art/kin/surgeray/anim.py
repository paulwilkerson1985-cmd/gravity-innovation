"""Surgeray - rig surgeray_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): a ray's pounce (it lifts off its wing tips and slams down). The wings ride
fin.L/fin.R by wide capsules (half gain: a ripple, not a flap), the antennae ear.L/ear.R (claimed first, by their
per-side materials), the whip tail tip1/tip2. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='surgeray', blend='surgeray_final.blend', turn=16.0, height=0.65,
    apps=[dict(bone='ear.L', head=(0.23, 0.10, 0.36), tail=(0.22, 0.16, 0.64), radius=0.01, slots=('antL', 'nodeL')),
          dict(bone='ear.R', head=(0.23, -0.10, 0.36), tail=(0.22, -0.16, 0.64), radius=0.01, slots=('antR', 'nodeR')),
          dict(bone='fin.L', head=(-0.02, 0.24, 0.20), tail=(-0.06, 0.80, 0.03), radius=0.45, root_fade=0.45, gain=0.5),
          dict(bone='fin.R', head=(-0.02, -0.24, 0.20), tail=(-0.06, -0.80, 0.03), radius=0.45, root_fade=0.45, gain=0.5),
          dict(bone='tip1', head=(-0.42, 0, 0.17), tail=(-0.76, 0, 0.16), radius=0.10, root_fade=0.3),
          dict(bone='tip2', head=(-0.76, 0, 0.16), tail=(-1.20, 0, 0.45), parent='tip1', radius=0.20, root_fade=0.05, slots=('tbolt',))],
    eye_centre=(0.34, 0.0, 0.30), scale=0.8,
)
run_hop(SPEC, HERE)
