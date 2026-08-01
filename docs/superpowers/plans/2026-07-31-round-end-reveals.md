# Round-End Hand Reveals and Score Breakdown — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At round end, reveal every player's hand and explain their score with an itemised, directional list of payments.

**Architecture:** The engine accumulates a `ledger` on `GameState`, derived from the payment events it already emits, inside the single `ok()` constructor every successful action returns through. `buildRoundResult` slices that ledger per seat and adds hands, melds and ready state to `RoundResult`, which already feeds players, spectators and the saved replay. The client renders expandable rows.

**Tech Stack:** TypeScript, Node 22, Vitest + fast-check (engine/server), React 18 + Tailwind + Zustand (client), Biome.

**Spec:** [docs/superpowers/specs/2026-07-31-round-end-reveals-design.md](../specs/2026-07-31-round-end-reveals-design.md)

## Global Constraints

- **The engine stays pure.** No I/O, no dependencies, randomness only through `rng.ts`.
- **Everything reaching a client goes through `views.ts` or `protocol.ts`.** Any new field needs a redaction decision. Here the decision is already made: reveals live on `RoundResult`, which is only built once the round has ended, and nothing is added to `PlayerView`.
- **Run `pnpm --filter @sichuan-mahjong/engine build` before typechecking or testing** anything outside the engine — server and client consume the built `dist`.
- **Lint is enforced in CI.** Finish each task with `pnpm exec biome check --write <changed paths>`.
- **Client tests run in Node with no DOM.** No jsdom, no testing-library. Anything worth asserting goes in the store, the transport, or an exported pure helper.
- **i18n keys must exist in all three catalogs** (`en`, `zh-Hans`, `zh-Hant`); `src/i18n/catalog.test.ts` fails the build on drift.
- **Commit after each task.** No `Co-Authored-By` trailer.

---

## File Structure

**Engine**
- `packages/engine/src/state.ts` — add `LedgerEntry` type and `GameState.ledger`; initialise in `createGame`. Change `HuRecord.fans` to `FanEntry[]`.
- `packages/engine/src/actions.ts` — add `ledgerEntriesFor` + `withLedger`; call from `ok()`; copy `ledger` in `clone()`; change the three `HuRecord` construction sites.
- `packages/engine/src/protocol.ts` — extend `RoundResult.players[]`.
- `packages/engine/tests/phase4.test.ts`, `phase3.test.ts`, `replay.test.ts` — literal `GameState` constructors need the new field.

**Server**
- `packages/server/src/room.ts` — `buildRoundResult` populates the new fields; `broadcastRoundEnd` and `addSpectator` reach spectators.

**Client**
- `packages/client/src/i18n/index.ts` — `fan.*`, `ledger.*`, `end.*` keys in three languages.
- `packages/client/src/roundEnd.ts` — **new**, pure helpers: fan formatting and ledger-line derivation. Separate from the component so the no-DOM tests can reach it.
- `packages/client/src/components/RoundEndRow.tsx` — **new**, one expandable seat row.
- `packages/client/src/screens/RoundEnd.tsx` — render rows.
- `packages/client/src/screens/Spectate.tsx` — round-over reveals.
- `packages/client/src/store/index.ts` — a spectator receiving `roundEnd` must not be navigated off the spectate screen.

---

## Task 1: Engine — ledger on GameState

**Files:**
- Modify: `packages/engine/src/state.ts`
- Modify: `packages/engine/src/actions.ts`
- Modify: `packages/engine/tests/phase3.test.ts`, `packages/engine/tests/phase4.test.ts`, `packages/engine/tests/replay.test.ts` (literal state constructors)
- Test: `packages/engine/tests/ledger.test.ts` (new)

**Interfaces:**
- Produces: `LedgerEntry` (exported from `state.ts`, re-exported by the package index) and `GameState.ledger: LedgerEntry[]`.

- [ ] **Step 1: Write the failing test**

Create `packages/engine/tests/ledger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.js';
import { createGame } from '../src/state.js';
import type { GameState } from '../src/state.js';

function fresh(): GameState {
  return createGame('ledger-seed', [
    { name: 'A', isBot: true },
    { name: 'B', isBot: true },
    { name: 'C', isBot: true },
    { name: 'D', isBot: true },
  ]);
}

describe('payment ledger', () => {
  it('starts empty on a new game', () => {
    expect(fresh().ledger).toEqual([]);
  });

  it('is never shared between an input state and its result', () => {
    // applyAction works on a clone, so a caller holding the old state must not
    // see entries appended to the new one.
    const s = fresh();
    const before = s.ledger;
    const r = applyAction(s, { t: 'claimWindowExpire' });
    expect(s.ledger).toBe(before);
    if (r.ok) expect(r.state.ledger).not.toBe(s.ledger);
  });
});
```

Behaviour tests for what actually goes *into* the ledger live in Task 2, once
there is a mapping to test, and Task 3, which checks it against real games.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run tests/ledger.test.ts`
Expected: FAIL — `ledger` does not exist on `GameState` (TypeScript error, and `toEqual([])` receives `undefined`).

`claimWindowExpire` is used because it is valid to *attempt* in any phase: the
test only cares about array identity, and asserts nothing about whether the
action succeeded.

- [ ] **Step 3: Add the type and field**

In `packages/engine/src/state.ts`, above `GameState`:

```ts
/**
 * One movement of points, derived from the payment events the engine emits.
 * Accumulated on the state (not in the server room) so it survives the
 * snapshot/restore path — a room-local accumulator would come back empty after
 * a host restart and quietly produce a wrong round-end breakdown.
 */
