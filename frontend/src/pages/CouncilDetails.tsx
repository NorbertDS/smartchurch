import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

interface Member { id: number; firstName: string; lastName: string; phone?: string; email?: string }
interface CouncilMember { id: number; role?: string; member?: Member }
interface Council { id: number; name: string; description?: string; contact?: string; meetingSchedule?: string; members?: CouncilMember[] }
interface Resource { filename: string; originalname: string; uploadedAt: string; url: string }

export default function CouncilDetails() {
  const { id } = useParams();
  const [council, setCouncil] = useState<Council | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get(`/councils/${id}`);
      setCouncil(res.data);
      const r = await api.get(`/councils/${id}/resources`);
      setResources(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load council');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const upload = async () => {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData(); fd.append('file', file);
      await api.post(`/councils/${id}/resources`, fd);
      setFile(null);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  return (
    <div className="space-y-4">
      {loading ? (<div>Loading…</div>) : error ? (<div className="p-2 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>) : council && (
        <>
          <div className="card">
            <div className="text-xl font-semibold">{council.name}</div>
            {council.description && (<div className="text-sm text-gray-700 mt-1">{council.description}</div>)}
            <div className="mt-2 text-sm">Meeting schedule: {council.meetingSchedule || '—'}</div>
          </div>

          <div className="card">
            <div className="text-lg font-semibold mb-2">Members</div>
            {(council.members || []).length === 0 ? (
              <div className="text-sm text-gray-600">No members yet.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {council.members!.map(m => (
                  <li key={m.id} className="flex items-center justify-between border rounded p-2">
                    <span>{m.member?.firstName} {m.member?.lastName} {m.role ? `· ${m.role}` : ''}</span>
                    {m.member?.email && <span className="text-gray-600">{m.member.email}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="text-lg font-semibold mb-2">Resources & Documents</div>
            {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
              <div className="flex items-end gap-2 mb-2">
                <input type="file" className="input" onChange={e=>setFile(e.target.files?.[0] || null)} />
                <button className="btn" disabled={uploading} onClick={upload}>{uploading ? 'Uploading…' : 'Upload'}</button>
              </div>
            )}
            {(resources || []).length === 0 ? (
              <div className="text-sm text-gray-600">No resources uploaded.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {resources.map(r => (
                  <li key={r.filename}><a className="text-blue-600 underline" href={r.url} target="_blank" rel="noreferrer">{r.originalname}</a> <span className="text-gray-600">({new Date(r.uploadedAt).toLocaleString()})</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <div className="text-lg font-semibold mb-2">Recent Minutes (Board/Business)</div>
            <CouncilMinutes name={council.name} />
          </div>
        </>
      )}
    </div>
  );
}

function CouncilMinutes({ name }: { name: string }) {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const [b, bs] = await Promise.all([
          api.get('/minutes/board', { params: { q: name } }),
          api.get('/minutes/business', { params: { q: name } }),
        ]);
        const list = [...(b.data || []), ...(bs.data || [])].slice(0, 10);
        setItems(list);
      } catch {}
    })();
  }, [name]);
  return (
    items.length === 0 ? (<div className="text-sm text-gray-600">No matching minutes.</div>) : (
      <ul className="text-sm space-y-1">
        {items.map(it => (
          <li key={`${it.type||'X'}-${it.id}`}><span className="font-medium">{new Date(it.meetingDate).toLocaleDateString()}</span> · {it.title} · <a className="text-blue-600 underline" href={api.defaults.baseURL ? new URL(it.filePath, api.defaults.baseURL!).toString() : it.filePath} target="_blank" rel="noreferrer">Open</a></li>
        ))}
      </ul>
    )
  );
}
