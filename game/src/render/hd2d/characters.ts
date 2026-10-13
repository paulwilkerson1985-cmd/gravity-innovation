// HD-2D people: the player and the trainers as sprite-ready figures.
//
// Built with the creature Kit (one merged mesh, vertex colours, per-vertex rig), so they share
// the creature material, the rig (arm sway, head nod, blink) and the sprite pipeline. The
// proportions are ~4.5 heads tall with oversized hands/boots/hats — the chunky, readable
// silhouette of a pixel sprite. Palettes, hats and props come from render/trainer.ts so the
// route map and battle figures stay the same characters.
import * as THREE from 'three';
import { Kit, V, type Col } from '../creatures/kit';
import { creatureMaterial, type CreatureUniforms } from '../creatures/material';
import { PLAYER_LOOK, trainerLook, type PersonLook } from '../trainer';

/** The player's HD-2D outfit: field jacket, mid-blue jeans, a solid orange cap (the focal colour) and a compact ochre pack (original design). */
export const HERO_LOOK: PersonLook = {
  ...PLAYER_LOOK,
  top: '#2f9c8f', bottom: '#4a6aa8', shoes: '#6b3f22', hat: 'cap', hatColor: '#ff7a1e', accent: '#ff7a1e', prop: 'pack',
};

const OUTLINE_DARK = '#1d1838';
const SCLERA = '#f4f1ea';
const PACK = '#e0a83a';
const STRAP = '#4a2c1a';

function box(k: Kit, paint: Col, p: [number, number, number], s: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...s));
  k.geo(new THREE.BoxGeometry(1, 1, 1), m, paint);
}

const darker = (c: Col, k = 0.72) => new THREE.Color(c).multiplyScalar(k);
const lighter = (c: Col, k = 0.25) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k);

/**
 * Proportions (≈ 4.3 heads — readable pixel people with a big, legible head): the body is
 * modelled on the original ~3-head layout and then remapped — legs stretched, torso kept — and
 * the head + hat are built separately and set on the taller neck at HEAD_K.
 *
 * Sprite scale: a person bakes to ≈ 40–44 texels, so 1 texel ≈ 0.027 model units. Faces are
 * built in texel-sized boxes: 2-texel dark eyes over white sclera, a 2×1 mouth, 2×1 brow bars.
 */
const LEG_K = 0.52 / 0.45; // feet → hips (0.45 → 0.52)
const CHIN = 0.75, NEW_CHIN = 0.81, HEAD_K = 1.02;
function bodyY(y: number): number {
  if (y <= 0.45) return y * LEG_K;
  return 0.52 + (y - 0.45) * ((NEW_CHIN - 0.52) / (CHIN - 0.45));
}

/** Remap a Kit build's positions and rig pivots in place. */
function remap(g: THREE.BufferGeometry, f: (v: THREE.Vector3) => void) {
  const v = new THREE.Vector3();
  for (const name of ['position', 'rigA'] as const) {
    const a = g.getAttribute(name);
    for (let i = 0; i < a.count; i++) {
      v.set(a.getX(i), a.getY(i), a.getZ(i));
      f(v);
      a.setXYZ(i, v.x, v.y, v.z);
    }
  }
}

