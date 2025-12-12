import { useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';

export default function ProviderLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [requireOtp, setRequireOtp] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload: any = { email, password };
      if (requireOtp && otp) payload.otp = otp;
      const { data } = await api.post('/auth/provider-login', payload);
      localStorage.setItem('fc_token', data.token);
      localStorage.setItem('fc_role', data.role);
      if (data.tenantId !== undefined && data.tenantId !== null) localStorage.setItem('fc_tenant_id', String(data.tenantId)); else localStorage.removeItem('fc_tenant_id');
      try {
        const parts = String(data.token).split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload && payload.exp) localStorage.setItem('fc_token_exp', String(payload.exp));
        }
      } catch {}
      navigate('/provider/tenants');
      setPassword('');
      setOtp(''); setRequireOtp(false);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || 'Login failed';
      const need2fa = err?.response?.data?.require2fa === true;
      if (need2fa) {
        setRequireOtp(true);
        setError('Two-Factor required. Enter OTP.');
      } else if (status === 401 && msg.toLowerCase().includes('invalid credentials')) {
        setError('Email or password is incorrect.');
      } else if (!err?.response && !!err?.request) {
        setError('Cannot reach backend server.');
      } else {
        setError(msg);
      }
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-faith-white dark:bg-gray-900">
      <form onSubmit={login} className="card w-full max-w-md" autoComplete="off">
        <h2 className="text-2xl font-bold mb-4">Provider Admin Login</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        <label className="block mb-2">
          <span className="text-sm">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
        </label>
        <label className="block mb-4">
          <span className="text-sm">Password</span>
          <input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
        </label>
        {requireOtp && (
          <label className="block mb-4">
            <span className="text-sm">Two-Factor Code</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={e=>setOtp(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" placeholder="123456" />
          </label>
        )}
        <button className="btn-primary w-full" type="submit">Login</button>
        <div className="mt-3 text-sm">
          <a href="/login" className="underline">Tenant Admin Login</a>
        </div>
      </form>
    </div>
  );
}
