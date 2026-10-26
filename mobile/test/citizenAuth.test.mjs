import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateCitizen, citizenAuthError, continueAsGuest } from '../src/lib/citizenAuth.ts';

const input = { email: '  citizen@example.test  ', password: 'a-password-123', confirmation: 'a-password-123' };
function fixture(currentUser = null) {
  const calls = [];
  const actions = {
    currentUser,
    signIn: async (...values) => { calls.push(['login', ...values]); return { uid: 'existing-account', isAnonymous: false }; },
    createAccount: async (...values) => { calls.push(['create', ...values]); return { uid: 'new-account', isAnonymous: false }; },
    linkGuest: async (user, ...values) => { calls.push(['link', user.uid, ...values]); return { ...user, isAnonymous: false }; },
    signInGuest: async () => { calls.push(['guest']); return { uid: 'new-guest', isAnonymous: true }; },
  };
  return { calls, actions };
}

test('Continue as Guest restores the same UID so its submitted reports remain accessible', async () => {
  const user = { uid: 'guest-with-reports', isAnonymous: true };
  const { calls, actions } = fixture(user);
  assert.equal(await continueAsGuest(actions), user);
  assert.deepEqual(calls, []);
});

test('Continue as Guest creates an anonymous identity only when none exists', async () => {
  const { calls, actions } = fixture();
  assert.deepEqual(await continueAsGuest(actions), { uid: 'new-guest', isAnonymous: true });
  assert.deepEqual(calls, [['guest']]);
});

test('guest signup links credentials without changing report/photo ownership UID', async () => {
  const { calls, actions } = fixture({ uid: 'guest-with-reports', isAnonymous: true });
  const account = await authenticateCitizen('signup', input, actions);
  assert.equal(account.uid, 'guest-with-reports');
  assert.equal(account.isAnonymous, false);
  assert.deepEqual(calls, [['link', 'guest-with-reports', 'citizen@example.test', input.password]]);
});

test('signup without a guest creates a registered account and login uses the existing account', async () => {
  const { calls, actions } = fixture();
  assert.equal((await authenticateCitizen('signup', input, actions)).uid, 'new-account');
  assert.equal((await authenticateCitizen('login', { ...input, password: 'older6', confirmation: '' }, actions)).uid, 'existing-account');
  assert.deepEqual(calls.map(call => call[0]), ['create', 'login']);
});

test('failed linking preserves the guest and never silently creates a different account', async () => {
  const { calls, actions } = fixture({ uid: 'guest-with-reports', isAnonymous: true });
  const failure = { code: 'auth/email-already-in-use' };
  actions.linkGuest = async () => { throw failure; };
  await assert.rejects(authenticateCitizen('signup', input, actions), error => error === failure);
  assert.equal(actions.currentUser.uid, 'guest-with-reports');
  assert.deepEqual(calls, []);
});

test('invalid emails, weak signup passwords, and mismatches never contact authentication', async () => {
  const { calls, actions } = fixture();
  for (const invalid of [{ ...input, email: 'bad' }, { ...input, password: 'short' }, { ...input, confirmation: 'different' }]) {
    await assert.rejects(authenticateCitizen('signup', invalid, actions));
  }
  await assert.rejects(authenticateCitizen('login', { ...input, password: '' }, actions));
  assert.deepEqual(calls, []);
});

test('authentication errors are readable without exposing raw credentials or service details', () => {
  assert.match(citizenAuthError({ code: 'auth/network-request-failed' }), /internet connection/);
  assert.match(citizenAuthError({ code: 'auth/invalid-credential' }), /incorrect/);
  assert.ok(!citizenAuthError(new Error('private token and password')).includes('private token'));
});
