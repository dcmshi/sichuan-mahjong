/**
 * Layout probe — the worst case, at every viewport, before and after a change.
 *
 *   node scripts/screenshots/layout-probe.mjs <label>
 *
 * Needs a VITE_E2E client build and a server on :8080 (see CLAUDE.md). Writes to
 * `prototype-shots/<label>/` and prints a measurement table.
 *
 * **Start the server with `--bot-delay 120` for this.** Nothing here asserts on
 * timing, and the probe spends most of its life waiting for three bots to take
 * turns; at the 700ms default that is minutes. `SM_BOT_DELAY_MS` and
 * `--bot-delay` outrank the lobby, so the flag is all it takes:
 *
 *   SM_SEED=e2e-fixed-deal node packages/server/dist/main.js \
 *     --no-mdns --no-tailscale --bot-delay 120
 *
 * Not 0, which was tried: the board then moves faster than the probe can settle
 * and photograph it, and every shot came back as the *next* round. 120ms leaves
 * a gap wide enough to catch a still frame and still runs the whole sweep in
 * well under a minute. The real win was never the pace — it was replacing five
 * seconds of fixed `waitForTimeout` per viewport with waits on the phase the app
 * is actually in, and running `CONCURRENCY` viewports at once.
 *
 * The seed pins the deal, which is what makes two runs comparable — it does not
 * make them faster. Every viewport still has to *play* to a state worth shooting
 * (melds on the table and deep rivers), and that is turns, not layout.
 * `CONCURRENCY` viewports run at once for the same reason.
 *
 * **It never deletes anything.** Each run goes in its own labelled directory and
 * refuses to start if that directory already holds shots — earlier runs are the
 * only record of what the board used to look like, and a layout change is judged
 * by comparing against them. Pass a new label per run:
 *
 *   node scripts/screenshots/layout-probe.mjs baseline    # stash your changes first
 *   node scripts/screenshots/layout-probe.mjs after-river
 *   node scripts/screenshots/layout-probe.mjs after-centring
 *
 * The measurements matter as much as the images. `box/art` is a tray tile's
 * layout box against its drawn art: for the **vertical** lap they must agree,
 * because that lap is a negative margin on a box that keeps its true footprint,
 * and any gap means flex squashed the box while the art stayed sized off
 * `--tile-w` (N39). For the **horizontal** lap the box is deliberately 0.775 of
 * the art — the box is the pitch — so a gap there is correct and not a fault.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

/** Every size the audit, the CI projects and the tablets care about. */
const VIEWPORTS = [
  { name: '320x568-iphone-se1', width: 320, height: 568 },
  { name: '360x640-android-small', width: 360, height: 640 },
  { name: '375x667-iphone-8', width: 375, height: 667 },
  { name: '390x664-iphone14-tab', width: 390, height: 664 },
  { name: '390x844-iphone14-pwa', width: 390, height: 844 },
  { name: '414x896-iphone11', width: 414, height: 896 },
  { name: '430x932-pro-max', width: 430, height: 932 },
  { name: '768x1024-ipad', width: 768, height: 1024 },
  { name: '810x1080-ipad-air', width: 810, height: 1080 },
];

const BASE = 'http://localhost:8080';
/** The readability floor the viewport audit sets. */
const FLOOR = 24;
/**
 * Viewports shot at once. Three, not nine: each one opens a practice room of its
 * own, and the server has a concurrent-games ceiling and a per-IP rate limit that
 * nine simultaneous lobbies walk straight into. Three is also about where a
 * second chromium page stops being free on a laptop — past that the pages
 * contend and the settle poll below just waits longer.
 */
const CONCURRENCY = 3;

/** `node layout-probe.mjs <label> deep` — see the drive loop. */
const DEEP = process.argv[3] === 'deep';

const label = process.argv[2];
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error('usage: node scripts/screenshots/layout-probe.mjs <label>');
  console.error('  label names the output directory under prototype-shots/');
  process.exit(1);
}

