import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';

const officeA = '600000000000000000000001', officeB = '600000000000000000000002';
const ids = ['610000000000000000000001', '610000000000000000000002', '610000000000000000000003', '610000000000000000000004'];
const clone = value => value == null ? value : structuredClone(value);
const scalar = value => value instanceof Date ? value.getTime() : value?.toHexString ? value.toHexString() : value;
function matches(record, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$and') return expected.every(part => matches(record, part));
    if (key === '$or') return expected.some(part => matches(record, part));
    const actual = record[key];
    if (expected === null) return actual == null;
    if (expected && typeof expected === 'object' && !(expected instanceof Date) && !expected.toHexString) {
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$regex' in expected) return (Array.isArray(actual) ? actual : [actual]).some(value => new RegExp(expected.$regex, expected.$options).test(value || ''));
    }
    return Array.isArray(actual) ? actual.includes(expected) : scalar(actual) === scalar(expected);
  });
}
function queryValue(value) { return { lean: async () => clone(value), then: (resolve, reject) => Promise.resolve(clone(value)).then(resolve, reject) }; }

async function fixture(run) {
  const offices = [
    { _id: officeA, name: 'Office A', categories: ['Waste Management', 'Environment'], active: true, phone: 'test-phone', email: 'office@example.test', address: 'Test office address', area: 'Test area' },
    { _id: officeB, name: 'Office B', categories: ['Waste Management'], active: true },
  ];
  const accounts = [
    { _id: 'staff-a', name: 'Staff A', office_id: officeA, categories: ['Waste Management'], active: true },
    { _id: 'staff-b', name: 'Staff B', office_id: officeB, categories: ['Waste Management'], active: true },
  ];
  const records = ids.map((id, index) => ({ _id: id, reporter_uid: index === 2 ? 'other-citizen' : 'citizen', image_url: `https://firebasestorage.googleapis.com/v0/b/test/o/reports%2F${index === 2 ? 'other-citizen' : 'citizen'}%2F${index}.jpg`, ai_category: index === 1 ? 'Environment' : 'Waste Management', lgu_id: index === 2 ? officeB : officeA, location: { latitude: 13.6, longitude: 123.1 }, description: 'Original issue', status: index === 3 ? 'Acknowledged' : 'Pending', ...(index === 3 ? { acknowledgedAt: new Date(1) } : {}), createdAt: new Date(100 + index), updatedAt: new Date(200 + index) }));
  const state = { records, offices, accounts, beforeWrite: null, beforeDelete: null, failAccountCreate: false, removedAuth: [] };
  const list = values => { let skip = 0, limit = Infinity; const chain = { sort: () => chain, skip: value => { skip = value; return chain; }, limit: value => { limit = value; return chain; }, lean: async () => clone(values.slice(skip, skip + limit)) }; return chain; };
  const Office = { find: filter => list(offices.filter(item => matches(item, filter))), findById: id => queryValue(offices.find(item => item._id === id)), create: async value => ({ ...value, _id: officeB }), findByIdAndUpdate: async (id, update) => { const item = offices.find(item => item._id === id); if (!item) return null; Object.assign(item, update.$set); return item; } };
  const Account = { findById: uid => queryValue(accounts.find(item => item._id === uid)), find: () => list(accounts), create: async value => { if (state.failAccountCreate) throw new Error('database failure'); accounts.push(value); return clone(value); } };
  const Report = {
    find: filter => list(records.filter(record => matches(record, filter))),
    findOne: filter => queryValue(records.find(record => matches(record, filter))),
    countDocuments: async filter => records.filter(record => matches(record, filter)).length,
    aggregate: async pipeline => { const counts = {}; records.filter(record => matches(record, pipeline[0].$match)).forEach(record => { counts[record.status] = (counts[record.status] || 0) + 1; }); return Object.entries(counts).map(([_id, count]) => ({ _id, count })); },
    exists: async filter => records.some(record => matches(record, filter)),
    create: async value => { const record = { ...value, _id: '610000000000000000000005', status: 'Pending', createdAt: new Date(), updatedAt: new Date() }; records.push(record); return clone(record); },
    findOneAndUpdate: async (filter, update) => { if (state.beforeWrite) { state.beforeWrite(); state.beforeWrite = null; } const record = records.find(item => matches(item, filter)); if (!record) return null; Object.assign(record, update.$set, { updatedAt: new Date(Date.now()) }); return clone(record); },
    findOneAndDelete: async filter => { if (state.beforeDelete) { state.beforeDelete(); state.beforeDelete = null; } const index = records.findIndex(record => matches(record, filter)); return index < 0 ? null : records.splice(index, 1)[0]; },
  };
  const app = createApp({ config: { corsOrigins: [], lguUids: new Set(['admin']), imageAllowedHosts: new Set(['firebasestorage.googleapis.com']) }, Report, Office, Account,
    adminAuth: { createUser: async body => ({ uid: 'new-staff', email: body.email }), deleteUser: async uid => state.removedAuth.push(uid) },
    verifyToken: async token => ({ uid: token, firebase: { sign_in_provider: ['citizen', 'other-citizen'].includes(token) ? 'anonymous' : 'password' }, lgu: true }), analyzeImage: async () => ({}) });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const request = (path, token = 'citizen', method = 'GET', body) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try { await run({ request, state }); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('office and classification scopes apply to lists, counts, filters, and status writes', () => fixture(async ({ request }) => {
  const response = await request('/api/reports/lgu?page_size=1', 'staff-a'); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.reports.length, 1); assert.equal(data.pagination.total, 2); assert.equal(data.pagination.total_pages, 2);
  assert.equal(data.counts.Pending, 1); assert.equal(data.counts.Acknowledged, 1);
  assert.equal((await (await request('/api/reports/lgu?category=Environment', 'staff-a')).json()).pagination.total, 0);
  assert.equal((await request(`/api/reports/lgu?office_id=${officeB}`, 'staff-a')).status, 403);
  for (const id of [ids[1], ids[2]]) assert.equal((await request(`/api/reports/${id}/status`, 'staff-a', 'PATCH', { status: 'Resolved' })).status, 404);
  assert.equal((await request('/api/reports/lgu', 'unassigned-password-account')).status, 403);
  assert.equal((await (await request('/api/reports/lgu?q=.*', 'admin')).json()).pagination.total, 0);
  assert.equal((await request('/api/reports/lgu?page_size=1000', 'admin')).status, 400);
}));

test('citizen contacts are enriched and pending description/classification changes reroute safely', () => fixture(async ({ request, state }) => {
  const own = await (await request('/api/reports/my-reports/citizen')).json();
  assert.equal(own.reports[0].lgu.phone, 'test-phone'); assert.equal(own.reports[0].can_edit, true);
  const response = await request(`/api/reports/${ids[0]}`, 'citizen', 'PATCH', { description: 'Updated details', ai_category: 'Environment', lgu_id: officeA, status: 'Resolved', reporter_uid: 'forged' });
  assert.equal(response.status, 200); const { report } = await response.json();
  assert.equal(report.description, 'Updated details'); assert.equal(report.ai_category, 'Environment'); assert.equal(report.status, 'Pending'); assert.equal(report.reporter_uid, 'citizen');
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'PATCH', { lgu_id: officeB })).status, 400);
  assert.equal((await request(`/api/reports/${ids[2]}`, 'citizen', 'PATCH', { description: 'forged' })).status, 404);
  assert.equal(state.records[2].description, 'Original issue');
}));

