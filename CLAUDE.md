# CLAUDE.md — Sichuan Mahjong

Web-based 4-player Sichuan ("Bloody Rules") mahjong. Mobile-first PWA.
Runs three ways off one build — LAN, Tailscale, or hosted on a public URL —
because the client derives its origin and has never known a server address.

---

## Where things are documented

Keep this file short. New documentation goes in one of these instead:

| File | Holds | Write here when… |
|---|---|---|
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Types, engine API, full ruleset, protocol, persistence, networking, testing strategy | …you change behavior, a type, or a rule |
| **[TODO.md](./TODO.md)** | What is *open* — kept short on purpose | …you open or close a piece of work |
| **[docs/history.md](./docs/history.md)** | Everything closed: phase log, audits A1–A40, F1–F25, R1–R7, tiles, hosting C1–C9. Each with its diagnosis | …you finish something; add a section at the top |
| **[README.md](./README.md)** | User-facing: install, host/join, CLI flags | …you change the CLI or the player-facing flow |
| **[docs/viewport-audit.md](./docs/viewport-audit.md)** | Measured mobile viewport overflow + the open layout questions | …you change the play or round-end layout |
| **[docs/handoff-2026-08-01.md](./docs/handoff-2026-08-01.md)** | Where the layout/density work stands, decisions already settled, the four open ones, and the traps that cost time | …you are picking this up cold, or before a compaction |
| **[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md)** | How tiles are drawn (the art, lapped), its measured layer geometry, every knob, the four things easy to get wrong | …you are changing how a tile looks |
| **[docs/audit-payments.md](./docs/audit-payments.md)** | Every payment rule checked against three sources outside the PDF, with a decision each. The fan cap is the one divergence | …you change a payment, a fan value, or `fanCap` |
| **[docs/audit-public-deployment.md](./docs/audit-public-deployment.md)** | What a public URL exposes that a LAN never did — five findings, each reproduced against the live service, with the order to fix them | …you touch the WS boundary, the HTTP routes, or anything a stranger can reach |
| **[docs/design-hosted-server.md](./docs/design-hosted-server.md)** | The Render deployment: deploy steps, why it needs no client change, the nine things a public URL forces (C1–C7/C9 built), and why the hardening is *not* conditional on `--hosted` | …you are working on hosting, or on anything the tailnet used to protect |
| **[LICENSE](./LICENSE)** | MIT for code, CC-BY-SA 4.0 for the tile art, and the binary as a combined work carrying both | …you add or change a tile, or change what the release build embeds |
| `SBR_ENG_part_1.pdf` | Novikov, *Sichuan Mahjong? It's that simple!* — the canonical ruleset | (read-only; extract with `pdftotext` when a rule is in question) |
| [themahjong.guide](https://themahjong.guide/) | *Mahjong: a Visual Guide* — the second reference used alongside the PDF, and **where the tile SVGs were obtained**. The licence chain itself is Commons/Cangjie6, evidenced per file in `credits.json` | (external; cite it beside the PDF when a rule or a tile's provenance is in question) |

---

## Dev commands

```bash
pnpm install
pnpm --filter @sichuan-mahjong/engine build  # required before typecheck/test
pnpm typecheck
pnpm lint                                    # biome check .  (pnpm format to fix)
pnpm test                                    # Vitest (engine + server + client)
pnpm --filter @sichuan-mahjong/client build
pnpm --filter sichuan-mahjong build
pnpm --filter sichuan-mahjong start          # run server (serves built client)

# e2e needs the client built with the window.__e2e helpers, then a built server
# (Playwright starts the server itself from packages/server/dist/main.js, with
# SM_SEED set so the deal is fixed — some guards assert on what a round contains):
VITE_E2E=1 pnpm --filter @sichuan-mahjong/client build   # PowerShell: $env:VITE_E2E=1
pnpm e2e

# Regenerate the README screenshots in docs/ (needs the VITE_E2E client +
# built server above; drives the real app and writes into the repo)
pnpm shots

# Tile sandbox — every tile the app draws, solo and lapped, at every size it uses.
# Open the file directly: no build, no server, no game. It links the real
# index.css and uses the app's own classes, so the loop is edit-and-refresh.
# See docs/handoff-tile-rendering.md.
start scripts/tiles/sandbox.html     # macOS: open scripts/tiles/sandbox.html
pnpm tiles:sandbox                   # same page, rendered headless to a PNG

# Re-measure where the ink sits inside each frame (needs the Playwright chromium).
# Nothing generates assets from it any more — glyph-boxes.json is the evidence for
# the 22.5% overlap, so rerun it only if the source art changes.
node scripts/tiles/measure-glyphs.mjs

# Release binaries (embed the client, no persistence): needs Bun
bun run scripts/release/compile.ts

# Hosted mode, as Render runs it. PORT is read from the env; --hosted drops
# mDNS/Tailscale/QR, trusts one proxy hop, and tightens limits and sweeps.
PORT=8099 node packages/server/dist/main.js --hosted
```

`games.db` accumulates rooms from every automated run, and they are *restored at
boot* — enough of them and the concurrent-games ceiling refuses new lobbies before
you have played one. Clear it at `%APPDATA%\sichuan-mahjong\games.db` with the
server stopped.

---

## Key files

```
packages/engine/src/
  tiles.ts       tile encoding (TileId 0..107, TileType 0..26)
  rng.ts         xoshiro128** seedable PRNG — the only source of randomness
  dice.ts        the two throws: seating (highest is East) and the wall break
  hand.ts        isWinningHand, isTenpai, ukeire
  scoring.ts     fan calc, payment matrix, TMV
  claims.ts      claim window resolution
  state.ts       GameState, PlayerState types
  actions.ts     applyAction(state, action) → ActionResult
  views.ts       projectView(state, seat) → PlayerView (per-viewer redaction)
  protocol.ts    ClientMsg / ServerMsg types
packages/server/src/
  room.ts        GameRoom (owns GameState, drives bots, broadcasts views)
  bot.ts         easy + medium bot heuristics
  ws.ts          WebSocket gateway (validates every inbound frame)
packages/client/src/
  main.tsx       window.__e2e test helpers (VITE_E2E builds only)
  armedDiscard.ts  N11's verdict: fire, hold, or stand down with a reason
  helpExamples.ts  the hands How to Play draws, and the fan table it reads
  screens/PracticeSetup.tsx  bot pace + a level per bot, before practice starts
  store/         Zustand store (mirrors PlayerView)
  session.ts     seat token in localStorage — what makes "Rejoin" work
  prefs.ts       per-player display prefs in localStorage (animation pace)
  ws/client.ts   WsClient singleton + sendAction
  components/DiceOverlay.tsx  the two throws, revealed at the deal
  components/WallDiagram.tsx  the wall, opened where the dice said (N14)
  components/SettingsMenu.tsx the ⚙ popover: sound + animation pace
e2e/
  game.spec.ts   full bot round      } chromium only (drive the game via __e2e)
  match.spec.ts  2-round match       }
  house-rules.spec.ts  the host's 換三張 toggle — the only spec that reaches huan
  viewport.spec.ts     vertical-overflow, tray-clipping + claim-bar/hand overlap guard
  ui-clicks.spec.ts  real UI taps — runs on 5 viewports (phone/tablet × orientation)
scripts/
  icons/         PWA PNG generation (rerun if icon.svg changes)
  screenshots/   docs/*.png capture — `pnpm shots`, kept out of `pnpm e2e`
  tiles/         sandbox.html (open it directly) + measure-glyphs.mjs (needs chromium)
```

Full tree: [ARCHITECTURE.md §3](./ARCHITECTURE.md#3-repo-layout).

---

## Conventions

- **Engine stays pure.** No I/O, no deps, randomness only through `rng.ts`. Replays,
  determinism, and the fast-check property tests depend on it.
- **Everything reaching a client goes through `views.ts`.** Any field added to
  `GameState` needs a redaction decision before it lands in `PlayerView` —
  concealed kongs, drawn tiles, and the face-down first discard are all redacted
  today, each after an audit caught the leak. **`GameEvent` is the second channel
  and needs the same decision:** events are produced once and broadcast to every
  seat, so `redactEventsFor` has to strip them per viewer. Drawn tiles (A31) and
  void declarations (A40) both leaked that way.
- **The WS boundary trusts nothing.** Inbound frames are validated in `ws.ts`;
  server-only actions (e.g. `claimWindowExpire`) are never accepted from a client.
- **Client tests run without a DOM.** There's no jsdom or testing-library, so
  anything worth asserting lives in the store, the transport, or a pure helper
  the component calls — that's why `tileLabel`, `feedLineFor`, `joinErrorForStatus`
  and the claim-countdown maths are exported. Add UI logic the same way.
- **Screenshots are generated, not taken.** `docs/*.png` come from `pnpm shots`;
  regenerate them rather than hand-capturing, or they drift out of date again.

---

## Status

All v1 work, six full-repo audit passes (A1–A40, the last found 2026-08-01), a
frontend/design pass (F1–F25), round-end hand reveals with a fan/penalty
breakdown (2026-07-31), the mobile viewport work R1–R7 (2026-08-01), the hosting
work (C1–C10), and the first three feature items N1/N2/N4 (2026-08-02) are
complete. A separate frontend audit shipped 17 of 20 items and the remaining
three are shelved with reasons at the top of [frontend_todo.md](./frontend_todo.md).
Per-item history is in [docs/history.md](./docs/history.md); the deferral record is
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

**換三張 is opt-in, and off by default** (2026-08-01) — it is not in Novikov's
ruleset, which deals straight into the void declaration. The host turns it on in
the lobby; the choice rides on `startGame.rules` and is narrowed by `houseRules()`
in `ws.ts`. Practice mode therefore never shows the huan phase, which is why
`e2e/house-rules.spec.ts` exists — it is the only spec that reaches that screen.

**Bot pace is the host's, from the lobby** (2026-08-02) — slow 1800 / normal 900
/ fast 400, against the old flat 150 at which a circuit resolved inside a second.
It rides on `startGame.rules.botSpeed`, is narrowed by `botSpeedFrom` in `ws.ts`,
and is a `GameRoom` field rather than `GameConfig`: it changes no rule and a
replay of the same seed is identical at any value. `--bot-delay <ms>` and the
`SM_BOT_DELAY_MS` seam pin the process and **outrank the lobby**, which is what
keeps whole-round suites fast. **The pace is on the wire as of N24** (2026-08-03):
`botPace: { speed, pinned }` is a *sibling* of `view` on the `view` message —
nothing to project, since the pace isn't in `GameState` — and it rides on every
push because that is also what a reconnecting socket gets first. The ⚙ menu used
to hold `useState('normal')`, so it was right only by coincidence; `pinned` says
`--bot-delay` has overridden the room, and the control greys out rather than
accepting taps the server discards. The claim window defaults to 15s and is a
lobby preset (N6) — it closes as soon as every eligible seat has acted, so the
deadline is a backstop, not a pace.
The 🗒 control in the play well opens the round's move history, which is what the
transient event feed can't be.

**The side seats' tiles lie sideways, and the rotation is contained** (2026-08-03,
N10). Those two players sit at right angles to you, so a pile of upright tiles said
the board was four copies of your own view. **The art is still untouched and no
rotated copies ship** — rotating the source SVGs would have doubled 28 assets, 28
`credits.json` entries and what the binary embeds. Instead **the box carries the
landscape footprint and the art is rotated inside it**, so `getBoundingClientRect`
reports what the tile really occupies; a tile rotated *in place* would measure
portrait while drawing landscape, and `viewport.spec.ts` asserts on rendered
geometry. The vertical lap is a **negative margin on the box**, not the horizontal
lap's shrink-the-box trick, so each tile's box stays its true footprint. It buys
height: pitch 24.8px against 38.8 upright, so ten fit where six wrapped and
scrolled. The across pile is reversed so it grows the way *theirs* does — order
only, never 180°, because these are face up so you can read them. N10 also exposed
that **a guard reading two frames and comparing them measures its own latency**: the
viewport spec asked the turn cue and the claim panel in two `page.evaluate` calls,
and heavier rendering widened the gap until the pair straddled a claim opening. Both
reads are one evaluate now.

**Tiles are the untouched art, and a run laps** (2026-08-01). Each source SVG is a
complete 3D tile, so two of them edge to edge show two bevels where a real run
shows one shared edge. Rather than strip the body and rebuild it in CSS — which is
what `tiles/flat/` and `.tile-cell` did until now — every tile in a `.tile-lap`
container is drawn 29% wider than its layout box and anchored right, so it bleeds
left over the tile before it and DOM order paints it on top. The lap is 22.5% of
the art's width — exactly the body band, so it never touches ink. Every knob, the
measured layer geometry, and the four things easy to get wrong are in
[docs/handoff-tile-rendering.md](./docs/handoff-tile-rendering.md); read it before
changing how a tile looks.

**The board reads itself back** (2026-08-02). The middle of the well holds the
**wall**, drawn as four walls two tiles high — 4 × 7 × 2 = 56 is exactly what the
deal leaves, so the diagram *is* the wall rather than a picture of one. Each seat's
**void declaration** sits above their pile: `PublicPlayer.firstDiscardIsVoid` is
derived, and **false until the flip**, which is when a real table learns it.

**It runs on a public URL now, and the hardening is not conditional** (2026-08-02,
C1–C7/C9, C10). `--hosted` selects a `RuntimeProfile` that carries **numbers only** —
rate limits, the concurrent-games ceiling, sweep TTLs. The controls themselves are
on in both deployments, because a control that switches on with `--hosted` is one
you develop against with it off and that **fails open** the first time someone
forgets the flag on a deploy. Room codes come from `crypto.randomInt`, spectators
hold their own secret in their own store, `trustProxy` is a hop count and never
`true`, sockets ping every 30s, and `/robots.txt` + `/sitemap.xml` are routes whose
`Disallow: /*?` keeps the watch secret out of search results. Each with its
reasoning in [docs/design-hosted-server.md](./docs/design-hosted-server.md).

`render.yaml` is the Blueprint; steps and rationale in
[docs/design-hosted-server.md](./docs/design-hosted-server.md). Free tier, so
persistence stays off — `getDb()` already returns null and every caller handles it.

**It is deployed** (2026-08-02) at `https://sichuan-mahjong.onrender.com`.
Two things the deploy taught, both recorded in
[docs/history.md](./docs/history.md): **pnpm no longer reads the `pnpm` field in
`package.json`**, so the security overrides live in `pnpm-workspace.yaml` and
`packageManager` pins the toolchain — and the fix the error message suggests
(`--no-frozen-lockfile`) would have dropped those pins rather than restored them.
**Render fronts the service with Cloudflare and does not sanitise inbound
`X-Forwarded-For`**, so `trustProxy` stays at **one hop** — tested, and raising it
to 2 made every per-IP limit bypassable with a header. `req.ip` is therefore an
edge address rather than the player, which is a granularity cost that is
deliberately accepted; the reasoning and the measurements are in
[docs/design-hosted-server.md §C4](./docs/design-hosted-server.md#c4-fastify-has-to-be-told-it-is-behind-a-proxy).

**The dice are real** (2026-08-02, N2). Two throws, both with two dice, both from
`rng.ts` on a stream of their own (`seed + ':dice'`) so they neither consume from
nor perturb the shuffle. **Seating is on by default** — everyone throws, highest
is East — unlike every other addition to Novikov, because the wall throw he *does*
specify is meaningless without an East to throw it. Ties re-throw among the tied,
capped at four rounds, then the lowest tied seat takes it. The wall break follows
his three worked examples rather than his prose, and is applied as a **rotation of
the wall array**, so no distribution changes — only which tiles a seed deals.
`createGame`'s `dealer` is now `Seat | null`: null asks for the throw, a seat pins
it (which is what `startNextRound` and dealer-sensitive tests use). The client
reveals it in a two-stage overlay drawn with CSS 3D cubes — **no physics library**,
because the outcome is decided before anything is drawn, so a physics engine would
have to be rigged to land on a chosen face. [ARCHITECTURE.md §4.3.1](./ARCHITECTURE.md#431-the-dice-dicets).

**Counterclockwise means seat-*decreasing*, everywhere** (2026-08-03, N22). Play
passes by `(from + 3) % 4` and the client seats `seat + 3` to the viewer's right,
so South — the seat to East's right — is `dealer - 1`. The wall throw counted
`dealer + step`, which named North for the PDF's South, and the wall array's
quarters were laid out in ascending seat order while `drawIndex` only increments,
so the wall unwound clockwise while play went counterclockwise. Quarter `q` now
belongs to seat `(4 - q) % 4`; the diagram's half is a sign flip in `wallHead` and
`[2,1,0,3]` in `ringSlot`. **A wind is a distance from East, never a seat index** —
`windOfSeat(seat, dealer)`, since East rotates every round.

**Animation pace is per-player, in localStorage** (2026-08-02, N4). Speed
(slow/medium/fast, default medium) and skip, behind the ⚙ menu in the play top
bar — which **replaced** the standalone 🔊 button rather than joining it, because
the icon cluster already leaves the turn indicator no room. The durations that
shipped are now `fast`, so the default is 1.5× slower than before. Deliberately
*not* beside `botSpeed` on `startGame.rules`: bots move on the server so their
pace is the table's, but animation is local rendering over a board that has
already updated. Kept separate from `prefers-reduced-motion`, which stays honoured
globally — that is an accessibility signal, this is a taste.

**Open** (see [TODO.md](./TODO.md), which is only the open list): a central discard
pool (O3) is still held as a fallback — its redaction question is answered by
`firstDiscardIsVoid`, but the middle is no longer the empty space that motivated
it. Then **N19** a hard bot so the ladder has three rungs, **N23** French, Spanish
and Japanese, **N26** nine call sites label a seat's wind from its absolute index,
**N31** the lobby's Start button sits below the fold, **N32** the right-hand seat's
tiles are turned the same way as the left seat's and so face off the screen rather
than toward the table, and **N33** tapping a seat's pile should open all of it.
N19 is the only open item that is gameplay work rather than plumbing, layout or
research.

**You pick the tile that leads** (2026-08-03, N30). The void screen submitted
`counts[chosenSuit][0]` — the first tile of the suit in whatever order the hand
happened to be in — so the one discard a player is told they do not choose *was*
chosen, silently, by sort order, and it is the tile three opponents get their first
claim window on. Tapping a tile now answers both halves at once. `voidChoice` in
`voidSelection.ts` is a pure helper because **the two null cases are not
interchangeable**: `firstDiscard: null` is the indicator, legal only for a suit the
hand holds none of, and null while holding the suit is what the engine rejects as
`void_indicator_not_allowed` (A36). The three suit buttons stayed live — they carry
the counts the choice is made on, and they are the only route to the indicator case —
but a suit with no tile named is now a visible half-answer rather than a silent one.
The picked tile takes **amber and stops pulsing** instead of gaining a second ring,
and the lift is on the wrapper rather than the `Tile`, because `.tile-mark-flash`
draws its ring on that box.

**A control has to say what it does, not what it is called** (2026-08-03, N28/N29).
The kong button read `Kong M3 (promoted)` — a tile code no other screen uses, in a
`{label}` slot the Chinese catalogs also filled, and the *name* of the subtype rather
than any account of the tap. Reported as "it looks like it adds an additional tile to
my hand, but it's not super clear which one it is", and **both halves were right**: a
promoted kong does add a tile, and the button never said so. Each offer now draws its
tile, names it through `tileLabel`, and carries one line of consequence — the three
subtypes differ in what leaves, what arrives, and what they pay, and **postponed pays
nothing** while promoted **can be robbed**. `kongOffers` is a pure helper because the
client suite has no DOM, and it pins that `action.tile` is a `Tile` and not a
`TileId`. The hand marks the copies a kong would consume with a **glow on the art,
never a ring on the box**: the hand is a lapped run, so its boxes are pitches and the
void screen's `.tile-mark` would sit narrow and offset. N29 is the same lesson about
where a fix stops — `separateWinningTile` fixed the round-end reveal and left the play
screen showing 13 tiles under "Hand complete" for the rest of the round, because the
bug was reported from the reveal and hunted there.

**The payments are right; the cap is a variant we never surfaced** (2026-08-03,
N21). Three sources outside the PDF confirm every payment rule — winner sits out,
self-draw `handValue + 1` from each, discard win `handValue` from the discarder
alone, kongs 2/2/1, false Hu a flat 8 per player still in the deal, wall end on TMV.
The divergence is `fanCap`: Novikov calls the limit "3 (as in MIL's version) or 4
(as played in Russia)", so at the cap every payment is *half* what a 4-fan table
expects. **It is the host's now** (N27) — `fanCap: 3 | 4` on `startGame.rules`,
narrowed by `fanCapFrom`, default still 3. A literal union for a harder reason than
`claimWindow`'s: it is the exponent in `2 ** fanCap`, so `30` off the wire settles
the match. The help reads the value rather than restating it, and the round-end
screen names the limit it settled at. Findings in
[docs/audit-payments.md](./docs/audit-payments.md). **A screen that mislabels the
basis of a payment causes the same dispute as a wrong payment** — the Chinese
round-end screen was calling the point value 番数, "number of fan".

**The reveal shows the sets that won** (2026-08-03, N16). `HuRecord.shape` is the
decomposition the fans were *scored* from, because a hand parses more than one way
and a client re-deriving it would eventually contradict the fan list printed
beneath the tiles. **Optional and redacted**: optional because it lands in the
snapshot, redacted because `hu` is projected whole — a winner's fans name a
property of the hand, the shape names every tile in it, and a winner sits out with
its tiles unshown. Same `reveal` gate as a concealed kong's rank.
`groupWinningHand` matches types back onto ids, skips the leading melded sets, and
returns leftovers rather than dropping tiles.

**The help draws the hands, and the fan table reads the engine** (2026-08-02, N3).
The example hands are checked by `isWinningHand` in a test, because a help screen
confidently drawing a hand that does not win is the one failure a screenshot
cannot catch — and `HELP_FAN_ORDER` is asserted equal to the keys of
`COMPATIBILITY`, with the fan values read out of it, so a fan added to the scorer
fails a test until the help learns about it.

**You can arm a discard while you wait, and it refuses to fire on a real
decision** (2026-08-02, N11). `armedDiscard.ts` decides; `OwnZone` carries it out.
The server draws for you, so by the time a discard is legal the drawn tile is
*already in hand and already in `yourLegalActions`* — an unconditional auto-fire
would throw away a self-drawn winning tile before you were shown it. So it stands
down on `declareHuOnDraw`, `declareHeavenly`, `declareKongOnTurn` and any claim,
and says which. What still fires is the case that is pure latency: a strict void
discard with no decision in it.

**The wall diagram reads the dice, and empties from both ends** (2026-08-02, N14).
`wallHead` maps `breakOffset` proportionally onto the 28-stack ring and rotates by
the viewer's seat in one expression; the walk is a genuine closed ring, which it
was not before. `PlayerView.wallDrawn` carries the two open ends, because
`wallRemaining` is a total and cannot say *where* the gaps are — kong replacements
come off `kongDrawIndex`, which walks back from the far end.

**Practice has a setup screen, and each bot has its own level** (2026-08-02).
N17 shipped the settings behind a 12px underlined link on the landing screen, in
the same visual class as "About & Credits"; the first person who went looking did
not find it and reported the feature as never deployed. It was deployed. **An
affordance nobody finds has failed, whatever the code does** — so it is
`screens/PracticeSetup.tsx` now, reached from the Practice button the way Host
already worked. `PracticePrefs.botLevels` replaced `botLevel`, and
`parsePracticePrefs` still reads the old shape, because the key is on real devices.

**The bots are configurable per seat, from both entry points, and mid-match**
(2026-08-02, N15/N17/N18/N5). Empty lobby seats offer **+ Easy / + Medium** directly
and each seated bot carries a level picker on a `setBotDifficulty` message — the
protocol always carried difficulty per bot, only the lobby forced them to match.
`addBot` now names its **seat**: it didn't, so the per-row buttons filled whichever
chair was open first. Practice sends `rules.botSpeed` and its chosen level from a
"Bot settings" disclosure remembered in `prefs.ts` — it used to send `startGame`
bare and inherit every default. Pace is changeable mid-match from the play screen's
⚙ (host-only, hidden with no bots), which needed only dropping `readonly` from
`GameRoom.botSpeed`. `--bot-delay` still outranks all of it.

**A sentence about you needs its own sentence** (2026-08-02, N15). `nameOf` returns
"You", so third-person templates rendered "You rolls for the wall break". Both dice
stages now go through `throwerKey`. It is a pure exported helper because **the
browser check passed vacuously** — the local player is East only about a quarter of
the time, so an e2e assertion never reached the case it was written for.

**Whose turn it is, said at both ends of the screen** (2026-08-02, N7+N13). The
indicator rendered at **zero width** on a 320px phone: the icon cluster is
`flex-shrink-0` and the indicator was the only shrinkable child, so it absorbed the
whole shortfall while its text stayed in the DOM — which is why no guard caught it.
`LangSwitch` moved into the ⚙ menu (122px of a 320px row for a once-a-session
control) and the indicator is now `flex-1`, so it claims the room rather than
merely surviving. The cue itself is a filled amber pill plus a pulsing **inset**
ring on the hand block — inset, on a pseudo-element, because the hand is the
bottom-most row of an exactly-fitting column and a ring with a layout box would
fail the overflow guard the way N8's `sticky` bar did. It stands down during a
claim window so two amber prompts never compete. The guard asserts *rendered
width*, verified by reverting and watching it report 0.

**The claim window is a lobby preset, and bot pace hides at a human table**
(2026-08-02, N6/N9). `claimWindow: 'quick' | 'normal' | 'relaxed'` rides on
`startGame.rules` and `claimWindowMsFrom` in `ws.ts` maps it to 8000/15000/30000 —
**an enum and never a number**, because this is the one `rules` field where a raw
integer is a denial of service in one frame: a day-long window freezes a table
until the sweep reaps it and `0` closes before a human can see it. Unlike
`botSpeed` it *is* a `GameConfig` field, so it lands in `GameState` and the
snapshot, and the test that matters asserts it reaches `GameState.config` rather
than only that the mapping is right.

**The feed stores keys, not sentences** (2026-08-02, N12). `EventFeed` baked
`t(key, …)` into state at announce time, so "X ponged" kept the language it was
announced in. It now holds `{ id, key, seat }` and translates in the JSX — the rule
`PlayHistory` and the store's `history` already followed. Anything rendering
server-pushed text belongs on that side of the line.

**The tab icon is not the app icon** (2026-08-02). `icon-tab.svg` is 中 alone on
felt, filling the canvas; `icon.svg` keeps the tile and stays the install icon.
Rasterised at 16px the framed design has no room for 口's counter and comes out a
featureless blob, and a bolder version of it was worse at both ends.
`icon-tab-32.png` exists because **Safari ignores an SVG favicon**.
`generate-icons.mjs` therefore holds two geometries, one per SVG — keep each in
step with its own file.

**Measure the hand only after it settles** (2026-08-02, N8). `Reorder.Item`
animates the hand on every layout change, so a `getBoundingClientRect` taken as
something appears reports where tiles *were*. That transient cost two wrong
diagnoses of the claim bar overlapping the hand — including a confident claim,
written into the docs, that `.tile-lap` makes tiles paint below their box. It does
not: the lap is `width: 129.032%` with `height: 100%`, which against the art's
210:255 ratio fits exactly, so it bleeds sideways only. Poll until two consecutive
samples agree before believing any hand geometry.

**The binary embeds the tile art on purpose now** (2026-08-02). §13 used to forbid
merging the CC-BY-SA SVGs into compiled output while the Bun binary did exactly
that, so the rule was what was wrong. [LICENSE](./LICENSE) §3 states a binary as a
combined work carrying both licences, and `--credits` puts the attribution inside
the executable so it can't be separated from the art it covers. Adding a tile
without a `credits.json` entry now fails a test in both packages.

A real landscape layout for phones (R4 Phase 2 in
[docs/viewport-audit.md](./docs/viewport-audit.md)) stays shelved with its reasons
recorded there; landscape shows a rotate-to-portrait prompt during play.

**Running it locally:** the server snapshots its static asset list at boot, so
restart it after any client rebuild or the new bundle 404s into the SPA fallback.
