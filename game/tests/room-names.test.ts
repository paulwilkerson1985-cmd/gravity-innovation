import { describe, expect, it } from 'vitest';
import { Room, realClock } from '../server/room';

describe('Room names', () => {
  it('gives a guest with the same name as the host a distinct seat name', () => {
    const conn = { send: () => {} };
    const room = new Room('BXKT', realClock, () => 1);
    room.add('Player 1', 'a', conn);
    room.add('Player 1', 'b', conn);
    expect(room.players.map((p) => p?.name)).toEqual(['Player 1', 'Player 2']);
    const r2 = new Room('BXKU', realClock, () => 1);
    r2.add('Ember', 'a', conn);
    r2.add('ember', 'b', conn);
    expect(r2.players[1]?.name).toBe('ember 2');
    const r3 = new Room('BXKV', realClock, () => 1);
    r3.add('Ember', 'a', conn);
    r3.add('Rill', 'b', conn);
    expect(r3.players.map((p) => p?.name)).toEqual(['Ember', 'Rill']);
  });
});
