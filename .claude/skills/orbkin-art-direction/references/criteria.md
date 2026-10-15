# Criteria triage (step S-1): turn the task's success criteria into measurable rows before any work

The volcanic pilot was handed "dL* > 0", "dark share ≈ 0.45", "programs per scene unchanged" and "a `better`
verdict" (unsealed) and chased them for two gate rounds. Two were unreachable, one contradicted the
evidence, one was not measurable. Do this table in the FIRST turn, report the conflicts to the owner, and
only then start S0. Copy it into the report as `## Criteria triage`.

```
| # | Criterion as written | Class | Measurable form (script, key, view) | Target / note |
|---|---|---|---|---|
| 1 | ... | measurable | critique.py --arena <a>: bstar_lights_excl_emitter, desk + phone | <= 28 (range, critique context) |
| 2 | ... | n/a | not exposed by the harness: write "n/a" and say why | ask the owner for the counter |
| 3 | ... | conflicts-with-evidence | look-bible §evidence row ... | propose the replacement criterion |
| 4 | ... | unsealed-unreachable | `better` needs a sealed judge; this container is unsealed | "no `worse`, floors pass, queued" |
```

Classes: **measurable** (a script key, a view, a comparison rule) · **n/a** (nothing measures it here) ·
**conflicts-with-evidence** (an A/B in look-bible §evidence says the opposite; name the row) ·
**unsealed-unreachable** (`better`/acceptance in an unsealed container) · **owner-taste** (density, DoF
strength, UI skin, grade strength, outline weight, palette: queue for the owner batch, never claim).

## The usual criteria and their measurable forms

| Criterion as usually written | Measurable form |
|---|---|
| "lit b* / chroma / cool in range" for an emitter-lit arena | `critique.py --arena <a>`: `bstar_lights_excl_emitter`, `chroma_p95_excl_emitter`, `cool_share_excl_emitter` (lit pixels OUTSIDE the emitter's far ring); the emitter pool keeps its warmth by design |
| "dark share ≈ 0.45" | **replace with** "within 0.35-0.70, arena mood decides"; moved by light sources and dressing (a lit lip, apron matter, a source in frame), never by lift or gamma (pilot J lifted blacks 0.59 -> 0.47 and the terraces lost their mass, "flattened") |
| "kin lighter than its ground", "dL* > 0" | **never a criterion** (standing rule 2; Octopath sprites -6..-32 dL*; H reached +2.6 and lost 0/4 twice); use `focal_edge_ratio` 1.8-9.5, a key-side rim visible on the 2x crop, `focal_warmth_coupling` within ±12, `craft_check.py` PASS |
| "warm falloff kept", "the lava still lights the floor" | `critique.py --arena <a>` on both frames: `falloff.near_bstar` ≥ 0.75x and `gradient_L` ≥ 0.8x the accepted frame, per view; `verdict_risk.py --arena <a>` exits 3 (UNPROVEN) when either side lacks them |
| "no craft regression", "1-texel outline / highlight band", "ember cracks kept" | `craft_check.py --before BASE --after CAND --id <id> [--change grade]` PASS on desk and phone, plus the 2x crops opened with Read |
| "staging diff = 0" for a grade/light change | layout boxes identical (`capture.json`, both views; ≤ 2 px = harness rounding) and `calls`/`triangles` ±0; pixels inside the boxes change by design |
| "programs per scene unchanged" | **n/a**: `renderInfo` exposes calls and triangles only; ask the owner for `gl.info.programs.length` in `src/debug/hooks.ts` |
| "≤ 3 shafts beside the kin" | count `BeamSpec` entries in `arenas/<arena>.ts`; "beside" = each beam's x-range vs the layout boxes, located on the capture by hand |
| "better" / "accepted" in this container | **unsealed-unreachable**: write "floors pass, no `worse` on desk or phone, queued for the owner batch"; a `better` here is pilot evidence only |
| "same floor code in both rounds" | gate skill hash + dirty flag recorded at each round (`git log -1 --format=%h -- .claude/skills/orbkin-visual-gate`, `git status --short` on it) |
| "phone fixed too" | the phone has its own row for every metric above and its own plan (rule 8); a desk grade applied to the portrait is not a phone plan |
| "no regression on the frame" | `verdict_risk.py BEFORE AFTER --arena <a> --change <kind>` exit 0 on both views; exit 1 = a punishment signature fired (fix or argue), exit 3 = unproven (measure first) |
