# TODO

## 🔍 Audit backlog (2026-07-11)

Full-repo audit (engine, server, client, cross-cutting). All items below were
verified against current code with file:line references. Ordered by priority.
IDs are stable so we can tackle them one at a time.

**Status:** all audit items resolved on 2026-07-11 (A1–A19 + A6b + A20) — lint clean,
all typechecks pass, 193 unit/integration + 5 Playwright e2e green, merged to main.
A17 re-verified against Bun 1.3.14: Bun has no `node:sqlite`, and the lazy-load fix lets
the compiled binary boot + serve (logs "persistence disabled") instead of crashing.
A20 (that run surfaced the binary serving no UI) is fixed: the Bun binary now embeds and
serves the client SPA. No open items.

### P0 — quick win / unblocks everything else

- [x] **A1 · Adopt Biome so `pnpm lint` passes locally + enforce it in CI.** DONE
  (2026-07-11). Turned out to be far more than CRLF: 557 lint errors. `.gitattributes`
  now pins `eol=lf`; `biome.json` disables `noNonNullAssertion` (justified by
  `noUncheckedIndexedAccess`) + `noArrayIndexKey`, sets single-quote/as-needed-arrow
  formatting to match the codebase, and relaxes `noExplicitAny` in tests; ran
  `biome check --write [--unsafe]`; restored `autoFocus` that `--unsafe` stripped;
  added `type="button"` to 36 buttons; fixed a param-reassign in rng.ts. CI lint is
  now blocking. Verified: lint clean, typecheck clean, 179 tests pass, client builds.
  `.gitattributes` is `* text=auto` (no `eol=lf`) and this machine has
  `core.autocrlf=true`, so files check out CRLF on Windows and Biome (emits LF)
  flags all 84 files (~900 diagnostics). CI hides it with `pnpm lint || true`
  (`.github/workflows/ci.yml:29`). Fix: set `.gitattributes` → `* text=auto eol=lf`,
  run `git add --renormalize .`, commit, then drop the `|| true` in CI. Do this
  first — otherwise every later commit fights the formatter.

### P1 — HIGH (crash / rule integrity / distribution)

- [x] **A2 · Malformed WS frame crashes the entire server.** DONE — `room.handleAction`
  now validates the frame is an object with a string `t` before touching it, and
  `applyAndPropagate` wraps `applyAction` in try/catch; `main.ts` adds
  `uncaughtException`/`unhandledRejection` backstops. Regression test in server.test.ts. `ws.ts:291` →
  `room.ts:216` (`'seat' in action` throws `TypeError` when `action` is `null`);
  and an unknown `action.t` makes the engine return `undefined` (see A3) so
  `room.ts:225` `!result.ok` throws. No try/catch around the socket `message`
  handler and no `uncaughtException` guard in `main.ts` → the process exits,
  killing every in-progress game. Reachable by anyone who opens a game socket.
  Fix: validate action shape + wrap `applyAndPropagate` in try/catch (+ A3).
- [x] **A3 · `applyAction` can return `undefined`.** DONE — added a `default` case in
  `dispatchAction` returning `internal_error`. Regression test in phase1.test.ts. `dispatchAction`
  (`engine/src/actions.ts:1246`) has no `default` case; an unknown `action.t`
  falls through and the `try/catch` in `applyAction` only catches throws. The
  documented contract is "always returns an ActionResult." Fix: add
  `default: return fail('internal_error')`. (Root of A2's second path.)
- [x] **A4 · Any player can force-close the claim window.** DONE — `handleAction` now
  whitelists client-issuable action types (`CLIENT_ACTION_TYPES`); `claimWindowExpire`
  and `draw` are server-only. Regression test in server.test.ts. `claimWindowExpire`
  carries no `seat`, so `handleAction`'s only guard (`'seat' in action`,
  `room.ts:216`) passes it straight through, and `applyClaimWindowExpire`
  (`actions.ts:978`) never checks the deadline. A player can instantly force-pass
  every opponent — locking out their Hu/pung/kong and even stamping them furiten.
  Fix: whitelist client-originatable action types; make the server timer the only
  source of `claimWindowExpire`.
