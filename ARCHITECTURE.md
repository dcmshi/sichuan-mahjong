# Architecture — Sichuan Mahjong

> Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA. Host runs the server on their own machine; friends connect over LAN or Tailscale. Bots fill empty seats and power a single-player practice mode.

## Status: v2.3 — frontend-audited

Changelog from v2.2 (2026-07-31): client-only audit + fixes (F1–F25 in [docs/history.md](./docs/history.md)). Highlights: server `error` frames now reach the UI instead of being dropped (F1); a refreshed player can rejoin their seat (F2); the match ends on a standings screen rather than a silent bounce to the menu (F9); the service worker actually caches — it precached a dev-only path and so installed nothing in production (F5); reconnects give up instead of looping forever, and no longer replay stale actions (F6/F21); tiles are keyboard- and screen-reader-operable (F16); reduced motion is honored (F12); the claim countdown no longer depends on the client clock (F25).

Changelog from v2.1 (2026-07): full repo audit + fixes (tracked as A1–A20 in [docs/history.md](./docs/history.md)). Highlights: hardened the WS boundary (malformed frames can no longer crash the server; `claimWindowExpire` is server-only); fixed a furiten bypass (pung → self-draw), the furiten override threshold (max-skipped, §5.5.5), host-seat reservation, reconnect/restore grace during huan/void/claim, once-per-round persistence, and `endMatch` teardown; bots now pung; mDNS/QR fixed (ESM `createRequire`); `node:sqlite` loads lazily so it degrades instead of crashing. **Distribution:** the npm package is now self-contained (engine inlined, client bundled) and the Bun binaries embed the client SPA. Biome adopted + enforced in CI.

Changelog from v2: pre-handoff polish. Added `penaltyPot` field to `GameState` schema (referenced by §11.1 property test but missing from §4.3 type definition). Bu-ting payouts clarified to fire only on wall-end finals (vacuous in 3-Hu). Tile SVG license boundary spelled out — CC-BY-SA applies to standalone SVG files only, code remains MIT, no asset inlining.

Changelog from v1: full Novikov PDF audit complete. East's first turn no longer draws; Heavenly/Earthly explicitly framed as a house-rule layer; PDF Table 9 compatibility matrix encoded verbatim; kong-refund logic split into three distinct paths; false-Hu penalty fixed to flat 8 per remaining player (was incorrectly scaled by fanCap); Flower Pig explicitly deferred (not in canonical PDF); kong-as-3 hand-structure note added; payment-matrix property test relaxed to account for non-redistributive penalties.

---

## 1. Goals & non-goals

**v1 ships:**
- 4-player real-time Sichuan mahjong (Bloody Rules / Xuezhan Daodi / 血战到底)
- Host runs a local server on their own machine; no centralized backend
- LAN play out of the box
- Cross-network play via Tailscale (host uses Tailscale node sharing for friends)
- 4-char join code → friends open `<host-url>/j/CODE`, enter a name, join
- Mobile-first PWA (works in any modern browser)
- Heuristic bots fill empty seats; single-player practice = you + 3 bots
- Reconnect within 60s of disconnect
- Replay log persisted per completed round, locally on the host machine

