import { describe, expect, it } from 'vitest';
import { ELEMENTS, TYPE_CHART, typeMultiplier } from '../src/engine';

describe('type chart', () => {
  it('each type is 2× vs two types and 0.5× vs two types', () => {
    for (const t of ELEMENTS) {
      expect(TYPE_CHART[t].strong).toHaveLength(2);
      expect(TYPE_CHART[t].weak).toHaveLength(2);
      const vs = ELEMENTS.map((d) => typeMultiplier(t, [d]));
      expect(vs.filter((m) => m === 2)).toHaveLength(2);
      expect(vs.filter((m) => m === 0.5)).toHaveLength(2);
      expect(vs.filter((m) => m === 1)).toHaveLength(2);
    }
  });
  it('matches the spec rows', () => {
    expect(typeMultiplier('Flame', ['Flora'])).toBe(2);
    expect(typeMultiplier('Flame', ['Gale'])).toBe(2);
    expect(typeMultiplier('Flame', ['Tide'])).toBe(0.5);
    expect(typeMultiplier('Tide', ['Terra'])).toBe(2);
    expect(typeMultiplier('Flora', ['Spark'])).toBe(2);
    expect(typeMultiplier('Spark', ['Terra'])).toBe(0.5);
    expect(typeMultiplier('Terra', ['Gale'])).toBe(0.5);
    expect(typeMultiplier('Gale', ['Terra'])).toBe(2);
  });
  it('every type receives 2× from exactly two attackers (balanced defensively)', () => {
    for (const d of ELEMENTS) {
      expect(ELEMENTS.filter((a) => typeMultiplier(a, [d]) === 2)).toHaveLength(2);
      expect(ELEMENTS.filter((a) => typeMultiplier(a, [d]) === 0.5)).toHaveLength(2);
    }
  });
  it('dual types multiply and Neutral is always 1×', () => {
    expect(typeMultiplier('Tide', ['Flame', 'Terra'])).toBe(4);
    expect(typeMultiplier('Flame', ['Tide', 'Terra'])).toBe(0.25);
    expect(typeMultiplier('Spark', ['Tide', 'Flora'])).toBe(1);
    for (const d of ELEMENTS) expect(typeMultiplier('Neutral', [d])).toBe(1);
  });
});
