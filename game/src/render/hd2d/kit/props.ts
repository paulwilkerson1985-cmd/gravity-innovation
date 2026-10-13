// HD-2D prop builders: few, big, readable set pieces for the background of an arena.
//
// At 480 px internal height a lodge 8 units away gets ~3 px per texel; anything smaller than
// ~0.12 units turns into colour noise. These builders therefore use BIG shapes with grouped
// colours: a bookcase holds 2–3 runs of same-hue book spines per shelf (not random confetti),
// a crate is a box with a darker frame, a brazier is a chunky bowl with a glowing coal bed.
// Everything is appended to VoxelBatches you already own (one draw call per material):
//
//   wood   — plank texture (surfaceMaterial(paintPlanks…, bevel))
//   paint  — neutral grey ramp (paintSteel(…, RAMPS.paint)) tinted by vertex colour: metal,
//            cloth, books, jars
//   glow   — MeshBasicMaterial vertexColors (HDR tints > 1 bloom)
//   stone  — any stone/boulder texture
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import type { V3, VoxelBatch } from '../arena';

export interface PropBatches {
  wood: VoxelBatch;
  paint: VoxelBatch;
  glow?: VoxelBatch;
  stone?: VoxelBatch;
}

const C = (hex: THREE.ColorRepresentation, k = 1) => new THREE.Color(hex).multiplyScalar(k);
const NO_BOTTOM = [false, false, false, true, false, false];

/** Readable book/jar hues (muted so they sit in a warm grade; each run uses ONE of them). */
export const PROP_HUES = ['#3f7a52', '#2f5a8a', '#b3412c', '#d29a36', '#e8dcc0', '#6a4a8e', '#3f9aa8'] as const;

/**
 * A bookcase/shelf unit against a wall (back toward -z unless `ry`): wood frame and shelves,
 * per shelf 2–3 runs of same-hue spines with a 1-texel gap between books, sometimes a jar or a
 * lying stack. `at` = floor centre of the unit's front-bottom edge.
 */
export function bookcase(b: PropBatches, at: V3, rng: Rng, o: { w?: number; h?: number; d?: number; shelves?: number; hues?: readonly string[]; tint?: THREE.ColorRepresentation } = {}) {
  const w = o.w ?? 1.3, h = o.h ?? 1.8, d = o.d ?? 0.45, n = o.shelves ?? 3;
  const [x, y, z] = at;
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d, z1 = z;
  const wood = C(o.tint ?? '#ffffff', 0.92);
  const frame = 0.08;
  // Back panel (a little darker, but light enough that the book runs read against it), sides,
  // top, kick plate.
  b.wood.box([x0, y, z0], [x1, y + h, z0 + 0.06], wood.clone().multiplyScalar(0.86), rng, { skip: NO_BOTTOM });
  for (const sx of [x0, x1 - frame]) b.wood.box([sx, y, z0], [sx + frame, y + h, z1], wood, rng, { skip: NO_BOTTOM });
  b.wood.box([x0, y + h - frame, z0], [x1, y + h, z1], wood.clone().multiplyScalar(1.05), rng, { skip: NO_BOTTOM });
  b.wood.box([x0 + frame, y, z0], [x1 - frame, y + 0.14, z1], wood.clone().multiplyScalar(0.8), rng, { skip: NO_BOTTOM });
  const hues = o.hues ?? PROP_HUES;
  const inner = (h - 0.14 - frame) / n;
  for (let s = 0; s < n; s++) {
    const sy = y + 0.14 + s * inner;
    if (s > 0) b.wood.box([x0 + frame, sy - 0.05, z0 + 0.06], [x1 - frame, sy, z1], wood, rng, { skip: NO_BOTTOM });
    // Runs of books: each run one hue, books of similar height; the shelf is ~80% full.
    let bx = x0 + frame + 0.02;
    const end = x1 - frame - 0.02;
    const runs = 2 + rng.int(2);
    for (let r = 0; r < runs && bx < end - 0.1; r++) {
      const hue = C(rng.pick(hues));
      const runW = Math.min(end - bx, (end - (x0 + frame)) / runs * (0.7 + rng.next() * 0.3));
      const bookH = inner * (0.55 + rng.next() * 0.25);
      if (rng.chance(0.18)) {
        // A jar instead of books.
        const jw = Math.min(0.2, runW);
        b.paint.box([bx, sy, z0 + 0.12], [bx + jw, sy + bookH * 0.7, z1 - 0.1], C('#9ad0c8', 0.9), rng, { skip: NO_BOTTOM });
        b.paint.box([bx - 0.01, sy + bookH * 0.7, z0 + 0.11], [bx + jw + 0.01, sy + bookH * 0.7 + 0.05, z1 - 0.09], C('#7a5a3a'), rng, { skip: NO_BOTTOM });
        bx += jw + 0.06;
        continue;
      }
      if (rng.chance(0.15)) {
        // A lying stack.
        for (let k = 0; k < 3; k++) b.paint.box([bx, sy + k * 0.06, z0 + 0.1], [bx + runW * 0.8, sy + k * 0.06 + 0.055, z1 - 0.06], hue.clone().multiplyScalar(0.85 + k * 0.1), rng, { skip: NO_BOTTOM });
        bx += runW + 0.04;
        continue;
      }
      const bw = 0.08 + rng.next() * 0.03;
      for (let bxx = bx; bxx + bw <= bx + runW; bxx += bw + 1 / 64) {
        const hh = bookH * (0.88 + rng.next() * 0.16);
        b.paint.box([bxx, sy, z0 + 0.1], [bxx + bw, sy + hh, z1 - 0.05], hue.clone().multiplyScalar(0.82 + rng.next() * 0.3), rng, { skip: NO_BOTTOM });
      }
      bx += runW + 0.05;
    }
  }
}

