// HD-2D rock kit: rounded, irregular pixel-textured boulders (chamfered blocks), terraced
// boulder walls from a Heightmap, rubble piles and pebble scatter. Everything is emitted into a
// VoxelBatch (one merged mesh per material), shaded by the same baked AO + texel bevel as the
// voxel blocks, so a whole cliff stays ONE draw call.
//
// Why chamfers: a cube with a 1-texel seam still reads "voxel". Cutting every edge and corner
// (a 26-facet chamfered box) and jittering the corners gives each block a lit top bevel and a
// dark under-bevel — the round, hand-shaded boulder of the reference — while keeping the texel
// grid on the big faces. Corners move as a unit (all three facet vertices together), so tops
// tilt and bulge irregularly without opening holes.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { VoxelBatch, type Face4, type Heightmap, type V3 } from '../arena';
import { CELL, LEVEL, TEXEL } from './units';

export interface BoulderOptions {
  /** Edge chamfer in world units (default ≈ 28% of the smallest half-extent, ≥ 1.5 texels). */
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
  /** No bevel along the bottom edges (sits on something; saves 12 of 44 triangles). */
  flatBottom?: boolean;
  /**
   * Cheap "pillow" boulder (18 triangles): straight sides, only the top rim bevelled. Reads
   * the same from the battle camera for blocks seen mostly from above; implies a flat bottom.
   */
  topOnly?: boolean;
  /**
   * Skip faces fully hidden by neighbours, in LOCAL axes: [+x, -x, +y, -y, +z, -z].
   * The bottom (-y) is skipped by default.
   */
  skip?: boolean[];
}

const AX = [0, 1, 2] as const;
const tmp = new THREE.Vector3();

/** Chamfer facet brightness: top bevels catch light, bottom bevels sink into shadow. */
const K_TOP = 1.3, K_SIDE = 0.9, K_BOTTOM = 0.55;

/**
 * One rounded boulder: a chamfered box (6 faces + 12 edge bevels + 8 corner facets), corners
 * jittered as units, flat-shaded, box-mapped in local space at TEXEL density.
 * `center` is the box centre; `size` the full extents before chamfering.
 */
