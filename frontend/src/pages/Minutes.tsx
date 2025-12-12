import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import DateTimePicker from '../components/DateTimePicker';
import { printTarget } from '../utils/print';

type Role = 'ADMIN'|'CLERK'|'PASTOR'|'MEMBER';
type Format = 'pdf'|'docx'|'txt';

interface MinuteBase {
  id: number;
  title: string;
  meetingDate: string;
  agendaTopics?: string | null;
  textContent?: string | null;
  filePath: string;
  format: Format;
  version: number;
  approved?: boolean;
  approvedAt?: string | null;
}

interface BoardMinute extends MinuteBase {}
interface BusinessMinute extends MinuteBase { businessType?: string | null }

export default function Minutes() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as Role | null;
  const [tab, setTab] = useState<'board'|'business'>('board');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'desc'|'asc'>('desc');
  const [items, setItems] = useState<Array<BoardMinute|BusinessMinute>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureById, setSignatureById] = useState<Record<number, string>>({});

  const canApprove = role === 'ADMIN' || role === 'CLERK' || role === 'PASTOR';

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const endpoint = tab === 'board' ? '/minutes/board' : '/minutes/business';
      const res = await api.get(endpoint, { params: { q: q || undefined, from: from || undefined, to: to || undefined } });
      const list = Array.isArray(res.data) ? res.data : [];
      const ordered = list.sort((a: any, b: any) => {
        const am = new Date(a.meetingDate).getTime();
        const bm = new Date(b.meetingDate).getTime();
        return sort === 'desc' ? bm - am : am - bm;
      });
      setItems(ordered);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load minutes');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [tab]);

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const allowedExts = useMemo(() => ['pdf','docx','txt'], []);
  const [uploadForm, setUploadForm] = useState<{ title: string; meetingDate: string; agendaTopics?: string; textContent?: string; approvalSignature?: string; businessType?: string; file?: File | null }>({ title: '', meetingDate: '', agendaTopics: '', textContent: '', approvalSignature: '', businessType: '', file: null });

  const submitNew = async () => {
    setUploadError(null);
    if (!uploadForm.title || !uploadForm.meetingDate || !uploadForm.file) { setUploadError('Title, meeting date, and file are required'); return; }
    const name = uploadForm.file!.name.toLowerCase();
    const ext = name.substring(name.lastIndexOf('.')+1);
    if (!allowedExts.includes(ext)) { setUploadError('Unsupported file format. Use PDF, DOCX, or TXT.'); return; }
    try {
      setUploading(true);
      setUploadProgress(0);
      const fd = new FormData();
      fd.append('title', uploadForm.title);
      fd.append('meetingDate', uploadForm.meetingDate);
      if (uploadForm.agendaTopics) fd.append('agendaTopics', uploadForm.agendaTopics);
      if (uploadForm.textContent) fd.append('textContent', uploadForm.textContent);
      if (uploadForm.approvalSignature) fd.append('approvalSignature', uploadForm.approvalSignature);
      if (tab === 'business' && uploadForm.businessType) fd.append('businessType', uploadForm.businessType);
      fd.append('file', uploadForm.file!);
      const endpoint = tab === 'board' ? '/minutes/board' : '/minutes/business';
      await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' }, onUploadProgress: (e)=>{
        if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      } });
      setUploadForm({ title: '', meetingDate: '', agendaTopics: '', textContent: '', approvalSignature: '', businessType: '', file: null });
      setUploadProgress(0);
      await load();
    } catch (e: any) {
      setUploadError(e?.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  const approve = async (id: number, signature: string) => {
    if (!canApprove) return alert('Approval restricted to Clerk/Pastor');
    try {
      const endpoint = tab === 'board' ? `/minutes/board/${id}/approve` : `/minutes/business/${id}/approve`;
      await api.put(endpoint, { approvalSignature: signature });
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Approval failed');
    }
  };

  const [versioningId, setVersioningId] = useState<number | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [newVersionFile, setNewVersionFile] = useState<File | null>(null);
  const submitVersion = async () => {
    if (!versioningId || !newVersionFile) return;
    const name = newVersionFile!.name.toLowerCase();
    const ext = name.substring(name.lastIndexOf('.')+1);
    if (!allowedExts.includes(ext)) { alert('Unsupported file format. Use PDF, DOCX, or TXT.'); return; }
    try {
      const fd = new FormData();
      fd.append('file', newVersionFile);
      if (changeNote) fd.append('changeNote', changeNote);
      const endpoint = tab === 'board' ? `/minutes/board/${versioningId}/version` : `/minutes/business/${versioningId}/version`;
      await api.post(endpoint, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setVersioningId(null); setChangeNote(''); setNewVersionFile(null);
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Version upload failed');
    }
  };

  const PreviewBlock = ({ item }: { item: BoardMinute|BusinessMinute }) => {
    const isPdf = item.format === 'pdf';
    const src = api.defaults.baseURL ? new URL(item.filePath, api.defaults.baseURL!).toString() : item.filePath;
    return (
      <div className="mt-2">
        {isPdf ? (
          <iframe src={src} className="w-full h-64 border rounded" title="Preview" />
        ) : (
          <a href={src} target="_blank" rel="noreferrer" className="text-blue-600 underline">Open file</a>
        )}
      </div>
    );
  };

  const Filters = (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col">
        <label className="text-xs">Search</label>
        <input className="input" value={q} onChange={e=>setQ(e.target.value)} placeholder="Title, agenda, text" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">From</label>
        <DateTimePicker value={from} onChange={setFrom} withTime={false} ariaLabel="Filter from date" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">To</label>
        <DateTimePicker value={to} onChange={setTo} withTime={false} ariaLabel="Filter to date" />
      </div>
      <div className="flex flex-col">
        <label className="text-xs">Sort</label>
        <select className="input" value={sort} onChange={e=>setSort(e.target.value as any)}>
          <option value="desc">Meeting Date: Newest</option>
          <option value="asc">Meeting Date: Oldest</option>
        </select>
      </div>
      <button className="btn" onClick={load}>Apply</button>
      <button className="btn" onClick={()=>{ setQ(''); setFrom(''); setTo(''); setSort('desc'); setTimeout(load, 0); }}>Reset</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Minutes</h2>
        <div className="flex items-center gap-2">
          <button className={`btn ${tab==='board'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('board')}>Board Minutes</button>
          <button className={`btn ${tab==='business'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('business')}>Business Minutes</button>
          <button className="btn" aria-label="Print" onClick={()=>printTarget('minutes')}>Print</button>
        </div>
      </div>

      {Filters}
      {error && <div className="p-2 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}
      {loading ? (<div>Loading…</div>) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 printable-minutes">
          <div className="print-header">
            <div className="text-lg font-semibold">Minutes</div>
            <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
          </div>
          {items.map((it) => (
            <div key={it.id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{it.title}</div>
                  <div className="text-sm text-gray-600">Meeting: {it.meetingDate ? new Date(it.meetingDate).toLocaleDateString() : ''}</div>
                </div>
                <div className="text-sm">
                  <div>Version: {it.version}</div>
                  <div>{it.approved ? 'Approved' : 'Pending'}</div>
                </div>
              </div>
              {tab==='business' && (it as any).businessType && (
                <div className="mt-1 text-xs text-gray-700">Type: {(it as BusinessMinute).businessType}</div>
              )}
              <PreviewBlock item={it} />
              {canApprove && !it.approved && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    className="input"
                    placeholder="Approval Signature"
                    value={signatureById[it.id] || ''}
                    onChange={(e)=> setSignatureById(s => ({ ...s, [it.id]: e.target.value }))}
                    onKeyDown={(e)=>{ if (e.key==='Enter') approve(it.id, signatureById[it.id] || ''); }}
                  />
                  <button className="btn" onClick={()=>{
                    const val = signatureById[it.id] || '';
                    if (!val.trim()) { alert('Enter approval signature'); return; }
                    approve(it.id, val.trim());
                  }}>Approve</button>
                </div>
              )}
              <div className="mt-2 border-t pt-2">
                <div className="text-sm font-semibold mb-2">Upload New Version</div>
                <div className="flex flex-wrap items-end gap-2">
                  <input type="file" className="input" onChange={e=>setNewVersionFile(e.target.files?.[0] || null)} />
                  <input className="input" placeholder="Change note" value={changeNote} onChange={e=>setChangeNote(e.target.value)} />
                  <button className="btn" onClick={()=>{ setVersioningId(it.id); submitVersion(); }}>Upload</button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-sm text-gray-600">No minutes found.</div>
          )}
          <div className="print-footer"><div className="text-xs">FaithConnect • Minutes Listing</div></div>
        </div>
      )}

      {(role === 'ADMIN' || role === 'CLERK' || role === 'PASTOR') && (
        <div className="card">
          <div className="text-lg font-semibold mb-2">Upload New {tab==='board'?'Board':'Business'} Minutes</div>
          {uploadError && <div className="p-2 border border-red-300 bg-red-50 text-red-700 rounded mb-2">{uploadError}</div>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <label className="flex flex-col text-sm">Title<input className="input" value={uploadForm.title} onChange={e=>setUploadForm(f=>({ ...f, title: e.target.value }))} /></label>
        <label className="flex flex-col text-sm">Meeting Date<DateTimePicker value={uploadForm.meetingDate} onChange={v=>setUploadForm(f=>({ ...f, meetingDate: v }))} withTime={false} ariaLabel="Meeting date" /></label>
            <label className="flex flex-col text-sm">Agenda Topics<textarea className="input" value={uploadForm.agendaTopics} onChange={e=>setUploadForm(f=>({ ...f, agendaTopics: e.target.value }))} /></label>
            <label className="flex flex-col text-sm">Text Content<textarea className="input" value={uploadForm.textContent} onChange={e=>setUploadForm(f=>({ ...f, textContent: e.target.value }))} /></label>
            <label className="flex flex-col text-sm">Approval Signature<input className="input" value={uploadForm.approvalSignature} onChange={e=>setUploadForm(f=>({ ...f, approvalSignature: e.target.value }))} /></label>
            {tab==='business' && (
              <label className="flex flex-col text-sm">Business Type<input className="input" value={uploadForm.businessType} onChange={e=>setUploadForm(f=>({ ...f, businessType: e.target.value }))} /></label>
            )}
            <label className="flex flex-col text-sm">File<input type="file" accept=".pdf,.docx,.txt" className="input" onChange={e=>setUploadForm(f=>({ ...f, file: e.target.files?.[0] || null }))} /></label>
          </div>
          <div className="mt-2">
            <button className="btn-primary" disabled={uploading} onClick={submitNew}>{uploading ? `Uploading… ${uploadProgress}%` : 'Upload'}</button>
            {uploading && (
              <div className="mt-2 w-full bg-gray-200 rounded h-2">
                <div className="bg-blue-600 h-2 rounded" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
