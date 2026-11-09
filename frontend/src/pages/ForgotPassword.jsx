import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api.js';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      setNotice((await api('/forgot-password', { email })).message);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h2>Forgot password</h2>
      {notice ? (
        <p className="notice">{notice}</p>
      ) : (
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button>Send reset link</button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
      <p className="links">
        <Link to="/login">Back to log in</Link>
      </p>
    </>
  );
}
