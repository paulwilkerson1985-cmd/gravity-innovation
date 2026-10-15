# Environment: how to run this skill's tools here and on a normal machine

The art-direction scripts need only Python 3.11+ with numpy and Pillow, Node 22 with the game's own
Playwright (`legibility.mjs`), and the `claude` CLI (`screen_judge.py`). Blender is **not** used by this
skill; asset work is handed to orbkin-blender-forge. Step 0 is `scripts/preflight.sh`, which wraps the
gate skill's `doctor.sh`; `game/tools/bootstrap/bootstrap.sh` is planned and does not exist yet.

## This cloud container (verified 2026-10-15)

- `python3` (system) with numpy 2.5 and Pillow 12 already installed. Always run the scripts
  isolated: `python3 -I ${CLAUDE_SKILL_DIR}/scripts/<script>.py ...` (cwd is the project root).
  The Blender venv (`scratchpad/bpyenv/bin/python`) has numpy but **no Pillow**: do not use it here.
- Node 22 at /opt/node22/bin/node; Playwright + SwiftShader come from `game/node_modules`
  (`npm ci` in `game/`, never a global install). Serve a build for `legibility.mjs` with
  `cd game && npx vite preview --outDir <dist> --port 4815 --strictPort` (build into a scratch dir,
  never `game/dist`), then `node ${CLAUDE_SKILL_DIR}/scripts/legibility.mjs --base http://127.0.0.1:4815
  --out <scratch>/legib.json --game game`; stop it with `fuser -k 4815/tcp`.
- `claude` 2.1.x on PATH, logged in; `screen_judge.py` spawns tool-less `claude -p` judges
  (~$0.03-0.05 per call, 6-10 calls per verdict). Nested runs must not inherit the session:
  the script strips `CLAUDECODE` and `CLAUDE_CODE_SESSION_ID` itself.
- Captures come from orbkin-visual-gate's `capture.mjs` (frozen virtual frame clock, desk 1280x720 +
  phone 393x851 @2.75, `raw/<id>.png` + `raw/<id>.clean.png` + `capture.json` with `layout` boxes
  `mine/foe/player` in CSS px at the top level of each shot; phone boxes are scaled by the scripts).
  `capture.json` carries `calls` and `triangles` per shot but no shader-program count.
- **The box is shared and small** (4 cores, one 252 GB disk shared by every session). Both of these
  broke the pilot's captures while the harness reported `ok: true`: a full disk (12 MB free) gave a
  phone frame with no scene and a desk frame with failed (black) materials; load 15-23 made captures
  take 4-9 min and two phone captures time out ("Unable to capture screenshot", shader VALIDATE_STATUS).
  `preflight.sh` refuses to go under 2 GB free and prints `capture_flags` (`--workers 1 --timeout-s 600`
  when load/core > 1). Open every capture with Read; `critique.py` flags blank frames and capture
  errors (`capture_sanity`, `frame_blank`).
- Cost per iteration (load 10-20): desk capture 4-7 min, phone 1.5-2 min, judge 45-60 s and
  $0.10-0.15 per shot (+$0.10-0.15 with `--layout` crop votes). Offline: `grade_preview.py` ~1 s per
  variant, `critique.py` ~2 s, `verdict_risk.py` instant. Budget: 3 captured variants per gate round.
- Gate run dirs: `RUN=$(bash $G/gate_init.sh <label>)` under `${ORBKIN_RUNS:-/tmp/orbkin-gate}`; the
  owner kit must be built at `$RUN/kit` (`owner_kit.py $RUN/kit ...`) or `report.sh` prints "none
  queued". `report.sh` warns "no run.json" for a directory not made by `gate_init.sh`.
- Sealed state: this container has no `game/tools/verify/sealed/` (`preflight` -> `sealed: missing`);
  every verdict says `"sealed": false`. Such verdicts are valid for regressions and critique; nothing is
  ACCEPTED on them. Write success criteria as "floors pass, no `worse`, queued for the owner".
- Scratch: the session scratchpad directory named in the system prompt; write debug PNGs, previews
  and verdict JSON there. A previous full capture lives at `scratchpad/jc/current/` (HEAD fa40185) and
  the volcanic pilot at `scratchpad/pilot/orbkin-art-direction-1/` (base, H, J captures + critiques)
  for dry runs.

## A normal machine (owner's desktop / GPU PC)

- `python3 -m venv .venv && .venv/bin/pip install "numpy>=2,<3" "pillow>=10"` (or
  `game/tools/verify/requirements-verify.txt` once landed; pin versions, `--require-hashes` when
  available). Run `.venv/bin/python -I <script>`.
- Node 22 LTS from nodejs.org or nvm (user scope); `cd game && npm ci` (no `-g`, no new packages).
- Claude Code CLI installed and logged in for the judge; otherwise use `--dry-run` and send the pair to
  the owner batch.
- Blender, only for the hand-off to orbkin-blender-forge (Blender 5.2 LTS): Linux `~/opt/blender-5.2/blender`
  or `/opt/blender-5.2/blender` (`--background --python script.py -- args`); macOS
  `/Applications/Blender.app/Contents/MacOS/Blender`; Windows
  `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`; or the PyPI module
  `pip install bpy==5.2.*` in a venv for headless scripts. Never auto-run Python from downloaded `.blend`.
- GPU PC via `gpu-run` (see GPU_PC_SETUP.md): heavy renders only; captures and judges run anywhere.
