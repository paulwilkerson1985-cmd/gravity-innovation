// Extra themed scenery for route dioramas (merged into the static mesh via MeshBuilder) plus
// small animated markers for hotspots.
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import type { Rng } from '../engine/rng';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function palm(b: MeshBuilder, x: number, z: number, s: number, rng: Rng) {
  const lean = (rng.next() - 0.5) * 0.5;
  let p = V(x, 0, z);
  for (let i = 0; i < 4; i++) {
    const d = V(lean * 0.25 * (i + 1), 1, 0).normalize();
    b.along(GEO.cyl, i % 2 ? '#a8754a' : '#b8855a', p, d, 0.42 * s, 0.07 * s * (1 - i * 0.12));
    p = p.clone().addScaledVector(d, 0.42 * s);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rng.next() * 0.4;
    b.along(GEO.cone4, i % 2 ? '#3fae6a' : '#58c97a', p, V(Math.cos(a), -0.35, Math.sin(a)), 0.85 * s, 0.13 * s, 0.25);
  }
  b.add(GEO.ball, '#7a4a2a', { p: [p.x + 0.06, p.y - 0.08, p.z], s: 0.07 * s });
  b.add(GEO.ball, '#7a4a2a', { p: [p.x - 0.05, p.y - 0.1, p.z + 0.05], s: 0.07 * s });
}

export function snowPine(b: MeshBuilder, x: number, z: number, s: number, leaf: string) {
  b.add(GEO.cyl, '#6b4a3a', { p: [x, 0.25 * s, z], s: [0.1 * s, 0.5 * s, 0.1 * s] });
  for (let i = 0; i < 3; i++) {
    const r = (0.7 - i * 0.18) * s;
    const y = (0.7 + i * 0.42) * s;
    b.add(GEO.cone6, leaf, { p: [x, y, z], s: [r, 0.75 * s, r] }, 0.12);
    b.add(GEO.cone6, '#ffffff', { p: [x, y + 0.2 * s, z], s: [r * 0.62, 0.36 * s, r * 0.62] }, 0.05);
  }
}

export function deadTree(b: MeshBuilder, x: number, z: number, s: number, rng: Rng) {
  b.add(GEO.cyl, '#5a3a2a', { p: [x, 0.5 * s, z], s: [0.09 * s, 1.0 * s, 0.09 * s] });
  for (let i = 0; i < 3; i++) {
    const a = rng.next() * Math.PI * 2;
    b.along(GEO.cyl, '#5a3a2a', V(x, (0.55 + i * 0.18) * s, z), V(Math.cos(a), 0.9, Math.sin(a)), 0.45 * s, 0.035 * s);
  }
}

/** A steaming volcanic vent: dark cone with a glowing core. */
export function vent(b: MeshBuilder, x: number, z: number, s: number) {
  b.add(GEO.cone6, '#5a3a32', { p: [x, 0.22 * s, z], s: [0.55 * s, 0.45 * s, 0.55 * s] }, 0.2);
  b.add(GEO.disc, '#ff7a1e', { p: [x, 0.43 * s, z], s: [0.18 * s, 0.04, 0.18 * s] });
  b.add(GEO.disc, '#ffd23f', { p: [x, 0.45 * s, z], s: [0.09 * s, 0.04, 0.09 * s] });
}

export function pillar(b: MeshBuilder, x: number, z: number, h: number, color = '#e9e2f6') {
  b.add(GEO.box, '#b4c0d4', { p: [x, 0.08, z], s: [0.5, 0.16, 0.5] });
  b.add(GEO.cyl, color, { p: [x, h / 2, z], s: [0.17, h, 0.17] }, 0.05);
  b.add(GEO.box, '#b4c0d4', { p: [x, h + 0.06, z], s: [0.44, 0.12, 0.44] });
  b.add(GEO.oct, '#ffd23f', { p: [x, h + 0.28, z], s: [0.12, 0.18, 0.12] });
}

