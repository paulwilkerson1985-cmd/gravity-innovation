import { describe, expect, it } from 'vitest';
import {
  addToTeam, defaultMoves, moveSlot, ownedPicks, randomRentalTeam, removeFromTeam, rentalPicks, setMoves, teamProblems, toggleMove,
} from '../src/scenes/arenaTeam';
import { ARENA_LEVEL, learnableMoves, makeCreature, validateArenaTeam } from '../src/engine';

const picks = rentalPicks();
const byId = (id: string) => picks.find((p) => p.key === id)!;

describe('arena team builder logic', () => {
  it('lists every rental as a valid pick', () => {
    expect(picks).toHaveLength(12);
    for (const p of picks) expect(p.entry.moves.length).toBeGreaterThan(0);
  });

  it('adds up to three distinct species and explains refusals', () => {
    let team = addToTeam([], byId('r-pyrelord')).team;
    team = addToTeam(team, byId('r-maelstrode')).team;
    expect(teamProblems(team)).toEqual(['Pick 1 more kin (2/3).']);
    const again = addToTeam(team, byId('r-pyrelord'));
    expect(again.index).toBe(0);
    expect(again.team).toBe(team);
    const full = addToTeam(addToTeam(team, byId('r-stormoth')).team, byId('r-cragmaul'));
    expect(full.error).toMatch(/full/);
    team = addToTeam(team, byId('r-stormoth')).team;
    expect(teamProblems(team)).toEqual([]);
    expect(validateArenaTeam(team)).toEqual([]);
  });

  it('refuses duplicate species from different sources', () => {
    const owned = ownedPicks([makeCreature('pyrelord', 30, 'c9')], []);
    const team = addToTeam([], byId('r-pyrelord')).team;
    const r = addToTeam(team, owned[0]!);
    expect(r.error).toMatch(/different species/);
  });

  it('reorders the lead and removes entries', () => {
    let team = ['r-pyrelord', 'r-maelstrode', 'r-stormoth'].reduce((t, id) => addToTeam(t, byId(id)).team, [] as ReturnType<typeof addToTeam>['team']);
    team = moveSlot(team, 2, 0);
    expect(team.map((e) => e.species)).toEqual(['stormoth', 'pyrelord', 'maelstrode']);
    expect(moveSlot(team, 0, 5)).toBe(team);
    team = removeFromTeam(team, 1);
    expect(team.map((e) => e.species)).toEqual(['stormoth', 'maelstrode']);
  });

  it('toggles moves within 1..4 and only learnable ones', () => {
    const e = { ...byId('r-pyrelord').entry };
    expect(toggleMove(e, 'bump').error).toMatch(/Up to 4/);
    const fewer = toggleMove(e, 'quick-jab');
    expect(fewer.moves).toHaveLength(3);
    expect(toggleMove({ ...e, moves: fewer.moves }, 'droplet-shot').error).toMatch(/can't learn/);
    const one = { ...e, moves: ['pyre-crash'] };
    expect(toggleMove(one, 'pyre-crash').error).toMatch(/at least one/);
    const learnable = learnableMoves('pyrelord', ARENA_LEVEL);
    const add = learnable.find((m) => !fewer.moves.includes(m))!;
    expect(toggleMove({ ...e, moves: fewer.moves }, add).moves).toHaveLength(4);
  });

  it('flags bad move sets in friendly words', () => {
    let team = ['r-pyrelord', 'r-maelstrode', 'r-stormoth'].reduce((t, id) => addToTeam(t, byId(id)).team, [] as ReturnType<typeof addToTeam>['team']);
    team = setMoves(team, 1, []);
    expect(teamProblems(team)[0]).toMatch(/needs at least one move/);
    team = setMoves(team, 1, ['pyre-crash']);
    expect(teamProblems(team)[0]).toMatch(/can't learn/);
  });

  it('turns owned kin of any level into L30-legal entries', () => {
    const low = makeCreature('ashkit', 5, 'c1');
    const [p] = ownedPicks([low], []);
    expect(p!.ownedLevel).toBe(5);
    expect(p!.entry.uid).toBe('own-c1');
    for (const m of p!.entry.moves) expect(learnableMoves('ashkit', ARENA_LEVEL)).toContain(m);
    const weird = { ...low, moves: [{ id: 'droplet-shot', pp: 5 }] };
    expect(ownedPicks([weird], [])[0]!.entry.moves).toEqual(defaultMoves('ashkit'));
  });

  it('builds deterministic random CPU teams', () => {
    const a = randomRentalTeam(7);
    expect(randomRentalTeam(7)).toEqual(a);
    expect(validateArenaTeam(a)).toEqual([]);
    const avoid = randomRentalTeam(7, ['pyrelord', 'maelstrode', 'verdantusk']);
    expect(avoid.some((e) => ['pyrelord', 'maelstrode', 'verdantusk'].includes(e.species))).toBe(false);
  });
});
