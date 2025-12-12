import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";

interface Department { id: number; name: string; description?: string; leaderId?: number | null }
interface Member { id: number; firstName: string; lastName: string }
interface EventItem { id: number; title: string; date: string; location?: string; description?: string }

export default function MinistryDetails() {
  const { id } = useParams();
  const ministryId = Number(id);
  const [ministry, setMinistry] = useState<Department | null>(null);
  const [members, setMembers] = useState<Member[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick actions states
  const [descEdit, setDescEdit] = useState(false);
  const [descDraft, setDescDraft] = useState<string>("");
  const [leaderEdit, setLeaderEdit] = useState(false);
  const [leaderMemberId, setLeaderMemberId] = useState<string>("");

  // Meetings
  const [meetings, setMeetings] = useState<EventItem[]>([]);
  const [meetingTitle, setMeetingTitle] = useState<string>("");
  const [meetingDate, setMeetingDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [meetingLocation, setMeetingLocation] = useState<string>("");
  const [meetingDescription, setMeetingDescription] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const [minRes, memRes, meetRes] = await Promise.all([
          api.get(`/departments/${ministryId}`),
          api.get(`/members`, { params: { page: 1, pageSize: 1000 } }),
          api.get(`/departments/${ministryId}/meetings`),
        ]);
        setMinistry(minRes.data);
        setDescDraft(minRes.data?.description || "");
        setMembers((memRes.data?.items ?? memRes.data ?? []) || []);
        setMeetings(meetRes.data || []);
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || "Failed to load department details");
      }
    })();
  }, [ministryId]);

  const leaderName = useMemo(() => {
    const id = ministry?.leaderId;
    if (!id) return '-';
    const found = members.find(m => m.id === id);
    return found ? `${found.firstName} ${found.lastName}` : `#${id}`;
  }, [ministry, members]);

  const saveDescription = async () => {
    if (!ministry) return;
    if (!descDraft.trim()) { setError('Description cannot be empty'); return; }
    try {
      setLoading(true);
      setError(null);
      const updated = await api.put(`/departments/${ministryId}`, { description: descDraft.trim() });
      setMinistry(updated.data);
      setDescEdit(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to save description');
    } finally { setLoading(false); }
  };

  const updateLeader = async () => {
    if (!leaderMemberId) { setError('Please select a member'); return; }
    try {
      setLoading(true);
      setError(null);
      await api.post(`/departments/${ministryId}/assign-leader-member`, { memberId: Number(leaderMemberId) });
      const res = await api.get(`/departments/${ministryId}`);
      setMinistry(res.data);
      setLeaderEdit(false);
      setLeaderMemberId("");
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || 'Failed to update leader');
    } finally { setLoading(false); }
  };

  const scheduleMeeting = async () => {
    if (!meetingTitle || !meetingDate) return;
    try {
      setLoading(true);
      setError(null);
      await api.post(`/departments/${ministryId}/meetings`, {
        title: meetingTitle,
        date: meetingDate,
        location: meetingLocation,
        description: meetingDescription,
      });
      setMeetingTitle("");
      setMeetingLocation("");
      setMeetingDescription("");
      const meetRes = await api.get(`/departments/${ministryId}/meetings`);
      setMeetings(meetRes.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Failed to schedule meeting");
    } finally { setLoading(false); }
  };

  const ministryName = useMemo(() => ministry?.name || "Department", [ministry]);

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-600">
        <Link className="hover:underline" to="/departments">Departments</Link>
        <span> / </span>
        <span>{ministryName}</span>
        <span> / Details</span>
      </nav>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Department Details — {ministryName}</h2>
        <Link to={`/departments/${ministryId}/members`} className="btn-gold">Manage Members</Link>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      {/* Overview & Quick Actions */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="mb-2"><span className="font-semibold">Leader:</span> {leaderName}</div>
            {!leaderEdit ? (
              <button className="btn" onClick={()=>setLeaderEdit(true)}>Change Leader</button>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <select className="input bg-white dark:bg-white border border-gray-300" value={leaderMemberId} onChange={e=>setLeaderMemberId(e.target.value)}>
                  <option value="">Select member…</option>
                  {members.map(m => (<option key={m.id} value={m.id}>{m.firstName} {m.lastName}</option>))}
                </select>
                <button className="btn-gold" onClick={updateLeader} disabled={!leaderMemberId || loading}>Update Leader</button>
                <button className="btn" onClick={()=>{setLeaderEdit(false); setLeaderMemberId("");}}>Cancel</button>
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold mb-1">Description</div>
            {!descEdit ? (
              <div className="text-sm text-gray-700 bg-gray-50 dark:bg-gray-700 p-2 rounded min-h-[48px]">{ministry?.description || 'No description'}</div>
            ) : (
              <textarea className="input bg-white dark:bg-white border border-gray-300 w-full" value={descDraft} onChange={e=>setDescDraft(e.target.value)} />
            )}
            <div className="mt-2 flex items-center gap-2">
              {!descEdit ? (
                <button className="btn" onClick={()=>setDescEdit(true)}>Edit Description</button>
              ) : (
                <>
                  <button className="btn-gold" onClick={saveDescription} disabled={loading}>Save</button>
                  <button className="btn" onClick={()=>{setDescEdit(false); setDescDraft(ministry?.description || '');}}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Meetings */}
      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Schedule Meeting</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm">Title</label>
            <input className="mt-1 input w-full bg-white dark:bg-white border border-gray-300" value={meetingTitle} onChange={e=>setMeetingTitle(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Date/Time</label>
            <input type="datetime-local" className="mt-1 input w-full bg-white dark:bg-white border border-gray-300" value={meetingDate} onChange={e=>setMeetingDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Location</label>
            <input className="mt-1 input w-full bg-white dark:bg-white border border-gray-300" value={meetingLocation} onChange={e=>setMeetingLocation(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Description</label>
            <textarea className="mt-1 input w-full bg-white dark:bg-white border border-gray-300" value={meetingDescription} onChange={e=>setMeetingDescription(e.target.value)} />
          </div>
        </div>
        <div className="mt-3">
          <button className="btn-gold" onClick={scheduleMeeting} disabled={loading || !meetingTitle || !meetingDate}>Schedule</button>
        </div>

        <h4 className="font-medium mt-6 mb-2">Upcoming Meetings</h4>
        {meetings.length === 0 ? (
          <div className="text-sm text-gray-600">No meetings yet.</div>
        ) : (
          <ul className="space-y-2">
            {meetings.map(ev => (
              <li key={ev.id} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{ev.title}</div>
                  <div className="text-sm text-gray-600">{new Date(ev.date).toLocaleString()} {ev.location ? `· ${ev.location}` : ''}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
