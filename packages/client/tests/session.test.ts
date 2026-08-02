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
    expect(loadSession()).toEqual({
      code: 'ABCD',
      token: 'tok',
      name: 'Dave',
      isHost: true,
      isPractice: false,
    });
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it('reads isPractice back, which it silently dropped', () => {
    // persistSession has always written this field and loadSession never
    // returned it, so every rejoin came back as a non-practice game and a
    // solo-vs-bots player saw the "(you)" badge that practice suppresses.
    persistSession({ code: 'ABCD', token: 'tok', name: 'Dave', isHost: true, isPractice: true });
    expect(loadSession()?.isPractice).toBe(true);
  });

  it('takes only a literal true for isPractice, and defaults it for older sessions', () => {
    backing.set('sm-session', JSON.stringify({ code: 'ABCD', token: 'tok', isPractice: 'yes' }));
    expect(loadSession()?.isPractice).toBe(false);
    // Written before the field existed — must still parse, not be discarded.
    backing.set('sm-session', JSON.stringify({ code: 'ABCD', token: 'tok', name: 'Dave' }));
    expect(loadSession()).not.toBeNull();
    expect(loadSession()?.isPractice).toBe(false);
  });

  it('keeps a CJK name byte-for-byte through a round trip', () => {
    // The rejoin path stores the name as JSON and the server never re-reads it
    // on reconnect, so this is where a mangled name would show up.
    persistSession({ code: 'ABCD', token: 'tok', name: '小明', isHost: false });
    expect(loadSession()?.name).toBe('小明');
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
    expect(loadSession()).toEqual({
      code: 'WXYZ',
      token: 'tok2',
      name: 'Dave',
      isHost: false,
      isPractice: false,
    });

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
