# Claude Code skills: format, loading, writing and testing (research notes for Orbkin)

Angle: how Claude Code skills work and how to write excellent ones, so that the graphics knowledge
from the other research angles can be encoded as skills that trigger reliably, load cheaply and
measurably improve results. Written 2026-10-14 against Claude Code **v2.1.296** (installed here).

Confidence legend: **[verified]** = reproduced in this container; **[high]** = primary source
(official docs, spec, Anthropic's own skills); **[med]** = credible secondary source or a small
experiment; **[low]** = single anecdote or tiny sample.

Experiment files: `research/skills-exp/` (harnesses, raw results, template, linter).
Cloned sources: `research/skills-src/` (agentskills spec repo, superpowers, claudedesignskills,
majidmanzarpour_threejs-game-skills, CloudAI-X_threejs-skills, claude-plugins-official/skill-creator)
plus `research/repos/` (anthropics/skills, blender-game-skills, game-creator, img2threejs).

---

## Contents
0. TL;DR
1. How skills work in Claude Code (mechanics)
2. Frontmatter reference (portable vs Claude Code only)
3. Rules for writing excellent skills
4. Patterns that matter for graphics skills
5. Anti-patterns (with examples from community repos)
6. Testing and evals
7. Research evidence: do skills help?
8. Community skills reviewed
9. Experiments run here (commands and results)
10. The template and the rules checklist
11. Implications for Orbkin
12. Open questions
13. Sources

---

## 0. TL;DR

1. A skill is a folder `<name>/SKILL.md` (YAML frontmatter + Markdown) plus optional `scripts/`,
   `references/`, `assets/`. Only `name` + `description` sit in context permanently; the body loads
   when the skill is invoked; bundled files load only when read; scripts run without loading. [high]
2. **The description is the whole trigger.** In tests here, a vague description triggered 0/6
   relevant requests on Haiku; a "Use when ..." description triggered 6/6 with 0 false
   triggers on near-misses (Haiku and Opus). A topic-only description triggered on a near-miss
   (GLB loader bug). Opus is eager: even a vague description fired 5/6, carried by the skill
   *name*. [verified, small n]
3. Five sibling stub skills (blender-asset, render-look, pixel-textures, visual-review,
   art-direction) with distinct "Use when" descriptions routed **26/26** probes (13 realistic
   Orbkin requests × 2 runs) correctly on Opus, including 2 non-graphics requests that must not
   trigger anything and "looks flat and washed out" going to render-look rather than
   art-direction. [verified, small n]
4. Once invoked, the body is injected **once** and never re-read; after compaction Claude Code
   keeps only the **first 5,000 tokens per skill** (25,000 total). Put standing rules and gates at
   the top; keep SKILL.md < 500 lines / < 5k tokens. [high]
5. **Placement matters:** skills in `game/.claude/skills/` are NOT listed when the session starts
   at the repo root; they appear only after Claude reads a file under `game/`. Skills with
   `paths:` are hidden until a matching file is touched. Put Orbkin skills in the repo-root
   `.claude/skills/` so they can trigger on the first message. [verified]
6. Bundled scripts run with **cwd = project root**, not the skill dir; call them as
   `python3 ${CLAUDE_SKILL_DIR}/scripts/x.py`. `$ARGUMENTS`, `${CLAUDE_SKILL_DIR}` and
   `` !`cmd` `` load-time injection all work (with `allowed-tools` pre-approval, even in `-p`). [verified]
7. Best graphics skills (blender-image-to-3d, threejs-aaa-graphics-builder) share a shape: gated
   phases, **gates passed on rendered/measured evidence from scripts**, calibration anchor images
   for scoring, a list of "AI-default tells" to refuse, a bounded fix loop, an honest report
   format. Weak ones are API-doc dumps of what the model already knows. [high]
8. Gates must be **produced by scripts**, never self-attested: Haiku refused to write a
   "PASSED" gate file it had not measured. [verified, n=3]
9. Research: curated skills +16.2 pp average (SkillsBench, 7,308 trajectories), focused skills
   with 2–3 modules best, exhaustive docs can hurt; self-generated skills ~0; in software
   engineering most public skills add ~nothing and version-mismatched guidance hurts up to -10%;
   seemingly relevant skills cause most skill-induced failures and "excessive procedure /
   excessive verification" drives cost regressions. [med: preprints]
10. Test two things separately: **triggering** (20 realistic should/should-not queries, 3 runs,
    ~$0.011 per Opus probe here) and **output quality** (same prompts with and without the skill,
    assertions + blind comparison + human review). Pixel metrics catch gross failures only: our
    current HD-2D cave capture already matches the reference on entropy/edges/dominant colour,
    yet judges rate it ~6/10. Quality needs calibrated visual judging. [verified]

---

## 1. How skills work in Claude Code (mechanics)

### 1.1 Where skills live and when they load [high, partly verified]

Source: <https://code.claude.com/docs/en/skills>

| Location | Path | Loads in |
| --- | --- | --- |
| Enterprise | managed settings dir `.claude/skills/<n>/SKILL.md` | all users on managed machines |
| Personal | `~/.claude/skills/<n>/SKILL.md` | all your projects |
| Project | `.claude/skills/<n>/SKILL.md` in the start dir **and every parent up to the repo root** | that repo |
| Nested | `<subdir>/.claude/skills/<n>/SKILL.md` below the start dir | only after Claude reads/edits a file in `<subdir>` (or `/add-dir`) |
| `--add-dir` | `.claude/skills/` in the added dir | that session |
| Plugin | `<plugin>/skills/<n>/SKILL.md` | as `/plugin-name:skill-name` |
| claude.ai account (synced) | `~/.claude/skills/synced/...` | download only; local edits are overwritten |

- Precedence on name collisions: enterprise > personal > project; a skill beats a
  `.claude/commands/` file of the same name; plugin skills are namespaced and never collide.
- Nested and root skills with the same dir name both load; Claude is told to use the one whose
  directory holds the files it works on (`/apps/web:deploy`). This session's own skill list shows
  that format ("Directory-scoped skills are listed with a path prefix").
- Live change detection: edits under `~/.claude/skills/`, project `.claude/skills/` and `--add-dir`
  dirs are picked up without restart; a **new top-level skills directory** needs `/reload-skills`
  or a restart.
- Do not name a skill folder `synced`; `anthropic-skills` is reserved.
- **[verified]** A skill in `proj5/game/.claude/skills/` was absent from the `init` skill list when
  `claude -p` started in `proj5/`; after "Read game/src/a.ts" the model said "A skill named
  orbkin-nested-probe was just discovered" and invoked it.
- **[verified]** A skill with `paths: game/src/render/**` was absent at start; reading `docs/n.md`
  did not surface it; reading `game/src/render/r.ts` did, and it was invoked.

Skills-directory plugins: a folder under `.claude/skills/` (or `~/.claude/skills/`) that contains
`.claude-plugin/plugin.json` loads as `<name>@skills-dir` (plugin with namespaced skills, agents,
hooks). Project-scope ones load only after the workspace-trust dialog, and **only from the
primary working directory** (no parent search). `claude plugin init <name>` scaffolds one under
`~/.claude/skills/<name>/`. Source: <https://code.claude.com/docs/en/plugins/loading>. [high]

### 1.2 Lifecycle: listing → invocation → persistence → compaction [high]

1. **Listing.** At session start Claude Code puts every skill's `name` + `description` (+
   `when_to_use`) into a listing. Each entry is capped at **1,536 chars**
   (`skillListingMaxDescChars`). The whole listing has a budget of **1% of the model's context
   window** (`skillListingBudgetFraction`, or `SLASH_COMMAND_TOOL_CHAR_BUDGET` as a fixed char
   count). On overflow, descriptions are dropped starting with the **least-invoked** skills (all
   names stay). `/doctor` and `/context` show the cost; `/skill-doctor` lists unused skills.
   - Measured here: ~64 SKILL.md files under `~/.claude/{plugins,skills}` with ~28.6k chars of
     descriptions (avg 447, max 1,005), plus built-ins; `init` listed ~90 skills. With a 1M-token
     context the budget is large; with a 200k model, brand-new (never invoked) skills would lose
     their descriptions first. Keep ours short. [verified count, med on budget arithmetic]
