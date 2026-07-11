import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { canStart, createLobby, getLobby } from './lobby.js';
import { getGame } from './persistence.js';
import { issueToken, resolveToken } from './tokens.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Where to find the built client SPA. Two layouts must both work:
//   1. npm-published package: `prepack` copies the client build into
//      packages/server/dist/client, which ships via the `files: ["dist"]` field.
//   2. monorepo (dev / CI / e2e): the sibling packages/client/dist.
// The first existing candidate wins. (A6 — without the bundled copy, `npx
// sichuan-mahjong` served an API with no UI.)
const CLIENT_DIST_CANDIDATES = [
  path.resolve(__dirname, 'client'), // dist/client (bundled into the published package)
  path.resolve(__dirname, '../../client/dist'), // packages/client/dist (monorepo)
];
const CLIENT_DIST = CLIENT_DIST_CANDIDATES.find(existsSync) ?? CLIENT_DIST_CANDIDATES[0]!;

export async function registerHttpRoutes(app: FastifyInstance): Promise<void> {
  // Serve client SPA (present in monorepo dev and npm-packed builds)
  if (existsSync(CLIENT_DIST)) {
    await app.register(fastifyStatic, { root: CLIENT_DIST, prefix: '/', wildcard: false });
    app.setNotFoundHandler(async (_req, reply) => reply.sendFile('index.html'));
  }

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

  // Replay — returns persisted action log for a completed round
  app.get<{ Params: { id: string } }>('/api/replay/:id', async (req, reply) => {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return reply.code(400).send({ error: 'invalid_id' });
    const record = getGame(id);
    if (!record) return reply.code(404).send({ error: 'not_found' });
    return reply.send({
      id: record.id,
      code: record.code,
      seed: record.seed,
      config: record.config,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      actionLog: record.actionLog,
      results: record.results,
    });
  });

  // Client entry point: redirect to client SPA (client is Phase 6; stub for now)
  app.get<{ Params: { code: string } }>('/j/:code', async (req, reply) => {
    const code = req.params.code.toUpperCase();
    return reply.redirect(`/?code=${code}`);
  });
}