const dir = `prototype-shots/${label}`;
if (existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.png'))) {
  console.error(`refusing to overwrite: ${dir} already holds screenshots.`);
  console.error('Earlier runs are the only record of the previous behaviour.');
  console.error('Pick a new label, or delete that directory yourself if you mean to.');
  process.exit(1);
}
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const rows = new Array(VIEWPORTS.length);

async function shoot(vp, index) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  await page.goto(BASE);
  await page.getByRole('button', { name: /Practice \(vs Bots\)/i }).click();
  await page.getByRole('button', { name: /Start Practice/i }).click();
  // Waited on the phase rather than the clock. The old fixed 3200ms + 2200ms was
  // sized for the dice overlay plus three bots declaring at 150ms each, so it
  // was both slower than it needed to be and a coin toss if anything ever got
  // slower. `getPhase` is what the app itself is waiting on.
  await page.waitForFunction(() => window.__e2e.getPhase() === 'voidDeclare');
  await page.evaluate(() => window.__e2e.voidSubmit());
  await page.waitForFunction(() => window.__e2e.getPhase() === 'play');
  // And wait for the deal's dice to clear, which is a separate thing from the
  // phase. The overlay is `pointer-events-none` and the game does not wait for
  // it, so play proceeds underneath while it animates — the two fixed sleeps
  // this replaced were, without ever saying so, mostly paying for this. Drop
  // them and every shot came back as a board under a seating roll. N25 made the
  // same discovery about the e2e specs: the assertion has to be that it is gone.
  await page.waitForFunction(() => document.querySelector('[data-dice-overlay]') === null, {
    polling: 100,
    timeout: 20_000,
  });

  // The worst case is melds on the table *and* deep rivers — a meld chip is
  // another row out of a budget that is already gone. Drive to the first state
  // that has both, or until the round ends.
  //
  // `deep` raises the bar to what actually threatens a *side* column: two meld
  // chips on one side seat, which is the second ~46px chip row (they wrap two to
  // a row in an 80px column). Off by default, because it samples a later board
  // and would make runs incomparable with every earlier one — and because not
  // every deal reaches it, in which case the round ends and the run reports
  // NO BOARD rather than lying.
  await page
    .waitForFunction(
      wantDeep => {
        if (window.__e2e.getScreen() !== 'game') return true;
        window.__e2e.autoPlay();
        const discards = [...document.querySelectorAll('.discard-tray')].reduce(
          (a, t) => a + t.querySelectorAll('.tile').length,
          0,
        );
        if (wantDeep) {
          const sideChips = [...document.querySelectorAll('[data-meld-zone]')]
            .filter(z => z.querySelector('.tile-sideways'))
            .map(z => z.children.length);
          return discards >= 20 && Math.max(0, ...sideChips) >= 2;
        }
        const melds = document.querySelectorAll('[data-meld-zone]').length;
        return melds >= 2 && discards >= 26;
      },
      DEEP,
      { polling: 60, timeout: 60_000 },
    )
    .catch(() => {});

  // Shoot and measure *now*, with nothing between this and the drive loop.
  //
  // Three settling strategies were tried here and every one of them spoiled the
  // shot, because they all share a false premise: that the board waits. It does
  // not — the bots keep taking turns, so any wait is a wait for the round to end,
  // and the screenshots came back as the next deal's seating dice over a board
  // that had not re-rendered yet. A fixed 900ms was the original and survived
  // only because it was short.
  //
  // Almost nothing measured below animates, and the exception is the one that
  // matters. `viewport.spec.ts` forbids a transform on a tray tile, so trays,
  // melds, the wall and the well are static — but the last discard *enters* at
  // `scale: 1.4`, and a scale changes `getBoundingClientRect`. Shot on arrival it
  // is a tile the size of the well; measured on arrival it reports fourteen wall
  // cells underneath it, which is a real number about a transient frame.
  //
  // So: one predicate for "the board is at rest", covering every transient the
  // board can be showing, and bounded so a busy table cannot stall the run.
  // Each clause was earned by a spoiled set of nine shots.
  await page
    .waitForFunction(
      () => {
        // The deal's seating roll. It is `pointer-events-none` and play carries
        // on underneath, so the phase says nothing about it (N25).
        if (document.querySelector('[data-dice-overlay]')) return false;
        // A tile in transit — a claim flying to a meld, or your own discard on
        // its way to the tray.
        if (document.querySelector('[data-tile-flight]')) return false;
        // The last discard enters at `scale: 1.4`, and a scale moves
        // `getBoundingClientRect` — measured mid-entrance it reports fourteen
        // wall cells under a tile that is really nowhere near them. `offsetWidth`
        // is the layout width and ignores transforms, so the two agree exactly
        // when the scale is back to 1.
        const d = document.querySelector('.last-discard-tile');
        return !d || Math.abs(d.getBoundingClientRect().width - d.offsetWidth) < 0.5;
      },
      { polling: 60, timeout: 4_000 },
    )
    .catch(() => {});

  // What the shot is actually of.
  //
  // `getScreen()` alone is not enough and that cost a whole run: the seating
  // dice are an overlay *over* the board, so the screen reads `game` throughout
  // and nine shots of a blurred board under a dice roll passed as green. The
  // overlay carries `data-dice-overlay` for exactly this kind of check.
  const screen = await page.evaluate(() =>
    document.querySelector('[data-dice-overlay]')
      ? 'dice-overlay'
      : (window.__e2e.getScreen() ?? 'unknown'),
  );

  const m = await page.evaluate(() => {
    const trays = [...document.querySelectorAll('.discard-tray')];
    const felt = document.querySelector('.board-felt');
    // No board to measure. Report it rather than throwing: some seeds finish the
    // round before the drive loop reaches its target state, and a probe that dies
    // on the eighth of nine viewports loses the eight it already had.
    if (!felt) return null;
    const well = document.querySelector('.play-well');
    const wall = document.querySelector('.wall-diagram');

    const measure = t => {
      // Never the declaration. It is deliberately the one tile in a tray whose
      // box is the whole tile rather than a pitch (N42), so measuring it reports
      // a horizontal lap as squashed on every viewport at once.
      const el = t.querySelector('.tile:not(.tile-void-discard)');
      if (!el) return null;
      const box = el.getBoundingClientRect();
      const art = el.querySelector('img').getBoundingClientRect();
      // Sideways tiles lap vertically, so height is the axis that matters.
      const sideways = el.classList.contains('tile-sideways');
      return {
        sideways,
        box: +(sideways ? box.height : box.width).toFixed(1),
        art: +(sideways ? art.height : art.width).toFixed(1),
      };
    };

    // A tile escaping its own tray is what cuts one in half or lays discards
    // over the well — the same property e2e/viewport.spec.ts guards.
    const spill = [];
    for (const [i, tray] of trays.entries()) {
      const b = tray.getBoundingClientRect();
      for (const t of tray.querySelectorAll('.tile')) {
        const q = t.getBoundingClientRect();
        if (q.left < b.left - 0.5 || q.right > b.right + 0.5) spill.push(`tray${i}`);
      }
    }

    // The wall frame's interior is the well's centre, so a cell painting under
    // the discard means the frame has been shrunk past what the middle needs.
    const disc = document.querySelector('.last-discard-tile')?.getBoundingClientRect();
    const overDiscard = disc
      ? [...(wall?.querySelectorAll('.wall-cell') ?? [])].filter(c => {
          const q = c.getBoundingClientRect();
          return (
            q.left < disc.right && q.right > disc.left && q.top < disc.bottom && q.bottom > disc.top
          );
        }).length
      : 0;

    // Where a side seat's oldest discard actually sits. Both rivers should read
    // the way text does — oldest at the top-left, growing down then right — and
    // the right seat gets there through two mirrorings (`column-reverse` for the
    // lap, cells fed newest-first to undo the order it implies), so neither DOM
    // position nor a class can be read for it. The component marks the cell.
    const riverEnds = trays
      .filter(t => t.querySelector('.tile-sideways'))
      .map(t => {
        const first = t.querySelector('[data-river-first]');
        if (!first) return 'unmarked';
        const b = t.getBoundingClientRect();
        const f = first.getBoundingClientRect();
        const onLeft = b.left + b.width / 2 < window.innerWidth / 2;
        const got = (f.left + f.width / 2 - b.left) / b.width < 0.5 ? 'L' : 'R';
        const gotY = (f.top + f.height / 2 - b.top) / b.height < 0.5 ? 'T' : 'B';
        // Where that seat's chair puts its oldest tile. The left seat faces
        // right, so its rows run down and wrap leftward — first row rightmost,
        // oldest at its top. The right seat is the mirror.
        const want = onLeft ? 'RT' : 'LB';
        if (`${got}${gotY}` !== want) return `${got}${gotY}!=${want}`;
        // And every row starts from the same edge. A partial row packing from
        // the wrong end still puts the oldest tile in the right corner, so the
        // check above passes while the newest row visibly hangs.
        const edges = [...t.querySelectorAll('.tile-run-v')].map(c => {
          const q = c.getBoundingClientRect();
          return onLeft ? q.top : q.bottom;
        });
        return Math.max(...edges) - Math.min(...edges) <= 1 ? 'seated' : 'ragged';
      });

    // What the melds are costing each side seat. Chips wrap two to a row in an
    // 80px column, so a third pung or kong adds a whole row — and that row is
    // the only thing left that can eat a side column's headroom now that the
    // river's height is capped by RIVER_ROWS. Reported as chips/height so the
    // budget below can be read against it.
    const sideMelds = trays
      .filter(t => t.querySelector('.tile-sideways'))
      .map(t => {
        const zone = t.parentElement?.querySelector('[data-meld-zone]');
        if (!zone) return '0';
        return `${zone.children.length}@${Math.round(zone.getBoundingClientRect().height)}`;
      });

    // How much room a side column has left. The wrapper is `h-full` of the
    // middle row and centres its content, so this is the headroom a deeper
    // river or another meld row would eat — the budget the `max-height` shrink
    // below exists to protect. `gap-1` is 4px between children.
    const sideSlack = trays
      .filter(t => t.querySelector('.tile-sideways'))
      .map(t => {
        const col = t.parentElement;
        const kids = [...col.children];
        const used =
          kids.reduce((a, c) => a + c.getBoundingClientRect().height, 0) +
          4 * Math.max(0, kids.length - 1);
        return Math.round(col.getBoundingClientRect().height - used);
      });

    // Where each seat's declaration actually lands in its own tray, as a
    // fraction of that tray. Each seat wants a different corner — every river is
    // your own layout turned to that chair — and two of the four get there
    // through a rotation, so this is the only honest way to check. Trays are in
    // document order: across, left, right, yours.
    const declPos = trays.map(t => {
      const d = t.querySelector('.tile-void-discard');
      // A placeholder, never dropped: the flag below reads index 0 as the
      // across seat, and a seat whose declaration was claimed away has none —
      // filtering would silently slide the left seat into its place.
      if (!d) return '-';
      const b = t.getBoundingClientRect();
      const q = d.getBoundingClientRect();
      const fx = (q.left + q.width / 2 - b.left) / b.width;
      const fy = (q.top + q.height / 2 - b.top) / b.height;
      const kind = t.querySelector('.tile-sideways') ? 'side' : 'flat';
      return `${kind}:${fx < 0.5 ? 'L' : 'R'}${fy < 0.5 ? 'T' : 'B'}`;
    });

    const w = well?.getBoundingClientRect();
    const wd = wall?.getBoundingClientRect();
    return {
      overflow: Math.max(0, felt.scrollHeight - felt.clientHeight),
      rows: [...felt.children].map(r => Math.round(r.getBoundingClientRect().height)),
      melds: document.querySelectorAll('[data-meld-zone]').length,
      // Found by orientation rather than DOM index, so the table stays comparable
      // across builds that reorder the board.
      side: trays.filter(t => t.querySelector('.tile-sideways')).map(measure),
      across: trays.filter(t => !t.querySelector('.tile-sideways')).map(measure),
      shown: trays.map(t => t.querySelectorAll('.tile').length),
      spill: [...new Set(spill)],
      riverEnds,
      sideSlack,
      sideMelds,
      declPos,
      wellFree: w && wd ? Math.round(w.height - wd.height) : null,
      overDiscard,
    };
  });

  await page.screenshot({ path: `${dir}/${vp.name}.png` });
  rows[index] = { vp: vp.name, screen, ...(m ?? {}) };
  await page.close();
}

