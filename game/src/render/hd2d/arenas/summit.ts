// Crown Plateau — the Champion's hall (HD-2D, `?gfx=hd2d`): a moonlit stone hall on the
// summit. Flagstone floor with an inlaid gold-and-violet crest under the battle, marble
// columns, violet banners, iron braziers with flickering fire, a three-step throne dais where
// Champion Vale waits, and tall arched windows in the back wall: snow falls past them in front
// of a pixel night sky (moon, snowy peaks) and the moon pours cold shafts through them across
// the floor (real wall/mullion shadows from one far spot light = the window-shaped patches).
// Cool moon key vs warm brazier fills. Also the set of the Hall of Fame (`hall: true`).
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { lightBeams, dustMotes, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { cachedTexture } from '../textures';
import type { Grade } from '../pipeline';
import type { SpriteLight } from '../sprite';
import {
  NIGHT, Pieces, bannerGeometry, billboards, flicker, lightPools, litMesh, paintBanner, paintBlock, paintCrest, paintFlames,
  paintIron, paintMarble, paintSky, paintSlabs, radialTexture, shade, skyPlane, snowfall, swayMaterial, TEXEL, type V3,
} from './nightKit';
import type { ArenaDef } from './index';
import { glints } from './outdoorKit';

/** Cold night grade: blue-violet shadows, warm (firelit) highlights, a firm vignette. */
export function summitGrade(): Grade {
  return {
    lift: new THREE.Vector3(0.006, 0.004, 0.016), gamma: new THREE.Vector3(1.07, 1.07, 1.06), gain: new THREE.Vector3(1.03, 1.0, 0.99),
    saturation: 0.82, contrast: 1.06,
    shadowTint: new THREE.Color('#2a2448'), highTint: new THREE.Color('#ffe2b8'), splitAmount: 0.13,
    vignette: 0.22, vignetteSoft: 0.7,
    tiltTop: 1.0, tiltBottom: 0.6, focusTop: 0.8, focusBottom: 0.08,
    dither: 2.0,
    exposure: 1.84,
  };
}

export interface SummitOptions {
  seed?: number;
  quality?: 'high' | 'low';
  /** Hall of Fame staging: the moon key aims at the podium circle instead of the battle. */
  hall?: boolean;
}

/** Layout (world units). Floor y = 0, camera on +z. */
export const SUMMIT = {
  backZ: -6.0,
  leftX: -9.6,
  rightX: 9.4,
  /** Window centres along the back wall, width, sill and spring (arch radius = w/2). */
  windows: [-4.4, 0.4, 5.2],
  winW: 2.0, sill: 1.15, spring: 3.7,
  dais: { x0: -2.6, x1: 3.4, z1: -2.7, step: 0.18, depth: 0.4 },
  throne: new THREE.Vector3(0.4, 0.54, -5.25),
  crest: new THREE.Vector3(0.1, 0, 0.1),
  /** Moonlight direction (from the moon toward the floor). */
  moonDir: new THREE.Vector3(0.5, -1, 1.5).normalize(),
};

type Opening = { c: number; w: number; sill: number; spring: number };

/** Half-width of an arched opening over the band y0..y1 (the widest point in the band), or -1. */
function openingHalf(o: Opening, y0: number, y1: number): number {
  const r = o.w / 2, top = o.spring + r;
  if (y1 <= o.sill + 1e-4 || y0 >= top - 1e-4) return -1;
  const y = Math.max(y0, o.sill);
  if (y <= o.spring) return r;
  return Math.sqrt(Math.max(0, r * r - (y - o.spring) * (y - o.spring)));
}

/**
 * An ashlar wall: courses of staggered cut blocks along `u` with arched openings cut exactly
 * per course; arch rings (voussoirs + keystone), jambs and sills go to `trim`.
 * `place(u0, u1, y0, y1, d0, d1)` maps wall coords (along, up, depth into the wall) to a box.
 */
function masonryWall(stone: Pieces, trim: Pieces, rng: Rng, o: {
  u0: number; u1: number; height: number; thick: number; course: number; openings: Opening[];
  place: (u0: number, u1: number, y0: number, y1: number, d0: number, d1: number) => [V3, V3];
  /** Rotation (rad about Y) that maps wall-local +x (along) / +z (out of the wall) to world. */
  rotY: number;
  /** World position of the wall face at (u, y). */
  at: (u: number, y: number, out: number) => V3;
}) {
  const plinth = 0.55;
  // Plinth course: a deeper, darker base that steps out of the wall.
  for (let u = o.u0; u < o.u1 - 1e-3;) {
    const w = Math.min(o.u1 - u, 0.9 + rng.next() * 0.6);
    const [mn, mx] = o.place(u + 0.01, u + w - 0.01, 0, plinth, -0.14, o.thick);
    stone.aabb(mn, mx, shade(0.72 + rng.next() * 0.1), rng, { aoBottom: 0.5 });
    u += w;
  }
  for (let y = plinth; y < o.height - 1e-3; y += o.course) {
    const y1 = Math.min(o.height, y + o.course);
    // Free intervals of this course between the openings.
    const cuts: [number, number][] = [];
    for (const op of o.openings) { const h = openingHalf(op, y, y1); if (h >= 0) cuts.push([op.c - h, op.c + h]); }
    cuts.sort((a, b) => a[0] - b[0]);
    const spans: [number, number][] = [];
    let s = o.u0;
    for (const [a, b] of cuts) { if (a > s) spans.push([s, a]); s = Math.max(s, b); }
    if (s < o.u1) spans.push([s, o.u1]);
    const row = Math.round((y - plinth) / o.course);
    for (const [a, b] of spans) {
      let u = a - (row % 2 ? 0.35 : 0) * (a === o.u0 ? 1 : 0);
      u = Math.max(a, u);
      while (u < b - 1e-3) {
        let w = 0.6 + rng.next() * 0.65;
        if (b - (u + w) < 0.35) w = b - u; // no slivers at the end
        const ins = 0.012;
        const k = 0.86 + rng.next() * 0.22 - (rng.chance(0.07) ? 0.14 : 0);
        const [mn, mx] = o.place(u + ins, Math.min(b, u + w) - ins, y + ins, y1 - ins, 0, o.thick);
        stone.aabb(mn, mx, shade(k), rng, { aoBottom: 0.8 });
        u += w;
      }
    }
  }
  // Openings: sill, jambs, arch ring of voussoirs with a keystone (one piece set per window).
  for (const op of o.openings) {
    const r = op.w / 2;
    const [smn, smx] = o.place(op.c - r - 0.22, op.c + r + 0.22, op.sill - 0.16, op.sill, -0.2, o.thick + 0.02);
    trim.aabb(smn, smx, shade(1.0), rng);
    for (const side of [-1, 1]) {
      const [a, b] = side < 0 ? [op.c - r - 0.24, op.c - r] : [op.c + r, op.c + r + 0.24];
      const [jmn, jmx] = o.place(a, b, op.sill, op.spring, -0.1, o.thick + 0.02);
      trim.aabb(jmn, jmx, shade(0.95), rng);
    }
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * ((i + 0.5) / n); // 0 = right spring, π = left
      const rr = r + 0.15;
      const p = o.at(op.c + Math.cos(a) * rr, op.spring + Math.sin(a) * rr, 0.05);
      const key = i === (n - 1) / 2;
      const len = (Math.PI * rr) / n + 0.03;
      trim.box(p, [len, key ? 0.48 : 0.36, o.thick + 0.14], shade(key ? 1.12 : 0.92 + (i % 2) * 0.08), rng, [0, o.rotY, a - Math.PI / 2]);
    }
  }
}

