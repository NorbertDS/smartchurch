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
  const [status, setStatus] = useState<string>('');
  const [sort, setSort] = useState<string>('createdAt');
  const [order, setOrder] = useState<string>('desc');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSlug, setCreateSlug] = useState('');
  const [createClientId, setCreateClientId] = useState('');
  const [createStatus, setCreateStatus] = useState<string>('ACTIVE');

  async function load() {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/provider/tenants', { params: { q, page, pageSize, sort, order, status } });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [page, pageSize, sort, order, status]);
  useEffect(() => { setPage(1); }, [q, pageSize, sort, order, status]);

  async function manageTenant(t: Tenant) { navigate(`/provider/tenants/${t.id}/manage`); }

  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize));
  const prevPage = () => setPage(p => Math.max(1, p - 1));
  const nextPage = () => setPage(p => Math.min(totalPages, p + 1));

  function normalizeSlug(v: string) {
    return String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  }

  function validateCreate() {
    const nameOk = createName.trim().length >= 2;
    const slug = normalizeSlug(createSlug);
    const slugOk = /^[a-z0-9-]{3,32}$/.test(slug);
    if (!nameOk) return 'Name must be at least 2 characters';
    if (!slugOk) return 'Slug must be 3–32 chars: letters/numbers/-';
    return '';
  }

  async function createTenant() {
    setError(''); setInfo('');
    const msg = validateCreate();
    if (msg) { setError(msg); return; }
    try {
      const payload: any = {
        name: createName.trim(),
        slug: normalizeSlug(createSlug),
        status: createStatus,
      };
      if (createClientId.trim()) payload.clientId = createClientId.trim();
      const { data } = await api.post('/provider/tenants', payload);
      setInfo(`Tenant created: ${data?.name || payload.name}`);
      setCreateOpen(false);
      setCreateName('');
      setCreateSlug('');
      setCreateClientId('');
      setCreateStatus('ACTIVE');
      setPage(1);
      await load();
      if (data?.id) navigate(`/provider/tenants/${data.id}/manage`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create tenant');
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2">Tenant Management</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {info && <div className="text-green-700 mb-2">{info}</div>}
      <div className="card mb-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="font-semibold">Search & Filters</div>
          <button className="btn-primary" onClick={() => setCreateOpen(v => !v)}>{createOpen ? 'Close' : 'Create Tenant'}</button>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-5 gap-2">
          <input className="input md:col-span-2" placeholder="Search by name or slug" value={q} onChange={e=>setQ(e.target.value)} />
          <select className="input" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <select className="input" value={`${sort}:${order}`} onChange={e=>{ const [s,o]=String(e.target.value).split(':'); setSort(s); setOrder(o); }}>
            <option value="createdAt:desc">Created (newest)</option>
            <option value="createdAt:asc">Created (oldest)</option>
            <option value="name:asc">Name (A–Z)</option>
            <option value="name:desc">Name (Z–A)</option>
            <option value="slug:asc">Slug (A–Z)</option>
            <option value="slug:desc">Slug (Z–A)</option>
            <option value="status:asc">Status (A–Z)</option>
            <option value="status:desc">Status (Z–A)</option>
          </select>
          <select className="input" value={String(pageSize)} onChange={e=>setPageSize(Number(e.target.value || 20))}>
            <option value="10">10 / page</option>
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
          <div className="text-xs text-gray-600">Page {page} / {totalPages} · Total {total}</div>
        </div>

        {createOpen && (
          <div className="mt-4 border rounded p-3 space-y-2">
            <div className="font-semibold text-sm">Create Tenant</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label className="block">
                <span className="text-sm">Name</span>
                <input className="input" value={createName} onChange={e=>{ setCreateName(e.target.value); if (!createSlug.trim()) setCreateSlug(normalizeSlug(e.target.value)); }} />
              </label>
              <label className="block">
                <span className="text-sm">Slug</span>
                <input className="input" value={createSlug} onChange={e=>setCreateSlug(e.target.value)} onBlur={()=>setCreateSlug(normalizeSlug(createSlug))} placeholder="e.g. grace-chapel" />
              </label>
              <label className="block">
                <span className="text-sm">Client ID (optional)</span>
                <input className="input" value={createClientId} onChange={e=>setCreateClientId(e.target.value)} placeholder="Billing/customer reference" />
              </label>
              <label className="block">
                <span className="text-sm">Initial Status</span>
                <select className="input" value={createStatus} onChange={e=>setCreateStatus(e.target.value)}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button className="btn-primary" onClick={createTenant}>Create</button>
              <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => { setCreateOpen(false); setCreateName(''); setCreateSlug(''); setCreateClientId(''); setCreateStatus('ACTIVE'); }}>Cancel</button>
              <div className="text-xs text-gray-600">{validateCreate() || 'Ready'}</div>
            </div>
          </div>
        )}
      </div>
      {loading ? (
        <div className="p-4">Loading…</div>
      ) : (
        <div className="card overflow-auto">
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
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td className="p-3 text-sm text-gray-600" colSpan={5}>No tenants found.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="p-3 flex items-center justify-between gap-2 flex-wrap text-sm">
            <div>Page {page} / {totalPages}</div>
            <div className="flex items-center gap-2">
              <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={prevPage} disabled={page <= 1}>Prev</button>
              <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={nextPage} disabled={page >= totalPages}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
