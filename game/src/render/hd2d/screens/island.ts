// HD-2D route maps: one floating-island diorama per route theme (meadow, ridge, coast, summit).
//
//   * The island top is ONE unique painted pixel texture (grass and dirt paths / ash, cracks and
//     a glowing lava river / sand and a lagoon / flagstones and snow), alpha-cut to a wobbly
//     outline at texel precision, at half the battle texel size (the map shows the whole island,
//     so its texels land at the same ~2 screen px as everything else).
//   * Under it a rim of rock-kit boulder walls and a hanging cone of boulders (the floating
//     rock), a grass fringe hanging over the lip, small floating rock clusters around it.
//   * Foliage sprites (trees, palms, pines, dead trees, bushes, tufts, flowers) in one mesh;
//     wood/stone/glow voxel props; per-hotspot voxel pieces (grass clump, cave mound, pond,
//     trainer pads) in their own small groups so the scene can pick and wiggle them.
//   * A posterised painted sky with cloud banks behind, pixel cloud billboards drifting in whole
//     texels below and around, one directional key light with cast shadows, a per-theme grade.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { Heightmap, LEVEL, TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, type BeamSpec } from '../arena';
import { RAMPS, cachedTexture, paintBoulder, type Ramp } from '../textures';
import type { Grade, Quality } from '../pipeline';
import type { SpriteLight } from '../sprite';
import { boulder, boulderColumns } from '../kit/rock';
import { lightRig, presetGrade, type LightPreset } from '../kit/lights';
import { pixelWater } from '../kit/water';
import { MEADOW_RAMPS, PETALS } from '../arenas/meadow';
import {
  Foliage, RgbaTile, SpriteAtlas, crispTexture, disposeGroup, hash2, mkMesh, paintBark, paintCanopy, paintEarth, paintFlower, paintTuft, paintTurf, paintTwigs, terraces,
  type SpriteCanvas, type SpriteRect,
} from '../arenas/outdoorKit';
import { RAMPS2, particles } from '../arenas/localKit';
import { CLOUD_RAMPS, cloudBillboards, octSlab, skyBackdrop, valueNoise, type CloudSpec, type ScreenSet, type SkySpec } from './common';

export type IslandTheme = 'meadow' | 'ridge' | 'coast' | 'summit';

/** A hotspot (or trainer post) on the island, in island coordinates (top at y = 0). */
export interface IslandSpot { id: string; kind: string; x: number; z: number; beaten?: boolean }

export interface IslandSet extends ScreenSet {
  /** Ground height of the island top under (x, z) (0, or a ledge/dais top). */
  topAt(x: number, z: number): number;
  /** One group per hotspot / trainer post (pickable; the scene wiggles them on explore). */
  hotspots: Map<string, THREE.Group>;
  /** The champion's dais top on the summit (people stand on it), else 0. */
  daisTop: number;
}

/** Map texel: half the battle texel (the map is seen from twice as far). */
const MT = TEXEL / 2;
/** Island ground texture extent (world units, square, centred). */
const EXT = 12.8;

// ------------------------------------------------------------------ theme specs

interface ThemeSpec {
  light: LightPreset; elev: number; azim: number; keyK: number; hemiK: number;
  /** Light colour overrides (key, hemisphere sky / ground). */
  key?: string; skyC?: string; groundC?: string;
  /** Sun shafts: where they land on the island top, and their colour / strength. */
  beams: [number, number, number][]; beamColor: string; beamK: number;
  sky: SkySpec; clouds: Ramp; background: string; fog: string | null;
  wall: Ramp; wallTint: string[]; under: number;
  fringe: Ramp | null;
  grade(g: Grade): void;
}

const THEMES: Record<IslandTheme, ThemeSpec> = {
  meadow: {
    // Golden afternoon: a warm key low from the back-left, cool blue fill, warm horizon.
    light: 'daylight', elev: 0.62, azim: -0.8, keyK: 1.15, hemiK: 0.9, key: '#ffdcaa', skyC: '#b8cff0', groundC: '#5a4a30',
    beams: [[-1.2, 0.8, 1.9], [1.6, -0.9, 1.3]], beamColor: '#ffe2a8', beamK: 0.13,
    sky: { sky: ['#5b8fd0', '#6c9cd6', '#82acdc', '#9bbde0', '#b7cde0', '#d4dcd8', '#ecdcc4'], banks: [CLOUD_RAMPS.warm, CLOUD_RAMPS.day, CLOUD_RAMPS.warm], bankTop: 0.46, bankBottom: 0.8, seed: 3 },
    clouds: CLOUD_RAMPS.warm, background: '#b7cde0', fog: null,
    wall: RAMPS.boulder, wallTint: ['#ffffff', '#f2e6d6'], under: 0.62,
    fringe: MEADOW_RAMPS.grass,
    grade: (g) => { g.exposure = 1.22; g.saturation = 0.9; g.vignette = 0.3; g.gain.set(1.05, 1.0, 0.93); g.highTint = new THREE.Color('#ffe2a8'); g.splitAmount = 0.16; },
  },
  ridge: {
    light: 'sunset', elev: 0.56, azim: -0.75, keyK: 1.3, hemiK: 1.05, groundC: '#4a2a34',
    beams: [[-0.4, 0.9, 1.8], [2.2, 0.6, 1.2]], beamColor: '#ffb070', beamK: 0.14,
    sky: { sky: ['#3e2a5a', '#57346a', '#7a4276', '#a2527a', '#c8687a', '#e4877c', '#f4a882'], banks: [CLOUD_RAMPS.sunset, CLOUD_RAMPS.sunset, CLOUD_RAMPS.sunset], bankTop: 0.5, bankBottom: 0.82, seed: 5 },
    clouds: CLOUD_RAMPS.sunset, background: '#e8907a', fog: null,
    wall: RAMPS2.basalt, wallTint: ['#ffffff', '#f4e0d8'], under: 0.55,
    fringe: ['#3a2e1e', '#544228', '#6e5a30', '#8a7238', '#a68a44', '#c2a656', '#d8c070'],
    grade: (g) => { g.exposure = 1.18; g.saturation = 0.9; g.vignette = 0.34; g.splitAmount = 0.18; },
  },
  coast: {
    light: 'daylight', elev: 0.8, azim: -0.55, keyK: 1.1, hemiK: 1.0, key: '#fff0d0',
    beams: [[-1.0, 1.2, 1.7], [1.6, -0.6, 1.2]], beamColor: '#fff2c8', beamK: 0.11,
    sky: { sky: ['#3f8ad0', '#4f9ad8', '#62aade', '#78b9e4', '#8fc8ea', '#a8d6ee', '#c4e4f0'], banks: [CLOUD_RAMPS.day, CLOUD_RAMPS.day, CLOUD_RAMPS.day], bankTop: 0.5, bankBottom: 0.82, seed: 7 },
    clouds: CLOUD_RAMPS.day, background: '#8fc8ea', fog: null,
    wall: RAMPS2.sandstone, wallTint: ['#ffffff', '#f6ece0'], under: 0.6,
    fringe: RAMPS2.turf,
    grade: (g) => { g.exposure = 1.2; g.saturation = 0.92; g.vignette = 0.26; },
  },
  summit: {
    light: 'sunset', elev: 0.6, azim: 0.7, keyK: 0.95, hemiK: 1.0, skyC: '#a8a0d8', groundC: '#2a2440',
    beams: [[0.2, -1.0, 1.6]], beamColor: '#ffd8a8', beamK: 0.18,
    sky: { sky: ['#1e1a40', '#2a2450', '#3a3266', '#4e427c', '#685490', '#8668a2', '#b08cb0'], banks: [CLOUD_RAMPS.dusk, CLOUD_RAMPS.dusk, CLOUD_RAMPS.dusk], bankTop: 0.5, bankBottom: 0.82, seed: 9 },
    clouds: CLOUD_RAMPS.dusk, background: '#685490', fog: null,
    wall: RAMPS.stone, wallTint: ['#ffffff', '#e8e8f4'], under: 0.6,
    fringe: null,
    grade: (g) => { g.exposure = 1.22; g.saturation = 0.88; g.vignette = 0.32; g.shadowTint = new THREE.Color('#2a2050'); },
  },
};

// ------------------------------------------------------------------ island outline

/** Radius of the island outline at angle a (polar wobble), world units. */
function outline(a: number, seed: number): number {
  return 4.95 + 0.32 * Math.sin(3 * a + seed) + 0.18 * Math.sin(5 * a + seed * 2.1) + 0.1 * Math.sin(9 * a + seed * 0.7);
}

// ------------------------------------------------------------------ sprite painters

