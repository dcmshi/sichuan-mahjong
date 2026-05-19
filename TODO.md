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
- [ ] Set-with-void-suit penalty (48-point) — TODO(rule): meld-containing-void-suit not yet enforced
- [ ] False-Hu penalty — TODO(rule): no false-Hu detection yet
- [ ] Replay-test corpus: canned games per fan combination + penalty path

## Phase 5 — Server

- [ ] `server/src/http.ts` — Fastify routes: `POST /api/lobby`, `GET /api/lobby/:code`, `GET /api/replay/:id`, `GET /healthz`, `GET /j/:code`
- [ ] `server/src/ws.ts` — WebSocket gateway on `/ws/:code?token=…`; token validation; seat binding
- [ ] `server/src/tokens.ts` — host token + player token issuance and validation
- [ ] `server/src/lobby.ts` — lobby create/join, seat management, `canStart` logic
- [ ] `server/src/room.ts` — `GameRoom` owns `GameState`; broadcasts `PlayerView` after each action; routes `ClientMsg` to `applyAction`
- [ ] Lobby code generator (4-char, alphabet excludes I/O/0/1)
- [ ] 60s reconnect window: hold seat on disconnect, bot takeover after timeout
- [ ] Integration tests: fake WS clients cover join → start → round

## Phase 6 — Client v0

- [ ] Vite + React + Tailwind + Zustand setup (scaffold exists, needs real content)
- [ ] `client/src/ws/` — WebSocket client with exponential-backoff reconnect; "reconnecting…" toast
- [ ] `client/src/store/` — Zustand store mirroring latest `PlayerView`
- [ ] Screens:
  - [ ] Landing — Host / Join buttons
  - [ ] HostSetup — share URLs (LAN + Tailscale), QR code, seat list, Add/Remove bot, Start button
  - [ ] JoinForm — code input (auto-uppercase) + name input; pre-fill from `/j/CODE`
  - [ ] Lobby (joiner view) — waiting state, player list, Leave button
  - [ ] Game — full table layout (top/left/right opponents, bottom hand, center discard pool, claim panel, score deltas, phase indicator, furiten badge)
  - [ ] RoundEnd — score breakdown, hand reveals, penalty annotations, Next Round button
- [ ] `<Tile>` component — renders `man-N.svg` / `pin-N.svg` / `sou-N.svg` / `back.svg`
- [ ] Tile interaction: tap to select, tap again / discard zone to discard; long-press 2× preview
- [ ] Claim panel: Pung / Kong / Hu / Pass buttons + countdown bar; big touch targets
- [ ] `yourLegalActions` drives all button enable/disable — no client-side rule logic
- [ ] `/about` page with CC-BY-SA tile attribution from `credits.json`
- [ ] One full game playable in browser with 4 humans on LAN

## Phase 7 — Bots

- [ ] `server/src/bot.ts` — easy bot driver (subscribes to `PlayerView`, emits `GameAction`)
  - [ ] Huan selection: suit with fewest tiles
  - [ ] Void declaration: suit with fewest tiles; `firstDiscard` or indicator
  - [ ] Void-clearing discard: random void-suit tile
  - [ ] Normal discard: most-isolated tile heuristic (no neighbors, not in pair/near-pung); tiebreak terminals first
  - [ ] Claim: always Hu; always Kong; Pung only if it doesn't break a near-complete chow
  - [ ] Concealed kong on turn: always; promoted kong: always when fresh tile completes existing pung
- [ ] Host UI controls: Add bot (easy/medium) / Kick bot per seat
- [ ] Single-player practice auto-fill (3 easy bots)
- [ ] Bot-vs-bot smoke test: 100 full games, no crashes, no mid-game rule violations, payment-matrix balance holds

## Phase 8 — Persistence + replay

- [ ] `server/src/persistence.ts` — `better-sqlite3` at OS user-data dir; `games` table schema
- [ ] Write completed round to DB on `roundEnd`
- [ ] `GET /api/replay/:id` serves action log JSON

## Phase 9 — Networking & distribution

- [ ] `server/src/networking.ts`
  - [ ] Bind `0.0.0.0:8080`; enumerate LAN IPs (skip virtual/link-local)
  - [ ] mDNS broadcast `mahjong.local:8080` via `multicast-dns`
  - [ ] Tailscale detection: `tailscale status --json --self` + `100.64.0.0/10` interface fallback
  - [ ] TLS cert via `tailscale cert <hostname>`; HTTPS listener on `:8443`
- [ ] `server/src/cli.ts` — startup banner with LAN / mDNS / Tailscale URLs + QR code (`qrcode-terminal`)
- [ ] CLI flags: `--port`, `--no-mdns`, `--no-tailscale`, `--data-dir`
- [ ] npm package `sichuan-mahjong` with `bin` entry point
- [ ] Bun compile pipeline: macOS arm64/x64, Linux x64/arm64, Windows x64 → GitHub Releases
- [ ] Tailscale detection unit tests (mocked `tailscale status` output)
- [ ] CI: `npx sichuan-mahjong --help` smoke test; binary launch smoke test

## Phase 10 — Polish

- [ ] PWA manifest + install prompt + offline shell (Tailscale/HTTPS path only)
- [ ] Framer Motion animations: tile draw, discard, claim fly, Hu celebration
- [ ] Sound effects (opt-in toggle): tile click, kong, Hu
- [ ] Reconnection toast UX
- [ ] Score history across rounds (in-memory per match)
- [ ] "How to Play" overlay sourced from CLAUDE.md §5
- [ ] Medium bot: `ukeire`-based discard efficiency, defensive discard after opponent Hu, lenient-mode risk-aware void clearing
- [ ] Playwright e2e: 4-browser-context full round to round-end screen

---

## CI pipeline (spans phases)

- [ ] GitHub Actions: lint (Biome) → typecheck → vitest → build → e2e (Playwright) → package smoke
