import type { WebSocket } from '@fastify/websocket';
import type { ClientMsg, GameConfig, LobbyPlayer, Seat, ServerMsg } from '@sichuan-mahjong/engine';
import type { FastifyInstance } from 'fastify';
import { allowJoin, clientKey } from './limits.js';
import { allLobbies, canStart, deleteLobby, findOpenSeat, getLobby } from './lobby.js';
import {
  type BotSpeed,
  DEFAULT_BOT_SPEED,
  type GameRoom,
  createRoom,
  getRoom,
  isBotSpeed,
} from './room.js';
import type { RoomSlot } from './room.js';
import { isAllowedOrigin } from './security.js';
import { isWatchToken, issueToken, resolveToken, revokeTokensForCode } from './tokens.js';

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/**
 * Ping every socket on a timer and hang up on one that stops answering. (C7)
 *
 * Nothing needed this on a LAN or a tailnet — no middlebox closes an idle
 * connection there, and a mahjong turn is quiet for as long as someone takes to
 * think. A platform proxy will reap it, and the client would recover via its
 * backoff, but only after showing "Reconnecting…" through every long pause and
 * with MAX_RETRIES to spend. Cheaper to keep the socket warm.
 *
 * The dead-peer half matters too: without it a half-open connection holds a
 * seat that nobody is sitting in, and `room.disconnect` never fires to start
 * the bot-takeover countdown.
 */
const HEARTBEAT_MS = 30_000;

function startHeartbeat(socket: WebSocket): void {
  let alive = true;
  socket.on('pong', () => {
    alive = true;
  });

  const timer = setInterval(() => {
    if (!alive) {
      // Skips the close handshake deliberately: the peer is already gone, and
      // close() would wait for a reply that is never coming.
      socket.terminate();
      return;
    }
    alive = false;
    try {
      socket.ping();
    } catch {
      /* socket died between the check and the ping */
    }
  }, HEARTBEAT_MS);

  // unref so a lingering socket can't hold the process open at shutdown.
  timer.unref?.();
  socket.on('close', () => clearInterval(timer));
}

/** Parse a raw WS frame into a ClientMsg, or null if malformed. */
function parseClientMsg(raw: Buffer): ClientMsg | null {
  try {
    return JSON.parse(raw.toString()) as ClientMsg;
  } catch {
    return null;
  }
}

/**
 * The host's house-rule choices, narrowed to what the engine will accept. Only a
 * literal `true` turns a rule on: anything else — absent, null, `"true"`, a
 * number — falls back to the engine default, so a hand-rolled frame can't switch
 * the ruleset by sending a truthy value of the wrong type. Exported for the test.
 */
export function houseRules(rules: unknown): Partial<GameConfig> {
  const r = (rules ?? {}) as Record<string, unknown>;
  return {
    enableHuanSanZhang: r.huanSanZhang === true,
    claimWindowMs: claimWindowMsFrom(r.claimWindow),
  };
}

/**
 * How long a discard stays claimable, as presets rather than the number itself.
 *
 * It has already moved four times — 3s, 6s, 10s, now 15s — which is the tell
 * that there is no single right value: a table of beginners wants longer and four
 * people who know the game want the pause gone. But `claimWindowMs` is a
 * deadline the whole table waits on, so a free integer off the wire is a denial
 * of service in one field: `86400000` freezes a room until the sweep reaps it and
 * `0` closes the window before a human can see it. Take an enum, map it here, and
 * fall back to normal for anything unrecognised. (N6)
 *
 * `normal` tracks `DEFAULT_CONFIG.claimWindowMs` and a test pins the two together:
 * a host who touches nothing must get the same window as practice mode.
 */
export const CLAIM_WINDOWS = { quick: 8000, normal: 15_000, relaxed: 30_000 } as const;
export type ClaimWindow = keyof typeof CLAIM_WINDOWS;

