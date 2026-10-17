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
          # the streamers droop and spread +-0.25 (model.py): tip2 reaches them both, its root fade keeps it off the body
          dict(bone='tip1', head=(-0.46, 0, 0.50), tail=(-0.78, 0, 0.52), radius=0.25, root_fade=0.3, gain=0.45),   # long streamers: the clips' tail pitch is sized for a short tail
          dict(bone='tip2', head=(-0.78, 0, 0.52), tail=(-1.16, 0, 0.66), parent='tip1', radius=0.50, root_fade=0.05, gain=0.35)],
    eye_centre=(0.24, 0.0, 0.94), scale=1.0,
)
run_hop(SPEC, HERE)
