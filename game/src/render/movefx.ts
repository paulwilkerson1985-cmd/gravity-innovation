// Per-element attack effects. Each effect is a short sequence of single-mesh pieces (projectile,
// trail, impact flash, element particle burst, element signature at the target), all drawn
// with pooled persistent FX materials so nothing links a shader mid-battle.
//
// Effects are scaled to the target (signature ≥ ~0.8× its height) and to move power:
// weak (≤ 45), normal (≤ 70) and strong (> 70).
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { ease, wait } from './anim';
import type { MoveElement } from '../engine/types';
import { Particles, animate, flash, flatShape, fxMesh, fxSeed, groundRing, rnd } from './particles';
import { markPersistent } from './materials';
import { hd2dRequested } from './hd2d/pipeline';
import { FlipBatch, PixelPoints, impactGlow, type BookId } from './hd2d/fx';

export interface MoveFxOptions {
  /** Move power (40 / 65 / 95 in the data); picks weak / normal / strong variants. Default 65. */
  power?: number;
  /** Target height in world units; estimated from the scene when omitted. */
  targetHeight?: number;
  /** The attack misses: the projectile drifts past the target, no impact or signature. */
  miss?: boolean;
  /** Battle camera: big signatures are scaled down to fit the screen around the target (portrait phones). */
  camera?: THREE.Camera;
}

interface Ctx {
  scene: THREE.Scene;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Target's feet. */
  ground: THREE.Vector3;
  /** Target's body centre. */
  centre: THREE.Vector3;
  /** Target height (clamped). */
  h: number;
  /** Power factor: 0.8 weak, 1 normal, 1.3 strong. */
  P: number;
  tier: 0 | 1 | 2;
  camera?: THREE.Camera;
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ cached geometry

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, build: (b: MeshBuilder) => void): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    const b = new MeshBuilder();
    build(b);
    g = markPersistent(b.build());
    geoCache.set(key, g);
  }
  return g;
}

/** Height of whatever stands at `to` (a creature root sits at its spot). */
const box = new THREE.Box3();
export function estimateTargetHeight(scene: THREE.Scene, to: THREE.Vector3): { h: number; floor: number } {
  let h = 0;
  let floor = to.y - 0.6;
  for (const o of scene.children) {
    if (Math.hypot(o.position.x - to.x, o.position.z - to.z) > 0.6 || o.position.y > to.y) continue;
    let hasMesh = false;
    o.traverse((c) => { if ((c as THREE.Mesh).isMesh && c.visible) hasMesh = true; });
    if (!hasMesh) continue;
    box.setFromObject(o);
    if (box.isEmpty()) continue;
    const hh = box.max.y - Math.max(box.min.y, o.position.y);
    if (hh > h) { h = hh; floor = o.position.y; }
  }
  return { h: h || 1.2, floor };
}

function makeCtx(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, o: MoveFxOptions): Ctx {
  const est = estimateTargetHeight(scene, to);
  const h = THREE.MathUtils.clamp(o.targetHeight ?? est.h, 0.8, 2.6);
  const power = o.power ?? 65;
  const tier: 0 | 1 | 2 = power <= 45 ? 0 : power <= 70 ? 1 : 2;
  const ground = V(to.x, Math.min(est.floor, to.y), to.z);
  const centre = ground.clone().add(V(0, h * 0.5, 0));
  let P = [0.8, 1, 1.3][tier]!;
  // HD-2D: the diorama camera is closer; smaller FX keep the target readable.
  if (hd2dRequested()) P *= 0.7;
  if (o.camera) P *= screenFit(o.camera, ground, h * P);
  return { scene, from: from.clone(), to: to.clone(), ground, centre, h, P, tier, camera: o.camera };
}

/**
 * How much a signature of world size `s` (height ≈ 1.6 s, half-width ≈ 1.15 s, the tallest
 * crowns and widest rings) must shrink to stay inside the screen around `ground`. 1 = fits.
 * On a portrait phone the foe stands near the top-right corner, so strong moves get trimmed
 * there instead of being cut off by the screen edge.
 */
function screenFit(camera: THREE.Camera, ground: THREE.Vector3, s: number): number {
  camera.updateMatrixWorld();
  const g = ground.clone().project(camera);
  if (g.z > 1 || Math.abs(g.x) > 1.2 || Math.abs(g.y) > 1.2) return 1;
  const up = V(0, 1, 0);
  const right = V(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  right.y = 0;
  right.normalize();
  const perUp = ground.clone().add(up).project(camera).y - g.y;
  const perSide = Math.abs(ground.clone().add(right).project(camera).x - g.x);
  if (perUp <= 0 || perSide <= 0) return 1;
  const roomUp = (0.98 - g.y) / perUp;
  const roomSide = Math.min(0.99 - g.x, g.x + 0.99) / perSide;
  return THREE.MathUtils.clamp(Math.min(1, roomUp / (1.6 * s), roomSide / (1.15 * s)), 0.7, 1);
}

// ------------------------------------------------------------------ miss

const WHIFF: Record<string, [string, string]> = {
  Flame: ['#ff7a1e', '#fff3a0'], Tide: ['#3d9bff', '#bfe6ff'], Flora: ['#3fae4f', '#eaffb0'], Spark: ['#ffc81e', '#ffffff'],
  Terra: ['#a3825c', '#e6d2b0'], Gale: ['#8fd8ff', '#ffffff'], Neutral: ['#d8d0ff', '#ffffff'],
};

/**
 * A missed attack: the element's projectile streaks past the target (over its shoulder, on the
 * side facing the middle of the screen) and fades out — no flash, burst, ring or signature.
 */
async function whiff(c: Ctx, type: MoveElement) {
  const [col, light] = WHIFF[type] ?? WHIFF.Neutral!;
  const geo = cached(`whiff-${type}`, (b) => {
    b.add(GEO.ball, col, { s: 0.2 }, 0.15);
    b.add(GEO.ball, light, { p: [-0.04, 0.05, 0.08], s: 0.11 });
  });
  const dir = c.centre.clone().sub(c.from);
  dir.y = 0;
  dir.normalize();
  let lateral = V(-dir.z, 0, dir.x);
  if (c.camera) {
    // Pass on the side that keeps the streak on screen (toward the middle).
    const a = c.centre.clone().addScaledVector(lateral, c.h).project(c.camera);
    const b = c.centre.clone().addScaledVector(lateral, -c.h).project(c.camera);
    if (Math.abs(b.x) < Math.abs(a.x)) lateral = lateral.negate();
  }
  // Beside the target at its shoulder, then on past it and out.
  const by = c.centre.clone().addScaledVector(lateral, 0.75 * c.h).add(V(0, 0.25 * c.h, 0));
  const past = by.clone().addScaledVector(lateral, 0.35 * c.h).addScaledVector(dir, 1.4 * c.h).add(V(0, 0.2 * c.h, 0));
  const f = fxMesh(c.scene, geo, 'normal');
  const trail = new Particles(c.scene, 60, GEO.oct, 'normal');
  const p = V();
  const prev = c.from.clone();
  let acc = 0;
  let swished = false;
  await animate(600, (k, dt) => {
    if (k < 0.6) arcPoint(p, c.from, by, ease.inOut(k / 0.6), 0.35);
    else p.lerpVectors(by, past, (k - 0.6) / 0.4);
    f.mesh.position.copy(p);
    f.mesh.scale.setScalar(1.35 * c.P * (k > 0.6 ? 1 - ((k - 0.6) / 0.4) * 0.7 : 1));
    f.mat.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    if (!swished && k >= 0.6) {
      swished = true;
      // A pale whoosh where it sails by: reads as "just missed", not as a hit.
      void flash(c.scene, by, '#ffffff', 0.5 * c.h, 260, 'crescent', 'normal', 0.8);
    }
    acc += dt;
    const step = p.clone().sub(prev);
    while (acc > 0.016 && k < 0.85) {
      acc -= 0.016;
      trail.emit(p.clone().addScaledVector(step, -rnd(0, 1)), V(rnd(-0.15, 0.15), rnd(0, 0.3), rnd(-0.15, 0.15)), { color: rnd() < 0.6 ? col : light, size: rnd(0.08, 0.14) * c.P, life: 0.32, end: 0 });
    }
    prev.copy(p);
    trail.step(dt);
  });
  f.done();
  void trail.run(350);
  await wait(80);
}

/** Quadratic arc point from a to b with peak height `arc`. */
function arcPoint(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, k: number, arc: number) {
  out.lerpVectors(a, b, k);
  out.y += Math.sin(k * Math.PI) * arc;
  return out;
}

/** Fly a mesh along an arc, emitting trail particles from it. */
async function fly(c: Ctx, geo: THREE.BufferGeometry, opts: { ms: number; arc: number; scale: number; spin?: THREE.Vector3; blend?: 'normal' | 'add'; trail?: (ps: Particles, at: THREE.Vector3, dt: number) => void; trailShape?: THREE.BufferGeometry; trailBlend?: 'normal' | 'add'; to?: THREE.Vector3; from?: THREE.Vector3; face?: boolean }) {
  const from = opts.from ?? c.from;
  const to = opts.to ?? c.centre;
  const f = fxMesh(c.scene, geo, opts.blend ?? 'normal');
  f.mesh.scale.setScalar(opts.scale);
  const trail = opts.trail ? new Particles(c.scene, 60, opts.trailShape ?? GEO.oct, opts.trailBlend ?? 'normal') : null;
  const p = V();
  const prev = from.clone();
  await animate(opts.ms, (k, dt) => {
    arcPoint(p, from, to, ease.inOut(k), opts.arc);
    f.mesh.position.copy(p);
    if (opts.face) {
      const d = p.clone().sub(prev);
      if (d.lengthSq() > 1e-6) f.mesh.quaternion.setFromUnitVectors(V(0, 0, 1), d.normalize());
    }
    if (opts.spin) f.mesh.rotation.set(opts.spin.x * k, opts.spin.y * k, opts.spin.z * k);
    prev.copy(p);
    if (trail) { opts.trail!(trail, p, dt); trail.step(dt); }
  });
  f.done();
  if (trail) void trail.run(500);
}

/** Flash + element burst + ground ring: the common impact every element gets. */
function impact(c: Ctx, colors: string[], opts: { shape?: THREE.BufferGeometry; count?: number; flashColor?: string; ring?: string; gravity?: number; speed?: number; blend?: 'normal' | 'add'; size?: number } = {}) {
  const s = c.h * c.P;
  void flash(c.scene, c.centre, opts.flashColor ?? '#ffffff', 0.75 * s, 240, 'star8', 'add');
  const ps = new Particles(c.scene, 40, opts.shape ?? GEO.oct, opts.blend ?? 'normal');
  const n = Math.round((opts.count ?? 16) * c.P);
  const sp = (opts.speed ?? 3) * Math.sqrt(s);
  ps.spray(n, c.centre, [sp * 0.5, sp], { color: colors[0]!, colors, size: (opts.size ?? 0.1) * Math.sqrt(s), life: 0.5, gravity: opts.gravity ?? -6, drag: 2, spin: 10, end: 0, dir: V(0, 0.35, 0) });
  void ps.run(650);
  if (opts.ring) void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), opts.ring, 0.9 * s, 380);
}

