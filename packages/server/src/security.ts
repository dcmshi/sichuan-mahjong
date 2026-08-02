import type { FastifyInstance } from 'fastify';

/**
 * Response headers and the WebSocket origin check — the two things a LAN never
 * needed and a public URL does. See docs/audit-public-deployment.md (M1, H2).
 */

/**
 * The policy. Two entries are doing real work here and the rest are hygiene:
 *
 * - **`referrer-policy: no-referrer`** is the one that matters. The spectator
 *   watch secret rides in a query string (C5), so any cross-origin navigation
 *   from a loaded watch link would otherwise put the whole URL — secret included
 *   — into a `Referer` header. The client scrubs the address bar on arrival,
 *   which narrows the window but does not govern a later navigation.
 * - **`frame-ancestors 'none'`** in the CSP, with `x-frame-options` alongside for
 *   anything that still only understands the older header.
 *
 * `script-src` has to carry `'unsafe-inline'`: `index.html` registers the service
 * worker from an inline block, and a hash would silently break the page the next
 * time that block is edited. **So this CSP does not stop inline injection** — what
 * it stops is loading script, style, or an image from anywhere but this origin,
 * which is the escalation path that turns a bug into exfiltration. `style-src`
 * needs it too, because Framer Motion animates through inline style attributes.
 *
 * `connect-src 'self'` covers the WebSocket: same-origin `ws:`/`wss:` matches
 * `'self'`, so the socket needs no scheme of its own here.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

/** HSTS is only meaningful — and is only honoured — over HTTPS. */
export const HSTS_HEADER = 'max-age=31536000';

export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (req, reply) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    if (req.protocol === 'https') reply.header('strict-transport-security', HSTS_HEADER);
  });
}

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