2. **Invocation.** By Claude (Skill tool, decided from the listing) or by the user (`/name args`).
   Up to six skills can be stacked in one message. Typing `/name` at the start runs it directly.
3. **Injection.** The rendered SKILL.md (substitutions applied, `!` commands executed) enters the
   conversation as one message and **stays**; Claude Code does **not re-read** the file on later
   turns. Re-invoking identical content adds an "already loaded" note.
   Consequence: write guidance that must hold for the whole task as standing rules ("run the
   capture after every edit"), not one-time steps.
4. **Compaction.** The most recent invocation of each skill is re-attached, keeping the **first
   5,000 tokens** per skill, **25,000 tokens** combined, newest first; older skills can be
   dropped. Put the most important instructions at the top.
5. **Troubleshooting** (docs): skill not triggering → keywords in description, check it is listed
   ("What skills are available?"), malformed YAML loads the body with empty metadata (run
   `--debug` or `claude plugin validate .claude/skills`); triggers too often → narrow the
   description or set `disable-model-invocation: true`; Claude stops following → move must-hold
   rules into a **hook**, or re-invoke after compaction.

### 1.3 Substitutions and dynamic context [high + verified]

| Token | Meaning |
| --- | --- |
| `$ARGUMENTS` | all arguments (appended as `ARGUMENTS: ...` if no placeholder used) |
| `$ARGUMENTS[N]` / `$N` | 0-based positional, shell-style quoting |
| `$name` | named argument declared in `arguments:` |
| `${CLAUDE_SKILL_DIR}` | the skill's directory (plugin: the skill's subdir) |
| `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}` | as named |
| `` !`cmd` `` (or a ```` ```! ```` block) | runs **before** Claude sees the skill; output replaces it. Non-zero exit aborts the whole invocation (append `|| true`); 2-min timeout; must be allowed by permissions or `allowed-tools`; not executed for synced claude.ai skills |

**[verified]** `research/skills-exp/proj3/.claude/skills/probe-skill`: `/probe-skill alpha` rendered
`Label argument: alpha`, the absolute skill dir, and the output of
`` !`python3 ${CLAUDE_SKILL_DIR}/scripts/hello.py injected` ``; `allowed-tools:
Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/hello.py *)` let the script run in `-p` mode without a
prompt. Both runs printed `cwd=<project root>`, i.e. **scripts execute from the project root**.

Useful for Orbkin: inject live state at load time, e.g. `` !`git -C game log --oneline -5` `` or a
budgets probe, so the skill starts from facts, not assumptions.

### 1.4 Invocation control, permissions, forks, subagents, hooks [high]

- `disable-model-invocation: true` → user-only (`/name`), description not in context; use for
  side-effect workflows (deploy, commit). `user-invocable: false` → Claude-only background
  knowledge.
- Permissions: rules `Skill(name)`, `Skill(name *)`; settings `skillOverrides` per skill:
  `on | name-only | user-invocable-only | off` (not for plugin skills).
- `allowed-tools` grants tools **only for the turn that invoked the skill**; `disallowed-tools`
  removes tools while active.
- `context: fork` (+ `agent: Explore|Plan|general-purpose|<custom>`, `background`) runs the skill
  as a subagent whose prompt is the skill content (no conversation history). Only for skills with
  explicit tasks; "guidelines without a task return nothing useful".
- **Subagents** (`.claude/agents/<n>.md`): frontmatter `name, description, tools, model,
  skills, hooks, memory, effort, isolation, ...`. `skills:` **preloads the full content** of up
  to 32 skills (cannot preload `disable-model-invocation` skills). Subagents do **not** inherit
  skills the parent already invoked. Source: <https://code.claude.com/docs/en/sub-agents>.
- **Hooks in skill frontmatter** (`hooks: PreToolUse: - matcher: "Bash" hooks: [...]`) register on
  invocation and stay for the session; `once: true` removes after first success. Project skill
  hooks follow the workspace-trust rule. Source: <https://code.claude.com/docs/en/hooks>.
- Rule of thumb from the docs: if Claude skips a rule that must hold every time, move it into a
  hook; if it skips judgment guidance, reword it to apply to the whole task.

---

## 2. Frontmatter reference

Sources: agentskills.io spec (repo `agentskills/agentskills/docs/specification.mdx`), Claude Code
skills docs, skill-creator `quick_validate.py`.

### 2.1 Portable fields (Agent Skills spec; accepted by claude.ai / API upload) [high]

| Field | Rules |
| --- | --- |
| `name` | 1–64 chars, `a-z0-9-`, no leading/trailing or double hyphen, **must match the folder name**; platform docs add: no XML tags, no reserved words `anthropic`, `claude`. In Claude Code optional (defaults to dir name). |
| `description` | 1–1024 chars, non-empty, no `<` `>` (upload validator), what it does + when to use. Claude Code falls back to the first body line if missing. |
| `license` | short name or bundled file |
| `compatibility` | 1–500 chars; env requirements (rarely needed) |
| `metadata` | string→string map (author, version) |
| `allowed-tools` | space-separated (Claude Code also accepts comma or YAML list); experimental in spec |

### 2.2 Claude Code-only fields [high]

`when_to_use` (appended to description, shares the 1,536 cap), `argument-hint`, `arguments`,
`disable-model-invocation`, `user-invocable`, `disallowed-tools`, `model`, `effort`
(`low..max`), `context: fork`, `agent`, `background`, `hooks`, `paths` (globs), `shell`
(`bash|powershell`). Booleans accept true/false, yes/no, on/off, 1/0. **Unknown keys are ignored
silently** in Claude Code but are a **hard error** on claude.ai/API upload ("Unexpected key(s) in
SKILL.md frontmatter: argument-hint"). [verified: quick_validate rejected `argument-hint`;
`claude plugin validate` passed the same skill]

YAML gotcha: unquoted values containing `: ` break strict parsers (`description: Use when: ...`).
Quote the description or use a `>` block scalar. [high]

---

## 3. Rules for writing excellent skills

Consolidated from Anthropic's platform best-practices page, agentskills.io best practices, the
skill-creator skill, Anthropic's own production skills, obra/superpowers `writing-skills`, and the
experiments in §9. Where sources disagree, the resolution is stated.

### 3.1 Scope: when a skill is the right tool [high]

- Make a skill when you keep pasting the same procedure, or a CLAUDE.md section has become a
  procedure rather than a fact. CLAUDE.md = always-on facts/rules; skill = on-demand procedure or
  reference; subagent/fork = isolated work; hook = guaranteed enforcement.
- One coherent unit of work per skill ("like a function"): too narrow → several load for one task
  and conflict; too broad → hard to trigger precisely. Research (SkillsBench) favours 2–3 focused
  modules per task over exhaustive bundles.
- **Add only what the model lacks**: project conventions, environment facts, non-obvious gotchas,
  tested parameters, the tools/scripts to use. Do not explain what a GLB, bpy or bloom is.
  "Would the agent get this wrong without this line? If not, cut it."
- Start from real expertise: extract from a task actually completed (steps that worked,
  corrections made, formats seen), or synthesize from project artifacts (our DECISIONS.md,
  HD2D.md, judge feedback, git fixes). LLM-only "best practices" skills are generic.
- Mechanical constraints that a script or lint can enforce belong in a script/hook, not prose.

### 3.2 Description (the trigger) [high + verified]

- Third person, specific, contains the **nouns users actually say** and the **situations/symptoms**
  ("still looks like a pile of spheres"), plus a "Use when ..." clause. Anthropic examples:
  "Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF
  files or when the user mentions PDFs, forms, or document extraction."
- Be a little "pushy" (skill-creator): "... even if they don't explicitly mention X". Claude tends
  to under-trigger on weaker models; Opus over-triggers if the description is topic-only.
- Add a boundary for near-misses that share keywords: "Not for X (use orbkin-Y)".
- **Do not summarize the workflow** in the description (superpowers: an agent followed the
  description's one-review summary instead of the body's two reviews). Our test with Opus did not
  reproduce skipping (§9.5), but a process summary also wastes listing budget and can drift from
  the body, so keep it out. [low for the effect, high for the rule]
- Length: aim 200–600 chars; hard max 1,024 (spec), 1,536 incl. `when_to_use` (Claude Code).
  Put the key use case first (truncation and budget dropping hit the end).
- Name: kebab-case, specific, consistent prefix (`orbkin-...`); gerunds are recommended by
  Anthropic (`processing-pdfs`) but noun phrases are acceptable; avoid `helper`, `utils`, `tools`.
  The name itself is a strong routing signal (§9.2).
- Resolution of the "what vs when" disagreement: Anthropic says "what it does and when to use it";
  superpowers says "only when". In our test both shapes scored 12/12 on Opus; "when-only" was
  more robust on Haiku (6/6 vs 4.5/6). Use **one short "what" clause made of output nouns + a
  "Use when" clause + an optional "Not for" clause**, and no process steps.

### 3.3 Body [high]

- **Order for persistence:** purpose and definition of done → standing rules (with the *why*) →
  workflow checklist with gates → commands → defaults/budgets → tells to refuse → gotchas →
  references table → report template. The top 5k tokens are what survives compaction.
- **Concise:** < 500 lines, < 5k tokens. "Every line is a recurring token cost."
- **Degrees of freedom matched to fragility:** high-freedom heuristics for judgment (art
  direction), exact commands for fragile steps (bake, export, capture). "Narrow bridge vs open
  field."
- **Defaults, not menus:** one recommended method + one escape hatch.
- **Explain why instead of ALL-CAPS MUSTs** (skill-creator, agentskills): "If you find yourself
  writing ALWAYS or NEVER in all caps, that's a yellow flag." Exception (superpowers, med):
  discipline rules that the agent skips under pressure benefit from explicit prohibitions,
  rationalization tables and red-flag lists; but for *output shape* problems, a positive recipe
  beats prohibitions, and "don't X unless Y" nuance clauses weaken rules.
- **Gotchas section** is often the highest-value content: environment facts that defy reasonable
  assumptions (Blender 5.x API renames, three r180 behaviour). Keep gotchas in SKILL.md (the agent
  may not know when to open a reference). Every correction you make → a new gotcha line.
- **Templates for outputs** (report, brief, findings JSON) are followed more reliably than prose.
- **Checklists** the agent copies and ticks for multi-step work; **validation loops**
  (do → validate script → fix → repeat); **plan-validate-execute** for batch/destructive work
  (structured plan file checked by a script against the source of truth).
- **Consistent terminology** (pick "kin" or "creature" and stick to it); no time-sensitive text
  (use an "old patterns" section).
- **Examples:** one excellent, runnable, real example beats several mediocre or multi-language ones.
- **Cross-skill references by name only** ("then use orbkin-visual-review"), never `@path`
  (force-loads) and never by deep relative paths that break on install.

### 3.4 Progressive disclosure [high + verified]

- Three levels: metadata (~100 tokens) → body (< 5k) → resources (unbounded; scripts cost only
  their output).
- Reference files **one level deep** from SKILL.md, each with a "read it when" trigger:
  "Read `references/bake.md` before Phase 5", not "see references/".
- Reference files > 100 lines start with a **Contents** list; split by domain/variant so only the
  relevant file is read (`references/creatures.md`, `references/kits.md`).
- **[verified]** In a toy test both Haiku (3/3) and Opus (2/2) followed a second-level link and
  read a 769-line file fully (fact at line 748). Claude Code's Read returns 2,000 lines by default,
  so the "partial read" risk applies mainly to files > ~1,500–2,000 lines, to `head`-style
  previews, and to implicit needs. Keep the rule anyway; it costs nothing.
- Make intent explicit: "Run `x.py`" (execute, don't read) vs "See `x.py` for the algorithm"
  (read). Anthropic's webapp-testing: "run scripts with --help first; do not read the source".

### 3.5 Scripts [high]

From agentskills.io "Using scripts" and Anthropic best practices:
- Non-interactive (no prompts), all input via flags/env/stdin; `--help` with usage and examples
  (the primary way the agent learns the interface).
- Helpful errors that say what was expected and what to try; distinct exit codes, documented.
- Structured output (JSON) on stdout, diagnostics on stderr; bounded output size (harnesses
  truncate ~10–30k chars), with `--output` for big data.
- Idempotent (agents retry), `--dry-run` for destructive steps, safe defaults.
- "Solve, don't punt": handle errors in the script; no voodoo constants (comment why each value).
- Pin versions for one-off tools (`npx pkg@x.y.z`); PEP 723 inline deps if using `uv`.
- In Claude Code, call bundled scripts via `${CLAUDE_SKILL_DIR}` (cwd is the project) and through
  their interpreter (`python3 ...`, `node ...`): some packagers strip the executable bit.
- Bundle a script whenever eval transcripts show every run re-writing the same helper.

---

## 4. Patterns that matter for graphics skills

These come from the strongest graphics/design skills found (sources in §8).

1. **Gated phases with rendered evidence** (blender-image-to-3d): brief → calibration →
   blockout → forms → topology → UV/bake → rig → export → round-trip → acceptance. "Every gate is
   passed with rendered evidence compared to the reference from the same camera and at gameplay
   pixel size, never by looking at the viewport and deciding it seems fine." Tolerances are
   numbers: blockout silhouette IoU ≥ 0.85, forms ≥ 0.90, proportions within 5% / 2%.
2. **Mismatches as measurements, not adjectives:** "head 12 percent too tall", "wheelbase 0.3 m
   short".
3. **Idempotent build scripts per phase** (`build/NN_phase.py` opens the master, deletes what it
   owns, rebuilds, saves; constants commented with the reference view they came from or
   `# inferred`). Reproducible, re-runnable, reviewable.
