import { useEffect, useState } from 'react';
import api from '../api/client';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('fc_remember_email') === '1' ? (localStorage.getItem('fc_email') || '') : '');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [requireOtp, setRequireOtp] = useState(false);
  const [tenant, setTenant] = useState('');
  const [loginType, setLoginType] = useState<'MEMBER'|'ADMIN'>('MEMBER');
  const [rememberEmail, setRememberEmail] = useState(localStorage.getItem('fc_remember_email') === '1');
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('FaithConnect');
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const next = params.get('next');
  const roleHint = params.get('roleHint');
  const debug = String((import.meta as any)?.env?.VITE_ENABLE_DEBUG || '').toLowerCase() === 'true';
  const adminEmail = (import.meta as any)?.env?.VITE_SAMPLE_ADMIN_EMAIL || '';
  const adminPass = (import.meta as any)?.env?.VITE_SAMPLE_ADMIN_PASSWORD || '';
  const memberEmail = (import.meta as any)?.env?.VITE_SAMPLE_MEMBER_EMAIL || '';
  const memberPass = (import.meta as any)?.env?.VITE_SAMPLE_MEMBER_PASSWORD || '';

  useEffect(() => {
    if (!debug) return;
    if (roleHint === 'admin' && adminEmail) {
      setEmail(prev => prev || String(adminEmail));
      if (!password && adminPass) setPassword(String(adminPass));
    } else if (roleHint === 'member' && memberEmail) {
      setEmail(prev => prev || String(memberEmail));
      if (!password && memberPass) setPassword(String(memberPass));
    }
  }, [debug, roleHint]);

  useEffect(() => {
    (async () => {
      try {
        const tid = localStorage.getItem('fc_tenant_id');
        if (!tid) return;
        const r = await api.get('/church-info');
        const n = String(r?.data?.name || '').trim();
        if (n) setBrand(n);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (brand) document.title = `${brand} · Login`;
  }, [brand]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload: any = { email, password };
      if (requireOtp && otp) payload.otp = otp;
      if (loginType !== 'MEMBER' && tenant) payload.tenantSlug = tenant;
      const { data } = await api.post('/auth/login', payload);
      // Store session token and role only
      localStorage.setItem('fc_token', data.token);
      if (data?.csrfToken) localStorage.setItem('fc_csrf', String(data.csrfToken));
      else localStorage.removeItem('fc_csrf');
      localStorage.setItem('fc_role', data.role);
      if (data.tenantId !== undefined && data.tenantId !== null) localStorage.setItem('fc_tenant_id', String(data.tenantId));
      else localStorage.removeItem('fc_tenant_id');
      // Decode JWT exp for local session expiration awareness
      try {
        const parts = String(data.token).split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]));
          if (payload && payload.exp) localStorage.setItem('fc_token_exp', String(payload.exp));
        }
      } catch {}
      // Remember email only if opted in
      if (rememberEmail) {
        localStorage.setItem('fc_remember_email', '1');
        localStorage.setItem('fc_email', email);
      } else {
        localStorage.removeItem('fc_remember_email');
        localStorage.removeItem('fc_email');
      }
      navigate(next || '/dashboard');
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
        setError('Email or password is incorrect. If you forgot your password, contact your administrator.');
      } else if (status === 403 && msg.toLowerCase().includes('pending')) {
        setError('Your account is pending approval. Please wait for an administrator to approve your registration.');
      } else if (!err?.response && !!err?.request) {
        setError('Cannot reach backend server. Ensure it is running on the configured API base URL.');
      } else {
        setError(msg);
      }
      try { console.warn('[Login] failed', { status, msg }); } catch {}
    }
  };

  // Clear password from memory on unmount
  useEffect(() => {
    return () => setPassword('');
  }, []);

  return (
    <div className="h-full flex items-center justify-center bg-faith-white dark:bg-gray-900">
      <form onSubmit={login} className="card w-full max-w-md" autoComplete="off">
        <h2 className="text-2xl font-bold mb-4">{brand} Login</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        <label className="block mb-2">
          <span className="text-sm">Login as</span>
          <select value={loginType} onChange={e=>setLoginType(e.target.value as any)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700">
            <option value="MEMBER">Member</option>
            <option value="ADMIN">Admin/Staff</option>
          </select>
        </label>
        <label className="block mb-2">
          <span className="text-sm">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
        </label>
        {loginType !== 'MEMBER' && (
          <label className="block mb-2">
            <span className="text-sm">Church</span>
            <input type="text" placeholder="e.g. my-church" value={tenant} onChange={e=>setTenant(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
          </label>
        )}
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
        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={rememberEmail} onChange={e=>setRememberEmail(e.target.checked)} />
            Remember my email
          </label>
          {rememberEmail && <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Email will be remembered</span>}
          {!error && debug && (roleHint === 'admin' || roleHint === 'member') && (
            <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">Debug: sample credentials prefilled</span>
          )}
        </div>
        <button className="btn-primary w-full" type="submit">Login</button>
        <div className="mt-3 text-sm">
          <a href="/signup" className="underline">Not a Member ? Register</a>
        </div>
      </form>
    </div>
  );
}
