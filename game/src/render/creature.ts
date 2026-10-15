// Creature models and their animated view.
// Every known species has a bespoke builder in ./creatures/designs.ts (see docs/CREATURES.md);
// unknown species fall back to the generic part-based generator below, driven by `look`.
// Every creature is built facing +Z, feet on y = 0, merged into ONE mesh (1 draw call + shadow).
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { animClock, ease, tween } from './anim';
import type { LookData, PartKind } from '../engine/types';
import { getDex } from '../engine/dex';
import { Kit } from './creatures/kit';
import { DESIGNS, type Design, type IdleStyle } from './creatures/designs';
import { creatureMaterial, type CreatureUniforms } from './creatures/material';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const LEAF = '#6fdc4c';
const EYE_WHITE = '#ffffff';
const EYE_DARK = '#1b1b2a';
const FLAME_HOT = '#ff8a1e';

interface Anchors { head: THREE.Vector3; r: number; tail: THREE.Vector3; back: THREE.Vector3; side: number; neck: THREE.Vector3 }

function shade(hex: string, k: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(k);
}

function buildBody(b: MeshBuilder, look: LookData): Anchors {
  const { main, belly } = look.colors;
  const dark = shade(main, 0.75);
  switch (look.body) {
    case 'quad': {
      b.add(GEO.ball, main, { p: [0, 0.55, 0], s: [0.42, 0.38, 0.55] });
      b.add(GEO.ball, belly, { p: [0, 0.47, 0.1], s: [0.33, 0.27, 0.45] });
      for (const x of [-0.22, 0.22]) for (const z of [-0.28, 0.28]) b.add(GEO.cyl, dark, { p: [x, 0.17, z], s: [0.09, 0.34, 0.09] });
      b.add(GEO.ball, main, { p: [0, 0.92, 0.46], s: 0.32 });
      b.add(GEO.ball, belly, { p: [0, 0.83, 0.74], s: [0.16, 0.12, 0.13] });
      b.add(GEO.oct, EYE_DARK, { p: [0, 0.87, 0.87], s: 0.045 });
      return { head: V(0, 0.92, 0.46), r: 0.32, tail: V(0, 0.65, -0.5), back: V(0, 0.9, -0.05), side: 0.42, neck: V(0, 0.8, 0.33) };
    }
    case 'blob': {
      b.add(GEO.ball, main, { p: [0, 0.5, 0], s: [0.56, 0.5, 0.5] });
      b.add(GEO.ball, belly, { p: [0, 0.4, 0.2], s: [0.4, 0.33, 0.34] });
      for (const x of [-0.26, 0.26]) b.add(GEO.ball, dark, { p: [x, 0.06, 0.16], s: [0.15, 0.08, 0.17] });
      return { head: V(0, 0.52, 0), r: 0.5, tail: V(0, 0.42, -0.46), back: V(0, 0.9, -0.12), side: 0.55, neck: V(0, 0.5, 0) };
    }
    case 'biped': {
      for (const x of [-0.2, 0.2]) b.add(GEO.cyl, dark, { p: [x, 0.2, 0], s: [0.13, 0.4, 0.13] });
      b.add(GEO.ball, main, { p: [0, 0.75, 0], s: [0.44, 0.48, 0.37] });
      b.add(GEO.ball, belly, { p: [0, 0.7, 0.13], s: [0.33, 0.37, 0.28] });
      b.add(GEO.ball, main, { p: [0, 1.33, 0.05], s: 0.3 });
      b.add(GEO.ball, belly, { p: [0, 1.25, 0.3], s: [0.15, 0.1, 0.1] });
      return { head: V(0, 1.33, 0.05), r: 0.3, tail: V(0, 0.55, -0.33), back: V(0, 1.02, -0.27), side: 0.44, neck: V(0, 1.1, 0) };
    }
    case 'bird': {
      b.add(GEO.ball, main, { p: [0, 0.55, 0], s: [0.42, 0.42, 0.45] });
      b.add(GEO.ball, belly, { p: [0, 0.5, 0.16], s: [0.32, 0.32, 0.32] });
      b.add(GEO.ball, main, { p: [0, 0.98, 0.12], s: 0.28 });
      b.along(GEO.cone4, look.colors.accent, V(0, 0.94, 0.36), V(0, -0.2, 1), 0.22, 0.09);
      for (const x of [-0.13, 0.13]) b.add(GEO.cyl, look.colors.accent, { p: [x, 0.1, 0.05], s: [0.04, 0.22, 0.04] });
      return { head: V(0, 0.98, 0.12), r: 0.28, tail: V(0, 0.55, -0.42), back: V(0, 0.8, -0.1), side: 0.42, neck: V(0, 0.82, 0.08) };
    }
    case 'fish': {
      b.add(GEO.ball, main, { p: [0, 0.72, 0], s: [0.36, 0.38, 0.64] });
      b.add(GEO.ball, belly, { p: [0, 0.62, 0.06], s: [0.3, 0.26, 0.54] });
      return { head: V(0, 0.76, 0.34), r: 0.3, tail: V(0, 0.72, -0.6), back: V(0, 1.05, 0), side: 0.36, neck: V(0, 0.72, 0.2) };
    }
    case 'bug': {
      b.add(GEO.ball, main, { p: [0, 0.55, -0.33], s: [0.32, 0.3, 0.42] });
      for (let i = 0; i < 3; i++) b.add(GEO.ball, look.colors.accent, { p: [0, 0.56, -0.2 - i * 0.16], s: [0.33, 0.06, 0.07] });
      b.add(GEO.ball, belly, { p: [0, 0.6, 0.1], s: 0.26 });
      b.add(GEO.ball, main, { p: [0, 0.76, 0.38], s: 0.24 });
      for (const sx of [-1, 1]) for (const z of [-0.05, 0.2]) b.along(GEO.cyl, shade(main, 0.6), V(sx * 0.15, 0.55, z), V(sx, -1.1, 0.15), 0.5, 0.035);
      return { head: V(0, 0.76, 0.38), r: 0.24, tail: V(0, 0.55, -0.74), back: V(0, 0.84, 0), side: 0.3, neck: V(0, 0.68, 0.25) };
    }
    case 'serpent': {
      const segs: [number, number, number, number][] = [[0.34, 0.16, -0.5, 0.19], [-0.12, 0.22, -0.42, 0.24], [-0.3, 0.3, -0.02, 0.27], [0.02, 0.42, 0.2, 0.28], [0.06, 0.78, 0.3, 0.25]];
      for (const [x, y, z, r] of segs) {
        b.add(GEO.ball, main, { p: [x, y, z], s: r });
        b.add(GEO.ball, belly, { p: [x, y - r * 0.15, z + r * 0.45], s: [r * 0.75, r * 0.7, r * 0.6] });
      }
      b.add(GEO.ball, main, { p: [0, 1.15, 0.36], s: [0.3, 0.27, 0.34] });
      b.add(GEO.ball, belly, { p: [0, 1.06, 0.6], s: [0.18, 0.1, 0.14] });
      return { head: V(0, 1.15, 0.36), r: 0.3, tail: V(0.5, 0.18, -0.62), back: V(-0.2, 0.55, -0.1), side: 0.3, neck: V(0, 0.95, 0.32) };
    }
  }
}

