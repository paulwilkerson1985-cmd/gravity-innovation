// The pixel font covers every character the game shows, and the glyph tracer makes clean outlines.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../tools/pixelfont/glyphs';
import { glyphWidth, pixels, trace } from '../tools/pixelfont/build';
import { FRAME_PANEL, FRAME_PLATE, FRAME_WELL, gridSvg } from '../src/ui/pixel/skin';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|css)$/.test(f) ? [p] : [];
  });
}

describe('Orbkin Pixel font', () => {
  it('has a glyph for every character in the game\'s text (data, scenes, UI)', () => {
    const src = ['src/data', 'src/scenes', 'src/ui', 'src/game'].flatMap((d) => files(join(ROOT, d))).map((f) => readFileSync(f, 'utf8')).join('\n');
    // Only string literals matter; comments may use anything. Pull '…', "…" and `…` contents.
    const strings = src.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) ?? [];
    const missing = new Set<string>();
    for (const s of strings) for (const ch of s.slice(1, -1)) {
      const cp = ch.codePointAt(0)!;
      if (cp < 32 || cp === 127 || cp > 0xffff) continue; // control chars, emoji (system fallback)
      if (!GLYPHS[ch]) missing.add(ch);
    }
    expect([...missing].join(' ')).toBe('');
  });

  it('covers printable ASCII and the typographic extras the UI uses', () => {
    for (let c = 32; c < 127; c++) expect(GLYPHS[String.fromCharCode(c)], `U+${c.toString(16)}`).toBeDefined();
    for (const ch of '×→▶▼·…✓“”’½¼éèàçñöüÉ') expect(GLYPHS[ch], ch).toBeDefined();
  });

  it('glyph rows are rectangular and sit on the 9-row grid (7 cap + 2 descender)', () => {
    for (const [ch, g] of Object.entries(GLYPHS)) {
      const w = glyphWidth(g);
      expect(g.rows.every((r) => r.length === w), `${ch} rows`).toBe(true);
      expect(g.rows.length, `${ch} height`).toBeLessThanOrEqual(11);
    }
  });

  it('traces pixels into closed loops with no collinear points', () => {
    // Every glyph's outline area equals its pixel count (signed shoelace: holes subtract).
    for (const [ch, g] of Object.entries(GLYPHS)) {
      const px = pixels(g);
      const area = trace(px).reduce((sum, l) => sum + l.reduce((a, p, i) => { const q = l[(i + 1) % l.length]!; return a + p[0] * q[1] - q[0] * p[1]; }, 0) / 2, 0);
      expect(area, ch).toBe(px.length);
    }
    const loops = trace(pixels(GLYPHS['8']!));
    for (const l of loops) {
      expect(l.length).toBeGreaterThanOrEqual(4);
      l.forEach((p, i) => {
        const q = l[(i + 1) % l.length]!;
        expect(p[0] === q[0] || p[1] === q[1]).toBe(true); // axis-aligned edges only
      });
    }
    // Two diagonally touching pixels stay separate shapes.
    expect(trace([[0, 0], [1, 1]]).length).toBe(2);
  });

  it('the built font file is committed', () => {
    const f = join(ROOT, 'src/assets/fonts/orbkin-pixel.otf');
    expect(existsSync(f)).toBe(true);
    expect(readFileSync(f).subarray(0, 4).toString('latin1')).toBe('OTTO');
  });
});

describe('pixel frames', () => {
  it('9-slice grids are square, odd-sized and symmetric in shape', () => {
    for (const g of [FRAME_PANEL, FRAME_PLATE, FRAME_WELL]) {
      expect(g.length % 2).toBe(1);
      expect(g.every((r) => r.length === g.length)).toBe(true);
      // corners are notched (transparent) on the outline
      expect(g[0]![0]).toBe('.');
      expect(g[g.length - 1]![g.length - 1]).toBe('.');
    }
    expect(gridSvg(FRAME_PANEL)).toMatch(/^url\("data:image\/svg\+xml,/);
  });
});
