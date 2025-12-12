import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import api from "../api/client";

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  gender: string;
  contact?: string;
  address?: string;
  spiritualStatus?: string;
  dateJoined: string;
  dob?: string | null;
  photoUrl?: string;
  baptized?: boolean;
  dedicated?: boolean;
  weddingDate?: string | null;
  departmentId?: number | null;
  userId?: number | null;
  membershipNumber?: string | null;
  membershipStatus?: string | null;
  profession?: string | null;
  talents?: string | null;
  abilities?: string | null;
}
interface Department { id: number; name: string }

export default function MemberDetails() {
  const { id } = useParams();
  const memberId = Number(id);
  const location = useLocation();
  const stateMember = (location.state as Member | undefined) || undefined;
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);

  const [member, setMember] = useState<Member | null>(stateMember || null);
  const [ministries, setMinistries] = useState<Department[]>([]);
  const [memberMinistries, setMemberMinistries] = useState<Department[]>([]);
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [familyParents, setFamilyParents] = useState<Member[]>([]);
  const [familyChildren, setFamilyChildren] = useState<Member[]>([]);
  const [parentIds, setParentIds] = useState<number[]>([]);
  const [childIds, setChildIds] = useState<number[]>([]);
  const [parentSearch, setParentSearch] = useState<string>('');
  const [childSearch, setChildSearch] = useState<string>('');
  const [familySaving, setFamilySaving] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'view'|'edit'>('view');

  // Editable fields
  const [firstName, setFirstName] = useState(member?.firstName || "");
  const [lastName, setLastName] = useState(member?.lastName || "");
  const [gender, setGender] = useState(member?.gender || "MALE");
  const [contact, setContact] = useState(member?.contact || "");
  const [address, setAddress] = useState(member?.address || "");
  const [spiritualStatus, setSpiritualStatus] = useState(member?.spiritualStatus || "");
  const [spiritualStatuses, setSpiritualStatuses] = useState<string[]>([]);
  const [membershipStatuses, setMembershipStatuses] = useState<string[]>([]);
  const [membershipNumber, setMembershipNumber] = useState(member?.membershipNumber || "");
  const [membershipStatus, setMembershipStatus] = useState(member?.membershipStatus || "");
  const [profession, setProfession] = useState(member?.profession || "");
  const [talents, setTalents] = useState(member?.talents || "");
  const [abilities, setAbilities] = useState(member?.abilities || "");
  const [weddingDate, setWeddingDate] = useState<string>(member?.weddingDate ? new Date(member.weddingDate).toISOString().slice(0,10) : "");
  const [dob, setDob] = useState<string>(member?.dob ? new Date(member.dob).toISOString().slice(0,10) : "");
  const [dateJoined, setDateJoined] = useState<string>(member?.dateJoined ? new Date(member.dateJoined).toISOString().slice(0,10) : "");
  const [ministryIdInput, setMinistryIdInput] = useState<number | ''>(member?.departmentId ?? '');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isBaptized, setIsBaptized] = useState<boolean>(!!member?.baptized);
  const [isDedicated, setIsDedicated] = useState<boolean>(!!member?.dedicated);
  // Link user account
  const [linkUserId, setLinkUserId] = useState<number | ''>(member?.userId ?? '');
  const [linking, setLinking] = useState<boolean>(false);
  const [memberEmail, setMemberEmail] = useState<string>('');
  const [deptQuery, setDeptQuery] = useState<string>('');
  const [groups, setGroups] = useState<{ id: number; name: string; location?: string | null }[]>([]);
  const [groupQuery, setGroupQuery] = useState<string>('');
  const [groupIdInput, setGroupIdInput] = useState<number | ''>('');
  const [currentGroupId, setCurrentGroupId] = useState<number | null>(null);
  const [currentGroupName, setCurrentGroupName] = useState<string>('');

  useEffect(() => {
    (async () => {
      try {
        // If member not provided, load from list and find by id
        if (!stateMember) {
          const res = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
          const list: Member[] = (res.data?.items ?? res.data ?? []) || [];
          setAllMembers(list);
          const found = list.find(m => m.id === memberId) || null;
          setMember(found);
          if (found) {
            setFirstName(found.firstName);
            setLastName(found.lastName);
            setGender(found.gender);
            setContact(found.contact || "");
            setAddress(found.address || "");
            setSpiritualStatus(found.spiritualStatus || "");
            setMembershipNumber(found.membershipNumber || "");
            setMembershipStatus(found.membershipStatus || "");
            setProfession(found.profession || "");
            setTalents(found.talents || "");
            setAbilities(found.abilities || "");
            setWeddingDate(found.weddingDate ? new Date(found.weddingDate).toISOString().slice(0,10) : "");
            setDob(found.dob ? new Date(found.dob).toISOString().slice(0,10) : "");
            setDateJoined(found.dateJoined ? new Date(found.dateJoined).toISOString().slice(0,10) : "");
            setMinistryIdInput(found.departmentId ?? '');
            setLinkUserId(found.userId ?? '');
            setIsBaptized(!!found.baptized);
            setIsDedicated(!!found.dedicated);
            // Load email via linked user for admin/clerk viewers
            if (found.userId && (role === 'ADMIN' || role === 'CLERK')) {
              try {
                const usersRes = await api.get('/auth/users');
                const users = Array.isArray(usersRes.data) ? usersRes.data : [];
                const u = users.find((x: any) => x.id === found.userId);
                if (u?.email) setMemberEmail(u.email);
              } catch { /* ignore */ }
            }
          }
        }
        // Load each dataset independently to avoid a single failure breaking the page
        try { const minRes = await api.get('/departments'); setMinistries(minRes.data || []); } catch { setMinistries([]); }
        try { const mmRes = await api.get(`/members/${memberId}/departments`); setMemberMinistries(mmRes.data || []); } catch { setMemberMinistries([]); }
        try { const cgRes = await api.get('/cell-groups'); setGroups(Array.isArray(cgRes.data) ? cgRes.data : []); } catch { setGroups([]); }
        try {
          const mgRes = await api.get(`/cell-groups/member/${memberId}`);
          const memberships = Array.isArray(mgRes.data) ? mgRes.data : [];
          const active = memberships.find((m: any) => !m.leftAt && m.group);
          if (active && active.group) {
            setCurrentGroupId(Number(active.group.id));
            setCurrentGroupName(String(active.group.name));
            setGroupIdInput(prev => (prev === '' ? Number(active.group.id) : prev));
          }
        } catch {}
        try {
          const famRes = await api.get(`/members/${memberId}/family`);
          const parents: Member[] = famRes.data?.parents || [];
          const children: Member[] = famRes.data?.children || [];
          setFamilyParents(parents);
          setFamilyChildren(children);
          setParentIds(parents.map(p => p.id));
          setChildIds(children.map(c => c.id));
        } catch { /* ignore family load errors */ }
        try {
          if (stateMember) {
            const listRes = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
            const list: Member[] = (listRes.data?.items ?? listRes.data ?? []) || [];
            setAllMembers(list);
          }
        } catch { /* ignore */ }
        try { const ss = await api.get('/settings/spiritual-statuses'); setSpiritualStatuses(Array.isArray(ss.data) ? ss.data : []); } catch { setSpiritualStatuses(['New Convert','Visitor','Member','Committed','Worker','Baptized','Dedicated']); }
        try { const ms = await api.get('/settings/membership-statuses'); setMembershipStatuses(Array.isArray(ms.data) ? ms.data : []); } catch { setMembershipStatuses(['Active Member','Dormant','Inactive','Transferred','Visitor','Suspended']); }
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || 'Failed to load member details');
      }
    })();
  }, [memberId]);

  useEffect(() => {
    (async () => {
      if (member?.userId && (role === 'ADMIN' || role === 'CLERK')) {
        try {
          const usersRes = await api.get('/auth/users');
          const users = Array.isArray(usersRes.data) ? usersRes.data : [];
          const u = users.find((x: any) => x.id === member.userId);
          if (u?.email) setMemberEmail(u.email);
        } catch { /* ignore */ }
      }
    })();
  }, [member?.userId, role]);

  const refreshMember = async () => {
    const res = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
    const list: Member[] = (res.data?.items ?? res.data ?? []) || [];
    const updated = list.find(m => m.id === memberId) || null;
    setMember(updated);
    setLinkUserId(updated?.userId ?? '');
  };

  const linkUser = async () => {
    if (linkUserId === '') { setError('Enter a User ID to link'); return; }
    if (typeof linkUserId !== 'number' || !Number.isFinite(linkUserId) || Number(linkUserId) <= 0) {
      setError('User ID must be a positive number');
      return;
    }
    try {
      setLinking(true);
      setError(null);
      await api.put(`/members/${memberId}`, { userId: Number(linkUserId) });
      await refreshMember();
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to link user');
    } finally { setLinking(false); }
  };

  const unlinkUser = async () => {
    try {
      setLinking(true);
      setError(null);
      await api.put(`/members/${memberId}`, { userId: null });
      await refreshMember();
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to unlink user');
    } finally { setLinking(false); }
  };

  const save = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.put(`/members/${memberId}`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        contact: contact.trim() || undefined,
        address: address.trim() || undefined,
        spiritualStatus: spiritualStatus.trim() || undefined,
        membershipNumber: membershipNumber.trim() || undefined,
        membershipStatus: membershipStatus.trim() || undefined,
        profession: profession.trim() || undefined,
        talents: talents.trim() || undefined,
        abilities: abilities.trim() || undefined,
        weddingDate: weddingDate ? new Date(weddingDate).toISOString() : null,
        dob: dob ? new Date(dob).toISOString() : undefined,
        dateJoined: dateJoined ? new Date(dateJoined).toISOString() : undefined,
        departmentId: ministryIdInput === '' ? null : Number(ministryIdInput),
        baptized: !!isBaptized,
        dedicated: !!isDedicated,
      });
      if (photoFile) {
        const fd = new FormData();
        fd.append('photo', photoFile);
        await api.post(`/members/${memberId}/photo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      const res = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
      const list: Member[] = (res.data?.items ?? res.data ?? []) || [];
      const updated = list.find(m => m.id === memberId) || null;
      setMember(updated);
      setIsBaptized(!!updated?.baptized);
      setIsDedicated(!!updated?.dedicated);
      setMode('view');
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to save changes');
    } finally { setLoading(false); }
  };

  const title = useMemo(() => member ? `${member.firstName} ${member.lastName}` : 'Member', [member]);
  const isView = mode === 'view';
  const inputCls = "fc-input mt-1";
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const handlePhotoSelect = (file?: File | null) => {
    if (!file) { setPhotoFile(null); setPhotoPreviewUrl(null); return; }
    if (!file.type.startsWith('image/')) {
      setPhotoError('Invalid file type. Please upload an image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('File too large (max 5 MB).');
      return;
    }
    setPhotoError(null);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreviewUrl(url);
  };
  useEffect(()=>{ return ()=>{ if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl); }; }, [photoPreviewUrl]);

  const toggleArrayId = (arr: number[], id: number) => arr.includes(id) ? arr.filter(x=>x!==id) : [...arr, id];
  const saveFamily = async () => {
    try {
      setFamilySaving(true);
      const cleanParents = Array.from(new Set(parentIds.filter(id => Number.isFinite(id) && id !== memberId)));
      const cleanChildren = Array.from(new Set(childIds.filter(id => Number.isFinite(id) && id !== memberId)));
      await api.post(`/members/${memberId}/parents`, { parentIds: cleanParents });
      await api.post(`/members/${memberId}/children`, { childIds: cleanChildren });
      const famRes = await api.get(`/members/${memberId}/family`);
      const parents: Member[] = famRes.data.parents || [];
      const children: Member[] = famRes.data.children || [];
      setFamilyParents(parents);
      setFamilyChildren(children);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to save family relations');
    } finally {
      setFamilySaving(false);
    }
  };

  const [adminNewPassword, setAdminNewPassword] = useState('');
  const resetLinkedPassword = async () => {
    if (!member?.userId) { setError('No linked user to reset'); return; }
    if (!adminNewPassword.trim()) { setError('Enter a new password'); return; }
    try {
      setError(null);
      await api.patch(`/auth/users/${member.userId}/password`, { newPassword: adminNewPassword });
      setAdminNewPassword('');
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to reset password');
    }
  };

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-600">
        <Link className="hover:underline" to="/members">Members</Link>
        <span> / </span>
        <span>{title}</span>
      </nav>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Member Details — {title}</h2>
        <div className="flex items-center gap-2">
          <button className={`btn ${isView ? 'btn-gold' : ''}`} onClick={()=>setMode('view')}>View</button>
          <button className={`btn ${!isView ? 'btn-gold' : ''}`} onClick={()=>setMode('edit')}>Edit</button>
          <Link to="/members" className="btn-gold">Back to Members</Link>
        </div>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      {/* Photo (moved to top for alignment) */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Photo</h3>
        <div className="flex items-center gap-3">
          {photoPreviewUrl ? (
            <img src={photoPreviewUrl} alt="Preview" className="fc-thumb" />
          ) : member?.photoUrl ? (
            <img src={`${api.defaults.baseURL}${member.photoUrl}`} alt="Member" className="fc-thumb" />
          ) : (
            <div className="w-24 h-24 rounded bg-gray-200 flex items-center justify-center text-gray-500">No Photo</div>
          )}
          <div
            className={`fc-dropzone ${dragActive ? 'active' : ''} ${isView ? 'disabled' : ''}`}
            onDragOver={(e)=>{ e.preventDefault(); if (!isView) setDragActive(true); }}
            onDragLeave={()=>setDragActive(false)}
            onDrop={(e)=>{ e.preventDefault(); setDragActive(false); if (isView) return; const f = e.dataTransfer.files?.[0]; handlePhotoSelect(f || null); }}
          >
            <span>{isView ? 'Viewing mode' : 'Drag & drop or click to upload'}</span>
            <label className="btn" style={{ marginLeft: 8 }}>
              <input type="file" accept="image/*" className="sr-only" onChange={(e)=>handlePhotoSelect(e.target.files?.[0] || null)} disabled={isView} />
              Browse
            </label>
          </div>
        </div>
        {photoError && <div className="mt-2 text-sm text-red-600">{photoError}</div>}
      </section>

      {/* Profile */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Profile</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm">First Name</span>
            <input className={inputCls} value={firstName} onChange={e=>setFirstName(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Last Name</span>
            <input className={inputCls} value={lastName} onChange={e=>setLastName(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Gender</span>
            <select className={inputCls} value={gender} onChange={e=>setGender(e.target.value)} disabled={isView}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Contact</span>
            <input className={inputCls} value={contact} onChange={e=>setContact(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Email</span>
            <input className={inputCls} value={memberEmail || ''} onChange={()=>{}} disabled />
          </label>
          <label className="block">
            <span className="text-sm">Address</span>
            <input className={inputCls} value={address} onChange={e=>setAddress(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Date of Birth</span>
            <input type="date" className={inputCls} value={dob} readOnly onKeyDown={(e)=> e.preventDefault()} onChange={e=>setDob(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Date Joined</span>
            <input type="date" className={inputCls} value={dateJoined} readOnly onKeyDown={(e)=> e.preventDefault()} onChange={e=>setDateJoined(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Spiritual Status</span>
            <select className={inputCls} value={spiritualStatus || ''} onChange={e=>setSpiritualStatus(e.target.value)} disabled={isView}>
              <option value="">Select status</option>
              {spiritualStatuses.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm">Membership Number</span>
            <input className={inputCls} value={membershipNumber} onChange={e=>setMembershipNumber(e.target.value)} disabled={isView} />
          </label>
          <label className="block">
            <span className="text-sm">Membership Status</span>
            <select className={inputCls} value={membershipStatus || ''} onChange={e=>setMembershipStatus(e.target.value)} disabled={isView}>
              <option value="">Select status</option>
              {membershipStatuses.map(s => (<option key={s} value={s}>{s}</option>))}
            </select>
          </label>
        </div>
      </section>

      {/* Register Pulldown */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Register Pulldown</h3>
        <p className="text-sm text-gray-600 mb-2">Passport photo is below; capture talents, abilities, and profession here.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block md:col-span-2">
            <span className="text-sm">Profession</span>
            <input className={inputCls} value={profession} onChange={e=>setProfession(e.target.value)} disabled={isView} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm">Talents (comma-separated)</span>
            <textarea className={inputCls} value={talents} onChange={e=>setTalents(e.target.value)} disabled={isView} rows={2} />
          </label>
          <label className="block md:col-span-2">
            <span className="text-sm">Abilities (comma-separated)</span>
            <textarea className={inputCls} value={abilities} onChange={e=>setAbilities(e.target.value)} disabled={isView} rows={2} />
          </label>
        </div>
      </section>

      {/* Sacraments */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Sacraments & Family</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isBaptized} onChange={e=>setIsBaptized(e.target.checked)} disabled={isView} />
            <span>Baptized</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isDedicated} onChange={e=>setIsDedicated(e.target.checked)} disabled={isView} />
            <span>Dedicated</span>
          </label>
          <label className="block">
            <span className="text-sm">Wedding Date</span>
            <input type="date" className={inputCls} value={weddingDate} readOnly onKeyDown={(e)=> e.preventDefault()} onChange={e=>setWeddingDate(e.target.value)} disabled={isView} />
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="font-semibold mb-2">Parents</div>
            <div className="text-sm text-gray-600 mb-2">Selected parents/guardians will be linked to this member.</div>
            <div className="flex items-center gap-2 mb-2">
              <input aria-label="Search parents" className={inputCls} placeholder="Search by name/contact" value={parentSearch} onChange={e=>setParentSearch(e.target.value)} />
            </div>
            <div className="max-h-40 overflow-auto border rounded p-2">
              {allMembers
                .filter(m=>m.id!==memberId)
                .filter(m=>{
                  const q = parentSearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || (m.contact||'').toLowerCase().includes(q);
                })
                .map(m=> (
                <label key={m.id} className="flex items-center gap-2 py-1">
                  <input aria-label={`Select ${m.firstName} ${m.lastName} as parent`} type="checkbox" checked={parentIds.includes(m.id)} onChange={()=> {
                    setParentIds(prev=> {
                      const next = toggleArrayId(prev, m.id);
                      setChildIds(chPrev=> chPrev.filter(x=> x !== m.id));
                      return next;
                    });
                  }} />
                  <span>{m.firstName} {m.lastName}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-600">Currently linked: {familyParents.map(p=> `${p.firstName} ${p.lastName}`).join(', ') || 'None'}</div>
          </div>
          <div>
            <div className="font-semibold mb-2">Children</div>
            <div className="text-sm text-gray-600 mb-2">Selected children will be linked to this member.</div>
            <div className="flex items-center gap-2 mb-2">
              <input aria-label="Search children" className={inputCls} placeholder="Search by name/contact" value={childSearch} onChange={e=>setChildSearch(e.target.value)} />
            </div>
            <div className="max-h-40 overflow-auto border rounded p-2">
              {allMembers
                .filter(m=>m.id!==memberId)
                .filter(m=>{
                  const q = childSearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) || (m.contact||'').toLowerCase().includes(q);
                })
                .map(m=> (
                <label key={m.id} className="flex items-center gap-2 py-1">
                  <input aria-label={`Select ${m.firstName} ${m.lastName} as child`} type="checkbox" checked={childIds.includes(m.id)} onChange={()=> {
                    setChildIds(prev=> {
                      const next = toggleArrayId(prev, m.id);
                      setParentIds(pPrev=> pPrev.filter(x=> x !== m.id));
                      return next;
                    });
                  }} />
                  <span>{m.firstName} {m.lastName}</span>
                </label>
              ))}
            </div>
            <div className="mt-2 text-xs text-gray-600">Currently linked: {familyChildren.map(c=> `${c.firstName} ${c.lastName}`).join(', ') || 'None'}</div>
          </div>
        </div>
        <div className="mt-3">
          <button className="btn-gold" onClick={saveFamily} disabled={familySaving}>Save Family Links</button>
        </div>
      </section>

      {/* Cell Groups */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Cell Groups</h3>
        {memberMinistries.length === 0 ? (
          <div className="text-sm text-gray-600">No departments yet.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {memberMinistries.map(min => (
              <a key={min.id} href={`/ministries/${min.id}/members`} className="px-2 py-1 text-xs bg-faith-gold text-white rounded hover:opacity-90">{min.name}</a>
            ))}
          </div>
        )}
        <div className="mt-3">
          <label className="block max-w-xs">
            <span className="text-sm">Assign to Cell Group</span>
            {currentGroupId && (<div className="text-xs text-gray-600 mb-1">Currently assigned: {currentGroupName}</div>)}
            <input aria-label="Search cell groups" className={`${inputCls} mb-2`} placeholder="Search cell groups" value={groupQuery} onChange={e=>setGroupQuery(e.target.value)} disabled={isView} />
            <select aria-label="Cell group selection" className={inputCls} value={groupIdInput} onChange={e=>setGroupIdInput(e.target.value ? Number(e.target.value) : '')} disabled={isView}>
              <option value="">None</option>
              {groups.filter(g => {
                const q = groupQuery.trim().toLowerCase();
                if (!q) return true;
                return g.name.toLowerCase().includes(q) || (g.location || '').toLowerCase().includes(q);
              }).map(g => (<option key={g.id} value={g.id}>{g.name}{g.location ? ` — ${g.location}` : ''}</option>))}
            </select>
          </label>
          {!isView && (
            <div className="mt-2">
              <button className="btn-gold" onClick={async ()=>{
                if (groupIdInput === '' || typeof groupIdInput !== 'number') { setError('Select a cell group'); return; }
                try {
                  await api.post(`/cell-groups/${groupIdInput}/register`, { memberId: memberId });
                } catch (e: any) {
                  setError(e?.response?.data?.message || 'Failed to assign to cell group');
                }
              }} disabled={groupIdInput === '' || (currentGroupId !== null && Number(groupIdInput) === Number(currentGroupId))}>Assign</button>
            </div>
          )}
        </div>
      </section>

      {/* Linked User */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Linked User Account</h3>
        <div className="text-sm text-gray-600 mb-2">
          {member?.userId ? (
            <span>Currently linked to user ID <span className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{member.userId}</span>.</span>
          ) : (
            <span>No linked user. Paste a User ID from <Link to="/settings" className="underline">Settings → Roles & Permissions</Link>.</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-2">Linking connects this member to a login account. The linked user can sign in and view their profile; unlinking removes the association. Only one member can link to a user.</p>
        <div className="flex items-end gap-2 max-w-md">
          <label className="flex-1">
            <span className="text-sm">User ID</span>
            <input title="Enter the numeric ID of an existing user" aria-label="Linked user ID" type="number" className={inputCls} value={linkUserId} onChange={e=>setLinkUserId(e.target.value ? Number(e.target.value) : '')} placeholder="e.g., 12" disabled={linking} />
          </label>
          <button title="Link this member to the given user ID" className="btn-primary" onClick={linkUser} disabled={linking || linkUserId===''}>Link</button>
          <button title="Remove link to the current user" className="btn" onClick={unlinkUser} disabled={linking || !member?.userId}>Unlink</button>
        </div>
        <p className="text-xs text-gray-600 mt-2" aria-live="polite">Linking sets this member’s userId. Unlinking clears it. Only unique users can be linked.</p>

        {(role==='ADMIN' || role==='CLERK') && (
          <div className="mt-4 p-3 border rounded">
            <div className="font-semibold mb-2">Admin: Reset Linked User Password</div>
            <div className="flex items-end gap-2 max-w-md">
              <label className="flex-1">
                <span className="text-sm">New Password</span>
                <input type="password" className={inputCls} value={adminNewPassword} onChange={e=>setAdminNewPassword(e.target.value)} placeholder="Enter new password" />
              </label>
              <button className="btn-gold" onClick={resetLinkedPassword} disabled={!member?.userId}>Reset</button>
            </div>
            <p className="text-xs text-gray-600 mt-2">This resets the password for the linked user account.</p>
          </div>
        )}
      </section>


      <div className="flex items-center gap-2">
        <button className="btn-gold" onClick={save} disabled={loading || isView}>Save Changes</button>
        <button className="btn" onClick={()=>window.print()}>Print</button>
      </div>
    </div>
  );
}