/** Hanging grass over the island lip (strands from the top row down). */
function paintFringe(p: SpriteCanvas, r: Rng, ramp: Ramp) {
  for (let x = 0; x < p.w; x++) {
    const len = 3 + r.int(4) + (r.chance(0.35) ? 3 + r.int(5) : 0);
    for (let y = 0; y < len; y++) p.band(x, y, ramp, ramp.length - 3 - y * 0.55 - (y === len - 1 ? 0.8 : 0));
  }
}

/** A leaning palm: a ringed, curved trunk and a crown of drooping, leafleted fronds. */
function paintPalm(p: SpriteCanvas, r: Rng, bark: Ramp, leaf: Ramp) {
  const { w, h } = p;
  const bx = w / 2, top = 14, lean = (r.chance(0.5) ? 1 : -1) * (5 + r.int(4));
  let cx = bx, cy = top;
  for (let y = h - 1; y >= top; y--) {
    const t = (h - 1 - y) / (h - 1 - top);
    const x = bx + lean * t * t;
    const wd = 2.4 - t * 0.6;
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) > wd) continue;
      const ring = (h - y) % 4 === 0 ? -1.2 : 0;
      p.band(x + dx, y, bark, 3.2 - dx * 0.7 + ring);
    }
    if (y === top) { cx = x; cy = y; }
  }
  // Coconuts under the crown.
  for (const [dx, dy] of [[-1, 2], [1, 2], [0, 3]] as const) { p.set(cx + dx, cy + dy, '#3a2414'); p.set(cx + dx, cy + dy - 1, '#5c3a1e'); }
  // Fronds: parabolic arcs with leaflets, shaded lighter on top.
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const ang = -Math.PI + (f / (fronds - 1)) * Math.PI + (r.next() - 0.5) * 0.25;
    const len = 12 + r.int(5);
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      const x = cx + Math.cos(ang) * s;
      const y = cy - Math.sin(-ang) * s * 0.55 + t * t * 9;
      const shade = 4.6 - t * 1.8;
      p.band(x, y, leaf, shade);
      p.band(x, y + 1, leaf, shade - 1.6);
      // Leaflets hanging off both sides.
      if (s > 2 && s % 2 === 0) for (let k = 1; k <= 3 - Math.floor(t * 2); k++) { p.band(x + k * 0.3, y + 1 + k, leaf, shade - 1 - k * 0.5); p.band(x - k * 0.3, y + 1 + k, leaf, shade - 1.4 - k * 0.5); }
    }
  }
}

/** A snowy pine: stacked jagged tiers, lit from the upper left, snow caps on each tier. */
function paintPine(p: SpriteCanvas, r: Rng, leaf: Ramp, snow: Ramp, bark: Ramp) {
  const { w, h } = p;
  const cx = w / 2;
  for (let y = h - 6; y < h; y++) for (let dx = -1; dx <= 1; dx++) p.band(cx + dx, y, bark, 2.6 - dx);
  const tiers = 4;
  for (let k = 0; k < tiers; k++) {
    const y0 = 2 + k * ((h - 8) / tiers) * 0.95, y1 = y0 + (h - 8) / tiers * 1.25;
    for (let y = Math.floor(y0); y < y1 && y < h - 4; y++) {
      const t = (y - y0) / (y1 - y0);
      const half = (2 + (k + 1) * 3.2) * t + 1;
      for (let x = Math.floor(cx - half); x <= cx + half; x++) {
        const jag = (y1 - y < 2 && (x + k) % 3 === 0) ? 1 : 0;
        if (jag) continue;
        const side = (x - cx) / Math.max(1, half);
        const v = 3.6 - side * 1.6 - t * 1.2 + (hash2(x, y, k) < 0.15 ? -0.8 : 0);
        p.band(x, y, leaf, v);
        // Snow on the upper side of each tier.
        if (t < 0.3 + (side < 0 ? 0.15 : 0) && hash2(x, y, 9) < 0.85) p.band(x, y, snow, 4.5 - side * 1.5 - t * 4);
      }
    }
  }
  void r;
}

// ------------------------------------------------------------------ pixel UI sprites

const pixelSprite = (rows: string[], pal: Record<string, string>): THREE.CanvasTexture => {
  const h = rows.length, w = rows[0]!.length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const col = pal[ch]; if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } }));
  return crispTexture(c);
};

const GEM = ['...o...', '..oyo..', '.oywyo.', 'oywyyyo', 'oyyyyso', '.oyyso.', '..oso..', '...o...'];
const BADGE_ALERT = ['..ooooo..', '.orrrrro.', 'orrrwrrro', 'orrrwrrro', 'orrrwrrro', 'orrrrrrro', 'orrrwrrro', '.orrrrro.', '..ooooo..'];
const BADGE_DONE = ['..ooooo..', '.ogggggo.', 'oggggggwo', 'ogggggwgo', 'ogwggwggo', 'oggwwgggo', 'ogggggggo', '.ogggggo.', '..ooooo..'];

// ------------------------------------------------------------------ the builder

