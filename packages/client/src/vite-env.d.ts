/// <reference types="vite/client" />

/** Compile-time flag (see vite.config.ts `define`): true in dev and e2e builds,
 *  false in release builds — gates the window.__e2e Playwright helpers. */
declare const __E2E__: boolean;
