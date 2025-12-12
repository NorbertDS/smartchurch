import { useState } from 'react';
import api from '../api/client';

interface Member {
  id: number;
  gender: string;
  spiritualStatus?: string | null;
  membershipStatus?: string | null;
  baptized?: boolean;
  dedicated?: boolean;
  dob?: string | null;
}

function computeDemographics(members: Member[]) {
  const total = members.length;
  const byGender = { MALE: 0, FEMALE: 0, OTHER: 0 } as Record<string, number>;
  const byStatus = new Map<string, number>();
  const byMembership = new Map<string, number>();
  let baptized = 0, dedicated = 0;
  // Age groups if DOB available
  const ageGroups = { '0-17': 0, '18-35': 0, '36-59': 0, '60+': 0, 'Unknown': 0 } as Record<string, number>;

  const now = new Date();
  for (const m of members) {
    byGender[m.gender] = (byGender[m.gender] || 0) + 1;
    const s = (m.spiritualStatus || 'Unknown').trim();
    byStatus.set(s, (byStatus.get(s) || 0) + 1);
    const ms = (m.membershipStatus || 'Unknown').trim();
    byMembership.set(ms, (byMembership.get(ms) || 0) + 1);
    if (m.baptized) baptized++;
    if (m.dedicated) dedicated++;
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

  const fmtCounts = (objOrMap: Record<string, number> | Map<string, number>) => {
    const entries = objOrMap instanceof Map ? Array.from(objOrMap.entries()) : Object.entries(objOrMap);
    return entries
      .filter(([k, v]) => v && k !== 'Unknown')
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  };

  const lines = [
    `Total members: ${total}`,
    `Gender — ${fmtCounts(byGender)}`,
    `Spiritual status — ${fmtCounts(byStatus)}`,
    `Membership status — ${fmtCounts(byMembership)}`,
    `Baptized: ${baptized}, Dedicated: ${dedicated}`,
    `Age groups — ${fmtCounts(ageGroups)}`,
  ];

  return lines.join('\n');
}

export default function DemographicsSummary() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState('');

  const generate = async () => {
    setLoading(true);
    setSummary('');
    try {
      const { data } = await api.get('/members', { params: { page: 1, pageSize: 1000 } });
      const list: Member[] = (data?.items ?? data ?? []) || [];
      const text = computeDemographics(list);
      setSummary(text);
    } catch (e: any) {
      setSummary(e?.response?.data?.message || 'Failed to generate demographics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="fixed bottom-6 right-6 btn-gold shadow-lg">Demographic Summary</button>
      {open && (
        <div className="fixed bottom-20 right-6 w-[360px] card">
          <h3 className="text-lg font-semibold mb-2">Demographic Summary</h3>
          <p className="text-sm text-gray-600 mb-2">Generates stats from current member data — no AI.</p>
          <div className="mt-2 flex gap-2">
            <button className="btn-primary" onClick={generate} disabled={loading}>{loading ? 'Calculating…' : 'Generate'}</button>
            <button className="btn" onClick={()=>setSummary('')}>Clear</button>
          </div>
          {summary && (
            <div className="mt-3 whitespace-pre-wrap text-sm">
              {summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

