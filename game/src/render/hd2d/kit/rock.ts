// HD-2D rock kit: craggy, irregular pixel-textured boulders (low-bevel faceted blocks), terraced
// boulder walls from a Heightmap, rubble piles and pebble scatter. Everything is emitted into a
// VoxelBatch (one merged mesh per material), shaded by the same baked AO + texel bevel shader as
// the voxel blocks, so a whole cliff stays ONE draw call.
//
// A boulder is a stack of horizontal rings (an irregular octagon in plan: every vertical edge is
// chamfered by its own amount): foot → shoulder (the side faces), a steep then a shallow bevel
// ring over the top edge (about one texel wide: the crisp lit edge of a block, not a pillow) and
// a faceted top cap (a fan around a raised or sunk centre). One or two corners per stone are
// chipped off: their top rings drop and pull in, leaving a sloped facet. Side faces carry the
// "rock face" bevel code (no seam; a quantised vertical value gradient, dark foot → lit top),
// the bevel rings fixed brightness steps — bright top planes, mid fronts, dark undersides.
// Corners move as units (every ring vertex of a corner shares its jitter), so tops tilt and
// break irregularly without opening holes.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { VoxelBatch, type Face4, type Heightmap, type V3 } from '../arena';
import { CELL, LEVEL, TEXEL } from './units';

export interface BoulderOptions {
  /** Edge rounding in world units (default 10–15% of the smallest half-extent, ≥ 1 texel). */
  chamfer?: number;
  /** Corner jitter in world units (default 0.035): irregular silhouette. */
  jitter?: number;
  /** Extra random drop of the top corners (default 0.06): sloped, uneven tops. */
  topJitter?: number;
  /** Rotation about Y, and a small tilt about X/Z (radians). */
  ry?: number; rx?: number; rz?: number;
  /** AO factor at the bottom corners (default 0.55) and the top (default 1). */
  aoBottom?: number;
  aoTop?: number;
  /** Brightness of the top face relative to the sides (default 1.3: tops catch the light). */
  topK?: number;
  /** No bevel along the bottom edges (sits on something). */
  flatBottom?: boolean;
  /**
   * Outward bulge of the side faces at mid height (world units; default 5% of the smallest
   * half-extent, ≤ 0.025), with per-vertex creases in and out: faceted sides, not pillows.
   * Not on the cheap version.
   */
  bulge?: number;
  /**
   * Cheap boulder (≤ 26 triangles): square in plan, straight sides, only the top rim bevelled.
   * Reads the same from the battle camera for blocks seen mostly from above; implies a flat
   * bottom.
   */
  topOnly?: boolean;
  /**
   * Skip faces fully hidden by neighbours, in LOCAL axes: [+x, -x, +y, -y, +z, -z].
   * The bottom (-y) is skipped by default.
   */
  skip?: boolean[];
  /** Corners chipped off the top edge (0–2; default random: none 30%, one 50%, two 20%). */
  chips?: number;
  /**
   * Height of the top cap's centre over its rim (world units; default random −0.3…+0.9 of the
   * chamfer): a faceted, chiselled top instead of a flat lid. Not on the cheap version.
   */
  peak?: number;
  /**
   * Strength of the per-stone form gradient baked into the vertex colours (default 0.16): the
   * corner toward the upper-left-front is lighter, the opposite one darker, so every block face
   * reads lit top-left → shadowed bottom-right like a hand-shaded stone. 0 = off.
   */
  form?: number;
  /**
   * Coursed-stone look (coursedTerrace / courseWall): side and top faces use the bevel shader's
   * "stone face" code — a crisp, slightly ragged 1–2 texel seam around the face at ≈45% albedo,
   * a darker underside band, a mid front and a lit top band — and the plan chamfers stay small,
   * so every stone reads as one rounded, top-lit block.
   */
  course?: boolean;
  /**
   * Multiplier on the top cap and the shallow top bevel (the shoulder gets 60% of it): a warm,
   * brighter lit top (e.g. '#ffe6c0' × 1.1). Default none.
   */
  topTint?: THREE.Color;
  /** Plan-view chamfer of the vertical edges, × the chamfer (default [0.5, 2.7]; coursed [0, 0.2]: square ends, the shader draws the seam). */
  /**
   * Brightness multiplier of the two top-edge bevel bands (default 1). Course stones under
   * another course use ~0.7: their lip is a soft line, not a lit stripe across the wall.
   */
  bevelK?: number;
  cutRange?: [number, number];
}

/** Direction of the baked form gradient (world): upper left, toward the camera. */
const FORM_DIR = new THREE.Vector3(-0.55, 0.7, 0.45).normalize();

const tmp = new THREE.Vector3();

/** Bevel brightness: the shallow top ring is the lit edge, the steep shoulder less, the foot sinks. */
const K_TOP = 1.42, K_SHOULDER = 1.1, K_SIDE = 0.86, K_BOTTOM = 0.4;

/** Bevel-shader code for a "rock face" (arena.ts addBevel): no seam, (u, v, -(W + 2), ±H). */
const rockFace = (u: number, v: number, w: number, hh: number): Face4 => [u, v, -(w + 2), hh];
/** Bevel-shader code for a bevel facet: no seam, brightness × k. */
const facet = (k: number): Face4 => [0, 0, -1, k];
/** Bevel-shader code for a coursed stone face (arena.ts addBevel): (u, v, -(W + 1000), ±H). */
const stoneFace = (u: number, v: number, w: number, hh: number): Face4 => [u, v, -(w + 1000), hh];

// Ring corners in order around the block (seen from +y), and the face the ring edge after
// corner k runs along: (-,-)→(+,-) is -z (5), (+,-)→(+,+) +x (0), (+,+)→(-,+) +z (4), (-,+)→(-,-) -x (1).
const RING = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const FACE_AFTER = [5, 0, 4, 1] as const;

/** A ring vertex: local undistorted position, its corner (shared jitter), AO, top-drop and chip weights, top-tint weight. */
type RV = { p: V3; k: number; ao: number; dy: number; cw: number; tt?: number };

/**
 * One craggy boulder: rings (foot, shoulder, two narrow top-edge bevel rings, faceted top cap),
 * an irregular octagon in plan, corners jittered as units, 0–2 corners chipped, flat-shaded,
 * box-mapped in local space at TEXEL density. `center` is the box centre; `size` the full
 * extents before bevelling.
 */
