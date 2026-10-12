import { describe, expect, it } from 'vitest';
import {
  BENCH_XP_SHARE, LEVEL_CAP, species, awardXp, xpYieldFor, calcStats, createBattle, getDex, makeCreature, resolveTurn, toBattle, xpForLevel, chooseAction,
  type BattleState, type OwnedCreature,
} from '../src/engine';
import { newPlayer, type PlayerState } from '../src/game/state';
import {
  CHAMPION_ID, applyBattleXp, blackout, consumeBag, evolutionQueue, evolutionsAfterWin, evolvePartyMember, formatClock, isTrainerDefeated,
  routeBlockers, startTrainerBattle, teachMove, trainerVictory, withDebugParty, withDefeated, withSeen, xpProgress,
} from '../src/game/progress';

function playerWith(party: OwnedCreature[]): PlayerState {
  const p = newPlayer(1);
  p.party = party;
  p.caught = party.map((c) => c.species);
  p.seen = [...p.caught];
  return p;
}

/** A finished wild battle in which every foe fainted against the active party member. */
function wonBattle(p: PlayerState, foes: [string, number][], fromTrainer = false): BattleState {
  const { state } = createBattle(fromTrainer ? 'trainer' : 'wild', 9,
    { name: 'You', controller: 'human', party: p.party.map(toBattle) },
    { name: 'Foe', controller: 'ai', ai: 'rookie', isWild: !fromTrainer, party: foes.map(([s, l], i) => toBattle(makeCreature(s, l, `f${i}`))) });
  const s = structuredClone(state);
  for (const f of s.sides[1].party) {
    f.hp = 0;
    s.participants[f.uid] = [s.sides[0].party[s.sides[0].active]!.uid];
  }
  s.phase = 'over';
  s.outcome = { winner: 0, reason: 'ko' };
  return s;
}

describe('applyBattleXp', () => {
  it('awards the engine XP to the participant and the bench share to the rest of the party', () => {
    const c = makeCreature('ashkit', 5, 'a');
    const bench = makeCreature('breezel', 5, 'b');
    const p = playerWith([c, bench]);
    const b = wonBattle(p, [['breezel', 4]]);
    const award = awardXp(b);
    const r = applyBattleXp(p, b);
    expect(r.gains.map((g) => g.uid)).toEqual(['a', 'b']);
    expect(r.gains[0]!.amount).toBe(award.a);
    expect(r.player.party[0]!.xp).toBe(c.xp + award.a!);
    expect(award.b).toBe(Math.floor(xpYieldFor('breezel', 4, false) * BENCH_XP_SHARE));
    expect(r.player.party[1]!.xp).toBe(bench.xp + award.b!); // bench watched: half share
    expect(p.party[0]!.xp).toBe(c.xp); // input untouched
  });

  it('handles multi-level jumps with stat deltas, auto-learns, and only offers when 4 moves are known', () => {
    const c = makeCreature('ashkit', 5, 'a'); // 2 moves known
    const p = playerWith([c]);
    const b = wonBattle(p, [['cragmaul', 22]], true);
    const r = applyBattleXp(p, b);
    const ev = r.gains[0]!.events;
    const levels = ev.filter((e) => e.t === 'levelUp');
    expect(levels.length).toBeGreaterThan(1);
    const after = r.player.party[0]!;
    expect(after.level).toBe(5 + levels.length);
    for (const e of levels) if (e.t === 'levelUp') expect(e.after.hp).toBeGreaterThanOrEqual(e.before.hp);
    expect(ev.some((e) => e.t === 'learned' && e.move === 'battle-cry')).toBe(true);
    expect(after.moves.map((m) => m.id)).toContain('battle-cry');
    expect(after.hp).toBe(calcStats('ashkit', after.level).hp); // was full, stays full
  });

  it('emits a move offer for a full moveset, resolved with teachMove (replace or skip)', () => {
    const c = makeCreature('ashkit', 10, 'a');
    c.moves = ['bump', 'cinder-spit', 'battle-cry', 'quick-jab'].map((id) => ({ id, pp: getDex().moves.get(id)!.pp }));
    c.xp = xpForLevel(11) - 1;
    const p = playerWith([c]);
    const r = applyBattleXp(p, wonBattle(p, [['breezel', 3]]));
    const offer = r.gains[0]!.events.find((e) => e.t === 'moveOffer');
    expect(offer && offer.t === 'moveOffer' && offer.move).toBe('searing-fang');
    expect(r.player.party[0]!.moves.map((m) => m.id)).not.toContain('searing-fang');
    const taught = teachMove(r.player, 'a', 'searing-fang', 3);
    expect(taught.party[0]!.moves.map((m) => m.id)).toEqual(['bump', 'cinder-spit', 'battle-cry', 'searing-fang']);
    const skipped = teachMove(r.player, 'a', 'searing-fang', null);
    expect(skipped.party[0]!.moves).toEqual(r.player.party[0]!.moves);
  });

  it('gives nothing for a caught or fled battle', () => {
    const p = playerWith([makeCreature('ashkit', 5, 'a')]);
    const b = wonBattle(p, [['breezel', 4]]);
    b.sides[1].party[0]!.hp = 5;
    b.outcome = { winner: 0, reason: 'caught' };
    expect(applyBattleXp(p, b).gains).toEqual([]);
  });
});

