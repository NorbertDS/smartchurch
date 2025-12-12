import { useEffect, useState } from 'react';
import api from '../api/client';
import { useNavigate, useLocation } from 'react-router-dom';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [gender, setGender] = useState<'MALE'|'FEMALE'|'OTHER'>('OTHER');
  const [groups, setGroups] = useState<{ id: number; name: string; location?: string | null; description?: string | null }[]>([]);
  const [groupId, setGroupId] = useState<number | ''>('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [churchName, setChurchName] = useState('');
  const [churchAbbreviation, setChurchAbbreviation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const next = params.get('next');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const q = churchName.trim();
      if (!q) { setError('Please enter your Church name'); setLoading(false); return; }
      if (!groupId || typeof groupId !== 'number') { setError('Please select your Cell Group'); setLoading(false); return; }
      const resolved = await api.get('/auth/tenant-resolve', { params: { q } });
      const tenantId = Number(resolved.data?.id || 0);
      if (!tenantId) { setError('Church not found'); setLoading(false); return; }
      const { data } = await api.post('/auth/public-register', { name: name.trim(), email: email.trim(), password, gender, cellGroupId: groupId, contact: contact.trim() || undefined, address: address.trim() || undefined }, { headers: { 'x-tenant-id': String(tenantId) } });
      // Expect pending approval response; do not store token or redirect
      if (data?.status === 'pending_approval') {
        setSuccess(data?.message || 'Registration submitted. Awaiting admin approval.');
      } else {
        setSuccess('Registration submitted. Awaiting admin approval.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Prefill church name if current tenant context exists
    (async () => {
      try {
        const tid = localStorage.getItem('fc_tenant_id');
        if (!tid) return;
        const r = await api.get('/church-info');
        const n = String(r?.data?.name || '').trim();
        const abbr = String(r?.data?.abbreviation || '').trim();
        if (n) setChurchName(prev => prev || n);
        if (abbr) setChurchAbbreviation(abbr);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedTid = localStorage.getItem('fc_tenant_id');
        if (storedTid) {
          const list = await api.get('/auth/public-cell-groups', { headers: { 'x-tenant-id': String(storedTid) } });
          if (!cancelled) setGroups(Array.isArray(list.data) ? list.data : []);
          return;
        }
        const q = churchName.trim();
        if (!q) { if (!cancelled) { setGroups([]); setGroupId(''); } return; }
        const resolved = await api.get('/auth/tenant-resolve', { params: { q } });
        const tenantId = Number(resolved.data?.id || 0);
        if (!tenantId) { if (!cancelled) setGroups([]); return; }
        const list = await api.get('/auth/public-cell-groups', { headers: { 'x-tenant-id': String(tenantId) } });
        if (!cancelled) setGroups(Array.isArray(list.data) ? list.data : []);
      } catch {
        if (!cancelled) setGroups([]);
      }
    })();
    return () => { cancelled = true; };
  }, [churchName]);

  return (
    <div className="h-full flex items-center justify-center bg-faith-white dark:bg-gray-900">
      <form onSubmit={submit} className="card w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Create Account</h2>
        {error && <div className="text-red-600 mb-2">{error}</div>}
        {success && <div className="text-green-700 mb-2">{success}</div>}
        <label className="block mb-2">
          <span className="text-sm">Church name</span>
          <input data-testid="church-name" aria-label="Church name" value={churchName} onChange={e=>setChurchName(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" placeholder={churchAbbreviation ? `e.g., ${churchAbbreviation}` : undefined} />
        </label>
        <label className="block mb-2">
          <span className="text-sm">Full Name</span>
          <input value={name} onChange={e=>setName(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" required />
        </label>
        <label className="block mb-2">
          <span className="text-sm">Email</span>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" required />
        </label>
        <label className="block mb-4">
          <span className="text-sm">Password</span>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" required />
        </label>
        <label className="block mb-2">
          <span className="text-sm">Cell Group</span>
          <select value={groupId} onChange={e=>setGroupId(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700">
            <option value="">Select cell group…</option>
            {groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}{g.location ? ` — ${g.location}` : ''}{g.description ? ` — ${g.description}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-sm">Gender</span>
            <select value={gender} onChange={e=>setGender(e.target.value as any)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700">
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Contact</span>
            <input value={contact} onChange={e=>setContact(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm">Address</span>
            <input value={address} onChange={e=>setAddress(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
          </label>
        </div>
        <button className="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Creating...' : 'Create Account'}</button>
        <div className="mt-3 text-sm">
          <a href="/login" className="underline">Already approved? Log in</a>
        </div>
      </form>
    </div>
  );
}