function addEyes(b: MeshBuilder, a: Anchors) {
  const { head: h, r } = a;
  for (const sx of [-1, 1]) {
    const p = V(h.x + sx * r * 0.42, h.y + r * 0.22, h.z + r * 0.82);
    b.add(GEO.ball, EYE_WHITE, { p: [p.x, p.y, p.z], s: r * 0.24 });
    b.add(GEO.ball, EYE_DARK, { p: [p.x + sx * r * 0.02, p.y - r * 0.02, p.z + r * 0.12], s: r * 0.16 });
    b.add(GEO.oct, EYE_WHITE, { p: [p.x + sx * r * 0.05, p.y + r * 0.06, p.z + r * 0.25], s: r * 0.05 });
  }
}

function flameCluster(b: MeshBuilder, at: THREE.Vector3, size: number, accent: string) {
  b.along(GEO.cone5, FLAME_HOT, at, V(0, 1, -0.2), size * 1.1, size * 0.45);
  b.along(GEO.cone5, accent, at.clone().add(V(0, 0.02, 0.05)), V(0, 1, 0), size * 0.75, size * 0.3);
  for (const sx of [-1, 1]) b.along(GEO.cone4, FLAME_HOT, at.clone().add(V(sx * size * 0.25, 0, 0)), V(sx * 0.5, 1, -0.2), size * 0.6, size * 0.2);
}

function tailDir(): THREE.Vector3 { return V(0, 0.6, -1); }