/** The hall. Battle mode: kin on the crest, Vale's post on the dais. */
export function buildSummitArena(opts: SummitOptions = {}): ArenaRig {
  const flags = new Set((new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('post') ?? '').split(','));
  const rng = new Rng(opts.seed ?? 31);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-summit-hall';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const L = SUMMIT;

  // ---- textures (session cache)
  const texSlab = cachedTexture('summit-slab', () => paintSlabs(41, NIGHT.slate, 64));
  const texWall = cachedTexture('summit-wall', () => paintBlock(43, NIGHT.wall, 32));
  const texMarble = cachedTexture('summit-marble', () => paintMarble(47, NIGHT.marble, 32));
  const texGold = cachedTexture('summit-gold', () => paintIron(5, NIGHT.gold, 16));
  const texIron = cachedTexture('summit-iron', () => paintIron(7, NIGHT.iron, 16));
  const texRoyal = cachedTexture('summit-royal', () => paintBlock(53, NIGHT.royal, 16));

  const stone = new Pieces(32);   // walls, dais
  const marble = new Pieces(32);  // columns, arches, throne, cornices, balustrade
  const gold = new Pieces(16);    // trims, finials, studs
  const iron = new Pieces(16);    // braziers, window bars
  const royal = new Pieces(16);   // cushions, throne panels
  const glow = new Pieces(16);    // brazier coals (emissive)

  // ---- floor: one grid with baked AO toward walls, columns and the dais
  {
    const x0 = -11, x1 = 11, z0 = L.backZ - 0.2, z1 = 9;
    const nx = Math.round((x1 - x0) / 0.5), nz = Math.round((z1 - z0) / 0.5);
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = g.attributes.position!, uv = g.attributes.uv!;
    const col = new Float32Array(pos.count * 3);
    const tile = TEXEL * 64;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      uv.setXY(k, x / tile, -z / tile);
      const dWall = Math.min(z - L.backZ, x - L.leftX, L.rightX - x);
      let ao = 1 - 0.32 * Math.exp(-dWall / 0.9);
      // Dais skirt.
      const dx = Math.max(L.dais.x0 - 0.5 - x, 0, x - L.dais.x1 - 0.5), dz = Math.max(0, z - L.dais.z1);
      ao *= 1 - 0.22 * Math.exp(-Math.hypot(dx, dz) / 0.45);
      // Column bases.
      for (const px of [-7.7, 7.5]) for (const pz of [-3.4, -0.2, 3.0]) ao *= 1 - 0.3 * Math.exp(-Math.hypot(x - px, z - pz) / 0.6);
      col.set([ao, ao, ao * 1.02], k * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    group.add(litMesh(g, track(surfaceMaterial(texSlab)), false, true));
  }

  // ---- the crest inlaid under the battle (texel-matched: 96 texels = 6 units)
  {
    const size = 96;
    const tex = track(paintCrest(size));
    const g = new THREE.PlaneGeometry(size * TEXEL, size * TEXEL);
    g.rotateX(-Math.PI / 2);
    const m = track(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const crest = litMesh(g, m, false, true);
    crest.position.set(L.crest.x, 0.004, L.crest.z);
    crest.renderOrder = 1;
    group.add(crest);
  }

  // ---- walls: back (3 arched windows), left and right (solid), cornices with a gold band
  const H = 7.4, T = 0.8;
  const openings: Opening[] = L.windows.map((c) => ({ c, w: L.winW, sill: L.sill, spring: L.spring }));
  masonryWall(stone, marble, rng, {
    u0: L.leftX - T, u1: L.rightX + T, height: H, thick: T, course: 0.35, openings,
    place: (u0, u1, y0, y1, d0, d1) => [[u0, y0, L.backZ - d1], [u1, y1, L.backZ - d0]],
    rotY: 0,
    at: (u, y, out) => [u, y, L.backZ - T / 2 + out],
  });
  masonryWall(stone, marble, rng, {
    u0: L.backZ, u1: 9, height: H, thick: T, course: 0.35, openings: [],
    place: (u0, u1, y0, y1, d0, d1) => [[L.leftX - d1, y0, u0], [L.leftX - d0, y1, u1]],
    rotY: Math.PI / 2,
    at: (u, y, out) => [L.leftX - T / 2 + out, y, u],
  });
  masonryWall(stone, marble, rng, {
    u0: L.backZ, u1: 9, height: H, thick: T, course: 0.35, openings: [],
    place: (u0, u1, y0, y1, d0, d1) => [[L.rightX + d0, y0, u0], [L.rightX + d1, y1, u1]],
    rotY: -Math.PI / 2,
    at: (u, y, out) => [L.rightX + T / 2 - out, y, u],
  });
  // Cornice: a gold band and a deep marble ledge high on every wall.
  const cy = 6.15;
  gold.aabb([L.leftX, cy, L.backZ], [L.rightX, cy + 0.16, L.backZ + 0.12], shade(1), rng);
  marble.aabb([L.leftX, cy + 0.16, L.backZ], [L.rightX, cy + 0.5, L.backZ + 0.32], shade(1.05), rng, { aoBottom: 0.7 });
  for (const [x, s] of [[L.leftX, 1], [L.rightX, -1]] as const) {
    gold.aabb([Math.min(x, x + s * 0.12), cy, L.backZ], [Math.max(x, x + s * 0.12), cy + 0.16, 9], shade(1), rng);
    marble.aabb([Math.min(x, x + s * 0.32), cy + 0.16, L.backZ], [Math.max(x, x + s * 0.32), cy + 0.5, 9], shade(1.05), rng, { aoBottom: 0.7 });
  }

  // Window bars: a centre mullion, a transom at the spring line and a ring at the arch.
  for (const c of L.windows) {
    const r = L.winW / 2, z = L.backZ - T * 0.55;
    iron.aabb([c - 0.05, L.sill, z - 0.05], [c + 0.05, L.spring + r, z + 0.05], shade(1), rng);
    iron.aabb([c - r, L.spring - 0.05, z - 0.05], [c + r, L.spring + 0.05, z + 0.05], shade(1), rng);
    iron.aabb([c - r, L.sill + (L.spring - L.sill) * 0.45 - 0.04, z - 0.04], [c + r, L.sill + (L.spring - L.sill) * 0.45 + 0.04, z + 0.04], shade(0.9), rng);
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * ((i + 0.5) / 7), rr = r * 0.55;
      iron.box([c + Math.cos(a) * rr, L.spring + Math.sin(a) * rr, z], [(Math.PI * rr) / 7 + 0.02, 0.07, 0.07], shade(0.9), rng, [0, 0, a - Math.PI / 2]);
    }
  }

  // ---- engaged pilasters on the back wall + free columns along the sides
  const capital = (x: number, z: number, top: number, w: number) => {
    marble.aabb([x - w / 2, top, z - w / 2], [x + w / 2, top + 0.22, z + w / 2], shade(1.08), rng, { aoBottom: 0.8 });
    gold.aabb([x - w / 2 + 0.06, top - 0.1, z - w / 2 + 0.06], [x + w / 2 - 0.06, top, z + w / 2 - 0.06], shade(1), rng);
    marble.aabb([x - w / 2 - 0.08, top + 0.22, z - w / 2 - 0.08], [x + w / 2 + 0.08, top + 0.38, z + w / 2 + 0.08], shade(1.12), rng, { aoBottom: 0.8 });
  };
  const base = (x: number, z: number, w: number) => {
    marble.aabb([x - w / 2 - 0.1, 0, z - w / 2 - 0.1], [x + w / 2 + 0.1, 0.22, z + w / 2 + 0.1], shade(0.95), rng, { aoBottom: 0.55 });
    marble.aabb([x - w / 2, 0.22, z - w / 2], [x + w / 2, 0.42, z + w / 2], shade(1.02), rng);
  };
  for (const x of [-7.4, -2.0, 2.8, 7.6]) {
    const z = L.backZ + 0.28;
    base(x, z, 0.9);
    marble.aabb([x - 0.36, 0.42, L.backZ], [x + 0.36, cy - 0.1, z + 0.3], shade(0.98), rng, { aoBottom: 0.75 });
    capital(x, z, cy - 0.1, 0.9);
  }
  const colTop = 5.7;
  const columns: [number, number][] = [];
  for (const x of [-7.7, 7.5]) for (const z of [-3.4, -0.2, 3.0, 6.2]) columns.push([x, z]);
  for (const [x, z] of columns) {
    base(x, z, 0.92);
    marble.column(x, z, 0.42, colTop, 0.36, shade(1.0), rng);
    gold.aabb([x - 0.4, 1.35, z - 0.4], [x + 0.4, 1.45, z + 0.4], shade(0.95), rng); // gilt collar
    capital(x, z, colTop, 0.92);
    // Architrave beam over the column rows toward the back wall.
  }
  for (const x of [-7.7, 7.5]) marble.aabb([x - 0.46, colTop + 0.38, L.backZ], [x + 0.46, colTop + 0.78, 6.7], shade(1.0), rng, { aoBottom: 0.7 });

  // ---- throne dais: three steps of pale marble (they read against the dark slate floor, so the
  // gilt nosings sit visibly ON the step edges instead of floating as orange rails), each riser
  // a shade darker than its tread, a violet runner on the top
  const D = L.dais;
  for (let s = 0; s < 3; s++) {
    const g = s * 0.4;
    const y1 = (s + 1) * D.step;
    marble.aabb([D.x0 + g, s * D.step, L.backZ], [D.x1 - g, y1, D.z1 - g], shade(0.8 - s * 0.03), rng, { aoBottom: 0.45, topK: 1.4 });
    gold.aabb([D.x0 + g + 0.04, y1 - 0.035, D.z1 - g - 0.01], [D.x1 - g - 0.04, y1 + 0.004, D.z1 - g + 0.012], shade(0.72), rng);
  }
  const daisTop = 3 * D.step;
  royal.aabb([L.throne.x - 0.75, daisTop, L.backZ + 0.3], [L.throne.x + 0.75, daisTop + 0.02, D.z1 - 0.9], shade(0.95), rng);
  gold.aabb([L.throne.x - 0.82, daisTop, D.z1 - 0.98], [L.throne.x + 0.82, daisTop + 0.025, D.z1 - 0.88], shade(1), rng);

  // ---- the throne: marble block, violet cushions, tall back, gilt finials and a crown crest
  {
    const t = L.throne, y = daisTop;
    marble.aabb([t.x - 0.7, y, t.z - 0.45], [t.x + 0.7, y + 0.5, t.z + 0.5], shade(1.05), rng, { aoBottom: 0.6 });
    royal.aabb([t.x - 0.55, y + 0.5, t.z - 0.35], [t.x + 0.55, y + 0.66, t.z + 0.46], shade(1.1), rng);
    marble.aabb([t.x - 0.7, y + 0.5, t.z - 0.7], [t.x + 0.7, y + 2.6, t.z - 0.42], shade(1.0), rng, { aoBottom: 0.8 });
    royal.aabb([t.x - 0.48, y + 0.7, t.z - 0.44], [t.x + 0.48, y + 2.25, t.z - 0.38], shade(1.0), rng);
    gold.aabb([t.x - 0.52, y + 2.25, t.z - 0.45], [t.x + 0.52, y + 2.33, t.z - 0.37], shade(1), rng);
    for (const s of [-1, 1]) {
      marble.aabb([t.x + s * 0.7 - 0.16, y + 0.5, t.z - 0.42], [t.x + s * 0.7 + 0.16, y + 0.95, t.z + 0.5], shade(0.98), rng);
      gold.aabb([t.x + s * 0.7 - 0.18, y + 0.95, t.z - 0.42], [t.x + s * 0.7 + 0.18, y + 1.02, t.z + 0.55], shade(1), rng);
      gold.box([t.x + s * 0.62, y + 2.78, t.z - 0.56], [0.2, 0.2, 0.2], shade(1.1), rng, [0, Math.PI / 4, Math.PI / 4]);
    }
    // Crown crest above the back.
    gold.aabb([t.x - 0.32, y + 2.6, t.z - 0.6], [t.x + 0.32, y + 2.74, t.z - 0.5], shade(1), rng);
    for (const px of [-0.26, 0, 0.26]) gold.aabb([t.x + px - 0.06, y + 2.74, t.z - 0.58], [t.x + px + 0.06, y + (px === 0 ? 3.08 : 2.96), t.z - 0.52], shade(1.05), rng);
  }

  // ---- low marble balustrade along the front (foreground layer under the battle)
  {
    const z = 7.0;
    marble.aabb([-11, 0, z - 0.3], [11, 0.18, z + 0.3], shade(0.95), rng, { aoBottom: 0.6 });
    marble.aabb([-11, 0.78, z - 0.28], [11, 0.92, z + 0.28], shade(1.08), rng);
    for (let x = -10.6; x <= 10.6; x += 0.55) marble.column(x, z, 0.18, 0.78, 0.1, shade(1.0), rng);
  }

  // ---- braziers: iron tripods with a stepped bowl, glowing coals, a flame flipbook on top
  const braziers: V3[] = [[-0.9, 0, -4.4], [1.7, 0, -4.4], [-8.4, 0, -1.8], [8.2, 0, -1.8], [-5.2, 0, 5.4], [5.6, 0, 5.4]];
  // The first two flank the dais front (warm light on the throne steps and the foe's side).
  braziers[0] = [D.x0 - 0.75, 0, D.z1 - 0.2];
  braziers[1] = [D.x1 + 0.75, 0, D.z1 - 0.2];
  const flamePts: { at: THREE.Vector3; row: number; seed: number; scale: number }[] = [];
  braziers.forEach(([x, y, z], i) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      iron.box([x + Math.cos(a) * 0.2, y + 0.42, z + Math.sin(a) * 0.2], [0.07, 0.86, 0.07], shade(0.9), rng, [Math.sin(a) * 0.28, 0, -Math.cos(a) * 0.28]);
    }
    iron.aabb([x - 0.14, y, z - 0.14], [x + 0.14, y + 0.06, z + 0.14], shade(0.8), rng);
    iron.aabb([x - 0.26, y + 0.78, z - 0.26], [x + 0.26, y + 0.9, z + 0.26], shade(1.0), rng);
    iron.box([x, y + 0.98, z], [0.62, 0.18, 0.62], shade(1.1), rng, [0, Math.PI / 4, 0]);
    gold.aabb([x - 0.33, y + 1.06, z - 0.33], [x + 0.33, y + 1.1, z + 0.33], shade(0.9), rng);
    glow.aabb([x - 0.24, y + 1.04, z - 0.24], [x + 0.24, y + 1.12, z + 0.24], new THREE.Color('#ff7a26').multiplyScalar(2.2), rng);
    flamePts.push({ at: new THREE.Vector3(x, y + 1.06, z), row: 0, seed: i * 0.37, scale: 1 });
    flamePts.push({ at: new THREE.Vector3(x + 0.12, y + 1.06, z - 0.05), row: 0, seed: i * 0.37 + 0.5, scale: 0.7 });
  });

  // ---- banners: violet with a gold crown, hanging from the cornice between the windows / columns
  const bannerList: Parameters<typeof bannerGeometry>[0] = [];
  for (const x of [-7.4, -2.0, 2.8, 7.6]) bannerList.push({ top: [x, 5.95, L.backZ + 0.62], normal: [0, 0, 1], w: 1.0, h: 2.5 });
  for (const z of [-1.8, 1.4, 4.6]) {
    bannerList.push({ top: [L.leftX + 0.06, 5.9, z], normal: [1, 0, 0], w: 1.1, h: 2.75 });
    bannerList.push({ top: [L.rightX - 0.06, 5.9, z], normal: [-1, 0, 0], w: 1.1, h: 2.75 });
  }
  const banners = swayMaterial(track(paintBanner(NIGHT.royal, NIGHT.gold, 'crown')));
  track(banners.material);
  const bannerMesh = litMesh(bannerGeometry(bannerList), banners.material, false, true);
  group.add(bannerMesh);
  updates.push(banners.update);

  // ---- merge everything per material
  group.add(litMesh(stone.build(), track(surfaceMaterial(texWall, undefined, true))));
  group.add(litMesh(marble.build(), track(surfaceMaterial(texMarble, undefined, true))));
  group.add(litMesh(gold.build(), track(surfaceMaterial(texGold, '#3a2408', true))));
  group.add(litMesh(iron.build(), track(surfaceMaterial(texIron, undefined, true))));
  group.add(litMesh(royal.build(), track(surfaceMaterial(texRoyal, undefined, true))));
  group.add(litMesh(glow.build(), track(new THREE.MeshBasicMaterial({ vertexColors: true })), false, false));

  // ---- fire
  const flames = billboards(track(paintFlames(4, 12, 16)), 4, 1, [12 * TEXEL, 16 * TEXEL], flamePts, { fps: 9, gain: 1.5 });
  track(flames.mesh.geometry); track(flames.material);
  group.add(flames.mesh);
  updates.push(flames.update);
  // An additive glow quad (stepped pixel halo) round every fire, flickering with it.
  const halo = glints(braziers.map(([x, y, z]) => [x, y + 1.3, z] as [number, number, number]), 1.5, '#ff9a48', 1.1);
  track(halo.points.geometry); track(halo.points.material as THREE.Material);
  group.add(halo.points);
  const haloBase = (halo.points.material as THREE.PointsMaterial).color.clone();
  updates.push((t) => { (halo.points.material as THREE.PointsMaterial).color.copy(haloBase).multiplyScalar(0.75 + 0.45 * flicker(t, 1.1)); });

  // ---- outside: pixel night sky with the moon and snowy peaks, falling snow past the windows
  const skyTex = track(paintSky({
    w: 320, h: 120, seed: 9,
    sky: ['#06070f', '#080a17', '#0a0d1d', '#0d1124', '#10162b', '#131b33', '#17213b', '#1b2744', '#202e4e', '#263758', '#2d4163'],
    horizon: 0.72, stars: 260,
    moon: { x: 70, y: 30, r: 9 },
    ridges: [
      { y: 0.66, amp: 0.2, color: '#1d2645', lit: '#2c3a63', snow: true, jag: 1.2 },
      { y: 0.8, amp: 0.12, color: '#121830', lit: '#1b2443', snow: true },
    ],
  }));
  group.add(skyPlane(skyTex, 64, 24, new THREE.Vector3(0, 2.6, -16), 1.25));
  const snow = snowfall(q === 'high' ? 340 : 170, new THREE.Vector3(-11, -2, -15), new THREE.Vector3(11, 9, L.backZ - T - 0.2), rng);
  track(snow.points.geometry); track(snow.points.material as THREE.Material);
  group.add(snow.points);
  updates.push(snow.update);

  // ---- light: one far, cold moon spot (parallel-ish → window patches through real shadows)
  const focus = opts.hall ? new THREE.Vector3(0.1, 0, -0.6) : new THREE.Vector3(0.2, 0, -1.2);
  const moonColor = new THREE.Color('#c4d2ff');
  const key = new THREE.SpotLight(moonColor, 7.6, 0, 0.3, 0.25, 0);
  key.position.copy(focus).addScaledVector(L.moonDir, -42);
  key.target.position.copy(focus);
  key.castShadow = !flags.has('noshadow');
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 2;
  key.shadow.camera.near = 28;
  key.shadow.camera.far = 60;
  group.add(key, key.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#a8a8d0'), new THREE.Color('#463434'), 2.6);
  group.add(hemi);
  const fill = new THREE.DirectionalLight(new THREE.Color('#b0a0c8'), 0.8);
  fill.position.set(2, 6, 12);
  group.add(fill, fill.target);
  // Warm firelight: real point lights on the dais braziers (high tier), pools everywhere.
  const fireLights: THREE.PointLight[] = [];
  if (q === 'high' && !flags.has('nopoints')) {
    for (const i of [0, 1]) {
      const [x, y, z] = braziers[i]!;
      const p = new THREE.PointLight(new THREE.Color('#ff9442'), 9, 8, 1.4);
      p.position.set(x, y + 1.6, z + 0.2);
      group.add(p);
      fireLights.push(p);
    }
  }
  // Baked warm pools under every fire (flickering with it).
  const pools = lightPools(braziers.map(([x, y, z]) => ({ x, z: z + 0.15, y: y + 0.02, sx: 4.6, sz: 3.8, color: new THREE.Color(1.1, 0.6, 0.26) })), radialTexture('255,170,90'));
  track(pools.mesh.geometry); track(pools.material);
  group.add(pools.mesh);
  updates.push((t) => {
    const k = flicker(t, 0.3);
    pools.material.color.setScalar(0.75 + 0.35 * k);
    fireLights.forEach((p, i) => { p.intensity = 7 + 4 * flicker(t, i * 2.7); });
  });

  // ---- moonbeams through the three windows (+ motes drifting in them)
  const beams: BeamSpec[] = [];
  for (const c of L.windows) {
    for (const [ox, oy] of [[-0.55, 0.15], [0.0, 0.55], [0.5, -0.2], [0.2, 0.9]] as const) {
      const r = L.winW / 2;
      const s = new THREE.Vector3(c + ox * r, L.spring + oy * r - 0.6, L.backZ - 0.1);
      const len = (s.y / -L.moonDir.y) * (0.94 + rng.next() * 0.06);
      beams.push({ start: s, end: s.clone().addScaledVector(L.moonDir, len), width: [0.42, 0.9 + rng.next() * 0.35] });
    }
  }
  // Hall of Fame: a broad moon shaft from high above (the hall is open to the sky) falls on the
  // champion's podium at the centre of the crest (the moon key already aims at the podium circle).
  if (opts.hall) {
    const tgt = new THREE.Vector3(0, 1.0, 0.25);
    const d = new THREE.Vector3(0.18, -1, 0.34).normalize();
    const start = tgt.clone().addScaledVector(d, -9.5);
    beams.push({ start, end: tgt.clone().addScaledVector(d, 1.05), width: [0.9, 2.4] });
    beams.push({ start: start.clone().add(new THREE.Vector3(0.5, 0, 0.2)), end: tgt.clone().addScaledVector(d, 0.9).add(new THREE.Vector3(0.6, 0, 0.1)), width: [0.4, 1.0] });
  }
  const rays = lightBeams(beams, new THREE.Color('#9fb6ff'), 0.17);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  if (!flags.has('norays')) group.add(rays.mesh);
  updates.push(rays.update);
  const motes = dustMotes(beams, q === 'high' ? 34 : 18, rng, '#dbe6ff');
  track(motes.points.geometry); track(motes.points.material as THREE.Material);
  group.add(motes.points);
  updates.push(motes.update);
  // A cold pool where the centre shafts land (the haze the shadowed patches glow inside).
  const moonPools = lightPools([...L.windows.map((c) => {
    const s = new THREE.Vector3(c, L.spring - 0.6, L.backZ);
    const land = s.clone().addScaledVector(L.moonDir, s.y / -L.moonDir.y);
    return { x: (land.x + c) / 2 + 0.3, z: (land.z + L.backZ) / 2 + 1.5, sx: 2.6, sz: 6.5, color: new THREE.Color(0.16, 0.22, 0.42) };
  }), ...(opts.hall ? [{ x: 0.2, z: 0.5, sx: 3.0, sz: 2.4, y: 0.02, color: new THREE.Color(0.08, 0.1, 0.2) }] : [])], radialTexture('200,215,255'));
  track(moonPools.mesh.geometry); track(moonPools.material);
  group.add(moonPools.mesh);

  const spriteLight: SpriteLight = {
    keyDir: L.moonDir.clone().negate(),
    keyColor: new THREE.Color('#c4d0ff').multiplyScalar(0.55),
    sky: new THREE.Color('#c9cdf0').multiplyScalar(0.7),
    ground: new THREE.Color('#5d4656').multiplyScalar(0.6),
    rim: new THREE.Color('#d8e4ff').multiplyScalar(0.6),
  };

  const mine = new THREE.Vector3(-1.3, 0, 1.0), foe = new THREE.Vector3(1.5, 0, -1.0);
  return {
    group,
    spots: [mine, foe],
    // Vale's post: on the dais top, right of the throne, behind and above the foe kin.
    people: [new THREE.Vector3(-2.5, 0, 1.9), new THREE.Vector3(2.15, daisTop, D.z1 - 1.0)],
    trainerExit: new THREE.Vector3(L.throne.x, daisTop, L.throne.z + 0.9),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { motes.setPixelSize(px); snow.setPixelSize(px); },
    dispose() { for (const d of disposables) d.dispose(); group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh || (o as THREE.Points).isPoints) m.geometry.dispose(); }); },
  };
}

