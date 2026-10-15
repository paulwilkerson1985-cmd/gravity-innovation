# Motion craft for the sprite bake (idle, attack, hit, faint, blink, people)

Contents: §keyed acting (the code) · §attack tables per archetype · §hit, faint, appear, dodge ·
§idle clocks · §blink · §drag spring · §people walk and facings · §judging motion · §reference numbers

Why key tables: the shipped tween lunge has the right beats but ~half the amplitude that reads at
sprite size (wind-up 1.3 texels). Per-archetype key tables won 6-0 on 3 of 4 archetypes, and
pose-aligned cel playback ("keyed2") beat smooth 60 fps on all four (44/48 votes, two rubrics);
clock-sampling the action at 8-12 fps LOST or tied on every archetype (it skips the 4-6 f strike
extreme). The scratch A/B of this recipe on Cragmaul (quad table below vs the shipped tween)
judged `better` 6/6 in both orders ($0.38) with `judge.py strip`.

## §keyed acting (verified: typecheck + `tests/creature.test.ts` + a frozen-clock strip)
Three edits, all in render code (never `src/engine`). 1) `src/render/creatures/designs.ts`:

```ts
/**
 * One key pose of an acting table (attack or hit), held for `frames` at 60 fps. Missing fields
 * carry over from the previous key; rest = { sq: 1, lean: 0, fwd: 0, up: 0 }. `fwd` is in model
 * units toward the target (the current lunge reaches 0.95), `up` in model units, `lean` in rad
 * (+ toward the target), `sq` the vertical squash (xz follow as 1/sqrt(sq): mass is kept).
 * `smear` = one stretched cel (never in-betweened); `impact` = the contact key.
 */
export interface ActKey {
  beat?: string;
  frames: number;
  sq?: number;
  lean?: number;
  fwd?: number;
  up?: number;
  smear?: boolean;
  impact?: boolean;
  ease?: 'linear' | 'outCubic' | 'inOut' | 'outBack' | 'inCubic';
}
export interface Design {
  scale: number;
  hover?: number;
  idle: IdleStyle;
  /** Keyed acting tables (pose-aligned cels); without them CreatureView plays its default tweens. */
  keys?: { attack?: ActKey[]; hit?: ActKey[] };
  build(k: Kit): void;
}
```

2) A table per archetype next to the designs (`fwd` in model units toward the target; the
battle reaches 0.95; `up` in units; `lean` rad; `sq` vertical squash with xz = 1/sqrt(sq)):

```ts
/** Quadruped pounce (research table; wind-up 9 f, hold 4, smear 5, contact 4, hop back past rest, land, settle). */
const QUAD_ATTACK: ActKey[] = [
  { beat: 'windup', frames: 9, sq: 0.74, lean: -0.30, fwd: -0.20 },
  { beat: 'hold', frames: 4, sq: 0.72, lean: -0.32 },
  { beat: 'strike', frames: 5, sq: 1.38, lean: 0.38, fwd: 0.95, up: 0.14, smear: true },
  { beat: 'contact', frames: 4, sq: 0.78, lean: 0.2, up: 0, impact: true },
  { beat: 'recover', frames: 12, sq: 1.0, lean: 0, fwd: -0.08, up: 0.22, ease: 'inOut' },
  { beat: 'land', frames: 5, sq: 0.80, fwd: 0, up: 0 },
  { beat: 'settle', frames: 10, sq: 1.0, ease: 'outBack' },
];
const QUAD_HIT: ActKey[] = [
  { beat: 'recoil', frames: 5, sq: 0.8, lean: -0.4, fwd: -0.16, smear: true },
  { beat: 'recover1', frames: 6, sq: 1.06, lean: -0.12, fwd: -0.06 },
  { beat: 'recover2', frames: 7, sq: 0.98, lean: 0.04, fwd: 0 },
  { beat: 'rest', frames: 4, sq: 1.0, lean: 0 },
];
```

and on the design: `keys: { attack: QUAD_ATTACK, hit: QUAD_HIT }`. 3) `src/render/creature.ts`:
import `wait` from './anim' and `type ActKey` from './creatures/designs', add near the top

```ts
const FRAME_MS = 1000 / 60;
const EASES = { linear: (k: number) => k, outCubic: ease.outCubic, inOut: ease.inOut, outBack: ease.outBack, inCubic: ease.inCubic };
/** `?motion=tween` plays the old tween acting for A/B captures even when a design has key tables. */
const keyedMotion = () => typeof location === 'undefined' || new URLSearchParams(location.search).get('motion') !== 'tween';
/** Damped spring 1 → 0 with a couple of overshoots. */
const spring = (k: number, freq = 3, decay = 4) => Math.exp(-decay * k) * Math.cos(k * Math.PI * 2 * freq * 0.5);
```

