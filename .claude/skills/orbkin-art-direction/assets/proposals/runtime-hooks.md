# Proposal (owner-reviewed game change): runtime hooks for a seconds-long sprite-light / grade loop

**Status: proposed, not applied.** This skill never edits `game/src`; the owner decides.

## The problem
A SpriteLight or light-rig change can only be seen through a full frozen-clock capture: build 10-60 s, desk
shot 2-7 min, phone 1-2 min on the shared SwiftShader box (measured 2026-10-15: desk 114 s + self-check,
phone 51 s, at load 15-18). The pilot spent ~10 such captures bracketing one grade. The grade half is solved
offline (`grade_preview.py`, 1 s per variant, round-trip error p99 3.3/255), but `SpriteLight`, the key
`SpotLight`, the hemisphere and the fill live before the tone map and cannot be previewed from a PNG.

`game/src/debug/hooks.ts` exposes `layout()`, `renderInfo()`, `perf()`, `goto()`, `debugSetParty()` but no
way to change a light or a grade in a running page, and `Hd2dPipeline.regrade()` is not reachable from
`window.__game`.

## The proposal (about 40 lines, no new dependency)
Add to `GameHooks` (behind the existing debug build flag, same as `debugSetParty`):

```ts
/** Debug: patch the live arena's SpriteLight (partial; colours as hex or [r,g,b]) and re-bake sprites. */
setSpriteLight(patch: Partial<Record<keyof SpriteLight, unknown>>): void;
/** Debug: patch the live Grade (partial, same field names as arenas/<a>.ts) and call pipeline.regrade(). */
setGrade(patch: Partial<Grade>): void;
/** Debug: patch the key SpotLight / HemisphereLight / fill by name: {key: {color, intensity}, hemi: {...}} */
setLights(patch: Record<'key' | 'hemi' | 'top', { color?: string; intensity?: number }>): void;
```

Then a harness script (`sprite_sweep.mjs`, this skill) loads ONE battle under the frozen clock, and for each
variant calls the hook, advances a few frames and screenshots: ~2-4 s per variant instead of 2-7 min, same
absolute frame, same layout boxes, so `craft_check.py` and `critique.py --arena` run on every variant and
`verdict_risk.py` predicts each one before a single real capture. The real gate still runs on a normal
capture of the chosen variant (the hook path must never be the judged artefact).

## Safety / review notes
- Debug-only, no network, no new package; the hooks exist only when the current debug hooks exist.
- `setSpriteLight` must re-bake through the existing bake path (`SpriteSet.bake`), not a shortcut.
- The frozen clock, the seeded dressing rng and the layout must be untouched by the hooks (rule 9).
- An e2e test: patch, screenshot, revert, screenshot: the revert frame is pixel-identical to the original.

## Until it lands
- Grade work: `grade_preview.py` (offline), then one capture.
- SpriteLight work: one capture per variant, phone first (51 s vs 114 s), `--self-check none` while
  bracketing and `first` on the capture that goes to the gate; at most 3 variants per round.
