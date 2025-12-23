import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { printTarget } from '../utils/print';
// Direct print using browser dialog

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  gender: string;
  contact?: string;
  address?: string;
  spiritualStatus?: string;
  dateJoined: string;
  cellGroupName?: string | null;
  departmentNames?: string[];
  // Extended fields
  photoUrl?: string;
  baptized?: boolean;
  dedicated?: boolean;
  weddingDate?: string | null;
  ministryId?: number | null;
  membershipNumber?: string | null;
  membershipStatus?: string | null;
  profession?: string | null;
  talents?: string | null;
  abilities?: string | null;
}

interface Ministry { id: number; name: string; }

export default function Members() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<string>('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [openRowId, setOpenRowId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'approved'|'pending'>('approved');
  const [pending, setPending] = useState<Member[]>([]);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [cellGroupId, setCellGroupId] = useState<string>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [departments, setDepartments] = useState<{ id: number; name: string }[]>([]);
  // Registration form state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regGender, setRegGender] = useState('MALE');
  const [regContact, setRegContact] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regSpiritualStatus, setRegSpiritualStatus] = useState('');
  const [spiritualStatuses, setSpiritualStatuses] = useState<string[]>([]);
  const [regDob, setRegDob] = useState<string>('');
  const [regEmail, setRegEmail] = useState('');
  const [regCreateLogin, setRegCreateLogin] = useState(false);
  const [regPhotoFile, setRegPhotoFile] = useState<File | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  // Import config
  type ImportColumn = { key: string; label: string; required: boolean };
  const [importColumns, setImportColumns] = useState<ImportColumn[]>([]);
  // Removed legacy Manage modal state

  // Add to Cell Group state (admin only)
  const [showAddToGroupModal, setShowAddToGroupModal] = useState(false);
  const [groupTargetMemberId, setGroupTargetMemberId] = useState<number|null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string; location?: string|null }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number|null>(null);
  const [groupNotes, setGroupNotes] = useState<string>('');
  const [groupDate, setGroupDate] = useState<string>('');
  const [groupLoading, setGroupLoading] = useState(false);

  // Import (CSV/XLSX)
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{ headers: string[]; missing: string[]; unknown: string[]; validCount: number; invalidCount: number; rows: { index: number; errors: string[]; data: any }[] } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);

  useEffect(() => {
    setRegisterOpen(searchParams.get('register') === '1');
  }, [searchParams]);

  // Keep URL query `register=1` in sync with registerOpen without updating during render
  useEffect(() => {
    const current = searchParams.get('register') === '1';
    if (current !== registerOpen) {
      const nextParams = new URLSearchParams(searchParams);
      if (registerOpen) nextParams.set('register','1'); else nextParams.delete('register');
      setSearchParams(nextParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerOpen]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/spiritual-statuses');
        setSpiritualStatuses(Array.isArray(data) ? data : []);
      } catch {
        setSpiritualStatuses(['New Convert','Visitor','Member','Committed','Worker','Baptized','Dedicated']);
      }
    })();
  }, []);

  useEffect(() => {
    if (!(role === 'ADMIN' || role === 'CLERK')) return;
    (async () => {
      try {
        const { data } = await api.get('/departments');
        setDepartments(Array.isArray(data) ? data : []);
      } catch {
        setDepartments([]);
      }
    })();
  }, [role]);

  // Unified, professional control styles
  const inputCls = "mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 dark:bg-gray-900 dark:text-gray-100";
  const selectCls = inputCls;
  const filterInputCls = "rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200 dark:bg-gray-900 dark:text-gray-100";
  const filterSelectCls = filterInputCls;
  const fileCls = "block w-full text-sm file:mr-3 file:px-3 file:py-2 file:border-0 file:bg-gray-100 file:rounded file:text-gray-700 hover:file:bg-gray-200";
  // Server-side members load with q/page/pageSize
  const loadMembers = async () => {
    setLoading(true);
    try {
      const params: any = { q: query || undefined, page, pageSize };
      if (role === 'ADMIN' || role === 'CLERK') {
        if (cellGroupId) params.cellGroupId = cellGroupId;
        if (departmentId) params.departmentId = departmentId;
      }
      const res = await api.get('/members', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        // Fallback if server returned full list (no paging)
        setMembers(data);
        setTotal(data.length);
      } else {
        setMembers(data.items || []);
        setTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadPending = async () => {
    setLoading(true);
    try {
      const params: any = { q: query || undefined, page, pageSize };
      if (role === 'ADMIN' || role === 'CLERK') {
        if (cellGroupId) params.cellGroupId = cellGroupId;
        if (departmentId) params.departmentId = departmentId;
      }
      const res = await api.get('/members/pending', { params });
      const data = res.data;
      if (Array.isArray(data)) {
        setPending(data);
        setPendingTotal(data.length);
      } else {
        setPending(data.items || []);
        setPendingTotal(data.total || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      const token = localStorage.getItem('fc_token');
      const tenantId = localStorage.getItem('fc_tenant_id');
      const EventSourceCtor = (window as any).EventSource;
      const base = String((api as any)?.defaults?.baseURL || '');
      if (!token || !tenantId || !EventSourceCtor || !base) return;
      let es: EventSource | null = null;
      let tries = 0;
      const connect = () => {
        const url = `${base}/members/stream?token=${encodeURIComponent(token)}&tenantId=${encodeURIComponent(tenantId)}`;
        es = new EventSource(url);
        es.onmessage = () => { setRefreshTick((t) => t + 1); tries = 0; };
        es.onerror = () => {
          try { es && es.close(); } catch {}
          const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, ++tries)));
          setTimeout(connect, delay);
        };
      };
      connect();
      return () => { try { es && es.close(); } catch {} };
    } catch {
      return;
    }
  }, []);

  // Load cell groups for selection
  const loadCellGroups = async () => {
    try {
      const { data } = await api.get('/cell-groups', { params: { q: '' } });
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      // Non-fatal; show empty list
      setGroups([]);
    }
  };

  useEffect(() => {
    if (!(role === 'ADMIN' || role === 'CLERK')) return;
    loadCellGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const openAddToGroup = async (memberId: number) => {
    setGroupTargetMemberId(memberId);
    setSelectedGroupId(null);
    setGroupNotes('');
    setGroupDate('');
    await loadCellGroups();
    setShowAddToGroupModal(true);
  };

  const addMemberToGroup = async () => {
    if (!selectedGroupId || !groupTargetMemberId) { alert('Select a cell group'); return; }
    try {
      setGroupLoading(true);
      await api.post(`/cell-groups/${selectedGroupId}/register`, { memberId: groupTargetMemberId, notes: groupNotes || undefined, registeredAt: groupDate || undefined });
      setToast('Member added to cell group');
      setShowAddToGroupModal(false);
      if (activeTab === 'approved') await loadMembers();
      else await loadPending();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to add member to cell group');
    } finally {
      setGroupLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'approved') {
      loadMembers();
    } else {
      loadPending();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, pageSize, activeTab, cellGroupId, departmentId, refreshTick]);

  useEffect(() => {
    // reset page when query or page size changes
    setPage(1);
  }, [query, pageSize, cellGroupId, departmentId]);

  const totalPages = useMemo(() => {
    const t = activeTab === 'approved' ? total : pendingTotal;
    return Math.max(1, Math.ceil((t || 0) / pageSize));
  }, [total, pendingTotal, pageSize, activeTab]);
  const prevPage = () => setPage(p => Math.max(1, p - 1));
  const nextPage = () => setPage(p => Math.min(totalPages, p + 1));

  // Registration submit
  const registerMember = async (e: React.FormEvent) => {
    e.preventDefault();
    // Enforce required spiritual status to reduce "Unknown" values downstream
    if (!regSpiritualStatus || !regSpiritualStatus.trim()) {
      alert('Please select a Spiritual Status for the member');
      return;
    }
    const payload: any = {
      firstName: regFirstName.trim(),
      lastName: regLastName.trim(),
      gender: regGender,
      contact: regContact.trim() || undefined,
      address: regAddress.trim() || undefined,
      spiritualStatus: regSpiritualStatus.trim(),
    };
    if (regDob) payload.dob = new Date(regDob).toISOString();
    try {
      const { data: created } = await api.post('/members', payload);
      if (role === 'ADMIN' && regCreateLogin && regEmail && regEmail.trim()) {
        try {
          const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
          const name = `${regFirstName.trim()} ${regLastName.trim()}`.trim();
          const { data: user } = await api.post('/auth/register', { name, email: regEmail.trim(), password: tempPassword, role: 'MEMBER' });
          if (user?.id) { await api.put(`/members/${created.id}`, { userId: Number(user.id) }); }
          setToast('Member registered and login created');
        } catch (e: any) {
          alert(e?.response?.data?.message || 'Member created, but login setup failed');
        }
      }
      if (regPhotoFile) {
        if (regPhotoFile.size > 5 * 1024 * 1024) { alert('Photo file too large (max 5 MB)'); }
        else if (!(regPhotoFile.type || '').startsWith('image/')) { alert('Invalid photo type'); }
        else {
          const fd = new FormData();
          fd.append('photo', regPhotoFile);
          await api.post(`/members/${created.id}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        }
      }
      // reset form and reload
      setRegFirstName(''); setRegLastName(''); setRegGender('MALE'); setRegEmail(''); setRegCreateLogin(false); setRegContact(''); setRegAddress(''); setRegSpiritualStatus(''); setRegDob(''); setRegPhotoFile(null);
      await loadMembers();
      setToast('Member registered successfully');
      setRegisterOpen(false);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('register');
      setSearchParams(nextParams, { replace: true });
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to register member');
    }
  };

  const exportExcel = () => {
    const list = activeTab === 'approved' ? members : pending;
    const rows = list.map(m => ({
      FirstName: m.firstName,
      LastName: m.lastName,
      Gender: m.gender,
      Contact: m.contact || '',
      Address: m.address || '',
      Status: m.spiritualStatus || '',
      CellGroup: m.cellGroupName || '',
      Department: (m.departmentNames || []).join(', '),
      Joined: m.dateJoined ? new Date(m.dateJoined).toLocaleDateString() : '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Members');
    XLSX.writeFile(wb, activeTab === 'approved' ? 'members.xlsx' : 'pending-members.xlsx');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const head = [['Name','Gender','Contact','Status','Cell Group','Department','Joined']];
    const list = activeTab === 'approved' ? members : pending;
    const body = list.map(m => [
      `${m.firstName} ${m.lastName}`,
      m.gender,
      m.contact || '-',
      m.spiritualStatus || '-',
      m.cellGroupName || '-',
      (m.departmentNames || []).join(', ') || '-',
      m.dateJoined ? new Date(m.dateJoined).toLocaleDateString() : '-',
    ]);
    autoTable(doc, { head, body });
    doc.save(activeTab === 'approved' ? 'members.pdf' : 'pending-members.pdf');
  };

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/settings/member-import/columns');
        const list: ImportColumn[] = (Array.isArray(data) ? data : []).map((c: any) => ({ key: c.key, label: c.label, required: !!c.required }));
        setImportColumns(list);
      } catch {}
    })();
  }, []);

  const onPreviewImport = async () => {
    if (!importFile) { alert('Select a CSV or Excel file'); return; }
    setImportLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', importFile);
      const { data } = await api.post('/members/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setImportPreview(data);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to preview import');
    } finally {
      setImportLoading(false);
    }
  };

  const onCommitImport = async () => {
    if (!importPreview) return;
    const rows = (importPreview.rows || []).filter(r => r.errors.length === 0).map(r => ({ data: r.data }));
    if (rows.length === 0) { alert('No valid rows to import'); return; }
    setCommitLoading(true);
    try {
      const { data } = await api.post('/members/import/commit', { rows });
      setToast(`Import: +${data.created} created, ~${data.updated} updated, !${data.failed} failed`);
      setImportPreview(null);
      setImportFile(null);
      await loadMembers();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Failed to commit import');
    } finally {
      setCommitLoading(false);
    }
  };

  const ImportSection = () => (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Bulk Member Upload (CSV/XLSX)</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400">Only ADMIN/CLERK</div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <input aria-label="Bulk Member Upload file" className={fileCls} type="file" accept=".csv,.xlsx,.xls" onChange={(e)=>setImportFile(e.target.files?.[0] || null)} />
          <div className="mt-1 text-xs text-gray-600 dark:text-gray-400">{importFile ? `Selected: ${importFile.name}` : 'No file selected'}</div>
        </div>
        <div className="flex gap-2">
          <button onClick={onPreviewImport} disabled={importLoading || !importFile} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{importLoading ? 'Previewing…' : 'Preview'}</button>
          <button onClick={onCommitImport} disabled={commitLoading || !importPreview || (importPreview?.validCount||0) === 0} className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50">{commitLoading ? 'Importing…' : 'Commit Import'}</button>
        </div>
      </div>
      {importColumns.length > 0 && (
        <div className="mt-2 text-sm">
          <div>
            <span className="font-medium">Required:</span> {importColumns.filter(c=>c.required).map(c=>c.label).join(', ') || '-'}
          </div>
          <div>
            <span className="font-medium">Optional:</span> {importColumns.filter(c=>!c.required).map(c=>c.label).join(', ') || '-'}
          </div>
        </div>
      )}
      {importPreview && (
        <div className="mt-4">
          <div className="text-sm">
            <div>Headers: {importPreview.headers.join(', ')}</div>
            {importPreview.missing.length > 0 && (<div className="text-red-600">Missing: {importPreview.missing.join(', ')}</div>)}
            {importPreview.unknown.length > 0 && (<div className="text-yellow-700">Unknown: {importPreview.unknown.join(', ')}</div>)}
            <div className="mt-1">Valid: {importPreview.validCount} • Invalid: {importPreview.invalidCount}</div>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="border px-2 py-1">#</th>
                  <th className="border px-2 py-1">firstName</th>
                  <th className="border px-2 py-1">lastName</th>
                  <th className="border px-2 py-1">gender</th>
                  <th className="border px-2 py-1">contact</th>
                  <th className="border px-2 py-1">address</th>
                  <th className="border px-2 py-1">errors</th>
                </tr>
              </thead>
              <tbody>
                {importPreview.rows.map(r => (
                  <tr key={r.index} className={r.errors.length ? 'bg-red-50 dark:bg-red-900/20' : ''}>
                    <td className="border px-2 py-1">{r.index}</td>
                    <td className="border px-2 py-1">{r.data.firstName}</td>
                    <td className="border px-2 py-1">{r.data.lastName}</td>
                    <td className="border px-2 py-1">{r.data.gender}</td>
                    <td className="border px-2 py-1">{r.data.contact || ''}</td>
                    <td className="border px-2 py-1">{r.data.address || ''}</td>
                    <td className="border px-2 py-1 text-red-700">{r.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  const deleteMember = async (id: number) => {
    if (!role || !['ADMIN','CLERK'].includes(role)) return alert('Only Admin or Clerk can delete');
    if (!confirm('Soft-delete this member?')) return;
    try { await api.delete(`/members/${id}`); await loadMembers(); setToast('Member deleted'); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to delete'); }
  };

  // AI demographics summary removed — now available as dedicated sidebar page

  return (
    <div className="container">
      {toast && (
        <div className="fixed top-4 right-4 bg-green-100 text-green-800 border border-green-300 rounded px-3 py-2 shadow-sm text-sm">
          {toast}
        </div>
      )}
      {/* Title and actions row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-2xl font-bold">Members</h2>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={()=> setRegisterOpen(o=>!o)}>
            {registerOpen ? 'Close Register' : 'Register'}
          </button>
          {/* Unified Export and Print */}
          <div className="relative">
            <button
              className="btn"
              onClick={() => setOpenRowId(openRowId === -1 ? null : -1)}
              title="Export options"
            >Export</button>
            {openRowId === -1 && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 border rounded shadow">
                <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportExcel}>Excel (.xlsx)</button>
                <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportPDF}>PDF (.pdf)</button>
              </div>
            )}
          </div>
          <button aria-label="Print" className="btn" onClick={()=>printTarget('members')}>Print</button>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded border overflow-hidden">
            <button
              className={`px-3 py-2 text-sm ${activeTab==='approved' ? 'bg-faith-blue text-white' : 'bg-gray-100'}`}
              onClick={()=> setActiveTab('approved')}
            >Approved</button>
            <button
              className={`px-3 py-2 text-sm ${activeTab==='pending' ? 'bg-faith-blue text-white' : 'bg-gray-100'}`}
              onClick={()=> setActiveTab('pending')}
            >Pending Approval</button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            placeholder="Search name/contact"
            className={`${filterInputCls} w-72`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(role === 'ADMIN' || role === 'CLERK') && (
            <>
              <select aria-label="Cell group filter" className={`${filterSelectCls} w-56`} value={cellGroupId} onChange={(e) => setCellGroupId(e.target.value)}>
                <option value="">All Cell groups</option>
                {groups.map((g) => (<option key={g.id} value={String(g.id)}>{g.name}</option>))}
              </select>
              <select aria-label="Department filter" className={`${filterSelectCls} w-56`} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All Departments</option>
                {departments.map((d) => (<option key={d.id} value={String(d.id)}>{d.name}</option>))}
              </select>
            </>
          )}
          <select className={`${filterSelectCls} w-24`} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      {(role === 'ADMIN' || role === 'CLERK') && <ImportSection />}

      {/* Register New Member */}
      {registerOpen && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Register New Member</h3>
            <button className="btn" onClick={()=> setRegisterOpen(false)}>Close</button>
          </div>
          <p className="text-sm text-gray-600 mb-3">Capture essential info. Photo optional.</p>
          <form onSubmit={registerMember} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2 font-medium text-gray-700">Basic Info</div>
            <label className="block">
              <span className="text-sm">First Name</span>
              <input className={inputCls} value={regFirstName} onChange={e=>setRegFirstName(e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-sm">Last Name</span>
              <input className={inputCls} value={regLastName} onChange={e=>setRegLastName(e.target.value)} required />
            </label>
            <label className="block">
              <span className="text-sm">Gender</span>
              <select className={selectCls} value={regGender} onChange={e=>setRegGender(e.target.value)}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            
            <div className="md:col-span-2 font-medium text-gray-700 mt-2">Contact & Status</div>
            <label className="block md:col-span-2">
              <span className="text-sm">Email</span>
              <input type="email" className={inputCls} value={regEmail} onChange={e=>setRegEmail(e.target.value)} placeholder="member@example.com" />
            </label>
            <label className="block">
              <span className="text-sm">Contact</span>
              <input className={inputCls} value={regContact} onChange={e=>setRegContact(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Address</span>
              <input className={inputCls} value={regAddress} onChange={e=>setRegAddress(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Spiritual Status</span>
              <select className={inputCls} value={regSpiritualStatus} onChange={e=>setRegSpiritualStatus(e.target.value)} required>
                <option value="">Select status</option>
                {spiritualStatuses.map(s => (<option key={s} value={s}>{s}</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm">Date of Birth</span>
              <input
                type="date"
                className={inputCls}
                value={regDob}
                onKeyDown={(e)=> e.preventDefault()}
                readOnly
                onChange={e=>setRegDob(e.target.value)}
              />
            </label>
            <div className="md:col-span-2 flex items-center gap-2">
              <input type="checkbox" id="create-login" checked={regCreateLogin} onChange={e=>setRegCreateLogin(e.target.checked)} />
              <label htmlFor="create-login" className="text-sm">Create login account using the email</label>
            </div>

            <div className="md:col-span-2 font-medium text-gray-700 mt-2">Photo</div>
            <label className="block md:col-span-2">
              <span className="text-sm">Photo</span>
              <input type="file" accept="image/*" className={fileCls} onChange={e=>setRegPhotoFile(e.target.files?.[0] || null)} />
            </label>
            <div className="md:col-span-2">
              <button className="btn-primary" type="submit">Register Member</button>
            </div>
          </form>
        </div>
      )}

      <div className="card printable-members">
        <div className="print-header">
          <div className="text-lg font-semibold">Members</div>
          <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
        </div>
        {loading ? 'Loading...' : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-2">Name</th>
                  <th className="p-2">Gender</th>
                  <th className="p-2">Contact</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Cell group</th>
                  <th className="p-2">Department</th>
                  <th className="p-2">Joined</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === 'approved' ? members : pending).map(m => (
                  <React.Fragment key={m.id}>
                    <tr className="border-t">
                      <td className="p-2">{m.firstName} {m.lastName}</td>
                      <td className="p-2">{m.gender}</td>
                      <td className="p-2">{m.contact || '-'}</td>
                      <td className="p-2">{m.spiritualStatus || (m.membershipStatus || '-')}</td>
                      <td className="p-2">{m.cellGroupName || '-'}</td>
                      <td className="p-2">{(m.departmentNames || []).join(', ') || '-'}</td>
                      <td className="p-2">{m.dateJoined ? new Date(m.dateJoined).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          {activeTab === 'approved' ? (
                            <>
                              <a href={`/members/${m.id}/details`} className="text-faith-blue hover:underline">View</a>
                              <button className="text-faith-blue underline" onClick={()=> setOpenRowId(id=> id===m.id ? null : m.id)}>
                                {openRowId===m.id ? 'Hide Info' : 'Show Info'}
                              </button>
                              {role && ['ADMIN','CLERK'].includes(role) && (
                                <button className="text-faith-blue underline" onClick={()=> openAddToGroup(m.id)}>Add to Cell Group</button>
                              )}
                              {role && ['ADMIN','CLERK'].includes(role) && (
                                <button className="text-red-600 underline" onClick={()=>deleteMember(m.id)}>Delete</button>
                              )}
                            </>
                          ) : (
                            <>
                              {role && ['ADMIN','CLERK'].includes(role) ? (
                                <button
                                  className="btn-primary"
                                  onClick={async ()=>{
                                    try {
                                      await api.post(`/members/${m.id}/approve`);
                                      setToast('Member approved');
                                      await Promise.all([loadPending(), loadMembers()]);
                                    } catch (e: any) {
                                      alert(e?.response?.data?.message || 'Failed to approve');
                                    }
                                  }}
                                >Approve</button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {activeTab==='approved' && openRowId===m.id && (
                      <tr className="bg-gray-50 dark:bg-gray-900">
                        <td className="p-3" colSpan={8}>
                          <div className="flex items-start gap-4">
                            {m.photoUrl ? (
                              <img src={`${api.defaults.baseURL}${m.photoUrl}`} alt="Member" className="w-20 h-20 rounded object-cover border" />
                            ) : (
                              <div className="w-20 h-20 rounded bg-gray-200 flex items-center justify-center text-gray-500">No Photo</div>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                              <div>
                                <div className="text-xs text-gray-600">Membership Number</div>
                                <div className="font-medium">{m.membershipNumber || '-'}</div>
                              </div>
                              <div>
                                <div className="text-xs text-gray-600">Membership Status</div>
                                <div className="font-medium">{m.membershipStatus || '-'}</div>
                              </div>
                              <div className="md:col-span-2">
                                <div className="text-xs text-gray-600">Profession</div>
                                <div className="font-medium">{m.profession || '-'}</div>
                              </div>
                              <div className="md:col-span-1">
                                <div className="text-xs text-gray-600">Talents</div>
                                <div className="font-medium">{m.talents || '-'}</div>
                              </div>
                              <div className="md:col-span-1">
                                <div className="text-xs text-gray-600">Abilities</div>
                                <div className="font-medium">{m.abilities || '-'}</div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="print-footer">
              <div className="text-xs">FaithConnect • Members Listing</div>
            </div>
            <div className="flex items-center justify-between mt-3 text-sm">
              <div>
                {activeTab==='approved' ? (
                  <>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}</>
                ) : (
                  <>Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, pendingTotal)} of {pendingTotal}</>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="btn" onClick={prevPage} disabled={page <= 1}>Prev</button>
                <span>Page {page} / {totalPages}</span>
                <button className="btn" onClick={nextPage} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Legacy Manage modal removed */}

      {showAddToGroupModal && groupTargetMemberId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-lg p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Add Member to Cell Group</h3>
              <button className="btn" onClick={()=> setShowAddToGroupModal(false)}>Close</button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-sm">Cell Group</span>
                <select className={selectCls} value={selectedGroupId ?? ''} onChange={e=> setSelectedGroupId(Number(e.target.value)||null)}>
                  <option value="">Select a group</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}{g.location ? ` — ${g.location}` : ''}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm">Registration Date</span>
                <input type="date" className={inputCls} value={groupDate} onChange={e=> setGroupDate(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm">Notes</span>
                <input type="text" className={inputCls} value={groupNotes} onChange={e=> setGroupNotes(e.target.value)} placeholder="Optional notes" />
              </label>
              <div className="flex items-center gap-2">
                <button className="btn-primary" onClick={addMemberToGroup} disabled={groupLoading}>Add</button>
                <button className="btn" onClick={()=> setShowAddToGroupModal(false)} disabled={groupLoading}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI demographics summary removed; use Demographics page in sidebar */}
    </div>
  );
}