export function banner(b: MeshBuilder, x: number, z: number, color: string) {
  b.add(GEO.cyl, '#8a7a9a', { p: [x, 0.9, z], s: [0.03, 1.8, 0.03] });
  b.add(GEO.box, color, { p: [x + 0.2, 1.5, z], s: [0.38, 0.5, 0.02] });
  b.add(GEO.box, '#ffd23f', { p: [x + 0.2, 1.5, z + 0.012], s: [0.12, 0.12, 0.01] });
}

export function fence(b: MeshBuilder, x0: number, z0: number, x1: number, z1: number, posts: number) {
  for (let i = 0; i <= posts; i++) {
    const k = i / posts;
    b.add(GEO.box, '#c79560', { p: [x0 + (x1 - x0) * k, 0.2, z0 + (z1 - z0) * k], s: [0.07, 0.4, 0.07] });
  }
  const dx = x1 - x0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  for (const y of [0.17, 0.32]) b.add(GEO.box, '#e0b07a', { p: [(x0 + x1) / 2, y, (z0 + z1) / 2], r: [0, ang, 0], s: [0.035, 0.05, len] });
}

export function umbrella(b: MeshBuilder, x: number, z: number) {
  b.add(GEO.cyl, '#f6f6f6', { p: [x, 0.5, z], s: [0.025, 1.0, 0.025] });
  for (let i = 0; i < 6; i++) {
    b.add(GEO.cone6, i % 2 ? '#ff5d73' : '#ffffff', { p: [x, 1.05, z], r: [0, (i / 6) * Math.PI * 2, 0], s: [0.55, 0.22, 0.55] });
  }
  b.add(GEO.box, '#3d9bff', { p: [x + 0.35, 0.03, z + 0.2], r: [0, 0.4, 0], s: [0.4, 0.03, 0.7] });
}

export function shell(b: MeshBuilder, x: number, z: number, color: string) {
  b.add(GEO.cone5, color, { p: [x, 0.04, z], r: [Math.PI / 2, 0, 0.5], s: [0.08, 0.12, 0.05] });
}

export function lavaRiver(b: MeshBuilder, pts: [number, number][]) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i]!;
    const [x1, z1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ang = Math.atan2(x1 - x0, z1 - z0);
    b.add(GEO.box, '#ff7a1e', { p: [(x0 + x1) / 2, 0.012, (z0 + z1) / 2], r: [0, ang, 0], s: [0.22, 0.02, len + 0.1] });
    b.add(GEO.box, '#ffd23f', { p: [(x0 + x1) / 2, 0.02, (z0 + z1) / 2], r: [0, ang, 0], s: [0.08, 0.02, len] });
  }
}

/** Floating "!" (challenge) or check-mark (defeated) badge above a trainer. One draw call. */
export function trainerBadge(defeated: boolean): THREE.Mesh {
  const b = new MeshBuilder();
  if (defeated) {
    b.add(GEO.disc, '#2fb34a', { r: [Math.PI / 2, 0, 0], s: [0.2, 0.05, 0.2] });
    b.add(GEO.box, '#ffffff', { p: [-0.045, -0.02, 0.03], r: [0, 0, 0.8], s: [0.045, 0.12, 0.02] });
    b.add(GEO.box, '#ffffff', { p: [0.04, 0.01, 0.03], r: [0, 0, -0.6], s: [0.045, 0.22, 0.02] });
  } else {
    b.add(GEO.disc, '#ff5d73', { r: [Math.PI / 2, 0, 0], s: [0.2, 0.05, 0.2] });
    b.add(GEO.box, '#ffffff', { p: [0, 0.035, 0.03], s: [0.05, 0.16, 0.02] });
    b.add(GEO.box, '#ffffff', { p: [0, -0.09, 0.03], s: [0.05, 0.05, 0.02] });
  }
  return new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
}