/**
 * A wooden crate with a darker 1-plank frame on every visible edge and a diagonal brace.
 * `at` = floor centre. Stackable (`at[1]` = top of the crate below).
 */
export function crate(b: PropBatches, at: V3, size: number, rng: Rng, o: { ry?: number; tint?: THREE.ColorRepresentation } = {}) {
  const [x, y, z] = at;
  const s = size, f = Math.max(0.06, s * 0.13);
  const tint = C(o.tint ?? '#ffffff', 0.95 + rng.next() * 0.1);
  const dark = tint.clone().multiplyScalar(0.62);
  const ry = o.ry ?? 0;
  const put = (c: V3, sz: V3, col: THREE.Color) => {
    const cx = Math.cos(ry), sn = Math.sin(ry);
    b.wood.rotBox([x + c[0] * cx + c[2] * sn, y + c[1], z - c[0] * sn + c[2] * cx], sz, ry, col, rng);
  };
  put([0, s / 2, 0], [s - 0.02, s - 0.02, s - 0.02], tint);
  // Frame: 4 vertical posts + top and bottom rims (front/back/left/right).
  const h = s / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put([sx * (h - f / 2), s / 2, sz * (h - f / 2)], [f, s, f], dark);
  for (const yy of [f / 2, s - f / 2]) {
    put([0, yy, h - f / 2], [s, f, f], dark); put([0, yy, -h + f / 2], [s, f, f], dark);
    put([h - f / 2, yy, 0], [f, f, s], dark); put([-h + f / 2, yy, 0], [f, f, s], dark);
  }
}

/** A banded barrel (octagonal staves as 8 boxes) with two dark hoops. `at` = floor centre. */
export function barrel(b: PropBatches, at: V3, r: number, h: number, rng: Rng) {
  const [x, y, z] = at;
  const stave = 2 * r * Math.tan(Math.PI / 8) * 1.08;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.wood.rotBox([x + Math.sin(a) * r * 0.92, y + h / 2, z + Math.cos(a) * r * 0.92], [stave, h, r * 0.2], a, C('#ffffff', 0.85 + rng.next() * 0.2), rng);
  }
  b.wood.box([x - r * 0.8, y + h - 0.03, z - r * 0.8], [x + r * 0.8, y + h - 0.01, z + r * 0.8], C('#ffffff', 0.7), rng);
  for (const yy of [0.18, 0.78]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      b.paint.rotBox([x + Math.sin(a) * r * 1.0, y + h * yy, z + Math.cos(a) * r * 1.0], [stave * 1.02, 0.06, 0.03], a, C('#4a4650'), rng);
    }
  }
}

