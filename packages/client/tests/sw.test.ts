import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

// The service worker is plain JS shipped as-is from public/, so exercise the
// real file in a stubbed worker global rather than a copy of its logic.
const SW_SOURCE = readFileSync(fileURLToPath(new URL('../public/sw.js', import.meta.url)), 'utf8');

type Handler = (event: FakeEvent) => void;
type FakeEvent = {
  request: FakeRequest;
  waitUntil: (p: Promise<unknown>) => void;
  respondWith: (p: Promise<FakeResponse>) => void;
};
type FakeRequest = { url: string; method: string; mode: string };
type FakeResponse = { body: string; ok: boolean; status: number; clone: () => FakeResponse };

function response(body: string, ok = true, status = 200): FakeResponse {
  const r: FakeResponse = { body, ok, status, clone: () => ({ ...r, clone: r.clone }) };
  return r;
}

function request(url: string, mode = 'no-cors', method = 'GET'): FakeRequest {
  return { url, method, mode };
}

function addOne(store: Map<string, FakeResponse>, key: string): Promise<void> {
  return network(key).then(res => {
    if (!res.ok) throw new Error(`add failed for ${key}`);
    store.set(key, res);
  });
}

/** Minimal CacheStorage: one named cache, keyed by request URL or literal key. */
class FakeCaches {
  readonly stores = new Map<string, Map<string, FakeResponse>>();

  open(name: string) {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    const s = store;
    return Promise.resolve({
      add: (key: string) => addOne(s, key),
      // Atomic, like the real thing: one 404 rejects the whole call and leaves
      // the cache untouched. That is what broke the shipped worker. (F5)
      addAll: (keys: string[]) =>
        Promise.all(keys.map(k => network(k))).then(all => {
          if (all.some(r => !r.ok)) throw new Error('addAll failed');
          keys.forEach((k, i) => s.set(k, all[i]!));
        }),
      put: (key: string | FakeRequest, res: FakeResponse) => {
        s.set(typeof key === 'string' ? key : key.url, res);
        return Promise.resolve();
      },
    });
  }

  keys() {
    return Promise.resolve([...this.stores.keys()]);
  }

  delete(name: string) {
    return Promise.resolve(this.stores.delete(name));
  }

  match(key: string | FakeRequest) {
    const k = typeof key === 'string' ? key : key.url;
    for (const store of this.stores.values()) {
      const hit = store.get(k);
      if (hit) return Promise.resolve(hit);
    }
    return Promise.resolve(undefined);
  }
}

/** Stands in for the origin server. `offline` makes every request reject. */
let offline = false;
let served: Record<string, FakeResponse> = {};
function network(target: string | FakeRequest): Promise<FakeResponse> {
  const url = typeof target === 'string' ? target : target.url;
  if (offline) return Promise.reject(new Error('offline'));
  const path = url.startsWith('http') ? new URL(url).pathname : url;
  return Promise.resolve(served[path] ?? response('not found', false, 404));
}

let handlers: Record<string, Handler>;
let caches: FakeCaches;

function loadWorker() {
  handlers = {};
  caches = new FakeCaches();
  const self = {
    addEventListener: (type: string, fn: Handler) => {
      handlers[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const sandbox = {
    self,
    caches,
    location: { origin: 'https://host.example' },
    fetch: network,
    URL,
    Response: class {
      body: string;
      status: number;
      ok: boolean;
      constructor(body: string, init?: { status?: number }) {
        this.body = body;
        this.status = init?.status ?? 200;
        this.ok = this.status < 400;
      }
    },
  };
  vm.runInNewContext(SW_SOURCE, sandbox);
}

/** Drive a handler and resolve whatever it passed to respondWith/waitUntil. */
function dispatch(type: string, req: FakeRequest): Promise<FakeResponse | undefined> {
  let result: Promise<FakeResponse> | undefined;
  const pending: Promise<unknown>[] = [];
  handlers[type]?.({
    request: req,
    respondWith: p => {
      result = p;
    },
    waitUntil: p => void pending.push(p),
  });
  return Promise.all(pending).then(() => result);
}

beforeEach(() => {
  offline = false;
  served = {
    '/': response('<!doctype html>shell'),
    '/assets/index-abc123.js': response('bundle'),
  };
  loadWorker();
});

describe('service worker (F5)', () => {
  it('precaches the shell — and nothing that only exists in dev', async () => {
    await dispatch('install', request('https://host.example/'));

    const store = [...caches.stores.values()][0];
    expect([...(store?.keys() ?? [])]).toEqual(['/']);
  });

  it('serves the cached shell when a navigation fails offline', async () => {
    await dispatch('install', request('https://host.example/'));

    offline = true;
    const res = await dispatch('fetch', request('https://host.example/', 'navigate'));

    // Before F5 the cache was empty, so this always fell through to the 503.
    expect(res?.status).toBe(200);
    expect(res?.body).toBe('<!doctype html>shell');
  });

  it('runtime-caches hashed build assets and serves them offline', async () => {
    const asset = request('https://host.example/assets/index-abc123.js');
    expect((await dispatch('fetch', asset))?.body).toBe('bundle');

    offline = true;
    expect((await dispatch('fetch', asset))?.body).toBe('bundle');
  });

  it('leaves API traffic alone', async () => {
    const res = await dispatch('fetch', request('https://host.example/api/lobby/ABCD'));
    expect(res).toBeUndefined();
  });
});
