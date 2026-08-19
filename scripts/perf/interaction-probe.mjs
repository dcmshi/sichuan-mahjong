/**
 * Interaction probe — the two interactions reported as laggy, timed on a phone.
 *
 *   node scripts/perf/interaction-probe.mjs <label> [--runs 6] [--throttle 4]
 *
 * `docs/optimization.md` step 4 asks for one number per interaction at 4× CPU
 * throttle on a 390px viewport — the setup N38's comments quote — so that §4,
 * the PNG/WebP tile pipeline, is decided on a measurement rather than on the
 * assumption that SVG raster is what is left. This is that measurement, kept
 * because N38's was taken by hand in DevTools and could not be repeated.
 *
 * Needs a VITE_E2E client build and a server on :8080 (see CLAUDE.md):
 *
 *   SM_SEED=perf-fixed-deal SICHUAN_DATA_DIR=test-results/perf-data \
 *     node packages/server/dist/main.js --no-mdns --no-tailscale --bot-delay 150
 *
 * `SICHUAN_DATA_DIR` is not optional. This drives a *real* server, so every
 * lobby it opens is written to `live_rooms` and restored at the next boot, which
 * is the trap A79 closed for `pnpm e2e` and `pnpm shots`.
 *
 * **What each number means.** Both are input-or-arrival to *first painted
 * frame*, which is what the player feels and what N38 quoted:
 *
 * - `tap`  — the capture-phase `pointerup` (before React's handler runs) to the
 *   first frame presented with the tile lifted. Neither the CSS transition nor
 *   the framer spring that follows is included, in either build: the lift's own
 *   duration is a design choice, and counting it would hide the thing measured.
 * - `draw` — the arrival of the server frame that starts your turn (timestamped
 *   in a `message` listener registered inside the WebSocket constructor, so it
 *   runs ahead of the app's own) to the first frame presented with the drawn
 *   tile in hand.
 *
 * Both are read from a `requestAnimationFrame` loop, and "painted" is the start
 * of the frame *after* the one that first has the new DOM: a rAF callback runs
 * before that frame's style, layout and paint, so seeing the change there means
 * it has not been presented yet. That makes every number an upper bound by
 * however much of a frame is left after the paint — which is why the Event
 * Timing API's own input-to-next-paint `duration` is reported beside the taps as
 * a cross-check rather than trusting one clock. (Event Timing quantises to 8ms
 * and drops anything under 16ms, so it goes quiet exactly when things are fast.)
 *
 * Selectors are deliberately the ones both builds share (`ul.tile-run`,
 * `li[data-discardable]`, `.is-selected`, `.hand-your-turn`), so a baseline can
 * be measured by checking out an older `packages/client/src` and rebuilding.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:8080';
const VIEWPORT = { width: 390, height: 844 };

const label = process.argv[2];
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error('usage: node scripts/perf/interaction-probe.mjs <label> [--runs 6] [--throttle 4]');
  process.exit(1);
}
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : Number(process.argv[i + 1]);
};
const RUNS = argOf('runs', 6);
const THROTTLE = argOf('throttle', 4);
/**
 * Turns played through `__e2e.autoPlay` before anything is measured. §4's premise
 * is ~80 tile `<img>`s on the board, and a board three turns into a round is not
 * carrying them: the rivers are two tiles deep and nobody has melded. Measuring
 * from turn one flatters exactly the cost §4 is about, so the board is loaded
 * first and the tile count is reported beside every number. (Same reason
 * `layout-probe.mjs` drives to melds and deep rivers before it photographs.)
 */
const WARMUP = argOf('warmup', 0);