export function buildIslandSet(quality: Quality, theme: IslandTheme, spots: IslandSpot[], o: { player: [number, number]; seed?: number }): IslandSet {
  const T = THEMES[theme];
  const q = quality;
  const low = q === 'low';
  const seed = o.seed ?? (theme.length * 31 + theme.charCodeAt(0));
  const rng = new Rng(seed);
  const group = new THREE.Group();
  group.name = `hd2d-island-${theme}`;
  const extra: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];
  const pxSize: ((px: number) => void)[] = [];
  const hotspots = new Map<string, THREE.Group>();
  const wild = spots.filter((s) => s.kind !== 'trainer');
  const trainers = spots.filter((s) => s.kind === 'trainer');

  const R = (a: number) => outline(a, seed * 0.37);
  const edge = (x: number, z: number) => R(Math.atan2(z, x)) - Math.hypot(x, z); // + inside
  const inside = (x: number, z: number) => edge(x, z) > 0;

  // Summit: the champion's dais at the back; everything else stands on the flat top (y = 0)
  // or on the raised back ledges / crags (heightmap `hmL`, in LEVELs).
  const dais = theme === 'summit' ? { x: 0, z: -1.3, r: 1.5, top: 0.36 } : null;
  const hmL = new Heightmap(16, 16, -7.2, -7.2);
  const crags: [number, number, number, number][] = theme === 'ridge' ? [[-3.0, -2.6, 1.55, 3], [3.0, -2.7, 1.15, 2]] : theme === 'summit' ? [[-2.9, -2.9, 1.3, 3], [2.9, -3.0, 1.2, 2.5]] : [];
  for (let j = 0; j < hmL.nz; j++) for (let i = 0; i < hmL.nx; i++) {
    const x = hmL.cx(i), z = hmL.cz(j);
    let lv = 0;
    if (theme === 'meadow' && edge(x, z) > 0.55) {
      if (z < -2.85 + Math.sin(x * 0.9) * 0.4) lv = 0.5;
      if (z < -3.75 + Math.sin(x * 1.3 + 1) * 0.3) lv = 1;
    } else if (theme === 'coast' && edge(x, z) > 0.55 && z < -2.9 + Math.sin(x * 1.1) * 0.35 && x > -1.2) lv = 0.5;
    for (const [cx, cz, r, h] of crags) {
      const d = Math.hypot(x - cx, (z - cz) * 1.2);
      if (d < r && edge(x, z) > 0.3) lv = Math.max(lv, Math.max(1, Math.round(h * (1 - (d / r) * 0.75))));
    }
    hmL.set(i, j, lv);
  }
  const ledgeAt = (x: number, z: number) => { const [i, j] = hmL.cell(x, z); const v = hmL.get(i, j); return v >= 90 ? 0 : v * LEVEL; };
  const topAt = (x: number, z: number) => (dais && Math.hypot(x - dais.x, (z - dais.z) * 1.15) < dais.r * 0.78 ? dais.top : ledgeAt(x, z));

  // Keep-out circles (paths, people, hotspots) for the scatter.
  const keep: { x: number; z: number; r: number }[] = [
    { x: o.player[0], z: o.player[1], r: 0.8 },
    ...wild.map((s) => ({ x: s.x, z: s.z, r: s.kind === 'cave' ? 1.5 : 1.15 })),
    ...trainers.map((s) => ({ x: s.x, z: s.z, r: 0.8 })),
  ];
  if (dais) keep.push({ x: dais.x, z: dais.z, r: dais.r + 0.4 });
  for (const [cx, cz, r] of crags) keep.push({ x: cx, z: cz, r: r + 0.1 });
  const blocked = (x: number, z: number, pad = 0) => keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + pad);

  // Paths: from the front edge past the player to a hub, then out to every spot.
  const hub = { x: 0, z: 0.1 };
  const paths: [number, number, number, number][] = [[o.player[0], 5.4, o.player[0], o.player[1]], [o.player[0], o.player[1], hub.x, hub.z]];
  for (const s of spots) paths.push([hub.x, hub.z, s.x * 0.86, s.z * 0.86]);
  const pathD = (x: number, z: number) => {
    let d = 99;
    for (const [ax, az, bx, bz] of paths) {
      const abx = bx - ax, abz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
      d = Math.min(d, Math.hypot(x - ax - abx * t, z - az - abz * t));
    }
    return d;
  };
  const onPath = (x: number, z: number, r = 0.55) => pathD(x, z) < r;

  // ---- sprite atlas (foliage, fringe, flora per theme)
  const atlas = new SpriteAtlas(512);
  const leaf = theme === 'coast' ? MEADOW_RAMPS.leafWarm : MEADOW_RAMPS.leaf;
  const grassRamp: Ramp = theme === 'ridge' ? ['#2e2618', '#463a22', '#5e4e2a', '#786434', '#94803e', '#ae9a4c', '#c8b464'] : theme === 'coast' ? RAMPS2.turf : MEADOW_RAMPS.grass;
  if (theme === 'meadow') {
    for (let k = 0; k < 3; k++) atlas.add('tree', 88, 74, (p) => paintCanopy(p, new Rng(100 + k), leaf, { clumps: 8 }));
    for (let k = 0; k < 2; k++) atlas.add('bush', 46, 32, (p) => paintCanopy(p, new Rng(200 + k), MEADOW_RAMPS.leaf, { clumps: 6 }));
  } else if (theme === 'ridge') {
    for (let k = 0; k < 3; k++) atlas.add('tree', 56, 64, (p) => paintTwigs(p, new Rng(150 + k), MEADOW_RAMPS.bark, 5, 1.1));
    for (let k = 0; k < 2; k++) atlas.add('bush', 34, 22, (p) => paintTwigs(p, new Rng(210 + k), ['#2a1e14', '#3e2c1c', '#564028', '#6e5634', '#8a6e44'], 4, 1.4));
  } else if (theme === 'coast') {
    for (let k = 0; k < 3; k++) atlas.add('tree', 44, 62, (p) => paintPalm(p, new Rng(160 + k), MEADOW_RAMPS.wood, MEADOW_RAMPS.leafWarm));
    for (let k = 0; k < 2; k++) atlas.add('bush', 40, 26, (p) => paintCanopy(p, new Rng(220 + k), MEADOW_RAMPS.leafWarm, { clumps: 5, flat: 0.9 }));
  } else {
    for (let k = 0; k < 3; k++) atlas.add('tree', 38, 60, (p) => paintPine(p, new Rng(170 + k), MEADOW_RAMPS.leaf, RAMPS.snow, MEADOW_RAMPS.bark));
    for (let k = 0; k < 2; k++) atlas.add('bush', 30, 20, (p) => paintCanopy(p, new Rng(230 + k), MEADOW_RAMPS.leaf, { clumps: 4, flat: 0.9 }));
  }
  for (let k = 0; k < 3; k++) atlas.add('tuft', 16, 13, (p) => paintTuft(p, new Rng(300 + k), grassRamp, 9));
  for (let k = 0; k < 3; k++) atlas.add('tall', 20, 26, (p) => paintTuft(p, new Rng(320 + k), grassRamp, 14, 1.3));
  if (T.fringe) for (let k = 0; k < 4; k++) atlas.add('fringe', 15, 14, (p) => paintFringe(p, new Rng(400 + k), T.fringe!), [7.5, 0]);
  const petals = theme === 'ridge' ? (['orange', 'yellow'] as const) : theme === 'summit' ? (['white', 'violet'] as const) : (['red', 'pink', 'yellow', 'white', 'violet', 'blue'] as const);
  for (const key of petals) atlas.add(`flowers-${key}`, 22, 18, (p) => {
    const r = new Rng(500 + key.charCodeAt(0) * 3 + key.length);
    paintTuft(p, r, grassRamp, 5, 0.8);
    for (let f = 0; f < 4; f++) paintFlower(p, r, grassRamp, PETALS[key], key === 'yellow' ? '#7a4a12' : '#f6d64a', 3 + r.int(16), 17, 6 + r.int(9), r.chance(0.6) ? 2 : 1);
  });
  const atlasTex = atlas.texture();
  extra.push(atlasTex);
  const fol = new Foliage(atlas);
  const S = (k = 1) => MT * k; // sprite world scale per texel

  // ---- ground: one unique painted texture (alpha = outline)
  const N = Math.round(EXT / MT);
  const tile = new RgbaTile(N, N);
  const glowTile = theme === 'ridge' ? new RgbaTile(N, N) : null;
  const wx = (x: number) => -EXT / 2 + (x + 0.5) * MT, wz = (y: number) => -EXT / 2 + (y + 0.5) * MT;
  paintGround(theme, tile, glowTile, wx, wz, { inside, edge, pathD, spots, dais, seed });
  const groundTex = crispTexture(tile.toCanvas());
  groundTex.flipY = false;
  extra.push(groundTex);
  let glowTex: THREE.CanvasTexture | null = null;
  if (glowTile) { glowTex = crispTexture(glowTile.toCanvas()); glowTex.flipY = false; extra.push(glowTex); }
  {
    // Quads over every cell touching the island (alpha test cuts the exact outline).
    const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
    const C = 0.4;
    for (let z = -EXT / 2; z < EXT / 2; z += C) for (let x = -EXT / 2; x < EXT / 2; x += C) {
      if (edge(x + C / 2, z + C / 2) < -C) continue;
      const b = pos.length / 3;
      for (const [dx, dz] of [[0, 0], [C, 0], [C, C], [0, C]] as const) {
        pos.push(x + dx, 0, z + dz);
        uv.push((x + dx + EXT / 2) / EXT, (z + dz + EXT / 2) / EXT);
        nor.push(0, 1, 0);
      }
      idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    const m = new THREE.MeshLambertMaterial({ map: groundTex, alphaTest: 0.5 });
    if (glowTex) { m.emissive = new THREE.Color(2.4, 2.2, 2.0); m.emissiveMap = glowTex; }
    const ground = mkMesh(g, m, false, true);
    ground.name = 'hd2d-island-ground';
    group.add(ground);
  }

  // ---- rock: rim walls (boulder columns just under the top) + the hanging underside
  const rock = new VoxelBatch(16);
  {
    const hm = new Heightmap(16, 16, -7.2, -7.2);
    for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
      const x = hm.cx(i), z = hm.cz(j);
      hm.set(i, j, edge(x, z) > -0.25 ? 3 : 0);
    }
    boulderColumns(hm, rock, rng, { baseY: -2.1 - 0.07, tints: T.wallTint, shade: [0.62, 1.05], lite: low, protrude: 0.1 });
    // The hanging cone: rings of boulders shrinking and darkening downward, a dark core.
    const rings = low ? 4 : 5;
    for (let k = 0; k < rings; k++) {
      const y = -2.6 - k * 0.62;
      const shrink = 0.86 - k * 0.17;
      const n = Math.max(5, Math.round(26 * shrink));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.next() * 0.25 + k * 0.4;
        const r = R(a) * shrink * (0.92 + rng.next() * 0.1);
        const s = 0.75 + rng.next() * 0.35 - k * 0.06;
        const tint = new THREE.Color(T.wallTint[rng.int(T.wallTint.length)]!).multiplyScalar((T.under - k * 0.07) * (0.9 + rng.next() * 0.2));
        boulder(rock, [Math.cos(a) * r, y, Math.sin(a) * r], [s * 1.2, s * 0.95, s], tint, rng, { ry: -a + (rng.next() - 0.5) * 0.5, rx: (rng.next() - 0.5) * 0.3, aoBottom: 0.45, topK: 1.0 });
      }
      // Core: big dark blocks fill the gaps between ring stones.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + k;
        const r = R(a) * shrink * 0.55;
        boulder(rock, [Math.cos(a) * r, y + 0.1, Math.sin(a) * r], [1.6, 0.9, 1.6], new THREE.Color(0.22, 0.2, 0.22), rng, { ry: a, aoBottom: 0.5, topK: 1.0 });
      }
    }
    // The tip.
    boulder(rock, [0.2, -2.6 - rings * 0.62, 0.3], [0.9, 0.8, 0.8], new THREE.Color(0.32, 0.3, 0.3), rng, { aoBottom: 0.4 });
    // Floating rock clusters beside the island.
    const floats: [number, number, number, number][] = [[-6.6, -1.6, 1.4, 0.55], [6.4, -2.4, -1.2, 0.7], [-5.4, -3.0, -4.4, 0.45], [5.6, -0.9, 3.0, 0.38]];
    for (const [x, y, z, s] of floats.slice(0, low ? 2 : 4)) {
      const tint = new THREE.Color(T.wallTint[0]!).multiplyScalar(0.9);
      boulder(rock, [x, y, z], [s * 1.6, s, s * 1.3], tint, rng, { ry: rng.next() * 3, aoBottom: 0.5, topK: 1.4 });
      boulder(rock, [x + s * 0.2, y - s * 0.75, z + 0.1], [s * 1.1, s * 0.8, s * 0.9], tint.clone().multiplyScalar(0.7), rng, { ry: rng.next() * 3, aoBottom: 0.4 });
      boulder(rock, [x - s * 0.1, y - s * 1.35, z], [s * 0.6, s * 0.6, s * 0.5], tint.clone().multiplyScalar(0.55), rng, { ry: rng.next() * 3, aoBottom: 0.4 });
    }
  }
  // Crags (ridge / summit): boulder columns on the ledge heightmap, in the same rock batch.
  if (crags.length) {
    const hmC = new Heightmap(hmL.nx, hmL.nz, hmL.x0, hmL.z0);
    for (let k = 0; k < hmL.h.length; k++) hmC.h[k] = hmL.h[k]! >= 1 ? hmL.h[k]! : 0;
    boulderColumns(hmC, rock, rng, { tints: T.wallTint, shade: [0.78, 1.18], lite: low, deep: 0.3 });
  }
  const wallTex = cachedTexture(`scr-wall-${theme}`, () => paintBoulder(41 + seed % 7, 32, T.wall));
  group.add(mkMesh(rock.build(), extra[extra.push(surfaceMaterial(wallTex, undefined, true, false)) - 1] as THREE.Material));

  // ---- grass fringe hanging over the lip
  if (T.fringe) {
    const steps = low ? 70 : 110;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = R(a);
      const nx = Math.cos(a), nz = Math.sin(a);
      const px = nx * (r + 0.02), pz = nz * (r + 0.02);
      const rect = atlas.get('fringe', rng);
      const w = rect.w * MT * 1.25, hh = rect.h * MT * (1.1 + rng.next() * 0.5);
      const rx = nz, rz = -nx; // right, seen from outside
      const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.9 + rng.next() * 0.2);
      fol.quad(rect, [px - rx * w / 2, -hh, pz - rz * w / 2], [px + rx * w / 2, -hh, pz + rz * w / 2], [px + rx * w / 2, 0.02, pz + rz * w / 2], [px - rx * w / 2, 0.02, pz - rz * w / 2], [nx, 0, nz], tint, rng.chance(0.5));
    }
  }

  // ---- props batches
  const trunks = new VoxelBatch(16);
  const wood = new VoxelBatch(16);
  const stone = new VoxelBatch(16);
  const glow = new VoxelBatch(16);
  const W = (k = 1) => new THREE.Color(1, 1, 1).multiplyScalar(k);

  // ---- raised turf ledges (meadow / coast): earth sides, turf tops, a grass lip
  if (theme === 'meadow' || theme === 'coast') {
    const hmT = new Heightmap(hmL.nx, hmL.nz, hmL.x0, hmL.z0);
    hmT.h.set(hmL.h);
    const sides = new VoxelBatch(16), tops = new VoxelBatch(16);
    terraces(hmT, sides, tops, rng, {
      topK: 1.0, lip: 0.07,
      fringe: T.fringe ? { foliage: fol, sprite: 'fringe', rng: new Rng(7), chance: 0.9, long: 0.5 } : null,
      rocks: { batch: stone, chance: 0.12 },
    });
    const texEarth = cachedTexture(`scr-earth-${theme}`, () => paintEarth(31, theme === 'coast' ? RAMPS2.sandstone : MEADOW_RAMPS.earth));
    const texTurf = cachedTexture(`scr-turf-${theme}`, () => paintTurf(32, theme === 'coast' ? RAMPS2.sand : MEADOW_RAMPS.turf, 32, { lo: 2.2, hi: 4.6, flecks: 0.06 }));
    group.add(mkMesh(sides.build(), surfaceMaterial(texEarth, undefined, true)), mkMesh(tops.build(), surfaceMaterial(texTurf, undefined, false)));
  }

  /** A trunk under a canopy sprite (octagonal, tapering) for the meadow trees. */
  const trunk = (x: number, z: number, h: number, wd: number) => {
    const tint = W(0.85 + rng.next() * 0.2);
    trunks.rotBox([x, h / 2, z], [wd, h, wd], 0, tint, rng);
    trunks.rotBox([x, h / 2, z], [wd * 0.92, h, wd * 0.92], Math.PI / 4, tint.clone().multiplyScalar(0.94), rng);
  };
  const tree = (x: number, z: number, s: number) => {
    const y = topAt(x, z);
    if (theme === 'meadow') {
      trunk(x, z, 0.9 * s, 0.26 * s);
      fol.add(atlas.get('tree', rng), [x, y + 0.45 * s, z + 0.05], 'billboard', { scale: S(0.9 * s), sway: 0.02, flip: rng.chance(0.5) });
    } else {
      fol.add(atlas.get('tree', rng), [x, y - 0.05, z], 'billboard', { scale: S(s), sway: theme === 'coast' ? 0.04 : 0.01, flip: rng.chance(0.5) });
    }
  };

  // Trees round the rim (not in front, not on spots or paths).
  {
    const n = theme === 'summit' ? 11 : theme === 'ridge' ? 8 : 9;
    const caves = wild.filter((w) => w.kind === 'cave');
    let placed = 0;
    for (let i = 0; i < 120 && placed < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = R(a) - 0.5 - rng.next() * 0.7;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      // Trees stay on the outer ring, clear of the paths, the spots and the view onto caves.
      if (z > 1.6 || blocked(x, z, 0.35) || onPath(x, z, 0.75) || caves.some((c) => Math.hypot(x - c.x, z - c.z) < 2.4)) continue;
      tree(x, z, 0.8 + rng.next() * 0.3);
      placed++;
    }
  }
  // Bushes, tufts, tall grass, flowers.
  const scatter = (kind: string, count: number, o2: { r0?: number; sway?: number; scale?: number; avoid?: number } = {}) => {
    for (let i = 0; i < count; i++) {
      const a = rng.next() * Math.PI * 2;
      const rr = Math.sqrt(rng.next()) * (R(a) - 0.25);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (rr < (o2.r0 ?? 0) || blocked(x, z, o2.avoid ?? 0.1) || onPath(x, z, 0.5) || !inside(x, z)) continue;
      fol.add(atlas.get(kind, rng), [x, topAt(x, z), z], 'billboard', { scale: S((o2.scale ?? 1) * (0.85 + rng.next() * 0.3)), sway: o2.sway ?? 0.05, flip: rng.chance(0.5), tint: W(0.85 + rng.next() * 0.25) });
    }
  };
  scatter('bush', theme === 'summit' ? 4 : 7, { r0: 2.2, sway: 0.02 });
  scatter('tuft', theme === 'summit' ? 12 : low ? 40 : 70, theme === 'summit' ? { r0: 3.2 } : {});
  scatter('tall', theme === 'summit' ? 3 : 16, { sway: 0.08, r0: theme === 'summit' ? 3.2 : 0 });
  for (const key of petals) scatter(`flowers-${key}`, theme === 'meadow' ? (low ? 5 : 8) : 3, { sway: 0.05 });

  // ---- theme dressing
  if (theme === 'meadow') {
    // Fence along the left front, a signpost by the path, a log, rocks.
    const fy = 0;
    const fx0 = -3.9, fz0 = 2.0, fx1 = -1.3, fz1 = 3.75;
    const posts = 5;
    for (let i = 0; i < posts; i++) {
      const t = i / (posts - 1);
      const x = fx0 + (fx1 - fx0) * t, z = fz0 + (fz1 - fz0) * t;
      wood.box([x - 0.05, fy, z - 0.05], [x + 0.05, fy + 0.5, z + 0.05], W(0.9 + rng.next() * 0.2), rng);
    }
    const ang = Math.atan2(fz1 - fz0, fx1 - fx0), len = Math.hypot(fx1 - fx0, fz1 - fz0);
    for (const yy of [0.22, 0.4]) wood.rotBox([(fx0 + fx1) / 2, yy, (fz0 + fz1) / 2], [len, 0.07, 0.04], -ang, W(1.05), rng);
    const sx = 0.85, sz = 2.6;
    wood.box([sx - 0.04, 0, sz - 0.04], [sx + 0.04, 0.75, sz + 0.04], W(0.9), rng);
    wood.rotBox([sx + 0.1, 0.65, sz], [0.5, 0.18, 0.04], -0.2, W(1.1), rng);
    trunks.rotBox([3.6, 0.13, -1.0], [1.2, 0.26, 0.26], 0.6, W(0.95), rng);
    for (const [x, z, s] of [[-3.4, -1.8, 0.32], [3.7, 1.0, 0.26], [-1.6, 3.4, 0.22], [2.2, -3.6, 0.3]] as const) {
      if (blocked(x, z)) continue;
      boulder(stone, [x, s * 0.3, z], [s * 1.6, s, s * 1.3], W(0.9 + rng.next() * 0.2), rng, { ry: rng.next() * 3, aoBottom: 0.5, topK: 1.35, flatBottom: true });
    }
    // A pond at the front right.
    const pond = { x: 2.85, z: 2.55, rx: 0.95, rz: 0.62 };
    if (!blocked(pond.x, pond.z, -0.3)) {
      const water = pixelWater({ rect: { x0: pond.x - 1.3, z0: pond.z - 1.0, w: 2.6, d: 2.0 }, y: 0.02, land: (x, z) => Math.hypot((x - pond.x) / pond.rx, (z - pond.z) / pond.rz) > 1 + Math.sin(x * 5 + z * 3) * 0.06, range: 0.6, ripples: [[pond.x - 0.2, pond.z]], light: 1, texel: MT, foamWidth: 0.2 });
      group.add(water.mesh);
      updates.push(water.update);
      extra.push(water);
    }
  } else if (theme === 'ridge') {
    // Basalt crags and boulders round the rim, steam vents, embers over the lava river.
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2, r = R(a) - 0.6 - rng.next() * 0.8;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (z > 2.2 || blocked(x, z, 0.2) || onPath(x, z, 0.6)) continue;
      const s = 0.3 + rng.next() * 0.35;
      boulder(stone, [x, s * 0.4, z], [s * 1.3, s * (1.1 + rng.next() * 0.8), s * 1.1], W(0.85 + rng.next() * 0.25), rng, { ry: rng.next() * 3, aoBottom: 0.45, topK: 1.4, flatBottom: true });
    }
    const vents: [number, number][] = [[-1.7, 3.1], [3.4, -1.6]];
    for (const [x, z] of vents) {
      if (blocked(x, z, -0.2)) continue;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        boulder(stone, [x + Math.cos(a) * 0.32, 0.12, z + Math.sin(a) * 0.26], [0.32, 0.26, 0.28], W(0.8), rng, { ry: a, aoBottom: 0.45, flatBottom: true });
      }
      glow.box([x - 0.12, 0, z - 0.1], [x + 0.12, 0.06, z + 0.1], new THREE.Color('#ff8a2a').multiplyScalar(2.2), rng, { flat: true });
    }
    const steam = particles({
      kind: 'steam',
      emitters: vents.map(([x, z]) => ({ min: new THREE.Vector3(x - 0.1, 0.1, z - 0.1), max: new THREE.Vector3(x + 0.1, 0.2, z + 0.1), vmin: new THREE.Vector3(-0.05, 0.35, -0.05), vmax: new THREE.Vector3(0.08, 0.6, 0.05), count: low ? 8 : 14, life: [2, 3.4] as [number, number], size: [0.12, 0.2] as [number, number] })),
      colorA: new THREE.Color('#f0d8d0'), colorB: new THREE.Color('#a890a0'), grow: [1, 2.4], opacity: 0.5, wiggle: 0.15,
    }, rng);
    // The lava wells up at the crag's foot and pours off the rim: a glowing fall down the wall.
    let fall: [number, number] | null = null;
    for (let i = 0; i + 1 < LAVA.length && !fall; i++) {
      const [ax, az] = LAVA[i]!, [bx, bz] = LAVA[i + 1]!;
      for (let k = 0; k <= 20; k++) { const x = ax + (bx - ax) * k / 20, z = az + (bz - az) * k / 20; if (edge(x, z) < 0.05) { fall = [x, z]; break; } }
    }
    if (fall) {
      const a = Math.atan2(fall[1], fall[0]);
      const r = R(a) + 0.08;
      const L2 = RAMPS2.lava;
      for (let k = 0; k < 14; k++) {
        const y1 = -k * 0.19, y0 = y1 - 0.2;
        const wd = 0.26 - k * 0.006 + (rng.next() - 0.5) * 0.05;
        const out = r + k * 0.012;
        const cx = Math.cos(a) * out, cz = Math.sin(a) * out;
        const tx = -Math.sin(a), tz = Math.cos(a);
        const col = new THREE.Color(L2[Math.max(2, 6 - Math.floor(k / 3))]!).multiplyScalar(2.4 - k * 0.08);
        glow.rotBox([cx + tx * (rng.next() - 0.5) * 0.04, (y0 + y1) / 2, cz + tz * (rng.next() - 0.5) * 0.04], [wd, 0.2, 0.12], -a + Math.PI / 2, col, rng);
      }
    }
    // Source pool glow at the crag foot.
    glow.box([-2.35, 0, -1.95], [-1.95, 0.025, -1.55], new THREE.Color('#ffd25a').multiplyScalar(2.6), rng, { flat: true });
    const lavaPts = LAVA.filter(([x, z]) => edge(x, z) > 0);
    const embers = particles({
      kind: 'ember',
      emitters: lavaPts.slice(0, -1).map(([x, z], i) => ({ min: new THREE.Vector3(Math.min(x, lavaPts[i + 1]![0]) , 0.05, Math.min(z, lavaPts[i + 1]![1])), max: new THREE.Vector3(Math.max(x, lavaPts[i + 1]![0]), 0.15, Math.max(z, lavaPts[i + 1]![1])), vmin: new THREE.Vector3(-0.1, 0.3, -0.1), vmax: new THREE.Vector3(0.15, 0.8, 0.1), count: low ? 5 : 9, life: [1.4, 2.6] as [number, number], size: [0.03, 0.05] as [number, number] })),
      colorA: new THREE.Color('#ffd25a').multiplyScalar(2), colorB: new THREE.Color('#ff5a12').multiplyScalar(1.6),
    }, rng);
    for (const p of [steam, embers]) { group.add(p.points); updates.push(p.update); pxSize.push(p.setPixelSize); extra.push(p); }
  } else if (theme === 'coast') {
    // Driftwood, shells are painted; beach umbrella posts; a few rocks.
    trunks.rotBox([3.3, 0.06, 2.4], [1.1, 0.12, 0.16], 0.6, W(1.1), rng);
    for (const [x, z, s] of [[-3.6, -1.2, 0.3], [3.5, -0.4, 0.34], [-1.2, -3.8, 0.28]] as const) {
      if (blocked(x, z)) continue;
      boulder(stone, [x, s * 0.3, z], [s * 1.6, s, s * 1.3], W(0.95), rng, { ry: rng.next() * 3, aoBottom: 0.5, topK: 1.35, flatBottom: true });
    }
    // Umbrella: a pole and a striped octagonal canopy (wood + paint via tints).
    const ux = -3.0, uz = 2.0;
    if (!blocked(ux, uz, -0.2)) {
      wood.box([ux - 0.03, 0, uz - 0.03], [ux + 0.03, 1.0, uz + 0.03], W(1.2), rng);
      octSlab(glow, 0.98, 1.04, 0.62, new THREE.Color('#e84a4a').multiplyScalar(0.9), 1.0, 0.8, [ux, uz]);
      octSlab(glow, 1.04, 1.08, 0.4, new THREE.Color('#f4ecd8').multiplyScalar(0.9), 1.0, 0.8, [ux, uz]);
    }
  } else {
    // The champion's dais: three stepped octagons, pillars, a crown arch, banners, path stones.
    const d = dais!;
    octSlab(stone, 0, 0.14, d.r, W(0.78), 1.12, 0.55, [d.x, d.z]);
    octSlab(stone, 0.14, 0.26, d.r * 0.82, W(0.92), 1.18, 0.6, [d.x, d.z]);
    octSlab(stone, 0.26, d.top, d.r * 0.66, W(1.05), 1.22, 0.7, [d.x, d.z]);
    octSlab(glow, d.top, d.top + 0.012, d.r * 0.4, new THREE.Color('#5b3fbf').multiplyScalar(0.55), 1.0, 1.0, [d.x, d.z]);
    for (const sx of [-1, 1]) {
      const px = d.x + sx * 1.55, pz = d.z - 0.6;
      octSlab(stone, 0, 0.18, 0.26, W(0.85), 1.1, 0.6, [px, pz]);
      octSlab(stone, 0.18, 1.9, 0.17, W(1.0), 1.1, 0.75, [px, pz]);
      octSlab(stone, 1.9, 2.04, 0.24, W(1.05), 1.2, 0.8, [px, pz]);
      // Banners hanging from the arch beside the pillars.
      wood.box([px + sx * 0.05 - 0.2, 0.9, pz + 0.12], [px + sx * 0.05 + 0.2, 1.75, pz + 0.16], new THREE.Color(sx < 0 ? '#5b3fbf' : '#c83a52').multiplyScalar(1.1), rng);
    }
    stone.box([d.x - 1.8, 2.04, d.z - 0.78], [d.x + 1.8, 2.22, d.z - 0.42], W(1.05), rng);
    for (let i = 0; i < 5; i++) glow.box([d.x - 0.62 + i * 0.3 - 0.05, 2.22, d.z - 0.64], [d.x - 0.62 + i * 0.3 + 0.05, 2.22 + (i === 2 ? 0.42 : 0.28), d.z - 0.56], new THREE.Color('#ffd23f').multiplyScalar(1.6), rng);
    for (let i = 0; i < 6; i++) {
      const z = d.z + d.r + 0.25 + i * 0.5;
      stone.box([-0.42, 0, z - 0.14], [0.42, 0.05, z + 0.14], W(0.95 + rng.next() * 0.1), rng);
    }
    // Snow flurries.
    const snow = particles({
      kind: 'spray',
      emitters: [{ min: new THREE.Vector3(-5, 2.5, -4), max: new THREE.Vector3(5, 4, 4), vmin: new THREE.Vector3(0.1, -0.35, -0.05), vmax: new THREE.Vector3(0.3, -0.2, 0.05), count: low ? 26 : 50, life: [6, 9] as [number, number], size: [0.03, 0.05] as [number, number] }],
      colorA: new THREE.Color('#ffffff'), colorB: new THREE.Color('#dfe6ff'), opacity: 0.9, wiggle: 0.2,
    }, rng);
    group.add(snow.points); updates.push(snow.update); pxSize.push(snow.setPixelSize); extra.push(snow);
  }

  // ---- hotspots (each its own small group: picking + the explore wiggle)
  for (const s of wild) {
    const g = new THREE.Group();
    g.position.set(s.x, topAt(s.x, s.z), s.z);
    g.name = `hd2d-hotspot-${s.id}`;
    if (s.kind === 'grass') {
      const f = new Foliage(atlas);
      const flower = s.id.includes('flower');
      for (let i = 0; i < (low ? 26 : 40); i++) {
        const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()) * 0.9;
        const x = Math.cos(a) * r, z = Math.sin(a) * r * 0.8;
        const key = flower && i % 3 === 0 ? `flowers-${petals[i % petals.length]}` : 'tall';
        f.add(atlas.get(key, rng), [x, 0, z], 'billboard', { scale: S(1.6 + rng.next() * 0.4), sway: 0.09, flip: rng.chance(0.5), tint: W(1.05 + rng.next() * 0.25) });
      }
      const m = f.build(atlasTex, { upNormal: 0.6 });
      updates.push((t) => { f.uTime.value = t; });
      g.add(m);
    } else if (s.kind === 'cave') {
      const b = new VoxelBatch(16);
      // A mound of boulders opening toward the camera, a dark mouth inside (×1.25 on the map).
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = Math.PI * 1.05 + (i / (n - 1)) * Math.PI * 0.9 + (rng.next() - 0.5) * 0.1;
        const r = 0.82;
        const sz = 0.55 + rng.next() * 0.2;
        boulder(b, [Math.cos(a) * r, sz * 0.42, Math.sin(a) * r * 0.75], [sz * 1.2, sz, sz], W(0.9 + rng.next() * 0.2), rng, { ry: -a, aoBottom: 0.45, flatBottom: true, topK: 1.4 });
      }
      for (let i = 0; i < 5; i++) {
        const a = Math.PI * 1.2 + (i / 4) * Math.PI * 0.6;
        boulder(b, [Math.cos(a) * 0.5, 0.95 + rng.next() * 0.1, Math.sin(a) * 0.38 - 0.05], [0.6, 0.45, 0.5], W(1.0 + rng.next() * 0.15), rng, { ry: -a, aoBottom: 0.5, topK: 1.5 });
      }
      boulder(b, [0, 1.3, -0.25], [0.7, 0.4, 0.55], W(1.1), rng, { aoBottom: 0.5, topK: 1.5 });
      // The mouth: a deep dark recess, an ember glow on the ridge, two lintel stones.
      b.box([-0.42, 0, -0.55], [0.42, 0.78, 0.05], W(0.12), rng, { aoBottom: 1 });
      boulder(b, [-0.5, 0.35, 0.2], [0.4, 0.7, 0.38], W(0.95), rng, { aoBottom: 0.5, flatBottom: true });
      boulder(b, [0.52, 0.32, 0.18], [0.38, 0.64, 0.36], W(0.9), rng, { aoBottom: 0.5, flatBottom: true });
      boulder(b, [0, 0.86, 0.12], [1.15, 0.26, 0.4], W(1.05), rng, { aoBottom: 0.6, topK: 1.4 });
      const caveTex = theme === 'meadow' || theme === 'summit' ? cachedTexture('scr-pebble', () => paintBoulder(13, 32, RAMPS.stone)) : wallTex;
      const m = mkMesh(b.build(), surfaceMaterial(caveTex, undefined, true, false));
      m.scale.setScalar(1.25);
      g.add(m);
      if (theme === 'ridge' || theme === 'coast') {
        const gl = new VoxelBatch(16);
        gl.box([-0.28, 0, 0.02], [0.28, 0.1, 0.06], theme === 'ridge' ? new THREE.Color('#ff7a1e').multiplyScalar(2) : new THREE.Color('#6ad0ff').multiplyScalar(1.4), rng, { flat: true });
        const gm = mkMesh(gl.build(), new THREE.MeshBasicMaterial({ vertexColors: true }), false, false);
        gm.scale.setScalar(1.25);
        g.add(gm);
      }
      // Moss / grass on top in the shared foliage.
      for (let i = 0; i < 6; i++) {
        const a = Math.PI * 1.15 + (i / 5) * Math.PI * 0.7;
        fol.add(atlas.get('tuft', rng), [s.x + Math.cos(a) * 0.68, 1.3, s.z + Math.sin(a) * 0.5], 'billboard', { scale: S(1), sway: 0.04 });
      }
    } else if (s.kind === 'water') {
      const pond = { rx: 1.1, rz: 0.82 };
      // pixelWater works in world space (island coords): it joins the island group, not the
      // hotspot group (the rock ring wiggles, the water stays put).
      const water = pixelWater({ rect: { x0: s.x - 1.5, z0: s.z - 1.2, w: 3.0, d: 2.4 }, y: 0.02, land: (x, z) => Math.hypot((x - s.x) / pond.rx, (z - s.z) / pond.rz) > 1 + Math.sin(x * 4 + z * 3) * 0.06, range: 0.7, ripples: [[s.x - 0.3, s.z + 0.1], [s.x + 0.4, s.z - 0.2]], light: 1, texel: MT, foamWidth: 0.22 });
      group.add(water.mesh);
      updates.push(water.update);
      extra.push(water);
      const b = new VoxelBatch(16);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng.next() * 0.4;
        const sz = 0.18 + rng.next() * 0.12;
        boulder(b, [Math.cos(a) * pond.rx * 1.05, sz * 0.25, Math.sin(a) * pond.rz * 1.05], [sz * 1.5, sz, sz * 1.2], W(0.95), rng, { ry: -a, aoBottom: 0.5, flatBottom: true, topK: 1.4 });
      }
      g.add(mkMesh(b.build(), surfaceMaterial(cachedTexture('scr-pebble', () => paintBoulder(13, 32, RAMPS.stone)), undefined, true, false)));
    }
    g.userData.pick = { hotspot: s.id };
    group.add(g);
    hotspots.set(s.id, g);
  }
  // Trainer posts: a small stone pad with a coloured inset (red: waiting, green: beaten).
  for (const s of trainers) {
    const g = new THREE.Group();
    const y = topAt(s.x, s.z);
    g.position.set(s.x, y, s.z);
    g.name = `hd2d-post-${s.id}`;
    const b = new VoxelBatch(16);
    octSlab(b, -0.01, 0.07, 0.44, W(0.85), 1.15, 0.6);
    octSlab(b, 0.07, 0.085, 0.33, new THREE.Color(s.beaten ? '#5ad06a' : '#ff6a78').multiplyScalar(1.15), 1.1, 1);
    g.add(mkMesh(b.build(), surfaceMaterial(cachedTexture('scr-pebble', () => paintBoulder(13, 32, RAMPS.stone)), undefined, true, false)));
    g.userData.pick = { hotspot: s.id };
    group.add(g);
    hotspots.set(s.id, g);
  }

  // ---- markers (gems over wild spots) and badges (over trainers): pixel sprites that bob
  // in whole map texels.
  const gemTex = pixelSprite(GEM, { o: '#5a3410', y: '#ffc93d', w: '#fff6c8', s: '#d0801a' });
  const alertTex = pixelSprite(BADGE_ALERT, { o: '#3a1020', r: '#e8455a', w: '#ffffff' });
  const doneTex = pixelSprite(BADGE_DONE, { o: '#10301a', g: '#3cbf58', w: '#ffffff' });
  extra.push(gemTex, alertTex, doneTex);
  const bobs: { s: THREE.Sprite; y: number; ph: number }[] = [];
  const pixSprite = (tex: THREE.Texture, w: number, h: number, hdr: number) => {
    const m = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false, fog: false, color: new THREE.Color(hdr, hdr, hdr) });
    extra.push(m);
    const sp = new THREE.Sprite(m);
    sp.scale.set(w * MT * 1.5, h * MT * 1.5, 1);
    sp.renderOrder = 9;
    return sp;
  };
  wild.forEach((s, i) => {
    const sp = pixSprite(gemTex, 7, 8, 1.5);
    const y = topAt(s.x, s.z) + (s.kind === 'cave' ? 2.0 : 1.35);
    sp.position.set(s.x, y, s.z);
    bobs.push({ s: sp, y, ph: i * 1.3 });
    group.add(sp);
  });
  trainers.forEach((s, i) => {
    const sp = pixSprite(s.beaten ? doneTex : alertTex, 9, 9, 1.25);
    const y = topAt(s.x, s.z) + (theme === 'summit' ? 2.2 : 1.85);
    sp.position.set(s.x, y, s.z);
    bobs.push({ s: sp, y, ph: 0.7 + i * 1.1 });
    group.add(sp);
  });
  updates.push((t) => {
    for (const b of bobs) b.s.position.y = b.y + Math.round((Math.abs(Math.sin(t * 2.6 + b.ph)) * 0.12) / MT) * MT;
  });

  // ---- build the static batches
  const texBark = cachedTexture('scr-bark', () => paintBark(51, MEADOW_RAMPS.bark));
  const texWood = cachedTexture('scr-wood', () => paintEarth(52, MEADOW_RAMPS.wood, 32, { roots: 0, pebbles: 0, strata: 2.2 }));
  const texStone = cachedTexture(`scr-stone-${theme}`, () => paintBoulder(53, 32, theme === 'ridge' ? RAMPS2.basalt : theme === 'coast' ? RAMPS2.seaRock : RAMPS.stone));
  for (const [b, tex] of [[trunks, texBark], [wood, texWood], [stone, texStone]] as const) {
    if (!b.count) continue;
    const m = surfaceMaterial(tex, undefined, true, b !== wood);
    extra.push(m);
    group.add(mkMesh(b.build(), m));
  }
  if (glow.count) {
    const gm = theme === 'coast' ? surfaceMaterial(null) : new THREE.MeshBasicMaterial({ vertexColors: true });
    extra.push(gm);
    group.add(mkMesh(glow.build(), gm, theme === 'coast', theme === 'coast'));
  }
  const folMesh = fol.build(atlasTex, { upNormal: 0.6 });
  group.add(folMesh);
  updates.push((t) => { fol.uTime.value = t; });

  // ---- sky and clouds
  const sky = skyBackdrop(T.sky);
  group.add(sky.mesh);
  extra.push(sky);
  const cloudSpecs: CloudSpec[] = [];
  const cr = new Rng(seed + 5);
  // Below the island (the cloud sea it floats over) and a few far ones behind it.
  const below = low ? 6 : 9;
  for (let i = 0; i < below; i++) {
    const a = (i / below) * Math.PI * 2 + cr.next() * 0.5;
    const r = 6.5 + cr.next() * 4;
    // Cloud texels stay ≈ the island's map texel at their depth (a little coarser further off).
    cloudSpecs.push({ at: [Math.cos(a) * r, -4.4 - cr.next() * 2.5, Math.sin(a) * r * 0.75 - 0.8], scale: 0.6 + cr.next() * 0.2, speed: 0.03 + cr.next() * 0.03, kind: cr.int(4), flip: cr.chance(0.5) });
  }
  for (let i = 0; i < (low ? 3 : 5); i++) {
    cloudSpecs.push({ at: [-13 + i * 6.5 + cr.next() * 2, 0.5 + cr.next() * 3, -15 - cr.next() * 4], scale: 0.95 + cr.next() * 0.25, speed: 0.05, kind: cr.int(4), flip: cr.chance(0.5) });
  }
  const clouds = cloudBillboards(cloudSpecs, T.clouds, seed + 9, { gain: theme === 'summit' ? 0.85 : 1 });
  group.add(clouds.mesh);
  updates.push(clouds.update);
  extra.push(clouds);

  // ---- light: one shadow-casting key, hemisphere fill, matching sprite light
  const rig = lightRig(group, T.light, { quality: q, target: [0, 0, 0], extent: 7.5, elev: T.elev, azim: T.azim, keyK: T.keyK, hemiK: T.hemiK, keyColor: T.key, sky: T.skyC, ground: T.groundC });
  extra.push(rig);
  // Sun shafts from the key's direction onto the island top, with motes drifting in them.
  {
    const dir = new THREE.Vector3(Math.sin(T.azim) * Math.cos(T.elev), Math.sin(T.elev), -Math.cos(T.azim) * Math.cos(T.elev));
    const beams: BeamSpec[] = T.beams.map(([x, z, wd]) => {
      const end = new THREE.Vector3(x, topAt(x, z), z);
      // Long, wide and faint: the shafts enter from above the frame (no visible start).
      return { start: end.clone().addScaledVector(dir, 9 / dir.y), end, width: [wd * 1.1, wd * 1.5], fade: 0.25 };
    });
    const rays = lightBeams(beams, T.beamColor, T.beamK * 0.55);
    const motes = dustMotes(beams, low ? 10 : 18, rng, T.beamColor);
    group.add(rays.mesh, motes.points);
    updates.push(rays.update, motes.update);
    pxSize.push(motes.setPixelSize);
  }
  const spriteLight: SpriteLight = { ...rig.spriteLight };
  const grade = presetGrade(T.light);
  T.grade(grade);
  grade.tiltTop = 1.2; grade.focusTop = 0.78; grade.tiltBottom = 0.8; grade.focusBottom = 0.12;

  return {
    group, spriteLight, grade, background: T.background, fog: T.fog ? { color: T.fog, near: 8, far: 30 } : null,
    hotspots, topAt, daisTop: dais?.top ?? 0,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { for (const f of pxSize) f(px); },
    frame(camera, buffer) { sky.aim(camera, new THREE.Vector3(0, -1, 0), 26, buffer); },
    dispose() { disposeGroup(group, extra); },
  };
}

