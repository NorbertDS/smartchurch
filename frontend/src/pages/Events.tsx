import { useEffect, useMemo, useState } from "react";
import TitleEditable from "../components/TitleEditable";
import api from "../api/client";
import { printTarget } from "../utils/print";
import DateTimePicker from "../components/DateTimePicker";

interface EventItem {
  id: number;
  title: string;
  description?: string;
  date: string;
  location?: string;
}

export default function Events() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 16));
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [memberId, setMemberId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  const canManage = ['ADMIN','CLERK','PASTOR'].includes(role);
  const canDelete = ['ADMIN','CLERK'].includes(role);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/events");
      setEvents(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    try {
      let es: EventSource | null = null;
      let tries = 0;
      const connect = () => {
        es = new EventSource(`${api.defaults.baseURL}/events/stream`);
        es.onmessage = () => { load(); setLastRefresh(new Date()); tries = 0; };
        es.onerror = () => {
          try { es && es.close(); } catch {}
          const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, ++tries)));
          setTimeout(connect, delay);
        };
      };
      connect();
    } catch {}
  }, []);

  const addEvent = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.post("/events", { title, date, description, location });
      setTitle("");
      setDescription("");
      setLocation("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  const register = async (eventId: number) => {
    try {
      setLoading(true);
      setError(null);
      await api.post(`/events/${eventId}/register`, { memberId: Number(memberId) });
      setMemberId("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to register");
    } finally {
      setLoading(false);
    }
  };

  // Inline editing state
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editLocation, setEditLocation] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");

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

  const saveEdit = async () => {
    if (!editingEventId) return;
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
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to update event");
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (eventId: number) => {
    try {
      setLoading(true);
      setError(null);
      await api.delete(`/events/${eventId}`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to delete event");
    } finally {
      setLoading(false);
    }
  };

  // Calendar calculations
  const visibleMonthEvents = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    return events.filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [events, month]);

  const weeks = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      days.push(new Date(d));
    }
    const prefix = start.getDay();
    const suffix = 6 - end.getDay();
    for (let i = 0; i < prefix; i++) days.unshift(new Date(start.getFullYear(), start.getMonth(), 1 - (i + 1)));
    for (let i = 0; i < suffix; i++) days.push(new Date(end.getFullYear(), end.getMonth(), end.getDate() + (i + 1)));
    const chunks: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) chunks.push(days.slice(i, i + 7));
    return chunks;
  }, [month]);

  const navigateMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const generateAISuggestions = async () => {
    setAiLoading(true);
    setAiText("");
    try {
      // Include visible month events in the prompt so AI avoids conflicts
      const [y, m] = month.split('-').map(Number);
      const monthName = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
      const schedule = visibleMonthEvents.map(e => `- ${new Date(e.date).toLocaleString()}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`).join('\n');
      const prompt = `Given the church calendar for ${monthName} and past attendance patterns, suggest 3 ideal dates for a major event. Avoid conflicting dates listed below.\n\nExisting events:\n${schedule || '(none yet)'}\n\nRespond with recommended dates and brief reasons.`;
      const { data } = await api.post('/ai/assist', { scope: 'attendance', prompt });
      setAiText(data.text || 'No response');
    } catch (err: any) {
      setAiText(err?.response?.data?.message || "Failed to request AI suggestions");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <TitleEditable storageKey="events" defaultValue="Events & Activities" className="text-2xl font-semibold" />
        <div className="flex items-center gap-2">
          <a href="/events" className="px-3 py-2 rounded bg-faith-gold text-white">Events</a>
          <a href="/programs" className="px-3 py-2 rounded border">Programs</a>
          <button className="btn" aria-label="Print" onClick={()=>printTarget('events')}>Print</button>
          {lastRefresh && (<span className="text-xs text-gray-600">Updated {lastRefresh.toLocaleTimeString()}</span>)}
        </div>
      </div>
      {error && <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mt-4 printable-events">
        <div className="print-header">
          <div className="text-lg font-semibold">Events</div>
          <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
        </div>
        {/* Calendar View */}
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4 xl:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Event Calendar</h2>
            <div className="flex items-center gap-2">
              <button className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={() => navigateMonth(-1)}>&larr;</button>
              <input type="month" className="px-2 py-1 border rounded bg-gray-50 dark:bg-gray-900" value={month} onChange={e => setMonth(e.target.value)} />
              <button className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700" onClick={() => navigateMonth(1)}>&rarr;</button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="text-center">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="contents">
                {week.map((d, di) => {
                  const isCurr = d.getMonth() === new Date(month + '-01').getMonth();
                  const dayEvents = visibleMonthEvents.filter(e => new Date(e.date).toDateString() === d.toDateString());
                  return (
                    <div key={di} className={`h-28 border rounded p-1 ${isCurr ? 'bg-white dark:bg-gray-800' : 'bg-gray-100 dark:bg-gray-900 opacity-70'}`}>
                      <div className="text-xs text-right text-gray-500">{d.getDate()}</div>
                      <div className="space-y-1">
                        {dayEvents.map(ev => (
                          <div key={ev.id} className="text-xs truncate px-1 py-0.5 rounded bg-faith-blue text-white" title={`${ev.title} ${ev.location ? '· ' + ev.location : ''} @ ${new Date(ev.date).toLocaleTimeString()}`}>{ev.title}</div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Create & Manage */}
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          {canManage && (<h2 className="text-lg font-medium mb-3">Create Event</h2>)}
          {canManage && (<div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm">Title</label>
              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <DateTimePicker label="Date/Time" value={date} onChange={setDate} withTime ariaLabel="Event date and time" />
            <div>
              <label className="text-sm">Location</label>
              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Description</label>
              <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" onClick={addEvent} disabled={loading || !title || !date}>Create</button>
            </div>
          </div>)}

          <h2 className="text-lg font-medium mt-6 mb-2">Upcoming Events</h2>
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="border rounded p-3">
                {editingEventId === e.id ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm">Title</label>
                      <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editTitle} onChange={(ev) => setEditTitle(ev.target.value)} />
                    </div>
                    <DateTimePicker label="Date/Time" value={editDate} onChange={setEditDate} withTime ariaLabel="Edit event date and time" />
                    <div>
                      <label className="text-sm">Location</label>
                      <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editLocation} onChange={(ev) => setEditLocation(ev.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm">Description</label>
                      <textarea className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={editDescription} onChange={(ev) => setEditDescription(ev.target.value)} />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={saveEdit} disabled={loading || !editTitle || !editDate}>Save</button>
                      <button className="px-3 py-2 bg-gray-600 text-white rounded" onClick={() => setEditingEventId(null)} disabled={loading}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="font-medium">{e.title}</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">{new Date(e.date).toLocaleString()} {e.location ? `· ${e.location}` : ''}</div>
                    <div className="text-sm">{e.description || '-'}</div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="number"
                        placeholder="Member ID"
                        value={memberId}
                        onChange={(ev) => setMemberId(ev.target.value)}
                        className="px-3 py-2 border rounded w-48 bg-gray-50 dark:bg-gray-900"
                      />
                      <button
                        className="px-3 py-2 bg-faith-gold text-white rounded"
                        onClick={() => register(e.id)}
                        disabled={loading || !memberId}
                      >
                        Register
                      </button>
                      {canManage && (<button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={() => startEdit(e)} disabled={loading}>Edit</button>)}
                      {canDelete && (<button className="px-3 py-2 bg-red-600 text-white rounded" onClick={() => deleteEvent(e.id)} disabled={loading}>Delete</button>)}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="print-footer"><div className="text-xs">FaithConnect • Events and Activities</div></div>
      </div>

      {/* AI Event Planner */}
      <div className="mt-6 bg-white dark:bg-gray-800 rounded shadow p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">AI Event Planner</h2>
          <div className="flex items-center gap-2">
            <input type="month" className="px-2 py-1 border rounded bg-gray-50 dark:bg-gray-900" value={month} onChange={e => setMonth(e.target.value)} />
            <button className="px-3 py-2 bg-faith-blue text-white rounded" onClick={generateAISuggestions} disabled={aiLoading}>{aiLoading ? 'Planning…' : 'Suggest Dates'}</button>
          </div>
        </div>
        <div className="mt-3 whitespace-pre-wrap text-sm">{aiText || 'Click Suggest Dates to get AI recommendations based on attendance patterns and existing calendar.'}</div>
      </div>
    </div>
  );
}
