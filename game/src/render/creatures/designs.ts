// Bespoke low-poly builders for every Orbkin species (see docs/CREATURES.md).
// Model space: facing +Z, y up, lowest point is shifted onto y = 0 by Kit.build().
import * as THREE from 'three';
import { Kit, V, surface, type Col, type Paint } from './kit';
import { boltShape, decal, eyes, flame, FLAME, frame, leaf, leafShape, leg, mouth, petalShape, slabAt, thistle, under } from './parts';

export type IdleStyle = 'trot' | 'bounce' | 'float' | 'sway' | 'heavy' | 'glide';

export interface Design {
  /** Overall size (replaces look.scale). */
  scale: number;
  /** Idle hover height in model units (0 = standing). */
  hover?: number;
  idle: IdleStyle;
  build(k: Kit): void;
}

const S = (sx: number, x: number) => sx * x;
const sym = (k: Kit, fn: (sx: number) => void) => k.sym(fn);
const twitch = (pivot: THREE.Vector3, sx: number, amp = 0.3) => ({ kind: 'twitch' as const, pivot, amp, phase: sx * 1.3 + 0.4, speed: 1.15 });

// ----------------------------------------------------------------------------------------
// Flame line: Ashkit → Cindertail → Pyrelord
// ----------------------------------------------------------------------------------------

function foxEar(k: Kit, base: THREE.Vector3, tip: THREE.Vector3, w: number, main: Col, inner: Col, soot: Col, sx: number) {
  k.withRig(twitch(base, sx, 0.35), () => {
    k.blade(main, base, tip, w, w * 0.5, V(0, 0.15, 1));
    const d = tip.clone().sub(base);
    k.blade(inner, base.clone().add(V(0, 0.02, 0.035)), base.clone().addScaledVector(d, 0.78).add(V(0, 0, 0.03)), w * 0.6, w * 0.25, V(0, 0.15, 1));
    k.blade(soot, base.clone().addScaledVector(d, 0.66), tip.clone().addScaledVector(d, 0.04), w * 0.4, w * 0.24, V(0, 0.15, 1));
  });
}

const ashkit: Design = {
  scale: 0.88, idle: 'trot',
  build(k) {
    const main = '#ff7a2e', cream = '#ffe8c4', soot = '#3d2c3e';
    // Body: a chubby egg with a cream belly.
    k.orb(under(main, cream, -0.3), [0, 0.44, -0.06], [0.24, 0.22, 0.3]);
    k.orb((n) => (n.z > 0.2 ? cream : main), [0, 0.5, 0.14], [0.17, 0.17, 0.13]);
    // Stubby legs with sooty socks.
    sym(k, (sx) => {
      leg(k, { pts: [[S(sx, 0.12), 0.4, 0.1], [S(sx, 0.13), 0.2, 0.12], [S(sx, 0.13), 0.07, 0.13]], radii: [0.075, 0.066, 0.058], paints: [main, soot], paw: { paint: soot, r: [0.072, 0.05, 0.085] } });
      k.orb(main, [S(sx, 0.14), 0.4, -0.22], [0.1, 0.13, 0.13]);
      leg(k, { pts: [[S(sx, 0.14), 0.33, -0.22], [S(sx, 0.145), 0.18, -0.26], [S(sx, 0.145), 0.07, -0.24]], radii: [0.078, 0.064, 0.056], paints: [main, soot], paw: { paint: soot, r: [0.072, 0.05, 0.085] } });
    });
    // Big head (kits are mostly head) with a cream mask.
    const head = k.orb((n, c) => (c.y < 0.8 && n.z > -0.05 ? cream : main), [0, 0.84, 0.14], [0.3, 0.26, 0.26], { w: 10, h: 7 });
    k.orb(cream, [0, 0.76, 0.36], [0.11, 0.08, 0.1]);
    k.orb(soot, [0, 0.79, 0.455], [0.04, 0.032, 0.03], { w: 6, h: 4 });
    sym(k, (sx) => k.cone(cream, V(S(sx, 0.22), 0.76, 0.18), V(S(sx, 0.36), 0.7, 0.12), 0.07, 4, 0.6));
    eyes(k, head, { yaw: 0.42, pitch: 0.1, size: 0.075, aspect: 1.28 });
    // Huge ears with soot tips.
    sym(k, (sx) => foxEar(k, V(S(sx, 0.15), 1.0, 0.1), V(S(sx, 0.31), 1.4, 0.02), 0.13, main, cream, soot, sx));
    // Fluffy short tail that ends in a glowing ember.
    const tb = V(0, 0.5, -0.3);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.32, speed: 4.6 }, () => {
      k.tube((n, c) => (c.y > 0.8 ? cream : main), [tb, [0, 0.58, -0.46], [0, 0.73, -0.55], [0, 0.88, -0.55]], (t) => 0.07 + 0.075 * Math.sin(Math.PI * t), { segs: 8, sides: 7 });
      k.orb(FLAME.core, [0, 0.93, -0.55], 0.075, { w: 6, h: 4 });
      k.cone(FLAME.mid, V(0, 0.93, -0.55), V(0, 1.14, -0.6), 0.07, 5);
      k.cone(FLAME.outer, V(0.03, 0.92, -0.58), V(0.06, 1.06, -0.66), 0.045, 4);
    });
  },
};

const cindertail: Design = {
  scale: 0.92, idle: 'trot',
  build(k) {
    const main = '#f0502a', cream = '#ffdca6', soot = '#34263b', gold = '#ffcc33';
    k.orb(under(main, cream), [0, 0.58, -0.34], [0.2, 0.21, 0.21]);
    k.tube(under(main, cream, -0.45), [[0, 0.58, -0.4], [0, 0.6, -0.16], [0, 0.65, 0.04], [0, 0.7, 0.18]], (t) => 0.19 + 0.03 * t + 0.03 * Math.sin(Math.PI * t), { segs: 6, sides: 8 });
    k.orb((n, c) => (n.z > 0.35 && c.y < 0.8 ? cream : main), [0, 0.7, 0.18], [0.22, 0.23, 0.21]);
    k.limb((n) => (n.z > 0.45 ? cream : main), V(0, 0.76, 0.22), V(0, 0.95, 0.34), 0.15, 0.12, 7);
    // Flame ruff on the chest.
    for (const x of [-0.09, 0, 0.09]) k.cone(x === 0 ? gold : cream, V(x * 0.8, 0.82, 0.36), V(x * 1.6, 0.56, 0.44), 0.085, 4);
    // Legs: longer than the kit's, with sooty boots.
    sym(k, (sx) => {
      leg(k, { pts: [[S(sx, 0.14), 0.64, 0.18], [S(sx, 0.15), 0.36, 0.2], [S(sx, 0.15), 0.07, 0.24]], radii: [0.1, 0.08, 0.065], paints: [main, soot], paw: { paint: soot, r: [0.085, 0.055, 0.1] } });
      k.orb(main, [S(sx, 0.15), 0.55, -0.34], [0.13, 0.18, 0.17]);
      leg(k, { pts: [[S(sx, 0.16), 0.5, -0.32], [S(sx, 0.17), 0.32, -0.24], [S(sx, 0.17), 0.17, -0.4], [S(sx, 0.17), 0.07, -0.37]], radii: [0.1, 0.08, 0.065, 0.06], paints: [main, soot, soot], paw: { paint: soot, r: [0.085, 0.055, 0.1] } });
    });
    // Narrower head with a long snout.
    const head = k.orb((n, c) => (c.y < 0.98 && n.z > 0 ? cream : main), [0, 1.02, 0.38], [0.23, 0.2, 0.23], { w: 9, h: 6 });
    k.cone((n) => (n.y < 0.15 ? cream : main), V(0, 0.98, 0.5), V(0, 0.94, 0.76), 0.11, 6, 0.8);
    k.orb(soot, [0, 0.95, 0.755], [0.04, 0.032, 0.03], { w: 6, h: 4 });
    sym(k, (sx) => k.cone(cream, V(S(sx, 0.17), 0.95, 0.36), V(S(sx, 0.35), 0.89, 0.28), 0.07, 4, 0.6));
    eyes(k, head, { yaw: 0.52, pitch: 0.15, size: 0.066, aspect: 1.05, roll: 0.22 });
    sym(k, (sx) => foxEar(k, V(S(sx, 0.12), 1.15, 0.33), V(S(sx, 0.26), 1.52, 0.17), 0.11, main, cream, soot, sx));
    // Bushy tail ending in a big flame plume.
    const tb = V(0, 0.62, -0.46);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.2, speed: 3.2 }, () => {
      k.tube(main, [tb, [0, 0.74, -0.68], [0, 0.94, -0.82], [0, 1.12, -0.84]], (t) => 0.085 + 0.05 * t, { segs: 7, sides: 6 });
      flame(k, V(0, 1.12, -0.84), 0.6, 0.19, { dir: [0, 1, -0.2], phase: 1, static: true });
    });
  },
};