function addPart(b: MeshBuilder, kind: PartKind, a: Anchors, look: LookData) {
  const { main, belly, accent } = look.colors;
  const { head: h, r } = a;
  switch (kind) {
    case 'ears':
      for (const sx of [-1, 1]) {
        b.along(GEO.cone5, main, V(h.x + sx * r * 0.5, h.y + r * 0.7, h.z - r * 0.1), V(sx * 0.5, 1, -0.1), r * 0.7, r * 0.28, 0.6);
        b.along(GEO.cone5, belly, V(h.x + sx * r * 0.5, h.y + r * 0.72, h.z - r * 0.02), V(sx * 0.5, 1, -0.1), r * 0.5, r * 0.16, 0.5);
      }
      break;
    case 'pointyEars':
      for (const sx of [-1, 1]) {
        b.along(GEO.cone4, main, V(h.x + sx * r * 0.45, h.y + r * 0.7, h.z - r * 0.1), V(sx * 0.35, 1, -0.05), r * 1.0, r * 0.3, 0.55);
        b.along(GEO.cone4, accent, V(h.x + sx * r * 0.45, h.y + r * 0.74, h.z - r * 0.02), V(sx * 0.35, 1, -0.05), r * 0.7, r * 0.17, 0.5);
      }
      break;
    case 'horns':
      for (const sx of [-1, 1]) b.along(GEO.cone5, accent, V(h.x + sx * r * 0.42, h.y + r * 0.75, h.z), V(sx * 0.7, 1, -0.4), r * 0.85, r * 0.15);
      break;
    case 'horn':
      b.along(GEO.cone5, accent, V(h.x, h.y + r * 0.8, h.z + r * 0.35), V(0, 1, 0.5), r * 0.95, r * 0.16);
      break;
    case 'crest':
      for (let i = 0; i < 3; i++) b.along(GEO.cone4, accent, V(h.x, h.y + r * 0.8, h.z + r * (0.2 - i * 0.3)), V(0, 1, -0.4 - i * 0.5), r * (0.85 - i * 0.18), r * 0.15, 0.4);
      break;
    case 'leaf': {
      const top = V(h.x, h.y + r * 0.92, h.z);
      b.along(GEO.cyl, '#3c7a2a', top, V(0, 1, 0), r * 0.35, r * 0.04);
      for (const sx of [-1, 1]) b.add(GEO.oct, sx < 0 ? LEAF : accent === belly ? LEAF : shade(LEAF, 0.85), { p: [h.x + sx * r * 0.22, top.y + r * 0.38, h.z], r: [0, 0, sx * 0.4], s: [r * 0.3, r * 0.06, r * 0.16] });
      break;
    }
    case 'antennae':
      for (const sx of [-1, 1]) {
        const from = V(h.x + sx * r * 0.3, h.y + r * 0.75, h.z + r * 0.2);
        const dir = V(sx * 0.4, 1, 0.5);
        b.along(GEO.cyl, shade(main, 0.5), from, dir, r * 1.1, r * 0.04);
        const tip = from.clone().addScaledVector(dir.normalize(), r * 1.1);
        b.add(GEO.ball, accent, { p: [tip.x, tip.y, tip.z], s: r * 0.14 });
      }
      break;
    case 'whiskers':
      for (const sx of [-1, 1]) for (const dy of [0, -0.12]) b.along(GEO.cyl, accent, V(h.x + sx * r * 0.5, h.y + dy * r, h.z + r * 0.6), V(sx, 0.1 - dy, 0.3), r * 1.0, r * 0.03);
      break;
    case 'tusks':
      for (const sx of [-1, 1]) b.along(GEO.cone5, '#fff6dc', V(h.x + sx * r * 0.32, h.y - r * 0.3, h.z + r * 0.75), V(sx * 0.2, 0.6, 1), r * 0.7, r * 0.11);
      break;
    case 'mane': {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dir = V(Math.cos(ang), Math.sin(ang) * 0.9 + 0.25, -0.35);
        b.along(GEO.cone4, i % 2 ? accent : FLAME_HOT, a.neck.clone().add(V(0, 0, -0.02)), dir, r * 0.95, r * 0.22);
      }
      break;
    }
    case 'flame':
      flameCluster(b, V(h.x, h.y + r * 0.8, h.z - r * 0.15), r * 0.9, accent);
      break;
    case 'tail':
      b.along(GEO.cone5, main, a.tail, tailDir(), 0.75, 0.12);
      b.along(GEO.cone4, accent, a.tail.clone().add(V(0, 0.38, -0.6)), V(0, 0.5, -1), 0.35, 0.1, 0.4);
      break;
    case 'flameTail': {
      b.along(GEO.cone5, main, a.tail, tailDir(), 0.5, 0.11);
      const tip = a.tail.clone().addScaledVector(tailDir().normalize(), 0.45);
      flameCluster(b, tip, 0.32 * look.scale ** 0.3, accent);
      break;
    }
    case 'leafTail': {
      b.along(GEO.cyl, main, a.tail, tailDir(), 0.4, 0.06);
      const tip = a.tail.clone().addScaledVector(tailDir().normalize(), 0.42);
      b.add(GEO.oct, LEAF, { p: [tip.x, tip.y + 0.08, tip.z - 0.1], r: [0.8, 0, 0], s: [0.16, 0.3, 0.05] });
      b.add(GEO.oct, accent, { p: [tip.x, tip.y + 0.1, tip.z - 0.06], s: 0.06 });
      break;
    }
    case 'finTail':
      b.add(GEO.cone4, accent, { p: [a.tail.x, a.tail.y + 0.1, a.tail.z - 0.12], r: [-1.0, 0, 0], s: [0.05, 0.42, 0.34] });
      b.add(GEO.cone4, accent, { p: [a.tail.x, a.tail.y - 0.08, a.tail.z - 0.1], r: [-2.2, 0, 0], s: [0.05, 0.34, 0.28] });
      break;
    case 'wings':
      for (const sx of [-1, 1]) {
        const big = look.body === 'bug' ? 1.4 : 1;
        b.add(GEO.cone4, look.body === 'bug' ? belly : main, { p: [sx * (a.side + 0.12 * big), a.back.y + 0.08, a.back.z - 0.05], r: [-0.4, 0, -sx * 1.0], s: [0.05, 0.62 * big, 0.38 * big] });
        b.add(GEO.cone4, accent, { p: [sx * (a.side + 0.16 * big), a.back.y + 0.06, a.back.z - 0.12], r: [-0.4, 0, -sx * 1.1], s: [0.03, 0.38 * big, 0.22 * big] });
      }
      break;
    case 'fins':
      for (const sx of [-1, 1]) b.add(GEO.cone4, accent, { p: [sx * a.side * 0.95, a.back.y - 0.38, a.back.z + 0.1], r: [-0.6, 0, -sx * 1.4], s: [0.04, 0.32, 0.22] });
      break;
    case 'dorsal':
      b.add(GEO.cone4, accent, { p: [0, a.back.y + 0.12, a.back.z - 0.05], r: [-0.45, 0, 0], s: [0.05, 0.42, 0.3] });
      break;
    case 'spikes':
      for (let i = 0; i < 3; i++) b.along(GEO.cone5, accent, V(0, a.back.y - 0.05 - i * 0.04, a.back.z - i * 0.22), V(0, 1, -0.4), 0.3 - i * 0.04, 0.08);
      break;
    case 'shell':
      b.add(GEO.ball, accent, { p: [0, a.back.y - 0.08, a.back.z], s: [0.4, 0.22, 0.45] });
      break;
    case 'crystals': {
      const spots: [number, number, number, number][] = [[0, 0.06, 0, 0.2], [-0.16, -0.02, -0.12, 0.14], [0.17, -0.03, -0.08, 0.13], [0.04, -0.04, -0.26, 0.11]];
      for (const [x, y, z, s] of spots) b.add(GEO.oct, accent, { p: [a.back.x + x, a.back.y + y, a.back.z + z], r: [x, 0, z], s: [s * 0.55, s * 1.4, s * 0.55] });
      break;
    }
    case 'arms':
      for (const sx of [-1, 1]) {
        b.along(GEO.ball, shade(main, 0.9), V(sx * (a.side + 0.02), a.back.y - 0.05, 0.05), V(sx * 0.35, -1, 0.25), 0.55, 0.15);
        b.add(GEO.ball, shade(main, 0.7), { p: [sx * (a.side + 0.18), a.back.y - 0.55, 0.15], s: 0.17 });
      }
      break;
  }
}

