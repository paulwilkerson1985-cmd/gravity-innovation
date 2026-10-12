// Shared battle staging for the adventure battle and the Arena: where the two kin stand, the
// raised battle pads, and a camera that frames both kin into the space the battle UI leaves
// free for every viewport (desktop, portrait phone, landscape phone).
import * as THREE from 'three';
import { GEO, MeshBuilder, flatMaterial } from '../render/builder';
import { frameTwo, layoutMode, uiZoom } from './framing';

/** Your kin (near, left) and the foe (far, right). Close enough that both read big. */
export const BATTLE_SPOTS = [new THREE.Vector3(-1.7, 0.2, 1.3), new THREE.Vector3(1.6, 0.2, -1.6)] as const;
/**
 * How far apart the two pads stand per layout: on a tall phone the kin sit almost on top of
 * each other on screen, so they need more room in the world to stay inside the frame.
 */
const SPREAD = { wide: 0.72, portrait: 1.4, land: 1.0 } as const;

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
  ridge: ['#d89a5a', '#8a5638'],
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
    return { mine: [w * 0.31, textTop - 16], foe: [w * 0.72, textTop * 0.47] };
  }
  const textTop = h - 12 - 96;
  return { mine: [w * 0.27, textTop - 26], foe: [w * 0.66, Math.min(h * 0.55, h - 320)] };
}

/** Frame the battle camera on BATTLE_SPOTS for the current viewport. */
export function frameBattle(cam: THREE.PerspectiveCamera, scene: THREE.Scene, w: number, h: number, spots: readonly [THREE.Vector3, THREE.Vector3]) {
  cam.aspect = w / h;
  cam.fov = 26;
  const t = battleTargets(w, h);
  frameTwo(cam, w, h, spots[0], spots[1], t.mine, t.foe, { dir: new THREE.Vector3(-0.3, 0.42, 1), yawRange: 0.45 });
  const dist = cam.position.distanceTo(spots[0].clone().add(spots[1]).multiplyScalar(0.5));
  if (scene.fog instanceof THREE.Fog) { scene.fog.near = dist + 8; scene.fog.far = dist + 36; }
}
