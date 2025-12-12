import React, { useRef, useState } from 'react';
import api from '../api/client';

export default function Suggestions() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const inputCls = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 dark:bg-gray-900 dark:text-gray-100";
  const fileCls = "block w-full text-sm file:mr-3 file:px-3 file:py-2 file:border-0 file:bg-gray-100 file:rounded file:text-gray-700 hover:file:bg-gray-200";

  const submitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const html = (editorRef.current?.innerHTML || '').trim();
    if (!title.trim() || !html) { alert('Title and detailed suggestion are required'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      if (category.trim()) fd.append('category', category.trim());
      fd.append('contentHtml', html);
      if (attachment) fd.append('attachment', attachment);
      const { data } = await api.post('/suggestions', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setToast('Suggestion submitted successfully');
      setTitle(''); setCategory(''); setAttachment(null);
      if (editorRef.current) editorRef.current.innerHTML = '';
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to submit suggestion');
    } finally {
      setSubmitting(false);
      setTimeout(()=>setToast(''), 3000);
    }
  };

  return (
    <div className="container">
      {toast && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 border border-green-300 rounded px-3 py-2 shadow-sm text-sm">{toast}</div>
      )}
      <h2 className="text-2xl font-bold mb-3">Suggestion Box</h2>
      <p className="text-sm text-gray-600 mb-4">Share ideas, feedback, or concerns. Attach files if helpful.</p>

      <form onSubmit={submitSuggestion} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-sm">Title</span>
          <input className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} required />
        </label>
        <label className="block">
          <span className="text-sm">Category (optional)</span>
          <input className={inputCls} value={category} onChange={e=>setCategory(e.target.value)} placeholder="e.g., Facilities, Programs, Finance" />
        </label>
        <div className="md:col-span-2">
          <span className="text-sm">Detailed Suggestion</span>
          <div
            ref={editorRef}
            className="mt-1 min-h-[150px] rounded-md border border-gray-300 bg-white p-3 text-sm shadow-sm focus:outline-none dark:bg-gray-900 dark:text-gray-100"
            contentEditable
            aria-label="Detailed suggestion editor"
          />
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn" onClick={()=>document.execCommand('bold', false)}><b>B</b></button>
            <button type="button" className="btn" onClick={()=>document.execCommand('italic', false)}><i>I</i></button>
            <button type="button" className="btn" onClick={()=>document.execCommand('underline', false)}><u>U</u></button>
            <button type="button" className="btn" onClick={()=>document.execCommand('insertUnorderedList', false)}>• List</button>
          </div>
        </div>
        <label className="block md:col-span-2">
          <span className="text-sm">Attachment (optional)</span>
          <input type="file" className={fileCls} onChange={(e)=>setAttachment(e.target.files?.[0] || null)} />
        </label>
        <div className="md:col-span-2">
          <button className="btn-primary" type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Suggestion'}</button>
        </div>
      </form>

      {(role === 'ADMIN' || role === 'CLERK') && (
        <div className="card mt-6">
          <h3 className="text-lg font-semibold mb-2">Recent Suggestions (staff view)</h3>
          {/* Lightweight viewer for staff convenience */}
          {/* Could be expanded into its own management page later */}
          <SuggestionList />
        </div>
      )}
    </div>
  );
}

function SuggestionList() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/suggestions'); setItems(Array.isArray(data) ? data : []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  };
  React.useEffect(()=>{ load(); }, []);
  if (loading) return <div>Loading…</div>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr>
            <th className="border px-2 py-1">Title</th>
            <th className="border px-2 py-1">Category</th>
            <th className="border px-2 py-1">Status</th>
            <th className="border px-2 py-1">Attachment</th>
            <th className="border px-2 py-1">Submitted</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((s: any) => (
            <tr key={s.id}>
              <td className="border px-2 py-1">{s.title}</td>
              <td className="border px-2 py-1">{s.category || '-'}</td>
              <td className="border px-2 py-1">{s.status || '-'}</td>
              <td className="border px-2 py-1">{s.attachmentPath ? (<a className="text-faith-blue underline" href={`${api.defaults.baseURL}/uploads/${s.attachmentPath}`} target="_blank" rel="noreferrer">Open</a>) : '-'}</td>
              <td className="border px-2 py-1">{new Date(s.createdAt).toLocaleString()}</td>
              <td className="border px-2 py-1"><button className="btn" onClick={()=>setSelected(s)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-md shadow-lg w-[90vw] max-w-2xl p-4">
            <h4 className="text-lg font-semibold mb-2">{selected.title}</h4>
            <div className="text-sm text-gray-600 mb-3">{selected.category || '-'} · {selected.status || '-'} · {new Date(selected.createdAt).toLocaleString()}</div>
            <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: selected.contentHtml }} />
            <div className="mt-3">
              {selected.attachmentPath ? (
                <a className="btn" href={`${api.defaults.baseURL}/uploads/${selected.attachmentPath}`} target="_blank" rel="noreferrer">Open Attachment</a>
              ) : (
                <span className="text-sm text-gray-600">No attachment</span>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn" onClick={()=>setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
