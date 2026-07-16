import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/actions.js';
import { createGame } from '../src/state.js';
import type { PlayerInit } from '../src/state.js';
import { projectSpectatorView, projectView, redactEventsFor } from '../src/views.js';

const INITS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'P0', isBot: false },
  { name: 'P1', isBot: false },
  { name: 'P2', isBot: true },
  { name: 'P3', isBot: true },
];

describe('Spectator view', () => {
  it('exposes seat-indexed public players with counts but no concealed hands', () => {
    const g = createGame('seed', INITS);
    const sv = projectSpectatorView(g);

    expect(sv.players).toHaveLength(4);
    for (const p of sv.players) {
      expect('hand' in p).toBe(false);
      expect(typeof p.handCount).toBe('number');
    }
    expect(sv.players[0].handCount).toBe(14); // dealer drew the 14th
    expect(sv.players[1].handCount).toBe(13);
    expect(sv.dealer).toBe(0);
    expect(sv.turn).toBe(0);
  });

  it('leaks no raw tile ids anywhere except melds/discards/lastDiscard', () => {
    const g = createGame('seed', INITS);
    // Serialize and confirm the only tile arrays present are the public ones.
    const sv = projectSpectatorView(g);
    const json = JSON.stringify(sv);
    // The 14-tile dealer hand would, if leaked, appear as a long numeric array.
    // Public players have empty melds/discards at deal time, so no tile arrays should exist.
    expect(json).not.toContain('"hand"');
    for (const p of sv.players) {
      expect(p.discards).toEqual([]);
      expect(p.melds).toEqual([]);
    }
  });

  it('A27: masks concealed kong tiles from opponents and spectators until round end', () => {
    const g = createGame('a27', INITS, { enableHuanSanZhang: false });
    g.phase = 'play';
    g.players[1]!.melds.push(
      {
        kind: 'kong',
        tile: { suit: 'man', rank: 5 },
        subtype: 'concealed',
        claimedFrom: null,
        turnDeclared: 3,
      },
      { kind: 'pung', tile: { suit: 'pin', rank: 2 }, concealed: false, claimedFrom: 0 },
    );

    // Spectators: concealed kong rank hidden, exposed pung untouched.
    const sv = projectSpectatorView(g);
    expect(sv.players[1].melds[0]).toEqual({
      kind: 'kong',
      subtype: 'concealed',
      tile: null,
      claimedFrom: null,
      turnDeclared: 3,
    });
    expect(sv.players[1].melds[1]).toMatchObject({ kind: 'pung', tile: { suit: 'pin', rank: 2 } });

    // Opponents: hidden. The owner still sees their own kong.
    const opp = projectView(g, 0).others.find(o => o.seat === 1)!;
    expect(opp.melds[0]).toMatchObject({ kind: 'kong', tile: null });
    expect(projectView(g, 1).you.melds[0]).toMatchObject({
      kind: 'kong',
      tile: { suit: 'man', rank: 5 },
    });

    // Round end reveals it everywhere.
    g.phase = 'roundEnd';
    expect(projectSpectatorView(g).players[1].melds[0]).toMatchObject({
      kind: 'kong',
      tile: { suit: 'man', rank: 5 },
    });
    expect(projectView(g, 0).others.find(o => o.seat === 1)!.melds[0]).toMatchObject({
      kind: 'kong',
      tile: { suit: 'man', rank: 5 },
    });
  });

  it('A31: redactEventsFor hides drawn tiles from everyone but the drawer', () => {
    const events: GameEvent[] = [
      { e: 'drew', seat: 1, tile: 42 },
      { e: 'kongReplacement', seat: 2, tile: 17 },
      { e: 'discarded', seat: 1, tile: 5 }, // public — must pass through untouched
    ];

    const forDrawer = redactEventsFor(1, events);
    expect(forDrawer[0]).toEqual({ e: 'drew', seat: 1, tile: 42 });
    expect(forDrawer[1]).toEqual({ e: 'kongReplacement', seat: 2, tile: null });
    expect(forDrawer[2]).toEqual({ e: 'discarded', seat: 1, tile: 5 });

    const forOther = redactEventsFor(3, events);
    expect(forOther[0]).toEqual({ e: 'drew', seat: 1, tile: null });
    expect(forOther[1]).toEqual({ e: 'kongReplacement', seat: 2, tile: null });

    const forSpectator = redactEventsFor('spectator', events);
    expect(forSpectator[0]).toEqual({ e: 'drew', seat: 1, tile: null });
    expect(forSpectator[1]).toEqual({ e: 'kongReplacement', seat: 2, tile: null });

    // The source array is not mutated — the engine's own events keep real ids.
    expect(events[0]).toEqual({ e: 'drew', seat: 1, tile: 42 });
  });
});
