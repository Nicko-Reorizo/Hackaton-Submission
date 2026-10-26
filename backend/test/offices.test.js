import assert from 'node:assert/strict';
import test from 'node:test';
import { initializeOffices } from '../src/offices.js';
import { ISSUE_CATEGORIES } from '../src/constants.js';

test('office initialization creates only supported desks and archives legacy Unverified without deleting reports', async () => {
  const updates = [], reportUpdates = [];
  const Office = { findOneAndUpdate: async (filter, update, options) => {
    updates.push({ filter, update, options });
    return { _id: filter.key === 'Unverified' ? 'old-office' : filter.key };
  } };
  const Report = { updateMany: async (...args) => reportUpdates.push(args) };
  await initializeOffices(Office, Report);
  assert.deepEqual(updates.filter(item => item.options.upsert).map(item => item.filter.key), [...ISSUE_CATEGORIES]);
  const archived = updates.find(item => item.filter.key === 'Unverified');
  assert.deepEqual(archived.update.$set, { active: false, name: 'Archived reports' });
  assert.ok(!archived.options.upsert);
  assert.ok(reportUpdates.some(([filter, update]) => filter.ai_category === 'Unverified' && update.$set.lgu_id === 'old-office'));
});