const pyrelord: Design = {
  scale: 0.98, idle: 'heavy',
  build(k) {
    const main = '#d8321e', gold = '#ffcf7a', soot = '#2c2230', yel = '#ffe14d';
    k.orb(under(main, gold), [0, 0.8, -0.52], [0.3, 0.3, 0.3]);
    k.tube(under(main, gold, -0.45), [[0, 0.8, -0.58], [0, 0.84, -0.28], [0, 0.92, 0], [0, 1.0, 0.2]], (t) => 0.26 + 0.08 * t + 0.04 * Math.sin(Math.PI * t), { segs: 5, sides: 8 });
    k.orb((n, c) => (n.z > 0.4 && c.y < 1.05 ? gold : main), [0, 0.98, 0.22], [0.36, 0.37, 0.33]);
    k.limb(main, V(0, 1.05, 0.3), V(0, 1.3, 0.48), 0.22, 0.17, 7);
    for (const [y, z] of [[1.24, 0.0], [1.15, -0.28], [1.08, -0.52]] as const) k.gem(yel, [0, y, z], [0.07, 0.11, 0.07], [-0.4, 0, 0]);
    // Heavy legs: crimson upper, charcoal gauntlets with gold bands and claws.
    sym(k, (sx) => {
      k.orb(main, [S(sx, 0.24), 0.9, 0.2], [0.17, 0.22, 0.2], { w: 8, h: 5 });
      leg(k, { pts: [[S(sx, 0.25), 0.84, 0.2], [S(sx, 0.26), 0.5, 0.18], [S(sx, 0.26), 0.1, 0.26]], radii: [0.16, 0.13, 0.11], paints: [main, soot], paw: { paint: soot, r: [0.14, 0.08, 0.16], toes: { paint: gold, n: 3, size: 0.035 } } });
      k.limb(gold, V(S(sx, 0.26), 0.53, 0.18), V(S(sx, 0.26), 0.44, 0.19), 0.142, 0.138, 7);
      k.orb(main, [S(sx, 0.25), 0.78, -0.52], [0.18, 0.27, 0.23], { w: 8, h: 5 });
      leg(k, { pts: [[S(sx, 0.26), 0.7, -0.52], [S(sx, 0.27), 0.44, -0.4], [S(sx, 0.27), 0.22, -0.62], [S(sx, 0.27), 0.08, -0.58]], radii: [0.16, 0.13, 0.11, 0.095], paints: [main, soot, soot], paw: { paint: soot, r: [0.14, 0.08, 0.16], toes: { paint: gold, n: 3, size: 0.035 } } });
    });
    // Fiery mane collar sweeping back from the neck.
    const nc = V(0, 1.18, 0.4);
    const axis = V(0, 0.27, 0.2).normalize();
    const u = V(1, 0, 0);
    const w = new THREE.Vector3().crossVectors(axis, u).normalize();
    const cols = [FLAME.outer, FLAME.mid, FLAME.core];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const out = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(w, Math.sin(a));
      const from = nc.clone().addScaledVector(out, 0.18);
      const dir = out.clone().multiplyScalar(0.6).add(V(0, 0.3, -0.9)).normalize();
      k.withRig({ kind: 'flicker', pivot: from, amp: 0.15, phase: i * 1.7, speed: 8 }, () => {
        k.cone(cols[i % 3]!, from, from.clone().addScaledVector(dir, 0.34 + 0.07 * (i % 2)), 0.11, 4);
      });
    }
    // Head: proud, with muzzle, fangs, golden eyes and a flame crown between swept horns.
    const head = k.orb((n, c) => (c.y < 1.35 && n.z > 0.1 ? gold : main), [0, 1.4, 0.6], [0.27, 0.24, 0.27], { w: 9, h: 6 });
    k.orb((n) => (n.y < 0.2 ? gold : main), [0, 1.31, 0.82], [0.15, 0.11, 0.17], { w: 8, h: 5 });
    k.orb(soot, [0, 1.35, 0.985], [0.05, 0.038, 0.036], { w: 6, h: 4 });
    sym(k, (sx) => k.cone('#ffffff', V(S(sx, 0.065), 1.24, 0.9), V(S(sx, 0.07), 1.16, 0.91), 0.026, 4));
    eyes(k, head, { yaw: 0.55, pitch: 0.12, size: 0.064, aspect: 0.85, iris: '#ffd23f', brow: { color: soot, tilt: 0.35, thick: 0.38 } });
    sym(k, (sx) => {
      k.tube(soot, [[S(sx, 0.13), 1.58, 0.6], [S(sx, 0.2), 1.72, 0.48], [S(sx, 0.26), 1.8, 0.28]], (t) => 0.06 - 0.038 * t, { segs: 5, sides: 5 });
      foxEar(k, V(S(sx, 0.19), 1.54, 0.5), V(S(sx, 0.33), 1.72, 0.36), 0.1, main, gold, soot, sx);
    });
    flame(k, V(0, 1.6, 0.62), 0.5, 0.11, { phase: 0.5 });
    sym(k, (sx) => flame(k, V(S(sx, 0.11), 1.58, 0.53), 0.34, 0.08, { dir: [S(sx, 0.35), 1, -0.1], phase: 2 + sx, tongues: 2 }));
    // Long tail with a comet flame.
    const tb = V(0, 0.86, -0.74);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.13, speed: 2.4 }, () => {
      k.tube(main, [tb, [0, 0.96, -0.98], [0, 1.18, -1.1], [0, 1.42, -1.06]], (t) => 0.12 - 0.03 * t, { segs: 6, sides: 6 });
      flame(k, V(0, 1.42, -1.06), 0.72, 0.24, { dir: [0, 1, -0.25], phase: 3, static: true, tongues: 4 });
    });
  },
};

// ----------------------------------------------------------------------------------------
// Tide line: Dropple → Rillback → Maelstrode
// ----------------------------------------------------------------------------------------

const dropple: Design = {
  scale: 0.9, idle: 'bounce',
  build(k) {
    const main = '#3fa9f5', light = '#c8ecff', deep = '#1f5fd1';
    k.lathe((n, c) => (n.z > 0.3 && c.y < 0.42 && c.y > 0.05 ? light : main),
      [[0, 0], [0.26, 0.02], [0.38, 0.1], [0.44, 0.24], [0.43, 0.38], [0.37, 0.52], [0.27, 0.64], [0.16, 0.75], [0.07, 0.84], [0, 0.9]], [0, 0, 0], { segs: 11 });
    const proxy = { c: V(0, 0.37, 0), r: V(0.43, 0.43, 0.43), q: new THREE.Quaternion() };
    // Curling droplet tip.
    k.withRig({ kind: 'nod', pivot: V(0, 0.82, 0), amp: 0.12, speed: 2.4 }, () => {
      k.tube(main, [[0, 0.8, 0.01], [0, 0.95, -0.02], [0, 1.02, -0.11], [0, 0.98, -0.2]], (t) => 0.075 * (1 - t) + 0.028, { segs: 6, sides: 6 });
    });
    decal(k, proxy, -0.75, 0.62, 0.05, 0.09, '#ffffff');
    decal(k, proxy, -0.55, 0.78, 0.035, 0.035, '#ffffff');
    eyes(k, proxy, { yaw: 0.36, pitch: 0.12, size: 0.085, aspect: 1.32 });
    mouth(k, proxy, -0.1, 0.055, '#183a7a', 0.5);
    sym(k, (sx) => {
      k.withRig({ kind: 'flap', pivot: V(S(sx, 0.38), 0.24, 0.04), amp: 0.35, speed: 3.2 }, () => {
        slabAt(k, deep, leafShape(0.26, 0.17), 0.06, V(S(sx, 0.37), 0.25, 0.04), V(S(sx, 0.9), -0.35, 0.1), V(0, 0.25, 1));
      });
      k.orb(deep, [S(sx, 0.17), 0.045, 0.16], [0.1, 0.045, 0.11], { w: 7, h: 4 });
    });
  },
};

