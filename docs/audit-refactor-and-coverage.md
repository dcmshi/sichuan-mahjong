# Audit — refactoring and test coverage (2026-08-04)

A sweep of the whole tree after the N40–N46 run, asking two questions: what can be
deleted or unified, and what is untested that matters. Measured with
`@vitest/coverage-v8` (added as a root devDependency for this audit; `pnpm test:coverage`
reproduces every number below).

**One real bug, seven dead symbols, four duplications worth collapsing, and one
coverage gap that matters more than its size** — the WS gateway's host-privilege
checks, which no test in the repo touches.

> **Status, 2026-08-04. All eight items (A41–A48) shipped the same day.** The
> sections below are the record of what was wrong, kept as written, each with a
> note on what changed. Diagnoses are in [history.md](./history.md).
>
> Final: **663 unit tests**, up from 624. Engine coverage 93.5% → **94.3%**
> (`state.ts` and `scoring.ts` now 100%), server 76.7% → **81.4%**
> (`persistence.ts` 41.1% → 89.7%, `tokens.ts` → 100%, `ws.ts` → 81.6%),
> client 42.5% → 42.9% with its pure-helper layer at 67.1%.
>
> **Two things this audit got wrong, both by undercounting.** It found six
> host-privilege gates; there are seven — `startGame` is the first one in the
> file. And it found two unreachable `chow` branches; there are seven, four of
> them in `hand.ts`, `scoring.ts` and `bot.ts`. Coverage had flagged two of those
> (`scoring.ts:214` was that file's only uncovered line) and the audit read past
> it. A reference scan finds definitions; only the compiler finds every use.

Each item carries the evidence and a size, so the order of work is a choice rather
than a guess.

---

## 1. Where coverage actually stands

| Package | Statements | Branches | Read |
|---|---|---|---|
| engine | **93.5%** | 84.0% | The rules are well covered. Gaps are in `views.ts` redaction paths. |
| server | **76.7%** | 83.0% | Room and bot logic strong; the boundary and the disk are weak. |
| client | **42.5%** | 89.6% | Misleading — see below. |

The client number is not a finding. CLAUDE.md's convention is that client tests run
without a DOM, so components and screens are 0% *by design* and covered by e2e instead.
The honest split:

- `src/*.ts` pure helpers — **65%**, and every extracted helper (`armedDiscard`,
  `discardPile`, `kongOffers`, `voidSelection`, `roundEnd`, `wind`, `helpExamples`,
  `session`) is at **100%**.
- `src/components` + `src/screens` — **~7%**, all of it incidental.

So the convention is being followed where it's been applied. The gap is the logic that
is *still inside components* and therefore reachable by neither unit tests nor, in
several cases, e2e. Section 4 lists the specific pieces.

One tooling note: the server coverage run reports `Timeout calling "onTaskUpdate"` as an
unhandled error. That is an instrumentation artifact, not a product fault — v8 coverage
makes `bot-smoke`'s ladder test ~6× slower (7s → 45s) and the worker RPC gives up
mid-test. All 167 server tests pass in that run.

---

## 2. The bug: spectator links die on a host restart — **fixed (A41)**

**`packages/server/src/room.ts:1050-1058`, `packages/server/src/tokens.ts:56`**

`restoreRoomsFromDisk` re-registers each room's **seat** tokens from `snap.tokens`, so
players reconnect into their seats after a restart. It never re-registers the room's
**watch** token, because `RoomSnapshot` has no field for one and `GameRoom.serialize()`
never captures it.

`watchTokens` is a module-level `Map`, so a fresh process starts empty. Every spectator
socket then fails `isWatchToken(code, watch)` at `ws.ts:296` and is closed with
`no_game` — for a game that is running fine and that players can still rejoin.

The two functions written for this path are both **dead**, which is how it surfaced.
`importWatchToken`'s own doc comment reads "Re-register a watch token on restore,
alongside the seat tokens" — it was written for a call site that never landed, and
`watchTokenFor` is the getter the serializer would have used.

Verified by running it, not by reading it. A throwaway test asserting both halves across
a `serialize` → `restoreRoomsFromDisk` cycle passes on the seat token
(`resolveToken(seatToken)` resolves) and fails on the watch token
(`isWatchToken` → `false`).

**Blast radius is small but non-zero.** Hosting runs with persistence off (free tier,
`getDb()` returns null), so the live service never restores anything. This bites LAN,
Tailscale and self-hosted runs with a database — exactly the deployments where the host
restarting mid-game is most likely.

**Fixed as described:** `watchToken?: string` on `RoomSnapshot`, populated from
`watchTokenFor` in `serialize()` and imported beside the seat-token loop. Optional, so
old snapshots still restore — the same shape `roundIndex` already uses. (It is spread
rather than assigned: `exactOptionalPropertyTypes` is on, so an explicit `undefined` is
not an absent field.) Five cases in `watch-token-restore.test.ts`, including that a
restored watch token still cannot resolve as a seat token. Confirmed to catch the
regression by reverting the fix: two of the five fail.

---

## 3. Dead code — **all deleted (A43, A47)**

Seven exported symbols with no reference anywhere in `packages/`, `e2e/` or `scripts/`
beyond their own definition. Notably, the coverage report found these independently:
the uncovered lines in `state.ts`, `limits.ts` and `tokens.ts` are *precisely* these
function bodies and nothing else.

| Symbol | Location | Note |
|---|---|---|
| `isVoidSuitTile` | `engine/src/state.ts:380` | An N46 leftover. It sits directly above `mustPlayVoidFirst` and duplicates one line of it. Exported from the engine barrel, so it's dead *public API*. |
| `revokeToken` | `server/src/tokens.ts:22` | Superseded by `revokeTokensForCode`. |
| ~~`watchTokenFor`~~ | `server/src/tokens.ts:51` | **Now live** — A41 wired it into `serialize()`. |
| ~~`importWatchToken`~~ | `server/src/tokens.ts:56` | **Now live** — A41 wired it into `restoreRoomsFromDisk`. |
| `limiterSizes` | `server/src/limits.ts:60` | Comment says "For tests and diagnostics"; no test calls it. |
| `getWsClient` | `client/src/ws/client.ts:151` | `sendAction` / `connectGame` / `closeConnection` cover every caller. |
| `WALL_EW_H` | `client/src/components/WallDiagram.tsx:243` | Comment says "exported only so the tests can say so"; `wall-diagram.test.ts` imports six other constants and not this one. |

Five are straight deletions. Two (`watchTokenFor`, `importWatchToken`) are the fix in §2
and should be kept.

A further ~12 symbols are exported but used only inside their own file — `botSpeedFrom`,
`FAN_CAPS`, `SECURITY_HEADERS`, `HSTS_HEADER`, `WALL_SIDES`, `deleteRoom` and friends.
Dropping the `export` keyword narrows each module's surface, but nothing is broken today
and `export` is load-bearing documentation in a couple of cases. Low value; batch it with
something else or skip it.

### The `chow` variant is unreachable

**`engine/src/melds.ts:15`**

`Meld` is a three-way union — `pung | kong | chow` — but **Sichuan has no chow claims**,
which the app itself states in `i18n/help.ts:32`. The engine only ever pushes `pung` and
`kong` (`actions.ts:773, 820, 861, 1243`); nothing anywhere constructs a chow meld.

Two live functions carry a branch that can never run:

- `playerSuitCount` (`actions.ts:289-300`) — five lines, and it is on the flower-pig
  payment path.
- `meldTileIds` (`MeldDisplay.tsx:8-15`) — three lines.

> **Undercounted: there were seven, not two.** Dropping the variant made the
> compiler name the rest — `meldToSetShape` (`hand.ts`), `meldTileTypes`
> (`scoring.ts`) and three in `bot.ts`: the visible-tile scan, the danger read and
> the flush estimate. Coverage had already pointed at two of them and this audit
> read past it. **A reference scan finds definitions; only the compiler finds
> every use** — for a type-level deletion, delete first and read the errors.

Dropping the variant deletes both branches and makes the type say what the game is.
It also removes a small trap: those branches read the `tiles` array, so anyone
"fixing" them has to invent semantics for a set that does not exist.

**Do not confuse this with `WinShape`'s chow** (`engine/src/hand.ts:10`), which is real
and correct — a *winning hand* absolutely contains runs; they just can't be claimed off
a discard. `roundEnd.ts:153` reads that one and is fine. Worth a line in
ARCHITECTURE.md so the next reader doesn't "restore" the meld variant for symmetry.

---

## 4. Duplication worth collapsing

### 4a. River cell construction, written three times — **fixed (A44)**

**`OwnZone.tsx:194-215`, `OpponentTop.tsx:31-41`, `OpponentSide.tsx:68-82`**

`splitPile` was extracted, but the layer on top of it — the `head` / `room` / `shown` /
`hidden` / `cells` construction that decides whether the declaration takes a cell, how
many discards fit, and how many are hidden behind `+N` — was copied into all three zones.
`OwnZone` carries a fourth variant (uncapped, plus the ghost).

This is the code N42, N43 and N44 each got wrong in a different seat, and each fix had
to be applied in more than one place. It is also pure, so it is exactly what CLAUDE.md's
"add UI logic the same way" convention asks for:

```ts
// client/src/riverCells.ts
export type RiverCell = { id: TileId; declared: boolean } | null;
export function riverCells(
  p: { discards: readonly TileId[]; firstDiscardIsVoid: boolean; pendingFirstDiscard: boolean },
  cap: number | null,
): { cells: RiverCell[]; hidden: number };
```

Three call sites collapse to one line each, and the corner rules the layout probe
asserts on (`declPos`, `riverEnds`) become unit-testable without a browser. **Highest
value item in this document** — it is the one place where the same class of bug has
recurred.

> **Shipped, with two deviations.** It went into `discardPile.ts` beside
> `splitPile` rather than a new `riverCells.ts` — same concern, and that module is
> already the shared tray helper. And it returns `hasDeclaration` alongside
> `cells`/`hidden`, because `OwnZone` needs it for the N43 ghost; it is the `head`
> all three were computing anyway. Column chunking stayed in `OpponentSide`, since
> `RIVER_ROWS` is that zone's geometry rather than the river's. A latent
> `slice(-0)` trap — a cap with no room showing *everything* — was fixed on the way
> through and has a test. Verified by 8 unit cases, e2e 12/12, and a probe run
> whose nine viewports came back numerically identical to N45's.

### 4b. `nameOf`, defined twice identically in one file

**`Game.tsx:352` and `Game.tsx:522`** — same body, same file, ~50 lines apart.

There is a third, *deliberately different* one in `EventFeed.tsx:80`: the Game copies
return `t('history.you')` for your own seat, the feed returns `view.you.name`. That
difference is correct and undocumented, which is the failure mode worth fixing — two
named exports (`nameWithYou`, `nameAsWritten`) make the choice explicit at each call
site instead of implicit in a copied lambda. `MatchEnd.tsx:25` is a genuinely different
fallback chain and should stay where it is.

### 4c. Hand-order reconciliation — **fixed (A46)**

**`OwnZone.tsx:133-141`**

The rule — keep the player's dragged order for tiles still held, drop what left, append
what arrived — is nine lines of pure list logic inside a `useEffect`, with a
`biome-ignore` on its dependency array. Zero tests. It governs whether a player's manual
arrangement survives a draw, a claim against them, and a re-deal.

Extracting `reconcileHandOrder(prev, hand)` is a two-line change at the call site and
makes those three cases assertable. Small, and it removes the only untested state
machine in the hand.

---

## 5. Test coverage gaps, in priority order

### 5a. Every host-privilege check in the WS gateway is untested — **fixed (A42)**

No file in `packages/server/tests` or `e2e/` contained the string `not_host`, `kickBot`
or `setBotDifficulty`. **Seven** authorization gates, all uncovered — the audit first
counted six and missed `startGame`, which is the first one in the file:

| Gate | Line | Guards |
|---|---|---|
| `startGame` | `ws.ts:409-412` | starting the match at all |
| `addBot` | `ws.ts:461-464` | seat-filling |
| `setBotDifficulty` | `ws.ts:495-498` | bot strength |
| `kickBot` | `ws.ts:514-518` | removing a player's opponent |
| `nextRound` | `ws.ts:554-563` | advancing the match |
| `endMatch` | `ws.ts:565-570` | ending everyone's game |
| `setBotSpeed` | `ws.ts:571-575` | table pace |

These are the difference between "a stranger with the 4-character code is a player" and
"a stranger with the code runs the table", on a service anyone can reach. `A8` put real
thought into seat 0 being host-only, and nothing checked that the gates built on it hold.

**No bug behind it — every gate works.** Worth stating plainly, and it is also why the
gap survived six audit passes: nothing was broken, so nothing drew attention.

`host-privilege.test.ts` covers all seven, each with a refusal *and* a positive control
— the control is what distinguishes a working guard from a typo'd message name, which a
negative-only test cannot. Where a refusal has an observable effect, the test asserts the
state is unchanged rather than only that an error frame arrived. Verified by mutation:
disabling all seven guards fails all seven cases. `ws.ts` went 68.2% → **81.6%**.

### 5b. `kickBot` indexes an array with an unvalidated wire value — **fixed (A45)**

**`ws.ts:520-521`**

```ts
const kickSeat = msg.seat;          // straight off the wire
const slot = lobby.slots[kickSeat];
```

Six lines above it, `setBotDifficulty` does the opposite, with a comment explaining
exactly why:

> Integer check before the index: `slots["0"]` reaches element 0 on a JS array, so a
> string seat off the wire would otherwise resolve.

`kickBot` is the case that comment warns about, missing the `isSeat` guard.

**Not currently exploitable.** `parseClientMsg` (`ws.ts:71`) is a bare `JSON.parse` with
a cast, so `msg.seat` is fully attacker-controlled — but the write at line 526 is gated
on `slot?.isBot` being truthy, and the reachable exotic keys (`"length"`, `"__proto__"`)
yield numbers or prototypes without an `isBot`, so they fall through to `not_bot`. The
one key that *does* resolve, `"0"`, happens to do the right thing on a JS array.

So: a hardening gap and an inconsistency, not a live vulnerability. Worth fixing because
the guard is one call, its sibling documents the reasoning, and the next edit to this
block should not have to re-derive that.

The broader observation is worth recording: CLAUDE.md says "the WS boundary trusts
nothing — inbound frames are validated in `ws.ts`", and that is true in effect but held
up by per-field discipline at ~20 case sites rather than by a validated parse. A schema
at `parseClientMsg` would make the invariant structural. That is a larger change than
this audit is proposing; noting it so the choice is deliberate.

### 5c. The persistence layer is never executed — **fixed (A48)**

`persistence.ts` is at **41%**, and every test that touches it (`restore-validation`,
`server`, `limits`, `seo`, and five more) `vi.mock`s the whole module. `getDb`,
`saveGameWithCode`, `saveLiveRoom`, `loadLiveRooms`, `deleteLiveRoom` and `getGame`
never run against a real `node:sqlite` database in CI.

The schema, the round-trip, and the `normalizeFans` migration path are all unverified.
This is also the layer §2's bug lives in. One integration test against a temp data
directory — write a room, read it back, restore it — would cover most of it.

> **Shipped.** Nine cases in `persistence.test.ts`, and the env var is
> `SICHUAN_DATA_DIR` (this audit called it `SM_DATA_DIR`). It has to be set before
> the first `getDb()`, which caches its handle in a module-level binding. The
> migration is covered *through the database* rather than as a unit, and the
> `ON CONFLICT DO UPDATE` upsert got its own case — a room re-persists on every
> state change, so the same code is written many times a round and the second push
> would otherwise be a key violation. 41.1% → **89.7%**.

### 5d. Smaller gaps

- **`networking.ts` — 46%.** mDNS, Tailscale detection and TLS cert discovery. Mostly
  environment-dependent and legitimately hard; the pure parts (interface selection, URL
  assembly) could be split out and tested. Low priority.
- **`views.ts` — 82%.** The lowest in the engine, and it is the redaction boundary that
  CLAUDE.md calls out as having leaked twice (A31 drawn tiles, A40 void declarations).
  The uncovered lines are spectator-projection paths. Worth a look, given the history.
- **`cli.ts` — 54%** and **`http.ts` — 71%.** Flag parsing and route handlers. `main.ts`,
  `server.ts` and `binary.ts` at 0% are composition roots — CI's `--help` smoke covers
  the wiring, and that is a reasonable place to stop.

---

## 6. Structural notes

**`room.ts` is 1091 lines holding four concerns**: the bot-pace module globals
(62-127), the `GameRoom` class (192-918), the room registry (`rooms`, `createRoom`,
`getRoom`, `deleteRoom`, `roomCount`, restore, flush, sweep), and snapshot validation
(937-998). Splitting the registry and the validator out would leave `GameRoom` at ~740
lines and make the import graph state what depends on what. No behavior change, moderate
churn, no bug attached to it — worth doing when something else brings you into the file,
not on its own.

**`actions.ts` at 1605 lines is fine.** It is 45 small, single-purpose functions behind
one `applyAction` entry point, at 95% coverage. Size here is cohesion, not sprawl.
Splitting it would mostly add imports.

**`i18n/index.ts` at 1789 lines is six catalogs of ~280 lines plus 50 lines of
machinery.** One file per language would make a translator's diff readable, and the
parity tests derive from `LANGS` so they would not notice. Pure churn otherwise —
optional.

---

## 7. What shipped

All eight, in this order, on 2026-08-04:

1. **A41** — watch-token restore fix + regression test (§2).
2. **A42** — WS host-privilege tests (§5a).
3. **A44** — `riverCells` extracted (§4a), the recurring-bug site.
4. **A43 / A45 / A47** as one cleanup batch — the dead symbols (§3), the `kickBot`
   guard (§5b), and the `chow` variant (§3).
5. **A46** — `reconcileHandOrder` extracted (§4c).
6. **A48** — persistence integration test (§5c).

**Still open: nothing from this audit.** §4b (`nameOf` defined twice in `Game.tsx`)
was left as filed — it is two identical lambdas fifty lines apart, and the third
copy in `EventFeed.tsx` is *deliberately different*, which is the part worth
recording rather than the part worth changing. §6's structural notes stand as
written: `room.ts`'s four concerns are worth splitting when something else brings
you into the file, `actions.ts` is cohesive rather than sprawling, and the i18n
split is optional churn. §5d's smaller gaps — `networking.ts`, `views.ts`,
`cli.ts`, `http.ts` — are unchanged, and `views.ts` at 82% is the one with history
behind it (A31 and A40 both leaked through that boundary).
