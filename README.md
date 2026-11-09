# Email verification & password reset with Mailpit

A minimal app that demonstrates sign-up with email verification and password reset.
In local development, [Mailpit](https://mailpit.axllent.org/) catches every outgoing email,
so no real mail is ever sent.

| Service    | What it is                                    | Reachable from host        |
| ---------- | --------------------------------------------- | -------------------------- |
| `frontend` | React + Vite dev server, proxies `/api` → api | http://localhost:5173      |
| `api`      | Express + Nodemailer + `pg`, port 3000        | no (only via Vite proxy)   |
| `db`       | Postgres 18, schema from `db/init.sql`        | no                         |
| `mailpit`  | `axllent/mailpit:v1.33.1`, SMTP on 1025       | http://localhost:8025 (UI) |

## Run it

```sh
cp .env.example .env    # then set POSTGRES_PASSWORD and JWT_SECRET (openssl rand -hex 32)
docker compose up --build
```

- App: http://localhost:5173
- Mailpit inbox: http://localhost:8025 (interactive API docs at http://localhost:8025/api/v1/)

Source code is bind-mounted, so edits under `frontend/` hot-reload in the browser and edits under
`api/src/` restart the API (`node --watch`).

`db/init.sql` runs only when the database volume is empty. To wipe all data and re-create the
schema, run `docker compose down -v`.

## Walk through the flows manually

1. **Sign up.** Open http://localhost:5173, choose *Sign up*, and enter any address (for example
   `alice@example.com`) and a password of 8–72 characters. The account is created unverified.
2. **Login is refused.** On *Log in*, enter the same credentials. You get "Please verify your email
   before logging in." and a *Resend verification email* button.
3. **Verify.** Open http://localhost:8025. Open the "Verify your email address" message and click
   the link. It opens `http://localhost:5173/verify?token=…`, which reports success. Open the same
   link again and it reports invalid, because tokens are single-use.
4. **Log in.** Log in. The home page shows your email and a *Log out* button.
5. **Forgot password.** Log out, click *Forgot password?* and enter your email. The reply is the
   same whether or not the account exists. Try an unknown address to compare.
6. **Reset.** In Mailpit, open "Reset your password" and follow the link. Set a new password. The
   old password now fails, the new one works, and the reset link no longer works.

## Run the integration test

With the stack running:

```sh
docker compose exec api npm test
```

`api/test/flow.test.js` uses Node's built-in test runner and needs no extra dependencies. It signs
up a unique plus-address (`user+<random>@example.com`). It finds each email through Mailpit's REST
API: `GET /api/v1/search?query=to:"…" subject:"…"`, then `GET /api/v1/message/{ID}`. It pulls the
token out of the link and runs the whole flow: sign up → verify → log in → forgot password →
reset → log in with the new password. It also checks that tokens are single-use and that
forgot-password gives the same reply for known and unknown emails. The test never clears the
mailbox, so you can run it as often as you like.

## Design notes

- **Session:** a signed JWT (`jsonwebtoken`, secret `JWT_SECRET`) in an httpOnly, `SameSite=Lax`
  cookie named `session`. It lasts 7 days and is `Secure` when `NODE_ENV=production`. JWTs are
  stateless, so sessions survive API restarts and no session store is needed.
- **Tokens:** 32 bytes from `crypto.randomBytes`, base64url-encoded into the link. The database
  stores only the hex SHA-256 hash, in `auth_tokens` (`purpose`, `token_hash`, `expires_at`,
  `used_at`). Verification tokens expire after 24 hours, reset tokens after 1 hour. A token is
  consumed with a single atomic
  `UPDATE … WHERE used_at IS NULL AND expires_at > now() RETURNING user_id`. A successful reset
  also invalidates the user's other unused reset tokens and marks the email verified.
- The `/verify` page POSTs the token to the API instead of verifying on a plain GET, so link
  scanners that prefetch URLs cannot use it up.
- Validation: emails must be well-formed and at most 254 characters. Passwords must be 8–72
  characters, because bcrypt ignores everything past 72 bytes. Request bodies are capped at 10 kB.
- Known limitations, kept out on purpose to stay minimal:
  - No rate limiting.
  - Existing sessions stay valid after a password reset, because JWTs are not revoked.
  - Signing up with an address that is already registered returns 409, which reveals that the
    address exists.

## Using a real SMTP provider in production

The mailer reads only environment variables, so switching providers needs no code changes. Set
these in the production environment, for example for a provider that uses STARTTLS on port 587:

```sh
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false        # false = STARTTLS upgrade on 587; use true for implicit TLS on port 465
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password-or-api-key
MAIL_FROM="My App <no-reply@yourdomain.com>"   # must be a sender/domain verified with the provider
APP_BASE_URL=https://app.yourdomain.com        # public URL used in email links
NODE_ENV=production                            # marks the session cookie Secure
```

Keep these values in your host's secret store, not in git. The Dockerfiles and compose file here
are for development only: they run the Vite dev server and `node --watch`. A production deployment
would serve a `vite build` of the frontend and the API from the same origin.