function buildGenericGeometry(look: LookData): THREE.BufferGeometry {
  const b = new MeshBuilder();
  const anchors = buildBody(b, look);
  for (const p of look.parts) addPart(b, p, anchors, look);
  addEyes(b, anchors);
  return b.build();
}

/** The species whose `look` is this exact object (scenes construct views from `species(id).look`). */
export function speciesIdForLook(look: LookData): string | undefined {
  for (const s of getDex().species.values()) if (s.look === look) return s.id;
  return undefined;
}

let legacy = false;
/** Debug (model gallery `&legacy=1`): render the old generic models for before/after comparisons. */
export function setLegacyModels(on: boolean) { legacy = on; }

export function designFor(id: string | undefined): Design | undefined {
  return id && !legacy ? DESIGNS[id] : undefined;
}

/** Build the merged creature geometry: bespoke design when known, generic fallback otherwise. */
export function buildCreatureGeometry(look: LookData, speciesId?: string): THREE.BufferGeometry {
  const d = designFor(speciesId ?? speciesIdForLook(look));
  if (!d) return buildGenericGeometry(look);
  const k = new Kit();
  d.build(k);
  return k.build();
}

const UP = new THREE.Vector3(0, 1, 0);
/** Damped spring 1 → 0 with a couple of overshoots. */
const spring = (k: number, freq = 3, decay = 4) => Math.exp(-decay * k) * Math.cos(k * Math.PI * 2 * freq * 0.5);

// ---------------------------------------------------------------- key-table actions (HD-2D sprites)
// Sprite-scale attacks are authored as pose keys, not tweens (docs/DECISIONS.md "Battle feel"):
// wind-up → held anticipation → ONE stretched strike cel → contact squash → recovery past rest →
// a decaying settle. Amplitudes are sized in texels: at 28–40 texels a wind-up must travel ≥ 10–15%
// of the body, squash ≥ 15%, stretch ≥ 25% or it never moves a whole texel.

/** A pose of the body pivot: squash sy (volume kept), lean (rad, + toward the target), fwd / up (units from rest). */
interface Pose { sq: number; lean: number; fwd: number; up: number }
/**
 * [60 fps frames to reach the pose, the pose (missing fields hold), easing, tag]. `strike` is the
 * single smear cel; the contact key fires `onStrike` as it starts.
 */
type Key = readonly [number, Partial<Pose>, ((k: number) => number)?, ('strike' | 'contact')?];
const lin = (k: number) => k;
const outQuart = (k: number) => 1 - (1 - k) ** 4;
/** Contact distance toward the target (units), as in the tweened lunge. */
const REACH = 0.95;

export type Archetype = 'quad' | 'blob' | 'fly' | 'serp';
export const archetypeOf = (idle: IdleStyle): Archetype =>
  idle === 'bounce' ? 'blob' : idle === 'float' || idle === 'glide' ? 'fly' : idle === 'sway' ? 'serp' : 'quad';

export const LUNGE_KEYS: Record<Archetype, readonly Key[]> = {
  // Pounce: crouch and rock back, hold, explosive stretched leap, squash on contact, hop back past
  // the start, land, settle.
  quad: [
    [9, { sq: 0.74, lean: -0.3, fwd: -0.2, up: 0 }, ease.outCubic],
    [4, { sq: 0.72, lean: -0.32, fwd: -0.22 }],
    [5, { sq: 1.38, lean: 0.38, fwd: REACH, up: 0.14 }, outQuart, 'strike'],
    [4, { sq: 0.78, lean: 0.25, up: 0 }, outQuart, 'contact'],
    [12, { sq: 1.08, lean: -0.1, fwd: -0.08, up: 0.22 }, ease.inOut],
    [5, { sq: 0.8, lean: 0.04, fwd: -0.05, up: 0 }, ease.inCubic],
    [10, { sq: 1, lean: 0, fwd: 0 }, ease.outBack],
  ],
  // Hop-splat: deep wide squash, hold, high stretched hop, splat, bounce home, jiggle.
  blob: [
    [10, { sq: 0.6, lean: -0.08, fwd: -0.1, up: 0 }, ease.outCubic],
    [5, { sq: 0.58, lean: -0.1 }],
    [6, { sq: 1.45, lean: 0.2, fwd: REACH * 0.6, up: 0.38 }, outQuart, 'strike'],
    [4, { sq: 0.62, lean: 0.15, fwd: REACH, up: 0 }, ease.inCubic, 'contact'],
    [3, { sq: 0.66, lean: 0.12 }],
    [14, { sq: 1.15, lean: -0.05, fwd: -0.06, up: 0.3 }, ease.inOut],
    [5, { sq: 0.75, lean: 0, fwd: 0, up: 0 }, ease.inCubic],
    [6, { sq: 1.12 }, ease.outCubic],
    [6, { sq: 0.95 }, ease.inOut],
    [6, { sq: 1 }, ease.inOut],
  ],
  // Rise-swoop: rise and draw back, hold, swoop onto the target, rebound above the hover, settle.
  fly: [
    [11, { sq: 1.06, lean: -0.32, fwd: -0.22, up: 0.24 }, ease.outCubic],
    [5, { lean: -0.34, fwd: -0.24, up: 0.26 }],
    [6, { sq: 1.22, lean: 0.45, fwd: REACH, up: -0.04 }, outQuart, 'strike'],
    [4, { sq: 0.86, lean: 0.3, up: 0 }, outQuart, 'contact'],
    [14, { sq: 1.04, lean: -0.08, fwd: 0, up: 0.16 }, ease.inOut],
    [12, { sq: 1, lean: 0, up: 0 }, ease.inOut],
  ],
  // Coil-whip: coil back (lean far back, compress), hold, whip from the coil (short travel, big
  // lean), snap back past upright, settle.
  serp: [
    [12, { sq: 0.84, lean: -0.42, fwd: -0.14, up: 0 }, ease.outCubic],
    [5, { sq: 0.83, lean: -0.44, fwd: -0.15 }],
    [4, { sq: 1.3, lean: 0.55, fwd: REACH * 0.75, up: 0.05 }, outQuart, 'strike'],
    [4, { sq: 1.1, lean: 0.48, up: 0 }, lin, 'contact'],
    [12, { sq: 0.95, lean: -0.14, fwd: -0.04 }, ease.inOut],
    [12, { sq: 1, lean: 0, fwd: 0 }, ease.outBack],
  ],
};

