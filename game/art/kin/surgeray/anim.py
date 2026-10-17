"""Surgeray - rig surgeray_final.blend and render its sprite frames with the shared hop rig and clips
(../lib/hoprig.py, ../lib/hop.py): a ray's pounce (it lifts off its wing tips and slams down). The model is posed for the
battle camera (pitched toward it, wing tips on the floor) and turned 36 deg, not the round kins' 16: a flat ray reads
from the front. head_back 0 keeps the back sheet's total body turn at 36 deg, as before. The wings ride fin.L/fin.R by
wide capsules (half gain: a ripple, not a flap), the antennae ear.L/ear.R (claimed first, by their per-side materials),
the whip tail (an arc from the raised rear toward -y) tip1/tip2 at gain 0.35, the tail bolt claimed whole by tip2's
slot. Bone points are model.py's 'RIG' prints. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='surgeray', blend='surgeray_final.blend', turn=36.0, head_back=0.0, height=0.48,
    apps=[dict(bone='ear.L', head=(0.08, 0.154, 0.236), tail=(0.03, 0.239, 0.436), radius=0.01, slots=('antL', 'nodeL')),
          dict(bone='ear.R', head=(0.08, -0.154, 0.236), tail=(0.03, -0.239, 0.436), radius=0.01, slots=('antR', 'nodeR')),
          dict(bone='fin.L', head=(-0.046, 0.24, 0.137), tail=(-0.205, 0.70, 0.017), radius=0.40, root_fade=0.45, gain=0.5),
          dict(bone='fin.R', head=(-0.046, -0.24, 0.137), tail=(-0.205, -0.70, 0.017), radius=0.40, root_fade=0.45, gain=0.5),
          dict(bone='tip1', head=(-0.415, 0.0, 0.323), tail=(-0.515, -0.20, 0.25), radius=0.10, root_fade=0.3, gain=0.35),
          dict(bone='tip2', head=(-0.515, -0.20, 0.25), tail=(-0.565, -0.39, 0.153), parent='tip1', radius=0.10, root_fade=0.05,
               slots=('tbolt',), gain=0.35)],
    eye_centre=(0.095, 0.0, 0.087), scale=0.8,   # behind the eyes: the far-eye test measures from here
)
run_hop(SPEC, HERE)