4. **Calibration anchors** (threejs-aaa-graphics-builder): three packaged screenshots that define
   scores 1, 2 and 2.5–3; "If a surface reads closer to scene-1 than scene-3, it is a 1–2 no
   matter how much code went into it." A 10-category 0–3 scorecard with thresholds (premium:
   every category ≥ 2, mean ≥ 2.3) and a list of **automatic failures** ("fog, darkness, bloom or
   particles standing in for missing authored geometry"; "hero asset is a primitive placeholder
   plus glow").
5. **Measured advisory metrics** from captures (colour entropy, dominant colour share, edge
   density, luminance contrast) with the explicit caveat "a low value needs an explanation, not a
   higher score; do not add noise to raise metrics".
6. **Generated-default tells** (Anthropic frontend-design): a calibration list of what AI output
   clusters around, so the model spends free axes elsewhere. For Orbkin the analogue is "primitive
   soup creatures, uniform noise textures, flat light, bloom on everything, empty floors,
   identical rocks" (also proposed in showcases.md).
7. **Plan → review plan against the brief → build → critique** (frontend-design): a compact token
   plan first (palette, type, layout ↔ for us: palette ramps, value structure, key/fill/rim,
   texel density, silhouette targets), revised if it reads like the generic default.
8. **Fresh eyes for visual QA** (Anthropic pptx): "After staring at the generating code you tend
   to see what you expect rather than what rendered, so look at the images fresh (a subagent
   works well)." And a bounded loop: "Your first render usually has a few real issues ... fix
   those, re-render only what changed, and stop." (Bounding matters: excessive verification is
   the top cause of skill cost regressions, §7.)