/** A plank table with four legs. `at` = floor centre. */
export function table(b: PropBatches, at: V3, size: [w: number, d: number, h: number], rng: Rng, tint: THREE.ColorRepresentation = '#ffffff') {
  const [x, y, z] = at, [w, d, h] = size;
  const t = C(tint);
  b.wood.box([x - w / 2, y + h - 0.1, z - d / 2], [x + w / 2, y + h, z + d / 2], t.clone().multiplyScalar(1.05), rng);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = x + sx * (w / 2 - 0.1), lz = z + sz * (d / 2 - 0.1);
    b.wood.box([lx - 0.06, y, lz - 0.06], [lx + 0.06, y + h - 0.1, lz + 0.06], t.clone().multiplyScalar(0.72), rng, { skip: NO_BOTTOM });
  }
}

/**
 * A hanging cloth banner with a contrasting trim and a simple original emblem (a ring), a pole
 * on top and a V-cut tail. Faces +z (or rotate with `ry`). `top` = centre of the pole.
 */
export function banner(b: PropBatches, top: V3, rng: Rng, o: { w?: number; h?: number; cloth?: THREE.ColorRepresentation; trim?: THREE.ColorRepresentation; emblem?: THREE.ColorRepresentation; ry?: number } = {}) {
  const w = o.w ?? 0.7, h = o.h ?? 1.4, ry = o.ry ?? 0;
  const cloth = C(o.cloth ?? '#8a2a2a'), trim = C(o.trim ?? '#d8a640'), emblem = C(o.emblem ?? o.trim ?? '#d8a640');
  const [x, y, z] = top;
  const cx = Math.cos(ry), sn = Math.sin(ry);
  const at = (dx: number, dy: number, dz: number): V3 => [x + dx * cx + dz * sn, y + dy, z - dx * sn + dz * cx];
  const put = (dx: number, dy: number, dz: number, sz: V3, col: THREE.Color) => b.paint.rotBox(at(dx, dy, dz), sz, ry, col, rng);
  b.wood.rotBox(at(0, 0, 0), [w + 0.24, 0.07, 0.07], ry, C('#ffffff', 0.8), rng);
  for (const sx of [-1, 1]) b.paint.rotBox(at(sx * (w / 2 + 0.14), 0, 0), [0.1, 0.1, 0.1], ry, trim, rng);
  const body = h * 0.82;
  put(0, -body / 2 - 0.04, 0.02, [w, body, 0.03], cloth);
  // Trim bands down both edges and across the top.
  for (const sx of [-1, 1]) put(sx * (w / 2 - 0.05), -body / 2 - 0.04, 0.035, [0.08, body, 0.02], trim);
  put(0, -0.1, 0.035, [w, 0.08, 0.02], trim);
  // V-cut tail: two tilted halves.
  const tail = h - body;
  for (const sx of [-1, 1]) b.paint.rotBox(at(sx * w / 4, -body - 0.04 - tail / 2 + 0.03, 0.02), [w / 2 * 1.02, tail, 0.03], ry, cloth.clone().multiplyScalar(0.9), rng, 0);
  // Emblem: a ring of 8 blocks with a centre dot (original mark).
  const ey = -body * 0.45;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    put(Math.cos(a) * w * 0.22, ey + Math.sin(a) * w * 0.22, 0.04, [0.08, 0.08, 0.02], emblem);
  }
  put(0, ey, 0.04, [0.09, 0.09, 0.02], emblem.clone().multiplyScalar(1.15));
}

/**
 * A brazier: chunky stone/iron bowl on a pedestal with a glowing coal bed and three flame
 * tongues (emissive, bloom). Returns the point where a warm PointLight would sit (high tier).
 */