test('registered citizens can submit, track, edit, and delete only their own issues without LGU access', () => fixture(async ({ request, state }) => {
  const payload = { reporter_uid: 'registered-citizen', image_url: 'https://firebasestorage.googleapis.com/v0/b/test/o/reports%2Fregistered-citizen%2Fissue.jpg', ai_category: 'Waste Management', lgu_id: officeA, location: { latitude: 13.6, longitude: 123.1 }, role: 'admin' };
  const created = await request('/api/reports', 'registered-citizen', 'POST', payload);
  assert.equal(created.status, 201);
  const report = (await created.json()).report;
  const history = await request('/api/reports/my-reports/registered-citizen', 'registered-citizen');
  assert.deepEqual((await history.json()).reports.map(item => item._id), [report._id]);
  assert.equal((await request('/api/reports/my-reports/citizen', 'registered-citizen')).status, 403);
  assert.equal((await request(`/api/reports/${ids[0]}`, 'registered-citizen', 'PATCH', { description: 'forged' })).status, 404);
  assert.equal((await request(`/api/reports/${report._id}`, 'registered-citizen', 'PATCH', { description: 'More details' })).status, 200);
  assert.equal((await request('/api/reports/lgu', 'registered-citizen')).status, 403);
  assert.equal((await request('/api/lgu/admin/accounts', 'registered-citizen')).status, 403);
  assert.equal((await request(`/api/reports/${report._id}`, 'registered-citizen', 'DELETE')).status, 204);
  assert.ok(!state.records.some(item => item._id === report._id));
}));

