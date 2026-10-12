// Per-element attack effects. Each effect is a single merged mesh (one draw call) that
// animates and removes itself.
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { ease, tween } from './anim';
import type { MoveElement } from '../engine/types';

function fxMesh(b: MeshBuilder, additive = false): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  return { mesh: new THREE.Mesh(b.build(), mat), mat };
}

function cleanup(scene: THREE.Scene, mesh: THREE.Mesh, mat: THREE.Material) {
  scene.remove(mesh);
  mesh.geometry.dispose();
  mat.dispose();
}

async function projectile(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3, build: (b: MeshBuilder) => void, opts: { arc?: number; spin?: number; ms?: number; scale?: number } = {}) {
  const b = new MeshBuilder();
  build(b);
  const { mesh, mat } = fxMesh(b);
  mesh.position.copy(from);
  mesh.scale.setScalar(opts.scale ?? 1);
  scene.add(mesh);
  await tween(opts.ms ?? 360, (k) => {
    mesh.position.lerpVectors(from, to, ease.inOut(k));
    mesh.position.y += Math.sin(k * Math.PI) * (opts.arc ?? 0.4);
    mesh.rotation.z = k * (opts.spin ?? 6);
    mesh.rotation.y = k * (opts.spin ?? 6) * 0.5;
  });
  cleanup(scene, mesh, mat);
}

async function flame(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
  await projectile(scene, from, to, (b) => {
    b.add(GEO.ball, '#ffd23f', { s: 0.22 });
    b.add(GEO.ball, '#ff7a1e', { s: 0.32 });
    for (let i = 0; i < 5; i++) b.along(GEO.cone4, i % 2 ? '#ff4d1e' : '#ffb02e', new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(i * 1.3) * 0.4, Math.sin(i * 1.3) * 0.4, -1), 0.6, 0.12);
  }, { arc: 0.5, spin: 4 });
  await burstShape(scene, to, ['#ff7a1e', '#ffd23f', '#ff4d1e'], 'cone');
}

async function tide(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
  const drops = [0, 90, 180].map((delay, i) => new Promise<void>((res) => {
    void tween(delay, () => {}).then(() => projectile(scene, from.clone().add(new THREE.Vector3(0, i * 0.08, 0)), to.clone().add(new THREE.Vector3((i - 1) * 0.15, 0, 0)), (b) => {
      b.add(GEO.ball, '#bfe6ff', { s: [0.16, 0.16, 0.22] });
      b.add(GEO.ball, '#3d9bff', { s: [0.2, 0.2, 0.3] });
    }, { arc: 0.7, spin: 0, ms: 320 })).then(res);
  }));
  await Promise.all(drops);
  await splash(scene, to);
}

async function splash(scene: THREE.Scene, at: THREE.Vector3) {
  const b = new MeshBuilder();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    b.along(GEO.cone4, i % 2 ? '#3d9bff' : '#bfe6ff', new THREE.Vector3(Math.cos(a) * 0.2, -0.4, Math.sin(a) * 0.2), new THREE.Vector3(Math.cos(a), 1.6, Math.sin(a)), 0.8, 0.08);
  }
  const { mesh, mat } = fxMesh(b);
  mesh.position.copy(at);
  scene.add(mesh);
  await tween(380, (k) => { mesh.scale.set(1 + k * 0.6, ease.outCubic(k) * 1.2 + 0.01, 1 + k * 0.6); mat.opacity = 1 - k * k; });
  cleanup(scene, mesh, mat);
}

async function flora(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3) {
  const leaves = [0, 1, 2, 3].map((i) => projectile(scene, from.clone().add(new THREE.Vector3(0, i * 0.1 - 0.15, 0)), to.clone().add(new THREE.Vector3((i - 1.5) * 0.18, (i % 2) * 0.2, 0)), (b) => {
    b.add(GEO.oct, i % 2 ? '#6fdc4c' : '#3fae3a', { s: [0.22, 0.04, 0.1] });
  }, { arc: 0.3 + i * 0.15, spin: 14, ms: 340 + i * 60 }));
  await Promise.all(leaves);
  await burstShape(scene, to, ['#6fdc4c', '#b9ff7a', '#3fae3a'], 'oct');
}