function mergeKits(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const [name, size] of [['position', 3], ['color', 3], ['rigA', 4], ['rigB', 3]] as const) {
    const arrs = parts.map((g) => g.getAttribute(name).array as Float32Array);
    const all = new Float32Array(arrs.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of arrs) { all.set(a, o); o += a.length; }
    out.setAttribute(name, new THREE.BufferAttribute(all, size));
  }
  for (const g of parts) g.dispose();
  out.computeVertexNormals();
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Build a figure's geometry. Facing +Z, feet on y = 0, ~1.1 units tall (before hats). */
export function buildFigureGeometry(l: PersonLook): THREE.BufferGeometry {
  const k = new Kit();
  k.jitter = 0.03;
  const hk = new Kit();
  hk.jitter = 0.02;
  const boot = l.shoes;
  // Legs + boots (or a robe).
  if (l.robe) {
    k.limb(l.bottom, [0, 0.06, 0], [0, 0.5, 0], 0.2, 0.13, 8);
    k.limb(darker(l.bottom, 0.8), [0, 0.03, 0], [0, 0.1, 0], 0.21, 0.205, 8);
    k.sym((sx) => k.ball(boot, [sx * 0.07, 0.035, 0.08], [0.06, 0.04, 0.08], { detail: 0 }));
  } else {
    k.sym((sx) => {
      k.limb(l.bottom, [sx * 0.07, 0.1, 0], [sx * 0.075, 0.44, 0], 0.052, 0.062, 6);
      // A darker knee/shin band so the legs read as two shapes, not a block.
      k.limb(darker(l.bottom, 0.8), [sx * 0.07, 0.15, 0.002], [sx * 0.071, 0.24, 0.002], 0.055, 0.056, 6);
      // Chunky boots with a lighter cuff and a dark sole: they anchor the figure on the ground.
      k.ball(boot, [sx * 0.07, 0.05, 0.03], [0.066, 0.056, 0.098], { detail: 0 });
      box(k, darker(boot, 0.45), [sx * 0.07, 0.008, 0.03], [0.12, 0.016, 0.19]);
      k.limb(lighter(boot, 0.15), [sx * 0.07, 0.09, 0], [sx * 0.07, 0.14, 0], 0.062, 0.06, 6);
    });
    k.ball(l.bottom, [0, 0.45, 0], [0.13, 0.07, 0.09], { detail: 0 });
  }
  // Torso: a jacket tapered from the shoulders to a narrow waist, a flared hem and a placket.
  k.limb(l.top, [0, 0.42, 0], [0, 0.72, 0], 0.13, 0.17, 8);
  k.ball(l.top, [0, 0.7, 0], [0.17, 0.07, 0.115], { detail: 0 });
  k.limb(darker(l.top, 0.8), [0, 0.4, 0], [0, 0.46, 0], 0.142, 0.135, 8);
  box(k, lighter(l.top, 0.35), [0, 0.57, 0.105], [0.03, 0.26, 0.02]);
  box(k, l.accent === l.top ? darker(l.top, 0.6) : l.accent, [0, 0.45, 0], [0.27, 0.035, 0.2]); // belt
  // Shoulders: round caps so the silhouette has a clear T of shoulders over the waist.
  k.sym((sx) => k.ball(l.top, [sx * 0.19, 0.7, 0], 0.07, { detail: 0 }));
  // Arms hang a little out from the body (readable gaps), swinging from the shoulders.
  k.sym((sx) => {
    k.withRig({ kind: 'nod', pivot: [sx * 0.2, 0.7, 0], amp: 0.07, phase: sx > 0 ? 0 : Math.PI, speed: 2.2 }, () => {
      k.limb(l.top, [sx * 0.2, 0.7, 0], [sx * 0.24, 0.54, 0.01], 0.06, 0.052, 6);
      k.limb(darker(l.top, 0.86), [sx * 0.24, 0.54, 0.01], [sx * 0.245, 0.43, 0.035], 0.052, 0.046, 6);
      k.limb(lighter(l.top, 0.3), [sx * 0.245, 0.445, 0.032], [sx * 0.245, 0.425, 0.036], 0.05, 0.049, 6); // cuff
      k.ball(l.skin, [sx * 0.245, 0.4, 0.04], 0.055, { detail: 0 });
    });
  });
  // Collar: a lighter ring where the jacket meets the neck.
  k.limb(lighter(l.top, 0.4), [0, 0.72, 0], [0, 0.755, 0], 0.1, 0.085, 8);
  // Neck (stretched with the body remap).
  k.withRig({ kind: 'nod', pivot: [0, 0.76, 0], amp: 0.03, phase: 0.6, speed: 1.4 }, () => {
    k.limb(l.skin, [0, 0.72, 0], [0, 0.79, 0], 0.042, 0.042, 6);
  });
  // Head (own kit, set on the neck below): skull, hair mass at the back, a fringe over the brow,
  // spiky crown tufts that poke out above any hat, a readable face in texel-sized boxes.
  hk.withRig({ kind: 'nod', pivot: [0, 0.76, 0], amp: 0.03, phase: 0.6, speed: 1.4 }, () => {
    hk.ball(l.skin, [0, 0.88, 0.005], [0.125, 0.13, 0.12]);
    hk.ball(l.hair, [0, 0.905, -0.03], [0.133, 0.128, 0.12]);
    hk.ball(l.hair, [0, 0.83, -0.07], [0.11, 0.08, 0.07], { detail: 0 });
    // Side tufts over the ears (read under caps and from behind).
    hk.sym((sx) => hk.cone(l.hair, [sx * 0.11, 0.9, -0.01], [sx * 0.15, 0.82, -0.03], 0.04, 4));
    hk.cone(darker(l.hair, 0.85), [0.02, 0.86, -0.11], [0.03, 0.78, -0.16], 0.04, 4);
    // Fringe: a hair band across the forehead with three points hanging toward the brows.
    box(hk, l.hair, [0, 0.948, 0.1], [0.2, 0.04, 0.05], [-0.25, 0, 0]);
    for (const x of [-0.06, 0, 0.06]) hk.cone(l.hair, [x, 0.95, 0.11], [x + 0.012, 0.905, 0.122], 0.03, 4);
    // Spiky crown: under a hat the spikes fan out from below its back rim (they stick out past
    // the hat's silhouette instead of poking through it); bare-headed, they stand on top.
    const covered = l.hat === 'cap' || l.hat === 'beanie' || l.hat === 'ranger' || l.hat === 'souwester';
    const spikes: [number, number, number, number, number, number][] = covered
      ? [[-0.08, 0.93, -0.08, -0.16, 0.95, -0.19], [0.0, 0.94, -0.1, 0.0, 0.96, -0.23], [0.08, 0.93, -0.08, 0.16, 0.95, -0.19]]
      : [[-0.07, 0.99, -0.04, -0.12, 1.09, -0.1], [0.0, 1.0, -0.06, 0.0, 1.12, -0.14], [0.07, 0.99, -0.04, 0.12, 1.09, -0.1], [0, 0.95, -0.11, 0.02, 0.99, -0.21]];
    for (const [x, y, z, tx, ty, tz] of spikes) hk.cone(l.hair, [x, y, z], [tx, ty, tz], 0.045, 4);
    // Face: white sclera with a 2-texel dark eye on the inner side, brow bars, a mouth.
    hk.sym((sx) => {
      box(hk, SCLERA, [sx * 0.047, 0.866, 0.113], [0.05, 0.05, 0.02]);
      box(hk, OUTLINE_DARK, [sx * 0.04, 0.864, 0.124], [0.03, 0.056, 0.012]);
      box(hk, darker(l.hair, 0.7), [sx * 0.05, 0.906, 0.116], [0.056, 0.02, 0.02], [0, 0, -sx * 0.12]);
    });
    box(hk, '#7a3328', [0, 0.818, 0.112], [0.05, 0.02, 0.016]);
    hk.ball(darker(l.skin, 0.86), [0, 0.845, 0.122], 0.013, { detail: 0 });
    hat(hk, l);
  });
  prop(k, l);
  const body = k.build(false);
  remap(body, (v) => { v.y = bodyY(v.y); });
  const head = hk.build(false);
  remap(head, (v) => {
    v.x *= HEAD_K; v.z *= HEAD_K;
    v.y = NEW_CHIN + (v.y - CHIN) * HEAD_K;
  });
  return mergeKits([body, head]);
}

