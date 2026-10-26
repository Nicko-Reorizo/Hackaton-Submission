import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

const id = '507f1f77bcf86cd799439011';
const citizen = { uid: 'guest-123', firebase: { sign_in_provider: 'anonymous' } };
const official = { uid: 'official-123', firebase: { sign_in_provider: 'password' }, lgu: true };
const config = { corsOrigins: ['http://localhost:5173'], lguUids: new Set(['allowlisted-official']), imageAllowedHosts: new Set(['firebasestorage.googleapis.com']), firebaseStorageBucket: 'test.firebasestorage.app' };
const payload = {
  reporter_uid: citizen.uid,
  image_url: 'https://firebasestorage.googleapis.com/v0/b/test.firebasestorage.app/o/reports%2Fguest-123%2Fphoto.jpg?alt=media&token=test',
  ai_category: 'Public Infrastructure',
  location: { latitude: 13.6248, longitude: 123.1874 },
};
let server;
let base;
let lastCreated;
let lastFilter;
let lastSort;
let lastUpdate;
let missingReport = false;
let duplicateOnCreate = false;
let lastExistingFilter;
const Report = {
  async create(value) {
    if (duplicateOnCreate) throw Object.assign(new Error('duplicate key'), { code: 11000 });
    lastCreated = value;
    return { ...value, _id: id, status: 'Pending' };
  },
  async findOne(filter) { lastExistingFilter = filter; return { ...payload, _id: id, status: 'Acknowledged', lgu_notes: 'Already assigned' }; },
  find(filter) {
    lastFilter = filter;
    return { sort(sort) { lastSort = sort; return { async lean() { return [{ ...payload, _id: id, status: 'Pending' }]; } }; } };
  },
  async findByIdAndUpdate(reportId, update, options) {
    lastUpdate = { reportId, update, options };
    return missingReport ? null : { ...payload, _id: reportId, ...update.$set };
  },
};

before(async () => {
  const app = createApp({
    config,
    Report,
    verifyToken: async (token) => {
      if (token === 'citizen') return citizen;
      if (token === 'official') return official;
      if (token === 'allowlisted') return { uid: 'allowlisted-official', firebase: { sign_in_provider: 'password' } };
      if (token === 'outsider') return { uid: 'outsider', firebase: { sign_in_provider: 'password' } };
      throw new Error('invalid token');
    },
    analyzeImage: async () => ({ detected_category: 'Public Infrastructure', confidence_score: 0.95, user_confirmation_prompt: "Our AI categorized this under 'Public Infrastructure'. Is this correct?" }),
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => { await new Promise((resolve) => server.close(resolve)); });

function request(path, { token = 'citizen', method = 'GET', body, origin } = {}) {
  return fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
}

test('report routes require a valid Firebase token', async () => {
  assert.equal((await request('/api/reports/lgu', { token: '' })).status, 401);
  assert.equal((await request('/api/reports/lgu', { token: 'expired' })).status, 401);
});

test('citizen cannot read LGU reports or someone else\'s history', async () => {
  assert.equal((await request('/api/reports/lgu')).status, 403);
  assert.equal((await request('/api/reports/my-reports/other-uid')).status, 403);
});

test('email/password alone cannot grant official access; claims or UID allowlist can', async () => {
  assert.equal((await request('/api/reports/lgu', { token: 'outsider' })).status, 403);
  assert.equal((await request('/api/reports/lgu', { token: 'official' })).status, 200);
  assert.equal((await request('/api/reports/lgu', { token: 'allowlisted' })).status, 200);
});

test('new report is bound to guest UID and strips status and LGU notes', async () => {
  const response = await request('/api/reports', { method: 'POST', body: { ...payload, status: 'Resolved', lgu_notes: 'forged' } });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).report.status, 'Pending');
  assert.equal(lastCreated.reporter_uid, citizen.uid);
  assert.equal(lastCreated.status, undefined);
  assert.equal(lastCreated.lgu_notes, undefined);
  assert.equal((await request('/api/reports', { method: 'POST', body: { ...payload, reporter_uid: 'other' } })).status, 403);
});

test('create rejects another guest\'s image, invalid category, and nonnumeric GPS', async () => {
  assert.equal((await request('/api/reports', { method: 'POST', body: { ...payload, image_url: payload.image_url.replace('guest-123', 'someone-else') } })).status, 403);
  assert.equal((await request('/api/reports', { method: 'POST', body: { ...payload, ai_category: 'made-up' } })).status, 400);
  assert.equal((await request('/api/reports', { method: 'POST', body: { ...payload, location: { latitude: '13.6', longitude: 123 } } })).status, 400);
});

test('submission retry returns the existing report without overwriting status or creating a duplicate', async () => {
  duplicateOnCreate = true;
  try {
    const response = await request('/api/reports', { method: 'POST', body: { ...payload, description: 'Retry must not overwrite the first submission' } });
    assert.equal(response.status, 200);
    const { report } = await response.json();
    assert.equal(report._id, id);
    assert.equal(report.status, 'Acknowledged');
    assert.equal(report.lgu_notes, 'Already assigned');
    assert.equal(report.description, undefined);
    assert.deepEqual(lastExistingFilter, { reporter_uid: citizen.uid, image_url: payload.image_url });
  } finally { duplicateOnCreate = false; }
});

test('my reports query filters by verified owner and sorts newest first', async () => {
  const response = await request(`/api/reports/my-reports/${citizen.uid}`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reports.length, 1);
  assert.deepEqual(lastFilter, { reporter_uid: citizen.uid });
  assert.deepEqual(lastSort, { createdAt: -1 });
});

test('official can save status and clear notes; citizen cannot', async () => {
  assert.equal((await request(`/api/reports/${id}/status`, { method: 'PATCH', body: { status: 'Resolved' } })).status, 403);
  const response = await request(`/api/reports/${id}/status`, { token: 'official', method: 'PATCH', body: { status: 'Acknowledged', lgu_notes: '', reporter_uid: 'forged' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).report.status, 'Acknowledged');
  assert.deepEqual(lastUpdate.update, { $set: { status: 'Acknowledged', lgu_notes: '' } });
  assert.deepEqual(lastUpdate.options, { new: true, runValidators: true });
});

test('status validates IDs and enums and handles a missing report', async () => {
  assert.equal((await request('/api/reports/bad-id/status', { token: 'official', method: 'PATCH', body: { status: 'Resolved' } })).status, 400);
  assert.equal((await request(`/api/reports/${id}/status`, { token: 'official', method: 'PATCH', body: { status: 'Closed' } })).status, 400);
  missingReport = true;
  try { assert.equal((await request(`/api/reports/${id}/status`, { token: 'official', method: 'PATCH', body: { status: 'Resolved' } })).status, 404); }
  finally { missingReport = false; }
});

test('analyze accepts base64 and returns only the expected AI result', async () => {
  const response = await request('/api/reports/analyze', { method: 'POST', body: { image_base64: Buffer.from('photo').toString('base64'), mime_type: 'image/jpeg' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).detected_category, 'Public Infrastructure');
  assert.equal((await request('/api/reports/analyze', { method: 'POST', body: { image_url: 'http://127.0.0.1/private' } })).status, 400);
});

test('CORS permits configured dashboard origins and blocks arbitrary browser origins', async () => {
  const allowed = await request('/api/health', { origin: 'http://localhost:5173', token: '' });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal((await request('/api/health', { origin: 'https://untrusted.example', token: '' })).status, 403);
});
