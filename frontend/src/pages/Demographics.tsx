import { useEffect, useState, useMemo } from 'react';
import api from '../api/client';
import { printElement } from '../utils/printPreview';

interface Member {
  id: number;
  gender: string;
  spiritualStatus?: string | null;
  membershipStatus?: string | null;
  baptized?: boolean;
  dedicated?: boolean;
  dob?: string | null;
}

function compute(members: Member[]) {
  const total = members.length;
  const byGender = { MALE: 0, FEMALE: 0, OTHER: 0 } as Record<string, number>;
  const byStatus = new Map<string, number>();
  const byMembership = new Map<string, number>();
  let baptized = 0, dedicated = 0;
  const ageGroups = { '0-17': 0, '18-35': 0, '36-59': 0, '60+': 0, 'Unknown': 0 } as Record<string, number>;
  const now = new Date();
  for (const m of members) {
    byGender[m.gender] = (byGender[m.gender] || 0) + 1;
    const s = (m.spiritualStatus || 'Unknown').trim();
    byStatus.set(s, (byStatus.get(s) || 0) + 1);
    const ms = (m.membershipStatus || 'Unknown').trim();
    byMembership.set(ms, (byMembership.get(ms) || 0) + 1);
    const sLower = s.toLowerCase();
    if (m.baptized || sLower.includes('baptized')) baptized++;
    if (m.dedicated || sLower.includes('dedicated')) dedicated++;
    if (m.dob) {
      const dob = new Date(m.dob);
      const age = Math.floor((now.getTime() - dob.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (isNaN(age)) { ageGroups['Unknown']++; }
      else if (age <= 17) ageGroups['0-17']++;
      else if (age <= 35) ageGroups['18-35']++;
      else if (age <= 59) ageGroups['36-59']++;
      else ageGroups['60+']++;
    } else {
      ageGroups['Unknown']++;
    }
  }
  return { total, byGender, byStatus, byMembership, baptized, dedicated, ageGroups };
}

export default function Demographics() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Attendance can come back either as an object map { groupLabel: count }
  // or as an array of objects [{ group: string, count: number }]. Support both.
  const [attendanceByGroup, setAttendanceByGroup] = useState<Record<string, number> | Array<{ group: string; count: number }>>({});
  const stats = useMemo(()=> compute(members), [members]);

  useEffect(()=>{
    (async()=>{
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
        setMembers((data?.items ?? data ?? []) || []);
        try {
          const { data: att } = await api.get('/reports/demographics-attendance');
          if (Array.isArray(att)) {
            // Normalize array of { group, count }
            const items = att.filter((x: any)=> x && typeof x === 'object' && 'group' in x && 'count' in x);
            setAttendanceByGroup(items as Array<{ group: string; count: number }>);
          } else if (att && typeof att === 'object') {
            setAttendanceByGroup(att as Record<string, number>);
          }
        } catch {}
      } catch (e: any) {
        setError(e?.response?.data?.message || 'Failed to load members');
      } finally {
        setLoading(false);
      }
    })();
  },[]);
  const print = () => printElement('.container', 'Demographics');

  const bar = (value: number, max: number) => {
    const pct = max ? Math.round((value / max) * 100) : 0;
    return (
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded">
        <div className="bg-faith-gold text-white text-xs px-2 py-1 rounded" style={{ width: `${pct}%` }}>{pct}%</div>
      </div>
    );
  };

  const sectionCard = (title: string, items: [string, number][], total: number) => (
    <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
      <h3 className="font-semibold mb-3">{title}</h3>
      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-sm text-gray-600">No data</div>
        ) : items.map(([label, count]) => (
          <div className="grid grid-cols-5 items-center gap-2" key={label}>
            <div className="col-span-2 text-sm">{label}</div>
            <div className="text-right text-sm">{count}</div>
            <div className="col-span-2">{bar(count, total)}</div>
          </div>
        ))}
      </div>
    </section>
  );

  const genderItems = Object.entries(stats.byGender).filter(([,v])=>v);
  const statusItems = Array.from(stats.byStatus.entries()).filter(([,v])=>v);
  const membershipItems = Array.from(stats.byMembership.entries()).filter(([,v])=>v);
  const ageItems = Object.entries(stats.ageGroups).filter(([,v])=>v);

  return (
    <div className="container space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Demographics</h2>
        <div className="flex gap-2">
          <button className="btn" onClick={()=>window.history.back()}>Back</button>
          <button className="btn-gold" onClick={print}>Print Preview</button>
        </div>
      </div>
      {error && <div className="p-2 bg-red-100 text-red-700 rounded">{error}</div>}
      {loading && <div className="p-2">Loading…</div>}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="p-4 bg-white dark:bg-gray-800 rounded shadow">
            <h3 className="font-semibold mb-2">Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-600">Total Members</div>
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-600">Baptized</div>
                <div className="text-2xl font-bold">{stats.baptized}</div>
              </div>
              <div className="p-3 bg-gray-100 dark:bg-gray-700 rounded">
                <div className="text-xs text-gray-600">Dedicated</div>
                <div className="text-2xl font-bold">{stats.dedicated}</div>
              </div>
            </div>
          </section>
          {sectionCard('Gender', genderItems, stats.total)}
          {sectionCard('Spiritual Status', statusItems, stats.total)}
          {sectionCard('Membership Status', membershipItems, stats.total)}
          {sectionCard('Age Groups', ageItems, stats.total)}
          {sectionCard(
            'Attendance by Demographic (30 days)',
            (Array.isArray(attendanceByGroup)
              ? (attendanceByGroup as Array<{ group: string; count: number }>).map(({ group, count }) => [group, Number(count) || 0])
              : Object.entries(attendanceByGroup as Record<string, number>)
            ),
            (Array.isArray(attendanceByGroup)
              ? (attendanceByGroup as Array<{ group: string; count: number }>).reduce((sum, x) => sum + (Number(x.count) || 0), 0)
              : Object.values(attendanceByGroup as Record<string, number>).reduce((a,b)=>a+b,0)
            )
          )}
        </div>
      )}
    </div>
  );
}
