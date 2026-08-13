# TODO

What is actually open. **Everything closed lives in
[docs/history.md](./docs/history.md)**, newest first, each entry with the diagnosis
that made it worth writing down — the phase log, the nine audit passes (A1–A67), the
frontend pass (F1–F25), the viewport work (R1–R7), the tile rendering change, the
hosting work (C1–C10), and the feature run N1–N46.

Deferrals are also recorded as O1–O5 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
O5 — per-IP limits keyed to a Cloudflare edge address rather than to the player —
is a **tested, accepted** trade-off rather than an open task; it is listed there
so it isn't rediscovered as a bug.

---

## Open

**Nothing.** The ninth full-repo code audit of 2026-08-13, filed as **A56–A67**,
closed the same day, all twelve items — and **A55** was written up alongside them,
having shipped on 2026-08-10 without ever reaching the record.

It ran as four sweeps. **The third came back clean** — no behavioural defect —
leaving two guards instead: a whole-round invariant test (**A66**) asserting the
things a payment balance cannot see, which is why A56 survived a hundred smoke
games; and `noUnusedLocals` in `tsconfig.base.json`, after six dead symbols had
accumulated with neither biome nor tsc configured to notice.

**The fourth changed axis — from "is the code self-consistent" to "are the rules
right"** — and finished the second pass N21 had deferred, checking Table 4 and
Table 9 against native-language sources rather than the PDF's authority
(**A67**). The values corroborate once the 番 convention is pinned; Table 9
disagreed with us in two cells, both symmetric, one of them real and one
unreachable. Chasing the real one found the larger half: a kong takes the last
tile of the wall and nothing noticed, so the discard after it never scored Under
the Sea. Working in
[docs/audit-payments.md](./docs/audit-payments.md).

Four were real defects in what a hand pays, who may see it, or how a bot plays.
**A56** is the one that fired on the ordinary path: a promoted kong collects 1
from each opponent before the robbing window, and those points were only
committed to `kongPaymentLog` when a window had actually opened — which it almost
never does, because robbing needs a seat waiting on exactly that tile. Every
refund reads that log, so the points could never come back. **A57** is its
mirror: the shoot-after-kong refund ran inside the per-winner loop, so two seats
winning on one discard reversed two kong groups. **A58** is the third redaction
leak of the same shape as A31 and A40 — `views.ts` withheld a winner's
decomposition and the `hu` event carried it anyway, to every opponent, mid-round.
**A62** is the one no guard could have caught: all three bots konged their own
void suit, collecting 6 against a 48-point penalty, because a kong that is legal
and ruinous breaks no rule and balances the ledger exactly.

The rest are a line each: **A59** a token comparison that threw on multi-byte
input instead of refusing it, **A60** the hard bot reading concealed kong suits
its own `visibleTileTypes` refuses to count, **A61** an empty `Map` left behind by
every started game, **A63** spectator sockets left open by `endMatch`, **A64** the
host's bot pace missing from the room snapshot, **A65** a rejoin deadline that
outlived its screen. Each has its diagnosis in
[docs/history.md](./docs/history.md).

Two were real scoring or payment defects — **A49**, the Root fan never firing in
a standard hand, which halved every payment off one; and **A50**, a kong's
promoted/postponed subtype taken off the wire, worth 3 points a frame, with the
PDF's second kong restriction closed alongside it. **A51** could seat a stranger
into a running game once in ~21,000 lobby creates. **A52** and **A53** were
convention and measurement: the engine now takes the clock instead of reading it,
and `isWinningHand` stops at the first shape (`isTenpai` 24.3ms → 12.5ms over 664
hands). **A54** ended by disproving its own premise — rejection sampling would
change 0 of 200,000 seeds' deals, not all of them, so the bias is left on the
honest ground that neither it nor its fix is observable.

---

The refactor/coverage audit of 2026-08-04 — the seventh full-repo pass, filed as
**A41–A48** — closed the same day, all eight items. The evidence is in
[docs/audit-refactor-and-coverage.md](./docs/audit-refactor-and-coverage.md) and
each has a diagnosis in [docs/history.md](./docs/history.md).

