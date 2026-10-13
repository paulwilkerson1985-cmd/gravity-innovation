// HD-2D rock kit: rounded, irregular pixel-textured boulders (pillow-bevelled blocks), terraced
// boulder walls from a Heightmap, rubble piles and pebble scatter. Everything is emitted into a
// VoxelBatch (one merged mesh per material), shaded by the same baked AO + texel bevel shader as
// the voxel blocks, so a whole cliff stays ONE draw call.
//
// Why pillow bevels: a cube with a 1-texel seam still reads "voxel" (or "crate"). A boulder here
// is a stack of horizontal rings (an octagon in plan: the vertical edges are chamfered too):
// foot → shoulder (the side faces), a steep then a shallow bevel ring over the top edge (a
// rounded, pillow-like silhouette) and the top cap. Side faces carry the "rock face" bevel code
// (no seam; a quantised vertical value gradient, dark foot → lit top), the top cap a soft lit
// rim, the bevel rings fixed brightness steps — bright top planes, mid fronts, dark undersides.
// Corners move as units (every ring vertex of a corner shares its jitter), so tops tilt and
// bulge irregularly without opening holes.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { VoxelBatch, type Face4, type Heightmap, type V3 } from '../arena';
import { CELL, LEVEL, TEXEL } from './units';

export interface BoulderOptions {
  /** Edge rounding in world units (default 38–45% of the smallest half-extent, ≥ 1.5 texels). */
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
   * Outward bulge of the side faces at mid height (world units; default 12% of the smallest
   * half-extent, ≤ 0.05): convex, lumpy sides instead of flat slabs. Not on the cheap version.
   */
  bulge?: number;
  /**
   * Cheap "pillow" boulder (≤ 26 triangles): square in plan, straight sides, only the top rim
   * rounded. Reads the same from the battle camera for blocks seen mostly from above; implies a
   * flat bottom.
   */
  topOnly?: boolean;
  /**
   * Skip faces fully hidden by neighbours, in LOCAL axes: [+x, -x, +y, -y, +z, -z].
   * The bottom (-y) is skipped by default.
   */
  skip?: boolean[];
}

const tmp = new THREE.Vector3();

/** Bevel brightness: the shallow top ring catches light, the steep shoulder less, the foot sinks. */
const K_TOP = 1.3, K_SHOULDER = 1.08, K_SIDE = 0.9, K_BOTTOM = 0.4;

/** Bevel-shader code for a "rock face" (arena.ts addBevel): no seam, (u, v, -(W + 2), ±H). */
const rockFace = (u: number, v: number, w: number, hh: number): Face4 => [u, v, -(w + 2), hh];
/** Bevel-shader code for a bevel facet: no seam, brightness × k. */
const facet = (k: number): Face4 => [0, 0, -1, k];

// Ring corners in order around the block (seen from +y), and the face the ring edge after
// corner k runs along: (-,-)→(+,-) is -z (5), (+,-)→(+,+) +x (0), (+,+)→(-,+) +z (4), (-,+)→(-,-) -x (1).
const RING = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
const FACE_AFTER = [5, 0, 4, 1] as const;

/** A ring vertex: local undistorted position, its corner (shared jitter), AO, top-drop weight. */
type RV = { p: V3; k: number; ao: number; dy: number };

/**
 * One rounded boulder: rings (foot, shoulder, two top-edge bevel rings, top cap), octagonal in
 * plan, corners jittered as units, flat-shaded, box-mapped in local space at TEXEL density.
 * `center` is the box centre; `size` the full extents before rounding.
 */
