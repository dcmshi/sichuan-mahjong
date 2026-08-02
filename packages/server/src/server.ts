import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import { parseCli, printBanner, printHostedBanner, printQr, publicUrl } from './cli.js';
import { type EmbeddedClient, registerHttpRoutes } from './http.js';
import { installLimits, sweepLimiters } from './limits.js';
import {
  getLanIp,
  getServerUrls,
  getTailscaleCert,
  getTailscaleInfo,
  startMdns,
  stopMdns,
} from './networking.js';
import { type RuntimeProfile, profileFor } from './profile.js';
import { flushAllRooms, restoreRoomsFromDisk, setBotPaceMs, sweepIdleRooms } from './room.js';
import { createTailscaleShare } from './tailscaleShare.js';
import { registerWsRoutes, sweepStaleLobbies } from './ws.js';

// Stale-state GC (A29). The TTLs themselves are per-profile now: a day of dead
// rooms is free on your own machine and is not on a shared 512MB instance.
const SWEEP_INTERVAL_MS = 10 * 60_000;

/**
 * Biggest WebSocket frame we will accept. (H1)
 *
 * `ws` defaults to 100 MB, which on a 512 MB instance is an out-of-memory kill of
 * every in-progress game. The frame is buffered *before* the message handler
 * runs, so the validation in `ws.ts` sits downstream of this and cannot help —
 * the size has to be refused by the socket itself. The largest real message is a
 * `join` carrying a name already capped at 24 characters, so 64 KB is ~100× the
 * headroom anything legitimate needs. Over it, `ws` closes with 1009 and the
 * client's existing reconnect path takes over.
 */
const MAX_WS_FRAME_BYTES = 64 * 1024;

async function buildApp(
  profile: RuntimeProfile,
  serverOptions: { https?: { key: string; cert: string } } = {},
  embeddedClient?: EmbeddedClient,
): Promise<ReturnType<typeof Fastify>> {
  // logger stays false deliberately: both the seat token and the spectator watch
  // secret travel in query strings, and a request logger would write every one of
  // them into the platform's log console.
  const app = Fastify({ logger: false, trustProxy: profile.trustProxy, ...serverOptions });
  await app.register(fastifyWebsocket, { options: { maxPayload: MAX_WS_FRAME_BYTES } });
  await registerHttpRoutes(app, embeddedClient);
  await registerWsRoutes(app);
  return app;
}

/**
 * Start the server. `embeddedClient` is passed by the Bun-compiled binary entry
 * (binary.ts), which has the client SPA baked in; the Node/npm entry (main.ts)
 * leaves it undefined and the client is served from disk. This module has no
 * side effects — each thin entry calls run() exactly once, so importing it can
 * never start a second server. (A20)
 */
