# Traps and settled decisions

The things that cost real time in this repo, and the decisions already made so
they are not relitigated. It began as a handoff from the viewport/density session
(2026-08-01) and outlived it, because the traps kept applying.

Nothing here is a status report — for what shipped and when, read
[history.md](./history.md), newest first; for what is open, [TODO.md](../TODO.md).

**This file and [CLAUDE.md](../CLAUDE.md) are not a long form and a short form of
one list**, which is how this header used to describe them. They divide by
subject: CLAUDE.md holds the *rules and geometry* invariants — winds, kongs, void
suits, the lap, the four seats' rivers — because those are what a session gets
wrong while writing game code. What is below is **CSS, layout and process**, with
the measurement behind each. Six items appear in both, in one line there and at
length here (the server restart after a rebuild, `VITE_E2E` builds, the tray
guard, Tailwind classes in e2e selectors, a local pass as weak evidence, and the
throwaway database); that overlap is deliberate, since CLAUDE.md is read every
session and this file is read when something has already gone wrong.

**How tiles are drawn has its own document**, and it is the one to read before
touching a tile: [handoff-tile-rendering.md](./handoff-tile-rendering.md).

---

## Decisions already made — do not reopen without a reason

**Layout**

- **Per-seat discard trays stay.** A central pool is a *fallback*, wanted because
  the middle of the board looked empty — and it is less empty now the wall is
  drawn there.
- **Freed horizontal space went to the hand, not to bigger tray tiles.** The hand
  is the only thing a player taps, and it was under the readability floor.
- **Fixed-size tiles keep their size when a run laps; only the hand grows.** A
  tray tile that drew 29% larger would take its rows 29% taller with it, and
  vertical budget is what R1–R7 was about.
- **Every zone centres on its content** — the hand (`w-full` on an inline-flex run,
  or `justify-center` does nothing), your melds and the ones across the table
  (`w-max mx-auto` inside a scroller, so the leftmost stays reachable once they
  overflow), and every tray (`w-fit mx-auto`, which still wraps because
  `fit-content` is `min(max-content, available)`).

**Rules and pacing**

- **換三張 is off by default** and host-opt-in. It is not in Novikov's ruleset.
- **The bot pace is a pace, not a rule.** A `GameRoom` field, not `GameConfig`: a
  replay of the same seed is identical at any value, and putting it in the config
  would make it part of the state and the snapshot. **`--bot-delay` outranks the
  lobby**, or a host who picked Slow would have the Playwright suite at 1.8s a move.
- **The claim window is a backstop, not a pace.** It closes the moment every
  eligible seat has acted, and anyone uninterested has Pass, so a long deadline
  costs time only when someone is genuinely deciding.

**Superseded, kept so they are not re-proposed**

- ~~Every tile on the board is flat.~~ Everything is the 3D art now; runs lap to
  hide the doubled bevel instead of removing it. The `flat` and `solo` props are
  gone, and so is `tiles/flat/`.
- ~~The flat cell reproduces the art's layer order in CSS.~~ Retired with it. The
  measurements it was built from are still good and are tabulated in the tile
  handoff — they are what the 22.5% lap is derived from.
- ~~Tiles are flush with a bottom bevel.~~ The art has no green on the bottom at
  all; that edge was R7's own invention.
- ~~Singletons keep the 3D art.~~ Everything does.

---

## Traps that cost time

**Layout and CSS**

