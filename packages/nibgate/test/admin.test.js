import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createAdminApi } from '../src/server/admin.js';
import { createMemoryStore } from '../src/server/admin-store.js';

// Express is already a workspace backend dependency; no production SDK dependency.
const require = createRequire(new URL('../../../backend/package.json', import.meta.url));
const express = require('express');
const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  })));
});

async function start(options) {
  const app = express();
  app.use(express.json());
  app.use(createAdminApi(options).router(express));
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return (path = '', options = {}) => fetch(`http://127.0.0.1:${server.address().port}/admin/nibgate${path}`, {
    ...options, signal: AbortSignal.timeout(2000)
  });
}

function asyncStore() {
  const memory = createMemoryStore();
  return Object.fromEntries(Object.entries(memory).map(([method, fn]) => [method, vi.fn(async (...args) => {
    await new Promise((resolve) => setImmediate(resolve));
    return fn(...args);
  })]));
}

const routes = [
  ['', 'GET'], ['/resources', 'GET'], ['/resources/article', 'GET'],
  ['/resources/article', 'POST'], ['/resources/article', 'DELETE']
];

describe('admin Express adapter', () => {
  it.each([['synchronous', createMemoryStore], ['asynchronous', asyncStore]])('completes CRUD with a %s store', async (_label, factory) => {
    const store = factory();
    const request = await start({ store, authorize: async () => true });
    let response = await request('/resources/article', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ price: '2.50', license: 'Test license' })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ ok: true, item: { price: '2.50', license: 'Test license' } });
    response = await request('/resources');
    expect(await response.json()).toMatchObject({ ok: true, items: [{ id: 'article', price: '2.50' }] });
    response = await request('/resources/article');
    expect(await response.json()).toMatchObject({ ok: true, item: { price: '2.50' } });
    response = await request('/resources/article', { method: 'DELETE' });
    expect(await response.json()).toEqual({ ok: true });
    expect(await store.get('article')).toBeNull();
    response = await request('/resources/article');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: 'Not found' });
  });

  it.each([['missing', undefined], ['synchronous denial', () => false], ['asynchronous denial', async () => false]])('denies HTML and every API route with %s authorization', async (_label, authorize) => {
    const store = asyncStore();
    const request = await start({ store, authorize });
    for (const [path, method] of routes) {
      const response = await request(path, { method });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: 'Unauthorized' });
    }
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it('passes the Express request to async authorization and serves authorized HTML', async () => {
    const authorize = vi.fn(async (req) => req.headers['x-test-admin'] === 'yes');
    const request = await start({ store: createMemoryStore(), authorize, title: 'Private content admin' });
    const response = await request('', { headers: { 'x-test-admin': 'yes' } });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Private content admin');
    expect(authorize).toHaveBeenCalledTimes(1);
  });

  it.each(routes)('forwards rejected authorization to Express error middleware for %s %s', async (path, method) => {
    const store = asyncStore();
    const request = await start({ store, authorize: async () => { throw new Error('Authorization unavailable'); } });
    const response = await request(path, { method });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Authorization unavailable' });
    for (const method of Object.values(store)) expect(method).not.toHaveBeenCalled();
  });

  it.each([
    ['list', '/resources', 'GET'], ['get', '/resources/article', 'GET'],
    ['set', '/resources/article', 'POST'], ['remove', '/resources/article', 'DELETE']
  ])('forwards rejected %s operations rather than reporting success', async (operation, path, method) => {
    const store = asyncStore();
    store[operation].mockRejectedValue(new Error('Store unavailable'));
    const request = await start({ store, authorize: () => true });
    const response = await request(path, { method });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Store unavailable' });
  });

  it('preserves Fetch Responses for direct handlers with async stores', async () => {
    const api = createAdminApi({ store: asyncStore(), authorize: async () => true });
    const req = { params: { id: 'article' }, body: { price: '1' } };
    const update = await api.handleUpdate(req);
    expect(update).toBeInstanceOf(Response);
    expect(await update.json()).toMatchObject({ item: { price: '1' } });
    expect(await (await api.handleList(req)).json()).toMatchObject({ items: [{ id: 'article' }] });
    expect(await (await api.handleGet(req)).json()).toMatchObject({ item: { price: '1' } });
    expect(await (await api.handleDelete(req)).json()).toEqual({ ok: true });
    expect((await api.handleGet(req)).status).toBe(404);
  });
});