const rillback: Design = {
  scale: 0.95, idle: 'trot',
  build(k) {
    const main = '#2d8fe0', belly = '#c4ebff', board = '#f2fbff', stripe = '#1d5fc4', dark = '#163a6e';
    k.orb(under(main, belly), [0, 0.36, -0.46], [0.21, 0.18, 0.2]);
    k.tube(under(main, belly, -0.3), [[0, 0.34, -0.5], [0, 0.37, -0.22], [0, 0.41, 0.08], [0, 0.45, 0.28]], (t) => 0.205 + 0.03 * Math.sin(Math.PI * t), { segs: 6, sides: 8, flat: 0.85 });
    k.orb((n) => (n.z > 0.3 ? belly : main), [0, 0.45, 0.26], [0.21, 0.2, 0.2]);
    // Signature: the broad flat surf-board back with a racing stripe.
    const boardOutline: [number, number][] = [[0, -0.52], [0.15, -0.44], [0.22, -0.2], [0.22, 0.14], [0.15, 0.38], [0, 0.5], [-0.15, 0.38], [-0.22, 0.14], [-0.22, -0.2], [-0.15, -0.44]];
    k.slab(board, boardOutline, 0.08, [0, 0.6, -0.12], [-Math.PI / 2 + 0.07, 0, 0], [1.15, 1, 1]);
    k.slab(stripe, [[0, -0.44], [0.045, -0.32], [0.045, 0.3], [0, 0.42], [-0.045, 0.3], [-0.045, -0.32]], 0.05, [0, 0.638, -0.12], [-Math.PI / 2 + 0.07, 0, 0], [1.15, 1, 1], 0.2);
    k.limb((n) => (n.z > 0.3 ? belly : main), V(0, 0.46, 0.28), V(0, 0.57, 0.38), 0.14, 0.12, 7);
    const head = k.orb(main, [0, 0.65, 0.46], [0.23, 0.2, 0.22], { w: 9, h: 6 });
    k.orb(belly, [0, 0.575, 0.64], [0.13, 0.09, 0.09]);
    k.orb(dark, [0, 0.615, 0.725], [0.045, 0.034, 0.03], { w: 6, h: 4 });
    sym(k, (sx) => {
      k.withRig(twitch(V(S(sx, 0.17), 0.79, 0.4), sx, 0.25), () => {
        k.orb(main, [S(sx, 0.17), 0.82, 0.39], [0.075, 0.075, 0.045], { w: 7, h: 4 });
        k.orb(dark, [S(sx, 0.17), 0.82, 0.418], [0.04, 0.04, 0.022], { w: 6, h: 4 });
      });
      for (const dy of [0, -0.035]) k.limb('#ffffff', V(S(sx, 0.11), 0.59 + dy, 0.7), V(S(sx, 0.24), 0.58 + dy * 1.6, 0.69), 0.016, 0.013, 4);
    });
    eyes(k, head, { yaw: 0.5, pitch: 0.2, size: 0.056, aspect: 1.12 });
    // Little head fin.
    slabAt(k, board, leafShape(0.2, 0.13), 0.05, V(0, 0.82, 0.48), V(0, 0.55, -1), V(1, 0, 0));
    // Webbed paws.
    sym(k, (sx) => {
      leg(k, { pts: [[S(sx, 0.14), 0.38, 0.25], [S(sx, 0.16), 0.2, 0.29], [S(sx, 0.16), 0.06, 0.31]], radii: [0.09, 0.075, 0.065], paints: [main], paw: { paint: stripe, r: [0.095, 0.05, 0.115] } });
      k.orb(main, [S(sx, 0.16), 0.36, -0.4], [0.11, 0.13, 0.14]);
      leg(k, { pts: [[S(sx, 0.15), 0.32, -0.4], [S(sx, 0.17), 0.18, -0.36], [S(sx, 0.17), 0.06, -0.42]], radii: [0.09, 0.072, 0.064], paints: [main], paw: { paint: stripe, r: [0.095, 0.05, 0.115] } });
    });
    // Flat paddle tail with a fluke.
    const tb = V(0, 0.34, -0.55);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.22, speed: 2.4 }, () => {
      k.tube(main, [tb, [0, 0.3, -0.76], [0, 0.24, -0.95]], (t) => 0.11 - 0.05 * t, { segs: 5, sides: 6, flat: 0.55 });
      slabAt(k, board, [[0, 0], [0.12, 0.04], [0.28, 0.17], [0.24, 0.23], [0.08, 0.15], [0, 0.11], [-0.08, 0.15], [-0.24, 0.23], [-0.28, 0.17], [-0.12, 0.04]], 0.06, V(0, 0.24, -0.96), V(0, -0.15, -1), V(0, 1, 0));
    });
  },
};

const maelstrode: Design = {
  scale: 1.0, idle: 'sway',
  build(k) {
    const main = '#1e64c8', belly = '#9ee0ff', fin = '#eef4ff', deep = '#143f8c';
    // One continuous body: a whirlpool coil on the ground rising into a proud neck.
    const centers: THREE.Vector3[] = [];
    const radii: number[] = [];
    const turns = 1.55, cz = -0.22;
    const N = 26;
    const a0 = -turns * Math.PI * 2;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = a0 + s * turns * Math.PI * 2;
      const rho = 0.06 + 0.42 * s;
      const r = 0.045 + 0.175 * s;
      centers.push(V(rho * Math.sin(a), r + (1 - s) * 0.16, cz + rho * Math.cos(a)));
      radii.push(r);
    }
    const rise = new THREE.CatmullRomCurve3([centers[N]!.clone(), V(0, 0.42, 0.33), V(-0.02, 0.82, 0.3), V(0, 1.16, 0.32), V(0, 1.34, 0.4)], false, 'centripetal');
    for (let i = 1; i <= 10; i++) {
      centers.push(rise.getPointAt(i / 10));
      radii.push(0.22 - 0.07 * (i / 10));
    }
    k.tubePath((n, c) => (n.y < -0.45 || (c.y > 0.32 && n.z > 0.5) ? belly : main), centers, radii, { sides: 8 });
    // Dorsal fins along the coil and up the neck.
    for (const i of [8, 13, 18, 23]) {
      const p = centers[i]!, nx = centers[i + 1]!;
      const tan = nx.clone().sub(p).normalize();
      const side = new THREE.Vector3().crossVectors(tan, V(0, 1, 0)).normalize();
      slabAt(k, fin, [[-0.07, 0], [0.07, 0], [-0.05, 0.14 + i * 0.004]], 0.05, p.clone().add(V(0, radii[i]! * 0.82, 0)), tan.clone().multiplyScalar(-0.5).add(V(0, 1, 0)), side);
    }
    for (const i of [29, 32, 35]) {
      const p = centers[i]!;
      slabAt(k, fin, [[-0.06, 0], [0.07, 0], [-0.04, 0.17]], 0.05, p.clone().add(V(0, 0, -radii[i]! * 0.85)), V(0, 0.4, -1), V(1, 0, 0));
    }
    // Tail-tip fluke rising from the centre of the whorl.
    slabAt(k, fin, leafShape(0.3, 0.18), 0.055, centers[0]!.clone().add(V(0, 0.02, 0)), V(0, 1, 0.15), V(1, 0, 0));
    // Head.
    const head = k.orb(main, [0, 1.42, 0.46], [0.19, 0.17, 0.22], { w: 9, h: 6 });
    k.orb((n) => (n.y < 0 ? belly : main), [0, 1.37, 0.66], [0.125, 0.09, 0.15], { w: 8, h: 5 });
    sym(k, (sx) => k.orb(deep, [S(sx, 0.05), 1.42, 0.79], [0.022, 0.016, 0.016], { w: 5, h: 3 }));
    eyes(k, head, { yaw: 0.6, pitch: 0.22, size: 0.052, aspect: 0.95, iris: '#ffe14d', brow: { color: fin, tilt: 0.3, thick: 0.35 } });
    slabAt(k, fin, leafShape(0.34, 0.15), 0.05, V(0, 1.56, 0.44), V(0, 0.55, -1), V(1, 0, 0));
    sym(k, (sx) => {
      k.withRig(twitch(V(S(sx, 0.15), 1.46, 0.4), sx, 0.25), () => {
        slabAt(k, fin, leafShape(0.44, 0.2), 0.05, V(S(sx, 0.15), 1.46, 0.4), V(S(sx, 0.75), 0.35, -0.75), V(sx, 0.25, 0.5));
        slabAt(k, deep, leafShape(0.3, 0.12), 0.06, V(S(sx, 0.16), 1.47, 0.39), V(S(sx, 0.75), 0.35, -0.75), V(sx, 0.25, 0.5));
      });
      // Thick drooping barbels.
      k.withRig({ kind: 'nod', pivot: V(S(sx, 0.1), 1.35, 0.72), amp: 0.18, phase: sx, speed: 1.8 }, () => {
        k.tube(fin, [[S(sx, 0.09), 1.35, 0.72], [S(sx, 0.2), 1.3, 0.78], [S(sx, 0.29), 1.18, 0.74], [S(sx, 0.31), 1.05, 0.64]], (t) => 0.036 - 0.016 * t, { segs: 6, sides: 5 });
      });
    });
  },
};

// ----------------------------------------------------------------------------------------
// Flora line: Mossling → Thistlehorn → Verdantusk
// ----------------------------------------------------------------------------------------

