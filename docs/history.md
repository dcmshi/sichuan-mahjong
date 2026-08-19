# History — every closed item, newest first

This is the record of work already done: the phase log (1–10), nine full-repo
audit passes (A1–A80), the frontend/design pass (F1–F25), the mobile viewport work
(R1–R7), the tile-rendering change, the hosting work (C1–C10), and the feature run
N1–N47. Each entry keeps its diagnosis, not just its fix — that is the part worth
having later.

**Live work lives in [TODO.md](../TODO.md).** This file only grows at the top, and
nothing in it is outstanding. It was split out of TODO.md on 2026-08-02, when that
file had reached 1,566 lines of which two were actually open.

---

## Find an item by its id

Code comments and docs cite bare ids — `(N38)`, `(A31)`, `(R6)`. This is where
each one is written up. **Ctrl-F the id including its bracket** (`N38)`) to jump
past this table to the entry itself.

Series: **N** features · **A** full-repo audits · **F** frontend/design ·
**R** mobile viewport · **C** hosting · **O** deferrals
([ARCHITECTURE §12](../ARCHITECTURE.md#12-open-questions--explicit-deferrals)).

| Ids | Entry |
|---|---|
| **A1–A39** | Not individually headed — they are the five *Audit backlog* passes and the sixth below them, each a numbered list. Grep the id. |
| **A40** | A void declaration leaked to every client |
| **A41** | The watch token that never came back |
| **A42** | Nothing tested a host-privilege gate |
| **A43, A45, A47** | The dead symbols, the missing guard, and the chow that never was |
| **A44** | One river, drawn three times |
| **A46, A48** | The hand arrangement, and the layer nothing had run |
| **A49** | The Root fan only ever scored in seven pairs |
| **A50** | A kong's subtype was worth 3 points and came off the wire |
| **A51** | A fresh lobby could be handed a live room's code |
| **A52** | The engine read the clock in two places |
| **A53** | The two micro-inefficiencies, measured first |
| **A54** | The modulo bias, and the reason it was filed being wrong |
| **A55** | A pung-entered turn is not after-kong |
| **A56, A57** | The two kong payments the refund log could not see |
| **A58** | The winner's hand went out in the event beside the view that hid it |
| **A59, A60, A61** | Three the size of a line each |
| **A62** | Every bot konged its own void suit |
| **A63, A64, A65** | Three things that outlived what they belonged to |
| **A66** | The pass that came back clean, and the two guards it left |
| **A67** | The fan table, checked against sources outside the PDF |
| **A68** | A stale bot decision could kill the room |
| **A69** | The snapshot check that only looked for missing fields |
| **A70–A76** | The seven remaining surfaces, swept in one pass |
| **A77–A80** | Auditing the audit: dependencies, mutation score, load, and what a failure leaves behind |
| **F1–F25** | *Frontend & design audit — seventh pass*, a numbered list. Grep the id. |
| **N2** | The dice are real now |
| **N3, N11, N14** | Help that shows a hand, a discard you can arm early, and a wall that reads the dice |
| **N4** | Animation pace is the player's, not the table's |
| **N5, N15, N17, N18** | Who controls the bots, and a sentence that agrees with itself |
| **N6, N9, N12** | Three small ones: the claim window, bot pace with no bots, and a feed stuck in one language |
| **N7, N13** | Whose turn it is, at both ends of the screen |
| **N8** | The claim bar covered the hand, and my first diagnosis was wrong |
| **N10** | The board is drawn from the table's centre |
| **N16** | The reveal shows the sets that won |
| **N19** | A third rung, and the discovery that the second one was below the first |
| **N20** | The sponsor button, and the two questions it was held for |
| **N21** | The payments check out; the fan cap does not |
| **N22** | Counterclockwise means seat-decreasing |
| **N23** | Six languages, and the parity guard that now scales |
| **N24** | The ⚙ menu reports the pace the table is actually on |
| **N25** | The dice overlay clears itself |
| **N26** | A wind is not a seat, in nine places |
| **N27** | The table chooses the fan cap |
| **N28** | The kong button names its tile, and says what it will do |
| **N29** | Your own hand shows the tile you won on |
| **N30** | You pick the tile that leads — and the amendment above it |
| **N31** | The lobby's Start button stays on screen |
| **N32** | Every seat's tiles face the middle of the table |
| **N33** | Tap a seat's pile to see all of it |
| **N34** | A suit is named one way, and the name is what is on the tile |
| **N35** | A support link and a source link, under the fold on purpose |
| **N36, N37** | Turning the tiles was only half of it |
| **N38** | The declaration beside the pile, and a board that stops rebuilding itself |
| **N39** | Closed **won't-do** — the diagnosis is in [TODO.md](../TODO.md), not here |
| **N40–N44** | The board, seated |
| **N45** | Eight rows a side — folded into N39's closure in [TODO.md](../TODO.md) |
| **N46** | The void suit you drew back |
| **N47** | The draw step and the discard tap, taken off the main thread |
| **R1–R4** | Mobile viewport remediation |
| **R5, R6** | The R5 guard was red in CI from the day it landed |
| **R7** | Tile density — and *The two melds gaps R7 left* above it |
| **C1–C7, C9** | It runs on a public URL |
| **C8** | **Deliberately not done** — persistence off is a config decision on the free tier; the checklist line lives inside the C1–C7 entry |
| **C10** | Search engines can read it |
| **O1** | The binary embeds the tile art on purpose |
| **O2** | Bots played faster than a player could follow |
| **O3** | Closed **won't-do** — reasoning in [TODO.md](../TODO.md) and ARCHITECTURE §12 |
| **O4** | One tile face everywhere |
| **O5** | An **accepted trade-off**, not a task — per-IP limits key to a Cloudflare edge address. ARCHITECTURE §12 |

---

## ✅ The draw step and the discard tap, taken off the main thread (N47 — 2026-08-19)

[docs/optimization.md](./optimization.md) measured the two interactions reported
laggy on phones — the server push at the draw, and the tap that raises a discard
— and ranked seven bottlenecks. All shipped except the PNG pipeline (its §4),
which the audit itself gates behind a re-measure.

- The two infinite animations that ran exactly while the player was choosing —
  the `hand-your-turn` ring and the last-discard pulse — animated `box-shadow`
  and `filter`, repainting the whole hand and re-rasterising an SVG every frame.
  Both now fade a pre-drawn ring's `opacity`, which the compositor does off the
  main thread. The blanket `transition: filter` on `.tile-face` moved to
  `.tile-run`, the only place a face's filter changes at runtime.
- The lift was a framer spring, which made every hand tile a `motion.div` at all
  times. It is a CSS transform on `.tile.is-selected` now, and `Tile` is only a
  motion component when it answers a gesture — which also retires the
  element-type-swap trap the old code carried a comment about.
- A tap used to re-render all fourteen `Reorder.Item`s. `HandTile` is memoised
  on primitives, owns its own stable ref registration, and is fed through a
  callback trampoline because `handleTileTap` closes over state that changes on
  every tap. A tap now re-renders one item.
- `handOrder` reconciled in an effect, so every draw committed OwnZone twice.
  Derived state during render instead: one commit, and no intermediate frame.
- The discard takeoff box was measured with `getBoundingClientRect` in the
  pointerup handler — a forced synchronous layout inside the input path. It is
  captured at pointerdown, when the frame is clean; a tap barely moves, so the
  box is still exact when the confirming pointerup lands. The keyboard path
  measures from the ref map, off the hot path.
- `WallDiagram` recomputed and re-rendered its 56 slots on every push, because
  `state` arrives as a fresh object each time. It is `memo` with a comparison on
  the state's three primitives, and `wallSlots` is memoised on the same.

Verified: typecheck, biome, the full unit suite, and the two guards the audit
names — `e2e/viewport.spec.ts` and `e2e/ui-clicks.spec.ts`, green on the rebuilt
client.

---

## ✅ Auditing the audit (A77–A80 — 2026-08-13)

Six axes that are not "read the code and find bugs": what we depend on, whether
the tests would notice if the code were wrong, what the thing does under load,
and what it leaves behind when it fails. Two came back clean and two did not.

### A77 — ten production vulnerabilities, on a live public URL

**`pnpm audit` had never been run this session.** Ten findings against
*production* dependencies, nine of them high, on a service anyone can reach.
Now zero.

The one that mattered is **`ws` >=8.0.0 <8.21.0, memory exhaustion from tiny
fragments** — a WebSocket game server on a 512MB free-tier instance is precisely
what that advisory describes, and **H1's 64KB `maxPayload` does not cover it**:
that caps a *message*, and the attack is an accumulation of *fragments*.
`@fastify/static` was two advisories deep (a route-guard bypass and an
authorization bypass via non-canonical paths) and needed a major, 9 → 10 — which
is why the e2e run is the load-bearing verification here, since every spec
serves its assets through it.

Three were transitive and went into `pnpm-workspace.yaml` beside the vite and
esbuild pins already there, each to the first patched version rather than to
`latest`, so the override says what it is for and expires when the parent
catches up.

**And the override I wrote first was too wide, which is its own lesson.** I
pinned `brace-expansion@>=2.0.0` on the reasoning that it is one function and
its majors are cheap. It is not: 5.x moved off a CommonJS default export and
`minimatch@9` threw. **Lint, typecheck, 738 unit tests and all 12 Playwright
specs passed with the tooling broken**, because the only thing in this repo that
walks a glob is the coverage reporter — which I had not run. Narrowed to exactly
the advisory's range. A validation suite is only as wide as the paths it touches.

Six dev-only findings remain and are noted rather than chased: the vite dev
server and postcss/nanoid under vitest, none of which ships. Bumping vite
collides with a **pre-existing** `@tailwindcss/vite` peer mismatch — it wants
`^6.4.2`, the tree has 8.0.13 — which predates this work and is worth its own
look.

### A78 — the tests, asked whether they would fail

Mutation testing, run for the first time. **81.83% overall** across
`scoring`/`hand`/`state`/`claims`: 722 mutants killed, 146 alive. `scoring.ts`
came out strongest at 92.3%, which is what a file with `scoring-cases.test.ts`
behind it should look like.

`claims.ts` was the outlier at **72.76%**, and its survivors were not scattered
— they clustered on exactly the things the rest of the suite reaches only
sideways. **The void-suit guard had no test at all.** The same line appears in
`canHuOnTile`, `canPungOnTile` and `canKongOnTile`, and all three survived being
replaced with `if (false)`: the three lines could have been deleted and every
one of the 738 tests still passed. That is not an idle branch — CLAUDE.md leans
on it twice, for N46 and for A62, whose whole argument is that no claim can
bring a void tile into a meld. **An invariant two shipped items rest on, with
nothing holding it up.**

Also alive: `ccwDist`'s arithmetic (`% 4` became `* 4` and nothing noticed), the
nearest-seat tie-break between two competing pung or kong claimants, and the
branch that auto-passes a seat which has already won. `claims.ts` is now 80.54%.

One survivor is left deliberately, and the test says why: `canHuOnTile`'s guard
is belt-and-braces, because `isWinningHand` already rejects a shape containing
the void suit — so **its mutant is not killable by any behavioural test**, and
inventing a control that passes for a different reason would be worse than
recording the fact.

Kept as `pnpm --filter @sichuan-mahjong/engine mutate`, with the baseline in
CLAUDE.md, because an analysis whose tool is thrown away cannot be re-run to
check drift. Two pieces of tooling hygiene came with it, both A76's shape — a
documented command that litters. Stryker's sandbox made `pnpm test` report **528
tests where there are 264**, green and meaningless, and `pnpm test:coverage`
wrote generated HTML that **broke `pnpm lint`**.

### A79 — the e2e suite was writing to the developer's real database

Unlike the unit suites, which `vi.mock` persistence, e2e runs a *real* server:
every lobby became a `live_rooms` row and every finished round a `games` row, in
`%APPDATA%`. Those are restored at boot and count against the concurrent-games
ceiling — the trap CLAUDE.md documents with a manual remedy. One session of
repeated runs left **72 live rooms**, above the hosted ceiling of 50.

The remedy is not to remember to clear it. `SICHUAN_DATA_DIR` now points at
`test-results/`, already gitignored as Playwright's own output.

**Half-fixed for a day.** The docs pass that followed found `pnpm shots` doing
the same thing through a config the fix never touched — a second Playwright
config, its own `webServer`, no override. It writes one lobby a run rather than
e2e's many, which is exactly why nobody would have noticed it. Both now get a
throwaway db. What still writes to the real one is whatever you start **by
hand**, `layout-probe.mjs` included, and that is deliberate: those are run
against a server you chose the flags for.

### A80 — load is fine, and a stall is now audible

**Measured rather than reasoned about**, which A61 and A63 were not: 50
concurrent rooms cost ~2MB of heap and play 40 rounds a second, and five
identical 50-room cycles held flat at +2.1MB over baseline — so the first
cycle's growth is warmup and rooms are genuinely released. No change needed.

The observability gap was real though. Logging is otherwise in good order —
every failure path carries a tagged `console.error` — but **a stalled room left
no trace at all**. A68 was exactly that, and the idle sweep is the only thing
that ever meets such a room. It now separates the two cases it was lumping
together: an unfinished round *with players still connected* is an error naming
the phase and the count, while everyone-left-and-the-bots-played-on stays at
`log`, because that is housekeeping. Any phase but `roundEnd` counts — a void
phase waiting forever on a submission that will never come is as dead as a turn
owed a draw, and the seats sitting in it cannot tell the difference.

---

## ✅ The seven remaining surfaces, swept in one pass (A70–A76 — 2026-08-13)

Everything the six earlier sweeps had named and not reached. Four real defects
in seven surfaces, and the three clean ones left guards behind.

### A70 — a frame that lands after the player has left

**`WsClient.close()` sets `closed`, calls `ws.close()` and drops its reference —
but left `onmessage` attached to the socket it had just abandoned.** A close is a
handshake, not an instant, so anything the server had already put on the wire
still arrived, and the store acted on it: a `view` landing after a tap on Leave
set `screen: 'game'` and **pulled the player back into the room they had just
left**; a stale `error` raised a toast over the landing screen; a stale `joined`
re-seated them.

`onclose` had always guarded on that flag. `onmessage` had not, and the
asymmetry is the whole bug. The threat is not a hostile server — it is ours —
it is simply that a socket does not stop mid-sentence.

### A71 — the WS boundary, reasoned safe and now executed

An earlier pass read this boundary and judged it sound. This is that judgement
run: every action type crossed with every hostile field value, ~4,000
combinations of `undefined`, `NaN`, `Infinity`, arrays, `__proto__`, a
10,000-character string, an object with `toString: null`.

**Nothing.** No throw escaped into the socket handler, no crafted frame moved the
game state, `Object.prototype` stayed clean, the server-only actions were refused
by name, and the room was still playable afterwards. The reasoning was right —
and it is now a test rather than an argument. The one failure in the run was the
harness labelling its own input with `String({ toString: null })`, which throws.

### A72 — a release script that could not fail

The binary path had never been executed by anyone. It works: `bun build
--compile` produces a 111 MB Windows executable that boots, serves the SPA with
correct content types, 404s a missing asset rather than falling back to the
shell, disables persistence exactly as A17 intended, and **plays a complete round
through to `roundEnd` with the deltas summing to zero.**

What is wrong is the script around it. Every target is attempted even when one
breaks — deliberate, so a single bad cross-compile does not hide the other four —
but the loop then printed `Done. Binaries in dist-bin/` and **exited 0 whatever
happened**. A run that produced nothing was indistinguishable from a clean one.
Found by running it: `bun-linux-x64` fails to extract its downloaded runtime on
this machine, which is Bun's problem and not ours, and the script called it
success, which is.

### A73 — the service worker, and a comment that blurred a distinction

No defect. The guards were added — a non-GET it must not intercept, a
cross-origin request it must not answer, a 404 it must not remember (the
stale-bundle case, where caching the failure would outlive the restart that
fixes it) — and all passed.

The comment was wrong, though: it described the whole cache-first set as
"content-hashed build output and static art" when **only `/assets/` is hashed**.
The icons, the manifest and the tile art are stable URLs, so cache-first means
they are frozen until `CACHE` is bumped. That is the right trade for art that
has not changed since it was drawn, but it is a coupling nothing enforced and
the comment actively obscured.

### A74 — placeholder parity, which key parity cannot see

`translate` does a blind `replaceAll('{k}', v)`, so a translated string that
**drops** a placeholder loses the value silently ("Join {code}" → a button naming
no room) and one that **invents or misspells** one renders `{n}` to the user
verbatim. Neither changes the key set, so the completeness test passes through
both.

All six catalogs are clean, and now guarded. The content spot-check found
nothing either: the fan names are properly localised rather than transliterated
(Japanese uses 嶺上開花 and 海底摸月, not the Chinese forms), the suit invariant
holds exactly, and N21's 点数-not-番数 fix is still in place — Japanese even uses
翻 rather than 番 for fan.

### A75 — three dialogs that claimed `aria-modal` and did not take focus

`useEscapeToClose` says it plainly: *"bound on the document rather than on the
overlay so it works without the overlay holding focus, **which none of them
currently take**."* Escape working was right; the missing half is that
`aria-modal="true"` is a **claim**, and it was not true.

What it claims is that everything outside the dialog is inert. A screen reader
was told a dialog had opened and then left its cursor on the tile the user
tapped, so they never heard it; Tab walked straight out into the board behind,
which the same attribute had just told the screen reader to ignore. Markup and
behaviour disagreeing is worse than not marking it a dialog at all.

`useDialogFocus` supplies the three things the attribute promises: focus enters
on open, Tab and Shift+Tab cycle within, and the previously focused element gets
it back on close — the last being what stops a keyboard user losing their place
on the board every time they glance at a discard pile. All 12 e2e specs still
pass, including the real-tap ones across five viewports.

### A76 — the tool you reach for once a year

**`measure-glyphs.mjs` has thrown `ERR_MODULE_NOT_FOUND` on every run since
`a3d13c1`.** It imports `flattenSvg` from `flatten-tiles.mjs`, which that commit
deleted when the app switched to drawing the untouched art — the generator went,
its consumer did not. CLAUDE.md went on listing the script as the way to
re-derive `glyph-boxes.json` if the source art changes.

Nothing noticed because nothing runs it, which is exactly the point: a tool used
once a year is broken for a year, and it breaks at the moment you finally need
it. `glyph-boxes.json` is **the evidence the 22.5% lap rests on** — the number
the whole tile-rendering design is built from — so losing the ability to
re-derive it matters more than the script's run count suggests.

The strip logic is inlined rather than restoring the generator, which was
deleted on purpose; only the measurement still has a job. **The repaired script
reproduces the committed `glyph-boxes.json` byte for byte**, which is how the
repair is known to be faithful rather than merely runnable. It also stopped
leaving its `.measure.html` scratch page in the tree, untracked and unignored,
one `git add -A` from being committed.

---

## ✅ The snapshot check that only looked for missing fields (A69 — 2026-08-13)

The sixth sweep, on the restore surface: **what a corrupted or partial snapshot
does to a booting server.** A41 built the validation after `restore` assigned
`snap.state` verbatim, and its comment states the standard plainly — *"silent
corruption is the worst outcome available, so an incompatible snapshot is
refused instead."* It was refusing exactly one kind of incompatibility.

**The check was presence-only.** `Object.keys` of a freshly created game, each
tested for `!== undefined`. So a snapshot with every field present and the wrong
*kind* in it passed and restored into the live registry. Sixteen mutations were
fed to it; ten got in, failing three different ways:

- **`hand` as a string is the worst**, because nothing goes wrong. It has a
  `.length`, so `projectView` reports a thirteen-tile hand as three and no error
  is raised anywhere. That is the silent corruption the comment is about.
- **`hand` as an object, or `melds` as a number, makes `projectView` throw** —
  so the room destroys every socket that touches it. And because it restored
  *successfully* its row was never dropped, so it came back on every boot. That
  is the repeating-restore-error failure the drop-on-invalid logic exists to
  prevent, reached from underneath it.
- `turn`, `phase` or `config` of the wrong kind leaves a room that is merely
  inert.

The kinds now come from the same fresh-game probe the field list does, so the
check stays self-maintaining. **Fields that are `null` in a fresh game are
exempt** — `lastDiscard`, a player's `hu` and the rest are legitimately either,
and a fresh deal cannot say which — which leaves a shallow gap and no deep one.

**Nothing looked at the envelope around `state` at all.** `restore` reaches
straight into `slots.map`, `isHumanSeat` and `tokens`; a row missing any of them
was dropped by the try/catch, which works but logs "restore threw" instead of
naming the field. All three are checked now.

**And the snapshot's own `code` was trusted over the column it was stored
under.** `restore` registers the room under `snap.code` while `live_rooms` is
keyed by the row — so a disagreement put the room in memory under one code and
left its row under another, unreachable by `deleteRoom` and restored again every
boot. The row's key is authoritative and a mismatch is now refused.

**Underneath all of it, one unreadable row took every healthy one with it.**
`loadLiveRooms` mapped `JSON.parse` over every row in a single expression, so a
truncated `snapshot_json` — a half-finished write, a corrupted file — threw
*before* any per-row handling could run. The caller's try/catch turned that into
"restored 0 rooms": every in-progress game on the disk lost, nothing dropped,
and the same thing again on the next boot. Parsed per row now, with an
unreadable one returning a `null` snapshot so that validation refuses it by name
and the existing drop path deletes it — the decision to drop a row stays in the
one place that already makes it.

**What is deliberately still not checked**, so the boundary is recorded rather
than implied: enum membership (`phase: 'bogus'` restores) and numeric ranges
(`drawIndex: -5`, `kongDrawIndex: 99999`). Both leave an inert or garbage room
rather than a silently wrong one, and validating them properly is
re-implementing the type system at runtime. Structural validation is where this
line is drawn.

---

## ✅ A stale bot decision could kill the room (A68 — 2026-08-13)

The fifth sweep, on the axis the other four could not reach: **`room.ts`'s
timers, driven two at a time.** Every prior audit checked them one at a time,
which is the only state a real table is never in.

**The room could stall dead, and nothing would say so.** Measured state at the
moment of death: `phase: 'play'`, `turn: 1`, `turnDrawNeeded: true`, no claim
window — and **zero timers pending**. Seat 1 is owed a draw and there is nothing
left in the process that will ever issue one. No error, no rejection, no log
line; from outside it is indistinguishable from a slow game.

**The mechanism is one assumption that is true of an instant and false across a
transition.** `scheduleBot` and `scheduleBotImmediate` share a single
`botPendingSeats` set, on the ground A26 states: a seat only ever has one
decision outstanding, because huan, void, claim and turn are mutually exclusive.
They are — *at any one moment*. They are not across a claim window closing:

1. A window opens; the bot at seat 1 is scheduled to decide, and takes its slot
   in `botPendingSeats`.
2. The **deadline expires first**, rather than that bot answering. The window
   force-passes and resolves, and the turn passes to seat 1.
3. `scheduleNext` reaches the draw path and calls `scheduleBotImmediate(1, …)` —
   which returns immediately, because seat 1 is still marked pending against the
   claim it no longer has.
4. The claim callback finally fires, finds no window, releases the slot and
   returns. Nothing re-evaluates. The room is owed a draw and has nothing
   scheduled to make it.

**Reachable by configuration rather than only by a crafted test**, which is what
moved it from curiosity to defect. The lobby clamps the bot pace to 5s and the
shortest claim window a host can pick is 8s, so the bot always answers first —
but `SM_BOT_DELAY_MS` was read straight into `paceOverride` **without the clamp
`setBotPaceMs` applies**, so the two ways of setting the same value disagreed
above 5s. That is fixed too: the env seam now takes the same ceiling as
`--bot-delay`, which the CLI help already documented.

**The fix is to make a declined decision re-evaluate rather than just release.**
Acting already re-enters `scheduleNext` through `afterStateChange`; declining now
does the same. It is general rather than aimed at this one sequence — any pending
decision whose precondition disappears now heals on the next tick — and it
terminates, because a bot only declines when the state has moved on, and the
schedulers dedup per seat. `scheduleNext` also gained the `ended` guard
`schedulePersist` already had, since the bot callbacks can now call into it.

**Eight of the nine adversarial scenarios passed first time**, which is worth
recording as much as the failure: teardown mid-claim-window leaves nothing
scheduled, a reconnect storm neither stalls the round nor takes the seat over
early, a stale socket close does not evict the live one (A5), `nextRound` with
bot work in flight starts cleanly (A32), a restored room whose deadline expired
while the server was down resumes, and fifty reconnects in a row schedule no
duplicate work. The timer handling was right everywhere the invariant held; it
failed in the one place the invariant itself does not.

---

## ✅ The fan table, checked against sources outside the PDF (A67 — 2026-08-13)

The fourth sweep, on the axis the first three never touched: **are the rules
right**, rather than is the code self-consistent. N21 checked every *payment*
against three outside sources and closed by saying Table 4 and Table 9 were "a
second pass with the same method". This is that pass. Full working in
[docs/audit-payments.md](./audit-payments.md); what follows is the diagnosis.

**The fan values corroborate, but only once the convention is pinned — and that
is most of the work.** Outside sources cannot be compared at face value because
they do not agree with each other on what 番 counts: Novikov's is an exponent
(`2^fan`, 0 fan = 1 point), the common Chinese app convention is 1-indexed
(平胡 = 1番, multiplier `2^(番−1)`), and a third family uses 番 as the multiplier
itself, which is where "清七对 48番" comes from. Converted to **doublings**,
which is convention-free, every value agrees — and the compositions fall out of
the addition rather than needing rows of their own, which is the real test:
清对 = 清一色 + 碰碰胡 = ×8, 清七对 = 清一色 + 七对 = ×16, both listed at exactly
those multipliers by a source that never derives them.

龙七对 is a real variant — ours is additive (七对 + 根 = ×8), one source gives ×16
— and is recorded rather than changed, the same call `fanCap` got.

**Table 9 disagreed in exactly two cells, and both were symmetric pairs.** The
PDF's table extracts with mangled columns, so the reading was checked a second
way: counting the `+` marks per row against our own incompatibility counts. Two
disagreements, each appearing in both directions, which is what a real matrix
produces and a misread one does not. Every other cell matched, including all
nine that can fire.

Shoot after Kong × Robbing the Kong is unreachable — a hand is won on a discard
*after* a kong or on the tile added *to* one, never both — and was corrected
anyway, because the table is a statement about the rules.

**Win after Kong × Under the Sea is real, and the outside source settles it
rather than the PDF's authority:** 萌娘百科 puts it plainly — Japanese mahjong
forbids the combination, Chinese Official and Sichuan allow it. We were the
outlier.

**Underneath it was the larger half.** Chasing whether that pair was reachable
found that a kong replacement comes off the tail, so **a kong declared with one
tile left takes that tile** — and `wallEndReached` was set only by `applyDraw`.
Three kong paths each drew the replacement inline and all three missed it, so the
round ran an action past its end and, worse, the discard that followed was not
"the discard after the last tile". A seat winning on *that* got no Under the Sea
fan at all, and that case is far more common than the kong-and-win one. Nothing
had ever tested it. `takeKongReplacement` is now the one definition all three
call.

Measured: a win on a kong replacement that was the last tile scored 2 fan and 4
points, and now scores 3 fan and 8 — a maximum hand at the default cap.

---

## ✅ The pass that came back clean, and the two guards it left (A66 — 2026-08-13)

The third sweep of the day found no behavioural defect. That is the finding, and
what it cost to establish is the part worth keeping.

**A whole-round invariant harness, and the three false alarms it opened with.**
`bot-smoke.test.ts` plays these same games and asserts one thing at the end:
`sum(scoreDelta) + penaltyPot === 0`. Real, and not enough — **A56 passed it for
the life of the bug**, because the payment was right and only the record of it
was missing. So the new guard asserts what a balance cannot see: where all 108
tiles are after *every* action, that every surviving kong payment reached
`kongPaymentLog`, that the derived ledger explains each seat's delta, and that a
winner holds 14 tiles plus one per kong.

Its first run reported 25 failures across 1000 games. All three signatures were
the harness being wrong, and each is worth writing down because each is a place
a tile legitimately sits that is not a hand, a meld or a pond:

- **A tile won off a discard is in no collection at all.** `takeClaimedDiscard`
  lifts it out of the pond and the `HuRecord` is the only thing holding it — and
  **two winners on one discard share one tile**, so the count is of distinct ids.
  Counting per winner made every multi-winner round read as a duplicated tile.
- **The fourth tile of a promoted kong sits in `pendingKongTile`** while the
  robbing window is open: out of the hand, not yet in the meld. One frame of
  "a tile went missing", once per promoted kong.
- **A robbed kong's payments are reversed on the spot and never logged**, which
  is correct — there is nothing left for a later refund to find. Counting
  `kongPayment` events against log entries without subtracting them flagged it.

Corrected, 1000 games across easy, medium, hard and mixed tables hold every
invariant, over 2049 wins, 1030 kongs and 700 multi-winner rounds. Thirty games
per table now run in the suite at ~4s.

**`noUnusedLocals` and `noUnusedParameters` are on.** A43 swept dead symbols by
hand and nothing stopped them coming back: biome's config does not flag an unused
import and `tsconfig.base.json` did not ask tsc to either. Six had accumulated —
`ccwDist` in `actions.ts`, `execSync` in `networking.ts`, `EW_H` in
`WallDiagram.tsx`, `setPlayerName` in `Landing.tsx`, a `Lang` type in two test
files, and a `const player` in `applyClaim` sitting directly under a comment
describing validation that was never written (it lives in `resolveWindow`, which
the comment now says). The class is a typecheck failure from here rather than
something a reader has to notice.

The rest of the pass was reading: the remaining server modules (`shanten`,
`rateLimit`, `profile`, `cli`, `seo`, `networking`), the client screens and
components not covered by the first two passes, and every literal `t('…')` key
checked against the `en` catalog. Nothing.

---

## ✅ Three things that outlived what they belonged to (A63, A64, A65 — 2026-08-13)

**A63 — `endMatch` closed the players' sockets and not the watchers'.** A11 closes
player sockets on teardown so a client ignoring `matchEnd` cannot keep sending
actions. Spectators were dropped from the set and left connected. Half of A11's
reasoning does not apply to them — a spectate socket carries no message handler,
so it can send nothing — but the other half does: it is a live connection with a
heartbeat on it, and one survived per ignored `matchEnd` for the life of the
process. The heartbeat only reaps a peer that stops answering pings, so an open
tab holds one indefinitely. Same list, both sets.

**A64 — the host's bot pace did not survive a restart.** Everything else a room
needs is inside `GameState` and rides along in `snapshot.state` for free; bot
pace is deliberately *not* in `GameConfig` (a replay of a seed is identical at
any value), which is exactly what left it out of the snapshot. A host who had
set the table to slow got it back on normal after a restart, silently.
`botSpeed?` is optional like `roundIndex?` and `watchToken?`, so an older
snapshot restores at the default — which is what it had.

**A65 — a rejoin deadline outlived its screen.** Landing arms a six-second
backstop because a stale token is not rejected: the server falls through to the
lobby handler and waits, so failure looks like silence. Its guard is "are we
still on the landing screen", which goes true *again* the moment a player who
rejoined successfully walks back out to the menu — so a good rejoin followed by
a Leave inside six seconds closed the fresh connection and raised "Could not
rejoin." over it. `Landing` unmounts on every screen change, so cancelling on
unmount is the whole fix. `PracticeSetup`'s start deadline has the same shape
and got the same treatment.

---

## ✅ Every bot konged its own void suit (A62 — 2026-08-13)

A concealed kong of the suit you declared void is legal, and it costs 48. That
penalty is not decoration: `applyVoidMeldPenalty` is called from three places and
this is the **only reachable one**, because `canPungOnTile` and `canKongOnTile`
each refuse a void-suit tile, so no claim can ever bring one into a meld. The
engine is right to offer the action.

All three bots took it. Each does `legal.find(a => a.t === 'declareKongOnTurn')`
and returns the first hit, and `getConcealedKongTypes` has no void filter — so a
seat dealt four of its void suit konged them on the turn it could, collecting 6
against a 48-point penalty. Measured: **−42 for the declarer against −2 each for
the other three**, in a game where the largest possible hand is worth 8. Those
four tiles can never sit in a winning hand, so there is no board on which it is
the move.

**No test could have caught it, and that is the interesting part.**
`bot-smoke.test.ts` asserts "no rule violations or balance errors" over 100
games — and this is neither. No rule is broken (the engine permits it), and the
ledger balances exactly (48 goes to `penaltyPot`). A bot playing to lose looks
identical to a bot playing badly, and the smoke test only knows about the rules.
The ladder assertion would not catch it either: it needs four of a specific void
type in one hand, which is rare enough to disappear into 40 deals of noise.

`kongWorthTaking` is now the one place any level asks for a kong, and it filters
the void suit. The regression test pins all four halves: that the engine still
offers it, that taking it really costs 42, that no level does, and that a kong
outside the void suit is still taken.

---

## ✅ Three the size of a line each (A59, A60, A61 — 2026-08-13)

**A59 — `isWatchToken` threw on input it was built to refuse.** The length guard
compared `candidate.length` against `expected.length`, which are *character*
counts, and then handed both to `timingSafeEqual`, which compares *bytes* and
throws when they differ. Thirty-six non-ASCII characters match a UUID's `.length`
and are 72 bytes, so `?watch=äää…` raised a `RangeError` inside the WS route.

Nothing crashed — `@fastify/websocket` caught it and destroyed the socket — but
the socket then closed with **no error frame**, where every other refusal closes
with `no_game`. A function whose entire job is to answer in constant time
answered differently, and the difference told you a watch token existed for that
code. Compare `Buffer.byteLength` and the two answers converge again.

**A60 — the hard bot's danger read included concealed kongs.** `dangerAgainst`
raises a tile's risk when the opponent has a meld in that suit, and it read
`o.melds` whole. A concealed kong's rank is hidden until the round ends (A27),
and the function twenty lines above it — `visibleTileTypes` — already refuses to
count one. So the two halves of the same bot's table read disagreed, and
[CLAUDE.md](../CLAUDE.md)'s claim that "hard sees no more of the table than
medium" was not true. `isConcealedKong` is now one definition and both ask it.
The ladder in `bot-smoke.test.ts` still holds.

**A61 — a started game left an empty `Map` behind, forever.** `startGame` hands
each lobby socket to the room and deletes the lobby's connection map, but
`bindGameSocket` replaces only the socket's *message* listener — the lobby's
`close` handler stays attached. It reached for the map through `getLobbyConns`,
which **creates one when it is missing**, so every game whose sockets eventually
closed left an entry under a code no sweep visits again. Unbounded on a
long-running host, invisible everywhere else: `sweepStaleLobbies` walks the lobby
store, and the lobby is gone by then. Read the map, never create it.

`removeAllListeners('close')` in `bindGameSocket` looks like the tidier fix and
is not — `startHeartbeat` registers its `clearInterval` on the same event, so
that trade a two-entry `Map` for a ping timer that never stops.

---

## ✅ The winner's hand went out in the event beside the view that hid it (A58 — 2026-08-13)

`views.ts` carries a long comment explaining why `hu.shape` must be redacted:
the fans name a *property* of a hand, the shape names every tile type in it, and
under Bloody Rules a winner sits out the rest of the round with their tiles
unrevealed — so handing the shape over tells the seats still playing exactly
which tiles are dead. `toPublicPlayer` did that correctly from the day it was
written.

`redactEventsFor` did not. The `hu` event carries the whole `HuRecord`, `shape`
included, and it fell through to the `return ev` at the bottom — so the field the
view withheld arrived on the same broadcast, one message over. Reproduced with
seat 1 winning off seat 0's discard mid-round: all three opponents *and*
spectators received the full decomposition of thirteen concealed tiles.

This is the third time. Drawn tiles were A31 and void declarations were A40, both
found the same way and both already named in the convention — which is now
stated as the rule it should have been from the start: **a field redacted in
`views.ts` is not redacted until it is redacted here too.** The guard added with
N16 tested `projectView` and `projectSpectatorView` and stopped there; it now
covers the event channel, including that redaction copies rather than mutates,
since the same array is redacted once per viewer.

---

## ✅ The two kong payments the refund log could not see (A56, A57 — 2026-08-13)

Both are `kongPaymentLog` — the ledger every refund path reads and nothing else
does. A56 is a payment that never reached it; A57 is a refund that read it twice.

**A56 — a promoted kong nobody could rob was paid for and never logged.** A
promoted kong collects 1 from each opponent *before* the robbing window, because
the payment is reversed if the kong is robbed. Committing those amounts to the
log happens in `resolveRobbingWindow`, when the window closes unrobbed — and
`applyDeclareKongOnTurn` has two paths that never open a window at all: robbing
disabled, and `openClaimWindow` returning null because no seat can Hu on that
tile. **The second is the ordinary case.** A robbing window opens only when
somebody is genuinely waiting on the tile being added, which is rare, so nearly
every promoted kong in the game took its three points and left no record of them.

The log is the only input to all three refunds — the wall-end blanket refund for
a non-Hu, non-ready declarer, shoot-after-kong, and false-Hu — so those three
points could never come back. Measured: a promoted kong and a concealed kong in
the same position, both declarers ending non-Hu and non-ready, and only the
concealed one refunded. The two branches are now one, and the commit sits where
the kong becomes final.

**A57 — shoot-after-kong refunded one kong group per winner.** The refund is
"give back the group you just collected", and it ran *inside* the per-winner
loop, re-deriving "most recent" each time from the entries not yet marked
refunded. One winner refunds the right group. Bloody Rules lets two seats win on
one discard — and the second winner then walked back to the discarder's
*previous* kong and reversed that as well, so every payer of a kong nobody shot
after got their points back. Reproduced: 12 points refunded where 6 were owed.

Nothing in that loop read `winner`. The subtype was being derived per winner too,
which is what made a once-per-discard action look like it belonged there; both
are hoisted out, and the refund now runs once, after the winners are settled.

**Neither was reachable from the fan tests.** `scoring-cases.test.ts` stops at
`handValue`, and `payments.test.ts` had a promoted kong asserting `[3,-1,-1,-1]`
at the moment of declaration — correct, and blind to whether the points can ever
be given back. What the two new cases assert is the round *after* the kong.

---

## ✅ A pung-entered turn is not after-kong (A55 — 2026-08-10)

Recorded late: the fix shipped in `b665da4` and never reached this file.

`applyPungClaim` cleared `drewThisTurn` — that is the A7 fix, and it is what stops
a claimed tile being laundered into a self-draw win — but left
`lastDrawWasKongReplacement` set. So a discard made on a turn entered by a pung
was stamped `afterKong`, and a Hu on it scored `shootAfterKong`: a fan, and a
kong refund, for a kong the discarder never declared. The flag now goes with
`drewThisTurn`, since it belongs to the turn that drew off the tail and a
pung-entered turn has no draw at all.

---

## ✅ The modulo bias, and the reason it was filed being wrong (A54 — 2026-08-04)

`rng.nextInt` is `next() % n`, which is biased: 2³² is not a multiple of most
`n`, so the lowest `2³² mod n` results are reachable one extra way each. Across
every draw the shuffle makes, the widest that region gets is **96 values out of
2³², at n=100** — 2.24×10⁻⁸. Irrelevant, as filed.

**The reason it was filed as unfixable is not.** The entry said rejection
sampling "would change which tiles every seed deals", so every pinned-seed test,
e2e guard and layout-probe baseline would regenerate — the churn N22 paid for the
dice. It would not: a sampler that redraws only on rejection takes the extra draw
with probability 6.3×10⁻⁷ per 107-draw shuffle. Run over 200,000 seeds, **zero
deal differently.** The churn is about one seed in 1.6 million.

So the decision had to be remade on the real trade-off, which points the same
way for a different reason: **the defect is unobservable and so is the fix.** No
feasible sample distinguishes a 2.24×10⁻⁸ excess, and no seed anyone will find
takes the rejection branch — the change would land with no test that could fail
if it were wrong. Four untestable lines against a bias below every other source
of noise in the game. Left as it is, now as a decision rather than an
impossibility. A *different* fix is a different question: `Math.floor(nextFloat()
* n)` really would move every deal.

**`rng.test.ts` compared the generator to nothing but itself.** Six tests, all
determinism-against-itself or range checks, so any change producing different
numbers deterministically — the seed expansion, the xoshiro step, the shuffle's
direction — passed all of them. It now pins a golden `nextInt` sequence and a
golden wall prefix.

Those goldens were written to guard the modulo decision and **do not**, which is
worth stating plainly: the first draft asserted they would catch a rejection-
sampling swap, and the swap was made to check — all eight tests stayed green.
That is the same fact that makes the bias irrelevant, arrived at from the other
end. The goldens keep their place because they catch every *other* accidental
change, and the comment on each says which is which.

---

## ✅ The two micro-inefficiencies, measured first (A53 — 2026-08-04)

The item was filed with a condition attached — *"do them with a measurement in
hand or not at all"* — so the measurement came first. Corpus: every (hand, melds,
void) triple seen across four full seeded rounds, 896 of them, which is hands the
engine actually deals rather than hands chosen to be slow.

**The early-exit solver was worth doing.** `isWinningHand` needs existence, and
`findStandardShapes` materialised every decomposition for every pair choice
before the caller looked at one. Over 664 standing hands, `isTenpai` went
**24.3ms → 12.5ms** and `isWinningHand` over 208 fourteen-tile hands went
**0.46ms → 0.24ms** — a shade under 2× each. That matters because `isTenpai` runs
27 `isWinningHand` calls per invocation and the medium and hard bots call
`ukeire` once per *candidate discard*.

`solveFirstStandard` returns the first decomposition that closes rather than a
boolean, so `isWinningHand` keeps its signature and its seven `!== null` callers
are untouched. The cost is a second recursive solver over the same rules, which
is the shape A44 was about — so a property test pins them together: whatever
`isWinningHand` answers must agree with `findAllWinningShapes`, and its shape
must be one of that list's, over 500 generated hands.

**The `settleRound` hoist was not, and is in anyway.** `calcTMV` is a property of
the ready hand, so computing it inside the (non-ready × ready) double loop
repeats work — but the loop is tiny: across 20 rounds it made **13 calls where 5
would do**, costing 0.05ms per round against a round that takes 1.8ms of engine
time end to end. Three lines, and the redundancy is gone; nobody should read the
number as a reason it was worth buying.

**What the suite shows is nothing, and that is honest.** `bot-smoke.test.ts` ran
23.8s after against 25.0–27.4s before, which is inside its own run-to-run spread.
The bots' gradient is `shanten.ts`, which is server-side and cached; `ukeire` is
the cheapest of its three sort keys. The microbenchmark is the defensible number
here, not the suite.

---

## ✅ The engine read the clock in two places (A52 — 2026-08-04)

`createGame`'s `startedAt` and `openClaimWindow`'s `deadline`. Neither changed
behaviour — expiry is server-driven through `claimWindowExpire`, so replays were
already deterministic in *outcome* — but the state was not a function of its
inputs, and that is a claim the purity convention makes.

The evidence it mattered was already in the suite: `phase1.test.ts`'s "same seed
produces same final state" compared `history.length` and `drawIndex` and stopped
there. A deep compare would have failed on `startedAt` by however many
milliseconds separated the two runs, so the strongest determinism assertion the
engine could carry was one that skipped most of the state.

Both are genuine wall-clock instants and neither can be derived — the game record
is written with `startedAt`, the server rebases a persisted `deadline` on restart
and the client counts down against it — so the fix is to take the time rather
than read it. `applyAction(state, action, now = Date.now())` and
`createGame(..., now = Date.now())`, threaded through `dispatchAction` to the
three handlers that need it (`discard`, `flipFirstDiscard`, `declareKongOnTurn`).
Every existing caller is untouched by the default; the new test passes a fixed
value and compares the whole state with `toEqual`.

Chosen over documenting the two exceptions, which was the other option on file:
a documented exception leaves the convention uncheckable, and this one is six
lines and buys a test.

---

## ✅ A fresh lobby could be handed a live room's code (A51 — 2026-08-04)

`createLobby` re-rolled its code against the **lobby** store only. `startGame`
deletes the lobby and leaves the room live under the same code, so a code very
much in use is absent from the store it was checked against. The new host's token
then resolves with `data.code === code`, `getRoom(code)` finds the *old* room,
and `ws.ts` seats the stranger as seat 0 of a running game — their hand, their
turn, their score.

One predicate: `while (store.has(code) || getRoom(code) !== undefined)`. There is
no cycle to route around, because `room.ts` imports nothing from `lobby.ts` — the
dependency only ever ran the other way.

Odds are about 1 in 21,000 creates at the hosted 50-game ceiling, which is small
and not zero, and the failure is not a collision error. **The test had to force
one**: `generateCode` is CSPRNG-backed over a ~1.05M keyspace, so the existing
"never hands out a code already in use" test is a distribution check that could
never have caught this. Queueing alphabet indices through a mocked `randomInt`
makes the next draw a chosen code and leaves the real generator in place
everywhere else.

---

## ✅ A kong's subtype was worth 3 points and came off the wire (A50 — 2026-08-04)

`applyDeclareKongOnTurn` validated the exposed pung and the tile in hand, then
believed `action.subtype`: `promoted` collected 1 from each opponent, `postponed`
collected nothing. Nothing checked the classification, so a crafted frame was
worth 3 points a kong — **the one field "the WS boundary trusts nothing" had left
trusted**, because it reads as a description of the action rather than as a
claim about the state. `room.ts` whitelists the action *type* and matches the
seat; the payload beyond that was the engine's to police.

The honest derivation was wrong in one reachable case too.
`getPromotedPostponedKongActions` classified by `lastDrawnTile`'s type without
asking whether this seat had drawn at all — and after a pung claim nothing was
drawn, while `lastDrawnTile` still held the *discarder's*. A seat that pungged
holding the fourth copy, off a tsumogiri of that same tile, was offered a
`promoted` kong for what the PDF calls postponed, and the bots take every kong
the legal list offers. The new test builds exactly that position and it failed
on the offered action before it failed on the payment.

`promotedKongSubtype(state, tileType)` in `state.ts` now holds the rule —
promoted iff `drewThisTurn && tileTypeOf(lastDrawnTile) === tileType` — beside
`mustPlayVoidFirst`, for the same reason that one is there: two callers with a
payment between them. `concealed` stays on the wire, because it is a genuine
choice (four of one type in hand *and* an exposed pung of another) and the hand
validates it.

**The open rules question settled against the PDF, and it had an answer.**
*"There are two important restrictions when declaring kongs. Firstly, one cannot
declare a kong if there are no replacement tiles left in the wall. Secondly, one
cannot declare kong if a player has declared a pung on the same turn."* The
engine enforced the first and permitted the second; ARCHITECTURE §5.5.8 recorded
it as being about the discard rather than about the turn, which is a rule that
cannot fire — Kong outranks Pung inside a claim window, so no discard is ever
claimed for pung with a kong still pending on it. `turnEnteredByPung` now refuses
one, concealed kongs included: the restriction is on the turn, not on the shape.

That closes the mis-classification a second time, from the other side. The
derivation still earns its place — postponed is the ordinary case where you drew
something else and added a copy you were already holding.

---

## ✅ The Root fan only ever scored in seven pairs (A49 — 2026-08-04)

Novikov's Table 4 defines Root as *"1 for each 4 identical tiles in two or more
sets"*, and his kong chapter names the standard-hand shape outright: *"Simply
four identical tiles in a hand are not kong … for instance, if three tiles make
up a pung and the fourth tile is used in a chow."* `calcStructuralFans` computed
it inside its `sevenPairs` branch and nowhere else, so **every payment off a
standard hand holding a root was half what the rules say** — `calcHandScore` on
`111m + 123m + 456p + 789p + 22p` returned `fans=[] handValue=1` where the PDF
says 2. The gap flowed through `calcTMV`'s wall-end bu-ting payouts and the hard
bot's `handPotential` with it.

**It survived seven audit passes because nothing tested Root outside seven
pairs**, and because [audit-payments.md](./audit-payments.md) never mentions Root
at all — that pass audited the payment matrix, which is downstream of the fan
computation and was correct.

Root is now read off the decomposition rather than off tile counts, which is what
"in two or more sets" means: count the copies of each type across the sets *and
the pair*, and score one Root per type holding four of them in ≥2 groups. Four in
one group is a kong, and keeps scoring Kong — the two fans divide on exactly that
line. Nothing else in Table 9 moves: Root+AllPungs is structurally impossible
(pung + pair of the same type is five copies), so the incompatibilities already
encoded stay right, and `selfMax: 3` was already the correct ceiling.

The three-root case is only reachable with a meld. Three types held four times
each is 12 tiles, and 4+4+4+2 is also a seven-pairs hand — so the standard branch
sees it only once a pung has been laid down, which is what the stacking test
does. The first draft of that test asserted `{ Root: 3 }` on a concealed hand and
came back `{ SevenPairs: 1, Root: 3 }`.

ARCHITECTURE §5's Table 4 row said "Pair + same tile in a pung/kong elsewhere in
the hand", which describes five copies of one tile — an impossibility. It and the
six help catalogs now carry the PDF's wording.

---

## ✅ One river, drawn three times (A44 — 2026-08-04)

The `head` / `room` / `shown` / `hidden` / `cells` construction — which decides
whether the void declaration takes a cell, how many ordinary discards fit behind
it, and how many are counted away in `+N` — was copied into `OwnZone`,
`OpponentTop` and `OpponentSide`, with `OwnZone` carrying a fourth uncapped
variant. `splitPile` had been extracted; the layer built on top of it had not.

**This is the code N42, N43 and N44 each got wrong in a different seat**, and
each fix had to be applied in more than one place. It is also pure, which is
exactly what the client's "add UI logic the same way" convention asks to be
lifted out — the trays are components, so nothing about it was reachable by a
unit test and only its rendered geometry was reachable by the probe.

`riverCells(player, cap)` now holds it, beside `splitPile` in `discardPile.ts`
rather than in a file of its own: it is the same concern, and that module is
already described as the shared tray helper. `cap: null` is your own river, which
is uncapped because furiten is decided by what you have already discarded.
`hasDeclaration` comes back with the cells because `OwnZone` needs it for the
ghost (N43) — it is the `head` all three were computing anyway.

Column chunking stayed in `OpponentSide`: `RIVER_ROWS` is that zone's geometry,
not the river's.

One latent trap did not survive the move. `pile.slice(-room)` returns the *whole*
array when `room` is 0, so a cap with no room left would have shown everything
rather than nothing. No tray could reach it — the smallest cap is 9 — but a
shared helper should not carry it forward, and it now has a test.

Verified three ways, because a refactor of this code has been wrong before: eight
new unit cases, the full e2e suite (12/12 across five viewports), and a
layout-probe run whose `declPos` and `riverEnds` corners came back
`flat:RB,side:RT,side:LB,flat:LB` / `seated,seated` on all nine viewports —
numerically identical to the N45 run, down to `slack=0` at 320×568.

---

## ✅ The dead symbols, the missing guard, and the chow that never was (A43, A45, A47 — 2026-08-04)

Three small ones, batched because they touch unrelated files and read as one
review.

**A43 — five dead exported symbols.** `isVoidSuitTile` (an N46 leftover sitting
directly above `mustPlayVoidFirst` and duplicating one line of it), `revokeToken`
(superseded by `revokeTokensForCode`), `limiterSizes`, `getWsClient`, and
`WALL_EW_H`. The last two carried comments claiming a consumer — "exported only
so the tests can say so" — that no longer existed. **Coverage found these before
the reference scan did:** the uncovered lines in `state.ts`, `limits.ts` and
`tokens.ts` were precisely these function bodies and nothing else. `state.ts` and
`tokens.ts` are now at 100%.

**A45 — `kickBot` indexed `lobby.slots` straight off the wire.** Six lines above
it, `setBotDifficulty` guards with `isSeat` and explains why: `slots["0"]` reaches
element 0 on a JS array. **Not reachable as a defect** — the write is gated on
`slot?.isBot`, and the exotic keys that resolve (`"length"`, `"__proto__"`) carry
no `isBot`, so they fall through to `not_bot` — but the guard is one call and its
sibling already documents the reasoning.

**A47 — `Meld` carried an unreachable `chow` variant.** Sichuan has no chow
claims; the engine only ever pushes pungs and kongs. The audit found two dead
branches. There were **seven**: `playerSuitCount` and `meldTileIds` as reported,
plus `meldToSetShape` (`hand.ts`), `meldTileTypes` (`scoring.ts`) and three in
`bot.ts` — the visible-tile scan, the danger read, and the flush estimate. Two of
those had been flagged by coverage without anyone reading it that way:
`scoring.ts:214` was that file's *only* uncovered line, and `bot.ts:228-229` was
in its uncovered range.

**`WinShape`'s chow in `hand.ts` is real and stays.** A winning hand absolutely
contains runs; they simply cannot be claimed off a discard, so they are never
melds. The `Meld` type now says so in a comment, because re-adding the variant for
symmetry with that one is the obvious wrong move.

---

## ✅ The hand arrangement, and the layer nothing had run (A46, A48 — 2026-08-04)

**A46 — `reconcileHandOrder` lifted out of `OwnZone`.** Nine lines of pure list
logic inside a `useEffect` with a `biome-ignore` on its dependency array, and no
tests. It governs whether the arrangement a player dragged survives what happens
next, and all three of its halves cover a different way a hand changes: keep the
order for tiles still held (a draw must not reshuffle the twelve you sorted), drop
what left (discarded, or claimed out from under you when someone kongs your pung),
append what arrived at the end in server order (a drawn tile goes where a drawn
tile goes). A re-deal falls out of the same rule rather than being a special case:
nothing is kept, so the new hand is appended whole. Nine cases, including that
four copies of one tile type stay four tiles — reconciling by type instead of by
id would collapse them.

**A48 — the SQLite layer, executed at last.** Every server suite that touches
`persistence.ts` `vi.mock`s it wholesale, reasonably, since they are testing rooms
and sockets. The consequence was that the schema, both round-trips and the
`normalizeFans` read migration had never run against a real `node:sqlite` in CI —
41% coverage, and A41's bug lived one layer above these rows.

Nine cases against a temp `SICHUAN_DATA_DIR`: both tables created, a finished game
round-tripping with its config parsed back as an object rather than a string, an
absent id returning null, the live-room write/read/delete cycle, and the
`ON CONFLICT DO UPDATE` upsert — which matters because a room re-persists on every
state change, so the same code is written many times a round and the second push
would otherwise be a primary-key violation. The migration is covered *through the
database* rather than as a unit: a row holding the legacy `"AllPungs×2"` display
form comes back as `{ fan: 'AllPungs', count: 2 }`. `persistence.ts` went 41.1% →
89.7%.

---

## ✅ The watch token that never came back (A41 — 2026-08-04)

Found by the refactor/coverage audit, and found *because* of dead code: the two
functions written for this path were both unreferenced. `importWatchToken`'s own
doc comment read "Re-register a watch token on restore, alongside the seat
tokens" — it had been written for a call site that never landed, and
`watchTokenFor` was the getter the serializer would have used.

`restoreRoomsFromDisk` re-registers each room's **seat** tokens from
`snap.tokens`, so players reconnect into their chairs after a host restart. It
never re-registered the room's **watch** token, because `RoomSnapshot` had no
field for one and `serialize()` never captured it. `watchTokens` is a
module-level `Map`, so a fresh process starts empty and `isWatchToken` fails for
every restored room — every spectator socket closed with `no_game`, on a game
that was running fine and that players were rejoining normally.

**The cause is the thing that makes the design right.** The watch token lives in
its own store precisely so a spectator secret can never resolve to a chair; the
cost of that separation is that every path handling tokens needs a second line,
and the restore path only ever had the first. `RoomSnapshot.watchToken` is
optional, so pre-A41 snapshots and rooms whose lobby never issued one both still
restore — with spectating unavailable, which is what they had before.

Verified by running it rather than by reading it: a test across a
`serialize` → `restoreRoomsFromDisk` cycle passed the seat-token assertion and
failed the watch-token one, then passed both after the fix. Five cases in
`watch-token-restore.test.ts`, including that a restored watch token still cannot
resolve as a seat token — the invariant the two-store design exists to hold.

Blast radius was small and non-zero: hosting runs with persistence off (free
tier), so this only ever bit LAN, Tailscale and self-hosted games — the
deployments where the host restarting mid-game is most likely.

---

## ✅ Nothing tested a host-privilege gate (A42 — 2026-08-04)

No file in `packages/server/tests` or `e2e/` contained the string `not_host`,
`kickBot` or `setBotDifficulty`. **Seven authorization checks, all unverified**,
on a service anyone holding a four-character code can reach: `startGame`,
`addBot`, `setBotDifficulty` and `kickBot` in the lobby, `nextRound`, `endMatch`
and `setBotSpeed` in game. A8 put real thought into seat 0 being the host seat and
nothing checked that what was built on top of it held.

No bug behind it — every gate works. That is worth stating plainly, and it is also
the reason the gap survived six audit passes: nothing was broken, so nothing drew
attention. The value here is that the next edit to `handleLobbyMessage` or
`handleGameMessage` cannot quietly drop one.

**Each gate gets a refusal and a positive control.** The refusal proves the guard
fires; the control proves the refusal wasn't for an unrelated reason — a typo in
the message name, a lobby that had already closed — which is the failure a
negative-only test cannot distinguish from success. Where a refusal has an
observable effect the test asserts the state is *unchanged* rather than only that
an error came back: the kicked bot is still seated, the room still exists, the
pace is still what it was.

Verified by mutation: disabling all seven guards in `ws.ts` fails all seven cases.
`ws.ts` coverage went 68.2% → 81.6%, and the server package 76.7% → 79.2%.

---

## ✅ The void suit you drew back (N46 — 2026-08-04)

Reported as "sometimes it allows you to select other non-voided suit when you do
have the voided suit in hand", and it was exactly that.

Strict mode means *while you hold a void-suit tile, it is the only thing you may
discard* — ARCHITECTURE §5.5.3 has said so since it was written. The engine
implemented it with a `voidCleared` flag, set the moment the last void-suit tile
left the hand and **never reconsidered**. Draw one back off the wall and the flag
still said cleared, so the discard validator, `getDiscardActions` (which is what
the client's greyed-out tiles come from) and all three bot difficulties agreed the
seat was free. You could throw anything while holding a tile you can never win
with. The bots did, for the rest of the round — this was a strength bug as much as
a UI one.

**A rule that depends on the hand cannot be cached across a draw.**
`mustPlayVoidFirst(state, seat)` derives it on every read and is now the single
definition all five callers ask. `voidCleared` is deleted rather than left
correct-but-unused, so it cannot be reached for again. Only a draw can re-arm the
condition: claims cannot bring a void-suit tile in, because `canPungOnTile`,
`canKongOnTile` and `canHuOnTile` all refuse one.

Three regression tests in `phase3.test.ts` cover held/not-held/lenient. Six
existing tests failed on the fix, and every one of them was constructing the state
the bug allowed — a seat holding sou with `voidedSuit: 'sou'`, discarding a man
tile. Including `first-discard.test.ts`'s own round driver, which had copied the
latch (`p.voidCleared || …`) to decide what to discard, so it was reproducing the
bug it was meant to be playing around. The replay corpus's "strict never fires the
void penalty" case now holds *two* sou, so one can be thrown and one is still held
at settlement — which is what that assertion always meant to test.

---

## ✅ The board, seated (N40–N44 — 2026-08-04)

Five passes on the play screen, phones first. The full working record, including
every rejected option with the measurement that killed it, is in
[docs/layout_investigation.md](./layout_investigation.md) §13–§17.

**N40 — your declaration joined your river.** N38 moved it into the river for all
three opponents and left the player's own in a centred row above the tray, so one
seat of four drew it differently and that row cost ~34px of the one column with
nowhere left to give.

**N41 — the centre of the table.** The last discard is the one object that stops
play and asks a question, and it was drawn at 40px on every phone 700px tall or
shorter — against a hand tile's 42px cap — under a caption naming it. Meanwhile
the wall frame, 56 identical backs at `z-index: -1`, was the largest thing in the
well. The caption became `sr-only` and paid for the tile: same group footprint,
much larger hero. **The size rungs belong on width, not height** — the mouth is as
wide as the well, and 390×844 (the *tallest* phone, 315px of free well) failed at
5rem where a shorter 414×896 passed. And `Void: 万 Wàn` moved to the well's floor,
because as a sibling of the tile in a `justify-center` column its 20px had been
pushing the hero 10px above the wall's centre on every viewport at once.

**N42 — the declaration stands out of the lap.** It was lapped like any other
discard with `z-index: 2` so the neighbour's bleed would not eat its glow — a fix
for the symptom, and it read as a tile lying *on* the pile rather than as its
first tile set apart. Cancelling the bleed on the tile after it also made the box
the whole tile again, which is what finally allowed the ring `.tile-mark` has
carried a comment about since the void screen shipped. One 0.75rem tile back
joined the side seats' `×10`, and truncated "Bot 2" to "Bo…" — **N7's shape for
the fourth time**, found by looking at a screenshot rather than by a guard.

**N43 — a declaration that was not there.** Chasing "what if it gets punged"
turned up an engine bug: a claimed discard is spliced out of its owner's pond
(A15), and `firstDiscardIsVoid` was derived as "separated a tile, pond non-empty",
which names `discards[0]` whatever it is. So a punged declaration did not merely
vanish — that seat's **next** discard was promoted into their public declaration
for the rest of the round. `PlayerState.voidDiscardTile` records the tile at the
flip so the flag can mean what it says; guarded in `first-discard.test.ts`. With
that correct, the ghost the report asked for is one condition: no declaration in
the river and a void suit known → rank 1 of the suit at `opacity: 0.3`, ringed.
Your own zone only — an opponent's void suit is public *solely* through the tile
they flipped (A40).

**N44 — every river is your own, turned to its chair.** N42 and N43 both got this
wrong the same way: they put all four rivers in the *viewer's* reading order. A
table does not work that way. Yours runs along your right hand and wraps toward
you; rotate that and the left seat's rows run down and wrap left (oldest at the
top of its *rightmost* row), the right seat's run up and wrap right (oldest at the
bottom of its *leftmost*), the across seat's run left from the right end. Two
mistakes were stacked: mine, and — underneath — a wrap direction that had been on
the wrong sides since the side trays existed. **Only the wrap was ever free**; a
row's direction is fixed by which edge the body band sits on (N36). Three passes
of mirroring cell arrays, and the whole fix was one `flex-row-reverse`.