9. **Honest reporting:** what matches, measured deviations remaining, what was inferred,
   budgets used, exact files; "Do not describe the asset as matching the reference where a
   measurement says otherwise."
10. **Self-attestation fails:** a gate the model is told to "write PASSED" into is either faked or
    refused (§9.6). Gates must be script outputs (exit codes, JSON), or a separate judge's verdict.

---

## 5. Anti-patterns (with examples)

| Anti-pattern | Example | Why it hurts |
| --- | --- | --- |
| API-doc dump of known material | CloudAI-X `threejs-lighting` (477 lines: AmbientLight, HemisphereLight ... tables); claudedesignskills `blender-web-pipeline` ("Why glTF for Web: industry standard ...", 610-line body) | spends context on what the model knows; SkillsBench: exhaustive docs give diminishing or negative returns |
| Body > 500 lines / > 5k tokens | claudedesignskills: 460–1,229-line bodies | truncated after compaction; dilutes attention |
| Version-mismatched recipes | game-creator pins three r183 patterns; our game is r180 | SWE-Skills-Bench: version-mismatched guidance cost up to -10% |
| Paid-API dependencies as the "preferred" path | game-creator `game-3d-assets` (Meshy preferred, asks for keys), retrodiffusion, worldlabs | violates our free-only constraint; adds stalls |
| Persona + generic exhortations | "You are an expert ...", "Take your time ... Quality is more important than speed" (game-creator) | no information; models already try |
| Over-engineered state machines | img2threejs `forge/next.py` hard-stop gate + LAB-FINDINGS on harness defects | huge maintenance surface; the authors' own lab notes found silent-success bugs |
| Self-attested gates | "write GATE.txt with PASSED" | faked or refused (§9.6) |
| Topic-only description | "Blender, bpy, glTF and 3D modelling knowledge" | false trigger on a GLB loader bug (§9.2) |
| Vague description | "Blender helper for 3D models." | 0/6 triggers on Haiku (§9.2) |
| Deep reference chains / no TOC | many community repos (lint warnings in §9.7) | partial reads, missed facts |
| Hard-coded absolute paths | scripts referenced as `scripts/x.py` while cwd is the project | "file not found"; use `${CLAUDE_SKILL_DIR}` |

---

## 6. Testing and evals

Two separate questions (Claude Code docs): **does Claude invoke the skill on the prompts it
should**, and **is the output better when it does**. Both need a baseline (same prompt without
the skill, or the previous skill version) run in a **fresh session**: leftover authoring context
masks gaps in the written instructions.

### 6.1 Trigger evals

- Set: ~20 realistic queries, 8–10 should-trigger (varied phrasing, casual/typos, some never name
  the domain), 8–10 should-not that are **near-misses** sharing keywords. Run each 3× (non-
  deterministic), trigger rate ≥ 0.5 = triggered. Split 60/40 train/validation when optimizing
  and pick by validation score. (agentskills "Optimizing descriptions"; skill-creator.)
- Tools:
  - **skill-creator** `scripts/run_eval.py` / `run_loop.py` (uses `claude -p ... --output-format
    stream-json --include-partial-messages`, detects the first `Skill`/`Read` tool call; writes a
    temporary **`.claude/commands/<name>-skill-<id>.md`** in the nearest dir with `.claude/`, so run
    it in a scratch copy, not inside the game repo). `run_loop.py` proposes new descriptions with
    `claude -p` and keeps the best by held-out score. Works here: `claude -p` is authenticated.
  - Our minimal harnesses: `research/skills-exp/trigger_eval.py` (one skill, N variants) and
    `route_eval.py` (several sibling skills, which one fires). Uses `--max-turns 1`, so each probe
    is one turn: ~$0.0045 (Haiku), ~$0.011 and ~2 s (Opus) list-price estimate.
  - `claude plugin eval` (v2.1.269+): `evals/<case>/prompt.md` + `graders/*.md`; grader
    `type: tool_used, tool: Skill, input_match: '"skill"\s*:\s*"(?:[\w-]+:)?NAME"'`. Needs a plugin
    or `@skills-dir` plugin. Runs both arms (with / without plugin) and reports Δ.
