import test from 'node:test';
import assert from 'node:assert/strict';
import { initialReportFlow, reportFlowReducer, submissionComment } from '../src/lib/reportFlow.ts';

const act = (state, type) => reportFlowReducer(state, { type });

test('the first two rejected photos return to capture without classification controls', () => {
  let flow = initialReportFlow();
  for (let attempt = 1; attempt <= 2; attempt++) {
    flow = act(flow, 'photo');
    assert.equal(flow.photoAttempts, attempt);
    assert.equal(flow.canChooseClassification, false);
    flow = act(flow, 'reject');
    assert.equal(flow.step, 'capture');
    assert.equal(flow.canChooseClassification, false);
  }
});

test('the third rejection preserves the photo and offers manual classification', () => {
  let flow = initialReportFlow();
  for (let attempt = 0; attempt < 2; attempt++) flow = act(act(flow, 'photo'), 'reject');
  flow = act(flow, 'photo');
  assert.equal(flow.canChooseClassification, false, 'the third photo alone does not unlock the picker');
  flow = act(flow, 'reject');
  assert.equal(flow.step, 'classification-help');
  assert.equal(flow.canChooseClassification, true);
  flow = act(flow, 'choose-classification');
  assert.equal(flow.step, 'review');
  assert.equal(flow.photoAttempts, 3, 'manual correction does not require a fourth photo');
});

test('retaking after the third rejection keeps correction available for this issue', () => {
  let flow = initialReportFlow();
  for (let attempt = 0; attempt < 3; attempt++) flow = act(act(flow, 'photo'), 'reject');
  flow = act(act(flow, 'retake'), 'photo');
  assert.equal(flow.photoAttempts, 4);
  assert.equal(flow.step, 'review');
  assert.equal(flow.canChooseClassification, true);
});

test('accepting a classification asks about comments before allowing submission', () => {
  let flow = act(initialReportFlow(), 'photo');
  assert.equal(submissionComment(flow, 'hidden text', false), null);
  assert.equal(submissionComment(flow, 'hidden text', true), null);
  flow = act(flow, 'accept');
  assert.equal(flow.step, 'comment-choice');
  assert.equal(submissionComment(flow, 'hidden text', false), '', 'No submits without any comment');
  assert.equal(submissionComment(flow, 'hidden text', true), null, 'Yes must open the description first');
  flow = act(flow, 'add-comment');
  assert.equal(flow.step, 'comment');
  assert.equal(submissionComment(flow, '  Near the public market.  ', true), 'Near the public market.');
});

test('back/retry keeps the comment decision explicit and skipping discards previous text', () => {
  let flow = act(act(act(initialReportFlow(), 'photo'), 'accept'), 'add-comment');
  flow = act(flow, 'back');
  assert.equal(flow.step, 'review');
  assert.equal(submissionComment(flow, 'A previously entered comment', true), null);
  flow = act(flow, 'accept');
  assert.equal(submissionComment(flow, 'A previously entered comment', false), '');
  flow = act(flow, 'add-comment');
  assert.equal(submissionComment(flow, 'A previously entered comment', false), '');
});

test('a new issue resets attempts and cannot enter classification or comments out of order', () => {
  let flow = initialReportFlow();
  for (let attempt = 0; attempt < 3; attempt++) flow = act(act(flow, 'photo'), 'reject');
  flow = act(flow, 'reset');
  assert.deepEqual(flow, initialReportFlow());
  for (const action of ['choose-classification', 'accept', 'add-comment', 'reject']) {
    assert.deepEqual(act(flow, action), initialReportFlow());
  }
});