**The probe, ~2 minutes → ~40s**, and four of the five changes were correctness
rather than speed: wait on the phase instead of the clock, three viewports at
once, `--bot-delay 120` (0 was tried — the board then outruns the camera), wait
for the deal's dice to clear, and one bounded "board at rest" predicate before
shooting. That fourth one is the trap now in CLAUDE.md: the overlay is
`pointer-events-none` and play continues underneath it, so the two fixed sleeps
had been paying for it without ever saying so.

---

## ✅ The declaration beside the pile, and a board that stops rebuilding itself (N38 — 2026-08-03)

Two asks in one pass, and one measurement each.

**The side seats' declarations moved beside their piles.** Height is the scarce
dimension in an 80px column — it is what makes those tiles shrink and what caps
the pile at ten — and stacked above the tray, the declaration was spending a
whole tile of it on one tile of information. Beside, it spends none.

Two sideways tiles are 77.7px and the column is 80, so this only fits once the
tray stops paying `padding-left: 0.75rem`. That padding is the **horizontal**
lap's bleed: the first tile in a `.tile-lap` run has no neighbour to lap over and
hangs 29% of a pitch off its left. A column of sideways tiles has no horizontal
bleed at all, so the side trays had been paying 7.2px of an 80px column for a
geometry they don't have. `.discard-tray.tile-run-v` sets it symmetric.

It takes the **inner** side, nearest the wall drawn round the well — the far side
from its owner, which is where every other seat's declaration sits — and aligns
with the pile's **oldest** end, the top of the left column and the bottom of the
reversed right one, because it is that seat's first discard rather than a header.
The wrapper is `flex` rather than a block: a `.tile` is `inline-flex`, so in a
block it sat on a text baseline and carried ~6px of descender, which put the right
column's declaration 6px above the bottom it was aligned to.