// ------------------------------------------------------------------ Flame

async function flame(c: Ctx) {
  const ball = cached('fireball', (b) => {
    b.add(GEO.ball, '#fff3a0', { s: 0.13 });
    b.add(GEO.ball, '#ffb02e', { s: 0.2 }, 0.2);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      b.along(GEO.cone4, i % 2 ? '#ff4d1e' : '#ff7a1e', V(Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.05), V(Math.cos(a) * 0.45, Math.sin(a) * 0.45, -1), 0.42, 0.1);
    }
  });
  const embers = ['#ffd23f', '#ff9a1e', '#ff4d1e', '#fff3a0'];
  let acc = 0;
  await fly(c, ball, {
    ms: 340, arc: 0.35, scale: 1.1 * c.P, face: true,
    trail: (ps, at, dt) => {
      acc += dt;
      while (acc > 0.012) {
        acc -= 0.012;
        ps.emit(at.clone().add(V(rnd(-0.08, 0.08), rnd(-0.08, 0.08), rnd(-0.08, 0.08))), V(rnd(-0.4, 0.4), rnd(0.4, 1.4), rnd(-0.4, 0.4)), { color: embers[Math.floor(rnd(0, 4))]!, size: rnd(0.07, 0.13) * c.P, life: 0.35, end: 0, spin: 6 });
      }
    },
  });
  // Pillar of flame tongues engulfing the target.
  const tongues = cached(`flame-pillar-${c.tier}`, (b) => {
    const n = 7 + c.tier * 2;
    for (let ring = 0; ring < 3; ring++) {
      const col = ['#ff3d1e', '#ff8a1e', '#ffd23f'][ring]!;
      const r = [0.42, 0.3, 0.16][ring]!;
      const hgt = [1, 0.85, 0.6][ring]!;
      const m = ring === 2 ? Math.ceil(n / 2) : n;
      for (let i = 0; i < m; i++) {
        const a = (i / m) * Math.PI * 2 + ring * 0.4;
        const hh = hgt * (0.75 + ((i * 7) % 5) * 0.08);
        b.along(GEO.cone4, col, V(Math.cos(a) * r, 0, Math.sin(a) * r), V(-Math.cos(a) * 0.18, 1, -Math.sin(a) * 0.18), hh, 0.16 - ring * 0.025);
      }
    }
  });
  impact(c, embers, { flashColor: '#ffb02e', ring: '#ff7a1e', gravity: 3, speed: 3.2 });
  const t = fxMesh(c.scene, tongues, 'normal');
  const t2 = fxMesh(c.scene, tongues, 'add', '#ff9a40');
  t.mesh.position.copy(c.ground);
  t2.mesh.position.copy(c.ground).add(V(0, 0.02, 0));
  const S = c.h * c.P * 1.05;
  const rise = new Particles(c.scene, 40, GEO.oct, 'add');
  const tail = (async () => {
    await animate(560, (k, dt) => {
      const grow = k < 0.25 ? ease.outBack(k / 0.25) : 1;
      const flick = 1 + Math.sin(k * 60) * 0.08 + Math.sin(k * 37) * 0.06;
      const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      t.mesh.scale.set(S * (1 + k * 0.25), S * grow * flick * (0.4 + 0.6 * fade), S * (1 + k * 0.25));
      t2.mesh.scale.set(S * 0.8, S * grow * (1.1 - flick * 0.1) * fade, S * 0.8);
      t.mesh.rotation.y = k * 1.4;
      t2.mesh.rotation.y = -k * 2;
      t.mat.opacity = fade;
      t2.mat.opacity = fade * 0.7;
      if (k < 0.7 && rnd() < 0.8) rise.emit(c.ground.clone().add(V(rnd(-0.4, 0.4) * S, rnd(0, 0.6) * S, rnd(-0.4, 0.4) * S)), V(rnd(-0.3, 0.3), rnd(1.5, 3), rnd(-0.3, 0.3)), { color: rnd() < 0.5 ? '#ffd23f' : '#ff7a1e', size: rnd(0.05, 0.1) * Math.sqrt(S), life: 0.5, end: 0 });
      rise.step(dt);
    });
    t.done(); t2.done();
    await rise.run(500);
  })();
  await wait(260);
  return tail;
}

// ------------------------------------------------------------------ Tide

const bubbleGeo = () => cached('bubble', (b) => {
  b.add(GEO.ball, '#1f5fc8', { s: 0.21 });
  b.add(GEO.ball, '#3d9bff', { p: [0, 0.01, 0.03], s: 0.19 }, 0.15);
  b.add(GEO.ball, '#9ad6ff', { p: [-0.03, 0.04, 0.08], s: 0.13 });
  b.add(GEO.ball, '#ffffff', { p: [-0.08, 0.09, 0.15], s: 0.05 });
});

async function tide(c: Ctx) {
  const n = 3 + c.tier * 2;
  const bubbles = Array.from({ length: n }, (_, i) => (async () => {
    await wait(i * 55);
    const off = V(rnd(-0.15, 0.15), rnd(-0.15, 0.2), rnd(-0.15, 0.15)).multiplyScalar(c.h);
    const sz = (1.05 + rnd(0, 0.55)) * c.P;
    const f = fxMesh(c.scene, bubbleGeo(), 'normal');
    const p = V();
    const to = c.centre.clone().add(off);
    await animate(320, (k) => {
      arcPoint(p, c.from, to, k, 0.45 + i * 0.04);
      p.y += Math.sin(k * Math.PI * 4 + i) * 0.05;
      f.mesh.position.copy(p);
      const wob = 1 + Math.sin(k * 30 + i) * 0.12;
      f.mesh.scale.set(sz * wob, sz / wob, sz * wob);
    });
    f.done();
  })());
  await Promise.all(bubbles);
  // Splash crown + geyser + droplets + ripples.
  const crown = cached(`splash-${c.tier}`, (b) => {
    const m = 12 + c.tier * 3;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      b.along(GEO.cone4, i % 3 === 0 ? '#1f6fe0' : i % 3 === 1 ? '#3d9bff' : '#bfe6ff', V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32), V(Math.cos(a) * 0.7, 1.4, Math.sin(a) * 0.7), 0.8 + (i % 3) * 0.18, 0.15);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.along(GEO.cone4, i % 2 ? '#8fd0ff' : '#ffffff', V(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1), V(Math.cos(a) * 0.15, 1, Math.sin(a) * 0.15), 1.25, 0.16);
    }
    // foam rim
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.add(GEO.ball, '#ffffff', { p: [Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55], s: [0.13, 0.08, 0.13] });
    }
  });
  void flash(c.scene, c.centre, '#bfe6ff', 0.8 * c.h * c.P, 240, 'star8', 'add');
  const f = fxMesh(c.scene, crown, 'normal');
  f.mesh.position.copy(c.ground);
  const S = c.h * c.P * 1.25;
  const drops = new Particles(c.scene, 40, bubbleGeo());
  drops.spray(Math.round(14 * c.P), c.centre.clone().add(V(0, 0.2 * S, 0)), [1.8 * Math.sqrt(S), 3.2 * Math.sqrt(S)], { color: '#ffffff', size: 0.45 * Math.sqrt(S), life: 0.6, gravity: -9, drag: 0.5, end: 0.3, dir: V(0, 1.3, 0), spread: 0.8 });
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), '#ffffff', 1.0 * S, 420);
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.03, 0)), '#3d9bff', 1.3 * S, 520, 'normal', 120);
  const tail = (async () => {
    await animate(520, (k, dt) => {
      const g = k < 0.3 ? ease.outBack(k / 0.3) : 1;
      f.mesh.scale.set(S * (0.8 + k * 0.5), S * g * (k > 0.55 ? 1 - (k - 0.55) / 0.45 * 0.7 : 1), S * (0.8 + k * 0.5));
      f.mat.opacity = k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1;
      drops.step(dt);
    });
    f.done();
    await drops.run(200);
  })();
  await wait(240);
  return tail;
}

// ------------------------------------------------------------------ Flora