export async function run(embeddedClient?: EmbeddedClient): Promise<void> {
  const opts = parseCli();
  const { port, httpsPort, mdns, tailscale: useTailscale, share: useShare, dataDir } = opts;
  const profile = profileFor(opts.hosted);
  installLimits(profile);

  // Propagate data-dir override before persistence module initializes
  if (dataDir) process.env.SICHUAN_DATA_DIR = dataDir;

  if (opts.botDelayMs !== null) setBotPaceMs(opts.botDelayMs);

  // Resume any in-progress games persisted before a previous shutdown/crash.
  try {
    const resumed = restoreRoomsFromDisk();
    if (resumed > 0) console.log(`\u{267B}️  Resumed ${resumed} in-progress game(s) from disk.`);
  } catch (err) {
    console.error('[resume] error during restore:', err);
  }

  const lanIp = getLanIp();
  const tailscaleInfo = useTailscale ? getTailscaleInfo() : null;

  // TLS cert (only if Tailscale hostname is a real DNS name, not raw IP)
  const hostname = tailscaleInfo?.hostname ?? null;
  const wantTls = hostname !== null && hostname !== tailscaleInfo?.ip;
  const tls = wantTls && hostname ? getTailscaleCert(hostname) : null;

  // HTTP server
  const httpApp = await buildApp(profile, {}, embeddedClient);
  await httpApp.listen({ port, host: '0.0.0.0' });

  // HTTPS server (reuses all the same registered routes via a second Fastify instance)
  let httpsStarted = false;
  if (tls) {
    try {
      const httpsApp = await buildApp(
        profile,
        { https: { key: tls.key, cert: tls.cert } },
        embeddedClient,
      );
      await httpsApp.listen({ port: httpsPort, host: '0.0.0.0' });
      httpsStarted = true;
    } catch (err) {
      console.error('[tls] Failed to start HTTPS server:', err);
    }
  }

  // mDNS broadcast (startMdns reports whether it actually came up)
  const mdnsActive = mdns ? startMdns(port) : false;

  // Startup banner
  const urls = getServerUrls(port, lanIp, tailscaleInfo, httpsPort);
  const tailscaleUrl = httpsStarted ? urls.tailscale : null;

  if (profile.hosted) {
    printHostedBanner({ httpPort: port, url: publicUrl() });
  } else {
    printBanner({
      httpPort: port,
      lanIp,
      tailscaleUrl,
      tailscaleHostname: hostname,
      hasTls: httpsStarted,
      mdnsActive,
    });

    if (lanIp) printQr(`http://${lanIp}:${port}`);
  }

  // Tailscale node-sharing automation (opt-in via --share).
  if (useShare) {
    if (!tailscaleInfo) {
      console.log('\n   --share: Tailscale not detected — nothing to share.');
    } else {
      const result = await createTailscaleShare({ tailscaleIp: tailscaleInfo.ip });
      if (result.ok) {
        console.log(`\n   🔗 Tailscale share invite (send to friends):\n      ${result.inviteUrl}`);
      } else if (result.reason === 'no_credentials') {
        console.log(
          '\n   --share: set TAILSCALE_API_KEY (and optionally TAILSCALE_TAILNET) to auto-create a share invite.',
        );
        console.log(
          `      Or share manually: https://login.tailscale.com/admin/machines (share "${tailscaleInfo.hostname}")`,
        );
      } else {
        console.log(
          `\n   --share: could not create invite (${result.reason}${result.detail ? `: ${result.detail}` : ''}).`,
        );
        console.log(
          `      Share manually: https://login.tailscale.com/admin/machines (share "${tailscaleInfo.hostname}")`,
        );
      }
    }
  }

  // Periodic stale-state sweep; unref'd so it never holds the process open. (A29)
  setInterval(() => {
    try {
      sweepStaleLobbies(profile.lobbyTtlMs);
      sweepIdleRooms(profile.roomIdleTtlMs);
      // The rate-limit tables are keyed by client address, so they grow with
      // however many addresses have touched us. Expired buckets have to go the
      // same way abandoned lobbies do.
      sweepLimiters();
    } catch (err) {
      console.error('[sweep] error:', err);
    }
  }, SWEEP_INTERVAL_MS).unref();

  // Last-resort backstop (A2): a self-hosted game server should never let one
  // unforeseen throw in a WS handler kill every in-progress game. Log and keep
  // running rather than exit. Input at the WS boundary is validated up-front
  // (room.handleAction) and applyAction never throws, so this should stay quiet.
  process.on('uncaughtException', err => {
    console.error('[fatal] uncaught exception (kept alive):', err);
  });
  process.on('unhandledRejection', reason => {
    console.error('[fatal] unhandled rejection (kept alive):', reason);
  });

  // Graceful shutdown: flush live games to disk so a restart can resume them.
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} received — saving in-progress games…`);
    try {
      flushAllRooms();
    } catch (err) {
      console.error('[shutdown] flush failed:', err);
    }
    try {
      stopMdns();
    } catch {
      /* best-effort: process is exiting anyway */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