export function boulder(batch: VoxelBatch, center: V3, size: V3, tint: THREE.Color, rng: Rng, o: BoulderOptions = {}) {
  const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const minH = Math.min(h[0], h[1], h[2]);
  const minXZ = Math.min(h[0], h[2]);
  const c = Math.min(o.chamfer ?? Math.max(TEXEL, minH * (0.1 + rng.next() * 0.05)), minH * 0.48);
  const j = o.jitter ?? 0.035;
  const tj = o.topJitter ?? 0.06;
  const ab = o.aoBottom ?? 0.55, at = o.aoTop ?? 1;
  const topK = o.topK ?? 1.3;
  const skip = o.skip ?? [false, false, false, true, false, false];
  const lite = !!o.topOnly;
  const flat = lite || !!o.flatBottom;
  const crs = !!o.course;
  const sideCode = crs ? stoneFace : rockFace;
  const T = batch.tileTexels, tile = TEXEL * T;
  // Texture variant: a 64-texel atlas holds four 32² variants (textures.ts paintBoulderAtlas);
  // each stone starts in one of them. Smaller tiles: any texel offset.
  const pick = () => (T >= 64 ? (rng.int(2) * 32 + rng.int(10)) / T : rng.int(T) / T);
  const offU = pick(), offV = pick();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), new THREE.Vector3(1, 1, 1));
  const bevK = o.bevelK ?? 1;
  const kTop = K_TOP * Math.sqrt(topK / 1.3) * bevK;
  const formK = o.form ?? 0.16;
  // The form gradient's direction in LOCAL axes (the stone may be rotated).
  const formL = FORM_DIR.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)).invert());
  // Plan-view chamfer of the vertical edges, its own size per corner (none on the cheap
  // version: 4-vertex rings) — an irregular octagon, never a rounded square.
  const cv = lite ? 0 : c;
  const [cutLo, cutHi] = o.cutRange ?? (crs ? [0, 0.2] : [0.5, 2.7]);
  const cutMul = RING.map(() => cutLo + rng.next() * (cutHi - cutLo));
  const topTint = o.topTint;
  // Per corner: column jitter (x, z) and a drop of the top rings — tilted, uneven tops.
  const colJ = RING.map(() => [(rng.next() - 0.5) * 2 * j, (rng.next() - 0.5) * 2 * j] as const);
  const drop = RING.map(() => -rng.next() * tj + (rng.next() - 0.5) * j);
  // Chipped corners: the top rings of 0–2 corners drop and pull in (a sloped broken facet).
  const nChips = o.chips ?? (rng.next() < 0.3 ? 0 : rng.next() < 0.71 ? 1 : 2);
  const chipCut = [0, 0, 0, 0], chipDrop = [0, 0, 0, 0];
  for (let n = 0, k0 = rng.int(4); n < Math.min(nChips, 4); n++) {
    const k = (k0 + n * (1 + rng.int(3))) % 4;
    chipCut[k] = lite ? 0 : minXZ * (0.22 + rng.next() * 0.2);
    chipDrop[k] = Math.min(h[1] * (0.18 + rng.next() * 0.22), minXZ * 0.6);
  }

  const ring = (y: number, inset: number, cut: number, ao: number, dy: number, cw = 0): RV[] => {
    const out: RV[] = [];
    RING.forEach(([sx, sz], k) => {
      if (cv <= 0) { out.push({ p: [sx * (h[0] - inset), y, sz * (h[2] - inset)], k, ao, dy, cw }); return; }
      const ck = Math.min(cut * cutMul[k]! + chipCut[k]! * cw, 0.8 * (minXZ - inset));
      const xp: RV = { p: [sx * (h[0] - inset), y, sz * (h[2] - inset - ck)], k, ao, dy, cw }; // on the ±x face
      const zp: RV = { p: [sx * (h[0] - inset - ck), y, sz * (h[2] - inset)], k, ao, dy, cw }; // on the ±z face
      if (k % 2 === 0) out.push(xp, zp); else out.push(zp, xp);
    });
    return out;
  };
  const world = (v: RV): V3 => {
    const d = colJ[v.k]!;
    tmp.set(v.p[0] + d[0], v.p[1] + drop[v.k]! * v.dy - chipDrop[v.k]! * v.cw, v.p[2] + d[1]).applyMatrix4(m);
    return [tmp.x, tmp.y, tmp.z];
  };
  // Box-map UVs from the dominant LOCAL axis, so the texture follows the rock when rotated.
  const uvOf = (p: V3, axis: number): [number, number] => {
    const [ua, va] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    return [p[ua]! / tile + offU, p[va]! / tile + offV];
  };
  const emit = (verts: RV[], axis: number, faceAttr: (v: RV) => Face4, k: number) => {
    // Outward orientation check against the local centre (0,0,0).
    const P = verts.map((q) => q.p);
    const cen = [0, 0, 0];
    for (const p of P) for (let b = 0; b < 3; b++) cen[b]! += p[b]! / P.length;
    const e1 = new THREE.Vector3(P[1]![0] - P[0]![0], P[1]![1] - P[0]![1], P[1]![2] - P[0]![2]);
    const e2 = new THREE.Vector3(P[2]![0] - P[0]![0], P[2]![1] - P[0]![1], P[2]![2] - P[0]![2]);
    if (e1.cross(e2).dot(new THREE.Vector3(cen[0], cen[1], cen[2])) < 0) verts = verts.slice().reverse();
    const W = verts.map(world);
    const col = verts.map((q) => {
      const f = formK ? 1 + formK * Math.max(-1, Math.min(1, (q.p[0] / h[0]) * formL.x * 0.8 + (q.p[1] / h[1]) * formL.y + (q.p[2] / h[2]) * formL.z * 0.8)) : 1;
      const c = tint.clone().multiplyScalar(q.ao * k * f);
      if (topTint && q.tt) c.multiply(new THREE.Color(1, 1, 1).lerp(topTint, q.tt));
      return c;
    });
    const uv = verts.map((q) => uvOf(q.p, axis));
    const fa = verts.map(faceAttr);
    for (let t = 1; t + 1 < verts.length; t++) {
      const a = W[0]!, b = W[t]!, d = W[t + 1]!;
      const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]));
      if (n.lengthSq() < 1e-12) continue; // degenerate (collapsed bevel)
      n.normalize();
      batch.tri([a, b, d], [n.x, n.y, n.z], [uv[0]!, uv[t]!, uv[t + 1]!], [col[0]!, col[t]!, col[t + 1]!], [fa[0]!, fa[t]!, fa[t + 1]!]);
    }
  };
  // A band of quads between two rings with the same vertex count. `kind` decides the bevel code
  // and when a hidden face hides the band: sides with their face, top bevels only when the top is
  // hidden too (the lit rim between two neighbours stays visible from above), foot bevels with
  // the bottom.
  const band = (A: RV[], B: RV[], kind: 'side' | 'top' | 'foot', kFace: number, kCut: number, side: [number, number] = [A[0]!.p[1], B[0]!.p[1]]) => {
    const n = A.length;
    const [yb, yt] = side;
    for (let s = 0; s < n; s++) {
      const quad = [A[s]!, A[(s + 1) % n]!, B[(s + 1) % n]!, B[s]!];
      const isCut = n === 8 && s % 2 === 0;
      const face = n === 8 ? (isCut ? -1 : FACE_AFTER[(s - 1) / 2]!) : FACE_AFTER[s]!;
      const corner = s / 2;
      const hidden = (f: number) => (kind === 'side' ? skip[f] : kind === 'top' ? skip[f] && skip[2] : skip[f] && skip[3]);
      if (isCut ? hidden(FACE_AFTER[(corner + 3) % 4]!) && hidden(FACE_AFTER[corner]!) : hidden(face)) continue;
      const axis = isCut || face === 0 || face === 1 ? 0 : 2;
      if (isCut || kind !== 'side') { emit(quad, axis, () => facet(isCut ? kCut : kFace), 1); continue; }
      const ua = axis === 0 ? 2 : 0;
      const wFace = 2 * h[ua]!, hFace = Math.max(TEXEL, yt - yb);
      emit(quad, axis, (v) => sideCode(v.p[ua]! + h[ua]!, v.p[1] - yb, wFace, -hFace), 1);
    }
  };

  // Rings: foot (+ a foot bevel unless flat), shoulder, the narrow steep and the wide shallow
  // top-edge bevel (≈ a quarter round: 45° point at 0.29 c), top cap inset by c.
  const eps = TEXEL * 0.25;
  const cutAt = (inset: number) => (cv <= 0 ? 0 : Math.max(eps, cv - inset * 0.5));
  const yTop = h[1];
  const r1 = ring(yTop - c, 0, cv, at, 0.6, 1);
  const r2 = ring(yTop - c * 0.29, c * 0.29, cutAt(c * 0.29), at, 0.85, 1).map((v) => ({ ...v, tt: 0.6 }));
  const r3 = ring(yTop, c, cutAt(c), at, 1, 1).map((v) => ({ ...v, tt: 1 }));
  let foot: RV[];
  if (flat) foot = ring(-h[1], 0, cv, ab, 0);
  else {
    const cb = Math.min(c * 0.8, h[1] * 0.4);
    const r0 = ring(-h[1], cb, cutAt(cb), ab * 0.85, 0);
    foot = ring(-h[1] + cb, 0, cv, ab, 0);
    band(r0, foot, 'foot', K_BOTTOM, K_BOTTOM);
    if (!skip[3]) emit(r0, 1, () => facet(K_BOTTOM), 1);
  }
  if (flat && !skip[3]) emit(foot, 1, () => facet(K_BOTTOM), 1);
  // Sides: one band, or two around a creased, extra-jittered middle ring (faceted rock).
  const bul = lite ? 0 : o.bulge ?? Math.min(0.025, minH * 0.05);
  // Coursed stones: the small vertical-edge chamfers read as part of the seam.
  const kSideCut = crs ? 0.55 : K_SIDE;
  const sideRange: [number, number] = [foot[0]!.p[1], r1[0]!.p[1]];
  if (bul > 0) {
    const ym = sideRange[0] + (sideRange[1] - sideRange[0]) * (0.35 + rng.next() * 0.3);
    const mid = ring(ym, -bul, cv + bul * 0.6, (ab + at) / 2 * 1.04, 0.3, 0.35).map((v) => {
      const e = (rng.next() - 0.45) * bul * 2.2; // creases: each ring vertex pushed in or out
      return { ...v, p: [v.p[0] * (1 + e / Math.max(h[0], 1e-3)), v.p[1], v.p[2] * (1 + e / Math.max(h[2], 1e-3))] as V3 };
    });
    band(foot, mid, 'side', 1, kSideCut, sideRange);
    band(mid, r1, 'side', 1, kSideCut, sideRange);
  } else band(foot, r1, 'side', 1, kSideCut);
  band(r1, r2, 'top', K_SHOULDER * bevK, K_SHOULDER * 0.96 * bevK);
  band(r2, r3, 'top', kTop, kTop * 0.95);
  if (skip[2]) return;
  const topCode = (v: RV): Face4 => sideCode(v.p[0] + h[0] - c, h[2] - c - v.p[2], 2 * (h[0] - c), 2 * (h[2] - c));
  if (lite) { emit(r3, 1, topCode, topK); return; }
  // Faceted top: a fan around a raised (or sunk) centre, a little off-centre.
  const peak = o.peak ?? c * (-0.3 + rng.next() * 1.2);
  const ctr: RV = { p: [(rng.next() - 0.5) * h[0] * 0.5, yTop + peak, (rng.next() - 0.5) * h[2] * 0.5], k: 0, ao: at, dy: 0, cw: 0, tt: 1 };
  const cAvg = drop.reduce((a, b) => a + b, 0) / 4 - chipDrop.reduce((a, b) => a + b, 0) / 8;
  ctr.p[1] += cAvg;
  for (let s = 0; s < r3.length; s++) emit([ctr, r3[s]!, r3[(s + 1) % r3.length]!], 1, topCode, topK);
}

