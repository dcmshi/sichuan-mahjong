# TODO

What is actually open. **Everything closed lives in
[docs/history.md](./docs/history.md)**, newest first, each entry with the diagnosis
that made it worth writing down — the phase log, the six audit passes (A1–A40), the
frontend pass (F1–F25), the viewport work (R1–R7), the tile rendering change, the
hosting work (C1–C10), and the feature run N1–N35.

Deferrals are also recorded as O1–O5 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).
O5 — per-IP limits keyed to a Cloudflare edge address rather than to the player —
is a **tested, accepted** trade-off rather than an open task; it is listed there
so it isn't rediscovered as a bug.

---

## Open

Two items, both in the discard trays, both left by N32 when it turned two seats'
tiles round and did not turn everything that goes with them. **Neither is a rule
or a leak — they are geometry.** Filed 2026-08-03.

N19 (a hard bot, and the ladder guard that found medium losing to easy) and N26
(the nine wind call sites) both shipped 2026-08-03, each written up in
[docs/history.md](./docs/history.md).

N23 left one thing open that is not a task: the four Japanese terms it had to
coin, because Sichuan has them and riichi does not — 欠け色, 金鉤釣, 槓上放銃,
花豚 — **want a native speaker's eye**. The borrowed ones do not.

### N36 — the right-hand seat's pile runs backwards, and its lap shows the seam

`OpponentSide` draws both side columns top-down, and a comment there says so
deliberately: N10 reversed the *across* pile because a horizontal row of readable
faces shows its own direction, and argued a column of sideways tiles does not.
N32 then gave the right seat the opposite quarter turn (`.tiles-face-left`,
`rotate(-90deg)`) without revisiting that, and it turns out to break two things at
once.

**The order.** Sit at the right of a table facing the middle: the screen's bottom
edge is on your left and its top edge is on your right, so that seat's pile reads
**upward**. It currently reads downward, which is correct for the *left* seat —
facing the other way, the top edge is on its left — and the two columns have been
sharing one direction.

**The lap, which is the visible half.** The 22.5% overlap is the body band
measured **in from the right edge of the art** (index.css, and
[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md)): that strip is
outline, green and plate, and never ink. Turned +90° for the left seat, that edge
lands at the **bottom** of the on-screen tile, and `.tile-lap-v` pulls each tile up
by 22.5% so it covers the previous tile's bottom — the band, exactly. Turned −90°
for the right seat, the same edge lands at the **top**, so the identical negative
margin covers the art's *left* edge instead, where the face begins. That is why
one column looks flush and the other looks like tiles resting on each other.

So the fix is one change with two effects: reverse that column and lap it the
other way — `column-reverse` with the existing negative top margin, or DOM order
plus a negative bottom margin. **Check it against `viewport.spec.ts` rather than
by eye**: the vertical lap is a negative margin on the *box* (unlike the
horizontal lap, which shrinks the box and overflows the art), so these tiles
genuinely overlap and every rect the tray guard reads has to stay honest.
**Small**, and the sandbox (`scripts/tiles/sandbox.html`) draws lapped runs
without a server. Reported 2026-08-03.

### N37 — the across seat's declaration sits on the near side of its pile

Every seat puts its void declaration on the **far** side of its pile — furthest
from its owner, the way a tile pushed out onto the table ends up. Your own zone
reads hand, tray, declaration, going away from you. `OpponentTop` reads name,
declaration, tray, going away from the seat at the top of the screen, so that one
seat has it the near way round: between the player and their own discards.

This is N32 residue. That change turned the across *pile* 180° so it reads as
that seat's pile seen from the other side, and the declaration block above it —
its own `rotate-180` div, outside the tray — kept the position it had when the
pile was still drawn from the viewer's side. Moving the block after the tray in
DOM order is the whole fix, and the rotation each already carries is unchanged.

Worth doing with N36, being the same fault line: N32 turned the tiles and left
the things around them where they were. **Small.** Reported 2026-08-03.

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