/** Dark basalt ash (ridge ground) and the lava-lit ash near the river. */
const ASH_DARK: Ramp = ['#2c2226', '#3c3030', '#4e403c', '#625048', '#786254', '#907662', '#a88c74'];
const LAVA_LIT: Ramp = ['#3a2622', '#553226', '#74422a', '#925632', '#ae6c3a', '#c88646', '#e0a456'];

/** Ember Ridge's lava river (island coords), from the back-left rim toward the middle. */
const LAVA: [number, number][] = [[-2.15, -1.75], [-3.05, -1.15], [-3.8, -0.1], [-4.05, 1.25], [-3.85, 2.6], [-3.55, 4.0], [-3.3, 5.6]];

// ------------------------------------------------------------------ ground painters

interface GroundCtx {
  inside(x: number, z: number): boolean;
  edge(x: number, z: number): number;
  pathD(x: number, z: number): number;
  spots: IslandSpot[];
  dais: { x: number; z: number; r: number } | null;
  seed: number;
}

/** Distance from (x, z) to a polyline. */
function polyD(pts: [number, number][], x: number, z: number): number {
  let d = 99;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[i + 1]!;
    const abx = bx - ax, abz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz)));
    d = Math.min(d, Math.hypot(x - ax - abx * t, z - az - abz * t));
  }
  return d;
}

