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
// Monorepo path first: `tsc` never cleans dist/, so a stale dist/client left by
// an earlier `prepack` would otherwise shadow a freshly built client in dev/e2e
// (bit us in A24 — Playwright got a bundle without the __e2e helpers). In the
// published package the monorepo path doesn't exist, so dist/client still wins.
const CLIENT_DIST_CANDIDATES = [
  path.resolve(__dirname, '../../client/dist'), // packages/client/dist (monorepo)
  path.resolve(__dirname, 'client'), // dist/client (bundled into the published package)
];
const CLIENT_DIST = CLIENT_DIST_CANDIDATES.find(existsSync) ?? CLIENT_DIST_CANDIDATES[0]!;

/** A client SPA embedded in the binary: URL path → { content-type, base64 body }. */
export type EmbeddedAsset = { type: string; body: string };
export type EmbeddedClient = Record<string, EmbeddedAsset>;

export async function registerHttpRoutes(
  app: FastifyInstance,
  embeddedClient?: EmbeddedClient,
): Promise<void> {
  if (embeddedClient && Object.keys(embeddedClient).length > 0) {
    // Serve the client embedded in the compiled (Bun) binary — a standalone
    // binary has no client dir on disk. (A20)
    // Cache policy (A21): hashed /assets/* are content-immutable → cache forever;
    // the SPA shell (index.html, sw.js) must stay fresh so a binary upgrade's new
    // asset bundle loads; everything else (tiles, manifest) gets a modest cache.
    const cacheControlFor = (p: string): string => {
      if (p === '/index.html' || p === '/sw.js') return 'no-cache';
      if (p.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
      return 'public, max-age=86400';
    };
    for (const [urlPath, asset] of Object.entries(embeddedClient)) {
      const buf = Buffer.from(asset.body, 'base64');
      const cacheControl = cacheControlFor(urlPath);
      app.get(urlPath, async (_req, reply) =>
        reply.header('cache-control', cacheControl).type(asset.type).send(buf),
      );
    }
    const index = embeddedClient['/index.html'];
    if (index) {
      const idxBuf = Buffer.from(index.body, 'base64');
      const idxType = index.type;
      // Root + SPA deep-link fallback; kept fresh (no-cache) like the shell.
      app.get('/', async (_req, reply) =>
        reply.header('cache-control', 'no-cache').type(idxType).send(idxBuf),
      );
      app.setNotFoundHandler(async (_req, reply) =>
        reply.header('cache-control', 'no-cache').type(idxType).send(idxBuf),
      );
    }
  } else if (existsSync(CLIENT_DIST)) {
    // Serve client SPA from disk (monorepo dev + npm-packed builds).
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
