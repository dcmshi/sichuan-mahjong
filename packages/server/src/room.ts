import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import {
  DEFAULT_CONFIG,
  applyAction,
  createGame,
  projectSpectatorView,
  projectView,
  redactEventsFor,
  startNextRound,
} from '@sichuan-mahjong/engine';
import type {
  BotDifficulty,
  GameAction,
  GameConfig,
  GameEvent,
  GameState,
  PlayerInit,
  RoundResult,
  Seat,
  ServerMsg,
} from '@sichuan-mahjong/engine';
import {
  botClaimAction,
  botClaimActionHard,
  botClaimActionMedium,
  botHuanAction,
  botTurnAction,
  botTurnActionHard,
  botTurnActionMedium,
  botVoidAction,
  botVoidActionHard,
} from './bot.js';
import { deleteLiveRoom, loadLiveRooms, saveGameWithCode, saveLiveRoom } from './persistence.js';
import {
  importToken,
  importWatchToken,
  revokeTokensForCode,
  tokensForCode,
  watchTokenFor,
} from './tokens.js';

const RECONNECT_TIMEOUT_MS = 60_000;
const PERSIST_DEBOUNCE_MS = 1000;

/**
 * How long a bot pauses before acting, by the host's choice in the lobby. This
 * was 150ms flat, at which a circuit of three bots — discard, claim window,
 * discard, discard — resolved inside a second: by the time you looked up, the
 * tile you might have ponged was four discards back. The transient event feed
 * doesn't recover it either (two lines for 3.5s, one on a short viewport, by
 * design), so the pace itself had to give. (O2)
 *
 * A pace, not a rule: it lives here rather than in `GameConfig` because it
 * changes nothing about the game, and a replay of the same seed is identical at
 * any value. Normal was 700 and is 900 — it only reads as deliberate once it is
 * slower than the eye expects.
 */
export const BOT_SPEEDS = { fast: 400, normal: 900, slow: 1800 } as const;
export type BotSpeed = keyof typeof BOT_SPEEDS;
export const DEFAULT_BOT_SPEED: BotSpeed = 'normal';

const MAX_BOT_PACE_MS = 5000;

/** Ceiling on read-only viewers of one room. See `addSpectator`. (L1) */
export const MAX_SPECTATORS = 16;

export function isBotSpeed(v: unknown): v is BotSpeed {
  return v === 'slow' || v === 'normal' || v === 'fast';
}

/**
 * `SM_BOT_DELAY_MS` is the harness seam: the unit and Playwright suites play
 * whole rounds through bots, so they pin 150ms rather than pay minutes a suite
 * for a pace no assertion looks at.
 */
function paceFromEnv(): number | null {
  const raw = process.env.SM_BOT_DELAY_MS;
  if (raw === undefined) return null;
  const ms = Number.parseInt(raw, 10);
  if (!Number.isFinite(ms) || ms < 0) return null;
  // The same ceiling `--bot-delay` gets, which this had skipped: `setBotPaceMs`
  // clamps and this assigned `paceOverride` raw, so the two ways of saying the
  // same thing disagreed above 5s. A pace longer than the shortest claim window
  // a host can pick (8s) is also what made A68's stall reachable by
  // configuration rather than only by a crafted test. (A68)
  return clampBotPace(ms);
}

/**
 * Seed for a new room's game.
 *
 * `SM_SEED` is the determinism seam, and it exists for the same reason
 * `SM_BOT_DELAY_MS` does: the Playwright specs assert on things a *deal* decides.
 * `viewport.spec.ts` in particular checks the claim bar against the hand and
 * refuses to pass without having seen a real claim window — which on a random deal
 * is a coin toss, and a guard that fails on an unlucky round teaches people to
 * re-run it rather than read it.
 *
 * When set, **every** room in the process deals the same, deliberately: the room
 * code is `crypto.randomInt`, so mixing it in would put the randomness straight
 * back and a spec run alone would differ from the same spec run in the suite.
 * Losing deal variety across e2e costs nothing — those assertions are structural,
 * and the engine's randomness is covered by the property tests and the 100-game
 * bot smoke test. Unset, which is every real deployment, gives `randomUUID()`.
 */
function newSeed(): string {
  return process.env.SM_SEED || randomUUID();
}

/**
 * An explicit process-wide pace, from `--bot-delay` or the env seam. Null means
 * nobody asked, and each room uses whatever speed its host picked. It outranks
 * the lobby on purpose: it is an operator's or a test harness's decision, and a
 * suite that pinned 150ms must not have a lobby default put it back to 900.
 */
let paceOverride: number | null = paceFromEnv();

function clampBotPace(ms: number): number {
  if (!Number.isFinite(ms)) return BOT_SPEEDS[DEFAULT_BOT_SPEED];
  return Math.min(MAX_BOT_PACE_MS, Math.max(0, Math.round(ms)));
}

/** Pin the pace for every room in this process (CLI `--bot-delay`). */
export function setBotPaceMs(ms: number): void {
  paceOverride = clampBotPace(ms);
}

export function botPaceMs(speed: BotSpeed = DEFAULT_BOT_SPEED): number {
  return paceOverride ?? BOT_SPEEDS[speed];
}

/**
 * Whether a process-wide override is in force, so a client can say the host's
 * choice is not the pace rather than displaying it as if it were. The override
 * is an arbitrary millisecond count and does not map onto the three presets, so
 * this is a flag rather than a substituted speed. (N24)
 */
export function isBotPacePinned(): boolean {
  return paceOverride !== null;
}

/**
 * Action types a client is allowed to originate over the WS. `claimWindowExpire`
 * and `draw` are driven by the server (claim timer / turn loop); everything a
 * human legitimately triggers is here. Keeps a crafted frame from invoking
 * system-only transitions. (A4)
 */
