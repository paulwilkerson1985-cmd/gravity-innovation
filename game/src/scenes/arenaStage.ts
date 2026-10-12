// The Arena's 3D set: a dusk stadium with stands, crowd, banners and light towers, plus
// confetti and a podium for the victory screen. Static props are merged (one draw call per
// group); the crowd is two meshes so alternate rows can bounce when it cheers.
import * as THREE from 'three';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { Rng } from '../engine/rng';
import { ambient } from '../render/movefx';

/** Player colours, by seat (engine side). */
export const SEAT_COLORS = ['#ff5d73', '#3d9bff'] as const;
export const SEAT_DARK = ['#b8304a', '#1f5fb8'] as const;

const SKY_TOP = '#2c1f78';
const SKY_BOTTOM = '#ffa27a';
const FLOOR = '#e9c37f';
const FLOOR_EDGE = '#c99657';
const WALL = '#3a2f6b';
const TRIM = '#ffcf3f';
const STAND = ['#5b4aa0', '#4b3d8a', '#3f3378'];
const CROWD = ['#ff5d73', '#3d9bff', '#ffcf3f', '#43d36b', '#ffffff', '#b98cff', '#ff9a3d', '#7ee0ff'];

export interface ArenaSet {
  update(t: number): void;
  /** Make the crowd jump for a moment. */
  cheer(seconds?: number): void;
  /** Recolour the two battle platforms (near, far). */
  platforms: [THREE.Mesh, THREE.Mesh];
}

function sky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(80, 16, 10);
  const top = new THREE.Color(SKY_TOP);
  const bottom = new THREE.Color(SKY_BOTTOM);
  const pos = geo.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, Math.min(1, pos.getY(i) / 40 + 0.1));
    c.copy(bottom).lerp(top, Math.pow(k, 0.8));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
  m.renderOrder = -1;
  return m;
}

/** A coloured battle platform with a white rim and a darker skirt. */
export function arenaPlatform(color: string, dark: string, radius: number): THREE.Mesh {
  const b = new MeshBuilder();
  b.add(GEO.disc, '#fff6e0', { p: [0, 0.07, 0], s: [radius * 1.04, 0.1, radius * 1.04] });
  b.add(GEO.disc, color, { p: [0, 0.1, 0], s: [radius * 0.9, 0.1, radius * 0.9] }, 0.06);
  b.add(GEO.disc, dark, { p: [0, -0.02, 0], s: [radius * 1.12, 0.14, radius * 1.12] });
  // Corner studs.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    b.add(GEO.oct, TRIM, { p: [Math.cos(a) * radius * 1.0, 0.16, Math.sin(a) * radius * 1.0], s: [0.09, 0.07, 0.09] });
  }
  return new THREE.Mesh(b.build(), flatMaterial());
}

function ring(b: MeshBuilder, radius: number, width: number, color: string, y: number) {
  const g = new THREE.TorusGeometry(radius, width, 2, 40);
  b.add(g, color, { p: [0, y, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.25] });
  g.dispose();
}

/**
 * Build the stadium into `scene`. `center` is the middle of the field; the stands wrap the
 * back and sides (−z), leaving the camera side open.
 */
