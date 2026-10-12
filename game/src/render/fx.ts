import * as THREE from 'three';
import { GEO, MeshBuilder } from './builder';
import { animClock } from './anim';
import { flatMaterialInstance } from './materials';
import { Particles, flash, flatShape, fxSeed } from './particles';

/** A one-draw-call burst of shards that fly out and fade (plus a quick flash), then removes itself. */
export async function burst(scene: THREE.Scene, at: THREE.Vector3, color: THREE.ColorRepresentation, size = 1, count = 8) {
  fxSeed(count * 31 + Math.round(size * 100));
  const ps = new Particles(scene, count + 6, GEO.oct);
  const white = new THREE.Color('#ffffff');
  const tint = new THREE.Color(color);
  ps.spray(count, at, [2.2 * size, 3.6 * size], { color, colors: [tint, tint.clone().lerp(white, 0.5)], size: 0.1 * size, life: 0.42, gravity: -5, drag: 2.2, spin: 9, end: 0, dir: new THREE.Vector3(0, 0.5, 0), stretch: 1.7 });
  ps.spray(6, at, [1 * size, 2 * size], { color: '#ffffff', size: 0.06 * size, life: 0.3, drag: 3, end: 0 });
  void flash(scene, at, color, 0.55 * size, 200, 'star4', 'add', 0.8);
  await ps.run(460);
}

// ------------------------------------------------------------------ orbs
//
// Orbkin "orbs" are lantern-buds: a faceted, pointed seed-pod cradled by leafy sepals, with a
// glowing tip. No hemispheres, no band, no button — the silhouette is an upward teardrop with a
// jagged collar. Tiers read by colour *and* shape:
//   Orb        coral bud, 4 green sepals, warm tip.
//   Bright Orb sky-blue bud, 5 sepals, a tilted gold halo ring and a gold tip.
//   Star Orb   gold bud with a 4-point white star collar instead of leaves and a pink tip.

export const ORB_COLORS = { orb: '#ff4d6d', bright: '#3d9bff', star: '#ffc93d' } as const;
export type OrbTier = keyof typeof ORB_COLORS;

export interface OrbStyle { body: string; shade: string; light: string; collar: string; collarDark: string; tip: string; ring?: string; star?: boolean; sepals: number }
export const ORB_STYLES: Record<OrbTier, OrbStyle> = {
  orb: { body: '#ff4d6d', shade: '#d62c55', light: '#ff8fa0', collar: '#4cc35a', collarDark: '#2f8f44', tip: '#fff1a8', sepals: 4 },
  bright: { body: '#3d9bff', shade: '#2266d8', light: '#8fd0ff', collar: '#4cc35a', collarDark: '#2f8f44', tip: '#ffd23f', ring: '#ffc93d', sepals: 5 },
  star: { body: '#ffc93d', shade: '#e8901e', light: '#fff0a0', collar: '#ffffff', collarDark: '#dfe6ff', tip: '#ff7ad0', star: true, sepals: 4 },
};

function tierOf(color: string): OrbTier {
  const c = color.toLowerCase();
  return (Object.keys(ORB_COLORS) as OrbTier[]).find((k) => ORB_COLORS[k] === c) ?? 'orb';
}

