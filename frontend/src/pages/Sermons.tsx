import { useEffect, useState } from "react";
import TitleEditable from "../components/TitleEditable";
import api from "../api/client";
import DateTimePicker from "../components/DateTimePicker";

interface Sermon {
  id: number;
  title: string;
  speaker?: string;
  date: string;
  contentUrl?: string;
}

export default function Sermons() {
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [title, setTitle] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [contentUrl, setContentUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get("/sermons");
      setSermons(res.data || []);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load sermons");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createSermon = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.post("/sermons", { title, speaker, date, contentUrl });
      setTitle("");
      setSpeaker("");
      setContentUrl("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to create sermon");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <TitleEditable storageKey="sermons" defaultValue="Sermons" className="text-2xl font-semibold" />
      {error && <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4">
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4 lg:col-span-2">
          <h2 className="text-lg font-medium mb-3">All Sermons</h2>
          <ul className="space-y-2">
            {sermons.map(s => (
              <li key={s.id} className="border rounded p-3">
                <div className="font-medium">{s.title}</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{s.speaker || '-'} · {new Date(s.date).toLocaleDateString()}</div>
                {s.contentUrl && (
                  <div className="text-sm">
                    <a href={s.contentUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">Content</a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="text-lg font-medium mb-3">Create Sermon</h2>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-sm">Title</label>
              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm">Speaker</label>
              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={speaker} onChange={(e) => setSpeaker(e.target.value)} />
            </div>
            <DateTimePicker label="Date" value={date} onChange={setDate} withTime={false} ariaLabel="Sermon date" />
            <div>
              <label className="text-sm">Content URL</label>
              <input className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900" value={contentUrl} onChange={(e) => setContentUrl(e.target.value)} />
            </div>
            <div>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded" onClick={createSermon} disabled={loading || !title}>Create</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
