import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Report } from '../src/models/Report.js';
import { CATEGORIES } from '../src/constants.js';
import { decodeBase64Image, loadImage } from '../src/services/image.js';
import { parseAnalysis } from '../src/services/gemini.js';
import { validateImageUrl, validateStatusUpdate } from '../src/validation.js';

test('Report schema requires location and category and defaults to Pending', () => {
  const empty = new Report({});
  const errors = empty.validateSync().errors;
  for (const key of ['reporter_uid', 'image_url', 'ai_category', 'location']) assert.ok(errors[key], key);
  const report = new Report({ reporter_uid: 'guest', image_url: 'https://example.test/image.jpg', ai_category: 'Health', location: { latitude: 13.6, longitude: 123.2 } });
  assert.equal(report.validateSync(), undefined);
  assert.equal(report.status, 'Pending');
  assert.equal(report.location._id, undefined);
  assert.deepEqual(Report.schema.path('ai_category').enumValues, [...CATEGORIES]);
  assert.ok(Report.schema.indexes().some(([fields, options]) => fields.reporter_uid === 1 && fields.image_url === 1 && options.unique === true));
});

test('Report schema rejects missing nested coordinate and invalid status', () => {
  const report = new Report({ reporter_uid: 'guest', image_url: 'https://example.test/image.jpg', ai_category: 'Health', location: { latitude: 91 }, status: 'Closed' });
  const errors = report.validateSync().errors;
  assert.ok(errors['location.latitude']);
  assert.ok(errors['location.longitude']);
  assert.ok(errors.status);
});

test('AI parser rejects invented categories, string confidence, fences, and out-of-range confidence', () => {
  const valid = { is_valid_issue: true, detected_category: 'Health', confidence_score: 0.8, user_confirmation_prompt: "Our AI categorized this under 'Health'. Is this correct?" };
  assert.deepEqual(parseAnalysis(JSON.stringify(valid)), valid);
  for (const value of [{ ...valid, detected_category: 'Roads' }, { ...valid, confidence_score: '0.9' }, { ...valid, confidence_score: 1.1 }]) assert.throws(() => parseAnalysis(JSON.stringify(value)), { status: 502 });
  assert.throws(() => parseAnalysis('```json\n{}\n```'), { status: 502 });
});

test('AI rejects unclear/no-issue photos and legacy Unverified instead of creating a classification', () => {
  for (const result of [{ is_valid_issue: false, detected_category: null, invalid_reason: 'No clear issue' }, { detected_category: 'Unverified', confidence_score: 0.3, user_confirmation_prompt: 'Uncertain' }]) {
    assert.throws(() => parseAnalysis(JSON.stringify(result)), { status: 422, code: 'INVALID_ISSUE_IMAGE' });
  }
  assert.throws(() => parseAnalysis(JSON.stringify({ detected_category: 'Health', confidence_score: 0.8, user_confirmation_prompt: 'Health' })), { status: 502 });
});

test('base64 parsing supports data URIs and rejects malformed/unsupported/oversized data', () => {
  assert.deepEqual(decodeBase64Image('data:image/png;base64,aGVsbG8='), { mimeType: 'image/png', data: 'aGVsbG8=' });
  assert.throws(() => decodeBase64Image('$$bad'), { status: 400 });
  assert.throws(() => decodeBase64Image('aGVsbG8=', 'image/svg+xml'), { status: 400 });
  assert.throws(() => decodeBase64Image(Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64')), { status: 413 });
});

test('remote URLs enforce HTTPS, exact hosts, no credentials/ports, and optional bucket', () => {
  const config = { imageAllowedHosts: new Set(['firebasestorage.googleapis.com']), firebaseStorageBucket: 'trusted.appspot.com' };
  assert.ok(validateImageUrl('https://firebasestorage.googleapis.com/v0/b/trusted.appspot.com/o/photo.jpg', config));
  for (const url of ['http://firebasestorage.googleapis.com/v0/b/trusted.appspot.com/o/p', 'https://firebasestorage.googleapis.com.attacker.test/x', 'https://user:pass@firebasestorage.googleapis.com/x', 'https://firebasestorage.googleapis.com:444/x', 'https://firebasestorage.googleapis.com/v0/b/other.appspot.com/o/p', 'https://127.0.0.1/x']) assert.throws(() => validateImageUrl(url, config), { status: 400 });
});

test('image fetch blocks redirects and enforces streamed size limit without Content-Length', async () => {
  const config = { imageAllowedHosts: new Set(['storage.googleapis.com']) };
  let options;
  const fakeFetch = async (_url, opts) => {
    options = opts;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); controller.close(); } }), { headers: { 'content-type': 'image/jpeg' } });
  };
  await assert.rejects(loadImage({ image_url: 'https://storage.googleapis.com/bucket/photo.jpg' }, config, fakeFetch), { status: 413 });
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
});

test('notes validation preserves omission, supports clearing, and limits length', () => {
  assert.deepEqual(validateStatusUpdate({ status: 'Pending' }), { status: 'Pending' });
  assert.deepEqual(validateStatusUpdate({ status: 'Resolved', lgu_notes: '  Done  ' }), { status: 'Resolved', lgu_notes: 'Done' });
  assert.throws(() => validateStatusUpdate({ status: 'Resolved', lgu_notes: 'a'.repeat(5001) }), { status: 400 });
});