export interface BoulderWallOptions {
  /** World y of level 0 (default 0). */
  baseY?: number;
  /** Share of narrow stones (0.6–0.85 cells wide) along a row (default 0.25). */
  split?: number;
  /** Share of wide stones (1.15–1.4 cells) along a row (default 0.4). */
  merge?: number;
  /** Share of stones that span two levels when the level above tops the same run (default 0.55). */
  tall?: number;
  /** How far boulders bulge past their cell (default -0.032: a ~1 texel crevice to the next). */
  bulge?: number;
  /** Tint brightness range, low tiers → top tier (default [0.84, 1.14]). */
  shade?: [number, number];
  /** Brightness of the top planes of the top stones (default 1.62): lit shelves over darker fronts. */
  topK?: number;
  /** Per-boulder hue drift: a list of tint colours picked at random (default white). */
  tints?: THREE.ColorRepresentation[];
  /**
   * Brightness of the recessed warm near-black core behind each row (default 0.1; 0 = none):
   * what shows in the crevices between rounded boulders, like the dark gaps of dry-stone walls.
   */
  core?: number;
  /**
   * Share of top stones that run two cells deep when the row behind them has the same height
   * (default 0): a ledge top becomes one wide lit shelf of big stones instead of rows of tops.
   */
  deep?: number;
  /** Cheap top-bevel-only boulders for every block (low tier). Buried top blocks always use them. */
  lite?: boolean;
  /**
   * Vertical stagger of every stone's foot and top, in courses (default 0.35): stones of one
   * level start and end at different heights, so rows never line up into brick courses.
   */
  stagger?: number;
  /** Share of stones split into two stacked stones of unequal height (default 0.35). */
  stack?: number;
  /** Yaw jitter of front stones in radians (default 0.35 ≈ ±20°; top stones get 40% of it). */
  yaw?: number;
  /** How far stones push out of (+) or sink into (−) the wall face, world units (default 0.13). */
  protrude?: number;
  /** Per-stone value jitter (default 0.1 = ±10%) and hue jitter (default 0.05). */
  toneJitter?: number;
  hueJitter?: number;
}

/**
 * Terraced boulder walls from a Heightmap: every visible level of a row of cells becomes a run
 * of craggy boulders of random width (0.6–1.4 cells) whose feet and tops are staggered by about
 * a third of a course (some split into two stacked stones), yawed ±20°, pushed out of or sunk
 * into the face, each with its own tone and hue, inset from their cells so a near-black crevice
 * (the recessed core) shows between them; darker low down and lighter toward the top tiers, with
 * baked AO. Tops of a run stay close to one height, so a ledge still reads as a lit shelf.
 * Fully hidden blocks emit nothing. Same contract as `rockColumns` (drop-in replacement).
 */
