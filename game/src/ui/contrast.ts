// WCAG contrast helpers for UI fills that carry white text (type chips, status badges).
// Pure functions (no DOM), unit-tested in tests/contrast.test.ts.

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`bad colour ${hex}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Relative luminance (WCAG 2.x) of an sRGB hex colour. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two sRGB hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The colour darkened (sRGB channels scaled together, so the hue stays) just enough that `text`
 * reads on it at >= `min`:1. Colours that already pass are returned unchanged.
 */
export function inkSafeFill(hex: string, text = '#ffffff', min = 4.5): string {
  const [r, g, b] = rgb(hex);
  for (let k = 1; k > 0.05; k -= 0.02) {
    const c = '#' + [r, g, b].map((v) => Math.round(v * k).toString(16).padStart(2, '0')).join('');
    if (contrastRatio(c, text) >= min) return c;
  }
  return '#000000';
}