const leafGeo = () => cached('leaf', (b) => {
  b.add(GEO.oct, '#1f6b30', { s: [0.27, 0.03, 0.13] });
  b.add(GEO.oct, '#8ee86a', { p: [0, 0.01, 0], s: [0.23, 0.035, 0.1] });
  b.add(GEO.oct, '#eaffb0', { p: [0.02, 0.03, 0], s: [0.2, 0.02, 0.025] });
});

async function flora(c: Ctx) {
  const n = 3 + c.tier * 2;
  await Promise.all(Array.from({ length: n }, (_, i) => (async () => {
    await wait(i * 50);
    const side = (i % 2 ? 1 : -1) * (0.35 + (i % 3) * 0.12);
    const to = c.centre.clone().add(V(rnd(-0.2, 0.2) * c.h, rnd(-0.15, 0.25) * c.h, 0));
    const f = fxMesh(c.scene, leafGeo(), 'normal');
    const sz = 1.6 * c.P;
    const p = V();
    const dir = to.clone().sub(c.from);
    const lateral = V(-dir.z, 0, dir.x).normalize();
    await animate(360, (k) => {
      arcPoint(p, c.from, to, ease.inOut(k), 0.25 + (i % 3) * 0.15);
      p.addScaledVector(lateral, Math.sin(k * Math.PI) * side);
      f.mesh.position.copy(p);
      f.mesh.rotation.set(k * 3, k * 22 + i, 0.3);
      f.mesh.scale.setScalar(sz);
    });
    f.done();
  })()));
  // Thorn vines erupt around the target.
  const thorns = cached(`thorns-${c.tier}`, (b) => {
    const m = 6 + c.tier * 2;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2;
      const r = 0.5;
      const base = V(Math.cos(a) * r, 0, Math.sin(a) * r);
      const d = V(-Math.cos(a) * 0.45, 1, -Math.sin(a) * 0.45);
      const len = 0.85 + (i % 3) * 0.15;
      b.along(GEO.cone5, i % 2 ? '#1f6b30' : '#2f8f44', base, d, len, 0.15);
      b.along(GEO.cone5, '#b9ff7a', base.clone().addScaledVector(d.clone().normalize(), len * 0.55), d, len * 0.45, 0.07);
      // side thorns
      for (const [t, rot] of [[0.3, 1.3], [0.55, -1.3]] as const) {
        const mid = base.clone().addScaledVector(d.clone().normalize(), len * t);
        b.along(GEO.cone4, '#fff27a', mid, V(Math.cos(a + rot), 0.5, Math.sin(a + rot)), 0.22, 0.05);
      }
      const tip = base.clone().addScaledVector(d.clone().normalize(), len * 0.98);
      b.add(GEO.oct, i % 2 ? '#ff6f9e' : '#ffd23f', { p: [tip.x, tip.y, tip.z], s: 0.09 });
    }
  });
  impact(c, ['#ffffff', '#ff9ad0', '#ffd23f', '#eaffb0'], { shape: flatShape('leaf'), flashColor: '#eaffb0', ring: '#1f6b30', gravity: -2.5, speed: 3, size: 0.12, blend: 'normal' });
  const t = fxMesh(c.scene, thorns, 'normal');
  t.mesh.position.copy(c.ground);
  const S = c.h * c.P * 1.2;
  const tail = (async () => {
    await animate(520, (k) => {
      const g = k < 0.3 ? ease.outBack(k / 0.3) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      t.mesh.scale.set(S, S * Math.max(0.01, g), S);
      t.mesh.rotation.y = k * 0.5;
    });
    t.done();
  })();
  await wait(240);
  return tail;
}

// ------------------------------------------------------------------ Spark

async function spark(c: Ctx) {
  // A crackling charge at the user, then bolts from the sky.
  void flash(c.scene, c.from, '#fff27a', 0.5 * c.P, 200, 'star4', 'add', 1.5);
  await wait(110);
  const S = c.h * c.P;
  const top = 3.2;
  const bolt = cached(`bolt-${c.tier}`, (b) => {
    for (const [w, col, ox] of [[0.26, '#ff8a1e', 0], [0.17, '#ffe14d', 0], [0.07, '#ffffff', 0]] as const) {
      let p = V(ox, top, 0);
      for (let i = 0; i < 8; i++) {
        const next = V((i % 2 ? 1 : -1) * (0.18 + (i % 3) * 0.09), p.y - top / 8, 0);
        if (i === 7) next.set(0, 0, 0);
        const d = next.clone().sub(p);
        b.along(GEO.box, col, p, d, d.length() + 0.04, w, 0.6);
        p = next;
      }
    }
    if (c.tier === 2) {
      let p = V(0.6, top * 0.8, 0.2);
      for (let i = 0; i < 6; i++) {
        const next = V(0.6 - i * 0.1 + (i % 2 ? 0.15 : -0.1), p.y - top * 0.8 / 6, 0.2);
        if (i === 5) next.set(0.1, 0.2, 0);
        const d = next.clone().sub(p);
        b.along(GEO.box, '#ffe14d', p, d, d.length() + 0.03, 0.1, 0.6);
        p = next;
      }
    }
  });
  const f = fxMesh(c.scene, bolt, 'add', '#806020');
  const g = fxMesh(c.scene, bolt, 'normal');
  f.mesh.position.copy(c.centre);
  g.mesh.position.copy(c.centre);
  const scl = Math.max(1, S * 0.8);
  f.mesh.scale.set(scl, 1, scl);
  g.mesh.scale.set(scl, 1, scl);
  faceY(f.mesh); faceY(g.mesh);
  const crack = new Particles(c.scene, 40, GEO.box, 'add');
  await animate(420, (k, dt) => {
    const on = Math.floor(k * 14) % 3 !== 1;
    f.mat.opacity = on ? 1 : 0.2;
    g.mat.opacity = on ? 1 : 0.25;
    f.mesh.scale.y = g.mesh.scale.y = Math.min(1, k * 5);
    if (k > 0.2 && rnd() < 0.7) crack.emit(c.centre.clone().add(V(rnd(-0.4, 0.4) * S, rnd(-0.4, 0.4) * S, rnd(-0.3, 0.3))), V(rnd(-3, 3), rnd(-1, 3), rnd(-3, 3)), { color: rnd() < 0.5 ? '#ffffff' : '#ffe14d', size: 0.035 * Math.sqrt(S), stretch: 5, life: 0.25, spin: 20, end: 0 });
    crack.step(dt);
  });
  f.done(); g.done();
  impact(c, ['#ffe14d', '#ff9a1e', '#fff6a0'], { shape: GEO.box, flashColor: '#fff27a', ring: '#ffb02e', speed: 4, gravity: -4, blend: 'normal', size: 0.06 });
  void flash(c.scene, c.centre, '#ffffff', 1.1 * S, 200, 'star4', 'add', 0.3);
  // Crackle cage: short zigzag jolts dancing around the target.
  const cage = cached('jolt-cage', (b) => {
    for (let j = 0; j < 7; j++) {
      const a = (j / 7) * Math.PI * 2;
      const y0 = 0.15 + (j % 3) * 0.3;
      let p = V(Math.cos(a) * 0.5, y0 + 0.35, Math.sin(a) * 0.5);
      for (let i = 0; i < 4; i++) {
        const next = V(Math.cos(a + (i % 2 ? 0.25 : -0.25)) * (0.55 + (i % 2) * 0.1), p.y - 0.12, Math.sin(a + (i % 2 ? 0.25 : -0.25)) * (0.55 + (i % 2) * 0.1));
        const d = next.clone().sub(p);
        b.along(GEO.box, '#ff9a1e', p, d, d.length() + 0.03, 0.075);
        b.along(GEO.box, '#fff27a', p, d, d.length() + 0.02, 0.04);
        p = next;
      }
    }
  });
  const cg = fxMesh(c.scene, cage, 'normal');
  cg.mesh.position.copy(c.ground);
  await animate(380, (k, dt) => {
    cg.mesh.scale.set(S, S, S);
    cg.mesh.rotation.y = Math.floor(k * 9) * 0.9;
    cg.mat.opacity = Math.floor(k * 12) % 3 === 2 ? 0.1 : 1 - k * 0.5;
    crack.step(dt);
  });
  cg.done();
  return crack.run(200);
}

/** Keep a mesh's local Z facing the camera around the world Y axis (for flat bolts). */
function faceY(mesh: THREE.Object3D) {
  mesh.onBeforeRender = (_r, _s, cam) => {
    mesh.rotation.y = Math.atan2(cam.position.x - mesh.position.x, cam.position.z - mesh.position.z);
    mesh.updateMatrixWorld();
  };
}

// ------------------------------------------------------------------ Terra

const rockGeo = () => cached('boulder', (b) => {
  b.add(GEO.rock, '#a3825c', { s: [0.3, 0.26, 0.28] }, 0.35);
  b.add(GEO.rock, '#8a6a48', { p: [0.1, 0.1, 0.06], s: 0.16, r: [0.5, 0.3, 0] }, 0.3);
  b.add(GEO.rock, '#c4a27a', { p: [-0.12, -0.05, 0.1], s: 0.12, r: [0.2, 1, 0] }, 0.3);
});