**v1 explicitly does NOT ship:**
- Any cloud-hosted backend, matchmaking service, or persistent infrastructure
- Public-internet hosting via tunneling (Cloudflare/ngrok/etc.) — possible v2
- Accounts, friends lists, persistent rankings
- Tournaments, brackets, scheduled matches
- Voice chat
- Native mobile apps
- Phone-as-host (phones can join, can't host)
- Other mahjong variants

(Spectator mode and the Flower Pig house rule were originally deferred but have since
been added as post-v1 features — see §12.)

---

## 2. Tech stack

**Language:** TypeScript end-to-end, strict mode. Engine types shared client↔server.

**Repo:** pnpm workspaces. Three packages:

| Package | Purpose | Key deps |
| --- | --- | --- |
| `packages/engine` | Pure rules engine. Zero runtime deps. | (none) |
| `packages/server` | HTTP+WS gateway, lobby, bots, persistence, Tailscale detection | `fastify`, `@fastify/static`, `@fastify/websocket`, `multicast-dns`, `qrcode-terminal`; `node:sqlite` (Node built-in); `esbuild` (build-time bundling); `ws` (test client only) |
| `packages/client` | Mobile-first PWA (hand-rolled manifest + `sw.js`) | `react@18`, `vite`, `tailwindcss`, `zustand`, `framer-motion` |

Both server and client import from engine. Protocol message types live in `engine/src/protocol.ts`.

**Runtime:** Node 22 LTS, single process, runs on the host's own machine.
**Tooling:** Biome (lint+format, enforced in CI), Vitest, fast-check (engine property tests), Playwright (e2e: full 3-bot round, 2-round match, and a real-UI-click opening).
**Distribution:** self-contained npm package `sichuan-mahjong` (esbuild inlines the private engine; the built client SPA ships in `dist/client`) invokable via `npx sichuan-mahjong`. Optional precompiled single binaries (Bun compile) per OS for hosts without Node — these embed the client SPA too, but run with persistence disabled (Bun has no `node:sqlite`; see §9/§10.5).

---

## 3. Repo layout

```
sichuan-mahjong/
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── tiles.ts          # tile encoding, wall, seeded shuffle
│   │   │   ├── rng.ts            # xoshiro128** seedable PRNG
│   │   │   ├── dice.ts           # the two throws: seating, and the wall break (§4.3.1)
│   │   │   ├── melds.ts          # Meld types & detection
│   │   │   ├── hand.ts           # win detection (regular + 7 pairs), tenpai (with exhaustive-wait), ukeire
│   │   │   ├── scoring.ts        # fan calculation, compatibility table, payment matrix, TMV calc
│   │   │   ├── claims.ts         # claim window resolution & priority
│   │   │   ├── state.ts          # GameState type + factories
│   │   │   ├── actions.ts        # GameAction union + applyAction
│   │   │   ├── views.ts          # PlayerView projection
│   │   │   ├── protocol.ts       # client↔server message types
│   │   │   └── index.ts
│   │   └── tests/
│   ├── server/
│   │   ├── src/
│   │   │   ├── http.ts           # Fastify routes
│   │   │   ├── ws.ts             # WebSocket gateway
│   │   │   ├── lobby.ts
│   │   │   ├── room.ts           # GameRoom owns GameState
│   │   │   ├── bot.ts
│   │   │   ├── persistence.ts    # SQLite at user data dir
│   │   │   ├── tokens.ts
│   │   │   ├── networking.ts     # IP detection, mDNS, Tailscale detection, TLS provisioning
│   │   │   ├── seo.ts            # robots.txt / sitemap.xml, built from the request's origin
│   │   │   ├── cli.ts            # startup output, QR code
│   │   │   └── main.ts
│   │   └── tests/
│   ├── client/
│   │   ├── public/
│   │   │   └── tiles/            # 27 3D faces + back.svg + credits.json
│   │   ├── src/
│   │   │   ├── components/       # Tile, MeldDisplay, ClaimPanel, EventFeed, PlayHistory, WallDiagram, ErrorToast, ConnectionLost,
│   │   │   │                     #   SettingsMenu (⚙ popover), Die + DiceOverlay (N2), ClaimFlight (N1)
│   │   │   ├── screens/          # Landing, HostSetup, JoinForm, Lobby, Game, RoundEnd, MatchEnd, Spectate, About
│   │   │   ├── store/
│   │   │   ├── ws/
│   │   │   ├── hooks/           # useSound, useAnimation (per-player pace), useDismissable
│   │   │   ├── i18n/            # EN / zh-Hans / zh-Hant string catalogs
│   │   │   ├── session.ts       # seat token in localStorage — survives a refresh
│   │   │   ├── prefs.ts         # per-player display prefs in localStorage (animation pace)
│   │   │   ├── index.css        # Tailwind entry
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── vite.config.ts
├── scripts/
│   ├── icons/                    # PWA PNG generation (no image dependency)
│   ├── screenshots/              # docs/*.png capture — `pnpm shots`, not in `pnpm e2e`
│   ├── tiles/                    # sandbox.html + glyph measurement (measure-glyphs.mjs)
│   └── release/                  # Bun compile per OS
├── pnpm-workspace.yaml
├── biome.json
├── tsconfig.base.json
├── README.md
└── CLAUDE.md
```

---

## 4. Engine — types & API

The engine is pure. `applyAction(state, action) → ActionResult` is the only function that mutates anything.

### 4.1 Tile encoding

```ts
export type Suit = 'man' | 'pin' | 'sou';
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Tile = { suit: Suit; rank: Rank };

export type TileType = number;   // 0..26 = suit * 9 + (rank - 1)
export type TileId   = number;   // 0..107 unique instance (tileType * 4 + copy)

export function tileFromType(t: TileType): Tile;
export function tileToType(t: Tile): TileType;
export function tileTypeOf(id: TileId): TileType;
export function buildWall(seed: string): TileId[];   // shuffled 108
```

### 4.2 Melds

```ts
export type Seat = 0 | 1 | 2 | 3;

export type KongSubtype = 'concealed' | 'exposed' | 'promoted' | 'postponed';
// concealed: 4-of-a-kind in hand, declared on own turn
// exposed:   claimed off discard
// promoted:  declared on own turn using freshly drawn tile, added to existing exposed pung
// postponed: declared on own turn using a tile already in hand from earlier, added to existing exposed pung

export type Meld =
  | { kind: 'pung'; tile: Tile; concealed: boolean; claimedFrom: Seat | null }
  | { kind: 'kong'; tile: Tile; subtype: KongSubtype; claimedFrom: Seat | null; turnDeclared: number }
  | { kind: 'chow'; tiles: [Tile, Tile, Tile] };  // concealed only — Sichuan disallows chow claims

// Note: a kong contributes 3 (not 4) tiles when validating the 3-3-3-3-2 hand structure.
// The 4th tile is structural-extra; this is the only place tile counts and structure counts diverge.
```

### 4.3 State

```ts
export type Phase = 'huan' | 'voidDeclare' | 'play' | 'roundEnd';

export type PlayerState = {
  seat: Seat;
  name: string;
  isBot: boolean;
  hand: TileId[];                   // private, sorted by (suit, rank, id)
  melds: Meld[];                    // public
  discards: TileId[];               // public
  pendingFirstDiscard: TileId | null; // separated void tile, face down until flipped (§5.4)
  voidedSuit: Suit | null;
  usedIndicator: boolean;           // true if had no void-suit tiles at declaration time
  voidCleared: boolean;             // true once all void-suit tiles discarded
  status: 'playing' | 'hu';
  hu: HuRecord | null;
  isReady: boolean;                 // tenpai snapshot; recomputed on hand change
  scoreDelta: number;               // running points this round; NOT strictly zero-sum (see §11.1)
  furiten: { since: number; minFanToOverride: number } | null;  // skip-Hu state, cleared on next self-draw
};

export type GameState = {
  config: GameConfig;
  phase: Phase;
  seed: string;
  dice: DiceRecord;                 // what the two throws decided this round (§4.3.1)
  wall: TileId[];                   // shuffled, then rotated to the break (§4.3.1)
  drawIndex: number;                // pointer; next live-end draw
  kongDrawIndex: number;            // pointer from far end; kong-replacement draws here
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  dealer: Seat;
  turn: Seat;
  turnNumber: number;               // increments on each turn-pass; used in furiten + first-turn checks
  firstTurnDone: [boolean, boolean, boolean, boolean];  // per seat; gates Heavenly/Earthly eligibility
  lastDiscard: { tile: TileId; from: Seat; afterKong: boolean } | null;
  lastDrawWasKongReplacement: boolean;
  lastDrawnTile: TileId | null;     // tile just drawn this turn (for win-after-kong / under-the-sea derivation)
  turnDrawNeeded: boolean;          // true when the current seat still owes a draw before acting
  wallEndReached: boolean;          // live wall exhausted; gates under-the-sea + no-new-kong rules
  anyClaimsHappened: boolean;       // any claim resolved this round; disqualifies Earthly Hand
  pendingClaims: ClaimWindow | null;
  pendingKongTile: {                // an in-flight promoted/postponed kong awaiting its robbing window
    seat: Seat;
    tile: TileId;
    kongSubtype: 'promoted' | 'postponed';
    paidAmounts: Array<{ from: Seat; amount: number }>;
  } | null;
  pendingHuan: (TileId[] | null)[]; // length 4
  pendingVoid: (PendingVoid | null)[];  // length 4; { suit, firstDiscardTile | null }
  penaltyPot: number;               // accumulated non-redistributive penalty deductions (48-point void losses); see §11.1
  kongPaymentLog: KongPaymentEntry[];  // per-kong payment records, for the three refund paths (§5.9)
  nextKongSeq: number;              // monotonic id assigned to each kong payment entry
  huOrder: Seat[];                  // seats in the order they declared Hu; drives dealer rotation (§5.10)
  nextDealer: Seat;                 // computed at round end; consumed by startNextRound
  history: GameAction[];
  startedAt: number;
};

export type GameConfig = {
  enableHuanSanZhang: boolean;       // default FALSE — house rule, not in the PDF; host opt-in
  huanDirection: 'cw' | 'ccw' | 'random';
  enableRobbingKong: boolean;        // default true
  enableHeavenlyEarthly: boolean;    // default true (HOUSE RULE — not in canonical PDF; see §5.8)
  voidDiscardRule: 'strict' | 'lenient';   // default 'strict'; lenient = Novikov canonical
  enableFlowerPig: boolean;          // default false (HOUSE RULE — see §5.9)
  fanCap: number;                    // default 3 → max payment 2^3 = 8 (host preset 3|4, N27)
  claimWindowMs: number;             // default 15000 (lobby preset, N6)
  enableSeatingThrow: boolean;       // default TRUE — everyone throws, highest is East (§4.3.1)
};

export const DEFAULT_CONFIG: GameConfig = {
  enableHuanSanZhang: false,
  huanDirection: 'random',
  enableRobbingKong: true,
  enableHeavenlyEarthly: true,
  voidDiscardRule: 'strict',
  enableFlowerPig: false,
  fanCap: 3,
  claimWindowMs: 15000,
  enableSeatingThrow: true,
};
```

#### 4.3.1 The dice (`dice.ts`)

Two throws, both with two dice, both from `rng.ts` on a stream of its own
(`createRng(`${seed}:dice`)`) so they neither consume from nor perturb the
shuffle. Recorded on `GameState.dice` rather than recomputed, so a restored
snapshot still shows the table what it saw.

```ts
type DiePair    = { a: number; b: number };
type DiceRecord = {
  seating: SeatingRound[] | null;  // null when off, or on any round after the first
  wall: DiePair;                   // East's throw for the break
  wallSeat: Seat;                  // the wall its sum selected
  indent: number;                  // stacks in from that wall's right end (the lower die)
  breakOffset: number;             // what the break actually is: the wall rotation
};
```

**Seating.** Everyone throws; highest sum is East. Ties re-throw among the tied
only; after `MAX_SEATING_ROUNDS` (4) the lowest tied seat takes it, because a
tiebreak against a seeded PRNG that can loop is a hang, not a long wait. Runs
only at match start — `createGame`'s `dealer` parameter is now `Seat | null`,
and `startNextRound` passes the rotated dealer, which skips it.

Not in Novikov: his §"preparatory phase" opens with East already established and
never says how. It is the modern simplified convention and every outside source
seats by dice, so it is on by default rather than an opt-in like 換三張 — the
wall throw he *does* specify is meaningless without an East to throw it.

**The wall break.** East throws; the sum picks whose wall, counted
counterclockwise from East (5/9 → East, 2/6/10 → South, 3/7/11 → West,
4/8/12 → North, i.e. `(sum - 1) % 4` seats along), and the lower die is the
indent in stacks from that wall's right end. This is Novikov's, read as his
three worked examples read it. His prose says "5 or 9 indicate East as the
second player to throw dice", which is probably Chinese Classical's two-thrower
version — but the examples derive both answers from one roll and never mention a
second, so the examples win and the discrepancy is recorded rather than split.

**Counterclockwise is seat-*decreasing*, and `(sum - 1) % 4` seats along means
`dealer - step`** (N22). `nextActiveSeat` advances by `(from + 3) % 4` and the
client seats `seat + 3` to the viewer's right, so the seat to East's right — South
— is `dealer - 1`. This counted `dealer + step`, naming North for the sum the PDF
tabulates as South; West at step 2 was unaffected, which is why the symptom looked
like a diagram quirk. A **wind** is therefore a distance from East and never a seat
index: the client's `windOfSeat(seat, dealer)`, since East rotates each round.

**The break is a rotation.** `rotateWall(buildWall(seed), breakOffset)`, and the
deal proceeds from index 0 as before. A rotation of a uniform shuffle is still
uniform, so this changes no distribution and no fairness — it changes only which
tiles a given seed deals, which is why it landed with the replay corpus in one
go rather than twice.

**Seat `s`'s wall is array quarter `(4 - s) % 4`**, not quarter `s` (N22). The
quarters are consumed in ascending index order, because `drawIndex` only
increments — so for "the next wall opened" to be "the next seat in play order",
which *decreases*, the layout has to run against the seat index. Assigning quarter
`s` to seat `s` made the wall unwind clockwise while play went counterclockwise.
`WallDiagram.wallHead` carries the matching half (`absolute + youSeat`, and
`[2,1,0,3]` in `ringSlot`); a sign error in either puts the break on the wrong
player's wall with every value still in range, which is what
`wall-diagram.test.ts` now asserts against `sideOfSeat` rather than against a copy
of the offset arithmetic.

Pre-N2 snapshots are **refused** on restore, not half-restored: `requiredShape()`
derives its key list from a live `createGame`, so `dice` became required the
moment it existed.

### 4.4 Actions

```ts
export type GameAction =
  | { t: 'huanSelect';        seat: Seat; tiles: [TileId, TileId, TileId] }
  | { t: 'declareVoid';       seat: Seat; suit: Suit; firstDiscard: TileId | null }
  | { t: 'draw';              seat: Seat }                                 // server-issued at turn start
  | { t: 'discard';           seat: Seat; tile: TileId }
  | { t: 'flipFirstDiscard';  seat: Seat }                                 // the mandatory first discard (§5.4)
  | { t: 'claim';             seat: Seat; claim: ClaimDecision }
  | { t: 'pass';              seat: Seat }
  | { t: 'declareKongOnTurn'; seat: Seat; tile: Tile; subtype: 'concealed' | 'promoted' | 'postponed' }
  | { t: 'declareHuOnDraw';   seat: Seat }                                 // engine derives subtype
  | { t: 'declareHeavenly';   seat: Seat }                                 // East turn-1, pre-anything
  | { t: 'claimWindowExpire' };

export type ClaimDecision =
  | { kind: 'pung' }
  | { kind: 'kong' }              // exposed kong only (off discard)
  | { kind: 'hu' };               // engine derives subtype (normal | shootAfterKong | underTheSea | robbingTheKong)

export type ActionResult =
  | { ok: true;  state: GameState; events: GameEvent[] }
  | { ok: false; reason: RuleViolation };

export function applyAction(state: GameState, action: GameAction): ActionResult;
```

The Hu subtype (`heavenly | earthly | winAfterKong | shootAfterKong | underTheSea | robbingTheKong | normal`) is derived from `GameState` context at the moment of declaration, not chosen by the player. Per the PDF compatibility table (§5.8), these subtypes are mutually exclusive.

### 4.5 Views

```ts
export type PublicPlayer = {                    // what every seat may see about a player
  seat: Seat; name: string; isBot: boolean;
  melds: PublicMeld[];                          // concealed kong tile null'd until roundEnd (A27)
  discards: TileId[];
  pendingFirstDiscard: boolean;                 // owes the §5.4 flip — the tile itself stays secret
  firstDiscardIsVoid: boolean;                  // and once flipped, discards[0] IS that tile
  status: 'playing' | 'hu'; hu: HuRecord | null;
  isReady: boolean; scoreDelta: number; handCount: number;
};

export type PlayerView = {
  you: PublicPlayer & {
    hand: TileId[]; voidedSuit: Suit | null; furiten: PlayerState['furiten'];
    pendingFirstDiscardTile: TileId | null;     // your own face-down tile — you chose it
  };
  others: [PublicPlayer, PublicPlayer, PublicPlayer]; // counter-clockwise from you
  wallRemaining: number;
  wallDrawn: { head: number; tail: number };  // the wall's two open ends — see below
  phase: Phase;
  turn: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  yourLegalActions: GameAction[];
  claimDeadline: number | null;
  config: GameConfig;
  dealer: Seat;                     // who the seating throw made East
  dice: DiceRecord;                 // unredacted on purpose — see below
};

export function projectView(state: GameState, seat: Seat): PlayerView;
```

`yourLegalActions` is the engine telling the UI exactly which buttons to enable. The client never duplicates rule logic.

`wallDrawn` says *where* the wall has been eaten into, which the single
`wallRemaining` count cannot: `drawIndex` walks forward from the break and
`kongDrawIndex` starts at the last tile and walks back, so a round with kongs in
it has two gaps rather than one. Public for the same reason the count is —
everyone watches the same wall come apart. The client's `WallDiagram` reads it
together with `dice.breakOffset` to place the head (N14).

`dice` is the one field on this type that carries **no** redaction. Every other addition needed a decision — concealed kongs, drawn tiles, the face-down first discard — because the question is always "would this seat know it at a real table". Dice are thrown face-up in front of four people, so there is nothing here to withhold. `SpectatorView` carries it for the same reason.

---

## 5. Sichuan rules the engine encodes

Canonical source: Vitaly Novikov, *Sichuan Mahjong? It's that simple!* (PDF). Tests reference these section numbers. The UI's "How to Play" reads from this doc verbatim. Where we layer house rules atop the canonical PDF, the section says so explicitly.

### 5.1 Tiles
108 total: man / pin / sou × 1–9 × 4 copies each. No winds, dragons, flowers, jokers.

### 5.2 Setup
1. Wall built from `buildWall(seed)`, then **rotated to the break** the dice chose (§4.3.1). The ceremony is real rather than cosmetic — it is a rotation of a uniform shuffle, so it changes no distribution, only which tiles a seed deals.
2. Dealer for the first round is **whoever rolled highest** in the seating throw (§4.3.1), not the host. `enableSeatingThrow: false` pins it back to seat 0, which is what tests that need a fixed dealer use. After each round, dealer rotates per §5.10.
3. Deal: 13 tiles to each player. Dealer (East) gets a 14th immediately and starts.

### 5.3 Phase: Huan San Zhang (3-tile swap, optional, **default off**)

**Not in Novikov's canonical PDF**, which gives the deal as *prepare wall → each
player chooses a forbidden suit → East's initial turn*, with no swap anywhere in
the text. It is a popular Sichuan house rule (Chengdu-style especially), so it is
offered — but off by default, like `enableFlowerPig`, because the canonical
ruleset is what you get by touching nothing. The host turns it on in the lobby;
the choice travels as `startGame.rules.huanSanZhang` and is narrowed by
`houseRules()` at the WS boundary. Practice mode therefore never shows the huan
phase, which is why `e2e/house-rules.spec.ts` exists — it is the only spec that
reaches the huan picker.

- Each player privately submits 3 tiles of one suit (`huanSelect`).
- A player whose hand cannot form 3-of-one-suit has their swap skipped.
- When all four selections are committed, server applies the rotation: cw / ccw / random per `config.huanDirection`. Random is decided from the game seed.

### 5.4 Phase: Void declaration (定缺 dingque)

Each player simultaneously commits:
- A voided suit (`man | pin | sou`).
- Their first-discard tile of that suit, OR `null` if their hand contains no tiles of that suit (in which case they "use the indicator").

`firstDiscard === null` is only legal when the hand genuinely holds no tile of that
suit — otherwise the frame is rejected with `void_indicator_not_allowed`, since
"using the indicator" while holding the suit would keep a tile that should have
been separated and falsely grant Heavenly/Earthly eligibility (A36).

Server reveals all four atomically. For each player:
- If `firstDiscard !== null`: the tile leaves `hand` and is parked in
  `pendingFirstDiscard` — face down in the center, **not** in `discards`. Hand
  size: 12 (13 for East).
- If `firstDiscard === null`: `usedIndicator = true`. Hand size unchanged (14 for East, 13 for others).

Phase transitions to `play`.

**The separated tile is the player's first discard** (PDF Lesson 4: "the same tile
is the first mandatory discard of the player"). It is *not* a free extra discard:
on that player's first turn they draw as usual and flip this tile via
`flipFirstDiscard` **instead of** discarding from hand — "grab the first tile off
the wall with one hand and flip the tile in the center of the table with the
other". So the standing count is the standard 13 from turn 1 onward, and 14 at
each subsequent draw, which is what `isWinningHand` requires. Consequences:

- Until they flip, `discard` is rejected with `must_flip_first_discard`, and
  `yourLegalActions` offers `flipFirstDiscard` in place of every discard option.
  A concealed/promoted kong is still available first (14 → 11 standing, per the PDF).
- A player who still owes the flip holds one tile fewer than a win needs, so they
  cannot Hu before their first turn — correct, since the tile they still owe is a
  void-suit tile that could never appear in a winning hand.
- The flipped tile opens a normal claim window like any other discard.
- Until the flip, views ship only `pendingFirstDiscard: boolean` to others (the
  owner gets the id in `you.pendingFirstDiscardTile`), and clients draw a tile
  back — same per-viewer redaction as §6.4 (A37).

Before A35 the engine charged the separation *and* a normal turn-1 hand discard,
pinning every player who separated a tile permanently one tile below the 14 a win
needs — only indicator users could ever Hu.

### 5.5 Phase: Play

Turn order: counter-clockwise (East → South → West → North → East).

#### 5.5.1 East's first turn (special)

Per the PDF (Lesson 4, "The initial East's turn"), East has exactly three options on turn 1, **with no draw** — East already has 14 tiles from the deal:

1. **Declare Heavenly Hand** via `declareHeavenly` (only when `enableHeavenlyEarthly` AND `usedIndicator === true` AND `isWinningHand(east.hand, [], east.voidedSuit)` returns truthy). Engine emits Hu with subtype `heavenly`.
2. **Declare a concealed kong** via `declareKongOnTurn` with `subtype: 'concealed'`. After laying out and taking the kong-replacement tile, East faces the same three choices again with 11 standing tiles + 1 fresh tile (so back to 13, then 14, etc., looping until a discard or Hu).
3. **Discard** — which for an East who separated a tile means `flipFirstDiscard`, not a hand discard (§5.4).

If East had void-suit tiles at deal time (`usedIndicator === false`), Heavenly Hand is unavailable since the separated tile already broke East's 14-tile starting hand.

#### 5.5.2 All other turns

For every turn that is not East's turn 1 (this includes East's turn 2+ and every non-dealer's every turn):

1. **Draw** from `wall[drawIndex]` (or `wall[kongDrawIndex]` if previous action was a kong; engine sets `lastDrawWasKongReplacement = true`).
2. **Options** after draw:
   - Declare Hu via `declareHuOnDraw`. Engine derives subtype:
     - `earthly` if non-dealer's first turn AND `usedIndicator === true` AND no claims have happened yet AND hand is winning AND `enableHeavenlyEarthly`.
     - `winAfterKong` if `lastDrawWasKongReplacement === true`.
     - `underTheSea` if this draw came from the live-end's last tile.
     - `normal` otherwise.
   - Declare concealed/promoted/postponed kong (subject to §5.5.6/.8).
   - Discard.

#### 5.5.3 Void-suit discard enforcement (`config.voidDiscardRule`)

- **Strict (default)**: while the player holds any void-suit tile in hand, the engine rejects any non-void-suit discard. Once `voidCleared = true`, normal discard rules apply.
- **Lenient (Novikov canonical)**: the first discard each round must be void-suit (already enforced by §5.4 via `firstDiscard`). After that, the player can discard any tile. If they end the round still holding void-suit tiles, they pay a 48-point penalty (see §5.9), unless every single discard they made was a void-suit tile (carve-out per Novikov).

The engine also rejects claims on void-suit tiles regardless of mode (no rational reason to claim one).

#### 5.5.4 Claim window

Pung, exposed kong, and Hu can be claimed off a discard. **No chow claims.**

Window duration = `config.claimWindowMs` (default 15000ms). Closes early once every eligible player has acted, so the deadline is a backstop rather than a pace: it costs time only when someone is genuinely deciding, and anyone who does not want the tile has a Pass button. It was 3000 until 2026-08-01, then 6000 the same day, then 10000, then 15000 on 2026-08-02 — a claim is three decisions in one window (notice the discard, see that it fits, choose between Hu, Pung and Kong) and you are usually looking at your own hand when it opens. Four moves in one direction is why the value is now a **host preset** rather than a constant: `claimWindow: 'quick' | 'normal' | 'relaxed'` on `startGame.rules`, mapped server-side by `claimWindowMsFrom` to 8000/15000/30000. It is narrowed to an enum because a raw integer here is a denial of service in one frame — a day-long window holds the room until the sweep reaps it, and `0` closes before a human can see it.

Resolution priority: **Hu > Kong > Pung**.
- Multiple Hu claims on the same discard: all honored (see §5.6).
- Pung tiebreak: nearest counter-clockwise from discarder wins.
- The flipped first discard (§5.4) opens a normal claim window — it is a discard like any other.

#### 5.5.5 Skip-Hu / furiten-like rule

Per PDF (page 22): *"if a player skips a discard that could be claimed for 'Hu', then this player is not allowed declare 'Hu' until taking a tile from the wall, but except situation when winning hand has a greater value."*

State: `PlayerState.furiten = { since: turnNumber, minFanToOverride: missedFan }`. Cleared on the player's next self-draw (set to `null`).

This blocks Hu via discard claim when the new winning hand's `totalFan` would be ≤ `minFanToOverride`; the greater-value override fires only when `totalFan` strictly exceeds it. Enforced in `canHuConsideringFuriten` (`claims.ts`) and consumed by both `resolveWindow` and `computeLegalActions`. Self-draw Hu is never blocked.

> Implementation note: `minFanToOverride` records the **maximum** structural fan of any Hu the player skipped since their last self-draw (computed in `applyFuritenAndCloseWindow`; a second, larger skipped Hu raises the bar rather than being ignored — otherwise a player could win on the very hand they just declined). Both the recorded value and the override check (`canHuConsideringFuriten`) score with the `normal` subtype, so situational fans (e.g. Shoot-after-Kong) are excluded *symmetrically* on both sides — the comparison stays apples-to-apples, and any residual approximation errs toward *blocking* a borderline Hu, never toward wrongly allowing one.

#### 5.5.6 Concealed / Promoted / Postponed kong (own turn after draw)

| Subtype | When | Robbable? | Payment (per §5.8) |
| --- | --- | --- | --- |
| Concealed | 4-of-a-kind in hand, declared after draw before discard | No | 2 from each non-Hu |
| Promoted | Drew the 4th tile fresh from wall, add to existing exposed pung | Yes (§5.5.7) | 1 from each non-Hu |
| Postponed | The 4th tile was already in hand from earlier, add to existing exposed pung | Yes (§5.5.7) | 0 |

After any kong, draw a replacement from `kongDrawIndex` (`kongDrawIndex--`). `lastDrawWasKongReplacement = true`.

#### 5.5.7 Robbing the kong (when `enableRobbingKong`)

Promoted **and** postponed kongs trigger a brief claim window (`claimWindowMs`) during which other players may declare Hu on the tile being added. If declared, the kong is reversed and the declarer wins the tile (Robbing-the-Kong fan applies). Concealed kongs cannot be robbed.

#### 5.5.8 Kong restrictions

- Cannot declare any kong if `kongDrawIndex` is exhausted (no replacement tile available).
- Cannot declare kong on a discard that was already claimed for pung this turn.

#### 5.5.9 Wall-end edge cases

- The player who draws the wall's last live-end tile may only declare Hu (subtype `underTheSea`) or discard. No new kongs.
- If discarding, the resulting `lastDiscard` may be claimed only for Hu (subtype `underTheSea`) or Pung (no Kong).
- If Pung'd, the punger discards, that discard again allows only Hu / Pung. Pung-chain at the very end of the wall.

### 5.6 Bloody to the end (血战到底)

After a player declares Hu, their `status` flips to `'hu'`. They sit out future turns and discards but their seat remains in the order (turn skips them). Round continues until 3 players have `status === 'hu'` OR wall is exhausted.

A `'hu'` player still receives kong payments declared after their sit-out (§5.8), subject to refund rules in §5.9.

Multiple players may Hu on the same discard. Each gets paid by the discarder independently. After a multi-winner discard, turn passes to the player counter-clockwise of the *second* Hu-declarer (counted from the discarder), per PDF page 22.

### 5.7 Hu (winning hand)

**Standard win:** four sets + one pair, where:
- Set = pung (3 same) | kong (4 same, contributes structural-3) | chow (3 consecutive same suit).
- Chow may only appear in the concealed portion (no chow claims).
- Hand contains zero tiles of player's voided suit.

**Seven pairs (七对):** seven distinct pairs. Void-suit constraint still applies.

**Exhaustive wait:** a hand is NOT considered tenpai if all four copies of every potential winning tile are already in the player's own visible standing tiles. Engine `isTenpai` filters against player-visible tile counts.

```ts
export function isWinningHand(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null): WinShape | null;
export function isTenpai(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null): TileType[]; // returns winning tile types, with exhaustive-wait filter
export function ukeire(tiles: TileId[], melds: Meld[], voidedSuit: Suit | null, visibleTiles: TileType[]): Map<TileType, number>;
```

### 5.8 Scoring (fan-based, multiplicative, capped)

Hand value = `2^totalFan`, capped at `2^config.fanCap` (default 3 → max 8 base points).

**The cap is a host preset, not a constant (N27).** Novikov states it as a variant —
"3 (as in MIL's version of rules) or 4 (as played in Russia and on the MahjongSoft
site)" — and his own Table 5 is drawn at 4, so both are canonical and a table that
plays the other one read every capped hand as paying half. `fanCap: 3 | 4` rides on
`startGame.rules` and `fanCapFrom` in `ws.ts` narrows it. **A literal union and
never `number`**, for a harder reason than `claimWindow`: this is the exponent in
`2 ** fanCap`, so `30` off the wire is one hand worth 2^30 and a settled match.
Default stays 3, and the help screen now reads the value rather than restating it —
both places it appeared said "3" and "8" in prose, in all three languages.