export function boulderColumns(hm: Heightmap, batch: VoxelBatch, rng: Rng, o: BoulderWallOptions = {}) {
  const baseY = o.baseY ?? 0;
  const pSplit = o.split ?? 0.25, pMerge = o.merge ?? 0.4, pTall = o.tall ?? 0.55, pDeep = o.deep ?? 0;
  const stagger = (o.stagger ?? 0.35) * LEVEL, pStack = o.stack ?? 0.35, yawJ = o.yaw ?? 0.35, push = o.protrude ?? 0.13;
  const toneJ = o.toneJitter ?? 0.1, hueJ = o.hueJitter ?? 0.05;
  const bulge = o.bulge ?? -0.032;
  const core = o.core ?? 0.1;
  const lite = o.lite ?? false;
  const [sLo, sHi] = o.shade ?? [0.84, 1.14];
  const topKTop = o.topK ?? 1.62;
  const tints = (o.tints ?? ['#ffffff']).map((t) => new THREE.Color(t));
  const coreTint = new THREE.Color(core, core * 0.62, core * 0.42); // warm near-black (#1a100b-ish)
  const covered = (i: number, j: number, top: number) => hm.get(i, j) >= top - 0.01;
  /** Stone width in cells: narrow (split), wide (merge) or about one cell. */
  const width = () => {
    const r = rng.next();
    return r < pSplit ? 0.6 + rng.next() * 0.25 : r < pSplit + pMerge ? 1.15 + rng.next() * 0.25 : 0.85 + rng.next() * 0.3;
  };
  // What a cell's block at level l looks like (null: absent or fully hidden). Neighbouring
  // cells of a row with the same key form one run of stones.
  const kind = (i: number, j: number, l: number): string | null => {
    const levels = hm.get(i, j);
    if (levels <= l || levels > 90) return null;
    const full = Math.ceil(levels);
    const topLevel = Math.min(levels, l + 1);
    const blockTop = l === full - 1;
    const front = !covered(i, j + 1, topLevel), back = !covered(i, j - 1, topLevel);
    if (!blockTop && !front && !back && covered(i + 1, j, topLevel) && covered(i - 1, j, topLevel)) return null;
    return `${topLevel}|${blockTop ? 1 : 0}|${front ? 1 : 0}|${back ? 1 : 0}`;
  };
  /** x-intervals of a (row, level) already filled by tall stones from the level below. */
  const occupied = new Map<string, [number, number][]>();
  // Cores go in after every boulder, and rows are emitted front (+z, camera side) to back, so
  // early-z rejects hidden fragments instead of shading them (SwiftShader: ~2× faster).
  const cores = new VoxelBatch(batch.tileTexels);
  for (let j = hm.nz - 1; j >= 0; j--) {
    let maxL = 0;
    for (let i = 0; i < hm.nx; i++) { const v = hm.get(i, j); if (v < 90) maxL = Math.max(maxL, Math.ceil(v)); }
    for (let l = 0; l < maxL; l++) {
      let i = 0;
      while (i < hm.nx) {
        const key = kind(i, j, l);
        if (key === null) { i++; continue; }
        let i1 = i + 1;
        while (i1 < hm.nx && kind(i1, j, l) === key) i1++;
        run(i, i1, j, l, key);
        i = i1;
      }
    }
  }
  batch.append(cores);

  function run(i0: number, i1: number, j: number, l: number, key: string) {
    const [tl, bt, fr, bk] = key.split('|');
    const topLevel = Number(tl), blockTop = bt === '1', front = fr === '1', back = bk === '1';
    const leftOpen = !covered(i0 - 1, j, topLevel), rightOpen = !covered(i1, j, topLevel);
    const xA = hm.cx(i0) - CELL / 2, xB = hm.cx(i1 - 1) + CELL / 2;
    const z0 = hm.cz(j) - CELL / 2, z1 = hm.cz(j) + CELL / 2;
    const y0 = baseY + l * LEVEL;
    const yTop = baseY + topLevel * LEVEL;
    const tierLight = Math.min(1, (l + 1) / 7);
    // Tall stones: when the level above is the top of the very same run (same extent, same
    // front), some stones span both levels — big chunky boulders instead of brick courses.
    const upKey = blockTop ? null : kind(i0, j, l + 1);
    let upOk = upKey !== null && upKey.split('|')[1] === '1' && upKey.split('|')[2] === fr && kind(i0 - 1, j, l + 1) !== upKey && kind(i1, j, l + 1) !== upKey;
    for (let i = i0; upOk && i < i1; i++) if (kind(i, j, l + 1) !== upKey) upOk = false;
    const upTop = upOk ? baseY + Number(upKey!.split('|')[0]) * LEVEL : yTop;
    // Free x-ranges (minus tall stones from below), each partitioned into stones; odd levels
    // start with a short stone (masonry stagger).
    let free: [number, number][] = [[xA, xB]];
    for (const [a, b] of occupied.get(`${j},${l}`) ?? []) {
      free = free.flatMap(([u, v]): [number, number][] => {
        if (b <= u || a >= v) return [[u, v]];
        const out: [number, number][] = [];
        if (a - u > 0.25 * CELL) out.push([u, a]);
        if (v - b > 0.25 * CELL) out.push([b, v]);
        return out;
      });
    }
    const segs: [number, number][] = [];
    for (const [u, v] of free) {
      let x = u;
      while (x < v - 1e-3) {
        let w = width() * CELL;
        if (segs.length === 0 && l % 2 === 1) w *= 0.45 + rng.next() * 0.3;
        let xe = Math.min(v, x + w);
        if (v - xe < 0.55 * CELL) xe = v - x <= 2.0 * CELL ? v : (x + v) / 2;
        segs.push([x, xe]);
        x = xe;
      }
    }
    const exposedRow = front || back;
    for (const [sx0, sx1] of segs) {
      const tall = upOk && rng.chance(pTall);
      if (tall) {
        const k = `${j},${l + 1}`;
        if (!occupied.has(k)) occupied.set(k, []);
        occupied.get(k)!.push([sx0, sx1]);
      }
      const top = tall || blockTop;
      const openTop = tall ? upTop : topLevel;
      // Deep stones: a top stone swallows the same-height row behind it (when the two rows also
      // end alike, so no side face goes missing).
      const ca = Math.floor((sx0 - hm.x0) / CELL + 1e-3), cb = Math.floor((sx1 - hm.x0) / CELL - 1e-3);
      const lvTop = (openTop - baseY) / LEVEL;
      let deep = top && pDeep > 0 && j > 0 && rng.chance(pDeep);
      for (let i = ca; deep && i <= cb; i++) if (Math.abs(hm.get(i, j - 1) - hm.get(i, j)) > 0.01) deep = false;
      if (deep && (covered(cb + 1, j - 1, lvTop) !== covered(cb + 1, j, lvTop) || covered(ca - 1, j - 1, lvTop) !== covered(ca - 1, j, lvTop))) deep = false;
      let backD = back;
      if (deep) {
        for (let ll = l; ll <= (tall ? l + 1 : l); ll++) {
          const k = `${j - 1},${ll}`;
          if (!occupied.has(k)) occupied.set(k, []);
          occupied.get(k)!.push([sx0, sx1]);
        }
        backD = false;
        for (let i = ca; i <= cb; i++) if (!covered(i, j - 2, lvTop)) backD = true;
      }
      const sideR = sx1 >= xB - 1e-3 && (rightOpen || (tall && !covered(i1, j, (openTop - baseY) / LEVEL)));
      const sideL = sx0 <= xA + 1e-3 && (leftOpen || (tall && !covered(i0 - 1, j, (openTop - baseY) / LEVEL)));
      const exposed = exposedRow || sideR || sideL;
      const yEnd = tall ? upTop : yTop;
      // Feet and (non-top) tops staggered by about a third of a course: no aligned courses.
      // Feet mostly sink into the course below (or the floor); a few rise and show the dark core.
      const yFoot = y0 - (rng.next() < 0.8 ? rng.next() * stagger : -rng.next() * stagger * 0.35);
      const yHead = top ? yEnd + (rng.next() - 0.5) * 0.05 : yEnd + (rng.next() - 0.5) * 2 * stagger;
      const zc = (z0 + z1) / 2 - (deep ? CELL / 2 : 0);
      const dz = (deep ? 2 : 1) * CELL;
      // Protruding chunks and recesses along the open face(s): the back stays against the core.
      const pz = front ? (rng.next() - 0.42) * 2 * push : 0;
      const px = sideR ? (rng.next() - 0.42) * 2 * push : sideL ? -(rng.next() - 0.42) * 2 * push : 0;
      // Two stacked stones of unequal height (and width) instead of one.
      const pieces: [number, number, number, number][] = [];
      if (exposed && !lite && yHead - yFoot > LEVEL * 0.8 && rng.chance(pStack)) {
        const ys = yFoot + (yHead - yFoot) * (0.35 + rng.next() * 0.3);
        const w = sx1 - sx0, cut = rng.next() * 0.22 * w;
        pieces.push(rng.chance(0.5) ? [sx0 + cut, sx1, yFoot, ys] : [sx0, sx1 - cut, yFoot, ys], [sx0, sx1, ys, yHead]);
      } else pieces.push([sx0, sx1, yFoot, yHead]);
      const base = tints[rng.int(tints.length)]!;
      const shadeBase = sLo + (sHi - sLo) * tierLight;
      pieces.forEach(([a0, a1, ya, yb], pi) => {
        const isTop = top && pi === pieces.length - 1;
        // Each stone its own tone (±10%) and hue (warm/cool drift ±5%).
        let shade = shadeBase * (1 + (rng.next() - 0.5) * 2 * toneJ);
        if (rng.chance(0.05)) shade *= 0.86;
        const hue = (rng.next() - 0.5) * 2 * hueJ;
        const tint = base.clone().multiplyScalar(shade);
        tint.r *= 1 + hue; tint.g *= 1 + hue * 0.25; tint.b *= 1 - hue;
        const sy = Math.max(0.12, yb - ya + (isTop ? 0 : 0.04));
        const sx = a1 - a0 + bulge * 2 + Math.abs(px), sz = dz + bulge * 2 + pz + (rng.next() - 0.5) * 0.06;
        const ry = (rng.next() - 0.5) * 2 * yawJ * (deep ? 0.25 : isTop ? 0.4 : 1) * (front || backD ? 1 : exposed ? 0.45 : 0.25);
        boulder(batch, [(a0 + a1) / 2 + px / 2, ya + sy / 2, zc + pz / 2 + (rng.next() - 0.5) * 0.03], [sx, sy, sz], tint, rng, {
          ry,
          skip: [!sideR, !sideL, false, true, !front, !backD],
          // Bevelled feet: the V between stacked stones is a dark crevice line.
          flatBottom: lite || !exposed,
          topOnly: lite || !exposed,
          aoBottom: l === 0 ? 0.3 : 0.45,
          topK: isTop ? topKTop : 1.22,
          jitter: 0.03 + rng.next() * 0.03,
          topJitter: isTop ? 0.045 : 0.07,
          chips: isTop && rng.chance(0.35) ? 0 : undefined,
        });
      });
    }
    if (core > 0) {
      // Recessed dark core behind the whole run: fills the crevices between rounded boulders
      // with deep shadow. Flat-coded (no seam) whatever the material.
      const ins = 0.07;
      cores.box([xA + ins, y0, z0 + ins], [xB - ins, yTop - (blockTop ? 0.1 : 0), z1 - ins], coreTint, rng, {
        skip: [!rightOpen, !leftOpen, !blockTop, true, !front, !back], aoBottom: 0.6, flat: true,
      });
    }
  }
}

