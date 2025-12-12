import { useEffect, useMemo, useState } from 'react';
// Removed inline editable title; use static heading
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import ChangePassword from './ChangePassword';
import QRAdmin from './QRAdmin';

interface ChurchInfo { name: string; sidebarName: string; logoUrl: string; contact: string; location: string }
interface SMTPConfig { host: string; port: number; secure: boolean; user: string; pass: string }
interface SMSConfig { provider: string; apiKey: string; from: string }
interface UserItem { id: number; name: string; email: string; role: 'ADMIN'|'CLERK'|'PASTOR'|'MEMBER'; createdAt: string }
interface MemberOption { id: number; firstName: string; lastName: string; userId?: number | null }

export default function Settings() {
  const [tab, setTab] = useState<'profile'|'info'|'roles'|'backup'|'email'|'sms'|'requests'|'password'|'titles'|'security'|'landing'|'imports'|'qr'>(
    (['ADMIN','CLERK'].includes(localStorage.getItem('fc_role') || 'ADMIN')) ? 'info' : 'profile'
  );
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  // Allow selecting tab via query param for direct navigation
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get('tab') as typeof tab | null;
    const baseTabs: typeof tab[] = ['info','roles','backup','email','sms','requests','profile','password','titles','security','imports'];
    const allowedTabs: typeof tab[] = (role==='ADMIN' || role==='CLERK' || role==='PASTOR')
      ? (role==='ADMIN' ? [...baseTabs, 'landing'] : baseTabs)
      : ['profile','password'];
    if (t && (allowedTabs as string[]).includes(t)) setTab(t);
  }, [role, searchParams]);

  // Church Info
  const [info, setInfo] = useState<ChurchInfo>({ name: '', sidebarName: '', logoUrl: '', contact: '', location: '' });
  const [infoLoading, setInfoLoading] = useState<boolean>(false);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  // Keep a snapshot for validation feedback when saving
  const [prevInfoSnapshot, setPrevInfoSnapshot] = useState<ChurchInfo | null>(null);
  const loadInfo = async () => {
    try { setInfoLoading(true); const res = await api.get('/settings/info'); setInfo(res.data || info); } finally { setInfoLoading(false); }
  };
  const saveInfo = async () => {
    setInfoMsg(null); setInfoError(null);
    const name = (info.name || '').trim();
    if (!name) { setInfoError('Name is required'); return; }
    if (name.length > 50) { setInfoError('Name must be ≤ 50 characters'); return; }
    if (info.logoUrl && !/^https?:\/\//i.test(info.logoUrl) && !/^data:/i.test(info.logoUrl)) {
      setInfoError('Logo URL must be http(s) or data URL'); return;
    }
    try {
      // Capture previous values for post-save validation messaging
      setPrevInfoSnapshot(info);
      await api.put('/settings/info', { ...info, name });
      setInfoMsg('Church info saved');
      setTimeout(()=> setInfoMsg(null), 3000);
    } catch (e: any) {
      setInfoError(e?.response?.data?.message || 'Failed to save');
    }
  };

  // Email (SMTP)
  const [smtp, setSmtp] = useState<SMTPConfig>({ host: '', port: 587, secure: false, user: '', pass: '' });
  const [smtpLoading, setSmtpLoading] = useState<boolean>(false);
  const loadSmtp = async () => { try { setSmtpLoading(true); const res = await api.get('/settings/email'); setSmtp(res.data || smtp); } finally { setSmtpLoading(false); } };
  const saveSmtp = async () => { await api.post('/settings/email', smtp); };

  // SMS
  const [sms, setSms] = useState<SMSConfig>({ provider: '', apiKey: '', from: '' });
  const [smsLoading, setSmsLoading] = useState<boolean>(false);
  const loadSms = async () => { try { setSmsLoading(true); const res = await api.get('/settings/sms'); setSms(res.data || sms); } finally { setSmsLoading(false); } };
  const saveSms = async () => { await api.post('/settings/sms', sms); };

  // Roles & Permissions
  const [users, setUsers] = useState<UserItem[]>([]);
  const [usersLoading, setUsersLoading] = useState<boolean>(false);
  const loadUsers = async () => { try { setUsersLoading(true); const res = await api.get('/auth/users'); setUsers(res.data || []); } finally { setUsersLoading(false); } };
  const updateRole = async (id: number, newRole: UserItem['role']) => { await api.put(`/auth/users/${id}/role`, { role: newRole }); await loadUsers(); };
  const deleteUser = async (id: number) => {
    if (role !== 'ADMIN') return alert('Only Admin can delete users');
    if (!confirm('Delete this user account?')) return;
    try { await api.delete(`/auth/users/${id}`); await loadUsers(); } catch (e: any) { alert(e?.response?.data?.message || 'Failed to delete user'); }
  };
  const [newUser, setNewUser] = useState<{ name: string; email: string; password: string; role: UserItem['role'] }>({ name: '', email: '', password: '', role: 'MEMBER' });
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [memberOptionsLoading, setMemberOptionsLoading] = useState<boolean>(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | ''>('');
  const loadMemberOptions = async () => {
    try {
      setMemberOptionsLoading(true);
      const res = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
      const list: any[] = (res.data?.items ?? res.data ?? []) || [];
      const mapped: MemberOption[] = list.map(m => ({ id: m.id, firstName: m.firstName, lastName: m.lastName, userId: m.userId ?? null }));
      setMemberOptions(mapped);
    } finally { setMemberOptionsLoading(false); }
  };
  const createUser = async () => {
    if (role !== 'ADMIN') return alert('Only Admin can create users');
    try {
      const { data: created } = await api.post('/auth/register', newUser);
      // Auto-link to selected member, if set and not already linked
      if (selectedMemberId && typeof selectedMemberId === 'number') {
        try {
          const member = memberOptions.find(m => m.id === selectedMemberId);
          if (!member?.userId) {
            await api.put(`/members/${selectedMemberId}`, { userId: Number(created?.id) });
          }
        } catch { /* ignore link failure; user creation remains successful */ }
      }
      setNewUser({ name: '', email: '', password: '', role: 'MEMBER' });
      setSelectedMemberId('');
      await Promise.all([loadUsers(), loadMemberOptions()]);
    }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to create user'); }
  };

  // Backup & Restore
  const downloadBackup = async () => {
    const res = await api.get('/settings/backup');
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `faithconnect-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
  };
  const restore = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    await api.post('/settings/restore', data);
    alert('Restore completed for settings and announcements');
  };

  useEffect(() => {
    if (['ADMIN','CLERK'].includes(role)) {
      loadInfo();
      loadSmtp();
      loadSms();
      loadUsers();
      loadMemberOptions();
    }
  }, []);

  // Centralized Titles Management
  const titleKeys: Array<{key: string; label: string; defaultValue: string}> = useMemo(() => ([
    { key: 'attendance', label: 'Attendance', defaultValue: 'Attendance' },
    { key: 'reports', label: 'Reports', defaultValue: 'Reports' },
    { key: 'sermons', label: 'Sermons', defaultValue: 'Sermons' },
    { key: 'finance', label: 'Finance', defaultValue: 'Finance' },
    { key: 'ministries', label: 'Departments', defaultValue: 'Department management' },
    { key: 'events', label: 'Events', defaultValue: 'Events & Activities' },
  ]), []);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [titlesLoading, setTitlesLoading] = useState<boolean>(false);
  const [titlesMsg, setTitlesMsg] = useState<string | null>(null);
  const [titlesError, setTitlesError] = useState<string | null>(null);
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({});
  const [newTitleKey, setNewTitleKey] = useState('');
  const [newTitleValue, setNewTitleValue] = useState('');
  const loadTitles = async () => {
    try {
      setTitlesLoading(true);
      const r = await api.get('/settings/titles');
      const all = Array.isArray(r.data) ? r.data as Array<{key: string; value: string}> : [];
      const serverMap = Object.fromEntries(all.map(t => [t.key, String(t.value ?? '')]));
      const stdMap: Record<string,string> = {};
      for (const t of titleKeys) {
        stdMap[t.key] = serverMap[t.key] ?? t.defaultValue;
      }
      const customs: Record<string,string> = {};
      Object.entries(serverMap).forEach(([k,v]) => { if (!titleKeys.find(tt => tt.key === k)) customs[k] = v; });
      setTitles(stdMap);
      setCustomTitles(customs);
    } finally { setTitlesLoading(false); }
  };
  const saveTitle = async (k: string, v: string) => {
    setTitlesMsg(null); setTitlesError(null);
    const next = (v || '').trim();
    if (!next) { setTitlesError('Title cannot be empty'); return; }
    if (next.length > 50) { setTitlesError('Max 50 characters'); return; }
    try {
      await api.put(`/settings/titles/${encodeURIComponent(k)}`, { value: next });
      setTitlesMsg('Titles saved');
      setTimeout(()=> setTitlesMsg(null), 2500);
    } catch (e: any) {
      setTitlesError(e?.response?.data?.message || 'Failed to save');
    }
  };
  const saveCustomTitle = async (k: string, v: string) => {
    setTitlesMsg(null); setTitlesError(null);
    const next = (v || '').trim();
    if (!next) { setTitlesError('Title cannot be empty'); return; }
    if (next.length > 50) { setTitlesError('Max 50 characters'); return; }
    try {
      await api.put(`/settings/titles/${encodeURIComponent(k)}`, { value: next });
      setCustomTitles(prev => ({ ...prev, [k]: next }));
      setTitlesMsg('Custom title saved');
      setTimeout(()=> setTitlesMsg(null), 2500);
    } catch (e: any) {
      setTitlesError(e?.response?.data?.message || 'Failed to save');
    }
  };
  const deleteCustomTitle = async (k: string) => {
    setTitlesMsg(null); setTitlesError(null);
    try {
      await api.delete(`/settings/titles/${encodeURIComponent(k)}`);
      setCustomTitles(prev => { const next = { ...prev }; delete next[k]; return next; });
      setTitlesMsg('Custom title deleted');
      setTimeout(()=> setTitlesMsg(null), 2500);
    } catch (e: any) {
      setTitlesError(e?.response?.data?.message || 'Failed to delete');
    }
  };
  const addCustomTitle = async () => {
    setTitlesMsg(null); setTitlesError(null);
    const k = (newTitleKey || '').trim().toLowerCase();
    const v = (newTitleValue || '').trim();
    if (!k || !v) { setTitlesError('Provide both key and title'); return; }
    if (!/^[a-z0-9_-]{2,32}$/.test(k)) { setTitlesError('Key must be 2–32 chars (a-z, 0-9, -, _)'); return; }
    try {
      await api.post('/settings/titles', { key: k, value: v });
      setCustomTitles(prev => ({ ...prev, [k]: v }));
      setNewTitleKey(''); setNewTitleValue('');
      setTitlesMsg('Custom title added');
      setTimeout(()=> setTitlesMsg(null), 2500);
    } catch (e: any) {
      setTitlesError(e?.response?.data?.message || 'Failed to add');
    }
  };
  useEffect(() => { if (['ADMIN','CLERK'].includes(role)) loadTitles(); }, [role]);

  // Validation: detect potential mismatches or unintended coupling between header/sidebar titles and section titles
  const headerTitle = (info.name || '').trim();
  const sidebarTitle = ((info.sidebarName || info.name || '')).trim();
  const sectionTitles: Array<{ key: string; value: string }> = useMemo(() => {
    const std = titleKeys.map(t => ({ key: t.key, value: (titles[t.key] ?? t.defaultValue).trim() }));
    const customs = Object.entries(customTitles).map(([k,v]) => ({ key: k, value: (v || '').trim() }));
    return [...std, ...customs];
  }, [titles, customTitles, titleKeys]);
  const coincidingWithHeader = sectionTitles.filter(t => t.value && t.value === headerTitle);
  const coincidingWithSidebar = sectionTitles.filter(t => t.value && t.value === sidebarTitle);
  const independenceOk = coincidingWithHeader.length === 0 && coincidingWithSidebar.length === 0;

  return (
    <div className="container">
      <h1 className="text-2xl font-semibold mb-4">Settings & Configuration</h1>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['ADMIN','CLERK'].includes(role) ? (
          <>
            <button className={`btn ${tab==='info'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('info')}>Church Info</button>
            <button className={`btn ${tab==='roles'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('roles')}>Roles & Permissions</button>
            <button className={`btn ${tab==='backup'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('backup')}>Backup & Restore</button>
            <button className={`btn ${tab==='email'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('email')}>Email Server</button>
            <button className={`btn ${tab==='sms'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('sms')}>SMS Server</button>
            <button className={`btn ${tab==='requests'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('requests')}>Profile Requests</button>
            <button className={`btn ${tab==='titles'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('titles')}>Titles</button>
            <button className={`btn ${tab==='imports'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('imports')}>Import Columns</button>
            {role==='ADMIN' && (
              <button className={`btn ${tab==='landing'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('landing')}>Landing Page</button>
            )}
            <button className={`btn ${tab==='password'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('password')}>Change Password</button>
            <button className={`btn ${tab==='security'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('security')}>Security</button>
            {role==='ADMIN' && (
              <button className={`btn ${tab==='qr'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('qr')}>QR Codes</button>
            )}
          </>
        ) : (
          <button className={`btn ${tab==='profile'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('profile')}>Manage Profile</button>
        )}
      </div>

      {tab==='profile' && (
        <ManageProfile />
      )}
      {tab==='requests' && (
        <ProfileRequests />
      )}
      {tab==='imports' && (
        <ImportColumnsManager />
      )}

      {tab==='info' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Church Info</h2>
          {infoMsg && <div className="p-2 text-sm bg-green-50 text-green-700 rounded" aria-live="polite">{infoMsg}</div>}
          {infoError && <div className="p-2 text-sm bg-red-50 text-red-700 rounded" aria-live="polite">{infoError}</div>}
          {infoLoading ? <div>Loading...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Name</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" maxLength={50} value={info.name} onChange={e=>setInfo({...info, name: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Sidebar Title</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" maxLength={50} value={info.sidebarName} onChange={e=>setInfo({...info, sidebarName: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Logo URL</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={info.logoUrl} onChange={e=>setInfo({...info, logoUrl: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Contact</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={info.contact} onChange={e=>setInfo({...info, contact: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Location</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={info.location} onChange={e=>setInfo({...info, location: e.target.value})} />
              </div>
            </div>
          )}
          {/* Independence validation and visual indicators */}
          <div className="space-y-2">
            {independenceOk ? (
              <div className="p-2 text-sm rounded bg-green-50 text-green-700" role="status">
                Header and section titles are independent.
              </div>
            ) : (
              <div className="p-2 text-sm rounded bg-yellow-50 text-yellow-800" role="alert">
                <div className="font-medium mb-1">Title consistency notice</div>
                {!!coincidingWithHeader.length && (
                  <div>
                    <span className="font-semibold">Header title</span> matches these section titles:
                    <span className="ml-1 font-mono">{coincidingWithHeader.map(t=>t.key).join(', ')}</span>
                  </div>
                )}
                {!!coincidingWithSidebar.length && (
                  <div>
                    <span className="font-semibold">Sidebar title</span> matches these section titles:
                    <span className="ml-1 font-mono">{coincidingWithSidebar.map(t=>t.key).join(', ')}</span>
                  </div>
                )}
                <div className="mt-2">
                  Section titles are managed separately under <button className="underline text-faith-blue" onClick={()=>setTab('titles')}>Titles</button> and will not change when saving Church Info.
                </div>
              </div>
            )}
            {prevInfoSnapshot && (prevInfoSnapshot.name !== info.name || prevInfoSnapshot.sidebarName !== info.sidebarName) && (
              <div className="p-2 text-xs rounded bg-blue-50 text-blue-700" role="status">
                You changed header or sidebar text. Section titles remain unchanged. Update them under Titles if needed.
              </div>
            )}
          </div>
          <div>
            <button className="btn-primary" onClick={saveInfo}>Save</button>
          </div>
        </div>
      )}

      {tab==='landing' && (
        <LandingEditor />
      )}

      {tab==='titles' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Page Titles</h2>
          {titlesMsg && <div className="p-2 text-sm bg-green-50 text-green-700 rounded" aria-live="polite">{titlesMsg}</div>}
          {titlesError && <div className="p-2 text-sm bg-red-50 text-red-700 rounded" aria-live="polite">{titlesError}</div>}
          {titlesLoading ? (
            <div>Loading…</div>
          ) : (
            <div className="space-y-3">
              {titleKeys.map(t => (
                <div key={t.key} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-sm">{t.label}</label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" maxLength={50}
                      value={titles[t.key] ?? t.defaultValue}
                      onChange={e=> setTitles(prev => ({...prev, [t.key]: e.target.value}))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button className="btn-primary" onClick={()=> saveTitle(t.key, titles[t.key] ?? t.defaultValue)}>Save {t.label}</button>
                  </div>
                </div>
              ))}
              <div className="mt-4">
                <h3 className="text-md font-medium">Custom Titles</h3>
                <p className="text-xs text-gray-600">Manage ad-hoc keys. Keys use lowercase letters, numbers, hyphens or underscores.</p>
              </div>
              {Object.entries(customTitles).map(([k,v]) => (
                <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-sm">Key: <span className="font-mono">{k}</span></label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" maxLength={50}
                      value={v}
                      onChange={e=> setCustomTitles(prev => ({...prev, [k]: e.target.value}))}
                    />
                  </div>
                  <div className="md:col-span-2 flex gap-2">
                    <button className="btn" onClick={()=> saveCustomTitle(k, customTitles[k])}>Save</button>
                    <button className="btn-red" onClick={()=> deleteCustomTitle(k)}>Delete</button>
                  </div>
                </div>
              ))}
              <div className="p-3 border rounded bg-gray-50 dark:bg-gray-900">
                <div className="font-medium mb-2">Add New Custom Title</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div>
                    <label className="text-sm">Key</label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-white dark:bg-gray-800" placeholder="e.g. groups_overview" value={newTitleKey} onChange={e=>setNewTitleKey(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm">Title</label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-white dark:bg-gray-800" placeholder="e.g. Groups Overview" value={newTitleValue} onChange={e=>setNewTitleValue(e.target.value)} />
                  </div>
                  <div>
                    <button className="btn-gold" onClick={addCustomTitle}>Add Title</button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-600">These values update headings across the app. Max 50 characters.</p>
            </div>
          )}
        </div>
      )}

      {tab==='roles' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Roles & Permissions</h2>
          {role==='ADMIN' ? (
            <div className="p-3 border rounded bg-gray-50 dark:bg-gray-900">
              <div className="font-medium mb-2">Add User</div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <div className="md:col-span-2">
                  <label className="text-sm">Select Member (optional)</label>
                  <input
                    placeholder="Search by name…"
                    className="mt-1 px-3 py-2 border rounded bg-white dark:bg-gray-800 w-full"
                    value={memberSearch}
                    onChange={e=>setMemberSearch(e.target.value)}
                  />
                  <select
                    className="mt-2 px-3 py-2 border rounded bg-white dark:bg-gray-800 w-full"
                    value={selectedMemberId === '' ? '' : String(selectedMemberId)}
                    onChange={e=>{
                      const idVal = e.target.value ? Number(e.target.value) : '';
                      setSelectedMemberId(idVal);
                      const m = memberOptions.find(mm => mm.id === idVal);
                      if (m) {
                        const fullName = `${m.firstName} ${m.lastName}`.trim();
                        setNewUser(prev => ({ ...prev, name: fullName }));
                      }
                    }}
                  >
                    <option value="">— No selection —</option>
                    {(memberOptionsLoading ? [] : memberOptions.filter(m => {
                      const q = memberSearch.trim().toLowerCase();
                      if (!q) return true;
                      return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q);
                    })).map(m => (
                      <option key={m.id} value={m.id} disabled={!!m.userId}>
                        {m.firstName} {m.lastName}{m.userId ? ' (linked)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-600 mt-1">Selecting a member prefills the name and will link after creation.</p>
                </div>
                <input placeholder="Name" className="px-3 py-2 border rounded bg-white dark:bg-gray-800" value={newUser.name} onChange={e=>setNewUser({...newUser, name: e.target.value})} />
                <input placeholder="Email" className="px-3 py-2 border rounded bg-white dark:bg-gray-800" value={newUser.email} onChange={e=>setNewUser({...newUser, email: e.target.value})} />
                <input type="password" placeholder="Password" className="px-3 py-2 border rounded bg-white dark:bg-gray-800" value={newUser.password} onChange={e=>setNewUser({...newUser, password: e.target.value})} />
                <select className="px-3 py-2 border rounded bg-white dark:bg-gray-800" value={newUser.role} onChange={e=>setNewUser({...newUser, role: e.target.value as UserItem['role']})}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="CLERK">CLERK</option>
                  <option value="PASTOR">PASTOR</option>
                  <option value="MEMBER">MEMBER</option>
                </select>
                <button className="btn-primary" onClick={createUser} disabled={!newUser.email || !newUser.password || !newUser.name}>Create</button>
              </div>
            </div>
          ) : (
            <div className="p-3 border rounded bg-yellow-50 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">Only Admin can add or delete users.</div>
          )}
          {usersLoading ? <div>Loading users...</div> : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="text-left p-2">ID</th><th className="text-left p-2">User</th><th className="text-left p-2">Email</th><th className="text-left p-2">Role</th><th className="text-left p-2">Actions</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{u.id}</span>
                        <button className="px-2 py-1 border rounded" onClick={()=>navigator.clipboard.writeText(String(u.id))}>Copy</button>
                      </div>
                    </td>
                    <td className="p-2">{u.name}</td>
                    <td className="p-2">{u.email}</td>
                    <td className="p-2">{u.role}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <select className="px-2 py-1 border rounded" value={u.role} onChange={(e)=>updateRole(u.id, e.target.value as UserItem['role'])}>
                          {role==='ADMIN' && <option value="ADMIN">ADMIN</option>}
                          <option value="CLERK">CLERK</option>
                          <option value="PASTOR">PASTOR</option>
                          <option value="MEMBER">MEMBER</option>
                        </select>
                        {role==='ADMIN' && (
                          <button className="px-2 py-1 rounded bg-red-600 text-white" onClick={()=>deleteUser(u.id)} disabled={String(u.id)===localStorage.getItem('fc_user_id')}>Delete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab==='backup' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">System Backup & Restore</h2>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={downloadBackup}>Download Backup</button>
            <label className="px-3 py-2 border rounded cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={(e)=>restore(e.target.files?.[0])} />
              Restore from file
            </label>
          </div>
          <p className="text-xs text-gray-600">Current restore imports Settings and Announcements. Extendable later.</p>
        </div>
      )}

      {tab==='email' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Email Server (SMTP)</h2>
          {smtpLoading ? <div>Loading...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm">Host</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={smtp.host} onChange={e=>setSmtp({...smtp, host: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Port</label>
                <input type="number" className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={smtp.port} onChange={e=>setSmtp({...smtp, port: Number(e.target.value)})} />
              </div>
              <div>
                <label className="text-sm">Secure (TLS)</label>
                <select className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={smtp.secure ? '1':'0'} onChange={e=>setSmtp({...smtp, secure: e.target.value==='1'})}>
                  <option value="0">No</option>
                  <option value="1">Yes</option>
                </select>
              </div>
              <div>
                <label className="text-sm">User</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={smtp.user} onChange={e=>setSmtp({...smtp, user: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">Password</label>
                <input type="password" className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={smtp.pass} onChange={e=>setSmtp({...smtp, pass: e.target.value})} />
              </div>
            </div>
          )}
          <div>
            <button className="btn-primary" onClick={saveSmtp}>Save SMTP</button>
          </div>
          <p className="text-xs text-gray-600">Credentials are stored in the Settings table; consider env vars for production.</p>
        </div>
      )}

      {tab==='sms' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">SMS Server</h2>
          {smsLoading ? <div>Loading...</div> : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-sm">Provider</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={sms.provider} onChange={e=>setSms({...sms, provider: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">API Key</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={sms.apiKey} onChange={e=>setSms({...sms, apiKey: e.target.value})} />
              </div>
              <div>
                <label className="text-sm">From</label>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={sms.from} onChange={e=>setSms({...sms, from: e.target.value})} />
              </div>
            </div>
          )}
          <div>
            <button className="btn-primary" onClick={saveSms}>Save SMS</button>
          </div>
          <p className="text-xs text-gray-600">Use provider docs to configure sender IDs and country routing.</p>
        </div>
      )}

      {tab==='security' && (
        <div className="card space-y-3">
          <h2 className="text-lg font-medium">Security: Two-Factor Authentication</h2>
          {['ADMIN','CLERK','PASTOR'].includes(role) ? (
            <TwoFactorPanel />
          ) : (
            <div className="p-2 bg-yellow-50 text-yellow-800 rounded text-sm">Only staff can manage 2FA.</div>
          )}
        </div>
      )}

      {tab==='qr' && (
        <QRAdmin />
      )}
    </div>
  );
}

function LandingEditor() {
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heroTitle, setHeroTitle] = useState<string>('');
  const [heroSubtitle, setHeroSubtitle] = useState<string>('');
  const [ctaMemberLabel, setCtaMemberLabel] = useState<string>('Member Login');
  const [ctaAdminLabel, setCtaAdminLabel] = useState<string>('Admin Login');
  const [heroImagePath, setHeroImagePath] = useState<string>('');
  const [features, setFeatures] = useState<Array<{title: string; description: string; icon?: string}>>([
    { title: '', description: '', icon: '' },
    { title: '', description: '', icon: '' },
    { title: '', description: '', icon: '' },
  ]);
  const [testimonials, setTestimonials] = useState<Array<{quote: string; author?: string}>>([
    { quote: '', author: '' },
    { quote: '', author: '' },
  ]);
  const [links, setLinks] = useState<{ features: string; testimonials: string; getStarted: string }>({ features: '#features', testimonials: '#testimonials', getStarted: '#cta' });

  const load = async () => {
    try {
      setLoading(true);
      const r = await api.get('/settings/landing');
      const d = r?.data || {};
      setHeroTitle(String(d.heroTitle || ''));
      setHeroSubtitle(String(d.heroSubtitle || ''));
      setCtaMemberLabel(String(d.ctaMemberLabel || 'Member Login'));
      setCtaAdminLabel(String(d.ctaAdminLabel || 'Admin Login'));
      setHeroImagePath(String(d.heroImagePath || ''));
      setFeatures(Array.isArray(d.features) && d.features.length ? d.features : features);
      setTestimonials(Array.isArray(d.testimonials) && d.testimonials.length ? d.testimonials : testimonials);
      setLinks((d.links && typeof d.links === 'object') ? {
        features: String(d.links.features || '#features'),
        testimonials: String(d.links.testimonials || '#testimonials'),
        getStarted: String(d.links.getStarted || '#cta'),
      } : { features: '#features', testimonials: '#testimonials', getStarted: '#cta' });
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load');
    } finally { setLoading(false); }
  };

  const save = async () => {
    setMsg(null); setError(null);
    try {
      await api.put('/settings/landing', {
        heroTitle,
        heroSubtitle,
        ctaMemberLabel,
        ctaAdminLabel,
        heroImagePath,
        features: features.map(f => ({ title: (f.title||'').trim(), description: (f.description||'').trim(), icon: (f.icon||'').trim() })).filter(f => f.title && f.description).slice(0,3),
        testimonials: testimonials.map(t => ({ quote: (t.quote||'').trim(), author: (t.author||'').trim() })).filter(t => t.quote).slice(0,2),
        links: { features: (links.features||'').trim() || '#features', testimonials: (links.testimonials||'').trim() || '#testimonials', getStarted: (links.getStarted||'').trim() || '#cta' },
      });
      setMsg('Landing page saved');
      setTimeout(()=> setMsg(null), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    }
  };

  useEffect(() => { if (['ADMIN'].includes(role)) load(); }, [role]);

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-medium">Landing Page</h2>
      {msg && <div className="p-2 text-sm bg-green-50 text-green-700 rounded" aria-live="polite">{msg}</div>}
      {error && <div className="p-2 text-sm bg-red-50 text-red-700 rounded" aria-live="polite">{error}</div>}
      {loading ? (<div>Loading…</div>) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Hero Title<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={heroTitle} onChange={e=>setHeroTitle(e.target.value)} /></label>
            <label className="text-sm">Hero Subtitle<textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" rows={3} value={heroSubtitle} onChange={e=>setHeroSubtitle(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">Member CTA Label<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={ctaMemberLabel} onChange={e=>setCtaMemberLabel(e.target.value)} /></label>
            <label className="text-sm">Admin CTA Label<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={ctaAdminLabel} onChange={e=>setCtaAdminLabel(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">Top-right Features Link<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={links.features} onChange={e=>setLinks(v=>({ ...v, features: e.target.value }))} placeholder="#features or /features" /></label>
            <label className="text-sm">Top-right Testimonials Link<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={links.testimonials} onChange={e=>setLinks(v=>({ ...v, testimonials: e.target.value }))} placeholder="#testimonials or /testimonials" /></label>
            <label className="text-sm">Top-right Get Started Link<input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={links.getStarted} onChange={e=>setLinks(v=>({ ...v, getStarted: e.target.value }))} placeholder="#cta or /get-started" /></label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-sm">Landing Image</label>
              <input type="file" className="mt-1 block w-full text-sm file:mr-3 file:px-3 file:py-2 file:border-0 file:bg-gray-100 file:rounded file:text-gray-700 hover:file:bg-gray-200" onChange={async (e)=>{
                const f = e.target.files?.[0];
                if (!f) return;
                setError(null); setMsg(null);
                try {
                  const fd = new FormData(); fd.append('image', f);
                  const { data } = await api.post('/settings/landing/image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  setHeroImagePath(String(data?.path || ''));
                  setMsg('Image uploaded'); setTimeout(()=>setMsg(null), 2000);
                } catch (err: any) {
                  setError(err?.response?.data?.message || 'Failed to upload image');
                }
              }} />
              <p className="text-xs text-gray-600 mt-1">Optional image for the landing hero (header or aside).</p>
            </div>
            <div className="text-center">
              {heroImagePath ? (
                <img src={`${api.defaults.baseURL}/uploads/${heroImagePath}`} alt="Landing preview" className="inline-block max-h-32 rounded border" />
              ) : (
                <span className="text-xs text-gray-600">No image selected</span>
              )}
            </div>
          </div>
          <div>
            <h3 className="text-md font-medium">Features</h3>
            <div className="space-y-2">
              {features.map((f, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" placeholder="Title" value={f.title} onChange={e=>{
                    const next = [...features]; next[i] = { ...next[i], title: e.target.value }; setFeatures(next);
                  }} />
                  <input className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" placeholder="Description" value={f.description} onChange={e=>{
                    const next = [...features]; next[i] = { ...next[i], description: e.target.value }; setFeatures(next);
                  }} />
                  <input className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" placeholder="Icon (emoji or short text)" value={f.icon || ''} onChange={e=>{
                    const next = [...features]; next[i] = { ...next[i], icon: e.target.value }; setFeatures(next);
                  }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-md font-medium">Testimonials</h3>
            <div className="space-y-2">
              {testimonials.map((t, i) => (
                <div key={i} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <textarea className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" rows={2} placeholder="Quote" value={t.quote} onChange={e=>{
                    const next = [...testimonials]; next[i] = { ...next[i], quote: e.target.value }; setTestimonials(next);
                  }} />
                  <input className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" placeholder="Author" value={t.author || ''} onChange={e=>{
                    const next = [...testimonials]; next[i] = { ...next[i], author: e.target.value }; setTestimonials(next);
                  }} />
                  <div />
                </div>
              ))}
            </div>
          </div>
          <div>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileRequests() {
  const [items, setItems] = useState<Array<{ id: number; member: any; changes: any; status: 'PENDING'|'APPROVED'|'DECLINED'; timestamp: string }>>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string| null>(null);

  const load = async () => {
    try { setLoading(true); const { data } = await api.get('/members/requests'); setItems(data || []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approve = async (id: number) => {
    try { setMsg(null); await api.post(`/members/requests/${id}/approve`); setMsg('Request approved'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Failed to approve'); }
    finally { setTimeout(()=> setMsg(null), 3000); }
  };
  const decline = async (id: number) => {
    try { setMsg(null); await api.post(`/members/requests/${id}/decline`); setMsg('Request declined'); await load(); }
    catch (e: any) { setMsg(e?.response?.data?.message || 'Failed to decline'); }
    finally { setTimeout(()=> setMsg(null), 3000); }
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-medium">Profile Update Requests</h2>
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      {loading ? (<div>Loading…</div>) : items.length === 0 ? (
        <p className="text-sm text-gray-600">No requests.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="text-left p-2">Member</th><th className="text-left p-2">Submitted</th><th className="text-left p-2">Changes</th><th className="text-left p-2">Status</th><th className="text-left p-2">Actions</th></tr></thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700">
                <td className="p-2">{r.member ? `${r.member.firstName} ${r.member.lastName}` : '-'}</td>
                <td className="p-2">{new Date(r.timestamp).toLocaleString()}</td>
                <td className="p-2"><code className="text-xs">{JSON.stringify(r.changes)}</code></td>
                <td className="p-2">
                  {r.status === 'PENDING' && <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">Pending</span>}
                  {r.status === 'APPROVED' && <span className="px-2 py-1 rounded bg-green-100 text-green-800">Approved</span>}
                  {r.status === 'DECLINED' && <span className="px-2 py-1 rounded bg-red-100 text-red-800">Declined</span>}
                </td>
                <td className="p-2">
                  <div className="flex gap-2">
                    {r.status === 'PENDING' ? (
                      <>
                        <button className="btn-primary" onClick={()=>approve(r.id)}>Approve</button>
                        <button className="px-3 py-2 border rounded" onClick={()=>decline(r.id)}>Decline</button>
                      </>
                    ) : r.status === 'APPROVED' ? (
                      <button className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50" disabled aria-disabled>Approved</button>
                    ) : (
                      <button className="px-3 py-2 rounded bg-gray-300 text-gray-700 disabled:opacity-50" disabled aria-disabled>Declined</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ManageProfile() {
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string| null>(null);
  const [photoMsg, setPhotoMsg] = useState<string| null>(null);
  const [pwdMsg, setPwdMsg] = useState<string| null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changes, setChanges] = useState<{ contact?: string; address?: string; maritalStatus?: string }>({});
  const [requestMsg, setRequestMsg] = useState<string| null>(null);
  const [requests, setRequests] = useState<Array<{ id: number; timestamp: string; status: 'PENDING'|'APPROVED'|'DECLINED'; changes: any }>>([]);
  const [groups, setGroups] = useState<Array<{ id: number; groupId: number; registeredAt: string; group?: { id: number; name: string } }>>([]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/members/me');
      setMember(data);
      setChanges({ contact: data?.contact || '', address: data?.address || '', maritalStatus: data?.maritalStatus || '' });
      if (data?.id) {
        try { const mg = await api.get(`/cell-groups/member/${data.id}`); setGroups(mg.data || []); } catch { setGroups([]); }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const { data } = await api.get('/members/me/requests');
      setRequests(data || []);
    } catch {}
  };

  useEffect(() => { loadProfile(); loadRequests(); }, []);

  const uploadPhoto = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setPhotoMsg('File too large (max 5 MB)'); return; }
    if (!(file.type || '').startsWith('image/')) { setPhotoMsg('Invalid file type'); return; }
    try {
      setPhotoMsg(null);
      const form = new FormData();
      form.append('photo', file);
      await api.post('/members/me/photo', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPhotoMsg('Photo updated');
      await loadProfile();
    } catch (e: any) {
      setPhotoMsg(e?.response?.data?.message || 'Failed to upload photo');
    } finally {
      setTimeout(()=> setPhotoMsg(null), 3000);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    if (!currentPassword || !newPassword) { setPwdMsg('Enter current and new password'); return; }
    if (newPassword !== confirmPassword) { setPwdMsg('New passwords do not match'); return; }
    try {
      await api.patch('/auth/me/password', { currentPassword, newPassword });
      setPwdMsg('Password updated');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (e: any) {
      setPwdMsg(e?.response?.data?.message || 'Failed to update password');
    } finally {
      setTimeout(()=> setPwdMsg(null), 3000);
    }
  };

  const submitRequest = async () => {
    try {
      setRequestMsg(null);
      const payload: any = {};
      if (changes.contact !== member?.contact) payload.contact = changes.contact;
      if (changes.address !== member?.address) payload.address = changes.address;
      if (changes.maritalStatus !== member?.maritalStatus) payload.maritalStatus = changes.maritalStatus;
      if (!Object.keys(payload).length) { setRequestMsg('No changes detected'); return; }
      await api.post('/members/me/request-update', { changes: payload });
      setRequestMsg('Update request submitted');
      await loadRequests();
    } catch (e: any) {
      setRequestMsg(e?.response?.data?.message || 'Failed to submit request');
    } finally {
      setTimeout(()=> setRequestMsg(null), 3000);
    }
  };

  return (
    <div className="card space-y-4">
      <h2 className="text-lg font-medium">Manage Profile</h2>
      {loading ? (<div>Loading profile…</div>) : error ? (<div className="p-2 bg-red-50 text-red-700 rounded">{error}</div>) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="space-y-2">
              <h3 className="font-semibold">Profile Information</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-gray-500">First Name</div>
                  <div className="font-medium">{member?.firstName || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Last Name</div>
                  <div className="font-medium">{member?.lastName || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Gender</div>
                  <div className="font-medium">{member?.gender || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Contact</div>
                  <div className="font-medium">{member?.contact || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Address</div>
                  <div className="font-medium">{member?.address || '-'}</div>
                </div>
                <div>
                  <div className="text-gray-500">Marital Status</div>
                  <div className="font-medium">{member?.maritalStatus || '-'}</div>
                </div>
              </div>
              <p className="text-xs text-gray-600">Profile fields are read-only. Submit changes for admin approval.</p>
              <div className="mt-3">
                <h4 className="font-medium">Group Affiliations</h4>
                {groups.length === 0 ? (
                  <div className="text-sm text-gray-600">No groups joined.</div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {groups.map(g => (
                      <li key={g.id} className="flex items-center justify-between border rounded p-2">
                        <span>{g.group?.name || `Group #${g.groupId}`}</span>
                        <span className="text-xs text-gray-500">Joined {new Date(g.registeredAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="font-semibold">Profile Photo</h3>
              {photoMsg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{photoMsg}</div>}
              <div className="flex items-center gap-3">
                {member?.photoUrl && <img src={`${api.defaults.baseURL}${member.photoUrl}`} alt="Profile" className="w-16 h-16 rounded object-cover" />}
                <label className="px-3 py-2 border rounded cursor-pointer text-sm">
                  <input type="file" accept="image/*" className="hidden" onChange={(e)=>uploadPhoto(e.target.files?.[0])} />
                  Upload new photo
                </label>
              </div>
            </section>
          </div>

          <section className="space-y-2">
            <h3 className="font-semibold">Request Profile Update</h3>
            {requestMsg && <div className="p-2 bg-blue-50 text-blue-700 rounded text-sm">{requestMsg}</div>}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-sm">
                <span>Contact</span>
                <input className="input" value={changes.contact || ''} onChange={e=>setChanges({...changes, contact: e.target.value})} />
              </label>
              <label className="block text-sm">
                <span>Address</span>
                <input className="input" value={changes.address || ''} onChange={e=>setChanges({...changes, address: e.target.value})} />
              </label>
              <label className="block text-sm">
                <span>Marital Status</span>
                <select className="input" value={changes.maritalStatus || ''} onChange={e=>setChanges({...changes, maritalStatus: e.target.value})}>
                  <option value="">Select…</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Divorced">Divorced</option>
                  <option value="Widowed">Widowed</option>
                </select>
              </label>
            </div>
            <button className="btn-gold" onClick={submitRequest}>Submit Update Request</button>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Request Status</h3>
            {requests.length === 0 ? (
              <p className="text-sm text-gray-600">No requests yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="text-left p-2">Submitted</th><th className="text-left p-2">Changes</th><th className="text-left p-2">Status</th></tr></thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="p-2">{new Date(r.timestamp).toLocaleString()}</td>
                      <td className="p-2"><code className="text-xs">{JSON.stringify(r.changes)}</code></td>
                      <td className="p-2">
                        {r.status === 'PENDING' && <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800">Pending</span>}
                        {r.status === 'APPROVED' && <span className="px-2 py-1 rounded bg-green-100 text-green-800">Approved</span>}
                        {r.status === 'DECLINED' && <span className="px-2 py-1 rounded bg-red-100 text-red-800">Declined</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="space-y-2 max-w-xl">
            <h3 className="font-semibold">Change Password</h3>
            {pwdMsg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{pwdMsg}</div>}
            <form onSubmit={changePassword} className="space-y-3">
              <label className="block text-sm">
                <span>Current Password</span>
                <input type="password" className="input" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span>New Password</span>
                <input type="password" className="input" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span>Confirm New Password</span>
                <input type="password" className="input" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
              </label>
              <button className="btn-gold" type="submit">Update Password</button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function TwoFactorPanel() {
  const [setup, setSetup] = useState<{ otpauth?: string; qrDataUrl?: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [otp, setOtp] = useState('');
  const [disableOtp, setDisableOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const startSetup = async () => {
    try {
      setErr(null); setMsg(null); setLoading(true);
      const { data } = await api.post('/auth/setup-2fa');
      setSetup({ otpauth: data?.otpauth, qrDataUrl: data?.qrDataUrl });
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to start 2FA setup');
    } finally { setLoading(false); }
  };

  const verify = async () => {
    if (!otp) { setErr('Enter the 6-digit code'); return; }
    try {
      setErr(null); setMsg(null); setLoading(true);
      await api.post('/auth/verify-2fa', { otp });
      setMsg('Two-Factor enabled');
      setSetup(null); setOtp('');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Verification failed');
    } finally { setLoading(false); }
  };

  const disable = async () => {
    if (!disableOtp) { setErr('Enter your 6-digit code to disable'); return; }
    try {
      setErr(null); setMsg(null); setLoading(true);
      await api.post('/auth/disable-2fa', { otp: disableOtp });
      setMsg('Two-Factor disabled');
      setDisableOtp('');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Disable failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="space-y-3">
      {msg && <div className="p-2 bg-green-50 text-green-700 rounded text-sm">{msg}</div>}
      {err && <div className="p-2 bg-red-50 text-red-700 rounded text-sm">{err}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="p-3 border rounded">
          <div className="font-medium mb-1">Enable Two-Factor</div>
          {!setup ? (
            <button className="btn-gold" disabled={loading} onClick={startSetup}>{loading ? 'Starting…' : 'Setup 2FA'}</button>
          ) : (
            <div className="space-y-2">
              {setup.qrDataUrl && (
                <img src={setup.qrDataUrl} alt="2FA QR" className="w-40 h-40 border rounded" />
              )}
              {setup.otpauth && (
                <div className="text-xs break-all"><span className="font-semibold">otpauth:</span> {setup.otpauth}</div>
              )}
              <div className="flex items-end gap-2">
                <label className="text-sm flex-1">OTP Code<input className="input" placeholder="123456" value={otp} onChange={e=>setOtp(e.target.value)} /></label>
                <button className="btn" disabled={loading} onClick={verify}>Verify & Enable</button>
              </div>
              <p className="text-xs text-gray-600">Scan the QR using Google Authenticator, Authy, or similar, then enter the current code.</p>
            </div>
          )}
        </section>
        <section className="p-3 border rounded">
          <div className="font-medium mb-1">Disable Two-Factor</div>
          <div className="flex items-end gap-2">
            <label className="text-sm flex-1">OTP Code<input className="input" placeholder="123456" value={disableOtp} onChange={e=>setDisableOtp(e.target.value)} /></label>
            <button className="btn-red" disabled={loading} onClick={disable}>Disable</button>
          </div>
          <p className="text-xs text-gray-600">Enter a valid OTP to confirm disabling 2FA.</p>
        </section>
      </div>
    </div>
  );
}

function ImportColumnsManager() {
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  type Column = { key: string; label: string; required: boolean; type: 'string'|'date'|'boolean'|'enum'|'number'; enumValues?: string[]; aliases?: string[] };
  const [cols, setCols] = useState<Column[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { setLoading(true); const { data } = await api.get('/settings/member-import/columns'); setCols(Array.isArray(data) ? data : []); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const update = (idx: number, next: Partial<Column>) => {
    setCols(list => list.map((c, i) => i===idx ? { ...c, ...next } : c));
  };
  const add = () => setCols(list => ([...list, { key: '', label: '', required: false, type: 'string', enumValues: [], aliases: [] }]));
  const remove = (idx: number) => setCols(list => list.filter((_, i) => i!==idx));

  const save = async () => {
    setMsg(null); setError(null);
    if (role !== 'ADMIN') { setError('Only Admin can save'); return; }
    const normalized = cols.map(c => ({
      key: (c.key || '').trim(),
      label: (c.label || '').trim(),
      required: !!c.required,
      type: c.type,
      enumValues: c.type==='enum' ? (Array.isArray(c.enumValues) ? c.enumValues : []) : undefined,
      aliases: Array.isArray(c.aliases) ? c.aliases : [],
    }));
    if (normalized.some(c => !c.key || !c.label)) { setError('Each column requires key and label'); return; }
    try {
      await api.post('/settings/member-import/columns', normalized);
      setMsg('Import columns saved'); setTimeout(()=> setMsg(null), 2500);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save');
    }
  };

  return (
    <div className="card space-y-3">
      <h2 className="text-lg font-medium">Member Import Columns</h2>
      {msg && <div className="p-2 text-sm bg-green-50 text-green-700 rounded" aria-live="polite">{msg}</div>}
      {error && <div className="p-2 text-sm bg-red-50 text-red-700 rounded" aria-live="polite">{error}</div>}
      {loading ? (<div>Loading…</div>) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm font-medium">
            <div>Key</div>
            <div>Label</div>
            <div>Required</div>
            <div>Type</div>
            <div>Enum Values (comma)</div>
            <div>Aliases (comma)</div>
          </div>
          {cols.map((c, idx) => (
            <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-sm items-center">
              <input value={c.key} onChange={e=>update(idx,{ key: e.target.value })} className="fc-input" />
              <input value={c.label} onChange={e=>update(idx,{ label: e.target.value })} className="fc-input" />
              <label className="flex items-center gap-2"><input type="checkbox" checked={c.required} onChange={e=>update(idx,{ required: e.target.checked })} /> Required</label>
              <select value={c.type} onChange={e=>update(idx,{ type: e.target.value as Column['type'] })} className="fc-input">
                <option value="string">string</option>
                <option value="date">date</option>
                <option value="boolean">boolean</option>
                <option value="number">number</option>
                <option value="enum">enum</option>
              </select>
              <input value={(c.enumValues||[]).join(', ')} onChange={e=>update(idx,{ enumValues: e.target.value ? e.target.value.split(',').map(s=>s.trim()).filter(Boolean) : [] })} className="fc-input" />
              <div className="flex items-center gap-2">
                <input value={(c.aliases||[]).join(', ')} onChange={e=>update(idx,{ aliases: e.target.value ? e.target.value.split(',').map(s=>s.trim()).filter(Boolean) : [] })} className="fc-input" />
                <button className="btn text-red-600" onClick={()=>remove(idx)}>Delete</button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button className="btn" onClick={add}>Add Column</button>
            <button className="btn-primary" onClick={save}>Save</button>
          </div>
          <p className="text-xs text-gray-600">Editing label and aliases adjusts validation and mapping for CSV/Excel imports. Unknown keys are stored under the member’s <code>abilities.extras</code> JSON.</p>
        </div>
      )}
    </div>
  );
}