/** A seat index off the wire: 0..3, and an actual integer. */
export function isSeat(v: unknown): v is Seat {
  return v === 0 || v === 1 || v === 2 || v === 3;
}

/**
 * A bot level off the wire. Only the two that exist are accepted; anything else is
 * easy, which is the gentler failure — a crafted frame must not be able to seat an
 * opponent whose difficulty string no dispatch in `room.ts` recognises. (N18)
 */
export function botDifficultyFrom(v: unknown): 'easy' | 'medium' {
  return v === 'medium' ? 'medium' : 'easy';
}

export function claimWindowMsFrom(v: unknown): number {
  return v === 'quick' || v === 'normal' || v === 'relaxed'
    ? CLAIM_WINDOWS[v as ClaimWindow]
    : CLAIM_WINDOWS.normal;
}

/**
 * The host's bot pace, which is not a rule and so does not belong in
 * `GameConfig` — anything unrecognised falls back rather than being trusted, as
 * with every other field off the wire.
 */
export function botSpeedFrom(rules: unknown): BotSpeed {
  const r = (rules ?? {}) as Record<string, unknown>;
  return isBotSpeed(r.botSpeed) ? r.botSpeed : DEFAULT_BOT_SPEED;
}

/** Bind a socket to in-game message routing for `seat` (used on join, start, and reconnect). */
function bindGameSocket(socket: WebSocket, room: GameRoom, seat: Seat): void {
  socket.removeAllListeners('message');
  socket.on('message', (raw: Buffer) => {
    const m = parseClientMsg(raw);
    if (m) handleGameMessage(socket, room, seat, m);
  });
  // Pass the socket so a stale close (after this seat was rebound to a newer
  // socket on reconnect) is ignored instead of evicting the live one. (A5)
  socket.on('close', () => room.disconnect(seat, socket));
}

// Active lobby WS connections: code → Map<seat, WebSocket>
const lobbyConnections = new Map<string, Map<Seat, WebSocket>>();

/**
 * Drop never-started lobbies older than `maxAgeMs` that have no connected human
 * — without a sweep, every abandoned "Host a Game" click leaks a lobby, its
 * tokens, and its connection map for the life of the server. Started lobbies
 * are already consumed by startGame. Returns the number swept. (A29)
 */
export function sweepStaleLobbies(maxAgeMs: number, now = Date.now()): number {
  let swept = 0;
  for (const lobby of allLobbies()) {
    if (lobby.started) continue;
    if (now - lobby.createdAt <= maxAgeMs) continue;
    if (lobby.slots.some(s => s && !s.isBot && s.connected)) continue;
    deleteLobby(lobby.code);
    revokeTokensForCode(lobby.code);
    const conns = lobbyConnections.get(lobby.code);
    if (conns) {
      for (const [, ws] of conns) {
        try {
          ws.close();
        } catch {
          /* already closing */
        }
      }
      lobbyConnections.delete(lobby.code);
    }
    swept++;
  }
  return swept;
}

function getLobbyConns(code: string): Map<Seat, WebSocket> {
  let m = lobbyConnections.get(code);
  if (!m) {
    m = new Map();
    lobbyConnections.set(code, m);
  }
  return m;
}

function broadcastLobbyTo(code: string, hostToken: string): void {
  const lobby = getLobby(code);
  if (!lobby) return;
  const conns = getLobbyConns(code);
  const players: LobbyPlayer[] = lobby.slots.map((s, i) => ({
    seat: i as Seat,
    name: s?.name ?? '',
    isBot: s?.isBot ?? false,
    connected: s?.connected ?? false,
    ...(s?.difficulty ? { difficulty: s.difficulty } : {}),
  }));
  const ready = canStart(lobby);
  for (const [s, ws] of conns) {
    const slotToken = lobby.slots[s]?.token;
    const isH = slotToken === hostToken;
    send(ws, { t: 'lobby', players, canStart: ready, isHost: isH });
  }
}

