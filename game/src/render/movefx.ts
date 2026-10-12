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

export interface MoveFxOptions {
  /** Move power (40 / 65 / 95 in the data); picks weak / normal / strong variants. Default 65. */
  power?: number;
  /** Target height in world units; estimated from the scene when omitted. */
  targetHeight?: number;
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
  return { scene, from: from.clone(), to: to.clone(), ground, centre, h, P: [0.8, 1, 1.3][tier]!, tier };
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
export async function statusFx(scene: THREE.Scene, type: StatusCue, at: THREE.Vector3, height = 1.2): Promise<void> {
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
  const ps = new Particles(scene, 24, s.shape, type === 'shock' || type === 'cure' ? 'add' : 'normal', { billboard: flat });
  const n = type === 'drowsy' ? 3 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = h * 0.42;
    const y0 = s.up < 0 ? h * 1.05 : type === 'drowsy' ? h * 0.9 : h * (0.05 + (i % 3) * 0.15);
    const p = at.clone().add(V(Math.cos(a) * r, y0, Math.sin(a) * r));
    const v = type === 'shock'
      ? V(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2))
      : type === 'drowsy' ? V(0.25, 0.6, 0) : V(0, s.up * (1.2 + (i % 2) * 0.4) * h, 0);
    ps.emit(type === 'shock' ? centre.clone().add(V(rnd(-0.4, 0.4) * h, rnd(-0.4, 0.4) * h, rnd(-0.2, 0.2))) : p, v, {
      color: s.colors[i % s.colors.length]!, size: (type === 'drowsy' ? 0.16 : flat ? 0.13 : 0.07) * Math.sqrt(h), life: type === 'drowsy' ? 0.9 : 0.6,
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
