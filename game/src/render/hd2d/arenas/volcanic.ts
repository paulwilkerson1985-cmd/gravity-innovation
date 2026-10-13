// Steaming volcanic cave (Ember Ridge `vent-cave`): a sunken ash floor ringed by terraced
// columnar basalt, a lava river running behind the floor fed by a lavafall pouring out of the
// back wall, a lava pool front-right, glowing cracks, steam plumes from vents, rising embers,
// violet and ember crystals, cooled-lava rubble, and red-orange underlighting from the lava
// (the light motif: everything is lit from below and behind by the molten river).
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { CELL, Heightmap, LEVEL, TEXEL, VoxelBatch, lightBeams, surfaceMaterial, type ArenaRig, type BeamSpec } from '../arena';
import { boulderColumns, rubblePile } from '../kit/rock';
import { paintBoulder } from '../textures';
import type { SpriteLight } from '../sprite';
import type { Grade } from '../pipeline';
import type { ArenaDef } from './index';
import { RAMPS2, V, TRODDEN_SIZE, troddenMarking, cachedCanvas, cachedTexture, decal, disposeGroup, floorGrid, glowTexture, grey, hdr, makeGrade, orientedBox, shadeVertices, paintAlpha, paintAsh, paintRockOn, particles } from './localKit';

export interface TerrainArenaOptions { seed?: number; quality?: 'high' | 'low'; trainer?: boolean }

export const ARENA: ArenaDef = {
  id: 'volcanic',
  label: 'Steaming volcanic cave',
  match: [{ route: 'ridge', hotspot: 'vent-cave' }],
  build: (o) => buildVolcanicArena({ seed: o.seed, quality: o.quality, trainer: o.trainerBattle }),
  grade: volcanicGrade,
  background: '#2a161c',
  fog: '#4a2a30',
  fogRange: [10, 40],
};

