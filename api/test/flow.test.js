// End-to-end test against the running compose stack. Run inside the api container:
//   docker compose exec api npm test
// Mailpit REST endpoints used (see http://localhost:8025/api/v1/ for the served schema):
//   GET /api/v1/search?query=...   -> { messages: [{ ID, Subject, ... }] }
//   GET /api/v1/message/{ID}       -> { Text, HTML, ... }
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://mailpit:8025';
const APP_BASE_URL = process.env.APP_BASE_URL;

async function api(path, { body, cookie } = {}) {
  const res = await fetch(`${API_URL}/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(cookie && { cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('session='));
  return { status: res.status, json: await res.json(), cookie: setCookie?.split(';')[0] };
}

// Polls Mailpit until a message to `to` with `subject` arrives, then returns its link.
async function linkFromEmail(to, subject, path) {
  const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
    assert.equal(res.status, 200);
    const { messages } = await res.json();
    if (messages.length > 0) {
      assert.equal(messages.length, 1, `expected one "${subject}" email to ${to}`);
      const message = await (await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)).json();
      const match = message.Text.match(new RegExp(`(\\S+${path}\\?token=([A-Za-z0-9_-]+))`));
      assert.ok(match, `no ${path} link in email body:\n${message.Text}`);
      return { url: match[1], token: match[2] };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`timed out waiting for "${subject}" email to ${to}`);
}

test('sign up, verify, log in, reset password', async (t) => {
  const email = `user+${crypto.randomBytes(6).toString('hex')}@example.com`;
  const password = 'first-password-123';
  const newPassword = 'second-password-456';

  await t.test('sign up creates an unverified account', async () => {
    const res = await api('/signup', { body: { email, password } });
    assert.equal(res.status, 201);
    const login = await api('/login', { body: { email, password } });
    assert.equal(login.status, 403);
    assert.equal(login.json.code, 'EMAIL_NOT_VERIFIED');
  });

  await t.test('verification link from Mailpit verifies the email once', async () => {
    const { url, token } = await linkFromEmail(email, 'Verify your email address', '/verify');
    assert.ok(url.startsWith(`${APP_BASE_URL}/verify?`), `link should use APP_BASE_URL: ${url}`);
    assert.equal((await api('/verify', { body: { token } })).status, 200);
    assert.equal((await api('/verify', { body: { token } })).status, 400, 'token must be single-use');
  });

  await t.test('verified user can log in and see their email', async () => {
    const login = await api('/login', { body: { email, password } });
    assert.equal(login.status, 200);
    assert.ok(login.cookie, 'login should set the session cookie');
    const me = await api('/me', { cookie: login.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.email, email);
  });

  await t.test('forgot password gives the same reply for known and unknown emails', async () => {
    const known = await api('/forgot-password', { body: { email } });
    const unknown = await api('/forgot-password', { body: { email: `nobody+${Date.now()}@example.com` } });
    assert.equal(known.status, 200);
    assert.deepEqual(known.json, unknown.json);
  });

  await t.test('reset link from Mailpit changes the password once', async () => {
    const { token } = await linkFromEmail(email, 'Reset your password', '/reset-password');
    const reset = await api('/reset-password', { body: { token, password: newPassword } });
    assert.equal(reset.status, 200);
    const again = await api('/reset-password', { body: { token, password: 'third-password-789' } });
    assert.equal(again.status, 400, 'token must be single-use');
  });

  await t.test('only the new password works', async () => {
    assert.equal((await api('/login', { body: { email, password } })).status, 401);
    const login = await api('/login', { body: { email, password: newPassword } });
    assert.equal(login.status, 200);
    assert.ok(login.cookie);
  });
});
