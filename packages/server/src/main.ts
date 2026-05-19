import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerHttpRoutes } from './http.js';
import { registerWsRoutes } from './ws.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  await app.register(fastifyWebsocket);
  await registerHttpRoutes(app);
  await registerWsRoutes(app);

  await app.listen({ port: PORT, host: HOST });
  console.log(`Sichuan Mahjong server running on http://${HOST}:${PORT}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
