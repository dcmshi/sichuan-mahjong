# Round-end hand reveals and score breakdown — design

**Date:** 2026-07-31
**Closes:** [ARCHITECTURE.md §12.11](../../../ARCHITECTURE.md#12-open-questions--explicit-deferrals)

## Problem

The round-end screen shows a rank, a wind, a name, a Hu badge and a score delta
per seat. It says what each player scored and nothing about why. ARCHITECTURE
§8.1 promised hand reveals and a fan/penalty breakdown from v1; neither was ever
built.

The data is not simply sitting on the wire waiting to be rendered:

| Piece | Available today? |
|---|---|
| Fan list, hand value, winning tile | Yes — `RoundResult.players[].hu` is a full `HuRecord`, but `fans` is pre-baked English (`"AllPungs×2"`) |
| Concealed hands | No — `PublicPlayer` exposes `handCount`, never `hand`. At round end `projectView` reveals concealed *kong* ranks and nothing else |
| Payment/penalty breakdown | No — payments exist only as transient `GameEvent`s that the client overwrites on every view. `RoundResult` carries one `scoreDelta` per seat |

So two of the three need the server to send more than it does today.

## Scope

In scope:

- Reveal all four hands (and melds) at round end, not just the winners'.
- An itemised, directional breakdown per seat: every payment as its own line,
  showing who paid whom.
- Spectators receive the same reveals.
- The breakdown persists into the saved replay.

Out of scope:

- Any change to in-round visibility.
- Animating the reveal.
- The match-end screen, which keeps showing totals only.

## Design

### 1. Engine — the ledger

`GameState` gains one field:

```ts
export type LedgerEntry = {
  reason:
    | 'hu' | 'kong' | 'kongRefund' | 'buTing' | 'flowerPig'
    | 'falseHu' | 'voidPenalty' | 'voidMeldPenalty';
  from: Seat;
  /** null for non-redistributive penalties: they go to the pot, not to a player. */
  to: Seat | null;
  amount: number;
  /** Qualifier where the reason alone is ambiguous: kong subtype, refund reason. */
  detail?: string;
};

// on GameState
ledger: LedgerEntry[];
```

A new round is built by `createGame` (via `startNextRound`), so the ledger
starts empty with no reset logic. `clone()` copies the array.

Chosen over accumulating in `GameRoom` because `GameRoom.serialize()` persists
`state` and not room-local accumulators: a host restart mid-round would leave a
room-level ledger half empty, the game would resume normally, and the round-end
breakdown would be quietly wrong. Chosen over accumulating on the client
because a reconnecting client is replayed only the current view (A9), a
spectator joining mid-round has missed everything, and the client cannot reach
`/api/replay/:id`.

### 2. Engine — where entries are appended

Eight payment event kinds (plus a bare `falseHu` marker that moves no money)
are emitted from roughly fourteen sites. Rather than touch each one, the ledger
is *derived* from the events the engine already produces, in the single
constructor every successful action returns through:

```ts
function ok(state: GameState, events: GameEvent[]): ActionResult {
  return { ok: true, state: withLedger(state, events), events };
}
```

`withLedger` maps payment events onto entries. `ok` is the only place in
`actions.ts` that builds an `{ ok: true }` result (19 call sites), so coverage
is total, and the ledger cannot drift from the events because it is derived
from them.

Mapping:

| Event | reason | to | detail |
|---|---|---|---|
| `huPayment` | `hu` | winner | — |
| `kongPayment` | `kong` | declarer | subtype |
| `kongRefund` | `kongRefund` | payee | reason |
| `buTingPayout` | `buTing` | ready player | — |
| `flowerPig` | `flowerPig` | opponent | — |
| `falseHuPayment` | `falseHu` | opponent | — |
| `voidPenalty` | `voidPenalty` | `null` | — |
| `voidMeldPenalty` | `voidMeldPenalty` | `null` | — |

`falseHu` (the bare marker event) and every non-payment event are ignored.

### 3. Protocol

`RoundResult.players[]` gains:

```ts
hand: TileId[];        // concealed hand at round end
melds: Meld[];         // fully revealed, including concealed kongs
isReady: boolean;      // what explains a bu-ting line
ledger: LedgerEntry[]; // every entry where this seat is the `from` or the `to`
```

and `HuRecord.fans` changes from `string[]` to `FanEntry[]` (`{fan, count}`) so
fan names can be translated.

A redistributive entry therefore appears in two seats' ledgers — once for the
payer and once for the payee. The client renders it signed from the perspective
of the seat whose row it is: negative when that seat is `from`, positive when it
is `to`.

Nothing is added to `PlayerView`, so there is no new in-round redaction rule to
reason about: `RoundResult` is only ever constructed once the round has ended,
which keeps the reveal at exactly one point in the codebase.

### 4. Reach

`buildRoundResult` already feeds three consumers, so the extra reach is small:

- Players — `broadcastRoundEnd` and the A9 reconnect path, unchanged.
- Spectators — broadcast the same payload to spectator sockets, which today
  receive no `roundEnd` message at all.
- Replay — `saveGameWithCode` persists the `RoundResult` as-is, so
  `/api/replay/:id` gains the breakdown for free.

### 5. Client

`RoundEnd.tsx` is ~130 lines and would roughly double, so the row becomes its
own component:

- `components/RoundEndRow.tsx` — owns the expand/collapse state, the revealed
  hand and melds, the fan list, and the ledger lines. Winners start expanded,
  everyone else collapsed.
- `RoundEnd.tsx` maps over the sorted players and renders the rows.
- `Spectate.tsx` reuses the same component for its round-over state.

New catalog keys in all three languages: `fan.<FanType>` for the ten fan types,
`ledger.<reason>` for the eight reasons, plus `end.notReady` and the
expand/collapse control's accessible name.

Existing conventions apply: the row header is a real `<button>` with
`aria-expanded`, tiles keep their localized labels (F16), and entrance
animation stays off opacity (F11).

### 6. Testing

Engine:

- Property test: for every seat, summing the ledger signed as above (minus when
  the seat is `from`, plus when it is `to`) equals that seat's `scoreDelta`;
  and every entry with `to: null` sums to `state.penaltyPot`. This is a genuine
  cross-check of the payment matrix from a second direction, not a restatement
  of it — it would have caught a payment that moved a score without emitting
  its event, which the existing balance property cannot see.
- The `GameState` JSON round-trip property test grows the new field.

Server:

- `buildRoundResult` includes hands, melds, ready state and a per-seat ledger.
- A spectator connected at round end receives the `roundEnd` payload.

Client (node, no DOM — so pure helpers, per the existing convention):

- The per-seat ledger-to-display-lines mapping, including a `to: null` penalty
  and a refund, asserted against the catalog so no key can go missing.
- Fan formatting: `{fan: 'AllPungs', count: 2}` renders localized in all three
  languages.

## Risks

**Replay format change.** `HuRecord.fans` changes shape, and rows already in a
user's SQLite file hold the old string form. Read defensively at the replay
boundary rather than migrating: treat a `string[]` as already-formatted and
display it as-is.

**Frozen hands are shown.** In bloody-to-end a player who wins early sits out
with a frozen hand, which will now be revealed. Correct, but a visible change
in what the screen shows.

## Open questions

None.
