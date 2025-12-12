import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";

interface Department { id: number; name: string; description?: string }

export default function MinistryDelete() {
  const { id } = useParams();
  const ministryId = Number(id);
  const navigate = useNavigate();
  const [ministry, setMinistry] = useState<Department | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/departments/${ministryId}`);
        setMinistry(res.data);
      } catch (e: any) {
        setError(e?.response?.data?.message || e.message || "Failed to load department");
      }
    })();
  }, [ministryId]);

  const handleDelete = async () => {
    if (!window.confirm("Are you sure you want to delete this department? This cannot be undone.")) return;
    try {
      setLoading(true);
      await api.delete(`/departments/${ministryId}`);
      navigate("/departments");
    } catch (e: any) {
      setError(e?.response?.data?.message || e.message || "Delete failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-600">
        <Link className="hover:underline" to="/departments">Departments</Link>
        <span> / </span>
        {ministry ? (
          <>
            <Link className="hover:underline" to={`/departments/${ministry.id}/delete`}>{ministry.name}</Link>
            <span> / Delete</span>
          </>
        ) : (
          <span>Delete</span>
        )}
      </nav>

      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Delete Department</h2>
        <Link to="/departments" className="btn-gold">Back to Departments</Link>
      </div>

      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
        {ministry ? (
          <>
            <p className="mb-4">You are about to delete <span className="font-semibold">{ministry.name}</span>.</p>
            <button disabled={loading} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded" onClick={handleDelete}>
              {loading ? 'Deleting...' : 'Delete Department'}
            </button>
          </>
        ) : (
          <div>Loading...</div>
        )}
      </section>
    </div>
  );
}
