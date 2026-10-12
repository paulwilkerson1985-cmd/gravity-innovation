// Procedural low-poly scenery. Static props are merged into a single mesh per scene.
import * as THREE from 'three';
import { GEO, MeshBuilder, flatMaterial } from './builder';
import { Rng } from '../engine/rng';
import type { RouteData } from '../engine/types';

export type Theme = RouteData['theme'] | 'title';

export const PALETTES: Record<Theme, { skyTop: string; skyBottom: string; ground: string; ground2: string; dirt: string; leaf: string[]; rock: string; flower: string[] }> = {
  meadow: { skyTop: '#3fb4ff', skyBottom: '#d9f6ff', ground: '#78d05a', ground2: '#5fbf48', dirt: '#a8754a', leaf: ['#2f9e44', '#46c35a', '#7fdc5a'], rock: '#9aa3ad', flower: ['#ff6f9e', '#ffd84a', '#ffffff', '#b98cff'] },
  ridge: { skyTop: '#ff8a5c', skyBottom: '#ffe3b3', ground: '#d4a064', ground2: '#c18a50', dirt: '#8a5638', leaf: ['#9a8a3a', '#c2a64a', '#6f8f3a'], rock: '#8a6150', flower: ['#ff4f2e', '#ffb02e'] },
  coast: { skyTop: '#4aa8ff', skyBottom: '#eafcff', ground: '#f0d890', ground2: '#e2c676', dirt: '#b8915a', leaf: ['#3fae6a', '#58c97a', '#2f8f58'], rock: '#a6b4bf', flower: ['#ffffff', '#ff9ad0'] },
  title: { skyTop: '#5b6cff', skyBottom: '#ffb3d9', ground: '#7ad05a', ground2: '#5fbf48', dirt: '#a8754a', leaf: ['#2f9e44', '#46c35a', '#7fdc5a'], rock: '#9aa3ad', flower: ['#ff6f9e', '#ffd84a', '#ffffff'] },
};

export function makeSky(theme: Theme): THREE.Mesh {
  const pal = PALETTES[theme];
  const geo = new THREE.SphereGeometry(80, 16, 10);
  const top = new THREE.Color(pal.skyTop);
  const bottom = new THREE.Color(pal.skyBottom);
  const pos = geo.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, pos.getY(i) / 50 + 0.15));
    c.copy(bottom).lerp(top, k);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -1;
  return m;
}

export function addLights(scene: THREE.Scene, theme: Theme) {
  const warm = theme === 'ridge';
  scene.add(new THREE.HemisphereLight(warm ? 0xfff0dd : 0xeaf6ff, warm ? 0x6a4a3a : 0x4a6a3a, 1.6));
  const sun = new THREE.DirectionalLight(warm ? 0xffd2a0 : 0xffffff, 1.9);
  sun.position.set(4, 8, 5);
  scene.add(sun);
}

export function tree(b: MeshBuilder, x: number, z: number, s: number, leaf: string, rng: Rng) {
  b.add(GEO.cyl, '#8a5a3a', { p: [x, 0.35 * s, z], s: [0.12 * s, 0.7 * s, 0.12 * s] });
  const layers = rng.range(2, 3);
  for (let i = 0; i < layers; i++) {
    const r = (0.75 - i * 0.18) * s;
    b.add(GEO.cone6, leaf, { p: [x, (0.85 + i * 0.45) * s, z], r: [0, rng.next() * 3, 0], s: [r, 0.8 * s, r] }, 0.15);
  }
}

export function roundTree(b: MeshBuilder, x: number, z: number, s: number, leaf: string) {
  b.add(GEO.cyl, '#8a5a3a', { p: [x, 0.4 * s, z], s: [0.1 * s, 0.8 * s, 0.1 * s] });
  b.add(GEO.rock, leaf, { p: [x, 1.05 * s, z], s: [0.6 * s, 0.55 * s, 0.6 * s] }, 0.2);
}

export function rock(b: MeshBuilder, x: number, z: number, s: number, color: string, rng: Rng) {
  b.add(GEO.rock, color, { p: [x, 0.2 * s, z], r: [rng.next(), rng.next() * 3, rng.next()], s: [0.5 * s, 0.38 * s, 0.45 * s] }, 0.25);
}

export function flowers(b: MeshBuilder, x: number, z: number, n: number, colors: string[], rng: Rng, spread = 0.6) {
  for (let i = 0; i < n; i++) {
    const fx = x + (rng.next() - 0.5) * spread * 2;
    const fz = z + (rng.next() - 0.5) * spread * 2;
    b.add(GEO.cyl, '#3f9e3a', { p: [fx, 0.1, fz], s: [0.015, 0.2, 0.015] });
    b.add(GEO.oct, rng.pick(colors), { p: [fx, 0.22, fz], s: [0.07, 0.04, 0.07] });
  }
}

