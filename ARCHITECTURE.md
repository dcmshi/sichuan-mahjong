# Architecture — Sichuan Mahjong

> Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA. Host runs the server on their own machine; friends connect over LAN or Tailscale. Bots fill empty seats and power a single-player practice mode.

## Status: v2.1 — handoff-ready

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
- Spectator mode
- Tournaments, brackets, scheduled matches
- Voice chat
- Native mobile apps
- Phone-as-host (phones can join, can't host)
- Other mahjong variants
- Flower Pig house rule (see §5.9 — defer to a possible later toggle)

---

## 2. Tech stack

**Language:** TypeScript end-to-end, strict mode. Engine types shared client↔server.

**Repo:** pnpm workspaces. Three packages:

| Package | Purpose | Key deps |
| --- | --- | --- |
| `packages/engine` | Pure rules engine. Zero runtime deps. | (none) |
| `packages/server` | HTTP+WS gateway, lobby, bots, persistence, Tailscale detection | `fastify`, `ws`, `better-sqlite3`, `multicast-dns`, `qrcode-terminal` |
| `packages/client` | PWA | `react@18`, `vite`, `tailwindcss`, `zustand`, `framer-motion`, `vite-plugin-pwa` |

Both server and client import from engine. Protocol message types live in `engine/src/protocol.ts`.

**Runtime:** Node 22 LTS, single process, runs on the host's own machine.
**Tooling:** Biome (lint+format), Vitest, fast-check (engine property tests), Playwright (one e2e: 4-bot full game).
**Distribution:** npm package `sichuan-mahjong` invokable via `npx sichuan-mahjong`. Optional precompiled single binaries (Bun compile) per OS released via GitHub Releases for hosts without Node.

---

## 3. Repo layout

```
sichuan-mahjong/
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── tiles.ts          # tile encoding, wall, seeded shuffle
│   │   │   ├── rng.ts            # xoshiro128** seedable PRNG
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
│   │   │   ├── cli.ts            # startup output, QR code
│   │   │   └── main.ts
│   │   └── tests/
│   ├── client/
│   │   ├── public/
│   │   │   └── tiles/            # 27 tile faces + back.svg + credits.json
│   │   ├── src/
│   │   │   ├── components/       # Tile, Hand, Meld, DiscardPool, ClaimPanel, ScoreBoard
│   │   │   ├── screens/          # Landing, HostSetup, JoinForm, Lobby, Game, RoundEnd
│   │   │   ├── store/
│   │   │   ├── ws/
│   │   │   ├── hooks/
│   │   │   ├── styles/
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   └── vite.config.ts
├── scripts/
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
  firstDiscardFaceDown: boolean;    // UI hint for the void-declaration first discard
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
  wall: TileId[];                   // full shuffled wall
  drawIndex: number;                // pointer; next live-end draw
  kongDrawIndex: number;            // pointer from far end; kong-replacement draws here
  players: [PlayerState, PlayerState, PlayerState, PlayerState];
  dealer: Seat;
  turn: Seat;
  turnNumber: number;               // increments on each turn-pass; used in furiten + first-turn checks
  firstTurnDone: [boolean, boolean, boolean, boolean];  // per seat; gates Heavenly/Earthly eligibility
  lastDiscard: { tile: TileId; from: Seat; claimable: boolean; afterKong: boolean } | null;
  lastDrawWasKongReplacement: boolean;
  pendingClaims: ClaimWindow | null;
  pendingHuan: (TileId[] | null)[]; // length 4
  pendingVoid: (PendingVoid | null)[];  // length 4; { suit, firstDiscardTile | null }
  penaltyPot: number;               // accumulated non-redistributive penalty deductions (48-point void losses); see §11.1
  history: GameAction[];
  startedAt: number;
};

export type GameConfig = {
  enableHuanSanZhang: boolean;       // default true (note: not in canonical PDF)
  huanDirection: 'cw' | 'ccw' | 'random';
  enableRobbingKong: boolean;        // default true
  enableHeavenlyEarthly: boolean;    // default true (HOUSE RULE — not in canonical PDF; see §5.8)
  voidDiscardRule: 'strict' | 'lenient';   // default 'strict'; lenient = Novikov canonical
  fanCap: number;                    // default 3 → max payment 2^3 = 8
  claimWindowMs: number;             // default 3000
};

export const DEFAULT_CONFIG: GameConfig = {
  enableHuanSanZhang: true,
  huanDirection: 'random',
  enableRobbingKong: true,
  enableHeavenlyEarthly: true,
  voidDiscardRule: 'strict',
  fanCap: 3,
  claimWindowMs: 3000,
};
```

### 4.4 Actions

```ts
export type GameAction =
  | { t: 'huanSelect';        seat: Seat; tiles: [TileId, TileId, TileId] }
  | { t: 'declareVoid';       seat: Seat; suit: Suit; firstDiscard: TileId | null }
  | { t: 'draw';              seat: Seat }                                 // server-issued at turn start
  | { t: 'discard';           seat: Seat; tile: TileId }
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
export type PlayerView = {
  you: PublicPlayer & { hand: TileId[]; voidedSuit: Suit | null; furiten: PlayerState['furiten'] };
  others: [PublicPlayer, PublicPlayer, PublicPlayer]; // counter-clockwise from you
  wallRemaining: number;
  phase: Phase;
  turn: Seat;
  lastDiscard: { tile: TileId; from: Seat } | null;
  yourLegalActions: GameAction[];
  claimDeadline: number | null;
  config: GameConfig;
};

export function projectView(state: GameState, seat: Seat): PlayerView;
```

`yourLegalActions` is the engine telling the UI exactly which buttons to enable. The client never duplicates rule logic.

---

## 5. Sichuan rules the engine encodes

Canonical source: Vitaly Novikov, *Sichuan Mahjong? It's that simple!* (PDF). Tests reference these section numbers. The UI's "How to Play" reads from this doc verbatim. Where we layer house rules atop the canonical PDF, the section says so explicitly.

### 5.1 Tiles
108 total: man / pin / sou × 1–9 × 4 copies each. No winds, dragons, flowers, jokers.

### 5.2 Setup
1. Wall built from `buildWall(seed)`. Tabletop wall-break ceremony is purely cosmetic; for digital, deterministic shuffle is sufficient.
2. Dealer for the first round = host = seat 0. After each round, dealer rotates per §5.10.
3. Deal: 13 tiles to each player. Dealer (East) gets a 14th immediately and starts.

### 5.3 Phase: Huan San Zhang (3-tile swap, optional, default on)

Note: not in Novikov's canonical PDF; popular Sichuan house rule.

- Each player privately submits 3 tiles of one suit (`huanSelect`).
- A player whose hand cannot form 3-of-one-suit has their swap skipped.
- When all four selections are committed, server applies the rotation: cw / ccw / random per `config.huanDirection`. Random is decided from the game seed.

### 5.4 Phase: Void declaration (定缺 dingque)

Each player simultaneously commits:
- A voided suit (`man | pin | sou`).
- Their first-discard tile of that suit, OR `null` if their hand contains no tiles of that suit (in which case they "use the indicator").

Server reveals all four atomically. For each player:
- If `firstDiscard !== null`: tile is removed from hand, appended to discards with `firstDiscardFaceDown = true` and discard marked non-claimable. Hand size: 13 (East ends void phase with 13 too).
- If `firstDiscard === null`: `usedIndicator = true`. Hand size unchanged (14 for East, 13 for others).

Phase transitions to `play`.

### 5.5 Phase: Play

Turn order: counter-clockwise (East → South → West → North → East).

#### 5.5.1 East's first turn (special)

Per the PDF (Lesson 4, "The initial East's turn"), East has exactly three options on turn 1, **with no draw** — East already has 14 tiles from the deal:

1. **Declare Heavenly Hand** via `declareHeavenly` (only when `enableHeavenlyEarthly` AND `usedIndicator === true` AND `isWinningHand(east.hand, [], east.voidedSuit)` returns truthy). Engine emits Hu with subtype `heavenly`.
2. **Declare a concealed kong** via `declareKongOnTurn` with `subtype: 'concealed'`. After laying out and taking the kong-replacement tile, East faces the same three choices again with 11 standing tiles + 1 fresh tile (so back to 13, then 14, etc., looping until a discard or Hu).
3. **Discard.**

If East had void-suit tiles at deal time (`usedIndicator === false`), Heavenly Hand is unavailable since the void-declaration discard already broke East's 14-tile starting hand.

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

Window duration = `config.claimWindowMs` (default 3000ms, per PDF). Closes early if every eligible player has explicitly passed.

Resolution priority: **Hu > Kong > Pung**.
- Multiple Hu claims on the same discard: all honored (see §5.6).
- Pung tiebreak: nearest counter-clockwise from discarder wins.
- A claim against a non-claimable discard (face-down first discard): rejected.

#### 5.5.5 Skip-Hu / furiten-like rule

Per PDF (page 22): *"if a player skips a discard that could be claimed for 'Hu', then this player is not allowed declare 'Hu' until taking a tile from the wall, but except situation when winning hand has a greater value."*

State: `PlayerState.furiten = { since: turnNumber, minFanToOverride: missedFan }`. Cleared on the player's next self-draw (set to `null`).

This blocks Hu via discard claim when the new winning hand's fan would be ≤ `minFanToOverride`. Self-draw Hu is never blocked.

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
| `POST` | `/api/lobby` | Create lobby. Returns `{ code, hostToken }`. |
| `GET`  | `/api/lobby/:code` | Pre-join check. Returns `{ exists, players: PublicLobbyView }`. |
| `GET`  | `/api/replay/:id` | Returns persisted action log for a completed round. |
| `GET`  | `/healthz` | Liveness. |
| `GET`  | `/j/:code` | Static client entry point with code prefilled. |

Lobby codes: 4 chars, alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (excludes I/O/0/1). 32^4 ≈ 1M codes.

### 6.2 WebSocket: `/ws/:code?token=…`

Token is hostToken (issued at lobby create) or playerToken (issued on `join`). Server validates and binds connection to a seat.

### 6.3 Client → Server messages

```ts
export type ClientMsg =
  | { t: 'join'; name: string }
  | { t: 'leave' }
  | { t: 'addBot'; difficulty: 'easy' | 'medium' }     // host only
  | { t: 'kickBot'; seat: Seat }                        // host only
  | { t: 'startGame' }                                  // host only, requires 4 seats filled
  | { t: 'action'; action: GameAction };
```

### 6.4 Server → Client messages

```ts
export type ServerMsg =
  | { t: 'lobby'; players: LobbyPlayer[]; canStart: boolean; isHost: boolean }
  | { t: 'view'; view: PlayerView; events: GameEvent[] }    // sent after each state change
  | { t: 'roundEnd'; results: RoundResult }
  | { t: 'error'; code: string; message: string };
```

Server pushes `view` to each player after every state-changing action (filtered through `projectView`). `events` is a delta log so the client can animate ("seat 2 claimed pung", "kong on 3-pin from seat 1").

### 6.5 Reconnection

- Player tokens stored in `Map<token, {code, seat}>` (in-memory).
- On disconnect, server holds the seat for 60s. Reconnect with same token resumes.
- After 60s: bot takes over the seat for the rest of the round. Original player can reclaim seat at the next round.
- Host disconnect = server keeps running. Host reconnection re-binds host token. If host loses their token (cleared cookies), no recovery — they need to restart the server.

---

## 7. Bots

Heuristic, server-side. Each bot subscribes to its own `PlayerView` and emits `GameAction`s through the same path as humans.

### 7.1 Easy bot (v1)

- **Huan selection:** pick 3 tiles of the suit with fewest tiles (overlaps with intended void suit).
- **Void declaration:** pick suit with fewest tiles. `firstDiscard` = first tile of that suit if any; otherwise indicator.
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

Mobile-first. Portrait phone is the design target; tablets and desktop scale up cleanly.

### 8.1 Screens

1. **Landing** — "Host" and "Join" buttons. Host info text: "runs the server on this machine; share the URL with friends." Join flow accepts a URL or a code if already on the host's network.
2. **Host setup** — show share URLs (LAN + Tailscale if available) as text + tap-to-copy + QR code, list joined seats, "Add bot" / "Remove bot" controls, "Start" button (disabled until 4 seats filled).
3. **Join** — code input (auto-uppercased, 4 chars) + name input. Pre-filled if URL was `/j/CODE`.
4. **Lobby (joiner view)** — waiting state, list of players, "Leave" button.
5. **Game** (the main screen):
   - **Top:** opponent across the table — back-of-tile hand strip, exposed melds, recent discards.
   - **Left/right:** opponents to either side — vertical hand backs, melds, discards.
   - **Bottom:** your hand (tappable, sorted), your melds, your discard row.
   - **Center:** shared discard pool with last-discard highlighted. Wall-remaining counter. Current-turn arrow.
   - **Floating action panel:** appears during claim windows. Pung / Kong / Hu / Pass buttons + countdown bar. Big touch targets.
   - **Top-right:** running score deltas per player.
   - **Top-left:** round phase indicator (huan / void / playing).
   - **Furiten badge:** visible to your own seat if you're in furiten state (skip-Hu locked until next self-draw). Tooltip explains the rule.
6. **Round end** — score breakdown table, hand reveals (face-down voids revealed), penalty annotations (false Hu / void-at-end / kong refund), "Next round" button.

### 8.2 Tile rendering

- Unicode mahjong glyphs (🀇–🀡) rendered in `<Tile>` component. `<TileBack>` for hidden tiles.
- Long-press tile: 2× preview modal.

### 8.3 Interactions

- Tap a hand tile: select (visual lift). Tap again to discard.
- Long-press tile: 2x preview.
- Claim buttons: single tap commits. Pass is single tap; engine applies to all simultaneous claims.

### 8.4 State management

- Zustand store mirrors latest `PlayerView` from server. UI reads `view.yourLegalActions` to enable/disable buttons — no client-side rule logic.
- Optimistic local state only for tile selection / drag preview. Committed actions wait for server `view` confirmation.
- WebSocket reconnect with exponential backoff; "reconnecting…" toast.

### 8.5 Animations (Framer Motion 12)

- Tile selection: spring lift animation.
- Last-discard: pop highlight.
- Hu: celebration burst overlay.
- Reconnect toast: slide-in/out.
- Round-end: staggered score reveal.

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

Documentation surfaced on the Host setup screen explains how to share the host machine with friends:
1. Friend installs Tailscale (5-min setup; iOS/Android/macOS/Windows/Linux clients).
2. Host opens Tailscale admin console → Machines → mahjong-laptop → Share. Sends the share invite link.
3. Friend accepts (creates a free personal Tailscale account if needed).
4. Friend now has access to ONLY the mahjong machine — not the rest of the host's tailnet.
5. Friend opens the shared URL. Joins the lobby.

After step 4, every future game uses the same URL — no per-session re-sharing.

### 10.3 Startup output

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

### 10.4 Distribution

- **Primary:** npm package `sichuan-mahjong`, run via `npx sichuan-mahjong`. Requires Node 22+ on the host.
- **Secondary:** precompiled single binaries via `bun build --compile` for macOS arm64/x64, Linux x64/arm64, Windows x64. Released through GitHub Releases. No Node install required.
- **Config:** CLI flags `--port`, `--https-port`, `--no-mdns`, `--no-tailscale`, `--data-dir`. All optional with sensible defaults.

---

## 11. Testing strategy

### 11.1 Engine (must be airtight)

- Unit tests per module (tiles, melds, hand, scoring, claims, transitions).
- **Property tests** with fast-check:
  - JSON round-trip: serialize → parse → equal for any GameState.
  - Tile conservation: `applyAction` never changes total tile count of 108.
  - **Payment-matrix balance:** redistributive payments sum to zero, with non-redistributive penalty deltas tracked separately. The engine maintains `state.penaltyPot` (tracked separately from `scoreDelta`) for the 48-point void-suit penalties, which are pure deductions per PDF page 27 and 31. The property: `sum(scoreDelta) === -sum(penaltyPot)`. Redistributive flows (Hu payments, kong payments, false-Hu penalty, bu-ting payouts) net to zero in `scoreDelta`.
  - Hand detection: any constructively-built `4 sets + pair` hand is recognized as winning; randomly drawn 14-tile hands are usually not.
  - Tenpai detection: a tenpai hand has at least one tile-type completing it (subject to exhaustive-wait filter).
  - Furiten state: a furiten player's `yourLegalActions` never contains a discard-Hu action below `minFanToOverride`.
  - Compatibility table: `applyFans()` never produces a hand-result containing two mutually-incompatible fans per the matrix.
- **Replay tests:** canned action logs from real games → expected end states. Include at least one game per fan combination from §5.8.

### 11.2 Server

- Integration tests with fake WebSocket clients.
- **Bot-vs-bot smoke:** 100 full games with 4 easy bots. Assert no crashes, no rule violations rejected mid-game, average ≥1 hu per game, payment-matrix balance invariant holds for every game.
- Tailscale detection mock tests (unit-level): given mocked `tailscale status --json` outputs, verify URL generation.

### 11.3 E2E

- Playwright test: `e2e/game.spec.ts` — host + 3 bots, full round to round-end screen, replay 404, healthz.
- Game loop polls phase from Zustand store (not DOM) to avoid Framer Motion 12 pointer-event interception timing issues.

### 11.4 Packaging

- Smoke test: `node packages/server/dist/main.js --help` runs in CI.

### 11.5 CI

GitHub Actions: build engine → lint → typecheck → test (vitest) → build server + client → e2e (playwright) → package smoke.

---

## 12. Open questions / explicit deferrals

Tag in code as `// TODO(rule):` so they're greppable.

1. **Reconnection > 60s** — bot takeover is fine; revisit if it feels bad in playtest.
2. **Host shutdown midgame** — server dies when host quits. Other players see disconnect. Acceptable for v1.
3. **Match length** — ✅ Done: host starts each next round (`nextRound`; dealer rotates to `nextDealer` via `startNextRound`) or ends the match (`endMatch` → `matchEnd`). Running totals accumulate client-side across rounds.
4. **i18n** — English only in v1. Tile names use English + pinyin tooltips.
5. **Spectators** — out of v1. Architecture allows: a "view-only" token subscribing to a generic public view (no player hand exposed).
6. **Flower Pig house rule** — ✅ Done: opt-in `enableFlowerPig` config (default off); a non-Hu player ending with all 3 suits pays each opponent `2^fanCap`. See §5.9.
7. **Tailscale node-sharing automation** — manual via admin console in v1. Tailscale's API can automate this; v2.
8. **Set-with-void-suit meld penalty** — ✅ Done: 48-point deduction enforced on pung/kong/concealed-kong of voided suit (`voidMeldPenalty` event).
9. **False-Hu detection** — ✅ Done: 8 pts/opponent redistributive penalty + kong refund on invalid draw-Hu or claim-window Hu.
10. **Replay-test corpus** — ✅ Done: canned games per fan combination + penalty paths.

---

## 13. License & credits

- Code: MIT.
- Tile SVGs: per Wikimedia Commons, CC-BY-SA. Per-file attribution in `client/public/tiles/credits.json`, surfaced on `/about`.
- The CC-BY-SA license applies **only** to the SVG files shipped as separate assets in `client/public/tiles/`. The surrounding code remains MIT. Do not bundle, inline, or otherwise merge the SVGs into compiled JavaScript output — keep them as standalone fetched assets so the license boundary stays clean.

---

## 14. References

**Primary (canonical for v1):**
- Vitaly Novikov, *Sichuan Mahjong? It's that simple!* — authoritative ruleset reference.

**Secondary (used to validate ambiguities; some house-rule layers reflect their popular interpretations):**
- World Mahjong Tour — *Sichuan Mahjong Blood Battle Rules* (worldmahjongtour.live) — Heavenly/Earthly tournament scoring; Flower Pig casual rule.
- Mahjong Pros — *Beginner's Guide to Sichuan Bloody Rules* (mahjongpros.com) — independent SBR confirmation, furiten/skip-Hu.
- Baidu Baike — *Sichuan Mahjong* entry (baike.baidu.com) — Chinese-native source, regional terminology.
- GitHub kltm/sichuan-style-mahjong-rules — community ruleset.
- Riichi Wiki — Furiten article (riichi.wiki) — for canonical furiten semantics.

**Other:**
- Wikimedia Commons — *SVG Planar illustrations of Mahjong tiles* (tile graphics).
- Tailscale docs — [Sharing nodes](https://tailscale.com/kb/1084/share), [HTTPS certificates](https://tailscale.com/kb/1153/enabling-https).