One real bug (**A41**, spectator links dying on a host restart), one gap that
mattered more than its size (**A42** — nothing anywhere tested a host-privilege
gate, and there was no bug behind it, which is why it survived six audit passes),
the river construction unified after three passes had each got it wrong in a
different seat (**A44**), and the rest cleanup: dead symbols, a missing `isSeat`
guard, an unreachable `chow` variant, the hand-order rule lifted out of a
`useEffect`, and the SQLite layer executed for the first time. **663 unit tests,
up from 624.** Coverage: engine 93.5% → **94.3%**, server 76.7% → **81.4%**,
with `persistence.ts` 41.1% → 89.7% and `tokens.ts` and `state.ts` at 100%.
`pnpm test:coverage` reproduces it.

Everything filed on 2026-08-03 shipped the same day: N19 (a hard bot, and the ladder guard that
found medium losing to easy), N26 (the nine wind call sites), **N36** (the
right-hand seat's pile ran downward and lapped over ink), **N37** (the across
seat's void declaration sat on the near side of its pile), and **N38** (the side
seats' declarations moved beside their piles, and the board stopped rebuilding
itself when a pile opens). **N40–N44** followed on 2026-08-04 — the declaration in
your own river, the centre of the table, the declaration standing out of the lap,
the ghost plus the engine bug under it, and every river seated in its own chair.
Each is written up in [docs/history.md](./docs/history.md), with the full working
record in [docs/layout_investigation.md](./docs/layout_investigation.md).

---

## Closed on the evidence

### ❌ N39 — fit a side tray's count to the height it actually has (won't do, 2026-08-04)

**The verdict first.** A round deals 13 tiles to each of four seats out of 108,
leaving 56 in the wall — so there are ~56 draws across a round and a seat's pond
peaks at **13–14 discards**, less whatever gets claimed away. The cap is 12. It
hides *the last one or two tiles of a round and nothing else*, and those are
counted in `+N` and one tap from being read in full (N33).

Rows of 8 and 10 were built and probed to check that. Eight fits every viewport —
but at 320×568 it spends **every** pixel of headroom (`slack` 0) and the box has
already parted from the art by 0.5px. Ten squashes outright at 320 and 360.
Measurements and screenshots in
[docs/layout_investigation.md §18.4](./docs/layout_investigation.md).

So the trade was: spend the smallest phone's whole vertical budget, and start
squashing the moment that seat pongs a third time, to reveal two tiles at the end
of a round that are already counted and already reachable. Not worth buying.

**Shipped since: eight rows.** The owner took the cap to 16 on 2026-08-04 anyway
(§18.5) — a seat's pond peaks at 13–14, so `+N` effectively stops appearing. The
cost is 320×568, which is left with no headroom at all; a seat there with a deep
river *and* two melds squashes. That viewport already squashed on two melds at six
rows — measured, identical numbers — so this deepens an existing tail rather than
opening a new one, and it was accepted knowingly. The clean fix is six rows below
600px tall and eight above, which wants the same `matchMedia` hook two other
deferred items want.

**The original defect is gone regardless** — N40 caps the tray's *height* at six
tiles however deep the pile gets, because the second row grows sideways. What is
below is the diagnosis, kept because the arithmetic is what any future attempt
would need. Reopen only if seats start discarding materially more than 14 times a
round, or if the side columns widen for some other reason.

<details>
<summary>The original diagnosis</summary>


A tray tile is a flex item in a column, so when the column runs short its **box**
shrinks. The art does not: `.tile-sideways .tile-face` is sized off `--tile-w`,
so it overflows the box and the lap eats past the 22.5% body band into the face.
At the extreme — late in a round, on a seat holding melds — the pile drew as a
stack of black outlines with no tile visible between them.

