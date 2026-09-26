import test from 'node:test';
import assert from 'node:assert/strict';
import { contracts, endpoints, normalizeBaseUrl, pickPayload } from '../src/services/contracts.js';
import { loadState, saveState } from '../src/utils/storage.js';

test('exactly 35 unique existing controller routes, with correct update suffixes', () => {
  assert.equal(endpoints.length, 35);
  assert.equal(new Set(endpoints.map((e) => `${e.method} ${e.path}`)).size, 35);
  assert.equal(
    endpoints.find((e) => e.resource === 'orders' && e.method === 'PUT').path,
    '/api/orders/{id}/status',
  );
  assert.equal(
    endpoints.find((e) => e.resource === 'try-on-sessions' && e.method === 'PUT').path,
    '/api/try-on-sessions/{id}/result',
  );
});
test('DTO boundaries strip forbidden frontend fields from every resource', () => {
  const data = {
    ...Object.assign({}, ...Object.values(contracts).map((c) => c.create)),
    id: 'LOCAL-1',
    resultImageUrl: 'https://example.com/result.png',
    items: [{ productId: 1 }],
    moderationStatus: 'ACTIVE',
    fakeField: true,
  };
  for (const resource of Object.keys(contracts))
    for (const action of ['create', 'update']) {
      const payload = pickPayload(resource, action, data);
      const allowed =
        action === 'create' ? Object.keys(contracts[resource].create) : contracts[resource].update;
      assert.deepEqual(
        Object.keys(payload).sort(),
        allowed.filter((k) => data[k] !== undefined).sort(),
      );
    }
  assert.equal(pickPayload('users', 'update', data).password, undefined);
  assert.equal(pickPayload('products', 'create', data).tryOnType, undefined);
  assert.equal(pickPayload('try-on-sessions', 'create', data).resultImageUrl, undefined);
  assert.equal(pickPayload('orders', 'create', data).items, undefined);
});
test('backend origins never duplicate /api', () => {
  for (const base of [
    '',
    'http://localhost:8080',
    'http://localhost:8080/',
    'http://localhost:8080/api',
    'http://localhost:8080/api/',
  ]) {
    const url = `${normalizeBaseUrl(base)}/api/products`;
    assert.ok(!url.includes('/api/api/'));
    assert.ok(url.endsWith('/api/products'));
  }
});
test('storage strips passwords and binary or temporary image URLs', () => {
  let saved;
  globalThis.localStorage = {
    setItem: (_, value) => {
      saved = value;
    },
    getItem: () => saved,
  };
  const state = {
    sessions: [
      {
        inputImageUrl: 'blob:private-photo',
        resultImageUrl: 'data:image/png;base64,not-storable',
        tryOnType: 'JEWELRY',
      },
    ],
    users: [{ fullName: 'Demo', password: 'never-persist' }],
    cart: [{ productId: 1, quantity: 2 }],
  };
  assert.equal(saveState(state), true);
  assert.ok(!saved.includes('never-persist'));
  assert.ok(!saved.includes('data:image'));
  assert.ok(!saved.includes('blob:'));
  const loaded = loadState({ sessions: [], users: [], cart: [] });
  assert.equal(loaded.cart[0].quantity, 2);
  assert.equal(loaded.sessions[0].inputImageUrl, '');
});
test('storage corruption and quota errors fail gracefully', () => {
  globalThis.localStorage = {
    getItem: () => '{broken',
    setItem: () => {
      throw new Error('Quota exceeded');
    },
  };
  const seed = { products: [{ id: 1 }] };
  assert.equal(loadState(seed), seed);
  assert.equal(saveState(seed), false);
});
