#!/usr/bin/env bash
# doctor.sh - S0: is this machine able to run the visual gate? Prints one JSON object. ~3 s. Exit 0 ready,
# 1 something required is missing (the JSON names it), 2 usage.
#   bash doctor.sh [--game DIR] [--sealed DIR]
# Checks: node >= 18, the game's node_modules with playwright + a chromium binary, python3 with Pillow and
# numpy, the claude CLI (judges run through it), the sealed verifier dir (prompts/canary/trust/anchors/ref),
# the Read deny rule for the sealed dir in .claude/settings.json, git branch (never main), CPU count and
# whether this looks like the cloud container. Nothing is installed; missing pieces are reported.
set -u
GAME="game"; SEALED=""
while [[ $# -gt 0 ]]; do case "$1" in --game) GAME="$2"; shift 2;; --sealed) SEALED="$2"; shift 2;; -h|--help) sed -n '2,9p' "$0"; exit 0;; *) echo "unknown arg $1" >&2; exit 2;; esac; done
ROOT="$(pwd)"
[[ -d "$ROOT/$GAME" ]] || { [[ -d "$GAME" ]] && ROOT="$(cd "$(dirname "$GAME")" && pwd)" && GAME="$(basename "$GAME")"; }
GAMEDIR="$ROOT/$GAME"
SEALED="${SEALED:-${ORBKIN_SEALED:-$GAMEDIR/tools/verify/sealed}}"
missing=(); notes=()
j() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

NODE_V="$(node --version 2>/dev/null || echo none)"
[[ "$NODE_V" == none ]] && missing+=("node")
NODE_MAJ="${NODE_V#v}"; NODE_MAJ="${NODE_MAJ%%.*}"
[[ "$NODE_V" != none && "$NODE_MAJ" -lt 18 ]] && missing+=("node>=18 (have $NODE_V)")

PW_V="none"; CHROME="none"
if [[ -f "$GAMEDIR/package.json" ]]; then
  PW_V="$(node -e "console.log(require('$GAMEDIR/node_modules/playwright/package.json').version)" 2>/dev/null || echo none)"
  if [[ "$PW_V" != none ]]; then
    CHROME="$(node -e "const {chromium}=require('$GAMEDIR/node_modules/playwright'); console.log(chromium.executablePath())" 2>/dev/null || echo none)"
    [[ -x "$CHROME" ]] || { missing+=("playwright chromium binary (run: cd $GAME && npx playwright install chromium)"); CHROME="missing: $CHROME"; }
  else missing+=("playwright in $GAME/node_modules (run: cd $GAME && npm ci)"); fi
else missing+=("game dir $GAMEDIR (pass --game)"); fi

PY_V="$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])' 2>/dev/null || echo none)"
[[ "$PY_V" == none ]] && missing+=("python3")
PIL_V="$(python3 -I -c 'import PIL; print(PIL.__version__)' 2>/dev/null || echo none)"; [[ "$PIL_V" == none ]] && missing+=("python3 Pillow (pip install --require-hashes -r game/tools/verify/requirements-verify.txt, or pip install pillow numpy in a venv)")
NP_V="$(python3 -I -c 'import numpy; print(numpy.__version__)' 2>/dev/null || echo none)"; [[ "$NP_V" == none ]] && missing+=("python3 numpy")
CL_V="$(claude --version 2>/dev/null | head -1 || echo none)"; [[ -z "$CL_V" ]] && CL_V=none
[[ "$CL_V" == none ]] && missing+=("claude CLI on PATH (judges run as nested tool-less claude -p; capture/floor/lint work without it)")

SEALED_STATE="missing"; SEALED_FILES="[]"; REF="false"
if [[ -d "$SEALED" ]]; then
  SEALED_STATE="present"
  SEALED_FILES="$(python3 -c 'import json,os,sys; print(json.dumps(sorted(os.listdir(sys.argv[1]))))' "$SEALED")"
  [[ -f "$SEALED/ref.png" ]] && REF="true"
  [[ -f "$SEALED/prompts.json" ]] || notes+=("sealed dir has no prompts.json: run seal_init.py (verifier/owner session)")
else notes+=("no sealed dir: judges run UNSEALED with built-in prompts and no reference anchor; ask the owner to run seal_init.py once"); fi
DENY="false"
grep -q 'tools/verify/sealed' "$ROOT/.claude/settings.json" 2>/dev/null && DENY="true"
[[ "$DENY" == false ]] && notes+=("no Read deny rule for the sealed dir in .claude/settings.json (owner adds it; never edit settings yourself)")
BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null || echo unknown)"
[[ "$BRANCH" == main ]] && notes+=("on main: work on the designated claude/... branch")
WHERE="local"; [[ -d /root/.ccr || -n "${CLAUDE_CODE_REMOTE:-}" ]] && WHERE="cloud container (CPU only, SwiftShader)"
CPUS="$(nproc 2>/dev/null || echo '?')"
READY=true; [[ ${#missing[@]} -gt 0 ]] && READY=false
python3 - "$READY" "$WHERE" "$NODE_V" "$PW_V" "$CHROME" "$PY_V" "$PIL_V" "$NP_V" "$CL_V" "$SEALED" "$SEALED_STATE" "$SEALED_FILES" "$REF" "$DENY" "$BRANCH" "$CPUS" "$GAMEDIR" "$(printf '%s\n' "${missing[@]:-}")" "$(printf '%s\n' "${notes[@]:-}")" <<'PY'
import json, sys
a = sys.argv[1:]
out = {'ready': a[0] == 'true', 'where': a[1], 'node': a[2], 'playwright': a[3], 'chromium': a[4], 'python': a[5], 'pillow': a[6], 'numpy': a[7],
       'claude_cli': a[8], 'sealed_dir': a[9], 'sealed': a[10], 'sealed_files': json.loads(a[11]), 'ref_anchor': a[12] == 'true',
       'deny_rule_for_sealed': a[13] == 'true', 'git_branch': a[14], 'cpus': a[15], 'game': a[16],
       'missing': [m for m in a[17].split('\n') if m], 'notes': [n for n in a[18].split('\n') if n],
       'budget_hint': 'capture ~1 min build + 20-60 s/shot; judge ~$0.20-0.40 per shot (canary + 4 votes + crop + critique)'}
print(json.dumps(out, indent=1))
PY
[[ "$READY" == true ]]
