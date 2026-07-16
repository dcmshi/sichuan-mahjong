import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import {
  DEFAULT_CONFIG,
  applyAction,
  createGame,
  projectSpectatorView,
  projectView,
  startNextRound,
} from '@sichuan-mahjong/engine';
import type {
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
  botClaimActionMedium,
  botHuanAction,
  botTurnAction,
  botTurnActionMedium,
  botVoidAction,
} from './bot.js';
import { deleteLiveRoom, loadLiveRooms, saveGameWithCode, saveLiveRoom } from './persistence.js';
import { importToken, revokeTokensForCode, tokensForCode } from './tokens.js';

const RECONNECT_TIMEOUT_MS = 60_000;
const BOT_THINK_MS = 150;
const PERSIST_DEBOUNCE_MS = 1000;

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
  difficulty?: 'easy' | 'medium';
};

/** Serializable snapshot of a live room, persisted so the game survives a restart. */
export type RoomSnapshot = {
  code: string;
  state: GameState;
  slots: RoomSlot[];
  isHumanSeat: boolean[];
  tokens: Array<{ token: string; code: string; seat: Seat; role: 'host' | 'player' }>;
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
  /** Set once the match ends: the room is torn down and must accept no further work. (A11) */
  private ended = false;

  constructor(code: string, slots: RoomSlot[], config: Partial<GameConfig> = {}) {
    this.code = code;
    this.slots = slots;
    this.isHumanSeat = slots.map(s => !s.isBot);
    const players: [PlayerInit, PlayerInit, PlayerInit, PlayerInit] = slots.map(s => ({
      name: s.name,
      isBot: s.isBot,
    })) as [PlayerInit, PlayerInit, PlayerInit, PlayerInit];

    const seed = randomUUID();
    this.state = createGame(seed, players, { ...DEFAULT_CONFIG, ...config });
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
    for (const [, ws] of this.connections) {
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
    }, BOT_THINK_MS);
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

  /** Attach a read-only spectator. They receive hand-hiding spectate views. */
  addSpectator(ws: WebSocket): void {
    this.spectators.add(ws);
    if (this.started) {
      this.send(ws, { t: 'spectate', view: projectSpectatorView(this.state), events: [] });
    }
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
    return {
      code: this.code,
      state: this.state,
      slots: this.slots.map(s => ({ ...s })),
      isHumanSeat: [...this.isHumanSeat],
      tokens: tokensForCode(this.code).map(t => ({
        token: t.token,
        code: t.code,
        seat: t.seat,
        role: t.role,
      })),
    };
  }

  /** Reconstruct a room from a snapshot after a server restart. No live connections yet. */
  static restore(snap: RoomSnapshot): GameRoom {
    const room = new GameRoom(
      snap.code,
      snap.slots.map(s => ({ ...s, connected: false })),
      snap.state.config,
    );
    room.state = snap.state;
    room.isHumanSeat = [...snap.isHumanSeat];
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
      if (this.state.phase === 'roundEnd') {
        // Keep the snapshot so a restart resumes at the round-end screen,
        // but a finished match is torn down via endMatch() → deleteLiveRoom.
      }
      saveLiveRoom(this.code, this.serialize());
    } catch (err) {
      console.error('[persistence] Failed to snapshot live room:', err);
    }
  }

  private scheduleNext(): void {
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

  private botHuanSelect(seat: Seat): void {
    const action = botHuanAction(this.state, seat);
    if (action) this.applyAndPropagate(action);
  }

  private botVoidDeclare(seat: Seat): void {
    const action = botVoidAction(this.state, seat);
    if (action) this.applyAndPropagate(action);
  }

  private botActIfNeeded(seat: Seat): void {
    if (!this.isBotOrOffline(seat)) return;
    if (this.state.phase !== 'play') return;
    if (this.state.pendingClaims !== null) return;
    if (this.state.turnDrawNeeded) return;
    if (this.state.turn !== seat) return;

    const player = this.state.players[seat];
    if (!player || player.status === 'hu') return;

    const medium = this.slots[seat]?.difficulty === 'medium';
    this.scheduleBot(seat, () => {
      const action = medium
        ? botTurnActionMedium(this.state, seat)
        : botTurnAction(this.state, seat);
      if (action !== null) this.applyAndPropagate(action);
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

      const medium = this.slots[seat]?.difficulty === 'medium';
      this.scheduleBot(seat, () => {
        const w = this.state.pendingClaims;
        if (w === null || w.passed[seat] || w.claims[seat] !== null) return;
        const action = medium
          ? botClaimActionMedium(this.state, seat)
          : botClaimAction(this.state, seat);
        this.applyAndPropagate(action);
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
      for (const ws of this.spectators) {
        this.send(ws, { t: 'spectate', view, events });
      }
    }
  }

  private sendView(seat: Seat, events: GameEvent[]): void {
    const ws = this.connections.get(seat);
    if (ws !== undefined) this.sendViewTo(seat, ws, events);
  }

  private sendViewTo(seat: Seat, ws: WebSocket, events: GameEvent[]): void {
    const view = projectView(this.state, seat);
    this.send(ws, { t: 'view', view, events });
  }

  private buildRoundResult(): RoundResult {
    return {
      players: this.state.players.map(p => ({
        seat: p.seat as Seat,
        name: p.name,
        scoreDelta: p.scoreDelta,
        hu: p.hu,
      })),
    };
  }

  private broadcastRoundEnd(): void {
    const results = this.buildRoundResult();
    for (const [, ws] of this.connections) {
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
): GameRoom {
  const room = new GameRoom(code, slots, config);
  rooms.set(code, room);
  return room;
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
  for (const { snapshot } of snapshots) {
    try {
      const snap = snapshot as RoomSnapshot;
      for (const t of snap.tokens) {
        importToken(t.token, { code: t.code, seat: t.seat, role: t.role });
      }
      const room = GameRoom.restore(snap);
      rooms.set(room.code, room);
      room.resumeAfterRestore();
      restored++;
    } catch (err) {
      console.error('[resume] Failed to restore a room:', err);
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