describe('evolution queue', () => {
  it('queues every creature that crossed its evolution level and evolves them one by one', () => {
    const a = makeCreature('ashkit', 13, 'a');
    a.xp = xpForLevel(14) - 1;
    const d = makeCreature('dropple', 13, 'd');
    d.xp = xpForLevel(14) - 1;
    const p = playerWith([a, d]);
    const b = wonBattle(p, [['breezel', 10]]);
    b.participants.f0 = ['a', 'd'];
    const r = applyBattleXp(p, b);
    expect(r.evolutions).toEqual(['a', 'd']);
    const q = evolutionQueue(r.player, r.evolutions);
    expect(q).toEqual(['a', 'd']);
    const e1 = evolvePartyMember(r.player, 'a');
    expect(e1.into).toBe('cindertail');
    expect(e1.player.caught).toContain('cindertail');
    expect(e1.player.seen).toContain('cindertail');
    // Once evolved it drops out of the queue; the other is still pending.
    expect(evolutionQueue(e1.player, r.evolutions)).toEqual(['d']);
    const e2 = evolvePartyMember(e1.player, 'd');
    expect(e2.player.party.map((c) => c.species)).toEqual(['cindertail', 'rillback']);
  });

  it('a stopped evolution is offered again on the next level-up', () => {
    const a = makeCreature('ashkit', 14, 'a'); // already able, player stopped it
    a.xp = xpForLevel(15) - 1;
    const p = playerWith([a]);
    const r = applyBattleXp(p, wonBattle(p, [['breezel', 3]]));
    expect(r.player.party[0]!.level).toBe(15);
    expect(r.evolutions).toEqual(['a']);
  });

  it('a stopped evolution comes back after the next win even without a level-up (level cap)', () => {
    const c = makeCreature('cindertail', LEVEL_CAP, 'c'); // at the cap: it can never level up again
    const benchy = makeCreature('ashkit', species('ashkit').evolvesTo!.level, 'b'); // stopped earlier, sat out the battle
    const p = playerWith([c, benchy]);
    const r = applyBattleXp(p, wonBattle(p, [['breezel', 3]]));
    expect(r.player.party[0]!.level).toBe(LEVEL_CAP);
    expect(r.evolutions).toEqual([]); // no canEvolve event from the engine…
    expect(evolutionsAfterWin(r.player)).toEqual(['c', 'b']); // …but both are offered again
    const e = evolvePartyMember(r.player, 'c');
    expect(evolutionsAfterWin(e.player)).toEqual(['b']);
  });
});

