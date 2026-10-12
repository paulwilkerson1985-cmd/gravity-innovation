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

/** The player's HD-2D outfit: field jacket, cap, big pack with a bedroll (original design). */
export const HERO_LOOK: PersonLook = {
  ...PLAYER_LOOK,
  top: '#2f9c8f', bottom: '#2b3150', shoes: '#6b3f22', hat: 'cap', hatColor: '#f4f1ea', accent: '#ff5d5d', prop: 'pack',
};

const OUTLINE_DARK = '#1d1838';

function box(k: Kit, paint: Col, p: [number, number, number], s: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...s));
  k.geo(new THREE.BoxGeometry(1, 1, 1), m, paint);
}

const darker = (c: Col, k = 0.72) => new THREE.Color(c).multiplyScalar(k);
const lighter = (c: Col, k = 0.25) => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), k);

/** Build a figure's geometry. Facing +Z, feet on y = 0, ~1.0 units tall (before hats). */
export function buildFigureGeometry(l: PersonLook): THREE.BufferGeometry {
  const k = new Kit();
  k.jitter = 0.03;
  const boot = l.shoes;
  // Legs + boots (or a robe).
  if (l.robe) {
    k.limb(l.bottom, [0, 0.06, 0], [0, 0.5, 0], 0.2, 0.14, 8);
    k.limb(darker(l.bottom, 0.8), [0, 0.03, 0], [0, 0.1, 0], 0.21, 0.205, 8);
    k.sym((sx) => k.ball(boot, [sx * 0.07, 0.035, 0.08], [0.06, 0.04, 0.08], { detail: 0 }));
  } else {
    k.sym((sx) => {
      k.limb(l.bottom, [sx * 0.07, 0.1, 0], [sx * 0.075, 0.44, 0], 0.052, 0.062, 6);
      // Chunky boots with a lighter cuff: they anchor the figure on the ground.
      k.ball(boot, [sx * 0.07, 0.05, 0.03], [0.065, 0.055, 0.095], { detail: 0 });
      k.limb(lighter(boot, 0.15), [sx * 0.07, 0.09, 0], [sx * 0.07, 0.14, 0], 0.06, 0.058, 6);
    });
    k.ball(l.bottom, [0, 0.45, 0], [0.13, 0.07, 0.09], { detail: 0 });
  }
  // Torso: jacket with a flared hem and a contrasting zip/placket.
  k.limb(l.top, [0, 0.42, 0], [0, 0.72, 0], 0.15, 0.16, 8);
  k.ball(l.top, [0, 0.7, 0], [0.165, 0.07, 0.115], { detail: 0 });
  k.limb(darker(l.top, 0.8), [0, 0.4, 0], [0, 0.46, 0], 0.16, 0.152, 8);
  box(k, lighter(l.top, 0.35), [0, 0.57, 0.11], [0.03, 0.26, 0.02]);
  box(k, l.accent, [0, 0.45, 0], [0.31, 0.035, 0.215]); // belt
  // Arms swing gently from the shoulders (rig: nod about the side axis).
  k.sym((sx) => {
    k.withRig({ kind: 'nod', pivot: [sx * 0.17, 0.7, 0], amp: 0.07, phase: sx > 0 ? 0 : Math.PI, speed: 2.2 }, () => {
      k.limb(l.top, [sx * 0.17, 0.7, 0], [sx * 0.21, 0.54, 0.01], 0.052, 0.046, 6);
      k.limb(darker(l.top, 0.86), [sx * 0.21, 0.54, 0.01], [sx * 0.215, 0.43, 0.035], 0.046, 0.04, 6);
      k.ball(l.skin, [sx * 0.215, 0.41, 0.04], 0.042, { detail: 0 });
    });
  });
  // Head: big, with hair mass at the back, two dark eyes and a nose dot.
  k.withRig({ kind: 'nod', pivot: [0, 0.76, 0], amp: 0.03, phase: 0.6, speed: 1.4 }, () => {
    k.limb(l.skin, [0, 0.72, 0], [0, 0.79, 0], 0.045, 0.045, 6);
    k.ball(l.skin, [0, 0.88, 0.005], [0.125, 0.13, 0.12]);
    k.ball(l.hair, [0, 0.9, -0.03], [0.132, 0.13, 0.12]);
    k.ball(l.hair, [0, 0.83, -0.07], [0.11, 0.08, 0.07], { detail: 0 });
    k.sym((sx) => box(k, OUTLINE_DARK, [sx * 0.045, 0.875, 0.115], [0.022, 0.04, 0.02]));
    k.sym((sx) => box(k, l.hair, [sx * 0.045, 0.915, 0.112], [0.04, 0.012, 0.02], [0, 0, -sx * 0.15]));
    k.ball(darker(l.skin, 0.9), [0, 0.855, 0.122], 0.014, { detail: 0 });
    hat(k, l);
  });
  prop(k, l);
  return k.build();
}