export function buildArena(scene: THREE.Scene, opts: { nearColor: string; farColor: string; nearDark: string; farDark: string; spots: readonly [THREE.Vector3, THREE.Vector3] }): ArenaSet {
  scene.add(sky());
  scene.fog = new THREE.Fog('#b88ab8', 24, 60);
  scene.add(new THREE.HemisphereLight(0xffe9f2, 0x4a3a7a, 1.55));
  const sun = new THREE.DirectionalLight(0xffe0c0, 2.0);
  sun.position.set(5, 9, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9ab8ff, 0.7);
  rim.position.set(-6, 4, -8);
  scene.add(rim);

  const rng = new Rng(0xa2e7a);
  const b = new MeshBuilder();
  // Outer ground + field.
  b.add(GEO.disc, '#6a5aa8', { p: [0, -0.2, 0], s: [40, 0.2, 40] });
  b.add(GEO.disc, FLOOR_EDGE, { p: [0, -0.06, -0.3], s: [7.4, 0.14, 6.6] }, 0.04);
  b.add(GEO.disc, FLOOR, { p: [0, -0.02, -0.3], s: [7.0, 0.14, 6.2] }, 0.05);
  ring(b, 5.6, 0.07, '#fff6e0', 0.06);
  ring(b, 1.15, 0.07, '#fff6e0', 0.06);
  // Centre emblem: half coral, half blue — the two corners of the arena.
  const half = (color: string, rot: number) => {
    const g = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false, rot, Math.PI);
    b.add(g, color, { p: [0, 0.04, -0.3], s: [0.95, 0.06, 0.95] });
    g.dispose();
  };
  half(opts.nearColor, Math.PI * 0.25);
  half(opts.farColor, Math.PI * 1.25);
  b.add(GEO.disc, '#fff6e0', { p: [0, 0.07, -0.3], s: [0.32, 0.06, 0.32] });

  // Low wall with gold trim around the back 3/4 of the field.
  const wallR = 7.9;
  for (let i = 0; i < 30; i++) {
    const a = Math.PI * (0.88 + (i / 29) * 1.24);
    const x = Math.cos(a) * wallR;
    const z = Math.sin(a) * wallR * 0.9 - 0.6;
    b.add(GEO.box, WALL, { p: [x, 0.45, z], r: [0, -a + Math.PI / 2, 0], s: [1.75, 0.9, 0.35] }, 0.08);
    b.add(GEO.box, TRIM, { p: [x, 0.93, z], r: [0, -a + Math.PI / 2, 0], s: [1.8, 0.1, 0.42] });
    if (i % 3 === 1) {
      // Banner on the wall face.
      const c = i % 6 === 1 ? opts.nearColor : opts.farColor;
      const inward = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a)).multiplyScalar(0.2);
      b.add(GEO.box, c, { p: [x + inward.x, 0.5, z + inward.z], r: [0, -a + Math.PI / 2, 0], s: [1.1, 0.62, 0.05] });
      b.add(GEO.oct, '#fff6e0', { p: [x + inward.x * 1.4, 0.5, z + inward.z * 1.4], r: [0, -a + Math.PI / 2, 0], s: [0.16, 0.16, 0.04] });
    }
  }

  // Stands: three stepped tiers.
  const crowdA = new MeshBuilder();
  const crowdB = new MeshBuilder();
  for (let tier = 0; tier < 3; tier++) {
    const r = 9.1 + tier * 1.35;
    const y = 0.75 + tier * 0.95;
    const segs = 34 + tier * 4;
    for (let i = 0; i < segs; i++) {
      const a = Math.PI * (0.86 + (i / (segs - 1)) * 1.28);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.9 - 0.6;
      b.add(GEO.box, STAND[tier]!, { p: [x, y / 2, z], r: [0, -a + Math.PI / 2, 0], s: [1.95, y, 1.3] }, 0.06);
      // Spectators: a body and a head, in team colours and bright accents.
      const per = 2;
      for (let k = 0; k < per; k++) {
        if (rng.chance(0.12)) continue;
        const off = (k - (per - 1) / 2) * 0.8;
        const tx = x + Math.cos(a + Math.PI / 2) * off * 0.9;
        const tz = z + Math.sin(a + Math.PI / 2) * off * 0.9;
        const target = (i + k + tier) % 2 ? crowdA : crowdB;
        const col = rng.pick(CROWD);
        target.add(GEO.box, col, { p: [tx, y + 0.28, tz], r: [0, -a + Math.PI / 2, 0], s: [0.42, 0.5, 0.32] }, 0.1);
        target.add(GEO.rock, rng.pick(['#ffd9b8', '#c98c5a', '#f2b98a', '#8a5a3a', '#ffe0c8']), { p: [tx, y + 0.72, tz], s: 0.19 }, 0.1);
        if (rng.chance(0.18)) {
          // A waving flag.
          target.add(GEO.cyl, '#fff6e0', { p: [tx + 0.18, y + 0.9, tz], s: [0.02, 0.6, 0.02] });
          target.add(GEO.box, rng.chance(0.5) ? opts.nearColor : opts.farColor, { p: [tx + 0.36, y + 1.08, tz], s: [0.34, 0.22, 0.03] });
        }
      }
    }
  }

  // Light towers at the back corners.
  for (const sx of [-1, 1]) {
    const x = sx * 10.5;
    const z = -8.5;
    b.add(GEO.box, '#2a2250', { p: [x, 4, z], s: [0.35, 8, 0.35] });
    b.add(GEO.box, '#2a2250', { p: [x, 8.2, z], s: [2.4, 1.3, 0.4] });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) b.add(GEO.box, '#fff6c8', { p: [x - 0.75 + i * 0.75, 7.9 + j * 0.6, z + 0.22], s: [0.55, 0.42, 0.06] });
  }
  // Pennant poles along the top tier.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.95 + (i / 8) * 1.1);
    const x = Math.cos(a) * 12.4;
    const z = Math.sin(a) * 12.4 * 0.9 - 0.6;
    b.add(GEO.cyl, '#fff6e0', { p: [x, 4.2, z], s: [0.05, 3, 0.05] });
    b.add(GEO.cone4, i % 2 ? opts.farColor : opts.nearColor, { p: [x + 0.45, 5.3, z], r: [0, 0, -Math.PI / 2], s: [0.35, 0.9, 0.06] });
  }
  // Distant hills under the dusk sky.
  for (let i = 0; i < 9; i++) {
    const x = -36 + i * 9 + rng.next() * 3;
    const z = -30 - rng.next() * 8;
    const hgt = 6 + rng.next() * 7;
    b.add(GEO.cone5, rng.chance(0.5) ? '#4a3a8a' : '#5a4a9a', { p: [x, hgt / 2 - 1, z], r: [0, rng.next(), 0], s: [7, hgt, 7] }, 0.15);
  }
  scene.add(new THREE.Mesh(b.build(), flatMaterial()));

  const meshA = new THREE.Mesh(crowdA.build(), flatMaterial());
  const meshB = new THREE.Mesh(crowdB.build(), flatMaterial());
  scene.add(meshA, meshB);

  const p0 = arenaPlatform(opts.nearColor, opts.nearDark, 1.25);
  p0.position.copy(opts.spots[0]);
  const p1 = arenaPlatform(opts.farColor, opts.farDark, 1.18);
  p1.position.copy(opts.spots[1]);
  scene.add(p0, p1);

  const amb = ambient('title');
  scene.add(amb.points);

  let cheerUntil = 0;
  let now = 0;
  return {
    platforms: [p0, p1],
    cheer: (seconds = 2.2) => { cheerUntil = now + seconds; },
    update: (t: number) => {
      now = t;
      amb.update(t);
      const hype = t < cheerUntil ? 1 : 0.18;
      meshA.position.y = Math.max(0, Math.sin(t * 9)) * 0.16 * hype;
      meshB.position.y = Math.max(0, Math.sin(t * 9 + Math.PI)) * 0.16 * hype;
    },
  };
}