/**
 * Cels per key in pose-aligned playback: the strike is one held smear cel; other keys get one cel
 * per ~5 frames, and more where the body travels far, so no cel-to-cel jump exceeds ~0.12 units
 * (≈ 2 texels on the battle camera). Every cel shows the pose at the END of its slice, so each
 * key pose is displayed and held.
 */
function celsFor(frames: number, from: Pose, to: Pose, tag?: string): number {
  if (tag === 'strike') return 1;
  const travel = Math.abs(to.fwd - from.fwd) + Math.abs(to.up - from.up) + 0.5 * Math.abs(to.sq - from.sq);
  return Math.max(1, Math.round(frames / 5), Math.ceil(travel / 0.12));
}

/**
 * A creature in the scene with idle/attack/hit/faint animations.
 * Hierarchy: root (placement, facing) → inner (scene-owned scale/offset) → body (squash, tilt) → mesh (idle bob).
 */
export class CreatureView {
  readonly root = new THREE.Group();
  readonly inner = new THREE.Group();
  /** Squash/stretch and tilt pivot (at the feet). */
  readonly body = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshLambertMaterial;
  readonly shadow: THREE.Mesh;
  readonly speciesId: string | undefined;
  /** Idle hover height (model units). */
  readonly hover: number;
  readonly idle: IdleStyle;
  private readonly u: CreatureUniforms;
  /** The rig/blink/act uniforms (shared with the HD-2D sprite material). */
  get uniforms(): CreatureUniforms { return this.u; }
  private phase: number;
  private busy = false;
  private acting = 0;
  private eyesShut = false;
  private blinkEvery: number;
  private shadowOpacity = 0.22;
  private shadowBase = new THREE.Vector2(1, 1);
  baseScale: number;
  hovering: boolean;

  constructor(look: LookData, seed = 0, speciesId?: string) {
    this.speciesId = speciesId ?? speciesIdForLook(look);
    const design = designFor(this.speciesId);
    const { material, uniforms } = creatureMaterial();
    this.material = material;
    this.u = uniforms;
    if (legacy) uniforms.uAmb.value = 0;
    this.mesh = new THREE.Mesh(buildCreatureGeometry(look, this.speciesId), this.material);
    this.baseScale = design?.scale ?? look.scale;
    const flyer = look.body === 'fish' || look.body === 'bird' || look.body === 'bug';
    this.hover = design ? design.hover ?? 0 : flyer ? 0.12 : 0;
    this.idle = design?.idle ?? (flyer ? 'float' : 'trot');
    // "hovering" = visibly airborne; some scenes settle such kin lower on podiums.
    this.hovering = design ? this.hover >= 0.25 : flyer;
    this.inner.add(this.body);
    this.body.add(this.mesh);
    this.root.add(this.inner);
    this.inner.scale.setScalar(this.baseScale);
    // Elliptical blob shadow matched to the model's footprint.
    const bb = this.mesh.geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
    const hx = Math.max(0.2, (bb.max.x - bb.min.x) * 0.42);
    const hz = Math.max(0.2, (bb.max.z - bb.min.z) * 0.42);
    this.shadowBase.set(hx * this.baseScale, hz * this.baseScale);
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: this.shadowOpacity, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.set(((bb.max.x + bb.min.x) / 2) * this.baseScale, 0.012, ((bb.max.z + bb.min.z) / 2) * this.baseScale);
    this.shadow.scale.set(this.shadowBase.x, this.shadowBase.y, 1);
    this.shadow.renderOrder = -0.5;
    this.root.add(this.shadow);
    this.phase = seed * 1.7;
    this.blinkEvery = 3.1 + ((seed * 0.73 + (this.speciesId?.length ?? 3) * 0.37) % 1.6);
    this.mesh.position.y = this.hover;
    this.u.uTime.value = this.phase;
  }

  faceTowards(target: THREE.Vector3) {
    const d = target.clone().sub(this.root.position);
    this.root.rotation.y = Math.atan2(d.x, d.z);
  }

  private get idleAllowed() { return !this.busy && this.acting === 0; }

  /** Acting (lunge, hit, dodge, faint, appear) or recalled: HD-2D sprites re-bake every frame. */
  get animating(): boolean { return this.acting > 0 || this.busy; }

  /**
   * Play acting as pose-aligned cels (HD-2D sprites: held key poses, re-baked only when the cel
   * changes) instead of a smooth tween; set by the sprite stage.
   */
  cels = false;
  /** Running actions that play as cels (the rest re-bake every frame). */
  private keyed = 0;
  /** animClock.frame of the last cel change. */
  private celFrame = -1;

  /** HD-2D live-bake gate: every frame while a smooth action runs; on cel changes in keyed ones. */
  wantBake(): boolean {
    if (!this.animating) return false;
    if (this.busy || this.acting > this.keyed) return true;
    return this.celFrame === animClock.frame;
  }

