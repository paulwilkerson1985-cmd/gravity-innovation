// Geometry facts and black silhouettes for Orbkin kin, straight from the design builders
// (no browser). Run from the game directory with tsx:
//   npx tsx <skill>/scripts/facts.ts --out DIR [--species a,b,c] [--heights 32,64] [--views front,q3,side]
// Writes DIR/facts.json ({ species: { id: {...} } }) and DIR/sil/<id>_<view>_<h>.pgm masks (P5).
// Used by read_sheet.py and lineup.py; you normally do not call it directly.
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { getDex } from '../../../../game/src/engine/dex';
import { buildCreatureGeometry, CreatureView } from '../../../../game/src/render/creature';
import { DESIGNS, LINES } from '../../../../game/src/render/creatures/designs';
import { TEXELS, stageOf } from '../../../../game/src/scenes/hd2dBattle';

const args = process.argv.slice(2);
const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1]! : d; };
const outDir = opt('--out', 'out/facts');
const only = opt('--species', '').split(',').filter(Boolean);
const heights = opt('--heights', '32,64').split(',').map(Number);
const views = opt('--views', 'front,q3,side').split(',');
fs.mkdirSync(path.join(outDir, 'sil'), { recursive: true });

const dex = getDex();
const ids = only.length ? only : [...dex.species.keys()];
// View yaws (rad) about Y; the battle bake looks from the side with a little elevation.
const VIEW: Record<string, { yaw: number; elev: number }> = { front: { yaw: 0, elev: 0.18 }, q3: { yaw: 0.7, elev: 0.18 }, side: { yaw: Math.PI / 2, elev: 0.18 }, back: { yaw: Math.PI, elev: 0.18 } };

function quantColour(r: number, g: number, b: number) { return `${Math.round(r * 12)},${Math.round(g * 12)},${Math.round(b * 12)}`; }

/** Rasterise triangles (already projected to pixel space, y down) into a byte mask. */
function raster(tris: number[][], w: number, h: number): Uint8Array {
  const m = new Uint8Array(w * h);
  for (const t of tris) {
    const [x0, y0, x1, y1, x2, y2] = t as [number, number, number, number, number, number];
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)));
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)));
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6) m[y * w + x] = 1;
    }
  }
  return m;
}

function pgm(file: string, m: Uint8Array, w: number, h: number) {
  const head = Buffer.from(`P5\n${w} ${h}\n255\n`);
  const body = Buffer.alloc(w * h);
  for (let i = 0; i < m.length; i++) body[i] = m[i] ? 0 : 255; // black silhouette on white
  fs.writeFileSync(file, Buffer.concat([head, body]));
}