async function terra(c: Ctx) {
  const dust = ['#d9c09a', '#c4a27a', '#b39270'];
  let acc = 0;
  await fly(c, rockGeo(), {
    ms: 380, arc: 1.1, scale: 1.2 * c.P, spin: V(9, 4, 2),
    trail: (ps, at, dt) => {
      acc += dt;
      while (acc > 0.03) { acc -= 0.03; ps.emit(at.clone(), V(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3)), { color: dust[Math.floor(rnd(0, 3))]!, size: rnd(0.08, 0.14) * c.P, life: 0.4, end: 0, spin: 3 }); }
    },
    trailShape: GEO.ball,
  });
  // Rock spikes burst up around the target; the boulder shatters; a dust cloud rolls out.
  const spikes = cached(`spikes-${c.tier}`, (b) => {
    const m = 6 + c.tier * 2;
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 2 + 0.3;
      const r = 0.55 + (i % 2) * 0.12;
      const len = 1.0 + ((i * 5) % 3) * 0.25;
      b.along(GEO.cone4, i % 3 === 0 ? '#8a6a48' : i % 3 === 1 ? '#a3825c' : '#9aa3ad', V(Math.cos(a) * r, -0.1, Math.sin(a) * r), V(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3), len, 0.24);
      b.add(GEO.rock, '#7a5a3c', { p: [Math.cos(a) * (r + 0.1), 0.02, Math.sin(a) * (r + 0.1)], s: 0.1, r: [a, a, 0] });
    }
  });
  const S = c.h * c.P;
  const t = fxMesh(c.scene, spikes, 'normal');
  t.mesh.position.copy(c.ground);
  void flash(c.scene, c.centre, '#fff2d0', 0.7 * S, 200, 'star8', 'add');
  const chunks = new Particles(c.scene, 30, GEO.rock);
  chunks.spray(Math.round(12 * c.P), c.centre, [2.2 * Math.sqrt(S), 3.8 * Math.sqrt(S)], { color: '#a3825c', colors: ['#a3825c', '#8a6a48', '#c4a27a', '#7a5a3c'], size: 0.1 * Math.sqrt(S), life: 0.65, gravity: -12, drag: 0.6, spin: 8, end: 0.5, dir: V(0, 0.9, 0) });
  const puff = new Particles(c.scene, 30, GEO.ball);
  for (let i = 0; i < Math.round(10 * c.P); i++) {
    const a = (i / 10) * Math.PI * 2;
    puff.emit(c.ground.clone().add(V(Math.cos(a) * 0.3 * S, 0.1, Math.sin(a) * 0.3 * S)), V(Math.cos(a) * 1.4 * S, rnd(0.1, 0.4), Math.sin(a) * 1.4 * S), { color: dust[i % 3]!, size: rnd(0.1, 0.16) * Math.sqrt(S), life: 0.5, drag: 3.5, end: 1.4 });
  }
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), '#8a6a48', 1.1 * S, 380);
  const tail = (async () => {
    await animate(600, (k, dt) => {
      const g = k < 0.2 ? ease.outBack(k / 0.2) : k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      t.mesh.scale.set(S, S * Math.max(0.01, g), S);
      chunks.step(dt);
      puff.step(dt);
      puff.mat.opacity = k > 0.5 ? 1 - (k - 0.5) / 0.5 : 1;
    });
    t.done();
    chunks.dispose();
    puff.dispose();
  })();
  await wait(260);
  return tail;
}

// ------------------------------------------------------------------ Gale

async function gale(c: Ctx) {
  const blade = cached('wind-blade', (b) => {
    const cres = flatShape('crescent');
    b.add(cres, '#ffffff', { s: [0.45, 0.45, 1] });
    b.add(cres, '#bfefff', { p: [-0.06, 0, -0.01], s: [0.36, 0.4, 1] });
  });
  const n = 1 + c.tier;
  await Promise.all(Array.from({ length: n }, (_, i) => (async () => {
    await wait(i * 70);
    const f = fxMesh(c.scene, blade, 'add');
    const to = c.centre.clone().add(V(0, (i - (n - 1) / 2) * 0.25 * c.h, 0));
    const from = c.from.clone().add(V(0, (i - (n - 1) / 2) * 0.15, 0));
    const p = V();
    const dir = to.clone().sub(from).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    await animate(300, (k) => {
      arcPoint(p, from, to, k, 0.15);
      f.mesh.position.copy(p);
      f.mesh.rotation.set(0, yaw - Math.PI / 2, (i % 2 ? -1 : 1) * 0.4 + k * 0.3);
      f.mesh.scale.setScalar(c.P * (1.2 + k * 0.6));
      f.mat.opacity = 0.95;
    });
    f.done();
  })()));
  // Tornado: stacked spinning rings widening upwards, plus swirling streaks.
  const S = c.h * c.P;
  const tw = cached(`tornado-${c.tier}`, (b) => {
    const ring = new THREE.TorusGeometry(1, 0.06, 3, 18);
    const levels = 5 + c.tier;
    for (let i = 0; i < levels; i++) {
      const y = i / (levels - 1);
      const r = 0.28 + y * 0.42;
      b.add(ring, i % 2 ? '#ffffff' : '#7fdcff', { p: [Math.sin(i * 1.7) * 0.05, y * 1.15, 0], r: [Math.PI / 2 + Math.sin(i) * 0.12, 0, 0], s: [r, r, 0.9 + y * 0.6] });
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const y = 0.1 + (i % 4) * 0.28;
      const r = 0.34 + y * 0.38;
      b.add(GEO.box, '#ffffff', { p: [Math.cos(a) * r, y, Math.sin(a) * r], r: [0, -a, 0.35], s: [0.03, 0.03, 0.42] });
    }
    ring.dispose();
  });
  void flash(c.scene, c.centre, '#e8fbff', 0.75 * S, 220, 'star8', 'add');
  const t = fxMesh(c.scene, tw, 'add', '#9aa8b0');
  const t2 = fxMesh(c.scene, tw, 'normal');
  t.mesh.position.copy(c.ground);
  t2.mesh.position.copy(c.ground);
  const swirl = new Particles(c.scene, 40, GEO.oct);
  const seeds = Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, y: (i % 5) * 0.2, r: 0.5 + (i % 3) * 0.12 }));
  for (const s of seeds) swirl.emit(c.ground, V(), { color: s.y > 0.4 ? '#ffffff' : '#6fdc4c', size: 0.06 * Math.sqrt(S), life: 0.7, spin: 12, end: 0.2 });
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), '#ffffff', 1.0 * S, 420);
  const tail = (async () => {
    let time = 0;
    await animate(620, (k, dt) => {
      time += dt;
      const g = k < 0.2 ? ease.outCubic(k / 0.2) : 1;
      const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      t.mesh.scale.set(S * g * (1 + k * 0.3), S * (0.5 + 0.5 * g) * (1 + k * 0.2), S * g * (1 + k * 0.3));
      t2.mesh.scale.copy(t.mesh.scale).multiplyScalar(0.92);
      t.mesh.rotation.y = -time * 16;
      t2.mesh.rotation.y = -time * 11 + 0.5;
      t.mat.opacity = fade;
      t2.mat.opacity = fade * 0.75;
      // swirl particles orbit and climb (positions set directly, then stepped with no velocity)
      seeds.forEach((s, i) => {
        const a = s.a - time * 9;
        const y = (s.y + time * 1.6) * S;
        const r = s.r * S * (0.6 + y * 0.3);
        swirl.place(i, c.ground.x + Math.cos(a) * r, c.ground.y + y, c.ground.z + Math.sin(a) * r);
      });
      swirl.step(dt);
    });
    t.done(); t2.done(); swirl.dispose();
  })();
  await wait(280);
  return tail;
}

// ------------------------------------------------------------------ Neutral

async function neutral(c: Ctx) {
  const S = c.h * c.P;
  void flash(c.scene, c.centre, '#ffffff', 1.15 * S, 240, 'star8', 'add', 0.2);
  void flash(c.scene, c.centre, '#ffd23f', 0.8 * S, 280, 'star4', 'normal', -0.6);
  impact(c, ['#ffffff', '#fff27a', '#ffd23f'], { shape: GEO.tet, ring: '#ffffff', speed: 3.6, gravity: -5 });
  // Impact lines: four wedges flying out from the hit point.
  const lines = new Particles(c.scene, 8, flatShape('diamond'), 'add', { billboard: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    lines.emit(c.centre.clone().add(V(Math.cos(a) * 0.2 * S, Math.sin(a) * 0.2 * S, 0)), V(Math.cos(a) * 3 * S, Math.sin(a) * 3 * S, 0), { color: '#ffffff', size: 0.16 * S, life: 0.26, drag: 4, end: 0 });
  }
  const tail = lines.run(260);
  await wait(200);
  return tail;
}

// ------------------------------------------------------------------ HD-2D pixel FX
//
// `?gfx=hd2d`: hand-pixeled flipbooks (render/hd2d/fx.ts) instead of the low-poly meshes.
// Readability rules: everything that surrounds the target is an OPEN ARC (no tongue, jet,
// spike or vine whose outward direction faces the camera, dot(dir, camFwd) < -0.2), the big
// bursts sit BEHIND the target, normal-blend pieces draw at renderOrder ≤ 6 (under the target
// sprite, which draws at 7) and only additive glows/embers at ≥ 8. Impacts add ≥ 3 scene
// objects in one frame (capture tooling keys on it). Flame, Spark and Neutral impacts light
// the floor and the wall behind with a dithered additive glow (no runtime lights).

const TAU = Math.PI * 2;

/** Whole internal px per FX texel: target on-screen height ÷ ~52 px (1 on most screens). */
function texScale(c: Ctx): number {
  if (!c.camera || typeof document === 'undefined') return 1;
  const canvas = document.getElementById('view') as HTMLCanvasElement | null;
  const H = canvas?.height || 360;
  const a = c.ground.clone().project(c.camera), b = c.ground.clone().add(V(0, c.h, 0)).project(c.camera);
  return THREE.MathUtils.clamp(Math.round((Math.abs(b.y - a.y) * 0.5 * H) / 52), 1, 3);
}

/** The camera's forward direction on the floor plane (into the screen). */
function camFwdXZ(c: Ctx): THREE.Vector3 {
  const f = V(0, 0, -1);
  c.camera?.getWorldDirection(f);
  f.y = 0;
  if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
  return f.normalize();
}

/** Angles of an n-point ring around the target, minus the ones whose outward direction faces the camera. */
function openArc(c: Ctx, n: number, offset = 0): number[] {
  const fwd = camFwdXZ(c);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * TAU;
    if (Math.cos(a) * fwd.x + Math.sin(a) * fwd.z < -0.2) continue;
    out.push(a);
  }
  return out;
}
/** `p` pushed `d` world units along the view ray: same screen position, further from the camera. */
function behind(c: Ctx, p: THREE.Vector3, d: number): THREE.Vector3 {
  const f = V(0, 0, -1);
  c.camera?.getWorldDirection(f);
  return p.clone().addScaledVector(f, d);
}
const ringPos = (c: Ctx, a: number, r: number, y = 0) => c.ground.clone().add(V(Math.cos(a) * r, y, Math.sin(a) * r));

