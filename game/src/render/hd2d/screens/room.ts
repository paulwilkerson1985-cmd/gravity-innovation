// HD-2D menu-screen room (party, box, bestiary, bag, shop): a dim, warm stone hall in the
// style of the battle sets — fitted ashlar walls, honey plank floor, timber posts, a shelf of
// books, wall sconces — with ONE warm window light: a cookie spot through a high window, a light
// shaft with dust motes, falling on a textured stone plinth in the middle where the selected kin
// stands as its baked battle sprite. Heavy vignette, warm grade.
import * as THREE from 'three';
import { Rng } from '../../../engine/rng';
import { TEXEL, VoxelBatch, dustMotes, lightBeams, surfaceMaterial, windowCookie, type BeamSpec } from '../arena';
import { PixelTile, RAMPS, cachedTexture, paintPlanks, paintRock, paintStone, paintSteel, pixelTexture, type Ramp } from '../textures';
import { warmCaveGrade, type Quality } from '../pipeline';
import type { SpriteLight } from '../sprite';
import { disposeGroup, mkMesh } from '../arenas/outdoorKit';
import { RAMPS2 } from '../arenas/localKit';
import { lightRig } from '../kit/lights';
import { octSlab, type ScreenSet } from './common';

/** Height of the plinth's top face (the kin / item stand here). */
export const PLINTH_TOP = 0.58;

export interface RoomSet extends ScreenSet {
  /** The plinth mesh (the scene's "stand"). */
  plinth: THREE.Mesh;
}

const RUG: Ramp = ['#3a1418', '#5a1e22', '#7e2a28', '#a03a2c', '#c45a34', '#e0a048', '#f2cc72'];

/** A warm patterned rug: a gold border, a red field, a lozenge medallion (PixelTile). */
function paintRoomRug(size = 48): PixelTile {
  const t = new PixelTile(size, size, RUG);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const e = Math.min(x, y, size - 1 - x, size - 1 - y);
    let v = 2;
    if (e === 0) v = 0; else if (e === 1 || e === 4) v = 5; else if (e < 4) v = 3;
    else {
      const d = Math.abs(x - size / 2 + 0.5) + Math.abs(y - size / 2 + 0.5);
      if (d < 4) v = 6; else if (Math.round(d) % 7 === 0) v = 5; else if (Math.round(d) % 7 === 3) v = 1;
      else if ((x * 7 + y * 3) % 11 === 0) v = 3;
    }
    t.idx[y * size + x] = v;
  }
  return t;
}

/**
 * `dim` (evolution): the same room at dusk — a weaker, cooler window light and a deeper violet
 * vignette, so the evolution rays and sparkles carry the frame.
 */
