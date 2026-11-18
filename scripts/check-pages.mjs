import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const base = process.env.VITE_BASE_PATH || '/Sistema-De-gestao/';
const directory = path.resolve('dist');
const manifest = JSON.parse(readFileSync(path.join(directory, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.scope, base); assert.equal(manifest.start_url, base);
const html = readFileSync(path.join(directory, 'index.html'), 'utf8');
assert.ok(html.includes(`${base}manifest.webmanifest`));
const worker = readFileSync(path.join(directory, 'sw.js'), 'utf8');
const assets = JSON.parse(worker.match(/const ASSETS = (\[[^;]+\]);/)[1]);
assert.equal(assets[0], base);
for (const asset of assets) {
  assert.ok(asset.startsWith(base), asset);
  const file = asset === base ? 'index.html' : asset.slice(base.length);
  const resolved = path.resolve(directory, file);
  assert.ok(resolved.startsWith(directory + path.sep), file);
  assert.ok(existsSync(resolved), asset);
}
assert.ok(assets.some((asset) => asset.endsWith('.wasm')));
assert.ok(assets.some((asset) => asset.endsWith('.data')));
assert.ok(existsSync(path.join(directory, '404.html')));
console.log(`Pages check passed: ${assets.length} static/offline resources, browser database and correct repository paths.`);