The hand-count chip lapped tighter with it. The two orientations were the same
*length* rather than the same *fraction*: a back is 32 × 38.9, so `-mt-7` left
10.9px of each vertical tile showing against the horizontal chip's 4px — a third
of a tile against an eighth, in the column where height is scarce and width is
not. `-mt-8` matches, and returns another 8px.

**Opening a discard pile was slow on a phone, and the board was why.** Measured
at 4× CPU throttle on a 390px viewport: 126–236ms from the tap to a painted
modal, for a pile of eight tiles. The tiles were not the cost. `openPile` is a
`useState` in `PlayPhase`, so the tap re-rendered every zone on the board — ~80
tiles, each a framer-motion `motion.div` with its own `useState`, `useLongPress`
and `AnimatePresence` — before the modal's own eight ever mounted.

Three changes, each verified against that number rather than assumed:

- **`Tile` and `TileBack` are memoised.** Their props are primitives plus an
  optional handler, so this is exact rather than a guess.
- **A tile is a plain `<div>` unless it has something to animate.** `animate` is
  the constant `y: 0` on any tile that cannot be selected, and `whileHover` /
  `whileTap` were already conditional on `onClick` — so framer-motion was earning
  nothing on the trays, the melds, the opponents' zones or the modal. *Being
  passed* `selected` is what opts a tile in, not its value: swapping the element
  type mid-lift would remount the tile and make it jump rather than spring. The
  per-tile `AnimatePresence` for the long-press preview is likewise mounted only
  where a long press can happen.
- **The four zones are memoised, and their `onOpenPile` handlers keyed on the
  seat number.** `view` is a fresh object on every server push, which is exactly
  when a zone should redraw; the seat is fixed for the round, so the handler keeps
  its identity across the one toggle memo is there to absorb. Without that
  `useCallback` the memo does nothing at all.

Median tap-to-modal went 225ms → 96ms, and the worst of three runs 236ms → 106ms.

**And the side trays' cap came back down to six**, which is the part of this that
was found by regenerating a screenshot rather than by any test. A tray tile is a
flex item in a column, so once the content exceeds the space the *boxes* shrink —
and the art, sized off `--tile-w`, does not. It overflows, the lap eats past the
22.5% body band into the face, and late in a round on a seat holding melds the
pile drew as **a stack of black outlines with no tile visible between them**. I
first put that down to the last-discard glow caught mid-pulse; zooming in showed
it was the pile itself.

N10 raised this cap to ten on the arithmetic that a sideways tile is 32px against
38.9px upright with a 24.8px pitch, so ten fit in less room than the old six did.
That is true of the boxes and false of the tiles. A side column gets 179px of tray
with no melds and ~135px with two meld chips; `1 + (h − 9.6 − 32) / 24.8` is five
to seven tiles at full size, and ten was never among them. At six, both columns
now measure 32px per tile with no shrink at all.

Six is a constant and the space is not, so a seat that has ponged twice still
squashes a little. Fitting the count to the measured height is **N39**, left open
with the loop that makes it awkward written down: the tray is content-sized, so
dropping a tile frees the space that let you drop it, and the measurement has to
come from the row rather than the tray.

---

## ✅ Turning the tiles was only half of it (N36, N37 — 2026-08-03)

Two bugs filed together because they are one fault: **N32 turned two seats' tiles
round and left the things around them where they were.** Both are geometry, and
neither is a rule or a leak.

**N36 — the right seat's pile ran the wrong way, and its lap sat on ink.** The
tile art laps by 22.5% of its width measured *in from the right edge*: outline,
green, plate, and never ink. The left seat's quarter turn is `rotate(90deg)`, which
carries that edge to the **bottom** of the on-screen tile, and `.tile-lap-v` pulls
each tile up over the previous one's bottom — the band, exactly. N32 gave the
right seat `rotate(-90deg)`, which carries the same edge to the **top**, and the
column kept sharing the one negative `margin-top`. So the lap covered the art's
*left* edge, where the face begins. That is the "not flush compared to the other
position" a player sees: one column with a single shared seam, one that looks like
tiles resting on each other.

The reading order was wrong for the same reason and is fixed by the same change.
Sit at the right of a table facing the middle and the screen's bottom edge is on
your left, so that seat lays its discards **upward**. `OpponentSide` carried a
comment defending one shared downward direction — N10's argument that a horizontal
row of readable faces shows its own direction but a column of sideways tiles does
not. That was true of the order in isolation and false once the two seats face
opposite ways, because the lap then shows the direction whether or not the tiles
do.

`.tile-lap-v-up` is the mirror of the two rules above it: `column-reverse` plus a
negative `margin-bottom`. **The halves cannot be split** — a reversed column with a
negative `margin-top` laps the wrong neighbour, and a negative `margin-bottom` in a
plain column opens a gap rather than an overlap. In a reversed column the tile
above is the later one, so it already paints on top; `margin-bottom` is what pulls
it down onto the band.

Both rules now select `.tile-sideways + .tile-sideways` rather than
`:not(:first-child)`, because the "+N more" label moved to the tray's **first**
child. It stands for the discards dropped off the *old* end, and a first child
lands at that end in both directions — the top of the left column, the bottom of
the reversed right one. It had been last, i.e. at the new end, which the across
seat's tray had already got right and written down. Under the old selector a
leading label would have made the first tile lap over the number.

Measured in a browser rather than argued: pitch 24.8px on a 32px tile in both
columns (0.775 exactly), the right column's tops descending, and no tile's box
outside its tray's — which is the property `viewport.spec.ts` asserts every ~130ms
for 90s across five viewports, and the reason the vertical lap is a negative margin
on the *box* rather than the horizontal lap's trick of shrinking the box and
overflowing the art.

**N37 — the across seat's declaration was on the near side of its pile.** Every
seat puts its void declaration on the far side of its own discards, the way a tile
pushed out onto the table ends up: your own zone reads hand, tray, declaration
going away from you. `OpponentTop` read name, declaration, tray — so the one seat
that faces you had it between the player and their own pile. N32 turned that pile
180° so it reads as the seat's own pile seen from the other side, and the
declaration block, being its own `rotate-180` div outside the tray, kept the
position it had when the pile was still drawn from the viewer's side. Moving the
block after the tray in DOM order was the whole fix; the rotation each already
carried is unchanged.

The side columns keep their declaration above the pile. It is a header there
rather than a direction: the seat's own far side is *horizontal* for a seat at
right angles to you, and an 80px column has no room to put a second sideways tile
beside the pile.

---

## ✅ A wind is not a seat, in nine places (N26 — 2026-08-03)

Every screen that printed a seat's wind read the **absolute seat index** and asked
the catalog for `wind.${seat}`. `windOfSeat(seat, dealer)` had existed since N22,
which fixed exactly this in the dice overlay; nothing else had the dealer to hand.

**The bug is worse than the file said it was, and the test says so now.** The
standing description — and my own reading of it — was "correct only when the
dealer happens to be seat 0". It is not correct even then. Winds run *against* the
seat index, because play travels counterclockwise: with East at seat 0 the four
seats are East, **North**, West, **South**, so two rows of four still disagree.
Work it through for every dealer and the tally is two right out of four when the
dealer is even, none at all when it is odd — an average of one row in four. What
made it survive review is that the row people look at, their own, is right a
quarter of the time and the labels are plausible the rest.

**The decision the item asked for: a wind is a per-round fact, a seat is a durable
one, and they are not two names for one column.** Three of the nine sites have no
round in view at all. The lobby and the host setup label four chairs before the
seating dice have been thrown, so there is no East for them to be a distance from.
The match totals span rounds that each had a different East. Those three now name
a **chair** — a new `seat.0`–`seat.3` in all six catalogs — and everything holding
a dealer names a wind. `wind.test.ts` asserts the two label sets never overlap in
any catalog, so the fix cannot be undone by making a chair read "South" again.

`RoundResult` gained an optional `dealer`, which is what the round-end screens
were missing and why they reached for the index in the first place. Optional
because rows persisted before this carry none, and a rejoin at round end replays a
stored result (the A9 path) — `seatLabelKey` names the chair in that case rather
than printing a wind derived from a guess. The absent test is `dealer == null`
rather than `!dealer`: seat 0 is a falsy dealer, so the one arrangement that looks
most correct would have been the single case that silently stopped naming winds.

`windOfSeat` moved out of `DiceOverlay` into `src/wind.ts`. Eight screens needed
it and none of them should be importing a dice overlay to label a row.

---

## ✅ A third rung, and the discovery that the second one was below the first (N19 — 2026-08-03)

A hard bot, dispatched from a table rather than a second ternary — and, on the way
to measuring it, the finding that **medium was losing to easy**.

**That is the part worth keeping.** Medium ranked candidate discards by
`ukeireAfterDiscard`, which calls the engine's `ukeire`, which is `isTenpai` with
counts attached. It answers only for a hand already one tile away. So for most of
a round every candidate scored 0, the `uke > bestUke` comparison never fired
again after the first, and medium kept whichever tile came first in hand order —
while easy at least read the shape it was holding. Seated head to head, four seats
at a time over sixty deals: medium **−60**, with 32 wins against easy's 37. The
level advertised as the step up was the step down, and had been since it shipped.

The engine cannot fix this, because the gap is real: nothing in it has a notion of
*close*. `packages/server/src/shanten.ts` adds one — the standard
`8 − 2·sets − blocks` search, with the two corrections that are the whole subtlety
(no sixth block, and a penalty for five blocks with no pair among them), plus the
seven-pairs count where a four-of-a-kind is two pairs because the Root fan is
defined on exactly that. It lives beside the bots rather than in the engine: no
rule depends on it, nothing a client sees is derived from it, and the engine's
purity is about replay determinism rather than about being the only place mahjong
is understood. It is checked against the engine as an oracle — over 400 random
hands, `shanten === 0` iff some tile type completes the hand, and `=== -1` iff
`isWinningHand` says so. Not `isTenpai` directly: that also applies the
exhaustive-wait filter, which is a rule about whether a wait can ever fill rather
than a measure of how far from a win a shape is.

Medium got the term it was missing and nothing else — shanten, then its existing
ukeire as the tenpai tie-break, then easy's isolation score. It now beats easy by
**+105** and doubles its wins, 66 against 33.

**What makes hard hard, given that it sees no more than medium does.** The one
look either bot takes at a hand it should not be able to read is
`anyOpponentTenpai`, which A25 put in the medium claim gate. Hard keeps that and
adds nothing: a level called hard that defends *less* than medium would be a
strange thing to ship, and a level that reads opponents' exact waits would be
unbeatable and would read as cheating. What changes is what the look is for.
Medium uses it to gate one pung. Hard uses it to decide whether the turn is a push
or a fold, and then picks the tile from evidence anyone at the table has:

- **The void declarations**, which N19 filed as the free information both other
  bots ignore, and which are a guarantee rather than an estimate — `canHuOnTile`,
  `canPungOnTile` and `canKongOnTile` each reject a tile in the claimant's void
  suit outright. The bot reads them under the same condition `views.ts` uses for
  `firstDiscardIsVoid`, so a declaration still face down is one it cannot see.
  There is no genbutsu read to go with it: furiten here is the skip-Hu rule
  (§5.5.5), not "you discarded what you wait on", so a seat's own discards say
  nothing about what it can win from.
- **Each seat's pile, attributed to that seat** — a suit a player has never thrown
  is the suit they are collecting, a meld in it says so twice, and a type whose
  copies are nearly all face up has a thinner wait left to fill.

Then the three gaps the item named. **Fan awareness**: candidates that tie on
shanten are separated by what the hand is still worth winning with — `calcTMV`
when the discard leaves it tenpai, a flush-and-pung shape estimate below that.
The two scales never meet, because candidates are only ever compared against
others at the same shanten. **Claim discipline**: a pung is taken only when it
actually lowers shanten, measured against the best discard from the over-full hand
it leaves, and while someone else is tenpai only when it lands this hand in tenpai
too. **The kong**: declined when the hand reads better as seven pairs, since Kong
and SevenPairs are incompatible in Table 9 and four of a kind is two of the seven.
Hard also declares its own void by which suit costs the hand least rather than
which is shortest — three tiles that form a run are worse to give up than four
scattered singles, and it is the one decision of the round made before a tile is
drawn.

**And a third instance of the flex trap, found by looking rather than by a test.**
Adding the third level button to the lobby row put a `flex-shrink-0` picker and a
Kick beside one shrinkable child, and the bot's name — the only thing that could
give — rendered at **zero width** on a 320px phone. `docScrollX` was 0, the row
was 288px with a 288px scroll width, and the text was in the DOM and measurable
the whole time; nothing failed, and the name was simply not on screen. Same shape
as N7's turn indicator and N23's French flip prompt, same remedy: `flex-wrap` and
a `basis-*` on the text. Spanish's chair label went from "Asiento 1" to "Silla 1"
at the same time, the long form measuring 62px against a 64px column.

The dispatch is a `Record<BotDifficulty, …>` in `room.ts`. Two levels had been
selected by `difficulty === 'medium'` at three separate call sites, which is the
shape that makes a third rung a rewrite instead of a row — and `BotDifficulty` is
now one exported union rather than `'easy' | 'medium'` spelled out at six places.
`botDifficultyFrom` still narrows at the WS boundary, and its test used to name
`'hard'` as the canonical junk string, which is the argument for validating
against the levels rather than against a blocklist.

**The ladder is now guarded, not just measured.** `bot-smoke.test.ts` seats each
rung against the one below over 40 deals and asserts it wins — the assertion that
would have caught the medium regression on the day it shipped. Hard also gets its
own pass through the smoke test, because it reaches the engine by a different
route: it declines kongs and pungs the others take, so it visits states neither of
them does, and it is asserted to still form exposed pungs, since a discipline that
declines every claim is a bot that never claims and no test of the refusal path
would notice.

Hard beats medium **+65** (77 wins to 68) and easy **+142** (78 to 35).

---

## ✅ A support link and a source link, under the fold on purpose (N35 — 2026-08-03)