const CLIENT_ACTION_TYPES: ReadonlySet<string> = new Set([
  'huanSelect',
  'declareVoid',
  'discard',
  'flipFirstDiscard',
  'claim',
  'pass',
  'declareKongOnTurn',
  'declareHuOnDraw',
  'declareHeavenly',
]);

export type RoomSlot = {
  name: string;
  isBot: boolean;
  connected: boolean;
  difficulty?: BotDifficulty;
};

/**
 * The ladder, as a table rather than a ternary per decision point. N19 found the
 * two levels dispatched by `difficulty === 'medium'` at each of three call sites,
 * which is the shape that makes a third rung a rewrite instead of a row — and
 * silently plays easy for any string that reaches here unrecognised, which is
 * exactly the failure `botDifficultyFrom` exists to prevent at the boundary.
 *
 * `void` has no hard/medium split by design: hard reads the declaration as the
 * one decision of the round made before a tile is drawn, and medium's tile count
 * is the same heuristic easy uses. Huan has no split at all — 換三張 is off by
 * default and off the Novikov path, so all three share one implementation.
 */
const BOT_PLAY: Record<
  BotDifficulty,
  {
    turn: (state: GameState, seat: Seat) => GameAction | null;
    claim: (state: GameState, seat: Seat) => GameAction;
    declareVoid: (state: GameState, seat: Seat) => GameAction | null;
  }
> = {
  easy: { turn: botTurnAction, claim: botClaimAction, declareVoid: botVoidAction },
  medium: { turn: botTurnActionMedium, claim: botClaimActionMedium, declareVoid: botVoidAction },
  hard: { turn: botTurnActionHard, claim: botClaimActionHard, declareVoid: botVoidActionHard },
};

/** Serializable snapshot of a live room, persisted so the game survives a restart. */
export type RoomSnapshot = {
  code: string;
  state: GameState;
  slots: RoomSlot[];
  isHumanSeat: boolean[];
  tokens: Array<{ token: string; code: string; seat: Seat; role: 'host' | 'player' }>;
  /** Optional: snapshots written before A39 don't carry it. */
  roundIndex?: number;
  /**
   * The host's bot pace. Not a rule and not in `GameConfig` — which is exactly
   * why it needs saying here: everything in `GameState` rides along in
   * `state`, and this is the one live setting that does not. A restart put a
   * table the host had set to slow back on normal, silently. Optional like the
   * two below: an older snapshot restores at the default, which is what it had.
   * (A64)
   */
  botSpeed?: BotSpeed;
  /**
   * The room's spectator secret. Separate from `tokens` because it is a
   * separate store (see `tokens.ts`) — folding it in would make it resolvable
   * as a seat, which is the exact confusion that store exists to prevent.
   *
   * Optional: snapshots written before A41 don't carry it, and a room whose
   * lobby never issued one has none. Both restore with spectating unavailable,
   * which is what they had before.
   */
  watchToken?: string;
};

export class GameRoom {
  readonly code: string;

  private state: GameState;
  private slots: RoomSlot[];
  /** Seats that began the match as humans — eligible to reclaim from a bot takeover. */
  private isHumanSeat: boolean[];
  private connections: Map<Seat, WebSocket> = new Map();
  private spectators: Set<WebSocket> = new Set();
  private disconnectTimers: Map<Seat, ReturnType<typeof setTimeout>> = new Map();
  private claimWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending bot/auto-action callbacks, tracked so teardown leaves nothing scheduled. */
  private botTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  private botImmediates: Set<ReturnType<typeof setImmediate>> = new Set();
  /**
   * Seats with a bot/auto action already scheduled. scheduleNext runs after every
   * state change (and on every reconnect), so without this each pass would queue
   * a duplicate decision per pending seat — the extras then fire against a state
   * that has moved on and get rejected, flooding the log with warns that the
   * "a rejection is unexpected" contract treats as bugs. (A26)
   */
  private botPendingSeats: Set<Seat> = new Set();
  /**
   * The host's choice. `--bot-delay` outranks it — see `botPaceMs`.
   *
   * Not readonly: the host can change it mid-match (N5). Safe to reassign because
   * it changes no rule and a replay of the same seed is identical at any value,
   * which is exactly why it lives here and not in `GameConfig`. It is read fresh
   * each time a bot turn is scheduled, so a change lands on the next move rather
   * than needing anything rescheduled.
   */
  private botSpeed: BotSpeed;
  private started = false;
  /**
   * Last time anything happened here (state change or a connection). A room can
   * end up parked forever — e.g. everyone leaves and the bots play to roundEnd,
   * or play freezes awaiting a human who never returns — so the idle sweep uses
   * this to reclaim it. (A29)
   */
  private lastActivityAt = Date.now();
  /** Guards the once-per-round roundEnd persist + broadcast (reset in nextRound). (A9) */
  private roundEndBroadcast = false;
  /** 0-based round counter for this match; rides along in RoundResult. (A39) */
  private roundIndex = 0;
  /** Set once the match ends: the room is torn down and must accept no further work. (A11) */
  private ended = false;

  constructor(
    code: string,
    slots: RoomSlot[],
    config: Partial<GameConfig> = {},
    botSpeed: BotSpeed = DEFAULT_BOT_SPEED,
  ) {
    this.code = code;
    this.slots = slots;
    this.botSpeed = botSpeed;
    this.isHumanSeat = slots.map(s => !s.isBot);
    const players: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = slots.map(s => ({
      name: s.name,
      isBot: s.isBot,
    })) as [PlayerInit, PlayerInit, PlayerInit, PlayerInit];

    this.state = createGame(newSeed(), players, { ...DEFAULT_CONFIG, ...config });
  }

  /** Call after all initial connections are registered to begin the game. */
  start(): void {
    this.started = true;
    this.afterStateChange([]);
  }

