// HD-2D people: the player and the trainers as sprite-ready figures.
//
// Built with the creature Kit (one merged mesh, vertex colours, per-vertex rig), so they share
// the creature material, the rig (arm sway, head nod, blink) and the sprite pipeline. The
// proportions are ~4.5 heads tall with oversized hands/boots/hats — the chunky, readable
// silhouette of a pixel sprite. Palettes, hats and props come from render/trainer.ts so the
// route map and battle figures stay the same characters; the HD-2D sprites only re-balance the
// outfit colours against their biome (HD2D_TRAINERS) and add tailoring detail.
//
// Detail is built for the sprite bake: every variant tone (fold lines, pockets, trims, hair
// highlights) is a distinct sRGB step (≥ ~0.12 from its base) so the per-species palette keeps it
// as its own entry instead of merging it into the base colour, and every detail is ≥ 1 sprite
// texel (≈ 0.025 model units).
import * as THREE from 'three';
import { Kit, V, type Col } from '../creatures/kit';
import { creatureMaterial, type CreatureUniforms } from '../creatures/material';
import { PLAYER_LOOK, trainerLook, type PersonLook } from '../trainer';

/** A person's look plus optional HD-2D tailoring (all optional, so any PersonLook works). */
export interface Hd2dLook extends PersonLook {
  /** Vest / tabard over the shirt: the torso takes it, the sleeves keep `top`. */
  vest?: string;
  /** Trim (collar, cuffs, hem, robe edges): gold on the champion. Default: a darker top. */
  trim?: string;
  /** Front panel of a robe (champion). */
  panel?: string;
}

/** The player's HD-2D outfit: field jacket, mid-blue jeans, a solid orange cap (the focal colour) and a compact ochre pack (original design). */
export const HERO_LOOK: PersonLook = {
  ...PLAYER_LOOK,
  top: '#2f9c8f', bottom: '#4a6aa8', shoes: '#6b3f22', hat: 'cap', hatColor: '#ff7a1e', accent: '#ff7a1e', prop: 'pack',
};

/**
 * Per-trainer HD-2D colour balance (same people, same identities): outfits are pulled away from
 * their biome's dominant hue so they separate from the set, and nothing is a flat block.
 *  - Pim (meadow): a khaki scout vest over the green shirt, olive-brown shorts — not green on green.
 *  - Merrow (coast): a deeper, warmer oilskin yellow with brown toggles and fold lines.
 *  - Tavi (cliff): silver-lilac hair (not white), goggles pushed up on the head (the face shows).
 *  - Vale (summit): royal purple coat with gold trim, a lilac robe panel, a lighter robe.
 */
const HD2D_TRAINERS: Record<string, Partial<Hd2dLook>> = {
  'scout-pim': { top: '#4f9348', vest: '#c29a5c', bottom: '#6f6142', hatColor: '#7f8a3c', trim: '#7c5a34' },
  'angler-merrow': { top: '#e6ae30', hatColor: '#e6ae30', trim: '#7a4a24', bottom: '#2f5a86' },
  'rider-tavi': { hair: '#bdb6dc', top: '#2b9c93', trim: '#1f6a68' },
  'champion-vale': { top: '#5e42b0', bottom: '#4a3486', trim: '#e2b450', panel: '#cfc4f2' },
};

const OUTLINE_DARK = '#1d1838';
const PACK = '#e0a83a';
const STRAP = '#4a2c1a';
const BUCKLE = '#e8cf7a';
const BEDROLL = '#a8503a';

/** sRGB-space shade of a colour (k < 1 darker, > 1 lighter toward white). */
function tone(c: Col, k: number): THREE.Color {
  const s = new THREE.Color(c).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const f = (v: number) => (k <= 1 ? v * k : v + (1 - v) * (k - 1));
  return new THREE.Color().setRGB(f(s.r), f(s.g), f(s.b), THREE.SRGBColorSpace);
}
const darker = (c: Col, k = 0.72) => tone(c, k);
const lighter = (c: Col, k = 0.25) => tone(c, 1 + k);

/** Slightly desaturated outfit colour (the sprites sit inside a graded set). */
function soften(c: string, k = 0.88): string {
  const col = new THREE.Color(c);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl, THREE.SRGBColorSpace);
  col.setHSL(hsl.h, hsl.s * k, hsl.l, THREE.SRGBColorSpace);
  return `#${col.getHexString(THREE.SRGBColorSpace)}`;
}

