import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import {
  applyAction,
  createGame,
  startNextRound,
  projectView,
  projectSpectatorView,
  DEFAULT_CONFIG,
} from '@sichuan-mahjong/engine';
import type {
  GameState,
  GameAction,
  GameEvent,
  Seat,
  PlayerInit,
  GameConfig,
  ServerMsg,
  RoundResult,
} from '@sichuan-mahjong/engine';
import { botHuanAction, botVoidAction, botTurnAction, botClaimAction } from './bot.js';
import { saveGameWithCode } from './persistence.js';

const RECONNECT_TIMEOUT_MS = 60_000;
const BOT_THINK_MS = 150;

export type RoomSlot = {
  name: string;
  isBot: boolean;
  connected: boolean;
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
  private started = false;

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
    for (const [, ws] of this.connections) this.send(ws, { t: 'matchEnd' });
    deleteRoom(this.code);
  }

  // -------------------------------------------------------------------------
  // Connection management
  // -------------------------------------------------------------------------

  connect(seat: Seat, ws: WebSocket): void {
    const timer = this.disconnectTimers.get(seat);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.disconnectTimers.delete(seat);
    }
    const slot = this.slots[seat];
    if (slot) slot.connected = true;
    this.connections.set(seat, ws);

    // For reconnects after game has started, send the current view immediately
    if (this.started) this.sendView(seat, []);
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

  disconnect(seat: Seat): void {
    this.connections.delete(seat);
    const slot = this.slots[seat];
    if (slot) slot.connected = false;

    if (this.state.phase === 'roundEnd') return;

    const timer = setTimeout(() => {
      this.disconnectTimers.delete(seat);
      const s = this.slots[seat];
      if (s) s.isBot = true;
      this.botActIfNeeded(seat);
    }, RECONNECT_TIMEOUT_MS);
    this.disconnectTimers.set(seat, timer);
  }

  // -------------------------------------------------------------------------
  // Action handling
  // -------------------------------------------------------------------------

  handleAction(seat: Seat, action: GameAction): void {
    if ('seat' in action && (action as { seat: Seat }).seat !== seat) {
      this.sendError(seat, 'wrong_seat', 'Action seat does not match your seat.');
      return;
    }
    this.applyAndPropagate(action);
  }

  private applyAndPropagate(action: GameAction): void {
    const result = applyAction(this.state, action);
    if (!result.ok) return;
    this.state = result.state;
    this.afterStateChange(result.events);
  }

  // -------------------------------------------------------------------------
  // Post-action bookkeeping
  // -------------------------------------------------------------------------

  private afterStateChange(events: GameEvent[]): void {
    this.broadcastViews(events);
    this.scheduleNext();
  }

  private scheduleNext(): void {
    if (this.claimWindowTimer !== null) {
      clearTimeout(this.claimWindowTimer);
      this.claimWindowTimer = null;
    }

    // Huan phase: all bot/offline seats must submit huanSelect
    if (this.state.phase === 'huan') {
      for (let s = 0; s < 4; s++) {
        const seat = s as Seat;
        if (!this.isBotOrOffline(seat)) continue;
        if (this.state.pendingHuan[seat] != null) continue;
        setTimeout(() => this.botHuanSelect(seat), BOT_THINK_MS);
      }
      return;
    }

    // VoidDeclare phase: all bot/offline seats must submit declareVoid
    if (this.state.phase === 'voidDeclare') {
      for (let s = 0; s < 4; s++) {
        const seat = s as Seat;
        if (!this.isBotOrOffline(seat)) continue;
        if (this.state.pendingVoid[seat] != null) continue;
        setTimeout(() => this.botVoidDeclare(seat), BOT_THINK_MS);
      }
      return;
    }

    if (this.state.phase !== 'play') {
      if (this.state.phase === 'roundEnd') this.broadcastRoundEnd();
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
      setImmediate(() => this.applyAndPropagate({ t: 'draw', seat }));
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

    setTimeout(() => {
      const action = botTurnAction(this.state, seat);
      if (action !== null) this.applyAndPropagate(action);
    }, BOT_THINK_MS);
  }

  private botClaimIfNeeded(): void {
    const window = this.state.pendingClaims;
    if (window === null) return;

    for (let s = 0; s < 4; s++) {
      const seat = s as Seat;
      if (seat === window.from) continue;
      if (window.passed[seat] || window.claims[seat] !== null) continue;
      if (!this.isBotOrOffline(seat)) continue;

      setTimeout(() => {
        if (this.state.pendingClaims === null || this.state.pendingClaims.passed[seat]) return;
        const action = botClaimAction(this.state, seat);
        this.applyAndPropagate(action);
      }, BOT_THINK_MS);
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

  private broadcastRoundEnd(): void {
    const results: RoundResult = {
      players: this.state.players.map((p) => ({
        seat: p.seat as Seat,
        name: p.name,
        scoreDelta: p.scoreDelta,
        hu: p.hu,
      })),
      events: [],
    };
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

  getState(): GameState { return this.state; }

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

export function createRoom(code: string, slots: RoomSlot[], config?: Partial<GameConfig>): GameRoom {
  const room = new GameRoom(code, slots, config);
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): GameRoom | undefined {
  return rooms.get(code);
}

export function deleteRoom(code: string): void {
  rooms.delete(code);
}