function paintGround(theme: IslandTheme, t: RgbaTile, glow: RgbaTile | null, wx: (x: number) => number, wz: (y: number) => number, c: GroundCtx) {
  const n1 = valueNoise(c.seed, 0.9), n2 = valueNoise(c.seed + 1, 0.35), n3 = valueNoise(c.seed + 2, 2.6);
  const rng = new Rng(c.seed + 77);
  const M = MEADOW_RAMPS;
  const grassR: Ramp = theme === 'ridge' ? ASH_DARK : theme === 'coast' ? RAMPS2.sand : theme === 'summit' ? RAMPS.stone : M.grass;
  const dirtR: Ramp = theme === 'ridge' ? ['#3a2c24', '#52402e', '#6e553a', '#8a6c48', '#a48658', '#bc9e6a', '#d2b47e'] : theme === 'coast' ? RAMPS2.wetSand : theme === 'summit' ? RAMPS.snow : M.dirt;
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const X = wx(x), Z = wz(y);
    if (!c.inside(X, Z)) continue;
    const e = c.edge(X, Z);
    const nn = n1(X, Z), fine = n2(X, Z), big = n3(X, Z);
    const pd = c.pathD(X, Z) + (fine - 0.5) * 0.18 + (nn - 0.5) * 0.12;
    const h = hash2(x, y, 1);
    if (theme === 'summit') {
      // Flagstones: irregular slabs (cells of a jittered grid) with dark seams; snow drifts
      // toward the rim and in the seams; the path to the dais in lighter, bigger slabs.
      const sz = 0.55;
      const gx = Math.floor(X / sz + (Math.floor(Z / sz) % 2) * 0.5), gz = Math.floor(Z / sz);
      const fx = X / sz + (Math.floor(Z / sz) % 2) * 0.5 - gx, fz = Z / sz - gz;
      const seam = Math.min(fx, 1 - fx, fz, 1 - fz) < 0.06;
      let v = 3.0 + (hash2(gx, gz, 3) - 0.5) * 1.4 + (nn - 0.5) * 0.8 - (seam ? 1.6 : 0) + (fz < 0.2 ? 0.4 : 0);
      if (pd < 0.45) v += 0.6;
      const snowK = THREE.MathUtils.smoothstep(-e, -1.3, -0.2) + (big - 0.55) * 0.9 + (seam ? 0.25 : 0);
      if (snowK > 0.55 + (h - 0.5) * 0.2) t.band(x, y, dirtR, 4.2 + (nn - 0.5) * 1.6 + Math.min(1, (snowK - 0.55) * 3) * 1.2 - (seam ? 0.6 : 0));
      else t.band(x, y, grassR, v);
      continue;
    }
    const isPath = pd < 0.32;
    const edgeP = pd < 0.42 && !isPath;
    if (isPath || (edgeP && h < 0.45)) {
      let v = theme === 'coast' ? 3.4 + (nn - 0.5) * 1.6 : 2.6 + (nn - 0.5) * 2.0 + (0.32 - Math.min(0.32, pd)) * 2.2;
      if (h < 0.05) v += hash2(x, y, 4) < 0.5 ? -1 : 1;
      t.band(x, y, dirtR, v);
      continue;
    }
    // Base surface: two-scale mottling, blade flecks / grit, darker toward the rim.
    let v = 3.2 + (nn - 0.5) * 2.4 + (big - 0.5) * 1.4 - THREE.MathUtils.smoothstep(-e, -0.5, -0.05) * 0.8;
    if (theme === 'meadow' || theme === 'coast') {
      if (h < 0.1) v += 1.5;
      else if (hash2(x, y - 1, 1) < 0.1) v -= 1.1;
    } else if (h < 0.06) v -= 1.2;
    if (theme === 'coast' && big > 0.62 && pd > 0.8) { t.band(x, y, RAMPS2.turf, 3 + (nn - 0.5) * 2.4 + (h < 0.12 ? 1.4 : 0)); continue; }
    if (theme === 'ridge') {
      // Lava-lit ground: warm, brighter ash near the river.
      const ld = polyD(LAVA, X, Z) + (fine - 0.5) * 0.2;
      if (ld < 0.85) { t.band(x, y, LAVA_LIT, 2.2 + (0.85 - ld) * 4.2 + (nn - 0.5) * 1.4 + (h < 0.06 ? -1 : 0)); continue; }
    }
    t.band(x, y, grassR, v);
  }
  // Theme marks: flowers and clover (meadow), cracks + lava (ridge), shells + ripples (coast).
  if (theme === 'meadow') {
    for (let i = 0; i < 1300; i++) {
      const x = rng.int(t.w), y = rng.int(t.h);
      const X = wx(x), Z = wz(y);
      if (!c.inside(X, Z) || c.pathD(X, Z) < 0.5) continue;
      if (rng.chance(0.45)) {
        const pet = (Object.values(PETALS) as Ramp[])[rng.int(7)]!;
        t.set(x, y, pet[4]!); t.set(x - 1, y, pet[3]!); t.set(x + 1, y, pet[3]!); t.set(x, y - 1, pet[4]!); t.set(x, y + 1, pet[2]!);
      } else {
        t.set(x, y, M.grass[6]!); t.set(x + 1, y, M.grass[5]!); t.set(x + 1, y + 1, M.grass[4]!);
      }
    }
    // Darker, lusher grass under the tall-grass patches.
    for (const s of c.spots) if (s.kind === 'grass') {
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
        const X = wx(x), Z = wz(y);
        const d = Math.hypot(X - s.x, (Z - s.z) * 1.2);
        if (d < 1.15 + (n2(X, Z) - 0.5) * 0.3) t.band(x, y, M.grass, 1.6 + (n1(X, Z) - 0.5) * 1.6 + (hash2(x, y, 6) < 0.1 ? 1.2 : 0));
      }
    }
  } else if (theme === 'ridge') {
    // Dark cracks branching across the ash.
    for (let k = 0; k < 26; k++) {
      let x = rng.int(t.w), y = rng.int(t.h);
      let dir = rng.next() * Math.PI * 2;
      const len = 10 + rng.int(26);
      for (let i = 0; i < len; i++) {
        if (!c.inside(wx(x), wz(y))) break;
        t.set(x, y, RAMPS2.ash[0]!); if (rng.chance(0.4)) t.set(x + 1, y, RAMPS2.ash[1]!);
        t.set(x, y - 1, RAMPS2.ash[5]!);
        dir += (rng.next() - 0.5) * 0.9;
        x = Math.round(x + Math.cos(dir)); y = Math.round(y + Math.sin(dir));
      }
    }
    // Dry grass flecks.
    for (let i = 0; i < 700; i++) {
      const x = rng.int(t.w), y = rng.int(t.h);
      if (!c.inside(wx(x), wz(y)) || c.pathD(wx(x), wz(y)) < 0.45) continue;
      t.set(x, y, '#b09a52'); t.set(x, y + 1, '#7a6634'); if (rng.chance(0.5)) t.set(x + 1, y, '#c8b464');
    }
    // The lava river: banded flow, crusted dark rims, glowing in the emissive mask.
    const L = RAMPS2.lava;
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const X = wx(x), Z = wz(y);
      if (!c.inside(X, Z)) continue;
      const d = polyD(LAVA, X, Z) + (n2(X, Z) - 0.5) * 0.12;
      const w = 0.24 + (n3(X, Z) - 0.5) * 0.12;
      if (d > w + 0.14) continue;
      if (d > w) { t.band(x, y, RAMPS2.slag, 1.2 + (n1(X, Z) - 0.5) * 1.6); continue; }
      const core = 1 - d / w;
      const flow = Math.sin((X - Z) * 6 + n1(X, Z) * 5) * 0.5 + 0.5;
      const v = 2.2 + core * 3.0 + (flow - 0.5) * 1.1;
      t.band(x, y, L, v);
      const k = Math.min(1, 0.25 + core * 0.9);
      const [r, g, b] = [parseInt(L[Math.min(6, Math.round(v))]!.slice(1, 3), 16), parseInt(L[Math.min(6, Math.round(v))]!.slice(3, 5), 16), parseInt(L[Math.min(6, Math.round(v))]!.slice(5, 7), 16)];
      glow!.set(x, y, `#${[r, g, b].map((q) => Math.round(q * k).toString(16).padStart(2, '0')).join('')}`);
    }
  } else if (theme === 'coast') {
    for (let i = 0; i < 260; i++) {
      const x = rng.int(t.w), y = rng.int(t.h);
      if (!c.inside(wx(x), wz(y))) continue;
      const sh = rng.pick(['#ffffff', '#ff9ad0', '#ffd8a8', '#f4e6c0']);
      t.set(x, y, sh); if (rng.chance(0.5)) t.set(x + 1, y, '#c6a670');
    }
    // Wind ripples on the sand.
    for (let y = 0; y < t.h; y += 3) for (let x = 0; x < t.w; x++) {
      const X = wx(x), Z = wz(y);
      if (!c.inside(X, Z) || c.pathD(X, Z) < 0.5) continue;
      if (Math.sin(X * 3 + Z * 9 + n1(X, Z) * 4) > 0.92) t.scale(x, y, 0.88);
    }
    // Wet sand round the lagoon hotspot.
    for (const s of c.spots) if (s.kind === 'water') {
      for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
        const X = wx(x), Z = wz(y);
        const d = Math.hypot((X - s.x) / 1.1, (Z - s.z) / 0.82);
        if (d < 1.45 + (n2(X, Z) - 0.5) * 0.2) t.band(x, y, RAMPS2.wetSand, 2.6 + (d - 1) * 3 + (n1(X, Z) - 0.5));
      }
    }
  }
  void c.dais;
}

export type { SpriteRect };
