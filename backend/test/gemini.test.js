import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analysisError } from '../src/services/gemini.js';
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
  assert.equal(analysisError({ status: 503 }, 'gemini-3.8-flash').status, 503);
  assert.match(analysisError({ status: 503 }, 'gemini-3.8-flash').message, /temporarily busy/);
  assert.equal(analysisError({ status: 403 }, 'gemini-3.8-flash').code, 'AI_ACCESS_DENIED');
  const invalid = new HttpError(502, 'Invalid AI response', 'AI_INVALID_RESPONSE');
  assert.equal(analysisError(invalid, 'gemini-3.8-flash'), invalid);
  assert.doesNotMatch(analysisError({ message: 'secret upstream body' }, 'gemini-3.8-flash').message, /secret/);
});

test('configuration selects the current default and preserves explicit model overrides', () => {
  assert.equal(readConfig({}).geminiModel, 'gemini-3.1-flash-lite');
  assert.equal(readConfig({ GEMINI_MODEL: '  gemini-flash-latest  ' }).geminiModel, 'gemini-flash-latest');
});
