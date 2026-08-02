/**
 * The WebSocket origin check — something a LAN never needed and a public URL
 * does. See docs/audit-public-deployment.md (H2).
 */

/**
 * Whether a WebSocket upgrade may proceed, given its `Origin` and `Host`.
 *
 * A WebSocket handshake is not subject to the same-origin policy, so without
 * this any page on the internet can open a socket here. That is **not** a
 * session-hijacking hole — seat tokens live in `localStorage`, which is
 * origin-scoped, so a hostile page cannot read one and has no ambient authority
 * to spend. What it is is a rate-limiting hole: per-IP budgets are the whole
 * reason a 4-character code is guess-resistant (C3), and a hostile page spends
 * its *visitors'* addresses rather than its own.
 *
 * Compared on host, deliberately, not on the full origin: behind a proxy the
 * server sees `http` while the browser sees `https`, so matching the scheme
 * would refuse every hosted connection.
 *
 * A **missing** `Origin` is allowed. Non-browser clients (the e2e helpers, curl,
 * a future native client) send none, and they are not the threat this addresses —
 * an attacker who can set headers freely can set `Origin` too. The value is in
 * constraining what a *browser* will do on a hostile page's behalf, and browsers
 * always send it.
 */
export function isAllowedOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || origin === '') return true;
  // An opaque origin — a sandboxed iframe, say — is never this server.
  if (origin === 'null') return false;
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