/** World size of the effect around the target (target height × power tier). */
const reach = (c: Ctx) => c.h * (c.P / 0.7);

/** The impact star burst, centred on the target but just BEHIND it (depth and draw order). */
function pixelStar(c: Ctx, tint: string, glow: number, k: number): FlipBatch {
  const b = new FlipBatch(c.scene, 2, 'normal', 5);
  b.add('star', behind(c, c.centre, 0.5 * c.h), { scale: k * 2, tint, glow, fps: 14 });
  return b;
}

/** Run batches/points to completion in parallel (each removes itself). */
async function finish(...items: { run(ms: number): Promise<void> }[]) { await Promise.all(items.map((x) => x.run(900))); }

/** Fly one flipbook projectile along an arc with a pixel trail. */
async function pixelFly(c: Ctx, book: BookId, o: { ms: number; arc: number; k: number; glow?: number; tint?: string; to?: THREE.Vector3; from?: THREE.Vector3; trail?: (pts: PixelPoints, at: THREE.Vector3, dt: number) => void; trailBlend?: 'normal' | 'add' }) {
  const from = o.from ?? c.from, to = o.to ?? c.centre;
  const proj = new FlipBatch(c.scene, 1, 'normal', 6);
  const trail = o.trail ? new PixelPoints(c.scene, 90, o.trailBlend ?? 'add') : null;
  const id = proj.add(book, from, { loop: true, life: 99, scale: o.k, glow: o.glow, tint: o.tint });
  const p = V();
  await animate(o.ms, (k, dt) => {
    arcPoint(p, from, to, ease.inOut(k), o.arc);
    proj.place(id, p);
    proj.step(dt);
    if (trail) { o.trail!(trail, p, dt); trail.step(dt); }
  });
  proj.dispose();
  if (trail) void trail.run(600);
}

async function flamePx(c: Ctx) {
  const k = texScale(c);
  const embers = ['#ffd23f', '#ff9a1e', '#ff5a1e', '#fff3a0'];
  let acc = 0;
  await pixelFly(c, 'fireball', {
    ms: 340, arc: 0.35, k, glow: 1.5,
    trail: (pts, at, dt) => {
      acc += dt;
      while (acc > 0.014) {
        acc -= 0.014;
        pts.emit(at.clone().add(V(rnd(-0.06, 0.06), rnd(-0.06, 0.06), rnd(-0.06, 0.06))), V(rnd(-0.4, 0.4), rnd(0.3, 1.2), rnd(-0.4, 0.4)), { color: embers[Math.floor(rnd(0, 4))]!, size: rnd() < 0.3 ? 2 : 1, life: 0.35, drag: 1, glow: 1.6 });
      }
    },
  });
  // Impact: star under the target, a ring of flame tongues open toward the camera (bigger ones
  // behind), rising embers, a fire-lit floor and wall.
  const R = reach(c);
  const star = pixelStar(c, '#ffb02e', 1.8, k);
  const fire = new FlipBatch(c.scene, 28, 'normal', 5);
  const rise = new PixelPoints(c.scene, 70, 'add');
  const light = impactGlow(c.scene, c.ground, '#ff6a20', 1.0 * R, c.camera);
  const life = 0.62;
  const fwd = camFwdXZ(c);
  openArc(c, 8 + c.tier * 2, 0.2).forEach((a, i) => {
    fire.add('flame', ringPos(c, a, 0.36 * R), { anchor: 'bottom', loop: true, frame0: i * 3, life: life + rnd(0, 0.08), fadeIn: 0.05, fadeOut: 0.2, scale: k, glow: 1.15, flip: i % 2 === 1, delay: rnd(0, 0.06) });
  });
  openArc(c, 6, 0.75).forEach((a, i) => {
    fire.add('flameS', ringPos(c, a, 0.18 * R), { anchor: 'bottom', loop: true, frame0: i * 5, life: life - 0.08, fadeIn: 0.04, fadeOut: 0.18, scale: k, glow: 1.2, flip: i % 2 === 0, delay: 0.03 });
  });
  // The pillar's crown: big tongues straight behind the target (the sprite covers their base).
  for (const [side, d] of [[-0.22, 0.2], [0.22, 0.2], [0, 0.3]] as const) {
    if (c.tier === 0 && side !== 0) continue;
    const p = c.ground.clone().addScaledVector(fwd, d * R).add(V(-fwd.z * side * R, 0, fwd.x * side * R));
    fire.add('flame', p, { anchor: 'bottom', loop: true, frame0: side ? 2 : 6, life, fadeIn: 0.06, fadeOut: 0.22, scale: k * 2, glow: 1.1, flip: side > 0 });
  }
  const tail = (async () => {
    await animate(680, (kk, dt) => {
      const flick = 1 + Math.sin(kk * 70) * 0.12 + Math.sin(kk * 43) * 0.08;
      light.set((kk < 0.1 ? kk / 0.1 : kk > 0.62 ? Math.max(0, 1 - (kk - 0.62) / 0.38) : 1) * flick);
      if (kk < 0.72) for (let j = 0; j < 2; j++) if (rnd() < 0.7) rise.emit(ringPos(c, rnd(0, TAU), rnd(0.05, 0.4) * R, rnd(0, 0.5) * R), V(rnd(-0.25, 0.25), rnd(1.2, 2.6), rnd(-0.25, 0.25)), { color: embers[Math.floor(rnd(0, 4))]!, size: rnd() < 0.35 ? 2 : 1, life: rnd(0.35, 0.6), drag: 0.8, glow: 1.6 });
      fire.step(dt); star.step(dt); rise.step(dt);
    });
    fire.dispose(); star.dispose(); light.dispose();
    // A wisp of smoke as the fire dies.
    const smoke = new FlipBatch(c.scene, 4, 'normal', 5);
    for (let i = 0; i < 3; i++) smoke.add('smoke', ringPos(c, rnd(0, TAU), 0.15 * R, (0.55 + i * 0.12) * R), { vel: V(rnd(-0.1, 0.1), 0.6, rnd(-0.1, 0.1)), scale: k, fps: 10, delay: i * 0.06 });
    await finish(rise, smoke);
  })();
  await wait(260);
  return tail;
}

async function tidePx(c: Ctx) {
  const k = texScale(c);
  const n = 3 + c.tier * 2;
  const orbs = new FlipBatch(c.scene, n, 'normal', 6);
  const drip = new PixelPoints(c.scene, 90, 'normal', 6);
  const paths = Array.from({ length: n }, (_, i) => ({ id: -1, t0: i * 0.055, to: c.centre.clone().add(V(rnd(-0.15, 0.15), rnd(-0.15, 0.2), rnd(-0.15, 0.15)).multiplyScalar(c.h)), arc: 0.45 + i * 0.04 }));
  const p = V();
  let time = 0;
  await animate(320 + (n - 1) * 55, (_kk, dt) => {
    time += dt;
    for (const q of paths) {
      const lt = (time - q.t0) / 0.32;
      if (lt < 0) continue;
      if (q.id < 0) q.id = orbs.add('orb', c.from, { loop: true, life: 0.36 - Math.min(0, q.t0), scale: k, frame0: q.id & 3 });
      if (lt > 1) continue;
      arcPoint(p, c.from, q.to, lt, q.arc);
      p.y += Math.sin(lt * Math.PI * 4) * 0.05;
      orbs.place(q.id, p);
      if (rnd() < 0.45) drip.emit(p.clone(), V(rnd(-0.3, 0.3), rnd(-0.2, 0.4), rnd(-0.3, 0.3)), { color: rnd() < 0.5 ? '#c4f2ff' : '#48c6f0', size: 1, life: 0.3, gravity: -6 });
    }
    orbs.step(dt); drip.step(dt);
  });
  orbs.dispose();
  void drip.run(400);
  // Impact: splash crown in an open arc (a tall one behind the target), droplets, foam, ripple.
  const R = reach(c);
  const fwd = camFwdXZ(c);
  const star = pixelStar(c, '#bfe6ff', 1.3, k);
  const crown = new FlipBatch(c.scene, 20, 'normal', 5);
  openArc(c, 7 + c.tier * 2, 0.35).forEach((a, i) => crown.add('splash', ringPos(c, a, 0.4 * R), { anchor: 'bottom', scale: k, fps: 14, frame0: 1, flip: i % 2 === 1, delay: (i % 3) * 0.03, fadeOut: 0.12 }));
  // The geyser behind the target and, for stronger moves, two big jets left and right of it.
  crown.add('splash', c.ground.clone().addScaledVector(fwd, 0.18 * R), { anchor: 'bottom', scale: k * 2, fps: 13, frame0: 1, fadeOut: 0.14 });
  if (c.tier > 0) for (const side of [-1, 1]) {
    const p = c.ground.clone().addScaledVector(fwd, 0.08 * R).add(V(-fwd.z * side * 0.5 * R, 0, fwd.x * side * 0.5 * R));
    crown.add('splash', p, { anchor: 'bottom', scale: k * 2, fps: 14, frame0: 1, flip: side > 0, delay: 0.04, fadeOut: 0.14 });
  }
  const drops = new PixelPoints(c.scene, 80, 'normal', 6);
  const cols = ['#ffffff', '#c4f2ff', '#48c6f0', '#2378d2'];
  for (let i = 0; i < Math.round(26 * c.P); i++) {
    const a = rnd(0, TAU);
    const d = V(Math.cos(a), 0, Math.sin(a));
    if (d.dot(fwd) < -0.6) d.multiplyScalar(0.4); // fewer droplets flying at the camera
    drops.emit(c.centre.clone().add(V(0, 0.15 * R, 0)), V(d.x * rnd(0.8, 2.2), rnd(2.2, 4.2), d.z * rnd(0.8, 2.2)).multiplyScalar(Math.sqrt(R)), { color: cols[i % 4]!, size: i % 3 === 0 ? 1 : 2, life: rnd(0.45, 0.7), gravity: -10 });
  }
  const foam = new PixelPoints(c.scene, 40, 'normal', 6);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    foam.emit(ringPos(c, a, 0.3 * R, 0.03), V(Math.cos(a) * 0.9 * R, 0, Math.sin(a) * 0.9 * R), { color: i % 3 ? '#ffffff' : '#c4f2ff', size: 2, life: rnd(0.3, 0.45), drag: 3 });
  }
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), '#bfe6ff', 1.05 * R, 460, 'normal', 60);
  const tail = (async () => {
    await animate(620, (_kk, dt) => { crown.step(dt); star.step(dt); drops.step(dt); foam.step(dt); });
    crown.dispose(); star.dispose();
    await finish(drops, foam);
  })();
  await wait(240);
  return tail;
}

