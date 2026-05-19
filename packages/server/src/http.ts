import type { FastifyInstance } from 'fastify';
import { createLobby, getLobby, canStart, findOpenSeat } from './lobby.js';
import { issueToken, resolveToken } from './tokens.js';
import { createRoom, getRoom } from './room.js';
import type { RoomSlot } from './room.js';

export async function registerHttpRoutes(app: FastifyInstance): Promise<void> {
  // Liveness
  app.get('/healthz', async () => ({ ok: true }));

  // Create lobby
  app.post('/api/lobby', async (_req, reply) => {
    const hostToken = issueToken('__pending__', 0, 'host');
    const lobby = createLobby(hostToken);
    // Update the token with the real code
    const data = resolveToken(hostToken);
    if (data) data.code = lobby.code;

    return reply.code(201).send({ code: lobby.code, hostToken });
  });

  // Pre-join lobby check
  app.get<{ Params: { code: string } }>('/api/lobby/:code', async (req, reply) => {
    const lobby = getLobby(req.params.code.toUpperCase());
    if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });

    const players = lobby.slots.map((s, i) =>
      s ? { seat: i, name: s.name, isBot: s.isBot, connected: s.connected } : null,
    );
    return { exists: true, players, canStart: canStart(lobby) };
  });

  // Replay (Phase 8 — stub)
  app.get<{ Params: { id: string } }>('/api/replay/:id', async (_req, reply) => {
    return reply.code(501).send({ error: 'not_implemented' });
  });

  // Client entry point: redirect to client SPA (client is Phase 6; stub for now)
  app.get<{ Params: { code: string } }>('/j/:code', async (req, reply) => {
    const code = req.params.code.toUpperCase();
    return reply.redirect(`/?code=${code}`);
  });
}

// Called by ws.ts after a lobby is full and host sends startGame
export function startGame(code: string): boolean {
  const lobby = getLobby(code);
  if (!lobby || lobby.started || !canStart(lobby)) return false;
  lobby.started = true;

  const slots: RoomSlot[] = lobby.slots.map(s => ({
    name: s?.name ?? 'Bot',
    isBot: s?.isBot ?? true,
    connected: s?.connected ?? false,
  }));

  createRoom(code, slots);
  return true;
}

export function getOrCreateOpenLobby(_hostToken: string, code: string): ReturnType<typeof getLobby> {
  return getLobby(code);
}