Fan combinations per Novikov SBR canonical Table 4:

| # | Combination | Fan | Notes |
| --- | --- | --- | --- |
| 1 | Kong | 1 each | Per kong present in winning hand structure |
| 2 | Root (根) | 1 each | Pair + same tile in a pung/kong elsewhere in the hand. Stacks (max 3 per hand). |
| 3 | All Pungs | 1 | No chow in winning hand |
| 4 | Golden Wait | 1 | Single-wait pair completion when 4 pungs/kongs in hand |
| 5 | Full Flush (清一色) | 2 | All tiles in one suit |
| 6 | Seven Pairs (七对) | 2 | Seven distinct pairs |
| 7 | Win after Kong | 1 | Self-drawn Hu on the kong-replacement tile |
| 8 | Shoot after Kong | 1 | Discard Hu where the discard immediately followed a kong declaration |
| 9 | Robbing the Kong | 1 | Hu on the tile being added to a promoted/postponed kong |
| 10 | Under the Sea | 1 | Hu on the wall's last tile or the discard immediately after |

**Heavenly / Earthly Hand (HOUSE RULE, not in canonical PDF):**

The PDF treats Heavenly and Earthly as plain Hu's that happen to occur on the first turn — they score whatever fan their hand structurally has, not a special bonus. Casual online apps and WMT tournament rules instead grant them **automatic cap-fan** (3 fan = 8 points). v1 follows the casual interpretation, gated by `enableHeavenlyEarthly`.