export function boulder(batch: VoxelBatch, center: V3, size: V3, tint: THREE.Color, rng: Rng, o: BoulderOptions = {}) {
  const h: V3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const minH = Math.min(h[0], h[1], h[2]);
  const c = Math.min(o.chamfer ?? Math.max(TEXEL * 1.5, minH * 0.28 + rng.next() * minH * 0.1), minH * 0.48);
  const j = o.jitter ?? 0.035;
  const tj = o.topJitter ?? 0.06;
  const ab = o.aoBottom ?? 0.55, at = o.aoTop ?? 1;
  const topK = o.topK ?? 1.3;
  const skip = o.skip ?? [false, false, false, true, false, false];
  const tile = TEXEL * batch.tileTexels;
  const offU = rng.int(batch.tileTexels) / batch.tileTexels, offV = rng.int(batch.tileTexels) / batch.tileTexels;
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...center), new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), new THREE.Vector3(1, 1, 1));

  // Per corner: jitter (shared by its three facet vertices) and the three vertices.
  type Corner = { s: V3; d: V3; v: [V3, V3, V3] };
  const corners = new Map<string, Corner>();
  const key = (s: V3) => `${s[0]}${s[1]}${s[2]}`;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const s: V3 = [sx, sy, sz];
    const d: V3 = [(rng.next() - 0.5) * 2 * j, sy > 0 ? -rng.next() * tj + (rng.next() - 0.5) * j : 0, (rng.next() - 0.5) * 2 * j];
    const v = AX.map((a) => {
      const p: V3 = [0, 0, 0];
      const flat = o.flatBottom && sy < 0;
      for (const b of AX) p[b] = s[b] * (b === a ? h[b] : flat && b === 1 ? h[b] : h[b] - c);
      return p;
    }) as [V3, V3, V3];
    corners.set(key(s), { s, d, v });
  }
  const corner = (sx: number, sy: number, sz: number) => corners.get(`${sx}${sy}${sz}`)!;
  // Local undistorted → world (with jitter) position, and the AO of a vertex.
  const world = (cn: Corner, p: V3): V3 => { tmp.set(p[0] + cn.d[0], p[1] + cn.d[1], p[2] + cn.d[2]).applyMatrix4(m); return [tmp.x, tmp.y, tmp.z]; };
  const aoOf = (cn: Corner) => (cn.s[1] < 0 ? ab : at);

  // Box-map UVs from the dominant LOCAL axis, so the texture follows the rock when rotated.
  const uvOf = (p: V3, axis: number): [number, number] => {
    const [ua, va] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    return [p[ua]! / tile + offU, p[va]! / tile + offV];
  };

  const emit = (verts: { cn: Corner; p: V3 }[], axis: number, faceAttr: (p: V3) => Face4, k: number) => {
    // Outward orientation check against the local centre (0,0,0).
    const P = verts.map((q) => q.p);
    const cen: V3 = [0, 0, 0];
    for (const p of P) for (const b of AX) cen[b] += p[b] / P.length;
    const e1 = new THREE.Vector3(P[1]![0] - P[0]![0], P[1]![1] - P[0]![1], P[1]![2] - P[0]![2]);
    const e2 = new THREE.Vector3(P[2]![0] - P[0]![0], P[2]![1] - P[0]![1], P[2]![2] - P[0]![2]);
    if (e1.cross(e2).dot(new THREE.Vector3(...cen)) < 0) verts = verts.slice().reverse();
    const W = verts.map((q) => world(q.cn, q.p));
    const col = verts.map((q) => tint.clone().multiplyScalar(aoOf(q.cn) * k));
    const uv = verts.map((q) => uvOf(q.p, axis));
    const fa = verts.map((q) => faceAttr(q.p));
    for (let t = 1; t + 1 < verts.length; t++) {
      const ids = [0, t, t + 1] as const;
      const a = W[ids[0]]!, b = W[ids[1]]!, d = W[ids[2]]!;
      const n = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
      batch.tri([a, b, d], [n.x, n.y, n.z], [uv[ids[0]]!, uv[ids[1]]!, uv[ids[2]]!], [col[ids[0]]!, col[ids[1]]!, col[ids[2]]!], [fa[ids[0]]!, fa[ids[1]]!, fa[ids[2]]!]);
    }
  };

  if (o.topOnly) {
    // Rings: bottom (y = -h), shoulder (y = h - c), top (inset by c). Corners jitter as units.
    const side = new Map<string, V3>();
    const sj = (sx: number, sz: number): V3 => { const k = `${sx}${sz}`; if (!side.has(k)) side.set(k, [(rng.next() - 0.5) * 2 * j, (rng.next() - 0.5) * j, (rng.next() - 0.5) * 2 * j]); return side.get(k)!; };
    const ring = (y: number, sy: number, inset: number, jit: (sx: number, sz: number) => V3) => ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => {
      const cn: Corner = { s: [sx, sy, sz], d: jit(sx, sz), v: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
      return { cn, p: [sx * (h[0] - inset), y, sz * (h[2] - inset)] as V3 };
    });
    const B = ring(-h[1], -1, 0, (sx, sz) => { const d = sj(sx, sz); return [d[0], 0, d[2]]; });
    const M = ring(h[1] - c, 1, 0, sj);
    const T = ring(h[1], 1, c, (sx, sz) => { const d = sj(sx, sz); return [d[0] * 0.7, -rng.next() * tj, d[2] * 0.7]; });
    // Ring edges: 0→1 is -z, 1→2 is +x, 2→3 is +z, 3→0 is -x.
    const sideFace = [5, 0, 4, 1];
    for (let e = 0; e < 4; e++) {
      const a = e, b = (e + 1) % 4;
      const axis = e % 2 === 0 ? 2 : 0;
      const ua = axis === 2 ? 0 : 2;
      const wFace = 2 * h[ua]!, hFace = 2 * h[1] - c;
      if (!skip[sideFace[e]!]) emit([B[a]!, B[b]!, M[b]!, M[a]!], axis, (p) => [p[ua]! + h[ua]!, p[1] + h[1], wFace, -hFace], 1);
      emit([M[a]!, M[b]!, T[b]!, T[a]!], axis, () => [0, 0, -1, K_TOP * Math.sqrt(topK / 1.3)], 1);
    }
    emit(T, 1, (p) => [p[0] + h[0] - c, h[2] - c - p[2], 2 * (h[0] - c), 2 * (h[2] - c)], topK);
    return;
  }

  // Main faces.
  for (const a of AX) for (const sa of [1, -1]) {
    const fi = a * 2 + (sa > 0 ? 0 : 1);
    if (skip[fi]) continue;
    const [b, d] = AX.filter((x) => x !== a) as [number, number];
    const ring: { cn: Corner; p: V3 }[] = [];
    for (const [sb, sd] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const s: V3 = [0, 0, 0]; s[a] = sa; s[b] = sb; s[d] = sd;
      const cn = corner(s[0], s[1], s[2]);
      ring.push({ cn, p: cn.v[a]! });
    }
    // Face-local coords for the texel bevel: u across, v up (sides) or toward -z (top).
    const side = a !== 1;
    const ua = a === 0 ? 2 : 0;
    const wFace = 2 * (h[ua]! - c), hFace = side ? 2 * (h[1] - c) : 2 * (h[2] - c);
    const faceAttr = (p: V3): Face4 => side
      ? [p[ua]! + h[ua]! - c, p[1] + h[1] - c, wFace, -hFace]
      : [p[0] + h[0] - c, h[2] - c - p[2], wFace, hFace];
    emit(ring, a, faceAttr, a === 1 && sa > 0 ? topK : 1);
  }
  // Edge bevels between face (a, sa) and (b, sb), running along axis d.
  for (const a of AX) for (const b of AX) {
    if (b <= a) continue;
    const d = AX.find((x) => x !== a && x !== b)!;
    for (const sa of [1, -1]) for (const sb of [1, -1]) {
      const fa = a * 2 + (sa > 0 ? 0 : 1), fb = b * 2 + (sb > 0 ? 0 : 1);
      if (skip[fa] && skip[fb]) continue;
      if (o.flatBottom && ((a === 1 && sa < 0) || (b === 1 && sb < 0))) continue;
      const pick = (sd: number) => { const s: V3 = [0, 0, 0]; s[a] = sa; s[b] = sb; s[d] = sd; return corner(s[0], s[1], s[2]); };
      const c0 = pick(-1), c1 = pick(1);
      const ring = [{ cn: c0, p: c0.v[a]! }, { cn: c1, p: c1.v[a]! }, { cn: c1, p: c1.v[b]! }, { cn: c0, p: c0.v[b]! }];
      const up = (a === 1 ? sa : b === 1 ? sb : 0);
      const k = up > 0 ? K_TOP * Math.sqrt(topK / 1.3) : up < 0 ? K_BOTTOM : K_SIDE;
      // Dominant axis for UVs: the vertical side for top/bottom bevels, else the first face.
      emit(ring, a === 1 ? b : a, () => [0, 0, -1, k], k > 1 ? 1 : 1);
    }
  }
  // Corner facets.
  for (const cn of corners.values()) {
    const faces = AX.map((a) => a * 2 + (cn.s[a]! > 0 ? 0 : 1));
    if (faces.every((f) => skip[f])) continue;
    if (o.flatBottom && cn.s[1] < 0) continue;
    const k = cn.s[1] > 0 ? K_TOP * 0.95 : K_BOTTOM;
    emit([{ cn, p: cn.v[0] }, { cn, p: cn.v[1] }, { cn, p: cn.v[2] }], 0, () => [0, 0, -1, k], 1);
  }
}

