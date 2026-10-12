// Celebration effects for the evolution and hall-of-fame scenes. Each is a single draw call.
import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';

/** A fan of additive light rays radiating from the origin in the XY plane. */
export function lightRays(count = 14, length = 9, color = '#fff2b0'): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const b = new MeshBuilder();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const w = i % 2 ? 0.35 : 0.6;
    b.add(GEO.cone4, i % 3 === 0 ? '#ffffff' : color, {
      p: [Math.cos(a) * length * 0.5, Math.sin(a) * length * 0.5, 0], r: [0, 0, a + Math.PI / 2], s: [w, length, 0.02],
    });
  }
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  return { mesh: new THREE.Mesh(b.build(), mat), mat };
}

/** Rising/orbiting sparkles around a point (THREE.Points with per-vertex colour). */
export function sparkles(n = 90, radius = 1.6, palette = ['#ffffff', '#fff2b0', '#9ad0ff', '#ffb3e6']) {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const seed = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    seed[i * 3] = ((i * 0.618034) % 1) * Math.PI * 2;
    seed[i * 3 + 1] = ((i * 0.414) % 1);
    seed[i * 3 + 2] = 0.4 + ((i * 0.732) % 1) * 0.8;
    c.set(palette[i % palette.length]!);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const points = new THREE.Points(geo, mat);
  const update = (t: number, spin = 1) => {
    for (let i = 0; i < n; i++) {
      const a = seed[i * 3]! + t * seed[i * 3 + 2]! * spin;
      const h = ((seed[i * 3 + 1]! + t * 0.25 * seed[i * 3 + 2]!) % 1);
      const r = radius * (0.55 + 0.45 * Math.sin(h * Math.PI));
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = h * 3.2 - 0.2;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.attributes.position!.needsUpdate = true;
  };
  update(0);
  return { points, mat, update };
}

/** Falling confetti: small flat quads in one mesh, animated on the CPU. */
export function confetti(n = 160, width = 14, height = 9, depth = 6) {
  const colors = ['#ff5d73', '#ffd23f', '#3d9bff', '#43d36b', '#b98cff', '#ffffff', '#ff9a3d'];
  const quad = new THREE.PlaneGeometry(0.12, 0.2);
  const b = new MeshBuilder();
  for (let i = 0; i < n; i++) b.add(quad, colors[i % colors.length]!);
  quad.dispose();
  const geo = b.build();
  const base = (geo.attributes.position!.array as Float32Array).slice();
  const per = base.length / 3 / n; // vertices per piece
  const seeds = Array.from({ length: n }, (_, i) => ({
    x: (((i * 0.618034) % 1) - 0.5) * width,
    z: (((i * 0.414214) % 1) - 0.5) * depth,
    y0: ((i * 0.732051) % 1) * height,
    v: 0.8 + ((i * 0.236) % 1) * 0.9,
    spin: 2 + ((i * 0.5772) % 1) * 5,
    sway: ((i * 0.3183) % 1) * Math.PI * 2,
  }));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const arr = geo.attributes.position!.array as Float32Array;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const update = (t: number) => {
    for (let i = 0; i < n; i++) {
      const s = seeds[i]!;
      const y = height - ((s.y0 + t * s.v) % height);
      const p = new THREE.Vector3(s.x + Math.sin(t * 1.3 + s.sway) * 0.4, y - 1, s.z);
      q.setFromEuler(e.set(t * s.spin, t * s.spin * 0.7, s.sway));
      m.compose(p, q, one);
      for (let k = 0; k < per; k++) {
        const j = (i * per + k) * 3;
        // base positions are centred per piece (quads were added untransformed)
        v.set(base[j]!, base[j + 1]!, base[j + 2]!).applyMatrix4(m);
        arr[j] = v.x; arr[j + 1] = v.y; arr[j + 2] = v.z;
      }
    }
    geo.attributes.position!.needsUpdate = true;
  };
  update(0);
  return { mesh, update };
}
