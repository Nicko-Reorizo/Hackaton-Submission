import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analysisError, generateWithRetry } from '../src/services/gemini.js';
import { HttpError } from '../src/errors.js';
import { readConfig } from '../src/config.js';

test('an unavailable current model does not incorrectly report Gemini 1.5 retirement', () => {
  const error = analysisError({ status: 404 }, 'gemini-2.5-flash');
  assert.equal(error.status, 503);
  assert.equal(error.code, 'AI_MODEL_UNAVAILABLE');
  assert.match(error.message, /not available for this account/);
  assert.doesNotMatch(error.message, /1\.5|retired/);
  assert.match(analysisError({ status: 404 }, 'gemini-1.5-flash').message, /retired/);
});

test('quota and access errors remain distinct from model availability and preserve safe errors', () => {
  assert.match(analysisError({ status: 429 }, 'gemini-3.8-flash').message, /quota/);
  assert.equal(analysisError({ status: 429 }, 'gemini-3.8-flash').status, 429);
  assert.equal(analysisError({ status: 429 }, 'gemini-3.8-flash').code, 'AI_QUOTA_EXCEEDED');
  assert.equal(analysisError({ status: 503 }, 'gemini-3.8-flash').status, 503);
  assert.match(analysisError({ status: 503 }, 'gemini-3.8-flash').message, /temporarily busy/);
  assert.equal(analysisError({ status: 503 }, 'gemini-3.8-flash').code, 'AI_BUSY');
  assert.equal(analysisError({ status: 403 }, 'gemini-3.8-flash').code, 'AI_ACCESS_DENIED');
  const invalid = new HttpError(502, 'Invalid AI response', 'AI_INVALID_RESPONSE');
  assert.equal(analysisError(invalid, 'gemini-3.8-flash'), invalid);
  assert.doesNotMatch(analysisError({ message: 'secret upstream body' }, 'gemini-3.8-flash').message, /secret/);
});

test('configuration selects the current default and preserves explicit model overrides', () => {
  assert.equal(readConfig({}).geminiModel, 'gemini-3.5-flash-lite');
  assert.equal(readConfig({ GEMINI_MODEL: '  gemini-flash-latest  ' }).geminiModel, 'gemini-flash-latest');
});

test('temporary AI capacity failures retry with backoff and return the successful result', async () => {
  let attempts = 0;
  const waits = [], timeouts = [];
  const result = await generateWithRetry(async options => {
    attempts++; timeouts.push(options.timeout);
    if (attempts < 3) throw { status: 503 };
    return 'valid response';
  }, { wait: async value => waits.push(value), now: () => 0, random: () => 0 });
  assert.equal(result, 'valid response');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.deepEqual(timeouts, [12000, 12000, 12000]);
});

test('persistent service failures stop after three attempts', async () => {
  let attempts = 0;
  await assert.rejects(generateWithRetry(async () => { attempts++; throw { status: 503 }; }, { wait: async () => {}, now: () => 0, random: () => 0 }), error => error.status === 503);
  assert.equal(attempts, 3);
});

test('quota, access, unavailable models, and invalid photos are never automatically retried', async () => {
  for (const status of [429, 401, 403, 404, 422]) {
    let attempts = 0;
    await assert.rejects(generateWithRetry(async () => { attempts++; throw { status }; }, { wait: async () => assert.fail('Unexpected retry') }), error => error.status === status);
    assert.equal(attempts, 1);
  }
});

test('retry budget prevents requests from continuing beyond the mobile timeout', async () => {
  let clock = 0, attempts = 0;
  await assert.rejects(generateWithRetry(async () => { attempts++; clock += 44500; throw { status: 503 }; }, { wait: async () => assert.fail('Budget exhausted'), now: () => clock, random: () => 0 }), error => error.status === 503);
  assert.equal(attempts, 1);
});

test('a delayed retry timer cannot start another request after the time budget', async () => {
  let clock = 0, attempts = 0;
  await assert.rejects(generateWithRetry(async () => { attempts++; throw { status: 503 }; }, { wait: async () => { clock += 46000; }, now: () => clock, random: () => 0 }), error => error.status === 503);
  assert.equal(attempts, 1);
});
