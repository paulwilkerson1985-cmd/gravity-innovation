// HD-2D pixel water: one plane, one draw call, all animation in the fragment shader.
//
//  * Quantised to the texel grid (TEXEL) and to a 6–7 shade ramp with a 4×4 Bayer dither, so it
//    reads as animated pixel art, not a smooth shader.
//  * Depth tint from a shore-distance field (deep far from land, light and green-ish near it).
//  * Foam: rolling bands along the shore (distance field), ripple rings around given points
//    (stones, a kin standing in the shallows), sparse glints.
//  * Optional lighting from the arena's SpriteLight-like colours (no real light: cheap).
//
//   const w = pixelWater({ rect: { x0: -8, z0: 2, w: 16, d: 6 }, y: -0.05, land: (x, z) => z < 3 + Math.sin(x) * 0.4 });
//   group.add(w.mesh); update: w.update(t); dispose: w.dispose()
import * as THREE from 'three';
import { RAMPS, type Ramp } from '../textures';
import { TEXEL } from './units';

export interface WaterOptions {
  /** World rectangle covered by the water plane. */
  rect: { x0: number; z0: number; w: number; d: number };
  /** Surface height. */
  y?: number;
  /** Land test for the shore-distance field (foam + depth tint). Omit for open water. */
  land?: (x: number, z: number) => boolean;
  /** Distance-field cells per world unit (default 4) and the range it covers (units, default 3). */
  res?: number;
  range?: number;
  /** Ripple ring centres (x, z). Up to 8. */
  ripples?: [number, number][];
  ramp?: Ramp;
  foam?: Ramp;
  /** Overall brightness (match the arena's light), wave speed and foam width (units). */
  light?: number;
  speed?: number;
  foamWidth?: number;
  /** Flow direction of the surface pattern (units/s). */
  flow?: [number, number];
  /** Texel size in world units (default TEXEL; route maps use TEXEL / 2). */
  texel?: number;
}

