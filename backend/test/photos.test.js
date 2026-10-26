import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { photoPrefix } from '../src/photoPaths.js';
import { createPhotoStorage } from '../src/services/cloudinary.js';
import { validateCreateReport } from '../src/validation.js';

const uid = 'guest-photo-test';
const path = `${photoPrefix(uid)}12345678-1234-1234-1234-123456789012`;
const url = `https://res.cloudinary.com/testcloud/image/upload/v123/${path}.jpg`;
const config = {
  corsOrigins: [], lguUids: new Set(), imageAllowedHosts: new Set(['res.cloudinary.com']),
  cloudinaryCloudName: 'testcloud', cloudinaryApiKey: 'test-key', cloudinaryApiSecret: 'server-secret',
};

test('Cloudinary upload signs server-selected fields and does not transmit the API secret', async () => {
  let called = false;
  const storage = createPhotoStorage(config, async (endpoint, options) => {
    called = true;
    assert.equal(endpoint, 'https://api.cloudinary.com/v1_1/testcloud/image/upload');
    const fields = Object.fromEntries(options.body);
    assert.equal(fields.api_key, 'test-key');
    assert.equal(fields.api_secret, undefined);
    assert.ok(fields.public_id.startsWith(photoPrefix(uid)));
    assert.equal(fields.file, 'data:image/jpeg;base64,aGVsbG8=');
    assert.equal(fields.overwrite, 'false');
    const canonical = `format=jpg&overwrite=false&public_id=${fields.public_id}&timestamp=${fields.timestamp}`;
    assert.equal(fields.signature, createHash('sha256').update(canonical + 'server-secret').digest('hex'));
    return { ok: true, json: async () => ({ public_id: fields.public_id, version: 123, secure_url: `https://res.cloudinary.com/testcloud/image/upload/v123/${fields.public_id}.jpg` }) };
  });
  const result = await storage.upload(uid, { mimeType: 'image/jpeg', data: 'aGVsbG8=' });
  assert.ok(called);
  assert.ok(result.path.startsWith(photoPrefix(uid)));
  assert.ok(result.url.endsWith(`${result.path}.jpg`));
});

test('Cloudinary errors never expose upstream credentials or response details', async () => {
  const storage = createPhotoStorage(config, async () => ({ ok: false, json: async () => ({ error: { message: 'server-secret sensitive provider body' } }) }));
  await assert.rejects(storage.upload(uid, { mimeType: 'image/jpeg', data: 'aGVsbG8=' }), error => error.status === 502 && !error.message.includes('server-secret'));
  await assert.rejects(createPhotoStorage({}).upload(uid, { mimeType: 'image/jpeg', data: 'aGVsbG8=' }), error => error.status === 503);
});

test('Cloudinary report URLs must belong to the configured cloud and verified citizen', () => {
  const body = { reporter_uid: uid, image_url: url, ai_category: 'Environment', location: { latitude: 13.6, longitude: 123.1 } };
  assert.equal(validateCreateReport(body, uid, config).image_url, url);
  assert.throws(() => validateCreateReport({ ...body, image_url: url.replace('/testcloud/', '/anothercloud/') }, uid, config), error => error.status === 400);
  assert.throws(() => validateCreateReport({ ...body, image_url: url.replace(photoPrefix(uid), photoPrefix('someone-else')) }, uid, config), error => error.status === 403);
  assert.throws(() => validateCreateReport({ ...body, image_url: `${url}?changed=1` }, uid, config), error => error.status === 400);
});

test('photo routes authenticate guests, reject foreign cleanup, and preserve committed report images', async () => {
  let used = false;
  let removed = 0;
  let uploadedUid;
  const app = createApp({ config, Report: { exists: async () => used },
    verifyToken: async token => ({ uid, firebase: { sign_in_provider: token === 'guest' ? 'anonymous' : 'password' } }),
    analyzeImage: async () => ({}),
    photoStorage: { upload: async owner => { uploadedUid = owner; return { path, url }; }, remove: async () => { removed++; } },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/reports/photo`;
  const request = (method, body, token = 'guest') => fetch(base, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    const image = { image_base64: 'aGVsbG8=', mime_type: 'image/jpeg', reporter_uid: 'forged' };
    assert.equal((await request('POST', image, '')).status, 401);
    assert.equal((await request('POST', image, 'password')).status, 403);
    const response = await request('POST', image);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { path, url });
    assert.equal(uploadedUid, uid);
    assert.equal((await request('POST', { ...image, mime_type: 'image/png' })).status, 400);
    assert.equal((await request('DELETE', { path: path.replace(photoPrefix(uid), photoPrefix('other')) })).status, 403);
    used = true;
    assert.equal((await request('DELETE', { path })).status, 204);
    assert.equal(removed, 0);
    used = false;
    assert.equal((await request('DELETE', { path })).status, 204);
    assert.equal(removed, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