export type LedgerEntry = {
  reason:
    | 'hu'
    | 'kong'
    | 'kongRefund'
    | 'buTing'
    | 'flowerPig'
    | 'falseHu'
    | 'voidPenalty'
    | 'voidMeldPenalty';
  from: Seat;
  /** null for the non-redistributive penalties: they go to the pot, not a player. */
  to: Seat | null;
  amount: number;
  /** Qualifier where the reason alone is ambiguous: kong subtype, refund reason. */
  detail: string | null;
};
```

`detail` is `string | null` rather than optional on purpose: `JSON.stringify` drops `undefined`, and the round-trip property test compares parsed state to the original.

Add to the `GameState` type, next to `penaltyPot`:

```ts
  penaltyPot: number;
  /** Per-round payment log; see LedgerEntry. Reset by createGame. */
  ledger: LedgerEntry[];
```

In `createGame`'s returned object, next to `penaltyPot: 0,`:

```ts
    penaltyPot: 0,
    ledger: [],
```

- [ ] **Step 4: Copy it in clone()**

In `packages/engine/src/actions.ts`, inside `clone()`, add to the returned object:

```ts
    history: [...state.history],
    ledger: [...state.ledger],
```

- [ ] **Step 5: Fix the literal state constructors in tests**

Three test files build a `GameState` object literal and will now fail to typecheck. In each, add `ledger: [],` immediately after `penaltyPot: 0,`:

- `packages/engine/tests/phase3.test.ts`
- `packages/engine/tests/phase4.test.ts`
- `packages/engine/tests/replay.test.ts`

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run`
Expected: PASS — all 163 existing tests plus the 2 new ones.

- [ ] **Step 7: Commit**

```bash
pnpm exec biome check --write packages/engine
git add packages/engine
git commit -m "feat(engine): add a per-round payment ledger to GameState"
```

---

## Task 2: Engine — derive ledger entries from payment events

**Files:**
- Modify: `packages/engine/src/actions.ts`
- Test: `packages/engine/tests/ledger.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry`, `GameState.ledger` from Task 1.
- Produces: entries appended automatically by `applyAction` — no new public API.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/tests/ledger.test.ts`:

```ts
import { ledgerEntriesFor } from '../src/actions.js';
import type { GameEvent } from '../src/actions.js';