const mossling: Design = {
  scale: 0.9, idle: 'bounce',
  build(k) {
    const main = '#5cc94a', light = '#e9ffc0', dark = '#3a9a3a', pink = '#ff8fb0';
    const body = k.orb((n, c) => (n.z > 0.5 && c.y < 0.48 ? light : main), [0, 0.42, 0], [0.42, 0.38, 0.4], { w: 10, h: 7, jitter: 0.12 });
    const clumps: [number, number, number, Col][] = [[Math.PI, 0.45, 0.15, dark], [2.3, 0.25, 0.13, dark], [-2.3, 0.25, 0.13, dark], [1.7, 0.6, 0.12, '#7ad85a'], [-1.7, 0.6, 0.12, '#7ad85a'], [Math.PI, 1.0, 0.13, '#7ad85a'], [1.0, 1.05, 0.11, dark], [-1.0, 1.05, 0.11, dark], [2.6, 0.85, 0.12, main]];
    for (const [yaw, pitch, r, c] of clumps) k.ball(c, surface(body, yaw, pitch, 0.92).p, r, { detail: 0, jitter: 0.15 });
    // Tiny pink blossom tucked in the moss.
    const bp = surface(body, 2.5, 0.75, 1.02).p;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; k.ball(pink, bp.clone().add(V(Math.cos(a) * 0.04, 0.02, Math.sin(a) * 0.04)), [0.035, 0.02, 0.035], { detail: 0 }); }
    k.ball('#ffe066', bp.clone().add(V(0, 0.035, 0)), 0.022, { detail: 0 });
    // Sprout that follows the sun.
    k.withRig({ kind: 'nod', pivot: V(0, 0.76, 0), amp: 0.16, speed: 2.1 }, () => {
      k.limb('#3c7a2a', V(0, 0.74, 0), V(0, 1.0, 0.03), 0.034, 0.028, 5);
      sym(k, (sx) => leaf(k, '#86e65c', V(0, 0.98, 0.03), V(sx, 0.55, 0.05), V(S(sx, -0.45), 1, 0.2), 0.26, 0.15, 0.04, '#c4f59a'));
    });
    eyes(k, body, { yaw: 0.36, pitch: 0.1, size: 0.08, aspect: 1.3 });
    sym(k, (sx) => decal(k, body, S(sx, 0.66), -0.08, 0.065, 0.04, pink));
    mouth(k, body, -0.12, 0.05, '#2d5a26', 0.5);
    sym(k, (sx) => k.orb(dark, [S(sx, 0.17), 0.05, 0.13], [0.11, 0.05, 0.12], { w: 7, h: 4 }));
  },
};

const thistlehorn: Design = {
  scale: 0.95, idle: 'trot',
  build(k) {
    const main = '#3ead48', belly = '#ddf7ac', dark = '#24803a', thist = '#b04ad8', hoof = '#5a4030', horn = '#e8dcb0';
    k.orb(under(main, belly), [0, 0.63, -0.36], [0.22, 0.22, 0.23]);
    k.tube(under(main, belly, -0.4), [[0, 0.62, -0.42], [0, 0.63, -0.18], [0, 0.66, 0.06], [0, 0.7, 0.2]], (t) => 0.21 + 0.03 * Math.sin(Math.PI * t), { segs: 6, sides: 8 });
    k.orb((n) => (n.z > 0.4 ? belly : main), [0, 0.69, 0.2], [0.22, 0.23, 0.21]);
    // Leafy saddle shingled along the back.
    for (let i = 0; i < 3; i++) {
      const z = 0.06 - i * 0.18;
      const y = 0.9 - i * 0.012;
      sym(k, (sx) => leaf(k, i % 2 ? dark : '#2f9a40', V(S(sx, 0.03), y, z), V(S(sx, 0.85), 0.25, -0.5), V(S(sx, 0.35), 1, 0), 0.27, 0.17, 0.04));
    }
    leaf(k, dark, V(0, 0.9, 0.14), V(0, 0.35, -1), V(0, 1, 0.3), 0.3, 0.17, 0.04);
    k.limb((n) => (n.z > 0.45 ? belly : main), V(0, 0.74, 0.22), V(0, 0.87, 0.4), 0.12, 0.1, 7);
    const head = k.orb(main, [0, 0.92, 0.48], [0.19, 0.17, 0.21], { w: 9, h: 6 });
    k.orb(belly, [0, 0.83, 0.65], [0.125, 0.095, 0.11]);
    k.orb('#2a3a22', [0, 0.865, 0.755], [0.04, 0.03, 0.026], { w: 6, h: 4 });
    eyes(k, head, { yaw: 0.6, pitch: 0.16, size: 0.052, aspect: 1.1 });
    sym(k, (sx) => k.withRig(twitch(V(S(sx, 0.13), 0.97, 0.42), sx, 0.3), () => leaf(k, main, V(S(sx, 0.13), 0.97, 0.42), V(sx, 0.25, -0.2), V(0, 1, 0.3), 0.25, 0.13, 0.045, belly)));
    // Signature: a single horn crowned by a purple thistle.
    k.tube(horn, [[0, 1.0, 0.52], [0, 1.13, 0.58], [0, 1.21, 0.68]], (t) => 0.055 - 0.018 * t, { segs: 5, sides: 6 });
    thistle(k, V(0, 1.29, 0.72), 0.1, thist);
    sym(k, (sx) => {
      leg(k, { pts: [[S(sx, 0.12), 0.62, 0.2], [S(sx, 0.13), 0.34, 0.22], [S(sx, 0.13), 0.08, 0.24]], radii: [0.1, 0.075, 0.062], paints: [main], paw: { paint: hoof, r: [0.072, 0.06, 0.078] } });
      k.orb(main, [S(sx, 0.14), 0.58, -0.36], [0.13, 0.17, 0.16]);
      leg(k, { pts: [[S(sx, 0.14), 0.52, -0.36], [S(sx, 0.15), 0.34, -0.28], [S(sx, 0.15), 0.18, -0.42], [S(sx, 0.15), 0.08, -0.4]], radii: [0.1, 0.075, 0.062, 0.056], paints: [main], paw: { paint: hoof, r: [0.072, 0.06, 0.078] } });
    });
    const tb = V(0, 0.68, -0.5);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.3, speed: 3 }, () => {
      leaf(k, dark, tb, V(0, 0.7, -1), V(1, 0, 0), 0.24, 0.13, 0.045);
      leaf(k, main, tb.clone().add(V(0, 0.02, 0)), V(0.4, 0.9, -0.6), V(1, 0, 0.3), 0.2, 0.11, 0.045);
    });
  },
};

function tree(k: Kit, base: THREE.Vector3, h: number, r: number, bark: Col, leaves: Col[], blossom: Col, phase: number) {
  k.withRig({ kind: 'nod', pivot: base, amp: 0.05, phase, speed: 1.6 }, () => {
    k.limb(bark, base, base.clone().add(V(0, h, 0)), r * 0.24, r * 0.16, 5);
    const top = base.clone().add(V(0, h, 0));
    k.ball(leaves[0]!, top.clone().add(V(0, r * 0.35, 0)), [r, r * 0.85, r], { detail: 0, jitter: 0.18 });
    k.ball(leaves[1]!, top.clone().add(V(r * 0.45, r * 0.05, r * 0.2)), r * 0.62, { detail: 0, jitter: 0.18 });
    k.ball(leaves[1]!, top.clone().add(V(-r * 0.5, 0, -r * 0.15)), r * 0.58, { detail: 0, jitter: 0.18 });
    for (let i = 0; i < 3; i++) {
      const a = phase + i * 2.1;
      k.gem(blossom, top.clone().add(V(Math.cos(a) * r * 0.75, r * (0.45 + 0.2 * (i % 2)), Math.sin(a) * r * 0.75)), [r * 0.16, r * 0.16, r * 0.16]);
    }
  });
}

