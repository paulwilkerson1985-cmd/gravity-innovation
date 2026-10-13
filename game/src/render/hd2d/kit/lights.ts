// HD-2D light-rig presets: one shadow-casting key, hemisphere fill, a weak front fill, a
// matching SpriteLight (so baked sprites agree with the set) and a matching post Grade.
//
//   const rig = lightRig(group, 'sunset', { quality, target: [0, 0, 0], extent: 12 });
//   … ArenaRig.key = rig.key; spriteLight = rig.spriteLight; ArenaDef.grade = () => presetGrade('sunset')
//
// Conventions (docs/HD2D.md "Light rig"): hemisphere ~1.5–1.8, front fill weak and shadowless,
// keys above 1.0 linear only on emissive things; colours lean warm in the light, cool/violet in
// the shadows (except moonlight, which inverts that: cool key, warm accents).
import * as THREE from 'three';
import { warmCaveGrade, type Grade, type Quality } from '../pipeline';
import type { SpriteLight } from '../sprite';

export type LightPreset = 'daylight' | 'sunset' | 'overcast' | 'moonlight' | 'cave';

interface PresetSpec {
  /** Key direction: elevation above the horizon and azimuth (0 = from behind the stage, −z; +π/2 = from +x). */
  elev: number; azim: number;
  key: string; keyI: number;
  sky: string; ground: string; hemiI: number;
  fill: string; fillI: number;
  /** Shadow softness (PCFSoft radius) and darkness hint. */
  soft: number;
  /** Suggested clear / fog colours for the ArenaDef. */
  background: string; fog: string;
  grade: Partial<Pick<Grade, 'saturation' | 'contrast' | 'splitAmount' | 'vignette' | 'exposure'>> & { gain: [number, number, number]; shadowTint: string; highTint: string };
}

export const LIGHT_PRESETS: Record<LightPreset, PresetSpec> = {
  daylight: {
    elev: 0.95, azim: -0.6, key: '#fff1d6', keyI: 2.6, sky: '#cfe4ff', ground: '#6a5a3a', hemiI: 1.6, fill: '#ffe2c0', fillI: 0.5, soft: 2,
    background: '#9cc8e8', fog: '#cfe3e0',
    grade: { gain: [1.02, 1.0, 0.97], shadowTint: '#2a3050', highTint: '#fff2cc', saturation: 1.02, contrast: 1.05, splitAmount: 0.1, vignette: 0.32 },
  },
  sunset: {
    elev: 0.32, azim: -1.1, key: '#ffb070', keyI: 2.8, sky: '#ffc8a0', ground: '#4a2a3a', hemiI: 1.5, fill: '#ff9a80', fillI: 0.55, soft: 3,
    background: '#f0a070', fog: '#e8a080',
    grade: { gain: [1.06, 0.98, 0.9], shadowTint: '#3a1f40', highTint: '#ffd090', saturation: 0.98, contrast: 1.07, splitAmount: 0.18, vignette: 0.42 },
  },
  overcast: {
    elev: 1.2, azim: 0.3, key: '#e4e8ec', keyI: 1.1, sky: '#d8e0e8', ground: '#5a5a58', hemiI: 2.0, fill: '#dfe4e8', fillI: 0.45, soft: 6,
    background: '#a8b4c0', fog: '#b8c2cc',
    grade: { gain: [0.99, 1.0, 1.02], shadowTint: '#2a3038', highTint: '#f0f2f0', saturation: 0.85, contrast: 1.03, splitAmount: 0.08, vignette: 0.36 },
  },
  moonlight: {
    elev: 0.8, azim: 0.7, key: '#9fb4ff', keyI: 1.6, sky: '#5a6aa8', ground: '#1a1830', hemiI: 1.3, fill: '#7080c0', fillI: 0.35, soft: 3,
    background: '#0c1024', fog: '#1a2040',
    grade: { gain: [0.94, 0.98, 1.08], shadowTint: '#141030', highTint: '#cfe0ff', saturation: 0.88, contrast: 1.08, splitAmount: 0.16, vignette: 0.5, exposure: 1.1 },
  },
  cave: {
    elev: 0.75, azim: -0.3, key: '#ffd7a0', keyI: 2.2, sky: '#ffd9b0', ground: '#3a2116', hemiI: 1.7, fill: '#ffb98a', fillI: 1.1, soft: 3,
    background: '#120a07', fog: '#2a160d',
    grade: { gain: [1.03, 1.0, 0.93], shadowTint: '#3a1f2e', highTint: '#ffe2a8', saturation: 0.92, contrast: 1.06, splitAmount: 0.14, vignette: 0.42 },
  },
};

