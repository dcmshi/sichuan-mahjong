# TODO

Current status: **Phase 4 complete** — full scoring, payments, and round-end settlement done. Everything below is outstanding.

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
- [ ] False-Hu penalty — TODO(rule): no false-Hu detection yet
- [ ] Replay-test corpus: canned games per fan combination + penalty path

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