const verdantusk: Design = {
  scale: 0.92, idle: 'heavy',
  build(k) {
    const main = '#2c8c3a', belly = '#c9ef8a', bark = '#6b4a2e', ivory = '#fff1d0', blossom = '#e05ab8', leafL = '#5fcf4a', leafD = '#1f6e2c';
    k.orb(under(main, belly), [0, 0.95, -0.66], [0.38, 0.38, 0.34], { w: 10, h: 7 });
    k.tube(under(main, belly, -0.4), [[0, 0.95, -0.72], [0, 1.0, -0.36], [0, 1.04, 0], [0, 1.0, 0.3]], (t) => 0.38 + 0.06 * Math.sin(Math.PI * t), { segs: 5, sides: 8, flat: 0.92 });
    k.orb((n) => (n.z > 0.5 ? belly : main), [0, 1.0, 0.3], [0.4, 0.4, 0.36], { w: 10, h: 7 });
    // Pillar legs: mossy thighs, bark shins, ivory toenails.
    sym(k, (sx) => {
      for (const z of [0.3, -0.62]) {
        leg(k, { pts: [[S(sx, 0.3), 0.92, z], [S(sx, 0.33), 0.5, z + 0.03], [S(sx, 0.33), 0.12, z + 0.05]], radii: [0.19, 0.155, 0.14], paints: [main, bark], paw: { paint: bark, r: [0.17, 0.1, 0.17], toes: { paint: ivory, n: 3, size: 0.045 } }, sides: 6 });
      }
    });
    // The grove on its back.
    tree(k, V(-0.12, 1.3, -0.14), 0.36, 0.27, bark, [leafL, leafD], blossom, 0.3);
    tree(k, V(0.18, 1.28, -0.5), 0.24, 0.2, bark, [leafD, leafL], blossom, 1.9);
    k.ball(leafD, [0.22, 1.39, 0.1], 0.16, { detail: 0, jitter: 0.18 });
    k.ball(leafL, [-0.22, 1.34, -0.52], 0.15, { detail: 0, jitter: 0.18 });
    for (const [x, z, a] of [[0.05, 0.22, 0.2], [-0.3, -0.2, -0.9], [0.32, -0.25, 0.9]] as const) {
      slabAt(k, leafL, leafShape(0.3, 0.12), 0.04, V(x, 1.34, z), V(Math.sin(a) * 0.5, 1, -0.2), V(Math.cos(a), 0, Math.sin(a)));
    }
    // Head: heavy brow, small fierce eyes, big curved tusks.
    const head = k.orb((n, c) => (c.y < 0.9 && n.z > 0.3 ? belly : main), [0, 0.98, 0.76], [0.28, 0.26, 0.27], { w: 10, h: 7 });
    k.orb(belly, [0, 0.86, 0.98], [0.17, 0.13, 0.13]);
    sym(k, (sx) => k.orb('#2a3a22', [S(sx, 0.06), 0.89, 1.1], [0.03, 0.035, 0.02], { w: 5, h: 3 }));
    eyes(k, head, { yaw: 0.52, pitch: 0.16, size: 0.05, aspect: 0.85, brow: { color: leafD, tilt: 0.3, thick: 0.5, lift: 1.05 } });
    sym(k, (sx) => {
      k.tube(ivory, [[S(sx, 0.14), 0.84, 0.97], [S(sx, 0.24), 0.74, 1.12], [S(sx, 0.34), 0.8, 1.3], [S(sx, 0.37), 0.98, 1.38]], (t) => 0.078 - 0.05 * t, { segs: 8, sides: 6 });
      k.withRig(twitch(V(S(sx, 0.24), 1.1, 0.7), sx, 0.22), () => leaf(k, main, V(S(sx, 0.24), 1.1, 0.7), V(sx, 0.15, -0.3), V(0, 0.2, 1), 0.4, 0.26, 0.05, belly));
    });
    thistle(k, V(0, 1.3, 0.68), 0.085, blossom, leafD, 0.4);
    sym(k, (sx) => thistle(k, V(S(sx, 0.13), 1.25, 0.76), 0.065, blossom, leafD, sx));
    const tb = V(0, 0.98, -0.98);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.25, speed: 2.2 }, () => {
      leaf(k, leafD, tb, V(0, 0.5, -1), V(1, 0, 0), 0.32, 0.17, 0.05);
      leaf(k, leafL, tb.clone().add(V(0, 0.03, 0)), V(0.5, 0.8, -0.6), V(1, 0, 0.4), 0.26, 0.14, 0.05);
    });
  },
};

// ----------------------------------------------------------------------------------------
// Spark line: Flickwing → Stormoth
// ----------------------------------------------------------------------------------------

const flickwing: Design = {
  scale: 0.9, hover: 0.14, idle: 'float',
  build(k) {
    const main = '#ffd83a', pale = '#fff6c2', dark = '#2b2b3a', glow = '#fffbe0';
    const stripes: Paint = (_n, c) => (Math.floor((c.z + 2) * 11) % 2 ? dark : main);
    k.orb(main, [0, 0.5, 0], [0.24, 0.23, 0.23], { jitter: 0.1 });
    k.orb(stripes, [0, 0.45, -0.3], [0.19, 0.18, 0.25], { w: 8, h: 6 });
    k.withRig({ kind: 'flicker', pivot: V(0, 0.42, -0.5), amp: 0.25, speed: 5 }, () => k.orb(glow, [0, 0.42, -0.54], [0.1, 0.1, 0.08], { w: 7, h: 5 }));
    const head = k.orb(main, [0, 0.58, 0.27], [0.2, 0.19, 0.18], { w: 9, h: 6 });
    eyes(k, head, { yaw: 0.48, pitch: 0.15, size: 0.075, aspect: 1.22 });
    mouth(k, head, -0.25, 0.04, '#6a4a10', 0.5);
    sym(k, (sx) => {
      // Zig-zag lightning antennae.
      k.withRig({ kind: 'nod', pivot: V(S(sx, 0.08), 0.72, 0.3), amp: 0.12, phase: sx, speed: 3 }, () => {
        const f = frame(V(S(sx, 0.08), 0.72, 0.3), V(S(sx, 0.35), 1, 0.25), V(0, 0, 1));
        f.slab(k, dark, sx > 0 ? boltShape(0.3, 0.11) : boltShape(0.3, 0.11).map(([x, y]) => [-x, y] as [number, number]), 0.045);
        k.orb(main, f.at(0, 0.31), 0.05, { w: 6, h: 4 });
      });
      // Two pairs of rounded wings: pale panes in a dark frame.
      k.withRig({ kind: 'flap', pivot: V(S(sx, 0.14), 0.62, -0.02), amp: 0.5, speed: 22 }, () => {
        const up = frame(V(S(sx, 0.14), 0.62, -0.02), V(S(sx, 1), 0.75, -0.3), V(0, 0.3, 1));
        const wing: [number, number][] = [[0, 0], [0.13, 0.08], [0.19, 0.3], [0.13, 0.47], [0, 0.52], [-0.1, 0.44], [-0.13, 0.22], [-0.07, 0.05]];
        up.slab(k, dark, wing.map(([x, y]) => [x * 1.12, y * 1.08] as [number, number]), 0.035);
        up.slab(k, pale, wing, 0.055);
        const lo = frame(V(S(sx, 0.13), 0.52, -0.06), V(S(sx, 1), -0.2, -0.3), V(0, 0.3, 1));
        lo.slab(k, dark, wing.map(([x, y]) => [x * 0.8, y * 0.7] as [number, number]), 0.035);
        lo.slab(k, pale, wing.map(([x, y]) => [x * 0.68, y * 0.6] as [number, number]), 0.055);
      });
      for (const z of [0.12, -0.04, -0.2]) k.limb(dark, V(S(sx, 0.12), 0.38, z), V(S(sx, 0.2), 0.2, z + 0.04), 0.03, 0.022, 4);
    });
  },
};

