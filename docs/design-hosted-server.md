# Design — a hosted server on Render, without giving up self-host

**Status:** proposed, 2026-08-02. Nothing here is built yet.

The ask: friends should be able to play without installing Tailscale. Keep the
self-host path working.

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

### C2. Room codes must be unguessable, not merely random

`lobby.ts` builds a 4-character code from a 32-character alphabet with
`Math.random()`. Two separate problems, and the second is the sharp one:

- **1,048,576 possible codes.** Enumerable by anyone who wants to, especially
  since spectating needs no token (below).
- **`Math.random()` is not unpredictable.** V8's `xorshift128+` state can be
  recovered from a modest run of outputs, and an attacker can create lobbies at
  will to harvest them. That means predicting *other people's future codes*, not
  just guessing at random.

Switch to `crypto.randomInt`. I would **keep the length at 4** — codes get read
aloud across a table, and unpredictability plus rate limiting is the fix that
matters. Six characters (1.07 billion) is the knob if it ever needs turning.

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

### C5. Spectating is unauthenticated, and that was fine until now

`/ws/:code?spectate=1` needs no token by design (§12 item 5). On a tailnet,
"anyone who can reach the server" meant "someone you invited to your network."
On a public URL it means anyone. Combined with a guessable code, that is: watch
strangers' games.

Views are properly redacted — `projectSpectatorView` hides hands, and the A31 /
A40 audits closed the event-log channel — so the exposure is "a stranger can
watch your game", not "a stranger can see your tiles". Still a decision to make
rather than inherit. Options, cheapest first: leave it (it is a mahjong game),
require the host to enable spectating per room, or give spectators a distinct
link containing a second secret.

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
a disk, which turns C8 on and makes both problems go away. **My recommendation is
to ship on free and see whether (2) ever actually happens** — with C8 already
degrading gracefully, upgrading later is a dashboard change and an env var, not a
rewrite.

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
- **At risk without C2–C4:** strangers guessing a code and joining or watching
  your game, and an unauthenticated endpoint that allocates memory without limit.
- **No accounts, no PII, no payment data** — players type a display name and
  nothing else, which is the main reason a public host is reasonable here at all.
  If that ever changes, this section needs revisiting first.

---

## Open questions for the next session

1. **Spectating (C5)** — leave it open, host-toggled, or a separate secret?
2. **Free or Starter** — my recommendation is free until an idle gap actually
   eats a match, but if a lost match would be genuinely irritating, start paid
   and turn C8 on from the beginning.