test('acknowledgment permanently locks citizen edit/delete, even if status returns to Pending', () => fixture(async ({ request }) => {
  assert.equal((await request(`/api/reports/${ids[0]}/status`, 'staff-a', 'PATCH', { status: 'Acknowledged' })).status, 200);
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'PATCH', { description: 'too late' })).status, 409);
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'DELETE')).status, 409);
  const response = await request(`/api/reports/${ids[0]}/status`, 'staff-a', 'PATCH', { status: 'Pending' });
  assert.equal(response.status, 200); assert.equal((await response.json()).report.can_edit, false);
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'DELETE')).status, 409);
}));

test('acknowledgment between reading and saving blocks a racing citizen edit', () => fixture(async ({ request, state }) => {
  state.beforeWrite = () => Object.assign(state.records[0], { status: 'Acknowledged', acknowledgedAt: new Date() });
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'PATCH', { description: 'racing edit' })).status, 409);
  assert.equal(state.records[0].description, 'Original issue');
}));

test('pending deletes are owner-only and atomic against racing acknowledgment', () => fixture(async ({ request, state }) => {
  assert.equal((await request(`/api/reports/${ids[2]}`, 'citizen', 'DELETE')).status, 404);
  state.beforeDelete = () => Object.assign(state.records[0], { status: 'Acknowledged', acknowledgedAt: new Date() });
  assert.equal((await request(`/api/reports/${ids[0]}`, 'citizen', 'DELETE')).status, 409);
  assert.equal((await request(`/api/reports/${ids[1]}`, 'citizen', 'DELETE')).status, 204);
  assert.ok(!state.records.some(record => record._id === ids[1]));
}));

test('attachments enforce ownership, original image, maximum count and duplicate limits', () => fixture(async ({ request, state }) => {
  const current = state.records[0];
  const foreign = state.records[2].image_url;
  for (const images of [[current.image_url, foreign], [current.image_url, current.image_url], [foreign]]) {
    assert.equal((await request(`/api/reports/${current._id}`, 'citizen', 'PATCH', { image_urls: images })).status >= 400, true);
  }
  assert.equal((await request(`/api/reports/${current._id}`, 'citizen', 'PATCH', { image_urls: Array.from({ length: 6 }, (_, index) => current.image_url.replace('0.jpg', `${index}.jpg`)) })).status, 400);
}));

test('only administrators can manage offices and create scoped staff accounts without storing passwords', () => fixture(async ({ request, state }) => {
  assert.equal((await request('/api/lgu/admin/accounts', 'staff-a')).status, 403);
  assert.equal((await request('/api/lgu/admin/offices', 'citizen')).status, 403);
  const body = { name: 'New staff', email: 'staff@example.test', password: 'a-test-password', office_id: officeA, categories: ['Waste Management'], role: 'admin' };
  const response = await request('/api/lgu/admin/accounts', 'admin', 'POST', body);
  assert.equal(response.status, 201); const created = state.accounts.find(account => account._id === 'new-staff');
  assert.equal(created.password, undefined); assert.equal(created.role, undefined); assert.equal(created.office_id, officeA);
  assert.equal((await request('/api/lgu/admin/accounts', 'admin', 'POST', { ...body, categories: ['Health'] })).status, 400);
}));

test('failed staff persistence rolls back only the newly created Firebase test account', () => fixture(async ({ request, state }) => {
  state.failAccountCreate = true;
  const response = await request('/api/lgu/admin/accounts', 'admin', 'POST', { name: 'New staff', email: 'staff@example.test', password: 'a-test-password', office_id: officeA, categories: ['Waste Management'] });
  assert.equal(response.status, 400); assert.deepEqual(state.removedAuth, ['new-staff']);
}));
