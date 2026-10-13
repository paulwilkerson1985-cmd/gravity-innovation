// Steaming volcanic cave (Ember Ridge `vent-cave`): a sunken ash floor ringed by terraced
// columnar basalt, a lava river running behind the floor fed by a lavafall pouring out of the
// back wall, a lava pool front-right, glowing cracks, steam plumes from vents, rising embers,
// violet and ember crystals, cooled-lava rubble, and red-orange underlighting from the lava
// (the light motif: everything is lit from below and behind by the molten river).
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { TEXEL, VoxelBatch, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec, type V3 } from '../arena';
import { boulder, courseWall, coursedTerrace, groundGrid, isoLines, nextRiser, pebbles, polygonSdf, rubblePile, terraceHeight, type Path2, type TerraceTier } from '../kit/rock';
import { paintBoulderAtlas, type Ramp } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import { RAMPS2, V, TRODDEN_SIZE, troddenMarking, cachedCanvas, cachedTexture, decal, disposeGroup, glowTexture, grey, hdr, makeGrade, shadeVertices, paintAlpha, paintAsh, paintRockOn, particles } from './localKit';

export interface TerrainArenaOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

export const ARENA: ArenaDef = {
  id: 'volcanic',
  label: 'Steaming volcanic cave',
  match: [{ route: 'ridge', hotspot: 'vent-cave' }],
  build: (o) => buildVolcanicArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: volcanicGrade,
  background: '#140c09',
  fog: '#2e1a12',
  fogRange: [10, 40],
  // Higher, pulled back: the basalt wall takes ≤ 40% of the frame, the ash floor reads as an
  // open stage in front of the lava river.
  camera: {
    wide: { elev: 0.72, person: 0.17 },
    land: { elev: 0.8, person: 0.13 },
    portrait: { elev: 0.6 },
  },
};

/** Dark basalt (no violet): warm near-black greys, dusty grey-brown highlights. */
const BASALT: Ramp = ['#1a1412', '#2a201b', '#3b2e27', '#4f3e34', '#665243', '#806955', '#9d846c'];

export function volcanicGrade(): Grade {
  return makeGrade({
    lift: new THREE.Vector3(0.01, 0.004, 0.0), gain: new THREE.Vector3(1.05, 0.98, 0.9), gamma: new THREE.Vector3(1.08, 1.08, 1.08),
    saturation: 0.86, contrast: 1.08,
    shadowTint: new THREE.Color('#24140e'), highTint: new THREE.Color('#ffc890'), splitAmount: 0.14,
    vignette: 0.16, exposure: 1.5,
  });
}

// ------------------------------------------------------------------ lava material

const LAVA_VERT = /* glsl */ `
attribute float aEdge;   // 0 at a bank/edge → 1 in the middle of the flow
attribute float aSpeed;  // flow speed (world units / s): falls run fast, the river crawls
varying vec2 vUv;
varying float vEdge;
varying float vSpeed;
void main() {
  vUv = uv; vEdge = aEdge; vSpeed = aSpeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const LAVA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uTexel;
uniform vec3 uRamp[7];
varying vec2 vUv;       // world units: x along the flow, y across
varying float vEdge;
varying float vSpeed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float clump(vec2 c) { vec2 k = floor(c / 2.0); return fract(52.9829189 * fract(dot(k, vec2(0.06711056, 0.00583715)))); }
void main() {
  vec2 cell = floor(vUv / uTexel);
  vec2 q = (cell + 0.5) * uTexel;
  // The flow texture scrolls along u; crust streaks are stretched along the flow.
  vec2 f = vec2(q.x - uTime * vSpeed, q.y);
  float n = noise(f * vec2(1.3, 2.2)) * 0.6 + noise(f * vec2(3.0, 5.0) + 7.0) * 0.4;
  float streak = noise(vec2(f.x * 0.7, q.y * 7.0) + 3.0);
  float seam = 1.0 - abs(noise(f * vec2(1.6, 3.2) + 11.0) - 0.5) * 2.0;
  // Falls (fast flow) carry more crust: long dark plates sliding down the sheet.
  float fallK = smoothstep(0.9, 1.4, vSpeed);
  float heat = 2.4 + vEdge * 2.4 + smoothstep(0.72, 1.0, seam) * 1.4;
  heat -= smoothstep(0.6 - 0.12 * fallK, 0.78, streak) * (2.6 + 0.8 * fallK) * (0.4 + 0.6 * vEdge);   // dark crust streaks
  heat -= smoothstep(0.62, 0.85, n) * 1.4;
  heat += 0.3 * sin(uTime * 2.0 + q.x * 3.0 + q.y * 2.0);
  // A dark, cooled rim along the banks (broken by the noise, so the edge is ragged).
  float rim = 1.0 - smoothstep(0.08 + 0.06 * fallK, 0.3 + 0.12 * fallK + 0.12 * n, vEdge);
  heat = mix(heat, 0.4 + n * 1.2, rim);
  // Posterised, clustered dither only near the band edges.
  float b = floor(heat), e = heat - b - 0.5;
  float i = abs(e) < 0.16 ? b + (((e + 0.16) / 0.32) > clump(cell) ? 1.0 : 0.0) : floor(heat + 0.5);
  int i0 = int(clamp(i, 0.0, 6.0));
  vec3 c = uRamp[0];
  for (int k = 1; k < 7; k++) if (k == i0) c = uRamp[k];
  gl_FragColor = vec4(c, 1.0);
}`;

