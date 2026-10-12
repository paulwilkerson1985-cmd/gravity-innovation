import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { ease, tween } from './anim';

/** A one-draw-call burst of shards that expands and fades, then removes itself. */
export async function burst(scene: THREE.Scene, at: THREE.Vector3, color: THREE.ColorRepresentation, size = 1, count = 8) {
  const b = new MeshBuilder();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const up = (i % 3) * 0.35 - 0.2;
    b.add(GEO.oct, '#ffffff', { p: [Math.cos(a) * 0.5, up + 0.3, Math.sin(a) * 0.5], r: [a, a * 2, 0], s: [0.09, 0.16, 0.09] });
  }
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, vertexColors: true, depthWrite: false });
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.position.copy(at);
  scene.add(mesh);
  await tween(380, (k) => {
    mesh.scale.setScalar(size * (0.2 + 1.4 * ease.outCubic(k)));
    mesh.rotation.y = k * 1.5;
    mat.opacity = 1 - k * k;
  });
  scene.remove(mesh);
  mesh.geometry.dispose();
  mat.dispose();
}

export const ORB_COLORS = { orb: '#ff4d6d', bright: '#3d9bff', star: '#ffc93d' } as const;

export function makeOrb(top: string): THREE.Mesh {
  const b = new MeshBuilder();
  const half = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  b.add(half, top, { s: 0.22 });
  b.add(half, '#f6f6f6', { s: 0.22, r: [Math.PI, 0, 0] });
  b.add(GEO.cyl, '#26263a', { s: [0.226, 0.045, 0.226] });
  b.add(GEO.cyl, '#ffffff', { p: [0, 0, 0.21], r: [Math.PI / 2, 0, 0], s: [0.06, 0.04, 0.06] });
  half.dispose();
  return new THREE.Mesh(b.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}