export function boulder(batch: VoxelBatch, center: V3, size: V3, tint: THREE.Color, rng: Rng, o: BoulderOptions = {}) {
  const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const minH = Math.min(h[0], h[1], h[2]);
  const c = Math.min(o.chamfer ?? Math.max(TEXEL * 1.5, minH * (0.38 + rng.next() * 0.07)), minH * 0.48);
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
  // Plan-view chamfer of the vertical edges (none on the cheap version: 4-vertex rings).
  const cv = lite ? 0 : c * 0.85;
  // Per corner: column jitter (x, z) and a drop of the top rings — tilted, uneven tops.
  const colJ = RING.map(() => [(rng.next() - 0.5) * 2 * j, (rng.next() - 0.5) * 2 * j] as const);
  const drop = RING.map(() => -rng.next() * tj + (rng.next() - 0.5) * j);

  const ring = (y: number, inset: number, cut: number, ao: number, dy: number): RV[] => {
    const out: RV[] = [];
    RING.forEach(([sx, sz], k) => {
      if (cv <= 0) { out.push({ p: [sx * (h[0] - inset), y, sz * (h[2] - inset)], k, ao, dy }); return; }
      const xp: RV = { p: [sx * (h[0] - inset), y, sz * (h[2] - inset - cut)], k, ao, dy }; // on the ±x face
      const zp: RV = { p: [sx * (h[0] - inset - cut), y, sz * (h[2] - inset)], k, ao, dy }; // on the ±z face
      if (k % 2 === 0) out.push(xp, zp); else out.push(zp, xp);
    });
    return out;
  };
  const world = (v: RV): V3 => {
    const d = colJ[v.k]!;
    tmp.set(v.p[0] + d[0], v.p[1] + drop[v.k]! * v.dy, v.p[2] + d[1]).applyMatrix4(m);
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
    const col = verts.map((q) => tint.clone().multiplyScalar(q.ao * k));
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
  // hidden too (the rounded rim between two neighbours stays visible from above), foot bevels with
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
      const wFace = 2 * (h[ua]! - cv), hFace = Math.max(TEXEL, yt - yb);
      emit(quad, axis, (v) => rockFace(v.p[ua]! + h[ua]! - cv, v.p[1] - yb, wFace, -hFace), 1);
    }
  };

  // Rings: foot (+ a foot bevel unless flat), shoulder, the narrow steep and the wide shallow
  // top-edge bevel (≈ a quarter round: 45° point at 0.29 c), top cap inset by c.
  const eps = TEXEL * 0.25;
  const cutAt = (inset: number) => (cv <= 0 ? 0 : Math.max(eps, cv - inset * 0.5));
  const yTop = h[1];
  const r1 = ring(yTop - c, 0, cv, at, 0.6);
  const r2 = ring(yTop - c * 0.29, c * 0.29, cutAt(c * 0.29), at, 0.85);
  const r3 = ring(yTop, c, cutAt(c), at, 1);
  let foot: RV[];
  if (flat) foot = ring(-h[1], 0, cv, ab, 0);
  else {
    const cb = Math.min(c * 0.7, h[1] * 0.4);
    const r0 = ring(-h[1], cb, cutAt(cb), ab * 0.85, 0);
    foot = ring(-h[1] + cb, 0, cv, ab, 0);
    band(r0, foot, 'foot', K_BOTTOM, K_BOTTOM);
    if (!skip[3]) emit(r0, 1, () => facet(K_BOTTOM), 1);
  }
  if (flat && !skip[3]) emit(foot, 1, () => facet(K_BOTTOM), 1);
  // Sides: one band, or two around a bulging, extra-jittered middle ring (lumpy, convex rock).
  const bul = lite ? 0 : o.bulge ?? Math.min(0.05, minH * 0.12);
  const sideRange: [number, number] = [foot[0]!.p[1], r1[0]!.p[1]];
  if (bul > 0) {
    const ym = sideRange[0] + (sideRange[1] - sideRange[0]) * (0.4 + rng.next() * 0.15);
    const mid = ring(ym, -bul, cv + bul * 0.6, (ab + at) / 2 * 1.04, 0.3).map((v) => {
      const e = (rng.next() - 0.3) * bul; // lumps: each ring vertex pushed in or out a little
      return { ...v, p: [v.p[0] * (1 + e / Math.max(h[0], 1e-3)), v.p[1], v.p[2] * (1 + e / Math.max(h[2], 1e-3))] as V3 };
    });
    band(foot, mid, 'side', 1, K_SIDE, sideRange);
    band(mid, r1, 'side', 1, K_SIDE, sideRange);
  } else band(foot, r1, 'side', 1, K_SIDE);
  band(r1, r2, 'top', K_SHOULDER, K_SHOULDER * 0.96);
  band(r2, r3, 'top', kTop, kTop * 0.95);
  if (!skip[2]) emit(r3, 1, (v) => rockFace(v.p[0] + h[0] - c, h[2] - c - v.p[2], 2 * (h[0] - c), 2 * (h[2] - c)), topK);
}

export interface BoulderWallOptions {
  /** World y of level 0 (default 0). */
  baseY?: number;
  /** Share of narrow stones (0.6–0.85 cells wide) along a row (default 0.2). */
  split?: number;
  /** Share of wide stones (1.3–1.8 cells) along a row (default 0.45). */
  merge?: number;
  /** Share of stones that span two levels when the level above tops the same run (default 0.55). */
  tall?: number;
  /** How far boulders bulge past their cell (default -0.04: a 1–2 texel crevice to the next). */
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
  /** Cheap top-bevel-only boulders for every block (low tier). Buried top blocks always use them. */
  lite?: boolean;
}

