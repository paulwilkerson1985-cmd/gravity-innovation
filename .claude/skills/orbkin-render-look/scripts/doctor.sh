#!/usr/bin/env bash
# Step 0 of every orbkin-render-look task: what works on this machine (≈ 2 s). Never installs anything.
# Usage: bash ${CLAUDE_SKILL_DIR}/scripts/doctor.sh [GAME_DIR]   (default ./game)
# Prints one line per check: ok | missing | warn, then a summary; exit 1 if a required item is missing.
set -u
case "${1:-}" in -h|--help) sed -n 2,4p "$0" | sed "s/^# //"; exit 0;; esac
GAME="${1:-${ORBKIN_GAME:-game}}"
miss=0
line() { printf '%-9s %-22s %s\n' "$1" "$2" "$3"; }
if [ -x "$GAME/tools/bootstrap/bootstrap.sh" ]; then bash "$GAME/tools/bootstrap/bootstrap.sh" doctor || true; fi
where="cloud"; command -v gpu-run >/dev/null 2>&1 && where="gpu-pc"; [ -n "${DISPLAY:-}" ] && where="desktop"
line "info" "where" "$where (CPU-only cloud: SwiftShader ms are ratios, never phone costs)"
if [ -f "$GAME/package.json" ]; then line ok "game" "$GAME"; else line missing "game" "no package.json in $GAME (pass the dir or set ORBKIN_GAME)"; miss=1; fi
v=$(node -v 2>/dev/null) && line ok "node" "$v" || { line missing "node" "node 20+ required"; miss=1; }
if [ -f "$GAME/node_modules/playwright/package.json" ]; then line ok "playwright" "$(node -e "console.log(require(require('path').resolve('$GAME/node_modules/playwright/package.json')).version)")"; else line missing "playwright" "run: (cd $GAME && npm ci --ignore-scripts)"; miss=1; fi
PWB="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
if ls "$PWB" 2>/dev/null | grep -q chromium; then line ok "chromium" "$PWB (never run playwright install: the CDN is blocked)"; else line missing "chromium" "no chromium under $PWB"; miss=1; fi
tv=$(node -e "console.log(require(require('path').resolve('$GAME/node_modules/three/package.json')).version)" 2>/dev/null) && line ok "three" "$tv (skill verified on 0.180; r186 notes in references/upgrade-r186.md)" || line warn "three" "not installed"
if [ -f "$GAME/dist/index.html" ]; then line ok "dist" "$GAME/dist ($(date -r "$GAME/dist/index.html" +%H:%M:%S)) — rebuild after edits: (cd $GAME && npm run build)"; else line warn "dist" "no build yet: (cd $GAME && npm run build) before capture/audit"; fi
python3 -I -c "import PIL, numpy; print(PIL.__version__, numpy.__version__)" >/tmp/.orbdoc 2>/dev/null && line ok "python" "python3 + Pillow/numpy $(cat /tmp/.orbdoc)" || { line missing "python" "python3 with Pillow and numpy (pin them in game/tools/verify/requirements-verify.txt)"; miss=1; }
command -v claude >/dev/null 2>&1 && line ok "claude-cli" "$(claude --version 2>/dev/null | head -1) (nested judge: env -u CLAUDECODE claude -p)" || line warn "claude-cli" "not on PATH: gate.py fallback unavailable; use orbkin-visual-gate"
if [ -d .claude/skills/orbkin-visual-gate ]; then line ok "visual-gate" ".claude/skills/orbkin-visual-gate present: use it for S5"; else line warn "visual-gate" "orbkin-visual-gate not installed: S5 uses scripts/gate.py (same protocol)"; fi
command -v ffmpeg >/dev/null 2>&1 && line ok "ffmpeg" "$(ffmpeg -version 2>/dev/null | head -1 | cut -d' ' -f3) (cam_analyze --mp4)" || line warn "ffmpeg" "absent: cam_analyze skips the MP4"
if [ -n "${ORBKIN_BPY:-}" ]; then line ok "bpy" "$ORBKIN_BPY (not needed by this skill)"; else line info "bpy" "ORBKIN_BPY unset (not needed by this skill; orbkin-blender-forge sets it up)"; fi
nproc_=$(nproc 2>/dev/null || echo ?); load=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null || echo ?)
line info "cpu" "$nproc_ cores, load $load (SwiftShader capture ≈ 8–20 s per screen; ≤ 4 cores means the game's own tier detection says 'low' unless ?q= is set)"
if [ "$miss" = 1 ]; then echo "DOCTOR: missing items above; stop and report them"; exit 1; fi
echo "DOCTOR: ok"
