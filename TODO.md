# TODO

What is actually open. Everything closed — the phase log, the six audit passes
(A1–A40), the frontend pass (F1–F25), the viewport work (R1–R7), the tile
rendering change, the hosting work — is in
[docs/history.md](./docs/history.md), newest first, each entry with the diagnosis
that made it worth writing down.

Deferrals are also recorded as O1–O4 in
[ARCHITECTURE.md §12](./ARCHITECTURE.md#12-open-questions--explicit-deferrals).

---

## Open

- [ ] **O3 — a central discard pool.** Show every discard in the middle, mark the
  last one, and show each player's void suit.

  **The redaction question it needed is answered and shipped.**
  `PublicPlayer.firstDiscardIsVoid` says whether a seat's `discards[0]` is the
  tile they declared, and is false until that seat flips it — which is when a
  real table learns it, and is the deliberate reveal A40 said this needed rather
  than a field that happens to be on the wire. The PDF edge case falls out of the
  same derivation: a player may declare a suit they hold none of, a card indicator
  stands in, and no tile ever reveals it (`usedIndicator`).

  What is left is the layout, and it got *harder* rather than easier. The middle
  of the well now holds the wall diagram, the last discard and the history
  control, so the empty space that motivated a central pool is gone. Each seat's
  declaration is already drawn above their own pile. **Still a fallback; the
  per-seat trays are staying.**

- [ ] **Settle the `trustProxy` hop count.** It is live and deployed at one hop,
  but Render fronts the service with Cloudflare, so one hop resolves `req.ip` to
  an edge address rather than to the player. Measured on the running service: the
  60/minute join budget cuts in at ~71 requests over a single connection but only
  at ~145 spread across many, which cannot happen if the key is the caller.

  **Not a spoofing hole** — a hop count still takes the address from
  infrastructure, which is the whole reason it isn't `true`. What it costs is
  granularity: strangers behind one edge node share a budget, and anyone can
  widen their own by opening more sockets.

  Fix is `SM_TRUST_PROXY` in the Render environment, but the count has to be
  *verified* — one too many starts trusting an entry the client wrote. Acceptance
  test and full reasoning in
  [docs/design-hosted-server.md §C4](./docs/design-hosted-server.md#c4-fastify-has-to-be-told-it-is-behind-a-proxy).

---

## Shelved, with reasons

- **A real landscape layout for phones** (R4 Phase 2). Reasons recorded in
  [docs/viewport-audit.md](./docs/viewport-audit.md); landscape shows a
  rotate-to-portrait prompt during play instead.