async function spark(scene: THREE.Scene, _from: THREE.Vector3, to: THREE.Vector3) {
  const b = new MeshBuilder();
  let p = new THREE.Vector3(0, 3.2, 0);
  for (let i = 0; i < 7; i++) {
    const next = new THREE.Vector3((i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08), p.y - 0.42, 0);
    if (i === 6) next.set(0, 0, 0);
    const d = next.clone().sub(p);
    b.along(GEO.box, i % 2 ? '#fff6a0' : '#ffe14d', p, d, d.length() + 0.02, 0.07);
    p = next;
  }
  const { mesh, mat } = fxMesh(b, true);
  mesh.position.copy(to);
  scene.add(mesh);
  await tween(360, (k) => { mat.opacity = Math.floor(k * 9) % 2 ? 0.3 : 1; mesh.scale.y = Math.min(1, k * 4); });
  cleanup(scene, mesh, mat);
  await burstShape(scene, to, ['#fff6a0', '#ffe14d', '#ffffff'], 'box');
}

async function terra(scene: THREE.Scene, _from: THREE.Vector3, to: THREE.Vector3) {
  const b = new MeshBuilder();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(GEO.rock, i % 2 ? '#a3825c' : '#8a6a48', { p: [Math.cos(a) * 0.55, 0, Math.sin(a) * 0.5], r: [a, a, 0], s: [0.22, 0.32, 0.22] });
  }
  const { mesh, mat } = fxMesh(b);
  const ground = to.clone().setY(0);
  mesh.position.copy(ground);
  scene.add(mesh);
  await tween(420, (k) => {
    mesh.position.y = ground.y - 0.4 + Math.sin(k * Math.PI) * 0.9;
    mesh.scale.setScalar(0.6 + k * 0.6);
    mesh.rotation.y = k * 2;
    mat.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
  });
  cleanup(scene, mesh, mat);
}

async function gale(scene: THREE.Scene, _from: THREE.Vector3, to: THREE.Vector3) {
  const b = new MeshBuilder();
  const ring = new THREE.TorusGeometry(0.55, 0.05, 3, 14);
  for (let i = 0; i < 3; i++) b.add(ring, i === 1 ? '#ffffff' : '#bfefff', { p: [0, i * 0.35 - 0.3, 0], r: [Math.PI / 2, 0, 0], s: 1 - i * 0.18 });
  ring.dispose();
  const { mesh, mat } = fxMesh(b, true);
  mesh.position.copy(to);
  scene.add(mesh);
  await tween(460, (k) => {
    mesh.rotation.y = k * 14;
    mesh.scale.set(0.5 + k * 0.9, 1 + k * 0.6, 0.5 + k * 0.9);
    mat.opacity = 1 - k * k;
  });
  cleanup(scene, mesh, mat);
}

async function neutral(scene: THREE.Scene, _from: THREE.Vector3, to: THREE.Vector3) {
  await burstShape(scene, to, ['#ffffff', '#fff27a', '#ffffff'], 'tet', 1.2);
}

async function burstShape(scene: THREE.Scene, at: THREE.Vector3, colors: string[], kind: 'cone' | 'oct' | 'box' | 'tet', size = 1) {
  const b = new MeshBuilder();
  const geo = kind === 'cone' ? GEO.cone4 : kind === 'oct' ? GEO.oct : kind === 'box' ? GEO.box : GEO.tet;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const up = ((i * 7) % 5) * 0.12 - 0.2;
    b.add(geo, colors[i % colors.length]!, { p: [Math.cos(a) * 0.45, up, Math.sin(a) * 0.45], r: [a, a * 1.7, 0], s: kind === 'box' ? [0.05, 0.22, 0.05] : 0.1 });
  }
  const { mesh, mat } = fxMesh(b);
  mesh.position.copy(at);
  scene.add(mesh);
  await tween(320, (k) => { mesh.scale.setScalar(size * (0.3 + ease.outCubic(k) * 1.3)); mesh.rotation.y = k * 2; mat.opacity = 1 - k * k; });
  cleanup(scene, mesh, mat);
}

/** Play the travelling/impact effect for an attack of the given element. */
export function moveFx(scene: THREE.Scene, type: MoveElement, from: THREE.Vector3, to: THREE.Vector3): Promise<void> {
  switch (type) {
    case 'Flame': return flame(scene, from, to);
    case 'Tide': return tide(scene, from, to);
    case 'Flora': return flora(scene, from, to);
    case 'Spark': return spark(scene, from, to);
    case 'Terra': return terra(scene, from, to);
    case 'Gale': return gale(scene, from, to);
    default: return neutral(scene, from, to);
  }
}

/** Ambient drifting particles per theme (one Points object). */
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
  const mat = new THREE.PointsMaterial({ color, size: theme === 'summit' ? 0.09 : 0.07, transparent: true, opacity: 0.85, depthWrite: false });
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
