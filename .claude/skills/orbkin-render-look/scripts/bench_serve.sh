#!/usr/bin/env bash
# Build the game with the bench drop-in installed and serve it on the LAN for the owner's phone.
# Usage: bash ${CLAUDE_SKILL_DIR}/scripts/bench_serve.sh [GAME_DIR] [PORT]     (default ./game, 4173)
# 1. installs assets/bench.ts as src/debug/bench.ts and the one-line hook in src/main.ts if missing
#    (idempotent; both are plain additions you can revert with git checkout),
# 2. npm run build, 3. vite preview --host so http://<LAN-IP>:PORT/?bench=1 opens on the phone
#    (plain http on a LAN IP is fine; the clipboard API needs https, so COPY falls back to select-all).
# On the cloud box there is no phone: use this only to verify the build, then stop it (Ctrl-C).
set -euo pipefail
GAME="${1:-${ORBKIN_GAME:-game}}"; PORT="${2:-4173}"
SK="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$GAME/package.json" ] || { echo "no package.json in $GAME"; exit 1; }
mkdir -p "$GAME/src/debug"
if [ ! -f "$GAME/src/debug/bench.ts" ]; then cp "$SK/assets/bench.ts" "$GAME/src/debug/bench.ts"; echo "installed src/debug/bench.ts"; fi
if ! grep -q "debug/bench" "$GAME/src/main.ts"; then
  python3 - "$GAME/src/main.ts" <<'EOF'
import sys, re
p = sys.argv[1]; s = open(p).read()
hook = "if (params.get('bench')) void import('./debug/bench').then((m) => m.runBench(game));\n"
s = s.replace("installHooks(game);\n", "installHooks(game);\n" + hook, 1)
open(p, 'w').write(s)
EOF
  echo "hooked src/main.ts (?bench=1)"
fi
( cd "$GAME" && npm run build )
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo
echo "Open on the phone:  http://${IP:-<LAN-IP>}:$PORT/?bench=1      (quick: ?bench=quick)"
echo "Android Chrome GPU timings: chrome://flags/#enable-webgl-developer-extensions → Enabled → Relaunch"
echo "iPhone: Settings → Apps → Safari → Advanced → Feature Flags → WebGL Timer Queries"
echo "Battery > 30 %, Low Power Mode off, phone cool, portrait. Tap START, wait, tap COPY, paste the ORBKIN_BENCH line."
echo "Read it back:  python3 -I $SK/scripts/bench_read.py bench.json --tier low"
( cd "$GAME" && npx vite preview --host --port "$PORT" --strictPort )
