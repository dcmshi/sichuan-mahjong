// Seat session persistence. The seat token and room code used to live only in
// memory, so a mid-game refresh — routine on a phone — lost the seat for good
// even though the server happily reconnects a token. (F2)

const STORAGE_KEY = 'sm-session';

export type StoredSession = {
  code: string;
  token: string;
  name: string;
  /** Persisted too: a mid-game reconnect gets no `lobby` frame to re-derive it. */
  isHost: boolean;
  /** Practice games suppress the (you) badge. Optional: sessions stored before
   *  this field existed must still parse. */
  isPractice?: boolean;
};

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof v.code !== 'string' || typeof v.token !== 'string') return null;
    if (!v.code || !v.token) return null;
    return {
      code: v.code,
      token: v.token,
      name: typeof v.name === 'string' ? v.name : '',
      isHost: v.isHost === true,
      // `persistSession` has always written this; reading it back was missed,
      // so every rejoin came back as a non-practice game and a solo-vs-bots
      // player got the "(you)" badge they are not supposed to see.
      isPractice: v.isPractice === true,
    };
  } catch {
    return null;
  }
}

export function persistSession(s: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