async function floraPx(c: Ctx) {
  const k = texScale(c);
  const n = 3 + c.tier * 2;
  const leaves = new FlipBatch(c.scene, n, 'normal', 6);
  const dir = c.centre.clone().sub(c.from);
  const lateral = V(-dir.z, 0, dir.x).normalize();
  const paths = Array.from({ length: n }, (_, i) => ({ id: -1, t0: i * 0.05, side: (i % 2 ? 1 : -1) * (0.35 + (i % 3) * 0.12), to: c.centre.clone().add(V(rnd(-0.2, 0.2) * c.h, rnd(-0.15, 0.25) * c.h, 0)), arc: 0.25 + (i % 3) * 0.15 }));
  const p = V();
  let time = 0;
  await animate(360 + (n - 1) * 50, (_kk, dt) => {
    time += dt;
    for (const q of paths) {
      const lt = (time - q.t0) / 0.36;
      if (lt < 0) continue;
      if (q.id < 0) q.id = leaves.add('leaf', c.from, { loop: true, life: 0.37, scale: k * (q.side > 0 ? 2 : 1), fps: 16, frame0: q.t0 * 40 });
      if (lt > 1) continue;
      arcPoint(p, c.from, q.to, ease.inOut(lt), q.arc);
      p.addScaledVector(lateral, Math.sin(lt * Math.PI) * q.side);
      leaves.place(q.id, p);
    }
    leaves.step(dt);
  });
  leaves.dispose();
  // Impact: thorn vines sprout in an open arc; a burst of leaves and petals.
  const R = reach(c);
  const star = pixelStar(c, '#eaffb0', 1.2, k);
  const vines = new FlipBatch(c.scene, 16, 'normal', 5);
  openArc(c, 8 + c.tier * 2, 0.1).forEach((a, i) => vines.add('vine', ringPos(c, a, (0.5 + (i % 2) * 0.1) * R), { anchor: 'bottom', scale: k, fps: 16, life: 0.66, fadeOut: 0.16, flip: i % 2 === 1, delay: (i % 4) * 0.025 }));
  // Taller vines behind the target (its sprite covers their roots).
  const fwdV = camFwdXZ(c);
  for (const side of [-0.32, 0.32]) {
    const p = c.ground.clone().addScaledVector(fwdV, 0.3 * R).add(V(-fwdV.z * side * R, 0, fwdV.x * side * R));
    vines.add('vine', p, { anchor: 'bottom', scale: k * 2, fps: 15, life: 0.66, fadeOut: 0.16, flip: side > 0 });
  }
  const burst = new FlipBatch(c.scene, 14, 'normal', 6);
  for (let i = 0; i < Math.round(10 * c.P / 0.7); i++) {
    const a = rnd(0, TAU);
    burst.add('leaf', c.centre, { vel: V(Math.cos(a) * rnd(1, 2.4), rnd(0.8, 2.4), Math.sin(a) * rnd(1, 2.4)).multiplyScalar(Math.sqrt(R)), gravity: -3, drag: 1.5, loop: true, fps: 14, frame0: i, life: rnd(0.45, 0.65), fadeOut: 0.15, scale: k });
  }
  const petals = new PixelPoints(c.scene, 40, 'normal', 6);
  for (let i = 0; i < 18; i++) {
    const a = rnd(0, TAU);
    petals.emit(c.centre, V(Math.cos(a) * rnd(0.8, 2), rnd(0.5, 2.2), Math.sin(a) * rnd(0.8, 2)).multiplyScalar(Math.sqrt(R)), { color: ['#ff9ad0', '#ffd23f', '#ffffff', '#ff7ab0'][i % 4]!, size: i % 2 ? 2 : 1, life: rnd(0.4, 0.7), gravity: -2.5, drag: 1.5 });
  }
  const tail = (async () => {
    await animate(560, (_kk, dt) => { vines.step(dt); star.step(dt); burst.step(dt); petals.step(dt); });
    vines.dispose(); star.dispose();
    await finish(burst, petals);
  })();
  await wait(240);
  return tail;
}

async function sparkPx(c: Ctx) {
  const k = texScale(c);
  // A crackling charge at the user, then the bolt from the sky.
  const charge = new FlipBatch(c.scene, 2, 'add', 8);
  charge.add('spark', c.from, { scale: k, glow: 1.6, fps: 18 });
  await animate(110, (_kk, dt) => charge.step(dt));
  const S = c.h * c.P / 0.7;
  const top = 3.2;
  const bolt = cached(`bolt-${c.tier}`, (b) => {
    for (const [w, col, ox] of [[0.26, '#ff8a1e', 0], [0.17, '#ffe14d', 0], [0.07, '#ffffff', 0]] as const) {
      let p = V(ox, top, 0);
      for (let i = 0; i < 8; i++) {
        const next = V((i % 2 ? 1 : -1) * (0.18 + (i % 3) * 0.09), p.y - top / 8, 0);
        if (i === 7) next.set(0, 0, 0);
        const d = next.clone().sub(p);
        b.along(GEO.box, col, p, d, d.length() + 0.04, w, 0.6);
        p = next;
      }
    }
    if (c.tier === 2) {
      let p = V(0.6, top * 0.8, 0.2);
      for (let i = 0; i < 6; i++) {
        const next = V(0.6 - i * 0.1 + (i % 2 ? 0.15 : -0.1), p.y - top * 0.8 / 6, 0.2);
        if (i === 5) next.set(0.1, 0.2, 0);
        const d = next.clone().sub(p);
        b.along(GEO.box, '#ffe14d', p, d, d.length() + 0.03, 0.1, 0.6);
        p = next;
      }
    }
  });
  // The bolt lands just behind the target (normal under the sprite, additive glow over it).
  const fwd = camFwdXZ(c);
  const at = c.centre.clone().addScaledVector(fwd, 0.25 * c.h);
  const f = fxMesh(c.scene, bolt, 'add', '#806020');
  const g = fxMesh(c.scene, bolt, 'normal');
  g.mesh.renderOrder = 5;
  for (const m of [f.mesh, g.mesh]) { m.position.copy(at); m.scale.set(Math.max(0.8, S * 0.7), 1, Math.max(0.8, S * 0.7)); faceY(m); }
  const crack = new PixelPoints(c.scene, 60, 'add');
  await animate(380, (kk, dt) => {
    const on = Math.floor(kk * 14) % 3 !== 1;
    f.mat.opacity = on ? 0.8 : 0.15;
    g.mat.opacity = on ? 1 : 0.25;
    f.mesh.scale.y = g.mesh.scale.y = Math.min(1, kk * 5);
    if (kk > 0.2 && rnd() < 0.8) crack.emit(at.clone().add(V(rnd(-0.4, 0.4) * S, rnd(-0.4, 0.4) * S, rnd(-0.3, 0.3))), V(rnd(-3, 3), rnd(-1, 3), rnd(-3, 3)), { color: rnd() < 0.5 ? '#ffffff' : '#ffe14d', size: rnd() < 0.3 ? 2 : 1, life: 0.22, drag: 2, glow: 1.6 });
    charge.step(dt); crack.step(dt);
  });
  f.done(); g.done(); charge.dispose();
  // Impact: star, crackle sparks dancing in an open ring, grit, yellow light on floor and wall.
  const R = reach(c);
  const star = pixelStar(c, '#fff27a', 1.9, k);
  const jolts = new FlipBatch(c.scene, 24, 'add', 8);
  const ring = openArc(c, 7, 0.4);
  for (let w = 0; w < 3; w++) ring.forEach((a, i) => jolts.add('spark', ringPos(c, a + w * 0.45, 0.42 * R, (0.15 + ((i + w) % 3) * 0.28) * c.h), { scale: k, glow: 1.5, fps: 16, delay: w * 0.12 + i * 0.015 }));
  const grit = new PixelPoints(c.scene, 40, 'normal', 6);
  for (let i = 0; i < Math.round(14 * c.P / 0.7); i++) {
    const a = rnd(0, TAU);
    grit.emit(c.centre, V(Math.cos(a) * rnd(1.5, 3.5), rnd(0.5, 3), Math.sin(a) * rnd(1.5, 3.5)).multiplyScalar(Math.sqrt(R)), { color: ['#ffe14d', '#ff9a1e', '#fff6a0'][i % 3]!, size: i % 2 ? 2 : 1, life: rnd(0.3, 0.5), gravity: -5, drag: 2 });
  }
  const light = impactGlow(c.scene, c.ground, '#ffd84a', 0.95 * R, c.camera);
  await animate(420, (kk, dt) => {
    light.set((Math.floor(kk * 12) % 3 === 2 ? 0.45 : 1) * (kk > 0.6 ? 1 - (kk - 0.6) / 0.4 : 1));
    star.step(dt); jolts.step(dt); grit.step(dt); crack.step(dt);
  });
  star.dispose(); light.dispose();
  return finish(jolts, grit, crack);
}

