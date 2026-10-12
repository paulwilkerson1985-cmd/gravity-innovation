import { describe, expect, it } from 'vitest';
import {
  BAG_STACK_MAX, PARTY_MAX, buyItem, chooseStarter, depositBlocker, depositToBox, formatPlayTime, maxAffordable, moveInParty,
  newPlayer, priceOf, setLead, setTextSpeed, textSpeedFactor, useBagItem, withdrawFromBox, type PlayerState,
} from '../src/game/state';
import { calcStats, makeCreature } from '../src/engine';

function withParty(...species: string[]): PlayerState {
  const p = chooseStarter(newPlayer(1), species[0]!);
  species.slice(1).forEach((s, i) => p.party.push(makeCreature(s, 5, `x${i}`)));
  return p;
}

describe('party ordering', () => {
  it('moves and sets lead without mutating', () => {
    const p = withParty('ashkit', 'breezel', 'pebblet');
    const q = moveInParty(p, 0, 2);
    expect(q.party.map((c) => c.species)).toEqual(['breezel', 'pebblet', 'ashkit']);
    expect(p.party[0]!.species).toBe('ashkit');
    expect(setLead(p, 2).party.map((c) => c.species)).toEqual(['pebblet', 'ashkit', 'breezel']);
    expect(() => moveInParty(p, 0, 5)).toThrow();
  });
});

describe('box', () => {
  it('deposits and withdraws', () => {
    let p = withParty('ashkit', 'breezel');
    p = depositToBox(p, 1);
    expect(p.party).toHaveLength(1);
    expect(p.box.map((c) => c.species)).toEqual(['breezel']);
    p = withdrawFromBox(p, 0);
    expect(p.party.map((c) => c.species)).toEqual(['ashkit', 'breezel']);
    expect(p.box).toHaveLength(0);
  });
  it('keeps at least one conscious kin in the party', () => {
    const p = withParty('ashkit', 'breezel');
    expect(depositBlocker(withParty('ashkit'), 0)).toMatch(/at least one/);
    p.party[1]!.hp = 0;
    expect(depositBlocker(p, 0)).toMatch(/can still battle/);
    expect(() => depositToBox(p, 0)).toThrow();
    expect(depositToBox(p, 1).box).toHaveLength(1); // fainted one can go
  });
  it('refuses to withdraw into a full party', () => {
    const p = withParty('ashkit', 'breezel', 'pebblet', 'flickwing', 'breezel', 'pebblet');
    expect(p.party).toHaveLength(PARTY_MAX);
    p.box.push(makeCreature('flickwing', 3, 'b1'));
    expect(() => withdrawFromBox(p, 0)).toThrow(/full/);
  });
});

describe('shop', () => {
  it('buys within budget and refuses to overspend', () => {
    const p = newPlayer(1); // 500 money
    const q = buyItem(p, 'orb', 2);
    expect(q.money).toBe(500 - 2 * priceOf('orb'));
    expect(q.bag.orb).toBe(12);
    expect(() => buyItem(p, 'star', 1)).toThrow(/money/);
    expect(() => buyItem(p, 'orb', 0)).toThrow();
    expect(maxAffordable(p, 'orb')).toBe(2);
    expect(buyItem({ ...p, money: 5000 }, 'remedy', 3).bag.remedy).toBe(3);
  });
  it('caps stacks', () => {
    const p = { ...newPlayer(1), money: 1e6 };
    p.bag = { orb: BAG_STACK_MAX - 1 };
    expect(maxAffordable(p, 'orb')).toBe(1);
    expect(() => buyItem(p, 'orb', 2)).toThrow(/at most/);
  });
});

describe('bag items outside battle', () => {
  it('heals and consumes one', () => {
    const p = withParty('ashkit');
    p.party[0]!.hp = 3;
    const q = useBagItem(p, 'tonic', 0);
    expect(q.party[0]!.hp).toBe(Math.min(calcStats('ashkit', 5).hp, 23));
    expect(q.bag.tonic).toBe(2);
  });
  it('refuses useless or missing items', () => {
    const p = withParty('ashkit');
    expect(() => useBagItem(p, 'tonic', 0)).toThrow(/effect/);
    expect(() => useBagItem(p, 'remedy', 0)).toThrow(/No Remedy/);
    p.party[0]!.hp = 0;
    expect(useBagItem({ ...p, bag: { 'revive-seed': 1 } }, 'revive-seed', 0).party[0]!.hp).toBeGreaterThan(0);
  });
});

describe('settings & formatting', () => {
  it('text speed', () => {
    const p = newPlayer(1);
    expect(textSpeedFactor(p)).toBe(1);
    expect(textSpeedFactor(setTextSpeed(p, 'fast'))).toBeLessThan(1);
    expect(textSpeedFactor(setTextSpeed(p, 'slow'))).toBeGreaterThan(1);
    expect(() => setTextSpeed(p, 'warp' as never)).toThrow();
  });
  it('play time', () => {
    expect(formatPlayTime(0)).toBe('< 1m');
    expect(formatPlayTime(59)).toBe('< 1m');
    expect(formatPlayTime(60)).toBe('1m');
    expect(formatPlayTime(59 * 60 + 59)).toBe('59m');
    expect(formatPlayTime(3600 + 5 * 60)).toBe('1h 05m');
    expect(formatPlayTime(NaN)).toBe('< 1m');
  });
});
