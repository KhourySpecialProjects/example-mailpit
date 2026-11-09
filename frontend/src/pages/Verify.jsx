import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../api.js';

export default function Verify() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState({ type: '', text: 'Verifying…' });
  // Tokens are single-use; StrictMode runs effects twice in development, so
  // make sure the token is only submitted once.
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    api('/verify', { token: params.get('token') ?? '' })
      .then((data) => setStatus({ type: 'notice', text: data.message }))
      .catch((err) => setStatus({ type: 'error', text: err.message }));
  }, [params]);

  return (
    <>
      <h2>Verify email</h2>
      <p className={status.type}>{status.text}</p>
      <p className="links">
        <Link to="/login">Go to log in</Link>
      </p>
    </>
  );
}