async function terraPx(c: Ctx) {
  const k = texScale(c);
  const dust = ['#d9c09a', '#c4a27a', '#b39270'];
  let acc = 0;
  await pixelFly(c, 'boulder', {
    ms: 380, arc: 1.1, k: k * (c.tier === 2 ? 2 : 1), trailBlend: 'normal',
    trail: (pts, at, dt) => {
      acc += dt;
      while (acc > 0.03) { acc -= 0.03; pts.emit(at.clone(), V(rnd(-0.3, 0.3), rnd(-0.2, 0.3), rnd(-0.3, 0.3)), { color: dust[Math.floor(rnd(0, 3))]!, size: 2, life: 0.4, drag: 2 }); }
    },
  });
  // Impact: rock spikes burst up in an open arc, the boulder shatters, dust rolls out.
  const R = reach(c);
  const star = pixelStar(c, '#fff2d0', 1.2, k);
  const spikes = new FlipBatch(c.scene, 16, 'normal', 5);
  openArc(c, 7 + c.tier * 2, 0.3).forEach((a, i) => spikes.add('spike', ringPos(c, a, (0.44 + (i % 2) * 0.08) * R), { anchor: 'bottom', scale: k, fps: 20, life: 0.64, fadeOut: 0.16, flip: i % 2 === 1, delay: (i % 3) * 0.02 }));
  const chips = new FlipBatch(c.scene, 20, 'normal', 6);
  for (let i = 0; i < Math.round(12 * c.P / 0.7); i++) {
    const a = rnd(0, TAU);
    chips.add('chip', c.centre, { vel: V(Math.cos(a) * rnd(1, 2.5), rnd(2, 4), Math.sin(a) * rnd(1, 2.5)).multiplyScalar(Math.sqrt(R)), gravity: -12, drag: 0.6, loop: true, fps: 16, frame0: i, life: rnd(0.45, 0.65), scale: k * (i % 4 === 0 ? 2 : 1) });
  }
  const puffs = new FlipBatch(c.scene, 12, 'normal', 5);
  openArc(c, 9, 0.2).forEach((a, i) => puffs.add('dust', ringPos(c, a, 0.3 * R, 0.08 * R), { vel: V(Math.cos(a) * 1.4 * R, 0.15, Math.sin(a) * 1.4 * R), drag: 3.5, scale: k, fps: 11, delay: i * 0.012 }));
  const tail = (async () => {
    await animate(640, (_kk, dt) => { spikes.step(dt); star.step(dt); chips.step(dt); puffs.step(dt); });
    spikes.dispose(); star.dispose();
    await finish(chips, puffs);
  })();
  await wait(260);
  return tail;
}

async function galePx(c: Ctx) {
  const k = texScale(c);
  const n = 1 + c.tier;
  const blades = new FlipBatch(c.scene, n, 'normal', 6);
  const paths = Array.from({ length: n }, (_, i) => ({ id: -1, t0: i * 0.07, to: c.centre.clone().add(V(0, (i - (n - 1) / 2) * 0.25 * c.h, 0)), from: c.from.clone().add(V(0, (i - (n - 1) / 2) * 0.15, 0)) }));
  const p = V();
  let time = 0;
  await animate(300 + (n - 1) * 70, (_kk, dt) => {
    time += dt;
    for (const q of paths) {
      const lt = (time - q.t0) / 0.3;
      if (lt < 0) continue;
      if (q.id < 0) q.id = blades.add('slash', q.from, { life: 0.31, scale: k * 2, fps: 18, flip: q.t0 > 0.1 });
      if (lt > 1) continue;
      blades.place(q.id, arcPoint(p, q.from, q.to, lt, 0.15));
    }
    blades.step(dt);
  });
  blades.dispose();
  // Impact: a whirlwind funnel behind the target, leaves and gusts orbiting, a ground ripple.
  const R = reach(c);
  const fwd = camFwdXZ(c);
  const star = pixelStar(c, '#e8fbff', 1.2, k);
  const funnel = new FlipBatch(c.scene, 3, 'normal', 5);
  funnel.add('swirl', c.ground.clone().addScaledVector(fwd, 0.12 * R), { anchor: 'bottom', loop: true, life: 0.62, fadeIn: 0.08, fadeOut: 0.2, scale: k * 2, fps: 16 });
  const orbit = new FlipBatch(c.scene, 8, 'normal', 6);
  const gust = new PixelPoints(c.scene, 30, 'normal', 6);
  const seeds = Array.from({ length: 6 }, (_, i) => ({ id: orbit.add('leaf', c.ground, { loop: true, life: 0.62, fps: 16, frame0: i, scale: k, fadeOut: 0.15 }), a: (i / 6) * TAU, y: (i % 3) * 0.25, r: 0.45 + (i % 2) * 0.12 }));
  const gseeds = Array.from({ length: 14 }, (_, i) => { gust.emit(c.ground, V(), { color: i % 3 ? '#ffffff' : '#a6e2f4', size: i % 2 ? 2 : 1, life: 0.62 }); return { a: (i / 14) * TAU, y: (i % 5) * 0.2, r: 0.5 + (i % 3) * 0.1 }; });
  void groundRing(c.scene, c.ground.clone().add(V(0, 0.04, 0)), '#ffffff', 1.0 * R, 420);
  const tail = (async () => {
    let t = 0;
    await animate(640, (_kk, dt) => {
      t += dt;
      const place = (s: { a: number; y: number; r: number }, speed: number) => {
        const a = s.a - t * speed;
        const y = ((s.y + t * 1.4) % 1.1) * c.h;
        const r = s.r * R * (0.7 + (y / c.h) * 0.4);
        // Orbit only behind and beside the target: points swinging to the camera side duck under it.
        const pp = c.ground.clone().add(V(Math.cos(a) * r, y, Math.sin(a) * r));
        if (Math.cos(a) * fwd.x + Math.sin(a) * fwd.z < -0.2) pp.addScaledVector(fwd, r * 0.8);
        return pp;
      };
      seeds.forEach((s) => orbit.place(s.id, place(s, 7)));
      gseeds.forEach((s, i) => gust.place(i, place(s, 9)));
      funnel.step(dt); star.step(dt); orbit.step(dt); gust.step(dt);
    });
    funnel.dispose(); star.dispose(); orbit.dispose(); gust.dispose();
  })();
  await wait(280);
  return tail;
}

async function neutralPx(c: Ctx) {
  const k = texScale(c);
  const R = reach(c);
  // A white pop under the target, a gold one behind it, speed lines and grit flying out.
  const star = new FlipBatch(c.scene, 3, 'normal', 5);
  star.add('star', behind(c, c.centre, 0.5 * c.h), { scale: k * 2, tint: '#ffffff', glow: 1.8, fps: 14 });
  star.add('star', behind(c, c.centre, 0.65 * c.h), { scale: k * 2, tint: '#ffd23f', glow: 1.4, fps: 12, delay: 0.05, flip: true });
  const lines = new PixelPoints(c.scene, 50, 'add');
  const cam = c.camera;
  const right = V(1, 0, 0), up = V(0, 1, 0);
  if (cam) { right.applyQuaternion(cam.quaternion); up.applyQuaternion(cam.quaternion); }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    const d = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    for (let s = 0; s < 4; s++) lines.emit(c.centre.clone().addScaledVector(d, (0.3 + s * 0.05) * c.h), d.clone().multiplyScalar(3.2 * R), { color: '#ffffff', size: s === 0 ? 2 : 1, life: 0.24 - s * 0.02, drag: 4, glow: 1.4 });
  }
  const grit = new PixelPoints(c.scene, 30, 'normal', 6);
  for (let i = 0; i < Math.round(14 * c.P / 0.7); i++) {
    const a = rnd(0, TAU);
    grit.emit(c.centre, V(Math.cos(a) * rnd(1.5, 3), rnd(0.8, 3), Math.sin(a) * rnd(1.5, 3)).multiplyScalar(Math.sqrt(R)), { color: ['#ffffff', '#fff27a', '#ffd23f'][i % 3]!, size: i % 2 ? 2 : 1, life: rnd(0.35, 0.55), gravity: -5, drag: 2 });
  }
  const light = impactGlow(c.scene, c.ground, '#fff0c0', 0.85 * R, c.camera);
  const tail = (async () => {
    await animate(460, (kk, dt) => {
      light.set(kk < 0.08 ? kk / 0.08 : Math.max(0, 1 - (kk - 0.08) / 0.92));
      star.step(dt); lines.step(dt); grit.step(dt);
    });
    star.dispose(); light.dispose();
    await finish(lines, grit);
  })();
  await wait(200);
  return tail;
}

const WHIFF_BOOK: Record<string, BookId> = { Flame: 'fireball', Tide: 'orb', Flora: 'leaf', Spark: 'spark', Terra: 'boulder', Gale: 'slash', Neutral: 'spark' };

