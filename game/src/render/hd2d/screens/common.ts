// Shared pieces of the HD-2D non-battle screens (title, starter, route maps, menu screens):
// the `ScreenSet` contract a set builder returns to the screen stage (scenes/hd2dScreen.ts),
// sprite options for kin and people (same texel densities as the battle sprites, so a kin looks
// like the same pixel sprite everywhere), pixel cloud billboards and a posterised sky backdrop.
//
// Only imports the stable HD-2D modules (pipeline, sprite, characters, arena, textures,
// outdoorKit) so the screens do not depend on battle-stage internals.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { getDex } from '../../../engine/dex';
import type { CreatureView } from '../../creature';
import type { Grade } from '../pipeline';
import type { SpriteLight, SpriteOptions } from '../sprite';
import type { Figure } from '../characters';
import { TEXEL, type Face4, type VoxelBatch } from '../arena';
import type { Ramp } from '../textures';
import { RgbaTile, SpriteAtlas, bandIndex, crispTexture, paintSky, type SpriteCanvas } from '../arenas/outdoorKit';

/** What a screen set builder hands the screen stage. */
export interface ScreenSet {
  group: THREE.Group;
  spriteLight: SpriteLight;
  grade: Grade;
  background: THREE.ColorRepresentation;
  /** Distance fog (world units from the camera), or null. */
  fog: { color: THREE.ColorRepresentation; near: number; far: number } | null;
  update(t: number): void;
  setPixelSize(px: number): void;
  /** Called after the scene framed its camera (backdrops that face the camera re-aim here); `buffer` = internal px. */
  frame?(camera: THREE.PerspectiveCamera, buffer: THREE.Vector2): void;
  dispose(): void;
}

// ------------------------------------------------------------------ sprite options

/** Sprite texel heights: people, then kin by evolution stage (same as the battle stage). */
export const SCREEN_TEXELS = { person: 44, kin: [28, 28, 34, 40] } as const;

/** Evolution stage of a species: 1 (base), 2, 3; single-stage species count as 2. */
export function kinStage(id: string | undefined): 1 | 2 | 3 {
  if (!id) return 1;
  const all = [...getDex().species.values()];
  let stage = 1, cur = id;
  for (let i = 0; i < 3; i++) {
    const pre = all.find((s) => s.evolvesTo?.species === cur);
    if (!pre) break;
    stage++;
    cur = pre.id;
  }
  if (stage === 1 && !getDex().species.get(id)?.evolvesTo) stage = 2;
  return Math.min(3, stage) as 1 | 2 | 3;
}

/** Flat kin (rays, moths) bake from more of the camera's elevation (as in battle). */
const BAKE_PITCH: Record<string, number> = { surgeray: 0.8, stormoth: 0.5, cyclonyx: 0.45, cragmaul: 0.3 };

/** Rest height (world) of a kin, for the sprite texel density. */
export function kinHeight(view: CreatureView): number {
  const bb = view.mesh.geometry.boundingBox;
  return bb ? (bb.max.y - bb.min.y) * view.baseScale * view.root.scale.y : 1;
}

/** Sprite options for a kin on a screen (same density, outline and palette as in battle). */
export function screenKinOptions(view: CreatureView, extra: SpriteOptions = {}): SpriteOptions {
  // Idle bobs of a few hundredths of a unit would never move a texel: exaggerate them.
  view.idleGain = 1.8;
  return {
    rig: view.uniforms, emissiveFrom: view.material, ground: view.root,
    texelHeight: SCREEN_TEXELS.kin[kinStage(view.speciesId)],
    nominalHeight: () => kinHeight(view),
    bakePitch: view.speciesId ? BAKE_PITCH[view.speciesId] : undefined,
    live: () => view.animating,
    hidden: () => view.blinkOff,
    ...extra,
  };
}

/** Sprite options for a person figure. */
export function screenFigureOptions(f: Figure, extra: SpriteOptions = {}): SpriteOptions {
  return { rig: f.uniforms, texelHeight: SCREEN_TEXELS.person, nominalHeight: () => f.height * f.mesh.scale.x, live: () => f.walking, ...extra };
}

// ------------------------------------------------------------------ pixel clouds

/** Cloud ramps, dark (underside) → light (sunlit top), hue-shifted. */
export const CLOUD_RAMPS = {
  day: ['#8f9cc8', '#a9b6dc', '#c3cdea', '#dbe2f3', '#eef1f8', '#ffffff'],
  sunset: ['#8a5a86', '#b0708e', '#d48f94', '#eeb09a', '#fbd0a8', '#fff0cc'],
  dusk: ['#3a3466', '#544a86', '#7564a2', '#9a86bc', '#c2b2d8', '#e6dcf0'],
  warm: ['#a88a8a', '#c4a49a', '#dcbca8', '#eed6bc', '#f8e8d2', '#fff8ea'],
} as const satisfies Record<string, Ramp>;