export const ARENA: ArenaDef = {
  id: 'summit',
  label: 'Crown Plateau — Champion hall',
  match: [{ route: 'plateau' }],
  build: (o) => buildSummitArena({ seed: o.seed, quality: o.quality }),
  grade: summitGrade,
  background: '#070816',
  fog: '#141a34',
  fogRange: [10, 40],
  // Portrait: a lower camera so the dais and Vale clear the foe panel.
  camera: { portrait: { elev: 0.62, foe: [0.64, 0.38], mine: [0.38, 0.555] } },
};

/**
 * Hall of Fame podiums for the champion hall: octagonal marble drums with gilt caps (the top
 * rank wears a full gold cap). Two meshes. `list`: centre x/z, height, rank (0 = champion).
 */
export function summitPodiums(list: { x: number; z: number; h: number; rank: number }[], seed = 9): THREE.Group {
  const rng = new Rng(seed);
  const marble = new Pieces(32), gold = new Pieces(16);
  for (const p of list) {
    marble.aabb([p.x - 0.62, 0, p.z - 0.62], [p.x + 0.62, 0.14, p.z + 0.62], shade(0.92), rng, { aoBottom: 0.5 });
    marble.column(p.x, p.z, 0.14, p.h - 0.08, 0.5, shade(p.rank === 0 ? 1.1 : 1.0), rng);
    gold.aabb([p.x - 0.56, p.h - 0.08, p.z - 0.56], [p.x + 0.56, p.h, p.z + 0.56], shade(p.rank === 0 ? 1.15 : 0.8), rng);
    if (p.rank === 0) gold.aabb([p.x - 0.4, p.h * 0.45, p.z + 0.49], [p.x + 0.4, p.h * 0.6, p.z + 0.53], shade(1.1), rng);
  }
  const g = new THREE.Group();
  g.add(litMesh(marble.build(), surfaceMaterial(cachedTexture('summit-marble', () => paintMarble(47, NIGHT.marble, 32)), undefined, true)));
  g.add(litMesh(gold.build(), surfaceMaterial(cachedTexture('summit-gilt', () => paintBlock(57, NIGHT.gold, 16)), '#3a2408', true)));
  return g;
}