export interface RubbleOptions {
  /** Pile radius (world units). */
  radius: number;
  /** Number of stones (default from the radius). */
  count?: number;
  /** Height of the heap relative to the radius (default 0.5). */
  heap?: number;
  /** Size of the biggest boulders (default 0.55 × radius, ≤ 0.95). */
  big?: number;
  /** Base tint (default white); each stone takes a step of the value ramp times this. */
  tint?: THREE.ColorRepresentation;
  /**
   * Per-stone tint ramp, dark → light, linear multipliers (default COOL_GREY: a 4-step cool
   * grey value ramp, so a pile reads as many separate stones that catch the light differently).
   */
  ramp?: readonly (readonly [number, number, number])[];
  /**
   * A heap of small near-cubic blocks stacked on a jittered grid (a voxel-like mound of quarried
   * stone) instead of tumbled stones: few rotations, mostly upright, square-ish.
   */
  blocky?: boolean;
}

/**
 * A cool-grey 4-step value ramp for rubble and pebbles (linear multipliers of the texture):
 * shadowed, mid, lit and highlight stones — grey rubble reads against warm walls.
 */
export const COOL_GREY: readonly (readonly [number, number, number])[] = [[0.7, 0.72, 0.79], [0.84, 0.86, 0.92], [0.97, 0.98, 1.03], [1.1, 1.1, 1.13]];

/** A ramp step for a stone: big stones lean light, small fringe stones lean dark. */
function rampTint(base: THREE.Color, ramp: RubbleOptions['ramp'], bias: number, rng: Rng): THREE.Color {
  const R = ramp ?? COOL_GREY;
  const i = Math.max(0, Math.min(R.length - 1, Math.floor(rng.next() * R.length + bias)));
  const q = R[i]!, k = 0.95 + rng.next() * 0.1;
  return new THREE.Color(base.r * q[0] * k, base.g * q[1] * k, base.b * q[2] * k);
}

/**
 * A rubble pile: a few big chunky stones heaped in the middle, medium stones around them and
 * a fringe of small stones spilling onto the floor. Randomly rotated and tilted, partly sunk;
 * each stone a step of a cool-grey value ramp.
 */
export function rubblePile(batch: VoxelBatch, center: [number, number, number], rng: Rng, o: RubbleOptions) {
  if (o.blocky) { blockyRubble(batch, center, rng, o); return; }
  const r = o.radius;
  const n = o.count ?? Math.round(8 + r * 14);
  const heap = o.heap ?? 0.5;
  const big = Math.min(0.95, o.big ?? r * 0.55);
  const base = new THREE.Color(o.tint ?? '#ffffff');
  for (let k = 0; k < n; k++) {
    // First stones are the big core, the rest spread outward and shrink.
    const t = k / n;
    const d = t < 0.15 ? rng.next() * r * 0.3 : Math.sqrt(rng.next()) * r * (0.4 + t * 0.7);
    const a = rng.next() * Math.PI * 2;
    const s = t < 0.15 ? big * (0.75 + rng.next() * 0.35) : Math.max(0.07, big * (0.55 - t * 0.42) * (0.6 + rng.next() * 0.7));
    const x = center[0] + Math.cos(a) * d, z = center[2] + Math.sin(a) * d * 0.85;
    const lift = Math.max(0, (1 - d / r) * r * heap - s * 0.25);
    const sx = s * (0.95 + rng.next() * 0.35), sy = s * (0.8 + rng.next() * 0.35), sz = s * (0.85 + rng.next() * 0.35);
    const tint = rampTint(base, o.ramp, t < 0.15 ? 0.6 : t > 0.6 ? -0.5 : 0, rng);
    boulder(batch, [x, center[1] + lift + sy * 0.4, z], [sx, sy, sz], tint, rng, {
      ry: rng.next() * Math.PI, rx: (rng.next() - 0.5) * 0.35, rz: (rng.next() - 0.5) * 0.35,
      // Chunky, blocky stones: flat facets, a small bevel, no bulge.
      chamfer: Math.max(TEXEL, Math.min(sx, sy, sz) * (0.08 + rng.next() * 0.06)), bulge: 0,
      jitter: s * 0.08, topJitter: s * 0.12, aoBottom: 0.45, topK: 1.25,
    });
  }
}

/**
 * Blocky rubble: cubes of one module (≈ radius / 3.5) stacked in columns over a jittered grid,
 * tallest in the middle, ragged at the rim, each a little offset, yawed and of its own grey;
 * a fringe of loose single cubes and chips around the foot.
 */
function blockyRubble(batch: VoxelBatch, center: [number, number, number], rng: Rng, o: RubbleOptions) {
  const r = o.radius, heap = o.heap ?? 0.6;
  const m = Math.max(0.2, Math.min(0.5, (o.big ?? r * 0.55) * 0.8));
  const base = new THREE.Color(o.tint ?? '#ffffff');
  const n = Math.ceil(r / m);
  for (let gz = -n; gz <= n; gz++) for (let gx = -n; gx <= n; gx++) {
    const x = gx * m + (gz % 2 ? m * 0.5 : 0) + (rng.next() - 0.5) * m * 0.3, z = gz * m * 0.9 + (rng.next() - 0.5) * m * 0.3;
    const d = Math.hypot(x, z / 0.85) / r;
    if (d > 1 - rng.next() * 0.3) continue;
    const cols = Math.max(1, Math.round((1 - d) * heap * r / m * 1.4 + rng.next() * 0.6));
    for (let k = 0; k < cols; k++) {
      const s = m * (0.8 + rng.next() * 0.4) * (1 - k * 0.06);
      const sy = s * (0.75 + rng.next() * 0.35);
      boulder(batch, [center[0] + x + (rng.next() - 0.5) * m * 0.2, center[1] + k * m * 0.78 + sy * 0.42, center[2] + z + (rng.next() - 0.5) * m * 0.2], [s * (0.9 + rng.next() * 0.3), sy, s * (0.85 + rng.next() * 0.3)],
        rampTint(base, o.ramp, k > 0 ? 0.5 : -0.3, rng), rng, {
          ry: (rng.next() - 0.5) * 0.4, rx: (rng.next() - 0.5) * 0.1, rz: (rng.next() - 0.5) * 0.1,
          chamfer: Math.max(TEXEL * 0.8, s * 0.07), bulge: 0, jitter: s * 0.05, topJitter: s * 0.08, aoBottom: 0.35, topK: 1.5,
          chips: rng.chance(0.4) ? 1 : 0, topOnly: k < cols - 1 && rng.chance(0.5),
        });
    }
  }
  // Loose cubes and chips around the foot.
  for (let k = 0; k < Math.round(r * 6); k++) {
    const a = rng.next() * Math.PI * 2, d = r * (0.85 + rng.next() * 0.55), s = m * (0.3 + rng.next() * 0.4);
    boulder(batch, [center[0] + Math.cos(a) * d, center[1] + s * 0.35, center[2] + Math.sin(a) * d * 0.85], [s, s * 0.8, s * 0.9], rampTint(base, o.ramp, -0.4, rng), rng, {
      ry: rng.next() * 3, chamfer: Math.max(TEXEL * 0.6, s * 0.08), jitter: s * 0.06, topJitter: s * 0.1, aoBottom: 0.45, topK: 1.3, topOnly: true,
    });
  }
}