export interface BoulderWallOptions {
  /** World y of level 0 (default 0). */
  baseY?: number;
  /** Probability a block splits into two boulders (default 0.35). */
  split?: number;
  /** Probability a top block merges with its +x neighbour into one wide boulder (default 0.3). */
  merge?: number;
  /** Probability two stacked levels become one tall boulder (default 0.2). */
  tall?: number;
  /** How far boulders bulge past their cell (default 0.05) — closes gaps between neighbours. */
  bulge?: number;
  /** Tint brightness range, low tiers → top tier (default [0.84, 1.14]). */
  shade?: [number, number];
  /** Per-boulder hue drift: a list of tint colours picked at random (default white). */
  tints?: THREE.ColorRepresentation[];
  /**
   * Brightness of the recessed dark core behind each visible block (default 0.3; 0 = none):
   * what shows in the crevices between rounded boulders, like the dark gaps of dry-stone walls.
   */
  core?: number;
  /** Cheap top-bevel-only boulders for every block (low tier). Buried top blocks always use them. */
  lite?: boolean;
}

/**
 * Terraced boulder walls from a Heightmap: every visible (cell × level) block becomes one or
 * two rounded boulders (sometimes merged 2-wide or 2-tall), staggered like dry-stone masonry,
 * darker low down and lighter toward the top tiers, with baked AO. Fully hidden blocks emit
 * nothing. Same contract as `rockColumns` (drop-in replacement).
 */