function hat(k: Kit, l: PersonLook) {
  switch (l.hat) {
    case 'cap':
      // Seated above the brow (the eyes and brows stay visible under the brim).
      k.ball(l.hatColor, [0, 0.985, -0.01], [0.14, 0.075, 0.138]);
      box(k, l.accent, [0, 0.93, 0.13], [0.2, 0.022, 0.11], [0.14, 0, 0]);
      k.ball(darker(l.hatColor, 0.8), [0, 1.055, -0.01], 0.022, { detail: 0 });
      // Our own orb-bud emblem on the front.
      k.gem(l.hatColor === l.accent ? '#fff4d8' : l.accent, [0, 0.99, 0.13], [0.026, 0.03, 0.012]);
      break;
    case 'ranger':
      k.limb(l.hatColor, [0, 0.965, 0], [0, 0.985, 0], 0.17, 0.17, 10);
      k.limb(l.hatColor, [0, 0.985, 0], [0, 1.08, 0], 0.12, 0.105, 8);
      k.limb(l.accent, [0, 0.985, 0], [0, 1.01, 0], 0.123, 0.12, 8);
      break;
    case 'beanie':
      k.ball(l.hatColor, [0, 0.985, -0.015], [0.14, 0.095, 0.14]);
      k.limb(darker(l.hatColor, 0.8), [0, 0.925, -0.015], [0, 0.96, -0.015], 0.142, 0.142, 8);
      k.ball(l.accent, [0, 1.09, -0.015], 0.042, { detail: 0 });
      break;
    case 'band':
      k.limb(l.hatColor, [0, 0.935, 0], [0, 0.96, 0], 0.135, 0.135, 8);
      k.cone(l.hair, [0, 0.92, -0.11], [0, 0.6, -0.2], 0.06, 5);
      break;
    case 'souwester': {
      k.ball(l.hatColor, [0, 0.985, -0.01], [0.14, 0.09, 0.14]);
      // The brim tilts back off the face (front up, back down), like a rain hat pushed back.
      const m = new THREE.Matrix4().compose(V(0, 0.94, -0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1));
      k.geo(new THREE.CylinderGeometry(0.22, 0.18, 0.02, 10), m, l.hatColor);
      break;
    }
    case 'goggles':
      k.limb(OUTLINE_DARK, [0, 0.95, 0], [0, 0.975, 0], 0.136, 0.136, 8);
      k.sym((sx) => k.limb(l.hatColor, [sx * 0.05, 0.965, 0.11], [sx * 0.05, 0.965, 0.15], 0.04, 0.04, 6));
      k.cone(l.hair, [0, 0.98, 0], [0, 1.1, -0.08], 0.11, 5);
      break;
    case 'crown':
      k.limb(l.hatColor, [0, 0.98, 0], [0, 1.03, 0], 0.1, 0.11, 8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cone(l.hatColor, [Math.sin(a) * 0.09, 1.02, Math.cos(a) * 0.09], [Math.sin(a) * 0.1, 1.1, Math.cos(a) * 0.1], 0.025, 4);
      }
      k.gem('#ff4d6d', [0, 1.01, 0.11], [0.025, 0.03, 0.015]);
      break;
  }
}