/**
 * Wire a socket that occupies lobby `seat` to the lobby command handler.
 * Used both on first join and on reconnect so a brief WS drop never strands
 * a player (their addBot/startGame/etc. keep working after reconnect).
 */
function bindLobbySocket(
  socket: WebSocket,
  code: string,
  seat: Seat,
  isHost: boolean,
  hostToken: string,
): void {
  socket.removeAllListeners('message');
  socket.on('message', (raw: Buffer) => {
    const msg = parseClientMsg(raw);
    if (msg) handleLobbyMessage(socket, code, seat, isHost, msg, hostToken);
  });
  socket.on('close', () => {
    const conns = getLobbyConns(code);
    // Skip if a reconnect already replaced this socket for the seat.
    if (conns.get(seat) !== socket) return;
    conns.delete(seat);
    const l = getLobby(code);
    if (l && !l.started) {
      // Keep the slot (so the player can reconnect); just mark it disconnected.
      const slot = l.slots[seat];
      if (slot) slot.connected = false;
      broadcastLobbyTo(code, l.hostToken);
    }
  });
}

export async function registerWsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Params: { code: string };
    Querystring: { token?: string; spectate?: string; watch?: string };
  }>('/ws/:code', { websocket: true }, (socket, req) => {
    const code = req.params.code.toUpperCase();
    const token = req.query.token ?? '';

    // A WS handshake ignores the same-origin policy, so without this any page on
    // the internet can open sockets here — spending its *visitors'* IP addresses
    // against the per-IP budget that is the whole reason a 4-character code is
    // guess-resistant. (H2)
    if (!isAllowedOrigin(req.headers.origin, req.headers.host)) {
      send(socket, { t: 'error', code: 'forbidden_origin', message: 'Origin not allowed.' });
      socket.close();
      return;
    }

    // Opening a socket is the other way to ask "is this code real?", so it
    // shares the lookup budget rather than getting its own. (C3)
    if (!allowJoin(clientKey(req))) {
      send(socket, { t: 'error', code: 'rate_limited', message: 'Too many attempts.' });
      socket.close();
      return;
    }

    startHeartbeat(socket);

    // Read-only spectator: no seat, but not no secret. The room code alone
    // used to be enough, which was fine when a tailnet decided who could
    // reach the server at all and is not on a public URL. (C5)
    if (req.query.spectate === '1' || req.query.spectate === 'true') {
      if (!isWatchToken(code, req.query.watch ?? '')) {
        send(socket, { t: 'error', code: 'no_game', message: 'No game to spectate.' });
        socket.close();
        return;
      }
      const room = getRoom(code);
      if (!room) {
        send(socket, { t: 'error', code: 'no_game', message: 'No game to spectate.' });
        socket.close();
        return;
      }
      if (!room.addSpectator(socket)) {
        send(socket, { t: 'error', code: 'spectators_full', message: 'Too many spectators.' });
        socket.close();
        return;
      }
      socket.on('close', () => room.removeSpectator(socket));
      return;
    }

    let seat: Seat | null = null;
    let isHost = false;

    // Check if reconnecting to an already-running game
    if (token) {
      const data = resolveToken(token);
      if (data && data.code === code) {
        const room = getRoom(code);
        if (room) {
          seat = data.seat;
          isHost = data.role === 'host';
          room.connect(seat, socket);
          bindGameSocket(socket, room, seat);
          return;
        }
        // No room yet → lobby phase. If this token already owns a lobby slot,
        // this is a reconnect: re-bind the seat so the player resumes seamlessly.
        const lobby = getLobby(code);
        if (lobby && !lobby.started) {
          const slotIdx = lobby.slots.findIndex(s => s?.token === token);
          if (slotIdx !== -1) {
            seat = slotIdx as Seat;
            isHost = data.role === 'host';
            const slot = lobby.slots[slotIdx]!;
            slot.connected = true;
            getLobbyConns(code).set(seat, socket);
            send(socket, { t: 'joined', seat, token });
            bindLobbySocket(socket, code, seat, isHost, lobby.hostToken);
            broadcastLobbyTo(code, lobby.hostToken);
            return;
          }
        }
        // Host token but no slot claimed yet (first connect): flag privilege,
        // seat is assigned when the 'join' message arrives.
        if (data.role === 'host') isHost = true;
      }
    }

    // Lobby phase handler (seat assigned on 'join' message)
    socket.on('message', (raw: Buffer) => {
      const msg = parseClientMsg(raw);
      if (!msg) return;

      if (msg.t === 'join') {
        if (seat !== null) {
          send(socket, { t: 'error', code: 'already_joined', message: 'Already joined.' });
          return;
        }

        const lobby = getLobby(code);
        if (!lobby) {
          send(socket, { t: 'error', code: 'lobby_not_found', message: 'Lobby not found.' });
          return;
        }
        if (lobby.started) {
          send(socket, { t: 'error', code: 'game_started', message: 'Game already started.' });
          return;
        }

        // Seat 0 is reserved for the host (nextRound/endMatch are gated on
        // seat === 0). Non-host joiners are placed in seats 1–3, so a friend
        // who joins before the host can never land in seat 0 and inherit host
        // powers via their token. (A8)
        let assignedSeat: Seat;
        if (isHost) {
          assignedSeat = 0;
        } else {
          const open = findOpenSeat(lobby, { skipHostSeat: true });
          if (open === null) {
            send(socket, { t: 'error', code: 'lobby_full', message: 'Lobby is full.' });
            return;
          }
          assignedSeat = open;
        }

        seat = assignedSeat;
        const playerToken = isHost ? token : issueToken(code, seat, 'player');

        // Sanitize the client-supplied name: it's broadcast to everyone, fed into
        // the engine, and persisted. Clamp to a trimmed string ≤ 24 chars. (A14)
        const rawName = typeof msg.name === 'string' ? msg.name.trim() : '';
        const name = (rawName || `Player ${seat + 1}`).slice(0, 24);

        lobby.slots[seat] = { name, isBot: false, token: playerToken, connected: true };
        getLobbyConns(code).set(seat, socket);

        send(socket, { t: 'joined', seat, token: playerToken });
        broadcastLobbyTo(code, lobby.hostToken);

        // Wire lobby commands + a reconnect-friendly close handler.
        bindLobbySocket(socket, code, seat, isHost, lobby.hostToken);
      }
    });
  });
}