describe('ledgerEntriesFor', () => {
  it('maps each payment event to a directional entry', () => {
    const events: GameEvent[] = [
      { e: 'huPayment', from: 1, to: 0, amount: 4 },
      { e: 'kongPayment', from: 2, to: 0, amount: 2, subtype: 'concealed' },
      { e: 'kongRefund', from: 0, to: 2, amount: 2, reason: 'robbed' },
      { e: 'buTingPayout', from: 3, to: 1, amount: 2 },
      { e: 'flowerPig', from: 3, to: 0, amount: 8 },
      { e: 'falseHuPayment', from: 1, to: 3, amount: 8 },
      { e: 'voidPenalty', seat: 2, amount: 48 },
      { e: 'voidMeldPenalty', seat: 3, amount: 48 },
    ];

    expect(ledgerEntriesFor(events)).toEqual([
      { reason: 'hu', from: 1, to: 0, amount: 4, detail: null },
      { reason: 'kong', from: 2, to: 0, amount: 2, detail: 'concealed' },
      { reason: 'kongRefund', from: 0, to: 2, amount: 2, detail: 'robbed' },
      { reason: 'buTing', from: 3, to: 1, amount: 2, detail: null },
      { reason: 'flowerPig', from: 3, to: 0, amount: 8, detail: null },
      { reason: 'falseHu', from: 1, to: 3, amount: 8, detail: null },
      { reason: 'voidPenalty', from: 2, to: null, amount: 48, detail: null },
      { reason: 'voidMeldPenalty', from: 3, to: null, amount: 48, detail: null },
    ]);
  });

  it('ignores events that move no points', () => {
    const events: GameEvent[] = [
      { e: 'discarded', seat: 0, tile: 4 },
      { e: 'falseHu', seat: 1 },
      { e: 'roundEnd', reason: 'threeHu' },
    ];
    expect(ledgerEntriesFor(events)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run tests/ledger.test.ts`
Expected: FAIL — `ledgerEntriesFor` is not exported from `actions.ts`.

- [ ] **Step 3: Implement the mapping**

In `packages/engine/src/actions.ts`, directly above `function ok(`:

```ts
/**
 * Ledger entries for one action's events. Derived from the events rather than
 * pushed at each of the ~14 payment sites, so the two can never drift: if a
 * payment is emitted, it is logged.
 *
 * Every payment event uses the same direction convention — `from` pays `to`.
 * The two void penalties are pure deductions into `penaltyPot`, so they carry
 * no payee.
 */
export function ledgerEntriesFor(events: GameEvent[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const e of events) {
    switch (e.e) {
      case 'huPayment':
        out.push({ reason: 'hu', from: e.from, to: e.to, amount: e.amount, detail: null });
        break;
      case 'kongPayment':
        out.push({ reason: 'kong', from: e.from, to: e.to, amount: e.amount, detail: e.subtype });
        break;
      case 'kongRefund':
        out.push({
          reason: 'kongRefund',
          from: e.from,
          to: e.to,
          amount: e.amount,
          detail: e.reason,
        });
        break;
      case 'buTingPayout':
        out.push({ reason: 'buTing', from: e.from, to: e.to, amount: e.amount, detail: null });
        break;
      case 'flowerPig':
        out.push({ reason: 'flowerPig', from: e.from, to: e.to, amount: e.amount, detail: null });
        break;
      case 'falseHuPayment':
        out.push({ reason: 'falseHu', from: e.from, to: e.to, amount: e.amount, detail: null });
        break;
      case 'voidPenalty':
        out.push({ reason: 'voidPenalty', from: e.seat, to: null, amount: e.amount, detail: null });
        break;
      case 'voidMeldPenalty':
        out.push({
          reason: 'voidMeldPenalty',
          from: e.seat,
          to: null,
          amount: e.amount,
          detail: null,
        });
        break;
      default:
        break;
    }
  }
  return out;
}
```

Import the type at the top of the file — add `LedgerEntry` to the existing `import type { … } from './state.js'` list.

- [ ] **Step 4: Wire it into ok()**

`ok` is the only place in `actions.ts` that builds an `{ ok: true }` result (19 call sites), so this one change covers every action:

```ts
function ok(state: GameState, events: GameEvent[]): ActionResult {
  const entries = ledgerEntriesFor(events);
  if (entries.length > 0) state.ledger = [...state.ledger, ...entries];
  return { ok: true, state, events };
}
```

Mutating here is safe: `applyAction` already hands `ok` a `clone()`d state, never the caller's.

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write packages/engine
git add packages/engine
git commit -m "feat(engine): derive ledger entries from payment events in ok()"
```

---

## Task 3: Engine — ledger balance property test

**Files:**
- Modify: `packages/engine/tests/ledger.test.ts`

**Interfaces:**
- Consumes: `GameState.ledger` from Tasks 1–2.

This is the task that earns the ledger its keep: it checks the payment matrix from a second direction. The existing `sum(scoreDelta) + penaltyPot === 0` property is satisfied by any internally consistent set of transfers, including ones that never emitted an event. This one is not.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/tests/ledger.test.ts`:

```ts
import fc from 'fast-check';
import type { Seat } from '../src/state.js';

/** Signed total for one seat: it loses what it pays and gains what it receives. */
function ledgerTotalFor(state: GameState, seat: Seat): number {
  return state.ledger.reduce((sum, e) => {
    if (e.from === seat) return sum - e.amount;
    if (e.to === seat) return sum + e.amount;
    return sum;
  }, 0);
}

describe('ledger balance property', () => {
  it('a real game produces entries', () => {
    // Guards the tests below from passing vacuously on an always-empty ledger.
    expect(runFullGame('ledger-populated').ledger.length).toBeGreaterThan(0);
  });

  it('every seat total matches its scoreDelta, and pot entries match penaltyPot', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 4, maxLength: 12 }), seed => {
        const final = runFullGame(seed);

        for (const p of final.players) {
          expect(ledgerTotalFor(final, p.seat)).toBe(p.scoreDelta);
        }

        const potTotal = final.ledger
          .filter(e => e.to === null)
          .reduce((sum, e) => sum + e.amount, 0);
        expect(potTotal).toBe(final.penaltyPot);
      }),
      { numRuns: 25 },
    );
  });
});
```

`runFullGame(seed)` is the helper already used by the payment-balance property in `packages/engine/tests/phase4.test.ts`. Export it from there (`export function runFullGame`) and import it into `ledger.test.ts`, rather than copying it.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run tests/ledger.test.ts`
Expected: FAIL first with an import error until `runFullGame` is exported; then PASS.

If it fails on the assertion instead, **stop and report** — that means a `pay()` call somewhere mutates `scoreDelta` without emitting its payment event, which is a real engine bug and not something to paper over by loosening the test.

- [ ] **Step 3: Export the helper**

In `packages/engine/tests/phase4.test.ts`, change `function runFullGame(` to `export function runFullGame(`.

- [ ] **Step 4: Run the full engine suite**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write packages/engine
git add packages/engine
git commit -m "test(engine): assert the ledger reconciles with every seat's scoreDelta"
```

---

## Task 4: Engine — structured fan names

**Files:**
- Modify: `packages/engine/src/state.ts` (`HuRecord.fans`)
- Modify: `packages/engine/src/actions.ts` (three construction sites)
- Test: `packages/engine/tests/ledger.test.ts`

**Interfaces:**
- Produces: `HuRecord.fans: FanEntry[]` where `FanEntry = { fan: FanType; count: number }`, already exported from `scoring.ts`.

- [ ] **Step 1: Write the failing test**

Append to `packages/engine/tests/ledger.test.ts`:

```ts
describe('HuRecord fans', () => {
  it('carries structured entries, not pre-formatted English', () => {
    const final = runFullGame('fans-structured');
    const winner = final.players.find(p => p.hu !== null);
    expect(winner, 'seeded game should produce a winner').toBeDefined();
    for (const entry of winner!.hu!.fans) {
      expect(typeof entry.fan).toBe('string');
      expect(typeof entry.count).toBe('number');
      expect(entry.count).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run tests/ledger.test.ts -t "structured"`
Expected: FAIL — `entry.fan` is `undefined` because `fans` holds strings like `"AllPungs×2"`.

- [ ] **Step 3: Change the type**

In `packages/engine/src/state.ts`, in `HuRecord`:

```ts
  fans: import('./scoring.js').FanEntry[];
```

- [ ] **Step 4: Change the three construction sites**

In `packages/engine/src/actions.ts`, replace each of the three occurrences of

```ts
      fans: score.fans.map(f => `${f.fan}${f.count > 1 ? `×${f.count}` : ''}`),
```

with

```ts
      fans: score.fans,
```

(They are around lines 595, 1434 and 1480. `score.fans` is already `FanEntry[]`.)

- [ ] **Step 5: Run the full engine suite**

Run: `pnpm --filter @sichuan-mahjong/engine exec vitest run`
Expected: PASS. The compatibility-table check in `phase4.test.ts` only asserts `fans` is defined, so it is unaffected.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write packages/engine
git add packages/engine
git commit -m "refactor(engine): make HuRecord.fans structured so fan names can be localized"
```

---

## Task 5: Protocol + server — round result carries the reveals

**Files:**
- Modify: `packages/engine/src/protocol.ts`
- Modify: `packages/server/src/room.ts` (`buildRoundResult`, around line 645)
- Test: `packages/server/tests/server.test.ts`

**Interfaces:**
- Consumes: `LedgerEntry` (Task 1), `HuRecord.fans` (Task 4).
- Produces: `RoundResult.players[]` entries with `hand`, `melds`, `isReady` and `ledger`.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/tests/server.test.ts`, inside the existing top-level `describe`:

```ts
it('round result reveals hands, melds, ready state and a per-seat ledger', async () => {
  const room = await playRoundToEnd();
  const results = room.buildRoundResultForTest();

  for (const p of results.players) {
    expect(Array.isArray(p.hand)).toBe(true);
    expect(Array.isArray(p.melds)).toBe(true);
    expect(typeof p.isReady).toBe('boolean');
    // Every entry in a seat's ledger must actually involve that seat.
    for (const e of p.ledger) {
      expect(e.from === p.seat || e.to === p.seat).toBe(true);
    }
  }

  // The seats' ledgers together account for the whole round.
  const seen = new Set(results.players.flatMap(p => p.ledger.map(e => JSON.stringify(e))));
  const all = new Set(room.getState().ledger.map(e => JSON.stringify(e)));
  for (const e of all) expect(seen.has(e)).toBe(true);
});
```

`playRoundToEnd()` is the existing helper in that file that drives a bot game to `roundEnd`; reuse it rather than writing a new driver. `buildRoundResult` is private — add a thin `buildRoundResultForTest()` public method on `GameRoom` that calls it, alongside the existing `getState()`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter sichuan-mahjong exec vitest run tests/server.test.ts -t "reveals hands"`
Expected: FAIL — `p.hand` is `undefined`.

- [ ] **Step 3: Extend the protocol type**

In `packages/engine/src/protocol.ts`, replace the `players` field of `RoundResult`:

```ts
  players: Array<{
    seat: Seat;
    name: string;
    scoreDelta: number;
    hu: HuRecord | null;
    /** Concealed hand, revealed: RoundResult is only built once the round ended. */
    hand: TileId[];
    /** Fully revealed, including concealed kongs (secret only until now — A27). */
    melds: Meld[];
    /** Whether this seat was ready at the wall end — what explains a bu-ting line. */
    isReady: boolean;
    /** Every ledger entry where this seat is the payer or the payee. */
    ledger: LedgerEntry[];
  }>;
```

Add the imports at the top of `protocol.ts`:

```ts
import type { Meld } from './melds.js';
import type { TileId } from './tiles.js';
import type { HuRecord, LedgerEntry, Seat } from './state.js';
```

(`HuRecord` and `Seat` are already imported; extend that line rather than duplicating it.)

- [ ] **Step 4: Populate it**

In `packages/server/src/room.ts`, replace `buildRoundResult`:

```ts
  private buildRoundResult(): RoundResult {
    return {
      roundIndex: this.roundIndex,
      players: this.state.players.map(p => ({
        seat: p.seat as Seat,
        name: p.name,
        scoreDelta: p.scoreDelta,
        hu: p.hu,
        hand: [...p.hand],
        melds: [...p.melds],
        isReady: p.isReady,
        ledger: this.state.ledger.filter(e => e.from === p.seat || e.to === p.seat),
      })),
    };
  }

  /** Test seam for the round-result payload. */
  buildRoundResultForTest(): RoundResult {
    return this.buildRoundResult();
  }
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @sichuan-mahjong/engine build && pnpm --filter sichuan-mahjong exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write packages/engine packages/server
git add packages/engine packages/server
git commit -m "feat(server): reveal hands, melds, ready state and ledger in RoundResult"
```

---

## Task 6: Server — spectators receive the round result

**Files:**
- Modify: `packages/server/src/room.ts` (`broadcastRoundEnd`, `addSpectator`)
- Test: `packages/server/tests/server.test.ts`

**Interfaces:**
- Consumes: `buildRoundResult` from Task 5.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/tests/server.test.ts`:

```ts
it('a spectator joining at round end receives the round result', async () => {
  const room = await playRoundToEnd();
  const socket = new FakeSocket();
  room.addSpectator(socket as unknown as WebSocket);

  const roundEnd = socket.sent.find(m => m.t === 'roundEnd');
  expect(roundEnd, 'spectator should be handed the finished round').toBeDefined();
});
```

`FakeSocket` is the existing test double in that file — reuse it.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter sichuan-mahjong exec vitest run tests/server.test.ts -t "spectator joining at round end"`
Expected: FAIL — spectators only ever receive `spectate` messages.

- [ ] **Step 3: Broadcast to spectators**

In `packages/server/src/room.ts`, in `broadcastRoundEnd`, after the loop over `this.connections`:

```ts
    for (const ws of this.spectators) {
      this.send(ws, { t: 'roundEnd', results });
    }
```

And in `addSpectator`, so a spectator who arrives after the round settled still sees it:

```ts
  addSpectator(ws: WebSocket): void {
    this.spectators.add(ws);
    if (!this.started) return;
    this.send(ws, { t: 'spectate', view: projectSpectatorView(this.state), events: [] });
    // Mirrors the A9 player path: a client arriving at round end is handed the
    // finished round directly rather than waiting for a broadcast that already happened.
    if (this.state.phase === 'roundEnd') {
      this.send(ws, { t: 'roundEnd', results: this.buildRoundResult() });
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter sichuan-mahjong exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write packages/server
git add packages/server
git commit -m "feat(server): send the round result to spectators too"
```

---

## Task 7: Client — store keeps spectators on the spectate screen

**Files:**
- Modify: `packages/client/src/store/index.ts`
- Test: `packages/client/tests/store.test.ts`

**Interfaces:**
- Produces: `roundResult` populated for spectators without a screen change.

A spectator now receives `roundEnd`, and the current handler unconditionally sets `screen: 'roundEnd'` — which would throw them onto the player round-end screen with its host controls. This task is what stops Task 6 from breaking spectating.

- [ ] **Step 1: Write the failing test**

Add to `packages/client/tests/store.test.ts`:

```ts
it('a spectator receiving roundEnd stays on the spectate screen', () => {
  useStore.setState({ screen: 'spectate' });
  useStore.getState().handleServerMsg(roundEnd(0, [10, -5, -5, 0]));

  const s = useStore.getState();
  expect(s.screen).toBe('spectate');
  expect(s.roundResult).not.toBeNull();
});
```

The existing `roundEnd(...)` helper at the top of that file builds the message; it will need the new required fields (`hand: []`, `melds: []`, `isReady: false`, `ledger: []`) added to each player it constructs.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @sichuan-mahjong/client exec vitest run tests/store.test.ts -t "stays on the spectate screen"`
Expected: FAIL — `screen` is `'roundEnd'`.

- [ ] **Step 3: Guard the navigation**

In `packages/client/src/store/index.ts`, in the `'roundEnd'` case, compute the target screen once and use it in both `set` calls:

```ts
      case 'roundEnd': {
        // Spectators get the same payload but must not be navigated onto the
        // player round-end screen; they render the reveals in place.
        const screen = get().screen === 'spectate' ? 'spectate' : 'roundEnd';
        const { roundIndex } = msg.results;
        if (get().countedRounds.includes(roundIndex)) {
          set({ roundResult: msg.results, screen });
          break;
        }
        const next = { ...get().matchScores };
        for (const p of msg.results.players) {
          next[p.seat] = (next[p.seat] ?? 0) + p.scoreDelta;
        }
        set({
          roundResult: msg.results,
          matchScores: next,
          countedRounds: [...get().countedRounds, roundIndex],
          screen,
        });
        break;
      }
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @sichuan-mahjong/client exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write packages/client
git add packages/client
git commit -m "fix(client): keep spectators on the spectate screen at round end"
```

---

## Task 8: Client — i18n keys and pure display helpers

**Files:**
- Modify: `packages/client/src/i18n/index.ts`
- Create: `packages/client/src/roundEnd.ts`
- Test: `packages/client/tests/round-end.test.ts` (new)

**Interfaces:**
- Produces:
  - `formatFan(entry: FanEntry, t: Translate): string`
  - `ledgerLines(ledger: LedgerEntry[], seat: Seat): LedgerLine[]` where
    `LedgerLine = { key: string; detail: string | null; other: Seat | null; amount: number }`
    and `amount` is **signed** from `seat`'s perspective.
- `Translate` is `ReturnType<typeof useT>` — import the type from `../i18n/useT.js` the way `components/Tile.tsx` does.

- [ ] **Step 1: Write the failing test**

Create `packages/client/tests/round-end.test.ts`:

```ts
import type { LedgerEntry } from '@sichuan-mahjong/engine';
import { describe, expect, it } from 'vitest';
import { type Lang, catalog, translate } from '../src/i18n/index.js';
import { formatFan, ledgerLines } from '../src/roundEnd.js';

const bound = (lang: Lang) => (key: string, vars?: Record<string, string | number>) =>
  translate(lang, key, vars);

describe('fan formatting (§12.11)', () => {
  it('localizes the fan name and shows a multiplier only when > 1', () => {
    expect(formatFan({ fan: 'AllPungs', count: 1 }, bound('en'))).toBe('All Pungs');
    expect(formatFan({ fan: 'AllPungs', count: 2 }, bound('en'))).toBe('All Pungs ×2');
    expect(formatFan({ fan: 'AllPungs', count: 1 }, bound('zh-Hans'))).toBe('碰碰胡');
  });
});

describe('ledger lines', () => {
  const ledger: LedgerEntry[] = [
    { reason: 'hu', from: 0, to: 1, amount: 4, detail: null },
    { reason: 'kong', from: 2, to: 0, amount: 2, detail: 'concealed' },
    { reason: 'voidPenalty', from: 0, to: null, amount: 48, detail: null },
  ];

  it('signs each amount from the seat’s own perspective', () => {
    expect(ledgerLines(ledger, 0)).toEqual([
      { key: 'ledger.hu', detail: null, other: 1, amount: -4 },
      { key: 'ledger.kong', detail: 'concealed', other: 2, amount: 2 },
      { key: 'ledger.voidPenalty', detail: null, other: null, amount: -48 },
    ]);
  });

  it('shows the same entry with the opposite sign to the other seat', () => {
    expect(ledgerLines(ledger, 1)).toEqual([
      { key: 'ledger.hu', detail: null, other: 0, amount: 4 },
    ]);
  });

  it('signed amounts sum to the seat’s score delta', () => {
    const total = ledgerLines(ledger, 0).reduce((s, l) => s + l.amount, 0);
    expect(total).toBe(-50);
  });

  it('every key it can emit exists in the catalog', () => {
    for (const line of ledgerLines(ledger, 0)) {
      expect(catalog.en[line.key], line.key).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @sichuan-mahjong/client exec vitest run tests/round-end.test.ts`
Expected: FAIL — `../src/roundEnd.js` does not exist.

- [ ] **Step 3: Add the catalog keys**

In `packages/client/src/i18n/index.ts`, add to the **English** dict (near the `end.*` block):

```ts
  'end.notReady': 'not ready',
  'end.ready': 'ready',
  'end.details': 'Show scoring details',
  'end.handValue': 'Hand value {n}',

  'fan.Kong': 'Kong',
  'fan.Root': 'Root',
  'fan.AllPungs': 'All Pungs',
  'fan.GoldenWait': 'Golden Wait',
  'fan.FullFlush': 'Full Flush',
  'fan.SevenPairs': 'Seven Pairs',
  'fan.WinAfterKong': 'Win After Kong',
  'fan.ShootAfterKong': 'Shoot After Kong',
  'fan.RobbingTheKong': 'Robbing the Kong',
  'fan.UnderTheSea': 'Under the Sea',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': 'Hu payment',
  'ledger.kong': 'Kong',
  'ledger.kongRefund': 'Kong refund',
  'ledger.buTing': 'Bu-ting',
  'ledger.flowerPig': 'Flower Pig',
  'ledger.falseHu': 'False Hu',
  'ledger.voidPenalty': 'Void-suit penalty',
  'ledger.voidMeldPenalty': 'Void-suit meld penalty',
  'ledger.total': 'Total',
```

Simplified Chinese:

```ts
  'end.notReady': '未听牌',
  'end.ready': '已听牌',
  'end.details': '显示计分明细',
  'end.handValue': '番数 {n}',

  'fan.Kong': '杠',
  'fan.Root': '根',
  'fan.AllPungs': '碰碰胡',
  'fan.GoldenWait': '金钩钓',
  'fan.FullFlush': '清一色',
  'fan.SevenPairs': '七对',
  'fan.WinAfterKong': '杠上花',
  'fan.ShootAfterKong': '杠上炮',
  'fan.RobbingTheKong': '抢杠胡',
  'fan.UnderTheSea': '海底捞月',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': '胡牌支付',
  'ledger.kong': '杠',
  'ledger.kongRefund': '退杠',
  'ledger.buTing': '查叫（不听）',
  'ledger.flowerPig': '花猪',
  'ledger.falseHu': '诈胡',
  'ledger.voidPenalty': '缺门罚分',
  'ledger.voidMeldPenalty': '缺门碰杠罚分',
  'ledger.total': '合计',
```

Traditional Chinese:

```ts
  'end.notReady': '未聽牌',
  'end.ready': '已聽牌',
  'end.details': '顯示計分明細',
  'end.handValue': '番數 {n}',

  'fan.Kong': '槓',
  'fan.Root': '根',
  'fan.AllPungs': '碰碰胡',
  'fan.GoldenWait': '金鉤釣',
  'fan.FullFlush': '清一色',
  'fan.SevenPairs': '七對',
  'fan.WinAfterKong': '槓上花',
  'fan.ShootAfterKong': '槓上炮',
  'fan.RobbingTheKong': '搶槓胡',
  'fan.UnderTheSea': '海底撈月',
  'fan.multiplier': '{name} ×{n}',

  'ledger.hu': '胡牌支付',
  'ledger.kong': '槓',
  'ledger.kongRefund': '退槓',
  'ledger.buTing': '查叫（不聽）',
  'ledger.flowerPig': '花豬',
  'ledger.falseHu': '詐胡',
  'ledger.voidPenalty': '缺門罰分',
  'ledger.voidMeldPenalty': '缺門碰槓罰分',
  'ledger.total': '合計',
```

- [ ] **Step 4: Write the helpers**

Create `packages/client/src/roundEnd.ts`:

```ts
import type { FanEntry, LedgerEntry, Seat } from '@sichuan-mahjong/engine';
import type { useT } from './i18n/useT.js';

type Translate = ReturnType<typeof useT>;

/** One ledger entry as the row for `seat` should read it. */
export type LedgerLine = {
  /** Catalog key for the reason. */
  key: string;
  /** Kong subtype or refund reason, for the qualifier; null when there is none. */
  detail: string | null;
  /** The seat on the other side, or null for a penalty paid to the pot. */
  other: Seat | null;
  /** Signed from this seat's perspective: negative when it paid. */
  amount: number;
};

/** "All Pungs" / "All Pungs ×2" — the multiplier only appears when it matters. */
export function formatFan(entry: FanEntry, t: Translate): string {
  const name = t(`fan.${entry.fan}`);
  return entry.count > 1 ? t('fan.multiplier', { name, n: entry.count }) : name;
}

/**
 * The ledger as one seat sees it. A redistributive entry appears in both the
 * payer's and the payee's ledger, so the sign is resolved here rather than in
 * the component.
 */
export function ledgerLines(ledger: LedgerEntry[], seat: Seat): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const e of ledger) {
    const paid = e.from === seat;
    if (!paid && e.to !== seat) continue;
    lines.push({
      key: `ledger.${e.reason}`,
      detail: e.detail,
      other: paid ? e.to : e.from,
      amount: paid ? -e.amount : e.amount,
    });
  }
  return lines;
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @sichuan-mahjong/client exec vitest run`
Expected: PASS, including the catalog-parity test.

- [ ] **Step 6: Commit**

```bash
pnpm exec biome check --write packages/client
git add packages/client
git commit -m "feat(client): add fan/ledger catalog keys and round-end display helpers"
```

---

## Task 9: Client — the expandable round-end row

**Files:**
- Create: `packages/client/src/components/RoundEndRow.tsx`
- Modify: `packages/client/src/screens/RoundEnd.tsx`

**Interfaces:**
- Consumes: `formatFan`, `ledgerLines`, `LedgerLine` (Task 8); `RoundResult` (Task 5).
- Produces: `<RoundEndRow player={…} rank={number} youSeat={Seat | null} defaultOpen={boolean} />`.

- [ ] **Step 1: Write the component**

Create `packages/client/src/components/RoundEndRow.tsx`:

```tsx
import type { RoundResult, Seat } from '@sichuan-mahjong/engine';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useT } from '../i18n/useT.js';
import { formatFan, ledgerLines } from '../roundEnd.js';
import { MeldDisplay } from './MeldDisplay.js';
import { Tile } from './Tile.js';

type Player = RoundResult['players'][number];

/**
 * One seat's round-end line, expandable to its revealed hand and the payments
 * that produced its score. Winners open by default — that is the row people
 * actually want to read.
 */
export function RoundEndRow({
  player,
  rank,
  youSeat,
  defaultOpen,
}: { player: Player; rank: number; youSeat: Seat | null; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const t = useT();
  const lines = ledgerLines(player.ledger, player.seat);

  return (
    <motion.div
      initial={{ x: -20 }}
      animate={{ x: 0 }}
      transition={{ delay: rank * 0.1 }}
      className={[
        'rounded-xl',
        rank === 0 ? 'bg-amber-600/60 border border-amber-400' : 'bg-black/20',
      ].join(' ')}
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 min-h-11 text-left"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-white/40 text-sm w-6">#{rank + 1}</span>
        <span className="text-xs text-green-300 w-12">{t(`wind.${player.seat}`)}</span>
        <span className="font-semibold flex-1 min-w-0 truncate">
          {player.name}
          {player.seat === youSeat && player.name !== t('landing.practiceName') && (
            <span className="ml-1 text-xs text-amber-400">{t('common.you')}</span>
          )}
        </span>
        {player.hu && (
          <span className="text-xs bg-red-700 px-1.5 py-0.5 rounded">{t('end.hu')}</span>
        )}
        <span
          className={`font-bold text-lg ${player.scoreDelta >= 0 ? 'text-green-400' : 'text-red-400'}`}
        >
          {player.scoreDelta > 0 ? '+' : ''}
          {player.scoreDelta}
        </span>
        <span className="text-white/40 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-4 pb-3 flex flex-col gap-2">
          <div className="flex flex-wrap gap-0.5">
            {player.hand.map(id => (
              <Tile key={id} id={id} size="sm" />
            ))}
            {player.melds.map((m, i) => (
              <MeldDisplay key={`m${i}`} meld={m} />
            ))}
          </div>

          {player.hu ? (
            <p className="text-xs text-amber-300">
              {player.hu.fans.map(f => formatFan(f, t)).join(' · ')}
              {player.hu.fans.length > 0 ? ' · ' : ''}
              {t('end.handValue', { n: player.hu.handValue })}
            </p>
          ) : (
            <p className="text-xs text-white/50">
              {player.isReady ? t('end.ready') : t('end.notReady')}
            </p>
          )}

          {lines.length > 0 && (
            <div className="flex flex-col gap-0.5 text-xs">
              {lines.map((l, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-white/60 flex-1 min-w-0 truncate">
                    {t(l.key)}
                    {l.detail ? ` (${l.detail})` : ''}
                    {l.other !== null ? ` · ${t(`wind.${l.other}`)}` : ''}
                  </span>
                  <span className={l.amount >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {l.amount > 0 ? '+' : ''}
                    {l.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
```

Note the entrance animates `x` only, never opacity — F11.

- [ ] **Step 2: Use it in RoundEnd.tsx**

In `packages/client/src/screens/RoundEnd.tsx`, replace the whole `{sorted.map((p, rank) => ( … ))}` block with:

```tsx
        {sorted.map((p, rank) => (
          <RoundEndRow
            key={p.seat}
            player={p}
            rank={rank}
            youSeat={seat}
            defaultOpen={p.hu !== null}
          />
        ))}
```

Add `import { RoundEndRow } from '../components/RoundEndRow.js';` and drop the now-unused `motion` import if nothing else in the file uses it (the trophy still does — check before removing).

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter @sichuan-mahjong/engine build && pnpm --filter @sichuan-mahjong/client typecheck`
Expected: clean.

- [ ] **Step 4: Look at it**

Run:
```bash
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm shots
```
Then open `docs/round-end.png`. Expect the winner's row expanded with hand, fans and payment lines; the others collapsed. **Do not commit the regenerated screenshots in this task** — `git checkout docs/` after looking, and refresh them deliberately in Task 11.

- [ ] **Step 5: Commit**

```bash
pnpm exec biome check --write packages/client
git add packages/client
git commit -m "feat(client): expandable round-end rows with hand reveal and payment lines"
```

---

## Task 10: Client — spectator reveals

**Files:**
- Modify: `packages/client/src/screens/Spectate.tsx`

**Interfaces:**
- Consumes: `RoundEndRow` (Task 9), `roundResult` on the store (Task 7).

- [ ] **Step 1: Render the result when the round is over**

In `packages/client/src/screens/Spectate.tsx`, read the result alongside the view:

```tsx
  const roundResult = useStore(s => s.roundResult);
```

and insert, directly above the `{[0, 1, 2, 3].map(seat => …)}` seat list:

```tsx
      {view.phase === 'roundEnd' && roundResult && (
        <div className="flex flex-col gap-2 px-2 pb-2">
          {[...roundResult.players]
            .sort((a, b) => b.scoreDelta - a.scoreDelta)
            .map((p, rank) => (
              <RoundEndRow
                key={p.seat}
                player={p}
                rank={rank}
                youSeat={null}
                defaultOpen={p.hu !== null}
              />
            ))}
        </div>
      )}
```

Add `import { RoundEndRow } from '../components/RoundEndRow.js';`.

`youSeat={null}` is what suppresses the "(you)" tag — a spectator holds no seat.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @sichuan-mahjong/client typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
pnpm exec biome check --write packages/client
git add packages/client
git commit -m "feat(client): show round-end reveals to spectators"
```

---

## Task 11: Replay compatibility, docs and screenshots

**Files:**
- Modify: `packages/server/src/persistence.ts` (replay read path)
- Modify: `ARCHITECTURE.md`, `TODO.md`, `CLAUDE.md`
- Modify: `docs/round-end.png`, `docs/spectate.png`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing test for old replay rows**

`HuRecord.fans` changed shape, so rows written before this change hold `["AllPungs×2"]`. Add to `packages/server/tests/server.test.ts`:

```ts
it('reads a replay row written before fans became structured', () => {
  const legacy = { fans: ['AllPungs×2', 'Kong'] };
  expect(normalizeFans(legacy.fans)).toEqual([
    { fan: 'AllPungs', count: 2 },
    { fan: 'Kong', count: 1 },
  ]);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter sichuan-mahjong exec vitest run tests/server.test.ts -t "written before fans"`
Expected: FAIL — `normalizeFans` is not defined.

- [ ] **Step 3: Implement and apply it**

In `packages/server/src/persistence.ts`, export:

```ts
/**
 * Replay rows written before HuRecord.fans became structured hold display
 * strings like "AllPungs×2". Parse them back rather than migrating the table:
 * the data is read-only history and a migration would rewrite a user's file.
 */
export function normalizeFans(fans: unknown): FanEntry[] {
  if (!Array.isArray(fans)) return [];
  return fans.map(f => {
    if (typeof f === 'object' && f !== null && 'fan' in f) return f as FanEntry;
    const [name, mult] = String(f).split('×');
    return { fan: name as FanEntry['fan'], count: mult ? Number(mult) : 1 };
  });
}
```

Import `FanEntry` from `@sichuan-mahjong/engine`, and apply it in `loadGame`
where the stored results are parsed — replace

```ts
    results: JSON.parse(row.results) as RoundResult,
```

with

```ts
    results: withNormalizedFans(JSON.parse(row.results) as RoundResult),
```

and add:

```ts
function withNormalizedFans(results: RoundResult): RoundResult {
  return {
    ...results,
    players: results.players.map(p =>
      p.hu ? { ...p, hu: { ...p.hu, fans: normalizeFans(p.hu.fans) } } : p,
    ),
  };
}
```

The test imports `normalizeFans` from `../src/persistence.js`.

- [ ] **Step 4: Run the full suite**

Run: `pnpm --filter @sichuan-mahjong/engine build && pnpm test`
Expected: PASS across all three packages.

- [ ] **Step 5: Run e2e**

Run:
```bash
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm e2e
```
Expected: 9 passed. `match.spec.ts` asserts `text=Match Total` and the match-end screen; neither moved.

- [ ] **Step 6: Refresh the screenshots**

Run: `pnpm shots`, then look at `docs/round-end.png` and `docs/spectate.png` to confirm the reveals render.

- [ ] **Step 7: Update the docs**

- `ARCHITECTURE.md` §8.1 — replace the round-end bullet (which currently says the screen does *not* reveal hands, and points at §12.11) with what it now does.
- `ARCHITECTURE.md` §12 — mark item 11 ✅ with where it landed, and restore the preamble to "All items below have since been implemented".
- `ARCHITECTURE.md` §6.4 — note that `roundEnd` now also goes to spectators, and §4 that `RoundResult` carries reveals.
- `ARCHITECTURE.md` §11.3 — add the ledger property test and the round-end helper tests.
- `TODO.md` — new section recording this work.
- `CLAUDE.md` — the Status section says "One open item"; there is now none.

- [ ] **Step 8: Commit**

```bash
pnpm exec biome check --write .
git add -A
git commit -m "feat: close out round-end reveals (§12.11) with docs and screenshots"
```

---

## Verification

The whole feature is done when:

```bash
pnpm --filter @sichuan-mahjong/engine build
pnpm typecheck     # clean
pnpm lint          # clean
pnpm test          # engine + server + client
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm e2e           # 9 passed
```

and `docs/round-end.png` shows a winner's row with its hand, fans and payment lines.