/** HD-2D miss: the projectile streaks past the target's shoulder and fades; a pale whoosh. */
async function whiffPx(c: Ctx, type: MoveElement) {
  const k = texScale(c);
  const [col, light] = WHIFF[type] ?? WHIFF.Neutral!;
  const dir = c.centre.clone().sub(c.from);
  dir.y = 0;
  dir.normalize();
  let lateral = V(-dir.z, 0, dir.x);
  if (c.camera) {
    const a = c.centre.clone().addScaledVector(lateral, c.h).project(c.camera);
    const b = c.centre.clone().addScaledVector(lateral, -c.h).project(c.camera);
    if (Math.abs(b.x) < Math.abs(a.x)) lateral = lateral.negate();
  }
  const by = c.centre.clone().addScaledVector(lateral, 0.75 * c.h).add(V(0, 0.25 * c.h, 0));
  const past = by.clone().addScaledVector(lateral, 0.35 * c.h).addScaledVector(dir, 1.4 * c.h).add(V(0, 0.2 * c.h, 0));
  const proj = new FlipBatch(c.scene, 2, 'normal', 6);
  const trail = new PixelPoints(c.scene, 60, 'normal', 6);
  const id = proj.add(WHIFF_BOOK[type] ?? 'spark', c.from, { loop: true, life: 0.6, fadeOut: 0.22, scale: k, tint: type === 'Neutral' ? '#d8d0ff' : undefined, glow: type === 'Flame' || type === 'Spark' ? 1.4 : 1 });
  const p = V();
  let acc = 0;
  let swished = false;
  await animate(600, (kk, dt) => {
    if (kk < 0.6) arcPoint(p, c.from, by, ease.inOut(kk / 0.6), 0.35);
    else p.lerpVectors(by, past, (kk - 0.6) / 0.4);
    proj.place(id, p);
    if (!swished && kk >= 0.6) { swished = true; proj.add('slash', by, { scale: k * 2, tint: '#ffffff', fps: 18, flip: lateral.x < 0 }); }
    acc += dt;
    while (acc > 0.02 && kk < 0.85) { acc -= 0.02; trail.emit(p.clone(), V(rnd(-0.15, 0.15), rnd(0, 0.3), rnd(-0.15, 0.15)), { color: rnd() < 0.6 ? col : light, size: rnd() < 0.4 ? 2 : 1, life: 0.3 }); }
    proj.step(dt); trail.step(dt);
  });
  proj.dispose();
  void trail.run(350);
  await wait(80);
}

async function pixelMoveFx(c: Ctx, type: MoveElement, miss: boolean): Promise<void> {
  if (miss) return whiffPx(c, type);
  let tail: Promise<unknown> | void;
  switch (type) {
    case 'Flame': tail = await flamePx(c); break;
    case 'Tide': tail = await tidePx(c); break;
    case 'Flora': tail = await floraPx(c); break;
    case 'Spark': tail = await sparkPx(c); break;
    case 'Terra': tail = await terraPx(c); break;
    case 'Gale': tail = await galePx(c); break;
    default: tail = await neutralPx(c); break;
  }
  void tail;
}

// ------------------------------------------------------------------ entry points

/**
 * Play the travelling/impact effect for an attack of the given element. Resolves at the moment
 * of impact (+ a beat); the effect's tail keeps fading in the background. `opts` may be the move
 * power (number) or {power, targetHeight}.
 */
export async function moveFx(scene: THREE.Scene, type: MoveElement, from: THREE.Vector3, to: THREE.Vector3, opts: number | MoveFxOptions = {}): Promise<void> {
  const o = typeof opts === 'number' ? { power: opts } : opts;
  const c = makeCtx(scene, from, to, o);
  fxSeed(type.length * 97 + c.tier * 13);
  if (hd2dRequested()) return pixelMoveFx(c, type, !!o.miss);
  if (o.miss) return whiff(c, type);
  let tail: Promise<unknown> | void;
  switch (type) {
    case 'Flame': tail = await flame(c); break;
    case 'Tide': tail = await tide(c); break;
    case 'Flora': tail = await flora(c); break;
    case 'Spark': tail = await spark(c); break;
    case 'Terra': tail = await terra(c); break;
    case 'Gale': tail = await gale(c); break;
    default: tail = await neutral(c); break;
  }
  void tail;
}

export type StatusCue = 'buff' | 'debuff' | 'burn' | 'shock' | 'drowsy' | 'heal' | 'cure';

/**
 * Optional status cue around a creature standing at `at` (its feet): rising chevrons for a
 * stat boost, falling ones for a drop, flame licks for burn, sparks for shock, floating Z's
 * for drowsy, green pluses for healing, a white sparkle ring for a cure.
 */
export async function statusFx(scene: THREE.Scene, type: StatusCue, at: THREE.Vector3, height = 1.2, boost = 1): Promise<void> {
  fxSeed(type.length * 41);
  const h = THREE.MathUtils.clamp(height, 0.8, 2.6);
  const centre = at.clone().add(V(0, h * 0.5, 0));
  const spec: Record<StatusCue, { shape: THREE.BufferGeometry; colors: string[]; up: number; ring?: string }> = {
    buff: { shape: flatShape('chevron'), colors: ['#ff7a3d', '#ffd23f'], up: 1, ring: '#ff9a3d' },
    debuff: { shape: flatShape('chevron'), colors: ['#3d9bff', '#9ad0ff'], up: -1, ring: '#3d9bff' },
    burn: { shape: GEO.cone4, colors: ['#ff4d1e', '#ff9a1e', '#ffd23f'], up: 1 },
    shock: { shape: GEO.box, colors: ['#ffe14d', '#ffffff'], up: 0 },
    drowsy: { shape: flatShape('zee'), colors: ['#b98cff', '#ffffff'], up: 0.6 },
    heal: { shape: flatShape('plus'), colors: ['#5fd36b', '#c8ffb0'], up: 1, ring: '#5fd36b' },
    cure: { shape: flatShape('star4'), colors: ['#ffffff', '#fff2b0'], up: 0.8, ring: '#ffffff' },
  };
  const s = spec[type];
  const flat = s.shape.attributes.position!.count < 200 && !(s.shape === GEO.cone4 || s.shape === GEO.box);
  const ps = new Particles(scene, 32, s.shape, type === 'shock' || type === 'cure' ? 'add' : 'normal', { billboard: flat });
  // `boost` (portrait phones: 1.5) makes the cue bigger and denser so it reads on a small screen.
  const n = Math.round((type === 'drowsy' ? 3 : 10) * (boost > 1 ? 1 + (boost - 1) * 0.6 : 1));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = h * 0.42;
    const y0 = s.up < 0 ? h * 1.05 : type === 'drowsy' ? h * 0.9 : h * (0.05 + (i % 3) * 0.15);
    const p = at.clone().add(V(Math.cos(a) * r, y0, Math.sin(a) * r));
    const v = type === 'shock'
      ? V(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))
      : type === 'drowsy' ? V(0.25, 0.6, 0) : V(0, s.up * (1.2 + (i % 2) * 0.4) * h, 0);
    ps.emit(type === 'shock' ? centre.clone().add(V(rnd(-0.4, 0.4) * h, rnd(-0.4, 0.4) * h, rnd(-0.2, 0.2))) : p, v, {
      color: s.colors[i % s.colors.length]!, size: (type === 'drowsy' ? 0.16 : flat ? 0.13 : 0.07) * Math.sqrt(h) * boost, life: (type === 'drowsy' ? 0.9 : 0.6) * (boost > 1 ? 1.15 : 1),
      end: type === 'burn' ? 0 : 0.6, stretch: type === 'burn' ? 2.2 : type === 'shock' ? 4 : 1, spin: type === 'shock' ? 15 : 0,
    });
  }
  if (s.ring) void groundRing(scene, at.clone().add(V(0, 0.04, 0)), s.ring, h * 0.9, 420, 'add');
  await ps.run(type === 'drowsy' ? 950 : 650, 0.3);
}

/** Ambient drifting particles per theme (one Points object). */
const ambientMats = new Map<string, THREE.PointsMaterial>();
export function ambient(theme: string): { points: THREE.Points; update: (t: number) => void } {
  const n = 70;
  const pos = new Float32Array(n * 3);
  const seeds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([((i * 37) % 100) / 100 * 16 - 8, ((i * 53) % 100) / 100 * 5, ((i * 71) % 100) / 100 * 10 - 7], i * 3);
    seeds[i] = (i * 0.618) % 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const color = theme === 'ridge' ? '#ffb347' : theme === 'coast' ? '#ffffff' : theme === 'summit' ? '#e8f0ff' : '#ffd6ec';
  let mat = ambientMats.get(theme);
  if (!mat) {
    mat = markPersistent(new THREE.PointsMaterial({ color, size: theme === 'summit' ? 0.09 : 0.07, transparent: true, opacity: 0.85, depthWrite: false }));
    ambientMats.set(theme, mat);
  }
  const points = new THREE.Points(geo, mat);
  const base = pos.slice();
  const rise = theme === 'ridge' ? 1 : -1; // embers rise, petals/snow fall
  return {
    points,
    update: (t: number) => {
      for (let i = 0; i < n; i++) {
        const s = seeds[i]!;
        const y = ((base[i * 3 + 1]! + rise * t * (0.25 + s * 0.3)) % 5 + 5) % 5;
        pos[i * 3] = base[i * 3]! + Math.sin(t * 0.7 + s * 10) * 0.4;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = base[i * 3 + 2]! + Math.cos(t * 0.5 + s * 7) * 0.3;
      }
      geo.attributes.position!.needsUpdate = true;
    },
  };
}
