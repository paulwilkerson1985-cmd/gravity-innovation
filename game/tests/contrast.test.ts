import { describe, expect, it } from 'vitest';
import { contrastRatio, inkSafeFill } from '../src/ui/contrast';
import { TYPE_COLORS } from '../src/ui/dom';

describe('chip / badge fills', () => {
  it('measures WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
  });

  it('every type chip and status badge carries white text at >= 4.5:1', () => {
    const statuses = ['#ff6a3d', '#e0a800', '#9a6cff', '#5a5480', '#8a3a4a'];
    for (const c of [...Object.values(TYPE_COLORS), ...statuses]) {
      const fill = inkSafeFill(c);
      expect(contrastRatio(fill, '#ffffff'), `${c} -> ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps colours that already pass and keeps the hue of darkened ones', () => {
    expect(inkSafeFill('#2a2238')).toBe('#2a2238');
    const f = inkSafeFill('#4cc35a');
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r!); expect(g).toBeGreaterThan(b!);
  });
});
