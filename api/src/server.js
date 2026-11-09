import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { sendMail } from './mailer.js';
import { issueToken, consumeToken } from './tokens.js';

const { JWT_SECRET, APP_BASE_URL, NODE_ENV } = process.env;
const PORT = Number(process.env.PORT ?? 3000);
if (!JWT_SECRET || !APP_BASE_URL) {
  throw new Error('JWT_SECRET and APP_BASE_URL must be set');
}

const COOKIE = 'session';
const SESSION_DAYS = 7;
const BCRYPT_COST = 12;
// Compared against when the email is unknown, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_COST);

// ---------- validation ----------

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function parseEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

function parsePassword(value) {
  // bcrypt only uses the first 72 bytes, so reject longer passwords instead of silently truncating.
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    throw new HttpError(400, 'Password must be 8 to 72 characters.');
  }
  return value;
}

function parseToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new HttpError(400, 'This link is invalid or has expired.');
  }
  return value;
}

// ---------- email ----------

function link(path, token) {
  const url = new URL(path, APP_BASE_URL);
  url.searchParams.set('token', token);
  return url.href;
}

async function sendVerificationEmail(userId, email) {
  const url = link('/verify', await issueToken(userId, 'verify_email'));
  await sendMail({
    to: email,
    subject: 'Verify your email address',
    text: `Confirm your email address by opening this link (valid for 24 hours):\n\n${url}\n`,
    html: `<p>Confirm your email address (link valid for 24 hours):</p><p><a href="${url}">${url}</a></p>`,
  });
}

async function sendResetEmail(userId, email) {
  const url = link('/reset-password', await issueToken(userId, 'reset_password'));
  await sendMail({
    to: email,
    subject: 'Reset your password',
    text: `Reset your password by opening this link (valid for 1 hour):\n\n${url}\n\nIf you did not ask for this, ignore this email.\n`,
    html: `<p>Reset your password (link valid for 1 hour):</p><p><a href="${url}">${url}</a></p><p>If you did not ask for this, ignore this email.</p>`,
  });
}

// For endpoints that always return the same response: don't make the client
// wait on SMTP, so response time does not reveal whether the account exists.
function sendInBackground(promise) {
  promise.catch((err) => console.error('Failed to send email:', err));
}

// ---------- session ----------

function setSession(res, userId) {
  const token = jwt.sign({ sub: String(userId) }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

async function requireUser(req, res, next) {
  try {
    const { sub } = jwt.verify(req.cookies[COOKIE] ?? '', JWT_SECRET);
    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [sub]);
    if (!rows[0]) throw new Error('user no longer exists');
    req.user = rows[0];
    next();
  } catch {
    res.clearCookie(COOKIE, { path: '/' });
    res.status(401).json({ error: 'Not logged in.' });
  }
}

// ---------- routes ----------

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

app.post('/api/signup', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = parsePassword(req.body?.password);
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  let userId;
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      [email, hash],
    );
    userId = rows[0].id;
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists.');
    throw err;
  }
  await sendVerificationEmail(userId, email);
  res.status(201).json({ message: 'Account created. Check your email for a verification link.' });
});

app.post('/api/verify', async (req, res) => {
  const userId = await consumeToken(parseToken(req.body?.token), 'verify_email');
  if (!userId) throw new HttpError(400, 'This link is invalid or has expired.');
  await pool.query(
    'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1',
    [userId],
  );
  res.json({ message: 'Email verified. You can now log in.' });
});

app.post('/api/resend-verification', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE email = $1 AND email_verified_at IS NULL',
    [email],
  );
  if (rows[0]) sendInBackground(sendVerificationEmail(rows[0].id, email));
  res.json({ message: 'If that account exists and is unverified, a new verification email is on its way.' });
});

app.post('/api/login', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const { rows } = await pool.query(
    'SELECT id, password_hash, email_verified_at FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new HttpError(401, 'Invalid email or password.');
  if (!user.email_verified_at) {
    throw new HttpError(403, 'Please verify your email before logging in.', 'EMAIL_NOT_VERIFIED');
  }
  setSession(res, user.id);
  res.json({ email });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ message: 'Logged out.' });
});

app.get('/api/me', requireUser, (req, res) => {
  res.json({ email: req.user.email });
});

app.post('/api/forgot-password', async (req, res) => {
  const email = parseEmail(req.body?.email);
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows[0]) sendInBackground(sendResetEmail(rows[0].id, email));
  res.json({ message: 'If an account exists for that email, a password reset link is on its way.' });
});

app.post('/api/reset-password', async (req, res) => {
  const token = parseToken(req.body?.token);
  const hash = await bcrypt.hash(parsePassword(req.body?.password), BCRYPT_COST);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await consumeToken(token, 'reset_password', client);
    if (!userId) throw new HttpError(400, 'This link is invalid or has expired.');
    // Receiving the reset email also proves the user controls the address.
    await client.query(
      `UPDATE users SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now())
       WHERE id = $2`,
      [hash, userId],
    );
    // Any other outstanding reset links for this user stop working too.
    await client.query(
      `UPDATE auth_tokens SET used_at = now()
       WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL`,
      [userId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  res.json({ message: 'Password updated. You can now log in.' });
});

// Express 5 forwards rejected promises from async handlers here.
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) {
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong.' });
  }
  res.status(status).json({ error: err.message, code: err.code });
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));
