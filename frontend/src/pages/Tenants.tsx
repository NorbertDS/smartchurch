import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

type Tenant = { id: number; name: string; slug: string; status: string; createdAt: string; archivedAt?: string | null };

export default function Tenants() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Tenant[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [createForm, setCreateForm] = useState<{ name: string; slug: string; clientId: string }>({ name: '', slug: '', clientId: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState('');
  const [billingEdit, setBillingEdit] = useState<{ [id: number]: { plan: string; seats: string; price: string; renewAt: string } }>({});

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/provider/tenants', { params: { q, page, pageSize } });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, pageSize]);

  async function createTenant() {
    setError(''); setInfo('');
    if (!createForm.name.trim() || !createForm.slug.trim()) {
      setError('Name and slug required'); return;
    }
    try {
      const { data } = await api.post('/provider/tenants', { name: createForm.name.trim(), slug: createForm.slug.trim(), clientId: createForm.clientId.trim() || undefined });
      setCreateForm({ name: '', slug: '', clientId: '' });
      setItems(prev => [data, ...prev]);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create tenant');
    }
  }

  async function archiveTenant(id: number) {
    setError(''); setInfo('');
    try {
      const { data } = await api.patch(`/provider/tenants/${id}/archive`);
      setItems(prev => prev.map(t => t.id === id ? data : t));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to archive tenant');
    }
  }

  async function suspendTenant(id: number) {
    setError(''); setInfo('');
    try {
      const { data } = await api.patch(`/provider/tenants/${id}/suspend`);
      setItems(prev => prev.map(t => t.id === id ? data : t));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to suspend tenant');
    }
  }

  async function activateTenant(id: number) {
    setError(''); setInfo('');
    try {
      const { data } = await api.patch(`/provider/tenants/${id}/activate`);
      setItems(prev => prev.map(t => t.id === id ? data : t));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to activate tenant');
    }
  }

  async function setBilling(t: Tenant) {
    setError(''); setInfo('');
    const plan = window.prompt('Plan (e.g., basic, pro):', 'basic');
    if (plan === null) return;
    const seatsStr = window.prompt('Seats:', '50');
    if (seatsStr === null) return;
    const priceStr = window.prompt('Price per month:', '20');
    if (priceStr === null) return;
    const renewAt = window.prompt('Renewal date (YYYY-MM-DD):', '2026-01-01') || undefined;
    const seats = Number(seatsStr || '0');
    const price = Number(priceStr || '0');
    try {
      const { data } = await api.put(`/provider/tenants/${t.id}/billing`, { plan, seats, price, renewAt });
      setItems(prev => prev.map(x => x.id === t.id ? { ...x, status: data.status } : x));
      setInfo(`Billing updated for ${t.name}`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update billing');
    }
  }

  async function impersonateTenant(t: Tenant) {
    setError(''); setInfo('');
    try {
      const { data } = await api.post(`/provider/tenants/${t.id}/impersonate`);
      localStorage.setItem('fc_token', data.token);
      localStorage.setItem('fc_role', 'ADMIN');
      localStorage.setItem('fc_tenant_id', String(t.id));
      window.location.href = '/dashboard';
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to impersonate');
    }
  }

  async function assignAdmin(t: Tenant) {
    setError(''); setInfo('');
    try {
      const { data } = await api.post(`/provider/tenants/${t.id}/bootstrap-admin`);
      if (data?.tempPassword) setInfo(`Admin ready for ${t.name}. Email: ${data.email} · Temp Password: ${data.tempPassword}`);
      else setInfo(`Admin ${data?.status === 'exists' ? 'already exists' : 'created'} for ${t.name}. Email: ${data?.email}`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to assign admin');
    }
  }

  async function manageTenant(t: Tenant) { navigate(`/provider/tenants/${t.id}/manage`); }

  // duplicate functions removed

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Tenant Management</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {info && <div className="text-green-700 mb-2">{info}</div>}
      <div className="card mb-4">
        <div className="font-semibold mb-2">Create Tenant</div>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="Name" value={createForm.name} onChange={e=>setCreateForm(f=>({ ...f, name: e.target.value }))} />
          <input className="input flex-1" placeholder="Slug (e.g. my-church)" value={createForm.slug} onChange={e=>setCreateForm(f=>({ ...f, slug: e.target.value }))} />
          <input className="input flex-1" placeholder="Client ID (optional)" value={createForm.clientId} onChange={e=>setCreateForm(f=>({ ...f, clientId: e.target.value }))} />
          <button className="btn" onClick={createTenant}>Create</button>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input className="input" placeholder="Search by name or slug" value={q} onChange={e=>setQ(e.target.value)} />
        <button className="btn" onClick={load}>Search</button>
      </div>
      {loading ? (
        <div className="p-4">Loading…</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Slug</th>
              <th className="p-2">Status</th>
              <th className="p-2">Created</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map(t => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.name}</td>
                <td className="p-2">{t.slug}</td>
                <td className="p-2">{t.status}{t.archivedAt ? ' · archived' : ''}</td>
                <td className="p-2">{new Date(t.createdAt).toLocaleString()}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <button className="text-xs px-2 py-1 border rounded" onClick={()=>manageTenant(t)}>Manage</button>
                    {/* All other actions are moved to Manage page */}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-2 text-xs">Total: {total}</div>
    </div>
  );
}
