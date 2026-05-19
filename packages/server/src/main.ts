#!/usr/bin/env node
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import https from 'node:https';
import http from 'node:http';
import { registerHttpRoutes } from './http.js';
import { registerWsRoutes } from './ws.js';
import { getLanIp, startMdns, getTailscaleInfo, getTailscaleCert, getServerUrls } from './networking.js';
import { parseCli, printBanner, printQr } from './cli.js';

async function buildApp(serverOptions: { https?: { key: string; cert: string } } = {}): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false, ...serverOptions });
  await app.register(fastifyWebsocket);
  await registerHttpRoutes(app);
  await registerWsRoutes(app);
  return app;
}

async function main(): Promise<void> {
  const opts = parseCli();
  const { port, httpsPort, mdns, tailscale: useTailscale, dataDir } = opts;

  // Propagate data-dir override before persistence module initializes
  if (dataDir) process.env['SICHUAN_DATA_DIR'] = dataDir;

  const lanIp = getLanIp();
  const tailscaleInfo = useTailscale ? getTailscaleInfo() : null;

  // TLS cert (only if Tailscale hostname is a real DNS name, not raw IP)
  const hostname = tailscaleInfo?.hostname ?? null;
  const wantTls = hostname !== null && hostname !== tailscaleInfo?.ip;
  const tls = wantTls && hostname ? getTailscaleCert(hostname) : null;

  // HTTP server
  const httpApp = await buildApp();
  await httpApp.listen({ port, host: '0.0.0.0' });

  // HTTPS server (reuses all the same registered routes via a second Fastify instance)
  let httpsStarted = false;
  if (tls) {
    try {
      const httpsApp = await buildApp({ https: { key: tls.key, cert: tls.cert } });
      await httpsApp.listen({ port: httpsPort, host: '0.0.0.0' });
      httpsStarted = true;
    } catch (err) {
      console.error('[tls] Failed to start HTTPS server:', err);
    }
  }

  // mDNS broadcast
  if (mdns) startMdns(port);

  // Startup banner
  const urls = getServerUrls(port, lanIp, tailscaleInfo, httpsPort);
  const tailscaleUrl = httpsStarted ? urls.tailscale : null;

  printBanner({
    httpPort: port,
    lanIp,
    tailscaleUrl,
    tailscaleHostname: hostname,
    hasTls: httpsStarted,
  });

  if (lanIp) printQr(`http://${lanIp}:${port}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
