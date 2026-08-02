# History — every closed item, newest first

This is the record of work already done: the phase log (1–9), six full-repo audit
passes (A1–A40), the frontend/design pass (F1–F25), the mobile viewport work
(R1–R7), the tile-rendering change, and the hosting work (C1–C9). Each entry keeps
its diagnosis, not just its fix — that is the part worth having later.

**Live work lives in [TODO.md](../TODO.md).** This file only grows at the top, and
nothing in it is outstanding. It was split out of TODO.md on 2026-08-02, when that
file had reached 1,566 lines of which two were actually open.

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