Two mitigations are in, and neither computes anything. N38 capped the pile;
**N40 replaced that cap with a river of six-tile rows, two of them — twelve
cells** (`RIVER_ROWS × RIVER_COLS` in `OpponentSide`) — so the second row grows
sideways and the tray's *height* stops at six tiles however deep the pile gets.
`+N` and N33's tap-to-open carry the rest. Below 600px tall, `--tile-w` drops the
whole tile to 24px proportionally, which is the one honest answer on this axis:
it moves box, art and both lap margins together, so the tile stays coherent and
the lap stays on the 22.5% band.

What is left open is that **the numbers are constants and the space is not.**
Measured after N40–N44 (`sideSlack` in the probe): a side column has 33px of
headroom to spare at 320×568 and 85–131px at 375×667, and a seat holding 3–4
melds wraps its chips to a second ~46px row that eats all of it. So the shortest
phone still draws 24px tiles where 32px would fit in the common case, and the
4-meld tail overshoots by ~5px even at 24px.

The fix is to compute the count from the height:
`1 + floor((h − padding − 32) / 24.8)`. The reason it is not already done is that
the height has to come from something that doesn't move — the tray is
content-sized, so dropping a tile shrinks the tray, which frees the space that
let you drop it, and a `ResizeObserver` on the tray's own box oscillates. Making
the discard row `flex-1 min-h-0` and measuring **that** breaks the loop, since
its height is set by the column rather than by the pile; the tray then anchors
inside it with `self-start` (left) / `self-end` (right).

The alternative — making the art shrink with the box — is the honest fix and the
hard one: the art is rotated, so its on-screen height is its pre-rotation
*width*, and CSS has no way to set a width from a box's height.

The same measurement would buy a second thing, which is why it is filed here
rather than as a layout item of its own: **more tiles per row.** A column of eight
at 32px is 205px against 156px for six, and a side column has 260px of slack at
390×844 — so the cap goes 12 → 16 with no width cost at all, where widening to
three rows costs the well enough to break it (§18.2). It needs the same
height-derived count, because 320×568 has 33px of slack and two more tiles cost
37px. Six a row is also the riichi convention the river is built on, so this is a
deliberate break rather than a free win.

Reported 2026-08-03, from N38's measurements. **Reviewed 2026-08-04 and left as
it is** — the three candidate fixes and what each costs are weighed in
[docs/layout_investigation.md §18.1](./docs/layout_investigation.md). Short
version: N40 removed the catastrophic case, what remains affects one 2016 device,
and the container-query route is the one to try first if it ever surfaces.

A **third row** in the side rivers was tried the same day and rejected on phones:
three rows need 117px against the 80px a column gets, and the 40px per side comes
out of the well hard enough to put 28 wall cells under the last discard at 375×667.
It also draws empty for most of a round. Tablets pass, but `RIVER_COLS` is a JS
constant, so tablet-only would need a `matchMedia` hook the client has none of —
the same one Bot 3's tall-screen layout wants. §18.2.

</details>

N23 left one thing open that is not a task: the four Japanese terms it had to
coin, because Sichuan has them and riichi does not — 欠け色, 金鉤釣, 槓上放銃,
花豚 — **want a native speaker's eye**. The borrowed ones do not.

---

## Shelved, with reasons

- **A central discard pool** (O3) — closed as **won't do**, 2026-08-03. It was
  three wishes in one, and two of them shipped by other means: N33 made every
  seat's full pile one tap away, so the trays' 10-a-side cap costs nothing, and
  `firstDiscardIsVoid` puts each seat's declaration above its own pile. The third
  was the layout motivation — an empty middle — and the well now holds the wall
  diagram, the last discard and the history control. What is left would be a
  fourth route to information already reachable by two, competing for the fullest
  part of the board. Reasoning in
  [ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
  Reopen only if the per-seat trays are themselves being reconsidered.

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.

- **The last three frontend-audit items** (2026-08-02), 17 of 20 having shipped.
  Keyboard hand reordering, modal focus trapping, and spectator parity for
  sound / move history / How-to-play. None is user-facing breakage, which is why
  they are the ones left; each with its reasoning at the top of
  [docs/frontend-audit.md](./docs/frontend-audit.md).