/** Build the orb geometry (centred on the bud's middle; ~0.44 tall). */
export function orbGeometry(tier: OrbTier, colorOverride?: string): THREE.BufferGeometry {
  const st = { ...ORB_STYLES[tier] };
  if (colorOverride && colorOverride.toLowerCase() !== ORB_COLORS[tier]) {
    st.body = colorOverride;
    st.shade = new THREE.Color(colorOverride).multiplyScalar(0.75).getStyle();
    st.light = new THREE.Color(colorOverride).lerp(new THREE.Color('#ffffff'), 0.4).getStyle();
  }
  const b = new MeshBuilder();
  const sides = tier === 'orb' ? 6 : 8;
  const lower = new THREE.CylinderGeometry(1, 0.55, 0.5, sides, 1);
  const bottom = new THREE.ConeGeometry(0.55, 0.32, sides, 1);
  const upper = new THREE.ConeGeometry(1, 1, sides, 1);
  // Bud: round-ish faceted belly + tall pointed top (two-tone facets via offset copies).
  b.add(lower, st.body, { p: [0, -0.04, 0], s: [0.2, 0.36, 0.2] }, 0.25);
  b.add(bottom, st.shade, { p: [0, -0.18, 0], r: [Math.PI, 0, 0], s: [0.2 / 0.55 * 0.55, 0.36, 0.2 / 0.55 * 0.55] }, 0.2);
  b.add(upper, st.body, { p: [0, 0.135, 0], s: [0.2, 0.3, 0.2] }, 0.3);
  // Light facet stripes: thin slivers on alternate faces, rotated half a facet so they sit on the faces.
  for (let i = 0; i < sides; i += 2) {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    b.add(GEO.box, st.light, { p: [Math.sin(a) * 0.168, 0.06, Math.cos(a) * 0.168], r: [-0.55, a, 0], s: [0.035, 0.2, 0.012] });
  }
  // Glowing tip.
  b.add(GEO.oct, st.tip, { p: [0, 0.3, 0], s: [0.05, 0.075, 0.05] });
  // Collar.
  if (st.star) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      b.add(GEO.cone4, i % 2 ? st.collarDark : st.collar, { p: [Math.sin(a) * 0.2, -0.08, Math.cos(a) * 0.2], r: [Math.PI / 2 - 0.25, a, 0], s: [0.07, 0.2, 0.035] });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(GEO.cone4, st.collarDark, { p: [Math.sin(a) * 0.16, -0.1, Math.cos(a) * 0.16], r: [Math.PI / 2 - 0.1, a, 0], s: [0.045, 0.11, 0.025] });
    }
  } else {
    for (let i = 0; i < st.sepals; i++) {
      const a = (i / st.sepals) * Math.PI * 2 + 0.3;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, a, 0, 'YXZ'));
      const p = new THREE.Vector3(0, 0.09, 0).applyQuaternion(q).add(new THREE.Vector3(Math.sin(a) * 0.15, -0.16, Math.cos(a) * 0.15));
      b.add(GEO.cone4, i % 2 ? st.collarDark : st.collar, { p: [p.x, p.y, p.z], q, s: [0.085, 0.24, 0.03] });
    }
    // little stem nub
    b.add(GEO.cyl, st.collarDark, { p: [0, -0.25, 0], s: [0.04, 0.05, 0.04] });
  }
  if (st.ring) {
    const ring = new THREE.TorusGeometry(0.27, 0.022, 3, 16);
    b.add(ring, st.ring, { p: [0, 0.0, 0], r: [Math.PI / 2 + 0.38, 0, 0.18] });
    ring.dispose();
  }
  lower.dispose(); bottom.dispose(); upper.dispose();
  return b.build();
}

const orbGeoCache = new Map<string, THREE.BufferGeometry>();

/**
 * An orb mesh. `color` is one of ORB_COLORS (selects the tier); any other colour gives a plain
 * Orb tinted that colour. The material is the mesh's own flat Lambert (callers animate its
 * emissive). The orb reacts to how it is handled: every wobble (rotation.z swing) puffs a
 * sparkle from the tip, and an emissive "click" pulse (emissive ≥ 0.5) fires the lock glint —
 * or call `orbShakeFx(orb)` / `orbLockFx(orb)` explicitly.
 */
export function makeOrb(color: string, tier?: OrbTier): THREE.Mesh {
  const t = tier ?? tierOf(color);
  const key = `${t}|${color}`;
  // Each orb gets its own geometry copy so scene code can dispose it freely.
  let base = orbGeoCache.get(key);
  if (!base) { base = orbGeometry(t, color); orbGeoCache.set(key, base); }
  const mesh = new THREE.Mesh(base.clone(), flatMaterialInstance());
  mesh.userData.orbTier = t;
  attachOrbReactions(mesh, t);
  return mesh;
}

// ------------------------------------------------------------------ orb reactions

interface OrbFx { sparks: THREE.Mesh; glint: THREE.Mesh; sparkT: number; glintT: number; lastZ: number; lastClock: number; locked: boolean }

const SPARK_N = 8;
const TIP = new THREE.Vector3(0, 0.3, 0);

