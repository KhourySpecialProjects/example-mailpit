import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.js';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setUnverified(false);
    try {
      await api('/login', { email, password });
      navigate('/');
    } catch (err) {
      setError(err.message);
      setUnverified(err.code === 'EMAIL_NOT_VERIFIED');
    }
  }

  async function resend() {
    try {
      setNotice((await api('/resend-verification', { email })).message);
      setError('');
      setUnverified(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h2>Log in</h2>
      <form onSubmit={submit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button>Log in</button>
      </form>
      {error && <p className="error">{error}</p>}
      {unverified && (
        <button className="secondary" onClick={resend}>
          Resend verification email
        </button>
      )}
      {notice && <p className="notice">{notice}</p>}
      <p className="links">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/signup">Create an account</Link>
      </p>
    </>
  );
}