/**
 * Paint a cumulus puff into an atlas slot: a union of round lobes (bigger in the middle), lit
 * from the upper left, posterised into the ramp's bands with a flat, darker underside, and a
 * 1-texel shade rim along the bottom. Pixel-art cloud, not a soft blob.
 */
export function paintCloud(p: SpriteCanvas, rng: Rng, ramp: Ramp, o: { lobes?: number; flat?: number } = {}) {
  const { w, h } = p;
  const n = o.lobes ?? 5;
  const lobes: [number, number, number][] = [];
  const base = h * (o.flat ?? 0.78);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const r = (0.2 + 0.32 * Math.sin(t * Math.PI) + rng.next() * 0.08) * Math.min(w * 0.42, h * 0.95);
    lobes.push([w * (0.12 + t * 0.76) + (rng.next() - 0.5) * w * 0.06, base - r * (0.55 + rng.next() * 0.3), r]);
  }
  const N = ramp.length;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y > base) continue;
    let best = -1, lit = 0;
    for (const [cx, cy, r] of lobes) {
      const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d <= 1) {
        const k = 1 - d;
        if (k > best) { best = k; lit = -dx * 0.55 - dy * 0.8 + 0.25; }
      }
    }
    if (best < 0) continue;
    // Underside: the last rows above the flat base sink into the shade bands.
    const under = THREE.MathUtils.smoothstep(y, base - h * 0.28, base);
    const v = (N - 1) * THREE.MathUtils.clamp(0.55 + lit * 0.45 - under * 0.55, 0, 1);
    p.set(x, y, ramp[bandIndex(v, x, y, N, 0.12)]!);
  }
  // 1-texel shade rim along the underside.
  for (let x = 0; x < w; x++) for (let y = h - 1; y >= 0; y--) if (p.has(x, y)) { p.set(x, y, ramp[0]!); break; }
}

const CLOUD_VERT = /* glsl */ `
attribute vec2 aOff;
attribute float aSpeed;
attribute float aTexel;
uniform float uTime;
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
  // Slow drift along x, in whole cloud texels (sprite frames, not smooth motion).
  float dx = floor(uTime * aSpeed / aTexel + 0.5) * aTexel;
  p.x += dx;
  p += camR * aOff.x + camU * aOff.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const CLOUD_FRAG = /* glsl */ `