function attachOrbReactions(orb: THREE.Mesh, tier: OrbTier) {
  // Sparkle puff: 8 little 4-point stars; positions are rewritten per frame.
  const star = flatShape('star4');
  const sv = star.attributes.position!.array as Float32Array;
  const nv = sv.length / 3;
  const sPos = new Float32Array(SPARK_N * nv * 3);
  const sCol = new Float32Array(SPARK_N * nv * 3);
  const palette = [ORB_STYLES[tier].tip, '#ffffff', ORB_STYLES[tier].light];
  const c = new THREE.Color();
  for (let i = 0; i < SPARK_N; i++) {
    c.set(palette[i % palette.length]!);
    for (let v = 0; v < nv; v++) sCol.set([c.r, c.g, c.b], (i * nv + v) * 3);
  }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  sGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
  const sparkMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Mesh(sGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  sparks.renderOrder = 3;
  const glintMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: '#fffbe0' });
  const glint = new THREE.Mesh(flatShape('star4'), glintMat);
  glint.visible = false;
  glint.renderOrder = 3;
  const gq = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  glint.onBeforeRender = (_r, _s, cam) => {
    // Child of the (spinning) orb: cancel the parent's world rotation, then face the camera.
    orb.getWorldQuaternion(gq).invert().multiply(cam.quaternion);
    glint.quaternion.copy(gq).multiply(roll.setFromAxisAngle(zAxis, (glint.userData.roll as number) ?? 0));
    glint.updateMatrixWorld();
  };
  orb.add(sparks, glint);
  const fx: OrbFx = { sparks, glint, sparkT: -1, glintT: -1, lastZ: 0, lastClock: animClock.time, locked: false };
  orb.userData.orbFx = fx;

  const camQ = new THREE.Quaternion();
  const inv = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  orb.onBeforeRender = (_r, _s, cam) => {
    const dt = Math.max(0, Math.min(0.1, animClock.time - fx.lastClock)) * animClock.speed;
    fx.lastClock = animClock.time;
    // Wobble detection: a swing past 0.3 rad (rising) = one shake.
    const z = orb.rotation.z;
    if (Math.abs(z) > 0.3 && Math.abs(fx.lastZ) <= 0.3 && z > 0) orbShakeFx(orb);
    fx.lastZ = z;
    const mat = orb.material as THREE.MeshLambertMaterial;
    if (!fx.locked && mat.emissive && mat.emissive.r >= 0.5) { fx.locked = true; orbLockFx(orb); }
    // Sparkle puff.
    if (fx.sparkT >= 0) {
      fx.sparkT += dt;
      const k = fx.sparkT / 0.55;
      if (k >= 1) { fx.sparkT = -1; sparks.visible = false; }
      else {
        sparks.visible = true;
        // Undo the orb's rotation so the puff rises in world space; face the camera.
        inv.copy(orb.quaternion).invert();
        camQ.copy(inv).multiply(cam.quaternion);
        for (let i = 0; i < SPARK_N; i++) {
          const a = (i / SPARK_N) * Math.PI * 2 + i;
          const r = 0.08 + k * (0.22 + (i % 3) * 0.06);
          p.set(Math.cos(a) * r, 0.3 + k * (0.18 + (i % 2) * 0.12) - k * k * 0.12, Math.sin(a) * r).applyQuaternion(inv);
          const s = 0.075 * (1 - k) * (i % 2 ? 1 : 0.7);
          m.compose(p, camQ, sc.set(s, s, s));
          const e = m.elements;
          for (let v = 0; v < nv; v++) {
            const x = sv[v * 3]!, y = sv[v * 3 + 1]!;
            const o = (i * nv + v) * 3;
            sPos[o] = e[0]! * x + e[4]! * y + e[12]!;
            sPos[o + 1] = e[1]! * x + e[5]! * y + e[13]!;
            sPos[o + 2] = e[2]! * x + e[6]! * y + e[14]!;
          }
        }
        sGeo.attributes.position!.needsUpdate = true;
        sparkMat.opacity = k < 0.6 ? 1 : (1 - k) / 0.4;
      }
    }
    // Lock glint: a big 4-point star that pops at the tip, spins a quarter turn and fades.
    if (fx.glintT >= 0) {
      fx.glintT += dt;
      const k = fx.glintT / 0.7;
      if (k >= 1) { fx.glintT = -1; glint.visible = false; }
      else {
        glint.visible = true;
        glint.position.copy(TIP).applyQuaternion(inv.copy(orb.quaternion).invert());
        const s = (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8 * 0.85) * 0.42;
        glint.scale.set(s, s, s);
        glint.userData.roll = k * Math.PI * 0.5;
        glintMat.opacity = k < 0.5 ? 1 : (1 - k) / 0.5;
      }
    }
  };
}

/** Sparkle puff from the orb's tip (one per shake). */
export function orbShakeFx(orb: THREE.Object3D) {
  const fx = orb.userData.orbFx as OrbFx | undefined;
  if (fx) fx.sparkT = 0;
}

/** The lock "glint" (a bright star at the tip) — the click of a successful catch. */
export function orbLockFx(orb: THREE.Object3D) {
  const fx = orb.userData.orbFx as OrbFx | undefined;
  if (!fx) return;
  fx.locked = true;
  fx.glintT = 0;
  fx.sparkT = 0;
}

/** Optional: a short shower of the orb tier's colours (e.g. the success moment). */
export async function orbCelebrate(scene: THREE.Scene, at: THREE.Vector3, tier: OrbTier = 'orb') {
  fxSeed(7);
  const st = ORB_STYLES[tier];
  const ps = new Particles(scene, 18, flatShape('star4'), 'add', { billboard: true });
  ps.spray(14, at, [1.4, 2.4], { color: st.tip, colors: [st.tip, '#ffffff', st.light], size: 0.09, life: 0.6, gravity: -3, drag: 1.5, end: 0, dir: new THREE.Vector3(0, 1.2, 0) });
  await ps.run(700);
}
