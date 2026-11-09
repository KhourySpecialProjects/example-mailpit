import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match.');
    setError('');
    try {
      setNotice((await api('/reset-password', { token: params.get('token') ?? '', password })).message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h2>Choose a new password</h2>
      {notice ? (
        <p className="notice">{notice}</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            New password (8–72 characters)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <label>
            Confirm new password
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </label>
          <button>Set password</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="links">
        <Link to="/login">Go to log in</Link>
      </p>
    </>
  );
}
