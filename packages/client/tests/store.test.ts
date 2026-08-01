import type { Seat, ServerMsg } from '@sichuan-mahjong/engine';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../src/store/index.js';

function roundEnd(roundIndex: number, deltas: [number, number, number, number]): ServerMsg {
  return {
    t: 'roundEnd',
    results: {
      roundIndex,
      players: deltas.map((scoreDelta, seat) => ({
        seat: seat as Seat,
        name: `P${seat}`,
        scoreDelta,
        hu: null,
        hand: [],
        melds: [],
        isReady: false,
        ledger: [],
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
    handleServerMsg(roundEnd(0, [10, -5, -5, 0]));
    handleServerMsg(roundEnd(1, [-2, 8, -3, -3]));

    expect(useStore.getState().matchScores).toEqual({ 0: 8, 1: 3, 2: -8, 3: -3 });
    expect(useStore.getState().screen).toBe('roundEnd');
  });

  it('A39: a replayed roundEnd (reconnect at round end) is not counted twice', () => {
    const { handleServerMsg } = useStore.getState();
    handleServerMsg(roundEnd(0, [10, -5, -5, 0]));
    // The server hands a client reconnecting at round end the same result again
    // (the A9 path) — and a flaky connection can do that any number of times.
    handleServerMsg(roundEnd(0, [10, -5, -5, 0]));
    handleServerMsg(roundEnd(0, [10, -5, -5, 0]));

    expect(useStore.getState().matchScores).toEqual({ 0: 10, 1: -5, 2: -5, 3: 0 });
    expect(useStore.getState().screen).toBe('roundEnd');

    // A genuinely new round still accumulates.
    handleServerMsg(roundEnd(1, [-2, 8, -3, -3]));
    expect(useStore.getState().matchScores).toEqual({ 0: 8, 1: 3, 2: -8, 3: -3 });
  });

  it('a spectator receiving roundEnd stays on the spectate screen', () => {
    useStore.setState({ screen: 'spectate' });
    useStore.getState().handleServerMsg(roundEnd(0, [10, -5, -5, 0]));

    const s = useStore.getState();
    expect(s.screen).toBe('spectate');
    expect(s.roundResult).not.toBeNull();
  });

  it("'joined' stores seat + token; isHost survives only for seat 0", () => {
    useStore.setState({ isHost: true });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 0, token: 'tok' });
    expect(useStore.getState()).toMatchObject({ seat: 0, token: 'tok', isHost: true });

    useStore.setState({ isHost: true });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 2, token: 'tok2' });
    expect(useStore.getState().isHost).toBe(false);
  });

  it("F1: 'error' is surfaced on the store instead of being dropped", () => {
    const { handleServerMsg } = useStore.getState();
    expect(useStore.getState().lastError).toBeNull();

    handleServerMsg({ t: 'error', code: 'lobby_full', message: 'Lobby is full.' });
    expect(useStore.getState().lastError).toEqual({
      code: 'lobby_full',
      message: 'Lobby is full.',
      seq: 1,
    });

    // The same error twice in a row must still re-trigger the toast.
    handleServerMsg({ t: 'error', code: 'lobby_full', message: 'Lobby is full.' });
    expect(useStore.getState().lastError?.seq).toBe(2);

    useStore.getState().clearError();
    expect(useStore.getState().lastError).toBeNull();
  });

  it("F9: 'matchEnd' shows final standings instead of dumping you to landing", () => {
    useStore.setState({ screen: 'game', code: 'ABCD', token: 't', seat: 1, matchScores: { 0: 5 } });
    useStore.getState().handleServerMsg({ t: 'matchEnd' });

    const s = useStore.getState();
    expect(s.screen).toBe('matchEnd');
    // The recap needs the totals and the seat; the live session is over.
    expect(s.matchScores).toEqual({ 0: 5 });
    expect(s.seat).toBe(1);
    expect(s.token).toBe('');
    expect(s.view).toBeNull();
  });

  it('leaving the match-end screen clears the session', () => {
    useStore.setState({ screen: 'matchEnd', code: 'ABCD', seat: 1, matchScores: { 0: 5 } });
    useStore.getState().resetSession();

    const s = useStore.getState();
    expect(s.screen).toBe('landing');
    expect(s.code).toBe('');
    expect(s.seat).toBeNull();
    expect(s.matchScores).toEqual({});
  });
});
