import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// node:sqlite is a native built-in; Vite 5 can't bundle it — mock before any imports touch it
vi.mock('../src/persistence.js', () => ({
  saveGameWithCode: vi.fn(),
  getGame: vi.fn().mockReturnValue(null),
  saveLiveRoom: vi.fn(),
  loadLiveRooms: vi.fn().mockReturnValue([]),
  deleteLiveRoom: vi.fn(),
}));
import Fastify from 'fastify';
import { isSpaRoute, registerHttpRoutes } from '../src/http.js';
import { originFor, robotsTxt } from '../src/seo.js';

async function buildApp() {
  const app = Fastify({ logger: false });
  await registerHttpRoutes(app);
  return app;
}

describe('crawler surface', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    // Neither is set in CI, but a dev machine that has deployed might have one.
    vi.stubEnv('SM_PUBLIC_URL', undefined);
    vi.stubEnv('RENDER_EXTERNAL_URL', undefined);
    app = await buildApp();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  it('GET /robots.txt is plain text, not the SPA fallback', async () => {
    const res = await app.inject({ method: 'GET', url: '/robots.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.body).not.toContain('<!DOCTYPE html>');
  });

  it('robots.txt allows the landing page and closes every stateful URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/robots.txt',
      headers: { host: 'sichuan-mahjong.onrender.com' },
    });
    expect(res.body).toContain('User-agent: *');
    expect(res.body).toContain('Allow: /$');
    expect(res.body).toContain('Disallow: /api/');
    expect(res.body).toContain('Disallow: /j/');
    // The watch secret rides in the query string — it must never be indexed.
    expect(res.body).toContain('Disallow: /*?');
    expect(res.body).toContain('Sitemap: http://sichuan-mahjong.onrender.com/sitemap.xml');
  });

  it('GET /sitemap.xml lists the landing page on the origin that served it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sitemap.xml',
      headers: { host: 'mahjong.local:8080' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.body).toContain('<loc>http://mahjong.local:8080/</loc>');
  });

  it('the platform URL wins over the Host header when one is set', async () => {
    vi.stubEnv('RENDER_EXTERNAL_URL', 'https://sichuan-mahjong.onrender.com/');
    const res = await app.inject({
      method: 'GET',
      url: '/sitemap.xml',
      headers: { host: 'evil.example' },
    });
    expect(res.body).toContain('<loc>https://sichuan-mahjong.onrender.com/</loc>');
    expect(res.body).not.toContain('evil.example');
  });

  it('a Host header that is not a host shape yields no origin', () => {
    expect(originFor({ protocol: 'http', host: 'good.example:8080' })).toBe(
      'http://good.example:8080',
    );
    expect(originFor({ protocol: 'http', host: 'bad host/../x' })).toBeNull();
    expect(originFor({ protocol: 'http', host: '' })).toBeNull();
  });

  it('robots.txt still stands without an origin — only the Sitemap line goes', () => {
    const txt = robotsTxt(null);
    expect(txt).toContain('Disallow: /api/');
    expect(txt).not.toContain('Sitemap:');
  });
});

// The SPA fallback answering everything with 200 + HTML is what stops Google's
// HTML-file verification working: it fetches a filename it knows is absent and
// reads a success as "this server cannot tell me no". Same reason a stale
// bundle used to surface as a parse error rather than a 404.
describe('the SPA fallback distinguishes a route from a missing file', () => {
  it('treats the client routes as routes', () => {
    expect(isSpaRoute('/')).toBe(true);
    expect(isSpaRoute('/j/AB23')).toBe(true);
    expect(isSpaRoute('/?code=AB23&spectate=1')).toBe(true);
  });

  it('treats anything with an extension, and any /api/ path, as missing', () => {
    expect(isSpaRoute('/google1a2b3c4d5e6f.html')).toBe(false);
    expect(isSpaRoute('/assets/index-OLD.js')).toBe(false);
    expect(isSpaRoute('/favicon.ico?v=2')).toBe(false);
    expect(isSpaRoute('/api/nope')).toBe(false);
  });

  it('serves a 404 for a file that is not there', async () => {
    const app = Fastify({ logger: false });
    await registerHttpRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/googleabc123.html' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('<!DOCTYPE html>');
    await app.close();
  });
});
