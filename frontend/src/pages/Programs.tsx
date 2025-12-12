import { useEffect, useState, useMemo } from 'react';
import api from '../api/client';
import DateTimePicker from '../components/DateTimePicker';

interface ProgramItem {
  id: number;
  name: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  location?: string | null;
  status?: string | null;
}

export default function Programs() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const canManage = role && ['ADMIN','CLERK','PASTOR'].includes(role);
  const canDelete = role && ['ADMIN','CLERK'].includes(role);

  const [list, setList] = useState<ProgramItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<string>(()=> new Date().toISOString().slice(0,16));
  const [endDate, setEndDate] = useState<string>('');
  const [location, setLocation] = useState('');
  const [status, setStatus] = useState('Planned');
  const [description, setDescription] = useState('');

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // View details modal state
  const [viewId, setViewId] = useState<number | null>(null);
  const viewing = useMemo(()=> list.find(p => p.id === viewId) || null, [list, viewId]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/programs');
      setList(data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ load(); },[]);

  const createProgram = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.post('/programs', { name, startDate, endDate: endDate || undefined, location: location || undefined, status, description: description || undefined });
      setName(''); setStartDate(new Date().toISOString().slice(0,16)); setEndDate(''); setLocation(''); setStatus('Planned'); setDescription('');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create program');
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (p: ProgramItem) => {
    setEditingId(p.id);
    setEditName(p.name);
    try { setEditStart(new Date(p.startDate).toISOString().slice(0,16)); } catch { setEditStart(''); }
    setEditEnd(p.endDate ? new Date(p.endDate).toISOString().slice(0,16) : '');
    setEditLocation(p.location || '');
    setEditStatus(p.status || '');
    setEditDescription(p.description || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      setLoading(true);
      setError(null);
      await api.put(`/programs/${editingId}`, { name: editName, startDate: editStart || undefined, endDate: editEnd || undefined, location: editLocation || undefined, status: editStatus || undefined, description: editDescription || undefined });
      setEditingId(null);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update program');
    } finally {
      setLoading(false);
    }
  };

  const deleteProgram = async (id: number) => {
    if (!canDelete) return;
    if (!confirm('Delete this program?')) return;
    try {
      setLoading(true);
      setError(null);
      await api.delete(`/programs/${id}`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete program');
    } finally {
      setLoading(false);
    }
  };

  const upcoming = useMemo(()=> list.sort((a,b)=> new Date(a.startDate).getTime() - new Date(b.startDate).getTime()), [list]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Church Programs</h2>
        <a href="/events" className="btn">Go to Events</a>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {loading && <div className="p-2">Loading…</div>}

      {/* View Details Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4 w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Program Details</h3>
              <button className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded" onClick={()=>setViewId(null)}>Close</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-medium">Name:</span> {viewing.name}</div>
              <div><span className="font-medium">Start:</span> {new Date(viewing.startDate).toLocaleString()}</div>
              {viewing.endDate && <div><span className="font-medium">End:</span> {new Date(viewing.endDate).toLocaleString()}</div>}
              {viewing.location && <div><span className="font-medium">Location:</span> {viewing.location}</div>}
              {viewing.status && <div><span className="font-medium">Status:</span> {viewing.status}</div>}
              <div>
                <div className="font-medium mb-1">Description</div>
                <div className="bg-gray-50 dark:bg-gray-700 p-2 rounded min-h-[48px]">{viewing.description || '-'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {canManage && (
        <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-semibold mb-3">Create Program</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block"><span className="text-sm">Name</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={name} onChange={e=>setName(e.target.value)} /></label>
            <DateTimePicker label="Start" value={startDate} onChange={setStartDate} withTime ariaLabel="Program start" />
            <DateTimePicker label="End" value={endDate} onChange={setEndDate} withTime ariaLabel="Program end" />
            <label className="block"><span className="text-sm">Location</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={location} onChange={e=>setLocation(e.target.value)} /></label>
            <label className="block"><span className="text-sm">Status</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={status} onChange={e=>setStatus(e.target.value)} /></label>
            <label className="block md:col-span-2"><span className="text-sm">Description</span><textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={description} onChange={e=>setDescription(e.target.value)} /></label>
          </div>
          <div className="mt-3"><button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" disabled={loading || !name || !startDate} onClick={createProgram}>Create</button></div>
        </section>
      )}

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-3">Programs</h3>
        <ul className="space-y-2">
          {upcoming.map(p => (
            <li key={p.id} className="border rounded p-3">
              {editingId === p.id ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block"><span className="text-sm">Name</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editName} onChange={e=>setEditName(e.target.value)} /></label>
                  <DateTimePicker label="Start" value={editStart} onChange={setEditStart} withTime ariaLabel="Edit program start" />
                  <DateTimePicker label="End" value={editEnd} onChange={setEditEnd} withTime ariaLabel="Edit program end" />
                  <label className="block"><span className="text-sm">Location</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editLocation} onChange={e=>setEditLocation(e.target.value)} /></label>
                  <label className="block"><span className="text-sm">Status</span><input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editStatus} onChange={e=>setEditStatus(e.target.value)} /></label>
                  <label className="block md:col-span-2"><span className="text-sm">Description</span><textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editDescription} onChange={e=>setEditDescription(e.target.value)} /></label>
                  <div className="md:col-span-2 flex gap-2">
                    <button className="px-3 py-1 bg-blue-600 text-white rounded" onClick={saveEdit} disabled={loading}>Save</button>
                    <button className="px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded" onClick={()=>setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-gray-600">{new Date(p.startDate).toLocaleString()} {p.endDate ? `— ${new Date(p.endDate).toLocaleString()}` : ''} {p.location ? `· ${p.location}` : ''}</div>
                    {p.status && <div className="text-xs text-gray-500">Status: {p.status}</div>}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded" onClick={()=>setViewId(p.id)}>View</button>
                      <button className="px-3 py-1 text-sm bg-faith-blue text-white rounded" onClick={()=>startEdit(p)}>Edit</button>
                      {canDelete && <button className="px-3 py-1 text-sm bg-red-600 text-white rounded" onClick={()=>deleteProgram(p.id)}>Delete</button>}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
          {upcoming.length === 0 && <li className="text-sm text-gray-600">No programs yet.</li>}
        </ul>
      </section>
    </div>
  );
}
