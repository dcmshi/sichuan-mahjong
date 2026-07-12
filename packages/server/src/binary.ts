// Entry point for the Bun-compiled standalone binaries (scripts/release/compile.ts).
// A standalone binary has no client dir on disk, so we bake the built client SPA in
// via the generated module and hand it to the server. This file is Bun-only: it is
// excluded from the tsc build (tsconfig `exclude`) and imports a generated module
// (src/generated/embedded-client.ts, produced by gen-embedded-client.mjs) that only
// exists at binary-build time. The Node/npm path uses main.ts directly and serves
// the client from disk. (A20)
import { embeddedClient } from './generated/embedded-client.js';
import { run } from './server.js';

run(embeddedClient).catch(err => {
  console.error(err);
  process.exit(1);
});