add this method to `CreatureView` (before `lunge`)

```ts
  /**
   * Pose-aligned cel playback ("keyed2"): every key pose is shown at the END of its slice and held
   * for its frames; a smear or impact key is ONE cel (the strongest pose lands on time); other keys
   * get in-betweens only where a cel would jump more than ~2 texels (0.12 units at the battle
   * camera). Never sample the action from the global clock at 8-12 fps: that skips the strike.
   */
  private async playKeys(keys: ActKey[], dir: THREE.Vector3, axis: THREE.Vector3, start: THREE.Vector3, onCel?: (k: ActKey, cel: number) => void) {
    const H = (this.mesh.geometry.boundingBox?.max.y ?? 1);
    let prev = { sq: 1, lean: 0, fwd: 0, up: 0 };
    let cel = 0;
    for (const k of keys) {
      const cur = { sq: k.sq ?? prev.sq, lean: k.lean ?? prev.lean, fwd: k.fwd ?? prev.fwd, up: k.up ?? prev.up };
      const travel = Math.abs(cur.fwd - prev.fwd) + Math.abs(cur.up - prev.up) + 0.5 * Math.abs(cur.sq - prev.sq) * H;
      const cels = k.smear || k.impact ? 1 : Math.max(1, Math.round(k.frames / 5), Math.ceil(travel / 0.12));
      const e = EASES[k.ease ?? 'outCubic'];
      for (let c = 1; c <= cels; c++) {
        const t = e(c / cels);
        this.squash(prev.sq + (cur.sq - prev.sq) * t);
        this.body.quaternion.setFromAxisAngle(axis, prev.lean + (cur.lean - prev.lean) * t);
        this.inner.position.copy(start).addScaledVector(dir, prev.fwd + (cur.fwd - prev.fwd) * t);
        this.inner.position.y = start.y + prev.up + (cur.up - prev.up) * t;
        onCel?.(k, cel++);
        // The pose set here is rendered on this frame; a wait of (n - 1) frames (+1 ms so the tween
        // clock cannot stop one step short) shows the cel for exactly n frames.
        await wait(Math.max(0, k.frames / cels - 1) * FRAME_MS + 1);
      }
      prev = cur;
    }
  }
```

at the top of `lunge()` after `const lean = ...`:

```ts
    const keys = designFor(this.speciesId)?.keys?.attack;
    if (keys && keyedMotion()) {
      await this.playKeys(keys, dir, axis, start);
      this.inner.position.copy(start);
      this.settleBody();
      this.acting--;
      return;
    }
    const reach = 0.95;
    const lift = this.hover;
```

and at the top of `hit()` after `this.material.emissive.setRGB(1, 1, 1);`:

```ts
    const keys = designFor(this.speciesId)?.keys?.hit;
    if (keys && keyedMotion()) {
      // Keyed hit: the recoil cel is the strongest pose and the only flashed one (0.7, so the pose
      // still reads; a full white fill hides it); from its end, blink-hide 2 frames on / 2 off for
      // at most 1/3 of the recovery, then settle visible.
      const start = this.inner.position.clone();
      const held = strong ? keys.map((k, i) => (i === 0 ? { ...k, frames: k.frames + 2, sq: (k.sq ?? 1) * 0.9 } : k)) : keys;
      const total = held.reduce((n, k) => n + k.frames, 0);
      const hideUntil = held[0]!.frames + Math.floor((total - held[0]!.frames) / 3);
      let frame = 0, running = true;
      const blinker = (async () => {
        while (running) {
          this.blinkOff = frame >= held[0]!.frames && frame < hideUntil && Math.floor((frame - held[0]!.frames) / 2) % 2 === 1;
          await wait(FRAME_MS * 0.5 + 1);
          frame++;
        }
      })();
      await this.playKeys(held, new THREE.Vector3(0, 0, 1), back, start, (_k, cel) => {
        const f = cel === 0 ? (strong ? 0.85 : 0.7) : 0;
        this.material.emissive.setRGB(f, f, f);
      });
      running = false;
      await blinker;
      this.blinkOff = false;
      this.material.emissive.setRGB(0, 0, 0);
      this.inner.position.copy(start);
      this.settleBody();
      this.acting--;
      return;
    }
```

Lint the table before capturing: `python3 -I scripts/keys_lint.py --ts src/render/creatures/designs.ts
--name QUAD_ATTACK --species <id> --facts <out>/sheet/facts/facts.json`. Then capture strips
(`strips.sh`) and judge keyed vs `?motion=tween` with `judge.py strip`.