const stormoth: Design = {
  scale: 1.0, hover: 0.24, idle: 'float',
  build(k) {
    const main = '#f5c400', indigo = '#3d2fa0', violet = '#5a3cff', cloud = '#f2f4ff', dark = '#241c4a';
    const stripes: Paint = (_n, c) => (Math.floor((c.z + 2) * 9) % 2 ? indigo : main);
    k.orb(main, [0, 0.8, 0], [0.24, 0.26, 0.25], { jitter: 0.1 });
    k.tube(stripes, [[0, 0.74, -0.16], [0, 0.66, -0.4], [0, 0.56, -0.64]], (t) => 0.2 - 0.12 * t, { segs: 6, sides: 7 });
    const head = k.orb(main, [0, 0.93, 0.27], [0.17, 0.16, 0.16], { w: 9, h: 6 });
    eyes(k, head, { yaw: 0.55, pitch: 0.12, size: 0.08, aspect: 1.1, color: '#2a1f70', brow: { color: dark, tilt: 0.25, thick: 0.3 } });
    // Storm-cloud ruff.
    for (let i = 0; i < 6; i++) {
      const a = -0.5 + (i / 5) * (Math.PI + 1.0);
      k.ball(cloud, [Math.cos(a) * 0.23, 0.86 + Math.sin(a) * 0.17, 0.14], 0.11 + 0.02 * (i % 2), { detail: 0, jitter: 0.06 });
    }
    sym(k, (sx) => {
      // Feathery antennae.
      k.withRig({ kind: 'nod', pivot: V(S(sx, 0.07), 1.05, 0.32), amp: 0.1, phase: sx, speed: 2.4 }, () => {
        const f = frame(V(S(sx, 0.07), 1.05, 0.32), V(S(sx, 0.5), 1, -0.35), V(0, 0.3, 1));
        f.slab(k, dark, [[0, 0], [0.06, 0.1], [0.02, 0.12], [0.075, 0.22], [0.02, 0.24], [0.06, 0.35], [0, 0.44], [-0.06, 0.35], [-0.02, 0.24], [-0.075, 0.22], [-0.02, 0.12], [-0.06, 0.1]], 0.04);
      });
      k.withRig({ kind: 'flap', pivot: V(S(sx, 0.15), 0.88, -0.04), amp: 0.32, speed: 9 }, () => {
        // Big storm wings: indigo with a yellow lightning bolt and cloud spots.
        const f = frame(V(S(sx, 0.15), 0.88, -0.04), V(S(sx, 1), 0.72, -0.12), V(0, 0.15, 1));
        const m = (pts: [number, number][]) => pts.map(([x, y]) => [x * sx, y] as [number, number]);
        f.slab(k, indigo, m([[0, 0], [0.16, 0.06], [0.32, 0.3], [0.36, 0.62], [0.24, 0.86], [0.03, 0.82], [-0.14, 0.6], [-0.22, 0.32], [-0.13, 0.08]]), 0.05);
        f.slab(k, main, m(boltShape(0.5, 0.2)), 0.075, 0.04 * sx, 0.18, 0, 0.2);
        f.slab(k, cloud, ([[0, -0.05], [0.05, 0], [0, 0.05], [-0.05, 0]] as [number, number][]).map(([x, y]) => [x * 1.3, y * 1.3] as [number, number]), 0.075, 0.12 * sx, 0.7, 0, 0.3);
        f.slab(k, violet, m([[0.02, 0], [0.12, 0.06], [0.2, 0.32], [0.18, 0.58], [0.1, 0.55]]), 0.07, -0.02 * sx, 0.06, 0, 0.2);
        const lo = frame(V(S(sx, 0.13), 0.72, -0.1), V(S(sx, 1), -0.45, -0.25), V(0, 0.15, 1));
        lo.slab(k, main, m([[0, 0], [0.12, 0.05], [0.2, 0.26], [0.12, 0.44], [-0.02, 0.46], [-0.12, 0.3], [-0.1, 0.08]]), 0.05);
        lo.slab(k, indigo, m([[0, 0.24], [0.06, 0.32], [0, 0.4], [-0.06, 0.32]]), 0.07);
      });
      for (const z of [0.1, -0.06]) k.limb(dark, V(S(sx, 0.12), 0.64, z), V(S(sx, 0.2), 0.44, z + 0.05), 0.032, 0.024, 4);
    });
  },
};

// ----------------------------------------------------------------------------------------
// Terra line: Pebblet → Cragmaul
// ----------------------------------------------------------------------------------------

const pebblet: Design = {
  scale: 0.88, idle: 'bounce',
  build(k) {
    const main = '#a3825c', light = '#dcc6a2', dark = '#7a6044', crystal = '#6fd0e0';
    const body = k.ball((n, c) => (n.z > 0.45 && c.y < 0.42 ? light : main), [0, 0.34, 0], [0.4, 0.33, 0.37], { jitter: 0.14 });
    for (const [yaw, pitch, r] of [[1.9, 0.2, 0.1], [-2.1, 0.35, 0.11], [2.8, -0.1, 0.09]] as const) k.ball(dark, surface(body, yaw, pitch, 0.95).p, r, { detail: 0, jitter: 0.1 });
    // Crystal sprouts on its back.
    for (const [yaw, pitch, h] of [[Math.PI, 0.8, 0.17], [2.6, 0.55, 0.12], [-2.6, 0.6, 0.13], [Math.PI, 0.35, 0.1]] as const) {
      const s = surface(body, yaw, pitch, 0.9);
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), s.n.clone().add(V(0, 0.6, 0)).normalize());
      k.gem((n) => (n.x > 0 ? '#b8f4ff' : crystal), s.p.clone().addScaledVector(s.n, h * 0.4), [h * 0.38, h, h * 0.38], new THREE.Euler().setFromQuaternion(q).toArray().slice(0, 3) as [number, number, number]);
    }
    eyes(k, body, { yaw: 0.36, pitch: 0.12, size: 0.075, aspect: 1.2 });
    decal(k, body, 0, -0.02, 0.05, 0.04, light, 0.9);
    mouth(k, body, -0.2, 0.045, '#4a3424', 0.35);
    sym(k, (sx) => k.orb(dark, [S(sx, 0.18), 0.05, 0.13], [0.11, 0.05, 0.12], { w: 7, h: 4 }));
  },
};

const cragmaul: Design = {
  scale: 0.95, idle: 'heavy',
  build(k) {
    const main = '#8a6a48', light = '#cdb592', dark = '#5e4730', crystal = '#6fd0e0', hi = '#c6f6ff';
    const torso = k.ball((n, c) => (n.z > 0.5 && c.y < 1.05 ? light : main), [0, 1.0, -0.05], [0.55, 0.5, 0.46], { rot: [0.25, 0, 0], jitter: 0.14 });
    const crystalPaint: Paint = (n) => (n.x + n.y * 0.3 > 0.2 ? hi : crystal);
    for (const [yaw, pitch, h, tilt] of [[Math.PI, 0.75, 0.32, 0], [2.7, 0.55, 0.24, 0.4], [-2.7, 0.55, 0.26, -0.4], [Math.PI - 0.1, 0.35, 0.2, 0.2], [2.4, 0.9, 0.18, 0.5]] as const) {
      const s = surface(torso, yaw, pitch, 0.92);
      k.gem(crystalPaint, s.p.clone().addScaledVector(s.n, h * 0.35), [h * 0.32, h, h * 0.32], [-0.5, 0, tilt]);
    }
    // Legs: short and thick.
    sym(k, (sx) => leg(k, { pts: [[S(sx, 0.26), 0.62, -0.2], [S(sx, 0.28), 0.32, -0.16], [S(sx, 0.28), 0.1, -0.14]], radii: [0.17, 0.15, 0.13], paints: [main, dark], paw: { paint: dark, r: [0.16, 0.09, 0.19] }, sides: 7 }));
    // Head sunk between the shoulders.
    const head = k.orb(main, [0, 1.17, 0.4], [0.2, 0.18, 0.18], { w: 8, h: 6 });
    k.orb(light, [0, 1.08, 0.54], [0.12, 0.08, 0.07], { w: 7, h: 4 });
    eyes(k, head, { yaw: 0.48, pitch: 0.18, size: 0.046, aspect: 0.8, iris: crystal, brow: { color: dark, tilt: 0.35, thick: 0.5 } });
    sym(k, (sx) => k.cone(dark, V(S(sx, 0.12), 1.3, 0.36), V(S(sx, 0.21), 1.45, 0.3), 0.05, 5));
    // Massive arms with crystal-studded fists resting on the ground.
    sym(k, (sx) => {
      k.ball(main, [S(sx, 0.5), 1.2, 0.05], [0.27, 0.24, 0.26], { jitter: 0.14 });
      k.limb(main, V(S(sx, 0.56), 1.15, 0.08), V(S(sx, 0.62), 0.74, 0.22), 0.2, 0.16, 7);
      k.orb(main, [S(sx, 0.62), 0.74, 0.22], 0.16, { w: 7, h: 4 });
      k.limb(dark, V(S(sx, 0.62), 0.74, 0.22), V(S(sx, 0.6), 0.38, 0.38), 0.16, 0.15, 7);
      const fist = V(S(sx, 0.6), 0.24, 0.42);
      k.ball(dark, fist, [0.24, 0.24, 0.24], { jitter: 0.12 });
      for (const dx of [-0.11, 0, 0.11]) k.gem(crystalPaint, fist.clone().add(V(dx, 0.16, 0.16)), [0.08, 0.22, 0.08], [0.8, 0, dx * 2.5]);
    });
  },
};

// ----------------------------------------------------------------------------------------
// Gale line: Breezel → Cyclonyx
// ----------------------------------------------------------------------------------------