export function boulderColumns(hm: Heightmap, batch: VoxelBatch, rng: Rng, o: BoulderWallOptions = {}) {
  const baseY = o.baseY ?? 0;
  const pSplit = o.split ?? 0.55, pMerge = o.merge ?? 0.12, pTall = o.tall ?? 0.12;
  const bulge = o.bulge ?? 0.0;
  const core = o.core ?? 0.3;
  const lite = o.lite ?? false;
  const [sLo, sHi] = o.shade ?? [0.84, 1.14];
  const tints = (o.tints ?? ['#ffffff']).map((t) => new THREE.Color(t));
  const used = new Set<string>();
  const covered = (i: number, j: number, top: number) => hm.get(i, j) >= top - 0.01;
  // Cores go in after every boulder, and rows are emitted front (+z, camera side) to back, so
  // early-z rejects hidden fragments instead of shading them (SwiftShader: ~2× faster).
  const cores = new VoxelBatch(batch.tileTexels);
  for (let j = hm.nz - 1; j >= 0; j--) for (let i = 0; i < hm.nx; i++) {
    const levels = hm.get(i, j);
    if (levels <= 0) continue;
    const full = Math.ceil(levels);
    for (let l = 0; l < full; l++) {
      if (used.has(`${i},${j},${l}`)) continue;
      const isTop = l === full - 1;
      let l1 = l + 1;
      // Tall boulder: two stacked levels as one block.
      if (!isTop && l + 2 <= full && rng.chance(pTall)) { l1 = l + 2; used.add(`${i},${j},${l + 1}`); }
      const topLevel = Math.min(levels, l1);
      const blockTop = l1 >= full;
      // Visible at all? (a side neighbour lower than this block's top, or it's the column top)
      const sides = [!covered(i + 1, j, topLevel), !covered(i - 1, j, topLevel), !covered(i, j + 1, topLevel), !covered(i, j - 1, topLevel)];
      if (!blockTop && !sides.some(Boolean)) continue;
      // Wide boulder: merge with the +x neighbour when it has the same height and is free.
      let i1 = i + 1;
      if (blockTop && l1 === l + 1 && hm.get(i + 1, j) === levels && !used.has(`${i + 1},${j},${l}`) && rng.chance(pMerge)) { i1 = i + 2; used.add(`${i + 1},${j},${l}`); }
      const y0 = baseY + l * LEVEL;
      const y1 = baseY + topLevel * LEVEL + (blockTop ? (rng.next() - 0.4) * 0.08 : 0);
      const stagger = (l % 2 ? 0.08 : -0.08);
      const x0 = hm.cx(i) - CELL / 2, x1 = hm.cx(i1 - 1) + CELL / 2;
      const z0 = hm.cz(j) - CELL / 2, z1 = hm.cz(j) + CELL / 2;
      const tierLight = Math.min(1, (l + 1) / 7);
      const base = tints[rng.int(tints.length)]!;
      const shadeOf = () => {
        let s = sLo + (sHi - sLo) * tierLight + (rng.next() - 0.5) * 0.22;
        if (rng.chance(0.07)) s *= 0.8;
        return base.clone().multiplyScalar(s);
      };
      // Faces against a covering neighbour column are hidden.
      const skipFor = (bx0: number, bx1: number): boolean[] => [
        bx1 >= x1 - 1e-3 && !sides[0], bx0 <= x0 + 1e-3 && !sides[1], false, true, !sides[2], !sides[3],
      ];
      const put = (bx0: number, bx1: number, bz0: number, bz1: number, by1: number) => {
        const sx = bx1 - bx0 + bulge * 2, sz = bz1 - bz0 + bulge * 2, sy = by1 - y0 + (blockTop ? 0 : 0.04);
        const jx = (rng.next() - 0.5) * 0.06, jz = (rng.next() - 0.5) * 0.06;
        boulder(batch, [(bx0 + bx1) / 2 + jx, y0 + sy / 2, (bz0 + bz1) / 2 + jz], [sx, sy, sz], shadeOf(), rng, {
          skip: skipFor(bx0, bx1),
          flatBottom: true,
          topOnly: lite || !exposed,
          aoBottom: l === 0 ? 0.42 : 0.6,
          topK: blockTop ? 1.48 : 1.18,
          jitter: 0.02 + rng.next() * 0.02,
          topJitter: blockTop ? 0.06 : 0.02,
        });
      };
      const exposed = sides.some(Boolean);
      if (core > 0 && exposed) {
        // Recessed dark core: fills the grooves between rounded boulders with deep shadow.
        const ins = 0.07;
        cores.box([x0 + ins, y0, z0 + ins], [x1 - ins, y1 - (blockTop ? 0.08 : 0), z1 - ins], new THREE.Color(core, core * 0.92, core * 0.88), rng, {
          skip: [!sides[0], !sides[1], !blockTop, true, !sides[2], !sides[3]], aoBottom: 0.6,
        });
      }
      if (exposed && rng.chance(pSplit) && i1 === i + 1) {
        // Two boulders side by side (along x or z), different heights: breaks the grid.
        const r = 0.38 + rng.next() * 0.24;
        const hA = blockTop ? y1 + (rng.next() - 0.5) * 0.08 : y1, hB = blockTop ? y1 + (rng.next() - 0.6) * 0.1 : y1;
        if (rng.chance(0.8)) {
          const xm = x0 + (x1 - x0) * r + stagger * 0.5;
          put(x0, xm, z0, z1, hA); put(xm, x1, z0, z1, hB);
        } else {
          const zm = z0 + (z1 - z0) * r;
          put(x0 + stagger * 0.4, x1 + stagger * 0.4, z0, zm, hA); put(x0, x1, zm, z1, hB);
        }
      } else {
        put(x0 + stagger * 0.4, x1 + stagger * 0.4, z0, z1, y1);
      }
    }
  }
  batch.append(cores);
}

