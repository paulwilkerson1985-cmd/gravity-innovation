// Shared battle staging for the adventure battle and the Arena: where the two kin stand, the
// raised battle pads, and a camera that frames both kin into the space the battle UI leaves
// free for every viewport (desktop, portrait phone, landscape phone).
import * as THREE from 'three';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { corners, frameTwo, layoutMode, uiZoom } from './framing';

/** Your kin (near, left) and the foe (far, right). Close enough that both read big. */
export const BATTLE_SPOTS = [new THREE.Vector3(-1.7, 0.2, 1.3), new THREE.Vector3(1.6, 0.2, -1.6)] as const;
/**
 * How far apart the two pads stand per layout: on a tall phone the kin sit almost on top of
 * each other on screen, so they need more room in the world to stay inside the frame.
 */
const SPREAD = { wide: 0.86, portrait: 1.5, land: 1.35 } as const;

/** Write the spots for this viewport into `out` (mutated so every holder sees the move). Returns true if they changed. */
export function placeSpots(out: readonly [THREE.Vector3, THREE.Vector3], w: number, h: number): boolean {
  const k = SPREAD[layoutMode(w, h)];
  let changed = false;
  out.forEach((p, i) => {
    const b = BATTLE_SPOTS[i]!;
    const nx = b.x * k, nz = b.z * k;
    if (p.x !== nx || p.z !== nz) { p.set(nx, b.y, nz); changed = true; }
  });
  return changed;
}

/** A fresh, viewport-placed copy of the spots for one scene. */
export function battleSpots(w: number, h: number): readonly [THREE.Vector3, THREE.Vector3] {
  const s = [BATTLE_SPOTS[0].clone(), BATTLE_SPOTS[1].clone()] as const;
  placeSpots(s, w, h);
  return s;
}

/**
 * A raised battle pad: dark skirt, coloured top, a bright rim ring that catches the light and
 * six gold studs. One merged mesh.
 */
export function battlePad(color: string, radius: number, opts: { dark?: string; rim?: string; stud?: string } = {}): THREE.Mesh {
  const base = new THREE.Color(color);
  const dark = opts.dark ?? base.clone().multiplyScalar(0.62).getStyle();
  const rim = opts.rim ?? '#fff6e0';
  const b = new MeshBuilder();
  // Top surface at y = 0 (the kin's feet); the skirt reaches down into the ground.
  b.add(GEO.disc, dark, { p: [0, -0.22, 0], s: [radius * 1.1, 0.4, radius * 1.1] }, 0.04);
  b.add(GEO.disc, rim, { p: [0, -0.06, 0], s: [radius * 1.02, 0.1, radius * 1.02] });
  b.add(GEO.disc, color, { p: [0, -0.03, 0], s: [radius * 0.88, 0.06, radius * 0.88] }, 0.06);
  b.add(GEO.disc, base.clone().lerp(new THREE.Color('#ffffff'), 0.22).getStyle(), { p: [0, -0.015, 0], s: [radius * 0.5, 0.04, radius * 0.5] }, 0.04);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26;
    b.add(GEO.oct, opts.stud ?? '#ffcf3f', { p: [Math.cos(a) * radius * 0.96, 0.0, Math.sin(a) * radius * 0.96], s: [0.08, 0.06, 0.08] });
  }
  return new THREE.Mesh(b.build(), flatMaterial());
}

/** Pad colours per route theme: [top, skirt]. Summit pads are a mid slate so they read on snow. */
export const PAD_COLORS: Record<string, [string, string]> = {
  meadow: ['#8fdc6a', '#4f9a3a'],
  ridge: ['#e4ad70', '#8a5638'], // a light sandstone top, so brown Terra kin don't melt into it
  coast: ['#f0cf7a', '#b8915a'],
  summit: ['#9aa6c4', '#5a6386'],
  title: ['#8fdc6a', '#4f9a3a'],
};

/**
 * Screen targets (CSS px) for where each kin's feet should land, mirroring the CSS battle
 * layout in style.css (`.battle-ui` variables): foe top-right, yours bottom-left above the
 * text box, never under a panel or the menu.
 */