/**
 * Terraced boulder walls from a Heightmap: every visible level of a row of cells becomes a run
 * of rounded boulders of random width (0.6–1.8 cells, staggered between levels like dry-stone
 * masonry), inset from their cells so a near-black crevice (the recessed core) shows between
 * them, darker low down and lighter toward the top tiers, with baked AO. Tops of a run share one
 * height, so a ledge reads as one continuous lit shelf. Fully hidden blocks emit nothing. Same
 * contract as `rockColumns` (drop-in replacement).
 */
export function boulderColumns(hm: Heightmap, batch: VoxelBatch, rng: Rng, o: BoulderWallOptions = {}) {
  const baseY = o.baseY ?? 0;
  const pSplit = o.split ?? 0.2, pMerge = o.merge ?? 0.45, pTall = o.tall ?? 0.55;
  const bulge = o.bulge ?? -0.04;
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
    return r < pSplit ? 0.6 + rng.next() * 0.25 : r < pSplit + pMerge ? 1.3 + rng.next() * 0.5 : 0.9 + rng.next() * 0.35;
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
      const sideR = sx1 >= xB - 1e-3 && (rightOpen || (tall && !covered(i1, j, (openTop - baseY) / LEVEL)));
      const sideL = sx0 <= xA + 1e-3 && (leftOpen || (tall && !covered(i0 - 1, j, (openTop - baseY) / LEVEL)));
      const exposed = exposedRow || sideR || sideL;
      const y1 = (tall ? upTop : yTop) + (top ? (rng.next() - 0.5) * 0.03 : 0);
      const sy = y1 - y0 + (top ? 0 : 0.04);
      const sx = sx1 - sx0 + bulge * 2, sz = CELL + bulge * 2;
      const jz = (rng.next() - 0.5) * 0.04;
      const base = tints[rng.int(tints.length)]!;
      let shade = sLo + (sHi - sLo) * tierLight + (rng.next() - 0.5) * 0.06;
      if (rng.chance(0.03)) shade *= 0.9;
      boulder(batch, [(sx0 + sx1) / 2, y0 + sy / 2, (z0 + z1) / 2 + jz], [sx, sy, sz], base.clone().multiplyScalar(shade), rng, {
        skip: [!sideR, !sideL, false, true, !front, !back],
        // Rounded feet: the V between stacked stones is a dark crevice line.
        flatBottom: lite || !exposed,
        topOnly: lite || !exposed,
        aoBottom: l === 0 ? 0.3 : 0.45,
        topK: top ? topKTop : 1.18,
        jitter: 0.025 + rng.next() * 0.025,
        topJitter: top ? 0.035 : 0.02,
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
  tint?: THREE.ColorRepresentation;
}

/**
 * A rubble pile: a few big chunky stones heaped in the middle, medium stones around them and
 * a fringe of small stones spilling onto the floor. Randomly rotated and tilted, partly sunk.
 */
export function rubblePile(batch: VoxelBatch, center: [number, number, number], rng: Rng, o: RubbleOptions) {
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
    const tint = base.clone().multiplyScalar(0.85 + rng.next() * 0.25);
    boulder(batch, [x, center[1] + lift + sy * 0.4, z], [sx, sy, sz], tint, rng, {
      ry: rng.next() * Math.PI, rx: (rng.next() - 0.5) * 0.35, rz: (rng.next() - 0.5) * 0.35,
      // Chunky stones: flat facets with a modest rounding (the walls are the pillowy ones).
      chamfer: Math.max(TEXEL * 1.2, Math.min(sx, sy, sz) * (0.17 + rng.next() * 0.06)),
      jitter: s * 0.08, topJitter: s * 0.1, aoBottom: 0.45, topK: 1.2,
    });
  }
}

/**
 * Scatter small stones over a floor rectangle, skipping `keepOut` circles (kin spots!).
 * `area` = [x0, z0, x1, z1].
 */
export function pebbles(batch: VoxelBatch, area: [number, number, number, number], count: number, rng: Rng, keepOut: { x: number; z: number; r: number }[] = [], tint: THREE.ColorRepresentation = '#ffffff') {
  const base = new THREE.Color(tint);
  for (let k = 0; k < count; k++) {
    const x = area[0] + rng.next() * (area[2] - area[0]), z = area[1] + rng.next() * (area[3] - area[1]);
    if (keepOut.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) continue;
    const s = 0.06 + rng.next() * 0.1;
    boulder(batch, [x, s * 0.25, z], [s * 1.3, s * 0.65, s], base.clone().multiplyScalar(0.8 + rng.next() * 0.35), rng, {
      ry: rng.next() * 3, chamfer: s * 0.18, jitter: s * 0.06, topJitter: s * 0.1, aoBottom: 0.55, topK: 1.25, topOnly: true,
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
