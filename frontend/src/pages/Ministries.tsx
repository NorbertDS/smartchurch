import { useEffect, useMemo, useState } from "react";
import TitleEditable from "../components/TitleEditable";
import api from "../api/client";
import DateTimePicker from "../components/DateTimePicker";

interface Ministry {
  id: number;
  name: string;
  description?: string;
  leaderId?: number | null;
}

interface Member {
  id: number;
  firstName: string;
  lastName: string;
  departmentId?: number | null;
}

interface EventItem {
  id: number;
  title: string;
  date: string;
  location?: string;
  description?: string;
}

export default function Ministries() {
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const [me, setMe] = useState<Member | null>(null);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [leaderIdInput, setLeaderIdInput] = useState<string>("");
  const [leaderMemberId, setLeaderMemberId] = useState<string>("");
  const [memberAssignId, setMemberAssignId] = useState<string>("");

  const [meetingTitle, setMeetingTitle] = useState<string>("");
  const [meetingDate, setMeetingDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [meetingLocation, setMeetingLocation] = useState<string>("");
  const [meetingDescription, setMeetingDescription] = useState<string>("");

  // AI planner state
  const [plannerMonth, setPlannerMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [plannerSuggestions, setPlannerSuggestions] = useState<{ date: string; score: number; reason: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [suggestionCount, setSuggestionCount] = useState<number>(3);
  const [availabilityStart, setAvailabilityStart] = useState<string>(""); // HH:MM
  const [availabilityEnd, setAvailabilityEnd] = useState<string>(""); // HH:MM

  const [ministryTemplates, setMinistryTemplates] = useState<Record<string, string[]>>({});

  const [meetings, setMeetings] = useState<EventItem[]>([]);
  const [report, setReport] = useState<{ membersCount: number; upcomingMeetings: number; attendanceMonthly: { month: string; total: number }[] } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state for meetings
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");

  // Public members viewing modal
  const [viewMembersOpen, setViewMembersOpen] = useState<boolean>(false);
  const [memberSearch, setMemberSearch] = useState<string>("");

  const selectedMinistry = useMemo(() => ministries.find(m => m.id === selectedId) || null, [ministries, selectedId]);

  const load = async () => {
    try {
      setLoading(true);
      const minRes = await api.get("/departments");
      let memRes: any = { data: [] };
      try { memRes = await api.get("/members"); } catch {}
      if (role === 'MEMBER') {
        try { const { data } = await api.get('/members/me'); setMe(data || null); } catch { setMe(null); }
      }
      setMinistries(minRes.data || []);
      setMembers(memRes.data || []);
      if (!selectedId && minRes.data?.length) setSelectedId(minRes.data[0].id);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (id: number) => {
    try {
      setLoading(true);
      const [meetRes, repRes] = await Promise.all([
        api.get(`/departments/${id}/meetings`),
        api.get(`/departments/${id}/report`),
      ]);
      setMeetings(meetRes.data || []);
      setReport(repRes.data || null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load department details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    // Load dynamic ministry meeting templates from settings (fallback handled server-side)
    (async () => {
      try {
        const res = await api.get('/settings/templates/departments');
        setMinistryTemplates(res.data || {});
      } catch {
        setMinistryTemplates({});
      }
    })();
  }, []);
  useEffect(() => { if (selectedId) loadDetails(selectedId); }, [selectedId]);

  const createMinistry = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.post("/departments", { name, description });
      setName("");
      setDescription("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to Create Department");
    } finally {
      setLoading(false);
    }
  };

  const assignLeader = async () => {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post(`/departments/${selectedId}/assign-leader`, { leaderId: leaderIdInput ? Number(leaderIdInput) : null });
      setLeaderIdInput("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to assign leader");
    } finally {
      setLoading(false);
    }
  };

  const assignMember = async () => {
    if (!selectedId || !memberAssignId) return;
    try {
      setLoading(true);
      setError(null);
      await api.post(`/departments/${selectedId}/members/${Number(memberAssignId)}`);
      setMemberAssignId("");
      await load();
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to assign member");
    } finally {
      setLoading(false);
    }
  };

  const removeMember = async (memberId: number) => {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await api.delete(`/departments/${selectedId}/members/${memberId}`);
      await load();
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  const scheduleMeeting = async () => {
    if (!selectedId || !meetingTitle || !meetingDate) return;
    try {
      setLoading(true);
      setError(null);
      await api.post(`/departments/${selectedId}/meetings`, {
        title: meetingTitle,
        date: meetingDate,
        location: meetingLocation,
        description: meetingDescription,
      });
      setMeetingTitle("");
      setMeetingLocation("");
      setMeetingDescription("");
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to schedule meeting");
    } finally {
      setLoading(false);
    }
  };

  // Start editing a meeting
  const startEdit = (ev: EventItem) => {
    setEditingEventId(ev.id);
    setEditTitle(ev.title);
    try {
      setEditDate(new Date(ev.date).toISOString().slice(0, 16));
    } catch {
      setEditDate("");
    }
    setEditLocation(ev.location || "");
    setEditDescription(ev.description || "");
  };

  // Save edited meeting via PUT /events/:id
  const saveEdit = async () => {
    if (!editingEventId || !selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await api.put(`/events/${editingEventId}`, {
        title: editTitle,
        date: editDate,
        location: editLocation,
        description: editDescription,
      });
      setEditingEventId(null);
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to update meeting");
    } finally {
      setLoading(false);
    }
  };

  // Delete meeting via DELETE /events/:id
  const deleteMeeting = async (eventId: number) => {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      await api.delete(`/events/${eventId}`);
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to delete meeting");
    } finally {
      setLoading(false);
    }
  };

  // Suggest dates via POST /events/plan (with tuning)
  const suggestDates = async () => {
    if (!selectedId || !plannerMonth) return;
    try {
      setLoading(true);
      setError(null);
      const res = await api.post('/events/plan', { month: plannerMonth, take: suggestionCount, departmentId: selectedId });
      let suggestions = (res.data || []) as { date: string; score: number; reason: string }[];
      // Optional time-of-day filtering
      if (availabilityStart && availabilityEnd) {
        const withinWindow = (iso: string) => {
          const t = new Date(iso);
          const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
          return hhmm >= availabilityStart && hhmm <= availabilityEnd;
        };
        suggestions = suggestions.filter(s => withinWindow(s.date));
      }
      // Limit to desired count
      setPlannerSuggestions(suggestions.slice(0, suggestionCount));
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to fetch suggestions');
    } finally {
      setLoading(false);
    }
  };

  // Create meeting from suggestion
  const createFromSuggestion = async (s: { date: string; reason: string }) => {
    if (!selectedId) return;
    try {
      setLoading(true);
      setError(null);
      const templateTitle = selectedTemplate || `${selectedMinistry?.name || 'Department'} Meeting`;
      await api.post(`/departments/${selectedId}/meetings`, {
        title: templateTitle,
        date: s.date,
        location: meetingLocation,
        description: meetingDescription || `Suggested: ${s.reason}`,
      });
      await loadDetails(selectedId);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to create from suggestion');
    } finally {
      setLoading(false);
    }
  };

  const ministryMembers = useMemo(() => members.filter(m => m.departmentId === selectedId), [members, selectedId]);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <TitleEditable storageKey="ministries" defaultValue="Department management" className="text-2xl font-semibold" />
        <div className="flex items-center gap-2">
          <a href="/departments" className="px-3 py-2 rounded bg-faith-gold text-white">Departments</a>
          <a href="/cell-groups" className="px-3 py-2 rounded border">Cell Groups</a>
        </div>
      </div>
      {error && <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4">
        {/* Departments List */}
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="text-lg font-medium mb-3">Departments</h2>
          <ul className="space-y-2">
            {ministries.map(m => (
              <li key={m.id} className={`border rounded p-3 cursor-pointer ${selectedId === m.id ? 'border-faith-blue' : ''}`} onClick={() => setSelectedId(m.id)}>
                <div className="font-medium">{m.name}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{m.description || '-'}</div>
              </li>
            ))}
          </ul>
        </div>

        {/* Selected Ministry Details */}
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4 xl:col-span-2 printable-departments">
          <div className="print-header">
            <div className="text-lg font-semibold">Departments</div>
            <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
          </div>
          {selectedMinistry ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium">{selectedMinistry.name}</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Leader ID: {selectedMinistry.leaderId ?? '-'}</span>
                <button className="px-2 py-1 text-sm bg-gray-200 dark:bg-gray-700 rounded" onClick={()=>setViewMembersOpen(true)}>View Members</button>
                <a href={`/departments/${selectedMinistry.id}/details`} className="px-2 py-1 text-sm bg-faith-blue text-white rounded">Details</a>
                {role && role !== 'MEMBER' ? (
                  <>
                    <a href={`/departments/${selectedMinistry.id}/members`} className="px-2 py-1 text-sm bg-faith-gold text-white rounded">Manage Members</a>
                    <a href="/cell-groups" className="px-2 py-1 text-sm bg-faith-gold text-white rounded">Cell Groups</a>
                    <a href={`/departments/${selectedMinistry.id}/delete`} className="px-2 py-1 text-sm bg-red-600 text-white rounded">Delete</a>
                  </>
                ) : (
                  <button
                    className="px-2 py-1 text-sm bg-faith-gold text-white rounded"
                    onClick={async()=>{
                      if (!me) return;
                      try { await api.post(`/departments/${selectedMinistry.id}/join`); await load(); await loadDetails(selectedMinistry.id); }
                      catch (e: any) { alert(e?.response?.data?.message || 'Failed to join'); }
                    }}
                    disabled={!me || (me && me.departmentId === selectedMinistry.id)}
                  >{me && me.departmentId === selectedMinistry.id ? 'Joined' : 'Join Department'}</button>
                )}
              </div>
              </div>

              {/* Assign leader (staff only) */}
              <div className="mt-4">
                {role && role !== 'MEMBER' && (<h3 className="font-medium">Assign Leader</h3>)}
                <div className="mt-2 flex items-center gap-2">
                  {role && role !== 'MEMBER' && (<input
                    type="number"
                    placeholder="User ID"
                    value={leaderIdInput}
                    onChange={(e) => setLeaderIdInput(e.target.value)}
                    className="px-3 py-2 border rounded w-48 bg-gray-50 dark:bg-gray-900"
                  />)}
                  {role && role !== 'MEMBER' && (<button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={assignLeader} disabled={loading}>Assign</button>)}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {role && role !== 'MEMBER' && (<select
                    className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900"
                    value={leaderMemberId}
                    onChange={(e) => setLeaderMemberId(e.target.value)}
                  >
                    <option value="">Select member…</option>
                    {members.map(mem => (
                      <option key={mem.id} value={String(mem.id)}>
                        {mem.firstName} {mem.lastName} {mem.departmentId ? `(department ${mem.departmentId})` : ''}
                      </option>
                    ))}
                  </select>)}
                  {role && role !== 'MEMBER' && (<button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={async () => {
                    if (!selectedId || !leaderMemberId) return;
                    try {
                      setLoading(true);
                      setError(null);
                      await api.post(`/departments/${selectedId}/assign-leader-member`, { memberId: Number(leaderMemberId) });
                      setLeaderMemberId("");
                      await load();
                    } catch (err: any) {
                      setError(err?.response?.data?.message || err.message || "Failed to assign leader by member");
                    } finally {
                      setLoading(false);
                    }
                  }} disabled={loading || !leaderMemberId}>Assign Selected Member</button>)}
                </div>
              </div>

              {/* Member participation */}
              <div className="mt-6">
                <h3 className="font-medium">Members</h3>
                {role && role !== 'MEMBER' ? (
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      className="px-3 py-2 border rounded bg-gray-50 dark:bg-gray-900"
                      value={memberAssignId}
                      onChange={(e) => setMemberAssignId(e.target.value)}
                    >
                      <option value="">Select member…</option>
                      {members.map(mem => (
                        <option key={mem.id} value={String(mem.id)}>
                          {mem.firstName} {mem.lastName} {mem.departmentId ? `(department ${mem.departmentId})` : ''}
                        </option>
                      ))}
                    </select>
                    <button className="px-3 py-2 bg-faith-gold text-white rounded" onClick={assignMember} disabled={loading || !memberAssignId}>Add to Department</button>
                  </div>
                ) : (
                  <div className="mt-2">
                    <button className="px-3 py-2 bg-faith-gold text-white rounded" onClick={async()=>{
                      if (!me || !selectedMinistry) return;
                      try { await api.post(`/departments/${selectedMinistry.id}/join`); await load(); await loadDetails(selectedMinistry.id); }
                      catch (e: any) { alert(e?.response?.data?.message || 'Failed to join department'); }
                    }} disabled={!me || (me && me.departmentId === selectedMinistry?.id)}>Join this Department</button>
                  </div>
                )}
                <ul className="mt-3 space-y-2">
                  {ministryMembers.map(mem => (
                    <li key={mem.id} className="flex items-center justify-between border rounded p-2">
                      <div>{mem.firstName} {mem.lastName}</div>
                      {role && role !== 'MEMBER' && (<button className="px-2 py-1 text-sm bg-red-600 text-white rounded" onClick={() => removeMember(mem.id)} disabled={loading}>Remove</button>)}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Meeting scheduling (staff only) */}
              <div className="mt-6">
                {role && role !== 'MEMBER' && (<h3 className="font-medium">Schedule Meeting</h3>)}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  {role && role !== 'MEMBER' && (<div>
                    <label className="text-sm">Title</label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
                  </div>)}
                  {role && role !== 'MEMBER' && (<DateTimePicker label="Date/Time" value={meetingDate} onChange={setMeetingDate} withTime ariaLabel="Meeting date and time" />)}
                  {role && role !== 'MEMBER' && (<div>
                    <label className="text-sm">Location</label>
                    <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={meetingLocation} onChange={(e) => setMeetingLocation(e.target.value)} />
                  </div>)}
                  {role && role !== 'MEMBER' && (<div>
                    <label className="text-sm">Description</label>
                    <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={meetingDescription} onChange={(e) => setMeetingDescription(e.target.value)} />
                  </div>)}
                </div>
                {role && role !== 'MEMBER' && (
                  <div className="mt-3">
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" onClick={scheduleMeeting} disabled={loading || !meetingTitle || !meetingDate}>Schedule</button>
                  </div>
                )}
                <div className="mt-4">
                  {role && role !== 'MEMBER' && (<h4 className="font-medium">AI Suggestions</h4>)}
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 items-end">
                    {role && role !== 'MEMBER' && (<div>
                      <label className="text-sm">Month</label>
                      <input type="month" className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={plannerMonth} onChange={(e) => setPlannerMonth(e.target.value)} />
                    </div>)}
                    {role && role !== 'MEMBER' && (<div>
                      <label className="text-sm">Template</label>
                      <select className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                        <option value="">Default ({selectedMinistry?.name || 'Department'} Meeting)</option>
                        {(ministryTemplates[selectedMinistry?.name || ''] || []).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>)}
                    {role && role !== 'MEMBER' && (<div>
                      <label className="text-sm">Suggestions</label>
                      <input type="number" min={1} max={10} className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={suggestionCount} onChange={(e) => setSuggestionCount(Number(e.target.value) || 1)} />
                    </div>)}
                    {role && role !== 'MEMBER' && (<div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-sm">Start Time</label>
                        <input type="time" className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={availabilityStart} onChange={(e) => setAvailabilityStart(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm">End Time</label>
                        <input type="time" className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={availabilityEnd} onChange={(e) => setAvailabilityEnd(e.target.value)} />
                      </div>
                    </div>)}
                    {role && role !== 'MEMBER' && (<div>
                      <button className="px-3 py-2 bg-faith-gold text-white rounded w-full" onClick={suggestDates} disabled={loading || !plannerMonth}>Suggest Dates</button>
                    </div>)}
                  </div>
                  <ul className="mt-2 space-y-2">
                    {role && role !== 'MEMBER' && plannerSuggestions.map(s => (
                      <li key={s.date} className="flex items-center justify-between border rounded p-2">
                        <div>
                          <div className="font-medium">{new Date(s.date).toLocaleString()}</div>
                          <div className="text-sm text-gray-600">{s.reason}</div>
                        </div>
                        <button className="px-3 py-1 text-sm bg-blue-600 text-white rounded" onClick={() => createFromSuggestion(s)} disabled={loading}>Create</button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-4">
                  <h4 className="font-medium">Upcoming Meetings</h4>
                  <ul className="mt-2 space-y-2">
                    {meetings.map(ev => (
                      <li key={ev.id} className="border rounded p-2">
                        {editingEventId === ev.id ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-sm">Title</label>
                              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                            </div>
                    <DateTimePicker label="Date/Time" value={editDate} onChange={setEditDate} withTime ariaLabel="Edit meeting date and time" />
                            <div>
                              <label className="text-sm">Location</label>
                              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} />
                            </div>
                            <div>
                              <label className="text-sm">Description</label>
                              <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={saveEdit} disabled={loading || !editTitle || !editDate}>Save</button>
                              <button className="px-3 py-2 bg-gray-600 text-white rounded" onClick={() => setEditingEventId(null)} disabled={loading}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="font-medium">{ev.title}</div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">{new Date(ev.date).toLocaleString()} {ev.location ? `· ${ev.location}` : ''}</div>
                            <div className="text-sm">{ev.description || '-'}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <button className="px-3 py-1 text-sm bg-faith-blue text-white rounded" onClick={() => startEdit(ev)} disabled={loading}>Edit</button>
                              <button className="px-3 py-1 text-sm bg-red-600 text-white rounded" onClick={() => deleteMeeting(ev.id)} disabled={loading}>Delete</button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Reports */}
              <div className="mt-6">
                <h3 className="font-medium">Reports</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
                  <div className="p-3 border rounded">
                    <div className="text-sm text-gray-600">Members</div>
                    <div className="text-2xl font-semibold">{report?.membersCount ?? '-'}</div>
                  </div>
                  <div className="p-3 border rounded">
                    <div className="text-sm text-gray-600">Upcoming Meetings</div>
                    <div className="text-2xl font-semibold">{report?.upcomingMeetings ?? '-'}</div>
                  </div>
                  <div className="p-3 border rounded">
                    <div className="text-sm text-gray-600">Attendance (last months)</div>
                    <div className="text-sm whitespace-pre-wrap">{report?.attendanceMonthly?.map(a => `${a.month}: ${a.total}`).join('\n') || '-'}</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-gray-600">Select a department to manage.</div>
              <div className="print-footer"><div className="text-xs">FaithConnect • Department Details</div></div>
            </>
          )}
        </div>
      </div>

      {/* View Members Modal (read-only) */}
      {viewMembersOpen && selectedMinistry && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="w-full max-w-3xl p-4 bg-white dark:bg-gray-800 rounded shadow">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Members — {selectedMinistry.name}</h3>
              <button className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded" onClick={()=>{ setViewMembersOpen(false); setMemberSearch(''); }}>Close</button>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input className="px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" placeholder="Search by name" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} />
            </div>
            <ul className="space-y-2">
              {ministryMembers
                .filter(mem => {
                  const q = memberSearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${mem.firstName} ${mem.lastName}`.toLowerCase().includes(q);
                })
                .map(mem => (
                  <li key={mem.id} className="border rounded p-2 flex items-center justify-between">
                    <div>{mem.firstName} {mem.lastName}</div>
                    <div className="text-xs text-gray-500">ID: {mem.id}</div>
                  </li>
                ))}
              {ministryMembers.length === 0 && (
                <li className="text-sm text-gray-600">No members yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Create Department (staff only) */}
      {role && role !== 'MEMBER' && (
      <div className="mt-6 bg-white dark:bg-gray-800 rounded shadow p-4">
        <h2 className="text-lg font-medium mb-3">Create Department</h2>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-sm">Name</label>
            <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Description</label>
            <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" onClick={createMinistry} disabled={loading || !name}>Create</button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