export function volcanicGrade(): Grade {
  return makeGrade({
    lift: new THREE.Vector3(0.012, 0.0, 0.01), gain: new THREE.Vector3(1.04, 0.98, 0.94), gamma: new THREE.Vector3(1.1, 1.1, 1.1),
    saturation: 0.8, contrast: 1.06,
    shadowTint: new THREE.Color('#2c1a3a'), highTint: new THREE.Color('#ffc890'), splitAmount: 0.14,
    vignette: 0.16, exposure: 1.46,
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
 * (1.5, 0, −1.0)); the lava sits behind and to the right of the floor, never under the spots.
 */
export function buildVolcanicArena(opts: TerrainArenaOptions = {}): ArenaRig {
  const rng = new Rng(opts.seed ?? 23);
  const q = opts.quality ?? 'high';
  const group = new THREE.Group();
  group.name = 'hd2d-volcanic-arena';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
  const updates: ((t: number) => void)[] = [];
  const pixelers: ((px: number) => void)[] = [];

  const texBasalt = cachedTexture('basalt-boulder-warm', () => paintBoulder(13, 32, RAMPS2.basalt));
  const texAsh = cachedTexture('ash-light', () => paintAsh(17, 64));
  const texSlag = cachedTexture('slag-warm', () => paintRockOn(19, RAMPS2.slag, 32));

  // ---- heightmap
  const X0 = -13.5, Z0 = -12.6;
  const hm = new Heightmap(30, 21, X0, Z0);
  const floorHalfX = 5.4, floorFront = 3.6, floorBack = -3.0;
  const river = { z: -4.25, half: 0.75 };      // lava river behind the floor
  const fall = { x0: -4.6, x1: -2.6, z: -6.25 }; // lavafall notch in the back wall
  const fall2 = { x0: 4.5, x1: 5.7, z: -6.25 };  // a smaller second fall, right
  const pool = { x: 6.1, z: 2.3, rx: 1.35, rz: 1.0 };
  for (let j = 0; j < hm.nz; j++) for (let i = 0; i < hm.nx; i++) {
    const x = hm.cx(i), z = hm.cz(j);
    const wob = Math.sin(x * 1.1 + z * 0.9) * 0.35 + Math.sin(z * 2.3 - x * 0.5) * 0.25;
    const dx = Math.max(0, Math.abs(x) - floorHalfX - wob);
    const dzB = Math.max(0, river.z - river.half - 0.2 - z - wob * 0.4);
    const dzF = Math.max(0, z - floorFront - wob * 0.5);
    let lv = 0;
    if (dzF > 0 && dx <= 0) lv = Math.min(2, 1 + Math.floor(dzF / 2.2));
    else {
      const d = Math.max(dx, dzB, dzF * 0.6);
      if (d > 0) lv = 1 + Math.floor(d / 1.5) + (d > 3 ? Math.floor((d - 3) / 1.1) : 0);
      if (x > 1 && d > 0) lv += Math.floor((x - 1) / 7); // the right side climbs higher
    }
    if (z < -6.3) lv = Math.max(lv, 9 + (Math.abs(x) > 6 ? 1 : 0));
    if (x < -9.5) lv = Math.max(lv, 7 + Math.floor((-9.5 - x) * 0.6));
    if (x > 9.5) lv = Math.max(lv, 6 + Math.floor((x - 9.5) * 0.6));
    // The river runs the full width; terraces stop at its banks.
    if (Math.abs(z - river.z) < river.half + 0.15 && Math.abs(x) < 9.6) lv = 0;
    // The lavafall notch: open from the river up to the back wall.
    if (x > fall.x0 && x < fall.x1 && z > fall.z - 0.1 && z < river.z) lv = 0;
    if (x > fall2.x0 && x < fall2.x1 && z > fall2.z - 0.1 && z < river.z) lv = 0;
    // The pool bites into the right terrace.
    if (((x - pool.x) / (pool.rx + 0.5)) ** 2 + ((z - pool.z) / (pool.rz + 0.5)) ** 2 < 1) lv = 0;
    const cl = Math.sin(Math.floor(i / 2) * 12.9898 + Math.floor(j / 2) * 78.233) * 43758.5453;
    const n = cl - Math.floor(cl);
    if (lv > 0 && lv < 9) lv = Math.max(1, lv + (n > 0.8 ? 1 : n < 0.1 ? -1 : 0) + (rng.chance(0.06) ? 1 : 0));
    hm.set(i, j, lv);
  }

  // ---- basalt walls (one mesh)
  const rock = new VoxelBatch(32);
  boulderColumns(hm, rock, rng, { tints: ['#ffffff', '#f0e8f4', '#fff0ec'] });
  // Baked falloff: the lava glow fades with height and distance from the river/pool, so the
  // upper walls sink into cool purple shadow and the eye goes to the molten floor of the cave.
  const fx = (fall.x0 + fall.x1) / 2;
  const lavaGlow = (x: number, y: number, z: number) => {
    const dr = Math.abs(z - river.z), dp = Math.hypot(x - pool.x, z - pool.z), df = Math.min(Math.hypot(x - fx, z - fall.z), Math.hypot(x - 5.1, z - fall.z) * 1.3) * 0.8;
    return Math.exp(-Math.max(0, y) / 2.2) * Math.max(Math.exp(-dr * 0.35), Math.exp(-dp * 0.5), Math.exp(-df * 0.4));
  };
  // Where the nearest molten surface is, seen from a point (horizontal direction, for rims).
  const lavaDir = (x: number, z: number): [number, number] => {
    const cands: [number, number][] = [[Math.max(-9.6, Math.min(9.6, x)), river.z], [pool.x, pool.z], [fx, fall.z], [(fall2.x0 + fall2.x1) / 2, fall2.z]];
    let best = cands[0]!, bd = 1e9;
    for (const c of cands) { const d = Math.hypot(c[0] - x, c[1] - z); if (d < bd) { bd = d; best = c; } }
    return [(best[0] - x) / Math.max(bd, 1e-3), (best[1] - z) / Math.max(bd, 1e-3)];
  };
  group.add(mk(shadeVertices(rock.build(), (x, y, z, ny, nx, nz) => {
    const k = lavaGlow(x, y, z), up = 0.82 + 0.18 * Math.exp(-Math.max(0, y - 0.5) / 3.5);
    // Baked lava rims (instead of a front underlight): boulder tops and the edges/faces that
    // look toward the molten river, pool or falls glow orange, scaled by the falloff field.
    const [dx, dz] = lavaDir(x, z);
    const facing = Math.max(0, nx * dx + nz * dz);
    const rim = k * (ny > 0.5 ? 0.75 : facing * (0.6 + 0.4 * Math.max(0, ny + 0.3)) * 1.25);
    // Far from any lava (high, back corners) the shadow cools toward violet; elsewhere warm grey.
    const far = (1 - Math.min(1, k * 3)) * Math.min(1, Math.max(0, y - 2) / 4);
    const base = (ny > 0.5 ? 1.25 : 1.06) * (1 + 0.2 * Math.min(1, Math.max(0, y) / 5));
    return [up * base * (1 + rim * 1.5 - far * 0.08), up * base * (1 + rim * 0.55 - far * 0.08), up * base * (1 - rim * 0.15 + far * 0.08)];
  }), track(surfaceMaterial(texBasalt, undefined, true))));

  // ---- ash floor: sinks into the river channel and the pool; scorched + lava-lit near them
  const inRiver = (x: number, z: number) => Math.abs(z - river.z) < river.half && Math.abs(x) < 9.6;
  const riverDist = (x: number, z: number) => Math.max(Math.abs(z - river.z) - river.half, Math.abs(x) - 9.6, 0);
  const poolD = (x: number, z: number) => Math.hypot((x - pool.x) / pool.rx, (z - pool.z) / pool.rz);
  const fallD = (x: number, z: number) => (((x > fall.x0 && x < fall.x1) || (x > fall2.x0 && x < fall2.x1)) && z < river.z && z > fall.z - 0.3 ? 0 : 9);
  const glowAt = (x: number, z: number) => {
    const dr = Math.min(riverDist(x, z), fallD(x, z));
    const dp = Math.max(0, (poolD(x, z) - 1) * pool.rx);
    return Math.max(Math.exp(-dr * 0.75), Math.exp(-dp * 1.0) * 0.9);
  };
  {
    const g = floorGrid(hm, texAsh, 64, {
      res: 2,
      heightAt: (x, z) => (inRiver(x, z) || fallD(x, z) === 0 ? -0.5 : poolD(x, z) < 1.05 ? -0.45 : 0),
      tintAt: (x, z) => { const k = glowAt(x, z); return [0.84 + k * 1.2, 0.8 + k * 0.45, 0.8 - k * 0.15]; },
      aoK: 0.9,
    });
    group.add(mk(g, track(surfaceMaterial(texAsh)), false, true));
  }

  // ---- lava: river, lavafall sheet + its splash, pool
  const lava = new LavaBatch();
  const skirt = new LavaBatch();
  const ly = -0.28;
  const rpts: THREE.Vector3[] = [];
  for (let x = -9.8; x <= 9.81; x += 0.3) rpts.push(V(x, ly, river.z + Math.sin(x * 0.7) * 0.12 + Math.sin(x * 2.3) * 0.05));
  lava.strip(rpts, river.half * 2 + 0.25, 6, false, { rag: 0.09, seed: 1 });
  // Glow skirt: a wider additive band on the banks around the river (one more draw call).
  skirt.strip(rpts.map((p) => p.clone().setY(0.03)), river.half * 2 + 2.6, 6, false, { rag: 0.12, seed: 4 });
  // The falls: a ragged vertical sheet down the notch (fast flow), a splash pool where it lands,
  // then a short run into the river.
  const mouthY = 5 * LEVEL;
  const fallPts = (cx: number, top: number, z: number, steps: number) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return V(cx + Math.sin(t * 5.1 + cx) * 0.06, top + (ly + 0.05 - top) * t, z + 0.02 + t * t * 0.2);
  });
  lava.strip(fallPts(fx, mouthY, fall.z, 12), fall.x1 - fall.x0 - 0.5, 6, true, { rag: 0.16, speed: 1.6, seed: 2 });
  lava.pool(V(fx, ly + 0.05, fall.z + 0.45), (fall.x1 - fall.x0) * 0.42, 0.42, 16, 0.12, 0.5);
  lava.strip([V(fx, ly + 0.02, fall.z + 0.3), V(fx, ly + 0.015, (fall.z + river.z) / 2), V(fx, ly + 0.01, river.z)], fall.x1 - fall.x0 - 0.3, 4, false, { rag: 0.08, speed: 0.6, seed: 3 });
  const fx2 = (fall2.x0 + fall2.x1) / 2, mouth2 = 3 * LEVEL;
  lava.strip(fallPts(fx2, mouth2, fall2.z, 9), fall2.x1 - fall2.x0 - 0.4, 4, true, { rag: 0.13, speed: 1.5, seed: 5 });
  lava.pool(V(fx2, ly + 0.05, fall2.z + 0.4), (fall2.x1 - fall2.x0) * 0.45, 0.36, 14, 0.12, 0.5);
  lava.strip([V(fx2, ly + 0.02, fall2.z + 0.28), V(fx2, ly + 0.01, river.z)], fall2.x1 - fall2.x0 - 0.3, 3, false, { rag: 0.07, speed: 0.6, seed: 6 });
  lava.pool(V(pool.x, ly + 0.03, pool.z), pool.rx, pool.rz, 22, 0.1);
  skirt.pool(V(pool.x, 0.03, pool.z), pool.rx + 1.1, pool.rz + 0.9, 22, 0.1);
  skirt.pool(V(fx, 0.03, fall.z + 0.6), (fall.x1 - fall.x0) * 0.75, 0.9, 16, 0.1);
  const lavaMat = track(new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT, fragmentShader: LAVA_FRAG,
    uniforms: { uTime: { value: 0 }, uTexel: { value: TEXEL }, uRamp: { value: RAMPS2.lava.map((h, i) => hdr(h, i >= 4 ? 1.6 + (i - 4) * 0.5 : 1.0)) } },
    side: THREE.DoubleSide,
  }));
  const lavaMesh = mk(lava.build(), lavaMat, false, false);
  group.add(lavaMesh);
  const skirtMat = track(new THREE.ShaderMaterial({
    vertexShader: LAVA_VERT, fragmentShader: SKIRT_FRAG,
    uniforms: { uTime: { value: 0 }, uColor: { value: hdr('#ff6a24', 0.42) } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const skirtMesh = mk(skirt.build(), skirtMat, false, false);
  skirtMesh.renderOrder = 3;
  group.add(skirtMesh);
  updates.push((t) => { lavaMat.uniforms.uTime!.value = t; skirtMat.uniforms.uTime!.value = t; });

  // ---- cooled-lava rubble, banks, vents (slag mesh) + glowing seams/crystals (glow mesh)
  const slag = new VoxelBatch(32);
  const glow = new VoxelBatch(16);
  const chunk = (x: number, z: number, s: number, y = 0, seam = false) => {
    slag.rotBox([x, y + s * 0.38, z], [s * (0.9 + rng.next() * 0.5), s * 0.8, s * (0.8 + rng.next() * 0.5)], rng.next() * Math.PI, grey(0.9 + rng.next() * 0.35), rng, (rng.next() - 0.5) * 0.35);
    if (seam) glow.rotBox([x, y + s * 0.1, z], [s * 1.05, 0.05, s * 0.4], rng.next() * Math.PI, hdr('#ff6a1a', 2.2), rng);
  };
  const rubble = (cx: number, cz: number, r: number, n: number, y = 0) => {
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r;
      const s = 0.18 + rng.next() * 0.4 * (1 - (d / r) * 0.6);
      chunk(cx + Math.cos(a) * d, cz + Math.sin(a) * d * 0.8, s, y + Math.max(0, (1 - d / r) * r * 0.4 - s * 0.3), rng.chance(0.3));
    }
  };
  for (const [x, z, r] of [[-4.9, -2.2, 1.2], [-5.1, 1.7, 1.0], [4.6, -2.2, 1.0], [3.8, 3.4, 0.8], [-1.8, 3.6, 0.6]] as const) {
    rubblePile(slag, [x, 0, z], rng, { radius: r, heap: 0.55 });
    rubble(x, z, r * 0.8, 3);
  }
  // River banks: a broken lip of chunks along both sides.
  for (let x = -9; x <= 9; x += 0.55 + rng.next() * 0.5) {
    if ((x > fall.x0 - 0.2 && x < fall.x1 + 0.2) || (x > fall2.x0 - 0.2 && x < fall2.x1 + 0.2)) continue;
    chunk(x, river.z + river.half + 0.1 + rng.next() * 0.2, 0.22 + rng.next() * 0.22, -0.12, rng.chance(0.35));
    chunk(x + 0.3, river.z - river.half - 0.1 - rng.next() * 0.2, 0.25 + rng.next() * 0.25, -0.12, rng.chance(0.25));
  }
  // Pool rim.
  for (let a = 0; a < Math.PI * 2; a += 0.38 + rng.next() * 0.2) chunk(pool.x + Math.cos(a) * (pool.rx + 0.15), pool.z + Math.sin(a) * (pool.rz + 0.12), 0.24 + rng.next() * 0.2, -0.1, rng.chance(0.4));
  // Scattered cinders on the floor (off the kin spots).
  for (let i = 0; i < 34; i++) {
    const x = (rng.next() - 0.5) * floorHalfX * 2, z = floorBack + rng.next() * (floorFront - floorBack);
    if (Math.abs(x + 1.3) < 1.1 && Math.abs(z - 1.0) < 1.0) continue;
    if (Math.abs(x - 1.5) < 1.1 && Math.abs(z + 1.0) < 1.0) continue;
    const s = 0.05 + rng.next() * 0.08;
    slag.rotBox([x, s * 0.35, z], [s * 1.3, s * 0.7, s], rng.next() * 3, grey(0.8 + rng.next() * 0.3), rng);
  }
  // Steam vents: squat cones of stacked slag rings with a glowing throat.
  const vents: THREE.Vector3[] = [V(-6.3, 0.7, -1.0), V(6.9, 1.4, -2.6), V(-7.4, 1.4, 2.6)];
  for (const v of vents) {
    for (let r = 0; r < 3; r++) {
      const rad = 0.55 - r * 0.15, y = v.y + r * 0.16;
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + r; slag.rotBox([v.x + Math.cos(a) * rad, y + 0.08, v.z + Math.sin(a) * rad], [0.3, 0.18, 0.22], -a, grey(0.85 + r * 0.12), rng); }
    }
    glow.box([v.x - 0.12, v.y + 0.3, v.z - 0.12], [v.x + 0.12, v.y + 0.36, v.z + 0.12], hdr('#ff8a2a', 2.6), rng);
  }
  // Crystals: violet clusters on the walls (cool counterpoint) + a few ember ones.
  // Crystal clusters growing out of the foot of the walls: shards fan out of the rock toward the
  // floor (`out` = direction away from the wall), with a glow pool on the ground in front.
  // Ember-amber crystals near the front; violet only in the far, shadowed back corner.
  const crystals: [number, number, number, string][] = [[-5.7, -1.0, 0, '#ffa040'], [-5.6, 2.6, 0.3, '#ff8a2a'], [5.8, -0.4, Math.PI, '#ffb050'], [5.0, -2.8, Math.PI - 0.6, '#8a4ad0'], [-4.9, -2.9, -0.5, '#ff7a1a']];
  const crystalPools: [number, number, string][] = [];
  for (const [x, z, out, c] of crystals) {
    for (let i = 0; i < 7; i++) {
      const a = out + (rng.next() - 0.5) * 1.6;
      const h = 0.45 + rng.next() * 0.6;
      const d = 0.05 + rng.next() * 0.3;
      // Lean out of the wall: tilt about the axis perpendicular to the outward direction.
      const dir = V(Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55);
      orientedBox(glow, V(x + Math.cos(a) * d, h * 0.38, z + Math.sin(a) * d), V(0.18, h, 0.18), dir, hdr(c, 0.85 + rng.next() * 0.5), rng, rng.next());
      if (i % 3 === 0) orientedBox(glow, V(x + Math.cos(a) * d, h * 0.7, z + Math.sin(a) * d), V(0.07, h * 0.5, 0.07), dir, hdr('#fff4e0', 1.6), rng, 0.4);
    }
    crystalPools.push([x + Math.cos(out) * 0.5, z + Math.sin(out) * 0.5, c]);
  }
  // The fall's mouth: a glowing slot in the wall with a dark lintel of slag above it.
  glow.box([fall.x0 + 0.35, mouthY - 0.05, fall.z - 0.02], [fall.x1 - 0.35, mouthY + 0.22, fall.z + 0.03], hdr('#ff7a22', 1.5), rng);
  slag.box([fall.x0 - 0.1, mouthY + 0.35, fall.z - 0.1], [fall.x1 + 0.1, mouthY + 0.7, fall.z + 0.3], grey(0.8), rng, { aoBottom: 0.5 });
  glow.box([fall2.x0 + 0.3, mouth2 - 0.05, fall2.z - 0.02], [fall2.x1 - 0.3, mouth2 + 0.16, fall2.z + 0.03], hdr('#ff7a22', 1.4), rng);
  slag.box([fall2.x0 - 0.1, mouth2 + 0.2, fall2.z - 0.1], [fall2.x1 + 0.1, mouth2 + 0.5, fall2.z + 0.26], grey(0.8), rng, { aoBottom: 0.5 });
  // Glowing seams in the back wall over the river (lit from the river) and around the fall.
  for (let i = 0; i < 16; i++) {
    const x = -9 + rng.next() * 18;
    if (x > fall.x0 - 0.3 && x < fall.x1 + 0.3) continue;
    glow.box([x, 0.15 + rng.next() * 0.9, -6.33], [x + 0.06 + rng.next() * 0.3, 0.2 + rng.next() * 0.9, -6.27], hdr('#ff5a14', 1.8), rng);
  }
  group.add(mk(slag.build(), track(surfaceMaterial(texSlag, undefined, true))));
  group.add(mk(glow.build(), track(new THREE.MeshBasicMaterial({ vertexColors: true })), false, false));

  // ---- glowing floor cracks near the edges (additive decals, pulsing), never under the kin
  {
    const tex = crackTexture();
    const mats: THREE.MeshBasicMaterial[] = [];
    for (const [x, z, w, d, r] of [[-4.2, -1.4, 2.6, 2.2, 0.3], [3.8, 0.9, 2.4, 2.0, -0.5], [0.0, -2.5, 3.0, 1.2, 0.1], [-3.4, 3.0, 2.2, 1.4, 0.9], [4.8, -1.8, 1.8, 1.4, 1.4]] as const) {
      const m = decal(tex, x, 0.012, z, w, d, { additive: true, rot: r, color: new THREE.Color(1.6, 1.2, 1.0) });
      track(m.material as THREE.Material);
      mats.push(m.material as THREE.MeshBasicMaterial);
      group.add(m);
    }
    // Veins running from the river along both floor edges toward the camera, and under the front ledge.
    const vein = tex.clone();
    vein.repeat.set(1, 3);
    track(vein);
    for (const [x, z, w, d, r] of [[-4.9, 0.4, 1.3, 7.0, 0.08], [4.9, 0.6, 1.3, 7.0, -0.1], [-0.6, 3.7, 1.2, 6.0, Math.PI / 2 + 0.05]] as const) {
      const m = decal(vein, x, 0.013, z, w, d, { additive: true, rot: r, color: new THREE.Color(1.5, 1.1, 0.9) });
      track(m.material as THREE.Material);
      mats.push(m.material as THREE.MeshBasicMaterial);
      group.add(m);
    }
    updates.push((t) => mats.forEach((m, i) => { m.opacity = 0.75 + 0.25 * Math.sin(t * 1.6 + i * 1.7); }));
    const poolTex = track(glowTexture('rgba(255,255,255,0.5)'));
    for (const [x, z, c] of crystalPools) {
      const m = decal(poolTex, x, 0.02, z, 1.8, 1.4, { additive: true, color: new THREE.Color(c).multiplyScalar(0.55) });
      track(m.material as THREE.Material);
      group.add(m);
    }
  }
  // Lava light pools: additive bounce on the floor near the river and pool.
  {
    const tex = track(glowTexture('rgba(255,120,40,0.6)'));
    for (const d of [decal(tex, -1.0, 0.02, -3.0, 13, 2.8, { additive: true, color: new THREE.Color(0.7, 0.4, 0.25) }), decal(tex, pool.x - 0.6, 0.02, pool.z, 4.2, 3.6, { additive: true, color: new THREE.Color(0.6, 0.34, 0.2) })]) {
      track(d.material as THREE.Material);
      group.add(d);
    }
  }
  if (opts.trainer) {
    const m = decal(troddenMarking('#3a2a24', '#c8b49c', ['#a99285', '#635053', '#2a1e1e']), 0.1, 0.014, 0.0, TRODDEN_SIZE, TRODDEN_SIZE, { rot: Math.atan2(2.0, 2.8) });
    track(m.material as THREE.Material);
    group.add(m);
  }

  // ---- lights: lava key from behind-left (shadows toward the camera), hemisphere, underlight
  const key = new THREE.SpotLight(new THREE.Color('#ff8a4a'), 55, 0, 0.95, 0.7, 1.1);
  key.position.set(-2.6, 2.4, -4.6);
  key.target.position.set(0.6, 0, 1.4);
  key.castShadow = true;
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  group.add(key, key.target);
  // Readable, lava-lit exposure: a strong warm hemisphere (smoky mauve sky, molten ground) and a
  // soft top light; the lava rims are baked into the rock (no front underlight).
  const hemi = new THREE.HemisphereLight(new THREE.Color('#c8b0b8'), new THREE.Color('#a04a2a'), 3.0);
  group.add(hemi);
  const top = new THREE.DirectionalLight(new THREE.Color('#e0c8c0'), 1.7);
  top.position.set(-2, 9, 7);
  group.add(top, top.target);
  if (q === 'high') {
    const p1 = new THREE.PointLight(new THREE.Color('#ff6a22'), 9, 7, 1.6);
    p1.position.set(fx, 1.0, fall.z + 0.8);
    const p2 = new THREE.PointLight(new THREE.Color('#ff7a2a'), 6, 5.5, 1.6);
    p2.position.set(pool.x - 0.4, 0.8, pool.z);
    group.add(p1, p2);
  }

  // ---- heat shafts rising from the lava (the light motif) + steam + embers
  const beams: BeamSpec[] = [];
  for (const x of [-6.8, 0.4, 7.2]) beams.push({ start: V(x, ly, river.z + (rng.next() - 0.5) * 0.4), end: V(x + (rng.next() - 0.5) * 1.2, 3.6 + rng.next() * 1.0, river.z - 0.6 - rng.next() * 0.6), width: [1.2, 2.2 + rng.next() * 0.6] });
  beams.push({ start: V(pool.x, ly, pool.z), end: V(pool.x + 0.4, 3.2, pool.z - 0.5), width: [1.6, 2.4] });
  const rays = lightBeams(beams, new THREE.Color('#ff7a3a'), 0.07);
  track(rays.mesh.geometry); track(rays.mesh.material as THREE.Material);
  group.add(rays.mesh);
  updates.push(rays.update);

  const lowK = q === 'high' ? 1 : 0.55;
  const steamEmit = vents.map((v) => ({ min: V(v.x - 0.15, v.y + 0.3, v.z - 0.15), max: V(v.x + 0.15, v.y + 0.4, v.z + 0.15), vmin: V(-0.04, 0.8, -0.04), vmax: V(0.08, 1.2, 0.04), count: Math.round(11 * lowK), life: [2.5, 4] as [number, number], size: [0.26, 0.4] as [number, number] }));
  steamEmit.push({ min: V(-9, ly + 0.2, river.z - 0.5), max: V(9, ly + 0.4, river.z + 0.5), vmin: V(-0.05, 0.3, -0.1), vmax: V(0.15, 0.5, 0.05), count: Math.round(10 * lowK), life: [2.5, 4], size: [0.28, 0.45] });
  const steam = particles({ kind: 'steam', emitters: steamEmit, colorA: hdr('#bcaeb0', 0.95), colorB: hdr('#ff9050', 1.0), accel: V(0.08, 0.05, 0.03), wiggle: 0.45, grow: [0.7, 3.0], opacity: 0.5 }, rng);
  const embers = particles({
    kind: 'ember',
    emitters: [
      { min: V(-9, ly, river.z - 0.6), max: V(9, ly + 0.2, river.z + 0.6), vmin: V(-0.15, 0.5, -0.1), vmax: V(0.2, 1.3, 0.25), count: Math.round(70 * lowK), life: [2.5, 5], size: [0.035, 0.06] },
      { min: V(pool.x - 1, ly, pool.z - 0.7), max: V(pool.x + 1, ly + 0.2, pool.z + 0.7), vmin: V(-0.2, 0.5, -0.1), vmax: V(0.1, 1.2, 0.1), count: Math.round(22 * lowK), life: [2, 4], size: [0.035, 0.06] },
      { min: V(-5, 0, -3), max: V(5, 1.5, 3.5), vmin: V(-0.05, 0.12, -0.05), vmax: V(0.1, 0.3, 0.05), count: Math.round(26 * lowK), life: [4, 7], size: [0.03, 0.05] },
      // Splash where the falls land: sparks thrown up and out.
      { min: V(fx - 0.6, ly + 0.1, fall.z + 0.2), max: V(fx + 0.6, ly + 0.3, fall.z + 0.6), vmin: V(-0.5, 0.9, 0.0), vmax: V(0.5, 1.8, 0.5), count: Math.round(14 * lowK), life: [0.8, 1.6], size: [0.04, 0.07] },
    ],
    colorA: hdr('#ffd25a', 2.6), colorB: hdr('#ff4a10', 1.6), accel: V(0.05, -0.02, 0.03), wiggle: 0.35,
  }, rng);
  for (const p of [steam, embers]) { group.add(p.points); track(p); updates.push(p.update); pixelers.push(p.setPixelSize); }

  const spriteLight: SpriteLight = {
    keyDir: key.position.clone().sub(key.target.position).normalize(),
    keyColor: new THREE.Color('#ff9a5a').multiplyScalar(0.62),
    sky: new THREE.Color('#8a6aa0').multiplyScalar(0.5),
    ground: new THREE.Color('#ff6a30').multiplyScalar(0.7),
    rim: new THREE.Color('#ffb070').multiplyScalar(0.7),
  };

  return {
    group,
    spots: [V(-1.3, 0, 1.0), V(1.5, 0, -1.0)],
    people: [V(-2.5, 0, 1.9), V(2.75, 0, -1.95)],
    trainerExit: V(5.5, 0, -2.6),
    spriteLight,
    key,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { for (const p of pixelers) p(px); },
    dispose() { disposeGroup(group, disposables); },
  };
}

function mk(g: THREE.BufferGeometry, m: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const out = new THREE.Mesh(g, m);
  out.castShadow = cast;
  out.receiveShadow = receive;
  return out;
}

void CELL;
