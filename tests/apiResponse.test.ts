import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { readJsonResponse } from '../src/lib/jsonResponse.ts';
import { apiErrorHandler, apiNotFound } from '../src/server/apiBoundary.ts';

test('API response reader handles valid data and preserves server validation messages', async () => {
  assert.deepEqual(await readJsonResponse(Response.json({ required: true })), { required: true });
  assert.deepEqual(await readJsonResponse(Response.json([])), []);
  await assert.rejects(readJsonResponse(Response.json({ error: 'Setor ou senha inválidos.' }, { status: 401 })), /Setor ou senha inválidos/);
});

test('HTML from a stale server and malformed JSON produce useful errors', async () => {
  await assert.rejects(readJsonResponse(new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html' } })), /Reinicie o servidor com npm run dev/);
  await assert.rejects(readJsonResponse(new Response('invalid', { headers: { 'Content-Type': 'application/json' } })), /dados inválidos/);
});

test('unknown API routes and malformed requests cannot fall through to the HTML page', async () => {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.use('/api', apiNotFound);
  app.use('/api', apiErrorHandler);
  app.use((_req, res) => { res.type('html').send('<!doctype html><html>app</html>'); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const unknown = await fetch(base + '/api/unknown');
    assert.equal(unknown.status, 404); assert.match(unknown.headers.get('content-type')!, /application\/json/);
    assert.equal(unknown.headers.get('cache-control'), 'no-store');
    assert.match((await unknown.json()).error, /Rota da API/);
    const malformed = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(malformed.status, 400); assert.match((await malformed.json()).error, /JSON válido/);
    assert.equal((await fetch(base + '/inventory')).headers.get('content-type'), 'text/html; charset=utf-8');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
