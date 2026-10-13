// HD-2D particle presets: one THREE.Points per system, all motion in the vertex shader (no
// per-frame CPU work), square pixel points (1–3 px, no textures — the pixel-art way).
//
//   const pollen = particleSystem('pollen', { min: [-6, 0.2, -4], max: [6, 2.5, 4], count: 60 }, rng);
//   group.add(pollen.points); update(t) → pollen.update(t); setPixelSize(px) → pollen.setPixelSize(px)
//
// Presets: pollen (drifting golden specks), embers (rising, flickering, additive), steam (slow
// rising pale puffs, alpha), spray (sea spray arcs, additive white), snow (falling, swaying),
// dust (cave motes), rain (fast streaks of 1 px), fireflies (blinking, additive).
import * as THREE from 'three';
import type { Rng } from '../../../engine/rng';

export type ParticlePreset = 'pollen' | 'embers' | 'steam' | 'spray' | 'snow' | 'dust' | 'rain' | 'fireflies';

interface Spec {
  /** Velocity (units/s) and per-particle random spread of it. */
  vel: [number, number, number]; spread: [number, number, number];
  /** Gravity (units/s², +y up). */
  grav: number;
  /** Sideways wobble amplitude (units) and frequency (rad/s). */
  wobble: number; freq: number;
  /** Lifetime (s): particles respawn at their origin each cycle. */
  life: number;
  /** Size in pixels (× setPixelSize) and colours at birth → death (sRGB). */
  size: number; from: string; to: string;
  /** HDR gain (> 1 blooms), additive or alpha, twinkle amount (0..1). */
  gain: number; additive: boolean; alpha: number; twinkle: number;
}

export const PARTICLE_PRESETS: Record<ParticlePreset, Spec> = {
  pollen: { vel: [0.12, 0.04, 0.05], spread: [0.1, 0.06, 0.1], grav: 0, wobble: 0.25, freq: 0.9, life: 9, size: 1, from: '#fff2a0', to: '#ffd860', gain: 1.25, additive: true, alpha: 1, twinkle: 0.5 },
  embers: { vel: [0.05, 0.75, 0.0], spread: [0.25, 0.35, 0.25], grav: -0.05, wobble: 0.18, freq: 2.6, life: 3.2, size: 1, from: '#ffd060', to: '#ff4a14', gain: 2.4, additive: true, alpha: 1, twinkle: 0.8 },
  steam: { vel: [0.08, 0.45, 0.0], spread: [0.1, 0.15, 0.1], grav: 0, wobble: 0.3, freq: 0.8, life: 4.5, size: 3, from: '#f4f4f0', to: '#c8ccd0', gain: 1, additive: false, alpha: 0.35, twinkle: 0 },
  spray: { vel: [0.6, 2.0, 0.2], spread: [0.5, 0.6, 0.4], grav: -4.5, wobble: 0.05, freq: 3, life: 1.1, size: 2, from: '#ffffff', to: '#cfe8f4', gain: 1.4, additive: true, alpha: 1, twinkle: 0.2 },
  snow: { vel: [0.15, -0.55, 0.05], spread: [0.1, 0.15, 0.1], grav: 0, wobble: 0.3, freq: 1.3, life: 8, size: 1, from: '#ffffff', to: '#dfe8ff', gain: 1.1, additive: false, alpha: 0.95, twinkle: 0.15 },
  dust: { vel: [0.04, 0.02, 0.0], spread: [0.05, 0.04, 0.05], grav: 0, wobble: 0.15, freq: 0.6, life: 12, size: 1, from: '#fff0c8', to: '#ffe0a0', gain: 1.1, additive: true, alpha: 1, twinkle: 0.6 },
  rain: { vel: [0.4, -9, 0.1], spread: [0.05, 1, 0.05], grav: 0, wobble: 0, freq: 0, life: 0.7, size: 1, from: '#b8c8e0', to: '#90a8c8', gain: 1, additive: false, alpha: 0.6, twinkle: 0 },
  fireflies: { vel: [0, 0.02, 0], spread: [0.08, 0.08, 0.08], grav: 0, wobble: 0.4, freq: 0.7, life: 10, size: 2, from: '#e8ff80', to: '#b0f060', gain: 2.2, additive: true, alpha: 1, twinkle: 1 },
};