export function battleTargets(W: number, H: number): { mine: [number, number]; foe: [number, number] } {
  const z = uiZoom(W, H);
  const t = targetsAt(W / z, H / z, layoutMode(W, H));
  return { mine: [t.mine[0] * z, t.mine[1] * z], foe: [t.foe[0] * z, t.foe[1] * z] };
}

function targetsAt(w: number, h: number, mode: ReturnType<typeof layoutMode>): { mine: [number, number]; foe: [number, number] } {
  if (mode === 'land') {
    const textTop = h - 8 - 60;
    return { mine: [w * 0.2, textTop - 12], foe: [w * 0.5, h * 0.44] };
  }
  if (mode === 'portrait') {
    const small = h < 700;
    const textTop = h - 12 - (small ? 144 : 172) - (small ? 6 : 8) - (small ? 64 : 78);
    // Your kin stands just above its HP panel (which sits beside it, right of centre).
    // (+18: the HP numbers have their own row under the HP bar, XP below them.)
    const panelTop = textTop - (small ? 6 : 8) - 6 - (small ? 98 : 104);
    return { mine: [w * 0.27, panelTop + 6], foe: [w * 0.74, textTop * 0.36] };
  }
  const textTop = h - 12 - 96;
  return { mine: [w * 0.27, textTop - 26], foe: [w * 0.66, Math.min(h * 0.55, h - 320)] };
}

/** Anything with a mesh and a rest scale (CreatureView), measured at rest for framing. */
export interface Framed { root: THREE.Object3D; mesh: THREE.Mesh; baseScale: number }

/** Screen extent (px) of a kin at its rest scale, ignoring idle/appear animation: [x0, x1, height, bottom]. */
function kinSpan(cam: THREE.PerspectiveCamera, w: number, h: number, k: Framed): [number, number, number, number] {
  const g = k.mesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  k.root.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4().compose(k.root.position, k.root.quaternion, new THREE.Vector3().setScalar(k.baseScale * k.root.scale.x));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of corners(bb.min, bb.max)) {
    const v = p.applyMatrix4(m).project(cam);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, x1, y1 - y0, y1];
}

/** Like kinSpan, but from the projected vertices (sampled): the model's true on-screen size. */
function kinSpanPrecise(cam: THREE.PerspectiveCamera, w: number, h: number, k: Framed): [number, number, number] {
  const pos = k.mesh.geometry.attributes.position;
  if (!pos) return kinSpan(cam, w, h, k).slice(0, 3) as [number, number, number];
  k.root.updateWorldMatrix(true, false);
  const m = new THREE.Matrix4().compose(k.root.position, k.root.quaternion, new THREE.Vector3().setScalar(k.baseScale * k.root.scale.x));
  const v = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const step = Math.max(1, Math.floor(pos.count / 1500));
  for (let i = 0; i < pos.count; i += step) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m).project(cam);
    const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return [x0, x1, y1 - y0];
}

/**
 * Frame the battle camera on the spots for the current viewport. With the kin on the field
 * given, a second pass slides a target sideways so a long tail or wide wings never leave the
 * screen (big final forms on a narrow phone).
 */