  /** Host-triggered: begin the next round of the match. Only valid at round end. */
  nextRound(): boolean {
    if (this.state.phase !== 'roundEnd') return false;
    if (this.claimWindowTimer !== null) {
      clearTimeout(this.claimWindowTimer);
      this.claimWindowTimer = null;
    }
    this.roundEndBroadcast = false; // arm the next round's once-only roundEnd persist (A9)
    this.roundIndex += 1; // lets clients tell a replayed result from a new one (A39)
    // Cancel bot callbacks left over from the old round: with the per-seat
    // dedup (A26), a stale pending entry would otherwise suppress this round's
    // first huan/void scheduling for that seat, stalling the game. Reachable
    // only when nextRound lands inside a pending bot pause — i.e. programmatic
    // hosts — but cheap to make airtight. (A32)
    this.clearPendingBotWork();
    this.state = startNextRound(this.state, randomUUID());

    // Reconnection reclaim (§6.5): a human who reconnected after a >60s bot
    // takeover reclaims their seat for the new round; still-offline humans stay
    // bot-controlled; original bots stay bots.
    for (let i = 0; i < 4; i++) {
      const seat = i as Seat;
      const slot = this.slots[seat];
      if (!slot) continue;
      slot.isBot = this.isHumanSeat[seat] ? !slot.connected : true;
      this.state.players[seat]!.isBot = slot.isBot;
    }

    this.afterStateChange([]);
    return true;
  }