- Also run a **routing** set across sibling skills (§9.3) whenever a skill is added.

### 6.2 Output-quality evals

- skill-creator workflow (works with subagents in Claude Code): `evals/evals.json`
  (`prompt`, `expected_output`, `files`, `expectations`); for each eval spawn **with-skill and
  without-skill subagents in the same turn**; record `total_tokens` / `duration_ms` from the task
  notification into `timing.json` (not persisted elsewhere); grade with `agents/grader.md` into
  `grading.json` (`text`, `passed`, `evidence`); aggregate with `scripts/aggregate_benchmark.py`;
  show `eval-viewer/generate_review.py --static out.html` (no display here); collect
  `feedback.json`; iterate in `iteration-N/` dirs. Blind A/B with `agents/comparator.md` and
  `agents/analyzer.md`.
- Assertions: objectively checkable ("check.py exited 0", "after-capture PNG exists", "no file in
  src/engine changed"); script them when possible. Remove assertions that pass in both arms
  (non-discriminating); investigate ones failing in both. Grader rule: no benefit of the doubt.
- Subjective quality (art!) → human review + blind comparison, not forced assertions.
- `claude plugin eval` graders: `regex`, `tool_used`, `tool_order`, `file_exists` (free), `llm`
  (2-of-3 judge votes) and `baseline`; an `llm` grader with `focus: {source: file, path: x.png}`
  **sees PNG/JPEG/WebP as an image**, so screenshots can be judged. No custom-code graders.
  Caveat **[verified]**: runs that grant Bash need Claude Code's OS sandbox (`bubblewrap` +
  `socat` on Linux), which are **not installed** in this container, so Bash-granting cases would be
  refused here. Read-only cases work.
- Read transcripts, not only outputs: wasted steps mean vague or inapplicable instructions or too
  many options; every-run-rewrites-the-same-helper means bundle a script.
- Iterate: generalize from feedback (no overfitting to the 3 prompts), keep the prompt lean,
  explain the why, test on the models you will use (Haiku needs more guidance; Opus needs less
  explanation).

### 6.3 Graphics-specific eval design

- **Deterministic capture**: fixed seed, scene, camera, time, viewport set (desktop + phone),
  `?seed=`, `?scene=`, `__game.setFast()`; same capture before and after.
- **Metrics are necessary, not sufficient**: `template/orbkin-example-skill/scripts/check.py`
  on `docs/screenshots/hd2d/kit-cave-tiers-viewports.jpg` vs the reference gave entropy 6.22 vs
  6.42 bits, edge density 0.560 vs 0.561, dominant colour 0.138 vs 0.137 — near-identical — while
  judges score our look ~6/10. One metric did separate them: **near-black share 0.4% vs 16%**
  (the reference uses deep shadow masses). Use metrics to catch gross failures (flat, empty,
  crushed, washed out) and as numbers in reports; use calibrated visual judging for quality.
- **Judging**: a separate `visual-judge` subagent (fresh context, preloaded review skill,
  anchors, JSON output), blind A/B between baseline and candidate, 3 votes, plus the owner's
  review of a side-by-side sheet. Report "not better" honestly.

---

## 7. Research evidence: do skills help? [med]

- **SkillsBench** (arXiv 2602.12670, non-peer-reviewed): 84–86 tasks, 11 domains, 7 model/agent
  configs, 7,308 trajectories. Curated skills +16.2 pp (33.9% → ~50.5%); range +4.5 pp (software
  engineering) to +51.9 pp (healthcare); 16 of 84 tasks got worse. **Self-generated skills: no
  benefit** (reported −1.3 pp). Focused skills with **2–3 modules** best (+18.6 pp); 4+ skills or
  exhaustive documentation → diminishing or negative returns. Smaller models with skills can
  match larger models without.
- **SWE-Skills-Bench** (arXiv 2603.15401): 49 public SWE skills; 39 gave no gain, mean ≈ +1.2%;
  token overhead from savings to +451%; 7 specialized skills up to +30%; 3 hurt up to −10% due to
  **version-mismatched guidance** conflicting with project context.
- **Agent Skills Can Be Harmful** (arXiv 2608.11888, HUST + Microsoft Research): 307
  skill-induced cases (125 functional failures, 182 efficiency regressions); failures come mostly
  from **seemingly relevant** skills (task-implementation faults 86/125); cost regressions mostly
  from **"Excessive Procedure"** (114/182), excessive verification alone 67. Recommends treating
  skill loading as a costed, validated decision with paired correctness/cost evaluation.
- O'Reilly Radar (May 2026) synthesis: as libraries grow, similar descriptions collide; organise
  skills hierarchically rather than as a flat list.

Implications: write skills from *our* verified experience (not model-generated generic advice),
keep them focused, pin versions (three r180, Blender 5.2.2), bound verification loops, and
measure with/without on our own tasks before trusting a skill.

---

## 8. Community skills reviewed

| Skill / repo | Shape | What works | What does not | Verdict |
| --- | --- | --- | --- | --- |
| **majidmanzarpour/blender-game-skills** `blender-image-to-3d` | 326-line SKILL.md, 4 references, 8 bpy scripts, `assets/build_template.py`, `evals/evals.json` (4 realistic prompts with expected outputs) | gated phases, numeric tolerances, compare sheets + IoU, idempotent phase scripts, `--help` on every script, Blender 5.x notes, honest report order | ~5.4k-token body (above the compaction keep), references lack contents lists, description 747 chars | **Model to copy** for our Blender skill structure |
| **majidmanzarpour/threejs-game-skills** (9 skills, director + specialists) | short SKILL.md (22–116 lines) + "read it when" reference tables + scripts + calibration JPGs | scorecard with anchors, automatic failures, measured canvas metrics, director routing, workflow-evaluations.md for maintainers | external generation (paid keys) is in scope when keys exist (we skip that), director adds a routing hop | **Copy** the scorecard/anchor/report pattern |
| **anthropics/skills** `frontend-design` | 67 lines, no files | generated-default tells calibration list, plan→review→build→critique, restraint | — | **Copy** the "tells" + two-pass pattern for art direction |
| anthropics/skills `pptx`, `pdf`, `webapp-testing` | short body + scripts + validators | validator scripts that name the fix, fresh-eyes visual QA, bounded QA loop, "--help first, don't read source" | — | patterns to copy |
| anthropics/skills `skill-creator` (also local `/mnt/skills/examples/skill-creator`, plugin `claude-plugins-official`) | 485 lines + agents/ + scripts/ + eval viewer | the full eval loop and description optimizer | body is long (meta-skill) | **Use it** to build ours |
| obra/superpowers `writing-skills` | 681 lines + testing-skills-with-subagents.md | TDD for skills (watch the baseline fail first), "match the form to the failure", micro-tests with a no-guidance control, 5+ reps, variance as a metric | long; discipline-skill focus | adopt the RED→GREEN idea |
| **OpusGameLabs/game-creator** (30 skills) | 70–640-line bodies, metadata/tags, `argument-hint` | threejs-perf: measured before/after numbers and methodology; bundles three.js `llms.txt` (5 KB) and `llms-full.txt` (128 KB) as references | persona boilerplate, paid APIs preferred, r183 pins, JS-only templates | mine for perf evidence only |
| freshtechbro/claudedesignskills (22 skills) | 460–1,229-line bodies + references + scripts | broad library coverage | generic API documentation of known material, over 500 lines | **avoid** this style |
| CloudAI-X/threejs-skills (10) | 480–650-line API references | correct snippets | restates the three.js manual | avoid |
| img2threejs | router SKILL.md + `forge/next.py` state gate + grimoire | "read the named file at the moment you reach that stage" | very heavy machinery; lab notes document harness defects | ideas only |

