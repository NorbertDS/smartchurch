import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { printTarget } from '../utils/print';

interface CellGroup { id: number; name: string; description?: string | null; location?: string | null; }
interface Membership { id: number; groupId: number; memberId: number; registeredAt: string; notes?: string | null; leftAt?: string | null; contributions?: Contribution[]; member?: any; }
interface Contribution { id: number; membershipId: number; amount: number; date: string; notes?: string | null; }
interface MemberGroup { id: number; memberId: number; groupId: number; registeredAt: string; group?: CellGroup }
interface MyMembershipDetails { notes?: string | null; contributions: Contribution[]; total: number }
interface GroupSummary { metadata: { id: number; name: string; description?: string | null; location?: string | null }; memberCount: number; contributions: { total: number; perMemberTotals: { memberId: number; name: string; total: number }[] }; rankings: { performanceRank: number; totalGroups: number }; upcomingSchedule: { events: { id: number; title: string; date: string; location?: string | null }[]; programs: { id: number; name: string; startDate: string; location?: string | null }[] } }

export default function CellGroups() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'DEPARTMENT_ADMIN'|'MEMBER'|null);
  const canManage = role && ['ADMIN','CLERK','PASTOR','DEPARTMENT_ADMIN'].includes(role);
  const [groups, setGroups] = useState<CellGroup[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [showMembersModal, setShowMembersModal] = useState<boolean>(false);
  const [memberQ, setMemberQ] = useState<string>('');
  const [memberSort, setMemberSort] = useState<'name_asc'|'name_desc'|'date_desc'|'date_asc'>('name_asc');
  const [myMemberId, setMyMemberId] = useState<number | null>(null);
  const [myGroups, setMyGroups] = useState<MemberGroup[]>([]);
  const [myDetails, setMyDetails] = useState<Record<number, MyMembershipDetails | undefined>>({});
  const [showMyDetailsModal, setShowMyDetailsModal] = useState<boolean>(false);
  const [detailsGroupId, setDetailsGroupId] = useState<number | null>(null);
  const [showGroupModal, setShowGroupModal] = useState<boolean>(false);
  const [groupSummary, setGroupSummary] = useState<GroupSummary | null>(null);

  // Admin add/edit
  const [newGroup, setNewGroup] = useState<{ name: string; description: string; location: string }>({ name: '', description: '', location: '' });
  const [edit, setEdit] = useState<{ id: number | null; name: string; description: string; location: string }>({ id: null, name: '', description: '', location: '' });
  const [showEditModal, setShowEditModal] = useState<boolean>(false);

  const load = async () => {
    try { setLoading(true); setError(null); const { data } = await api.get('/cell-groups', { params: { q: q || undefined } }); setGroups(data || []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load cell groups'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ load(); }, [q]);
  useEffect(()=>{ (async () => {
    try {
      const me = await api.get('/members/me');
      if (me?.data?.id) {
        setMyMemberId(me.data.id);
        const mg = await api.get(`/cell-groups/member/${me.data.id}`);
        setMyGroups(mg.data || []);
      }
    } catch (_) { /* ignore if not linked */ }
  })(); }, []);

  const loadMembers = async (groupId: number) => {
    try { setLoading(true); setError(null); const { data } = await api.get(`/cell-groups/${groupId}/members`); setMemberships(data || []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load members'); }
    finally { setLoading(false); }
  };

  const loadSummary = async (groupId: number) => {
    try { setLoading(true); setError(null); const { data } = await api.get(`/cell-groups/${groupId}/summary`); setGroupSummary(data || null); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load group summary'); }
    finally { setLoading(false); }
  };

  const loadMyDetails = async (groupId: number) => {
    if (!myMemberId) return;
    try {
      setLoading(true); setError(null);
      const { data } = await api.get(`/cell-groups/${groupId}/members`);
      const mine = (data as Membership[]).find(m => m.memberId === myMemberId);
      const contributions = mine?.contributions || [];
      const total = contributions.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
      setMyDetails(prev => ({ ...prev, [groupId]: { notes: mine?.notes, contributions, total } }));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load membership details');
    } finally { setLoading(false); }
  };

  const registerSelf = async (groupId: number, notes?: string) => {
    try { setLoading(true); setError(null); await api.post(`/cell-groups/${groupId}/register`, { notes }); await loadMembers(groupId); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to register'); }
    finally { setLoading(false); }
  };

  const registerMember = async (groupId: number, memberId: number, notes?: string, registeredAt?: string) => {
    try { setLoading(true); setError(null); await api.post(`/cell-groups/${groupId}/register`, { memberId, notes, registeredAt }); await loadMembers(groupId); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to register member'); }
    finally { setLoading(false); }
  };

  const leaveGroup = async (groupId: number, memberId?: number) => {
    if (!confirm('Leave this cell group?')) return;
    try { setLoading(true); setError(null); await api.post(`/cell-groups/${groupId}/leave`, { memberId }); await loadMembers(groupId); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to leave group'); }
    finally { setLoading(false); }
  };

  const addContribution = async (groupId: number, payload: { memberId?: number; membershipId?: number; amount: number; date?: string; notes?: string }) => {
    try { setLoading(true); setError(null); await api.post(`/cell-groups/${groupId}/contributions`, payload); await loadMembers(groupId); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to add contribution'); }
    finally { setLoading(false); }
  };

  const createGroup = async () => {
    if (!newGroup.name.trim()) return alert('Name is required');
    try { setLoading(true); setError(null); await api.post('/cell-groups', newGroup); setNewGroup({ name: '', description: '', location: '' }); await load(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to create group'); }
    finally { setLoading(false); }
  };
  const updateGroup = async () => {
    if (!edit.id) return; if (!edit.name.trim()) return alert('Name is required');
    try { setLoading(true); setError(null); await api.put(`/cell-groups/${edit.id}`, { name: edit.name, description: edit.description, location: edit.location }); setEdit({ id: null, name: '', description: '', location: '' }); await load(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to update group'); }
    finally { setLoading(false); }
  };
  const deleteGroup = async (id: number) => {
    if (!confirm('Remove this cell group?')) return;
    try { setLoading(true); setError(null); await api.delete(`/cell-groups/${id}`); await load(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Failed to delete group'); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => groups, [groups]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Cell Groups</h2>
        <div className="flex items-center gap-2">
          <a href="/ministries" className="btn">Back to Departments</a>
          <button className="btn" aria-label="Print" onClick={()=>printTarget('cell-groups')}>Print</button>
        </div>
      </div>
      {!canManage && (
        <div className="px-3 py-2 text-xs rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-100 inline-block" aria-label="View-only mode">
          View-only: management actions are hidden
        </div>
      )}

      <div className="flex items-center gap-2">
        <input placeholder="Search by name/location" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" value={q} onChange={e=>setQ(e.target.value)} />
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {loading && <div className="p-2">Loading…</div>}

      {canManage && (
        <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-semibold mb-2">Add Cell Group</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input placeholder="Name" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" value={newGroup.name} onChange={e=>setNewGroup({...newGroup, name: e.target.value})} />
            <input placeholder="Description" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" value={newGroup.description} onChange={e=>setNewGroup({...newGroup, description: e.target.value})} />
            <input placeholder="Location" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" value={newGroup.location} onChange={e=>setNewGroup({...newGroup, location: e.target.value})} />
            <button className="btn-primary" onClick={createGroup} disabled={!newGroup.name.trim()}>Add Group</button>
          </div>
        </section>
      )}

      {/* My Groups */}
      {myGroups.length > 0 && (
        <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
          <h3 className="font-semibold mb-2">My Cell Groups</h3>
          <ul className="space-y-2">
            {myGroups.map(mg => (
              <li key={mg.id} className="border rounded p-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{mg.group?.name || `Group #${mg.groupId}`}</div>
                    <div className="text-sm text-gray-600">Joined {new Date(mg.registeredAt).toLocaleDateString()}</div>
                    {myDetails[mg.groupId] && (
                      <div className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                        <div>Notes: {myDetails[mg.groupId]?.notes || '-'}</div>
                        <div>Total Contributions: {myDetails[mg.groupId]?.total.toFixed(2)}</div>
                        {(myDetails[mg.groupId]?.contributions || []).slice(0,3).map(c => (
                          <div key={c.id}>
                            {new Date(c.date).toLocaleDateString()} · {c.amount.toFixed(2)} {c.notes ? `— ${c.notes}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="btn" onClick={()=>{ setDetailsGroupId(mg.groupId); setShowMyDetailsModal(true); loadMyDetails(mg.groupId); }}>View details</button>
                    <button className="btn" onClick={()=>leaveGroup(mg.groupId)}>Leave</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow printable-cell-groups">
        <div className="print-header">
          <div className="text-lg font-semibold">Cell Groups</div>
          <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
        </div>
        <h3 className="font-semibold mb-3">Available Cell Groups</h3>
        <ul className="space-y-2">
          {filtered.map(g => (
            <li key={g.id} className="border rounded p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-sm text-gray-600">{g.location || ''}</div>
                  {g.description && <div className="text-xs text-gray-500">{g.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn" onClick={()=>{ setActiveGroupId(g.id); setShowMembersModal(true); loadMembers(g.id); }}>View Members</button>
                  <button className="btn" onClick={()=>{ setDetailsGroupId(g.id); setShowGroupModal(true); loadSummary(g.id); }}>View</button>
                  <button className="btn-gold" onClick={()=>registerSelf(g.id)} title="Register yourself">Join</button>
                  {canManage && (
                    <>
                      <button className="px-3 py-1 rounded bg-blue-600 text-white" onClick={()=> { setEdit({ id: g.id, name: g.name, description: g.description || '', location: g.location || '' }); setShowEditModal(true); }}>Edit</button>
                      <button className="px-3 py-1 rounded bg-red-600 text-white" onClick={()=>deleteGroup(g.id)}>Remove</button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
          {filtered.length === 0 && <li className="text-sm text-gray-600">No cell groups</li>}
        </ul>
        <div className="print-footer"><div className="text-xs">FaithConnect • Cell Group Listings</div></div>
      </section>

      {showEditModal && edit.id && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-2xl p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Edit Cell Group</h3>
              <button className="btn" onClick={()=>{ setShowEditModal(false); setEdit({ id: null, name: '', description: '', location: '' }); }}>Close</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="block text-sm"><span>Name</span>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={edit.name} onChange={e=>setEdit({...edit, name: e.target.value})} />
              </label>
              <label className="block text-sm"><span>Location</span>
                <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={edit.location} onChange={e=>setEdit({...edit, location: e.target.value})} />
              </label>
              <label className="block text-sm md:col-span-2"><span>Description</span>
                <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={edit.description} onChange={e=>setEdit({...edit, description: e.target.value})} />
              </label>
              <div className="md:col-span-2 flex gap-2">
                <button className="btn-primary" onClick={()=>{ if(!edit.name.trim()){ alert('Name is required'); return; } updateGroup(); setShowEditModal(false); }}>Save</button>
                <button className="btn" onClick={()=>{ setShowEditModal(false); setEdit({ id: null, name: '', description: '', location: '' }); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeGroupId && showMembersModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-5xl p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Members in Group</h3>
              <button className="btn" onClick={()=>{ setShowMembersModal(false); setActiveGroupId(null); setMemberQ(''); }}>Close</button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input placeholder="Search by name" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" value={memberQ} onChange={e=>setMemberQ(e.target.value)} />
              <select className="px-3 py-2 border rounded" value={memberSort} onChange={e=>setMemberSort(e.target.value as any)}>
                <option value="name_asc">Name ↑</option>
                <option value="name_desc">Name ↓</option>
                <option value="date_desc">Recent first</option>
                <option value="date_asc">Oldest first</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700"><tr><th className="p-2 text-left">Member</th><th className="p-2 text-left">Registered</th><th className="p-2 text-left">Notes</th>{canManage && (<><th className="p-2 text-left">Total Contributed</th><th className="p-2 text-left">Contributions</th></>)}<th className="p-2 text-left">Actions</th></tr></thead>
                <tbody>
                  {memberships
                    .filter(ms => {
                      const nm = ms.member ? `${ms.member.firstName} ${ms.member.lastName}`.toLowerCase() : String(ms.memberId);
                      return nm.includes(memberQ.toLowerCase());
                    })
                    .sort((a,b)=>{
                      if(memberSort==='name_asc' || memberSort==='name_desc'){
                        const na = (a.member ? `${a.member.firstName} ${a.member.lastName}` : String(a.memberId)).toLowerCase();
                        const nb = (b.member ? `${b.member.firstName} ${b.member.lastName}` : String(b.memberId)).toLowerCase();
                        return memberSort==='name_asc' ? na.localeCompare(nb) : nb.localeCompare(na);
                      }
                      const da = new Date(a.registeredAt).getTime();
                      const db = new Date(b.registeredAt).getTime();
                      return memberSort==='date_desc' ? db - da : da - db;
                    })
                    .map(ms => (
                      <tr key={ms.id} className="border-b">
                        <td className="p-2">{ms.member ? `${ms.member.firstName} ${ms.member.lastName}` : `#${ms.memberId}`}</td>
                        <td className="p-2">{new Date(ms.registeredAt).toLocaleDateString()}</td>
                        <td className="p-2">{ms.notes || '-'}</td>
                        {canManage && (
                          <>
                            <td className="p-2 font-medium">
                              {((ms.contributions || []).reduce((sum, c) => sum + (Number(c.amount) || 0), 0)).toFixed(2)}
                            </td>
                            <td className="p-2">
                              <div className="space-y-1">
                                {(ms.contributions || []).map(c => (
                                  <div key={c.id} className="text-xs">{new Date(c.date).toLocaleDateString()} · {c.amount.toFixed(2)} {c.notes ? `— ${c.notes}` : ''}</div>
                                ))}
                                {canManage && (
                                  <div className="flex items-center gap-2">
                                    <input type="number" min={0} step={0.01} placeholder="Amount" className="px-2 py-1 border rounded w-28" id={`amt-${ms.id}`} />
                                    <input type="date" className="px-2 py-1 border rounded" id={`date-${ms.id}`} />
                                    <input type="text" placeholder="Notes" className="px-2 py-1 border rounded" id={`note-${ms.id}`} />
                                    <button className="btn" onClick={()=>{
                                      const a = Number((document.getElementById(`amt-${ms.id}`) as HTMLInputElement)?.value || '0');
                                      const d = (document.getElementById(`date-${ms.id}`) as HTMLInputElement)?.value || undefined;
                                      const n = (document.getElementById(`note-${ms.id}`) as HTMLInputElement)?.value || undefined;
                                      if (!a || a <= 0) { alert('Amount must be positive'); return; }
                                      addContribution(activeGroupId!, { membershipId: ms.id, amount: a, date: d, notes: n });
                                    }}>Add</button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <button className="btn" onClick={()=>leaveGroup(activeGroupId!, ms.memberId)}>Leave</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {canManage && (
              <div className="mt-3">
                <h4 className="font-medium mb-2">Register Member</h4>
                <div className="flex items-center gap-2">
                  <input type="number" placeholder="Member ID" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" id="reg-member-id" />
                  <input type="date" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" id="reg-date" />
                  <input type="text" placeholder="Notes" className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900" id="reg-notes" />
                  <button className="btn-primary" onClick={()=>{
                    const mid = Number((document.getElementById('reg-member-id') as HTMLInputElement)?.value || '0');
                    const d = (document.getElementById('reg-date') as HTMLInputElement)?.value || undefined;
                    const n = (document.getElementById('reg-notes') as HTMLInputElement)?.value || undefined;
                    if (!mid) { alert('Member ID required'); return; }
                    registerMember(activeGroupId!, mid, n, d);
                  }}>Register</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showMyDetailsModal && detailsGroupId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-xl p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">My Group Details</h3>
              <button className="btn" onClick={()=>{ setShowMyDetailsModal(false); setDetailsGroupId(null); }}>Close</button>
            </div>
            {myDetails[detailsGroupId] ? (
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Notes:</span> {myDetails[detailsGroupId]!.notes || '-'}</div>
                <div><span className="font-medium">Total Contributions:</span> {myDetails[detailsGroupId]!.total.toFixed(2)}</div>
                <div>
                  <div className="font-medium mb-1">Recent Contributions</div>
                  <ul className="space-y-1">
                    {(myDetails[detailsGroupId]!.contributions || []).map(c => (
                      <li key={c.id} className="flex items-center justify-between border rounded p-2">
                        <div>{new Date(c.date).toLocaleDateString()}</div>
                        <div>{c.amount.toFixed(2)}</div>
                        <div className="text-xs text-gray-600">{c.notes || '-'}</div>
                      </li>
                    ))}
                    {myDetails[detailsGroupId]!.contributions.length === 0 && (
                      <li className="text-xs text-gray-600">No contributions yet.</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">Loading details…</div>
            )}
          </div>
        </div>
      )}

      {showGroupModal && detailsGroupId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Group Details</h3>
              <button className="btn" onClick={()=>{ setShowGroupModal(false); setDetailsGroupId(null); setGroupSummary(null); }}>Close</button>
            </div>
            {groupSummary ? (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium">Metadata</div>
                  <div>Name: {groupSummary.metadata.name}</div>
                  <div>Location: {groupSummary.metadata.location || '-'}</div>
                  <div>Description: {groupSummary.metadata.description || '-'}</div>
                </div>
                <div>
                  <div className="font-medium">Members</div>
                  <div>Total Members: {groupSummary.memberCount}</div>
                </div>
                <div>
                  <div className="font-medium">Financial Contributions</div>
                  <div>Total: {groupSummary.contributions.total.toFixed(2)}</div>
                  <div className="mt-1">Top Contributors:</div>
                  <ul className="space-y-1">
                    {groupSummary.contributions.perMemberTotals.slice(0,5).map(pm => (
                      <li key={pm.memberId} className="flex items-center justify-between border rounded p-2">
                        <div>{pm.name}</div>
                        <div>{pm.total.toFixed(2)}</div>
                      </li>
                    ))}
                    {groupSummary.contributions.perMemberTotals.length === 0 && (
                      <li className="text-xs text-gray-600">No contributions recorded.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <div className="font-medium">Performance</div>
                  <div>Rank: {groupSummary.rankings.performanceRank} / {groupSummary.rankings.totalGroups}</div>
                </div>
                <div>
                  <div className="font-medium">Upcoming Schedule</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs uppercase text-gray-600">Events</div>
                      <ul className="space-y-1">
                        {groupSummary.upcomingSchedule.events.map(e => (
                          <li key={e.id} className="flex items-center justify-between border rounded p-2">
                            <div>{e.title}</div>
                            <div>{new Date(e.date).toLocaleDateString()}</div>
                          </li>
                        ))}
                        {groupSummary.upcomingSchedule.events.length === 0 && <li className="text-xs text-gray-600">No events found.</li>}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-600">Programs</div>
                      <ul className="space-y-1">
                        {groupSummary.upcomingSchedule.programs.map(p => (
                          <li key={p.id} className="flex items-center justify-between border rounded p-2">
                            <div>{p.name}</div>
                            <div>{new Date(p.startDate).toLocaleDateString()}</div>
                          </li>
                        ))}
                        {groupSummary.upcomingSchedule.programs.length === 0 && <li className="text-xs text-gray-600">No programs found.</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600">Loading…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