export interface RubbleOptions {
  /** Pile radius (world units). */
  radius: number;
  /** Number of stones (default from the radius). */
  count?: number;
  /** Height of the heap relative to the radius (default 0.5). */
  heap?: number;
  /** Size of the biggest boulders (default 0.55 × radius, ≤ 0.7). */
  big?: number;
  tint?: THREE.ColorRepresentation;
}

/**
 * A rubble pile: a few big rounded boulders heaped in the middle, medium stones around them and
 * a fringe of small stones spilling onto the floor. Randomly rotated and tilted, partly sunk.
 */
export function rubblePile(batch: VoxelBatch, center: [number, number, number], rng: Rng, o: RubbleOptions) {
  const r = o.radius;
  const n = o.count ?? Math.round(8 + r * 14);
  const heap = o.heap ?? 0.5;
  const big = Math.min(0.7, o.big ?? r * 0.55);
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
    const tint = base.clone().multiplyScalar(0.8 + rng.next() * 0.3);
    boulder(batch, [x, center[1] + lift + sy * 0.4, z], [sx, sy, sz], tint, rng, {
      ry: rng.next() * Math.PI, rx: (rng.next() - 0.5) * 0.35, rz: (rng.next() - 0.5) * 0.35,
      chamfer: Math.max(TEXEL * 1.2, Math.min(sx, sy, sz) * (0.3 + rng.next() * 0.12)),
      jitter: s * 0.08, topJitter: s * 0.1, aoBottom: 0.45, topK: 1.15,
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
      ry: rng.next() * 3, chamfer: s * 0.22, jitter: s * 0.06, topJitter: s * 0.1, aoBottom: 0.55, topK: 1.25,
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
    const wob = (Math.sin(x * 1.3 + z * 0.7 + ph) * 0.6 + Math.sin(z * 2.1 - x * 0.4 + ph * 2) * 0.4) * wobble;
    const d = dist(x, z) - wob;
    let lv = d <= 0 ? 0 : Math.min(max, 1 + Math.floor(d / step));
    const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233 + ph) * 43758.5453;
    const nn = cl - Math.floor(cl);
    if (lv > 0 && lv < max) lv = Math.max(1, lv + (nn > 1 - clusters ? 1 : nn < clusters * 0.6 ? -1 : 0));
    hm.set(i, j, lv);
  }
}