describe('trainers', () => {
  it('startTrainerBattle is deterministic, advances the player rng and uses the trainer AI tier', () => {
    const p = playerWith([makeCreature('ashkit', 8, 'a')]);
    const s1 = startTrainerBattle(p, 'scout-pim');
    const s2 = startTrainerBattle(p, 'scout-pim');
    expect(s1.battle).toEqual(s2.battle);
    expect(s1.player.rng).not.toBe(p.rng);
    expect(s1.battle.kind).toBe('trainer');
    expect(s1.battle.rules.catch).toBe(false);
    expect(s1.battle.sides[1].ai).toBe('rookie');
    expect(s1.battle.sides[1].party.map((c) => c.species)).toEqual(['pebblet', 'flickwing', 'breezel']);
  });

  it('a trainer battle can be played to the end with the engine', () => {
    const p = withDebugParty(newPlayer(3), [{ species: 'pyrelord', level: 30 }]);
    let { battle } = startTrainerBattle(p, 'scout-pim');
    for (let i = 0; i < 50 && battle.phase !== 'over'; i++) {
      const mine = battle.phase === 'replace' ? { type: 'pass' as const } : { type: 'move' as const, index: 0 };
      battle = resolveTurn(battle, [mine, chooseAction(battle, 1, 'rookie')]).state;
    }
    expect(battle.outcome?.winner).toBe(0);
    const xp = applyBattleXp(p, battle);
    expect(xp.gains[0]!.amount).toBe(0 + awardXp(battle)[p.party[0]!.uid]!);
  });

  it('victory pays out once, records the trainer and announces the newly opened route', () => {
    const p = playerWith([makeCreature('ashkit', 8, 'a')]);
    expect(routeBlockers(p, getDex().routes.get('ridge')!).map((t) => t.name)).toEqual(['Pim']);
    const v = trainerVictory(p, 'scout-pim');
    expect(v.reward).toBe(250);
    expect(v.player.money).toBe(p.money + 250);
    expect(v.unlocked).toEqual(['ridge']);
    expect(isTrainerDefeated(v.player, 'scout-pim')).toBe(true);
    expect(v.crowned).toBe(false);
    const again = trainerVictory(v.player, 'scout-pim');
    expect(again.reward).toBe(0);
    expect(again.unlocked).toEqual([]);
    expect(again.player.defeatedTrainers).toEqual(['scout-pim']);
  });

  it('both ridge trainers are needed for the coast; the Champion crowns the player', () => {
    let p = playerWith([makeCreature('ashkit', 8, 'a')]);
    p = trainerVictory(p, 'scout-pim').player;
    const brann = trainerVictory(p, 'hiker-brann');
    expect(brann.unlocked).toEqual([]);
    const sola = trainerVictory(brann.player, 'adept-sola');
    expect(sola.unlocked).toEqual(['coast']);
    const pre = withDefeated(sola.player, ['angler-merrow', 'rider-tavi']);
    expect(routeBlockers(pre, getDex().routes.get('plateau')!)).toEqual([]);
    const champ = trainerVictory(pre, CHAMPION_ID);
    expect(champ.crowned).toBe(true);
    expect(champ.player.champion).toBe(true);
    expect(trainerVictory(champ.player, CHAMPION_ID).crowned).toBe(false);
  });

  it('blackout heals the whole party with no money lost', () => {
    const a = makeCreature('ashkit', 8, 'a');
    a.hp = 0;
    a.status = 'burn';
    const p = playerWith([a]);
    const out = blackout(p);
    expect(out.party[0]!.hp).toBe(calcStats('ashkit', 8).hp);
    expect(out.party[0]!.status).toBeNull();
    expect(out.money).toBe(p.money);
  });
});

describe('helpers', () => {
  it('consumeBag decrements and refuses at zero', () => {
    const p = newPlayer(1);
    const q = consumeBag(p, 'tonic');
    expect(q.bag.tonic).toBe((p.bag.tonic ?? 0) - 1);
    expect(() => consumeBag(q, 'revive-seed')).toThrow();
  });

  it('xpProgress, formatClock, withSeen, withDebugParty', () => {
    expect(xpProgress(5, xpForLevel(5))).toBe(0);
    expect(xpProgress(5, (xpForLevel(5) + xpForLevel(6)) / 2)).toBeCloseTo(0.5);
    expect(xpProgress(30, xpForLevel(30))).toBe(1);
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(3725)).toBe('1:02:05');
    const p = newPlayer(1);
    expect(withSeen(p, 'breezel').seen).toContain('breezel');
    expect(p.seen).not.toContain('breezel');
    const d = withDebugParty(p, [{ species: 'pyrelord', level: 30 }, { species: 'ashkit', level: 13 }]);
    expect(d.party.map((c) => [c.species, c.level])).toEqual([['pyrelord', 30], ['ashkit', 13]]);
    expect(new Set(d.party.map((c) => c.uid)).size).toBe(2);
  });
});