export function grassTuft(b: MeshBuilder, x: number, z: number, h: number, colors: string[], rng: Rng, n = 7, spread = 0.45) {
  for (let i = 0; i < n; i++) {
    const gx = x + (rng.next() - 0.5) * spread * 2;
    const gz = z + (rng.next() - 0.5) * spread * 2;
    const hh = h * (0.7 + rng.next() * 0.5);
    b.add(GEO.cone4, rng.pick(colors), { p: [gx, hh / 2, gz], r: [(rng.next() - 0.5) * 0.4, rng.next() * 3, (rng.next() - 0.5) * 0.4], s: [0.12, hh, 0.12] });
  }
}

export function cloud(b: MeshBuilder, x: number, y: number, z: number, s: number) {
  b.add(GEO.rock, '#ffffff', { p: [x, y, z], s: [1.2 * s, 0.6 * s, 0.8 * s] });
  b.add(GEO.rock, '#f4f8ff', { p: [x + 0.9 * s, y - 0.1 * s, z], s: [0.8 * s, 0.5 * s, 0.6 * s] });
  b.add(GEO.rock, '#f4f8ff', { p: [x - 0.9 * s, y - 0.15 * s, z + 0.1], s: [0.7 * s, 0.4 * s, 0.6 * s] });
}

/** A floating island base: grassy top, dirt sides. */
export function island(b: MeshBuilder, radius: number, theme: Theme) {
  const pal = PALETTES[theme];
  b.add(GEO.disc, pal.ground, { p: [0, -0.15, 0], s: [radius, 0.3, radius] }, 0.08);
  b.add(GEO.cone6, pal.dirt, { p: [0, -1.4, 0], r: [Math.PI, 0.3, 0], s: [radius * 0.98, 2.2, radius * 0.98] }, 0.2);
  if (theme === 'coast') b.add(GEO.disc, '#3d9bff', { p: [0, -0.35, 0], s: [radius * 1.6, 0.2, radius * 1.6] });
}

export function staticMesh(b: MeshBuilder): THREE.Mesh {
  return new THREE.Mesh(b.build(), flatMaterial());
}

/** Background scenery ring used behind battles and on the title screen. */
export function backdrop(theme: Theme, seed: number): THREE.Mesh {
  const pal = PALETTES[theme];
  const rng = new Rng(seed);
  const b = new MeshBuilder();
  b.add(GEO.disc, pal.ground, { p: [0, -0.1, 0], s: [30, 0.2, 30] }, 0.05);
  for (let i = 0; i < 26; i++) {
    const ang = Math.PI * (0.05 + rng.next() * 0.9) + Math.PI; // behind the action (negative z)
    const dist = 8 + rng.next() * 10;
    const x = Math.cos(ang) * dist * 1.4;
    const z = Math.sin(ang) * dist - 2;
    const s = 1 + rng.next() * 1.4;
    if (theme === 'coast' && rng.chance(0.35)) rock(b, x, z, s * 1.6, pal.rock, rng);
    else if (theme === 'ridge' && rng.chance(0.6)) rock(b, x, z, s * 2.2, pal.rock, rng);
    else if (rng.chance(0.5)) tree(b, x, z, s, rng.pick(pal.leaf), rng);
    else roundTree(b, x, z, s, rng.pick(pal.leaf));
  }
  for (let i = 0; i < 18; i++) grassTuft(b, (rng.next() - 0.5) * 16, -rng.next() * 8 + 2, 0.3, [pal.ground2, pal.leaf[0]!], rng, 4, 0.3);
  for (let i = 0; i < 6; i++) flowers(b, (rng.next() - 0.5) * 14, -rng.next() * 6 + 1, 4, pal.flower, rng);
  for (let i = 0; i < 5; i++) cloud(b, (rng.next() - 0.5) * 50, 12 + rng.next() * 6, -30 - rng.next() * 10, 1.5 + rng.next() * 1.5);
  if (theme === 'coast') b.add(GEO.disc, '#3d9bff', { p: [0, -0.05, -24], s: [40, 0.1, 12] });
  if (theme === 'ridge') for (let i = 0; i < 4; i++) b.add(GEO.cone5, '#a0563a', { p: [-20 + i * 13, 4, -26 - rng.next() * 6], s: [6 + rng.next() * 3, 9 + rng.next() * 5, 6] }, 0.2);
  return staticMesh(b);
}

export function platform(color: string, radius: number): THREE.Mesh {
  const b = new MeshBuilder();
  b.add(GEO.disc, color, { p: [0, 0.04, 0], s: [radius, 0.12, radius] }, 0.08);
  b.add(GEO.disc, new THREE.Color(color).multiplyScalar(0.8).getStyle(), { p: [0, -0.06, 0], s: [radius * 1.08, 0.1, radius * 1.08] });
  return staticMesh(b);
}