// A pool rather than `Promise.all` over all nine: see CONCURRENCY. Results are
// written by index, so the printed table stays in VIEWPORTS order however the
// pages finish.
const started = Date.now();
const queue = VIEWPORTS.map((vp, i) => [vp, i]);
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      await shoot(next[0], next[1]);
    }
  }),
);
await browser.close();

console.log(`\n=== ${label} ===`);
for (const r of rows) {
  const flags = [];
  if (r.overflow === undefined) {
    console.log(`${r.vp.padEnd(24)} NO BOARD (screen=${r.screen}) — nothing measured`);
    continue;
  }
  if (r.screen !== 'game') flags.push(`SHOT THE ${r.screen.toUpperCase()} SCREEN`);
  if (r.overflow > 0) flags.push(`OVERFLOW ${r.overflow}`);
  if (r.spill.length) flags.push(`SPILL ${r.spill.join(',')}`);
  if (r.overDiscard > 0) flags.push(`${r.overDiscard} WALL CELLS UNDER DISCARD`);
  for (const s of r.side.filter(Boolean)) {
    if (Math.abs(s.box - s.art) >= 1.5) flags.push(`side squashed ${s.box}/${s.art}`);
    if (s.art < FLOOR) flags.push(`side art under ${FLOOR}px floor: ${s.art}`);
  }
  for (const a of r.across.filter(Boolean)) {
    // Horizontal lap: the box IS the pitch, so 0.775 of the art is correct.
    if (Math.abs(a.box - a.art * 0.775) >= 1.5) flags.push(`across squashed ${a.box}/${a.art}`);
    if (a.art < FLOOR) flags.push(`across art under ${FLOOR}px floor: ${a.art}`);
  }
  for (const e of r.riverEnds) {
    if (e.includes('!=')) flags.push(`side river oldest tile ${e}`);
    if (e === 'ragged') flags.push('side river row hangs off the wrong edge');
    if (e === 'unmarked') flags.push('no data-river-first in a side tray');
  }
  // The across seat faces down the screen, so its river runs leftward from the
  // right end — the mirror of yours, which runs rightward from the left.
  if (r.declPos[0] && r.declPos[0] !== '-' && !r.declPos[0].startsWith('flat:R')) {
    flags.push(`across declaration ${r.declPos[0]}, want flat:R*`);
  }
  const side = r.side.map(s => (s ? `${s.box}/${s.art}` : '—')).join(' ');
  console.log(
    `${r.vp.padEnd(24)} melds=${r.melds} side=${side.padEnd(18)} shown=${r.shown.join('/')} wellFree=${r.wellFree} slack=${r.sideSlack.join('/')} melds=${r.sideMelds.join('/')} decl=${r.declPos.join(',')} river=${r.riverEnds.join(',')}${flags.length ? `❌ ${flags.join('; ')}` : '✅'}`,
  );
}
console.log(
  `\n${rows.length} shots in ${dir}/ — ${Math.round((Date.now() - started) / 1000)}s at concurrency ${CONCURRENCY}`,
);
