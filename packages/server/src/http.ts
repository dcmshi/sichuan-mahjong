import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';
import { allowCreate, allowJoin, atGameCapacity, clientKey } from './limits.js';
import { canStart, createLobby, getLobby } from './lobby.js';
import { getGame } from './persistence.js';
import { registerSecurityHeaders } from './security.js';
import { originFor, robotsTxt, sitemapXml } from './seo.js';
import { issueToken, issueWatchToken, resolveToken } from './tokens.js';

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

/**
 * Whether an unmatched URL is a client *route*, which the SPA fallback should
 * answer with index.html, or a request for something that simply is not here.
 *
 * The fallback used to answer everything, and 200 + HTML for a missing file is a
 * lie that costs twice. A stale bundle reference (`/assets/index-OLD.js`, which
 * is what every client rebuild without a server restart produces) comes back as
 * a parse error somewhere downstream rather than as a 404 naming the file. And a
 * server that never says no cannot pass Google's HTML-file site verification,
 * which fetches a filename it knows is absent and expects to be told so.
 *
 * The client's routes are `/` and `/j/:code`, where a code is `[A-Z2-9]{4}` —
 * none of them contain a dot, so an extension is a reliable tell.
 */
export function isSpaRoute(url: string): boolean {
  const pathname = url.split('?')[0] ?? '';
  if (pathname.startsWith('/api/')) return false;
  return !/\.[a-z0-9]+$/i.test(pathname);
}

export async function registerHttpRoutes(
  app: FastifyInstance,
  embeddedClient?: EmbeddedClient,
): Promise<void> {
  // Before any route, so it covers static assets and the SPA fallback too. (M1)
  registerSecurityHeaders(app);

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
      app.setNotFoundHandler(async (req, reply) => {
        if (!isSpaRoute(req.url)) return reply.code(404).send({ error: 'not_found' });
        return reply.header('cache-control', 'no-cache').type(idxType).send(idxBuf);
      });
    }
  } else if (existsSync(CLIENT_DIST)) {
    // Serve client SPA from disk (monorepo dev + npm-packed builds).
    await app.register(fastifyStatic, { root: CLIENT_DIST, prefix: '/', wildcard: false });
    app.setNotFoundHandler(async (req, reply) => {
      if (!isSpaRoute(req.url)) return reply.code(404).send({ error: 'not_found' });
      return reply.sendFile('index.html');
    });
  }

  // Liveness
  app.get('/healthz', async () => ({ ok: true }));

  // Crawler surface. These are routes rather than files in the client's
  // public/ because both have to name an absolute origin, and this build is
  // the same one whether it is on a LAN address, a tailnet name or a public
  // URL. Registered before the SPA fallback, which would otherwise answer
  // /robots.txt with index.html and a 200.
  app.get('/robots.txt', async (req, reply) =>
    reply
      .header('cache-control', 'public, max-age=86400')
      .type('text/plain; charset=utf-8')
      .send(robotsTxt(originFor(req))),
  );

  app.get('/sitemap.xml', async (req, reply) => {
    const origin = originFor(req);
    if (!origin) return reply.code(404).send({ error: 'no_origin' });
    return reply
      .header('cache-control', 'public, max-age=86400')
      .type('application/xml; charset=utf-8')
      .send(sitemapXml(origin));
  });

  // Create lobby. Unauthenticated by design — there are no accounts — which on
  // a public URL makes it an endpoint that allocates server memory for anyone
  // who asks. Hence both a per-caller budget and a global ceiling.
  app.post('/api/lobby', async (req, reply) => {
    if (!allowCreate(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
    if (atGameCapacity()) {
      return reply.code(503).send({ error: 'at_capacity' });
    }

    const hostToken = issueToken('__pending__', 0, 'host');
    const lobby = createLobby(hostToken);
    // Update the token with the real code
    const data = resolveToken(hostToken);
    if (data) data.code = lobby.code;

    // The watch secret goes to the host and nowhere else. It is never on
    // /api/lobby/:code, which anybody holding a code can read. (C5)
    const watchToken = issueWatchToken(lobby.code);

    return reply.code(201).send({ code: lobby.code, hostToken, watchToken });
  });

  // Pre-join lobby check. Rate-limited because this is the cheapest oracle for
  // "is this code real?" — the enumeration guard that lets the code stay 4 long.
  app.get<{ Params: { code: string } }>('/api/lobby/:code', async (req, reply) => {
    if (!allowJoin(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
    const lobby = getLobby(req.params.code.toUpperCase());
    if (!lobby) return reply.code(404).send({ error: 'lobby_not_found' });

    const players = lobby.slots.map((s, i) =>
      s ? { seat: i, name: s.name, isBot: s.isBot, connected: s.connected } : null,
    );
    return { exists: true, players, canStart: canStart(lobby) };
  });

  // Replay — returns persisted action log for a completed round.
  //
  // **This needs an ownership check before persistence is ever turned back on.**
  // Ids are sequential integers and there is no token here, so with a disk
  // mounted (see design-hosted-server.md C8) walking the integers reads every
  // completed game's action log, seed and room code. It is inert today only
  // because the free tier has no disk and `getGame` short-circuits on a null db
  // — which makes it a landmine rather than a bug. Rate-limited in the meantime
  // so it stops being the one entry point with no budget at all. (M2)
  app.get<{ Params: { id: string } }>('/api/replay/:id', async (req, reply) => {
    if (!allowJoin(clientKey(req))) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
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
