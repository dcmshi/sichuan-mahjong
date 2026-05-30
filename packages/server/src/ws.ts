import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { Seat, ClientMsg, ServerMsg, LobbyPlayer } from '@sichuan-mahjong/engine';
import { getLobby, deleteLobby, findOpenSeat, canStart } from './lobby.js';
import { issueToken, resolveToken } from './tokens.js';
import { getRoom, createRoom, GameRoom } from './room.js';
import type { RoomSlot } from './room.js';

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Parse a raw WS frame into a ClientMsg, or null if malformed. */
function parseClientMsg(raw: Buffer): ClientMsg | null {
  try { return JSON.parse(raw.toString()) as ClientMsg; }
  catch { return null; }
}

/** Bind a socket to in-game message routing for `seat` (used on join, start, and reconnect). */
function bindGameSocket(socket: WebSocket, room: GameRoom, seat: Seat): void {
  socket.removeAllListeners('message');
  socket.on('message', (raw: Buffer) => {
    const m = parseClientMsg(raw);
    if (m) handleGameMessage(socket, room, seat, m);
  });
  socket.on('close', () => room.disconnect(seat));
}

// Active lobby WS connections: code → Map<seat, WebSocket>
const lobbyConnections = new Map<string, Map<Seat, WebSocket>>();

function getLobbyConns(code: string): Map<Seat, WebSocket> {
  let m = lobbyConnections.get(code);
  if (!m) { m = new Map(); lobbyConnections.set(code, m); }
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
function bindLobbySocket(socket: WebSocket, code: string, seat: Seat, isHost: boolean, hostToken: string): void {
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
  app.get<{ Params: { code: string }; Querystring: { token?: string; spectate?: string } }>(
    '/ws/:code',
    { websocket: true },
    (socket, req) => {
      const code = req.params.code.toUpperCase();
      const token = req.query.token ?? '';

      // Read-only spectator: no token, no seat. Just subscribes to spectate views.
      if (req.query.spectate === '1' || req.query.spectate === 'true') {
        const room = getRoom(code);
        if (!room) {
          send(socket, { t: 'error', code: 'no_game', message: 'No game to spectate.' });
          socket.close();
          return;
        }
        room.addSpectator(socket);
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

          // Host always gets seat 0
          let assignedSeat: Seat;
          if (isHost) {
            assignedSeat = 0;
          } else {
            const open = findOpenSeat(lobby);
            if (open === null) {
              send(socket, { t: 'error', code: 'lobby_full', message: 'Lobby is full.' });
              return;
            }
            assignedSeat = open;
          }

          seat = assignedSeat;
          const playerToken = isHost ? token : issueToken(code, seat, 'player');

          lobby.slots[seat] = { name: msg.name, isBot: false, token: playerToken, connected: true };
          getLobbyConns(code).set(seat, socket);

          send(socket, { t: 'joined', seat, token: playerToken });
          broadcastLobbyTo(code, lobby.hostToken);

          // Wire lobby commands + a reconnect-friendly close handler.
          bindLobbySocket(socket, code, seat, isHost, lobby.hostToken);
        }
      });
    },
  );
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

      const room = createRoom(code, slots);

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
      if (!isHost) { send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can add bots.' }); return; }
      const lobby = getLobby(code);
      if (!lobby) return;
      const open = findOpenSeat(lobby);
      if (open === null) { send(_ws, { t: 'error', code: 'lobby_full', message: 'No open seats.' }); return; }
      const difficulty = msg.t === 'addBot' ? msg.difficulty : 'easy';
      const botToken = issueToken(code, open, 'player');
      const label = difficulty === 'medium' ? 'Bot (Hard)' : `Bot ${open + 1}`;
      lobby.slots[open] = { name: label, isBot: true, token: botToken, connected: true, difficulty };
      broadcastLobbyTo(code, hostToken);
      break;
    }

    case 'kickBot': {
      if (!isHost) { send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can kick bots.' }); return; }
      const lobby = getLobby(code);
      if (!lobby) return;
      const kickSeat = msg.seat;
      const slot = lobby.slots[kickSeat];
      if (!slot?.isBot) { send(_ws, { t: 'error', code: 'not_bot', message: 'That seat is not a bot.' }); return; }
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

function handleGameMessage(
  _ws: WebSocket,
  room: GameRoom,
  seat: Seat,
  msg: ClientMsg,
): void {
  switch (msg.t) {
    case 'action':
      room.handleAction(seat, msg.action);
      return;
    case 'nextRound':
      // Host is always seat 0 (see startGame).
      if (seat !== 0) {
        send(_ws, { t: 'error', code: 'not_host', message: 'Only the host can start the next round.' });
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
    default:
      return;
  }
}
