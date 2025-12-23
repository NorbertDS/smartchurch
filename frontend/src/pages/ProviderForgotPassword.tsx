import { useState } from 'react';
import api from '../api/client';

export default function ProviderForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resetUrl, setResetUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setResetUrl('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Enter your email address.');
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.post('/auth/provider-forgot-password', { email: cleanEmail });
      if (data?.resetUrl) setResetUrl(String(data.resetUrl));
      setInfo('If an account exists for that email, a reset link has been sent.');
      setEmail('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to request reset');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-faith-white dark:bg-gray-900">
      <form onSubmit={submit} className="card w-full max-w-md" autoComplete="off">
        <h2 className="text-2xl font-bold mb-4">Provider Password Reset</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {info && <div className="text-green-700 mb-2">{info}</div>}
        <label className="block mb-4">
          <span className="text-sm">Provider Admin Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700"
            placeholder="you@example.com"
          />
        </label>
        {resetUrl && (
          <div className="text-xs mb-3 break-all">
            <div className="font-semibold mb-1">Dev reset link</div>
            <a className="underline" href={resetUrl}>{resetUrl}</a>
          </div>
        )}
        <button className="btn-primary w-full" type="submit" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
        <div className="mt-3 text-sm flex justify-between">
          <a href="/provider/login" className="underline">Back to login</a>
          <a href="/login" className="underline">Tenant Admin Login</a>
        </div>
      </form>
    </div>
  );
}