/** The HD-2D look of a person: biome-balanced trainer colours, softened outfit saturation. */
export function hd2dLook(base: PersonLook, id?: string): Hd2dLook {
  const l: Hd2dLook = { ...base, ...(id ? HD2D_TRAINERS[id] : undefined) };
  for (const k of ['top', 'bottom', 'shoes', 'hatColor', 'accent', 'vest', 'panel'] as const) {
    const v = l[k];
    if (v) l[k] = soften(v);
  }
  return l;
}

function box(k: Kit, paint: Col, p: [number, number, number], s: [number, number, number], rot: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), V(...s));
  k.geo(new THREE.BoxGeometry(1, 1, 1), m, paint, { jitter: 0 });
}

/**
 * Proportions (≈ 4.3 heads — readable pixel people with a big, legible head): the body is
 * modelled on the original ~3-head layout and then remapped — legs stretched, torso kept — and
 * the head + hat are built separately and set on the taller neck at HEAD_K.
 *
 * Sprite scale: a person bakes to ≈ 40–44 texels, so 1 texel ≈ 0.025 model units. Faces are
 * built in texel-sized boxes: 1×2-texel dark eyes three texels apart, 2×1 brow bars, a small
 * 2×1 mouth a shade darker than the skin.
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
export function buildFigureGeometry(l: Hd2dLook): THREE.BufferGeometry {
  const k = new Kit();
  k.jitter = 0.03;
  const hk = new Kit();
  hk.jitter = 0.02;
  const boot = l.shoes;
  const torso = l.vest ?? l.top;
  const trim = l.trim ?? darker(l.top, 0.62);
  // Legs + boots (or a robe).
  if (l.robe) {
    k.limb(l.bottom, [0, 0.06, 0], [0, 0.5, 0], 0.2, 0.13, 8);
    // Hem band (trim) and a front panel with trimmed edges: the robe reads as tailored cloth.
    k.limb(l.trim ? trim : darker(l.bottom, 0.72), [0, 0.03, 0], [0, 0.1, 0], 0.21, 0.205, 8);
    if (l.panel) {
      box(k, l.panel, [0, 0.27, 0.165], [0.1, 0.4, 0.02], [-0.16, 0, 0]);
      k.sym((sx) => box(k, trim, [sx * 0.06, 0.27, 0.166], [0.026, 0.4, 0.022], [-0.16, 0, 0]));
    }
    // Two fold lines down the skirt.
    k.sym((sx) => box(k, darker(l.bottom, 0.66), [sx * 0.11, 0.24, 0.13], [0.026, 0.3, 0.02], [-0.18, sx * 0.5, 0]));
    k.sym((sx) => k.ball(boot, [sx * 0.07, 0.035, 0.08], [0.06, 0.04, 0.08], { detail: 0 }));
  } else {
    k.sym((sx) => {
      k.limb(l.bottom, [sx * 0.07, 0.1, 0], [sx * 0.075, 0.44, 0], 0.052, 0.062, 6);
      // Knee band + a crease down the front of each leg: the legs read as cloth, not tubes.
      k.limb(darker(l.bottom, 0.74), [sx * 0.07, 0.17, 0.002], [sx * 0.071, 0.2, 0.002], 0.056, 0.057, 6);
      box(k, darker(l.bottom, 0.66), [sx * 0.072, 0.32, 0.058], [0.024, 0.2, 0.012]);
      // Chunky boots with a lighter cuff and a dark sole: they anchor the figure on the ground.
      k.ball(boot, [sx * 0.07, 0.05, 0.03], [0.066, 0.056, 0.098], { detail: 0 });
      box(k, darker(boot, 0.45), [sx * 0.07, 0.008, 0.03], [0.12, 0.016, 0.19]);
      k.limb(lighter(boot, 0.22), [sx * 0.07, 0.09, 0], [sx * 0.07, 0.14, 0], 0.062, 0.06, 6);
      // Side pocket at the hip.
      box(k, darker(l.bottom, 0.7), [sx * 0.118, 0.39, 0.02], [0.016, 0.05, 0.05]);
    });
    k.ball(l.bottom, [0, 0.45, 0], [0.13, 0.07, 0.09], { detail: 0 });
  }
  // Torso: a jacket (or vest) tapered from the shoulders to a narrow waist, a hem and a placket.
  k.limb(torso, [0, 0.42, 0], [0, 0.72, 0], 0.13, 0.17, 8);
  k.ball(l.top, [0, 0.7, 0], [0.17, 0.07, 0.115], { detail: 0 });
  k.limb(l.vest ? darker(torso, 0.74) : darker(l.top, 0.74), [0, 0.4, 0], [0, 0.46, 0], 0.142, 0.135, 8);
  // Placket: the shirt shows down a vest's opening; a jacket gets a lighter strip with toggles.
  if (l.vest) box(k, l.top, [0, 0.58, 0.112], [0.05, 0.24, 0.02]);
  else {
    box(k, lighter(l.top, 0.3), [0, 0.57, 0.107], [0.03, 0.26, 0.02]);
    for (const y of [0.5, 0.6]) box(k, darker(l.accent === l.top ? l.top : trim, 0.6), [0, y, 0.12], [0.032, 0.026, 0.012]);
  }
  // Chest pockets with a lighter flap edge (front), a waist fold line (back).
  k.sym((sx) => {
    box(k, darker(torso, 0.72), [sx * 0.072, 0.6, 0.118], [0.05, 0.048, 0.016]);
    box(k, lighter(torso, 0.22), [sx * 0.072, 0.628, 0.121], [0.054, 0.014, 0.016]);
  });
  box(k, darker(torso, 0.7), [0, 0.53, -0.12], [0.16, 0.022, 0.016]);
  // Belt with a buckle.
  box(k, l.accent === l.top ? darker(l.top, 0.55) : l.accent, [0, 0.45, 0], [0.27, 0.035, 0.2]);
  box(k, BUCKLE, [0, 0.45, 0.102], [0.04, 0.032, 0.012]);
  // Shoulders: round caps so the silhouette has a clear T of shoulders over the waist.
  k.sym((sx) => k.ball(l.top, [sx * 0.19, 0.7, 0], 0.07, { detail: 0 }));
  // Arms hang a little out from the body (readable gaps), swinging from the shoulders; a darker
  // forearm (the fold at the elbow) and a trimmed cuff.
  k.sym((sx) => {
    k.withRig({ kind: 'nod', pivot: [sx * 0.2, 0.7, 0], amp: 0.07, phase: sx > 0 ? 0 : Math.PI, speed: 2.2 }, () => {
      k.limb(l.top, [sx * 0.2, 0.7, 0], [sx * 0.24, 0.54, 0.01], 0.06, 0.052, 6);
      k.limb(darker(l.top, 0.8), [sx * 0.24, 0.54, 0.01], [sx * 0.245, 0.43, 0.035], 0.052, 0.046, 6);
      k.limb(l.trim ? trim : lighter(l.top, 0.3), [sx * 0.245, 0.445, 0.032], [sx * 0.245, 0.42, 0.036], 0.05, 0.049, 6); // cuff
      k.ball(l.skin, [sx * 0.245, 0.4, 0.04], 0.055, { detail: 0 });
    });
  });
  // Collar: a trimmed ring where the jacket meets the neck.
  k.limb(l.trim ? trim : lighter(l.top, 0.4), [0, 0.72, 0], [0, 0.755, 0], 0.1, 0.085, 8);
  // Neck (stretched with the body remap).
  k.withRig({ kind: 'nod', pivot: [0, 0.76, 0], amp: 0.03, phase: 0.6, speed: 1.4 }, () => {
    k.limb(darker(l.skin, 0.86), [0, 0.72, 0], [0, 0.79, 0], 0.042, 0.042, 6);
  });
  // Head (own kit, set on the neck below): skull, hair mass at the back, a fringe over the brow,
  // spiky crown tufts that poke out above any hat, a highlight streak, a clean face.
  hk.withRig({ kind: 'nod', pivot: [0, 0.76, 0], amp: 0.03, phase: 0.6, speed: 1.4 }, () => {
    hk.ball(l.skin, [0, 0.88, 0.005], [0.125, 0.13, 0.12]);
    hk.ball(l.hair, [0, 0.905, -0.03], [0.133, 0.128, 0.12]);
    hk.ball(l.hair, [0, 0.83, -0.07], [0.11, 0.08, 0.07], { detail: 0 });
    // Side tufts over the ears (read under caps and from behind).
    hk.sym((sx) => hk.cone(l.hair, [sx * 0.11, 0.9, -0.01], [sx * 0.15, 0.82, -0.03], 0.04, 4));
    hk.cone(darker(l.hair, 0.78), [0.02, 0.86, -0.11], [0.03, 0.78, -0.16], 0.04, 4);
    // Hair highlight: a lighter streak across the crown and one strand on the fringe.
    hk.ball(lighter(l.hair, 0.38), [-0.03, 0.975, -0.02], [0.07, 0.03, 0.075], { detail: 0, jitter: 0 });
    // Fringe: a hair band across the forehead with three points, ending just above the brows.
    box(hk, l.hair, [0, 0.958, 0.098], [0.2, 0.036, 0.05], [-0.25, 0, 0]);
    for (const x of [-0.06, 0, 0.06]) hk.cone(l.hair, [x, 0.962, 0.108], [x + 0.01, 0.936, 0.124], 0.028, 4);
    box(hk, lighter(l.hair, 0.38), [-0.05, 0.962, 0.122], [0.03, 0.016, 0.012], [-0.25, 0, 0]);
    // Spiky crown: under a hat the spikes fan out from below its back rim (they stick out past
    // the hat's silhouette instead of poking through it); bare-headed, they stand on top.
    const covered = l.hat === 'cap' || l.hat === 'beanie' || l.hat === 'ranger' || l.hat === 'souwester';
    const spikes: [number, number, number, number, number, number][] = covered
      ? [[-0.08, 0.93, -0.08, -0.16, 0.95, -0.19], [0.0, 0.94, -0.1, 0.0, 0.96, -0.23], [0.08, 0.93, -0.08, 0.16, 0.95, -0.19]]
      : [[-0.07, 0.99, -0.04, -0.12, 1.09, -0.1], [0.0, 1.0, -0.06, 0.0, 1.12, -0.14], [0.07, 0.99, -0.04, 0.12, 1.09, -0.1], [0, 0.95, -0.11, 0.02, 0.99, -0.21]];
    for (const [x, y, z, tx, ty, tz] of spikes) hk.cone(l.hair, [x, y, z], [tx, ty, tz], 0.045, 4);
    // Face on a texel grid (1 texel ≈ 0.025 units), top to bottom: brow bars under the fringe,
    // one skin row, 1×2-texel dark eyes with three skin texels between them, a skin row with a
    // nose shade, a small mouth a shade darker than the skin. Features never touch.
    hk.sym((sx) => {
      box(hk, darker(l.hair, 0.62), [sx * 0.05, 0.925, 0.118], [0.05, 0.016, 0.02], [0, 0, -sx * 0.08]);
      box(hk, OUTLINE_DARK, [sx * 0.05, 0.868, 0.12], [0.026, 0.048, 0.014]);
    });
    box(hk, darker(l.skin, 0.8), [0, 0.835, 0.122], [0.024, 0.02, 0.012]);
    box(hk, darker(l.skin, 0.6), [0, 0.8, 0.108], [0.044, 0.018, 0.016]);
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

function hat(k: Kit, l: Hd2dLook) {
  switch (l.hat) {
    case 'cap':
      // Seated above the brow (the eyes and brows stay visible under the brim); a lighter crown
      // panel, a darker seam ring.
      k.ball(l.hatColor, [0, 1.0, -0.01], [0.14, 0.07, 0.138]);
      k.ball(lighter(l.hatColor, 0.25), [-0.03, 1.035, 0.02], [0.08, 0.035, 0.08], { detail: 0, jitter: 0 });
      box(k, l.accent === l.hatColor ? darker(l.hatColor, 0.72) : l.accent, [0, 0.945, 0.13], [0.2, 0.022, 0.11], [0.14, 0, 0]);
      k.ball(darker(l.hatColor, 0.72), [0, 1.066, -0.01], 0.022, { detail: 0 });
      // Our own orb-bud emblem on the front.
      k.gem(l.hatColor === l.accent ? '#fff4d8' : l.accent, [0, 1.0, 0.13], [0.026, 0.03, 0.012]);
      break;
    case 'ranger':
      k.limb(l.hatColor, [0, 0.965, 0], [0, 0.985, 0], 0.17, 0.17, 10);
      k.limb(l.hatColor, [0, 0.985, 0], [0, 1.08, 0], 0.12, 0.105, 8);
      k.limb(l.accent, [0, 0.985, 0], [0, 1.012, 0], 0.123, 0.12, 8);
      // A pinched crown: a darker dent line across the top.
      box(k, darker(l.hatColor, 0.7), [0, 1.082, 0], [0.026, 0.012, 0.16]);
      break;
    case 'beanie':
      k.ball(l.hatColor, [0, 1.005, -0.015], [0.14, 0.085, 0.14]);
      k.limb(darker(l.hatColor, 0.74), [0, 0.94, -0.015], [0, 0.972, -0.015], 0.142, 0.142, 8);
      k.ball(l.accent, [0, 1.1, -0.015], 0.042, { detail: 0 });
      break;
    case 'band':
      k.limb(l.hatColor, [0, 0.935, 0], [0, 0.96, 0], 0.135, 0.135, 8);
      k.cone(l.hair, [0, 0.92, -0.11], [0, 0.6, -0.2], 0.06, 5);
      break;
    case 'souwester': {
      k.ball(l.hatColor, [0, 0.985, -0.01], [0.14, 0.09, 0.14]);
      // The brim tilts back off the face (front up, back down), like a rain hat pushed back; a
      // darker band where the brim meets the crown.
      const m = new THREE.Matrix4().compose(V(0, 0.94, -0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0)), V(1, 1, 1));
      k.geo(new THREE.CylinderGeometry(0.22, 0.18, 0.02, 10), m, l.hatColor);
      k.limb(darker(l.hatColor, 0.68), [0, 0.95, -0.01], [0, 0.975, -0.01], 0.142, 0.14, 8);
      break;
    }
    case 'goggles':
      // Pushed UP onto the hair, above the fringe: the strap round the crown, two small lenses
      // tilted skyward — the face stays clear.
      k.limb(OUTLINE_DARK, [0, 0.99, -0.01], [0, 1.015, -0.01], 0.138, 0.136, 8);
      k.sym((sx) => k.limb(darker(l.hatColor, 0.6), [sx * 0.05, 1.0, 0.1], [sx * 0.05, 1.03, 0.12], 0.036, 0.034, 6));
      k.sym((sx) => k.ball(lighter(l.hatColor, 0.3), [sx * 0.05, 1.034, 0.122], [0.028, 0.012, 0.024], { detail: 0, jitter: 0 }));
      k.cone(l.hair, [0, 1.0, -0.02], [0, 1.12, -0.09], 0.1, 5);
      break;
    case 'crown':
      k.limb(l.hatColor, [0, 0.98, 0], [0, 1.03, 0], 0.1, 0.11, 8);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.cone(l.hatColor, [Math.sin(a) * 0.09, 1.02, Math.cos(a) * 0.09], [Math.sin(a) * 0.1, 1.1, Math.cos(a) * 0.1], 0.025, 4);
      }
      k.limb(darker(l.hatColor, 0.7), [0, 0.975, 0], [0, 0.992, 0], 0.104, 0.104, 8);
      k.gem('#ff4d6d', [0, 1.01, 0.11], [0.025, 0.03, 0.015]);
      break;
  }
}

function prop(k: Kit, l: Hd2dLook) {
  switch (l.prop) {
    case 'pack': {
      // A compact ochre rucksack: darker flap with two buckles, a back pocket, a rolled bedroll
      // on top, dark straps over the shoulders.
      box(k, PACK, [0, 0.6, -0.17], [0.2, 0.24, 0.12]);
      box(k, darker(PACK, 0.74), [0, 0.685, -0.175], [0.215, 0.075, 0.135]);
      k.sym((sx) => box(k, BUCKLE, [sx * 0.055, 0.655, -0.244], [0.026, 0.026, 0.01]));
      box(k, darker(PACK, 0.66), [0, 0.56, -0.236], [0.13, 0.08, 0.016]);
      box(k, lighter(PACK, 0.2), [0, 0.596, -0.238], [0.134, 0.014, 0.016]);
      k.limb(BEDROLL, [-0.12, 0.76, -0.17], [0.12, 0.76, -0.17], 0.045, 0.045, 7);
      k.sym((sx) => k.limb(STRAP, [sx * 0.07 - 0.013, 0.76, -0.17], [sx * 0.07 + 0.013, 0.76, -0.17], 0.05, 0.05, 7));
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
      k.limb(darker(l.accent, 0.72), [0, 0.715, 0], [0, 0.73, 0], 0.112, 0.11, 8);
      k.cone(l.accent, [0.05, 0.74, -0.08], [0.12, 0.5, -0.16], 0.04, 4, 0.4);
      break;
    case 'cape':
      k.cone(l.accent === '#ffffff' ? '#d9d2ff' : l.accent, [0, 0.74, -0.08], [0, 0.04, -0.2], 0.2, 6, 0.35);
      k.cone('#b8321e', [0, 0.73, -0.06], [0, 0.07, -0.17], 0.17, 6, 0.3);
      k.limb(l.hatColor, [0, 0.72, 0], [0, 0.76, 0], 0.12, 0.11, 8);
      // Clasp at the collar.
      k.gem('#ff4d6d', [0, 0.74, 0.115], [0.026, 0.026, 0.012]);
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

  constructor(look: PersonLook, seed = 0, id?: string) {
    const { material, uniforms } = creatureMaterial();
    this.material = material;
    this.uniforms = uniforms;
    this.mesh = new THREE.Mesh(buildFigureGeometry(hd2dLook(look, id)), material);
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
export function trainerFigure(id: string): Figure { return new Figure(trainerLook(id), 2, id); }
