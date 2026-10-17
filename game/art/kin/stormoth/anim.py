"""Stormoth - rig stormoth_final.blend and render its sprite frames with the shared rig (../lib/hoprig.py) and the
flier clips (../lib/fly.py): slow, wide wingbeats (2 per idle) on fin.L/fin.R (each wing with its bolt and spots), the
feathery antennae on ear.L/ear.R, the banded abdomen swaying on tip1. Env: as sheetkit.Kit.run plus YAW_BACK,
ELEV_BACK, HEAD_BACK, MOTION_SCALE.
"""
import sys, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'lib'))
import sheetkit  # noqa: F401  (imports bpy before mathutils)
from hoprig import run_hop

SPEC = dict(
    name='stormoth', blend='stormoth_final.blend', turn=16.0, height=1.46, clips='fly', beats=2, flap=(26.0, -30.0),
    # wings held as a display facing the front (model.py WROOT, wing_frame sweep 8 / dihedral 36); comb antennae
    apps=[dict(bone='fin.L', head=(-0.10, 0.14, 0.80), tail=(-0.20, 0.82, 1.30), radius=0.01, slots=('wingL', 'boltL', 'spotL')),
          dict(bone='fin.R', head=(-0.10, -0.14, 0.80), tail=(-0.20, -0.82, 1.30), radius=0.01, slots=('wingR', 'boltR', 'spotR')),
          dict(bone='ear.L', head=(0.36, 0.08, 1.02), tail=(0.40, 0.30, 1.50), radius=0.01, slots=('antL',)),
          dict(bone='ear.R', head=(0.36, -0.08, 1.02), tail=(0.40, -0.30, 1.50), radius=0.01, slots=('antR',)),
          dict(bone='tip1', head=(-0.20, 0, 0.64), tail=(-0.76, 0, 0.44), radius=0.01, slots=('abdomen', 'aband'))],
    eye_centre=(0.30, 0.0, 0.80), scale=1.0,
)
run_hop(SPEC, HERE)
