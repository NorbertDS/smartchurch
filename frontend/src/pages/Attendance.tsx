import { useEffect, useMemo, useState } from "react";
import TitleEditable from "../components/TitleEditable";
import api from "../api/client";
import { format } from "date-fns";
import { printTarget } from "../utils/print";

interface Member {
  id: number;
  firstName: string;
  lastName: string;
}

interface AttendanceRecord {
  id: number;
  date: string;
  serviceType: string;
  departmentId?: number | null;
  department?: { id: number; name: string } | null;
  entries: { id: number; memberId: number; present: boolean }[];
}

interface Department { id: number; name: string }
// Demographic groups are enum values on Member
type DemographicGroup = 'AMM' | 'AWM' | 'YOUTHS' | 'AMBASSADORS' | 'CHILDREN';

export default function Attendance() {
  const [members, setMembers] = useState<Member[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  // Static demographic options matching backend enum
  const demographicOptions: DemographicGroup[] = ['AMM','AWM','YOUTHS','AMBASSADORS','CHILDREN'];
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [date, setDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [serviceType, setServiceType] = useState<string>("SUNDAY_SERVICE");
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Per-attendee demographic selection (required for present attendees)
  const [demographicByMember, setDemographicByMember] = useState<Record<number, DemographicGroup | ''>>({});
  const [missingDemographicIds, setMissingDemographicIds] = useState<number[]>([]);

  // Filters for Recent Records panel
  const [filterServiceType, setFilterServiceType] = useState<string>(""); // empty = all
  const [filterDepartmentId, setFilterDepartmentId] = useState<string>(""); // empty = all
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [recordsLoading, setRecordsLoading] = useState<boolean>(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [membersRes, departmentsRes] = await Promise.all([
          api.get("/members"),
          api.get("/departments"),
        ]);
        setMembers(membersRes.data || []);
        setDepartments(departmentsRes.data || []);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || "Failed to load attendance data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Load records with filters
  useEffect(() => {
    const loadRecords = async () => {
      try {
        setRecordsLoading(true);
        const params: any = {};
        if (filterServiceType) params.serviceType = filterServiceType;
        if (filterDepartmentId) params.departmentId = filterDepartmentId;
        if (filterFrom) params.from = filterFrom;
        if (filterTo) params.to = filterTo;
        const recordsRes = await api.get("/attendance/records", { params });
        setRecords(recordsRes.data || []);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || "Failed to load attendance records");
      } finally {
        setRecordsLoading(false);
      }
    };
    loadRecords();
  }, [filterServiceType, filterDepartmentId, filterFrom, filterTo]);

  const toggleMember = (id: number) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const selectedCount = useMemo(() => selectedMemberIds.length, [selectedMemberIds]);

  const submitRecord = async () => {
    try {
      setLoading(true);
      setError(null);
      // Validate demographics for selected attendees
      const missing = selectedMemberIds.filter(id => !demographicByMember[id]);
      if (missing.length > 0) {
        setMissingDemographicIds(missing);
        setLoading(false);
        setError("Please select a demographic for all selected attendees.");
        return;
      }
      const payload = {
        date,
        serviceType,
        entries: selectedMemberIds.map((memberId) => ({
          memberId,
          present: true,
          // Provide demographic group to backend to persist on member
          demographicGroup: demographicByMember[memberId] || undefined,
        })),
      };
      await api.post("/attendance/records", payload);
      // Refresh records after save using current filters
      const params: any = {};
      if (filterServiceType) params.serviceType = filterServiceType;
      if (filterDepartmentId) params.departmentId = filterDepartmentId;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const list = await api.get("/attendance/records", { params });
      setRecords(list.data || []);
      setSelectedMemberIds([]);
      setMissingDemographicIds([]);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to submit attendance record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <TitleEditable storageKey="attendance" defaultValue="Attendance" className="text-2xl font-semibold" />
        <button className="btn" aria-label="Print" onClick={()=>printTarget('attendance')}>Print</button>
      </div>

      {error && (
        <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 printable-attendance">
        <div className="print-header">
          <div className="text-lg font-semibold">Attendance</div>
          <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
        </div>
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="text-lg font-medium mb-3">Mark Attendance</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm">Date</label>
              <input
                type="date"
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={date}
                readOnly
                onKeyDown={(e)=> e.preventDefault()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm">Service Type</label>
              <select
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={serviceType}
                onChange={(e) => setServiceType(e.target.value)}
              >
                <option value="SUNDAY_SERVICE">Sunday Service</option>
                <option value="MIDWEEK_SERVICE">Midweek Service</option>
                <option value="PRAYER_MEETING">Prayer Meeting</option>
                <option value="SPECIAL_EVENT">Special Event</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Selected</label>
              <div className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900">
                {selectedCount} member(s)
              </div>
            </div>
          </div>

          <p className="text-sm text-gray-600 mb-2">Select a demographic for each attendee. This field is required before saving.</p>
          <div className="mt-4 max-h-72 overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 dark:bg-gray-700">
                <tr>
                  <th className="text-left p-2">Present</th>
                  <th className="text-left p-2">Member</th>
                  <th className="text-left p-2">Demographic</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedMemberIds.includes(m.id)}
                        onChange={() => toggleMember(m.id)}
                      />
                    </td>
                    <td className="p-2">{m.firstName} {m.lastName}</td>
                    <td className="p-2">
                      <select
                        className={`mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900 ${missingDemographicIds.includes(m.id) ? 'border-red-500' : ''}`}
                        value={demographicByMember[m.id] ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? (e.target.value as DemographicGroup) : '' as '';
                          setDemographicByMember(prev => ({ ...prev, [m.id]: val }));
                          if (missingDemographicIds.includes(m.id)) {
                            setMissingDemographicIds(ids => ids.filter(x => x !== m.id));
                          }
                        }}
                        disabled={!selectedMemberIds.includes(m.id)}
                      >
                        <option value="">Select demographic</option>
                        {demographicOptions.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                      {missingDemographicIds.includes(m.id) && (
                        <div className="text-xs text-red-600 mt-1">Demographic is required</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              onClick={submitRecord}
              disabled={loading || selectedMemberIds.length === 0}
            >
              {loading ? "Saving..." : "Save Attendance"}
            </button>
            <button
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded"
              onClick={() => setSelectedMemberIds([])}
            >
              Clear Selection
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="text-lg font-medium mb-3">Recent Records</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-sm">Service Filter</label>
              <select
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={filterServiceType}
                onChange={(e) => setFilterServiceType(e.target.value)}
              >
                <option value="">All Services</option>
                <option value="SUNDAY_SERVICE">Sunday Service</option>
                <option value="MIDWEEK_SERVICE">Midweek Service</option>
                <option value="PRAYER_MEETING">Prayer Meeting</option>
                <option value="SPECIAL_EVENT">Special Event</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Department Filter</label>
              <select
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={filterDepartmentId}
                onChange={(e) => setFilterDepartmentId(e.target.value)}
              >
                <option value="">All Departments</option>
                {departments.map((dep) => (
                  <option key={dep.id} value={String(dep.id)}>{dep.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm">From Date</label>
              <input
                type="date"
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={filterFrom}
                readOnly
                onKeyDown={(e)=> e.preventDefault()}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm">To Date</label>
              <input
                type="date"
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={filterTo}
                readOnly
                onKeyDown={(e)=> e.preventDefault()}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
          </div>

          {recordsLoading ? (
            <div className="text-sm text-gray-500">Loading records...</div>
          ) : (
            <ul className="space-y-2">
              {records.slice(0, 10).map((r) => (
                <li key={r.id} className="border rounded p-2">
                  <div className="text-sm text-gray-700 dark:text-gray-300">
                    {format(new Date(r.date), "MMM d, yyyy")} · {r.serviceType?.replace(/_/g, " ")}
                    {r.department?.name ? ` · ${r.department.name}` : ""}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {r.entries.filter((e) => e.present).length} present
                  </div>
                </li>
              ))}
              {records.length === 0 && (
                <li className="text-sm text-gray-500">No records found.</li>
              )}
            </ul>
          )}
        </div>
        <div className="print-footer"><div className="text-xs">FaithConnect • Attendance Records</div></div>
      </div>
    </div>
  );
}