---

## 9. Experiments run here (all in `research/skills-exp/`)

All runs used `claude -p` (v2.1.296) nested from this session (`env -u CLAUDECODE`), in throwaway
git repos under `research/skills-exp/proj*`, with stub skills. Cost estimates are list-price
figures reported by the CLI.

### 9.1 Harness check
`claude -p "Reply with just the word OK." --model haiku --output-format json` → works, $0.004.
The `init` event lists every skill visible to the session (~90 here).

### 9.2 Description variants (single skill `orbkin-3d-asset`, 6 should + 6 near-miss queries)
`python3 trigger_eval.py PROJ orbkin-3d-asset queries.json variants.json MODEL RUNS OUT.json`

| Variant | Description | Haiku (2 runs) | Opus (1 run) |
| --- | --- | --- | --- |
| A vague | "Blender helper for 3D models." | 0/6 trigger, 0/6 false | 5/6 trigger |
| B what+when | "Builds game-ready stylized 3D assets ... with headless Blender (bpy) and exports them as GLB. Use when the user wants a creature, character, prop or environment piece modelled, textured, baked, rigged or exported ..., or asks to replace hand-coded primitive geometry with real models, even if Blender is not named." | 4.5/6, 0/6 false | 6/6, 0/6 false |
| C when-only | "Use when the user wants a creature, character, prop or environment piece for the Orbkin game modelled, textured, baked, rigged or exported, or asks to replace hand-coded primitive geometry with real models." | **6/6, 0/6 false** | 6/6, 0/6 false |
| D topic-only | "Blender, bpy, glTF and 3D modelling knowledge for the game." | — | 6/6 trigger, **false trigger on "vite throws 'Unexpected token' when GLTFLoader loads models/foo.glb"** |

Queries (positives): "the Mossling creature ... still looks like a pile of spheres ...", "low-poly
treasure chest prop ... exported so three.js can load it", "bake a normal map and AO for the
boulder kit ...", "rigged Vulcrag ... idle animation ... glb", "our trainers are made of boxes.
sculpt something nicer ... under 5k tris", "lantern and a wooden fence set ... real meshes not code
primitives". Near-misses: bloom threshold, new species in `src/data`, GLTFLoader error, pixel-art
HP bar, playwright before/after screenshots, draw-call reduction.
Takeaways: description quality decides weaker models; on Opus the name carries a lot and
topic-only wording creates false triggers on near-misses. [verified, small n]

### 9.3 Routing between four sibling skills (Opus, 1 run)
`python3 route_eval.py PROJ2 skills_sib.json cases_sib.json opus 1` → **10/10**:
blender-asset (2/2), render-look (2/2), visual-review (2/2), pixel-textures (2/2), and two
non-graphics tasks (new move in `src/data/moves`, battle AI investigation) invoked no skill.
Descriptions used are in §11.3.

