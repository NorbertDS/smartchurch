import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import SectionLayout from '../templates/SectionLayout';

interface CouncilMember { id: number; memberId: number; role: string; member?: { id: number; firstName: string; lastName: string; phone?: string; email?: string } }
interface Council { id: number; name: string; description?: string; contactEmail?: string; contactPhone?: string; meetingSchedule?: string; members?: CouncilMember[] }

export default function Councils() {
  const [items, setItems] = useState<Council[]>([]);
  const [q, setQ] = useState<string>('');
  const [createForm, setCreateForm] = useState<{ name: string; description: string }>({ name: '', description: '' });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/councils', { params: { q } });
      setItems(res.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load councils');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <SectionLayout title="Councils Directory" description="Browse and manage councils, their members, and resources.">
      <div className="flex items-center justify-between">
        <div className="sr-only" aria-hidden="true"></div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or purpose" className="input" />
          <button className="btn" onClick={load}>Search</button>
        </div>
      </div>
      {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
        <div className="card">
          <div className="text-lg font-semibold mb-2">Create Council</div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Name" value={createForm.name} onChange={e=>setCreateForm(f=>({ ...f, name: e.target.value }))} />
            <input className="input flex-1" placeholder="Description" value={createForm.description} onChange={e=>setCreateForm(f=>({ ...f, description: e.target.value }))} />
            <button className="btn" onClick={async()=>{
              if (!createForm.name.trim()) return alert('Name required');
              try {
                await api.post('/councils', { name: createForm.name.trim(), description: createForm.description });
                setCreateForm({ name: '', description: '' });
                await load();
              } catch (e: any) { alert(e?.response?.data?.message || 'Failed to create'); }
            }}>Create</button>
          </div>
        </div>
      )}
      {error && <div className="p-2 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(c => (
            <div key={c.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{c.name}</div>
                  {c.description && (<div className="text-sm text-gray-600">{c.description}</div>)}
                </div>
                <div className="text-sm text-gray-600">
                  {c.meetingSchedule || 'Schedule TBD'}
                </div>
              </div>
              <div className="mt-2 text-sm">
                <div className="text-gray-600">Contact</div>
                <div>{c.contactEmail || '—'} · {c.contactPhone || '—'}</div>
              </div>
              <div className="mt-2">
                <div className="text-sm text-gray-600">Members</div>
                {(c.members || []).length === 0 ? (
                  <div className="text-sm">No members listed.</div>
                ) : (
                  <ul className="text-sm list-disc list-inside">
                    {c.members?.map(m => (
                      <li key={m.id} className="flex items-center justify-between">
                        <span>{m.member?.firstName} {m.member?.lastName} {m.role ? `· ${m.role}` : ''}</span>
                        {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
                          <button className="text-xs px-2 py-1 border rounded" onClick={async ()=>{
                            if (!confirm('Remove this member from council?')) return;
                            try { await api.delete(`/councils/${c.id}/members/${m.id}`); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to remove'); }
                          }}>Remove</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-2 flex items-center justify-end">
                <Link className="text-blue-600 underline text-sm" to={`/councils/${c.id}`}>Details</Link>
              </div>
              {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
                <div className="mt-2 p-2 border rounded">
                  <div className="text-sm font-medium mb-1">Manage Membership</div>
                  <div className="flex flex-wrap items-end gap-2">
                    <input className="input" placeholder="Member ID" id={`member-${c.id}`} />
                    <input className="input" placeholder="Role (optional)" id={`role-${c.id}`} />
                    <button className="btn" onClick={async ()=>{
                      const mid = Number((document.getElementById(`member-${c.id}`) as HTMLInputElement)?.value || '');
                      const r = (document.getElementById(`role-${c.id}`) as HTMLInputElement)?.value || '';
                      if (!mid) { alert('Enter a valid Member ID'); return; }
                      try { await api.post(`/councils/${c.id}/members`, { memberId: mid, role: r || undefined }); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to add member'); }
                    }}>Add Member</button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Use the Members directory to look up IDs.</p>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-sm text-gray-600">No councils found.</div>
          )}
        </div>
      )}
    </SectionLayout>
  );
}