/** Additive glow skirt around the lava (soft falloff quantised to 3 steps, gentle pulse). */
const SKIRT_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
varying float vEdge;
varying float vSpeed;
void main() {
  float k = pow(clamp(vEdge, 0.0, 1.0), 1.6);
  k = floor(k * 3.0 + 0.5) / 3.0;
  float pulse = 0.85 + 0.15 * sin(uTime * 1.7 + vUv.x * 0.8);
  gl_FragColor = vec4(uColor * k * pulse, 1.0);
}`;

const edgeNoise = (a: number, k: number) => {
  const v = Math.sin(a * 12.9898 + k * 78.233) * 43758.5453;
  return (v - Math.floor(v)) - 0.5;
};

/** Lava strips: quads with world-unit UVs (u along the flow) and an edge factor across. */
class LavaBatch {
  pos: number[] = []; uv: number[] = []; edge: number[] = []; speed: number[] = []; idx: number[] = [];
  /**
   * A strip along a polyline at height y (or a vertical sheet when `vertical`), `w` wide, `n`
   * cross segments. `rag` jitters the two edge rows sideways (irregular, crusted banks).
   */
  strip(pts: THREE.Vector3[], w: number, n = 4, vertical = false, o: { rag?: number; speed?: number; seed?: number } = {}) {
    let along = 0;
    const base = this.pos.length / 3;
    const rag = o.rag ?? 0, seed = o.seed ?? 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!;
      const nb = pts[Math.min(pts.length - 1, i + 1)]!, pb = pts[Math.max(0, i - 1)]!;
      const dir = nb.clone().sub(pb).normalize();
      const side = vertical ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x);
      if (i > 0) along += p.distanceTo(pts[i - 1]!);
      for (let k = 0; k <= n; k++) {
        const s = k / n - 0.5;
        const j = k === 0 || k === n ? edgeNoise(i + seed * 31, k) * rag * 2 : k === 1 || k === n - 1 ? edgeNoise(i + seed * 31, k + 7) * rag * 0.8 : 0;
        const v = p.clone().addScaledVector(side, s * w + j * Math.sign(s || 1));
        this.pos.push(v.x, v.y, v.z);
        this.uv.push(along, s * w);
        this.edge.push(1 - Math.abs(s) * 2);
        this.speed.push(o.speed ?? 0.35);
      }
    }
    for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < n; k++) {
      const a = base + i * (n + 1) + k, b = a + n + 1;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  /** A roughly round pool (fan) at height y; edge 0 at the rim. `rag` wobbles the rim. */
  pool(c: THREE.Vector3, rx: number, rz: number, seg = 18, rag = 0.08, speed = 0.12) {
    const base = this.pos.length / 3;
    this.pos.push(c.x, c.y, c.z); this.uv.push(c.x, c.z); this.edge.push(1); this.speed.push(speed);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + 1) * 0.08 + edgeNoise(i % seg, 3) * rag * 2;
      const x = c.x + Math.cos(a) * rx * wob, z = c.z + Math.sin(a) * rz * wob;
      this.pos.push(x, c.y, z); this.uv.push(x, z); this.edge.push(0); this.speed.push(speed);
      if (i > 0) this.idx.push(base, base + i + 1, base + i);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aEdge', new THREE.Float32BufferAttribute(this.edge, 1));
    g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(this.speed, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** Glowing crack network for the floor edges (additive decal texture, 64×64). */
function crackTexture(): THREE.CanvasTexture {
  return cachedCanvas('lava-cracks', () => {
    const rng = new Rng(41);
    const n = 64;
    const m = new Int8Array(n * n).fill(-1);
    for (let c = 0; c < 7; c++) {
      let x = rng.int(n), y = rng.int(n);
      let dx = rng.chance(0.5) ? 1 : -1, dy = 0;
      const len = 14 + rng.int(22);
      for (let i = 0; i < len; i++) {
        const k = ((y + n) % n) * n + ((x + n) % n);
        m[k] = Math.max(m[k]!, i < 3 || i > len - 4 ? 1 : 3);
        // glow halo
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const kk = ((y + b + n) % n) * n + ((x + a + n) % n); if (m[kk]! < 0) m[kk] = 0; }
        if (rng.chance(0.3)) { const k2 = dx; dx = dy || (rng.chance(0.5) ? 1 : -1); dy = k2 ? 0 : (rng.chance(0.5) ? 1 : -1); }
        x += dx; y += dy;
        if (rng.chance(0.06)) { x += rng.chance(0.5) ? 1 : -1; }
      }
    }
    return paintAlpha(n, n, ['#3a0a04', '#c22a0a', '#ff7a1e', '#ffd25a'], (x, y) => m[y * n + x]!);
  });
}

/**
 * Build the volcanic vent cave. Same scale/spots as the cave arena (kin at (−1.3, 0, 1.0) and
 * (1.5, 0, −1.0)). An organic ash floor (polygon SDF + wobble) ringed by four stepped bands of
 * coursed basalt (dark masses, lava-lit lips, darker toward the top) under a tall back wall; a
 * raised basalt ledge in the mid-ground with ONE dominant lava fall pouring off its face into a
 * glowing floor pool (the fall is the key light); a lava channel along the second terrace's
 * ledge feeding it; three tall faceted columnar spires; a low dark lip, a dark apron and a few big
 * silhouetted rocks at the near edge. The foe stands on a lighter, fall-lit patch of ash.
 */
export function buildVolcanicArena(opts: TerrainArenaOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 23);
  const q = opts.quality ?? 'high';
  const lite = q === 'low';
  const group = new THREE.Group();
  group.name = 'hd2d-volcanic-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  const texBasalt = cachedTexture('basalt-stone-atlas', () => paintBoulderAtlas(13, BASALT));
  const texAsh = cachedTexture('ash-light', () => paintAsh(17, 64));
  const texSlag = cachedTexture('slag-warm', () => paintRockOn(19, RAMPS2.slag, 32));

  // ---- layout: an organic floor outline, four 1-unit terrace bands, the tall wall behind.
  const POLY: Path2 = [[-9, 10], [-7.0, 1.6], [-6.2, -2.4], [-4.0, -4.3], [0.4, -4.6], [4.6, -4.1], [6.8, -1.8], [7.6, 2.4], [9, 10]];
  const poly = polygonSdf(POLY);
  const floorD = (x: number, z: number) => poly(x, z) - (Math.sin(x * 1.1 + z * 0.7 + 1.3) * 0.22 + Math.sin(z * 1.9 - x * 0.6) * 0.14);
  const DEPTH = 0.66;
  const TIERS: TerraceTier[] = [{ d: 0, y: 1.0 }, { d: 1.5, y: 2.0 }, { d: 3.0, y: 3.0 }, { d: 4.5, y: 4.0 }, { d: 6.0, y: 9.0, course: 0.8, length: 1.0 }];
  const LIP_Z = 4.8, APRON_Y = -0.8;
  // The mid-ground ledge: a raised basalt pier jutting out of the back terraces, level with the
  // second terrace; the fall pours off its front face into the floor pool.
  const pier = { x0: -1.65, x1: 0.35, z0: -7.8, z1: -3.85, y: TIERS[1]!.y };
  const fall = { x: (pier.x0 + pier.x1) / 2, w: 1.15, top: pier.y, z: pier.z1 };
  const pool = { x: fall.x + 0.1, z: pier.z1 + 0.85, rx: 1.25, rz: 0.75 };
  const inPier = (x: number, z: number) => x > pier.x0 - 0.05 && x < pier.x1 + 0.05 && z > pier.z0 && z < pier.z1 + 0.05;
  const inPool = (x: number, z: number) => ((x - pool.x) / pool.rx) ** 2 + ((z - pool.z) / pool.rz) ** 2 < 1;
  const groundY = (x: number, z: number) => {
    if (z > LIP_Z + 0.35) return APRON_Y;
    if (inPier(x, z - 0.4) && z < pier.z1 - 0.4) return pier.y;
    if (inPool(x, z)) return -0.22;
    return terraceHeight(floorD(x, z), TIERS, DEPTH);
  };
  const SPOTS: [THREE.Vector3, THREE.Vector3] = [V(-1.3, 0, 1.0), V(1.5, 0, -1.0)];
  const keepOut = [{ x: -1.3, z: 1.0, r: 1.2 }, { x: 1.5, z: -1.0, r: 1.3 }, { x: -2.5, z: 1.9, r: 0.8 }, { x: 0.1, z: 0, r: 3.0 }];
  const clear = (x: number, z: number, r: number) => keepOut.every((c) => (x - c.x) ** 2 + (z - c.z) ** 2 > (c.r + r) ** 2);

  // ---- basalt: coursed terraces, the pier, the near lip, spires, big near rocks (one mesh)
  const rock = new VoxelBatch(64);
  const glow = new VoxelBatch(16);
  const slag = new VoxelBatch(32);
  const basalt = { depth: DEPTH, lite, tint: ['#ffffff', '#f2ece8', '#faf0ea'], core: 0.4, course: 0.5, topTint: new THREE.Color('#ffd8b8').multiplyScalar(1.1) };
  coursedTerrace(rock, floorD, TIERS, rng, {
    ...basalt, bounds: [-16, -13, 16, LIP_Z + 0.4],
    keep: (x, z, y) => z < LIP_Z - 0.2 && !(inPier(x, z) && y < pier.y + 0.05),
    pebbles: { batch: slag, perUnit: lite ? 0.15 : 0.3, tint: '#8a7a72', ramp: [[0.6, 0.55, 0.52], [0.75, 0.68, 0.64], [0.9, 0.82, 0.76]] },
  });
  // The pier: coursed sides and front (the fall face), its top level with the second terrace.
  courseWall(rock, [[pier.x0, pier.z0 + 2.2], [pier.x0, pier.z1], [fall.x - fall.w / 2, pier.z1], [fall.x + fall.w / 2, pier.z1], [pier.x1, pier.z1], [pier.x1, pier.z0 + 2.2]], 0, pier.y, rng, {
    ...basalt, keep: (x, z) => z < pier.z1 - 0.2 || Math.abs(x - fall.x) > fall.w / 2 - 0.05,
  });
  // Behind the fall: a recessed, scorched chute the sheet pours down.
  slag.box([fall.x - fall.w / 2 - 0.05, 0, pier.z1 - 0.5], [fall.x + fall.w / 2 + 0.05, pier.y - 0.04, pier.z1 - 0.12], grey(0.45), rng, { skip: [true, true, true, true, false, true] });
  // The near lip: one low course facing the camera, the dark apron below it.
  courseWall(rock, [[-16, LIP_Z], [16, LIP_Z]], APRON_Y, 0, rng, { ...basalt, course: 0.8, length: 1.3, ends: false, topTint: undefined });
  // Tall faceted spires of columnar basalt.
  for (const [x, z, h, r] of [[5.0, -5.1, 5.6, 0.95], [-6.9, -2.6, 5.0, 0.85], [8.3, 1.2, 4.2, 0.75]] as const) basaltSpire(rock, [x, groundY(x, z), z], r, h, rng, lite, [fall.x, pier.y * 0.6, fall.z + 0.3]);
  // Big dark rocks at the near corners (silhouettes framing the stage).
  for (const [x, z, s] of [[-7.4, 4.2, 1.5], [-5.6, 5.4, 1.1], [7.0, 4.5, 1.6], [8.6, 3.2, 1.2]] as const) {
    boulder(rock, [x, groundY(x, z) + s * 0.35, z], [s * 1.4, s, s * 1.1], grey(0.7 + rng.next() * 0.15), rng, { ry: rng.next() * 0.8 - 0.4, aoBottom: 0.45, topK: 1.3, jitter: s * 0.05, topJitter: s * 0.1 });
  }
  // Shading: masses darken toward the top (the light comes from the lava below), baked lava rims.
  const fallP = V(fall.x, pier.y * 0.6, fall.z + 0.3);
  const CHANNEL_D = TIERS[1]!.d + DEPTH + 0.35;
  const lavaGlow = (x: number, y: number, z: number) => {
    const df = Math.hypot(x - fallP.x, (y - fallP.y) * 0.8, z - fallP.z), dp = Math.hypot(x - pool.x, y, z - pool.z);
    const dc = Math.abs(floorD(x, z) - CHANNEL_D) + Math.abs(y - TIERS[1]!.y) * 0.7;
    return Math.max(Math.exp(-df * 0.42), Math.exp(-dp * 0.5) * 0.9, Math.exp(-dc * 1.3) * 0.75);
  };
  const rockGeo = rock.build();
  shadeVertices(rockGeo, (x, y, z, ny, nx, nz) => {
    const k = lavaGlow(x, y, z);
    const toFall = Math.max(0, (nx * (fallP.x - x) + nz * (fallP.z - z)) / Math.max(0.5, Math.hypot(fallP.x - x, fallP.z - z)));
    const rim = k * (ny > 0.5 ? 0.55 : 0.25 + toFall * 0.9);
    const high = Math.min(1, Math.max(0, y - 1.2) / 5); // darker toward the top
    const near = z > LIP_Z - 0.6 ? 0.55 : 1; // the near lip and corner rocks: silhouettes
    const base = (1 - high * 0.45) * near;
    return [base * (1 + rim * 2.1), base * (1 + rim * 0.8), base * (1 - rim * 0.1)];
  });
  group.add(mk(rockGeo, track(surfaceMaterial(texBasalt, undefined, true, false))));

  // ---- ash floor + ledges + apron (one ground mesh): scorched and lava-lit near the fall and
  // pool, a lighter worn patch where the foe stands, dark beyond the lip
  {
    const foe = SPOTS[1];
    const g = groundGrid([-16, -13, 16, 14], lite ? 0.3 : 0.25, 64, groundY, (x, z) => {
      if (z > LIP_Z + 0.35) return [0.28, 0.24, 0.22];
      const d = floorD(x, z), dn = nextRiser(d, TIERS, DEPTH);
      const ao = 1 - 0.45 * Math.exp(-Math.max(0, dn) / 0.3) - (d > 0 ? 0.12 : 0);
      const k = lavaGlow(x, groundY(x, z), z);
      const patch = Math.exp(-(((x - foe.x) / 1.6) ** 2 + ((z - foe.z) / 1.2) ** 2)) * 0.22;
      const front = 1 - 0.35 * THREE.MathUtils.smoothstep(z, LIP_Z - 1.6, LIP_Z);
      const f = ao * front * (1 + patch);
      return [f * (0.86 + k * 1.5), f * (0.8 + k * 0.6), f * (0.74 - k * 0.1)];
    });
    group.add(mk(g, track(surfaceMaterial(texAsh)), false, true));
  }

  // ---- lava: the fall, its floor pool, the channel along the second terrace's ledge
  const lava = new LavaBatch();
  const skirt = new LavaBatch();
  const fallPts = Array.from({ length: 13 }, (_, i) => {
    const t = i / 12;
    return V(fall.x + Math.sin(t * 5.1) * 0.05, fall.top + 0.02 + (-0.17 - fall.top) * t, fall.z + 0.06 + t * t * 0.32);
  });
  lava.strip(fallPts, fall.w, 6, true, { rag: 0.16, speed: 1.6, seed: 2 });
  lava.pool(V(pool.x, -0.18, pool.z), pool.rx, pool.rz, 22, 0.1, 0.25);
  // The channel: along the ledge iso-line on both sides of the pier, flowing toward it.
  const channels = isoLines(floorD, CHANNEL_D, [-12, -12, 12, 3]).filter((c) => c.length > 4);
  for (const c of channels) {
    const pts = c.filter(([x, z]) => !inPier(x, z)).map(([x, z]) => V(x, TIERS[1]!.y + 0.03, z));
    // Split where the pier interrupts (gaps > 0.6) and draw each run.
    let run: THREE.Vector3[] = [];
    const flush = () => { if (run.length > 3) { lava.strip(run, 0.42, 3, false, { rag: 0.05, speed: 0.3, seed: run.length }); skirt.strip(run.map((p) => p.clone().setY(p.y + 0.02)), 1.6, 4, false, { rag: 0.1, seed: 7 }); } run = []; };
    for (const p of pts) { if (run.length && p.distanceTo(run[run.length - 1]!) > 0.6) flush(); run.push(p); }
    flush();
  }
  // The channel spills along the pier top into the fall.
  const zc = -4.6 - CHANNEL_D; // where the ledge channel crosses the pier
  lava.strip([V(fall.x, pier.y + 0.03, zc), V(fall.x, pier.y + 0.03, (zc + pier.z1) / 2), V(fall.x, pier.y + 0.03, pier.z1 - 0.05)], fall.w - 0.1, 4, false, { rag: 0.06, speed: 0.7, seed: 3 });
  skirt.pool(V(pool.x, 0.02, pool.z + 0.2), pool.rx + 1.7, pool.rz + 1.3, 22, 0.1);
  skirt.strip(fallPts.map((p) => p.clone().setZ(p.z + 0.05)), fall.w + 1.4, 4, true, { rag: 0.2, seed: 9 });
  const lavaMat = track(new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG,
    uniforms: { uTime: { value: 0 }, uTexel: { value: TEXEL }, uRamp: { value: RAMPS2.lava.map((h, i) => hdr(h, i >= 4 ? 1.6 + (i - 4) * 0.5 : 1.0)) } },
    side: THREE.DoubleSide,
  }));
  group.add(mk(lava.build(), lavaMat, false, false));
  const skirtMat = track(new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT, fragmentShader: SKIRT_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: hdr('#ff6a24', 0.45) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const skirtMesh = mk(skirt.build(), skirtMat, false, false);
  skirtMesh.renderOrder = 3;
  group.add(skirtMesh);
  updates.push((t) => { lavaMat.uniforms.uTime!.value = t; skirtMat.uniforms.uTime!.value = t; });

  // ---- cooled slag round the pool, a few rubble piles at the wall feet (never mid-floor)
  for (let a = 0; a < Math.PI * 2; a += 0.42 + rng.next() * 0.25) {
    const x = pool.x + Math.cos(a) * (pool.rx + 0.12), z = pool.z + Math.sin(a) * (pool.rz + 0.1);
    if (z < pier.z1 + 0.15) continue;
    const s = 0.2 + rng.next() * 0.18;
    slag.rotBox([x, s * 0.25, z], [s * 1.3, s * 0.7, s], rng.next() * 3, grey(0.8 + rng.next() * 0.3), rng, (rng.next() - 0.5) * 0.3);
    if (rng.chance(0.35)) glow.rotBox([x, 0.02, z], [s * 1.1, 0.04, s * 0.4], rng.next() * 3, hdr('#ff6a1a', 2.0), rng);
  }
  for (const [x, z, r] of [[-5.4, -1.2, 0.8], [5.4, -2.2, 0.75], [6.2, 2.4, 0.9], [-5.9, 2.8, 0.7]] as const) {
    if (!clear(x, z, r)) continue;
    rubblePile(slag, [x, groundY(x, z), z], rng, { radius: r, heap: 0.55, tint: '#9a8a82', ramp: [[0.55, 0.5, 0.48], [0.7, 0.64, 0.6], [0.85, 0.78, 0.72], [1.0, 0.9, 0.82]] });
  }
  pebbles(slag, [-6, -3.6, 6.5, 4.2], lite ? 18 : 34, rng, keepOut.map((c) => ({ ...c, r: c.r * 0.8 })), '#8a7a72', [[0.6, 0.55, 0.52], [0.8, 0.72, 0.66], [1.0, 0.9, 0.82]]);
  group.add(mk(slag.build(), track(surfaceMaterial(texSlag, undefined, true))));
  group.add(mk(glow.build(), track(new THREE.MeshBasicMaterial({ vertexColors: true })), false, false));

  // ---- floor decals: glowing cracks fanning from the pool, the lit patch under the foe
  {
    const tex = crackTexture();
    const mats: THREE.MeshBasicMaterial[] = [];
    for (const [x, z, w, d, r] of [[pool.x - 1.6, pool.z + 0.6, 2.2, 1.6, 0.3], [pool.x + 1.9, pool.z + 0.4, 2.0, 1.4, -0.4]] as const) {
      const m = decal(tex, x, 0.012, z, w, d, { additive: true, rot: r, color: new THREE.Color(1.4, 1.05, 0.9) });
      track(m.material as THREE.Material);
      mats.push(m.material as THREE.MeshBasicMaterial);
      group.add(m);
    }
    updates.push((t) => mats.forEach((m, i) => { m.opacity = 0.75 + 0.25 * Math.sin(t * 1.6 + i * 1.7); }));
    const glowTex = track(glowTexture('rgba(255,140,60,0.65)'));
    for (const d of [
      decal(glowTex, pool.x, 0.02, pool.z + 1.0, 6.5, 4.2, { additive: true, color: new THREE.Color(0.75, 0.42, 0.24) }),
      // The foe's stage: a warm, fall-lit patch of pale ash so a dark kin reads against it.
      decal(glowTex, SPOTS[1].x - 0.2, 0.021, SPOTS[1].z + 0.1, 3.6, 2.6, { additive: true, color: new THREE.Color(0.55, 0.42, 0.32) }),
    ]) { track(d.material as THREE.Material); group.add(d); }
  }
  if (opts.trainer) {
    const m = decal(troddenMarking('#3a2a24', '#c8b49c', ['#a99285', '#635053', '#2a1e1e']), 0.1, 0.014, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- lights: the lava fall is the key (a warm spot from the fall face toward the stage,
  // shadows toward the camera), a dim smoky hemisphere, a soft top fill, the pool's glow
  const key = new THREE.SpotLight(new THREE.Color('#ff9a52'), 70, 0, 0.95, 0.75, 1.15);
  key.position.set(fall.x + 0.2, pier.y + 0.6, fall.z + 0.7);
  key.target.position.set(0.6, 0, 0.8);
  key.castShadow = true;
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 16;
  group.add(key, key.target);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#a08a7a'), new THREE.Color('#9a4a26'), 2.4);
  group.add(hemi);
  const top = new THREE.DirectionalLight(new THREE.Color('#e6cdb4'), 1.3);
  top.position.set(-2, 9, 7);
  group.add(top, top.target);
  if (q === 'high') {
    const p1 = new THREE.PointLight(new THREE.Color('#ff6a22'), 10, 7, 1.5);
    p1.position.set(pool.x, 0.7, pool.z + 0.3);
    group.add(p1);
  }

  // ---- heat shimmer shafts off the pool and the fall + embers
  const beams: BeamSpec[] = [
    { start: V(pool.x, 0, pool.z), end: V(pool.x + 0.3, 3.6, pool.z - 0.8), width: [1.8, 2.8] },
    { start: V(fall.x, pier.y, fall.z), end: V(fall.x - 0.2, 4.4, fall.z - 0.9), width: [1.2, 2.2] },
  ];
  const rays = lightBeams(beams, new THREE.Color('#ff7a3a'), 0.08);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);
  const lowK = lite ? 0.55 : 1;
  const embers = particles({
    kind: 'ember',
    emitters: [
      { min: V(pool.x - 1, -0.1, pool.z - 0.5), max: V(pool.x + 1, 0.1, pool.z + 0.5), vmin: V(-0.2, 0.4, -0.1), vmax: V(0.15, 0.95, 0.15), count: Math.round(34 * lowK), life: [1.6, 3], size: [0.018, 0.032] },
      { min: V(fall.x - 0.5, 0, fall.z + 0.1), max: V(fall.x + 0.5, 0.3, fall.z + 0.5), vmin: V(-0.5, 0.8, 0.0), vmax: V(0.5, 1.5, 0.5), count: Math.round(18 * lowK), life: [0.7, 1.4], size: [0.02, 0.034] },
      { min: V(-8, TIERS[1]!.y, -6.5), max: V(8, TIERS[1]!.y + 0.2, -5.0), vmin: V(-0.1, 0.4, -0.05), vmax: V(0.1, 0.8, 0.1), count: Math.round(26 * lowK), life: [1.8, 3.2], size: [0.016, 0.028] },
      { min: V(-5, 0.5, -3), max: V(5, 2.0, 3.5), vmin: V(-0.05, 0.1, -0.05), vmax: V(0.1, 0.25, 0.05), count: Math.round(10 * lowK), life: [3, 5], size: [0.016, 0.026] },
    ],
    colorA: hdr('#ffd25a', 1.35), colorB: hdr('#ff5a14', 1.05), accel: V(0.05, -0.02, 0.03), wiggle: 0.35,
  }, rng);
  group.add(embers.points); track(embers); updates.push(embers.update); pixelers.push(embers.setPixelSize);

  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#ffa060').multiplyScalar(0.66),
    sky: new THREE.Color('#9a8070').multiplyScalar(0.55),
    ground: new THREE.Color('#ff7a40').multiplyScalar(0.7),
    // A hot rim from the fall behind the stage: dark kin (Vulcrag) keep a readable edge.
    rim: new THREE.Color('#ffb46a').multiplyScalar(0.95),
  };

  return {
    group,
    spots: SPOTS,
    people: [V(-2.5, 0, 1.9), V(2.75, 0, -1.95)],
    trainerExit: V(5.0, 0, -2.6),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { for (const p of pixelers) p(px); },
    dispose() { disposeGroup(group, disposables); },
  };
}

/**
 * A tall faceted spire of columnar basalt: a cluster of hexagonal columns (the tallest in the
 * middle, the rest stepping down round it), each with a bevelled, lit top and a broken cap,
 * slightly leaning. Emitted into the rock batch with the rock-face bevel code.
 */
function basaltSpire(b: VoxelBatch, base: V3, r: number, h: number, rng: Rng, lite: boolean, light: V3) {
  const cols: [number, number, number, number][] = [[0, 0, r * 0.62, h]];
  const n = lite ? 4 : 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.next() * 0.4;
    const d = r * (0.62 + rng.next() * 0.25);
    cols.push([Math.cos(a) * d, Math.sin(a) * d, r * (0.4 + rng.next() * 0.18), h * (0.35 + rng.next() * 0.5)]);
  }
  const lean = [(rng.next() - 0.5) * 0.06, (rng.next() - 0.5) * 0.06];
  for (const [cx, cz, cr, ch] of cols) {
    const x = base[0] + cx, z = base[2] + cz, y0 = base[1] - 0.3;
    const tint = new THREE.Color(1, 1, 1).multiplyScalar(0.82 + rng.next() * 0.22);
    const rot = rng.next() * Math.PI;
    const ring = (y: number, rr: number) => Array.from({ length: 6 }, (_, k) => {
      const a = rot + (k / 6) * Math.PI * 2;
      const t = (y - y0) / ch;
      return [x + Math.cos(a) * rr + lean[0]! * t * ch, y, z + Math.sin(a) * rr + lean[1]! * t * ch] as V3;
    });
    const yt = y0 + ch, bev = Math.min(0.08, cr * 0.18);
    const r0 = ring(y0, cr), r1 = ring(yt - bev, cr), r2 = ring(yt, cr - bev);
    const tile = TEXEL * b.tileTexels;
    const face = (q: V3[], k: number, side: boolean, w: number) => {
      const e1 = new THREE.Vector3(q[1]![0] - q[0]![0], q[1]![1] - q[0]![1], q[1]![2] - q[0]![2]);
      const e2 = new THREE.Vector3(q[2]![0] - q[0]![0], q[2]![1] - q[0]![1], q[2]![2] - q[0]![2]);
      const nrm = e1.cross(e2).normalize();
      // Facets turned toward the lava fall catch a hot rim (the spires read as faceted heroes,
      // not flat dark slabs); the rest stay dark.
      const toL = new THREE.Vector3(light[0] - q[0]![0], 0, light[2] - q[0]![2]).normalize();
      const rim = side ? Math.max(0, nrm.x * toL.x + nrm.z * toL.z) ** 2 : 0;
      const c = tint.clone().multiplyScalar(k);
      c.r *= 1 + rim * 1.6; c.g *= 1 + rim * 0.7; c.b *= 1 + rim * 0.15;
      const uv = q.map((p) => (side ? [(p[0] + p[2]) / tile, p[1] / tile] : [p[0] / tile, p[2] / tile]) as [number, number]);
      const fa = q.map((p, i) => (side ? [i === 1 || i === 2 ? w : 0, p[1] - y0, -(w + 2), -(ch - bev)] : [0, 0, -1, k]) as [number, number, number, number]);
      for (let t = 1; t + 1 < q.length; t++) b.tri([q[0]!, q[t]!, q[t + 1]!], [nrm.x, nrm.y, nrm.z], [uv[0]!, uv[t]!, uv[t + 1]!], [c, c, c], [fa[0]!, fa[t]!, fa[t + 1]!]);
    };
    for (let k = 0; k < 6; k++) {
      const k2 = (k + 1) % 6;
      const w = Math.hypot(r0[k2]![0] - r0[k]![0], r0[k2]![2] - r0[k]![2]);
      face([r0[k]!, r0[k2]!, r1[k2]!, r1[k]!], 1, true, w);
      face([r1[k]!, r1[k2]!, r2[k2]!, r2[k]!], 1.25, false, w);
    }
    // Top cap, a little tilted (a broken column end).
    const tilt = (rng.next() - 0.5) * cr * 0.5;
    const cap = r2.map((p, i) => [p[0], p[1] + (i < 3 ? tilt : -tilt) * 0.5, p[2]] as V3).reverse();
    face(cap, 1.45, false, 0);
  }
}

function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

