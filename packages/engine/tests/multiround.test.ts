import { describe, expect, it } from 'vitest';
import { createGame, startNextRound } from '../src/state.js';
import type { PlayerInit } from '../src/state.js';

const INITS: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = [
  { name: 'P0', isBot: false },
  { name: 'P1', isBot: false },
  { name: 'P2', isBot: true },
  { name: 'P3', isBot: true },
];

describe('Multi-round', () => {
  it('createGame deals the 14th tile to the given dealer', () => {
    const g = createGame('seed', INITS, {}, 2);
    expect(g.dealer).toBe(2);
    expect(g.turn).toBe(2);
    expect(g.players[2].hand.length).toBe(14);
    expect(g.players[0].hand.length).toBe(13);
    expect(g.players[1].hand.length).toBe(13);
    expect(g.players[3].hand.length).toBe(13);
  });

  it('defaults to dealer 0 when not specified (back-compat)', () => {
    const g = createGame('seed', INITS);
    expect(g.dealer).toBe(0);
    expect(g.turn).toBe(0);
    expect(g.players[0].hand.length).toBe(14);
  });

  it('startNextRound rotates dealer to prev.nextDealer and resets deltas', () => {
    const g0 = createGame('round-0', INITS);
    // Simulate a settled round: seat 3 is next dealer, some scores accrued.
    g0.nextDealer = 3;
    g0.players[0].scoreDelta = 5;
    g0.players[3].scoreDelta = -5;

    const g1 = startNextRound(g0, 'round-1');

    expect(g1.dealer).toBe(3);
    expect(g1.turn).toBe(3);
    expect(g1.players[3].hand.length).toBe(14);
    expect(g1.players.every(p => p.scoreDelta === 0)).toBe(true);
    expect(g1.seed).toBe('round-1');
    // Same players + config carried over
    expect(g1.players.map(p => p.name)).toEqual(['P0', 'P1', 'P2', 'P3']);
    expect(g1.config).toEqual(g0.config);
    // Fresh deal — different wall ordering than round 0
    expect(g1.wall).not.toEqual(g0.wall);
  });
});