const VERT = /* glsl */ `
attribute vec4 aRnd;     // 3 spawn fractions in the box + phase
attribute vec3 aVel;
uniform float uTime, uLife, uGrav, uWobble, uFreq, uSize, uTwinkle;
uniform vec3 uMin, uMax;
varying float vT;
varying float vA;
void main() {
  float age = fract(uTime / uLife + aRnd.w);
  float t = age * uLife;
  vec3 p = mix(uMin, uMax, aRnd.xyz) + aVel * t;
  p.y += 0.5 * uGrav * t * t;
  float ph = aRnd.w * 40.0;
  p.x += sin(uTime * uFreq + ph) * uWobble;
  p.z += cos(uTime * uFreq * 0.8 + ph * 1.3) * uWobble * 0.6;
  vT = age;
  float fade = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.75, 1.0, age));
  vA = fade * (1.0 - uTwinkle + uTwinkle * (0.5 + 0.5 * sin(uTime * 3.0 + ph)));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize;
}`;

const FRAG = /* glsl */ `
uniform vec3 uFrom, uTo;
uniform float uAlpha, uAdditive;
varying float vT;
varying float vA;
void main() {
  vec3 c = mix(uFrom, uTo, vT);
  if (uAdditive > 0.5) gl_FragColor = vec4(c * vA, 1.0);
  else {
    float a = vA * uAlpha;
    if (a < 0.02) discard;
    gl_FragColor = vec4(c, a);
  }
}`;

export interface ParticleOptions {
  /** Spawn box (world). */
  min: [number, number, number];
  max: [number, number, number];
  count: number;
  /** Override preset fields (colours, speed…). */
  override?: Partial<Spec>;
}

export interface ParticleSystem {
  points: THREE.Points;
  update(t: number): void;
  /** Call from ArenaRig.setPixelSize: base point size in device px per internal px. */
  setPixelSize(px: number): void;
  dispose(): void;
}

/** One preset particle system (one draw call). Deterministic from `rng`. */
export function particleSystem(preset: ParticlePreset, o: ParticleOptions, rng: Rng): ParticleSystem {
  const s = { ...PARTICLE_PRESETS[preset], ...o.override };
  const rnd: number[] = [], vel: number[] = [], pos: number[] = [];
  for (let i = 0; i < o.count; i++) {
    rnd.push(rng.next(), rng.next(), rng.next(), rng.next());
    vel.push(s.vel[0] + (rng.next() - 0.5) * 2 * s.spread[0], s.vel[1] + (rng.next() - 0.5) * 2 * s.spread[1], s.vel[2] + (rng.next() - 0.5) * 2 * s.spread[2]);
    pos.push(0, 0, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRnd', new THREE.Float32BufferAttribute(rnd, 4));
  g.setAttribute('aVel', new THREE.Float32BufferAttribute(vel, 3));
  const lin = (hex: string) => new THREE.Color(hex).multiplyScalar(s.gain);
  const m = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 }, uLife: { value: s.life }, uGrav: { value: s.grav }, uWobble: { value: s.wobble }, uFreq: { value: s.freq },
      uSize: { value: s.size }, uTwinkle: { value: s.twinkle },
      uMin: { value: new THREE.Vector3(...o.min) }, uMax: { value: new THREE.Vector3(...o.max) },
      uFrom: { value: lin(s.from) }, uTo: { value: lin(s.to) }, uAlpha: { value: s.alpha }, uAdditive: { value: s.additive ? 1 : 0 },
    },
    transparent: true, depthWrite: false, blending: s.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(g, m);
  points.frustumCulled = false;
  points.renderOrder = 6;
  points.name = `hd2d-particles-${preset}`;
  return {
    points,
    update(t) { m.uniforms.uTime!.value = t; },
    setPixelSize(px) { m.uniforms.uSize!.value = Math.max(1, Math.round(s.size * px)); },
    dispose() { g.dispose(); m.dispose(); },
  };
}