Second run with `orbkin-art-direction` added (5 siblings, `skills_sib5.json`, `cases_sib5.json`,
Opus, 2 runs): **26/26**. The three broad requests ("the cave arena looks cheap next to the
reference, make it look professional", "plan the desert route's art", "the whole game still reads
as programmer art, what should we change first?") went to art-direction; the specific ones still
went to the specialists ("looks flat and washed out, make the lighting more dramatic" →
render-look). A router skill with a "Not for a single ... fix (use ...)" clause did not steal
specialist requests.

### 9.4 Progressive disclosure probe
`orbkin-glb-export` → `references/export.md` → `references/naming.md`. Question needing both facts:
Haiku 3/3 and Opus 2/2 read both files and answered correctly, also when `naming.md` was 769
lines with the fact at line 748 (Read returns up to 2,000 lines). [verified, toy]

### 9.5 Workflow summary in description vs body-only step
Skill body requires `plan.txt` → `GATE.txt` → `sheet.txt`; variant W's description summarises the
workflow without the gate. Opus (2+2 runs): all invoked the skill and wrote all three files in
both variants (no skipping). Haiku (3+3): wrote only `plan.txt` in both variants (see 9.6).
The superpowers claim was not reproduced on Opus. [low]

### 9.6 Self-attested gate refused
Haiku's reply: "I did not write GATE.txt or sheet.txt. No silhouette check ran ... so writing
'PASSED-SILHOUETTE' ... would report a gate and a build that never happened." Design rule: gates
are produced by scripts that measure, or by a judge; never ask the model to declare a pass.

### 9.7 Validators
- skill-creator `quick_validate.py`: rejects any key outside {name, description, license,
  allowed-tools, metadata, compatibility} (`argument-hint` failed), names not kebab-case or > 64,
  descriptions > 1,024 or containing `< >`, nested `SKILL.md` files.
- `claude plugin validate <dir>` (+ `--strict`): validates Claude Code semantics; passed the same
  skill; strict mode flags symlinks (game-creator).
- Our `lint_skill.py` (house rules): run on six reference skills. Warnings found: blender-image-
  to-3d body ~5.4k tokens and references without contents; blender-web-pipeline 610-line body;
  pdf `reference.md` 612 lines without contents and a script without `--help`; frontend-design's
  description has no "Use when" clause (it is a mostly user-invoked taste skill).

### 9.8 Mechanics probes
`$ARGUMENTS`, `${CLAUDE_SKILL_DIR}`, `` !`cmd` `` injection, `allowed-tools` pre-approval, cwd =
project root (§1.3); nested dir discovery after first file read; `paths:` gating (§1.1).

### 9.9 Metrics vs reference (`template/.../scripts/check.py`)
Current HD-2D cave capture vs reference: entropy 6.22/6.42, edges 0.560/0.561, dominant
0.138/0.137, contrast 225/249, near-black 0.004/0.160; `desktop-04-battle.png` (default renderer):
entropy 4.66, edges 0.302, contrast 142, mean luminance 179 (bright, flat). (§6.3.)

---

## 10. The template and the rules checklist

Files: `research/skills-exp/template/`

```
template/
├── orbkin-example-skill/
│   ├── SKILL.md                  # skeleton in the recommended section order (≈95 lines)
│   ├── references/EXAMPLE-recipes.md   # contents list + verified-parameters table
│   ├── scripts/check.py          # agent-friendly CLI: --help, JSON stdout, exit 0/1/2, image metrics
│   ├── assets/anchors/           # calibration images for scores 1/2/3 go here
│   └── evals/
│       ├── evals.json            # skill-creator format with expectations
│       └── triggers.json         # should / should-not (near-miss) trigger queries
└── agents/visual-judge.md        # fresh-eyes judge subagent, preloads orbkin-visual-review
```

Tools: `research/skills-exp/lint_skill.py` (house-rule linter), `trigger_eval.py`,
`route_eval.py`, `skillstats.py`.

### 10.1 SKILL.md skeleton (section order is deliberate)

```markdown
---
name: orbkin-<area>
description: <Output nouns> for the Orbkin creature game (Three.js r180, headless Blender 5.2).
  Use when the user wants <intent 1>, <intent 2>, or complains that <symptom>, even if <tool> is
  not named. Not for <adjacent job> (use orbkin-<sibling>).
---
# Orbkin <area>
<Purpose + definition of done, 2-4 sentences.>
## Standing rules (apply for the whole task)      <- survive compaction; each with its why
## Workflow                                        <- copyable checklist; gates = script exit codes
## Scripts                                         <- table; ${CLAUDE_SKILL_DIR}/scripts/x.py; "--help first"
## Defaults and budgets                            <- one default per decision, with why
## Generated-look tells to refuse                  <- calibration list
## Gotchas                                         <- env/version facts that defy assumptions
## References (read only when the trigger applies) <- file | read it when
## Report                                          <- fixed template
```
(Placeholders in angle brackets are for this note only: the real description must not contain
`<` or `>`.)

### 10.2 Rules checklist (use before committing a skill)

Triggering
- [ ] `name` kebab-case, `orbkin-` prefix, equals folder name, ≤ 64 chars.
- [ ] Description 200–600 chars (≤ 1,024), third person, output nouns + "Use when" intents +
      symptoms in users' words + "even if X is not named" + "Not for ... (use orbkin-Y)"; no
      workflow steps; quoted or block-scalar YAML; no `< >`.
- [ ] Trigger eval: 20 queries (≥ 8 near-misses), 3 runs, Opus; ≥ 90% pass on held-out; routing
      set across all orbkin skills still 100%.
Body
- [ ] < 500 lines, < 5k tokens; standing rules and gates in the first screen.
- [ ] Only what Claude lacks: project facts, tested parameters, gotchas, scripts, budgets.
- [ ] One default per decision; why given for every rule; no ALL-CAPS unless a discipline rule
      failed in testing.
- [ ] Versions pinned in text (three r180, Blender 5.2.2) and in "verified on" columns.
- [ ] Every gate = a script exit code or a judge verdict; loops bounded ("stop after two rounds
      without improvement and report").
- [ ] Report template present; requires listing what is still weak and what was inferred.
Files
- [ ] References one level deep, each with a "read it when" trigger; > 100 lines → contents list;
      < 1,500 lines each.
- [ ] Scripts: `--help`, JSON stdout, stderr diagnostics, exit codes, idempotent, no prompts,
      called via `${CLAUDE_SKILL_DIR}` and an interpreter; no absolute paths.
- [ ] Only portable frontmatter unless a Claude Code feature is needed (then document why).
Evidence
- [ ] Baseline (no skill) run recorded before writing; with-skill beats it on the evals.
- [ ] `lint_skill.py` clean (or warnings explained); `claude plugin validate .claude/skills` passes.

---

## 11. Implications for Orbkin

### 11.1 Where and how to install
- Put the skills in **`/home/user/gravity-innovation/.claude/skills/orbkin-*/`** (repo root), not
  `game/.claude/skills/`: sessions start at the repo root and nested skills stay invisible until
  Claude reads a file under `game/` (verified), so "make the Mossling look like a real creature"
  as a first message would not trigger them. Same for agents: `/home/user/gravity-innovation/
  .claude/agents/visual-judge.md`.
- Plain project skills (no plugin manifest) avoid the workspace-trust and primary-directory
  restrictions of skills-dir plugins, which matter in cloud sessions. Package as a plugin later
  only if we want `claude plugin eval` with its Δ baseline.
- Avoid `paths:` on workflow skills (it hides them until a matching file is touched). It suits a
  pure conventions skill (e.g. HD-2D module API) that should auto-attach while editing
  `game/src/render/hd2d/**`.
- Keep our descriptions ≤ ~400 chars: the session already lists ~90 skills (~28.6k description
  chars) from plugins; new skills are "least invoked" and lose their descriptions first if the
  listing ever overflows. Consider disabling irrelevant plugins (marketing, operations, adobe) in
  `.claude/settings.json` `enabledPlugins` for this repo to reduce collisions and budget.

### 11.2 Proposed skill set and boundaries
Aligned with the proposals in `blender-llm.md` §9, `showcases.md` §6 and `threejs-render.md` §11,
but merged to keep each task at 1–2 skills (SkillsBench: 2–3 focused modules is the sweet spot).

| Skill | Owns | Key bundled files |
| --- | --- | --- |
| `orbkin-art-direction` | the look bible for HD-2D Orbkin: target numbers (texel density, camera, value structure, palette ramps), generated-look tells, plan→review→build→critique; entry point for broad "make it look better / like the reference" requests; hands building to the specialists by name | `references/look-bible.md`, `assets/anchors/score-1/2/3.png` (our own captures, never the fan-art reference), `references/tells.md` |
| `orbkin-blender-asset` | headless Blender 5.2 bpy: creature/trainer/prop/kit modelling (SDF/remesh fusion, bevels), bakes, toon/outline sprite bakes, GLB export + gltf-transform packing, loading in three r180; budgets; gates | `scripts/` (kit.py, review_render.py, compose_review.py, validate.py, export.py, roundtrip.py), `assets/build_template.py`, `references/blender-5-notes.md`, `references/creatures.md`, `references/export-and-load.md` |
| `orbkin-render-look` | Three.js r180 lighting, shadows, tone mapping, grade/LUT, bloom, AO, outlines, toon ramps, pixel grid, shaders; the HD-2D pipeline API | `references/decisions.md`, `references/recipes/*.md`, `references/gotchas.md` |
| `orbkin-pixel-textures` | palette ramps, clusters/seams, dithering, texel density, mips, tileability proof sheets | `scripts/tile_proof.py`, `references/painters.md` |
| `orbkin-visual-review` | deterministic captures (desktop+phone), side-by-side sheets vs baseline and reference, `check.py` metrics, the 10-category rubric with anchors, findings JSON; never edits | `scripts/capture.mjs`, `scripts/sheet.py`, `scripts/check.py`, `references/rubric.md`, `assets/anchors/` |
| agent `visual-judge` | fresh-eyes scoring with `skills: [orbkin-visual-review]`, `model: opus`, read-only tools | `.claude/agents/visual-judge.md` |

Creature design (silhouette, shape language, originality check) lives in
`orbkin-blender-asset/references/creatures.md` and the art-direction look bible until it grows
enough to deserve its own skill; adding it now would collide with "add a species to src/data".

### 11.3 Descriptions (tested in §9.3; extend with "Not for" clauses)
- `orbkin-blender-asset`: "Use when a creature, trainer, prop or environment piece for Orbkin needs
  to be modelled, sculpted, textured, baked, rigged or animated in headless Blender (bpy) and
  exported as GLB, or when hand-coded primitive geometry should be replaced by a real model."
- `orbkin-render-look`: "Use when changing how Orbkin scenes are lit or post-processed in Three.js:
  lights and shadows, tone mapping, colour grade, bloom, fog, god rays, outlines, shaders or the
  HD-2D pipeline settings for an arena or screen."
- `orbkin-visual-review`: "Use when Orbkin graphics need to be judged: capturing gameplay
  screenshots, comparing against the reference or a previous build, scoring art quality with the
  visual rubric, or deciding whether a graphics change is actually better."
- `orbkin-pixel-textures`: "Use when painting or fixing Orbkin surface textures: pixel-art tiles,
  colour ramps, dithering, texel density, palettes, mip chains or texture atlases for rock,
  ground, wood, foliage or water."
- `orbkin-art-direction` (tested in the 5-sibling run, 6/6): "Sets and enforces the Orbkin HD-2D
  look. Use when the user says a scene, creature or screen looks basic, flat, cheap or unlike the
  reference, asks for a more professional or premium look, or wants an art plan before building.
  Not for a single lighting, texture or model fix (use orbkin-render-look, orbkin-pixel-textures
  or orbkin-blender-asset)."

### 11.4 How to build each skill (process)
1. **RED:** run 2–3 realistic tasks with no skill in a scratch worktree; save transcripts and
   captures; list the concrete failures (this is the skill's reason to exist).
2. Draft from verified material only: the sibling research notes, `docs/HD2D.md`,
   `docs/DECISIONS.md`, judge feedback, scripts already proven in `research/*/scripts`.
3. Bundle the scripts the RED runs kept re-writing (capture, sheet, metrics, bake, export).
4. **GREEN:** with/without subagent runs via skill-creator, assertions scripted, `visual-judge`
   blind A/B, owner review through `generate_review.py --static`.
5. Trigger + routing evals (20 queries each, Opus, 3 runs, ~$0.70 per skill).
6. **REFACTOR:** every correction → a gotcha line; delete lines no run needed; re-run.
7. Re-run the suite on model upgrades and on three/Blender version bumps.

### 11.5 What stays outside skills
- Always-true project rules stay in `game/CLAUDE.md` (draw calls < 100, engine purity, original
  names); skills reference them, do not duplicate.
- Must-hold checks (`npm run verify`, budget checks) belong in scripts/hooks, not prose. If agents
  keep skipping captures after render edits, add a skill-scoped `PostToolUse` hook.
- The fan-art reference is a quality bar only: anchors must be our own captures or original
  renders; skills must say "never copy shapes, palettes or names from existing franchises".

---

## 12. Open questions
- Exact unit of the listing budget (chars vs tokens) and Opus 5.5's context size in this
  environment; `/doctor` was not run interactively.
- Whether `claude plugin eval` can grade screenshots end to end here once `bubblewrap`/`socat` are
  installed (apt availability untested).
- Larger-n confirmation of §9.2/§9.5 (3 runs × 20 queries, plus Sonnet) before relying on the
  Haiku "when-only" advantage.
- Routing works with an `orbkin-art-direction` entry skill (§9.3), but whether it improves
  *outcomes* (versus just adding a hop before the specialist) needs an output eval.
- How well an Opus `visual-judge` agrees with human judges on our captures (calibrate against the
  previous ~6/10 judgements before trusting it as a gate).

---

## 13. Sources

Official and spec
- Claude Code skills: <https://code.claude.com/docs/en/skills>
- Plugin evals: <https://code.claude.com/docs/en/plugin-evals>
- Plugin loading (skills-dir plugins, trust): <https://code.claude.com/docs/en/plugins/loading>
- Subagents (`skills:` preload): <https://code.claude.com/docs/en/sub-agents>
- Hooks in skills: <https://code.claude.com/docs/en/hooks>
- Skill authoring best practices: <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>
- Anthropic engineering, "Equipping agents for the real world with Agent Skills":
  <https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>
- Agent Skills spec and guides (cloned): <https://github.com/agentskills/agentskills>
  (`docs/specification.mdx`, `skill-creation/best-practices.mdx`, `using-scripts.mdx`,
  `evaluating-skills.mdx`, `optimizing-descriptions.mdx`, `client-implementation/adding-skills-support.mdx`);
  site <https://agentskills.io/specification> (not reachable from here)
- anthropics/skills: <https://github.com/anthropics/skills> (skill-creator, frontend-design, pptx,
  pdf, webapp-testing); local copy `/mnt/skills/examples/skill-creator`
- skill-creator plugin: <https://github.com/anthropics/claude-plugins-official/tree/main/plugins/skill-creator>

Community
- <https://github.com/majidmanzarpour/blender-game-skills>
- <https://github.com/majidmanzarpour/threejs-game-skills>
- <https://github.com/OpusGameLabs/game-creator>
- <https://github.com/freshtechbro/claudedesignskills>
- <https://github.com/CloudAI-X/threejs-skills>
- <https://github.com/img2threejs/img2threejs>
- <https://github.com/obra/superpowers> (`skills/writing-skills`)
- Simon Willison, "Claude Skills are awesome, maybe a bigger deal than MCP" (2025-10-16):
  <https://simonw.substack.com/p/claude-skills-are-awesome-maybe-a>

Research (read via abstracts/summaries; arXiv not reachable from here)
- SkillsBench: <https://arxiv.org/abs/2602.12670>
- SWE-Skills-Bench: <https://arxiv.org/pdf/2603.15401>
- Agent Skills Can Be Harmful: <https://arxiv.org/pdf/2608.11888>
- O'Reilly Radar, "Agent Skills Work but the Research Shows Most Teams Are Building Them Wrong":
  <https://www.oreilly.com/radar/agent-skills-work-but-the-research-shows-most-teams-are-building-them-wrong/>
