#!/usr/bin/env bash
# Lab 06 - GLB compression matrix with free CLIs (glTF-Transform 4.5.1 via npm, gltfpack 0.20 via apt,
# KTX-Software 4.4.2 'ktx' from the GitHub release tarball).
# Usage: bash 06_compress.sh      (from the lab dir; needs out/04_labkin_anim.glb, out/05_labkin_tex.glb)
set -u
cd "$(dirname "$0")"
GT=node/node_modules/.bin/gltf-transform
KTX=$(realpath ../pipeline/dl/ktx/KTX-Software-4.4.2-Linux-x86_64)
export PATH="$KTX/bin:$PATH" LD_LIBRARY_PATH="$KTX/lib:${LD_LIBRARY_PATH:-}"
O=out/06; mkdir -p $O
row() { # name file seconds
  local gz; gz=$(gzip -9 -c "$2" | wc -c)
  printf "| %-44s | %8.1f | %8.1f | %6.2f | %s |\n" "$1" "$(echo "$(stat -c%s "$2")/1024" | bc -l)" "$(echo "$gz/1024" | bc -l)" "$3" "$(python3 glbinfo.py "$2" | head -1 | cut -c1-200)"
}
run() { # name out cmd...
  local name=$1 out=$2; shift 2
  local t0=$(date +%s.%N)
  if "$@" > $O/last.log 2>&1; then
    row "$name" "$out" "$(echo "$(date +%s.%N) - $t0" | bc -l)"
  else
    printf "| %-44s | FAIL: %s |\n" "$name" "$(tail -2 $O/last.log | tr '\n' ' ' | cut -c1-160)"
  fi
}
echo "| variant | KB | KB gz | sec | extensions |"
echo "|---|---|---|---|---|"
T=out/05_labkin_tex.glb; A=out/04_labkin_anim.glb
row "TEX raw Blender export (PNG 1024 x2)" $T 0
run "TEX optimize (defaults: meshopt, auto tex)" $O/t_opt.glb $GT optimize $T $O/t_opt.glb
run "TEX optimize --compress draco --tex webp" $O/t_draco_webp.glb $GT optimize $T $O/t_draco_webp.glb --compress draco --texture-compress webp
run "TEX optimize --compress meshopt --tex webp" $O/t_mo_webp.glb $GT optimize $T $O/t_mo_webp.glb --compress meshopt --texture-compress webp
run "TEX optimize --tex ktx2 (etc1s colour/uastc normal)" $O/t_ktx2.glb $GT optimize $T $O/t_ktx2.glb --compress meshopt --texture-compress ktx2
run "TEX etc1s (all slots)" $O/t_etc1s.glb $GT etc1s $T $O/t_etc1s.glb
run "TEX uastc (all slots, zstd)" $O/t_uastc.glb $GT uastc $T $O/t_uastc.glb --zstd 18
run "TEX gltfpack -cc" $O/t_gp_cc.glb gltfpack -i $T -o $O/t_gp_cc.glb -cc
run "TEX gltfpack -cc -tc (basisu)" $O/t_gp_tc.glb gltfpack -i $T -o $O/t_gp_tc.glb -cc -tc
row "ANIM raw Blender export (skin+morph+2 clips)" $A 0
run "ANIM optimize defaults (simplify ON!)" $O/a_opt.glb $GT optimize $A $O/a_opt.glb
run "ANIM optimize --simplify false" $O/a_opt_nosimp.glb $GT optimize $A $O/a_opt_nosimp.glb --simplify false
run "ANIM draco (geometry only)" $O/a_draco.glb $GT draco $A $O/a_draco.glb
run "ANIM meshopt (geometry+anim+morph)" $O/a_meshopt.glb $GT meshopt $A $O/a_meshopt.glb --level high
run "ANIM quantize only (KHR_mesh_quantization)" $O/a_quant.glb $GT quantize $A $O/a_quant.glb
run "ANIM gltfpack -cc" $O/a_gp_cc.glb gltfpack -i $A -o $O/a_gp_cc.glb -cc
