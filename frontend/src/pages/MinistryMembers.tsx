import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../api/client";

interface Department { id: number; name: string; description?: string }
interface Member { id: number; firstName: string; lastName: string; contact?: string }

export default function MinistryMembers() {
  const { id } = useParams();
  const ministryId = Number(id);
  const [ministry, setMinistry] = useState<Department | null>(null);
  const [memberships, setMemberships] = useState<Member[]>([]);
  const [search, setSearch] = useState<string>("");
  const [results, setResults] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMinistry = async () => {
    try {
      const res = await api.get(`/departments/${ministryId}`);
      setMinistry(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Failed to load department");
    }
  };

  const loadMemberships = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/departments/${ministryId}/memberships`);
      setMemberships(res.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Failed to load memberships");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ministryId) { loadMinistry(); loadMemberships(); } }, [ministryId]);

  const doSearch = async () => {
    if (!search.trim()) { setResults([]); return; }
    try {
      const res = await api.get(`/members`, { params: { q: search, pageSize: 10, page: 1 } });
      setResults((res.data?.items ?? res.data ?? []).slice(0, 10));
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Search failed");
    }
  };

  const addMembership = async (memberId: number) => {
    try {
      await api.post(`/departments/${ministryId}/memberships`, { memberId });
      await loadMemberships();
      setSearch("");
      setResults([]);
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Failed to add membership");
    }
  };

  const removeMembership = async (memberId: number) => {
    try {
      await api.delete(`/departments/${ministryId}/memberships/${memberId}`);
      await loadMemberships();
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Failed to remove membership");
    }
  };

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-600">
        <Link className="hover:underline" to="/departments">Departments</Link>
        <span> / </span>
        {ministry ? (
          <>
            <Link className="hover:underline" to={`/departments/${ministry.id}/members`}>{ministry.name}</Link>
            <span> / Manage Members</span>
          </>
        ) : (
          <span>Manage Members</span>
        )}
      </nav>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Manage Members {ministry ? `— ${ministry.name}` : ''}</h2>
        <Link to="/departments" className="btn-gold">Back to Departments</Link>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Current Members</h3>
        {loading ? (
          <div>Loading...</div>
        ) : memberships.length === 0 ? (
          <div className="text-gray-600">No members yet.</div>
        ) : (
          <ul className="space-y-2">
            {memberships.map(m => (
              <li key={m.id} className="flex items-center justify-between border p-2 rounded">
                <span>{m.firstName} {m.lastName}</span>
                <button className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded" onClick={() => removeMembership(m.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        <h3 className="font-semibold mb-2">Add Members</h3>
        <div className="flex gap-2 mb-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members by name/contact" className="input flex-1" />
          <button className="btn-gold" onClick={doSearch}>Search</button>
        </div>
        <ul className="space-y-2">
          {results.map(m => (
            <li key={m.id} className="flex items-center justify-between border p-2 rounded">
              <span>{m.firstName} {m.lastName}</span>
              <button className="btn-gold" onClick={() => addMembership(m.id)}>Add</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