## §attack tables per archetype (60 fps frames; deltas from rest; validated 6-0 unless noted)
| Beat | Quadruped (pounce) | Blob (hop-splat) | Flyer (rise-swoop) | Serpentine (coil-whip) |
|---|---|---|---|---|
| Wind-up | 9 f: sq 0.74, lean -0.30, fwd -0.20 | 10 f: sq 0.60 (wide), fwd -0.10 | 11 f: up +0.24, fwd -0.22, lean -0.32, sq 1.06 | 12 f: lean -0.42 (coil), sq 0.84, fwd -0.14 |
| Hold | 4 f: sq 0.72, lean -0.32 | 5 f | 5 f | 5 f |
| Strike (1 smear cel) | 5 f: sq 1.38, lean +0.38, fwd 0.95, up 0.14 | 6 f: sq 1.45, fwd 0.57, up 0.38 | 6 f: sq 1.22, lean +0.45, fwd 0.95, up -0.04 | 4 f: sq 1.30, lean +0.55, fwd 0.71 |
| Contact (impact) | 4 f: sq 0.78 | 4 f: sq 0.62 + 3 f hold | 4 f: sq 0.86 | 4 f: sq 1.10 |
| Recover | 12 f: fwd -0.08 (past rest), up 0.22 | 14 f: fwd -0.06, up 0.30 | 14 f: rebound up +0.16 above the hover | 12 f: lean -0.14 past upright |
| Land / settle | 5 f sq 0.80, then 10 f outBack | land sq 0.75 -> 1.12 -> 0.95 -> 1.0 (3 x 6 f) | 12 f ease to the hover | 12 f outBack |
| Total | 49 f | 65 f | 52 f | 49 f (4-2, n.d.) |

Heavy kin (untested starting values): the quad table x1.4 in time, x0.6 in squash, wind-up 14 f +
hold 6 f, strike 6 f, a 3 f ground shake on contact. Rules: wind-up : strike = 2-3 : 1; hold the
extreme 4-5 f; one smear cel at sq 1.3-1.45; contact squash 0.62-0.86 by material; overshoot past
rest 5-8% of the reach or a lean past upright; one decaying settle ring; totals 0.8-1.1 s.
Minimum visible amplitudes: wind-up >= 10-15% H (>= 3 texels at 34), squash >= 15% H, stretch
>= 25% H, overshoot >= 1 texel; below one texel only light may move, not shape.

What a key table CAN do: squash/stretch, lean, translate and lift the WHOLE body (one rigid card at
sprite size), plus the rig's own secondary motion (wag, nod, flap, twitch, flicker) running on top.
It cannot articulate legs, splay stilts or swing an arm: a brief may only promise acting made of
those four channels (rear back = lean + squash; stamp = stretch + drop; splay = squash), or the
promised behaviour will not be what plays. The lean pivots at the feet (`body` group), so a
standing kin tips over its contact point.

## §hit, faint, appear, dodge (key tables, same player; not judged in the research)
- Hit (Cassette Beasts hurt = 3 cels / 0.3 s): ONE strongest recoil cel marked `smear: true`
  (lean -0.35..-0.45, sq 0.8, 2-3 texels back) held 4-6 f, flash 0.7 (not full white: the pose must
  still read) on that cel only; then 2-3 recovery cels over 12-18 f; blink-hide 2 frames on / 2
  off for at most a third of the recovery (the code above does this per FRAME, never per cel: a
  per-cel hide blanks the sprite for 6-7 frames). Strong hits: +2 f on the recoil cel (hit-stop),
  sq x0.9. Measured on Cragmaul: recoil 3.5 texels, first cel 5 f, 2 hidden frames, settles at 22 f.
- Faint: cry; 1 hurt cel (eyes shut) 6-8 f; "give up" topple 2-3 cels over 12 f (head and limbs
  lag); hit the ground, overshoot 1 texel, rest; then a stepped sink of 1/8 H every 2 frames (~16 f)
  with a ground clip line, or a 500 ms drop + fade. Under 0.6 s after the cry (today 990 ms).
- Appear: pop 3 cels (scale 0.3 -> 1.15 -> 1.0) over 12 f, a landing squash cel, then one
  signature idle flourish per species. Dodge: sidestep hop 2 cels + return 2 cels, no flash.

## §idle clocks
Body and face bake at 10 fps (8 on low); loops 0.6-1.2 s (heavy 1.6-2.0 s). Quadruped: breathe/bob
1-2 texels + a 1-texel sideways weight shift, tail/ears lag 1-2 cels. Blob: 0.6 s bounce, squash
+-2-3 texels with mass kept, hold the low squash 2 cels, the face moves after the silhouette.
Flyer: bob 2-3 texels, up fast / down slow; wings 12-15 fps (a 10 fps wingbeat was judged
"choppy"); fast wings get fewer cels. Serpent: sway +-1-2 texels at the head, body planted.
Flames, sparks, lantern tails: 15 fps (rig `speed` 8-10). Stagger the ticks of different
subjects so the whole screen never changes on the same frame.