function handleLobbyMessage(
  _ws: WebSocket,
  code: string,
  seat: Seat,
  isHost: boolean,
  msg: ClientMsg,
  hostToken: string,
): void {
  switch (msg.t) {
    case 'startGame': {
      if (!isHost) {
        const ws = _ws;
        send(ws, { t: 'error', code: 'not_host', message: 'Only the host can start the game.' });
        return;
      }
      const lobby = getLobby(code);
      if (!lobby || !canStart(lobby)) {
        send(_ws, { t: 'error', code: 'not_ready', message: 'Lobby not full.' });
        return;
      }
      if (lobby.started) return;
      lobby.started = true;

      const slots: RoomSlot[] = lobby.slots.map(s => ({
        name: s?.name ?? 'Bot',
        isBot: s?.isBot ?? true,
        connected: s?.connected ?? false,
        difficulty: s?.difficulty ?? 'easy',
      }));

      const room = createRoom(code, slots, houseRules(msg.rules), botSpeedFrom(msg.rules));

      // Transfer lobby connections to the room, then start
      const conns = lobbyConnections.get(code);
      if (conns) {
        for (const [s, conn] of conns) {
          room.connect(s, conn);
          bindGameSocket(conn, room, s);
        }
        lobbyConnections.delete(code);
      }
      // The lobby is consumed once the game starts; reconnects now go to the room.
      deleteLobby(code);

      room.start();
      break;
    }

    case 'addBot': {
      if (!isHost) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can add bots.' });
        return;
      }
      const lobby = getLobby(code);
      if (!lobby) return;
      // An asked-for seat is honoured only if it exists and is free; anything else
      // falls back to the first open one, which is what this always did. Validated
      // rather than trusted — `seat` is off the wire like every other field.
      const asked = msg.t === 'addBot' ? msg.seat : undefined;
      const wanted = isSeat(asked) && lobby.slots[asked] === null ? asked : findOpenSeat(lobby);
      if (wanted === null) {
        send(_ws, { t: 'error', code: 'lobby_full', message: 'No open seats.' });
        return;
      }
      const difficulty = msg.t === 'addBot' ? botDifficultyFrom(msg.difficulty) : 'easy';
      const botToken = issueToken(code, wanted, 'player');
      lobby.slots[wanted] = {
        // Just the seat. The level used to be baked in as "Bot (Hard)" — for the
        // *medium* bot, which was already wrong and gets wronger once N19 adds a
        // real hard one. `LobbyPlayer.difficulty` is already on the wire, so the
        // lobby shows the level from that and the name stays stable in the feed
        // and the move history. (N18)
        name: `Bot ${wanted + 1}`,
        isBot: true,
        token: botToken,
        connected: true,
        difficulty,
      };
      broadcastLobbyTo(code, hostToken);
      break;
    }

    case 'setBotDifficulty': {
      if (!isHost) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can set bot level.' });
        return;
      }
      const lobby = getLobby(code);
      if (!lobby) return;
      // Integer check before the index: `slots["0"]` reaches element 0 on a JS
      // array, so a string seat off the wire would otherwise resolve.
      const target = isSeat(msg.seat) ? lobby.slots[msg.seat] : undefined;
      if (!target?.isBot) {
        send(_ws, { t: 'error', code: 'not_bot', message: 'That seat is not a bot.' });
        return;
      }
      target.difficulty = botDifficultyFrom(msg.difficulty);
      broadcastLobbyTo(code, hostToken);
      break;
    }

    case 'kickBot': {
      if (!isHost) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can kick bots.' });
        return;
      }
      const lobby = getLobby(code);
      if (!lobby) return;
      const kickSeat = msg.seat;
      const slot = lobby.slots[kickSeat];
      if (!slot?.isBot) {
        send(_ws, { t: 'error', code: 'not_bot', message: 'That seat is not a bot.' });
        return;
      }
      lobby.slots[kickSeat] = null;
      broadcastLobbyTo(code, hostToken);
      break;
    }

    case 'leave': {
      getLobbyConns(code).delete(seat);
      const lobby = getLobby(code);
      if (lobby) {
        lobby.slots[seat] = null;
        broadcastLobbyTo(code, hostToken);
      }
      _ws.close();
      break;
    }

    default:
      break;
  }
}

function handleGameMessage(_ws: WebSocket, room: GameRoom, seat: Seat, msg: ClientMsg): void {
  switch (msg.t) {
    case 'action':
      room.handleAction(seat, msg.action);
      return;
    case 'nextRound':
      // Host is always seat 0 (see startGame).
      if (seat !== 0) {
        send(_ws, {
          t: 'error',
          code: 'not_host',
          message: 'Only the host can start the next round.',
        });
        return;
      }
      room.nextRound();
      return;
    case 'endMatch':
      if (seat !== 0) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can end the match.' });
        return;
      }
      room.endMatch();
      return;
    case 'setBotSpeed': {
      if (seat !== 0) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can set the bot pace.' });
        return;
      }
      // Narrowed like every other value off the wire — `botSpeedFrom` takes the
      // whole message shape, so hand it the field under the name it expects.
      const paced = room.setBotSpeed(botSpeedFrom({ botSpeed: msg.botSpeed }));
      if (!paced) {
        send(_ws, { t: 'error', code: 'no_bots', message: 'No bots at this table.' });
      }
      return;
    }
    default:
      return;
  }
}
