import { randomUUID } from 'node:crypto';
import type { WebSocket } from '@fastify/websocket';
import {
  applyAction,
  createGame,
  projectView,
  DEFAULT_CONFIG,
  tileTypeOf,
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
  TileId,
} from '@sichuan-mahjong/engine';

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
  private connections: Map<Seat, WebSocket> = new Map();
  private disconnectTimers: Map<Seat, ReturnType<typeof setTimeout>> = new Map();
  private claimWindowTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  constructor(code: string, slots: RoomSlot[], config: Partial<GameConfig> = {}) {
    this.code = code;
    this.slots = slots;
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
  // Bot logic (minimal placeholder — Phase 7 replaces with full heuristic)
  // -------------------------------------------------------------------------

  private isBotOrOffline(seat: Seat): boolean {
    const slot = this.slots[seat];
    if (!slot) return false;
    return slot.isBot || !this.connections.has(seat);
  }

  private botHuanSelect(seat: Seat): void {
    if (this.state.phase !== 'huan') return;
    if (this.state.pendingHuan[seat] != null) return;
    const player = this.state.players[seat];
    if (!player) return;

    const bySuit: [TileId[], TileId[], TileId[]] = [[], [], []];
    for (const t of player.hand) {
      const si = Math.floor(tileTypeOf(t) / 9) as 0 | 1 | 2;
      bySuit[si].push(t);
    }
    const chosen = bySuit.find(tiles => tiles.length >= 3);
    if (!chosen || chosen.length < 3) return;
    this.applyAndPropagate({ t: 'huanSelect', seat, tiles: [chosen[0]!, chosen[1]!, chosen[2]!] });
  }

  private botVoidDeclare(seat: Seat): void {
    if (this.state.phase !== 'voidDeclare') return;
    if (this.state.pendingVoid[seat] != null) return;
    const player = this.state.players[seat];
    if (!player) return;

    const bySuit: [TileId[], TileId[], TileId[]] = [[], [], []];
    for (const t of player.hand) {
      const si = Math.floor(tileTypeOf(t) / 9) as 0 | 1 | 2;
      bySuit[si].push(t);
    }
    // Pick suit with fewest tiles as void
    let minIdx: 0 | 1 | 2 = 0;
    if (bySuit[1].length < bySuit[minIdx].length) minIdx = 1;
    if (bySuit[2].length < bySuit[minIdx].length) minIdx = 2;

    const suits = ['man', 'pin', 'sou'] as const;
    const suit = suits[minIdx];
    const firstDiscard = bySuit[minIdx][0] ?? null;
    this.applyAndPropagate({ t: 'declareVoid', seat, suit, firstDiscard });
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
      const action = this.pickBotDiscard(seat);
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
        if (this.state.pendingClaims !== null && !this.state.pendingClaims.passed[seat]) {
          this.applyAndPropagate({ t: 'pass', seat });
        }
      }, BOT_THINK_MS);
    }
  }

  private pickBotDiscard(seat: Seat): GameAction | null {
    const player = this.state.players[seat];
    if (!player) return null;

    let candidates = player.hand;
    if (this.state.config.voidDiscardRule === 'strict' && !player.voidCleared && player.voidedSuit !== null) {
      const suitMap: Record<string, number> = { man: 0, pin: 1, sou: 2 };
      const si = suitMap[player.voidedSuit] ?? 0;
      const voidTiles = player.hand.filter(t => Math.floor(tileTypeOf(t) / 9) === si);
      if (voidTiles.length > 0) candidates = voidTiles;
    }

    const tile = candidates[0];
    if (tile === undefined) return null;
    return { t: 'discard', seat, tile };
  }

  // -------------------------------------------------------------------------
  // Broadcasting
  // -------------------------------------------------------------------------

  private broadcastViews(events: GameEvent[]): void {
    for (const [seat, ws] of this.connections) {
      this.sendViewTo(seat, ws, events);
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
