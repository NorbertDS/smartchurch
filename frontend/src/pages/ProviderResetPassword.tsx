import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/client';

export default function ProviderResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = useMemo(() => {
    const p = new URLSearchParams(location.search);
    return String(p.get('token') || '').trim();
  }, [location.search]);

  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!token) {
      setError('Missing reset token.');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    try {
      setLoading(true);
      await api.post('/auth/provider-reset-password', { token, newPassword });
      setInfo('Password updated. Redirecting to login…');
      setTimeout(() => navigate('/provider/login?reset=1'), 800);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-faith-white dark:bg-gray-900">
      <form onSubmit={submit} className="card w-full max-w-md" autoComplete="off">
        <h2 className="text-2xl font-bold mb-4">Set New Provider Password</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {info && <div className="text-green-700 mb-2">{info}</div>}
        <label className="block mb-2">
          <span className="text-sm">New Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
          />
        </label>
        <label className="block mb-4">
          <span className="text-sm">Confirm Password</span>
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
          />
        </label>
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Reset password'}
        </button>
        <div className="mt-3 text-sm">
          <a href="/provider/login" className="underline">Back to login</a>
        </div>
      </form>
    </div>
  );
}

