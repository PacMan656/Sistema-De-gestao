import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker(networkAvailable = true) {
  const listeners = new Map<string, (event: any) => void>();
  const assets = ['/', '/offline.html', '/assets/app.js'];
  const stored = new Map<string, Response>([['/', new Response('offline app')], ['/assets/app.js', new Response('cached script')]]);
  const removed: string[] = [];
  let precached: string[] = [];
  const source = readFileSync(new URL('../pwa/service-worker.js', import.meta.url), 'utf8').replace('__BUILD_VERSION__', 'test').replace('__PRECACHE_ASSETS__', JSON.stringify(assets));
  runInNewContext(source, {
    self: { location: { origin: 'https://patriti.test' }, clients: { claim: async () => {} }, skipWaiting: () => {}, addEventListener: (name: string, listener: any) => listeners.set(name, listener) },
    URL,
    caches: { open: async () => ({ addAll: async (urls: string[]) => { precached = Array.from(urls); } }), match: async (key: string) => stored.get(key), keys: async () => ['patriti-static-test', 'patriti-static-old', 'other-app-cache'], delete: async (key: string) => { removed.push(key); } },
    fetch: async () => { if (!networkAvailable) throw new Error('offline'); return new Response('network'); },
  });
  async function fetchRequest(path: string, mode = 'cors', method = 'GET', authenticated = false) {
    let result: Promise<Response> | undefined;
    listeners.get('fetch')!({ request: { method, mode, url: `https://patriti.test${path}`, headers: new Headers(authenticated ? { Authorization: 'Bearer private' } : {}) }, respondWith: (response: Promise<Response>) => { result = response; } });
    return result ? (await result).text() : undefined;
  }
  return { listeners, fetchRequest, removed, precached: () => precached };
}

test('PWA caches static files and supplies offline navigation without caching private data', async () => {
  const sw = worker(false);
  let install: Promise<void> | undefined;
  sw.listeners.get('install')!({ waitUntil: (promise: Promise<void>) => { install = promise; } });
  await install;
  assert.deepEqual(sw.precached(), ['/', '/offline.html', '/assets/app.js']);
  assert.equal(await sw.fetchRequest('/inventory', 'navigate'), 'offline app');
  assert.equal(await sw.fetchRequest('/assets/app.js'), 'cached script');
  assert.equal(await sw.fetchRequest('/api/auth/session'), undefined);
  assert.equal(await sw.fetchRequest('/api/movements/1/term-pdf'), undefined);
  assert.equal(await sw.fetchRequest('/assets/app.js', 'cors', 'GET', true), undefined);
  assert.equal(await sw.fetchRequest('/api/users', 'cors', 'POST'), undefined);
  assert.equal(await sw.fetchRequest('/socket.io/'), undefined);
  assert.equal(await sw.fetchRequest('/private.pdf'), undefined);
  let activated: Promise<void> | undefined;
  sw.listeners.get('activate')!({ waitUntil: (promise: Promise<void>) => { activated = promise; } });
  await activated;
  assert.deepEqual(sw.removed, ['patriti-static-old']);
});

test('PWA uses live navigation online and provides installable metadata and icons', async () => {
  assert.equal(await worker().fetchRequest('/', 'navigate'), 'network');
  const manifest = JSON.parse(readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.start_url, '/');
  for (const icon of manifest.icons) {
    const bytes = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    const size = Number(icon.sizes.split('x')[0]);
    assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size);
  }
});