- **A wrapping flex container defaults to `align-content: stretch`.** Spare
  cross-axis space goes to the lines and children are drawn *past their aspect
  ratio* — this is what made the side trays' tiles "way too long". `content-start
  items-start`, `min-h-0`, no `flex-1`.
- **Intrinsic size is load-bearing, in both directions.** Taking the tile art out
  of flow to overflow its box collapsed the hand to 9.3px — the art was the only
  intrinsic size in that chain, and `.tile-run` is `inline-flex`, so shrink-to-fit
  had nothing left to measure. The same fact inflated the wall: laid out with flex,
  each cell asked its row how wide it was while the row asked the cell, and the
  cycle resolved to the art's intrinsic 210px, so the side walls came out as wide
  as the whole square. **If a box is sized from content, know what the content's
  intrinsic size is.**
- **Tailwind's preflight caps images at `max-width: 100%`.** It silently clamps an
  image drawn wider than its box while every other computed value still reads
  correctly.
- **`justify-content` does nothing on a shrink-to-fit box.** `.tile-run` is
  `inline-flex`, so on a wide window the hand centred its tiles *within itself* and
  the whole run sat against the left edge.
- **An inline-level child gives its block wrapper a line box**, and the strut's
  descender leading lands underneath it — 6px under a 68px tile, which put the void
  mark's ring below the tile it marked. `display: flex` on the wrapper removes it.
- **Percentage margins resolve against the containing block's *inline* size**,
  vertical ones included. Anything sized off a percentage margin needs that checked.
- **Centring a lapped run is not centring its boxes.** The tiles' visible extent
  starts half a bleed further left than their layout boxes, so a tray's content box
  has to sit half a bleed right of centre for the two to agree.
- **A positioned element paints after every in-flow sibling**, whatever the DOM
  order. The wall diagram needed a negative z-index to sit behind the discard, and
  `.play-well` an `isolation` so that index didn't put it behind the felt.

**Process**

- **Restart the server after any client rebuild.** `@fastify/static` is registered
  with `wildcard: false`, so the asset list is snapshotted at boot; a fresh bundle
  404s into the SPA fallback and the page dies with a MIME-type error on a
  `text/html` module script.
- **`pnpm e2e` needs port 8080 free.** Playwright starts its own server with
  `reuseExistingServer: false`.
- **`VITE_E2E=1` builds are for tests only.** Rebuild without it before handing the
  app to a human.
- **A local e2e pass is weak evidence for the layout guards.** R6 passed locally
  every time while failing CI three times running; CI has less slack. Poll the
  run. (The deal itself is no longer the variable — `playwright.config.ts` sets
  `SM_SEED`, so the suite plays the same round every time and a failure means the
  layout changed rather than the deal did. `pnpm shots` is still deliberately
  unseeded; see below.)
- **`pnpm e2e` and `pnpm shots` each get a throwaway database** under
  `test-results/`, because both run a *real* server and every lobby they open is
  written to `live_rooms` and restored at the next boot. One session of repeated
  e2e runs left 72 live rooms — above the hosted ceiling of 50 — before A79.
  Anything you start **by hand** still writes to the real one at
  `%APPDATA%\sichuan-mahjong\games.db`; clear it with the server stopped.
- **Playwright's `devices['iPhone SE']` is 320×568, not 375×568.** The whole R6 bug
  was the audit's numbers being measured at 375 while CI asserted at 320.
- **Don't put a Tailwind class in an e2e selector.** `ui-clicks.spec.ts` found
  discardable tiles with `li:not(.opacity-60)`, so changing the dimming silently
  broke four projects. There are `data-` hooks for both cases now
  (`data-discardable`, `data-void-tile`) — add one rather than reaching for a class.
- **`svg.getBBox()` must be called on the root.** Per-element boxes are in that
  element's own space and the pin dots sit in nested transformed groups.
- **Look at the screenshots `pnpm shots` produces.** It is an unseeded random game.
  `git show HEAD:docs/screenshot.png` into a scratch file and comparing is a cheap
  regression check — it is what caught the turn indicator truncated to "Y...".
- **The tray guard constrains how discards may animate.** `viewport.spec.ts`
  asserts no `.tile` inside a `.discard-tray` has a box outside that tray's,
  sampling every ~130ms for 90s. Animate in an overlay, or on opacity — never a
  transform on a tray tile.
- **Measure before chasing a visual bug.** The hand looked clipped in the
  screenshots for a while; it wasn't, the captured image is just shorter than
  `window.innerHeight`. Two of the layout fixes above were found by reading
  `getBoundingClientRect` rather than by staring at a render.

---

## Verifying

The commands are in [CLAUDE.md](../CLAUDE.md#dev-commands). What matters here is
the order and the trust level:

```bash
pnpm --filter @sichuan-mahjong/engine build   # required before typecheck/test
pnpm lint && pnpm typecheck && pnpm test
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm e2e                                      # needs 8080 free
```

Push to `main` runs the same in CI. **Poll the run rather than assuming** — the
e2e suite is where the layout guards live, CI has less slack than a dev machine,
and a local pass has been wrong before (R6 passed locally three times running
while failing CI three times running).

Three things this list does not include, all deliberate, none of them a pass/fail:

- `pnpm test:coverage` — says a line ran.
- `pnpm --filter @sichuan-mahjong/engine mutate` — says something *depended* on
  it, which is the question worth asking of a guard. Not in CI either; ~900
  mutants and minutes to run
  ([ARCHITECTURE §11.7](../ARCHITECTURE.md#117-mutation-testing--would-the-tests-fail-if-the-code-were-wrong)).
- `node scripts/perf/interaction-probe.mjs` — says how long the player waits for
  the draw and the discard tap, at 4× CPU throttle. It asserts nothing, and its
  two headline numbers go frame-quantised once an interaction fits in a frame, so
  read the Event Timing line beside them
  ([ARCHITECTURE §11.8](../ARCHITECTURE.md#118-interaction-latency--how-long-until-the-player-sees-it)).