function hat(k: Kit, l: PersonLook) {
  switch (l.hat) {
    case 'cap':
      k.ball(l.hatColor, [0, 0.95, -0.005], [0.138, 0.085, 0.135]);
      box(k, l.accent, [0, 0.935, 0.12], [0.2, 0.024, 0.12], [0.12, 0, 0]);
      k.ball(l.accent, [0, 1.03, 0], 0.025, { detail: 0 });
      // Our own orb-bud emblem on the front.
      k.gem(l.accent, [0, 0.975, 0.125], [0.03, 0.035, 0.012]);
      break;
    case 'ranger':
      k.limb(l.hatColor, [0, 0.93, 0], [0, 0.95, 0], 0.24, 0.24, 10);
      k.limb(l.hatColor, [0, 0.95, 0], [0, 1.05, 0], 0.12, 0.105, 8);
      k.limb(l.accent, [0, 0.95, 0], [0, 0.975, 0], 0.123, 0.12, 8);
      break;
    case 'beanie':
      k.ball(l.hatColor, [0, 0.95, -0.01], [0.14, 0.11, 0.14]);
      k.limb(darker(l.hatColor, 0.8), [0, 0.9, -0.01], [0, 0.94, -0.01], 0.142, 0.142, 8);
      k.ball(l.accent, [0, 1.07, -0.01], 0.042, { detail: 0 });
      break;
    case 'band':
      k.limb(l.hatColor, [0, 0.915, 0], [0, 0.945, 0], 0.135, 0.135, 8);
      k.cone(l.hair, [0, 0.92, -0.11], [0, 0.6, -0.2], 0.06, 5);
      break;
    case 'souwester':
      k.ball(l.hatColor, [0, 0.96, 0], [0.14, 0.1, 0.14]);
      k.limb(l.hatColor, [0, 0.9, -0.02], [0, 0.92, -0.02], 0.25, 0.2, 10);
      break;
    case 'goggles':
      k.limb(OUTLINE_DARK, [0, 0.93, 0], [0, 0.955, 0], 0.136, 0.136, 8);
      k.sym((sx) => k.limb(l.hatColor, [sx * 0.05, 0.95, 0.11], [sx * 0.05, 0.95, 0.15], 0.04, 0.04, 6));
      k.cone(l.hair, [0, 0.98, 0], [0, 1.1, -0.08], 0.11, 5);
      break;
    case 'crown':
      k.limb(l.hatColor, [0, 0.97, 0], [0, 1.02, 0], 0.1, 0.11, 8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cone(l.hatColor, [Math.sin(a) * 0.09, 1.01, Math.cos(a) * 0.09], [Math.sin(a) * 0.1, 1.09, Math.cos(a) * 0.1], 0.025, 4);
      }
      k.gem('#ff4d6d', [0, 1.0, 0.11], [0.025, 0.03, 0.015]);
      break;
  }
}

function prop(k: Kit, l: PersonLook) {
  switch (l.prop) {
    case 'pack': {
      const pack = l.accent === l.top ? '#ffd23f' : l.accent;
      // Big rucksack with a flap, side pockets and a rolled bedroll on top.
      box(k, pack, [0, 0.58, -0.15], [0.26, 0.3, 0.14]);
      box(k, darker(pack, 0.8), [0, 0.68, -0.155], [0.27, 0.1, 0.15]);
      k.sym((sx) => box(k, darker(pack, 0.85), [sx * 0.14, 0.53, -0.15], [0.04, 0.14, 0.1]));
      box(k, '#6b3f22', [0, 0.53, -0.225], [0.05, 0.12, 0.012]);
      k.limb('#efe2c4', [-0.15, 0.76, -0.15], [0.15, 0.76, -0.15], 0.05, 0.05, 8);
      k.sym((sx) => box(k, '#6b3f22', [sx * 0.09, 0.66, 0.0], [0.03, 0.2, 0.24]));
      break;
    }
    case 'rod':
      k.limb('#6b4a2a', [0.22, 0.4, 0.06], [0.42, 1.25, 0.32], 0.014, 0.008, 4);
      k.ball('#ff4d6d', [0.42, 1.25, 0.32], 0.025, { detail: 0 });
      break;
    case 'staff':
      k.limb('#8a5a3a', [-0.23, 0.05, 0.06], [-0.23, 1.1, 0.06], 0.02, 0.018, 5);
      k.gem('#ff7a1e', [-0.23, 1.14, 0.06], [0.05, 0.08, 0.05]);
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
  private phase: number;

  constructor(look: PersonLook, seed = 0) {
    const { material, uniforms } = creatureMaterial();
    this.material = material;
    this.uniforms = uniforms;
    this.mesh = new THREE.Mesh(buildFigureGeometry(look), material);
    this.mesh.name = 'hd2d-figure';
    this.phase = seed * 1.3;
  }

  /** Idle: breathing squash and a slow weight shift. Call every frame. */
  update(t: number) {
    const tt = t + this.phase;
    this.uniforms.uTime.value = tt;
    const s = this.mesh.scale.x;
    this.mesh.scale.y = s * (1 + Math.sin(tt * 2.0) * 0.012);
    this.mesh.rotation.z = Math.sin(tt * 0.7) * 0.012;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

export function heroFigure(): Figure { return new Figure(HERO_LOOK, 1); }
export function trainerFigure(id: string): Figure { return new Figure(trainerLook(id), 2); }
