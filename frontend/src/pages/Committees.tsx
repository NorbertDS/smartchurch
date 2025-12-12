import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import SectionLayout from '../templates/SectionLayout';

interface CommitteeMember { id: number; memberId: number; role?: string; member?: { id: number; firstName: string; lastName: string; phone?: string; email?: string } }
interface Committee { id: number; name: string; chairId?: number | null; responsibilities?: string; meetingFrequency?: string; chair?: { id: number; firstName: string; lastName: string; phone?: string; email?: string }; members?: CommitteeMember[] }

export default function Committees() {
  const [items, setItems] = useState<Committee[]>([]);
  const [q, setQ] = useState<string>('');
  const [sort, setSort] = useState<'name'|'frequency'>('name');
  const [createForm, setCreateForm] = useState<{ name: string; responsibilities: string }>({ name: '', responsibilities: '' });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/committees', { params: { q, sort } });
      setItems(res.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to load committees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <SectionLayout title="Committees Directory" description="Browse and manage committees, their membership, and resources.">
      <div className="flex items-center justify-between">
        <div className="sr-only" aria-hidden="true"></div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or responsibilities" className="input" />
          <select className="input" value={sort} onChange={e=>setSort(e.target.value as any)}>
            <option value="name">Sort: Name</option>
            <option value="frequency">Sort: Meeting Frequency</option>
          </select>
          <button className="btn" onClick={load}>Apply</button>
        </div>
      </div>
      {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
        <div className="card">
          <div className="text-lg font-semibold mb-2">Create Committee</div>
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="Name" value={createForm.name} onChange={e=>setCreateForm(f=>({ ...f, name: e.target.value }))} />
            <input className="input flex-1" placeholder="Responsibilities" value={createForm.responsibilities} onChange={e=>setCreateForm(f=>({ ...f, responsibilities: e.target.value }))} />
            <button className="btn" onClick={async()=>{
              if (!createForm.name.trim()) return alert('Name required');
              try {
                await api.post('/committees', { name: createForm.name.trim(), responsibilities: createForm.responsibilities });
                setCreateForm({ name: '', responsibilities: '' });
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
                  {c.responsibilities && (<div className="text-sm text-gray-600">{c.responsibilities}</div>)}
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-600">{c.meetingFrequency || '—'}</div>
                  <Link className="text-blue-600 underline text-sm" to={`/committees/${c.id}`}>Details</Link>
                </div>
              </div>
              <div className="mt-2 text-sm">
                <div className="text-gray-600">Chairperson</div>
                <div>{c.chair ? `${c.chair.firstName} ${c.chair.lastName}` : '—'}</div>
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
                            if (!confirm('Remove this member from committee?')) return;
                            try { await api.delete(`/committees/${c.id}/members/${m.id}`); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to remove'); }
                          }}>Remove</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
                <div className="mt-2 p-2 border rounded">
                  <div className="text-sm font-medium mb-1">Manage Membership</div>
                  <div className="flex flex-wrap items-end gap-2">
                    <input className="input" placeholder="Member ID" id={`comm-member-${c.id}`} />
                    <input className="input" placeholder="Role (optional)" id={`comm-role-${c.id}`} />
                    <button className="btn" onClick={async ()=>{
                      const mid = Number((document.getElementById(`comm-member-${c.id}`) as HTMLInputElement)?.value || '');
                      const r = (document.getElementById(`comm-role-${c.id}`) as HTMLInputElement)?.value || '';
                      if (!mid) { alert('Enter a valid Member ID'); return; }
                      try { await api.post(`/committees/${c.id}/members`, { memberId: mid, role: r || undefined }); await load(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to add member'); }
                    }}>Add Member</button>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Use the Members directory to look up IDs.</p>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-sm text-gray-600">No committees found.</div>
          )}
        </div>
      )}
    </SectionLayout>
  );
}
