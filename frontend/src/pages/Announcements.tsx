import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';

interface Announcement { id: number; title: string; content: string; createdAt: string; audience?: string }

export default function Announcements() {
  const [list, setList] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  const canManage = ['ADMIN','CLERK','PASTOR'].includes(role);

  const load = async () => {
    const res = await api.get('/announcements');
    setList(res.data);
    setLoading(false);
  };

  useEffect(() => {
    const aud = searchParams.get('audience');
    if (aud) setAudience(aud);
    load();
  }, [searchParams]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/announcements', { title, content, audience });
    setTitle('');
    setContent('');
    setAudience('ALL');
    load();
  };

  return (
    <div className="container space-y-4">
      {canManage && (
        <div className="card">
          <h3 className="text-lg font-semibold mb-2">Create Announcement</h3>
          <form onSubmit={create} className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
              <select value={audience} onChange={(e)=>setAudience(e.target.value)} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700">
                <option value="ALL">All</option>
                <option value="MEMBERS">Members</option>
                <option value="LEADERS">Leaders</option>
                <option value="MINISTRY_HEADS">Ministry Heads</option>
              </select>
            </div>
            <textarea value={content} onChange={e=>setContent(e.target.value)} placeholder="Content" rows={3} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
            <button className="btn-primary">Post</button>
          </form>
        </div>
      )}
      <div className="card">
        <h3 className="text-lg font-semibold mb-2">Latest Announcements</h3>
        {loading ? 'Loading...' : (
          <ul className="space-y-2">
            {list
              .filter(a => {
                const aud = (a.audience || 'ALL').toUpperCase();
                if (role === 'MEMBER') return aud === 'ALL' || aud === 'MEMBERS';
                // Admin/Clerk/Pastor can view all
                return true;
              })
              .map(a => (
              <li key={a.id} className="border-t pt-2">
                <div className="font-semibold">{a.title}</div>
                <div className="text-sm opacity-70">{new Date(a.createdAt).toLocaleString()}</div>
                {a.audience && (<div className="text-xs opacity-70">Audience: {a.audience}</div>)}
                <div>{a.content}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
