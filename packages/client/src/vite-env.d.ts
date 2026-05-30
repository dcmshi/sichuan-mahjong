/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set at build time to include the Playwright __e2e test helpers. */
  readonly VITE_E2E?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
