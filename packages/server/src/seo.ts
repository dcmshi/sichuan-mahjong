import type { FastifyRequest } from 'fastify';
import { publicUrl } from './cli.js';

/**
 * robots.txt and sitemap.xml, which are the two files a crawler looks for and
 * the two things this server has never been able to state: both need an
 * absolute origin, and a sitemap whose URLs are not on the origin that served
 * it is discarded rather than followed. So the origin is derived per request
 * the same way the client derives its socket URL.
 */

/** Letters, digits, dots and hyphens, with an optional port. Nothing else. */
const HOST_RE = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

/**
 * The absolute origin to write into robots.txt and sitemap.xml.
 *
 * The platform's own value wins when there is one — Render sets
 * RENDER_EXTERNAL_URL without being asked, so the hosted deployment names
 * itself correctly with no configuration. Otherwise it comes from the request,
 * where `Host` is a header the client wrote: it is checked against a host shape
 * before being echoed back inside a response body.
 */
export function originFor(req: Pick<FastifyRequest, 'protocol' | 'host'>): string | null {
  const configured = publicUrl();
  if (configured) return configured.replace(/\/+$/, '');

  const host = req.host ?? '';
  if (!HOST_RE.test(host)) return null;
  return `${req.protocol}://${host}`;
}

/**
 * What a crawler may have.
 *
 * Only the landing screen is a page. `/j/:code` is a room-specific door that
 * expires, and every other URL this app produces carries its state in the query
 * string — including the spectator link, which holds the watch secret (C5).
 * `Disallow: /*?` is therefore load-bearing and not a duplicate-content tidy-up:
 * a watch link pasted anywhere public must not become a search result.
 */
export function robotsTxt(origin: string | null): string {
  const lines = [
    'User-agent: *',
    'Allow: /$',
    'Disallow: /api/',
    'Disallow: /j/',
    'Disallow: /healthz',
    'Disallow: /*?',
  ];
  if (origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
  return `${lines.join('\n')}\n`;
}

/** One page, stated honestly. No lastmod: a made-up one is worse than none. */
export function sitemapXml(origin: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
  </url>
</urlset>
`;
}
