# Design — a hosted server on Render, without giving up self-host

**Status:** 2026-08-02. **C1–C7, C9 and C10 are built.** C8 stays deliberately off
(free tier, no disk). What is left is the deploy itself — see
[Deploying](#deploying).

The ask: friends should be able to play without installing Tailscale. Keep the
self-host path working.

**Settled since the first draft:** the free tier (see [What the free tier
actually costs you](#what-the-free-tier-actually-costs-you)), and **one security
posture for both deployments** rather than auth that switches on when hosted —
reasoning in [No environment-dependent auth](#no-environment-dependent-auth).

---

## The short answer

Deploy **the whole app** to Render as one Web Service. Not a separate relay — the
server already is the thing you'd deploy, and Render Web Services carry
WebSockets.

The reason this is cheap is one line in the client:

```ts
// packages/client/src/ws/client.ts:100
const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
return `${proto}//${window.location.host}/ws/${code}?token=…`;
```

The client talks to **whatever origin served it**. It has never known a server
address. So the hosted build and the self-hosted build are the same build, and
"keep self-host" costs nothing — a Render deploy and a laptop on your LAN are
both just origins. No `VITE_SERVER_URL`, no CORS, no split origin, no client
change at all.

What is *not* free is that a public URL removes the access control we have been
relying on without saying so. That is the bulk of this document.

---

## Options considered

**A. Deploy the whole app to Render.** One service, HTTP + WS + the SPA, exactly
as `pnpm start` runs it today. Self-host untouched. **Recommended.**

**B. Render as a thin WS relay; game logic stays on the host's machine.** Closest
to the literal ask, and worse on every axis: the host still has to be online and
running the server, there are now two hops instead of one, and a relay protocol
would have to be invented — the WS gateway today speaks game messages against
in-process room state, not opaque frames. It only wins if the goal is that game
state never leaves your machine, which is not the goal here.

**C. Keep Tailscale, add a Cloudflare Tunnel or ngrok in front.** Swaps one
install for another and still needs your machine up.

Go with A.

---

## No environment-dependent auth

The question was whether to gate lobbies and spectators on the hosted build and
leave the Tailscale build open. **No — one hardened path, in both.** Four
reasons, in the order I weight them:

1. **It fails open.** The gate would hang off `--hosted`. Forget the flag on a
   deploy and the public URL gets the *unprotected* variant. A security control
   whose absence is the default of the riskier deployment is backwards; these
   should fail closed.
2. **A control that exists in one deployment is tested in neither.** Local is
   what you develop and play against all day, hosted is what needs the gate. You
   would exercise the unhardened path constantly and the hardened one never.
3. **"Self-host means trusted network" is not actually true.** Self-host also
   covers the binary on a laptop at a café and someone forwarding port 8080 —
   neither of which `--hosted` knows anything about. Tailscale is one self-host
   topology, not all of them.
4. **A login is disproportionate to what is being protected.** There are no
   accounts and no PII; the asset is a mahjong game in progress. Credentials
   would mean storage, reset, and session handling — a real attack surface added
   to defend against a stranger watching you play.

**Instead, make the room code good at the job it already has.** It is a bearer
capability — there are no accounts, so holding the code is what admits you. That
is a legitimate design, it just has to be built like one: unpredictable (C2),
impractical to guess at scale (C3–C4), and **separately held for spectators**
(C5), so sharing the play code does not silently hand out a viewing seat. That
gives capability-based access control that is identical in both deployments, and
it makes the Tailscale build strictly better too, at no cost.

The one thing genuinely worth varying by environment is the **numbers** — rate
limit thresholds, the concurrent-room cap, sweep TTLs. Those protect the
*instance*, not the players. So `--hosted` should tune them, never toggle them.

---

## What has to change

Nine items. None are large; C2–C5 are the ones that exist only because the URL
becomes public.

### C1. Take configuration from the environment

`parseCli` hardcodes `port` to `'8080'`; Render injects `PORT`. Default it to
`process.env.PORT ?? '8080'`.

Add a `--hosted` flag (or `SM_HOSTED=1`) that turns off the things that are
meaningless in a container: the mDNS responder (it binds a multicast socket that
will never be heard), Tailscale detection, the QR code, and the banner line that
tells you to install Tailscale for cross-network play. Tailscale detection is
*cheap* when the binary is absent — three `spawnSync` calls that fail
`ENOENT` immediately, not three 2s timeouts — but it is still shelling out in a
container for an answer that is always "no".

### C2. Room codes must be unguessable, not merely random — ✅ done (2026-08-02)

`lobby.ts` built a 4-character code from a 32-character alphabet with
`Math.random()`. Two separate problems, and the second was the sharp one:

- **1,048,576 possible codes.** Enumerable by anyone who wants to, especially
  since spectating needs no token (below).
- **`Math.random()` is not unpredictable.** V8's `xorshift128+` state can be
  recovered from a modest run of outputs, and an attacker can create lobbies at
  will to harvest them. That meant predicting *other people's future codes*, not
  just guessing at random.

Now `crypto.randomInt`, which is CSPRNG-backed and rejection-samples so it stays
uniform for any alphabet length. **Length stays at 4** — codes get read aloud
across a table, and unpredictability plus rate limiting is the fix that matters.
Six characters (1.07 billion) is the knob if it ever needs turning; `CODE_LENGTH`
is exported so it is one edit.

This was **the only `Math.random()` in the server or the engine**. Seat tokens
were already `randomUUID()`, and the engine's randomness all goes through the
seeded `rng.ts`, which must stay exactly as it is or replays stop being
reproducible.

### C3. Rate limits, and a cap on how much a stranger can allocate

`POST /api/lobby` currently takes no token and has no limit: one script creates
rooms until the instance runs out of memory (Render's free tier gives 512 MB).
Nothing throttles code guessing either.

- `POST /api/lobby` — a handful per hour per IP.
- `GET /api/lobby/:code` and WS join — tens per minute per IP. This is the
  enumeration guard, and it is what lets C2 keep a 4-character code.
- A global ceiling on concurrent lobbies + rooms, refusing politely past it.

### C4. Fastify has to be told it is behind a proxy

Render terminates TLS and forwards. Without `trustProxy`, `req.ip` is the
proxy's address for every request, so every per-IP limit in C3 becomes a single
shared global limit and the first busy player locks everyone out.

**Measured against the live service (2026-08-02): one hop is not enough.**
Render fronts the service with Cloudflare — responses carry `server: cloudflare`
— so there are at least two proxies in the chain, and trusting one lands on an
edge address rather than on the player.

The test that shows it: the hosted join budget is 60/minute, so 60 is the most
any single key may spend. Driven over **one pinned TCP connection** the limiter
cut in at request 71, near enough to 60 for one key. Driven over **~120 parallel
connections** it allowed about 145 before the first 429. If `req.ip` were the
client's address both runs would stop at 60, because both come from one machine.
They don't, so the key varies with the connection — it is the edge node, not the
caller.

Two consequences, neither of them a spoofing hole:

- **Unrelated players behind one edge node share a 60/minute budget.** That is a
  weaker form of exactly what this item exists to prevent.
- **A caller can multiply their own budget** by spreading requests across edge
  nodes. Getting 145 out of a 60 budget took no more than opening more sockets.

What is *not* broken is the property C4 is really about: because this is a hop
count rather than `true`, `req.ip` still comes from infrastructure, and no
header a client writes can move it.

**The fix is `SM_TRUST_PROXY`, and it must be verified rather than guessed** —
over-trusting by one hop starts reading an entry the client controls, which is
the failure `true` would have handed us. The acceptance test is the asymmetry
above collapsing: with the right count, one machine cannot exceed 60 no matter
how many connections it opens.

### C5. Spectating is unauthenticated, and that was fine until now

`/ws/:code?spectate=1` needs no token by design (§12 item 5). On a tailnet,
"anyone who can reach the server" meant "someone you invited to your network."
On a public URL it means anyone. Combined with a guessable code, that is: watch
strangers' games.

Views are properly redacted — `projectSpectatorView` hides hands, and the A31 /
A40 audits closed the event-log channel — so the exposure is "a stranger can
watch your game", not "a stranger can see your tiles".

**Decided: give spectators their own secret**, issued per room and not derivable
from the play code, so the host shares a distinct "watch" link. Not a login — see
[No environment-dependent auth](#no-environment-dependent-auth) — just the same
bearer-capability model applied to the second door, which today has no lock at
all. It also makes the two grants independent: reading the play code aloud stops
implying a viewing seat, and either can be handled separately per room.

### C6. Idle sweeps are tuned for a machine you own

`LOBBY_TTL_MS` is 2h and `ROOM_IDLE_TTL_MS` is 24h. On your own laptop, holding a
dead room for a day costs nothing. On a shared 512 MB instance it is a full day
of every abandoned game. Tighten both when hosted.

### C7. WebSockets need a keepalive, which they have never needed before

There is **no ping/pong anywhere** — not in `ws.ts`, not in `WsClient`. Nothing
on a LAN or a tailnet closes an idle socket, so nothing ever needed one. A
platform proxy will reap an idle connection, and a mahjong turn can easily be
quiet for longer than the timeout while somebody thinks.

The client would survive it — reconnect with backoff and a seat token is exactly
this case — but it would show "Reconnecting…" during every long pause, and
`MAX_RETRIES = 8` means a bad enough stretch gives up. Send WS ping frames
server-side every ~30s.

### C8. Persistence is ephemeral, and that is survivable

`node:sqlite` writes to `SICHUAN_DATA_DIR`. Render's filesystem does not survive
a deploy or a spin-down, so the snapshot/restore path (§12 item 2) will not carry
a match across either.

**This needs no code.** `getDb()` already returns `null` and every caller handles
it — the A17 work that let the Bun binary run without `node:sqlite`. So the
hosted service can run with persistence off and lose only replays and
crash-resume, or mount a Render Disk and point `SICHUAN_DATA_DIR` at it. Same
build; a config decision, deferrable.

### C9. Point Render's health check at `/healthz`

It already exists and returns `{ ok: true }`.

### C10. A public URL is a page a crawler will read — ✅ done (2026-08-02)

On a tailnet there was no one to tell. On a public URL there are three problems,
and only the first is the obvious one.

**`/robots.txt` answered with the SPA.** The not-found handler returns
`index.html` with a **200**, so every crawler asking for robots.txt got HTML that
parses as zero directives. Google reads that as "crawl everything", which is
approximately the intent but arrives by accident — and the same 200 hid the fact
that there was no sitemap either.

**Neither file can be a static asset in `public/`.** Both have to name an
absolute origin — robots.txt in its `Sitemap:` line, sitemap.xml in every `<loc>`
— and **a sitemap whose URLs are not on the origin that served it is discarded**,
not followed. A file baked at build time would be wrong on every deployment but
one, so they are routes, and the origin comes from `RENDER_EXTERNAL_URL` when the
platform set one and from the request otherwise. `Host` is a header the client
wrote, so it is shape-checked before it is echoed into a body.

**`Disallow: /*?` is not tidiness.** Every stateful URL this app produces carries
its state in the query string, and one of them is `?spectate=1&watch=…` — the C5
watch secret. A watch link pasted into anything a crawler reads must not become a
search result. `/j/:code` is disallowed for the weaker reason that it is a door
that expires.

The `og:*` tags and the canonical are the exception that proves the rule: the
crawlers that read them do not run JavaScript, so those are the one place in the
client that names an absolute address, in `index.html` with a comment saying so.

---

## What the free tier actually costs you

Check Render's current docs rather than trusting these numbers, but broadly: free
Web Services **spin down after around 15 minutes with no traffic** and cold-start
in roughly a minute, and get **no persistent disk**.

For this app that means two real things:

1. **The first person to open the link waits about a minute.** Annoying, not
   fatal.
2. **An idle gap mid-match ends the match.** Four people close their tabs to eat
   and come back 20 minutes later to a server that has forgotten the game. An
   open WebSocket counts as traffic and holds the service up, so this only bites
   when everyone genuinely disconnects.

The paid Starter tier (about $7/month at time of writing) stays warm and can take
a disk, which turns C8 on and makes both problems go away.

**Decided: free tier** (2026-08-02). So plan for it rather than around it —
persistence stays off, and C6's sweep TTLs matter more than they would on a warm
instance with room to spare. If (2) ever actually eats a match, upgrading is a
dashboard change plus `SICHUAN_DATA_DIR`, not a rewrite, because C8 already
degrades to `null` on its own.

---

## Deployment shape

`render.yaml` at the repo root, roughly:

```yaml
services:
  - type: web
    name: sichuan-mahjong
    runtime: node
    plan: free
    healthCheckPath: /healthz
    buildCommand: >
      corepack enable &&
      pnpm install --frozen-lockfile &&
      pnpm --filter @sichuan-mahjong/engine build &&
      pnpm --filter @sichuan-mahjong/client build &&
      pnpm --filter sichuan-mahjong build
    startCommand: node packages/server/dist/main.js --hosted
    envVars:
      - key: NODE_VERSION
        value: "22"
```

`--hosted` covers C1; `PORT` arrives in the environment. Note the build runs the
same four commands CLAUDE.md already documents, in the same order, and that the
**engine must build before the client** — the client imports its types.

One deployment note carries over from local: the server snapshots its static
asset list at boot (`@fastify/static`, `wildcard: false`). A Render deploy always
starts a fresh process, so this is automatically fine — but it is the same reason
you restart after a local rebuild.

---

## Self-host keeps working, and gets nothing taken away

Everything above is additive. `pnpm start` on your laptop, the npm package, and
the standalone binaries all behave exactly as they do today: mDNS on, Tailscale
detection on, LAN banner, QR code, SQLite in the OS data dir. The `--hosted`
switch is opt-in and the rest is either a security fix that is good everywhere
(C2, C7) or inert without it.

Tailscale support stays too. It is still the better answer when you want the
game reachable only by people you have invited to a network, which is a real
property that a public URL gives up.

---

## Security summary, since this is the part that changes

Today, Tailscale **is** the authentication. The application has never had any:
a room code plus a seat token, both of which assume the network already
established who is allowed to talk to the server. Publishing to Render removes
that assumption without changing a line of code, which is exactly the kind of
change worth writing down before making.

What that is and is not:

- **Not at risk:** hands, wall, and concealed melds. Redaction is per-viewer in
  `views.ts` across both channels, and A31 and A40 were each a leak found and
  closed on the event-log side.
- **Fixed:** code prediction (C2). Codes are now CSPRNG-drawn, so the remaining
  question is guessing at 1-in-a-million per try, which is C3's job.
- **Still at risk, until C3–C5:** an unauthenticated endpoint that allocates
  memory without limit, unthrottled code guessing, and a spectator door with no
  lock on it.
- **No accounts, no PII, no payment data** — players type a display name and
  nothing else, which is the main reason a public host is reasonable here at all.
  If that ever changes, this section needs revisiting first.

---

## Deploying

`render.yaml` is in the repo root, so Render's Blueprint flow reads everything —
build command, start command, health check, Node version — from it.

1. **New → Blueprint** in the Render dashboard, point it at this repository, and
   approve the plan it shows. Nothing needs configuring by hand; `plan: free` and
   `healthCheckPath: /healthz` are already in the file.
2. **Wait out the first build.** It is a full pnpm install plus three package
   builds, so several minutes.
3. **Open the URL** Render assigns and check the log line
   `Sichuan Mahjong — hosted`. If it says anything else, `--hosted` did not take
   and the service is running with LAN defaults.
4. **Optionally set `SM_PUBLIC_URL`** to the assigned URL, so the boot banner
   prints it. Cosmetic only — the client derives its own origin, and C10's
   `RENDER_EXTERNAL_URL` is already set by the platform.
5. **Point Google at it.** Add the URL as a property in [Search
   Console](https://search.google.com/search-console), verify it with the HTML-tag
   method (a `<meta name="google-site-verification">` line in
   `packages/client/index.html`, next to the other meta), and submit
   `/sitemap.xml`. Then request indexing for `/` once, rather than waiting for a
   crawl to find a site nothing links to.

   If the deployment ever moves off `*.onrender.com`, the canonical and `og:*`
   URLs in `index.html` are the five lines to change — nothing else in the client
   knows an address.

Nothing else is required. In particular **do not** add a disk or
`SICHUAN_DATA_DIR` unless you have moved off the free tier; without a disk,
SQLite would be writing to a filesystem that vanishes on the next deploy.

### What to check once it is live

- Create a game, join it from a phone on cellular data — that is the whole point
  of the exercise, and it is the case Tailscale used to serve.
- Leave a game idle for a few minutes and confirm it does not show
  "Reconnecting…". That is C7 doing its job through Render's proxy, and it is
  the thing most likely to behave differently there than locally.
- Copy the watch link and open it in a private window.
- Confirm the play code alone does **not** admit a spectator.

### What the first deploy actually showed (2026-08-02)

Live at `https://sichuan-mahjong.onrender.com`. The build failed first time on
`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`: pnpm 11 has stopped reading the `pnpm` field
in `package.json`, so it computed an empty override set against a lockfile that
records two, and `--frozen-lockfile` refused. **The error's own advice — reinstall
with `--no-frozen-lockfile` — would have dropped the vite/esbuild CVE pins**; the
overrides moved to `pnpm-workspace.yaml` instead, and `packageManager` now pins
the toolchain so the deploy resolves the pnpm that generated the lockfile. CI
installs frozen too now, since a plain install is what let the mismatch pass here
and fail there.

Confirmed against the running service:

- **`--hosted` took.** The join limiter cuts in around 60/minute, which is the
  hosted number; the local profile's is 600.
- **The spectator door is locked.** With a game actually running, the play code
  alone is refused, a wrong watch token is refused, and only the real one is
  admitted — and both refusals return the same `no_game`, so a bad token cannot
  be told apart from a room that isn't there.
- **The watch secret stays with the host.** `POST /api/lobby` returns it;
  `GET /api/lobby/:code` does not.
- **The client is served whole** — hashed bundle, tile SVGs, manifest and icons
  all with correct MIME types, and deep links like `/j/CODE` falling back to the
  SPA rather than 404ing.
- **C7 holds through the proxy.** A game socket held idle for **300s stayed
  open** — well past the 60s at which a missed pong terminates it, so the
  ping/pong round trip is completing. Note the ping frames are answered at the
  edge and **never reach the browser**, so a client-side "did I see a ping" check
  reads as silence and proves nothing; the socket staying open is the observable.

Open: the `trustProxy` hop count, per [C4](#c4-fastify-has-to-be-told-it-is-behind-a-proxy).

### Still true after deploying

- **A cold start takes about a minute** after ~15 minutes of no traffic, and an
  idle gap with every player disconnected ends the match. Free tier, by choice.
  **Googlebot pays that minute too**, and it gives a page far less than a minute
  before it gives up. Expect indexing to take a few attempts, and read a
  "crawled — currently not indexed" in Search Console as the free tier talking
  rather than as something to fix in the markup.
- **The rate limits are per profile, not per deployment mode.** They are on
  locally too, just looser. If a local suite ever starts seeing 429s, that is the
  thing to remember before reaching for `SM_RATE_LIMIT_OFF`.