Two links in the landing screen's secondary cluster, modelled on the same change
in the Set repo ([`4e6f8dc`](https://github.com/dcmshi/set-game/commit/4e6f8dc6478963650e937afeb3668532f54e95a1)):
`github.com/sponsors/dcmshi` and the repository, separated by a `·`, at 11px in a
muted green that only brightens on hover.

**The one real decision was ordering, and it is load-bearing.** N20 shipped
`.github/FUNDING.yml` and a README section that both say the same careful thing:
sponsorship supports the code and **not the tile art**, which is somebody else's
work under CC-BY-SA with `credits.json` as the attribution. There is no room in a
link to carry that qualification, and padding the label until it fits would make a
12px footnote into a paragraph. So the row sits **below** About & Credits rather
than beside it — the screen holding the attribution is encountered first and is one
tap away. That is the whole of the answer the item was filed for, and it is written
into the component rather than left to be rediscovered.

**Not a fourth button.** The landing screen already learned this the hard way: N17
put practice settings behind a 12px underline here, nobody found them, and the
feature was reported as never deployed. The lesson cuts both ways, though — the
reason *these* two belong in the quiet row is that neither is a way into a game,
which is what the button stack is for. An affordance nobody finds has failed only
if someone needed to find it.

Two keys × six languages, which is the first thing to land since N23 that the
parity test guards across all of them. Set's commit already carried the wording for
five; zh-Hant is the sixth (`支持本專案` / `在 GitHub 上查看原始碼`).

Verified at 390×844 and 320×568: both links carry `target="_blank"` and
`rel="noopener noreferrer"`, both resolve, all six languages translate, and
`docScrollX` is 0 at both sizes. The landing page does scroll vertically at 320px —
64px before this change and 93px after — which is pre-existing and unguarded, the
vertical-overflow spec being about the play screen. 12/12 e2e green.

---

## ✅ Six languages, and the parity guard that now scales (N23 — 2026-08-03)

French, Spanish and Japanese. The plumbing was as cheap as the item predicted — a
`Dict` and a `LANGS` row, no component changed — and the writing was the job.
~290 UI keys plus ~44 help keys, three times over.

**Both questions the item held this for are settled, and they went opposite ways.**

*Do the tile names localise?* For French and Spanish, no: `suit.*` and `tile.*`
stay `万 Wàn` / `饼 Bǐng` / `条 Tiáo`, because N34's reasoning was never about
English. The character is what is printed on the tile in front of the player, and
a French reader has no more claim on "Man" than an English one had. Only the
`.full` gloss localises — `万 Wàn (Caractères)`, `(Cercles)`, `(Bambous)`.

*Is glyph-plus-romanisation right for a Japanese reader?* No, and that is the one
place the shape changes. Japanese is `萬子` / `筒子` / `索子` with **no
romanisation at all**, because the reader reads the glyph directly; the slot that
holds pinyin in English holds the **katakana reading** instead —
`萬子（マンズ）`. `tile.man` is the bare `萬` so `tile.label`'s `{rank}{suit}`
renders `3萬`, which is Japanese mahjong notation rather than a translation of it.
Man / Pin / Sou land here and nowhere else, which is what N34 said would happen.

**The Japanese rule vocabulary is the part with a wrong answer.** Riichi already
has a word for most of these mechanics, and that is the trap rather than the
shortcut. Taken from riichi because the mechanic is genuinely the same: ポン, カン,
フリテン, チョンボ, ノーテン罰符, 清一色, 七対子, 対々和, 嶺上開花, 搶槓, 海底摸月.
**胡 is split the way Japanese splits it** — ロン off a discard, ツモ on a draw,
アガリ for the abstract — because one transliterated フー would be opaque to exactly
the reader this catalog is for. Coined here, because Sichuan has them and riichi
does not: 欠け色 (定缺), 金鉤釣, 槓上放銃, 花豚, each keeping the Chinese term beside
it on the screen where it is introduced. **These four are the ones a native speaker
should still review**; the borrowed ones are safe.

**Three things the item did not anticipate, all found by building it.**

**The parity guard only covered two languages, by literal.** `catalog.test.ts`
looped `['zh-Hans', 'zh-Hant']` and eleven other tests looped
`['en', 'zh-Hans', 'zh-Hant']` — so a new catalog could have shipped half-written
and every one of them would have passed. All twelve now derive from `LANGS`, which
is the durable half of this change: the guard extends itself. That is also why the
client suite went 212 → 215 tests without a new test being written.

**`loadLang` rejected its own catalog.** It validated against the same three
hard-coded codes, so a stored `fr` fell back to English on every reload — the
language switch would have worked and then forgotten. It checks `LANGS` now.

**The English help still said "Man 万, Pin 饼, Sou 条".** N34's test reached
`suit.*`, `tile.*` and `suit.*.full`, and `htp.overview.body` is none of those, so
the sentence N34 was about survived in the one screen that explains the game. Fixed
in the same pass.

**Two layout consequences, one real.** `LangSwitch` is six 40px buttons now — 242px
of a 320px phone, measured, and it wraps rather than overflowing because the row
also sits inside a ⚙ popover. And French found a genuine bug: the
flip-first-discard prompt is a tile, a hint and a `flex-shrink-0` button, so the
hint was the only shrinkable child and absorbed the entire shortfall, drawing **one
word per line**. That is N7's exact shape, three months on. The row wraps now, with
`basis-40` on the hint — without a width it would shrink to nothing before wrapping
ever triggered. English never showed it because English fits.

Verified in a browser at 390×844 and 320×568: all six switch, `<html lang>`
follows, and the void and play screens read correctly in Japanese and French with
`docScrollX: 0` and no felt overflow. 12/12 e2e green.

---

## ✅ The lobby's Start button stays on screen (N31 — 2026-08-03)

Measured at y=1044 in a 1180px document on a 390×844 phone: reachable, never
clipped, and simply not *visible* to a host who had just filled four seats.

The fix is the shape R3 gave `RoundEnd` — `sticky bottom-0`, full-bleed via a
negative margin cancelling the root's padding, felt gradient so the rules above
fade rather than clipping hard. Copied rather than reinvented, which is what the
item asked for.

**The density half went the other way from the item's suggestion.** It proposed
folding the share-URL and watch-link blocks, ~290px of scroll that matter for a few
seconds and never again — but hiding them is what N17 already recorded as the wrong
call, and the watch link is the one a host will not think to look for. So nothing
was hidden: the room code merged into the share card it was duplicating, which is
40px and a gap spent saying the same thing twice.

Measured after: Start is in the viewport at `scrollY: 0`, at the scroll position
filling the seats leaves you at, and at the bottom of the document.
`docScrollX: 0` — the negative margin spans the parent's padding exactly and adds
no sideways scroll.

---

## ✅ Tap a seat's pile to see all of it (N33 — 2026-08-03)

Requested: tapping another player's discard pile opens a view titled with their
name showing every tile they have discarded, and a second tap dismisses it.

**What made it worth building is that the trays were already withholding
information.** The side trays draw the last **10** and the across tray the last
**9**, each with a `+N` counter for the rest — R1 capped them for height, and the
counter exists because silently dropping the earliest discards hid what a player
needs to read a hand. A full pile runs past twenty. So the modal is where that cap
stops costing anything rather than a second view of what is already on screen.

**No redaction question** — `PublicPlayer.discards` is the whole array and
`views.ts` already projects it to every seat. What did carry over is
`firstDiscardIsVoid`: it says whether `discards[0]` is the tile that seat declared,
and the trays hold it out above the pile. The modal gives it its own labelled row,
because in a flat list the one tile that means something other than "discarded"
would read as an ordinary first discard. That split is `splitPile` in
`discardPile.ts` now — it was the same two lines copied into all four trays, and
this was going to be the fifth.

**Three decisions the filing left open, and what each came out as.**

- **Your own pile opens too.** It is the one tray that is never capped (furiten is
  decided by what you have discarded, so truncating it would remove information you
  need), but a control that works on three seats of four reads as broken — and that
  tray falls back on an internal scroll when the board runs out of height, so the
  modal is a genuinely better read there as well.
- **The tiles are drawn upright and unlapped**, unlike every tray. A lap is what a
  pile on a table looks like; these are being *read*, so each tile gets its own
  space, at `md` rather than the tray's `sm`.
- **`Spectate.tsx` does not get it**, and the reason is not the shelved
  spectator-parity item: that screen draws every discard already, uncapped, so there
  is nothing withheld for a modal to open. It gets `splitPile` and nothing else.

**Both traps the filing named were real and both are paid.** `viewport.spec.ts`
asserts no `.tile` inside a `.discard-tray` has a box outside that tray's, sampled
across five viewports — so the modal renders from `PlayPhase`, never from inside a
tray, the same constraint that made N1's claim animation an overlay. And tray tiles
already attach `useLongPress` for the 2× preview, so a press long enough to open the
preview **still ends in a `click`** on the way back up, which would bubble to the
pile and leave a modal sitting behind it. `usePileTap` swallows that click on the
same threshold — `LONG_PRESS_MS`, now exported for exactly this — and consumes the
suppression rather than leaving it standing, so the press after a long one is not
also eaten. Keyboard activation fires no pointer events and is never suppressed,
which is why each tray is a real `<button>` with an `aria-label` rather than a div
with a handler.

Verified in a browser at 390×844: tapping Bot 3's tray opens "Bot 3 — discards / 9
tiles" with the declaration marked and eight upright tiles below it; a second tap
where the pile is lands on the backdrop and dismisses it; a 750ms press on a tray
tile shows the preview and leaves the pile closed; your own tray opens "You —
discards / 11 tiles"; Escape closes. The tray guard's own check ran clean at the
same moment, and 320×568 still fits in 568 of 568 with no document scroll.

---

## ✅ Every seat's tiles face the middle of the table (N32 — 2026-08-03)

Reported in two parts. First: "the top of the tile is facing the right of the screen
but it should face towards the center", for the seat on your right — covering its
discard pile and the void declaration above it. Then, after the fix was filed: the
across seat should be **facing in / upside down** as well, and the left seat already
looks right.

**The right seat was one hard-coded sign.** N10 turned the side seats' tiles a
quarter turn with a single `rotate(90deg)` that **both** columns shared. Measured
mid-play on a 390px phone, the two side trays reported an identical
`matrix(0, 1, -1, 0, …)` — the left tray at x 8–64 and the right at x 326–382,
turned the same way. That matrix sends the tile's top edge to the screen's right,
which is correct for exactly one of them: a discard's top points away from its owner
and toward the middle of the table, the left seat has the middle on its right, and
the right seat has it on its *left*. So the right column was drawn facing off the
edge of the screen.

`.tiles-face-left` is `rotate(-90deg)` and sits on the seat's **column**, not on the
tile: the pile and the void declaration both turn, and only the pile is a run. A
255×210 box occupies the same landscape footprint turned either way, so every rect
the overflow guard reads is unchanged — measured after, the two side trays report
`matrix(0, 1, -1, 0, …)` and `matrix(0, -1, 1, 0, …)` at the same x ranges as
before, and the tray guard is clean.

**The across seat reverses an N10 decision, deliberately.** N10 mirrored that pile's
*order* so it grows the way theirs does and stopped short of 180° on the grounds
that "the reason these are drawn face up at all is so you can read them". That
reasoning was sound and the report still came in: a seat that faces you whose tiles
face you back is the same "four copies of one viewpoint" the order fixed half of.
What changed is that the readability it was protecting is now a tap away (N33) — so
the tiles sit the way they would on a table.

It is **one rotation on the tray** rather than one per tile, which turns order, lap
direction and the bleed padding together — that *is* the pile seen from the other
side, so the explicit `.reverse()` is gone, being what the rotation now does. The
`+N` counter moved to first in DOM (it stands for tiles dropped off the *old* end,
and the rotation puts what comes first on the right) and is turned back upright,
since a number is read rather than placed on a table. A 180° turn about a box's own
centre maps that box onto itself, so `viewport.spec.ts` reads the same rects; note
Tailwind v4 emits `rotate: 180deg` as the standalone property, so
`getComputedStyle(el).transform` reports `none` — a probe that reads only
`transform` will wrongly conclude nothing happened.

**The pile's growth direction is settled as "no change", not left open.** Both side
columns still grow downward. N10 reversed the across row because a horizontal run of
readable faces shows its own direction; a column of sideways tiles does not, and
reversing only the right one would make the two side seats disagree more visibly
than either would agree with its owner.

---

## ✅ A suit is named one way, and the name is what is on the tile (N34 — 2026-08-03)

Reported against N30's own confirm button: "Void Man / 7 of Characters goes out
first" reads awkwardly — use the character plus the English, and put the pinyin on
man/pin/sou.

**Both halves were right, and the awkwardness was two names for one thing.**
`void.confirm` read `suit.man` → "Man" while `tile.label` read `tile.man` →
"Characters", so one sentence pair named a single suit twice, differently, and
**neither was the character printed on the tile the player is looking at.** Every
English suit string now leads with the glyph.

**The reading beside it is pinyin, and Man / Pin / Sou are gone.** The first cut
kept them and appended the pinyin — `万 Man (wàn)` — which prompted the obvious
follow-up: if they are Japanese, leave them off. They are. Man / Pin / Sou are not
readings of these characters at all but manzu / pinzu / souzu, borrowed into English
mahjong writing from a different game, and this is a Sichuan ruleset whose UI has
Chinese as a first-class language. So `suit.*` and `tile.*` are `万 Wàn` / `饼 Bǐng` /
`条 Tiáo`, giving "Void 万 Wàn" and "7 of 万 Wàn discarded first". They belong to a
Japanese catalog when N23 adds one, and a test asserts "Man" appears in none of the
three keys so a revert is visible rather than quiet.

`suit.*.full` keeps the **plain-English gloss** — `万 Wàn (Characters)` — which is
not the Japanese part, and is the only thing left in the UI saying what a suit
depicts. It is what the void screen's three big buttons draw, the one place with
room and the screen where you are choosing a suit rather than reading one back. The
Chinese catalogs already showed the glyph alone and are unchanged.

This also changes what a screen reader announces, since `tileLabel` is the tile's
`aria-label`, and what the kong buttons read — both for the better: the label now
names the character drawn beside it.

---

## ✅ Choosing a suit is enough again, but the default is visible (N30, amended — 2026-08-03)

Reported the same day N30 shipped: keep the suit button active, and have it discard
the first tile of the chosen suit.

**N30 over-corrected, and this is the honest version of it.** The bug it fixed was
that `counts[suit][0]` was computed inside `submit`, where nothing on screen ever
named it — the fix that mattered was making the choice *visible*, not making it
compulsory. Forcing a tile tap cost the two-tap path for the player who does not
care which of their void tiles leads, which is most of them on most deals.

So `voidChoice` returns the default like any other answer: the `needTile` state is
gone, the suit button alone submits, and the screen **marks and names whichever tile
`firstDiscard` holds** — the amber lift and the confirm line read off the choice
rather than off `picked`, so a default looks exactly like a pick, and tapping
another tile replaces it. The one thing that cannot come back is the silent version.

The two null cases are untouched, and are still why this is a function rather than a
`??`: `firstDiscard: null` is the indicator, legal only for a suit the hand holds
none of, and null while holding the suit is what the engine rejects as
`void_indicator_not_allowed` (A36).

Verified in a browser: tapping the 万 button alone gives an enabled "Void 万 Wàn /
1 of 万 Wàn discarded first" with `man-1` lifted and ringed; tapping `man-2` moves
both the mark and the sentence to it. `ui-clicks.spec.ts` now asserts one
`data-void-first` **before** any tile is tapped, which is the assertion the silent
version would fail.

---

## ✅ You pick the tile that leads (N30 — 2026-08-03)

Reported as a subtlety: the player should choose which tile goes out first, "since
discard order might matter here". It does, and **the screen was already sending a
specific tile without asking.**

`declareVoid` carries `firstDiscard: TileId | null` and the engine holds that exact
tile out of the hand as `pendingFirstDiscard` — set aside face down at the
declaration, flipped as your opening play (A35). `submit` filled it with
`counts[chosenSuit][0]`: **the first tile of that suit in whatever order the hand
happened to be in.** So the one discard a player is told they do not choose was in
fact chosen, silently, by sort order — and it is the tile three opponents get their
first claim window on. `9 man` and `2 man` are not interchangeable openings.

**The fix is a tap, and the two null cases are the whole of the logic.**
`voidChoice(counts, suit, picked)` in `voidSelection.ts` returns `needTile` for a
suit the hand holds and `ready` with `firstDiscard: null` **only** for a suit it
holds none of. Those are not interchangeable: null while holding the suit is exactly
what the engine rejects as `void_indicator_not_allowed`, because it would keep a
tile that should have been separated and hand the player an extra one for the round
(A36). That is why it is a pure exported function with a test rather than a `&&`
inside the component — the client suite has no DOM, and this is the rule most worth
pinning.

**The buttons stayed live, as a summary that still selects a suit.** Losing them
would have cost the per-suit counts, which are the comparison the screen exists to
support, and they are the only route to the indicator case — a suit you hold none of
has no tile to tap. What changed is that choosing a suit and choosing a tile are now
two visible answers instead of one silent one: Confirm greys out and reads "Tap the
tile to discard first" until the second arrives, then names the tile through
`tileLabel` on its own line, the way N28's kong offers do.

Two details that would have looked broken otherwise. The picked tile takes **amber
and stops pulsing** rather than gaining a second ring — the suit's pulse means "all
of these go", and two rings on one tile say neither. And the 8px lift is on the
wrapper, not on the `Tile`: `.tile-mark-flash` draws its ring on that box, so a tile
lifting out of its own mark reads as a rendering fault. A transform moves no layout
box, so `pt-2` on the row is what keeps the lift inside the scroller.

**`ui-clicks.spec.ts` was the trap the item predicted.** It clicked a suit button
and went straight for `/Void /i`, which does not exist until a tile is tapped, so it
now taps a marked tile in between and asserts exactly one `data-void-first`. The
other three specs drive `__e2e.voidSubmit()`, which sends the action directly — it
needed no change, and that is also why none of them ever covered this.

Verified in a browser at 390×844 by tapping the **last** man tile rather than the
first: `man-4` left the hand and `man-1` — what the old code would have submitted —
stayed. The lift measures 8px against its neighbours (top 266 vs 274) and sits
inside the scroller; at 320×568 the screen still fits exactly, 568 of 568, with no
document scroll.

---

## ✅ The board is drawn from the table's centre (N10 — 2026-08-03)

Two faults, both of which made the board read as four copies of *your* view rather
than one table seen from your seat.

**The side seats' discards were upright, wrapping, in a scroll box.**
`OpponentSide` drew them in a `flex-wrap content-start w-20 overflow-y-auto`
container capped at six. Three things wrong at once: those players sit at right
angles to you so their tiles face sideways, the pile *wrapped* into a ragged
two-wide block instead of reading as a pile, and the whole thing was a **scroll
region** — a scrollbar over six tiles is a layout that ran out of room and said so.

Turning them fixes all three and **buys height rather than spending it**. A sideways
`sm` tile measures 38.8 × 32 against 38.8 tall upright, and the vertical lap takes
22.5% off every tile after the first, so the pitch is 24.8px. Ten now fit in less
room than six did, with no wrap and no scroller, so the cap went to ten.

**The art is untouched and no rotated copies ship.** The suggestion on the table was
to rotate the source SVGs, and it would have worked — but it would have doubled the
28 shipped assets, needed 28 more `credits.json` entries, doubled what the release
binary embeds, and made "the tiles are the untouched art" false. Not needed: the
rotation is *contained* instead. **The box carries the landscape footprint and the
art is rotated inside it**, so `getBoundingClientRect` on a `.tile` reports the space
the tile really occupies. That distinction is the whole trick — `transform` moves no
layout box, so a tile rotated in place would measure portrait while drawing
landscape, and `viewport.spec.ts` asserts on rendered geometry for every tray tile
across five viewports.

The vertical lap is a **negative margin on the box**, not the horizontal lap's trick
of shrinking the box and overflowing the art. Both hide the same 22.5% body band,
but this way each tile's box stays its true footprint: the tiles genuinely overlap,
which is what lapping *is*, and every rect the guard reads is honest. Measured on a
390×844 phone: tile 38.8 × 32, pitch 24.8, zero tiles escaping their tray, no scroll
overflow on either axis, and zero vertical overflow at 320×568.

**The across seat's pile ran left-to-right like your own** — your reading direction
applied to someone else's tiles. It is reversed now, so their newest discard is at
their left, which is your right. Mirrored in order only and deliberately **not**
turned 180°: the reason these are face up is so you can read them, and an upside-down
tile face cannot be read. Which tile paints on top of the lap flips with the order,
which is fine — the covered band is body and never ink from either side.

### The guard this broke, and why it was the guard's fault

`viewport.spec.ts` started failing on se-portrait with "the hand must be ringed while
the turn is yours (1 of 15 samples were not)" — reproducibly, and passing with the
change stashed, so N10 caused it.

It was not the ring. The sampling loop read the turn cue in one `page.evaluate` and
the claim panel in a **second** one, and the ring stands down during a claim window
on purpose. Those two round trips could straddle a claim opening, so the sample
asserted "your turn, no claim" of one frame against "no ring" of another. Making
rendering heavier — ten sideways tiles per side seat, each an `<img>` with a rotation
and a filter — widened the gap enough to hit it. Both reads are now in one evaluate,
so a sample comes from one frame by construction.

It also tightened the condition rather than relaxing it. The old test was
`claimOverlap(page) === null`, which is null when the panel is absent *or* when the
hand has no measurable tiles — so it counted samples where the panel was up and
charged the missing ring against the ring. `!cue.claiming` asks the actual question.
Three consecutive runs of the spec, then the full suite of 12, all green.

**A guard that reads two frames and compares them is measuring its own latency.**
Same family as N8's lesson about measuring the hand before it settles.

---

## ✅ The kong button names its tile, and says what it will do (N28 — 2026-08-03)

Reported: "it looks like it adds an additional tile to my hand, but it's not super
clear in the UI which one it is." **Both halves of that were right, and the second
was the app's fault twice over.**

The button built its label as `` `${suit[0]?.toUpperCase()}${rank}` ``, so it read
**`Kong M3 (promoted)`**. `M3` appears nowhere else in the app — every other tile is
named through `tileLabel`, which says "3 Characters" and is translated — so the one
control asking a player to give up a specific tile was the one naming it in
untranslated shorthand, and in Chinese the `{label}` slot stayed Latin.

**And a promoted kong really does add a tile.** One copy leaves your hand onto the
exposed pung and a replacement comes off the far end of the wall, so the player's
reading of the screen was correct and the screen just never said so. The three
subtypes differ in exactly what a player would want to know and all three drew one
purple button: concealed pays 2 from each, promoted pays 1 from each *and can be
robbed*, and postponed **pays nothing at all** — two identical-looking buttons where
that is the difference.

Each offer is now a row of its own: **the tile, drawn**, its translated name, and one
line saying what happens to it. Same shape as the first-discard flip block a few
lines below it in `OwnZone` — a tile, and a sentence about that tile. `kongOffers`
is a pure helper because the client suite has no DOM, and it pins the trap that bit
before: `action.tile` is a `Tile` (`{suit, rank}`), not a `TileId`, and reading it as
an id used to crash the app whenever a kong was offered.

The hand marks the copies a kong would consume, which is the literal question that
was asked. **A glow on the art, not a ring on the box** — the hand is a lapped run,
so its layout boxes are pitches and the art hangs a fifth of a tile past them; the
void screen's `.tile-mark` ring is right there only because that screen spaces its
tiles. Purple, matching the button, so the control and the tiles read as one choice,
and static rather than pulsing: a kong is only ever offered on your own turn, and the
hand block already carries N13's pulsing amber ring then.

The extra line costs no vertical budget. The middle row is `flex-1 min-h-0`, so the
well gives up the height rather than the hand — which is the whole point of the
layout R1–R7 arrived at.

---

## ✅ Your own hand shows the tile you won on (N29 — 2026-08-03)

Found by asking whether the "extra tile not showing in the hand" bug had been fixed.
**It had been — in one of the two places it appears.**

A tile claimed off a discard never enters `hand`: `applyHuStatus` scores with
`[...player.hand, actualWinTile]` and leaves the tile in the discarder's pile,
because moving it would double-count it against the 108-tile conservation property.
The round-end reveal was fixed for this with `separateWinningTile`, guarded by
`revealedTileCount === 14 + kongs` against nine real recorded wins.

**`OwnZone` never got the same treatment.** It renders `view.you.hand` and nothing
else, so between declaring Hu on a discard and the round actually ending — which in
Bloody Rules is many turns, while you sit out and watch — your own hand showed **13
tiles that plainly do not win**, under a banner saying the hand was complete. The
identical symptom, and the same tell: a self-drawn win looked right because the tile
really is in hand, and a discard win looked broken.

`separateWinningTile` was widened from `RoundPlayer` to anything carrying a
`HuRecord` rather than copied — it only ever read `hu.byDiscard` and
`hu.winningTile`, both of which are on `PlayerView.you`. The tile is drawn ringed on
the banner's **own row**, not appended to the hand: the hand is the bottom-most row
of an exactly-fitting column and both N8 and N13 had fixes rejected for adding a box
to it.

**The lesson is about where a fix stops.** The round-end fix was correct, tested
against real recorded wins, and documented — and it left the screen a player looks at
for the rest of the round untouched, because the bug was reported from the reveal and
the reveal is where it was hunted.

---

## ✅ The table chooses the fan cap (N27 — 2026-08-03)

N21's audit found one real divergence from the ruleset and it was not a payment:
Novikov states the fan limit as a *variant* — "3 (as in MIL's version of rules) or 4
(as played in Russia and on the MahjongSoft site)" — and draws his own Table 5 at 4.
Both values are canonical. We shipped 3 with no way to say otherwise, so **at the
cap every payment is exactly half** what a 4-fan table expects: an 8-point hand is
16, and self-drawn it collects 51 rather than 27. That is the best candidate for the
hand a real table disputed, and nothing on screen named the basis.

`fanCap: 3 | 4` now rides on `startGame.rules` with a lobby control beside the claim
window, narrowed by `fanCapFrom` in `ws.ts`. **A literal union rather than a number,
for a harder reason than `claimWindow`'s.** A bad claim window costs the table time;
`fanCap` is the *exponent* in `2 ** fanCap`, so one frame carrying `30` is a hand
worth 2^30 and a match decided. The engine needed no change at all — `fanCap` was
already a `GameConfig` field that `calcHandScore` and `calcTMV` both read, and
`createRoom` already took a `Partial<GameConfig>`.

**The help screen was the part that could have shipped wrong.** `htp.fan.cap` and
`htp.scoring.body` both stated the cap in prose — "cap at 3, so 8 points" and
"capped at 2^3 = 8 points" — in all three languages. A 4-fan table would have been
reading a confidently wrong number off the rules screen, which is exactly the trap
`HELP_FAN_ORDER` exists to prevent one section further down. Both now take `{cap}`
and `{max}` as substitutions and `HowToPlay` reads `view.config.fanCap`, falling
back to `DEFAULT_CONFIG.fanCap` because the screen also opens off the landing page
with no game to read. A test asserts the substitution is still there in every
language, so re-hardcoding it fails rather than merely being wrong.

The round-end screen now says which limit settled the round. **A screen full of
payments that never names their basis is where the dispute starts** — the same
lesson as N21's 番数 mislabelling, one level up: there the word was wrong, here the
number was missing. Each lobby option is labelled with the points it implies
(`3 fan · 8 points`) rather than the fan count alone, for the same reason.

---

## ✅ The payments check out; the fan cap does not (N21 — 2026-08-03)

A player at a real table said a hand had been settled wrongly, and on being asked
said it was the **payment** rather than the fan. Checked against three sources
outside Novikov — a tournament ruleset, a commercial payout table, and
Chinese-language summaries of 血战到底 — with a decision per rule in
[docs/audit-payments.md](./audit-payments.md).

**Every payment rule the engine implements is confirmed.** A winner sitting out the
rest of the deal is Novikov verbatim. Self-draw at `handValue + 1` from each
non-Hu player, and a discard win at `handValue` from the discarder alone, are
Table 6 verbatim. The false-Hu penalty is 8 to each player *still in the deal*,
with the worked example giving 24 for three — which is what `payments.test.ts`
already asserted. Wall-end payouts on the theoretical maximum, and the 48-point
forbidden-suit penalty going to nobody rather than to opponents, are both stated
outright.

**The kong amounts had one dissenting source and it lost 3–1.** A commercial payout
table gives 1 point for every kong type; Novikov, the tournament rules and the
Chinese sources all give concealed 2 from each non-Hu player, melded-from-a-discard
2 from the discarder, and promoted 1 from each. Ours matches the three. The three
no-payment paths — robbed promoted kong, a Hu on the tile discarded after the kong,
and the declarer being non-ready at wall end — are the three refund paths already
in `kongPaymentLog`.

**The one real divergence is not a payment at all.** Novikov states the fan cap as
a *variant*: "Typical value of that limit is 3 (as in MIL's version of rules) or 4
(as played in Russia and on the MahjongSoft site)", and his own Table 5 is drawn at
4. We ship 3 and never surface it. At the cap every payment is exactly half what a
4-fan table expects — an 8-point hand becomes 16, and self-drawn collects 51 rather
than 27. **That is the best fit for the original report**, and nothing on screen
says which limit is in force. Filed as [N27](../TODO.md); the default stays 3,
which the tournament source calls the competitive standard.

**Two comprehension bugs, fixed here.** Neither changes a payment; both change what
a player is told one *was*, which is the same dispute from the other end.

`end.handValue` is passed the point value — 1/2/4/8 — and both Chinese catalogs
rendered it as 番数 / 番數, "number of fan". So a 4-point hand read as "4 fan",
which is not even reachable at a 3-fan cap and which a reader would convert to 16
points. **A screen that mislabels the basis of a payment produces exactly the report
this audit started from.** Now 点数 / 點數.

And "You won this round!" rendered the instant you Hu, wrong three ways: the round
is not over, since Bloody Rules runs until three players Hu or the wall ends; you
have not necessarily won, since three seats can Hu and the round-end ranking is by
score, so a cheap early Hu can finish last; and it said nothing about what the hand
was worth. Now `Hand complete · {n} points` — one line, because that column fits
exactly on a 320px phone and a second would fail the overflow guard.

---

## ✅ The reveal shows the sets that won (N16 — 2026-08-03)

The round-end reveal drew a winner's concealed tiles as one flush run of fourteen,
so the hand was all *there* but you parsed it yourself. It now draws the four sets
and the pair — or the seven pairs — that the fans were scored from.

**The trap the item named was real: a hand parses more than one way, and nothing
recorded which reading was scored.** 111222333 is three pungs or three chows, and
only the pung reading earns All Pungs; `calcHandScore` iterates every
decomposition and keeps the best, but `HuRecord` carried only `fans`, `handValue`,
`winningTile` and `subtype`. A client re-running the tie-break would eventually
disagree with the fan list printed directly beneath the tiles, which is worse than
not grouping at all. So the shape is a **field**, not a computation: the scorer has
it in hand at the moment it picks.

**One case the item did not flag — the fan-less hand.** `calcHandScore` seeds
`best` at `handValue: 1` and compares with `>`, so a hand earning no fan never
beats the seed and no shape is ever selected. It falls back to `shapes[0]` rather
than changing the seed, because changing the seed would be a behaviour change made
for the sake of a display field.

**The redaction decision: strip it until the round settles.** `hu` is projected
whole into `PublicPlayer`, so without this the shape would reach every seat the
moment someone won. A winner's *fans* are already public and name a property of
the hand; the shape names every tile type in it — and a seat that has won sits out
the rest of the round with its concealed tiles unshown (`handCount`, never
`hand`). Passing it through would tell the remaining players exactly which tiles
are dead, which is real information this codebase has never given them. It shares
the `reveal` gate with a concealed kong's rank, because it is the same question:
may this viewer see tiles this player never put on the table.

`groupWinningHand` matches the shape's tile *types* back onto the ids the player
held. Three things it has to get right, each with a test: `shape.sets` leads with
the declared melds (`findAllWinningShapes` builds it that way) and `MeldDisplay`
draws those separately, so that many are skipped; a discard-won tile is never in
`hand` at all, so it joins the pool first and lands in the set it completed, which
is the question a player is actually asking; and anything the shape does not
account for comes back as a trailing `rest` group rather than being dropped —
silently drawing a shorter hand is the failure `revealedTileCount` exists to catch
on the other path.

**The ring moved from the winning tile to the group holding it.** Tiles in a run
are lapped, so a ring on one is painted over by the next — and "which set did it
complete" is what the ring was trying to say.

Verified in a played round at 430×932: the winner rendered 3/3/3/3/2 with exactly
one ringed group and "Full Flush · Hand value 4" beneath it, and the three
non-winners kept the flat run.

**Found while verifying, and filed rather than fixed: [N26](../TODO.md).** Nine
call sites label a seat's wind from its absolute index, so they are wrong whenever
the dealer is not seat 0 — which is the same mistake N22 fixed in the dice
overlay, in nine more places.

---

## ✅ Counterclockwise means seat-decreasing (N22 — 2026-08-03)

`throwForWall` computed `wallSeat` as `(dealer + step) % 4`, stepping *clockwise*
round the table. But play travels counterclockwise — `nextActiveSeat` is
`(from + 3) % 4`, and the client seats `seat + 3` on the viewer's right — so South,
the seat to East's right, is `dealer - 1`. For a sum of 2, which the PDF tabulates
as South, the engine named the seat to East's **left**. South and North were
swapped; West at step 2 was unaffected, which is exactly why it read as a diagram
quirk rather than a rule bug.

A third thing fell out of the same sentence. The overlay rendered
`wind.${wallSeat}` — the **absolute** seat index as a wind — so it was right only
when the dealer happened to be seat 0, and East rotates every round. It is
`windOfSeat(wallSeat, dealer)` now, pure and exported for the same reason
`throwerKey` is: the browser reaches the wrong-looking case by luck.

The array mapping is the part the item described. Quarter `q` belongs to seat
`(4 - q) % 4` now, so consuming the array forwards travels counterclockwise the
way play does. The client half is a sign flip in `wallHead` and `[2,1,0,3]` in
`ringSlot`, with the reversed side pair moving from bottom/left to top/right so the
ring stays closed — each side's exit corner is still the next side's entry.

**The replay-corpus cost the item warned about did not exist.**
`replay.test.ts` builds synthetic states with `wall = [0..107]` and never calls
`createGame`, so nothing in it depends on a seeded deal. Exactly two tests failed,
and both were *stating the old direction*, which is what they were for. The e2e
suite's fixed seed still produces a round the viewport guard can use.

**The test that should have caught it was agreeing with a copy of the formula.**
`wall-diagram.test.ts` restated `wallSeat * 27 + (27 - indent * 2)` inline and
asserted a ring quarter — so it passed while the diagram opened the wall of the
player *opposite* the one the dice had named. It now drives the engine's own
`throwForWall` and asserts the head lands on `sideOfSeat` of that seat, which is
the property rather than the arithmetic, and which fails on either half of the
mapping alone.

---

## ✅ The sponsor button, and the two questions it was held for (N20 — 2026-08-03)

The profile rather than a project tier: there are no tiers to point at, and
inventing them would promise a fulfilment story this repo does not have. And a
funding button does sit right beside the CC-BY-SA obligation — it neither restricts
redistribution nor discharges attribution, so it conflicts with nothing. What it
could do is imply the tile art is ours. So that is stated rather than assumed:
`FUNDING.yml` carries the reasoning as a comment, and the README gained a
**Sponsorship** section saying sponsorship supports the code and not the artwork,
pointing at `credits.json` for anyone wanting to support the art itself.
`FUNDING.yml` has no free-text field, which is why the note is in the README
rather than "in the blurb" as the item put it.

---

## ✅ The dice overlay clears itself (N25 — 2026-08-03)

Found while verifying N24 in a browser: declare your void suit promptly and the
seating-roll overlay never leaves, dimming and blurring the whole board at
`bg-black/55 backdrop-blur-sm`. Measured still present at t+3s, t+8s and t+20s
after reaching the play phase, having taken 155ms to get there.

The cause was `isDealStart` in the effect's dependency array. When the phase
advances to `play`, React runs the previous effect's cleanup — **which cancelled
the two stage timers** — and then re-enters the body only to return at
`if (skip || !isDealStart) return`. `stage` was left non-null with nothing
remaining to clear it.

The comment directly above that effect already describes this failure from a
previous round of it: depending on `view.dice` re-ran the effect, cancelled the
timers, and the `shown.current` guard then returned early without rescheduling.
The fix at the time was to make every dependency a primitive. **`isDealStart` is a
primitive — it is just one that changes mid-animation.** Same teardown, different
door. Two stages of 900+900ms scaled by the animation pace is 3.6s at medium, so
anyone who declares faster than that hit it, which is most people.

The handles now live in a ref cancelled on unmount only, so re-arming cannot kill
a reveal in flight, and arming a new deal clears the old handles so the list does
not grow by two a round. Dropping `isDealStart` from the deps would also work, but
it needs a lint suppression — and the suppression is what hides this class of bug.

**Why nothing caught it, and what does now.** The overlay is
`pointer-events-none`, so it blocked no click and all 12 e2e specs passed with it
sitting over every screenshot. The guard went into `ui-clicks.spec.ts`, which
already declared its void suit immediately and so already reproduced it, and it
asserts the overlay is **visible first**: "the overlay is gone" passes just as
well when the overlay never appeared.

---

## ✅ The ⚙ menu reports the pace the table is actually on (N24 — 2026-08-03)

Reported from a real session: practice set to **slow**, and the play screen's ⚙
showed **normal** highlighted. The report offered two explanations — the UI is
wrong, or the setting is flipped on entry — and it was the first.

**The pace was honoured end to end the whole time.** `PracticeSetup` sends
`rules.botSpeed`, `ws.ts` narrows it through `botSpeedFrom` into `createRoom`, and
`room.ts` schedules every bot turn at `botPaceMs(this.botSpeed)`. The bots really
were slow. The lie was one line:

```ts
const [botSpeed, setBotSpeed] = useState<BotSpeed>('normal');  // SettingsMenu.tsx
```

Local component state seeded with the literal, so it was right only by
coincidence — and because it reset on every remount it also lied after a
reconnect, and to a host who had changed the pace mid-match and reopened the menu.

**It was built that way because the client had no way to know.** `botSpeed` is a
`GameRoom` field rather than `GameConfig` — deliberately, per N5: it changes no
rule, and a replay of the same seed is identical at any value — so it is in
neither `GameState` nor `PlayerView`, and no `ServerMsg` carried it.
`GameRoom.getBotSpeed()` existed, its comment said it was there "so a joining or
reconnecting client can show the right one", and it had **no callers anywhere**.

So `botPace: { speed, pinned }` is now a **sibling of `view` on the `view`
message**, not a field on `PlayerView` — there is nothing in `GameState` for
`views.ts` to project, and the value carries no hidden information, so there is no
per-viewer redaction to make. It rides on **every** push, because `sendViewTo` is
also the first thing a reconnecting socket receives: no join / start / repace
trigger to remember, and no way for it to drift out of step with the room.

**Two things the diagnosis in TODO.md had not anticipated.**

`setBotSpeed` sent nothing back. With the local copy gone, the host would tap and
see nothing change until the next bot moved — up to 1.8s away on slow, which is
precisely the setting a host is most likely to be reaching for. It now
re-broadcasts views; measured at 68ms to reflect in the browser.

And `--bot-delay` / `SM_BOT_DELAY_MS` outrank both the lobby and the menu, so on a
pinned process the menu was showing a pace the server ignores entirely. `pinned`
is a flag rather than a substituted speed, because the override is an arbitrary
millisecond count that does not map onto the three presets. The control greys out
and says the choice is not in force, rather than accepting taps the server
discards.

**`botPaceControl` is a pure exported helper for a specific reason: no automated
test reaches this control rendered honestly.** Client tests have no DOM, and the
Playwright suite starts the server with `--bot-delay 150` — so every e2e run sees
only the pinned branch. The unpinned case, which is every real deployment, is
reachable nowhere but a unit test on the helper. That blind spot is how a
hardcoded literal shipped in the first place.

Verified in a browser at 390×844 against two servers, one pinned and one not: a
lobby choice of slow reads back as `Slow` selected and enabled with the table
hint; tapping Fast reflects in 68ms; and the pinned server greys all three and
shows "This server pins the bot pace, so this choice is not in force."

**Found while verifying, and filed rather than fixed: [N25](../TODO.md).** The
dice overlay parks over the board for the rest of the round if you declare your
void suit before its two stages finish.

---

## ✅ The rules are readable before you sit down (2026-08-03)

`HowToPlay` was only reachable from the `?` in `PlayTopBar`, which renders during
the `play` phase — so the one place you could read the rules was the one place you
already had a turn to take, and a new player deciding *whether* to play could not
see them at all. It is now also a footer link on the landing screen, under
"About & Credits".

The overlay needed no change: it takes only `onClose` and reads `SHAPE_EXAMPLES`,
`helpFanRows()` and the catalog, none of which touch `PlayerView`. The link reuses
`htp.title` rather than adding a `landing.howToPlay` — it is the name of the thing
being opened, and it is already translated in all three catalogs, so the parity
test had nothing new to enforce.

Verified in a browser at 390×844: the link opens the dialog over the landing
screen with all 8 sections and 42 tiles drawn, Escape closes it, and switching to
简 renders 玩法说明 from the catalog rather than a baked-in string.

---

## ✅ Help that shows a hand, a discard you can arm early, and a wall that reads the dice (N3, N11, N14 — 2026-08-02)

Three items, plus a design correction a real user forced and a pile of tests the
same user asked for.

**N3 — the help never showed a winning hand, but it did describe one twice.**
The item's premise was half wrong: `htp.winning.body` already stated both shapes
in prose and `htp.scoring.body` already listed five of the ten fan. A new "what
can I win with" section would have been the *fourth* restatement of how a hand
wins. What was actually missing was the picture and the other five fan.

So the illustrations sit under the prose that already states the rule, and the
complete fan table replaced the partial "Notable fans" list. No heading was added.
Three hands are drawn — four sets plus a pair, seven pairs, and a full flush —
grouped by set rather than laid out flush, because the grouping *is* the lesson.

Two things are guarded rather than eyeballed. `isWinningHand` runs against every
drawn example, because **a help screen confidently drawing a hand that does not
win is the one failure a screenshot cannot catch.** And `HELP_FAN_ORDER` is
asserted equal to the keys of the engine's own `COMPATIBILITY` table, with the fan
values read out of it rather than restated — so a fan added to the scorer fails a
test until the help learns about it.

**N11 — arming a discard, and the two ways it could silently cost you a hand.**
The item recommended trying the aggressive version (fire the moment it is legal)
and seeing whether it bites. It bites, and the worse bite is not the claim window
the item already names.

**The server draws for you.** By the time a discard is legal the drawn tile is
already in hand and its consequences are already in `yourLegalActions` — so an
unconditional auto-fire would throw away a self-drawn winning tile *before the
player was ever shown it*. `armedDiscardOutcome` therefore stands down on
`declareHuOnDraw`, `declareHeavenly` and `declareKongOnTurn` as well as on any
claim, and the status line says which. What still fires automatically is exactly
the case the item identified as pure latency: a strict void discard with no
decision in it.

`armedTile` is its own state rather than a flag on `selectedTile`, because that
one is cleared by the `canDiscard` effect — the exact condition an armed tile
exists to survive. Clearing it on arm is also the fired-once guard.

Verified both ways in the running app, because the two paths that matter are ones
a unit test can only assert about a hand-built view: two automatic discards (tile
left the hand, tray grew, no tap, no error toast) and one stand-down on a real
claim window. Eleven verdicts are unit-tested, including the drawn-winning-tile
case a played round reaches only by luck.

**N14 — the wall diagram now reads the dice, and empties from both ends.**
`wallHead` maps `breakOffset` proportionally onto the 28-stack ring and rotates by
the viewer's seat in one expression, which covers all three mappings the item
listed at once — the seat-to-side rotation falls out of the same subtraction, and
the 108-to-56 scale difference *is* the proportion.

The ring is genuinely closed now. The old walk ran top left-to-right, right
top-to-bottom, bottom **left-to-right**, left top-to-bottom, so it jumped from the
bottom-right corner back to the bottom-left. That is invisible while the head is
pinned to a corner and stops being invisible the moment the dice move it. Bottom
and left are reversed, which makes each side's exit corner the next side's entry.

`wallDrawn: { head, tail }` is projected into both views so the diagram opens a
second gap behind the break as kong replacements come off `kongDrawIndex`. **The
engine test asserts the hop into the view, not only the sums** — a projected field
that never arrives would just leave the diagram drawing the old way, silently.
Measured in a played round: the gap opened at ring 20 and wrapped through the
right wall into the bottom one.

Filed rather than fixed on the way out: **N22**, the engine dismantles the walls in
the opposite direction to the turn order. Invisible while the head sat in a corner.

---

## ✅ An affordance nobody found, and the payments a real player disputed (2026-08-02)

Two corrections that came from someone actually using the thing.

**The practice bot settings shipped, and were reported as never deployed.**
N17's recommendation — keep practice one tap, hide the settings behind a small
affordance — shipped as a centred 12px underlined link between the Practice button
and "Watch a Game". That put it in the same visual class as "About & Credits" at
the foot of the page. The first person who went looking for the feature did not
find it and said it was not live. It *was* live: the bundle on the public URL
contained `Bot settings`, `sm-practice`, `setBotDifficulty` and `setBotSpeed`.

**An affordance nobody finds has failed, whatever the code does.** It is now
`screens/PracticeSetup.tsx`, a screen of its own reached from the Practice button,
matching the flow Host already had. Each of the three bots carries its own level
rather than one shared one — three easy opponents is the ladder that teaches least
— so `PracticePrefs.botLevel` became `botLevels`, and `parsePracticePrefs` reads
the old single-level shape as three of that level, because **the key is already on
real devices and a pref that fails to parse resets a choice without saying so.**

Two smaller things from the same pass: "Watch a Game" moved up beside Join as a
real button rather than a low-contrast row under the hint, and the claim-window
presets were reordered to Relaxed / Normal / Quick so the row runs
slowest-to-fastest like Bot pace directly above it. Ordered the other way it read
as the same kind of control running backwards, which is worse than either order on
its own. The values did not change — only the row.

**A payment was disputed at a real table, so the payments got tests.**
The report was specifically about the *settlement*, not the fan.
`packages/engine/tests/payments.test.ts` now carries every path through
`applyAction` and asserts all four seats' net movement: self-draw, self-draw with
a seat already out, a discard win, the three kong subtypes, and the false-Hu
penalty. `scoring-cases.test.ts` does the same for fan and hand value, as worked
hands a human can check against another source.

**The rule most likely to be reported as wrong is that a winner stops paying.**
Every payment loop in `actions.ts` skips `status === 'hu'` — Bloody Rules, the
round continues past the first Hu — so *the same hand is worth less the later it
lands*: a self-drawn 8-point hand collects 27 if nobody has won yet and 18 if one
player has. Both are now asserted side by side.

Nothing was changed in the engine. The tests pin current behaviour so the research
in **N21** has something concrete to disagree with, and so a future change is
visible.

---

## ✅ Who controls the bots, and a sentence that agrees with itself (N15, N17, N18, N5 — 2026-08-02)

Four items, three of them about the same thing: the bots were configured once, by
one control, in one place, and never again.

**N15 — "You rolls for the wall break".** `nameOf` returns the string "You" for the
local seat, and the wall stage substituted it into a third-person template. The
identical bug had been fixed eleven lines above when the dice shipped — the seating
stage picks `dice.youAreEast` rather than putting a name in `dice.isEast` — and the
wall stage was missed.

Both stages now go through one `throwerKey(stage, dealer, youSeat)` helper, so they
cannot drift apart again. **It is a pure exported function on purpose, and that is
the lesson from verifying it:** I checked the fix against the running app and it
passed while never rendering the second-person case at all — who throws comes from
the seating dice, so the local player is East about a quarter of the time and the
assertion was vacuous. The unit test covers all sixteen dealer/viewer pairings,
checks the keys resolve in all three catalogs, and checks the second-person strings
contain no `{name}` — since `t` is called with `name` whichever key comes back.

**N17 — practice took no settings at all.** `startPractice` fired three
`addBot{difficulty:'easy'}` and then `startGame` **bare**, with no `rules`, so
practice silently inherited every default and a solo player had no way to slow the
bots down — in the one mode where following what happened matters most. It now
sends `rules.botSpeed` and seats the bots at the chosen level.

Behind a disclosure that starts closed, because practice's whole appeal is one tap
and a form in front of it spends that. The choice is remembered in `prefs.ts`, so it
is a once-ever decision rather than a prompt every session. Labelled "Bot settings"
rather than "Practice settings" after the first version collided with
"Practice (vs Bots)" — a collision that broke five e2e projects on a loose name
match, and would have read as ambiguous to players for the same reason.

**N18 — one bot level for the whole table, and a latent bug underneath it.** The
protocol always carried difficulty per bot (`addBot.difficulty`,
`RoomSlot.difficulty`, read per slot in `bot.ts`); only the lobby forced them to
match, via a shared selector you had to remember to set *before* each tap. Empty
seats now offer "+ Easy" / "+ Medium" directly — the level is the tap — and each
seated bot carries a picker, on a new `setBotDifficulty` message so re-levelling
doesn't mean kick-and-re-add with a window for a human to take the seat.

**The bug found on the way:** `addBot` carried no seat and the server called
`findOpenSeat`, so the per-row "+ Bot" buttons were lying — tapping North's filled
South if South was empty. `addBot` now names its seat, validated and falling back to
the first open one. Verified in the browser: adding Medium to North left South and
West empty, which the old code could not have done.

Also dropped the name `Bot (Hard)`, which the *medium* bot wore. It was already
wrong and N19 will make it wronger; the level is shown from
`LobbyPlayer.difficulty`, which was already on the wire, so the name stays `Bot N`
and stays stable in the feed and the move history.

**N5 — the pace can change mid-match.** `botSpeed` was already a `GameRoom` field
rather than `GameConfig`, precisely because it changes no rule and a replay of the
same seed is identical at any value — so it only had to stop being `readonly`. It is
read when a bot turn is scheduled, so a change lands on the next move with nothing
to cancel.

The control is a host-only section in the play screen's ⚙ menu, **hidden** rather
than disabled when the table has no bots — unlike the lobby's version (N9), where a
seat can gain a bot right up to Start, a table mid-round cannot, so the control
would never become useful. `--bot-delay` still outranks it, which is what keeps the
suites fast. `setBotSpeed` returns whether anything was actually paced, so the
server can answer rather than silently accept.

---

## ✅ Whose turn it is, at both ends of the screen (N7 + N13 — 2026-08-02)

Filed as two items and fixed as one, because they were the same sentence failing
twice: N7 was "you cannot see it" and N13 was "seeing it is not enough".

**N7 — it rendered at zero width, with the text present the whole time.** The top
bar is `justify-between` with a `flex-shrink-0` icon cluster, and the indicator was
the only shrinkable child — so on a 320px phone it absorbed the entire shortfall
and truncated to nothing. Measured at 320×568 mid-play: bar `scrollWidth` 323 in a
320 box, `Wall: 55` at 41px, cluster at 254px, indicator at **0**.

The width came from the cluster, and `LangSwitch` was 122px of it — three 40px
buttons for a control most players touch once a session. It moved into the ⚙ menu
that N4 added, which is where it belonged anyway: that menu is per-player display
preferences and language is one. The indicator then became `flex-1` rather than
merely shrinkable, so it *claims* the freed room instead of only surviving in it.

**N13 — the cue was a colour swap on 10px text at the far end of the screen.**
`isMyTurn` already gated which buttons exist and which tiles carry
`data-discardable`, but it lit nothing up. Two changes: the indicator is now a
filled amber pill rather than amber text, and the hand block carries a pulsing
inset ring — which is the treatment the item recommended, because that is where
the player is already looking and where the action has to be taken.

**The ring is an inset box-shadow on a pseudo-element, and that is load-bearing.**
The hand is the bottom-most row of a column that fits exactly on this viewport, and
`viewport.spec.ts` fails the play screen for one extra row — a ring that occupied
layout would have failed CI the way N8's `sticky` bar did. The base state is the
fully-lit ring with the animation only dimming it, so under
`prefers-reduced-motion` — where the global rule collapses it to one instant frame
with no fill-mode — it reverts to visible rather than to nothing. Same reasoning
`.rotate-overlay-icon` already carried.

It stands down during a claim window: the claim bar is the cue then, and two
competing amber prompts read worse than one.

**The guard asserts rendered width, not presence.** The text was in the DOM the
entire time N7 was live, which is exactly why nothing caught it — this spec watched
vertical overflow and `ui-clicks` fails on document-level sideways scroll, which a
shortfall inside a clipped row never causes. Verified by reverting both changes and
re-running: it reports the indicator at **0** against a floor of 40. A missing
indicator fails too, since `turnCue` returning null leaves the your-turn sample
count at zero.

**And it caught a flaky guard I had added earlier the same day.** The full suite
failed on `claimWindows > 0` — the non-vacuity assertion that stops the claim-bar
check passing for free on a round with no claim — after that spec had passed three
isolated runs. The assertion is right; what was wrong is that it depends on what a
random deal contains, and the seed was `randomUUID()` with no seam. A guard that
fails on an unlucky round teaches people to re-run it rather than read it, which
costs more than the guard is worth.

So `SM_SEED` now pins the deal, exactly as `SM_BOT_DELAY_MS` pins the pace, and the
Playwright config sets it. The room code is deliberately **not** mixed in: it comes
from `crypto.randomInt`, so mixing it would put the randomness back and make a spec
run alone differ from the same spec run in the suite. Verified with three
consecutive clean runs of both viewport projects plus a full 12/12 suite.

**Also, the claim window got longer again: 10s → 15s.** That is its fourth move
(3, 6, 10, 15), which is the argument for the lobby preset N6 shipped rather than
for a better guess. `CLAIM_WINDOWS` moved with it — quick 8s, normal 15s, relaxed
30s — and `normal` stays pinned to `DEFAULT_CONFIG.claimWindowMs` by a test, so a
host who touches nothing gets the same window practice mode does. The deadline is
only ever a backstop: the window closes as soon as every eligible seat has acted
and bots never wait it out, so a longer value costs time only when a human is
actually thinking.

---

## ✅ Three small ones: the claim window, bot pace with no bots, and a feed stuck in one language (N6, N9, N12 — 2026-08-02)

Picked up together because all three were filed as **Small** and none touches the
board layout.

**N12 — the feed kept the language a line was announced in.** `EventFeed` held
`useState<{ id; text }[]>` and filled it with `t(key, …)` at announce time, so the
translation was baked into state and nothing re-ran on a language change; only
lines added *after* the switch used the new language. It now stores
`{ id, key, seat }` and calls `t` in the JSX — which is what `PlayHistory` and the
store's `history` already did, and the store's own comment says why: "a player
switching language mid-round should see the whole list switch with them." The feed
was the one place that didn't follow it.

Resolving the player *name* moved to render too. It has to: `nameOf` needs the
view, and the whole point is that nothing about the line is fixed at announce
time. The effect got simpler as a result — it now reads only the sound function
through a ref, so it stays keyed on the event batch alone, which is the property
that stops it re-announcing on every push.

**N6 — the claim window is the host's, as a preset.** `claimWindowMs` was already
in `GameConfig`, already projected in `PlayerView`, and `ClaimPanel` already took
`windowMs` as a prop; the server had simply never set it. So the work was a lobby
control, a field on `startGame.rules`, and narrowing in `ws.ts`.

**Narrowed to `quick | normal | relaxed`, never a number.** This is the one
`rules` field where a raw integer is a denial of service in a single frame:
`claimWindowMs: 86400000` freezes a table until the sweep reaps the room, and `0`
closes the window before a human can see it. `claimWindowMsFrom` maps the three
presets to 5000 / 10000 / 20000 and falls back to normal for everything else,
including every raw number.

The test that matters is not the mapping but the hop after it: `houseRules`
returning the right value is no use if the room doesn't carry it into engine
state, and a wrong window there looks exactly like a right one until somebody
times a claim. So there is an assertion through `createRoom` to
`GameState.config.claimWindowMs`. Normal is pinned to `DEFAULT_CONFIG` as well —
otherwise touching nothing in the lobby would silently change the window every
existing test was written against.

**N9 — bot pace at a table of four people.** `HostSetup` rendered the selector
unconditionally, so a host filling all four seats with humans was still asked how
fast the bots should play. It changed nothing, which made it a control that read
as broken. Now the group greys out and the hint says why.

The condition is phrased as *unless we know every seat holds a human* rather than
*if there are bots*, and that direction is deliberate: an empty seat can be filled
with a bot right up to Start, and so can a lobby list that hasn't arrived yet
(`lobbyPlayers` starts `[]`). Phrased the other way round, the control would flash
disabled on first paint.

**Verified in the running app, because two of the three are render-time and the
client suite has no DOM.** N9 with four real browser contexts — three empty seats
gave three live buttons, four humans gave three disabled ones and the hint — and
N12 by catching an announced line in English and reading the same line back as
Chinese immediately after the switch. Both probes were then deleted rather than
committed: the N12 one has to catch a 3.5-second line, and this session already
learned that an intermittent guard is worse than none.

**One thing the guest contexts taught.** Extra *pages* in one browser context
share `localStorage`, and the seat token lives there — so a second page rejoined
the host's own seat and never showed a join form. Each simulated player needs its
own context. Also worth knowing for any future lobby spec: `/j/CODE` rewrites to
`/?code=CODE` and renders the landing screen with the code already on the Join
button, so the form is one click further in than the URL suggests.

---

## ✅ A tab icon of its own, because 16px is a different problem (2026-08-02)

Reported as "the favicon is a little bit weird looking, is it possible to use an
SVG instead?" — and an SVG favicon was already what shipped: `icon.svg` has been
first in the `<link rel="icon">` list all along. The format was never the problem.

**Rasterising it at 16px showed what was.** `icon.svg` draws a mahjong tile with
中 on its face. The tile frame takes about 40% of the canvas, which leaves the
glyph roughly 6px, and its strokes land at 0.94px — so 口's counter closes
completely and the icon resolves to a red blob with no character in it. Rendering
the geometry at 16 / 24 / 32 / 48 and looking at it settled in one pass what
reasoning about stroke widths had not.

A bolder, tighter version of the same design was tried first and was worse: still
a blob at 16px, and at 48px the counters had nearly closed, so it read as a solid
block. **The framed design cannot be rescued at tab size** — there is no room for
a frame and a counter in 16 pixels.

So `icon-tab.svg` is a separate design: 中 alone, filling the canvas, bone on
felt, no tile. At 16px the counter survives at about 2px and the character is
legible. Bone-on-felt rather than the app icon's red-on-bone because at tab size a
cream ground is indistinguishable from light browser chrome, and felt is the
colour `theme-color` and the manifest already claim.

`icon.svg` is untouched and stays the install icon — the four generated PNGs came
back byte-identical, which is the check that the app icon really didn't move.
`icon-tab-32.png` is the raster fallback for **Safari, which ignores an SVG
favicon**; without it the fix would have left Safari showing the blob. Named
`icon-tab` rather than `favicon` so it matches `sw.js`'s `/icon` prefix and is
runtime-cached with the rest of the set.

`generate-icons.mjs` now carries two geometries, `sampleApp` and `sampleTab`, one
per SVG. That is a duplication the file already had for one icon and its header
already warned about; it now names both and says they are deliberately different
designs rather than one scaled.

---

## ✅ Two overlays that never went away — one bug, twice (2026-08-02)

Reported from play: "X ponged" / "X declared Hu!" staying up until round end, and
separately the flown claim tile parking itself over the board at its destination
size, covering other players' hands for the rest of the round.

**Same fault in two components, and it is a React idiom that reads as correct.**
Both `EventFeed` and `ClaimFlight` scheduled a removal timer inside an effect
keyed on `lastEvents`, and returned `() => clearTimeout(timer)` as cleanup. The
store hands out a **fresh array reference on every server push**, so the effect
re-ran constantly; each re-run's cleanup cancelled the pending removal, and the
next run hit its own early-return guard — `lastEvents.length === 0` in the feed,
`claims.length === 0` in the flight — and returned *without rescheduling*. The
item then had nothing left to remove it.

Cleanup-cancels-timer is the textbook pattern, and it is wrong precisely when the
timer belongs to a past batch rather than to the current render. Both now keep
their timers in a `useRef<Set<...>>` and clear them only on unmount.

Measured rather than assumed, since client tests run without a DOM and this is
effect wiring rather than a pure helper. Feed lines: longest survival 3758ms
against a 3500ms budget, none left at round end. Flight overlays: 11 across four
rounds, longest 1301ms against a ~690ms budget (the excess is `AnimatePresence`'s
exit fade plus sampling granularity), never parked.

**Worth generalising:** an effect keyed on server-pushed state cannot own a timer
in its cleanup. `DiceOverlay` had the same shape and was fixed during N2 for the
same reason; that makes three.

---

## ✅ N8 — the claim bar covered the hand, and my first diagnosis was wrong (2026-08-02)

The Pung / Kong / Hu / Pass bar was `fixed bottom-0`, and your hand is the
bottom-most row, so for the whole 10-second window the bar sat on the tiles the
decision is about. The bar stays `fixed` and the **board pads instead**: it
reports its own height, and `PlayPhase` sets that as `paddingBottom` on the root
while a window is open. Padding an `h-dvh` border-box element reduces its content
height, so the `flex-1 min-h-0` middle row gives the space back and the column
height does not change.

**`sticky` in flow was tried first and CI rejected it, correctly.** In flow the
bar covered nothing — but it added a row to a column that already fits exactly on
a 320×568 phone, and `viewport.spec.ts` failed the play screen for overflowing
its scroll container. It passed locally three times and failed on CI, whose font
metrics leave less slack. Reserving space inside the existing column is the
version that costs no height. The bar's height is *measured* rather than assumed,
because which buttons are offered varies with the claim: 43px with none, ~95px
with a row of them.

**The wrong turn is the useful part.** I first measured the hand's layout box
ending exactly where the bar began, saw hand tiles reported 21px lower than that,
and concluded the tiles must *paint* outside their box because of `.tile-lap` —
recording in TODO that the cause was tile geometry rather than bar position, and
telling the next person to read the tile-rendering handoff first. That was wrong
twice over:

- **The lap has no vertical component.** `.tile-lap .tile-face` is
  `width: 129.032%` but `height: 100%`, and against the art's 210:255 ratio that
  fits the box exactly. Measured, the face box and the tile box are the same
  rectangle (514..550). The lap bleeds sideways only.
- **The 21px was an animation frame.** `Reorder.Item` animates the hand on any
  layout change, so sampling as the bar appears catches an `li` at 513..555 while
  its own `ul` sits at 419..465 — Framer still moving it from where it used to be.
  Two of my "the fix does nothing" conclusions were that transient, not the fix.

The real cause was ordinary: a fixed element reserves no space, so the hand's
container ran to the viewport bottom (462..568) under a bar covering 525..568.

**Lessons worth keeping.** Any measurement of the hand must settle first — poll
until two consecutive samples agree — because the hand is the one part of this
board that is always mid-animation. And a diagnosis that survives only because
its own verification was mis-sampled will happily be written into the docs as
fact; the `padding-bottom` attempt "changing nothing visible" was the tell I
should have chased rather than reported.

**The guard** samples `.claim-panel` against every hand tile inside the existing
round loop, asserts at least one window was seen (otherwise it passes for free on
a round that offered no claim, which is how this went unguarded), and polls to a
stable pair rather than sleeping — a fixed wait long enough on one machine is
short on another, and an intermittent guard is worse than none. Verified by
removing the padding: it reports all 13 hand tiles under the bar on both
viewports. With the fix, settled windows show zero tiles under the bar and no
board overflow, over three consecutive full-suite runs.

---

## ✅ "Hu was declared but it was not a valid hand" — the reveal, not the engine (2026-08-02)

Reported from live room **NDRV**. The engine was exonerated and the round-end
reveal was at fault, so this is worth recording for the method as much as the fix.

**How it was checked.** `render.yaml` says the free tier has no disk and so
persistence and replays are off — but `/api/replay/1` on the live service
returned **200**, not 404, so the comment is wrong and every finished round is
recorded. Ids 3, 4 and 5 are NDRV's three rounds with full action logs. Because
`hand.ts` is untouched by N2, the local engine *is* the deployed one, so each
recorded `HuRecord` could be re-checked against `isWinningHand` directly rather
than by replaying. **All nine wins were valid** — correct tile counts, real
winning shapes, void suits consistent with the tiles held.

**The actual bug.** `RoundEndRow` drew `player.hand` and the melds, and nothing
else. On a Hu by discard the winning tile never enters `hand`: `applyHuStatus`
scores with `[...player.hand, actualWinTile]` and leaves the tile in the
discarder's pile. So the reveal showed **13 tiles that plainly do not win** —
which reads exactly as the engine having accepted an invalid Hu. Seven of the
nine NDRV wins were discard wins and every one of them was drawn one tile short;
the two self-draws were complete, because a self-drawn tile *is* in the hand.
That inconsistency between the two win types is the tell.

**Why the fix is in the client.** Adding the tile to `player.hand` in the engine
would double-count it: the engine never removes it from the discarder's
`discards`, so the same tile would exist twice and break the 108-tile
conservation property. `separateWinningTile` returns it only for a discard win,
and the reveal draws it ringed and set apart — which is also how a real table
leaves the winning tile.

**The guard** is the nine real NDRV wins as fixtures, asserting
`revealedTileCount === 14 + kongs`. One case deliberately re-derives the old
behaviour and asserts all seven discard wins were short by exactly one, so the
regression is pinned rather than merely fixed.

Two lessons. Replays make a live report answerable without reproducing it — the
`/api/replay/:id` route paid for itself here. And `RoundResult.hand` is
documented as "concealed hand, revealed", which is true and still not the
winning hand; a field whose name is accurate can still be the wrong thing to
draw.

---

## ✅ N2 — the dice are real now (2026-08-02)

Two throws, both with two dice, both from `rng.ts` on a stream of their own
(`seed + ':dice'`) so they neither consume from nor perturb the shuffle. Engine
in `dice.ts`; the client shows them in a two-stage overlay at the deal.

**Seating is on by default, unlike every other addition to Novikov.** 換三張 is
off because it changes the hand you play; the seating throw only changes which
seat deals, and the engine already rotates the dealer every round. More to the
point, the wall throw Novikov *does* specify is meaningless without an East to
throw it, and every outside source seats players by dice. Ties re-throw among
the tied only, capped at four rounds, then the lowest tied seat takes it — a
tiebreak that can loop against a seeded PRNG is a hang, not a long wait.
Measured over 20,000 games: **19.25% of deals hit a tie**, and East lands
25.4 / 25.2 / 24.8 / 24.7% across the four seats.

**The wall throw implements Novikov's examples, not his prose.** The prose says
"5 or 9 indicate East as the second player to throw dice", which is almost
certainly Chinese Classical's two-thrower version — East throws to name a
player, that player throws again, the sums add. All three of his worked examples
derive both the wall and the indent from one roll and never mention a second.
The examples are unambiguous and the prose is not, so the examples won and the
discrepancy is recorded in `dice.ts` rather than split down the middle.

**The break is a wall rotation, which is all it ever was.** A rotation of a
uniform shuffle is still uniform, so no distribution and no fairness changed —
only which tiles a given seed deals.

**Two engine tests broke on exactly that, and both were pinned too tightly
rather than wrong.** `phase1`'s deal test asserted seat 0 holds 14 tiles; it now
asserts the *dealer* does, which is the actual invariant. `ledger`'s non-vacuity
guard rode on one seed producing entries; it now takes the first of several,
since a single seed pins it to whatever that deal happens to produce.

**No physics library.** The result is decided by `rng.ts` before anything is
drawn — it has to be, or replays stop reproducing — so a physics engine would
have to be *rigged* to land on a predetermined face, which is harder than
animating to it. `Die.tsx` is a CSS 3D cube: six faces, opposite ones summing to
7, rotated to bring the drawn value forward. Roughly 600KB of three.js +
cannon-es avoided on a mobile-first PWA.

**The bug worth remembering is a dependency array.** The overlay's stage timers
lived in an effect that depended on `view.dice`. The server pushes a fresh view
many times a round, so that object is a new reference every time — the effect
re-ran, its cleanup cancelled the timers, and the `shown.current` guard then
returned early *without rescheduling them*, parking the overlay on its first
stage for the rest of the round. Every dependency there is now a primitive, and
that is load-bearing rather than tidy.

`ui-clicks.spec.ts` assumed "round-1 dealer is the host (us), so it's our turn
first" and waited 10s for the flip button. Three times in four that is now false
and one to three bot turns intervene, each able to open a 10s claim window — an
**intermittent** failure, which is the worst kind. The waits are sized for our
first turn rather than the game's, and the previously flaky projects were run
four consecutive times clean.

Verified by driving the real app: the seating stage agrees with the engine in
6/6 runs, tie rounds render only the tied seats and are labelled, the wall stage
reports the right wall and indent, the overlay clears itself, and with
animations skipped it never appears at all. 19 new engine tests + 8 client;
193 / 130 / 95 unit tests and 12/12 e2e green.

---

## ✅ N4 — animation pace is the player's, not the table's (2026-08-02)

Two settings behind a new ⚙ menu in the play top bar: **animation speed**
(slow / medium / fast) and **skip animations** (off). Both live in localStorage
under `sm-anim`, beside the language preference.

**Per-player, not on `startGame.rules`.** The obvious place was beside
`botSpeed`, and it is the wrong one. Bot pace has to be the table's because bots
move *on the server* and everyone watches the same move land at the same moment.
Animation pace is local rendering only: every client receives the same `claimed`
event and draws its own copy over a board that has already updated underneath,
so one player on slow and another on fast desync nothing and block nobody. That
also made it the cheaper build — no protocol field, no `ws.ts` narrowing, no
room state for a value the server never reads.

**The shipped durations became `fast`, and the default is `medium`.** So the
default is now 1.5× slower than what was there before: `DISCARD_FLIGHT_MS` 280 →
420, `FLIGHT_MS` 420 → 630, `HU_CELEBRATION_MS` 1200 → 1800. Slow is 2×. A test
pins `fast` at exactly 1×, because the constants in the components *are* the fast
values and a drifting multiplier would silently retime what shipped.

**Skip is not "speed zero".** A zero duration still mounts the overlay, still
schedules the clear timer and still paints a frame; skipping has to mean the
animation is never started. So the components branch on `skip` rather than
multiplying by it — and `OwnZone`'s layout effect still clears `takeoff.current`
on the skip path, or the *next* discard would find a stale takeoff waiting and
fly the wrong tile.

**It is deliberately separate from `prefers-reduced-motion`**, which stays
honoured globally through `MotionConfig reducedMotion="user"`. That is an
OS-level accessibility signal and this is a taste. Conflating them would let
turning this *off* look like it should override someone's system setting; the
menu says so in a hint under the checkbox.

**The ⚙ replaced the 🔊 button rather than joining it.** Measured on the
smallest supported phone, the top bar is already at `scrollWidth` 323 in a
320px viewport — the icon cluster is 254px of it — so a fifth 40px control was
not available. Sound moved into the menu, which keeps the bar width-neutral and
gives the next preference somewhere to go. Muting costs a second tap now, which
is the right trade for a once-a-session action that arrives with a label instead
of an emoji you have to interpret.

Verified by driving the real app at 320×568: the menu opens, Escape closes it,
both settings reach localStorage and survive a reload, the speed buttons disable
while skipping, and forty moves played with skip on left **zero** stranded
flight overlays on the board. 11 new unit tests; 12/12 e2e still green.

---

## ✅ It is deployed, and the build fought back first (2026-08-02)

Live at `https://sichuan-mahjong.onrender.com`. Post-deploy observations are in
[design-hosted-server.md](./design-hosted-server.md#what-the-first-deploy-actually-showed-2026-08-02).

- [x] **The first build failed on `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`**, and the
  diagnosis is that **pnpm stopped reading the `pnpm` field in `package.json`**.
  Render's pnpm 11 therefore computed an *empty* override set, compared it to a
  lockfile recording two, and `--frozen-lockfile` refused. The overrides moved to
  `pnpm-workspace.yaml`, which 10.x and 11.x both read.
- [x] **The error's own advice was the trap.** It suggests reinstalling with
  `--no-frozen-lockfile`, which resolves against the empty config and rewrites the
  lockfile to match — quietly dropping the `vite@<6.4.2` and `esbuild@<0.25.0` CVE
  floors. The frozen check was the thing that *caught* this, not the thing that
  broke. Worth remembering the next time a tool suggests unfreezing to get green.
- [x] **`packageManager` pins the toolchain**, because version drift is what
  caused this: the lockfile was written by 10.33.3 and the host ran whatever it
  shipped. pnpm self-switches on the field, and corepack provisions it on Node 22.
  `pnpm/action-setup` then broke CI by refusing to see both its own `version:`
  input and the pin — the input went, since the pin is the one that also reaches
  Render.
- [x] **CI installs frozen now, like the deploy does.** A plain `pnpm install`
  rewrites the lockfile to match whatever config it can see, which is precisely
  how a mismatch stayed green in CI and failed on Render. The two commands should
  not disagree about what a passing install means.
- [x] **`--hosted` verified from outside**, by measuring the join limiter: it cuts
  in near 60/minute, the hosted number, where the local profile allows 600.
- [x] **The spectator secret holds in production.** Against a running game the play
  code alone is refused, a wrong watch token is refused, and only the real one is
  admitted — both refusals returning the same `no_game`, so the two cases stay
  indistinguishable.
- [x] **C7's keepalive survives the proxy, but is invisible from the client.** The
  ping frames are answered at the edge and never reach the browser, so counting
  client-side ping events proves nothing. The observable is the socket outliving
  the 60s at which a missed pong would have terminated it.

- [x] **The `trustProxy` hop count came out of the deploy, and the answer was to
  leave it alone.** One hop keys per-IP limits to a Cloudflare edge address rather
  than to the player, so `SM_TRUST_PROXY=2` looked like the fix. It was the
  opposite: raising it moved `req.ip` onto an entry the client writes, and a forged
  `X-Forwarded-For` took a request from 8-of-10 rejected to 10-of-10 allowed. Back
  at one hop, 150 forged source addresses share one bucket and the header buys
  nothing. **Render appends to `X-Forwarded-For` instead of replacing it**, so no
  hop count can reach the player without also reaching something an attacker
  controls — the granularity cost is accepted rather than outstanding. The lesson
  is the shape of the test, not the number: checking only that the limit got
  *tighter* would have passed a spoofable configuration, which is why the
  acceptance test had a second half that forged the header.

## ✅ Search engines can read it — C10 (2026-08-02)

Design and rationale: [design-hosted-server.md §C10](./design-hosted-server.md).

- [x] **`/robots.txt` and `/sitemap.xml` are routes, not files.** The diagnosis is
  that they *can't* be files: both name an absolute origin, and **a sitemap whose
  URLs sit on a different origin than the one that served it is discarded** rather
  than followed — so a URL baked in at build time is wrong on every deployment but
  one, and this build runs on three. `originFor` takes `RENDER_EXTERNAL_URL` when
  the platform set one (Render does, unasked) and derives it from the request
  otherwise, the same way the client has always derived its socket URL. `Host` is
  a header the client wrote, so it is checked against a host shape before being
  echoed into a response body.
- [x] **The SPA fallback was answering both with `index.html` and a 200.** Not a
  redirect, not a 404 — HTML that parses as zero robots directives. It happened to
  mean "crawl everything", which is roughly right by accident, and it hid the
  absence of a sitemap behind a success.
- [x] **`Disallow: /*?` closes the watch link.** Every stateful URL here keeps its
  state in the query string, and `?spectate=1&watch=…` holds the C5 spectator
  secret. This line is the reason the rule exists; duplicate `/?code=ABCD` results
  are the side benefit. `/j/:code` goes too, being a door that expires.
- [x] **The canonical and `og:*` tags are the one absolute address in the client.**
  Everything else derives its origin, but the crawlers that read `og:*` do not run
  JavaScript, so those five lines name `https://sichuan-mahjong.onrender.com` in
  `index.html` with a comment saying what a fork has to change. `<title>` and the
  description now say what the page is instead of "Local 4-player…", which stopped
  being true when it stopped being local.
- [x] **A `<noscript>` block, because `<div id="root">` is empty until JS runs.**
  Google renders JavaScript; its first pass does not. Three sentences of what the
  game is costs nothing and is the only text in the initial HTML.
- [x] **The SPA fallback learned to say no** (`isSpaRoute`). It answered every
  unmatched path with `index.html` and a 200, which is right for `/j/AB23` and
  wrong for `/assets/index-OLD.js` — that 200 is why a client rebuild without a
  server restart surfaced as a parse error rather than a 404 naming the file, the
  footgun CLAUDE.md warns about. It also blocked Search Console's **HTML-file
  verification**, the method Google recommends, which fetches a filename it knows
  is absent and reads a 200 as a server that cannot distinguish present from
  missing. The line is a file extension, or an `/api/` prefix; the client's only
  routes are `/` and `/j/:code`, and a room code is `[A-Z2-9]{4}`, so no route
  contains a dot.

---

## ✅ It runs on a public URL — C1–C7, C9 (2026-08-02)

Design and rationale: [design-hosted-server.md](./design-hosted-server.md).

- [x] **C1 — configuration from the environment.** `PORT` (every platform assigns
  one) and `--hosted` / `SM_HOSTED=1`, which drops mDNS, Tailscale detection and
  the QR code — all of which answer, in a container, a question nobody asked — and
  prints a banner that says what a hosted banner should.
- [x] **C3 — rate limits, and a ceiling.** `POST /api/lobby` was unauthenticated
  *and* unlimited: one script allocates rooms until a 512MB instance falls over.
  Per-caller budgets on create and on lookup/socket-open (the same budget, because
  opening a socket is the other way to ask whether a code is real), plus a global
  cap on concurrent games because per-IP limits do not bound a total.
  **The limiter must not become the exhaustion vector it prevents** — buckets
  expire, `maxKeys` caps the table, and it *evicts* rather than refusing, since
  refusing would let a wide address pool lock everyone else out.
- [x] **C4 — `trustProxy` is a hop count, not `true`.** Fastify hands this to
  proxy-addr, where `true` trusts the whole chain and resolves `req.ip` to the
  **leftmost** `X-Forwarded-For` entry — the one the client wrote. Every per-IP
  limit in C3 would have been defeated by adding a header. Hosted trusts 1 hop;
  self-host trusts nothing, since nothing sits in front of it.
- [x] **C5 — spectating has its own secret.** `?spectate=1` needed no token, which
  was fine while a tailnet decided who could reach the server at all. Now a watch
  token, issued to the host alone, never on `/api/lobby/:code`, compared with
  `timingSafeEqual`, and living in **its own store rather than a third token
  `role`** — a seat token resolves to a seat and the handler reconnects whoever
  presents one straight into it, so a watch token in that map would have seated a
  spectator as a player. Keyed by code, so it survives the `deleteLobby` that
  `startGame` does. Client side: a copyable watch link, `?watch=` auto-connects and
  scrubs itself from the address bar, and `parseWatchRef` takes a link or a bare
  ref.
- [x] **C6 — sweep TTLs are per profile.** A day of dead rooms is free on your own
  machine and is not on a shared instance.
- [x] **C7 — a WebSocket keepalive, which nothing needed before.** There was no
  ping anywhere: no middlebox on a LAN closes an idle socket, and a mahjong turn
  is quiet for as long as someone takes to think. A proxy reaps it. The client
  would recover through its backoff, but only after showing "Reconnecting…" during
  every long pause, with `MAX_RETRIES` to spend. The dead-peer half matters too —
  a half-open socket holds a seat nobody is sitting in and `room.disconnect` never
  fires. Verified against a live server: ping at 30.0s.
- [x] **C9 — health check.** `/healthz` already existed; `render.yaml` points at it.
- [x] **C8 is deliberately not done.** Free tier has no persistent disk, and
  `getDb()` already returns null with every caller handling it (the A17 work that
  let the Bun binary run without `node:sqlite`). Persistence off is a config
  decision, not a code path.

**The decision underneath all of it:** the hardening is *not* conditional on
`--hosted`. The profile carries numbers — limits, ceiling, TTLs — and nothing
else. A control that switches on with the flag is one you would develop against
with it off, and one that fails open the first time someone forgets it on a
deploy. That also ruled out a login: there are no accounts and no PII, so the room
code is already the bearer capability; it just had to be built like one.

## ✅ Room codes are CSPRNG-drawn (C2, 2026-08-02)

- [x] **`generateCode` uses `crypto.randomInt`, not `Math.random`.** The room code
  is a bearer capability — there are no accounts, so holding it is what admits
  you — and `Math.random()` is xorshift128+, whose state is recoverable from a run
  of outputs that anyone can harvest by creating lobbies. That leaks **other
  people's future codes**, which is a sharper problem than the 32⁴ space being
  guessable. Neither mattered on a tailnet; both do behind a public URL.
- [x] **It was the only `Math.random()` in the server or the engine.** Seat tokens
  were already `randomUUID()`, and engine randomness goes through the seeded
  `rng.ts`, which has to stay that way or replays stop reproducing.
- [x] **Length stays 4**, with `CODE_LENGTH` exported so six is one edit. Codes
  get read aloud across a table; unpredictability plus rate limiting (C3) is the
  fix that matters, not more characters.
- [x] Tests cover the alphabet (no I/O/0/1), no repeats across 2000 draws, **every
  position emitting all 32 characters** — which is what catches a `randomInt(len -
  1)` that would quietly shrink the keyspace — and that no live code is reissued.

First item of [docs/design-hosted-server.md](./design-hosted-server.md); C1
and C3–C9 are still open there.

## ✅ O1 closed — the binary embeds the tile art on purpose (2026-08-02)

- [x] **Accepted the merge rather than unpicking it.** `gen-embedded-client.mjs`
  base64-embeds the whole client into the Bun binary, 27 CC-BY-SA tiles included,
  while ARCHITECTURE §13 said never to "bundle, inline, or otherwise merge the
  SVGs into compiled JavaScript output". The two had contradicted each other since
  A20. The build is the part worth keeping — a self-contained executable is the
  whole point of that path, and splitting `tiles/` back out means shipping a folder
  beside every binary — so **the rule was what was wrong**, and it is gone.
- [x] **The repo has a LICENSE**, which it did not before, despite README linking
  `./LICENSE` and three docs claiming MIT. §1 is MIT for the code, §2 is CC-BY-SA
  4.0 for the 27 suit tiles with the rename disclosed as the only change, and §3
  states a release binary as a combined work carrying both.
- [x] **The attribution is reachable from the binary**, which is what makes §3
  hold rather than assert: `--credits` prints it (the `CREDITS` text in `cli.ts`),
  the About screen carries it in all three languages, and `/tiles/credits.json`
  has the per-file detail. A headless operator who never opens the UI can still
  get at it.
- [x] **Two tests keep the claim true.** `packages/server/tests/credits.test.ts`
  asserts the four things CC-BY-SA 4.0 §3(a)(1) requires the text to carry —
  creators, licence URI, source, and that the files were changed — plus the line
  telling a redistributor the executable contains the art.
  `packages/client/tests/tile-credits.test.ts` asserts `credits.json` and the
  shipped SVGs agree **in both directions**, so a tile added without attribution
  fails rather than quietly making LICENSE §2 false inside a compiled artifact.

## ✅ Bot pace is the host's, and the declaration sits above the pile (2026-08-02)

- [x] **Bot pace is a lobby setting** — Slow / Normal / Fast, 1800 / 900 / 400ms.
  It rides on `startGame.rules.botSpeed`, is narrowed by `botSpeedFrom` beside
  `houseRules`, and is a `GameRoom` field rather than `GameConfig`: it changes no
  rule and a replay of the same seed is identical at any value. Normal is 900, up
  from the 700 that still played too fast.
  **`--bot-delay` outranks it**, along with the `SM_BOT_DELAY_MS` seam — otherwise
  a host who picked Slow would have the Playwright suite running at 1.8s a move.
- [x] **The claim window is 10s**, from 3 → 6 → 10 over one day of playing it. It
  closes the moment every eligible seat has acted and anyone uninterested has a
  Pass button, so the deadline is a backstop rather than a pace, and the only cost
  of a long one is to someone who is genuinely thinking.
- [x] **The void declaration is held out of the pile**, on its own line above it,
  for all four seats and the spectator. It is the one public statement of what a
  seat declared, and hunting for it at the front of a wrapping pile was the thing
  marking it in place hadn't fixed. The face-down tile occupies the same slot
  before the flip, so the row doesn't appear from nowhere on turn 1. It also drops
  the caveat from the entry below: an opponent's capped tray can no longer scroll
  its void discard out of sight, because it was never in the tray.
- [x] **Your own tray is drawn round the pile, not across the screen** — `w-fit
  mx-auto`, like every other seat's. It still wraps: `fit-content` is
  min(max-content, available), so a full round fills the row and spills onto a
  second, but three discards get a tray three tiles wide.
- [x] **Your melds centre**, with the `mx-auto` the seat across the table already
  had — `w-max` centres while they fit, and the scroller takes over when they
  don't, because centring the scroller itself would put the leftmost meld out of
  reach.

## ✅ The wall stacks and laps, and the void discard is marked (2026-08-01)

- [x] **Stacks, not two rows.** Each wall is seven stacks two tiles high, with the
  upper tile drawn offset out and the lower one lapping over it, so a stack reads
  as a stack. Along the wall they sit flush, lapped 22.5% exactly as the hand is.
  Together that took the frame from 21% deep and 60% long to 17% and 54% — the
  space the ask was about.
- [x] **Every tile is placed outright**, `left/top/width` in percentages of the
  square, computed by `wallSlots`. The flex version had each cell asking its row
  how wide it was while the row asked the cell, and the cycle resolved to the tile
  art's intrinsic 210px — the side walls came out as wide as the whole square. The
  CSS is now two rules and nothing sizes from content.
- [x] **The first discard is marked in every tray**, which is the only public
  statement of what a seat declared. `PublicPlayer.firstDiscardIsVoid` is derived,
  not stored: `!usedIndicator` is the record that a tile *was* separated, and the
  other two terms say it has since been flipped into `discards`. **It is false
  while the tile is still face down** — the flip is what makes the suit public,
  and A40 is the standing reminder of what happens otherwise.
- [x] **The mark is a glow on the art, not a ring on the box.** In a lapped tray
  the box is the pitch and the art hangs a fifth of a tile past it, so a box ring
  would sit narrow and offset; `drop-shadow` follows the art's own alpha, as the
  selected and last-discard markers already do. White, because amber is spoken for
  by the last discard, and `:not(.tile-last-discard)` so they can't fight over one
  tile. The marked tile needs a `z-index` too: it is the *first* in the tray, so
  the whole rest of the pile laps over it.

Known: an opponent's tray is capped (last 6 or 9), so their void discard loses its
mark once it scrolls out. Yours and the spectator's are never capped.

## ✅ The wall is four walls, and the discards centre (2026-08-01)

*"the wall in the middle is kind of lazy … right now it's impossible to tell how
many are left"*. Correct: a single strip that only shrinks gives you nothing to
measure it against.

- [x] **`WallDiagram` replaces `WallGauge`** — four walls round the rim of the
  well, two tiles deep, seven stacks a side. That is 4 × 7 × 2 = 56, exactly what
  the deal leaves, so the diagram is the wall rather than a scaled picture of it.
  **Every slot stays drawn**; the emptied ones go dark, which is the part that
  makes it readable at a glance.
- [x] **It is a square that fits the well, not the well's own box.** The well is
  198×401 on one phone and 128×61 on a short one — a frame sized off the long edge
  hangs out of the short one. `aspect-ratio: 1` with a max on both axes lets the
  smaller edge decide, and every length inside is a percentage of that square.
- [x] **Absolute and behind the contents**, so it costs no height in the row that
  has none to give. A positioned element paints after every in-flow sibling
  whatever the DOM order, so it needed a negative z-index — and `.play-well` an
  `isolation`, or the negative index would have put it behind the felt.
- [x] **Both dimensions of every wall are stated.** Left to shrink-to-fit, a wall
  measures its contents, and a tile's intrinsic width is 210px: the side walls
  came out 190px wide instead of 27. The cells must not stretch either, or the
  cell asks its row how wide it is while the row is asking the cell.
- [x] **The south discards centre**, to match the seat across from you. That tray
  is a shrink-to-fit box its parent centres; this one is a full-width bar, because
  it wraps, so the rows are what centre. The tray's left padding drops 0.88rem →
  0.75rem in the process: rows centre on the content box, but a lapped run's
  visible extent starts half a bleed further left than its boxes do, so the
  content box has to sit half a bleed right of centre for the two to agree.

## ✅ Five fixes off playing it (2026-08-01)

From watching the lapped tiles in a real round.

- [x] **The hand is centred.** It was left-aligned on anything wider than 13
  capped tiles — 555px sitting at the left of a 1200px row. `justify-center` was
  already there and did nothing: `.tile-run` is `inline-flex`, so it shrank to its
  content and centred the tiles *within itself*. `w-full` on the hand's group is
  the fix; melds still want the shrink-to-fit, so it isn't on `.tile-run`.
- [x] **Illegal discards dim to 75%, not 60%.** Early in a hand the void suit is
  the only legal discard, so ten of thirteen tiles dim at once and 60 read as
  "these are barely here" rather than "not this turn".
- [x] **The e2e spec stopped keying off that class.** It located discardable tiles
  with `li:not(.opacity-60)`, so changing the value silently broke four projects.
  There is a `data-discardable` hook now, as `data-void-tile` already was — the
  second time a Tailwind class in a selector has cost a full e2e run.
- [x] **The wall is drawn, not just counted** (`WallGauge`). A run of backs in the
  well, one per four tiles and overlapped hard, so it starts at 14 and empties over
  the round — roughly what the wall looks like from across a table. The exact count
  stays in the top bar. Its tiles are `display: flex`: a `.tile` is inline-level,
  and one shorter than the block's strut leaves the leading as dead space, which
  cost 6px a back in the well of all places.
- [x] **The void declaration got bigger, centred, and its marks flash.** Whole-hand
  comparison is the point of that screen, so its tiles are `lg`, dropping to `md`
  where four rows would push Confirm off the bottom (R3). The marks pulse rather
  than sitting still — a static outline on four of thirteen reads as decoration.
  Drawn as a `::after` from `currentColor` so only the ring animates and no layout
  box moves; reduced motion rests it at full opacity.
- [x] **The claim window is 6s, was 3s.** A claim is three decisions inside one
  window — notice the discard, see that it fits your hand, choose between Hu, Pung
  and Kong. It closes as soon as every eligible seat has acted, so the longer
  deadline costs nothing except when someone is genuinely thinking.

## ✅ Tiles are the untouched art, and a run laps (2026-08-01)

*"I think the art overlapped looks best, the css still looks kind of clunky"* —
after the sandbox put the two side by side. The idea was the user's: rather than
strip each tile's 3D body and rebuild it in CSS so tiles can sit flush, keep the
art and **slide each tile over its neighbour's right band**, hiding the doubled
bevel instead of removing it.

It is a better trade than the reconstruction it replaces, and the reason is one
measurement: the rightmost **22.5%** of the art is body and never ink — from the
right edge, outline to 5.5%, green to 15.4%, plate and white to 22.5%, face after
that. The widest glyph, `pin-3`, ends at 75.9%, clearing it by 1.6%. So the lap is
free, where every band `.tile-cell` drew came out of the face. Same 299px hand:
23.0px a tile flat, **29.0px lapped**.

- [x] **The box is the pitch, not the tile.** `aspect-ratio: 162.75 / 255` (210 ×
  0.775) with the art at `129.032%` (1 ÷ 0.775) and `margin-left: -29.032%`, so it
  bleeds left and DOM order paints each tile over the one before it. Percentages
  throughout: the hand's tiles are flex-sized, so no length is known in CSS.
- [x] **The art has to stay in flow**, which cost an e2e run to learn. Positioning
  it absolutely is the obvious way to overflow a box, and it collapsed the hand to
  9.3px — the width of `.tile-run`'s own padding. The art is the only thing in that
  chain with an intrinsic size, and `.tile-run` is `inline-flex`, so shrink-to-fit
  had nothing left to measure. `flex: none` goes with it: as a flex item, a width
  over 100% is a base size the container would otherwise shrink back to fit.
- [x] **`max-width: none`.** Tailwind's preflight caps images at `max-width: 100%`,
  which clamps the art back to its own box and undoes the lap while every other
  computed value still reads correctly.
- [x] **Sizes moved to `--tile-w`** on `.tile-sm/-md/-lg/-xl`, off Tailwind's
  `w-*`. A lapped run has to scale a fixed width down to the pitch so the *art*
  keeps the size the call site asked for, and CSS can't scale a width it didn't
  set. Without it a `w-8` tray tile draws 29% larger and its rows 29% taller.
- [x] **A lifted tile needs a `z-index`.** Rising isn't enough — the neighbour
  still paints across it and the tile reads as sliding behind the hand. Same for
  the pulsing last discard in a tray.
- [x] **Containers hold the first tile's bleed.** It has no neighbour to lap over,
  so it hangs 29% of a pitch off the left — and in a wrapping tray that is the
  first tile of *every* row, which would start outside the tray. `.tile-run` takes
  0.58rem, `.discard-tray` 0.3 + 0.58. Not on `.tile-lap` itself: the discard in
  flight is a lone lapped tile and would only be pushed off centre.
- [x] **The flight is lapped too.** It measures a hand tile's box and a tray tile's
  box, both pitches, so an unlapped tile in flight would take off 22.5% smaller
  than the tile it left.
- [x] **`.tile-cell` and `tiles/flat/` are gone**, with `flatten-tiles.mjs` and its
  drift test. `measure-glyphs.mjs` and `glyph-boxes.json` stay as the evidence for
  the 22.5%. The `flat`/`solo` props are gone from `Tile`; every tile is the art,
  and a container opts into lapping with `.tile-lap`.
- [x] **The sandbox now mirrors the app** rather than comparing two designs: same
  stylesheet, same classes, solo and lapped at every size, plus the four cases
  above. Its self-check is that the art comes out wider than its box.

Known and accepted: the seam is the art's own black left edge, 6.3% of the tile
width. Heavier than the 1px outline the flat cell drew — at 96px it reads as a
black gutter, at hand size as a firm separator. Looked at in the sandbox and
chosen.

## ✅ The bevel goes as wide as the glyphs allow, uniformly (2026-08-01)

Third pass, and the one that landed: *"still not as rounded and the bevel is not
as large as the original svgs, also have to make it consistent with the discard
page"*. All three were right.

- [x] **The corner is the art's own.** Its outline path turns on cubics spanning
  36–41 units of a 210×255 box, so ~38 — `18.1% / 14.9%`, up from the 10.5%/8.6% I
  had guessed at. Still two values, so it stays circular at any tile size.
- [x] **The bands go to 9.5% (top) and 14% (right)**, from 6.8%/7.5%. That is
  where they stop being free: the glyphs' own margins inside their frames are 8.4%
  top and 16% a side, so past that the widest tiles start losing ink. Verified
  against `pin-3`, `sou-1`, `pin-9`, `pin-7`, `pin-8`, `sou-9`.
- [x] **Same bevel on every tile.** The previous pass showed the full side only
  where nothing abutted the tile and a hairline seam elsewhere — more literally
  correct, but it made one tile look like two different tiles depending on where it
  sat, and the spaced tiles on the void screen couldn't match the trays at all. A
  wrapping tray can't even express "last in a row" to opt in.
- [x] **The glyph box grew again, 93% → 95%**, which pushes the glyph down clear of
  the wider top band. The glyphs are still no smaller than before any of this.
- [x] **The void screen's marker ring shares the tile's corner** (`.tile-mark`).
  At `rounded-sm` it squared off a round tile and its corners stood proud.

I did build the art's literal proportions (top 20.6%, right 22.5%) to compare, and
did not ship them: they need the glyph inset, which takes it back to roughly the
size the 3D art gave it before R7 — visibly worse at the 23px hand size. 9.5%/14%
is the most bevel available for free.

## ✅ Superseded: the side shows only when it's exposed (2026-08-01)

Follow-up to the shoulders work below: round the corners, and show the sides the
art shows — the right one "unless it's stacked against another tile", and the top.
Both were right, and the second one exposed that the first pass had kept R7's
emphasis rather than the art's.

- [x] **The bottom is a thin plate-and-outline edge now, not a deep green one.**
  The art's green side layer insets are top 5% and right 5.5% but **bottom 12.9%
  and left 20.6%** — it never reaches those edges, which show the pale plate and
  the outline instead. R7's thick green front edge was its own invention, and
  keeping it while adding thin top/right shoulders had the emphasis backwards.
- [x] ~~**The right shoulder shows only where nothing abuts the tile**~~ — reverted
  in the pass above. It was the literally-correct model (a right shoulder meets its
  neighbour's bare face, so what shows between them is one shared edge) but it made
  the same tile look different depending on where it sat, and trays and the void
  screen could never agree. Every tile carries the full bevel now.
- [x] ~~**A proportional radius, `10.5% / 8.6%`**~~ — right idea, wrong number:
  measuring the art's outline gave ~38 units, i.e. `18.1% / 14.9%`.
- [x] **The glyph box grew 89% → 93%** (and later to 95%), which the shallower front
  edge freed. It re-centres the glyph in the taller face and buys clearance under
  the top band — so the glyphs got *larger*, not smaller.
- [x] **The flat back's own edge moved with them**, 227 → 243 in
  `flatten-tiles.mjs`, or a back would have drawn a visibly deeper edge than the
  faces beside it in a tray or a concealed kong. Regenerated; the committed-output
  test passes against the script.

## ✅ The flat cell gets the art's shoulders and its gloss back (2026-08-01)

The flat cell kept only a bottom front edge, so beside the original art it read
matte and papery — the observation was that the derived bevel "doesn't quite
match the original svgs", with a request for the gloss plus a 3D edge on the top
and right.

Measured the original's layers rather than guessing at them
(`scripts/tiles/`-style, `getBoundingClientRect` through the `g4630` matrix, so
the nested transform is accounted for):

| Layer | Fill | Inset: top / right / bottom / left |
|---|---|---|
| `rect4031` outline | — | 0 / 0 / 0 / 0.1% |
| `rect3767` side | `#005f00` | 5 / 5.5 / 12.9 / 20.6% |
| `rect3861` plate | `#cddacd` | 10.8 / 15.4 / 7.1 / 13.4% |
| `rect3765` | `#fff` | 16.7 / 17.8 / 5.1 / 8.7% |
| `rect3008` face | `#d0e4cc`→`#fbffec` | 20.6 / 22.5 / 5.1 / 6.3% |

- [x] **The art is lit from the bottom-left**, which is why the face sits 20.6%
  from the top and 22.5% from the right but ~5% from the bottom and left. That
  also explains why a bevel on *those two* sides is safe where left+right wasn't:
  a tile's right shoulder meets its neighbour's bare face, so what shows between
  them is one shared edge, which is what a real run looks like.
- [x] **Compressed to 5.6% of the height and 7.5% of the width**, keeping the
  layer order (outline → side → plate → white → face). Literal 20.6%/22.5% bands
  would hand back the glyph width R7 won. The compressed bands fit inside the
  tightest glyph's own margin — 16% a side, 8.4% top, per
  `scripts/tiles/glyph-boxes.json` — so **no glyph shrank**; verified against the
  six widest (`pin-3`, `sou-1`, `pin-9`, `pin-7`, `pin-8`, `sou-9`).
- [x] **The gloss is the art's, restored.** `path3932` (hard dot), `path3882`
  (soft blob) and `path3936` (blurred diagonal streak, `#fff` → transparent) are
  all stripped by `flatten-tiles.mjs`. Measured at inset top 8.8% / right 8.2%,
  they sit on the tile's top-right *shoulder*, not on the ivory — which is what
  makes the highlight read as a glazed edge catching light rather than a stain.
- [x] **Layers live in custom properties.** Biome's formatter reflows a six-layer
  `background` shorthand and drags any inline comment into the middle of a
  declaration; naming each layer keeps it readable and the comment attached.

Nothing here moves a box, so the tray and overflow guards are unaffected —
confirmed by the suite plus a settled capture of the well tile, the hand strip,
and a meld run.

## ✅ The void declaration shows the whole hand (2026-08-01)

Choosing a void suit is a comparison between three suits, and the screen listed
only the tiles of the suit already chosen — so you compared them by picking one,
looking, picking another, looking again. The counts on the buttons were the only
thing you could see all three of at once.

- [x] **The whole hand is always on screen**, in the engine's canonical order so
  the suits group. The chosen suit's tiles are ringed in that suit's *button*
  colour — red for man, emerald for pin, blue for sou — rather than being the only
  ones rendered. A `ring` draws outside the tile, so marking one moves no box.
- [x] **3px, not 2.** Pin's emerald is the one ring sitting on a green felt; the
  extra pixel is what makes it read as clearly as the red and the blue.
- [x] **The screen is `h-dvh` with the hand scrolling inside it.** The full hand
  costs a third row of tiles at 320px, and Confirm must not be what goes off the
  bottom to make room (R3's lesson). Measured on both phones: Confirm's bottom is
  552 of 568 and 648 of 664, with no horizontal overflow.
- [x] **`ui-clicks.spec.ts` no longer infers the void-suit count from "how many
  tiles are in that container".** That was right when only the chosen suit was
  rendered and would now always be 13 — which would demand the first-discard flip
  button even in the indicator case, where a player holds none of their void suit
  and has nothing to flip (A35). It counts `[data-void-tile]` instead.

## ✅ A40 — a void declaration leaked to every client (2026-08-01)

Found while reading `redactEventsFor` for the history panel. It nulled `drew` and
`kongReplacement` (A31) and passed everything else through, but the void phase
resolves all four declarations in one batch and emits
`voidDeclared { seat, suit }` for each — so **every client received all four
forbidden suits**, the one fact `projectView` withholds (`voidedSuit` is on `you`
alone) and the reason A37 puts the declaration tile face down. Nothing in the UI
read it, so it never showed; it was one dev-tools tab from being read off the
wire, which is exactly the A31/A27 failure mode.

- [x] **`voidDeclared.suit` is `Suit | null`, nulled for every viewer but the
  declarer** — mirroring `drew.tile`. A spectator sees no suits at all, like it
  sees no draws. Unit-tested, including that the engine's own event array keeps
  the real suits.

Fifth leak of this class the audits have caught, and the second to reach a client
through the event log rather than the view — worth remembering that `views.ts` has
two channels to redact, not one.

## ✅ O2 — bots played faster than a player could follow (2026-08-01)

Both halves of the fix, since they answer different questions: the pace makes a
circuit followable while you're watching, the history covers the case where you
weren't.

- [x] **Bots pause 700ms a move, not 150ms.** At 150ms a circuit — discard, claim
  window, discard, discard — resolved inside a second, so the tile you might have
  ponged was four discards back before you looked up. It's a pace, not a rule: it
  lives in `room.ts` rather than `GameConfig`, because a replay of the same seed is
  identical at any value. `--bot-delay <ms>` retunes it (0 = instant, max 5000),
  and `SM_BOT_DELAY_MS` is the harness seam — the vitest and Playwright configs
  both pin 150 so suites that play whole rounds don't pay four seconds a circuit
  for a pace no assertion looks at.
- [x] **A history panel for the round.** The event feed can't serve this: it holds
  two lines for 3.5s and drops to one on a short viewport *by design* (R1). The
  panel keeps every event of the round in the store — raw events with ids, not
  formatted lines, so switching language re-renders the whole list and two
  identical discards stay distinguishable — and `historyRowFor` maps them to rows.
  Discards are the bulk of it, which is the exact inversion of `feedLineFor`, where
  they're dropped so they can't drown two lines. Cleared when a round ends.
- [x] **The control is in the well, not the top bar.** A fourth icon up there
  truncated the turn indicator to "Y..." — the bar had no width left. In the well
  it's absolutely positioned, so it costs no height either, and the middle of the
  board was empty space anyway.

## ✅ O4 — one tile face everywhere (2026-08-01)

The answer to "the tile styling doesn't fit": *"the middle discard looks more
glossy compared to the discard and hand tiles"*. Not a discard-pile question at
all — the well's last discard was the last board tile still drawn from the 3D art,
and beside a flat hand and flat trays it read as a second tile design.

- [x] **Every tile on the board is flat now** — the well's last discard, the
  first-discard flip panel, the void and huan pickers, the spectator's last
  discard. The "a singleton should look like a singleton" rule is dropped; the
  long-press preview follows whatever the tile it magnifies uses, so it can't
  disagree with it either.
- [x] **`solo` carries the lift a lone flat tile needs.** `.tile-run`'s strip
  shadow only exists around a run; a flat tile with nothing flush beside it gets
  its own `box-shadow`. Not on `.tile-cell` itself — inside a run every cell would
  cast one and the strip would read as separately-lit objects again.
- [x] **The last-discard marker works again.** `.tile-last-discard .tile-face` only
  ever matched the 3D art, so from R7 until now the marker was silently dead
  everywhere it mattered — every tray tile and the well are flat, and the pulse had
  nothing to attach to. The flat cell pulses a ring instead, drawn outside the box
  so it marks the tile without moving anything the viewport guard measures.

Only the overlapped hand-count stack keeps the 3D backs, and deliberately: flat
backs overlapped merge into one green slab, which is the bug the flat back's own
front edge was added to fix.

## ✅ Discards fly from your hand to your tray (2026-08-01)

- [x] The source box is captured at the tap — by the time the server's view comes
  back the hand has re-laid out without that tile — and the destination is measured
  once the tray tile exists, in a layout effect so the flight starts before the
  browser paints the tile sitting there. A fixed-position overlay, deliberately,
  *not* a transform on the tray tile: `viewport.spec.ts` asserts no tile's box
  escapes its tray and samples every ~130ms across a round, so an animating tray
  tile would fail that guard the moment a sample caught it mid-flight. Cleared on a
  timer rather than `onAnimationComplete`, because reduced motion skips the
  animation and a callback that never fires would leave the landed tile invisible
  for the rest of the round.

Opponents' discards don't fly — their hands are a count chip, so there's no source
box to fly from.

## ✅ The two melds gaps R7 left (2026-08-01)

- [x] **Your melds row scrolls** instead of being clipped. It was a non-wrapping
  flex of fixed-width tiles, so a third or fourth meld ran past the screen edge and
  the root's `overflow-x-hidden` cut it off with nothing to say it was there — the
  same scroller `OpponentTop` got in R6.
- [x] **Side opponents show their melds.** They showed none at all, so a player who
  had ponged just had a smaller hand for no visible reason. Three flush `sm` tiles
  are ~96px and would spill an 80px column the way their tray did before R6, so
  `MeldChip` draws one tile with the meld's name — which is what a player reads off
  an opponent's melds anyway: the tile they've locked away. The kind implies the
  count. Verified with a chip on screen: no vertical or horizontal overflow.

## ✅ 換三張 is a house rule, so it is opt-in now (2026-08-01)

Asked whether the opening three-tile pass is standard, and checked the PDF rather
than answering from memory. It is **not** in Novikov: `SBR_ENG_part_1.pdf` gives
the deal as *prepare wall → each player chooses a forbidden suit → East's initial
turn*, and the words "swap" and "exchange" appear nowhere in the text. What it does
describe is the void-suit mechanic already implemented — "each player separates a
tile of a forbidden suit… the same tile is the first mandatory discard" (A35/A37).

The engine already modelled it as a rule (`enableHuanSanZhang`) but defaulted it
**on**, while the other house rule, `enableFlowerPig`, defaulted off. That was
inconsistent, and it meant every game shipped a non-canonical opening.

- [x] **`DEFAULT_CONFIG.enableHuanSanZhang` is now `false`.**
- [x] **The host can turn it on** — a switch in the lobby, off on arrival, riding
  along as `startGame.rules.huanSanZhang`. First user-facing house-rule control.
- [x] **Narrowed at the WS boundary.** `houseRules()` accepts only a literal
  `true`; `"true"`, `1`, `[]`, `{}` and a non-object payload all fall back to the
  engine default, so a hand-rolled frame cannot switch the ruleset with a truthy
  value of the wrong type. Unit-tested, including that the default tracks
  `DEFAULT_CONFIG`.
- [x] **Coverage moved rather than lost.** Practice mode now opens on the void
  declaration, so the specs that drive it no longer see a huan phase; they skip it
  when absent instead of asserting it. `e2e/house-rules.spec.ts` hosts a lobby,
  flips the switch, asserts the deal opens on `huan`, and taps through the picker —
  so the toggle *and* the huan UI are covered, on chromium only since it is a rule
  path rather than a layout. The two engine tests and one server test that needed a
  huan phase now ask for it explicitly.

## ✅ R7 — tile density: flush tiles, north stack sideways, side trays vertical (2026-08-01)

Spec: [docs/superpowers/specs/2026-08-01-play-screen-tile-density-design.md](./superpowers/specs/2026-08-01-play-screen-tile-density-design.md).
Answers the audit's open question 3 — where the smallest phones' ~130px comes
from — and fixes a clipping bug measuring turned up.

Measured at 320×568 first, which changed what the work was. The hand was **19.1px
wide** against the audit's own ~24px readability floor, with 48px of a 296px row —
16% — spent on gaps between 13 tiles. And the **right** side opponent's discard
tray was **211.6px wide inside an 80px column**, spilling 132px leftward across
the well: the left column is a plain block so `max-w-full` resolved to 80px, but
the right was `flex justify-end`, so `OpponentSide` sized to min-content instead.
That is why `docs/screenshot.png` has a row of tiles under "Last discard" that
reads as part of the middle area — it is Bot 4's discards.

- [x] **Hand-count stack overlaps sideways at north only.** That seat's hand faces
  you as a row, so the chip becomes one tile tall rather than three overlapped —
  61px → 39px in the zone with the tightest budget. East and west face you edge-on
  and keep the vertical stack, which is also all an 80px column has room for.
- [x] **Side discard trays grow downward**, two flush tiles wide, scrolling inside
  the column. Two 32px tiles fit 80px exactly so nothing is cut mid-tile, and
  `flex-1 min-h-0` means they can never set the middle row's height the way
  thirteen tile backs once did. The right column drops `flex justify-end`.
- [x] **Tiles sit flush, properly.** Removing the gap alone isn't flush: each
  source SVG is a complete 3D tile with its own bevelled sides, so two edge to
  edge show two bevels where a real run shows one shared edge.
  `scripts/tiles/flatten-tiles.mjs` derives glyph-only faces from the CC BY-SA 4.0
  Wikimedia set already in the repo and the cell draws the face in CSS. Removal is
  by id, not by keeping one subtree: man and sou tiles draw the glyph as anonymous
  siblings of the body group, but pin tiles draw their dots as id'd paths inside it
  (pin-9 has 52). Each cell keeps its own face rather than sharing one across the
  run, because a lifted glyph over a shared surface reads as a hole in the strip
  rather than a tile in the air.

Measured after: hand tile **19.1 → 22.7px** wide (23.1 → 28px tall), own tray
**8 → 9 tiles a row** so a full round's discards land in two rows rather than the
three R6 had to absorb, side tray **211.6 → 80px** with nothing clipped, across
zone with melds **217.8 → 189.9px**, peak fixed rows **444px of 568 at 0 overflow**.
The hand is still a whisker under the 24px floor at 320px, but the flat faces give
the glyph the whole cell instead of the ~75% the 3D frame left it, which is the
larger half of the readability win.

The guard gained the tray assertions, and they are verified capable of failing:
run against the pre-R7 client they report `tray 1: scrollWidth 110 > clientWidth
80` and `tray 2: spans 100..312, over a well of 96..224`. Two faults needed two
checks — a tray overflowing *itself*, and a tray whose own box fits its content
perfectly while overflowing its *column*, visible only as overlap with the well.

**Found on review, fixed the same day:**

- [x] **The symbols were off-centre.** Stripping the 3D body left a frame built
  around a tile no longer drawn: the glyphs were authored against the *face*,
  which is 149.4×189.3 inset inside a 210×255 viewBox and sitting low, so keeping
  the source viewBox pushed every glyph left and down. Measured, the glyph union
  centre is (-103.8, 441.3) against a face centre of (-104.0, 441.2) — on the
  face, nowhere near the viewBox centre of (-87, 421.4).
  `scripts/tiles/measure-glyphs.mjs` measures each glyph's box in a browser
  (`svg.getBBox()` on the *root* — per-element bboxes are in that element's own
  space, and the pin dots sit inside nested transformed groups, which put pin-1's
  box 1300 units from everyone else's), and `flatten-tiles.mjs` reframes on it.
  The frame is 210×227 for every face, so relative glyph sizes survive — 一 stays
  shorter than 九萬 — and 227 is the face area `.tile-glyph` gets, so nothing
  letterboxes. Two new tests assert the centring and the uniform frame.
- [x] **The bottom bevel is back.** Fully flat tiles read as a printed sheet
  rather than objects on a table. The cell keeps the one 3D cue that matters, a
  lit face ending in a shaded front edge, and drops only the left/right/top
  bevels — the ones that doubled up where two tiles met. Backs paint their own
  front edge, since covering the cell means covering the cell's bevel.
- [x] **`screenshot.png` was the wrong screen.** `capture.spec.ts` took it after
  its play loop, so any exit produced an image — and a bot winning inside 14 moves
  exits to round end. The shot is taken inside the loop now, on the frame that
  satisfies the condition, a round that ends early starts the next one, and the
  spec fails rather than shipping the wrong screen. Expanding a round-end row also
  scrolls it into view, so that capture now returns to the top first.

**Found on review, second pass:**

- [x] **The side trays stretched their tiles.** A wrapping flex container defaults
  to `align-content: stretch`, so spare cross-axis space is handed to the lines and
  the tiles are drawn *past their aspect ratio* — on a desktop-height window six
  discards rendered as six very long tiles running down the screen. `flex-1` made
  it worse by giving the tray the whole column height to stretch into. Fixed with
  `min-h-0` and no `flex-1` (shrink-and-scroll, never grow) plus
  `content-start items-start` on all three trays. Measured at 1280×900: every tile
  is exactly 1.21 (255/210), and the side trays are 80×126 rather than
  column-height.

**Left deliberately at the time:** the own melds row (`OwnZone`) is a non-wrapping
`flex` of fixed-width tiles, so three or four melds overflow it horizontally and
the root's `overflow-x-hidden` clips them. Side opponents show no melds at all.
Both fixed later the same day — see "The two melds gaps R7 left" above.

## ✅ R6 — the R5 guard was red in CI from the day it landed (2026-08-01)

`e2e/viewport.spec.ts` failed on all three CI runs after R5 shipped (+42px, +42px,
+95px) while passing locally every time. Root cause is a width the audit never
measured: its row budget and the "0px at peak" result were taken at **375×568**,
the figure printed in the measurement table, but the `se-portrait` project uses
Playwright's `devices['iPhone SE']`, which is **320×568** — 55px narrower.

55px of width turns into height. Measured at 320×568 with the play screen's rows
summing to 559 of 568 and the middle row already squeezed to 30px:

- Your discard tray fits **8** `sm` tiles a row at 320px against 10 at 375px, so
  a full round wraps to three rows instead of two. The third row is 41px — the
  +42px failures.
- The across opponent's melds wrapped: three pungs are ~300px against 296px of
  usable width, and the second row is 47px. 41 + 47 + slack is the +95px one.

Both were unbounded by construction, so a random CI game either hit them or
didn't — which is why local runs looked fine.

- [x] **Your discard tray gives height back instead of overflowing.** The row is
  `min-h-0` and the tray scrolls internally, making it the flex child that
  absorbs pressure once the well is at zero. It keeps every row the viewport can
  afford and the rest is one scroll away, so the furiten constraint still holds —
  nothing is truncated. Verified by injecting a 200px spacer into the live play
  screen: overflow stayed 0 and the tray shrank 89px → 10px. (The same probe
  pre-R6 is on record in the audit at 160px → +98px overflow.)
- [x] **The across opponent's melds are one scrolling row**, matching the tray
  below them and `OpponentSide`. An inner `w-max mx-auto` keeps them centred
  while they fit, instead of centring the scroller and putting the leftmost meld
  out of reach. `pt-1` keeps the kong badge clear of the clip `overflow-x` brings.
- [x] **The guard names the row that grew.** CI uploads no Playwright artifacts,
  so a CI-only failure left nothing behind but a number; the assertion message now
  carries every row's height at the peak sample.

Worst case now bounds at roughly 506px of fixed rows against 568 — melds, kong
buttons, a furiten badge and a full tray all at once — where before it reached
~627px. Not regenerating `docs/*.png`: the only visible delta is 4px of padding
above an across opponent's melds, and the iPhone 14 profile the screenshots use
has the height to keep both tray rows.

## ✅ Two front-end defects found by sweep (2026-08-01)

Both surfaced by asking "are the front-end items actually finished?" and
checking rather than answering from memory. Both were introduced by work
earlier in the same push.

- [x] **The round-end reveal never revealed a concealed kong.** `buildRoundResult`
  sends the real `Meld[]`, so the tile was on the wire, but `MeldDisplay`
  branched on `kind === 'kong' && subtype === 'concealed'` and drew four backs
  unconditionally. A hand won with a concealed kong showed ten faces and four
  blanks, and the fan list said "Kong" without saying which — which defeats the
  point of the reveal. `PublicMeld` already encodes the distinction: `tile: null`
  is the live redacted case (A27) and the real tile is sent everywhere it is
  revealed, so the branch is now on the tile. The decision is extracted as
  `meldRender` and tested, since the client suite has no DOM; the test fails
  against the old branch.
- [x] **Rejoining mid-huan or mid-void re-showed the picker.** F2 made this
  reachable — before it, a refresh lost the seat entirely. `computeLegalActions`
  returns `[]` outside the play phase, so `PlayerView` carried no signal, and the
  only record was component state that dies on remount. The player would re-pick
  and eat an `already_submitted` rejection (visible since F1, but the wrong
  message). `you.hasSubmittedHuan` / `you.hasDeclaredVoid` now come from the
  server, which is the only thing that knows.

**Left deliberately:** several entrance animations still fade in from
`opacity: 0` (last-discard pop in Game and Spectate, and the transient overlays).
They deviate from the rule F11 established, but F11's failure was only ever
observed in fullPage screenshot capture, and a fade is the right treatment for
something that lives 3.5 seconds. Fixing them would be churn.

## ✅ Mobile viewport remediation — R1–R5 (2026-08-01)

Design input came back as recommendations R1–R5 in
**[docs/viewport-audit.md](./viewport-audit.md)**; all five shipped.

- [x] **R1 + R2.3 — play screen fits the viewport.** Root is `h-dvh` with
  `overflow-y-auto` as the graceful fallback; the middle row flexes. R1 alone
  would have done nothing: the middle row's height is set by the side opponent
  columns, not the well, so the side discard trays had to shrink with it. They
  became single-row horizontally scrollable rather than truncated to two tiles,
  which keeps the pond readable for judging safety.
- [x] **R2.1 — score strip folded into the top bar** as a chip with a dropdown.
- [x] **R2.2 — across opponent's hand backs → stack + count**, as the side
  opponents already had.
- [x] **R3 — round-end controls pinned.** Sticky action bar, two-column rows
  from `sm` up, trimmed ceremony on short viewports. Winners still arrive
  expanded; collapsing them reverses a shipped decision and stays a separate
  discussion.
- [x] **R4 Phase 1 — rotate-to-portrait overlay** on landscape phones during
  play, CSS-gated so tablets never see it.
- [x] **R5 — vertical overflow guarded in CI** (`e2e/viewport.spec.ts`, iPhone
  SE project), after correcting two flaws in the recommendation: measuring the
  document would have been vacuous once R1 stopped the page scrolling, and
  round end never promised to fit, only to keep its controls reachable.

Measured on an iPhone SE: play overflows **0px at peak** across a round, down
from +129px, over 209 samples spanning three rounds. Extracting the play-screen
zones into components took `Game.tsx` from ~760 lines to ~250.

**Shelved:** R4 Phase 2, a real landscape layout. Not scheduled. Its 324/340px
budget is vertical only and has 5% headroom, the horizontal budget for the
opponent strip does not close (three opponents' melds inline can exceed 1500px
against an 844px viewport, which `ui-clicks.spec.ts` fails on), the layout
composition abstraction doesn't exist yet, and declaring a manifest orientation
might remove the need entirely. Reasons recorded under R4 in the audit.

## ✅ Play screen fits a phone again (2026-08-01)

F13 stopped the play screen *clipping* by making it scroll, which is what the
audit asked for, but it left the board far taller than a phone: measured at
1098px against an iPhone 14's 664px viewport, so the player's own hand sat
below the fold from the first turn. Three audit fixes each added height (F3's
own-discard tray, F15's 40px tap targets, F4's wrapping meld row), but
measuring the rows showed the dominant cost predated all of them — the middle
row was 687px, exactly the height of a side opponent's hand rendered as
thirteen separate tile backs.

- [x] Side opponents now render a three-tile overlapped stack with the hand
  count beside it (`×13`) instead of one back per tile. Middle row 687px →
  237px; whole screen 1098px → 664px, measured as the peak across a full round
  rather than at one moment. The count is also more legible than counting
  stacked slivers.
- [x] The event feed is capped at two lines. Anchored to the top of the play
  well, a third line reached down into the centred "Last discard" label.

## ✅ Round-end follow-ups (2026-08-01)

The three items left open by the round-end work.

- [x] **Ledger qualifiers were untranslated.** A line's qualifier — the kong
  subtype or the reason a kong payment was refunded — was interpolated straight
  from the engine identifier, so a Chinese UI read `Kong (exposed)` and
  `Kong refund (wallEnd)`. `ledgerLines` now emits a `ledgerDetail.*` key, with
  all seven values defined in three languages and a test asserting each resolves.

- [x] **Restore trusted the persisted shape (the real bug behind the `ledger`
  fix).** `GameRoom.restore` assigned `snap.state` verbatim, so any field added
  or renamed since a snapshot was written came back `undefined`. Probing every
  field of a real snapshot: two throw on restore, seventeen silently corrupt the
  projected view. Defaulting per field was the wrong shape of fix — a missing
  `hand` or `turn` cannot be invented, and `pendingFirstDiscard` defaulting to
  null would silently discard a real tile. Snapshots are now validated against
  the keys of a freshly created game, so the required set cannot drift as
  `GameState` grows, and a failing row is dropped rather than left to error on
  every boot — which is what produced the repeating restore errors in the logs.
  An empty `ledger` remains the one safe default. Tokens now import only after
  the room is known good, instead of leaking for a room that never materialised.

- [x] **A38 was flaky because it asserted a proxy.** It checked that seat 0's
  pond was non-empty to mean "the takeover bot played the turn". Another seat
  may legally pung that discard, which removes the tile from the pond, so the
  assertion failed on ~5% of deals while the room behaved correctly every time.
  Characterised over 300 seeded runs — 15 failures, every one with
  `anyClaimsHappened` and a pung on another seat. It now asserts that seat 0's
  hand shrank and the turn moved on: 0 failures in 300. The earlier guess that a
  parallel test file caused it was wrong; every `GameRoom` seeds itself with a
  `randomUUID`, so which deals hit it simply varied per run.

## ✅ Round-end hand reveals and score breakdown (2026-07-31)

Closes the one open deferral, [ARCHITECTURE.md §12.11](../ARCHITECTURE.md#12-open-questions--explicit-deferrals).
Spec: `docs/superpowers/specs/2026-07-31-round-end-reveals-design.md`.
Plan: `docs/superpowers/plans/2026-07-31-round-end-reveals.md`.

§8.1 promised hand reveals and a fan/penalty breakdown from v1; the screen never
had either, showing a score delta per seat and nothing about why. Contrary to the
first read, only the fan list was already on the wire — hands and the payment
breakdown both needed the server to send more.

- [x] **Engine — payment ledger.** `GameState.ledger: LedgerEntry[]`
  (`{reason, from, to, amount, detail}`), where `to: null` marks the two
  non-redistributive void penalties. Entries are *derived* from the payment
  events the engine already emits, inside the single `ok()` constructor every
  successful action returns through, so the log cannot drift from the events
  and no payment site had to be touched. It lives on the state rather than in
  `GameRoom` because `serialize()` persists the state: a room-local accumulator
  would come back empty after a host restart and quietly produce a wrong
  breakdown.
- [x] **Engine — reconciliation property.** For every seat, the ledger signed
  from its perspective equals its `scoreDelta`, and `to: null` entries sum to
  `penaltyPot`. This checks the payment matrix from a second direction — the
  existing balance property is satisfied by any consistent set of transfers,
  including ones that emitted no event. It passed on first run: the engine's
  payments and its event log already agreed.
- [x] **Engine — structured fans.** `HuRecord.fans` was `string[]` holding
  pre-baked English (`"AllPungs×2"`), untranslatable in a trilingual UI. Now
  `FanEntry[]`.
- [x] **Protocol/server.** `RoundResult.players[]` gained `hand`, `melds`,
  `isReady` and that seat's ledger slice. Built only once the round has ended,
  so the reveal needs no new redaction rule in `PlayerView`. Spectators now
  receive `roundEnd` too, on broadcast and on late join.
- [x] **Client.** `RoundEndRow` — an expandable row per seat with the revealed
  hand and melds, fans and hand value or ready state, and the itemised
  payments, signed from that seat's perspective. Winners start expanded.
  Reused on the spectate screen. New `fan.*` and `ledger.*` catalogs in three
  languages, and pure helpers in `src/roundEnd.ts` so the no-DOM client tests
  can reach the logic.
- [x] **Restore back-compat (found in review).** Adding a required
  `GameState.ledger` broke restoring any snapshot written by an earlier
  version: `GameRoom.restore` assigned `snap.state` verbatim, so `ledger` came
  back `undefined` and the next `clone()` spread it. Resume-after-restart is a
  supported feature, so every host with a game in progress would have hit this
  on upgrade. Normalised on read, following the `snap.roundIndex ?? 0`
  precedent already in that method.
- [x] **Replay back-compat.** Rows already in a user's `games.db` hold the old
  `fans` strings; parsed back on read rather than migrating a user's file.
- [x] **Client tests are now typechecked.** `packages/client/tsconfig.json` had
  `include: ["src"]`, so the client's own tests never typechecked — which is why
  a stale `RoundResult` helper in `store.test.ts` produced no error. Now
  `["src", "tests"]`.

**Follow-ups, all since resolved (2026-08-01) — see the section above.**

## 🔍 Frontend & design audit — seventh pass (2026-07-31)

Audit of `packages/client` only (React 18 + Tailwind + Zustand + Framer Motion
PWA): code review plus visual review of `docs/*.png` and `test-results/*.png`.
Prefix **F**, one commit per item. **Status: all 25 resolved** — lint clean,
typecheck clean, 163 engine + 49 server + 34 client tests and 9 Playwright e2e
(5 viewports) green.

### High

- [x] **F1 · Server errors never reached the UI.** `handleServerMsg` logged
  `error` frames with `console.warn` and dropped them, so a full lobby, an
  already-started game or a rejected action produced no feedback at all — and
  the huan/void screens sat on "Waiting…" forever after one. The store now keeps
  `lastError` (with a `seq` so an identical repeat re-triggers), an `ErrorToast`
  mounted at the app root renders it against `err.<code>` catalog strings
  (falling back to the server's message), and both declaration phases clear
  their `submitted` state when one arrives.
- [x] **F2 · No rejoin after a page refresh.** The seat token and room code
  lived only in memory, so a mid-game refresh — routine on a phone — lost the
  seat permanently even though the server reconnects a token happily. New
  `src/session.ts` persists `{ code, token, name, isHost }` on `joined`/`lobby`
  (the host flag is only known once the `lobby` frame lands) and clears it in
  `resetSession`; Landing offers "Rejoin". A stale token isn't rejected by the
  server, only ignored, so the attempt gives up after 6s and reports through F1.
- [x] **F3 · Your own discard pool was never rendered.** All three opponents had
  discard trays; `view.you.discards` appeared nowhere, so the furiten badge sat
  above a board that never showed the discards causing it. Now rendered in a
  tray above the hand, face-down placeholder included.
- [x] **F4 · The opponent-across hand overflowed the viewport.** 14 backs at a
  fixed `w-8` came to ~460px, wider than a 390px phone, and clipped off both
  screen edges. Each back now flexes (`flex-1 min-w-0`, 2rem cap) like the
  player's own hand — `TileBack` gained a `fill` prop for it — and the meld row
  wraps.
- [x] **F5 · The service worker cached nothing in production.** `SHELL` listed
  `/src/main.tsx`, which exists only in dev; `cache.addAll` is atomic, so its
  404 rejected every production install, the `.catch` swallowed it, and the
  offline fallback always resolved to the bare 503. Precache `/` only,
  runtime-cache the hashed `/assets` and `/tiles` on first use, cache name
  bumped to v2. `tests/sw.test.ts` drives the real `public/sw.js` in a stubbed
  worker global (3 of its 4 cases fail against the old file).

### Medium

- [x] **F6 · The reconnect loop never gave up.** Backoff capped at 10s but
  retried forever, so an invalid token spun silently behind a permanent
  "Reconnecting…". Stops after 8 consecutive failures (~47s) via a new
  `onGiveUp` callback and shows a "Back to menu" overlay; a successful connect
  resets the budget.
- [x] **F7 · `lastEvents` was collected and never displayed.** Nothing read it,
  so claims were only inferable from board diffs and sound fired only for the
  local player's own taps. New `EventFeed` announces pungs, kongs and wins and
  plays the matching sound for other seats. A won claim emits both `hu` and
  `claimed{kind:'hu'}`, so it is announced once.
- [x] **F8 · The score row made every bot identical.** `o.name.slice(0, 4)`
  rendered "Bot 2"/"Bot 3"/"Bot 4" as three "Bot:" labels. CSS truncation
  instead.
- [x] **F9 · Match end dumped everyone to the landing screen.** `matchEnd`
  called `resetSession()` immediately — no winner, no totals. New `matchEnd`
  screen ranks the accumulated `matchScores` (falling back to lobby names when
  the idle sweep ends a match mid-round) and returns to the menu on demand.
- [x] **F10 · No way to leave a lobby.** Neither lobby view had an exit, so
  abandoning one meant closing the tab and the host's socket lingered until
  then. Leave button on both.
- [x] **F11 · Round-end rows needed the animation to become visible.** Rows
  mounted at `opacity: 0` and relied on staggered Framer animations, so any
  environment where the animation didn't run got a blank scoreboard — as both
  match-round-end screenshots show. Entrances now animate position and scale
  only; opacity rests at 1.
- [x] **F12 · No reduced-motion support.** The last-discard tile pulsed forever
  and every overlay sprang in. `MotionConfig reducedMotion="user"` at the root
  plus a `prefers-reduced-motion` block that collapses CSS animations and keeps
  the last-discard glow static.
- [x] **F13 · The play screen clipped on short/landscape viewports.**
  `overflow-hidden` cut off the lower board on a ~390px-tall landscape phone
  with no way to reach it; vertical overflow now scrolls.
- [x] **F14 · The claim panel was off-theme.** Gray-900/700 chrome against a
  jade-and-amber board. Restyled to the felt palette; the Hu/Kong/Pung buttons
  keep their action-semantic colors.
- [x] **F15 · Touch targets below 40px.** The language toggle was ~24px tall and
  the sound/help buttons were bare text with no padding. `min-h-10 min-w-10` on
  all of them (Sort included), with the turn indicator truncating so the wider
  bar still fits a phone.
- [x] **F16 · Tiles were not keyboard- or screen-reader-accessible.** Bare
  `motion.div`s with `onClick`: no role, no `tabIndex`, no key handler, and the
  only name was the untranslated id "man-3". Clickable tiles get
  `role="button"`, `tabIndex`, Enter/Space and a localized `aria-label` ("3 of
  Characters"); non-interactive tiles get `role="img"` with the same name; hand
  tiles, whose gestures belong to the `Reorder.Item`, get a real button wrapper.
  The `img` `alt` keeps the internal id — e2e selectors match on it and it is
  never announced.

### Low

- [x] **F17 · Hardcoded strings bypassed i18n.** A literal "← share code" while
  `host.shareCode` sat unused; the spectator dealer badge 庄 in every language;
  English-only titles/aria-labels on the sound, help and How-to-Play close
  buttons; practice mode naming the player a hardcoded "You". All routed through
  the catalog in three languages. The practice error now carries a catalog key
  rather than an English literal the UI never rendered.
- [x] **F18 · PWA metadata mismatch and missing icons.** Only an SVG icon, which
  iOS home-screen and several Android launchers ignore (closes the
  apple-touch-icon nice-to-have left open by A34), and `theme-color` was
  green-900 while the board and `body` are felt `#0c5f57`. Added 192/512 PNGs, a
  maskable 512 with the tile inside the safe zone, and an apple-touch-icon,
  produced by `scripts/icons/generate-icons.mjs` — dependency-free, drawing the
  same five primitives as `icon.svg` and encoding via `node:zlib`. One brand
  color everywhere.
- [x] **F19 · `<html lang>` never updated.** Pinned to `en`, so screen readers
  read the Chinese UI with English rules. `applyDocumentLang` runs from `setLang`
  and once at startup.
- [x] **F20 · The Hu celebration ended itself early.** `onAnimationComplete` sat
  on the outer ~0.3s fade, so the overlay exited a third of the way into the
  0.8s emoji animation. Dismissed on a 1.2s timer owned by the play screen,
  which also survives reduced motion skipping the animation.
- [x] **F21 · Queued actions flushed after reconnect.** Everything sent while
  disconnected was replayed verbatim, so a discard or lobby command could land a
  round late. Only the `join` handshake — the one message screens send before
  the socket opens — is queued now.
- [x] **F22 · The join form conflated all HTTP failures.** Any non-OK status
  showed "Lobby not found", sending players hunting for a typo in a correct code
  when the server 500'd. Branches on status.
- [x] **F23 · Presentation nits.** Round-end and match-end rows read "You (you)"
  in practice mode; the tag is dropped when redundant. Lobby rows showed nothing
  for a disconnected player, which read as "still connecting"; they say so now.
  A concealed kong rendered as four bare backs, indistinguishable from a hand
  fragment; it carries a Kong badge.
- [x] **F24 · `min-h-screen` used `vh` on mobile.** The 100vh baseline jumps on
  iOS as the URL bar shows/hides, shifting the layout mid-game. All screens use
  `min-h-dvh`.
- [x] **F25 · The claim countdown trusted the client clock.** The bar compared
  the server's `claimDeadline` against `Date.now()`, so a client 30s behind
  drained a 3s window over 33 seconds and one ahead saw it pinned at empty —
  negligible on a LAN, real over Tailscale. Takes the length from
  `view.config.claimWindowMs`, trusts the deadline only inside a plausible range
  (so a mid-window reconnect still resumes part-drained), and ticks on the
  monotonic clock.

## 🔍 Audit backlog — sixth pass (2026-07-26)

Full-repo inline re-audit (engine, server, client, cross-checked against
`SBR_ENG_part_1.pdf` via pdftotext). Baseline verified green before write-up:
lint clean, typecheck clean, 153 engine + 48 server + 5 client tests pass.
**One critical rules bug surfaced** (A35) that all five earlier passes missed,
plus a related exploit and three smaller items.
**Status: all items resolved in the follow-up session** — lint clean, typecheck
clean, 163 engine + 49 server + 6 client tests and 9 Playwright e2e (5 viewports)
green. Each fix is described inline below.

- [x] **A35 · (CRITICAL, rule integrity) The face-down void first-discard leaves
  the player one tile short for the whole round — they can never Hu.**
  `applyVoidResolution` (`engine/src/actions.ts:919`) removed the first-discard
  tile from the hand at void phase, and the turn loop then ran normal
  draw-then-discard turns. A non-dealer stood at 12 tiles (13 at the draw
  moment, 12 after discarding); East stood at 13→12 after turn 1. But
  `isWinningHand` requires `14 − 3·melds` tiles (`engine/src/hand.ts:151`), so
  any player who placed a face-down tile could *never* complete a hand — only
  indicator users (no void-suit tiles at declaration, hand intact at 13/14) could
  win. Verified empirically: a 30-game probe driving full games through
  huan/void/play topped out at 13 concealed tiles for every seat, and produced
  zero wins by separated-tile players. The PDF is explicit (Lesson 4, "Forbidden
  suit"): "each player separates a tile of a forbidden suit from the hand and
  places it face down in the center …; **the same tile is the first mandatory
  discard of the player**", and the first-discard note describes the mechanic —
  "grab the first tile off the wall with one hand and flip the tile in the center
  of the table with the other". FIXED: the separated tile now parks in
  `PlayerState.pendingFirstDiscard` (out of `hand`, not yet in `discards`); a new
  `flipFirstDiscard` action turns it up as that player's first discard, and
  `discard` is rejected with `must_flip_first_discard` until they do.
  `computeLegalActions` offers the flip in place of every discard option (kongs
  still available first). Standing counts are back to the standard 13/14, so the
  win check is reachable for everyone. Server whitelists the action, bots take it
  ahead of discard selection, the client shows a flip panel (tile + hint +
  button), and the e2e real-click spec drives it on all 5 viewports. Test
  coverage: new `engine/tests/first-discard.test.ts` (hold/reject/flip mechanics,
  30-round reachability + Hu probe, tile conservation), and the bot smoke test now
  asserts wins by non-indicator players — the assertion that would have caught
  this in the first place, since the old `totalHus > 0` passed on indicator users
  alone. ARCHITECTURE.md §5.4 rewritten (it encoded the same wrong model).
- [x] **A36 · (HIGH, rule integrity / exploit) `declareVoid` accepts
  `firstDiscard: null` while the player holds void-suit tiles.** The guard
  (`engine/src/actions.ts:890`) only validated a non-null firstDiscard. A
  crafted frame with `firstDiscard: null` set `usedIndicator = true` and kept
  the tile that should have been separated — one extra concealed tile for the
  whole round, plus false indicator status (the Heavenly/Earthly eligibility
  surface). Same threat class as A23. FIXED: rejects with
  `void_indicator_not_allowed` when `firstDiscard === null` but the hand contains
  the declared suit; regression test in first-discard.test.ts.
- [x] **A37 · (MEDIUM, info leak + UI) The face-down first discard is public
  from the void phase onward.** `toPublicPlayer` (`engine/src/views.ts:226`)
  shipped `discards` verbatim — including the face-down tile's id — in every
  player and spectator view; the client rendered it face-up in opponents' ponds
  and never read the `firstDiscardFaceDown` flag it shipped; bots counted it in
  `visibleTileTypes` (`server/src/bot.ts:208`). FIXED as a consequence of A35:
  the tile isn't in `discards` until flipped, so it can't leak through any of
  those paths. Views ship `PublicPlayer.pendingFirstDiscard: boolean` (its owner
  alone gets the id via `you.pendingFirstDiscardTile`, so it survives a
  reconnect), and both Game and Spectate draw a tile back in the pond until the
  flip. `firstDiscardFaceDown` is gone.
- [x] **A38 · (LOW, server) Reconnect grace doesn't cover the play-phase turn
  owner.** `botActIfNeeded` (`server/src/room.ts:559`) gated on
  `isBotOrOffline` (mere disconnection) with no `isInReconnectGrace` check, so
  any `scheduleNext` that fired while a briefly-dropped human held the turn —
  e.g. *another* player reconnecting (`connect` → `scheduleNext`) — bot-played
  their discard inside the 60s grace that huan/void/claim decisions correctly
  wait out (A10). FIXED with the same grace guard. Regression test in
  server.test.ts (verified to fail with the guard removed).
- [x] **A39 · (LOW, client) Match totals double-accumulate on a round-end
  reconnect.** The server hands a reconnecting client the round results
  directly (`server/src/room.ts:255`, the A9 path), and the store's `roundEnd`
  case added each `scoreDelta` into `matchScores` unconditionally
  (`client/src/store/index.ts:128`). Disconnect/reconnect twice at round end
  and the match totals inflated by the round delta each time. FIXED: `RoundResult`
  now carries a `roundIndex` (tracked per room, incremented in `nextRound`, and
  carried through the live-room snapshot so a host restart doesn't reset it); the
  store folds each index into `matchScores` once. Regression test in
  client/tests/store.test.ts.

**Noted, deliberately not filed:** `anyOpponentTenpai` (`server/src/bot.ts:238`)
reads opponents' concealed hands — documented in its comment, but it sits oddly
next to A33's "only information a human would have" principle; `MeldDisplay`
renders concealed kongs as four backs even for their owner and at round end
(deliberate per A27, but the §8.1 "hand reveals at round end" promise doesn't
cover them); a reconnected client isn't told it already submitted huan/void, so
it may resubmit and eat a harmless `already_submitted_*` rejection; `addBot`'s
`difficulty` passes unvalidated into the lobby slot (`server/src/ws.ts:305`,
inert beyond the label/medium check).

## 🔍 Audit backlog — fifth pass (2026-07-16, final)

Covered the last unread corners (remaining client screens/hooks, i18n, release
scripts, PWA assets, e2e specs, configs) and re-reviewed A31–A33. **No larger
items found** — the codebase is in good shape. One small polish item:

- [x] **A34 · Client polish.** (1) The lobby's Copy button called
  `navigator.clipboard.writeText` bare — the clipboard API doesn't exist on
  insecure origins, so on plain LAN HTTP (the primary path) it threw and did
  nothing; now falls back to the legacy textarea copy, also covering denied
  permissions. (2) `manifest.webmanifest` referenced `/icon-192.png` +
  `/icon-512.png` which were never created (PWA install icon 404'd); replaced
  with a real `/icon.svg` (mahjong-tile motif) also wired as the favicon,
  which was missing too. (3) ARCHITECTURE.md §6.4 now documents the A27/A31
  per-viewer redaction of views + events. (iOS home-screen icons want a PNG
  `apple-touch-icon`; left as a nice-to-have alongside the nominal-offline
  sw.js note below.)

## 🔍 Audit backlog — fourth pass (2026-07-16)

Review of the third pass's changes + the areas earlier passes never read
(client screens/hooks, server entries, release scripts, PWA assets).
**Status: all items resolved on 2026-07-16.**

- [x] **A31 · (HIGH, info leak) Drawn tiles were broadcast to every seat and
  spectator.** The event delta log is produced once per action and sent
  identically to all connections, and `drew` / `kongReplacement` carried the
  actual tile id — so any client could read every opponent draw from the WS
  payload, despite `projectView` hiding hands. `redactEventsFor()` (views.ts)
  now nulls those tiles for everyone but the drawer; wired into `sendViewTo`
  and the spectate broadcast. The server-test autoplay harness asserts the
  invariant on every broadcast of every full-game test.
- [x] **A32 · nextRound left stale bot callbacks pending.** With the A26
  per-seat dedup, a leftover entry could suppress the new round's first
  huan/void scheduling and stall the game (reachable only for programmatic
  hosts calling nextRound within the 150ms bot-think window). nextRound now
  cancels all pending bot work via the same helper teardown uses.
- [x] **A33 · Medium bot counted opponents' concealed kong ranks.**
  `visibleTileTypes` fed ukeire from the raw state including hidden kong
  ranks (information a human wouldn't have — A27). It now takes the viewing
  seat and skips concealed kongs that aren't its own.

**Noted, deliberately not fixed** *(superseded — F5 fixed this on 2026-07-31;
kept for the record)*: the PWA offline shell (`sw.js`) was nominal — it cached
`/` plus the dev-only `/src/main.tsx` path and never the hashed production
assets, so an offline navigation rendered a shell whose JS/CSS failed to load.
Judged not worth build integration at the time. F5 found it was worse than
described — `cache.addAll` is atomic, so the dev-only path's 404 rejected the
whole install and the cache stayed empty — and fixed it with runtime caching,
no build step required.

## 🔍 Audit backlog — third pass (2026-07-16)

Fresh full-repo audit after A1–A22. **Status: all items resolved on 2026-07-16** —
lint clean, typecheck clean, all unit/integration tests + Playwright e2e (now 5
viewport projects) green.

- [x] **A23 · (HIGH, rule integrity) `declareVoid` accepted any `suit` string.**
  With `firstDiscard: null`, a crafted frame like `suit: 'dragon'` was stored as
  `voidedSuit`, never matched any tile, and exempted the player from the entire
  void-suit rule (could win holding all three suits, skipped forced discards,
  gained Heavenly/Earthly eligibility, dodged all void penalties). Same threat
  class as A4. Fixed with a `man|pin|sou` guard in `applyDeclareVoid`
  (`invalid_suit` violation) + regression test in phase1.test.ts.
- [x] **A24 · Viewport e2e coverage.** Playwright ran Desktop Chrome only; the
  mobile-first UI had no phone/tablet/orientation testing at all. Added 4
  projects (iPhone 14 portrait/landscape, iPad gen-7 portrait/landscape, all on
  the chromium engine so CI needs no new browsers) scoped to the real-click
  `ui-clicks` spec, plus a no-horizontal-overflow assertion and per-viewport
  screenshot attachments. All pass — the layout scrolls (not clips) on short
  viewports. Bonus fix: a stale `packages/server/dist/client` left by `prepack`
  shadowed freshly built clients in dev/e2e (http.ts candidates now prefer the
  monorepo path, which never exists in the published package).
- [x] **A25 · Medium bot's defensive pung check was dead code.** It read
  `p.isReady`, which is only computed during round-end settlement — always false
  in play, so the gate never fired and medium punged exactly like easy. Now does
  a live `isTenpai` scan of opponents; deterministic tests in bot-smoke.test.ts.
- [x] **A26 · Bot scheduling double-fired per seat.** `scheduleNext` queued a new
  decision for every pending seat on every state change/reconnect; the extras
  fired against moved-on state and got rejected, flooding the "a rejection is
  unexpected" log. Added per-seat dedup (`botPendingSeats`) for both
  `scheduleBot` and `scheduleBotImmediate`; also stopped the server-test
  autoplay harness re-sending huan/void on every broadcast. Server tests now log
  zero rejections (previously dozens).
- [x] **A27 · Concealed kong tile type leaked to all seats.** Views shipped the
  full meld and the `kongDeclared` event carried the tile — one dev-tools tab
  from revealing a secret. Views now send `PublicMeld` (`tile: null` for others'
  concealed kongs until roundEnd; owner always sees theirs), and the concealed
  `kongDeclared` event carries `tile: null`. Client `MeldDisplay` already drew
  backs, so no visual change. Tests in spectator.test.ts.
- [x] **A28 · Hu'd discard stayed in the discarder's pond.** Pung/kong claims
  remove the claimed tile (A15) but Hu didn't — the winning tile rendered in the
  pond *and* in the Hu record, and inflated bots' visible-tile counts.
  `applyHuResolution` now takes it (once, robbing-kong excepted — that tile was
  never in a pond). Assertions added to the phase3 Hu tests.
- [x] **A29 · Abandoned lobbies/rooms were never GC'd.** Every abandoned "Host a
  Game" leaked a lobby + tokens forever; rooms whose humans all left played out
  and then sat in memory (re-restoring from `live_rooms` on every restart).
  Added `sweepStaleLobbies` (2h TTL, spares connected humans) and
  `sweepIdleRooms` (24h idle → clean `endMatch`), on a 10-min unref'd interval
  in server.ts. Tests in gc.test.ts.
- [x] **A30 · Small cleanups.** Renamed `getConcealdedKongTypes` typo; removed
  the always-empty `RoundResult.events` field; dealer-turn-1 `declareHuOnDraw`
  now picks the best-scoring winning tile instead of an arbitrary one (was: the
  highest tile, which could miss GoldenWait when Heavenly/Earthly is disabled —
  test in phase3.test.ts); added client store unit tests (matchScores
  accumulation, joined/matchEnd transitions).

## 🔍 Audit backlog (2026-07-11)

Full-repo audit (engine, server, client, cross-cutting). All items below were
verified against current code with file:line references. Ordered by priority.
IDs are stable so we can tackle them one at a time.

**Status:** all audit items resolved on 2026-07-11 (A1–A19 + A6b + A20) — lint clean,
all typechecks pass, 193 unit/integration + 5 Playwright e2e green, merged to main.
A17 re-verified against Bun 1.3.14: Bun has no `node:sqlite`, and the lazy-load fix lets
the compiled binary boot + serve (logs "persistence disabled") instead of crashing.
A20 (that run surfaced the binary serving no UI) is fixed: the Bun binary now embeds and
serves the client SPA. A second audit pass (2026-07-11) reviewed the session's changes +
refreshed the docs, fixing A22 (Biome ignoring `test-results/`) and A21 (embedded-asset
cache headers, 2026-07-12). **No open items** — A1–A22 all resolved.

### P0 — quick win / unblocks everything else

- [x] **A1 · Adopt Biome so `pnpm lint` passes locally + enforce it in CI.** DONE
  (2026-07-11). Turned out to be far more than CRLF: 557 lint errors. `.gitattributes`
  now pins `eol=lf`; `biome.json` disables `noNonNullAssertion` (justified by
  `noUncheckedIndexedAccess`) + `noArrayIndexKey`, sets single-quote/as-needed-arrow
  formatting to match the codebase, and relaxes `noExplicitAny` in tests; ran
  `biome check --write [--unsafe]`; restored `autoFocus` that `--unsafe` stripped;
  added `type="button"` to 36 buttons; fixed a param-reassign in rng.ts. CI lint is
  now blocking. Verified: lint clean, typecheck clean, 179 tests pass, client builds.
  `.gitattributes` is `* text=auto` (no `eol=lf`) and this machine has
  `core.autocrlf=true`, so files check out CRLF on Windows and Biome (emits LF)
  flags all 84 files (~900 diagnostics). CI hides it with `pnpm lint || true`
  (`.github/workflows/ci.yml:29`). Fix: set `.gitattributes` → `* text=auto eol=lf`,
  run `git add --renormalize .`, commit, then drop the `|| true` in CI. Do this
  first — otherwise every later commit fights the formatter.

### P1 — HIGH (crash / rule integrity / distribution)

- [x] **A2 · Malformed WS frame crashes the entire server.** DONE — `room.handleAction`
  now validates the frame is an object with a string `t` before touching it, and
  `applyAndPropagate` wraps `applyAction` in try/catch; `main.ts` adds
  `uncaughtException`/`unhandledRejection` backstops. Regression test in server.test.ts. `ws.ts:291` →
  `room.ts:216` (`'seat' in action` throws `TypeError` when `action` is `null`);
  and an unknown `action.t` makes the engine return `undefined` (see A3) so
  `room.ts:225` `!result.ok` throws. No try/catch around the socket `message`
  handler and no `uncaughtException` guard in `main.ts` → the process exits,
  killing every in-progress game. Reachable by anyone who opens a game socket.
  Fix: validate action shape + wrap `applyAndPropagate` in try/catch (+ A3).
- [x] **A3 · `applyAction` can return `undefined`.** DONE — added a `default` case in
  `dispatchAction` returning `internal_error`. Regression test in phase1.test.ts. `dispatchAction`
  (`engine/src/actions.ts:1246`) has no `default` case; an unknown `action.t`
  falls through and the `try/catch` in `applyAction` only catches throws. The
  documented contract is "always returns an ActionResult." Fix: add
  `default: return fail('internal_error')`. (Root of A2's second path.)
- [x] **A4 · Any player can force-close the claim window.** DONE — `handleAction` now
  whitelists client-issuable action types (`CLIENT_ACTION_TYPES`); `claimWindowExpire`
  and `draw` are server-only. Regression test in server.test.ts. `claimWindowExpire`
  carries no `seat`, so `handleAction`'s only guard (`'seat' in action`,
  `room.ts:216`) passes it straight through, and `applyClaimWindowExpire`
  (`actions.ts:978`) never checks the deadline. A player can instantly force-pass
  every opponent — locking out their Hu/pung/kong and even stamping them furiten.
  Fix: whitelist client-originatable action types; make the server timer the only
  source of `claimWindowExpire`.
- [x] **A5 · Stale socket close deposes a live reconnection.** DONE — `disconnect(seat, ws?)`
  no-ops when the seat has been rebound to a different socket; the game close handler
  passes its socket. Regression test in server.test.ts. `bindGameSocket`
  (`ws.ts:26`) does `close → room.disconnect(seat)` with no check that the closing
  socket is still current, and `disconnect` (`room.ts:183`) deletes
  unconditionally. When a half-dead phone reconnects (new socket) and the old
  socket's TCP close fires later, it evicts the *new* socket → frozen board →
  wrongful bot takeover after 60s. The lobby close handler already has the right
  guard (`ws.ts:71`). Fix: pass the socket into `disconnect`; no-op unless
  `connections.get(seat) === ws`.
- [x] **A6 · The npm package ships no client UI.** DONE — `http.ts` now resolves the
  client from `dist/client` (bundled) first, falling back to the monorepo
  `../../client/dist`; `packages/server/scripts/bundle-client.mjs` copies the client
  build in, wired into a `prepack` (`build client → tsc → bundle`). Verified: the built
  server serves the SPA at `/` from the bundled dir. NOTE: surfaced A6b below.
- [x] **A6b · (NEW, HIGH) The published npm package is uninstallable — engine is a
  private workspace dep.** DONE via option (a) — `scripts/bundle-server.mjs` runs esbuild
  to inline the zero-dep engine into a single self-contained `dist/main.js` (real npm deps
  fastify/@fastify/*/multicast-dns/qrcode-terminal stay external); the engine moved from
  `dependencies` to `devDependencies` so consumers never fetch the private package, and it
  is bundled in anyway. `prepack` runs the full pipeline; `files` ships only
  `dist/main.js` + `dist/client`. Verified with `pnpm pack`: tarball has no engine in
  `dependencies`, and the bundled binary boots + creates a lobby (engine path) + serves
  the client. `build` stays `tsc` for dev/e2e (engine via workspace symlink). `packages/server/package.json`
  has `files: ["dist"]` (server only), but `http.ts:12` serves
  `../../client/dist`, which doesn't exist in an npm install → `existsSync` is
  false → `npx sichuan-mahjong` runs an API/WS-only server with no UI. No step
  bundles the client into the server package. Fix: prepublish build+copy of the
  client dist into the server package, add it to `files`, and point `CLIENT_DIST`
  at the bundled location.

### P2 — MEDIUM (correctness / resume / privilege)

- [x] **A7 · Furiten bypass via pung → `declareHuOnDraw`.** DONE — added a `drewThisTurn`
  flag to GameState (set on wall draw / kong replacement / dealer's turn-1; cleared on
  a pung claim); `applyDeclareHuOnDraw` now rejects with `must_draw_first` unless the
  player drew. Regression test in phase3.test.ts (pung then Hu-on-draw is rejected). After a pung claim
  (`actions.ts:641`) turn = winner and `turnDrawNeeded = false`;
  `applyDeclareHuOnDraw` (`actions.ts:1146`) doesn't require the player actually
  drew this turn. A furiten player (barred from Hu-on-discard) can pung their
  winning tile then immediately declare a self-draw-style Hu — bypassing furiten,
  collecting the +1 self-draw bonus, and mislabeling the win. Fix: reject
  `declareHuOnDraw` unless the player drew (or just claimed a kong replacement)
  this turn.
- [x] **A8 · Host join clobbers an occupied seat 0; displaced player keeps host
  powers.** DONE — seat 0 is now reserved for the host: `findOpenSeat(lobby,
  { skipHostSeat: true })` places non-host joiners in seats 1–3, so a friend can never
  occupy the host seat. Regression test in server.test.ts. `ws.ts:165` (`if (isHost) assignedSeat = 0`) never checks whether a
  friend already took seat 0 (join links work the moment the lobby is created).
  The host overwrites the slot; the friend's token still resolves to seat 0 /
  host and is never revoked, so they can reconnect as host — evict the host,
  see the host's hand, call `nextRound`/`endMatch`. Fix: relocate/reject on
  conflict and revoke the displaced token.
- [x] **A9 · Reconnect at round end duplicates the SQLite row + re-broadcasts.** DONE —
  `roundEndBroadcast` flag (reset in `nextRound`) makes the persist + broadcast fire
  once per round; a client reconnecting at round end is handed the results directly
  without re-persisting. Regression test asserts a single `saveGameWithCode` call.
  `scheduleNext` (`room.ts:349`) calls `broadcastRoundEnd` unconditionally in the
  roundEnd phase; `connect()` (`room.ts:168`) calls `scheduleNext` on every
  reconnect; `broadcastRoundEnd` (`room.ts:470`) does an unconditional
  `saveGameWithCode` INSERT. Each reconnect (or a post-round disconnect timer)
  inserts a duplicate `games` row and re-sends `roundEnd`. Fix: a
  `roundEndBroadcast` guard reset in `nextRound`, or persist at the transition
  site.
- [x] **A10 · Restore mid-claim / mid-huan mishandles humans.** DONE — `resumeAfterRestore`
  rebases a persisted claim window's absolute deadline to a fresh window; huan/void/claim
  bot-fill now skips seats within their reconnect grace (`isInReconnectGrace`, keyed on an
  armed takeover timer — so a never-connected seat still gets bot-driven and can't stall).
  Two regression tests (deadline rebase; huan grace → takeover).
  `resumeAfterRestore` (`room.ts:293`) calls `scheduleNext` whenever
  `pendingClaims !== null`; the deadline is an absolute `Date.now()` timestamp, so
  after a restart it's already expired → window force-passes before anyone
  reconnects (+ furiten). Separately, huan/void/claim bot-fill keys off
  `isBotOrOffline` (mere disconnection), so seconds after boot bots pick huan
  tiles, declare the round-permanent void suit, and make claim decisions for
  humans who haven't reconnected — the `isAwaitingHuman` freeze only covers the
  play-phase turn owner (same gap hits a brief live drop during huan/void). Fix:
  re-base the claim deadline on restore; extend the awaiting-human freeze to
  huan/void/claim.
- [x] **A11 · `endMatch` doesn't quiesce the room — zombie resurrects its deleted
  snapshot.** DONE — an `ended` flag is set on `endMatch`; it closes+clears all sockets
  and now gates `handleAction`, `connect`, `disconnect`, `schedulePersist`, and
  `persistNow`, so no late action/close can re-arm a timer or re-persist. Regression test. `endMatch` (`room.ts:110`) clears timers and `deleteRoom` but never
  closes/clears connections or sets an "ended" flag. A still-bound socket sending
  an action (or closing → fresh 60s takeover → bot drives) re-arms
  `schedulePersist` → `saveLiveRoom` re-inserts the just-deleted `live_rooms` row;
  next boot restores a token-less, unjoinable zombie room. Fix: set an ended flag,
  close+clear sockets, gate `handleAction`/`disconnect`/persist on it.
- [x] **A12 · mDNS + QR code are dead in production.** DONE — `networking.ts` and `cli.ts`
  now use `createRequire(import.meta.url)` for the CJS-only optional deps; `startMdns`
  returns whether it started, and the banner prints the `mahjong.local` URL only when it
  did. Verified by running the server: the mDNS line and the QR code both render now. `networking.ts:42`
  (`require('multicast-dns')`) and `cli.ts:110` (`require('qrcode-terminal')`) run
  in an ESM build (`"type":"module"`, NodeNext) where `require` is undefined →
  `ReferenceError` swallowed by the surrounding try/catch → silent no-op, while
  the banner still advertises `http://mahjong.local:<port>`. Fix:
  `createRequire(import.meta.url)` or dynamic `import()`; don't print the mDNS URL
  when mDNS didn't start.

### P3 — LOW (polish / hardening / verify)

- [x] **A13 · Bots never pung.** DONE — `shouldPung` now counts only chow-window
  neighbors (rank distance 1–2), excluding the pung pair itself, so the ≥2 test is
  meaningful. Smoke test now asserts exposed pungs form across 100 bot games. `bot.ts:170` adjacency test
  `Math.abs(ti.rank - rank) <= 1` includes distance 0, so the ≥2 hand copies that
  make a pung legal always push `adjCount ≥ 2` → `adjCount < 2` is never true.
  Both easy and medium bots always pass on pung. Fix: exclude same-type tiles
  (require distance exactly 1–2).
- [x] **A14 · `join` name is unvalidated.** DONE — the join handler now coerces
  `msg.name` to a trimmed string, falls back to `Player N` when empty/non-string, and
  clamps to 24 chars. Regression test. `ws.ts:179` stores `msg.name` as-is
  (any type, any length) → broadcast to all, fed into `createGame`, persisted in
  every snapshot. Clamp to a string ≤ ~32 chars.
- [x] **A15 · Claimed discard tile stays in the discarder's discard pile.** DONE —
  `takeClaimedDiscard` removes the claimed tile from the discarder's pond when a pung or
  exposed kong forms, so it renders only in the claimer's meld. Assertion added to the
  A7 pung test.
  `applyPungClaim`/`applyKongClaim` (`actions.ts:641/596`) don't splice the
  claimed tile out of `players[from].discards`, so it renders both in the discard
  row and in the claimer's meld. Cosmetic (no rule depends on it). Fix: remove the
  claimed tile from the discarder's discards on claim.
- [x] **A16 · Furiten override uses the first-skipped value, not the max.** DONE —
  `applyFuritenAndCloseWindow` now raises `minFanToOverride` to the max of the existing
  and newly-skipped value (keeping `since`); `furitenSeatsAfterWindow` no longer excludes
  already-furiten seats. Matches the PDF's block-erring intent (ARCHITECTURE note synced).
  Regression test: skip 1-fan then 2/3-fan → threshold rises.
  `furitenSeatsAfterWindow` (`claims.ts:176`) skips already-furiten seats, so
  `minFanToOverride` (`actions.ts:399`) never rises when a larger Hu is later
  skipped. §5.5.5 intent is arguably the max skipped value. Verify against the PDF;
  low.
- [x] **A17 · Verify the Bun-compiled binary actually boots.** DONE + VERIFIED against
  Bun 1.3.14 (2026-07-11). `node:sqlite` loads lazily via `createRequire` (type-only static
  import). Compiled `bun build ... --compile --target=bun-windows-x64` and ran the .exe:
  Bun has **no** `node:sqlite`, so the old static import would have crashed boot; the lazy
  fix logs `[persistence] node:sqlite unavailable — persistence disabled` and the binary
  boots + serves (healthz ok, lobby created). Persistence is off in the binary (no
  games.db) — graceful degradation, as intended.
- [x] **A20 · The Bun-compiled binary serves no client UI.** DONE + VERIFIED (2026-07-11)
  — the standalone binary now embeds and serves the client SPA. `scripts/release/gen-embedded-client.mjs`
  turns `packages/client/dist` into `src/generated/embedded-client.ts` (URL → base64 body);
  a Bun-only entry `src/binary.ts` imports it and hands it to the server; `http.ts` serves
  from the embedded map (SPA fallback to index.html) or, when absent, from disk (npm path).
  Startup was extracted to `server.ts` so the thin `main.ts` (Node/npm) and `binary.ts`
  (Bun) each call `run()` once — no double-start. `compile.ts` generates the embed and
  compiles `binary.ts`. Verified: compiled a Windows binary and confirmed `GET /` (200 HTML),
  JS/CSS/tile assets, and SPA deep-links all serve from the embedded map; npm bundle still
  serves the disk client; e2e 5/5 + unit 193 green. (Persistence remains off in the binary
  per A17 — a Bun/`node:sqlite` limit, unrelated to the UI.)

### Second audit pass (2026-07-11)

Focused re-review of everything changed this session (embedding plumbing, server.ts
refactor, the A2–A20 fixes) + docs refresh (README / ARCHITECTURE / CLAUDE synced to
the new distribution model). Verdict: clean. Two items surfaced:

- [x] **A22 · Biome lints Playwright's `test-results/` output.** DONE — `pnpm lint`
  failed after any `pnpm e2e` run because Biome had no ignore for `test-results/`
  (only `.gitignore` did). Added `**/test-results/**`, `**/playwright-report/**`,
  and `**/dist-bin/**` to `biome.json` `files.ignore`. Lint is reliable post-e2e now.
- [x] **A21 · Embedded binary assets have no cache headers.** DONE + VERIFIED (2026-07-12)
  — the embedded branch in `http.ts` now sets `cache-control` per asset class: hashed
  `/assets/*` → `public, max-age=31536000, immutable`; the SPA shell (`/`, `/index.html`,
  `/sw.js`) → `no-cache` (so a binary upgrade's new bundle loads); tiles/manifest →
  `public, max-age=86400`. Verified against a freshly compiled Windows binary via
  `curl -I` — each class returns the expected header.
- [x] **A18 · i18n catalogs have no completeness check.** DONE — exported `catalog` and
  added `catalog.test.ts` asserting zh-Hans/zh-Hant define exactly English's keys (base +
  help strings); currently all match. Added the client package to the CI test step so this
  actually runs in CI (it was previously engine + server only). `Dict = Record<string,
  string>` (`i18n/index.ts:14`) means a missing translation silently falls back to
  English. All three catalogs currently match (98 keys each), but drift won't be
  caught. Optional: type `Dict` against a keyed union.

### Test coverage gaps (worth backfilling alongside the fixes)

- [x] **A19 · Adversarial WS tests.** DONE (unit/integration) — added regression tests
  alongside each fix: malformed-frame/action + claimWindowExpire whitelist (A2/A4),
  two-sockets-one-seat (A5), join-before-host (A8), reconnect-at-roundEnd single-persist
  (A9), restore deadline-rebase + huan-grace (A10), endMatch quiescence (A11), name clamp
  (A14), engine tests for A3/A7/A15/A16, bot-pung smoke assertion (A13), i18n parity (A18).
  Full Playwright suite (happy path + 2-round match) re-run green after all server changes.
  Also added `e2e/ui-clicks.spec.ts` (2026-07-11): plays the opening through **real UI
  clicks** — huan tile taps, void suit button, and the tap-to-select/tap-to-discard
  gesture — the interaction layer the other specs bypass via `window.__e2e`. This closes
  the raw-UI-click gap. Test totals: engine 149, server 42, client 2, e2e 5.
  _Optional remaining:_ browser-level specs for reconnect / spectator / i18n flows
  (covered at the integration layer today).

---


Current status: **All phases complete** — engine, server, client, bots, persistence, networking, and polish are all done. Remaining work is the intentional v1 deferrals tracked in [ARCHITECTURE.md §12](../ARCHITECTURE.md#12-open-questions--explicit-deferrals).

---

## Phase 1 — Engine: basic round (no claims, no Hu) ✅

- [x] `engine/src/state.ts` — `GameState`, `PlayerState`, `GameConfig`, `DEFAULT_CONFIG`, factory functions
- [x] `engine/src/actions.ts` — `GameAction` union, `applyAction` skeleton, `ActionResult` type
- [x] `engine/src/views.ts` — `projectView(state, seat): PlayerView`
- [x] Deal logic: 13 tiles per player, East gets 14th immediately
- [x] Huan San Zhang phase (`huanSelect` action, cw/ccw/random rotation from seed)
- [x] Void declaration phase (`declareVoid` action, atomic reveal, first-discard removal)
- [x] Play loop: East turn-1 no-draw (discard only + concealed kong), all others draw → discard
- [x] Strict void enforcement: reject non-void-suit discard while hand contains void tiles
- [x] Lenient void enforcement: 48-point penalty at wall end; all-void-discards carve-out
- [x] Wall exhaustion → round end (simplified, no scoring yet)
- [x] Export all new symbols from `engine/src/index.ts`
- [x] Tests: deterministic seeded game runs to wall exhaustion under both void modes

## Phase 2 — Engine: Hu detection ✅

- [x] `engine/src/hand.ts`
  - [x] `isWinningHand(tiles, melds, voidedSuit): WinShape | null` — standard 4-sets+pair and 7-pairs
  - [x] `findAllWinningArrangements` (used internally by scoring)
  - [x] `isTenpai(tiles, melds, voidedSuit): TileType[]` — exhaustive-wait filter applied
  - [x] `ukeire(tiles, melds, voidedSuit, visibleTiles): Map<TileType, number>`
- [x] `declareHuOnDraw` action wired in; engine derives subtype from context
- [x] `declareHeavenly` action (East turn-1 pre-discard, `usedIndicator` required)
- [x] Single-winner round end with 1-base-point simplified scoring
- [x] Property tests: constructive 4-sets+pair recognized; random 14-tile hands mostly not; tenpai hands have ≥1 completion

## Phase 3 — Engine: claims ✅

- [x] `engine/src/claims.ts` — `ClaimWindow`, `ClaimDecision`, claim resolution logic
- [x] Pung claim off discard (counter-clockwise tiebreak)
- [x] Exposed kong claim off discard
- [x] Concealed / promoted / postponed kong on own turn (§5.5.6)
- [x] Hu claim off discard; multiple simultaneous Hu winners on same discard
- [x] Claim window timer logic (`claimWindowMs`, early-close when all passed)
- [x] Priority resolution: Hu > Kong > Pung
- [x] `claimWindowExpire` action
- [x] Robbing-the-kong window for promoted and postponed kongs (§5.5.7)
- [x] Kong restrictions: no kong if replacement exhausted; pung-then-kong blocked
- [x] Furiten / skip-Hu state (`PlayerState.furiten`); cleared on next self-draw
- [x] Wall-end edge cases: last live-end tile — only Hu/discard; resulting discard only Hu/Pung; pung-chain

## Phase 4 — Engine: bloody-to-end + full scoring ✅

- [x] `engine/src/scoring.ts`
  - [x] All 10 fan combinations from §5.8 (`calcHandScore`)
  - [x] Compatibility matrix (PDF Table 9) encoded and enforced (`COMPATIBILITY`)
  - [x] `calcHandScore()` — validates compatibility, sums fan (with fanValue per type), caps at `fanCap`
  - [x] Heavenly/Earthly auto-cap when `enableHeavenlyEarthly`
  - [x] Self-draw bonus (+1 per non-Hu from each, not a fan) — in `applyDeclareHuOnDraw`
  - [x] Theoretical max hand value (TMV) calc for wall-end payouts (`calcTMV`)
- [x] Bloody-to-end: `status: 'hu'` sit-out; turn skips Hu players; round continues to 3-Hu or wall end
- [x] Multi-winner same-discard: each paid independently by discarder; turn-passing rule (PDF p.22)
- [x] Kong payments: concealed (2 from each non-Hu), exposed (2 from discarder), promoted (1 from each non-Hu), postponed (0)
- [x] Three kong refund paths: robbed (immediate reversal), shoot-after-kong (most-recent group), wall-end blanket (non-Hu non-ready declarers)
- [x] Void-suit-at-end penalty (lenient mode, 48-point pure deduction, `penaltyPot`)
- [x] Bu-ting (non-ready) wall-end payouts: non-ready non-Hu pays each ready non-Hu their TMV
- [x] Dealer rotation between rounds (§5.10) — `state.nextDealer`
- [x] `GameEvent` delta log: `huPayment`, `kongPayment`, `kongRefund`, `buTingPayout`, `voidPenalty`
- [x] Property tests: payment-matrix balance (`sum(scoreDelta) + penaltyPot = 0`); compatibility matrix; tile conservation
- [x] Set-with-void-suit penalty (48-point) — fires on pung/kong/concealed-kong of voided suit; `voidMeldPenalty` event
- [x] False-Hu penalty — 8 pts/opponent (redistributive) + kong refund; fires on invalid draw-Hu or claim-window Hu
- [x] Replay-test corpus: canned games per fan combination + penalty path

## Phase 5 — Server ✅

- [x] `server/src/http.ts` — Fastify routes: `POST /api/lobby`, `GET /api/lobby/:code`, `GET /api/replay/:id`, `GET /healthz`, `GET /j/:code`
- [x] `server/src/ws.ts` — WebSocket gateway on `/ws/:code?token=…`; token validation; seat binding
- [x] `server/src/tokens.ts` — host token + player token issuance and validation
- [x] `server/src/lobby.ts` — lobby create/join, seat management, `canStart` logic
- [x] `server/src/room.ts` — `GameRoom` owns `GameState`; broadcasts `PlayerView` after each action; routes `ClientMsg` to `applyAction`
- [x] Lobby code generator (4-char, alphabet excludes I/O/0/1)
- [x] 60s reconnect window: hold seat on disconnect, bot takeover after timeout (minimal placeholder bot; Phase 7 adds full heuristic)
- [x] Integration tests: fake WS clients cover join → start → round (8 tests, 265ms)

## Phase 6 — Client v0 ✅

- [x] Vite 8 + React 18 + Tailwind v4 (@tailwindcss/vite) + Zustand setup
- [x] `client/src/ws/client.ts` — WsClient with exponential-backoff reconnect (500ms→10s); "Reconnecting…" toast
- [x] `client/src/store/index.ts` — Zustand store mirroring latest PlayerView + lobby state
- [x] Screens:
  - [x] Landing — Host / Join buttons; pre-fills code from `/j/CODE` URL param
  - [x] HostSetup — creates lobby via POST /api/lobby, shows shareable URL, seat list, Start button
  - [x] JoinForm — code input (auto-uppercase) + name input; pre-fill from store
  - [x] Lobby (joiner view) — waiting state, player list with connection indicator
  - [x] Game — huan phase tile picker; void declare suit picker; play phase with top/side/center layout, hand + melds, discard pool, furiten badge, score deltas, turn indicator, wall count; Kong/Hu/Heavenly buttons
  - [x] RoundEnd — score ranking table, Hu badges, Back to Lobby button
- [x] `<Tile>` component — renders Unicode mahjong glyphs (🀇–🀡); `<TileBack>` for hidden tiles
- [x] Tile interaction: tap to select, tap selected tile again to discard
- [x] Claim panel: Pung / Kong / Hu / Pass buttons + countdown bar; fixed bottom overlay
- [x] `yourLegalActions` drives all button enable/disable — no client-side rule logic
- [x] Client builds successfully (166 kB JS gzip: 52 kB, 22 kB CSS gzip: 5 kB)
- [x] Long-press 2× tile preview — `useLongPress` hook, 2× size modal
- [x] `/about` screen — CC-BY-SA tile attribution, rules reference, MIT license notice
- [x] SVG tile assets from Wikimedia Commons — 27 face SVGs + custom back, served from `/tiles/`

## Phase 7 — Bots ✅

- [x] `server/src/bot.ts` — easy bot driver (subscribes to `PlayerView`, emits `GameAction`)
  - [x] Huan selection: suit with fewest tiles (that has ≥3)
  - [x] Void declaration: suit with fewest tiles; `firstDiscard` or indicator
  - [x] Void-clearing discard: prefers void-suit tiles in strict mode
  - [x] Normal discard: connectivity-score heuristic (pair/pung +3, adj +2, near +1); tiebreak terminals first, then lower rank
  - [x] Claim: always Hu; always Kong; Pung only if tile has <2 adjacent same-suit tiles in hand; else Pass
  - [x] Concealed kong on turn: always; promoted/postponed kong: always
- [x] Host UI controls: Add bot / Kick bot per seat (lobby phase)
- [x] Single-player practice mode (Landing → Practice button → auto-creates lobby + 3 bots + starts)
- [x] Bot-vs-bot smoke test: 100 full games, no crashes, no rule violations, payment-matrix balance holds

## Phase 8 — Persistence + replay ✅

- [x] `server/src/persistence.ts` — `node:sqlite` (Node 22 built-in) at OS user-data dir; `games` table schema
- [x] Write completed round to DB on `roundEnd` (best-effort; DB errors logged, never crash server)
- [x] `GET /api/replay/:id` serves full action log + results JSON (404 on missing)

## Phase 9 — Networking & distribution ✅

- [x] `server/src/networking.ts`
  - [x] LAN IP detection (skip loopback, link-local, virtual, Tailscale CGNAT range)
  - [x] mDNS broadcast `mahjong.local:8080` via `multicast-dns` (lazy require, silently skips if unavailable)
  - [x] Tailscale detection: `tailscale status --json --self` + `100.64.0.0/10` interface fallback
  - [x] TLS cert via `tailscale cert <hostname>`; HTTPS Fastify instance on `:8443`
- [x] `server/src/cli.ts` — startup banner with LAN / mDNS / Tailscale URLs + QR code (`qrcode-terminal`)
- [x] CLI flags: `--port`, `--https-port`, `--no-mdns`, `--no-tailscale`, `--data-dir`
- [x] npm package `sichuan-mahjong` with `bin` entry point (`dist/main.js`)
- [x] Bun compile pipeline: `scripts/release/compile.ts` (macOS arm64/x64, Linux x64/arm64, Windows x64)
- [x] Tailscale detection unit tests (8 tests, mocked `spawnSync` + interface scan)
- [x] CI: `.github/workflows/ci.yml` — lint → typecheck → test → build → `--help` smoke test

## Phase 10 — Polish ✅

- [x] PWA manifest (`manifest.webmanifest`) + meta tags + offline shell service worker (`sw.js`) — registers only on HTTPS
- [x] Framer Motion animations: tile selection lift (spring), last-discard pop, Hu celebration burst, reconnect toast slide, round-end stagger
- [x] Sound effects (Web Audio API, no assets): tile click, discard, kong, Hu fanfare — opt-in toggle (🔊/🔇 in top bar)
- [x] Reconnection toast UX — reactive via `useStore`, animated slide-in/out
- [x] Score history across rounds — `matchScores` accumulated in store, displayed in RoundEnd
- [x] "How to Play" overlay (`HowToPlay.tsx`) — 8 sections, bottom-sheet animation, accessible from game top bar
- [x] `/about` screen — CC-BY-SA tile attribution, rules reference, MIT license notice
- [x] Long-press tile preview — 2× size modal via `useLongPress` hook
- [x] Medium bot (`botTurnActionMedium`, `botClaimActionMedium`) — ukeire-based discard, defensive pung avoidance when opponent is ready
- [x] Playwright e2e config (`playwright.config.ts`) + `e2e/game.spec.ts` — host + 3 bots full round to round-end, replay 404, healthz

---

## CI pipeline (spans phases)

- [x] GitHub Actions: lint → typecheck → vitest → build → package smoke
- [x] Add Playwright e2e step to CI — installs chromium then runs `pnpm e2e` after build steps

---

## Post-v1 features (former §12 deferrals)

- [x] Flower Pig (花猪) house rule — opt-in `enableFlowerPig`; non-Hu player ending with all 3 suits pays each opponent `2^fanCap`
- [x] Multi-round / "End Match" — server starts next round (dealer = `nextDealer`), host controls
- [x] Reconnection > 60s reclaim — reconnected human reclaims seat at next round
- [x] Spectators — view-only `?spectate=1` connection + hand-hiding projection + read-only board
- [x] i18n — en / 简体 / 繁體 string catalog + toggle (persisted to localStorage)
- [x] Host-shutdown live-state resume — snapshot rooms+tokens to SQLite, rehydrate on boot
- [x] Tailscale node-sharing automation — `--share` auto-creates a device invite via the Tailscale API
