import { useEffect, useState } from 'react';
import api from '../api/client';

type Link = { id: number; url: string; title: string; active: boolean; qrImagePath?: string | null; updatedAt: string; scanCount?: number };

export default function QRAdmin() {
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  const tenantId = localStorage.getItem('fc_tenant_id');
  const [items, setItems] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<{ url: string; title: string; active: boolean }>({ url: '', title: '', active: false });
  const [editing, setEditing] = useState<Link | null>(null);

  const load = async () => {
    try { setLoading(true); const { data } = await api.get('/qr/links'); setItems(Array.isArray(data) ? data : []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (role === 'ADMIN') {
      if (!tenantId) { setError('Select a tenant to manage QR codes'); return; }
      load();
    }
  }, [role, tenantId]);

  const resetForm = () => { setForm({ url: '', title: '', active: false }); setEditing(null); };

  const save = async () => {
    setError(''); setMsg('');
    const url = (form.url || '').trim();
    const title = (form.title || '').trim();
    if (!/^https?:\/\//i.test(url)) { setError('Enter a valid http(s) URL'); return; }
    if (!title || title.length > 100) { setError('Title required (≤100 chars)'); return; }
    try {
      if (editing) {
        await api.put(`/qr/links/${editing.id}`, { url, title, active: form.active });
      } else {
        await api.post('/qr/links', { url, title, active: form.active });
      }
      setMsg('Saved'); setTimeout(()=>setMsg(''), 2000);
      resetForm(); await load();
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save'); }
  };

  const remove = async (id: number) => { if (!confirm('Delete this link?')) return; try { await api.delete(`/qr/links/${id}`); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to delete'); } };
  const activate = async (id: number) => { try { await api.put(`/qr/links/${id}`, { active: true }); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to activate'); } };

  return (
    <div className="container">
      <h2 className="text-2xl font-bold mb-3">QR Code Management</h2>
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      {error && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      <div className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm">URL<input className="mt-1 fc-input" value={form.url} onChange={e=>setForm(f=>({ ...f, url: e.target.value }))} placeholder="https://example.com" /></label>
          <label className="text-sm">Title<input className="mt-1 fc-input" maxLength={100} value={form.title} onChange={e=>setForm(f=>({ ...f, title: e.target.value }))} placeholder="Caption (≤100 chars)" /></label>
          <div className="flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={e=>setForm(f=>({ ...f, active: e.target.checked }))} /> Active</div>
          <div className="md:col-span-3 flex gap-2">
            <button className="btn-primary" onClick={save}>{editing ? 'Update' : 'Create'}</button>
            {editing && <button className="btn" onClick={resetForm}>Cancel</button>}
          </div>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        {loading ? (<div>Loading…</div>) : (
          <table className="min-w-full text-sm">
            <thead><tr><th className="border px-2 py-1">Title</th><th className="border px-2 py-1">URL</th><th className="border px-2 py-1">Status</th><th className="border px-2 py-1">Updated</th><th className="border px-2 py-1">Scans</th><th className="border px-2 py-1">QR</th><th className="border px-2 py-1">Actions</th></tr></thead>
            <tbody>
              {items.map(l => (
                <tr key={l.id}>
                  <td className="border px-2 py-1">{l.title}</td>
                  <td className="border px-2 py-1"><a className="text-faith-blue underline" href={l.url} target="_blank" rel="noreferrer">{l.url}</a></td>
                  <td className="border px-2 py-1">{l.active ? 'ACTIVE' : 'INACTIVE'}</td>
                  <td className="border px-2 py-1">{new Date(l.updatedAt).toLocaleString()}</td>
                  <td className="border px-2 py-1">{typeof l.scanCount === 'number' ? l.scanCount : 0}</td>
                  <td className="border px-2 py-1">{l.qrImagePath ? (<img src={`${api.defaults.baseURL}/uploads/${l.qrImagePath}`} alt="QR" className="w-16 h-16" />) : '-'}</td>
                  <td className="border px-2 py-1">
                    <div className="flex gap-2">
                      <button className="btn" onClick={()=>{ setEditing(l); setForm({ url: l.url, title: l.title, active: l.active }); }}>Edit</button>
                      <button className="btn" onClick={()=>activate(l.id)}>Activate</button>
                      <button className="btn-red" onClick={()=>remove(l.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
