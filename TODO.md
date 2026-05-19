# TODO

Current status: **Phase 0 complete** — workspace scaffold, `tiles.ts`, `rng.ts`, and their unit tests are done. Everything below is outstanding.

---

## Phase 1 — Engine: basic round (no claims, no Hu)

- [ ] `engine/src/state.ts` — `GameState`, `PlayerState`, `GameConfig`, `DEFAULT_CONFIG`, factory functions
- [ ] `engine/src/actions.ts` — `GameAction` union, `applyAction` skeleton, `ActionResult` type
- [ ] `engine/src/protocol.ts` — `ClientMsg`, `ServerMsg`, `PlayerView`, `PublicPlayer` types
- [ ] `engine/src/views.ts` — `projectView(state, seat): PlayerView`
- [ ] Deal logic: 13 tiles per player, East gets 14th immediately
- [ ] Huan San Zhang phase (`huanSelect` action, cw/ccw/random rotation from seed)
- [ ] Void declaration phase (`declareVoid` action, atomic reveal, first-discard removal)
- [ ] Play loop: East turn-1 no-draw (discard only + concealed kong), all others draw → discard
- [ ] Strict void enforcement: reject non-void-suit discard while hand contains void tiles
- [ ] Lenient void enforcement: 48-point penalty at wall end; all-void-discards carve-out
- [ ] Wall exhaustion → round end (simplified, no scoring yet)
- [ ] Export all new symbols from `engine/src/index.ts`
- [ ] Tests: deterministic seeded game runs to wall exhaustion under both void modes

## Phase 2 — Engine: Hu detection

- [ ] `engine/src/hand.ts`
  - [ ] `isWinningHand(tiles, melds, voidedSuit): WinShape | null` — standard 4-sets+pair and 7-pairs
  - [ ] `findAllWinningArrangements` (used internally by scoring)
  - [ ] `isTenpai(tiles, melds, voidedSuit): TileType[]` — exhaustive-wait filter applied
  - [ ] `ukeire(tiles, melds, voidedSuit, visibleTiles): Map<TileType, number>`
- [ ] `declareHuOnDraw` action wired in; engine derives subtype from context
- [ ] `declareHeavenly` action (East turn-1 pre-discard, `usedIndicator` required)
- [ ] Single-winner round end with 1-base-point simplified scoring
- [ ] Property tests: constructive 4-sets+pair recognized; random 14-tile hands mostly not; tenpai hands have ≥1 completion

## Phase 3 — Engine: claims

- [ ] `engine/src/claims.ts` — `ClaimWindow`, `ClaimDecision`, claim resolution logic
- [ ] Pung claim off discard (counter-clockwise tiebreak)
- [ ] Exposed kong claim off discard
- [ ] Concealed / promoted / postponed kong on own turn (§5.5.6)
- [ ] Hu claim off discard; multiple simultaneous Hu winners on same discard
- [ ] Claim window timer logic (`claimWindowMs`, early-close when all passed)
- [ ] Priority resolution: Hu > Kong > Pung
- [ ] `claimWindowExpire` action
- [ ] Robbing-the-kong window for promoted and postponed kongs (§5.5.7)
- [ ] Kong restrictions: no kong if replacement exhausted; pung-then-kong blocked
- [ ] Furiten / skip-Hu state (`PlayerState.furiten`); cleared on next self-draw
- [ ] Wall-end edge cases: last live-end tile — only Hu/discard; resulting discard only Hu/Pung; pung-chain

## Phase 4 — Engine: bloody-to-end + full scoring

- [ ] `engine/src/scoring.ts`
  - [ ] All 10 fan combinations from §5.8
  - [ ] Compatibility matrix (PDF Table 9) encoded and enforced
  - [ ] `applyFans()` — validates compatibility, sums fan, caps at `fanCap`
  - [ ] Heavenly/Earthly auto-cap when `enableHeavenlyEarthly`
  - [ ] Self-draw bonus (+1 per non-Hu from each, not a fan)
  - [ ] Theoretical max hand value (TMV) calc for wall-end payouts
- [ ] Bloody-to-end: `status: 'hu'` sit-out; turn skips Hu players; round continues to 3-Hu or wall end
- [ ] Multi-winner same-discard: each paid independently by discarder; turn-passing rule (PDF p.22)
- [ ] Kong payments to already-Hu players; three refund paths (robbed, shoot-after-kong, wall-end blanket)
- [ ] Void-suit-at-end penalty (lenient mode, 48-point pure deduction, `penaltyPot`)
- [ ] Set-with-void-suit penalty (48-point, any mode)
- [ ] False-Hu penalty: flat 8 × remaining non-Hu players (redistributive); kong refunds for offender
- [ ] Bu-ting (non-ready) wall-end payouts: non-ready non-Hu pays each ready non-Hu their TMV
- [ ] Dealer rotation between rounds (§5.10)
- [ ] `GameEvent` delta log emitted by `applyAction`
- [ ] Replay-test corpus: at least one canned game per fan combination + each penalty path
- [ ] Property tests: payment-matrix balance (`sum(scoreDelta) === -sum(penaltyPot)`); compatibility matrix never violated; tile conservation across any action

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
