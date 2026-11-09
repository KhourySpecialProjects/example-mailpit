import crypto from 'node:crypto';
import { pool } from './db.js';

const TTL_HOURS = { verify_email: 24, reset_password: 1 };

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Creates a token for the user and returns the raw value for the email link.
// Only its hash is stored.
export async function issueToken(userId, purpose) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [userId, purpose, sha256(token), TTL_HOURS[purpose]],
  );
  return token;
}

// Marks a valid token as used and returns its user id, or null if the token
// is unknown, expired, already used, or for a different purpose. A single
// UPDATE makes this atomic, so concurrent requests cannot both consume it.
export async function consumeToken(token, purpose, db = pool) {
  const { rows } = await db.query(
    `UPDATE auth_tokens SET used_at = now()
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [sha256(token), purpose],
  );
  return rows[0]?.user_id ?? null;
}
