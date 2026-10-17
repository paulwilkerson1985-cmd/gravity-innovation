"""Cyclonyx - rig cyclonyx_final.blend and render its sprite frames with the shared rig (../lib/hoprig.py) and the
flier clips (../lib/fly.py): strong wingbeats (2 per idle) on fin.L/fin.R (each wing with its underwing and
primaries), the two tail streamers trailing on tip1/tip2. Env: as sheetkit.Kit.run plus YAW_BACK, ELEV_BACK,
HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='cyclonyx', blend='cyclonyx_final.blend', turn=16.0, height=1.47, clips='fly', beats=2, flap=(24.0, -34.0),
    # wings raised in a V in a plane facing the front (model.py WROOT, wing_frame sweep 6 / dihedral 44)
    apps=[dict(bone='fin.L', head=(-0.06, 0.18, 0.72), tail=(-0.13, 0.82, 1.35), radius=0.01, slots=('wingL', 'underL', 'primL')),
          dict(bone='fin.R', head=(-0.06, -0.18, 0.72), tail=(-0.13, -0.82, 1.35), radius=0.01, slots=('wingR', 'underR', 'primR')),
          dict(bone='tip1', head=(-0.46, 0, 0.50), tail=(-0.80, 0, 0.44), radius=0.15, root_fade=0.3),
          dict(bone='tip2', head=(-0.80, 0, 0.44), tail=(-1.16, 0, 0.72), parent='tip1', radius=0.22, root_fade=0.05)],
    eye_centre=(0.24, 0.0, 0.94), scale=1.0,
)
run_hop(SPEC, HERE)
