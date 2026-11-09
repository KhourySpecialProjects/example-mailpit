-- Runs once, on first start of an empty Postgres volume.
-- To re-run: docker compose down -v && docker compose up --build

CREATE TABLE users (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email             text NOT NULL UNIQUE,          -- stored lowercased
  password_hash     text NOT NULL,                 -- bcrypt
  email_verified_at timestamptz,                   -- NULL = unverified
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One row per emailed token. Only the SHA-256 hash of the token is stored,
-- so a database leak does not expose usable links.
CREATE TABLE auth_tokens (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash text NOT NULL UNIQUE,                 -- hex sha256 of the raw token
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,                          -- set when consumed; single use
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose);
