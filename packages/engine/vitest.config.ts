import { defineConfig } from 'vitest/config';

/**
 * The engine ran on vitest's defaults until mutation testing arrived. (A78)
 *
 * Stryker mutates by copying the whole package into `.stryker-tmp/sandbox-*`
 * and running the suite there, and it leaves that copy behind whenever a run is
 * interrupted or errors. Vitest's default `exclude` covers `node_modules` and
 * `dist` but knows nothing about it, so the next ordinary `pnpm test` collected
 * the sandbox's tests as well and reported **528 tests where there are 264** —
 * green, doubled, and meaningless. Biome had the same problem with the
 * generated tsconfig inside it, and gets the same treatment in `biome.json`.
 *
 * `.gitignore` does not help here: the directory never reaches git, it just has
 * to be invisible to the tools that walk the tree.
 */
export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/.stryker-tmp/**'],
  },
});
