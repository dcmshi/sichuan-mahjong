import type { Seat, ServerMsg } from '@sichuan-mahjong/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/index.js';

function roundEnd(deltas: [number, number, number, number]): ServerMsg {
  return {
    t: 'roundEnd',
    results: {
      players: deltas.map((scoreDelta, seat) => ({
        seat: seat as Seat,
        name: `P${seat}`,
        scoreDelta,
        hu: null,
      })),
    },
  };
}

beforeEach(() => {
  useStore.getState().resetSession();
});

describe('client store (A30)', () => {
  it('accumulates matchScores across rounds and shows the round-end screen', () => {
    const { handleServerMsg } = useStore.getState();
    handleServerMsg(roundEnd([10, -5, -5, 0]));
    handleServerMsg(roundEnd([-2, 8, -3, -3]));

    expect(useStore.getState().matchScores).toEqual({ 0: 8, 1: 3, 2: -8, 3: -3 });
    expect(useStore.getState().screen).toBe('roundEnd');
  });

  it("'joined' stores seat + token; isHost survives only for seat 0", () => {
    useStore.setState({ isHost: true });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 0, token: 'tok' });
    expect(useStore.getState()).toMatchObject({ seat: 0, token: 'tok', isHost: true });

    useStore.setState({ isHost: true });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 2, token: 'tok2' });
    expect(useStore.getState().isHost).toBe(false);
  });

  it("'matchEnd' resets the session back to landing", () => {
    useStore.setState({ screen: 'game', code: 'ABCD', token: 't', seat: 1, matchScores: { 0: 5 } });
    useStore.getState().handleServerMsg({ t: 'matchEnd' });

    const s = useStore.getState();
    expect(s.screen).toBe('landing');
    expect(s.code).toBe('');
    expect(s.token).toBe('');
    expect(s.seat).toBeNull();
    expect(s.matchScores).toEqual({});
  });
});