  /** Idle motion multiplier (HD-2D sprites: big enough to move whole texels); 1 = default. */
  idleGain = 1;

  /** HD-2D hit blink: true on the frames a hit sprite is hidden (the default renderer ignores it). */
  blinkOff = false;

  private darkCache: boolean | null = null;
  /** A dark-coloured kin (mean vertex luminance low): HD-2D gives it a light inner rim. */
  get dark(): boolean {
    if (this.darkCache === null) {
      const col = this.mesh.geometry.getAttribute('color');
      let sum = 0;
      for (let i = 0; i < (col?.count ?? 0); i++) sum += 0.2126 * col!.getX(i) + 0.7152 * col!.getY(i) + 0.0722 * col!.getZ(i);
      this.darkCache = !!col && sum / col.count < 0.06;
    }
    return this.darkCache;
  }

  /**
   * Sprite frame rate the blink is drawn on (HD-2D: the idle bake rate, 10 / 8 fps); 0 = a smooth
   * blink (3D renderer).
   */
  blinkFps = 0;

  private smoothBlink(tt: number): number {
    const bt = tt % this.blinkEvery;
    const blink = (x: number) => (x >= 0 && x < 0.13 ? Math.sin((x / 0.13) * Math.PI) : 0);
    const dbl = Math.floor(tt / this.blinkEvery) % 3 === 1;
    return Math.max(blink(bt), dbl ? blink(bt - 0.2) : 0);
  }

  /**
   * Blink as drawn cels on the sprite frame clock (the bake samples the rig at whole ticks of the
   * same time): fully shut for exactly one tick, half open for the next (closing is faster than
   * opening). A smooth 130 ms lid sampled at 10 fps never showed a closed eye on most blinks.
   */
  private celBlink(tt: number): number {
    // Whole ticks throughout (the bake's tick is floor(uTime · fps)), so a cycle boundary can
    // never fall inside the first tick of its blink.
    const tick = Math.floor(tt * this.blinkFps);
    const per = this.blinkEvery * this.blinkFps;
    const cycle = Math.floor(tick / per + 1e-9);
    const d = tick - Math.ceil(cycle * per - 1e-9);
    const dbl = cycle % 3 === 1;
    if (d === 0 || (dbl && d === 3)) return 1;
    if (d === 1 || (dbl && d === 4)) return 0.5;
    return 0;
  }

