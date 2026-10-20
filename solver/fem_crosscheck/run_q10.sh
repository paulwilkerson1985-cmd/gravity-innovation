#!/usr/bin/env bash
# Q10: reproduce the FEniCS cross-check of the symmetron benchmark and membrane case (about 3 minutes, ~3 GB RAM peak).
# Environment (conda-forge; legacy FEniCS, the version SELCIE uses):
#   micromamba create -p ./fenv -c conda-forge python=3.10 fenics=2019.1.0 meshio scipy matplotlib python-gmsh libglu astropy
# Then:  PY="micromamba run -p ./fenv python" bash run_q10.sh
set -e
PY=${PY:-python}
mkdir -p meshes; rm -f bench_runs.jsonl memb_runs.jsonl
for spec in "b1 0.02 0.2" "b2 0.01 0.1" "b3 0.005 0.05" "b4 0.0025 0.05" "b5 0.0025 0.025"; do set -- $spec
  $PY mesh_q10.py meshes/$1 $2 $3 1 none; done
for m in b1 b2 b3 b4; do for deg in 2 3; do $PY fem_symmetron.py meshes/$m $deg none ${m}_P$deg | tail -1 >> bench_runs.jsonl; done; done
$PY fem_symmetron.py meshes/b5 2 none b5_P2 | tail -1 >> bench_runs.jsonl
for lev in "2 0.01 0.1" "3 0.005 0.05" "4 0.0025 0.025"; do set -- $lev
  $PY mesh_q10.py meshes/m$1 $2 $3 1 -0.55; $PY mesh_q10.py meshes/m$1_ns $2 $3 0 -0.55
  $PY fem_symmetron.py meshes/m$1 2 0.1 m$1_src | tail -1 >> memb_runs.jsonl
  $PY fem_symmetron.py meshes/m$1_ns 2 0.1 m$1_nosrc | tail -1 >> memb_runs.jsonl; done
$PY fem_symmetron.py meshes/m3 2 0.14 m3_src_k014 | tail -1 >> memb_runs.jsonl
$PY fem_symmetron.py meshes/m3_ns 2 0.14 m3_nosrc_k014 | tail -1 >> memb_runs.jsonl
$PY summarize_q10.py