/**
 * Scatter small stones over a floor rectangle, skipping `keepOut` circles (kin spots!).
 * `area` = [x0, z0, x1, z1]. Each pebble a step of `ramp` (default COOL_GREY) times `tint`.
 */
export function pebbles(batch: VoxelBatch, area: [number, number, number, number], count: number, rng: Rng, keepOut: { x: number; z: number; r: number }[] = [], tint: THREE.ColorRepresentation = '#ffffff', ramp?: RubbleOptions['ramp']) {
  const base = new THREE.Color(tint);
  for (let k = 0; k < count; k++) {
    const x = area[0] + rng.next() * (area[2] - area[0]), z = area[1] + rng.next() * (area[3] - area[1]);
    if (keepOut.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) continue;
    const s = 0.06 + rng.next() * 0.1;
    boulder(batch, [x, s * 0.25, z], [s * 1.3, s * 0.65, s], rampTint(base, ramp, s > 0.12 ? 0.5 : -0.2, rng), rng, {
      ry: rng.next() * 3, chamfer: s * 0.14, jitter: s * 0.08, topJitter: s * 0.14, aoBottom: 0.55, topK: 1.25, topOnly: true,
    });
  }
}

/**
 * Fill a Heightmap with organic terraces from a signed distance function: `dist(x, z)` ≤ 0 is
 * the arena floor (level 0), and each `step` world units outside rises one level (up to `max`),
 * with low-frequency wobble so ledges meander and 2×2 boulder clusters poke up or sink.
 */
export function organicTerraces(hm: Heightmap, dist: (x: number, z: number) => number, rng: Rng, o: { step?: number; max?: number; wobble?: number; clusters?: number } = {}) {
  const step = o.step ?? 1.6, max = o.max ?? 8, wobble = o.wobble ?? 0.45, clusters = o.clusters ?? 0.15;
  const ph = rng.next() * 10;
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const lv = terraceLevel(dist(x, z) - wobbleAt(x, z, ph, wobble), step, max);
    hm.set(i, j, lv > 0 && lv < max ? Math.max(1, lv + clusterBump(i, j, ph, clusters)) : lv);
  }
}

/** Low-frequency meander used by organic terraces (world units, amplitude ≈ `wobble`). */
export function wobbleAt(x: number, z: number, ph: number, wobble: number): number {
  return (Math.sin(x * 1.3 + z * 0.7 + ph) * 0.6 + Math.sin(z * 2.1 - x * 0.4 + ph * 2) * 0.4) * wobble;
}

/** Terrace index for a signed distance: 0 inside, then one per `step` (≤ max). */
export function terraceLevel(d: number, step: number, max: number): number {
  return d <= 0 ? 0 : Math.min(max, 1 + Math.floor(d / step));
}

/** A rare ±1 for 2×2 cell clusters (`clusters` = share poking up; 0.6 × that sinks). */
export function clusterBump(i: number, j: number, ph: number, clusters: number): number {
  const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233 + ph) * 43758.5453;
  const nn = cl - Math.floor(cl);
  return nn > 1 - clusters ? 1 : nn < clusters * 0.6 ? -1 : 0;
}

// ------------------------------------------------------------------ coursed terraces

/** A plan-view polyline [x, z][]. */
export type Path2 = [number, number][];

export interface CourseOptions {
  /** Target course (stone) height in world units (default 0.6); a wall gets 1+ whole courses. */
  course?: number;
  /** Nominal stone length along the wall (default 1.35 × the course height: chunky, near-square stones). */
  length?: number;
  /** Stone depth into the wall (default 0.62). */
  depth?: number;
  /** Size jitter of length / depth (default 0.12 = ±12%; keep ≤ 0.15). */
  sizeJitter?: number;
  /** Yaw jitter in radians (default 0.06): stones stay aligned to the edge. */
  yaw?: number;
  /** Open seam between neighbouring stones and courses, world units (default 2 texels). */
  gap?: number;
  /** Stone tint(s) (default white); each stone picks one, ± toneJitter value (default 0.12), ± hueJitter hue (0.03). */
  tint?: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  toneJitter?: number;
  hueJitter?: number;
  /** Warm multiplier for the lit tops (default '#ffe8c8' × 1.12 ≈ +25% with the top facets). */
  topTint?: THREE.ColorRepresentation;
  /** Brightness of the top cap relative to the front (default 1.25). */
  topK?: number;
  /** Brightness of the recessed core that shows in the seams, × the tint (default 0.45: brown, never black). */
  core?: number;
  /** Silhouette jitter per corner, world units (default 0.03): never a perfect cuboid. */
  jitter?: number;
  /** Each course sits this much behind the one below (batter, default 0.03). */
  setback?: number;
  /** Cheap top-bevel-only stones (low tier). */
  lite?: boolean;
  /** Keep a stone? (centre of its front face, world) — stair cuts, doors, window bays. */
  keep?: (x: number, z: number, y: number) => boolean;
  /** Which side of the path the face looks at: 1 (default) = normal (-dz, dx), so a path walked toward +x faces +z (the camera); -1 = the other side. */
  face?: 1 | -1;
  /** Draw the end faces of the run (default true). */
  ends?: boolean;
}

/** Arc-length parametrisation of a plan polyline. */
function pathSampler(path: Path2) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  const at = (s: number): [number, number] => {
    const t = Math.max(0, Math.min(total, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i]! < t) i++;
    const a = path[i - 1]!, b = path[i]!, seg = cum[i]! - cum[i - 1]!;
    const f = seg > 1e-9 ? (t - cum[i - 1]!) / seg : 0;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  return { total, at };
}

/**
 * A coursed stone wall along a plan polyline from y0 to y1: whole courses of one height each
 * (≈ `course`), stones of about one length (±12%) laid in running bond, aligned to the path with
 * ≤ 0.06 rad of yaw jitter, each a rounded, top-lit course stone (boulder(…, { course: true }))
 * with a warm bright top, a mid front, a dark underside and a ~45% seam; a brown core sits just
 * behind the faces so every open seam reads soft brown, not black. The face lies ON the path;
 * stones extend `depth` behind it. Returns the number of stones.
 */