export function brazier(b: PropBatches, at: V3, rng: Rng, o: { r?: number; h?: number; flame?: THREE.ColorRepresentation } = {}): THREE.Vector3 {
  const r = o.r ?? 0.32, h = o.h ?? 0.75;
  const [x, y, z] = at;
  const iron = C('#4a4650');
  const shell = b.stone ?? b.paint;
  shell.box([x - r * 0.45, y, z - r * 0.45], [x + r * 0.45, y + h * 0.7, z + r * 0.45], b.stone ? C('#ffffff', 0.85) : iron, rng, { skip: NO_BOTTOM });
  shell.box([x - r * 0.7, y, z - r * 0.7], [x + r * 0.7, y + 0.1, z + r * 0.7], b.stone ? C('#ffffff', 0.75) : iron, rng, { skip: NO_BOTTOM });
  // Bowl: a ring of 8 slabs, wider at the top.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.paint.rotBox([x + Math.sin(a) * r * 0.9, y + h * 0.8, z + Math.cos(a) * r * 0.9], [r * 0.85, h * 0.28, 0.08], a, iron.clone().multiplyScalar(0.9 + (i % 2) * 0.2), rng, -0.25);
  }
  if (b.glow) {
    const coal = C(o.flame ?? '#ff7a2a', 2.2);
    b.glow.box([x - r * 0.75, y + h * 0.78, z - r * 0.75], [x + r * 0.75, y + h * 0.86, z + r * 0.75], coal, rng);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.next();
      const fh = 0.22 + rng.next() * 0.18;
      b.glow.rotBox([x + Math.sin(a) * r * 0.3, y + h * 0.86 + fh / 2, z + Math.cos(a) * r * 0.3], [0.1, fh, 0.1], a, C('#ffc060', 2.8), rng, (rng.next() - 0.5) * 0.3);
    }
  }
  return new THREE.Vector3(x, y + h + 0.35, z);
}

/** A post-and-rail fence along a polyline (2 rails). Posts every `step` units. */
export function fence(b: PropBatches, points: V3[], rng: Rng, o: { h?: number; step?: number; tint?: THREE.ColorRepresentation; post?: number } = {}) {
  const h = o.h ?? 0.7, step = o.step ?? 0.9, ps = o.post ?? 0.1;
  const tint = C(o.tint ?? '#ffffff');
  for (let i = 0; i + 1 < points.length; i++) {
    const a = new THREE.Vector3(...points[i]!), c = new THREE.Vector3(...points[i + 1]!);
    const len = a.distanceTo(c);
    const n = Math.max(1, Math.round(len / step));
    const ry = Math.atan2(c.x - a.x, c.z - a.z);
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue;
      const p = a.clone().lerp(c, k / n);
      b.wood.rotBox([p.x, p.y + h / 2, p.z], [ps, h + (rng.next() - 0.5) * 0.06, ps], ry + (rng.next() - 0.5) * 0.2, tint.clone().multiplyScalar(0.8 + rng.next() * 0.15), rng, (rng.next() - 0.5) * 0.06);
    }
    const mid = a.clone().lerp(c, 0.5);
    for (const yy of [0.35, 0.8]) b.wood.rotBox([mid.x, mid.y + h * yy, mid.z], [0.05, 0.08, len + ps], ry, tint.clone().multiplyScalar(0.95 + rng.next() * 0.1), rng);
  }
}

/** A lantern on a post (wood post, iron cage, glowing core). Returns the light position. */
export function lanternPost(b: PropBatches, at: V3, rng: Rng, o: { h?: number; color?: THREE.ColorRepresentation } = {}): THREE.Vector3 {
  const h = o.h ?? 1.5;
  const [x, y, z] = at;
  b.wood.box([x - 0.06, y, z - 0.06], [x + 0.06, y + h, z + 0.06], C('#ffffff', 0.8), rng, { skip: NO_BOTTOM });
  b.wood.box([x - 0.06, y + h - 0.08, z - 0.06], [x + 0.3, y + h, z + 0.06], C('#ffffff', 0.85), rng);
  b.paint.box([x + 0.14, y + h - 0.4, z - 0.09], [x + 0.32, y + h - 0.08, z + 0.09], C('#3a3640'), rng);
  b.glow?.box([x + 0.16, y + h - 0.36, z - 0.07], [x + 0.3, y + h - 0.12, z + 0.1], C(o.color ?? '#ffb04a', 2.6), rng);
  return new THREE.Vector3(x + 0.23, y + h - 0.24, z + 0.3);
}
