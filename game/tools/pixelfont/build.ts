// Build "Orbkin Pixel" (src/assets/fonts/orbkin-pixel.otf) from the bitmap glyph table.
//   npx tsx tools/pixelfont/build.ts
// Every glyph bitmap is traced into clean outlines (one contour per connected edge loop, holes
// wound the other way, collinear points dropped), so the font renders as crisp squares at
// 10px, 20px, 30px… with no seams between pixels.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { GLYPHS, type GlyphDef } from './glyphs';

export const UNIT = 100; // font units per pixel
export const EM = 1000;
export const ASCENT = 8;
export const DESCENT = 2;
const TOP = 6; // y of the first row of a 9-row glyph (cap line)

/** Pixels of a glyph as [x, y] with y up from the baseline. */
export function pixels(def: GlyphDef): [number, number][] {
  const extra = Math.max(0, def.rows.length - 9);
  const out: [number, number][] = [];
  def.rows.forEach((row, i) => {
    const y = TOP + extra - i;
    [...row].forEach((c, x) => { if (c === '#') out.push([x, y]); });
  });
  return out;
}

export function glyphWidth(def: GlyphDef): number {
  return Math.max(...def.rows.map((r) => r.length));
}

/** Trace filled cells into closed polygons (counter-clockwise outers, clockwise holes). */
export function trace(px: [number, number][]): [number, number][][] {
  const filled = new Set(px.map(([x, y]) => `${x},${y}`));
  const on = (x: number, y: number) => filled.has(`${x},${y}`);
  type Edge = { a: [number, number]; b: [number, number]; used: boolean };
  const edges: Edge[] = [];
  const add = (a: [number, number], b: [number, number]) => edges.push({ a, b, used: false });
  for (const [x, y] of px) {
    if (!on(x, y - 1)) add([x, y], [x + 1, y]); // bottom, walking +x (ink on the left)
    if (!on(x + 1, y)) add([x + 1, y], [x + 1, y + 1]); // right, walking +y
    if (!on(x, y + 1)) add([x + 1, y + 1], [x, y + 1]); // top, walking -x
    if (!on(x - 1, y)) add([x, y + 1], [x, y]); // left, walking -y
  }
  const from = new Map<string, Edge[]>();
  for (const e of edges) {
    const k = `${e.a[0]},${e.a[1]}`;
    (from.get(k) ?? from.set(k, []).get(k)!).push(e);
  }
  const loops: [number, number][][] = [];
  for (const start of edges) {
    if (start.used) continue;
    const loop: [number, number][] = [];
    let e: Edge | undefined = start;
    while (e && !e.used) {
      e.used = true;
      loop.push(e.a);
      const cands: Edge[] = (from.get(`${e.b[0]},${e.b[1]}`) ?? []).filter((c) => !c.used);
      if (cands.length > 1) {
        // Diagonal touch: turn left first, so touching pixels stay separate loops.
        const dx = e.b[0] - e.a[0], dy = e.b[1] - e.a[1];
        const cur: Edge = e;
        cands.sort((p, q) => {
          const cross = (c: Edge) => dx * (c.b[1] - c.a[1]) - dy * (c.b[0] - c.a[0]);
          void cur;
          return cross(q) - cross(p);
        });
      }
      e = cands[0];
    }
    // drop collinear points
    const pts = loop.filter((p, i) => {
      const a = loop[(i - 1 + loop.length) % loop.length]!, c = loop[(i + 1) % loop.length]!;
      return (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0]) !== 0;
    });
    if (pts.length >= 3) loops.push(pts);
  }
  return loops;
}

function buildFont(): opentype.Font {
  const notdef = new opentype.Path();
  const box = (x0: number, y0: number, x1: number, y1: number, path: opentype.Path) => {
    path.moveTo(x0 * UNIT, y0 * UNIT); path.lineTo(x1 * UNIT, y0 * UNIT); path.lineTo(x1 * UNIT, y1 * UNIT); path.lineTo(x0 * UNIT, y1 * UNIT); path.close();
  };
  box(0, 0, 4, 7, notdef);
  // hole (clockwise)
  notdef.moveTo(1 * UNIT, 1 * UNIT); notdef.lineTo(1 * UNIT, 6 * UNIT); notdef.lineTo(3 * UNIT, 6 * UNIT); notdef.lineTo(3 * UNIT, 1 * UNIT); notdef.close();
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 5 * UNIT, path: notdef })];
  const chars = Object.keys(GLYPHS).sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  for (const ch of chars) {
    const def = GLYPHS[ch]!;
    const path = new opentype.Path();
    for (const loop of trace(pixels(def))) {
      loop.forEach(([x, y], i) => (i === 0 ? path.moveTo(x * UNIT, y * UNIT) : path.lineTo(x * UNIT, y * UNIT)));
      path.close();
    }
    const cp = ch.codePointAt(0)!;
    glyphs.push(new opentype.Glyph({
      name: `uni${cp.toString(16).toUpperCase().padStart(4, '0')}`, unicode: cp,
      advanceWidth: (def.adv ?? glyphWidth(def) + 1) * UNIT, path,
    }));
  }
  return new opentype.Font({
    familyName: 'Orbkin Pixel', styleName: 'Regular', unitsPerEm: EM, ascender: ASCENT * UNIT, descender: -DESCENT * UNIT,
    designer: 'Orbkin project', description: 'Original bitmap font for Orbkin (project-owned).', copyright: 'Orbkin project. Original work.',
    glyphs,
  });
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && resolve(process.argv[1]) === resolve(here, 'build.ts')) {
  const out = resolve(here, '../../src/assets/fonts/orbkin-pixel.otf');
  mkdirSync(dirname(out), { recursive: true });
  const buf = Buffer.from(buildFont().toArrayBuffer());
  writeFileSync(out, buf);
  console.log(`wrote ${out} (${buf.length} bytes, ${Object.keys(GLYPHS).length} glyphs)`);
}