const breezel: Design = {
  scale: 0.88, hover: 0.08, idle: 'float',
  build(k) {
    const main = '#8fd7f0', white = '#ffffff', orange = '#ffb347', cloud = '#f4fbff';
    // Cloud cushion it rides on.
    for (const [x, y, z, r] of [[0, 0.1, 0, 0.16], [-0.2, 0.09, -0.06, 0.13], [0.21, 0.09, -0.04, 0.13], [0.03, 0.08, -0.22, 0.12], [-0.08, 0.08, 0.17, 0.11], [0.12, 0.08, 0.15, 0.1]] as const) k.ball(cloud, [x, y, z], [r * 1.15, r * 0.75, r], { detail: 0, jitter: 0.06 });
    k.orb((n, c) => (n.z > 0.35 && c.y < 0.55 ? white : main), [0, 0.42, 0], [0.37, 0.33, 0.35], { w: 10, h: 7 });
    const head = k.orb(main, [0, 0.72, 0.08], [0.3, 0.28, 0.28], { w: 10, h: 7 });
    k.cone(orange, V(0, 0.68, 0.33), V(0, 0.66, 0.48), 0.07, 4, 0.8);
    eyes(k, head, { yaw: 0.42, pitch: 0.16, size: 0.07, aspect: 1.25 });
    sym(k, (sx) => decal(k, head, S(sx, 0.75), -0.05, 0.05, 0.035, '#ffb0c8'));
    // Signature swirl tuft.
    k.withRig({ kind: 'nod', pivot: V(0, 0.98, 0.06), amp: 0.14, speed: 2.6 }, () => {
      k.tube(white, [[0, 0.98, 0.07], [0, 1.12, 0.04], [0.02, 1.19, -0.06], [0.01, 1.14, -0.15], [-0.02, 1.07, -0.1], [0, 1.1, -0.05]], (t) => 0.055 - 0.025 * t, { segs: 10, sides: 6 });
    });
    sym(k, (sx) => k.withRig({ kind: 'flap', pivot: V(S(sx, 0.28), 0.5, -0.02), amp: 0.55, speed: 12 }, () => {
      slabAt(k, (n) => (n.z > 0 ? white : main), petalShape(0.24, 0.17), 0.06, V(S(sx, 0.27), 0.52, -0.02), V(sx, -0.15, -0.3), V(0, 0.2, 1));
    }));
    for (const [x, a] of [[-0.06, -0.4], [0, 0], [0.06, 0.4]] as const) k.cone(main, V(x, 0.44, -0.28), V(x + a * 0.12, 0.58, -0.44), 0.06, 4, 0.5);
  },
};

const cyclonyx: Design = {
  scale: 1.0, hover: 0.22, idle: 'glide',
  build(k) {
    const main = '#4fb8e8', white = '#f0fbff', orange = '#ff8a3d', deep = '#2672b8', dark = '#1d3a5c';
    k.tube(under(main, white, -0.2), [[0, 0.72, -0.5], [0, 0.78, -0.2], [0, 0.86, 0.08], [0, 0.92, 0.22]], (t) => 0.1 + 0.16 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.12)), { segs: 7, sides: 8 });
    k.orb((n) => (n.z > 0.2 ? white : main), [0, 0.9, 0.2], [0.22, 0.24, 0.21]);
    const head = k.orb(main, [0, 1.13, 0.36], [0.18, 0.17, 0.2], { w: 9, h: 6 });
    k.cone(orange, V(0, 1.1, 0.52), V(0, 1.05, 0.7), 0.07, 4, 0.8);
    k.cone(orange, V(0, 1.08, 0.66), V(0, 0.99, 0.72), 0.04, 4);
    eyes(k, head, { yaw: 0.6, pitch: 0.16, size: 0.05, aspect: 0.85, iris: '#ffcf3a', brow: { color: dark, tilt: 0.4, thick: 0.4 } });
    // Swept crest.
    for (const [x, y, len] of [[0, 1.27, 0.38], [0.07, 1.21, 0.3], [-0.07, 1.21, 0.3]] as const) k.blade(deep, V(x, y, 0.34), V(x * 2, y + 0.08, 0.32 - len), 0.06, 0.03, V(x === 0 ? 1 : 0.3, 1, 0));
    // Big swept wings: blue on top, white underside, orange primaries.
    sym(k, (sx) => k.withRig({ kind: 'flap', pivot: V(S(sx, 0.14), 0.94, 0.06), amp: 0.3, speed: 6 }, () => {
      const base = V(S(sx, 0.14), 0.94, 0.06);
      const up = V(S(sx, 0.95), 0.7, -0.3).normalize();
      const f = frame(base, up, V(0, 0.25, 1));
      const outline: [number, number][] = ([[0.1, 0], [0.22, 0.1], [0.28, 0.36], [0.22, 0.66], [0.08, 0.98], [0.0, 1.0], [-0.04, 0.86], [-0.12, 0.8], [-0.1, 0.68], [-0.19, 0.6], [-0.15, 0.46], [-0.24, 0.38], [-0.2, 0.2], [-0.12, 0.02]] as [number, number][]).map(([x, y]) => [x * 0.9, y * 0.85]);
      f.slab(k, (n, c) => (c.clone().sub(base).dot(up) > 0.66 ? orange : n.z > 0.1 ? '#a8e2f8' : main), outline.map(([x, y]) => [x * sx, y] as [number, number]), 0.06);
    }));
    // Signature tail streamers.
    sym(k, (sx) => k.withRig({ kind: 'wag', pivot: V(S(sx, 0.04), 0.72, -0.52), amp: 0.25, phase: sx * 0.6, speed: 3 }, () => {
      k.tube((_n, c) => (c.z < -1.0 ? orange : white), [[S(sx, 0.04), 0.72, -0.52], [S(sx, 0.12), 0.66, -0.78], [S(sx, 0.22), 0.73, -1.03], [S(sx, 0.3), 0.9, -1.2]], (t) => 0.05 - 0.02 * t, { segs: 9, sides: 5, flat: 0.4 });
    }));
    for (const a of [-0.3, 0, 0.3]) k.blade(deep, V(0, 0.73, -0.48), V(a * 0.3, 0.7, -0.78), 0.07, 0.03, V(0, 1, 0));
    // Tucked talons.
    sym(k, (sx) => {
      k.limb(orange, V(S(sx, 0.08), 0.68, 0.0), V(S(sx, 0.1), 0.44, 0.06), 0.045, 0.035, 5);
      for (const dz of [-0.03, 0.04]) k.cone(dark, V(S(sx, 0.1), 0.44, 0.06 + dz), V(S(sx, 0.1), 0.36, 0.1 + dz * 1.5), 0.025, 4);
    });
  },
};

// ----------------------------------------------------------------------------------------
// Rare singles
// ----------------------------------------------------------------------------------------

const vulcrag: Design = {
  scale: 0.92, idle: 'heavy',
  build(k) {
    const basalt = '#3b2f33', basalt2 = '#574649', magma = '#ff6a1a', lava = '#ffd84a';
    const profile: [number, number][] = [[0, 0], [0.52, 0.03], [0.62, 0.2], [0.6, 0.45], [0.52, 0.75], [0.42, 1.02], [0.36, 1.18], [0.4, 1.27], [0.3, 1.3], [0, 1.22]];
    k.lathe((_n, c) => (c.y > 1.2 && Math.hypot(c.x, c.z) < 0.3 ? magma : basalt), profile, [0, 0, 0], { segs: 9 });
    const rAt = (y: number) => {
      for (let i = 1; i < profile.length; i++) {
        const [r0, y0] = profile[i - 1]!, [r1, y1] = profile[i]!;
        if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
      }
      return 0.3;
    };
    // Glowing magma veins crawling up the cone.
    const vein = (a0: number, y0: number, y1: number, wob: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 4; i++) {
        const y = y0 + (y1 - y0) * (i / 4);
        const a = a0 + (i % 2 ? wob : -wob) * 0.5;
        const r = rAt(y) + 0.012;
        pts.push(V(Math.sin(a) * r, y, Math.cos(a) * r));
      }
      for (let i = 0; i < pts.length - 1; i++) {
        k.limb(magma, pts[i]!, pts[i + 1]!, 0.034, 0.03, 4);
        k.orb(magma, pts[i + 1]!, 0.032, { w: 4, h: 3 });
      }
    };
    for (const [a, y0, y1, w] of [[0.95, 0.12, 0.62, 0.2], [-0.95, 0.15, 0.7, 0.24], [2.2, 0.1, 0.95, 0.22], [-2.3, 0.12, 0.9, 0.2], [Math.PI, 0.2, 1.1, 0.18], [0.3, 0.12, 0.3, 0.2]] as const) vein(a, y0, y1, w);
    // Rocky shoulder plates.
    sym(k, (sx) => k.ball(basalt2, [S(sx, 0.48), 0.86, 0.0], [0.22, 0.2, 0.22], { detail: 0, jitter: 0.12 }));
    for (const [x, y, z, r] of [[0.25, 0.95, -0.3, 0.13], [-0.3, 0.5, -0.45, 0.14], [0.4, 0.35, -0.35, 0.12]] as const) k.ball(basalt2, [x, y, z], r, { detail: 0, jitter: 0.12 });
    // Lava pool and eruption plume in the crater.
    k.orb(lava, [0, 1.26, 0], [0.27, 0.04, 0.27], { w: 9, h: 3 });
    flame(k, V(0, 1.27, 0), 0.5, 0.15, { phase: 0.2, tongues: 4 });
    // Face: glowing eyes under a rock brow, magma mouth.
    const proxy = { c: V(0, 0.82, 0), r: V(0.5, 0.42, 0.5), q: new THREE.Quaternion() };
    eyes(k, proxy, { yaw: 0.36, pitch: 0.12, size: 0.07, aspect: 0.72, color: lava, shine: false, brow: { color: basalt2, tilt: 0.45, thick: 0.55 } });
    const mp = surface(proxy, 0, -0.18);
    k.limb(magma, mp.p.clone().add(V(-0.12, 0, 0.01)), mp.p.clone().add(V(0.12, 0, 0.01)), 0.035, 0.035, 4);
    // Short thick arms ending in molten fists.
    sym(k, (sx) => {
      k.limb(basalt, V(S(sx, 0.5), 0.82, 0.04), V(S(sx, 0.72), 0.55, 0.18), 0.16, 0.13, 6);
      k.orb(magma, [S(sx, 0.75), 0.42, 0.22], 0.15, { w: 7, h: 5 });
      for (const dz of [-0.06, 0.06]) k.ball(basalt2, [S(sx, 0.8), 0.52, 0.22 + dz], 0.07, { detail: 0 });
      k.orb(basalt2, [S(sx, 0.3), 0.1, 0.2], [0.2, 0.1, 0.22], { w: 7, h: 4 });
      for (const dx of [-0.08, 0, 0.08]) k.gem(lava, [S(sx, 0.3) + dx, 0.05, 0.4], [0.035, 0.035, 0.04]);
    });
  },
};