/** A post Grade matching a preset (built on the cave grade's tilt/dither settings). */
export function presetGrade(p: LightPreset): Grade {
  const s = LIGHT_PRESETS[p].grade;
  const g = warmCaveGrade();
  g.gain.set(...s.gain);
  g.shadowTint = new THREE.Color(s.shadowTint);
  g.highTint = new THREE.Color(s.highTint);
  if (s.saturation !== undefined) g.saturation = s.saturation;
  if (s.contrast !== undefined) g.contrast = s.contrast;
  if (s.splitAmount !== undefined) g.splitAmount = s.splitAmount;
  if (s.vignette !== undefined) g.vignette = s.vignette;
  if (s.exposure !== undefined) g.exposure = s.exposure;
  return g;
}

export interface LightRigOptions {
  quality?: Quality;
  /** What the key aims at (stage centre) and the half-size of the shadowed area. */
  target?: [number, number, number];
  extent?: number;
  /** Override the key direction (elevation / azimuth, radians). */
  elev?: number; azim?: number;
  /** Multiply key / hemisphere intensity. */
  keyK?: number; hemiK?: number;
  /** A cookie (dapple, window panes, clouds) turns the key into a far SpotLight with `map`. */
  cookie?: THREE.Texture;
  /** Cast shadows (default true). */
  shadows?: boolean;
}

export interface LightRig {
  key: THREE.DirectionalLight | THREE.SpotLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  spriteLight: SpriteLight;
  background: THREE.Color;
  fog: THREE.Color;
  dispose(): void;
}

/** Add a preset light rig to `group` (key + target, hemisphere, fill). */
export function lightRig(group: THREE.Group, preset: LightPreset, o: LightRigOptions = {}): LightRig {
  const p = LIGHT_PRESETS[preset];
  const q = o.quality ?? 'high';
  const target = new THREE.Vector3(...(o.target ?? [0, 0, 0]));
  const extent = o.extent ?? 12;
  const elev = o.elev ?? p.elev, azim = o.azim ?? p.azim;
  const dir = new THREE.Vector3(Math.sin(azim) * Math.cos(elev), Math.sin(elev), -Math.cos(azim) * Math.cos(elev));
  const keyColor = new THREE.Color(p.key);
  const dist = extent * 2.5;
  let key: THREE.DirectionalLight | THREE.SpotLight;
  if (o.cookie) {
    const spot = new THREE.SpotLight(keyColor, p.keyI * (o.keyK ?? 1), 0, Math.atan(extent * 1.25 / dist), 0.35, 0);
    spot.map = o.cookie;
    spot.shadow.camera.near = dist * 0.5;
    spot.shadow.camera.far = dist * 1.6;
    key = spot;
  } else {
    const d = new THREE.DirectionalLight(keyColor, p.keyI * (o.keyK ?? 1));
    const cam = d.shadow.camera;
    cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
    cam.near = 0.5; cam.far = dist * 2;
    key = d;
  }
  key.position.copy(target).addScaledVector(dir, dist);
  key.target.position.copy(target);
  key.castShadow = o.shadows ?? true;
  key.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = p.soft;
  const hemi = new THREE.HemisphereLight(new THREE.Color(p.sky), new THREE.Color(p.ground), p.hemiI * (o.hemiK ?? 1));
  const fill = new THREE.DirectionalLight(new THREE.Color(p.fill), p.fillI);
  fill.position.copy(target).add(new THREE.Vector3(3, 6, 10));
  fill.target.position.copy(target);
  group.add(key, key.target, hemi, fill, fill.target);
  const spriteLight: SpriteLight = {
    keyDir: dir.clone(),
    keyColor: keyColor.clone().multiplyScalar(0.62 * Math.min(1.3, p.keyI / 2.2)),
    sky: new THREE.Color(p.sky).multiplyScalar(0.62 * Math.min(1.2, p.hemiI / 1.7)),
    ground: new THREE.Color(p.ground).multiplyScalar(0.62),
    rim: keyColor.clone().multiplyScalar(0.55),
  };
  return {
    key, hemi, fill, spriteLight,
    background: new THREE.Color(p.background), fog: new THREE.Color(p.fog),
    dispose() { key.dispose(); hemi.dispose(); fill.dispose(); },
  };
}