When `enableHeavenlyEarthly === true`:
- Heavenly Hand (East declares Hu before any discard, with `usedIndicator`) → hand value forced to `2^fanCap`.
- Earthly Hand (non-dealer declares Hu on first draw, no claims yet, with `usedIndicator`) → hand value forced to `2^fanCap`.

When `enableHeavenlyEarthly === false` (canonical Novikov), Heavenly/Earthly are simply the names for first-turn Hu — they score at their structural fan value.

**Compatibility table (PDF Table 9, encoded verbatim in `scoring.ts`):**

```ts
type FanType = 'Kong' | 'Root' | 'AllPungs' | 'GoldenWait' | 'FullFlush' | 'SevenPairs'
             | 'WinAfterKong' | 'ShootAfterKong' | 'RobbingTheKong' | 'UnderTheSea';

const COMPATIBILITY: Record<FanType, { selfMax: number; incompatible: FanType[] }> = {
  Kong:           { selfMax: 4, incompatible: ['SevenPairs'] },
  Root:           { selfMax: 3, incompatible: ['AllPungs', 'GoldenWait'] },
  AllPungs:       { selfMax: 1, incompatible: ['Root', 'SevenPairs', 'RobbingTheKong'] },
  GoldenWait:     { selfMax: 1, incompatible: ['Root', 'SevenPairs', 'RobbingTheKong'] },
  FullFlush:      { selfMax: 1, incompatible: [] },
  SevenPairs:     { selfMax: 1, incompatible: ['Kong', 'AllPungs', 'GoldenWait', 'WinAfterKong', 'RobbingTheKong'] },
  WinAfterKong:   { selfMax: 1, incompatible: ['SevenPairs', 'ShootAfterKong', 'RobbingTheKong', 'UnderTheSea'] },
  ShootAfterKong: { selfMax: 1, incompatible: ['WinAfterKong'] },
  RobbingTheKong: { selfMax: 1, incompatible: ['AllPungs', 'GoldenWait', 'SevenPairs', 'WinAfterKong', 'UnderTheSea'] },
  UnderTheSea:    { selfMax: 1, incompatible: ['RobbingTheKong', 'WinAfterKong'] },
};
```