/** Timestamps the two inputs, ahead of the app, before any page script runs. */
function instrument() {
  const w = window;
  const P = { lastFrameAt: 0, lastPointerUpAt: 0, frames: 0, events: [] };
  w.__perf = P;

  // A `message` listener added inside the constructor is registered before the
  // app can assign `onmessage`, and listeners fire in registration order — so
  // this is when the frame arrived, not when we noticed it.
  const Native = w.WebSocket;
  function Patched(url, protocols) {
    const ws = protocols === undefined ? new Native(url) : new Native(url, protocols);
    ws.addEventListener('message', () => {
      P.frames++;
      P.lastFrameAt = performance.now();
      performance.mark('probe-frame');
    });
    return ws;
  }
  Patched.prototype = Native.prototype;
  for (const k of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Patched[k] = Native[k];
  w.WebSocket = Patched;

  // Capture phase on window, so this runs before the target's own handlers.
  w.addEventListener(
    'pointerup',
    () => {
      P.lastPointerUpAt = performance.now();
      performance.mark('probe-input');
    },
    true,
  );

  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries()) {
        P.events.push({ name: e.name, start: e.startTime, dur: e.duration });
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {
    // A cross-check, not the measurement.
  }
}

/** Armed *before* the gesture: a rAF loop started after it has already lost time. */
function armTap() {
  const P = window.__perf;
  P.tapResult = null;
  P.lastPointerUpAt = 0;
  const deadline = performance.now() + 10_000;
  const lifted = () => document.querySelector('ul.tile-run .is-selected') !== null;
  (function frame() {
    if (P.lastPointerUpAt && lifted()) {
      requestAnimationFrame(() => {
        performance.mark('probe-tap-painted');
        const painted = performance.now();
        P.tapResult = { input: P.lastPointerUpAt, painted, ms: painted - P.lastPointerUpAt };
      });
      return;
    }
    if (performance.now() < deadline) requestAnimationFrame(frame);
    else P.tapResult = { error: 'timeout waiting for the lift to paint' };
  })();
}

function armDraw() {
  const P = window.__perf;
  P.drawResult = null;
  const handCount = () => document.querySelectorAll('ul.tile-run > li').length;
  const myTurn = () => document.querySelector('.hand-your-turn') !== null;
  const from = handCount();
  const startedOnTurn = myTurn();
  const deadline = performance.now() + 60_000;
  (function frame() {
    if (!startedOnTurn && myTurn() && handCount() > from) {
      requestAnimationFrame(() => {
        performance.mark('probe-draw-painted');
        const painted = performance.now();
        P.drawResult = {
          frameAt: P.lastFrameAt,
          painted,
          ms: painted - P.lastFrameAt,
          from,
          to: handCount(),
        };
      });
      return;
    }
    if (performance.now() < deadline) requestAnimationFrame(frame);
    else P.drawResult = { error: 'timeout waiting for a draw' };
  })();
}

function fmt(ms) {
  return typeof ms === 'number' ? `${ms.toFixed(0).padStart(4)}ms` : '   —  ';
}
function stats(values) {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const at = q => v[Math.min(v.length - 1, Math.floor(q * v.length))];
  return { n: v.length, min: v[0], median: at(0.5), p90: at(0.9), max: v[v.length - 1] };
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.addInitScript(instrument);

const cdp = await context.newCDPSession(page);
const traceEvents = [];
cdp.on('Tracing.dataCollected', d => traceEvents.push(...d.value));

await page.goto(BASE);
await page.getByRole('button', { name: /Practice \(vs Bots\)/i }).click();
await page.getByRole('button', { name: /Start Practice/i }).click();
await page.waitForFunction(() => window.__e2e.getPhase() === 'voidDeclare', null, {
  timeout: 30_000,
});
await page.evaluate(() => window.__e2e.voidSubmit());
await page.waitForFunction(() => window.__e2e.getPhase() === 'play', null, { timeout: 30_000 });
// The dice overlay is `pointer-events-none` and play runs on underneath it, so no
// phase or click failure reveals it — the assertion has to be that it is gone. (N25)
await page.waitForFunction(() => document.querySelector('[data-dice-overlay]') === null, null, {
  polling: 100,
  timeout: 30_000,
});

// One structural check, loudly, before any number is taken: every selector below
// has to mean what it did when this was written, in whichever build is loaded.
const shape = await page.evaluate(() => ({
  groups: document.querySelectorAll('ul.tile-run').length,
  tiles: document.querySelectorAll('ul.tile-run > li').length,
}));
if (shape.groups !== 1 || shape.tiles < 10) {
  console.error(`hand markup is not what this probe reads: ${JSON.stringify(shape)}`);
  await browser.close();
  process.exit(1);
}

// The mandatory first-discard flip stands in for a discard on turn 1, and nothing
// is discardable until it is taken. (A35)
const flip = page.getByRole('button', { name: /Flip|翻|Retourner|Voltear|めくる/i });
if (await flip.count())
  await flip
    .first()
    .click()
    .catch(() => {});

// Load the board before measuring anything — unthrottled, since none of this is
// the measurement. `autoPlay` is a no-op unless it is our turn, so this is a poll
// rather than a turn counter.
let warmedTurns = 0;
for (let i = 0; i < WARMUP * 40 && warmedTurns < WARMUP; i++) {
  const phase = await page.evaluate(() => window.__e2e.getPhase());
  if (phase !== 'play') break;
  if (await page.evaluate(() => window.__e2e.autoPlay())) warmedTurns++;
  await page.waitForTimeout(120);
}
const board = await page.evaluate(() => ({
  tiles: document.querySelectorAll('.tile').length,
  images: document.querySelectorAll('.tile img').length,
  melds: document.querySelectorAll('[data-meld-zone] .tile').length,
}));
console.log(
  `board at measurement start: ${board.tiles} tiles (${board.images} img), ` +
    `${board.melds} in melds, after ${warmedTurns}/${WARMUP} warm-up turns`,
);

// Throttle only now: the deal, the void screen and the warm-up are not being
// measured, and at 4× they take four times as long to get through.
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await cdp.send('Tracing.start', {
  transferMode: 'ReportEvents',
  traceConfig: {
    recordMode: 'recordAsMuchAsPossible',
    includedCategories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.frame',
      'blink.user_timing',
    ],
  },
});

const onTurn = () =>
  page.evaluate(() => ({
    myTurn: document.querySelector('.hand-your-turn') !== null,
    hand: document.querySelectorAll('ul.tile-run > li').length,
    phase: window.__e2e.getPhase(),
    screen: window.__e2e.getScreen(),
  }));

/**
 * Leave the turn, by whatever means. `armDraw` measures the *transition* onto
 * your turn, so it has to be armed while you are off it — and a confirming tap
 * that framer read as a drag leaves you on turn with the arm never firing, which
 * is a 60s wait reported as "the round has probably ended". `autoPlay` bypasses
 * the UI (that is what it is for), so it can always get the turn moving again.
 */
async function leaveTurn(deadlineMs = 12_000) {
  const until = Date.now() + deadlineMs;
  let forced = false;
  while (Date.now() < until) {
    const s = await onTurn();
    if (s.phase !== 'play') return { ...s, forced };
    if (!s.myTurn) return { ...s, forced };
    forced = true;
    await page.evaluate(() => window.__e2e.autoPlay());
    await page.waitForTimeout(250);
  }
  return { ...(await onTurn()), forced, stuck: true };
}

const samples = [];
const phaseStart = Date.now();
for (let run = 1; run <= RUNS; run++) {
  const sample = { run };

  const before = await leaveTurn();
  if (before.phase !== 'play') {
    console.error(`run ${run}: phase is ${before.phase} — the round ended, stopping`);
    break;
  }
  if (before.stuck) {
    console.error(`run ${run}: still on turn after forcing — stopping (${JSON.stringify(before)})`);
    break;
  }
  sample.forcedOffTurn = before.forced;

  // ── draw: the server frame that starts your turn → a painted hand ──
  await page.evaluate(armDraw);
  const draw = await page
    .waitForFunction(() => window.__perf.drawResult, null, { timeout: 45_000, polling: 100 })
    .then(h => h.jsonValue())
    .catch(() => ({ error: 'gave up waiting for a turn' }));
  sample.draw = draw;
  if (draw.error) {
    sample.state = await onTurn();
    samples.push(sample);
    console.error(`run ${run}: ${draw.error} — state ${JSON.stringify(sample.state)}`);
    break;
  }

  // ── tap: pointerup → a painted lift ──
  const tile = page.locator('ul li[data-discardable]').first();
  if (!(await tile.count())) {
    sample.tap = { error: 'nothing discardable on this turn' };
    samples.push(sample);
    continue;
  }
  if (await page.locator('ul.tile-run .is-selected').count()) {
    // A tile lifted before the gesture would satisfy the detector on pointerup
    // and report a lift that was already on screen.
    sample.tap = { error: 'a tile was already lifted' };
    samples.push(sample);
    continue;
  }
  await page.evaluate(armTap);
  await tile.click();
  const tap = await page
    .waitForFunction(() => window.__perf.tapResult, null, { timeout: 20_000, polling: 50 })
    .then(h => h.jsonValue())
    .catch(() => ({ error: 'gave up waiting for the lift' }));
  sample.tap = tap;

  // Confirm the discard so the turn passes and the next run gets a fresh draw.
  // Not asserted on: the next run's `leaveTurn` forces the issue either way, and
  // whether the tap discarded is not what is being measured here.
  await tile.click().catch(() => {});
  samples.push(sample);
  console.log(
    `run ${run}: draw ${fmt(draw.ms)}  tap ${fmt(tap.ms)}${tap.error ? ` (${tap.error})` : ''}`,
  );
}
const phaseMs = Date.now() - phaseStart;

const eventTiming = await page.evaluate(() => window.__perf.events);
await cdp.send('Tracing.end');
await new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
await browser.close();

const drawMs = samples.map(s => s.draw?.ms).filter(n => typeof n === 'number');
const tapMs = samples.map(s => s.tap?.ms).filter(n => typeof n === 'number');

// Where the time went. The main thread is the renderer's CrRendererMain; raster
// and image decode land on their own threads, which still costs a phone frames
// but is not the same finding — so the thread is reported, not folded in.
const byThread = new Map();
const names = new Map();
const threadNames = new Map();
for (const e of traceEvents) {
  if (e.name === 'thread_name' && e.args?.name) threadNames.set(`${e.pid}/${e.tid}`, e.args.name);
}
for (const e of traceEvents) {
  if (e.ph !== 'X' || typeof e.dur !== 'number') continue;
  const t = `${e.pid}/${e.tid}`;
  byThread.set(t, (byThread.get(t) ?? 0) + e.dur);
  const cur = names.get(e.name) ?? { us: 0, count: 0, threads: new Set() };
  cur.us += e.dur;
  cur.count++;
  cur.threads.add(t);
  names.set(e.name, cur);
}
const top = [...names.entries()]
  .sort((a, b) => b[1].us - a[1].us)
  .slice(0, 18)
  .map(([name, v]) => ({
    name,
    ms: +(v.us / 1000).toFixed(1),
    count: v.count,
    threads: [...v.threads].map(t => threadNames.get(t) ?? t).join(','),
  }));

console.log(`\n${label} — ${VIEWPORT.width}×${VIEWPORT.height}, ${THROTTLE}× CPU throttle`);
console.log(`measured phase: ${(phaseMs / 1000).toFixed(1)}s, ${samples.length} runs\n`);
console.log('interaction            n    min median    p90    max');
for (const [name, s] of [
  ['draw → painted hand', stats(drawMs)],
  ['tap  → painted lift', stats(tapMs)],
]) {
  if (!s) {
    console.log(`${name.padEnd(20)}  no samples`);
    continue;
  }
  console.log(
    `${name.padEnd(20)} ${String(s.n).padStart(2)} ${fmt(s.min)} ${fmt(s.median)} ${fmt(s.p90)} ${fmt(s.max)}`,
  );
}
const et = stats(eventTiming.filter(e => e.name === 'pointerup').map(e => e.dur));
console.log(
  `\nEvent Timing (pointerup, input→next paint, 8ms buckets): ${
    et ? `n=${et.n} median ${et.median}ms max ${et.max}ms` : 'nothing over its 16ms floor'
  }`,
);

console.log('\nthread busy over the measured phase');
for (const [t, us] of [...byThread.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) {
  console.log(`  ${(threadNames.get(t) ?? t).padEnd(22)} ${(us / 1000).toFixed(0).padStart(6)}ms`);
}
console.log('\ntop trace events by total duration');
for (const r of top) {
  console.log(
    `  ${r.name.padEnd(28)} ${String(r.ms).padStart(8)}ms  ×${String(r.count).padEnd(6)} ${r.threads}`,
  );
}

mkdirSync('test-results/perf', { recursive: true });
const out = {
  label,
  viewport: VIEWPORT,
  throttle: THROTTLE,
  warmup: { requested: WARMUP, played: warmedTurns },
  board,
  phaseMs,
  samples,
  draw: stats(drawMs),
  tap: stats(tapMs),
  eventTiming,
  threads: [...byThread.entries()].map(([t, us]) => ({
    thread: threadNames.get(t) ?? t,
    ms: +(us / 1000).toFixed(1),
  })),
  top,
};
writeFileSync(`test-results/perf/${label}.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote test-results/perf/${label}.json`);