export function courseWall(batch: VoxelBatch, path: Path2, y0: number, y1: number, rng: Rng, o: CourseOptions = {}): number {
  if (path.length < 2 || y1 - y0 < 0.05) return 0;
  const { total, at } = pathSampler(path);
  if (total < 0.2) return 0;
  const nC = Math.max(1, Math.round((y1 - y0) / (o.course ?? 0.6)));
  const ch = (y1 - y0) / nC;
  const L = o.length ?? ch * 1.35;
  const depth = o.depth ?? 0.62;
  const sj = o.sizeJitter ?? 0.12;
  const yawJ = o.yaw ?? 0.06;
  const gap = o.gap ?? TEXEL * 2;
  const tints = (Array.isArray(o.tint) ? o.tint : [o.tint ?? '#ffffff']).map((t) => new THREE.Color(t));
  const toneJ = o.toneJitter ?? 0.12, hueJ = o.hueJitter ?? 0.03;
  const topTint = new THREE.Color(o.topTint ?? '#ffe8c8').multiplyScalar(o.topTint ? 1 : 1.12);
  const topK = o.topK ?? 1.25;
  const coreK = o.core ?? 0.45;
  const jit = o.jitter ?? 0.03;
  const setback = o.setback ?? 0.03;
  const face = o.face ?? 1;
  const ends = o.ends ?? true;
  const lite = !!o.lite;
  let count = 0;
  for (let ci = 0; ci < nC; ci++) {
    // Running bond: odd courses start half a stone in.
    const segs: [number, number][] = [];
    let x = 0;
    if (ci % 2 === 1 && total > L * 1.2) { const w = L * (0.45 + rng.next() * 0.15); segs.push([0, w]); x = w; }
    while (x < total - 1e-3) {
      const w = L * (1 + (rng.next() - 0.5) * 2 * sj);
      let xe = Math.min(total, x + w);
      if (total - xe < 0.55 * L) xe = total - x <= 1.6 * L ? total : (x + total) / 2;
      segs.push([x, xe]);
      x = xe;
    }
    const yc0 = y0 + ci * ch;
    const isTop = ci === nC - 1;
    segs.forEach(([sa, sb], si) => {
      const pa = at(sa), pb = at(sb);
      const tx = pb[0] - pa[0], tz = pb[1] - pa[1], len = Math.hypot(tx, tz);
      if (len < 0.12) return;
      const nx = (-tz / len) * face, nz = (tx / len) * face; // face normal (toward the open side)
      const mx = (pa[0] + pb[0]) / 2, mz = (pa[1] + pb[1]) / 2;
      if (o.keep && !o.keep(mx, mz, yc0 + ch / 2)) return;
      const d = depth * (1 + (rng.next() - 0.5) * 2 * sj * 0.6);
      const back = ci * setback + (rng.next() - 0.5) * 0.03;
      const cx = mx - nx * (d / 2 + back), cz = mz - nz * (d / 2 + back);
      const sy = ch - gap + (isTop ? (rng.next() - 0.5) * 0.03 : 0);
      const base = tints[rng.int(tints.length)]!;
      const tint = base.clone().multiplyScalar(1 + (rng.next() - 0.5) * 2 * toneJ);
      const hue = (rng.next() - 0.5) * 2 * hueJ;
      tint.r *= 1 + hue; tint.b *= 1 - hue;
      const first = si === 0, last = si === segs.length - 1;
      boulder(batch, [cx, yc0 + gap / 2 + sy / 2, cz], [len - gap, sy, d], tint, rng, {
        ry: Math.atan2(nx, nz) + (rng.next() - 0.5) * 2 * yawJ,
        course: true, topTint: isTop ? topTint : undefined, topK: isTop ? topK : topK * 0.92, bevelK: isTop ? 1 : 0.68,
        chamfer: Math.max(TEXEL, Math.min(0.085, sy * 0.17)),
        jitter: jit, topJitter: isTop ? 0.02 : 0.03, bulge: Math.min(0.035, sy * 0.07), chips: rng.chance(0.15) ? 1 : 0,
        peak: (rng.next() - 0.2) * 0.03, form: 0.2, aoBottom: ci === 0 ? 0.55 : 0.72,
        flatBottom: ci === 0, topOnly: lite,
        // Hidden: the back, the bottom, interior end faces (their seams show the core), and the
        // top cap of lower courses (the course above covers it; the lit bevel lip stays).
        skip: [!(ends && last), !(ends && first), !isTop, true, false, true],
      });
      count++;
    });
  }
  // Recessed brown core just behind the faces (deepest setback included): what the seams show.
  const coreTint = tints[0]!.clone().multiplyScalar(coreK);
  const off = 0.09 + setback * nC;
  const T = TEXEL * batch.tileTexels;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const tx = b[0] - a[0], tz = b[1] - a[1], len = Math.hypot(tx, tz);
    if (len < 1e-4) continue;
    const nx = (-tz / len) * face, nz = (tx / len) * face;
    const A: V3 = [a[0] - nx * off, y0, a[1] - nz * off], B: V3 = [b[0] - nx * off, y0, b[1] - nz * off];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (o.keep && !o.keep(mx, mz, (y0 + y1) / 2)) continue;
    const [P, Q] = face === 1 ? [A, B] : [B, A]; // counter-clockwise seen from the face side
    const u0 = (P[0] + P[2]) / T, u1 = (Q[0] + Q[2]) / T, v0 = y0 / T, v1 = (y1 - 0.02) / T;
    batch.quad(P, Q, [Q[0], y1 - 0.02, Q[2]], [P[0], y1 - 0.02, P[2]], [nx, 0, nz], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], coreTint, [0.8, 0.8, 1, 1], true);
  }
  return count;
}

/**
 * Iso-lines of `f` at `level` inside `bounds` [x0, z0, x1, z1] (marching squares on a `step`
 * grid, saddles resolved by the cell centre), chained into polylines and lightly smoothed.
 * Each chain is oriented so its default course-wall face (CourseOptions.face = 1) looks toward
 * decreasing `f` — the floor side of a signed distance.
 */
export function isoLines(f: (x: number, z: number) => number, level: number, bounds: [number, number, number, number], step = 0.2): Path2[] {
  const [x0, z0, x1, z1] = bounds;
  const nx = Math.max(2, Math.ceil((x1 - x0) / step)), nz = Math.max(2, Math.ceil((z1 - z0) / step));
  const v = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) v[j * (nx + 1) + i] = f(x0 + i * step, z0 + j * step) - level || 1e-6;
  const V = (i: number, j: number) => v[j * (nx + 1) + i]!;
  const pts = new Map<string, [number, number]>();
  const edgePt = (key: string, ax: number, az: number, va: number, bx: number, bz: number, vb: number) => {
    if (!pts.has(key)) { const t = va / (va - vb); pts.set(key, [ax + (bx - ax) * t, az + (bz - az) * t]); }
    return key;
  };
  const segs: [string, string][] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const tl = V(i, j), tr = V(i + 1, j), br = V(i + 1, j + 1), bl = V(i, j + 1);
    const X0 = x0 + i * step, X1 = X0 + step, Z0 = z0 + j * step, Z1 = Z0 + step;
    const e: Record<string, string | null> = {
      t: tl < 0 !== tr < 0 ? edgePt(`h${i},${j}`, X0, Z0, tl, X1, Z0, tr) : null,
      r: tr < 0 !== br < 0 ? edgePt(`v${i + 1},${j}`, X1, Z0, tr, X1, Z1, br) : null,
      b: bl < 0 !== br < 0 ? edgePt(`h${i},${j + 1}`, X0, Z1, bl, X1, Z1, br) : null,
      l: tl < 0 !== bl < 0 ? edgePt(`v${i},${j}`, X0, Z0, tl, X0, Z1, bl) : null,
    };
    const live = (['t', 'r', 'b', 'l'] as const).filter((k) => e[k]);
    if (live.length === 2) segs.push([e[live[0]!]!, e[live[1]!]!]);
    else if (live.length === 4) {
      const c = f(X0 + step / 2, Z0 + step / 2) - level;
      // Cut off the two corners whose sign differs from the centre.
      const cut = (tl < 0) !== (c < 0) ? [['l', 't'], ['r', 'b']] : [['t', 'r'], ['b', 'l']];
      for (const [a, b] of cut) segs.push([e[a!]!, e[b!]!]);
    }
  }
  // Chain segments through their shared edge points.
  const adj = new Map<string, number[]>();
  segs.forEach(([a, b], k) => { for (const p of [a, b]) { if (!adj.has(p)) adj.set(p, []); adj.get(p)!.push(k); } });
  const used = new Uint8Array(segs.length);
  const chains: Path2[] = [];
  const walk = (start: string) => {
    const keys = [start];
    let cur = start;
    for (;;) {
      const next = (adj.get(cur) ?? []).find((k) => !used[k]);
      if (next === undefined) break;
      used[next] = 1;
      const [a, b] = segs[next]!;
      cur = a === cur ? b : a;
      keys.push(cur);
    }
    if (keys.length > 2) chains.push(keys.map((k) => pts.get(k)!));
  };
  for (const [p, ks] of adj) if (ks.length === 1 && !used[ks[0]!]) walk(p);
  segs.forEach(([a], k) => { if (!used[k]) walk(a); });
  return chains.map((c) => {
    let s = c;
    for (let pass = 0; pass < 2; pass++) s = s.map((p, i) => (i === 0 || i === s.length - 1 ? p : [p[0] * 0.5 + (s[i - 1]![0] + s[i + 1]![0]) * 0.25, p[1] * 0.5 + (s[i - 1]![1] + s[i + 1]![1]) * 0.25]));
    // Orient: the face normal (-dz, dx) of the middle segment must point down the gradient.
    const m = Math.floor((s.length - 1) / 2), a = s[m]!, b = s[Math.min(s.length - 1, m + 1)]!;
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l;
    const px = (a[0] + b[0]) / 2, pz = (a[1] + b[1]) / 2;
    return f(px + nx * 0.05, pz + nz * 0.05) > f(px - nx * 0.05, pz - nz * 0.05) ? s.slice().reverse() : s;
  });
}

