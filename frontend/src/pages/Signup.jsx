import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      setNotice((await api('/signup', { email, password })).message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h2>Sign up</h2>
      {notice ? (
        <p className="notice">{notice}</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password (8–72 characters)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              required
            />
          </label>
          <button>Create account</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="links">
        <Link to="/login">I already have an account</Link>
      </p>
    </>
  );
}
