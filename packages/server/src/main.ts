#!/usr/bin/env node
// Node / npm entry point (the package `bin`). Serves the client from disk
// (dist/client for the published package, or the monorepo client dist). The
// Bun standalone binaries use binary.ts instead (client embedded). All the
// real startup logic lives in server.ts so neither entry imports the other. (A20)
import { run } from './server.js';

run().catch(err => {
  console.error(err);
  process.exit(1);
});