const out: Record<string, unknown> = {};
for (const id of ids) {
  const sp = dex.species.get(id);
  if (!sp) { console.error(`unknown species ${id}`); process.exitCode = 2; continue; }
  const g = buildCreatureGeometry(sp.look, id);
  const pos = g.attributes.position!;
  const col = g.attributes.color!;
  const rigA = g.attributes.rigA!;
  const tris = pos.count / 3;
  const bb = g.boundingBox!;
  const view = new CreatureView(sp.look, 0, id);
  const baseScale = view.baseScale;
  let meshes = 0; view.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
  const stage = stageOf(id);
  const texelHeight = TEXELS.kin[stage];
  const hModel = bb.max.y - bb.min.y;
  const hWorld = hModel * baseScale; // before the battle's fitKin normalisation (which scales root, not texels)
  const texelsPerUnit = texelHeight / hModel; // the bake maps the model's own height to texelHeight texels
  // Eyes: every triangle tagged with the blink rig (kind 5) belongs to an eye (sclera, iris, pupil, shine).
  const eyeBox: Record<string, THREE.Box3> = { L: new THREE.Box3(), R: new THREE.Box3() };
  let eyeTris = 0;
  for (let i = 0; i < pos.count; i += 3) {
    if (Math.round(rigA.getW(i)) !== 5) continue;
    eyeTris++;
    for (let j = 0; j < 3; j++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i + j);
      eyeBox[p.x < 0 ? 'L' : 'R']!.expandByPoint(p);
    }
  }
  const eye = (b: THREE.Box3) => (b.isEmpty() ? null : { w: +((b.max.x - b.min.x) * texelsPerUnit).toFixed(2), h: +((b.max.y - b.min.y) * texelsPerUnit).toFixed(2), depth: +((b.max.z - b.min.z) * texelsPerUnit).toFixed(2), yFrac: +(((b.min.y + b.max.y) / 2 - bb.min.y) / hModel).toFixed(2) });
  // Pupil height is what reads: the darkest eye triangles' box (pupil/iris), if any.
  const pupil = new THREE.Box3();
  for (let i = 0; i < pos.count; i += 3) {
    if (Math.round(rigA.getW(i)) !== 5) continue;
    const lum = 0.2126 * col.getX(i) + 0.7152 * col.getY(i) + 0.0722 * col.getZ(i);
    if (lum < 0.12 && pos.getX(i) > 0) for (let j = 0; j < 3; j++) pupil.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i + j));
  }
  // Colour blocks: distinct quantised vertex colours and the share of the biggest.
  const counts = new Map<string, number>();
  for (let i = 0; i < col.count; i++) { const k = quantColour(col.getX(i), col.getY(i), col.getZ(i)); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const shares = [...counts.values()].sort((a, b) => b - a).map((n) => n / col.count);
  const blocks = shares.filter((s) => s >= 0.04).length;
  // Silhouettes.
  const sil: Record<string, { file: string; w: number; h: number; fill: number }> = {};
  for (const vn of views) {
    const v = VIEW[vn] ?? { yaw: (Number(vn) * Math.PI) / 180, elev: 0.18 };
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.elev, v.yaw, 0, 'YXZ'));
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < pos.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyQuaternion(q));
    const pb = new THREE.Box3().setFromPoints(pts);
    for (const H of heights) {
      const s = (H - 2) / (pb.max.y - pb.min.y);
      const W = Math.max(4, Math.ceil((pb.max.x - pb.min.x) * s) + 2);
      const tri: number[][] = [];
      for (let i = 0; i < pts.length; i += 3) {
        const t: number[] = [];
        for (let j = 0; j < 3; j++) { const p = pts[i + j]!; t.push((p.x - pb.min.x) * s + 1, (pb.max.y - p.y) * s + 1); }
        tri.push(t);
      }
      const m = raster(tri, W, H);
      const file = path.join(outDir, 'sil', `${id}_${vn}_${H}.pgm`);
      pgm(file, m, W, H);
      let fill = 0; for (const b of m) fill += b;
      sil[`${vn}_${H}`] = { file, w: W, h: H, fill: +(fill / (W * H)).toFixed(3) };
    }
  }
  const design = DESIGNS[id];
  out[id] = {
    name: sp.name, types: sp.types, stage, evolvesTo: sp.evolvesTo?.species ?? null, idle: design?.idle ?? null, hover: design?.hover ?? 0,
    tris, trisBudget: stage === 1 && sp.evolvesTo ? 1800 : 2500, meshes, drawCalls: meshes - 1, grounded: Math.abs(bb.min.y) < 0.01,
    bbox: { x: +(bb.max.x - bb.min.x).toFixed(3), y: +hModel.toFixed(3), z: +(bb.max.z - bb.min.z).toFixed(3), centreX: +((bb.max.x + bb.min.x) / 2).toFixed(3) },
    baseScale, worldHeight: +hWorld.toFixed(3), texelHeight, texelsPerUnit: +texelsPerUnit.toFixed(2),
    eyes: { tris: eyeTris, L: eye(eyeBox.L!), R: eye(eyeBox.R!), pupilTexels: pupil.isEmpty() ? null : { w: +((pupil.max.x - pupil.min.x) * texelsPerUnit).toFixed(2), h: +((pupil.max.y - pupil.min.y) * texelsPerUnit).toFixed(2) } },
    colours: { distinct: counts.size, blocks, shares: shares.slice(0, 6).map((s) => +s.toFixed(3)) },
    sil,
  };
  view.dispose();
  g.dispose();
}
fs.writeFileSync(path.join(outDir, 'facts.json'), JSON.stringify({ lines: LINES, species: out }, null, 1));
console.log(JSON.stringify({ ok: true, species: Object.keys(out).length, out: path.join(outDir, 'facts.json') }));
