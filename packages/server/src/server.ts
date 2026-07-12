import fastifyWebsocket from '@fastify/websocket';
import Fastify from 'fastify';
import { parseCli, printBanner, printQr } from './cli.js';
import { type EmbeddedClient, registerHttpRoutes } from './http.js';
import {
  getLanIp,
  getServerUrls,
  getTailscaleCert,
  getTailscaleInfo,
  startMdns,
  stopMdns,
} from './networking.js';
import { flushAllRooms, restoreRoomsFromDisk } from './room.js';
import { createTailscaleShare } from './tailscaleShare.js';
import { registerWsRoutes } from './ws.js';

async function buildApp(
  serverOptions: { https?: { key: string; cert: string } } = {},
  embeddedClient?: EmbeddedClient,
): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false, ...serverOptions });
  await app.register(fastifyWebsocket);
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

  // Propagate data-dir override before persistence module initializes
  if (dataDir) process.env.SICHUAN_DATA_DIR = dataDir;

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
  const httpApp = await buildApp({}, embeddedClient);
  await httpApp.listen({ port, host: '0.0.0.0' });

  // HTTPS server (reuses all the same registered routes via a second Fastify instance)
  let httpsStarted = false;
  if (tls) {
    try {
      const httpsApp = await buildApp({ https: { key: tls.key, cert: tls.cert } }, embeddedClient);
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

  printBanner({
    httpPort: port,
    lanIp,
    tailscaleUrl,
    tailscaleHostname: hostname,
    hasTls: httpsStarted,
    mdnsActive,
  });

  if (lanIp) printQr(`http://${lanIp}:${port}`);

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