  /** Host-triggered: end the match — notify clients and tear down the room. */
  endMatch(): void {
    if (this.ended) return;
    this.ended = true;
    for (const [, ws] of this.connections) this.send(ws, { t: 'matchEnd' });
    for (const ws of this.spectators) this.send(ws, { t: 'matchEnd' });
    this.teardownTimers();
    // Close and drop the sockets so a client that ignores `matchEnd` can't keep
    // sending actions (re-arming persist / resurrecting the deleted live_rooms
    // row) or trigger a fresh bot-takeover on close. (A11)
    //
    // Spectators are closed for the second half of that reason, which A11 left
    // out: a watcher's socket carries no message handler, so it can send
    // nothing — but it is still a live connection with a heartbeat on it, and
    // dropping it from the set without closing it left one per ignored
    // `matchEnd` for the life of the process. The room is gone; so is the
    // socket. (A63)
    for (const ws of [...this.connections.values(), ...this.spectators]) {
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    this.connections.clear();
    this.spectators.clear();
    deleteRoom(this.code);
  }

  /** Clear all pending timers so a torn-down room leaves nothing scheduled. */
  private teardownTimers(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    if (this.claimWindowTimer !== null) {
      clearTimeout(this.claimWindowTimer);
      this.claimWindowTimer = null;
    }
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
    this.clearPendingBotWork();
  }

  /** Cancel every pending bot/auto callback and reset the per-seat dedup. */
  private clearPendingBotWork(): void {
    for (const timer of this.botTimers) clearTimeout(timer);
    this.botTimers.clear();
    for (const im of this.botImmediates) clearImmediate(im);
    this.botImmediates.clear();
    this.botPendingSeats.clear();
  }

  /**
   * Schedule a bot "think" callback for `seat`, tracked so teardown can cancel
   * it. No-ops if the seat already has a decision queued — a seat only ever has
   * one pending decision at a time (huan/void/claim/turn are mutually
   * exclusive), so one in-flight callback per seat is always enough. (A26)
   */
  private scheduleBot(seat: Seat, fn: () => void): void {
    if (this.botPendingSeats.has(seat)) return;
    this.botPendingSeats.add(seat);
    const timer = setTimeout(() => {
      this.botTimers.delete(timer);
      this.botPendingSeats.delete(seat);
      fn();
    }, botPaceMs(this.botSpeed));
    this.botTimers.add(timer);
  }

  /** Schedule a server-issued action for `seat` on the next tick, tracked for teardown. Deduped per seat like scheduleBot. */
  private scheduleBotImmediate(seat: Seat, fn: () => void): void {
    if (this.botPendingSeats.has(seat)) return;
    this.botPendingSeats.add(seat);
    const im = setImmediate(() => {
      this.botImmediates.delete(im);
      this.botPendingSeats.delete(seat);
      fn();
    });
    this.botImmediates.add(im);
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  connect(seat: Seat, ws: WebSocket): void {
    if (this.ended) return; // torn-down room accepts no new connections (A11)
    this.lastActivityAt = Date.now();
    const timer = this.disconnectTimers.get(seat);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.disconnectTimers.delete(seat);
    }
    const slot = this.slots[seat];
    if (slot) slot.connected = true;
    this.connections.set(seat, ws);

    // For reconnects after game has started, send the current view immediately
    // and resume play: this issues any pending draw and drives bot turns, but
    // won't bot-play this seat now that its human is back.
    if (this.started) {
      if (this.state.phase === 'roundEnd') {
        // The round already ended (persisted/broadcast once). Hand this client
        // the final results directly so it shows the round-end screen, without
        // re-persisting or re-broadcasting to everyone. (A9)
        this.send(ws, { t: 'roundEnd', results: this.buildRoundResult() });
      } else {
        this.sendView(seat, []);
        this.scheduleNext();
      }
    }
  }

  /**
   * Attach a read-only spectator. They receive hand-hiding spectate views.
   *
   * Returns false when the room is already at `MAX_SPECTATORS`. Every state
   * change is broadcast to every spectator, so an uncapped set makes a leaked
   * watch link a broadcast amplifier — N sockets multiply the per-move write
   * cost. (L1)
   */
  addSpectator(ws: WebSocket): boolean {
    if (this.spectators.size >= MAX_SPECTATORS) return false;
    this.spectators.add(ws);
    if (!this.started) return true;
    this.send(ws, { t: 'spectate', view: projectSpectatorView(this.state), events: [] });
    // Mirrors the A9 player path: a client arriving at round end is handed the
    // finished round directly rather than waiting for a broadcast that already happened.
    if (this.state.phase === 'roundEnd') {
      this.send(ws, { t: 'roundEnd', results: this.buildRoundResult() });
    }
    return true;
  }

  removeSpectator(ws: WebSocket): void {
    this.spectators.delete(ws);
  }

  /**
   * Drop a seat's connection. `ws` is the socket whose `close` fired: if the
   * seat has since been rebound to a *different* socket (a reconnect landed
   * before the old socket's TCP close arrived), this close is stale and must be
   * ignored — otherwise it would evict the live socket and wrongly start a bot
   * takeover. (The lobby close handler already guards this way; A5.)
   */
  disconnect(seat: Seat, ws?: WebSocket): void {
    if (this.ended) return; // no takeover timers after teardown (A11)
    if (ws !== undefined && this.connections.get(seat) !== ws) return;
    this.connections.delete(seat);
    const slot = this.slots[seat];
    if (slot) slot.connected = false;

    if (this.state.phase === 'roundEnd') return;
    this.armDisconnectTimer(seat);
  }

  /** Start the 60s bot-takeover countdown for a disconnected/not-yet-connected seat. */
  private armDisconnectTimer(seat: Seat): void {
    if (this.disconnectTimers.has(seat)) return;
    const timer = setTimeout(() => {
      this.disconnectTimers.delete(seat);
      const s = this.slots[seat];
      if (s) s.isBot = true;
      // Resume the game on takeover: issues any pending draw then drives the bot.
      this.scheduleNext();
    }, RECONNECT_TIMEOUT_MS);
    this.disconnectTimers.set(seat, timer);
  }

  /** True if `seat` is a human who hasn't (re)connected yet — game should wait, not bot-play. */
  private isAwaitingHuman(seat: Seat): boolean {
    const slot = this.slots[seat];
    return !!slot && this.isHumanSeat[seat] === true && !slot.isBot && !this.connections.has(seat);
  }

  /**
   * True while `seat` is inside its 60s reconnect grace (an armed takeover timer).
   * Used to hold off bot-filling huan/void/claim decisions for a briefly-dropped or
   * just-restored human — but NOT for a seat that simply never connected and has no
   * timer, which must still be bot-driven so the game can't stall. (A10)
   */
  private isInReconnectGrace(seat: Seat): boolean {
    return this.disconnectTimers.has(seat);
  }

  // -------------------------------------------------------------------------
  // Action handling
  // -------------------------------------------------------------------------

  handleAction(seat: Seat, action: unknown): void {
    if (this.ended) return; // torn-down room ignores stray actions (A11)
    // The action arrives from an untrusted WS frame — validate its shape before
    // touching it. Without this, `null`/non-object input makes `'seat' in action`
    // throw a TypeError inside the socket message handler, which (with no
    // try/catch up the chain) crashes the whole server. (A2)
    if (
      typeof action !== 'object' ||
      action === null ||
      typeof (action as { t?: unknown }).t !== 'string'
    ) {
      this.sendError(seat, 'bad_action', 'Malformed action.');
      return;
    }
    const type = (action as { t: string }).t;
    // Whitelist only the action types a client may originate. `claimWindowExpire`
    // (and any future system action) is server-issued only — otherwise a player
    // could force-close the claim window to lock opponents out of Hu/pung/kong. (A4)
    if (!CLIENT_ACTION_TYPES.has(type)) {
      this.sendError(seat, 'forbidden_action', `Action "${type}" is not client-issuable.`);
      return;
    }
    if ('seat' in action && (action as { seat: Seat }).seat !== seat) {
      this.sendError(seat, 'wrong_seat', 'Action seat does not match your seat.');
      return;
    }
    this.applyAndPropagate(action as GameAction);
  }

  private applyAndPropagate(action: GameAction): void {
    // applyAction is contracted never to throw (it wraps its own dispatch), but
    // guard the room boundary anyway so a future regression can never take the
    // process down mid-broadcast.
    let result: ReturnType<typeof applyAction>;
    try {
      result = applyAction(this.state, action);
    } catch (err) {
      console.error(`[room ${this.code}] applyAction threw for ${action.t}:`, err);
      return;
    }
    if (!result.ok) {
      // Actions are validated before dispatch, so a rejection is unexpected —
      // log it (rather than silently freezing the turn loop) to aid diagnosis.
      const detail = result.detail ? ` — ${result.detail}` : '';
      console.warn(
        `[room ${this.code}] action ${action.t} rejected: ${result.reason}${detail} (phase=${this.state.phase} turn=${this.state.turn})`,
      );
      return;
    }
    this.state = result.state;
    this.afterStateChange(result.events);
  }

  // -------------------------------------------------------------------------
  // Post-action bookkeeping
  // -------------------------------------------------------------------------

  private afterStateChange(events: GameEvent[]): void {
    this.lastActivityAt = Date.now();
    this.broadcastViews(events);
    this.scheduleNext();
    this.schedulePersist();
  }

  /** Milliseconds since the last state change or connection (for the idle sweep). */
  idleMs(now = Date.now()): number {
    return now - this.lastActivityAt;
  }

  // -------------------------------------------------------------------------
  // Live-state persistence (host-shutdown resume)
  // -------------------------------------------------------------------------

  /** Build a serializable snapshot of this room (state + slots + tokens). */
  serialize(): RoomSnapshot {
    const watchToken = watchTokenFor(this.code);
    return {
      code: this.code,
      state: this.state,
      slots: this.slots.map(s => ({ ...s })),
      isHumanSeat: [...this.isHumanSeat],
      roundIndex: this.roundIndex,
      botSpeed: this.botSpeed,
      tokens: tokensForCode(this.code).map(t => ({
        token: t.token,
        code: t.code,
        seat: t.seat,
        role: t.role,
      })),
      // Spread rather than assigned: `exactOptionalPropertyTypes` is on, so an
      // explicit `undefined` is not the same as an absent optional field.
      ...(watchToken ? { watchToken } : {}),
    };
  }

  /** Reconstruct a room from a snapshot after a server restart. No live connections yet. */
  static restore(snap: RoomSnapshot): GameRoom {
    const room = new GameRoom(
      snap.code,
      snap.slots.map(s => ({ ...s, connected: false })),
      snap.state.config,
      isBotSpeed(snap.botSpeed) ? snap.botSpeed : DEFAULT_BOT_SPEED,
    );
    // Snapshots written before the payment ledger existed have no `ledger`;
    // without this the first clone() spreads undefined. Same defence as
    // `roundIndex` below.
    room.state = { ...snap.state, ledger: snap.state.ledger ?? [] };
    room.isHumanSeat = [...snap.isHumanSeat];
    room.roundIndex = snap.roundIndex ?? 0;
    room.started = snap.state.phase !== undefined;
    return room;
  }

  /**
   * Resume play after a restore: drive bots, and arm bot-takeover timers for
   * human seats that haven't reconnected yet so the game can't stall forever.
   */
  resumeAfterRestore(): void {
    this.started = true;
    // Every seat is disconnected right after a restart. Give human seats the
    // normal 60s reconnect grace before a bot takes over.
    for (let s = 0; s < 4; s++) {
      const seat = s as Seat;
      if (this.isHumanSeat[seat] && !this.connections.has(seat)) this.armDisconnectTimer(seat);
    }
    // A persisted claim window carries an absolute Date.now()-based deadline, which
    // is long past by the time we restore — scheduleNext would fire claimWindowExpire
    // immediately, force-passing (and furiten-stamping) players before anyone can
    // reconnect. Re-base it to a fresh full window. (A10)
    if (this.state.pendingClaims !== null) {
      this.state.pendingClaims.deadline = Date.now() + this.state.config.claimWindowMs;
    }
    // Drive bots forward — but if it's an unconnected human's turn (and no claim
    // window to resolve), leave the state frozen so their reconnect/grace decides.
    if (this.state.pendingClaims !== null || !this.isAwaitingHuman(this.state.turn)) {
      this.scheduleNext();
    }
  }

  private schedulePersist(): void {
    if (this.ended) return; // don't re-persist a torn-down room (A11)
    if (this.persistTimer !== null) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Write the current snapshot immediately (best-effort; never throws to caller). */
  persistNow(): void {
    if (!this.started || this.ended) return; // never re-persist a torn-down room (A11)
    try {
      // Written at round end too, so a restart resumes at the round-end screen.
      // A *finished match* is a different thing and is torn down through
      // endMatch() → deleteLiveRoom. (This was an empty `if` holding the same
      // sentence, which reads as a branch someone forgot to write.)
      saveLiveRoom(this.code, this.serialize());
    } catch (err) {
      console.error('[persistence] Failed to snapshot live room:', err);
    }
  }

  /**
   * Work out what the room owes next and schedule it. Safe to call at any time
   * and from anywhere — it clears what it re-arms, and every scheduler it calls
   * is deduped per seat.
   *
   * Guarded on `ended` for the reason `schedulePersist` is (A11): a torn-down
   * room must not be able to re-arm a timer, and the bot callbacks below now
   * call back into here.
   */
  private scheduleNext(): void {
    if (this.ended) return;
    if (this.claimWindowTimer !== null) {
      clearTimeout(this.claimWindowTimer);
      this.claimWindowTimer = null;
    }

    // Huan phase: bots submit huanSelect. A disconnected human still inside their
    // reconnect grace is NOT bot-filled — huan (like void) is a round-shaping
    // choice, and a brief drop (or a just-restored server) must not have a bot make
    // it. Once their 60s grace lapses the seat flips to a bot and this re-runs. (A10)
    if (this.state.phase === 'huan') {
      for (let s = 0; s < 4; s++) {
        const seat = s as Seat;
        if (!this.isBotOrOffline(seat) || this.isInReconnectGrace(seat)) continue;
        if (this.state.pendingHuan[seat] != null) continue;
        this.scheduleBot(seat, () => this.botHuanSelect(seat));
      }
      return;
    }

    // VoidDeclare phase: bots submit declareVoid; disconnected humans in grace are
    // left for their reconnect/takeover to decide (the void suit is round-permanent). (A10)
    if (this.state.phase === 'voidDeclare') {
      for (let s = 0; s < 4; s++) {
        const seat = s as Seat;
        if (!this.isBotOrOffline(seat) || this.isInReconnectGrace(seat)) continue;
        if (this.state.pendingVoid[seat] != null) continue;
        this.scheduleBot(seat, () => this.botVoidDeclare(seat));
      }
      return;
    }

    if (this.state.phase !== 'play') {
      // Persist + broadcast the round result exactly once. scheduleNext is called
      // on every reconnect, so without this guard each reconnecting client would
      // insert a duplicate `games` row and re-broadcast roundEnd to everyone. (A9)
      if (this.state.phase === 'roundEnd' && !this.roundEndBroadcast) {
        this.roundEndBroadcast = true;
        this.broadcastRoundEnd();
      }
      return;
    }

    if (this.state.pendingClaims !== null) {
      const delay = Math.max(0, this.state.pendingClaims.deadline - Date.now());
      this.claimWindowTimer = setTimeout(() => {
        this.claimWindowTimer = null;
        this.applyAndPropagate({ t: 'claimWindowExpire' });
      }, delay);
      this.botClaimIfNeeded();
      return;
    }

    if (this.state.turnDrawNeeded) {
      const seat = this.state.turn;
      this.scheduleBotImmediate(seat, () => this.applyAndPropagate({ t: 'draw', seat }));
      return;
    }

    this.botActIfNeeded(this.state.turn);
  }

  // -------------------------------------------------------------------------
  // Bot logic
  // -------------------------------------------------------------------------

  private isBotOrOffline(seat: Seat): boolean {
    const slot = this.slots[seat];
    if (!slot) return false;
    return slot.isBot || !this.connections.has(seat);
  }

  /** A seat's level, defaulting to easy for anything unlevelled. */
  private botPlayFor(seat: Seat): (typeof BOT_PLAY)[BotDifficulty] {
    return BOT_PLAY[this.slots[seat]?.difficulty ?? 'easy'];
  }

  private botHuanSelect(seat: Seat): void {
    const action = botHuanAction(this.state, seat);
    if (action) this.applyAndPropagate(action);
  }

  private botVoidDeclare(seat: Seat): void {
    const action = this.botPlayFor(seat).declareVoid(this.state, seat);
    if (action) this.applyAndPropagate(action);
  }

  private botActIfNeeded(seat: Seat): void {
    if (!this.isBotOrOffline(seat)) return;
    // A briefly-dropped human still inside their 60s grace keeps their turn —
    // scheduleNext runs on every state change and reconnect, so without this a
    // *different* player reconnecting would bot-play this seat's discard. The
    // huan/void/claim paths already wait the grace out; the turn owner didn't. (A38)
    if (this.isInReconnectGrace(seat)) return;
    if (this.state.phase !== 'play') return;
    if (this.state.pendingClaims !== null) return;
    if (this.state.turnDrawNeeded) return;
    if (this.state.turn !== seat) return;

    const player = this.state.players[seat];
    if (!player || player.status === 'hu') return;

    const play = this.botPlayFor(seat);
    this.scheduleBot(seat, () => {
      const action = play.turn(this.state, seat);
      // Acting re-enters scheduleNext through afterStateChange. Declining has to
      // do it here, or the seat's slot in `botPendingSeats` is released with
      // nothing left to notice the room is owed a move. See A68 below.
      if (action === null) this.scheduleNext();
      else this.applyAndPropagate(action);
    });
  }

  private botClaimIfNeeded(): void {
    const window = this.state.pendingClaims;
    if (window === null) return;

    for (let s = 0; s < 4; s++) {
      const seat = s as Seat;
      if (seat === window.from) continue;
      if (window.passed[seat] || window.claims[seat] !== null) continue;
      // Don't bot-decide a claim for a disconnected human still in their reconnect
      // grace (e.g. right after a restore) — that would silently pass/claim for
      // them and can stamp a missed-Hu furiten. (A10)
      if (!this.isBotOrOffline(seat) || this.isInReconnectGrace(seat)) continue;

      const play = this.botPlayFor(seat);
      this.scheduleBot(seat, () => {
        const w = this.state.pendingClaims;
        // **A pending decision can go stale, and something has to notice.** (A68)
        //
        // `scheduleBot` and `scheduleBotImmediate` share one `botPendingSeats`
        // set on the stated ground that huan, void, claim and turn are mutually
        // exclusive — true of a seat at one instant, false across a window
        // closing. When the deadline expires rather than this bot answering, the
        // turn can pass to *this* seat, and the `setImmediate` that would issue
        // its draw is deduped away against the claim it superseded. The claim
        // callback then arrives, finds no window, releases the slot and returns
        // — and the room is left owing a draw with nothing scheduled to make it.
        // Not slow: dead, and silent, because nothing rejected anything.
        //
        // Reachable by configuration. The lobby clamps the pace to 5s and the
        // shortest window a host can pick is 8s, but `SM_BOT_DELAY_MS` is read
        // straight into `paceOverride` without the clamp.
        if (w === null || w.passed[seat] || w.claims[seat] !== null) {
          this.scheduleNext();
          return;
        }
        this.applyAndPropagate(play.claim(this.state, seat));
      });
    }
  }

  // -------------------------------------------------------------------------
  // Broadcasting
  // -------------------------------------------------------------------------

  private broadcastViews(events: GameEvent[]): void {
    for (const [seat, ws] of this.connections) {
      this.sendViewTo(seat, ws, events);
    }
    if (this.spectators.size > 0) {
      const view = projectSpectatorView(this.state);
      const redacted = redactEventsFor('spectator', events);
      for (const ws of this.spectators) {
        this.send(ws, { t: 'spectate', view, events: redacted });
      }
    }
  }

  private sendView(seat: Seat, events: GameEvent[]): void {
    const ws = this.connections.get(seat);
    if (ws !== undefined) this.sendViewTo(seat, ws, events);
  }

  private sendViewTo(seat: Seat, ws: WebSocket, events: GameEvent[]): void {
    const view = projectView(this.state, seat);
    // Events are shared across the broadcast; drawn tiles are only for the
    // seat that drew them. (A31)
    //
    // The pace rides on every push rather than on a message of its own, because
    // this is also the first thing a reconnecting socket receives — so it cannot
    // drift out of step with the room, and there is no separate trigger to
    // remember on join, on start, or on repace. (N24)
    this.send(ws, {
      t: 'view',
      view,
      events: redactEventsFor(seat, events),
      botPace: { speed: this.botSpeed, pinned: isBotPacePinned() },
    });
  }

  private buildRoundResult(): RoundResult {
    return {
      roundIndex: this.roundIndex,
      dealer: this.state.dealer,
      players: this.state.players.map(p => ({
        seat: p.seat as Seat,
        name: p.name,
        scoreDelta: p.scoreDelta,
        hu: p.hu,
        hand: [...p.hand],
        melds: [...p.melds],
        isReady: p.isReady,
        ledger: this.state.ledger.filter(e => e.from === p.seat || e.to === p.seat),
      })),
    };
  }

  /** Test seam for the round-result payload. */
  buildRoundResultForTest(): RoundResult {
    return this.buildRoundResult();
  }

  private broadcastRoundEnd(): void {
    const results = this.buildRoundResult();
    for (const [, ws] of this.connections) {
      this.send(ws, { t: 'roundEnd', results });
    }
    for (const ws of this.spectators) {
      this.send(ws, { t: 'roundEnd', results });
    }

    // Persist to SQLite (best-effort; don't crash the server on DB error)
    try {
      saveGameWithCode(this.code, this.state, results);
    } catch (err) {
      console.error('[persistence] Failed to save game:', err);
    }

    const listeners = this.roundEndListeners.splice(0);
    for (const fn of listeners) fn(this.state);
  }

  private send(ws: WebSocket, msg: ServerMsg): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private sendError(seat: Seat, code: string, message: string): void {
    const ws = this.connections.get(seat);
    if (ws) this.send(ws, { t: 'error', code, message });
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * Repace the bots mid-match (N5). Takes effect on the next bot turn — the pace
   * is read when a turn is scheduled, so nothing in flight needs cancelling.
   *
   * Returns false when there is nothing to pace: at a table of four humans this is
   * a no-op, and reporting that lets the caller say so instead of silently
   * accepting. `--bot-delay` still outranks the value either way.
   */
  setBotSpeed(speed: BotSpeed): boolean {
    this.botSpeed = speed;
    this.lastActivityAt = Date.now();
    // Re-push so the host's menu reflects the new pace immediately. Without this
    // the next view arrives with the next bot move — up to 1.8s away on slow,
    // which is exactly the setting a host is most likely to be reaching for. No
    // events, so nothing is added to any feed or history. (N24)
    this.broadcastViews([]);
    return this.slots.some(s => s.isBot);
  }

  /**
   * Current pace. It was written for "so a joining or reconnecting client can
   * show the right one" and then never called, which is why the ⚙ menu shipped
   * displaying a hardcoded 'normal'. Every view push now carries the value off
   * the field directly; this stays for tests and for the lobby message, which
   * still does not carry the pace. (N24)
   */
  getBotSpeed(): BotSpeed {
    return this.botSpeed;
  }

  /** Whether any seat is a bot — the same "is there anything to pace" test. */
  hasBots(): boolean {
    return this.slots.some(s => s.isBot);
  }

  getLobbyPlayers(): Array<{ seat: Seat; name: string; isBot: boolean; connected: boolean }> {
    return this.slots.map((s: RoomSlot, i: number) => ({
      seat: i as Seat,
      name: s.name,
      isBot: s.isBot,
      connected: s.connected,
    }));
  }

  /** Returns a Promise that resolves when the round reaches roundEnd. */
  waitForRoundEnd(): Promise<GameState> {
    if (this.state.phase === 'roundEnd') return Promise.resolve(this.state);
    return new Promise<GameState>(resolve => {
      this.roundEndListeners.push(resolve);
    });
  }

  private roundEndListeners: Array<(state: GameState) => void> = [];
}

// In-memory registry
const rooms = new Map<string, GameRoom>();

export function createRoom(
  code: string,
  slots: RoomSlot[],
  config?: Partial<GameConfig>,
  botSpeed?: BotSpeed,
): GameRoom {
  const room = new GameRoom(code, slots, config, botSpeed);
  rooms.set(code, room);
  return room;
}

/**
 * What a value *is*, for shape comparison — arrays kept apart from objects,
 * because "an array became an object" is the mutation that breaks a hand.
 */
function kindOf(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

/**
 * Fields a snapshot must carry **and what kind each one is**, taken from a
 * freshly created game rather than a hand-written list — so the check cannot
 * drift as `GameState` grows. This is what makes the validation below
 * self-maintaining: add a field to the engine and old snapshots start being
 * rejected for it automatically.
 *
 * A field that is `null` in a fresh game records `'null'` and is exempted from
 * the kind check — `lastDiscard`, `pendingClaims`, a player's `hu` and the rest
 * are legitimately either, and a fresh deal cannot say which. Those are the one
 * gap left here, and they are the shallow ones: it is `hand`, `melds`,
 * `discards`, `wall` and `players` whose kind changing does real damage. (A69)
 */
function requiredShape(): { state: Record<string, string>; player: Record<string, string> } {
  const fresh = createGame('shape-probe', [
    { name: 'a', isBot: true },
    { name: 'b', isBot: true },
    { name: 'c', isBot: true },
    { name: 'd', isBot: true },
  ]);
  const kinds = (o: object): Record<string, string> =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, kindOf(v)]));
  return { state: kinds(fresh), player: kinds(fresh.players[0]) };
}

/**
 * The one field a missing value can be defaulted for: an empty ledger costs the
 * round its payment breakdown and corrupts nothing. Every other field is real
 * game state with no safe default — a missing `hand` or `turn` cannot be
 * invented, so those snapshots are rejected rather than half-restored.
 */
function normalizeSnapshotState(state: Record<string, unknown>): void {
  if (state.ledger === undefined) state.ledger = [];
}

/**
 * Names every field a persisted snapshot is missing, or [] when it matches the
 * current shape. `GameRoom.restore` used to assign `snap.state` verbatim, so a
 * field added or renamed since the snapshot was written came back `undefined`:
 * two fields throw on restore and seventeen silently corrupt the projected
 * view — `pendingFirstDiscard` (renamed in A35) reads as "has a pending tile"
 * and soft-locks the seat. Silent corruption is the worst outcome available,
 * so an incompatible snapshot is refused instead.
 */
export function validateRoomSnapshot(snapshot: unknown, expectedCode?: string): string[] {
  if (typeof snapshot !== 'object' || snapshot === null) return ['snapshot (not an object)'];
  const snap = snapshot as {
    state?: unknown;
    slots?: unknown;
    tokens?: unknown;
    isHumanSeat?: unknown;
    code?: unknown;
  };
  if (typeof snap.state !== 'object' || snap.state === null) return ['state (missing)'];

  const state = snap.state as Record<string, unknown>;
  normalizeSnapshotState(state);

  const shape = requiredShape();
  const missing: string[] = [];

  /**
   * The envelope around `state`, which nothing checked. `restore` reaches
   * straight into `slots.map` and `tokens`, so a row missing either was dropped
   * by the try/catch — which works, but reports "restore threw" instead of
   * naming the field, and that is the difference between a log line you can act
   * on and one you cannot. (A69)
   */
  if (!Array.isArray(snap.slots) || snap.slots.length !== 4) missing.push('slots (expected 4)');
  if (!Array.isArray(snap.tokens)) missing.push('tokens (expected an array)');
  if (!Array.isArray(snap.isHumanSeat) || snap.isHumanSeat.length !== 4) {
    missing.push('isHumanSeat (expected 4)');
  }
  /**
   * **The row's key is authoritative, not the snapshot's.** `restore` registers
   * the room under `snap.code` while `live_rooms` is keyed by the column — so a
   * disagreement puts the room in memory under one code and leaves its row
   * under another, where `deleteRoom` can never reach it and every boot
   * restores it again. (A69)
   */
  if (expectedCode !== undefined && snap.code !== expectedCode) {
    missing.push(`code (row says ${expectedCode}, snapshot says ${String(snap.code)})`);
  }

  for (const [key, kind] of Object.entries(shape.state)) {
    if (key === 'players') continue;
    const value = state[key];
    if (value === undefined) {
      missing.push(`state.${key}`);
      continue;
    }
    if (kind === 'null') continue; // no kind to compare against — see requiredShape
    if (kindOf(value) !== kind) missing.push(`state.${key} (expected ${kind})`);
  }

  const players = state.players;
  if (!Array.isArray(players) || players.length !== 4) {
    missing.push('state.players (expected 4)');
    return missing;
  }
  players.forEach((p, i) => {
    if (typeof p !== 'object' || p === null) {
      missing.push(`players[${i}] (not an object)`);
      return;
    }
    const player = p as Record<string, unknown>;
    for (const [key, kind] of Object.entries(shape.player)) {
      const value = player[key];
      if (value === undefined) {
        missing.push(`players[${i}].${key}`);
        continue;
      }
      if (kind === 'null') continue;
      if (kindOf(value) !== kind) missing.push(`players[${i}].${key} (expected ${kind})`);
    }
  });
  return missing;
}

/** How many rooms are live, for the concurrent-games ceiling. */
export function roomCount(): number {
  return rooms.size;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
  revokeTokensForCode(code);
  try {
    deleteLiveRoom(code);
  } catch {
    /* best-effort */
  }
}

/**
 * Rehydrate in-progress rooms from disk after a server restart. Re-registers
 * each room's tokens so disconnected players can reconnect and resume.
 * Returns the number of rooms restored.
 */
export function restoreRoomsFromDisk(): number {
  let restored = 0;
  let snapshots: Array<{ code: string; snapshot: unknown }>;
  try {
    snapshots = loadLiveRooms();
  } catch (err) {
    console.error('[resume] Failed to load live rooms:', err);
    return 0;
  }
  for (const { code, snapshot } of snapshots) {
    // A row that can't be restored is dropped rather than left to fail on every
    // future boot — that's what produced repeating restore errors in the logs.
    const drop = (why: string) => {
      console.error(`[resume] Discarding room ${code}: ${why}`);
      try {
        deleteLiveRoom(code);
      } catch {
        /* best-effort */
      }
    };

    // The row's code is passed in so the snapshot cannot name a different one.
    const missing = validateRoomSnapshot(snapshot, code);
    if (missing.length > 0) {
      drop(`snapshot does not match this version (${missing.join(', ')})`);
      continue;
    }

    try {
      const snap = snapshot as RoomSnapshot;
      const room = GameRoom.restore(snap);
      rooms.set(room.code, room);
      // Tokens are imported only once the room is known good; importing them
      // first would leave dangling seats for a room that never materialised.
      for (const t of snap.tokens) {
        importToken(t.token, { code: t.code, seat: t.seat, role: t.role });
      }
      // The watch token goes back with them. It lives in its own store, so it
      // needs its own call — and without one a restart closed every spectator
      // socket with `no_game` on a room the players were rejoining fine. (A41)
      if (snap.watchToken) importWatchToken(code, snap.watchToken);
      room.resumeAfterRestore();
      restored++;
    } catch (err) {
      rooms.delete(code);
      drop(`restore threw — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return restored;
}

/** Flush all live rooms to disk (called on graceful shutdown). */
export function flushAllRooms(): void {
  for (const room of rooms.values()) room.persistNow();
}

/**
 * Tear down rooms with no activity for `maxIdleMs` — abandoned games would
 * otherwise sit in memory (and re-restore from live_rooms on every restart)
 * forever. Goes through endMatch, so lingering clients get a clean `matchEnd`
 * and tokens + the persisted snapshot are dropped. Returns the number swept. (A29)
 */
export function sweepIdleRooms(maxIdleMs: number, now = Date.now()): number {
  let swept = 0;
  for (const room of [...rooms.values()]) {
    if (room.idleMs(now) <= maxIdleMs) continue;
    console.log(
      `[sweep] Ending idle room ${room.code} (idle ${Math.round(room.idleMs(now) / 60_000)}m).`,
    );
    room.endMatch();
    swept++;
  }
  return swept;
}