export function buildRoomSet(quality: Quality, o: { dim?: boolean } = {}): RoomSet {
  const q = quality;
  const rng = new Rng(61);
  const group = new THREE.Group();
  group.name = 'hd2d-room';
  const extra: { dispose(): void }[] = [];
  const updates: ((t: number) => void)[] = [];
  const W = (k = 1) => new THREE.Color(1, 1, 1).multiplyScalar(k);
  const BACK = -4.2;

  // ---- floor: honey planks running toward the camera (half-size texels: the room is seen close)
  const wood = new VoxelBatch(32);
  for (let x = -9.6; x < 9.6; x += 0.8) {
    const tint = W(0.86 + rng.next() * 0.2);
    wood.box([x, -0.2, BACK - 0.5], [x + 0.8, 0, 7.5], tint, rng, { skip: [false, false, false, true, true, true], aoBottom: 1 });
  }
  // Timber posts and a cross beam against the back wall, a skirting beam.
  for (const px of [-4.9, 4.9]) {
    wood.box([px - 0.22, 0, BACK + 0.05], [px + 0.22, 6.2, BACK + 0.5], W(0.72), rng, { aoBottom: 0.6 });
    wood.box([px - 0.3, 0, BACK + 0.0], [px + 0.3, 0.3, BACK + 0.6], W(0.66), rng, { aoBottom: 0.55 });
  }
  wood.box([-9.6, 5.0, BACK + 0.05], [9.6, 5.45, BACK + 0.55], W(0.62), rng);
  wood.box([-9.6, 0, BACK + 0.05], [9.6, 0.22, BACK + 0.2], W(0.7), rng, { aoBottom: 0.7 });
  // A shelf of books at the back right, a crate pair at the back left.
  const paint = new VoxelBatch(16);
  {
    const sx0 = 2.0, sx1 = 4.4, sz = BACK + 0.15;
    for (const y of [0.0, 0.85, 1.7, 2.55]) wood.box([sx0, y, sz], [sx1, y + 0.08, sz + 0.55], W(0.92), rng);
    for (const x of [sx0, sx1 - 0.08]) wood.box([x, 0, sz], [x + 0.08, 2.63, sz + 0.55], W(0.8), rng);
    const hues = ['#3f7a52', '#2f5a8a', '#b3412c', '#d29a36', '#6a4a8e', '#e8dcc0'];
    for (const y of [0.08, 0.93, 1.78]) {
      let x = sx0 + 0.12;
      let run = rng.pick(hues);
      while (x < sx1 - 0.22) {
        if (rng.chance(0.3)) run = rng.pick(hues);
        const w = 0.08 + rng.next() * 0.05, h = 0.52 + rng.next() * 0.2;
        if (rng.chance(0.08)) { x += 0.12; continue; }
        paint.box([x, y, sz + 0.1], [x + w, y + h, sz + 0.48], new THREE.Color(run).multiplyScalar(0.85 + rng.next() * 0.3), rng);
        x += w + 0.01;
      }
    }
    wood.rotBox([-3.6, 0.3, BACK + 0.75], [0.62, 0.6, 0.62], 0.2, W(1.0), rng);
    wood.rotBox([-3.55, 0.82, BACK + 0.75], [0.44, 0.44, 0.44], -0.3, W(1.08), rng);
    wood.rotBox([-2.8, 0.25, BACK + 0.9], [0.5, 0.5, 0.5], 0.5, W(0.95), rng);
  }

  // ---- back wall: fitted ashlar courses with a window opening high on the left
  const stone = new VoxelBatch(16);
  const win = { x0: -3.3, x1: -1.5, y0: 2.6, y1: 4.4 };
  {
    const course = 0.48;
    for (let row = 0, y = 0; y < 6.4; row++, y += course) {
      let x = -9.6 + (row % 2) * 0.45 - rng.next() * 0.3;
      while (x < 9.6) {
        const w = 0.75 + rng.next() * 0.6;
        const x1 = Math.min(9.6, x + w);
        const inWin = x1 > win.x0 && x < win.x1 && y + course > win.y0 && y < win.y1;
        if (!inWin) {
          const d = 0.02 + rng.next() * 0.06;
          const tone = 0.62 + rng.next() * 0.22 + Math.min(0.12, y * 0.02);
          stone.box([x + 0.02, y + 0.02, BACK - 0.5], [x1 - 0.02, y + course - 0.02, BACK + d], W(tone), rng, { aoBottom: 0.75, skip: [false, false, false, false, false, true] });
        }
        x = x1;
      }
    }
    // Window reveal: deep stone jambs, a sill and a lintel.
    stone.box([win.x0 - 0.12, win.y0 - 0.14, BACK - 0.5], [win.x1 + 0.12, win.y0, BACK + 0.22], W(0.95), rng);
    stone.box([win.x0 - 0.16, win.y1, BACK - 0.5], [win.x1 + 0.16, win.y1 + 0.18, BACK + 0.18], W(0.85), rng);
  }
  // Window glass glow (HDR panes, mullions in wood) behind the opening.
  const glow = new VoxelBatch(16);
  {
    const pane = new THREE.Color('#ffe2a8').multiplyScalar(3.0);
    const cols = 2, rows = 2;
    const pw = (win.x1 - win.x0) / cols, ph = (win.y1 - win.y0) / rows;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      glow.box([win.x0 + i * pw + 0.05, win.y0 + j * ph + 0.05, BACK - 0.45], [win.x0 + (i + 1) * pw - 0.05, win.y0 + (j + 1) * ph - 0.05, BACK - 0.4], pane.clone().multiplyScalar(0.9 + rng.next() * 0.2), rng, { flat: true });
    }
    // Sconce flames left and right of the shelf.
    for (const [x, y] of [[-5.9, 2.6], [5.9, 2.6]] as const) {
      glow.box([x - 0.06, y, BACK + 0.32], [x + 0.06, y + 0.2, BACK + 0.44], new THREE.Color('#ffb444').multiplyScalar(2.6), rng, { flat: true });
      wood.box([x - 0.14, y - 0.12, BACK + 0.1], [x + 0.14, y, BACK + 0.5], W(0.7), rng);
    }
  }

  // ---- the plinth: three cut octagonal tiers and a lit top (stone, texel bevel), on a rug
  const plinthB = new VoxelBatch(32);
  octSlab(plinthB, 0, 0.14, 1.12, W(0.8), 1.1, 0.5);
  octSlab(plinthB, 0.14, 0.24, 0.98, W(0.92), 1.14, 0.6);
  octSlab(plinthB, 0.24, 0.5, 0.8, W(0.95), 1.1, 0.62);
  octSlab(plinthB, 0.5, PLINTH_TOP, 0.92, W(1.08), 1.26, 0.75);
  const texStone = cachedTexture('scr-room-plinth', () => paintRock(17, 32, RAMPS2.sandstone));
  const plinthMat = surfaceMaterial(texStone, undefined, true);
  extra.push(plinthMat);
  const plinth = mkMesh(plinthB.build(), plinthMat);
  plinth.name = 'hd2d-plinth';
  group.add(plinth);
  {
    const tex = pixelTexture(paintRoomRug(48).toCanvas());
    extra.push(tex);
    const g = new THREE.PlaneGeometry(48 * TEXEL, 34 * TEXEL);
    g.rotateX(-Math.PI / 2);
    const rug = mkMesh(g, new THREE.MeshLambertMaterial({ map: tex }), false, true);
    rug.position.set(0, 0.012, 0.25);
    group.add(rug);
  }

  const texPlank = cachedTexture('scr-room-plank', () => paintPlanks(4, 64, 64, 8));
  const texWall = cachedTexture('scr-room-ashlar', () => paintStone(23, 32));
  const texPaint = cachedTexture('paint', () => paintSteel(2, 16, RAMPS.paint));
  for (const [b, tex, seam] of [[wood, texPlank, true], [stone, texWall, true], [paint, texPaint, true]] as const) {
    const m = surfaceMaterial(tex, undefined, true, seam);
    extra.push(m);
    group.add(mkMesh(b.build(), m));
  }
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  extra.push(glowMat);
  group.add(mkMesh(glow.build(), glowMat, false, false));

  // ---- light: a warm cookie spot through the window onto the plinth, dim warm fill
  const cookie = windowCookie(2, 2);
  extra.push(cookie);
  const winC = new THREE.Vector3((win.x0 + win.x1) / 2, (win.y0 + win.y1) / 2, BACK - 0.4);
  const target = new THREE.Vector3(0.2, 0, 0.4);
  const toWin = winC.clone().sub(target).normalize();
  const elev = Math.asin(toWin.y), azim = Math.atan2(toWin.x, -toWin.z);
  const rig = lightRig(group, 'cave', {
    quality: q, target: [target.x, target.y, target.z], extent: 3.2, elev, azim, cookie,
    keyK: o.dim ? 1.1 : 2.2, hemiK: o.dim ? 0.45 : 0.62, sky: o.dim ? '#b8a8ff' : '#ffcf9a', ground: o.dim ? '#1c1430' : '#3a2016', keyColor: o.dim ? '#d8c8ff' : undefined,
  });
  extra.push(rig);
  if (q === 'high') {
    for (const x of [-5.9, 5.9]) {
      const p = new THREE.PointLight(new THREE.Color('#ffaa55'), 3.2, 5, 1.6);
      p.position.set(x, 2.9, BACK + 0.9);
      group.add(p);
    }
  }
  // The shaft from the window to the plinth, and motes in it.
  const beam: BeamSpec = { start: winC.clone().add(new THREE.Vector3(0, 0, 0.3)), end: new THREE.Vector3(0.35, 0, 0.6), width: [1.3, 2.4], fade: 0.25 };
  const rays = lightBeams([beam], o.dim ? '#d8c8ff' : '#ffd9a0', o.dim ? 0.22 : 0.36);
  const motes = dustMotes([beam], q === 'high' ? 40 : 20, rng, '#fff0c8');
  group.add(rays.mesh, motes.points);
  updates.push(rays.update, motes.update);

  const spriteLight: SpriteLight = { ...rig.spriteLight, front: 0.6 };
  const grade = warmCaveGrade();
  grade.vignette = o.dim ? 0.72 : 0.62; grade.vignetteSoft = 0.5;
  grade.exposure = o.dim ? 1.0 : 1.12;
  if (o.dim) { grade.shadowTint = new THREE.Color('#2a1e50'); grade.splitAmount = 0.2; grade.gain.set(0.98, 0.97, 1.04); }
  grade.tiltTop = 1.4; grade.focusTop = 0.7;
  grade.bottomShade = -0.2;

  return {
    group, spriteLight, grade, background: o.dim ? '#0c0816' : '#120a07', fog: null, plinth,
    update(t) { for (const u of updates) u(t); },
    setPixelSize(px) { motes.setPixelSize(px); },
    dispose() { disposeGroup(group, extra); },
  };
}
