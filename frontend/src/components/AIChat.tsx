import { useEffect, useState } from 'react';
import api from '../api/client';

export default function AIChat() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('Summarize this week’s engagement and attendance.');
  const [scope, setScope] = useState<'general'|'attendance'|'finance'|'members'|'events'>('general');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');

  useEffect(() => {
    // no-op
  }, []);

  const run = async () => {
    setLoading(true);
    setResponse('');
    try {
      const { data } = await api.post('/ai/assist', { prompt, scope });
      setResponse(data.text);
    } catch (e: any) {
      setResponse(e?.response?.data?.message || 'Error running AI');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="fixed bottom-6 right-6 btn-gold shadow-lg">AI Assistant</button>
      {open && (
        <div className="fixed bottom-20 right-6 w-[360px] card">
          <h3 className="text-lg font-semibold mb-2">AI Assistant</h3>
          <select value={scope} onChange={e=>setScope(e.target.value as any)} className="w-full mb-2 p-2 rounded bg-gray-100 dark:bg-gray-700">
            <option value="general">General</option>
            <option value="attendance">Attendance</option>
            <option value="finance">Finance</option>
            <option value="members">Members</option>
            <option value="events">Events</option>
          </select>
          <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} className="w-full p-2 rounded bg-gray-100 dark:bg-gray-700" />
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" onClick={run} disabled={loading}>{loading ? 'Thinking...' : 'Ask'}</button>
            <button className="btn" onClick={()=>{setPrompt(''); setResponse('');}}>Clear</button>
          </div>
          {response && (
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {response}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