Notable consequences worth a comment in `scoring.ts`:
- Root + All Pungs / Golden Wait incompatible: structurally impossible (pair-tile + pung-of-same-tile = 5 of one tile, only 4 exist).
- Seven Pairs + Kong incompatible: kongs can't appear inside seven-pairs structure. A 4-of-a-kind in a seven-pairs hand counts as 2 pairs + Root, not Kong.
- This is also why "Dragon Seven Pairs" (some apps' +1 fan) doesn't exist as its own combo here — it's just Seven Pairs (2) + Root (1) = 3 fan.

**Self-draw bonus** is NOT a fan. Per PDF Table 6: self-drawn Hu pays Hand Value + 1 from each non-Hu player. Discard Hu pays Hand Value from the discarder only.

**Payment matrix (PDF Table 6 + Table 7):**

| Event | Direction | Amount |
| --- | --- | --- |
| Hu on discard, single winner | discarder → winner | Hand Value |
| Hu on discard, multi-winner | discarder → each winner | Hand Value of each, computed independently |
| Hu self-drawn | each non-Hu → winner | Hand Value + 1 |
| Concealed Kong | each non-Hu → declarer | 2 |
| Exposed Kong (off discard) | discarder → declarer | 2 |
| Promoted Kong | each non-Hu → declarer | 1 |
| Postponed Kong | none | 0 |

Hu'd players who sat out still receive kong payments from declarers who kong after the sit-out, subject to refund rules in §5.9.

### 5.9 Round end & penalties

Triggered when 3 players are Hu OR wall exhausts.

**Theoretical max hand value (TMV):** for each ready non-Hu hand at wall end, compute the max hand value across all possible winning-tile completions, **excluding**:
- Situational fans (Win after Kong, Shoot after Kong, Robbing the Kong, Under the Sea — none of these can be chosen via tile selection).
- Kong (requires explicit declaration; can't be assumed for a wait).

Structural fans (Root, All Pungs, Golden Wait, Full Flush, Seven Pairs) ARE included where they apply. Cap at `config.fanCap`. Used for wall-end payouts.

Per PDF page 32, Full Flush is technically scored if applicable but doesn't VARY based on tile selection (all wait tiles are already same suit by definition).

**Wall-end payouts** (these fire only on wall-end finals — in a 3-Hu final there is at most one non-Hu player so non-ready-vs-ready transfers are vacuous):
- Each non-ready non-Hu pays each ready non-Hu the latter's TMV.
- A non-Hu player holding void-suit tiles at wall end is **treated as no-wait** regardless of hand structure (per PDF page 31).
- Strict mode: this case can't occur under normal play (engine forced void clearing).
- Lenient mode carve-out: if every discard the player made was void-suit, the 48-point penalty below is waived (still treated as no-wait though).

**Void-suit penalties (per PDF, non-redistributive — pure deduction):**
- Holding void-suit tiles at wall end (lenient mode): 48 points lost. Not paid to opponents.
- Declaring any meld (pung/kong) containing void-suit tiles at any time: 48 points lost. Applies even in 3-Hu finals. Not paid to opponents.

These two penalties stack independently; the same player can incur both.

**False Hu penalty (per PDF page 30):** flat 8 points × number of remaining-in-deal (non-Hu) players, paid by offender to each of them (this one IS redistributive). Plus all kong payments declared by the offender are refunded.

**Kong refund (three distinct cases per PDF Table 7 / Lesson 5):**

1. **Robbed promoted kong** — when promoted kong is robbed, the kong-declarer's payment for that specific kong is refunded. Other kongs the declarer made are unaffected. Triggered at the moment of robbing.
2. **Hu on discard immediately following a kong** — when a kong is declared and the kong-declarer's next discard is Hu'd by another player, the kong-declarer's payment for that specific kong is refunded. Triggered at the moment of the Hu.
3. **Wall-end blanket refund** — when the wall ends and the kong-declarer is non-Hu AND non-ready, ALL kong payments that declarer made (across all kongs they declared this round) are refunded. Triggered at round-end settlement.

These are mutually independent paths; the engine applies each at its trigger point and the refunds accumulate into the final score deltas.

**Flower Pig (花猪) house rule — implemented, opt-in.** The PDF does not have a separate Flower Pig mechanic; the canonical "treated as no-wait + 48 penalty for void at wall end" covers the same player misbehavior. Casual online apps add a Flower Pig rule (cap-fan to each opponent for ending with all 3 suits). Enabled via `config.enableFlowerPig` (default `false`): at round end, each non-Hu player whose hand + melds span all 3 suits pays every other player `2^fanCap` (redistributive; `flowerPig` event in `settleRound`). With strict mode default it is mathematically unreachable in normal play (the void suit is fully cleared and never melded), so it only bites in lenient mode.

### 5.10 Dealer rotation between rounds (per PDF page 22)

- Exactly one player Hu'd first this round → that player is next dealer.
- First Hu was multi-player on a single discard → discarder is next dealer.
- No one Hu'd → dealer stays.

False Hu declarations are not counted when determining dealer rotation (PDF page 30).

---

## 6. Lobby & transport

### 6.1 HTTP routes (Fastify)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/lobby` | Create lobby. Returns `{ code, hostToken, watchToken }`. Rate-limited per caller; 503s at the concurrent-games ceiling. |
| `GET`  | `/api/lobby/:code` | Pre-join check. Returns `{ exists, players: PublicLobbyView }` — **never `watchToken`**, since anyone holding a code can read this. Rate-limited: this is the cheapest "is this code real?" oracle. |
| `GET`  | `/api/replay/:id` | Returns persisted action log for a completed round. |
| `GET`  | `/healthz` | Liveness. |
| `GET`  | `/j/:code` | Static client entry point with code prefilled. |
| `GET`  | `/robots.txt` | Crawler rules. Allows `/`; disallows `/api/`, `/j/`, `/healthz` and **every URL with a query string** — the spectator watch secret is one of those. |
| `GET`  | `/sitemap.xml` | The one indexable page. Both files must name the origin that served them, so both derive it (`RENDER_EXTERNAL_URL`, else a shape-checked `Host`) instead of being static assets with a URL baked in (C10). |

Lobby codes: 4 chars, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes I/O/0/1). 32^4 ≈ 1M codes, drawn with `crypto.randomInt` (C2). **The code is a bearer capability** — there are no accounts, so holding it is what admits you — which is why it must be unpredictable rather than merely random: `Math.random()` is xorshift128+ and its state is recoverable from outputs an attacker harvests by creating lobbies, leaking *other people's future codes*. `CODE_LENGTH` is exported so 6 chars is a one-line change.

### 6.2 WebSocket: `/ws/:code?token=…`

Token is hostToken (issued at lobby create) or playerToken (issued on `join`). Server validates and binds connection to a seat.

Spectators use `/ws/:code?spectate=1&watch=…`. The watch token is issued at lobby
create, goes to the host alone, and is compared with `timingSafeEqual`. It lives
in **its own store in `tokens.ts`, not as a third `role`** — a seat token resolves
to a seat and the handler reconnects whoever presents one straight into it, so a
watch token in the same map would have seated a spectator as a player. Separate
stores make that unrepresentable rather than something a guard has to catch. It is
keyed by code so it outlives `deleteLobby`, which `startGame` calls.

Every socket open costs the same per-caller budget as a code lookup — opening a
socket is the other way to ask whether a code is real. Sockets are pinged every
30s and a peer that stops answering is terminated (C7): nothing on a LAN closes an
idle connection, but a platform proxy will, and a half-open socket otherwise holds
a seat nobody is sitting in.

### 6.3 Client → Server messages

```ts
export type ClientMsg =
  // `startGame` carries the host's house-rule choices; `houseRules()` in ws.ts
  // narrows them, and only a literal `true` may switch a rule on.
  | { t: 'join'; name: string }
  | { t: 'leave' }
  | { t: 'addBot'; difficulty: 'easy' | 'medium' }     // host only
  | { t: 'kickBot'; seat: Seat }                        // host only
  | { t: 'startGame'; rules?: { huanSanZhang?: boolean } }  // host only, requires 4 seats filled
  | { t: 'nextRound' }                                  // host only, from the round-end screen
  | { t: 'endMatch' }                                   // host only, from the round-end screen
  | { t: 'action'; action: GameAction };
```

Only `join` is queued client-side while the socket is down; see §8.4. (F21)

### 6.4 Server → Client messages

```ts
export type ServerMsg =
  | { t: 'joined'; seat: Seat; token: string }              // seat assigned (or re-bound)
  | { t: 'lobby'; players: LobbyPlayer[]; canStart: boolean; isHost: boolean }
  | { t: 'view'; view: PlayerView; events: GameEvent[]; botPace: BotPace }
  | { t: 'spectate'; view: SpectatorView; events: GameEvent[] }
  | { t: 'roundEnd'; results: RoundResult }
  | { t: 'matchEnd' }                                       // room torn down; sockets closed
  | { t: 'error'; code: string; message: string };
```

Server pushes `view` to each player after every state-changing action (filtered through `projectView`). `events` is a delta log so the client can animate ("seat 2 claimed pung", "kong on 3-pin from seat 1").

Both halves are per-viewer redacted before send: melds project as `PublicMeld` (a concealed kong's tile is `null` for everyone but its owner until round end — A27), the unflipped first discard projects as a bare `pendingFirstDiscard: boolean` (its owner alone gets the id, in `you.pendingFirstDiscardTile` — A37), and `redactEventsFor` nulls the tile on `drew`/`kongReplacement` events for everyone but the drawer; spectators never see drawn tiles (A31). It also nulls `voidDeclared.suit` for everyone but the declarer (A40) — the void phase resolves all four declarations in one batch, so an unredacted event handed each client the three suits its own view withholds. Anything added to `GameEvent` needs a redaction decision as much as anything added to `GameState` does: the event log is the second channel to a client, and two leaks have now reached it.

`roundEnd` also goes to spectators — on broadcast and on a late join, mirroring the A9 player path — so the store keeps a spectating client on its own screen rather than navigating it to the player round-end screen. `RoundResult.players[]` carries each seat's revealed `hand` and `melds`, its `isReady` state, and its slice of the round's payment `ledger`; it is only ever built once the round has ended, which is what keeps the reveal out of `PlayerView` and out of the redaction rules above.

`botPace: { speed, pinned }` is a **sibling of `view`, not a field on it** (N24). The bots' pace is a `GameRoom` field and deliberately not in `GameConfig` — it changes no rule, and a replay of the same seed is identical at any value — so there is nothing for `views.ts` to project, and it carries no hidden information, so there is no per-viewer redaction to make. It rides on every push because `sendViewTo` is also the first thing a reconnecting socket receives: no separate join/start/repace trigger to remember, and no way for it to drift out of step with the room. `pinned` means `--bot-delay` / `SM_BOT_DELAY_MS` has overridden `speed` process-wide; `speed` is still the host's choice, so a client showing it must say it is not in force rather than present it as the pace. `setBotSpeed` re-broadcasts views so a host's tap is reflected without waiting for the next bot move.

`HuRecord.shape` is the decomposition the fans were scored from, added for the round-end reveal (N16). It is **optional and redacted**: optional because it lands in the persisted snapshot and a game saved before it existed has none, and redacted because `hu` is projected whole into `PublicPlayer` — a winner's fans name a *property* of the hand, but the shape names every tile type in it, and a seat that has won sits out with its concealed tiles unshown. It shares the `reveal` gate with a concealed kong's rank (owner always; everyone else at round end), since it is the same question. `RoundResult` carries it unredacted, which is safe because that payload is only built once the round has ended and already includes every hand.

`PlayerView.you` also carries `hasSubmittedHuan` / `hasDeclaredVoid`. A client that reconnects or refreshes has no memory of having acted, and legal actions are empty outside the play phase, so without these the declaration screens re-showed the picker to a player who had already chosen.

`RoundResult` carries a `roundIndex`. A client that reconnects at round end is handed that round's result again (§6.5), so anything cumulative — the client's match-score totals — must be keyed on it rather than incremented on arrival (A39).

### 6.5 Reconnection

- Player tokens stored in `Map<token, {code, seat}>` (in-memory).
- On disconnect, server holds the seat for 60s. Reconnect with same token resumes.
- After 60s: bot takes over the seat for the rest of the round. Original player can reclaim seat at the next round.
- Host disconnect = server keeps running. Host reconnection re-binds host token. If host loses their token (cleared cookies), no recovery — they need to restart the server.
- Client side (§8.4): the seat token is kept in `localStorage`, so a page refresh can rejoin rather than losing the seat (F2), and the socket stops retrying after 8 consecutive failures instead of looping on a token the server will never accept (F6).

---

## 7. Bots

Heuristic, server-side. Each bot subscribes to its own `PlayerView` and emits `GameAction`s through the same path as humans.

### 7.1 Easy bot (v1)

- **Huan selection:** pick 3 tiles of the suit with fewest tiles (overlaps with intended void suit).
- **Void declaration:** pick suit with fewest tiles. `firstDiscard` = first tile of that suit if any; otherwise indicator.
- **First turn after separating a tile:** take `flipFirstDiscard` — it's ahead of discard selection, since no hand tile is discardable until the flip (§5.4).
- **Discard while void-uncleared (strict mode):** random void-suit tile.
- **Discard while void-uncleared (lenient mode):** same — easy bot doesn't risk the 48-point penalty.
- **Discard otherwise:** drop most-isolated tile (no neighbors in suit, not in pair, not in near-pung). Tiebreak: lower rank, terminals first.
- **Claim:**
  - Hu always (subject to furiten state).
  - Kong always (no defensive logic).
  - Pung if it doesn't break a near-complete chow (heuristic: tile not adjacent to two same-suit tiles in hand).
- **Concealed kong on own turn:** always.
- **Promoted kong on own turn:** always when fresh tile completes existing exposed pung.

### 7.2 Medium bot

- Uses `ukeire(...)` for tile efficiency on discards.
- Defensive discard scoring once another player declares Hu.
- Risk-aware void clearing in lenient mode.

---

## 8. Client UI

Mobile-first. Portrait phone is the design target; tablets and desktop scale up cleanly. The play screen is budgeted to fit a phone viewport without scrolling — it renders at ~664px against an iPhone 14's 664px, worst case late in a round with full discard trays.

### 8.1 Screens

1. **Landing** — Host / Join / Practice-vs-bots / Watch, plus "Rejoin" when a stored seat is present (§8.4). Host info text: "runs the server on this machine; share the URL with friends." Join flow accepts a URL or a code if already on the host's network.
2. **Host setup** — share URL as text + tap-to-copy (the QR code is printed by the CLI, §10.4, not rendered here), the lobby code, a difficulty toggle for newly added bots, the four seats with "+ Bot" / "Kick" controls, "Start" (disabled until 4 seats filled) and "Leave".
3. **Join** — code input (auto-uppercased, 4 chars) + name input. Pre-filled if URL was `/j/CODE`.
4. **Lobby (joiner view)** — waiting state, list of players, "Leave" button.
5. **Game** (the main screen):
   - **Top:** opponent across the table — back-of-tile hand strip, exposed melds, recent discards.
   - **Left/right:** opponents to either side — a short overlapped stack of backs with the hand count beside it, plus melds and discards. One back per tile stood ~500px tall, which set the height of the whole middle row; the count is also easier to read than counting slivers.
   - **Bottom:** your hand (tappable, sorted), your melds, your discard row.
   - **Center:** the play well — the last discard, highlighted, the transient event feed (§8.5, capped at two lines so it cannot reach the centred label beneath it), and the **wall diagram** (`WallDiagram`): four walls round the rim, seven stacks a side, two tiles high, flush and lapped, which is 4 x 7 x 2 = 56 and so exactly what the deal leaves. Emptied slots stay drawn and go dark — a bar that only shrinks gives nothing to measure against. It is a square that fits the well and sits behind the contents, so it costs no height in a row that has none. A 🗒 button in its bottom-right corner opens the round's move history. Each seat's pond sits with that seat, not in the middle.
   - **Floating action panel:** appears during claim windows. Pung / Kong / Hu / Pass buttons + countdown bar. Big touch targets.
   - **Top bar:** wall-remaining counter, whose turn it is, language toggle, sound and help buttons.
   - **Score strip:** running score deltas per player, directly under the top bar.
   - Huan and void declaration are whole screens of their own rather than states of this one, so there is no phase indicator here.
   - **Furiten badge:** visible to your own seat if you're in furiten state (skip-Hu locked until next self-draw). Tooltip explains the rule.
   - **First-discard flip panel:** on your first turn, if you separated a tile at void declaration (§5.4), the hand is not discardable and this panel shows that tile plus a "Flip your first discard" button — the one discard you don't get to choose.
   - **The void declaration is drawn above each seat's pond, not in it** — face down until its owner flips it, then face up with a white glow. It is the one public statement of what that seat declared, and `PublicPlayer.firstDiscardIsVoid` is what says so (false until the flip). Holding it out of the pile is also what keeps it from scrolling out of an opponent's capped tray.
6. **Round end** — per-seat rank, wind, name, a Hu badge and this round's score delta, then match totals, then "Next round" / "End match" (host) or "Leave". Each row expands (`RoundEndRow`) to that seat's revealed hand and melds, its fan list and hand value if it won or its ready state if it didn't, and an itemised list of the payments that produced its delta. Winners' rows start expanded. Spectators get the same rows on their own screen once the round settles.
7. **Match end** — final standings from the accumulated `matchScores`, then back to the menu. Reached on the server's `matchEnd` frame, which used to reset straight to Landing with no result shown. (F9)

App-root overlays, mounted alongside whichever screen is active:

- **Error toast** — the server's `error` frames. They were logged and dropped before, so every rejection was invisible; known codes map to `err.<code>` catalog strings and anything else falls back to the server's message. (F1)
- **Connection lost** — shown once the socket stops retrying (§8.4), with a way back to the menu. (F6)

### 8.2 Tile rendering

- `<Tile>` renders an SVG face from `public/tiles/{suit}-{rank}.svg`; `<TileBack>` renders `back.svg`. `MeldDisplay` decides between the two via `meldRender`, which branches on whether the meld carries a tile — a concealed kong is `tile: null` only while the round is live (A27), and must be drawn face-up once the round-end payload sends its real tile. (Unicode mahjong glyphs were the original plan, but the SVGs carry their own bevelled 3D tile, so the container is a transparent holder — see the note atop `index.css`.)
- Both take a `fill` prop: the hand and the opponent-across strip size their tiles by flexing, so a 14-tile row fits any phone (F4).
- Long-press tile: 2× preview modal.
- Accessibility: clickable tiles are `role="button"` with `tabIndex`, Enter/Space and a localized `aria-label` ("3 of Characters"); the rest are `role="img"` with the same name. The `<img alt>` stays the internal `man-3` id — e2e selectors match on it and the wrapper's label is what gets announced. (F16)

### 8.3 Interactions

- Tap a hand tile: select (visual lift). Tap again to discard. Keyboard: Enter/Space on the focused tile does the same (§8.2).
- Drag a hand tile to rearrange; "Sort" restores the server's order. The list item owns both gestures — a tap is distinguished from a drag by pointer travel, because Framer's `Reorder.Item` preventDefaults pointerdown and swallows `onClick`.
- Long-press tile: 2x preview.
- Claim buttons: single tap commits. Pass is single tap; engine applies to all simultaneous claims.

### 8.4 State management

- Zustand store mirrors latest `PlayerView` from server. UI reads `view.yourLegalActions` to enable/disable buttons — no client-side rule logic.
- Optimistic local state only for tile selection / drag preview. Committed actions wait for server `view` confirmation.
- WebSocket reconnect with exponential backoff; "reconnecting…" toast. It gives up after 8 consecutive failures — an invalid token fails identically every time, so retrying forever just hid the problem. (F6)
- Only the `join` handshake survives a closed socket. Screens send it before the socket opens; everything else is a user action taken while visibly disconnected, and flushing the queue on reconnect delivered stale discards and lobby commands a round late. (F21)
- **Seat session** (`src/session.ts`) — `{ code, token, name, isHost, isPractice }` in `localStorage`, written on `joined`/`lobby` and cleared by `resetSession`. It is what makes "Rejoin" on Landing possible after a refresh; the host flag is re-persisted from the `lobby` frame because `joined` arrives before it is known. A stale token is ignored rather than rejected by the server, so the rejoin attempt times out after 6s. (F2) `isPractice` was written but never read back for a while, so every rejoin returned a practice game as a normal one — read *and* write when adding a field here, and cover both directions.
- **Display preferences** (`src/prefs.ts`) — animation speed and skip, per player, in `localStorage` under `sm-anim`. Deliberately not on `startGame.rules` beside `botSpeed`: bots move on the server so their pace has to be the table's, whereas animation pace is local rendering over a board that has already updated, so it desyncs nothing. No protocol field, no `ws.ts` narrowing. Kept separate from `prefers-reduced-motion`, which stays honoured globally via `MotionConfig reducedMotion="user"` — that is an accessibility signal, this is a taste. (N4)

### 8.5 Animations (Framer Motion 12)

- Tile selection: spring lift animation.
- Last-discard: pop highlight.
- Hu: celebration burst overlay.
- Reconnect toast: slide-in/out.
- Round-end: staggered score reveal — position and scale only. Rows used to mount at `opacity: 0`, so anywhere the animation didn't run the scoreboard never appeared. (F11)
- **Reduced motion:** `MotionConfig reducedMotion="user"` at the root, plus a `prefers-reduced-motion` block in `index.css` that collapses CSS animations and freezes the last-discard pulse into a static glow. (F12)
- **Event feed** — pungs, kongs and wins from the `view` frame's `events`, with sound for other seats' discards and claims. Before this, `lastEvents` was stored and read by nothing. (F7)

---

## 9. Persistence

In-memory:
- `lobbies: Map<code, Lobby>` — pre-game state.
- `rooms: Map<code, GameRoom>` — active games.
- `tokens: Map<token, {code, seat}>` — ephemeral auth.

SQLite via Node 22 built-in `node:sqlite`, single file at user data dir:
- macOS: `~/Library/Application Support/sichuan-mahjong/games.db`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/sichuan-mahjong/games.db`
- Windows: `%APPDATA%\sichuan-mahjong\games.db`

```sql
CREATE TABLE games (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL,
  seed        TEXT NOT NULL,
  config_json TEXT NOT NULL,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  action_log  TEXT NOT NULL,        -- JSON array of GameAction
  results     TEXT NOT NULL          -- JSON RoundResult
);
CREATE INDEX idx_games_started ON games(started_at);
```

Written on `roundEnd`. Used in v1 for replay-debug via `/api/replay/:id`. No accounts table; no PII beyond player nicknames inside `action_log`.

`node:sqlite` is loaded **lazily** (via `createRequire`): if it's unavailable — notably in the Bun-compiled binaries, which have no `node:sqlite` module — the server logs `persistence disabled` and runs without saving or resuming. Games still play; they just aren't persisted (no replay, no host-shutdown resume) in that mode. Under Node 22+ (npx / dev) persistence is fully active.

---

## 10. Networking & distribution

### 10.1 Default LAN play

- Server binds `0.0.0.0:8080`.
- On startup, `networking.ts` enumerates network interfaces, picks the LAN address (skipping virtual interfaces, link-local, etc.), and prints `http://<lan-ip>:8080`.
- mDNS broadcast as `mahjong.local:8080` via `multicast-dns` package.
- LAN play is plain HTTP. PWA install / service-worker features unavailable. Acceptable for v1; HTTPS available via Tailscale path.
- QR code printed to CLI via `qrcode-terminal` for the LAN URL — easy phone-join when the host's laptop is on the same WiFi.

### 10.2 Cross-network play via Tailscale

On startup, `networking.ts` checks for Tailscale presence:
- Run `tailscale status --json --self` (whichever path resolves first across PATH and OS-specific locations).
- Fall back to inspecting interfaces for the `100.64.0.0/10` range and `tailscale0` interface name.

If detected:
- Fetch the host's tailnet hostname (e.g., `mahjong-laptop.tailnet-name.ts.net`) and tailnet IPv4.
- Check for an existing TLS cert at the Tailscale state dir; if absent, attempt `tailscale cert <hostname>` automatically (one-shot, cached). If permissions or admin-console MagicDNS+HTTPS settings prevent provisioning, log the manual command for the user.
- Bind an HTTPS listener on `:8443` using the cert. PWA install works on the Tailscale URL.
- Generate share URL `https://<hostname>:8443/j/<CODE>`.

### 10.2b Hosted play on a public URL

`--hosted` (or `SM_HOSTED=1`) is the third deployment, and it is the *same build*:
the client derives its socket URL from `window.location.host`, so it has never
known a server address and nothing is configured per deployment. The flag turns
off what is meaningless in a container — mDNS, Tailscale detection, the QR code —
takes the port from `PORT`, and selects the hosted `RuntimeProfile` (`profile.ts`).

**The profile carries numbers only.** Rate limits, the concurrent-games ceiling
and the sweep TTLs differ; the controls themselves — CSPRNG codes, rate limiting,
the spectator secret — are on in both, because a control that switches on with
`--hosted` is one you develop against with it off and that fails open the first
time somebody forgets the flag.

The one genuinely deployment-shaped setting is `trustProxy`, and it is a **hop
count, not `true`**: Fastify passes it to proxy-addr, where `true` trusts the
whole chain and resolves `req.ip` to the *leftmost* `X-Forwarded-For` entry, which
the client wrote — making every per-IP limit spoofable by adding a header. Hosted
defaults to 1 hop (`SM_TRUST_PROXY` to override); self-host trusts nothing,
because nothing is in front of it.

**One hop is the tested answer, not a starting guess — do not raise it.** Render
fronts the service with Cloudflare and *appends* to `X-Forwarded-For` rather than
replacing it, so a client-supplied value survives into the chain. At 2 hops a
forged header took a request from 8-of-10 rejected to 10-of-10 allowed; at 1 hop
150 forged addresses share one bucket. The cost is that `req.ip` is an edge
address, so players behind one edge node share a budget — accepted deliberately,
and recorded as [O5](#12-open-questions--explicit-deferrals).

`render.yaml` in the repo root is the Blueprint. Full rationale, the deploy steps
and the post-deploy checklist: [docs/design-hosted-server.md](./docs/design-hosted-server.md).

### 10.3 PWA install & offline shell

`public/sw.js` registers only over HTTPS (so, the Tailscale path). It precaches
`/` on install and runtime-caches the content-hashed `/assets`, the tile art and
the icons on first request; navigations are network-first with the cached shell
as the offline fallback. It used to precache `/src/main.tsx` as well — a dev-only
path — and since `cache.addAll` is atomic, that 404 rejected every production
install and left the cache empty, making the worker dead code. Bump the cache
name on any change to what is precached. (F5)

`manifest.webmanifest` ships 192/512 PNGs plus a maskable 512 and an
`apple-touch-icon`; an SVG alone is ignored by iOS home-screen and several
Android launchers. They are generated by `scripts/icons/generate-icons.mjs`,
which draws the same primitives as `icon.svg` with no image dependency — rerun it
if the icon changes. `#0c5f57` is the single brand color across the icon,
`theme-color` and the manifest. (F18)

Documentation surfaced on the Host setup screen explains how to share the host machine with friends:
1. Friend installs Tailscale (5-min setup; iOS/Android/macOS/Windows/Linux clients).
2. Host opens Tailscale admin console → Machines → mahjong-laptop → Share. Sends the share invite link.
3. Friend accepts (creates a free personal Tailscale account if needed).
4. Friend now has access to ONLY the mahjong machine — not the rest of the host's tailnet.
5. Friend opens the shared URL. Joins the lobby.

After step 4, every future game uses the same URL — no per-session re-sharing.

### 10.4 Startup output

```
🀄  Sichuan Mahjong — running on this machine

   LAN:        http://192.168.1.50:8080
   mDNS:       http://mahjong.local:8080
   Tailscale:  https://laptop.tail-name.ts.net:8443  ← share with remote friends

   [QR code for LAN URL]

   Lobby code:  HKQM
   Share URL:   https://laptop.tail-name.ts.net:8443/j/HKQM

   Server keeps running until you Ctrl-C.
```

### 10.5 Distribution

- **Primary:** self-contained npm package `sichuan-mahjong`, run via `npx sichuan-mahjong` (Node 22+). `prepack` bundles the server and **inlines the zero-dep engine** into `dist/main.js` (esbuild) and copies the built client into `dist/client`; the engine is a `devDependency` so consumers never try to fetch the private workspace package. Ships only `dist/main.js` + `dist/client`.
- **Secondary:** precompiled single binaries via `bun build --compile` (`scripts/release/compile.ts`) for macOS arm64/x64, Linux x64/arm64, Windows x64. The client SPA is **embedded** in the binary: `gen-embedded-client.mjs` writes `src/generated/embedded-client.ts` (URL → base64), the Bun-only entry `src/binary.ts` hands it to the server, and `http.ts` serves from the embedded map (else from disk). Persistence is disabled in the binary (no `node:sqlite`). No Node install required.
- **Entries:** startup lives in `server.ts`; `main.ts` (Node/npm bin) and `binary.ts` (Bun) are thin wrappers that each call `run()` once.
- **Config:** CLI flags `--port`, `--https-port`, `--no-mdns`, `--no-tailscale`, `--share`, `--data-dir`, `--bot-delay`. All optional with sensible defaults.

---

## 11. Testing strategy

### 11.1 Engine (must be airtight)

- Unit tests per module (tiles, melds, hand, scoring, claims, transitions).
- **Property tests** with fast-check:
  - **Ledger reconciliation:** for every seat, the ledger signed from its perspective (minus when it is the `from`, plus when it is the `to`) equals its `scoreDelta`, and entries with `to: null` sum to `penaltyPot`. This checks the payment matrix from a second direction: the existing balance property is satisfied by any internally consistent set of transfers, including ones that never emitted an event, and this one is not.
  - JSON round-trip: serialize → parse → equal for any GameState.
  - Tile conservation: `applyAction` never changes total tile count of 108.
  - **Payment-matrix balance:** redistributive payments sum to zero, with non-redistributive penalty deltas tracked separately. The engine maintains `state.penaltyPot` (tracked separately from `scoreDelta`) for the 48-point void-suit penalties, which are pure deductions per PDF page 27 and 31. The property: `sum(scoreDelta) === -sum(penaltyPot)`. Redistributive flows (Hu payments, kong payments, false-Hu penalty, bu-ting payouts) net to zero in `scoreDelta`.
  - Hand detection: any constructively-built `4 sets + pair` hand is recognized as winning; randomly drawn 14-tile hands are usually not.
  - Tenpai detection: a tenpai hand has at least one tile-type completing it (subject to exhaustive-wait filter).
  - Furiten state: a furiten player's `yourLegalActions` contains a discard-Hu action *iff* the candidate hand's `totalFan` strictly exceeds `minFanToOverride` (the greater-value override of §5.5.5).
  - Compatibility table: for any winning hand and Hu subtype, `calcHandScore` never produces a result containing two mutually-incompatible fans per the matrix (`phase4.test.ts`).
- **Dice** (`dice.test.ts`, §4.3.1): the sum-to-wall table is asserted against the PDF's tabulation entry by entry (5/9 → East and so on); the seating throw is a property test that each round's contenders are a strict subset of the last and the winner threw in every round; the cap is pinned with a scripted RNG where every seat rolls 6+6 forever, which must terminate on the lowest seat rather than loop. `rotateWall` is checked as a permutation. One test asserts East lands on all four seats across 200 seeds — everything else would pass if the throw always returned seat 0.
- **Replay tests:** canned action logs from real games → expected end states. Include at least one game per fan combination from §5.8. **The wall break rotates what a seed deals**, so these are regenerated whenever §4.3.1's geometry changes — deliberately, and in one pass rather than twice.
- **Standing-tile rhythm** (`first-discard.test.ts`): across a sample of full rounds, every player who separated a face-down tile must reach the `14 − 3·melds` tiles a win needs, wins must actually occur for them, and wall-end readiness must be computable. Synthetic-state tests can't catch this class of bug — they build a correctly-sized hand by construction, which is exactly how A35 survived five audit passes.

### 11.2 Server

- Integration tests with fake WebSocket clients.
- **Bot-vs-bot smoke:** 100 full games with 4 easy bots (plus 30 with medium bots). Assert no crashes, no rule violations rejected mid-game, payment-matrix balance for every game, exposed pungs actually form (A13), and — crucially — that wins come from players who separated a face-down first discard, not only from the rare indicator user. A bare "some Hu happened" assertion is what let A35 hide behind indicator users through five audit passes.
- Tailscale detection mock tests (unit-level): given mocked `tailscale status --json` outputs, verify URL generation.
- Round-end reveals: `buildRoundResult` carries hands, melds, ready state and a per-seat ledger, and a spectator joining at round end is handed the result.
- Snapshot validation: `validateRoomSnapshot` names every field a persisted snapshot is missing, checked against the keys of a freshly created game so the required set cannot drift. `restoreRoomsFromDisk` drops an incompatible row rather than half-restoring it — `restore` used to assign the persisted state verbatim, and of the fields that could go missing, two throw and seventeen silently corrupt the projected view.
- Replay back-compat lives in its own file because `server.test.ts` mocks `src/persistence.js` wholesale.

### 11.3 Client

Node environment, no DOM — so tests target the store, the transport and the pure
helpers behind the components rather than rendered output:

- Store reducers: match-score accumulation and replay guard (A30/A39), `error` surfacing (F1), the match-end transition (F9).
- `session.ts` round-trip and rejection of unusable stored values (F2), including `isPractice` in **both** directions — it was written and never read back, so the field survived storage and vanished on the way out — and a CJK name surviving the round trip.
- `prefs.ts`: the animation scale, with `fast` pinned at exactly 1× because the component constants *are* the fast values, and a drifting multiplier would silently retime what shipped. Skip collapses to zero at every speed, and stored values are parsed field-by-field so an older entry missing a key still restores the half it carries (N4).
- `DiceOverlay`'s two pure helpers: `diceKey`, which is what stops the overlay re-showing on every one of the dozens of views a round pushes, and `decidingRound`. Plus `faceRotation`, asserted on the property that makes a cube read as a die — opposite faces sum to 7, so they must be half a turn apart on exactly one axis (N2).
- `WsClient`: the retry cap and budget reset (F6), and that only the `join` handshake survives a closed socket (F21).
- Pure helpers extracted for exactly this reason — `tileLabel` (F16), the event-feed sound/announcement mapping (F7), `joinErrorForStatus` (F22), the claim countdown's skew handling (F25) — each also asserted against the catalog so a rendered key can't go missing.
- i18n catalog parity across the three languages (A18).
- Round-end display helpers in `src/roundEnd.ts`: `formatFan` localizes a `FanEntry` and only shows a multiplier above 1; `ledgerLines` signs each entry from the viewing seat's perspective, since a redistributive entry appears in both the payer's and the payee's ledger.
- `tests/sw.test.ts` runs the real `public/sw.js` in a stubbed worker global. Three of its four cases fail against the pre-F5 file, which is the point: the worker ships as a plain asset and nothing else type-checks or exercises it.

### 11.4 E2E

- `e2e/game.spec.ts` — host + 3 bots, full round to round-end screen, replay 404, healthz.
- `e2e/match.spec.ts` — two-round match with running totals, then "End match".
- `e2e/house-rules.spec.ts` — hosts a lobby, turns on 換三張, asserts the deal then opens on `huan`, and taps through the picker. Chromium only: a rule path, not a layout. Since the swap is off by default, this is the **only** spec that reaches the huan screen — every other one drives practice mode, which now opens on the void declaration.
- `e2e/viewport.spec.ts` — the vertical-overflow guard on an iPhone SE (320×568): the play screen's scroll container must not overflow at any point in a round, no discard tray may draw outside its column, and the round-end controls must stay reachable at every scroll position. See `docs/viewport-audit.md` R5–R7.
- `e2e/ui-clicks.spec.ts` — the same opening driven entirely by **real clicks** (huan tile taps, void suit button, first-discard flip, tap-to-select/tap-to-discard), which is the only spec that exercises the interaction layer. Runs on 5 viewport projects (desktop, iPhone 14 portrait/landscape, iPad portrait/landscape), each asserting no horizontal overflow and attaching a screenshot.
- The other specs poll phase from the Zustand store via `window.__e2e` (not the DOM) to avoid Framer Motion 12 pointer-event interception timing issues.

### 11.5 Packaging

- Smoke test: `node packages/server/dist/main.js --help` runs in CI.

### 11.6 CI

GitHub Actions: build engine → lint → typecheck → test (vitest) → build server + client → e2e (playwright) → package smoke.

---

## 12. Open questions / explicit deferrals

Items 1–11 have since been implemented (✅) and are kept as a record of the
decisions and where each landed. The **Open** list at the end of this section is
live.

1. **Reconnection > 60s** — ✅ Done: bot takeover holds for the rest of the round; a reconnected human reclaims their seat at the next round (`GameRoom.nextRound` recomputes `isBot` from `isHumanSeat` + connection state). See §6.5.
2. **Host shutdown midgame** — ✅ Done: in-progress rooms are snapshotted to SQLite (`live_rooms` table) — debounced on every state change and flushed on graceful shutdown (SIGINT/SIGTERM). On boot, `restoreRoomsFromDisk()` rehydrates each room and re-registers its tokens, so players reconnect with their saved token and resume; unconnected human seats arm the normal 60s bot-takeover so play never stalls. Snapshots are deleted on `endMatch`. (A hard crash loses at most the last ~1s of actions.)
3. **Match length** — ✅ Done: host starts each next round (`nextRound`; dealer rotates to `nextDealer` via `startNextRound`) or ends the match (`endMatch` → `matchEnd`). Running totals accumulate client-side across rounds.
4. **i18n** — ✅ Done: UI strings externalized to a dependency-free catalog (`client/src/i18n/`) in English, Simplified Chinese (zh-Hans), and Traditional Chinese (zh-Hant), with an EN/简/繁 toggle persisted to `localStorage` and mirrored onto `<html lang>` (F19). Tile faces are art, not text, so they stay language-neutral — only their screen-reader labels are translated (F16).
5. **Spectators** — ✅ Done: connect to `/ws/:code?spectate=1` (no token/seat) to receive hand-hiding `spectate` views (`projectSpectatorView`); client has a read-only "Watch a Game" board.
6. **Flower Pig house rule** — ✅ Done: opt-in `enableFlowerPig` config (default off); a non-Hu player ending with all 3 suits pays each opponent `2^fanCap`. See §5.9.
7. **Tailscale node-sharing automation** — ✅ Done: `--share` (with `TAILSCALE_API_KEY`, optional `TAILSCALE_TAILNET`) resolves the host device via the Tailscale v2 API and auto-creates a reusable device-invite, printing the share URL in the startup banner. Without credentials it falls back to manual admin-console instructions (`tailscaleShare.ts`).
8. **Set-with-void-suit meld penalty** — ✅ Done: 48-point deduction enforced on pung/kong/concealed-kong of voided suit (`voidMeldPenalty` event).
9. **False-Hu detection** — ✅ Done: 8 pts/opponent redistributive penalty + kong refund on invalid draw-Hu or claim-window Hu.
10. **Replay-test corpus** — ✅ Done: canned games per fan combination + penalty paths.
11. **Round-end hand reveals and score breakdown** — ✅ Done (2026-07-31). Only the fan list was on the wire; hands and the payment breakdown both needed the server to send more. `GameState.ledger` accumulates a `LedgerEntry` per payment, derived from the events the engine already emits inside the single `ok()` constructor so the two cannot drift, and living on the state so it survives the snapshot/restore path. `RoundResult.players[]` carries `hand`, `melds`, `isReady` and that seat's slice of the ledger; `HuRecord.fans` became `FanEntry[]` so fan names are translatable. See §8.1, §6.4 and §11.3.

### Open

**O1. The release binary embeds the tile SVGs** — ✅ Resolved (2026-08-02) by
**accepting the merge and stating the binary's licence**, rather than by
excluding `tiles/` from the embed. `gen-embedded-client.mjs` keeps walking
`packages/client/dist` and base64-embedding every file, 27 CC-BY-SA tiles
included, because a self-contained executable is what that build is for; the
alternative meant shipping a folder beside every binary and giving up the one
property the binary has. What changed is the claim: §13 used to forbid merging
the SVGs into compiled output while the binary did it anyway, so the **rule** was
what was wrong. The repo now has a [LICENSE](./LICENSE) whose §3 says a binary is
a combined work carrying both licences, and the CC-BY-SA attribution is reachable
from the binary itself — `--credits`, the About screen, `/tiles/credits.json` —
so it can never be separated from the art it covers. The npm and from-source
paths are unaffected; both serve `tiles/` from disk.

**O2. Bot pacing** — ✅ Done (2026-08-01), both halves. Bots pause instead of
answering in 150ms, and the host picks the pace in the lobby: `BOT_SPEEDS` is
slow 1800 / normal 900 / fast 400, carried on `startGame.rules.botSpeed` and
narrowed by `botSpeedFrom` in `ws.ts` beside `houseRules`. The pace lives in
`room.ts` rather than `GameConfig` because it changes no rule and a replay of the
same seed is identical at any value — which is also why it is a room field, not
part of the state. `--bot-delay <ms>` (and the `SM_BOT_DELAY_MS` seam the vitest
and Playwright configs use) pins the whole process and **outranks the lobby**, or
a host who picked "slow" would have the suites playing at 1.8s a move.

`SM_SEED` is the matching seam for the *deal*, read by `newSeed()` in `room.ts` and
set by the Playwright config. Some e2e assertions depend on what a round happens to
contain — `viewport.spec.ts` refuses to pass unless it has seen a real claim window,
so that the claim-bar check cannot pass for free on a round that offered this seat
no claim — and on a random deal that is a coin toss. It failed a full-suite run
after passing three isolated ones, which is the worst way for a guard to behave.
When set, every room in the process deals identically; the room code is *not* mixed
in, because it comes from `crypto.randomInt` and would put the randomness straight
back, making a spec run alone differ from the same spec in the suite. Deal variety
in e2e was never doing verification work — those assertions are structural, and the
engine's randomness is covered by the property tests and the 100-game bot smoke
test. Unset, which is every real deployment, gives `randomUUID()`.

The history panel (`PlayHistory`) keeps the
round's events in the store — raw, with ids, so a language switch re-renders them
and identical discards stay distinct — and `historyRowFor` is the inverse of
`feedLineFor`: discards are the bulk of the list rather than dropped. Its control
sits in the play well, because a fourth top-bar icon truncated the turn indicator.

**O3. Central discard pool.** Show every discard in the middle, mark the last one,
and show each player's chosen void suit. **The redaction decision it needed has
since been made and shipped:** `PublicPlayer.firstDiscardIsVoid` says whether a
seat's `discards[0]` is the tile they declared, and is false until that seat flips
it — which is when a real table learns it, and is the deliberate reveal A40 said
this needed rather than a field that happened to be on the wire. The PDF edge case
is handled by the same derivation: a player may declare a suit they hold none of, a
card indicator stands in, and no tile ever reveals it (`usedIndicator`). Each seat's
declaration is drawn above their own pile today.

What is left is the layout, and it got harder rather than easier — the middle now
holds the wall diagram, the last discard and the history control, so the empty
space that motivated a central pool is gone. Still a fallback; the per-seat trays
are staying.

**O4. Discard tile styling** — ✅ Done (2026-08-01), and it wasn't the discard pile.
The report was that the middle discard looked glossier than the hand and trays: the
well's last discard was the last board tile still drawn from the 3D art. It was
first closed by making every tile flat; it is now closed the other way round —
every tile is the 3D art, and a run *laps* to hide the doubled bevel instead of
removing it. The two tiles matched either way, but the lap is the art as drawn,
costs no glyph width, and retired `.tile-cell` and the whole flatten pipeline. See
[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md).

**O5. Per-IP limits are keyed to a Cloudflare edge address, not to the player.**
Deferred deliberately (2026-08-02) after testing, not left unexamined. `trustProxy`
stays at one hop because Render appends to `X-Forwarded-For` instead of replacing
it, so any count that reaches the player also reaches an entry an attacker
controls — raising it to 2 made every per-IP limit bypassable with a header. The
residue is granularity: unrelated players behind the same edge node share a
60/minute budget. The fix would be preferring `CF-Connecting-IP` in `clientKey()`,
which Cloudflare overwrites per request; **not done**, because it is safe only if
that header is sanitised and this very bug shows Render does not sanitise inbound
headers in general, so it could only be verified *after* deploying. Revisit if
real players start seeing `rate_limited`. Measurements in
[docs/design-hosted-server.md §C4](./docs/design-hosted-server.md#c4-fastify-has-to-be-told-it-is-behind-a-proxy).

---

## 13. License & credits

Full text: [LICENSE](./LICENSE). In short:

- Code: MIT.
- Tile SVGs: the 27 suit tiles are Wikimedia Commons, CC-BY-SA 4.0, renamed and
  otherwise as published. Per-file attribution in
  `client/public/tiles/credits.json`, surfaced on `/about`. `back.svg` is
  original to this project and MIT.
- **The release binary is a combined work and ships both licenses** (2026-08-02,
  closing O1). It base64-embeds the built client, tiles included, because a
  single self-contained file is the point of that build. MIT covers its code;
  CC-BY-SA 4.0 covers the artwork inside it and travels with it, so whoever
  redistributes a binary redistributes the art and takes on the attribution.
  **The attribution therefore has to be reachable from the binary**, and is,
  three ways: `--credits` (the `CREDITS` text in `cli.ts`), the About screen in
  all three UI languages, and `/tiles/credits.json`. An earlier version of this
  section forbade merging the SVGs into compiled output; the binary did it
  anyway, so the rule was the thing that was wrong.
- Nothing above restricts the code. The npm package and the from-source path
  serve `tiles/` from disk as ordinary files, and a build that omits `tiles/`
  carries no CC-BY-SA obligation at all.

---

## 14. References

**Primary (canonical for v1):**
- Vitaly Novikov, *Sichuan Mahjong? It's that simple!* — authoritative ruleset reference.
- *Mahjong: a Visual Guide* — [themahjong.guide](https://themahjong.guide/) — used alongside the PDF, and the site the tile SVGs were obtained from. It is a route to the art, not the licence for it: the CC BY-SA chain runs to Wikimedia Commons / Cangjie6 and is evidenced per file in `credits.json` (see §13 and LICENSE §2).

**Secondary (used to validate ambiguities; some house-rule layers reflect their popular interpretations):**
- World Mahjong Tour — *Sichuan Mahjong Blood Battle Rules* (worldmahjongtour.live) — Heavenly/Earthly tournament scoring; Flower Pig casual rule.
- Mahjong Pros — *Beginner's Guide to Sichuan Bloody Rules* (mahjongpros.com) — independent SBR confirmation, furiten/skip-Hu.
- Baidu Baike — *Sichuan Mahjong* entry (baike.baidu.com) — Chinese-native source, regional terminology.
- GitHub kltm/sichuan-style-mahjong-rules — community ruleset.
- Riichi Wiki — Furiten article (riichi.wiki) — for canonical furiten semantics.

**Other:**
- Wikimedia Commons — *SVG Planar illustrations of Mahjong tiles* (tile graphics).
- Tailscale docs — [Sharing nodes](https://tailscale.com/kb/1084/share), [HTTPS certificates](https://tailscale.com/kb/1153/enabling-https).
