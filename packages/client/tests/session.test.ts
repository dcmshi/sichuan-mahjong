import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, persistSession } from '../src/session.js';
import { useStore } from '../src/store/index.js';

function stubStorage(): Map<string, string> {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => void backing.set(k, v),
      removeItem: (k: string) => void backing.delete(k),
    },
  });
  return backing;
}

let backing: Map<string, string>;

beforeEach(() => {
  backing = stubStorage();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('seat session persistence (F2)', () => {
  it('round-trips a stored session', () => {
    expect(loadSession()).toBeNull();
    persistSession({ code: 'ABCD', token: 'tok', name: 'Dave', isHost: true });
    expect(loadSession()).toEqual({ code: 'ABCD', token: 'tok', name: 'Dave', isHost: true });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('rejects unusable stored values instead of offering a dead rejoin', () => {
    backing.set('sm-session', 'not json');
    expect(loadSession()).toBeNull();

    backing.set('sm-session', JSON.stringify({ code: 'ABCD' }));
    expect(loadSession()).toBeNull();

    backing.set('sm-session', JSON.stringify({ code: '', token: 'tok' }));
    expect(loadSession()).toBeNull();
  });

  it("stores the seat on 'joined' and drops it on resetSession", () => {
    useStore.setState({ code: 'WXYZ', playerName: 'Dave', isHost: false });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 2, token: 'tok2' });
    expect(loadSession()).toEqual({ code: 'WXYZ', token: 'tok2', name: 'Dave', isHost: false });

    useStore.getState().resetSession();
    expect(loadSession()).toBeNull();
  });

  it("re-persists on 'lobby' so a refreshed host comes back as host", () => {
    useStore.setState({ code: 'WXYZ', playerName: 'Dave', isHost: true });
    useStore.getState().handleServerMsg({ t: 'joined', seat: 0, token: 'tok0' });
    useStore.getState().handleServerMsg({ t: 'lobby', players: [], canStart: false, isHost: true });

    expect(loadSession()?.isHost).toBe(true);
    useStore.getState().resetSession();
  });
});