const FRAG = /* glsl */ `
uniform float uTime, uLight, uSpeed, uFoamW, uRange, uTexel;
uniform vec3 uRamp[7];
uniform vec3 uFoam[4];
uniform sampler2D tDist;
uniform vec4 uRect;   // x0, z0, w, d
uniform vec2 uFlow;
uniform vec2 uRip[8];
uniform int uRipN;
uniform float uHasDist;
varying vec3 vW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float bayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i.y * 4 + i.x]) + 0.5) / 16.0;
}
void main() {
  // Snap to the texel grid: every computation happens per texel.
  vec2 tc = floor(vW.xz / uTexel);
  vec2 p = (tc + 0.5) * uTexel;
  float t = uTime * uSpeed;
  vec2 fp = p - uFlow * uTime;
  float n = noise(fp * 1.3 + vec2(t * 0.35, t * 0.2)) * 0.55 + noise(fp * 2.9 - vec2(t * 0.25, -t * 0.3)) * 0.3 + noise(fp * 6.0 + t * 0.5) * 0.15;
  // Shore distance (0 at the shore, 1 at uRange and beyond).
  float sd = 1.0;
  if (uHasDist > 0.5) {
    sd = texture2D(tDist, (p - uRect.xy) / uRect.zw).r;
    if (sd < 0.015) discard;   // land
  }
  float depth = smoothstep(0.0, 1.0, sd);
  // Ramp position: deep water dark, shallows light; waves move it ±1.2 shades.
  float v = mix(3.9, 1.3, depth) + (n - 0.5) * 2.2;
  int k = int(clamp(floor(v + bayer(tc)), 0.0, 6.0));
  vec3 col = uRamp[k];
  // Foam bands rolling in toward the shore.
  float fd = sd * uRange;
  float band = fract(fd / uFoamW * 0.5 - uTime * 0.25 * uSpeed + n * 0.35);
  float foam = 0.0;
  if (uHasDist > 0.5) {
    if (fd < uFoamW * 0.3 + (n - 0.5) * uFoamW * 0.35) foam = 2.0;            // the wet edge
    else if (fd < uFoamW * 1.8 && band < 0.07 + 0.05 * n && hash(tc) > 0.25) foam = 1.0;          // incoming lines
  }
  // Ripple rings.
  for (int i = 0; i < 8; i++) {
    if (i >= uRipN) break;
    float d = length(p - uRip[i]);
    float life = fract(uTime * 0.3 + float(i) * 0.37);
    float r = life * 0.9 + 0.15;
    // A 1-texel ring that breaks up as it widens and fades out.
    if (abs(d - r) < uTexel * 0.5 && hash(tc + float(i)) > life * 0.9) foam = max(foam, 0.75);
  }
  // Glints: a few bright texels on wave crests.
  if (n > 0.8 && hash(tc + floor(uTime * 2.0)) > 0.94) foam = max(foam, 1.0);
  if (foam > 1.5) col = uFoam[2 + int(step(0.5, n))];
  else if (foam > 0.9) col = uFoam[1 + int(step(0.6, n))];
  else if (foam > 0.5) col = mix(col, uFoam[0], 0.7);
  gl_FragColor = vec4(col * uLight, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/** Shore-distance field: 0 on land, ~0.03 at the shore → 1 at `range` units out. R8 DataTexture. */
export function shoreDistance(rect: WaterOptions['rect'], land: (x: number, z: number) => boolean, res = 4, range = 3): THREE.DataTexture {
  const nx = Math.max(2, Math.round(rect.w * res)), nz = Math.max(2, Math.round(rect.d * res));
  const INF = 1e9;
  const d = new Float32Array(nx * nz).fill(INF);
  const q: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (land(rect.x0 + (i + 0.5) / res, rect.z0 + (j + 0.5) / res)) { d[j * nx + i] = 0; q.push(j * nx + i); }
  }
  // Breadth-first (8-neighbour, Chebyshev-ish with diagonal 1.41) relaxations.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      let v = d[j * nx + i]!;
      for (const [a, b, c] of [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.41], [1, -1, 1.41]] as const) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < nx) v = Math.min(v, d[y * nx + x]! + c); }
      d[j * nx + i] = v;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      let v = d[j * nx + i]!;
      for (const [a, b, c] of [[1, 0, 1], [0, 1, 1], [1, 1, 1.41], [-1, 1, 1.41]] as const) { const x = i + a, y = j + b; if (x >= 0 && x < nx && y < nz) v = Math.min(v, d[y * nx + x]! + c); }
      d[j * nx + i] = v;
    }
  }
  const out = new Uint8Array(nx * nz);
  // 0 = land (the shader discards it); water starts at 8 so the shore stays foam, not a hole.
  for (let k = 0; k < out.length; k++) out[k] = d[k] === 0 ? 0 : Math.max(8, Math.round(Math.min(1, d[k]! / res / range) * 255));
  void q;
  const tex = new THREE.DataTexture(out, nx, nz, THREE.RedFormat, THREE.UnsignedByteType);
  // A data field, not a colour image (so not a pixelTexture): LINEAR, so the foam bands follow
  // the shore smoothly at texel precision (the shader quantises to the texel grid anyway)
  // instead of stair-stepping along the field's coarser cells.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function pixelWater(o: WaterOptions): { mesh: THREE.Mesh; material: THREE.ShaderMaterial; update(t: number): void; dispose(): void } {
  const r = o.rect;
  const ramp = o.ramp ?? RAMPS.water, foam = o.foam ?? RAMPS.foam;
  const lin = (h: string) => new THREE.Color(h);
  const pad = <T,>(a: T[], n: number) => { const out = a.slice(0, n); while (out.length < n) out.push(a[a.length - 1]!); return out; };
  const range = o.range ?? 3;
  const dist = o.land ? shoreDistance(r, o.land, o.res ?? 4, range) : null;
  const rip = pad((o.ripples ?? [[1e4, 1e4]]).map(([x, z]) => new THREE.Vector2(x, z)), 8);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 }, uTexel: { value: o.texel ?? TEXEL }, uLight: { value: o.light ?? 1 }, uSpeed: { value: o.speed ?? 1 }, uFoamW: { value: o.foamWidth ?? 0.35 }, uRange: { value: range },
      uRamp: { value: pad(ramp.map(lin), 7) }, uFoam: { value: pad(foam.map(lin), 4) },
      tDist: { value: dist }, uHasDist: { value: dist ? 1 : 0 },
      uRect: { value: new THREE.Vector4(r.x0, r.z0, r.w, r.d) },
      uFlow: { value: new THREE.Vector2(...(o.flow ?? [0.05, 0.02])) },
      uRip: { value: rip }, uRipN: { value: o.ripples?.length ?? 0 },
    },
  });
  const g = new THREE.PlaneGeometry(r.w, r.d);
  g.rotateX(-Math.PI / 2);
  g.translate(r.x0 + r.w / 2, o.y ?? 0, r.z0 + r.d / 2);
  const mesh = new THREE.Mesh(g, material);
  mesh.name = 'hd2d-water';
  mesh.receiveShadow = false;
  return {
    mesh, material,
    update(t) { material.uniforms.uTime!.value = t; },
    dispose() { g.dispose(); material.dispose(); dist?.dispose(); },
  };
}