/** One tier of a coursed terrace: its riser's face at signed distance `d`, its top at height `y`. */
export interface TerraceTier { d: number; y: number; course?: number }

export interface CoursedTerraceOptions extends CourseOptions {
  /** Plan rectangle to build in [x0, z0, x1, z1]. */
  bounds: [number, number, number, number];
  /** Contour grid step (default 0.2). */
  step?: number;
  /**
   * Loose stones on every ledge (flat dirt behind each tier's top course): the batch they go
   * into, stones per unit of edge (default 0.5), tint and ramp (default COOL_GREY).
   */
  pebbles?: { batch: VoxelBatch; perUnit?: number; tint?: THREE.ColorRepresentation; ramp?: RubbleOptions['ramp'] };
  /** Called per tier with its edge paths (e.g. to dress ledges). */
  onTier?: (tier: number, paths: Path2[]) => void;
}

/**
 * Coursed stone terraces from a signed distance `dist` (≤ 0 = the floor): tier k's riser is a
 * course wall along the iso-line dist = tiers[k].d, from the previous tier's top (0 for the
 * first) up to tiers[k].y, 2–3 courses per tier (`course`, per tier or global), stones aligned
 * to the edge. Each tier top is a flat ledge (build it with `terraceHeight` + your ground mesh)
 * with loose pebbles. Returns the edge paths per tier.
 */
export function coursedTerrace(batch: VoxelBatch, dist: (x: number, z: number) => number, tiers: TerraceTier[], rng: Rng, o: CoursedTerraceOptions): Path2[][] {
  const out: Path2[][] = [];
  const depth = o.depth ?? 0.62;
  tiers.forEach((t, k) => {
    const yPrev = k === 0 ? 0 : tiers[k - 1]!.y;
    const paths = isoLines(dist, t.d, o.bounds, o.step ?? 0.2);
    out.push(paths);
    o.onTier?.(k, paths);
    for (const p of paths) courseWall(batch, p, yPrev, t.y, rng, { ...o, course: t.course ?? o.course });
    if (!o.pebbles) return;
    // Ledge pebbles: between the top course's back and the next riser's face.
    const ledge = (k + 1 < tiers.length ? tiers[k + 1]!.d : t.d + 1.2) - t.d;
    if (ledge < depth + 0.25) return;
    const pb = o.pebbles;
    const base = new THREE.Color(pb.tint ?? '#ffffff');
    for (const p of paths) {
      const { total, at } = pathSampler(p);
      const n = Math.round(total * (pb.perUnit ?? 0.5));
      for (let i = 0; i < n; i++) {
        const s = rng.next() * total, q = at(s), q2 = at(s + 0.05);
        const tx = q2[0] - q[0], tz = q2[1] - q[1], l = Math.hypot(tx, tz) || 1;
        const nx = (-tz / l) * (o.face ?? 1), nz = (tx / l) * (o.face ?? 1);
        const back = depth + 0.08 + rng.next() * (ledge - depth - 0.2);
        const x = q[0] - nx * back, z = q[1] - nz * back;
        if (o.keep && !o.keep(x, z, t.y)) continue;
        if (Math.abs(dist(x, z) - (t.d + back)) > 0.4) continue; // a bend folded the offset
        const sz = 0.06 + rng.next() * 0.11;
        boulder(pb.batch, [x, t.y + sz * 0.22, z], [sz * 1.3, sz * 0.65, sz], rampTint(base, pb.ramp, sz > 0.12 ? 0.5 : -0.2, rng), rng, {
          ry: rng.next() * 3, chamfer: sz * 0.14, jitter: sz * 0.08, topJitter: sz * 0.14, aoBottom: 0.55, topK: 1.25, topOnly: true,
        });
      }
    }
  });
  return out;
}

/**
 * Ground height of a coursed terrace at signed distance `d`: 0 on the floor, tiers[k].y on the
 * ledge of tier k. The step sits 0.65 × `depth` behind each riser face, so a ground grid (step
 * ≤ 0.25) ramps between two vertices hidden inside the course stones.
 */
export function terraceHeight(d: number, tiers: TerraceTier[], depth = 0.62): number {
  let y = 0;
  for (const t of tiers) if (d >= t.d + depth * 0.65) y = t.y;
  return y;
}

/** Distance from `d` forward to the next riser face of a coursed terrace (Infinity past the last). */
export function nextRiser(d: number, tiers: TerraceTier[], depth = 0.62): number {
  for (const t of tiers) if (d < t.d + depth * 0.65) return t.d - d;
  return Infinity;
}

/**
 * Signed distance to a closed plan polygon [x, z][] (negative inside, any winding, non-convex
 * fine). Offsets (iso-lines at d > 0) round the convex corners — terrace edges that bend, not
 * mitre.
 */
export function polygonSdf(poly: Path2): (x: number, z: number) => number {
  return (x, z) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, az] = poly[j]!, [bx, bz] = poly[i]!;
      const ex = bx - ax, ez = bz - az, wx = x - ax, wz = z - az;
      const t = Math.max(0, Math.min(1, (wx * ex + wz * ez) / (ex * ex + ez * ez || 1)));
      d = Math.min(d, Math.hypot(wx - ex * t, wz - ez * t));
      if ((az > z) !== (bz > z) && x < ax + ((z - az) * ex) / (ez || 1e-12)) inside = !inside;
    }
    return inside ? -d : d;
  };
}

/**
 * A ground grid over `bounds` [x0, z0, x1, z1] (`step` world units per quad) with per-vertex
 * height (`height(x, z)`, e.g. terraceHeight of a coursed terrace: the floor and every ledge in
 * ONE mesh), world-space UVs at `tileTexels` texels per tile (TEXEL density) and vertex colour
 * from `color(x, z)` (AO, scorch…). Smooth normals.
 */
export function groundGrid(bounds: [number, number, number, number], step: number, tileTexels: number, height: (x: number, z: number) => number, color?: (x: number, z: number) => [number, number, number]): THREE.BufferGeometry {
  const [x0, z0, x1, z1] = bounds;
  const nx = Math.max(1, Math.round((x1 - x0) / step)), nz = Math.max(1, Math.round((z1 - z0) / step));
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const pos = g.attributes.position!, uv = g.attributes.uv!;
  const col = new Float32Array(pos.count * 3);
  const tile = TEXEL * tileTexels;
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k), z = pos.getZ(k);
    pos.setY(k, height(x, z));
    uv.setXY(k, x / tile, -z / tile);
    col.set(color ? color(x, z) : [1, 1, 1], k * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