- [x] **A5 · Stale socket close deposes a live reconnection.** DONE — `disconnect(seat, ws?)`
  no-ops when the seat has been rebound to a different socket; the game close handler
  passes its socket. Regression test in server.test.ts. `bindGameSocket`
  (`ws.ts:26`) does `close → room.disconnect(seat)` with no check that the closing
  socket is still current, and `disconnect` (`room.ts:183`) deletes
  unconditionally. When a half-dead phone reconnects (new socket) and the old
  socket's TCP close fires later, it evicts the *new* socket → frozen board →
  wrongful bot takeover after 60s. The lobby close handler already has the right
  guard (`ws.ts:71`). Fix: pass the socket into `disconnect`; no-op unless
  `connections.get(seat) === ws`.
- [x] **A6 · The npm package ships no client UI.** DONE — `http.ts` now resolves the
  client from `dist/client` (bundled) first, falling back to the monorepo
  `../../client/dist`; `packages/server/scripts/bundle-client.mjs` copies the client
  build in, wired into a `prepack` (`build client → tsc → bundle`). Verified: the built
  server serves the SPA at `/` from the bundled dir. NOTE: surfaced A6b below.
- [x] **A6b · (NEW, HIGH) The published npm package is uninstallable — engine is a
  private workspace dep.** DONE via option (a) — `scripts/bundle-server.mjs` runs esbuild
  to inline the zero-dep engine into a single self-contained `dist/main.js` (real npm deps
  fastify/@fastify/*/multicast-dns/qrcode-terminal stay external); the engine moved from
  `dependencies` to `devDependencies` so consumers never fetch the private package, and it
  is bundled in anyway. `prepack` runs the full pipeline; `files` ships only
  `dist/main.js` + `dist/client`. Verified with `pnpm pack`: tarball has no engine in
  `dependencies`, and the bundled binary boots + creates a lobby (engine path) + serves
  the client. `build` stays `tsc` for dev/e2e (engine via workspace symlink). `packages/server/package.json`
  has `files: ["dist"]` (server only), but `http.ts:12` serves
  `../../client/dist`, which doesn't exist in an npm install → `existsSync` is
  false → `npx sichuan-mahjong` runs an API/WS-only server with no UI. No step
  bundles the client into the server package. Fix: prepublish build+copy of the
  client dist into the server package, add it to `files`, and point `CLIENT_DIST`
  at the bundled location.

### P2 — MEDIUM (correctness / resume / privilege)

- [x] **A7 · Furiten bypass via pung → `declareHuOnDraw`.** DONE — added a `drewThisTurn`
  flag to GameState (set on wall draw / kong replacement / dealer's turn-1; cleared on
  a pung claim); `applyDeclareHuOnDraw` now rejects with `must_draw_first` unless the
  player drew. Regression test in phase3.test.ts (pung then Hu-on-draw is rejected). After a pung claim
  (`actions.ts:641`) turn = winner and `turnDrawNeeded = false`;
  `applyDeclareHuOnDraw` (`actions.ts:1146`) doesn't require the player actually
  drew this turn. A furiten player (barred from Hu-on-discard) can pung their
  winning tile then immediately declare a self-draw-style Hu — bypassing furiten,
  collecting the +1 self-draw bonus, and mislabeling the win. Fix: reject
  `declareHuOnDraw` unless the player drew (or just claimed a kong replacement)
  this turn.
- [x] **A8 · Host join clobbers an occupied seat 0; displaced player keeps host
  powers.** DONE — seat 0 is now reserved for the host: `findOpenSeat(lobby,
  { skipHostSeat: true })` places non-host joiners in seats 1–3, so a friend can never
  occupy the host seat. Regression test in server.test.ts. `ws.ts:165` (`if (isHost) assignedSeat = 0`) never checks whether a
  friend already took seat 0 (join links work the moment the lobby is created).
  The host overwrites the slot; the friend's token still resolves to seat 0 /
  host and is never revoked, so they can reconnect as host — evict the host,
  see the host's hand, call `nextRound`/`endMatch`. Fix: relocate/reject on
  conflict and revoke the displaced token.
- [x] **A9 · Reconnect at round end duplicates the SQLite row + re-broadcasts.** DONE —
  `roundEndBroadcast` flag (reset in `nextRound`) makes the persist + broadcast fire
  once per round; a client reconnecting at round end is handed the results directly
  without re-persisting. Regression test asserts a single `saveGameWithCode` call.
  `scheduleNext` (`room.ts:349`) calls `broadcastRoundEnd` unconditionally in the
  roundEnd phase; `connect()` (`room.ts:168`) calls `scheduleNext` on every
  reconnect; `broadcastRoundEnd` (`room.ts:470`) does an unconditional
  `saveGameWithCode` INSERT. Each reconnect (or a post-round disconnect timer)
  inserts a duplicate `games` row and re-sends `roundEnd`. Fix: a
  `roundEndBroadcast` guard reset in `nextRound`, or persist at the transition
  site.
- [x] **A10 · Restore mid-claim / mid-huan mishandles humans.** DONE — `resumeAfterRestore`
  rebases a persisted claim window's absolute deadline to a fresh window; huan/void/claim
  bot-fill now skips seats within their reconnect grace (`isInReconnectGrace`, keyed on an
  armed takeover timer — so a never-connected seat still gets bot-driven and can't stall).
  Two regression tests (deadline rebase; huan grace → takeover).
  `resumeAfterRestore` (`room.ts:293`) calls `scheduleNext` whenever
  `pendingClaims !== null`; the deadline is an absolute `Date.now()` timestamp, so
  after a restart it's already expired → window force-passes before anyone
  reconnects (+ furiten). Separately, huan/void/claim bot-fill keys off
  `isBotOrOffline` (mere disconnection), so seconds after boot bots pick huan
  tiles, declare the round-permanent void suit, and make claim decisions for
  humans who haven't reconnected — the `isAwaitingHuman` freeze only covers the
  play-phase turn owner (same gap hits a brief live drop during huan/void). Fix:
  re-base the claim deadline on restore; extend the awaiting-human freeze to
  huan/void/claim.
- [x] **A11 · `endMatch` doesn't quiesce the room — zombie resurrects its deleted
  snapshot.** DONE — an `ended` flag is set on `endMatch`; it closes+clears all sockets
  and now gates `handleAction`, `connect`, `disconnect`, `schedulePersist`, and
  `persistNow`, so no late action/close can re-arm a timer or re-persist. Regression test. `endMatch` (`room.ts:110`) clears timers and `deleteRoom` but never
  closes/clears connections or sets an "ended" flag. A still-bound socket sending
  an action (or closing → fresh 60s takeover → bot drives) re-arms
  `schedulePersist` → `saveLiveRoom` re-inserts the just-deleted `live_rooms` row;
  next boot restores a token-less, unjoinable zombie room. Fix: set an ended flag,
  close+clear sockets, gate `handleAction`/`disconnect`/persist on it.
- [x] **A12 · mDNS + QR code are dead in production.** DONE — `networking.ts` and `cli.ts`
  now use `createRequire(import.meta.url)` for the CJS-only optional deps; `startMdns`
  returns whether it started, and the banner prints the `mahjong.local` URL only when it
  did. Verified by running the server: the mDNS line and the QR code both render now. `networking.ts:42`
  (`require('multicast-dns')`) and `cli.ts:110` (`require('qrcode-terminal')`) run
  in an ESM build (`"type":"module"`, NodeNext) where `require` is undefined →
  `ReferenceError` swallowed by the surrounding try/catch → silent no-op, while
  the banner still advertises `http://mahjong.local:<port>`. Fix:
  `createRequire(import.meta.url)` or dynamic `import()`; don't print the mDNS URL
  when mDNS didn't start.

### P3 — LOW (polish / hardening / verify)

- [x] **A13 · Bots never pung.** DONE — `shouldPung` now counts only chow-window
  neighbors (rank distance 1–2), excluding the pung pair itself, so the ≥2 test is
  meaningful. Smoke test now asserts exposed pungs form across 100 bot games. `bot.ts:170` adjacency test
  `Math.abs(ti.rank - rank) <= 1` includes distance 0, so the ≥2 hand copies that
  make a pung legal always push `adjCount ≥ 2` → `adjCount < 2` is never true.
  Both easy and medium bots always pass on pung. Fix: exclude same-type tiles
  (require distance exactly 1–2).
- [x] **A14 · `join` name is unvalidated.** DONE — the join handler now coerces
  `msg.name` to a trimmed string, falls back to `Player N` when empty/non-string, and
  clamps to 24 chars. Regression test. `ws.ts:179` stores `msg.name` as-is
  (any type, any length) → broadcast to all, fed into `createGame`, persisted in
  every snapshot. Clamp to a string ≤ ~32 chars.
- [x] **A15 · Claimed discard tile stays in the discarder's discard pile.** DONE —
  `takeClaimedDiscard` removes the claimed tile from the discarder's pond when a pung or
  exposed kong forms, so it renders only in the claimer's meld. Assertion added to the
  A7 pung test.
  `applyPungClaim`/`applyKongClaim` (`actions.ts:641/596`) don't splice the
  claimed tile out of `players[from].discards`, so it renders both in the discard
  row and in the claimer's meld. Cosmetic (no rule depends on it). Fix: remove the
  claimed tile from the discarder's discards on claim.
- [x] **A16 · Furiten override uses the first-skipped value, not the max.** DONE —
  `applyFuritenAndCloseWindow` now raises `minFanToOverride` to the max of the existing
  and newly-skipped value (keeping `since`); `furitenSeatsAfterWindow` no longer excludes
  already-furiten seats. Matches the PDF's block-erring intent (ARCHITECTURE note synced).
  Regression test: skip 1-fan then 2/3-fan → threshold rises.
  `furitenSeatsAfterWindow` (`claims.ts:176`) skips already-furiten seats, so
  `minFanToOverride` (`actions.ts:399`) never rises when a larger Hu is later
  skipped. §5.5.5 intent is arguably the max skipped value. Verify against the PDF;
  low.
- [x] **A17 · Verify the Bun-compiled binary actually boots.** DONE + VERIFIED against
  Bun 1.3.14 (2026-07-11). `node:sqlite` loads lazily via `createRequire` (type-only static
  import). Compiled `bun build ... --compile --target=bun-windows-x64` and ran the .exe:
  Bun has **no** `node:sqlite`, so the old static import would have crashed boot; the lazy
  fix logs `[persistence] node:sqlite unavailable — persistence disabled` and the binary
  boots + serves (healthz ok, lobby created). Persistence is off in the binary (no
  games.db) — graceful degradation, as intended.
- [x] **A20 · The Bun-compiled binary serves no client UI.** DONE + VERIFIED (2026-07-11)
  — the standalone binary now embeds and serves the client SPA. `scripts/release/gen-embedded-client.mjs`
  turns `packages/client/dist` into `src/generated/embedded-client.ts` (URL → base64 body);
  a Bun-only entry `src/binary.ts` imports it and hands it to the server; `http.ts` serves
  from the embedded map (SPA fallback to index.html) or, when absent, from disk (npm path).
  Startup was extracted to `server.ts` so the thin `main.ts` (Node/npm) and `binary.ts`
  (Bun) each call `run()` once — no double-start. `compile.ts` generates the embed and
  compiles `binary.ts`. Verified: compiled a Windows binary and confirmed `GET /` (200 HTML),
  JS/CSS/tile assets, and SPA deep-links all serve from the embedded map; npm bundle still
  serves the disk client; e2e 5/5 + unit 193 green. (Persistence remains off in the binary
  per A17 — a Bun/`node:sqlite` limit, unrelated to the UI.)
- [x] **A18 · i18n catalogs have no completeness check.** DONE — exported `catalog` and
  added `catalog.test.ts` asserting zh-Hans/zh-Hant define exactly English's keys (base +
  help strings); currently all match. Added the client package to the CI test step so this
  actually runs in CI (it was previously engine + server only). `Dict = Record<string,
  string>` (`i18n/index.ts:14`) means a missing translation silently falls back to
  English. All three catalogs currently match (98 keys each), but drift won't be
  caught. Optional: type `Dict` against a keyed union.

### Test coverage gaps (worth backfilling alongside the fixes)

- [x] **A19 · Adversarial WS tests.** DONE (unit/integration) — added regression tests
  alongside each fix: malformed-frame/action + claimWindowExpire whitelist (A2/A4),
  two-sockets-one-seat (A5), join-before-host (A8), reconnect-at-roundEnd single-persist
  (A9), restore deadline-rebase + huan-grace (A10), endMatch quiescence (A11), name clamp
  (A14), engine tests for A3/A7/A15/A16, bot-pung smoke assertion (A13), i18n parity (A18).
  Full Playwright suite (happy path + 2-round match) re-run green after all server changes.
  Also added `e2e/ui-clicks.spec.ts` (2026-07-11): plays the opening through **real UI
  clicks** — huan tile taps, void suit button, and the tap-to-select/tap-to-discard
  gesture — the interaction layer the other specs bypass via `window.__e2e`. This closes
  the raw-UI-click gap. Test totals: engine 149, server 42, client 2, e2e 5.
  _Optional remaining:_ browser-level specs for reconnect / spectator / i18n flows
  (covered at the integration layer today).

---


Current status: **All phases complete** — engine, server, client, bots, persistence, networking, and polish are all done. Remaining work is the intentional v1 deferrals tracked in [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

---

## Phase 1 — Engine: basic round (no claims, no Hu) ✅

- [x] `engine/src/state.ts` — `GameState`, `PlayerState`, `GameConfig`, `DEFAULT_CONFIG`, factory functions
- [x] `engine/src/actions.ts` — `GameAction` union, `applyAction` skeleton, `ActionResult` type
- [x] `engine/src/views.ts` — `projectView(state, seat): PlayerView`
- [x] Deal logic: 13 tiles per player, East gets 14th immediately
- [x] Huan San Zhang phase (`huanSelect` action, cw/ccw/random rotation from seed)
- [x] Void declaration phase (`declareVoid` action, atomic reveal, first-discard removal)
- [x] Play loop: East turn-1 no-draw (discard only + concealed kong), all others draw → discard
- [x] Strict void enforcement: reject non-void-suit discard while hand contains void tiles
- [x] Lenient void enforcement: 48-point penalty at wall end; all-void-discards carve-out
- [x] Wall exhaustion → round end (simplified, no scoring yet)
- [x] Export all new symbols from `engine/src/index.ts`
- [x] Tests: deterministic seeded game runs to wall exhaustion under both void modes

## Phase 2 — Engine: Hu detection ✅

- [x] `engine/src/hand.ts`
  - [x] `isWinningHand(tiles, melds, voidedSuit): WinShape | null` — standard 4-sets+pair and 7-pairs
  - [x] `findAllWinningArrangements` (used internally by scoring)
  - [x] `isTenpai(tiles, melds, voidedSuit): TileType[]` — exhaustive-wait filter applied
  - [x] `ukeire(tiles, melds, voidedSuit, visibleTiles): Map<TileType, number>`
- [x] `declareHuOnDraw` action wired in; engine derives subtype from context
- [x] `declareHeavenly` action (East turn-1 pre-discard, `usedIndicator` required)
- [x] Single-winner round end with 1-base-point simplified scoring
- [x] Property tests: constructive 4-sets+pair recognized; random 14-tile hands mostly not; tenpai hands have ≥1 completion

## Phase 3 — Engine: claims ✅

- [x] `engine/src/claims.ts` — `ClaimWindow`, `ClaimDecision`, claim resolution logic
- [x] Pung claim off discard (counter-clockwise tiebreak)
- [x] Exposed kong claim off discard
- [x] Concealed / promoted / postponed kong on own turn (§5.5.6)
- [x] Hu claim off discard; multiple simultaneous Hu winners on same discard
- [x] Claim window timer logic (`claimWindowMs`, early-close when all passed)
- [x] Priority resolution: Hu > Kong > Pung
- [x] `claimWindowExpire` action
- [x] Robbing-the-kong window for promoted and postponed kongs (§5.5.7)
- [x] Kong restrictions: no kong if replacement exhausted; pung-then-kong blocked
- [x] Furiten / skip-Hu state (`PlayerState.furiten`); cleared on next self-draw
- [x] Wall-end edge cases: last live-end tile — only Hu/discard; resulting discard only Hu/Pung; pung-chain

## Phase 4 — Engine: bloody-to-end + full scoring ✅

- [x] `engine/src/scoring.ts`
  - [x] All 10 fan combinations from §5.8 (`calcHandScore`)
  - [x] Compatibility matrix (PDF Table 9) encoded and enforced (`COMPATIBILITY`)
  - [x] `calcHandScore()` — validates compatibility, sums fan (with fanValue per type), caps at `fanCap`
  - [x] Heavenly/Earthly auto-cap when `enableHeavenlyEarthly`
  - [x] Self-draw bonus (+1 per non-Hu from each, not a fan) — in `applyDeclareHuOnDraw`
  - [x] Theoretical max hand value (TMV) calc for wall-end payouts (`calcTMV`)
- [x] Bloody-to-end: `status: 'hu'` sit-out; turn skips Hu players; round continues to 3-Hu or wall end
- [x] Multi-winner same-discard: each paid independently by discarder; turn-passing rule (PDF p.22)
- [x] Kong payments: concealed (2 from each non-Hu), exposed (2 from discarder), promoted (1 from each non-Hu), postponed (0)
- [x] Three kong refund paths: robbed (immediate reversal), shoot-after-kong (most-recent group), wall-end blanket (non-Hu non-ready declarers)
- [x] Void-suit-at-end penalty (lenient mode, 48-point pure deduction, `penaltyPot`)
- [x] Bu-ting (non-ready) wall-end payouts: non-ready non-Hu pays each ready non-Hu their TMV
- [x] Dealer rotation between rounds (§5.10) — `state.nextDealer`
- [x] `GameEvent` delta log: `huPayment`, `kongPayment`, `kongRefund`, `buTingPayout`, `voidPenalty`
- [x] Property tests: payment-matrix balance (`sum(scoreDelta) + penaltyPot = 0`); compatibility matrix; tile conservation
- [x] Set-with-void-suit penalty (48-point) — fires on pung/kong/concealed-kong of voided suit; `voidMeldPenalty` event
- [x] False-Hu penalty — 8 pts/opponent (redistributive) + kong refund; fires on invalid draw-Hu or claim-window Hu
- [x] Replay-test corpus: canned games per fan combination + penalty path

## Phase 5 — Server ✅

- [x] `server/src/http.ts` — Fastify routes: `POST /api/lobby`, `GET /api/lobby/:code`, `GET /api/replay/:id`, `GET /healthz`, `GET /j/:code`
- [x] `server/src/ws.ts` — WebSocket gateway on `/ws/:code?token=…`; token validation; seat binding
- [x] `server/src/tokens.ts` — host token + player token issuance and validation
- [x] `server/src/lobby.ts` — lobby create/join, seat management, `canStart` logic
- [x] `server/src/room.ts` — `GameRoom` owns `GameState`; broadcasts `PlayerView` after each action; routes `ClientMsg` to `applyAction`
- [x] Lobby code generator (4-char, alphabet excludes I/O/0/1)
- [x] 60s reconnect window: hold seat on disconnect, bot takeover after timeout (minimal placeholder bot; Phase 7 adds full heuristic)
- [x] Integration tests: fake WS clients cover join → start → round (8 tests, 265ms)

## Phase 6 — Client v0 ✅

- [x] Vite 8 + React 18 + Tailwind v4 (@tailwindcss/vite) + Zustand setup
- [x] `client/src/ws/client.ts` — WsClient with exponential-backoff reconnect (500ms→10s); "Reconnecting…" toast
- [x] `client/src/store/index.ts` — Zustand store mirroring latest PlayerView + lobby state
- [x] Screens:
  - [x] Landing — Host / Join buttons; pre-fills code from `/j/CODE` URL param
  - [x] HostSetup — creates lobby via POST /api/lobby, shows shareable URL, seat list, Start button
  - [x] JoinForm — code input (auto-uppercase) + name input; pre-fill from store
  - [x] Lobby (joiner view) — waiting state, player list with connection indicator
  - [x] Game — huan phase tile picker; void declare suit picker; play phase with top/side/center layout, hand + melds, discard pool, furiten badge, score deltas, turn indicator, wall count; Kong/Hu/Heavenly buttons
  - [x] RoundEnd — score ranking table, Hu badges, Back to Lobby button
- [x] `<Tile>` component — renders Unicode mahjong glyphs (🀇–🀡); `<TileBack>` for hidden tiles
- [x] Tile interaction: tap to select, tap selected tile again to discard
- [x] Claim panel: Pung / Kong / Hu / Pass buttons + countdown bar; fixed bottom overlay
- [x] `yourLegalActions` drives all button enable/disable — no client-side rule logic
- [x] Client builds successfully (166 kB JS gzip: 52 kB, 22 kB CSS gzip: 5 kB)
- [x] Long-press 2× tile preview — `useLongPress` hook, 2× size modal
- [x] `/about` screen — CC-BY-SA tile attribution, rules reference, MIT license notice
- [x] SVG tile assets from Wikimedia Commons — 27 face SVGs + custom back, served from `/tiles/`

## Phase 7 — Bots ✅

- [x] `server/src/bot.ts` — easy bot driver (subscribes to `PlayerView`, emits `GameAction`)
  - [x] Huan selection: suit with fewest tiles (that has ≥3)
  - [x] Void declaration: suit with fewest tiles; `firstDiscard` or indicator
  - [x] Void-clearing discard: prefers void-suit tiles in strict mode
  - [x] Normal discard: connectivity-score heuristic (pair/pung +3, adj +2, near +1); tiebreak terminals first, then lower rank
  - [x] Claim: always Hu; always Kong; Pung only if tile has <2 adjacent same-suit tiles in hand; else Pass
  - [x] Concealed kong on turn: always; promoted/postponed kong: always
- [x] Host UI controls: Add bot / Kick bot per seat (lobby phase)
- [x] Single-player practice mode (Landing → Practice button → auto-creates lobby + 3 bots + starts)
- [x] Bot-vs-bot smoke test: 100 full games, no crashes, no rule violations, payment-matrix balance holds

## Phase 8 — Persistence + replay ✅

- [x] `server/src/persistence.ts` — `node:sqlite` (Node 22 built-in) at OS user-data dir; `games` table schema
- [x] Write completed round to DB on `roundEnd` (best-effort; DB errors logged, never crash server)
- [x] `GET /api/replay/:id` serves full action log + results JSON (404 on missing)

## Phase 9 — Networking & distribution ✅

- [x] `server/src/networking.ts`
  - [x] LAN IP detection (skip loopback, link-local, virtual, Tailscale CGNAT range)
  - [x] mDNS broadcast `mahjong.local:8080` via `multicast-dns` (lazy require, silently skips if unavailable)
  - [x] Tailscale detection: `tailscale status --json --self` + `100.64.0.0/10` interface fallback
  - [x] TLS cert via `tailscale cert <hostname>`; HTTPS Fastify instance on `:8443`
- [x] `server/src/cli.ts` — startup banner with LAN / mDNS / Tailscale URLs + QR code (`qrcode-terminal`)
- [x] CLI flags: `--port`, `--https-port`, `--no-mdns`, `--no-tailscale`, `--data-dir`
- [x] npm package `sichuan-mahjong` with `bin` entry point (`dist/main.js`)
- [x] Bun compile pipeline: `scripts/release/compile.ts` (macOS arm64/x64, Linux x64/arm64, Windows x64)
- [x] Tailscale detection unit tests (8 tests, mocked `spawnSync` + interface scan)
- [x] CI: `.github/workflows/ci.yml` — lint → typecheck → test → build → `--help` smoke test

## Phase 10 — Polish ✅

- [x] PWA manifest (`manifest.webmanifest`) + meta tags + offline shell service worker (`sw.js`) — registers only on HTTPS
- [x] Framer Motion animations: tile selection lift (spring), last-discard pop, Hu celebration burst, reconnect toast slide, round-end stagger
- [x] Sound effects (Web Audio API, no assets): tile click, discard, kong, Hu fanfare — opt-in toggle (🔊/🔇 in top bar)
- [x] Reconnection toast UX — reactive via `useStore`, animated slide-in/out
- [x] Score history across rounds — `matchScores` accumulated in store, displayed in RoundEnd
- [x] "How to Play" overlay (`HowToPlay.tsx`) — 8 sections, bottom-sheet animation, accessible from game top bar
- [x] `/about` screen — CC-BY-SA tile attribution, rules reference, MIT license notice
- [x] Long-press tile preview — 2× size modal via `useLongPress` hook
- [x] Medium bot (`botTurnActionMedium`, `botClaimActionMedium`) — ukeire-based discard, defensive pung avoidance when opponent is ready
- [x] Playwright e2e config (`playwright.config.ts`) + `e2e/game.spec.ts` — host + 3 bots full round to round-end, replay 404, healthz

---

## CI pipeline (spans phases)

- [x] GitHub Actions: lint → typecheck → vitest → build → package smoke
- [x] Add Playwright e2e step to CI — installs chromium then runs `pnpm e2e` after build steps

---

## Post-v1 features (former §12 deferrals)

- [x] Flower Pig (花猪) house rule — opt-in `enableFlowerPig`; non-Hu player ending with all 3 suits pays each opponent `2^fanCap`
- [x] Multi-round / "End Match" — server starts next round (dealer = `nextDealer`), host controls
- [x] Reconnection > 60s reclaim — reconnected human reclaims seat at next round
- [x] Spectators — view-only `?spectate=1` connection + hand-hiding projection + read-only board
- [x] i18n — en / 简体 / 繁體 string catalog + toggle (persisted to localStorage)
- [x] Host-shutdown live-state resume — snapshot rooms+tokens to SQLite, rehydrate on boot
- [x] Tailscale node-sharing automation — `--share` auto-creates a device invite via the Tailscale API
