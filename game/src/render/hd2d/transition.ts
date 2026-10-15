// HD-2D battle-in transition, drawn in the grade pass at the internal resolution (so every edge
// is a whole internal pixel). One shared state, read by EVERY Hd2dPipeline's grade pass each
// frame: the cover starts on the route map's pipeline and the reveal ends on the battle's.
//
//   overworld: 2 grey pulses (12 frames each, 2 per second, 40% mid grey: WCAG 2.3.1-safe)
//   cover:     a terrain × threat wipe, 30 frames in 10 whole steps
//   reveal:    an iris opening on the foe (30 frames, 10 steps) during the battle's intro pan
// (graphics research note camera-transitions-motion.md §6; timings from pokeemerald.)
import * as THREE from 'three';
import { tween, wait } from '../anim';

/** Wipe shapes (grade-shader modes). */
export type Wipe = 'dissolve' | 'shards' | 'iris' | 'mosaic' | 'shards2';
const MODE: Record<Wipe, number> = { dissolve: 1, shards: 2, iris: 3, mosaic: 4, shards2: 5 };

/** What the grade pass reads every frame. Colours are display-referred sRGB (0..1). */
export interface ScreenFx {
  /** 0 = off, else a wipe mode (see MODE). */
  mode: number;
  /** Cover amount 0..1 (stepped). */
  k: number;
  /** Iris centre in drawing-buffer UV (0..1, y up). */
  centre: THREE.Vector2;
  /** Cover colour. */
  ink: THREE.Vector3;
  /** Whole-screen pulse toward `pulseColour`, 0..1. */
  pulse: number;
  pulseColour: THREE.Vector3;
}

const srgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };

export const INK = '#1c1626';         // the page background: the cover reads as the UI's own night
export const INK_THREAT = '#2a0c14';  // a stronger foe: the cover turns oxblood
export const PULSE = '#5a5a5a';       // pokeemerald's battle-in pulses go to mid grey, not white
export const PULSE_MAX = 0.4;         // ≤ 50% toward the pulse colour

export const screenFx: ScreenFx = { mode: 0, k: 0, centre: new THREE.Vector2(0.5, 0.5), ink: srgb(INK), pulse: 0, pulseColour: srgb(PULSE) };

/** Timings in 60 fps frames. */
export const BATTLE_IN = { pulseFrames: 12, pulsePeriod: 30, wipeFrames: 30, revealFrames: 30, steps: 10 } as const;
const F = 1000 / 60;

/** Copy the shared state into a grade pass's uniforms (called by Hd2dPipeline.render). */
export function applyScreenFx(u: { uTrMode: { value: number }; uTrK: { value: number }; uTrC: { value: THREE.Vector2 }; uTrInk: { value: THREE.Vector3 }; uPulse: { value: THREE.Vector4 } }) {
  u.uTrMode.value = screenFx.mode;
  u.uTrK.value = screenFx.k;
  u.uTrC.value.copy(screenFx.centre);
  u.uTrInk.value.copy(screenFx.ink);
  u.uPulse.value.set(screenFx.pulseColour.x, screenFx.pulseColour.y, screenFx.pulseColour.z, screenFx.pulse);
}

export function resetScreenFx() {
  screenFx.mode = 0; screenFx.k = 0; screenFx.pulse = 0; screenFx.centre.set(0.5, 0.5); screenFx.ink.copy(srgb(INK));
}

/** k stepped into `steps` whole steps (a hand-keyed cadence: 3 frames per step at 10 / 30). */
const stepped = (k: number, steps: number) => Math.min(1, Math.floor(k * steps + 1e-6) / steps);

/** Context of the battle about to start: picks the wipe (terrain × threat, like pokeemerald's table). */
export interface BattleInContext { kind?: string; trainer?: boolean; threat?: boolean }

export function wipeFor(c: BattleInContext): Wipe {
  if (c.threat) return 'dissolve';
  if (c.trainer) return 'shards2';
  if (c.kind === 'cave') return 'iris';
  if (c.kind === 'water') return 'mosaic';
  return 'shards';
}

/** Overworld side: two grey pulses, then the wipe; resolves fully covered. */
export async function battleCover(c: BattleInContext, onWipe?: () => void): Promise<void> {
  const { pulseFrames, pulsePeriod, wipeFrames, steps } = BATTLE_IN;
  resetScreenFx();
  for (let i = 0; i < 2; i++) {
    // Triangle up/down, per-frame steps (≈ pokeemerald's 2/16 per frame blend).
    await tween(pulseFrames * F, (k) => { screenFx.pulse = PULSE_MAX * (1 - Math.abs(2 * k - 1)); });
    screenFx.pulse = 0;
    if (i === 0) await wait((pulsePeriod - pulseFrames) * F);
  }
  onWipe?.();
  const wipe = wipeFor(c);
  screenFx.mode = MODE[wipe];
  screenFx.ink.copy(srgb(c.threat ? INK_THREAT : INK));
  screenFx.centre.set(0.5, 0.55);
  await tween(wipeFrames * F, (k) => { screenFx.k = stepped(k, steps); });
  screenFx.k = 1;
}

/** True while a cover is up (the battle should reveal it). */
export function covered(): boolean { return screenFx.mode !== 0 && screenFx.k > 0; }

/** Battle side: an iris opening on `centre()` (buffer UV, re-read every frame: the camera pans). */
export async function battleReveal(centre: () => [number, number]): Promise<void> {
  const { revealFrames, steps } = BATTLE_IN;
  screenFx.mode = MODE.iris;
  screenFx.pulse = 0;
  await tween(revealFrames * F, (k) => {
    const [x, y] = centre();
    screenFx.centre.set(x, y);
    screenFx.k = 1 - stepped(k, steps);
  });
  resetScreenFx();
}
