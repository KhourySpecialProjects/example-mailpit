import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../api.js';

export default function Home() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/me')
      .then(setUser)
      .catch((err) => (err.status === 401 ? navigate('/login', { replace: true }) : setError(err.message)));
  }, [navigate]);

  async function logout() {
    await api('/logout', {});
    navigate('/login');
  }

  if (error) return <p className="error">{error}</p>;
  if (!user) return <p>Loading…</p>;
  return (
    <>
      <h2>Your account</h2>
      <p>
        Logged in as <strong>{user.email}</strong>
      </p>
      <button onClick={logout}>Log out</button>
      <p className="links">
        <Link to="/forgot-password">Reset password by email (uses the Forgot password page)</Link>
      </p>
    </>
  );
}
