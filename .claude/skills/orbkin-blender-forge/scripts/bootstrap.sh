#!/usr/bin/env bash
# orbkin-blender-forge bootstrap: doctor | bpy [--wait] | paths | node
#
#   doctor        print what works on this machine (about 3 s). Exit 0 even when things are missing;
#                 the lines say what is missing and what to do.
#   bpy [--wait]  make Blender 5.2.2 (PyPI "bpy") available. Prints "ready <path>" or "installing".
#                 --wait blocks until installed (1-3 min cold through the proxy; 0 s when cached).
#   paths         print `export ORBKIN_BPY=...; export ORBKIN_TOOLS_BIN=...` lines (eval them).
#   node          install the skill's pinned glTF tools (npm ci --ignore-scripts) if the lock changed.
#
# Resolution order for the Blender python ($ORBKIN_BPY):
#   1. $ORBKIN_BPY if set AND its site-packages holds bpy-5.2.2.dist-info (checked without importing).
#   2. game/tools/bootstrap/bootstrap.sh (the repo-level bootstrap, when it lands) -> delegated.
#   3. $ORBKIN_CACHE/bpy-5.2.2 (default ~/.cache/orbkin), installed here from the hash-locked
#      requirements-linux-x86_64.lock with --require-hashes --only-binary :all: --no-deps.
# Nothing here uses sudo, adds package sources, or installs globally. apt runs only for the two
# Mesa EGL packages, only as root inside the cloud VM (Workbench/EEVEE need libEGL; Cycles does not).
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$HERE")"
REPO="$(cd "$SKILL_DIR/../../.." && pwd)"
BPY_VERSION=5.2.2
PY=python3.13
CACHE="${ORBKIN_CACHE:-$HOME/.cache/orbkin}"
VENV="$CACHE/bpy-$BPY_VERSION"
LOCK="$HERE/requirements-linux-x86_64.lock"
NODE_DIR="$HERE/node"
cmd="${1:-doctor}"; shift || true

has_bpy() { # $1 = python path -> 0 if that venv holds the pinned bpy
  local p="$1"; [ -x "$p" ] || return 1
  local sp; sp="$(dirname "$(dirname "$p")")/lib"
  compgen -G "$sp/python3.*/site-packages/bpy-$BPY_VERSION.dist-info" >/dev/null 2>&1
}

resolve_bpy() { # prints the python path or nothing
  if [ -n "${ORBKIN_BPY:-}" ] && has_bpy "$ORBKIN_BPY"; then echo "$ORBKIN_BPY"; return 0; fi
  if [ -x "$REPO/game/tools/bootstrap/bootstrap.sh" ]; then
    local p; p="$(bash "$REPO/game/tools/bootstrap/bootstrap.sh" paths 2>/dev/null | sed -n 's/^export ORBKIN_BPY=//p' | tr -d '"' | head -1)"
    if [ -n "$p" ] && has_bpy "$p"; then echo "$p"; return 0; fi
  fi
  if [ -f "$VENV/.orbkin-ok" ] && has_bpy "$VENV/bin/python"; then echo "$VENV/bin/python"; return 0; fi
  return 1
}

install_bpy() { # blocking, under flock, hash-locked
  mkdir -p "$CACHE"
  command -v "$PY" >/dev/null || { echo "ERROR: $PY not found; Blender $BPY_VERSION as a module needs CPython 3.13" >&2; return 2; }
  (
    flock 9
    if [ -f "$VENV/.orbkin-ok" ] && has_bpy "$VENV/bin/python"; then exit 0; fi
    local t0; t0=$(date +%s)
    rm -rf "$VENV"
    "$PY" -m venv "$VENV" || exit 2
    "$VENV/bin/python" -m pip install -q --no-cache-dir --disable-pip-version-check \
      --require-hashes --only-binary :all: --no-deps -r "$LOCK" || exit 2
    "$VENV/bin/python" -I -c "import bpy; print('bpy', bpy.app.version_string)" >/dev/null || exit 2
    echo "$BPY_VERSION by=orbkin-blender-forge/bootstrap.sh t=$(( $(date +%s) - t0 ))s" >"$VENV/.orbkin-ok"
  ) 9>"$CACHE/bpy.lock"
}