/** Frame a fixed battle camera on the two spots (same framing idea as the adventure battle). */
export function frameBattleCamera(cam: THREE.PerspectiveCamera, scene: THREE.Scene, w: number, h: number) {
  const aspect = w / h;
  cam.aspect = aspect;
  cam.fov = 38;
  const target = new THREE.Vector3(0.05, 0.6, -0.3);
  const halfWidth = aspect < 1 ? 2.75 : 3.7;
  const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const dist = Math.max(7.4, halfWidth / (tanV * aspect));
  if (scene.fog instanceof THREE.Fog) { scene.fog.near = dist + 14; scene.fog.far = dist + 46; }
  const dir = new THREE.Vector3(-0.28, 0.36, 1).normalize();
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  const shift = aspect < 1 ? 0.15 : 0.1;
  cam.setViewOffset(w, h, 0, h * shift, w, h);
  cam.updateProjectionMatrix();
}

/** Falling confetti: one instanced mesh (one draw call). */
export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly seeds: Float32Array;
  private readonly dummy = new THREE.Object3D();
  private t0 = -1;

  constructor(readonly count = 180, readonly area = { x: 7, z: 4, top: 7 }, colors: readonly string[] = ['#ff5d73', '#3d9bff', '#ffcf3f', '#43d36b', '#ffffff', '#b98cff']) {
    const geo = new THREE.PlaneGeometry(0.14, 0.08);
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.seeds = new Float32Array(count * 4);
    const rng = new Rng(0xc0ffee);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      this.seeds.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
      this.mesh.setColorAt(i, c.set(colors[i % colors.length]!));
    }
    this.update(0);
  }

  update(t: number) {
    if (this.t0 < 0) this.t0 = t;
    const e = t - this.t0;
    const { x: ax, z: az, top } = this.area;
    for (let i = 0; i < this.count; i++) {
      const [s0, s1, s2, s3] = [this.seeds[i * 4]!, this.seeds[i * 4 + 1]!, this.seeds[i * 4 + 2]!, this.seeds[i * 4 + 3]!];
      const fall = 0.8 + s2 * 0.9;
      const y = top - ((e * fall + s3 * top * 1.5) % (top + 1)) + 0.2;
      this.dummy.position.set((s0 - 0.5) * ax * 2 + Math.sin(e * 1.3 + s1 * 9) * 0.35, y, (s1 - 0.5) * az * 2 + Math.cos(e * 1.1 + s0 * 7) * 0.3);
      this.dummy.rotation.set(e * (2 + s0 * 4), e * (1.5 + s1 * 3), s2 * 6);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Three-step podium (centre highest) as one mesh. Returns the top-centre position of each step. */
export function podium(color: string): { mesh: THREE.Mesh; tops: [THREE.Vector3, THREE.Vector3, THREE.Vector3] } {
  const b = new MeshBuilder();
  const steps: [number, number, string][] = [[0, 1.05, '#ffcf3f'], [-1.75, 0.7, '#dfe6f2'], [1.75, 0.48, '#e39a5a']];
  const tops: THREE.Vector3[] = [];
  for (const [x, hgt, c] of steps) {
    b.add(GEO.box, c, { p: [x, hgt / 2, 0], s: [1.65, hgt, 1.5] }, 0.05);
    b.add(GEO.box, '#fff6e0', { p: [x, hgt + 0.03, 0], s: [1.72, 0.06, 1.56] });
    b.add(GEO.box, color, { p: [x, hgt * 0.5, 0.76], s: [1.2, hgt * 0.55, 0.04] });
    tops.push(new THREE.Vector3(x, hgt + 0.06, 0));
  }
  b.add(GEO.box, '#2a2250', { p: [0, 0.02, 0], s: [5.6, 0.05, 2.2] });
  return { mesh: new THREE.Mesh(b.build(), flatMaterial()), tops: tops as [THREE.Vector3, THREE.Vector3, THREE.Vector3] };
}
