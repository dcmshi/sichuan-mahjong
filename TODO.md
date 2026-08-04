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

One, and it is a **design call rather than a bug** — see below. Everything filed
on 2026-08-03 shipped the same day: N19 (a hard bot, and the ladder guard that
found medium losing to easy), N26 (the nine wind call sites), **N36** (the
right-hand seat's pile ran downward and lapped over ink), **N37** (the across
seat's void declaration sat on the near side of its pile), and **N38** (the side
seats' declarations moved beside their piles, and the board stopped rebuilding
itself when a pile opens). **N40–N44** followed on 2026-08-04 — the declaration in
your own river, the centre of the table, the declaration standing out of the lap,
the ghost plus the engine bug under it, and every river seated in its own chair.
Each is written up in [docs/history.md](./docs/history.md), with the full working
record in [docs/layout_investigation.md](./docs/layout_investigation.md).

### N39 — fit a side tray's count to the height it actually has

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