## §blink (54% of blinks never closed at the 10 fps bake; 40% measured here with `blink_check`)
Closed for exactly ONE bake tick (100-125 ms), aligned to the tick grid: a window one tick long
always contains exactly one tick boundary, so the closed cel is always baked and held. Optional
half-closed cel before; open slower than close; every 2.5-6 s, irregular; a double blink 1 in 3.
Implementation (verified, replaces the sine blink in `CreatureView.update`; it changes every kin's
blink, so re-capture one untouched kin and compare, S7):

```ts
    // Blink: closed for exactly ONE sprite-bake tick (10 fps; a one-tick window always contains
    // one tick boundary, so the closed cel is always baked and held), every few seconds, sometimes
    // doubled; a half-closed tick before it so the close reads faster than the open.
    const TICK = 0.1;
    const bt = tt % this.blinkEvery;
    const blinkStart = Math.floor((this.blinkEvery * 0.5) / TICK) * TICK; // snapped to the tick grid
    const lid = (x: number) => (x >= -TICK && x < 0 ? 0.5 : x >= 0 && x < TICK ? 1 : 0);
    const dbl = Math.floor(tt / this.blinkEvery) % 3 === 1;
    this.u.uBlink.value = this.eyesShut ? 1 : Math.max(lid(bt - blinkStart), dbl ? lid(bt - blinkStart - 3 * TICK) : 0);
```

Verify with `capture.mjs probe` + `blink_check.py --probe` (100% closed measured; the sine blink gave 40%).

## §drag spring (secondary motion lags the body; not implemented, the biggest remaining craft gap)
Pure sines ignore the body: a tail does not trail a lunge, ears do not flick on landing. Cheap
route: a `uDrag` vec3 uniform per creature = a critically damped spring (omega 12-18 rad/s) of the
body's velocity; rig kinds `wag`, `nod`, `flap` add `amp_drag * uDrag` about their pivot; set the
spring to the cel's value at each cel change so the lag is quantised with the cels; wingbeat
speed x2 during a flyer's wind-up and swoop. Until it exists, phase a tail's `wag` 0.3-0.5 rad
behind the body bob and give ears two `twitch` phases.

## §people walk and facings
4 facings (S, N, W, E mirrored), yaw snapped; walk 6 cels at 10 fps (0.6 s) with a 1-texel bob
(down on contact, up on passing), arms opposite the legs, head 1 cel delayed; phase from
distance travelled (one step per stride, no gliding, Emerald moves 1 px per frame while the cels
step); turning = one step-in-place cel of 8 f, a 180 passes the side facing for 4 f; the contact
shadow stays planted (shrink 1 texel on "up" cels); idle people: 2-cel breathing 300 ms each.

## §judging motion (what `strips.sh` + `judge.py strip` do)
Capture under the virtual clock, trigger the action on the view directly (no move FX), log
position/squash per frame. Strip = attacker only, every 2nd frame, 30-40 tiles with frame
numbers, native nearest scale, <= 2400 px wide. A strip WITH the target judges the flash sync,
not the motion: judge sync separately. Never judge playback rate with tiles sampled at or below
the hold length (every 6th frame made stepped and smooth identical). Lint first (`strips.py`:
NO_ANTICIPATION, TOO_FAST, NO_STRETCH, NO_SQUASH, NO_OVERSHOOT, FLOATY_STRIKE), then blind
pairwise both orders x 3; `better` needs a win in both orders. GIFs are invisible to the judge
(it sees frame 1): they are for the owner only. A frozen mid-impact frame judged a correct timing
fix `worse` 8/8: never gate motion on a still.

## §reference numbers (facts only; never copy code, sprites or IP)
Pokemon Emerald: 2 cels at 4-6 fps + 60 fps affine squash +-12.5%; lunge 8 f back at 1 px/f, strike
accelerating 4-5 f, 8 px past rest; faint = 8 px drops on twos (~16 f); overworld walk 4 cels x
8 f, 1 px/f, turn = 8 f half step. Cassette Beasts: everything at 10 fps, idle 6 f / 0.6 s (8 on
large monsters), windup 6-8 f, hurt 3 f / 0.3 s; battle sprites 48-132 px (median 80). saint11:
idle loop always 600 ms; attack first cel 300 ms then 100 ms; "mass never changes"; hit "first
frame strongest, impact uses one frame"; 6-frame walk for low res; wings up fast, down slow.
Kenney Cube Pets: idle 1.0 s rock +-4.5 deg, walk 0.5 s with 5.5% root bob.