export function frameBattle(cam: THREE.PerspectiveCamera, scene: THREE.Scene, w: number, h: number, spots: readonly [THREE.Vector3, THREE.Vector3], kin: readonly (Framed | null | undefined)[] = [], nearPanel?: { x: number; y: number } | null) {
  cam.aspect = w / h;
  cam.fov = layoutMode(w, h) === 'portrait' ? 20 : 26;
  const t = battleTargets(w, h);
  const dir = new THREE.Vector3(-0.3, 0.42, 1);
  frameTwo(cam, w, h, spots[0], spots[1], t.mine, t.foe, { dir, yawRange: 0.45 });
  // Your kin may not take more than its share of the screen (wide rays, tall final forms).
  const portrait = layoutMode(w, h) === 'portrait';
  // Portrait: your panel sits beside your kin (right of it), so the kin must fit left of it.
  let mineRight = w - 12;
  if (portrait && nearPanel && kin[0] && kinSpan(cam, w, h, kin[0])[3] > nearPanel.y + 4) mineRight = nearPanel.x - 14;
  if (kin[0]) {
    const [x0, x1, kh] = kinSpan(cam, w, h, kin[0]);
    const maxK = Math.min(Math.min(w * (portrait ? 0.5 : 0.36), mineRight - 14) / (x1 - x0), (h * (portrait ? 0.3 : 0.5)) / kh);
    // Small or flat kin seen from behind (Pebblet, Surgeray) get a minimum on-screen size.
    const [px0, px1, pkh] = kinSpanPrecise(cam, w, h, kin[0]);
    const size = Math.max(px1 - px0, pkh * 1.25);
    const minSize = portrait ? w * 0.36 : h * 0.24;
    const k = Math.min(maxK, size < minSize ? Math.min(1.45, minSize / size) : 1);
    if (k !== 1) kin[0].root.scale.multiplyScalar(k);
  }
  if (kin[1]) {
    const [x0, x1] = kinSpan(cam, w, h, kin[1]);
    const k = (w * (portrait ? 0.5 : 0.3)) / (x1 - x0);
    if (k < 1) kin[1].root.scale.multiplyScalar(k);
  }
  const margin = 12;
  const fix = (k: Framed | null | undefined, max: number, right = w - margin): number => {
    if (!k) return 0;
    const [x0, x1] = kinSpan(cam, w, h, k);
    if (x0 < margin) return Math.min(margin - x0, max);
    if (x1 > right) return -Math.min(x1 - right, max);
    return 0;
  };
  // Re-solving moves the camera (yaw/distance), which shifts the kin again: iterate a few
  // passes so a wide foe (Verdantusk's tusks) really ends up inside the screen.
  let dm = 0, df = 0, dy = 0;
  for (let pass = 0; pass < 4; pass++) {
    const ddm = fix(kin[0], w * 0.2, Math.min(w - margin, mineRight)), ddf = fix(kin[1], w * 0.2);
    // A long or low kin (rays, serpents) must not sink behind the text box.
    let ddy = 0;
    if (kin[0]) {
      const bottom = kinSpan(cam, w, h, kin[0])[3];
      const limit = portrait && nearPanel ? nearPanel.y + 10 : t.mine[1] + 22;
      if (bottom > limit) ddy = -Math.min(bottom - limit, h * 0.12);
    }
    if (Math.abs(ddm) < 0.5 && Math.abs(ddf) < 0.5 && Math.abs(ddy) < 0.5) break;
    dm = THREE.MathUtils.clamp(dm + ddm, -w * 0.25, w * 0.25);
    df = THREE.MathUtils.clamp(df + ddf, -w * 0.25, w * 0.25);
    dy = Math.max(dy + ddy, -h * 0.14);
    frameTwo(cam, w, h, spots[0], spots[1], [t.mine[0] + dm, t.mine[1] + dy], [t.foe[0] + df, t.foe[1]], { dir, yawRange: 0.45 });
  }
  const dist = cam.position.distanceTo(spots[0].clone().add(spots[1]).multiplyScalar(0.5));
  if (scene.fog instanceof THREE.Fog) { scene.fog.near = dist + 8; scene.fog.far = dist + 36; }
}

/**
 * Even out on-screen sizes across species: your kin stands much closer to the camera, so a
 * big final form is damped toward a cap; a tiny first-stage foe far away is boosted a little.
 * Uses the root scale, so the blob shadow follows. Returns the factor applied.
 */
export function fitKinScale(v: Framed, side: 0 | 1): number {
  const g = v.mesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = Math.max(bb.max.y - bb.min.y, 0.8 * Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z)) * v.baseScale;
  let k = 1;
  if (side === 0 && size > NEAR_CAP) k = Math.pow(NEAR_CAP / size, 0.65);
  if (side === 1 && size < FAR_MIN) k = Math.pow(FAR_MIN / size, 0.6);
  v.root.scale.setScalar(k);
  return k;
}
const NEAR_CAP = 1.5;
const FAR_MIN = 1.05;

/** World height of a kin at rest (for sizing effects around it). */
export function kinHeight(v: Framed): number {
  const g = v.mesh.geometry;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  return (bb.max.y - Math.min(0, bb.min.y)) * v.baseScale * v.root.scale.x;
}
