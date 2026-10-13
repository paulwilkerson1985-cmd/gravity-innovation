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

// Ring corners in order around the block (seen from +y), and the face the ring edge after
// corner k runs along: (-,-)→(+,-) is -z (5), (+,-)→(+,+) +x (0), (+,+)→(-,+) +z (4), (-,+)→(-,-) -x (1).
const RING = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const FACE_AFTER = [5, 0, 4, 1] as const;

/** A ring vertex: local undistorted position, its corner (shared jitter), AO, top-drop and chip weights. */
type RV = { p: V3; k: number; ao: number; dy: number; cw: number };

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
  const T = batch.tileTexels, tile = TEXEL * T;
  // Texture variant: a 64-texel atlas holds four 32² variants (textures.ts paintBoulderAtlas);
  // each stone starts in one of them. Smaller tiles: any texel offset.
  const pick = () => (T >= 64 ? (rng.int(2) * 32 + rng.int(10)) / T : rng.int(T) / T);
  const offU = pick(), offV = pick();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), new THREE.Vector3(1, 1, 1));
  const kTop = K_TOP * Math.sqrt(topK / 1.3);
  const formK = o.form ?? 0.16;
  // The form gradient's direction in LOCAL axes (the stone may be rotated).
  const formL = FORM_DIR.clone().applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)).invert());
  // Plan-view chamfer of the vertical edges, its own size per corner (none on the cheap
  // version: 4-vertex rings) — an irregular octagon, never a rounded square.
  const cv = lite ? 0 : c;
  const cutMul = RING.map(() => 0.5 + rng.next() * 2.2);
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
      return tint.clone().multiplyScalar(q.ao * k * f);
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
      emit(quad, axis, (v) => rockFace(v.p[ua]! + h[ua]!, v.p[1] - yb, wFace, -hFace), 1);
    }
  };

  // Rings: foot (+ a foot bevel unless flat), shoulder, the narrow steep and the wide shallow
  // top-edge bevel (≈ a quarter round: 45° point at 0.29 c), top cap inset by c.
  const eps = TEXEL * 0.25;
  const cutAt = (inset: number) => (cv <= 0 ? 0 : Math.max(eps, cv - inset * 0.5));
  const yTop = h[1];
  const r1 = ring(yTop - c, 0, cv, at, 0.6, 1);
  const r2 = ring(yTop - c * 0.29, c * 0.29, cutAt(c * 0.29), at, 0.85, 1);
  const r3 = ring(yTop, c, cutAt(c), at, 1, 1);
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
  const sideRange: [number, number] = [foot[0]!.p[1], r1[0]!.p[1]];
  if (bul > 0) {
    const ym = sideRange[0] + (sideRange[1] - sideRange[0]) * (0.35 + rng.next() * 0.3);
    const mid = ring(ym, -bul, cv + bul * 0.6, (ab + at) / 2 * 1.04, 0.3, 0.35).map((v) => {
      const e = (rng.next() - 0.45) * bul * 2.2; // creases: each ring vertex pushed in or out
      return { ...v, p: [v.p[0] * (1 + e / Math.max(h[0], 1e-3)), v.p[1], v.p[2] * (1 + e / Math.max(h[2], 1e-3))] as V3 };
    });
    band(foot, mid, 'side', 1, K_SIDE, sideRange);
    band(mid, r1, 'side', 1, K_SIDE, sideRange);
  } else band(foot, r1, 'side', 1, K_SIDE);
  band(r1, r2, 'top', K_SHOULDER, K_SHOULDER * 0.96);
  band(r2, r3, 'top', kTop, kTop * 0.95);
  if (skip[2]) return;
  const topCode = (v: RV): Face4 => rockFace(v.p[0] + h[0] - c, h[2] - c - v.p[2], 2 * (h[0] - c), 2 * (h[2] - c));
  if (lite) { emit(r3, 1, topCode, topK); return; }
  // Faceted top: a fan around a raised (or sunk) centre, a little off-centre.
  const peak = o.peak ?? c * (-0.3 + rng.next() * 1.2);
  const ctr: RV = { p: [(rng.next() - 0.5) * h[0] * 0.5, yTop + peak, (rng.next() - 0.5) * h[2] * 0.5], k: 0, ao: at, dy: 0, cw: 0 };
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
