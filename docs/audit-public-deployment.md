# Audit — what a public URL exposes that a LAN never did (2026-08-02)

Run against the live service at `https://sichuan-mahjong.onrender.com` after the
C1–C7/C9/C10 work landed. Every finding below was **reproduced against the running
deployment**, not inferred from reading the code; the commands are noted so they
can be re-run.

The C-series closed the doors a public URL opens *deliberately* — guessable codes,
unauthenticated lobby creation, spoofable per-IP limits, an unlocked spectator
door. This pass looks for what it did not think to close. Five findings, one of
which matters today.

---

## H1. A WebSocket frame is unbounded, and it is buffered before any validation

**Confirmed live.** An 8 MB single frame was accepted and the socket stayed open.

`server.ts` registers the plugin with no options:

```ts
await app.register(fastifyWebsocket);
```

`ws` defaults `maxPayload` to **100 MB**. Render's free tier is a 512 MB
instance, so a handful of concurrent large frames is an out-of-memory kill of
every in-progress game.

**The part that makes this sharp:** the frame is fully buffered by `ws` *before*
the message handler runs, so all the validation in `ws.ts` — which is careful, and
is the thing "the WS boundary trusts nothing" refers to — is downstream of the
vector and cannot help. The largest legitimate client message is a `join` carrying
a name already capped at 24 characters: a few hundred bytes.

The per-IP open limit (`allowJoin`, 60/min hosted) caps how fast sockets are
opened, not how much a single opened socket may send.

**Fix.** One line, and 64 KB is ~100× the largest real message:

```ts
await app.register(fastifyWebsocket, { options: { maxPayload: 64 * 1024 } });
```

A frame over the limit closes the socket with 1009, which the client's existing
reconnect path already handles.

---

## H2. The WebSocket upgrade does not check `Origin`

**Confirmed live.** A handshake sent with `Origin: https://evil.example` was
accepted.

**This is not session hijacking, and it is worth being precise about why.** The
classic cross-site WebSocket hijacking attack works because cookies are attached
to the upgrade automatically. This app has no cookies: the seat token lives in
`localStorage` (`session.ts`), which is origin-scoped, so a hostile page cannot
read it and cannot ride the user's session. That is a real property of the design,
not luck.

**The actual exposure is the rate limiter.** Every guess-resistance property of a
4-character code rests on `allowJoin` being per-IP (C3, and the stated reason the
code can stay 4 long). A hostile page — or any page with an injected script —
turns each of its visitors into a distinct source IP opening sockets on the
attacker's behalf. The enumeration budget then scales with the attacker's
audience rather than with their own address, which is the one assumption the
4-character code depends on.

**Fix.** Compare `Origin` against the host that served the request and refuse a
mismatch. It must be derived per request, not a fixed allow-list — this build runs
on a LAN IP, a tailnet name and a public URL, which is the same constraint that
made `robots.txt` a route rather than a file (C10, `seo.ts`). A missing `Origin`
(native clients, curl) should stay allowed, or self-host tooling breaks.

---

## M1. No security headers at all

**Confirmed live** — neither `/` nor `/healthz` returns any of:

| Header | Why it matters *here* |
|---|---|
| `Referrer-Policy` | **The one that matters.** The watch secret rides in a query string (`?watch=…`). Any cross-origin navigation from a loaded watch link puts the full URL in a `Referer` header. |
| `X-Content-Type-Options: nosniff` | Cheap; stops MIME sniffing on the tile SVGs and JSON. |
| `Content-Security-Policy` | The client loads nothing external — the build is deliberately self-contained — so a strict policy is unusually easy here. |
| `frame-ancestors` / `X-Frame-Options` | Clickjacking. Low impact (no destructive one-click action) but free. |

`Landing.tsx` already scrubs the token from the address bar with
`history.replaceState`, which limits the window — but that runs after the document
has a URL, and it does not govern what a later navigation sends.

`Referrer-Policy: no-referrer` is the single highest-value line, because it
protects the one genuine secret the app puts in a URL.

---

## M2. `/api/replay/:id` is ungated, unlimited, and sequentially numbered

Today it returns `{"error":"not_found"}` for every id — **confirmed live** — but
only because the free tier has no disk, so `getDb()` returns null and `getGame()`
short-circuits. The route itself has no token check and, alone among every entry
point, **no rate limit**:

```ts
app.get('/api/replay/:id', async (req, reply) => {
  const id = Number.parseInt(req.params.id, 10);
  ...
  return reply.send({ id, code, seed, config, startedAt, endedAt, actionLog, results });
});
```

`design-hosted-server.md` documents mounting a disk and setting
`SICHUAN_DATA_DIR` as the way to turn persistence back on. **The day someone does
that, this becomes: walk the integers, read every completed game's full action
log, seed and room code.** It is a landmine rather than a live bug, which is
exactly the kind that gets stepped on later.

**Fix now, while it is free:** put `allowJoin` on it so it matches the posture of
every other route, and add a note that it needs an ownership check *before*
persistence is enabled.

---

## L1. Spectator sockets are uncapped per room

`room.ts` holds spectators in an unbounded `Set`, and every state change
broadcasts to all of them. A leaked watch link is therefore also a broadcast
amplifier — N sockets multiply the server's per-move write cost. Rate-limited on
open, but with no ceiling on how many are held. Low priority; worth a cap if
spectating ever gets used in anger.

---

## What is already right

Worth recording so it does not get "fixed" away later:

- **`logger: false`** (`server.ts`) keeps request URLs out of the logs — and both
  the seat token and the watch secret travel in query strings. Render surfaces
  service logs in its dashboard, so a default-on request logger would have written
  every bearer secret into a web console. This is currently accidental; it is now
  load-bearing.
- **No source maps ship** — `dist/assets/*.map` does not exist and the live server
  404s the path.
- **Errors are clean JSON.** Malformed input (`/api/replay/abc`) returns
  `{"error":"invalid_id"}`, no stack, no framework banner. Fastify sets no
  `X-Powered-By`.
- **Names are bounded and escaped** — trimmed, defaulted, `.slice(0, 24)` in
  `ws.ts`, and rendered through React.
- **Tokens are in `localStorage`, not cookies**, which is what makes H2 a
  rate-limit problem instead of an account-takeover one.
- **`/j/:code` cannot be an open redirect** — the target is always the literal
  `/?code=…`, so a crafted code cannot escape the origin.

---

## Order to fix

1. **H1** — one line, real today, biggest blast radius (OOM kills every live game).
2. **M2** — one line now; a data breach later if persistence is enabled first.
3. **M1** — `Referrer-Policy` first, the rest are cheap to add alongside.
4. **H2** — needs per-request origin derivation, so it is the one that wants care.
5. **L1** — only if spectating gets real use.