const surgeray: Design = {
  scale: 1.25, idle: 'glide',
  build(k) {
    const main = '#2b6cd8', belly = '#e0f5ff', yel = '#ffe23a', deep = '#1a4aa0', dark = '#16224a';
    const body = k.orb(under(main, belly, -0.2), [0, 0.22, 0.02], [0.32, 0.19, 0.46], { w: 10, h: 6, rot: [-0.12, 0, 0] });
    // Broad wing fins whose tips rest on the ground.
    sym(k, (sx) => k.withRig({ kind: 'flap', pivot: V(S(sx, 0.18), 0.2, 0.02), amp: 0.12, phase: 0, speed: 3 }, () => {
      const f = frame(V(S(sx, 0.18), 0.2, 0.02), V(sx, -0.3, 0), V(0, 1, 0));
      const m = (pts: [number, number][]) => pts.map(([x, y]) => [x * sx, y] as [number, number]);
      f.slab(k, under(main, belly, -0.1), m([[0.38, 0], [0.24, 0.3], [0.04, 0.6], [-0.1, 0.58], [-0.28, 0.32], [-0.38, 0]]), 0.08);
      f.slab(k, yel, m(boltShape(0.36, 0.17).map(([x, y]) => [y - 0.15, x + 0.28] as [number, number])), 0.11, 0, 0, 0.0, 0.2);
    }));
    k.slab(yel, boltShape(0.42, 0.16), 0.06, [0, 0.33, -0.2], [-Math.PI / 2 + 0.25, 0, 0], [1, 1, 1], 0.2);
    eyes(k, body, { yaw: 0.36, pitch: 0.5, size: 0.055, aspect: 1.15 });
    mouth(k, body, -0.15, 0.06, dark, 0.3);
    sym(k, (sx) => {
      k.cone(deep, V(S(sx, 0.15), 0.2, 0.38), V(S(sx, 0.21), 0.24, 0.6), 0.065, 5, 0.5);
      k.withRig({ kind: 'nod', pivot: V(S(sx, 0.08), 0.3, 0.2), amp: 0.15, phase: sx, speed: 3 }, () => {
        k.limb(dark, V(S(sx, 0.08), 0.3, 0.2), V(S(sx, 0.13), 0.5, 0.13), 0.028, 0.022, 4);
        k.orb(yel, [S(sx, 0.135), 0.53, 0.125], 0.055, { w: 6, h: 4 });
      });
    });
    // Whip tail with a bolt tip.
    const tb = V(0, 0.2, -0.38);
    k.withRig({ kind: 'wag', pivot: tb, amp: 0.3, speed: 2.5 }, () => {
      k.tube(main, [tb, [0, 0.22, -0.7], [0, 0.3, -0.98], [0, 0.42, -1.15]], (t) => 0.055 - 0.028 * t, { segs: 8, sides: 5 });
      for (const z of [-0.55, -0.75]) slabAt(k, deep, [[-0.05, 0], [0.06, 0], [-0.04, 0.12]], 0.04, V(0, 0.25, z), V(0, 1, -0.4), V(1, 0, 0));
      slabAt(k, yel, boltShape(0.28, 0.2), 0.06, V(0, 0.4, -1.12), V(0, 0.5, -1), V(1, 0, 0));
    });
  },
};

const petalwisp: Design = {
  scale: 0.95, hover: 0.1, idle: 'float',
  build(k) {
    const pink = '#ff9ad0', pale = '#fff0f8', leafC = '#6ed46a', magenta = '#e8559e', yel = '#ffe066';
    // Wind-wisp tail spiralling down to a point.
    k.tube((_n, c) => (c.y > 0.25 ? pink : pale), [[0, 0.44, 0], [0.08, 0.32, -0.04], [0.03, 0.2, -0.1], [-0.07, 0.11, -0.05], [-0.03, 0.03, 0.04]], (t) => 0.1 * (1 - t) + 0.015, { segs: 9, sides: 6 });
    // Bud body and petal skirt.
    k.lathe(pink, [[0, 0.38], [0.15, 0.42], [0.2, 0.5], [0.18, 0.6], [0.12, 0.68], [0, 0.72]], [0, 0, 0], { segs: 8 });
    k.withRig({ kind: 'roll', pivot: V(0, 0.52, 0), amp: 0.07, speed: 1.8 }, () => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.26;
        const d = V(Math.sin(a), 0, Math.cos(a));
        slabAt(k, (n) => (n.y < 0 ? magenta : i % 2 ? pink : '#ffb8de'), petalShape(0.3, 0.22), 0.045, V(0, 0.52, 0).addScaledVector(d, 0.12), d.clone().add(V(0, -0.55, 0)), d.clone().multiplyScalar(0.5).add(V(0, 1, 0)));
      }
    });
    // Face.
    const head = k.orb('#ffd6ea', [0, 0.88, 0.02], [0.22, 0.21, 0.21], { w: 10, h: 7 });
    eyes(k, head, { yaw: 0.4, pitch: 0.05, size: 0.068, aspect: 1.28 });
    sym(k, (sx) => decal(k, head, S(sx, 0.72), -0.12, 0.05, 0.035, '#ff8fb8'));
    mouth(k, head, -0.25, 0.04, '#b0306a', 0.5);
    // Blossom crown.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = V(Math.sin(a), 0, Math.cos(a));
      const lean = d.z > 0.6 ? 0.25 : 0.65;
      slabAt(k, (n) => (n.y < -0.2 ? magenta : pink), petalShape(0.3, 0.2), 0.045, V(0, 1.02, -0.02).addScaledVector(d, 0.08), d.clone().multiplyScalar(lean).add(V(0, 1, -0.1)), d.clone().multiplyScalar(-1).add(V(0, 0.6, 0)));
    }
    for (let i = 0; i < 4; i++) k.ball(yel, [Math.cos(i * 1.6) * 0.04, 1.1, -0.02 + Math.sin(i * 1.6) * 0.04], 0.04, { detail: 0 });
    // Leaf arms.
    sym(k, (sx) => k.withRig({ kind: 'flap', pivot: V(S(sx, 0.16), 0.62, 0.02), amp: 0.3, speed: 4 }, () => {
      leaf(k, leafC, V(S(sx, 0.16), 0.62, 0.02), V(sx, -0.1, 0.25), V(0, 0.4, 1), 0.28, 0.15, 0.045, '#b8f0a0');
    }));
  },
};

export const DESIGNS: Record<string, Design> = {
  ashkit, cindertail, pyrelord,
  dropple, rillback, maelstrode,
  mossling, thistlehorn, verdantusk,
  flickwing, stormoth,
  pebblet, cragmaul,
  breezel, cyclonyx,
  vulcrag, surgeray, petalwisp,
};

/** Evolution lines (and singles) in dex order, used by the model gallery's lineup mode. */
export const LINES: string[][] = [
  ['ashkit', 'cindertail', 'pyrelord'],
  ['dropple', 'rillback', 'maelstrode'],
  ['mossling', 'thistlehorn', 'verdantusk'],
  ['flickwing', 'stormoth'],
  ['pebblet', 'cragmaul'],
  ['breezel', 'cyclonyx'],
  ['vulcrag', 'surgeray', 'petalwisp'],
];