uniform sampler2D map;
uniform float uGain;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb * uGain, 1.0);
  #include <colorspace_fragment>
}`;

/** A cloud: where it floats, world units per cloud texel ÷ TEXEL, drift speed (units/s), sprite variant. */
export interface CloudSpec { at: [number, number, number]; scale: number; speed?: number; kind?: number; flip?: boolean }

/**
 * Pixel cloud billboards (spherical, camera-facing), unlit, one draw call. Each cloud texel is
 * `scale` × TEXEL world units; clouds drift along x in whole texels.
 */
export function cloudBillboards(specs: CloudSpec[], ramp: Ramp, seed: number, o: { gain?: number } = {}): { mesh: THREE.Mesh; update(t: number): void; dispose(): void } {
  const atlas = new SpriteAtlas(512);
  const rng = new Rng(seed);
  const sizes: [number, number][] = [[150, 44], [118, 38], [180, 52], [90, 30]];
  sizes.forEach(([w, h], i) => atlas.add(`c${i}`, w, h, (p) => paintCloud(p, rng, ramp, { lobes: 4 + i })));
  const tex = atlas.texture();
  const pos: number[] = [], off: number[] = [], uv: number[] = [], spd: number[] = [], tx: number[] = [], idx: number[] = [];
  const S = atlas.size;
  for (const c of specs) {
    const r = atlas.get(`c${(c.kind ?? 0) % sizes.length}`);
    const k = TEXEL * c.scale;
    const w = r.w * k, h = r.h * k;
    const u0 = r.x / S, u1 = (r.x + r.w) / S, v0 = 1 - (r.y + r.h) / S, v1 = 1 - r.y / S;
    const uvs = c.flip ? [[u1, v0], [u0, v0], [u0, v1], [u1, v1]] : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const base = pos.length / 3;
    ([[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]] as const).forEach(([cx, cy], i) => {
      pos.push(...c.at);
      off.push(cx * w, cy * h);
      uv.push(uvs[i]![0]!, uvs[i]![1]!);
      spd.push(c.speed ?? 0.04);
      tx.push(k);
    });
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aSpeed', new THREE.Float32BufferAttribute(spd, 1));
  g.setAttribute('aTexel', new THREE.Float32BufferAttribute(tx, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, uTime: { value: 0 }, uGain: { value: o.gain ?? 1 } },
    vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'hd2d-clouds';
  return {
    mesh,
    update: (t) => { m.uniforms.uTime!.value = t; },
    dispose: () => { g.dispose(); m.dispose(); tex.dispose(); },
  };
}

// ------------------------------------------------------------------ sky backdrop

/** A posterised sky with layered cloud banks (painted to the screen, ~2 internal px per texel). */
export interface SkySpec {
  /** Sky bands, top → bottom (dark → light). */
  sky: Ramp;
  /** Cloud-bank ramps (dark underside → lit top) from the far (upper) bank to the near one. */
  banks: Ramp[];
  /** Fraction of the height where the far bank's tops sit, and where the nearest bank's do. */
  bankTop?: number;
  bankBottom?: number;
  seed: number;
}

/**
 * Paint a sky: flat bands of `sky` (stepped dither at the band edges only), then rows of
 * cumulus banks. Each bank is a silhouette of overlapping round puffs, shaded by depth below
 * its top contour (a lit rim, then flat bands darkening downward), with the inner puff
 * outlines drawn as a shade line plus a lit line under it — the hand-painted pixel-cloud look.
 */
export function paintSkyBanks(t: RgbaTile, s: SkySpec) {
  const rng = new Rng(s.seed);
  paintSky(t, s.sky, 0, t.h);
  const n = s.banks.length;
  const top0 = t.h * (s.bankTop ?? 0.42), top1 = t.h * (s.bankBottom ?? 0.72);
  const scale = t.h / 180;
  for (let b = 0; b < n; b++) {
    const ramp = s.banks[b]!;
    const N = ramp.length;
    const base = n > 1 ? top0 + ((top1 - top0) * b) / (n - 1) : top0;
    const lobeR = (7 + b * 5) * scale;
    const lobes: [number, number, number][] = [];
    for (let x = -lobeR * 2; x < t.w + lobeR * 2;) {
      const r = lobeR * (0.6 + rng.next() * 0.8);
      lobes.push([x, base + r * (0.35 + rng.next() * 0.5), r]);
      x += r * (0.8 + rng.next() * 0.7);
    }
    // Top contour of the bank: the highest arc over each column.
    const arcY = (l: [number, number, number], x: number) => { const dx = x + 0.5 - l[0]; return Math.abs(dx) >= l[2] ? Infinity : l[1] - Math.sqrt(l[2] * l[2] - dx * dx); };
    for (let x = 0; x < t.w; x++) {
      let topY = Infinity;
      for (const l of lobes) topY = Math.min(topY, arcY(l, x));
      if (!Number.isFinite(topY)) topY = base + lobeR;
      const y0 = Math.max(0, Math.floor(topY));
      for (let y = y0; y < t.h; y++) {
        const depth = (y - topY) / scale;
        // Lit rim, then bands darkening with depth below the contour (far banks stay lighter).
        let v = depth < 1.5 ? N - 1 : depth < 4 ? N - 1.6 : (N - 2.2) - Math.min(N - 2.5, (depth - 4) * (0.09 + b * 0.02));
        // Inner puff outlines: where a lower puff's arc crosses this column below the top.
        for (const l of lobes) {
          const ay = arcY(l, x);
          if (!Number.isFinite(ay) || ay - topY < 3 * scale) continue;
          const d = y - ay;
          if (d >= -0.5 && d < 1 * scale) v = Math.min(v, N - 3.2 - b * 0.2);
          else if (d >= 1 * scale && d < 3 * scale) v = Math.max(v, N - 1.6);
        }
        t.set(x, y, ramp[bandIndex(v, x, y, N, 0.1)]!);
      }
    }
  }
}

/**
 * A big unlit painted plane that exactly covers the camera's visible frustum (view offset
 * included) from far behind the set, re-painted at ~2 internal px per texel whenever the
 * frame's shape changes: a sky that is part of the pixel image (no CSS gradient).
 */
export function skyBackdrop(spec: SkySpec): { mesh: THREE.Mesh; aim(camera: THREE.PerspectiveCamera, target: THREE.Vector3, behind: number, buffer: THREE.Vector2): void; dispose(): void } {
  const m = new THREE.MeshBasicMaterial({ fog: false, depthWrite: false });
  const g = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = -20;
  mesh.frustumCulled = false;
  mesh.name = 'hd2d-sky';
  let tex: THREE.CanvasTexture | null = null;
  let size = '';
  const inv = new THREE.Matrix4();
  return {
    mesh,
    aim(camera, target, behind, buffer) {
      camera.updateMatrixWorld();
      camera.updateProjectionMatrix();
      const dist = camera.position.distanceTo(target) + behind;
      // Visible rectangle on the plane z = -dist (view space), from the NDC corners.
      inv.copy(camera.projectionMatrixInverse);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const v = new THREE.Vector3(nx, ny, 0.5).applyMatrix4(inv);
        const k = dist / -v.z;
        x0 = Math.min(x0, v.x * k); x1 = Math.max(x1, v.x * k); y0 = Math.min(y0, v.y * k); y1 = Math.max(y1, v.y * k);
      }
      const pad = 1.04;
      const w = (x1 - x0) * pad, h = (y1 - y0) * pad;
      const centre = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, -dist).applyMatrix4(camera.matrixWorld);
      mesh.position.copy(centre);
      mesh.quaternion.copy(camera.quaternion);
      mesh.scale.set(w, h, 1);
      // Texels ≈ 2 internal px, square.
      const th = Math.max(90, Math.round((buffer.y * pad) / 2)), tw = Math.max(90, Math.round(th * (w / h)));
      const key = `${tw}x${th}`;
      if (key !== size) {
        size = key;
        const t = new RgbaTile(tw, th);
        paintSkyBanks(t, spec);
        tex?.dispose();
        tex = crispTexture(t.toCanvas());
        m.map = tex;
        m.needsUpdate = true;
      }
    },
    dispose() { g.dispose(); m.dispose(); tex?.dispose(); },
  };
}

// ------------------------------------------------------------------ small helpers

/**
 * An octagonal prism slab into a VoxelBatch: 8 side quads (a flat face toward +z) with AO at
 * the foot and a texture-mapped top fan, world UVs at TEXEL density.
 */
export function octSlab(b: VoxelBatch, y0: number, y1: number, r: number, tint: THREE.Color, topK = 1.18, ao = 0.6, at: [number, number] = [0, 0]) {
  const t = 1 / (TEXEL * b.tileTexels);
  const pts: [number, number][] = [];
  for (let i = 0; i < 8; i++) { const a = Math.PI / 2 + Math.PI / 8 + (i * Math.PI) / 4; pts.push([at[0] + Math.cos(a) * r, at[1] + Math.sin(a) * r]); }
  let u = 0;
  for (let i = 0; i < 8; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[(i + 1) % 8]!;
    const len = Math.hypot(bx - ax, bz - az);
    const nx = (az - bz) / len, nz = (bx - ax) / len;
    // CCW seen from outside: (b → a) along the foot, since the points run CCW from above.
    b.quad([bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [-nx, 0, -nz], [[u, 0], [u + len * t, 0], [u + len * t, (y1 - y0) * t], [u, (y1 - y0) * t]], tint, [ao, ao, 1, 1]);
    u += len * t;
  }
  const top = tint.clone().multiplyScalar(topK);
  const flat: Face4 = [0, 0, -1, 1];
  for (let i = 0; i < 8; i++) {
    const [ax, az] = pts[i]!, [bx, bz] = pts[(i + 1) % 8]!;
    b.tri([[at[0], y1, at[1]], [bx, y1, bz], [ax, y1, az]], [0, 1, 0], [[0.5 + at[0] * t, 0.5 + at[1] * t], [0.5 + bx * t, 0.5 + bz * t], [0.5 + ax * t, 0.5 + az * t]], [top, top, top], [flat, flat, flat]);
  }
}


/** Simple deterministic 2D value noise (0..1) on a lattice of `cell` world units. */
export function valueNoise(seed: number, cell: number): (x: number, z: number) => number {
  const h = (i: number, j: number) => { const s = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  return (x, z) => {
    const fx = x / cell, fz = z / cell;
    const i = Math.floor(fx), j = Math.floor(fz);
    const u = fx - i, v = fz - j;
    const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(h(i, j), h(i + 1, j), su), THREE.MathUtils.lerp(h(i, j + 1), h(i + 1, j + 1), su), sv);
  };
}

/** A soft round additive glow texture (pixel rings), for pools and halos. */
export function ringGlow(size = 32): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
    // Four stepped rings, like a hand-dithered pixel glow.
    const a = d > 1 ? 0 : d > 0.85 ? 0.22 : d > 0.65 ? 0.45 : d > 0.4 ? 0.72 : 1;
    img.data.set([255, 255, 255, Math.round(a * 255)], (y * size + x) * 4);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
}