function prop(k: Kit, l: PersonLook) {
  switch (l.prop) {
    case 'pack': {
      // A compact ochre rucksack with a darker flap and dark straps over the shoulders.
      box(k, PACK, [0, 0.6, -0.17], [0.2, 0.24, 0.12]);
      // The flap overhangs the back a little: one darker band across the top, nothing face-like.
      box(k, darker(PACK, 0.78), [0, 0.685, -0.175], [0.215, 0.075, 0.135]);
      k.sym((sx) => box(k, STRAP, [sx * 0.09, 0.66, -0.02], [0.03, 0.18, 0.24]));
      break;
    }
    case 'rod':
      k.limb('#6b4a2a', [0.25, 0.4, 0.06], [0.45, 1.25, 0.32], 0.014, 0.008, 4);
      k.ball('#ff4d6d', [0.45, 1.25, 0.32], 0.025, { detail: 0 });
      break;
    case 'staff':
      k.limb('#8a5a3a', [-0.26, 0.05, 0.06], [-0.26, 1.1, 0.06], 0.02, 0.018, 5);
      k.gem('#ff7a1e', [-0.26, 1.14, 0.06], [0.05, 0.08, 0.05]);
      break;
    case 'scarf':
      k.limb(l.accent, [0, 0.72, 0], [0, 0.77, 0], 0.11, 0.1, 8);
      k.cone(l.accent, [0.05, 0.74, -0.08], [0.12, 0.5, -0.16], 0.04, 4, 0.4);
      break;
    case 'cape':
      k.cone(l.accent === '#ffffff' ? '#d9d2ff' : l.accent, [0, 0.74, -0.08], [0, 0.04, -0.2], 0.2, 6, 0.35);
      k.cone('#b8321e', [0, 0.73, -0.06], [0, 0.07, -0.17], 0.17, 6, 0.3);
      k.limb(l.hatColor, [0, 0.72, 0], [0, 0.76, 0], 0.12, 0.11, 8);
      break;
    case 'none':
      break;
  }
}

/** An animated person: one mesh with the creature material (rig: arm sway, head nod). */
export class Figure {
  readonly mesh: THREE.Mesh;
  readonly uniforms: CreatureUniforms;
  readonly material: THREE.MeshLambertMaterial;
  /** Model height (units, before the mesh scale). */
  readonly height: number;
  /** Walking/being moved: HD-2D sprites re-bake every frame meanwhile. */
  walking = false;
  private phase: number;

  constructor(look: PersonLook, seed = 0) {
    const { material, uniforms } = creatureMaterial();
    this.material = material;
    this.uniforms = uniforms;
    this.mesh = new THREE.Mesh(buildFigureGeometry(look), material);
    this.mesh.name = 'hd2d-figure';
    const bb = this.mesh.geometry.boundingBox!;
    this.height = bb.max.y - bb.min.y;
    this.phase = seed * 1.3;
  }

  /** Idle: breathing squash and a slow weight shift. Call every frame. */
  update(t: number) {
    const tt = t + this.phase;
    this.uniforms.uTime.value = tt;
    const s = this.mesh.scale.x;
    // Breathing and weight shift big enough to move the sprite by a whole texel (≈ 2.5% of the height).
    this.mesh.scale.y = s * (1 + Math.sin(tt * 2.0) * 0.026);
    this.mesh.rotation.z = Math.sin(tt * 0.7) * 0.02;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export function heroFigure(): Figure { return new Figure(HERO_LOOK, 1); }
export function trainerFigure(id: string): Figure { return new Figure(trainerLook(id), 2); }