ensure_node() { # npm ci only when the lock hash changed (stamp in node_modules)
  local want have
  want="$(sha256sum "$NODE_DIR/package-lock.json" | cut -c1-16)"
  have="$(cat "$NODE_DIR/node_modules/.orbkin-lock-sha" 2>/dev/null || true)"
  if [ "$want" != "$have" ]; then
    (cd "$NODE_DIR" && npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1) || { echo "tools npm FAILED (run: cd $NODE_DIR && npm ci --ignore-scripts)"; return 1; }
    echo "$want" >"$NODE_DIR/node_modules/.orbkin-lock-sha"
    echo "tools npm installed"
  else
    echo "tools npm ok"
  fi
}

egl_ok() { ldconfig -p 2>/dev/null | grep -q 'libEGL.so.1'; }
ensure_egl() {
  egl_ok && return 0
  if [ "$(id -u)" = "0" ] && [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && command -v apt-get >/dev/null; then
    export DEBIAN_FRONTEND=noninteractive
    (apt-get install -y -qq --no-install-recommends libegl1 libegl-mesa0 >/dev/null 2>&1 \
      || { apt-get update -qq >/dev/null 2>&1 && apt-get install -y -qq --no-install-recommends libegl1 libegl-mesa0 >/dev/null 2>&1; }) || true
  fi
  egl_ok
}

case "$cmd" in
  paths)
    p="$(resolve_bpy || true)"
    [ -n "$p" ] && echo "export ORBKIN_BPY=\"$p\""
    echo "export ORBKIN_TOOLS_BIN=\"$NODE_DIR/node_modules/.bin\""
    echo "export ORBKIN_SKILL_DIR=\"$SKILL_DIR\""
    ;;
  bpy)
    p="$(resolve_bpy || true)"
    if [ -n "$p" ]; then echo "ready $p"; exit 0; fi
    if [ "${1:-}" = "--wait" ]; then
      install_bpy && echo "ready $VENV/bin/python" || { echo "FAILED: see messages above; pip needs pypi.org through the proxy"; exit 2; }
    else
      if flock -n "$CACHE/bpy.lock" true 2>/dev/null; then
        echo "not installed. Run: bash ${BASH_SOURCE[0]} bpy --wait   (1-3 min, hash-locked wheels from PyPI)"; exit 1
      else echo "installing (another process holds the lock); use --wait"; exit 1; fi
    fi
    ;;
  node) ensure_node ;;
  doctor)
    where=local; [ "${CLAUDE_CODE_REMOTE:-}" = "true" ] && where=cloud; command -v gpu-run >/dev/null 2>&1 && where=gpu-pc
    gpu=none; command -v nvidia-smi >/dev/null 2>&1 && gpu="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)"
    echo "env: $where | $(uname -s) $(uname -m) | cpus $(nproc) | load $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null) | disk free $(df -h . | awk 'NR==2{print $4}') | gpu $gpu"
    nodev="$(node --version 2>/dev/null || echo MISSING)"
    gamenpm="MISSING (cd game && npm ci --ignore-scripts)"; [ -d "$REPO/game/node_modules/three" ] && gamenpm="ok (three $(node -e "console.log(require('$REPO/game/node_modules/three/package.json').version)" 2>/dev/null))"
    echo "node $nodev | game npm $gamenpm | $(ensure_node) | gltf-transform $("$NODE_DIR/node_modules/.bin/gltf-transform" --version 2>/dev/null || echo MISSING)"
    if ensure_egl; then egl="EGL ok (Workbench + EEVEE available)"; else egl="EGL MISSING (Cycles still works; Workbench/EEVEE renders will fail: ask the owner to add libegl1 libegl-mesa0 to the environment setup script)"; fi
    pw="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"; chrom="MISSING (never run playwright install here; the CDN is blocked)"
    compgen -G "$pw/chromium-*" >/dev/null 2>&1 && chrom="ok ($(basename "$(ls -d "$pw"/chromium-* | head -1)"))"
    echo "$egl | chromium $chrom | ktx not installed (KTX2 is opt-in and needs owner approval)"
    p="$(resolve_bpy || true)"
    if [ -n "$p" ]; then
      echo "bpy $BPY_VERSION ready: $p"
      "$p" -I "$HERE/bpy_smoke.py" 2>/dev/null | grep '^ORBKIN_SMOKE' || echo "bpy smoke FAILED: run \"$p\" -I $HERE/bpy_smoke.py to see why"
    else
      echo "bpy $BPY_VERSION NOT READY: run  bash ${BASH_SOURCE[0]} bpy --wait   then  eval \"\$(bash ${BASH_SOURCE[0]} paths)\""
    fi
    ;;
  *) echo "usage: bootstrap.sh doctor | bpy [--wait] | paths | node" >&2; exit 64 ;;
esac
