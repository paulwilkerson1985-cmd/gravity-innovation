// Shared, persistent materials and shader pre-warming.
//
// three.js links one GL program per distinct material "shape" (type, vertex colours, side,
// fog, light counts …) and frees it when the last material using it is disposed. Creating and
// disposing FX/scene materials therefore re-linked programs mid-battle (100–370 ms stalls on
// software GL). Here:
//  * `persistent` materials are never disposed (their `dispose` is a no-op and disposeTree
//    skips them), so the programs they hold stay linked for the whole session;
//  * FX materials come from small pools (opacity is per effect, so each running effect gets
//    its own instance — all instances share one program);
//  * `warmPrograms()` compiles one holder of every common material shape against a scene's
//    lights/fog, so even the first attack of the session doesn't link anything.
import * as THREE from 'three';

type Disposable = { userData: Record<string, unknown>; dispose: () => void };

/** Mark a material/geometry as session-lived: disposeTree skips it and dispose() becomes a no-op. */
export function markPersistent<T extends Disposable>(o: T): T {
  o.userData.persistent = true;
  o.dispose = () => {};
  return o;
}

export function isPersistent(o: { userData?: Record<string, unknown> } | null | undefined): boolean {
  return o?.userData?.persistent === true;
}

let flat: THREE.MeshLambertMaterial | null = null;

/**
 * The shared flat-shaded, vertex-coloured Lambert material used by every static prop mesh.
 * It is shared and persistent — don't mutate it; build your own if you need a tint/emissive
 * (same parameters ⇒ same GL program, so that costs no link).
 */
export function flatMaterial(): THREE.MeshLambertMaterial {
  if (!flat) flat = markPersistent(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  return flat;
}

/** A fresh (non-shared) flat Lambert — for meshes that animate emissive/colour. Same program as flatMaterial(). */
export function flatMaterialInstance(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

// ------------------------------------------------------------------ FX pools

export type FxBlend = 'normal' | 'add';

const fxPool: Record<FxBlend, THREE.MeshBasicMaterial[]> = { normal: [], add: [] };
const ptsPool: THREE.PointsMaterial[] = [];

function newFx(blend: FxBlend): THREE.MeshBasicMaterial {
  const m = markPersistent(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, fog: false,
    blending: blend === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  m.userData.fxBlend = blend;
  return m;
}

/** Take an unlit vertex-coloured FX material from the pool (opacity 1). Return it with releaseFx(). */
export function acquireFx(blend: FxBlend = 'normal'): THREE.MeshBasicMaterial {
  const m = fxPool[blend].pop() ?? newFx(blend);
  m.opacity = 1;
  m.color.setRGB(1, 1, 1);
  return m;
}

export function releaseFx(m: THREE.Material) {
  const blend = m.userData.fxBlend as FxBlend | undefined;
  if (blend && m instanceof THREE.MeshBasicMaterial && !fxPool[blend].includes(m)) fxPool[blend].push(m);
  else if (m.userData.fxPoints && m instanceof THREE.PointsMaterial && !ptsPool.includes(m)) ptsPool.push(m);
}

function newPts(): THREE.PointsMaterial {
  const m = markPersistent(new THREE.PointsMaterial({
    size: 0.1, vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
  }));
  m.userData.fxPoints = true;
  return m;
}

/** Additive vertex-coloured points material from the pool. Return it with releaseFx(). */
export function acquirePoints(size = 0.1): THREE.PointsMaterial {
  const m = ptsPool.pop() ?? newPts();
  m.size = size;
  m.opacity = 1;
  return m;
}

/** Pool sizes, for tests. */
export function poolStats() {
  return { normal: fxPool.normal.length, add: fxPool.add.length, points: ptsPool.length };
}

// ------------------------------------------------------------------ program holders & warm-up

/**
 * One persistent instance of every material shape the game uses. Compiling these against a
 * scene keeps their programs alive even while no live material of that shape exists (e.g.
 * between two attacks, or between two kin's shadow materials).
 */
let holders: THREE.Scene | null = null;
function holderScene(): THREE.Scene {
  if (holders) return holders;
  holders = new THREE.Scene();
  const geo = markPersistent(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3));
  const mats: THREE.Material[] = [
    flatMaterial(),
    // creature/trainer colour-only Lambert (route marker), creature shadow, silhouettes
    new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    // sky domes, item props, glow discs
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }),
    new THREE.MeshBasicMaterial({ vertexColors: true }),
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    // celebration rays / confetti
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false }),
    // FX pools + ambient/sparkle points
    acquireFx('normal'),
    acquireFx('add'),
    acquirePoints(),
    new THREE.PointsMaterial({ color: '#ffffff', size: 0.07, transparent: true, opacity: 0.85, depthWrite: false }),
  ];
  for (const m of mats) {
    markPersistent(m);
    const obj = m instanceof THREE.PointsMaterial ? new THREE.Points(geo, m) : new THREE.Mesh(geo, m);
    obj.frustumCulled = false;
    holders.add(obj);
  }
  // The pooled instances used as holders go back to their pools (they stay compiled).
  for (const m of mats) releaseFx(m);
  return holders;
}

/**
 * Compile every common material shape against `target`'s lights and fog. Cheap when the
 * programs already exist (keys are computed, nothing links).
 */
export function warmPrograms(gl: THREE.WebGLRenderer, target: THREE.Scene, camera: THREE.Camera) {
  gl.compile(holderScene(), camera, target);
}

/** A tiny stand-in scene with the usual hemisphere + sun rig and fog, for warming at boot. */
export function bootWarmScene(): THREE.Scene {
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  s.add(sun);
  s.fog = new THREE.Fog(0xffffff, 10, 40);
  return s;
}