  private setShadow(lift: number, fade = 1) {
    const k = Math.max(0.55, 1 - lift * 0.9);
    this.shadow.scale.set(this.shadowBase.x * k, this.shadowBase.y * k, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.shadowOpacity * fade * (0.6 + 0.4 * k);
  }

  update(t: number) {
    const tt = t + this.phase;
    this.u.uTime.value = tt;
    // Blink: a quick squint every few seconds, sometimes a double blink.
    this.u.uBlink.value = this.eyesShut ? 1 : this.blinkFps > 0 ? this.celBlink(tt) : this.smoothBlink(tt);
    if (!this.idleAllowed) return;
    const b = this.body;
    let y = this.hover, sy = 1, sxz = 1, pitch = 0, roll = 0;
    const breathe = Math.sin(tt * 2.1);
    switch (this.idle) {
      case 'trot': {
        const k = Math.abs(Math.sin(tt * 3.0));
        y += k * 0.035;
        sy = 1 + breathe * 0.018 + (k - 0.5) * 0.03;
        pitch = Math.sin(tt * 3.0) * 0.015;
        break;
      }
      case 'bounce': {
        const k = Math.abs(Math.sin(tt * 2.8));
        y += k * 0.075;
        const land = Math.pow(1 - k, 6);
        sy = 1 + (k - 0.35) * 0.06 - land * 0.1;
        roll = Math.sin(tt * 1.4) * 0.03;
        break;
      }
      case 'float': {
        y += Math.sin(tt * 2.4) * 0.05;
        sy = 1 + breathe * 0.02;
        roll = Math.sin(tt * 1.3) * 0.05;
        pitch = Math.sin(tt * 2.4 + 0.8) * 0.03;
        break;
      }
      case 'glide': {
        y += Math.sin(tt * 1.7) * 0.035;
        sy = 1 + breathe * 0.015;
        roll = Math.sin(tt * 0.9) * 0.035;
        pitch = Math.sin(tt * 1.7 + 0.5) * 0.025;
        break;
      }
      case 'sway': {
        sy = 1 + breathe * 0.025;
        roll = Math.sin(tt * 1.2) * 0.04;
        pitch = Math.sin(tt * 0.8) * 0.03;
        break;
      }
      case 'heavy': {
        sy = 1 + breathe * 0.022;
        y += Math.max(0, Math.sin(tt * 1.6)) * 0.012;
        break;
      }
    }
    if (this.idleGain !== 1) {
      const g = this.idleGain;
      y = this.hover + (y - this.hover) * g;
      sy = 1 + (sy - 1) * g;
      pitch *= g; roll *= g;
    }
    sxz = 1 / Math.sqrt(sy);
    this.mesh.position.y = y;
    b.position.set(0, 0, 0);
    b.scale.set(sxz, sy, sxz);
    b.rotation.set(pitch, 0, roll);
    this.setShadow(y);
  }

  private squash(sy: number) {
    const sxz = 1 / Math.sqrt(Math.max(0.05, sy));
    this.body.scale.set(sxz, sy, sxz);
  }

  private settleBody() {
    this.body.position.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.body.quaternion.identity();
    this.mesh.position.y = this.hover;
  }

  async appear() {
    this.acting++;
    this.inner.scale.setScalar(0.001);
    await tween(300, (k) => {
      this.inner.scale.setScalar(this.baseScale * Math.max(0.001, ease.outBack(k)));
      this.squash(0.75 + 0.5 * ease.outCubic(k));
    });
    await tween(220, (k) => this.squash(1 + 0.25 * spring(k, 2, 4) * (1 - k)));
    this.settleBody();
    this.acting--;
  }

  /**
   * Anticipation crouch → stretched lunge → impact squash → hop back → landing squash.
   * `onStrike` fires on the contact frame, so a scene can play the hit there and let the
   * recovery (hop back, landing) overlap the target's reaction instead of delaying it.
   */
  async lunge(towards: THREE.Vector3, onStrike?: () => void) {
    if (this.cels) return this.playKeys(towards, LUNGE_KEYS[archetypeOf(this.idle)], onStrike);
    this.acting++;
    const start = this.inner.position.clone();
    const dir = towards.clone().sub(this.root.position).setY(0).normalize().applyAxisAngle(UP, -this.root.rotation.y);
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const lean = (a: number) => this.body.quaternion.setFromAxisAngle(axis, a);
    const reach = 0.95;
    const lift = this.hover;
    await tween(150, (k) => {
      const e = ease.outCubic(k);
      this.squash(1 - 0.22 * e);
      lean(-0.2 * e);
      this.inner.position.copy(start).addScaledVector(dir, -0.12 * e);
    });
    await tween(110, (k) => {
      const e = ease.outCubic(k);
      this.squash(0.78 + 0.5 * e);
      lean(-0.2 + 0.5 * e);
      this.inner.position.copy(start).addScaledVector(dir, -0.12 + (reach + 0.12) * e);
      this.inner.position.y = start.y + Math.sin(k * Math.PI) * 0.12;
    });
    onStrike?.();
    await tween(70, (k) => {
      this.squash(1.28 - 0.5 * ease.outCubic(k));
      lean(0.3 - 0.15 * k);
    });
    await tween(230, (k) => {
      const e = ease.inOut(k);
      this.inner.position.copy(start).addScaledVector(dir, reach * (1 - e));
      this.inner.position.y = start.y + Math.sin(k * Math.PI) * (0.22 + lift * 0.3);
      this.squash(0.78 + 0.34 * Math.sin(Math.min(1, k * 1.4) * Math.PI) + 0.22 * k);
      lean(0.15 * (1 - k) - 0.12 * Math.sin(k * Math.PI));
    });
    this.inner.position.copy(start);
    await tween(170, (k) => {
      this.squash(1 - 0.2 * spring(k, 2.2, 3.5) * (1 - k));
      lean(0);
    });
    this.settleBody();
    this.acting--;
  }

  /**
   * Hurt as cels (≈ 0.4 s, like a 3-drawing hurt animation): ONE strongest recoil cel (squashed,
   * tipped back, knocked back ~2 texels, white) held 5–6 frames, then three 6-frame recovery cels.
   * The sprite blinks out on 2-frame boundaries while it recovers (not in calm).
   */
  private async hitCels(strong: boolean, o: { calm?: boolean }) {
    this.acting++;
    this.keyed++;
    const z0 = this.inner.position.z;
    const back = new THREE.Vector3(1, 0, 0);
    const pose = (lean: number, sq: number, knock: number) => {
      this.body.quaternion.setFromAxisAngle(back, lean);
      this.squash(sq);
      this.inner.position.z = z0 - knock;
      this.celFrame = animClock.frame;
    };
    const lean0 = strong ? -0.45 : -0.35;
    const flash = strong ? 1 : 0.85;
    pose(lean0, 0.8, strong ? 0.16 : 0.12);
    this.material.emissive.setRGB(flash, flash, flash);
    await tween((strong ? 6 : 5) * 1000 / 60, () => {});
    this.material.emissive.setRGB(0, 0, 0);
    const recover: [number, number, number][] = [[lean0 * 0.5, 0.92, 0.07], [lean0 * 0.15, 1.03, 0.02], [0, 1, 0]];
    for (let i = 0; i < recover.length; i++) {
      const [lean, sq, knock] = recover[i]!;
      pose(lean, sq, knock);
      let f = 0;
      await tween(6 * 1000 / 60, () => {
        // Hidden on frames 2–3 of the first two recovery cels: a blink on 2-frame boundaries.
        this.blinkOff = !o.calm && i < 2 && Math.floor(f++ / 2) % 2 === 1;
      });
    }
    this.blinkOff = false;
    this.inner.position.z = z0;
    this.settleBody();
    this.celFrame = animClock.frame;
    this.keyed--;
    this.acting--;
  }

  /** Key-table action toward `towards`, played as pose-aligned cels; `onContact` fires on the contact key. */
  private async playKeys(towards: THREE.Vector3, keys: readonly Key[], onContact?: () => void) {
    this.acting++;
    this.keyed++;
    const start = this.inner.position.clone();
    const dir = towards.clone().sub(this.root.position).setY(0).normalize().applyAxisAngle(UP, -this.root.rotation.y);
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    const apply = (p: Pose) => {
      this.squash(p.sq);
      this.body.quaternion.setFromAxisAngle(axis, p.lean);
      this.inner.position.copy(start).addScaledVector(dir, p.fwd);
      this.inner.position.y = start.y + p.up;
      this.celFrame = animClock.frame;
    };
    let cur: Pose = { sq: 1, lean: 0, fwd: 0, up: 0 };
    for (const [frames, to, ez = lin, tag] of keys) {
      const a = cur, b: Pose = { ...cur, ...to };
      if (tag === 'contact') onContact?.();
      const n = celsFor(frames, a, b, tag);
      let shown = -1;
      await tween((frames * 1000) / 60, (k) => {
        const cel = Math.min(n - 1, Math.floor(k * n));
        if (cel === shown) return;
        shown = cel;
        const t = ez((cel + 1) / n);
        apply({ sq: a.sq + (b.sq - a.sq) * t, lean: a.lean + (b.lean - a.lean) * t, fwd: a.fwd + (b.fwd - a.fwd) * t, up: a.up + (b.up - a.up) * t });
      });
      cur = b;
    }
    this.inner.position.copy(start);
    this.settleBody();
    this.celFrame = animClock.frame;
    this.keyed--;
    this.acting--;
  }

  async pulse(color: THREE.ColorRepresentation) {
    const c = new THREE.Color(color);
    await tween(380, (k) => this.material.emissive.copy(c).multiplyScalar(Math.sin(k * Math.PI) * 0.8));
    this.material.emissive.setRGB(0, 0, 0);
  }

  /**
   * White flash + recoil tilt; crits get a 2-frame hit-stop first. `calm` (reduced motion / no
   * screen shake) drops the blink strobe for a steady fading flash.
   */
  async hit(strong: boolean, o: { crit?: boolean; calm?: boolean } = {}) {
    if (this.cels) return this.hitCels(strong, o);
    this.acting++;
    const x0 = this.inner.position.x;
    const z0 = this.inner.position.z;
    const back = new THREE.Vector3(1, 0, 0);
    const amp = strong ? 0.42 : 0.28;
    this.material.emissive.setRGB(1, 1, 1);
    if (o.crit ?? strong) {
      // Hit-stop: freeze squashed in the flash for ~2 frames.
      this.squash(0.8);
      this.body.quaternion.setFromAxisAngle(back, -0.12);
      await tween(70, () => {});
    }
    await tween(strong ? 420 : 320, (k) => {
      const sp = spring(k, strong ? 2.5 : 2, 4.5);
      this.body.quaternion.setFromAxisAngle(back, -amp * sp);
      this.squash(1 - 0.18 * Math.max(0, sp));
      this.inner.position.z = z0 - Math.sin(Math.min(1, k * 1.6) * Math.PI) * (strong ? 0.22 : 0.14) * (1 - k * 0.5);
      this.inner.position.x = x0 + Math.sin(k * Math.PI * 7) * 0.05 * (1 - k);
      const on = o.calm || k < 0.08 || (Math.floor(k * 9) % 2 === 0 && k < 0.7);
      const f = on ? (strong ? 1 : 0.85) * (1 - k * 0.6) : 0;
      this.material.emissive.setRGB(f, f, f);
      this.blinkOff = !on && k < 0.7;
    });
    this.blinkOff = false;
    this.material.emissive.setRGB(0, 0, 0);
    this.inner.position.x = x0;
    this.inner.position.z = z0;
    this.settleBody();
    this.acting--;
  }

  /** A missed attack: a quick sidestep hop with a lean, then back — no flash, no recoil. */
  async dodge() {
    this.acting++;
    const x0 = this.inner.position.x;
    const y0 = this.inner.position.y;
    const fwd = new THREE.Vector3(0, 0, 1);
    await tween(200, (k) => {
      const e = ease.outCubic(k);
      this.inner.position.x = x0 + 0.38 * e;
      this.inner.position.y = y0 + Math.sin(k * Math.PI) * 0.14;
      this.body.quaternion.setFromAxisAngle(fwd, -0.22 * e);
      this.squash(1 - 0.12 * Math.sin(k * Math.PI));
    });
    await tween(260, (k) => {
      const e = ease.inOut(k);
      this.inner.position.x = x0 + 0.38 * (1 - e);
      this.body.quaternion.setFromAxisAngle(fwd, -0.22 * (1 - e));
    });
    this.inner.position.x = x0;
    this.inner.position.y = y0;
    this.settleBody();
    this.acting--;
  }

  /** Hurt hop with eyes shut → topple sideways → flatten and sink. */
  async faint() {
    this.busy = true;
    this.acting++;
    this.eyesShut = true;
    this.u.uBlink.value = 1;
    const y0 = this.inner.position.y;
    const side = new THREE.Vector3(0, 0, 1);
    await tween(170, (k) => {
      this.squash(1 - 0.25 * Math.sin(k * Math.PI));
      this.inner.position.y = y0 + Math.sin(k * Math.PI) * 0.08;
    });
    await tween(200, (k) => {
      this.squash(1 + 0.12 * Math.sin(k * Math.PI));
      this.inner.position.y = y0 + Math.sin(k * Math.PI) * 0.16;
      this.body.quaternion.setFromAxisAngle(side, 0.25 * k);
    });
    await tween(360, (k) => {
      const e = ease.inCubic(k);
      this.body.quaternion.setFromAxisAngle(side, 0.25 + 1.2 * e);
      this.mesh.position.y = this.hover * (1 - e);
      this.u.uAct.value = 1 - k;
      this.inner.position.y = y0 - e * 0.05;
    });
    await tween(260, (k) => {
      this.squash(1 - 0.92 * ease.inCubic(k));
      this.inner.position.y = y0 - 0.05 - k * 0.4;
      (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.shadowOpacity * (1 - k);
    });
    this.root.visible = false;
    this.acting--;
  }

  reset() {
    this.root.visible = true;
    this.inner.position.set(0, 0, 0);
    this.inner.scale.setScalar(this.baseScale);
    this.settleBody();
    this.eyesShut = false;
    this.u.uAct.value = 1;
    this.acting = 0;
    this.setShadow(this.hover);
    this.material.emissive.setRGB(0, 0, 0);
    this.blinkOff = false;
    this.busy = false;
  }

  setBusy(b: boolean) { this.busy = b; }

  /** Self-lit ambient lift (default 0.16): your own kin, seen from behind and in its own shadow, gets a little more. */
  setAmbientLift(v: number) { this.u.uAmb.value = v; }

  /** Free GPU resources (geometry, material, shadow). */
  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
  }
}
