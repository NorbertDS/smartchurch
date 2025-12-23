import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface EventItem { id: number; title: string; description?: string; date: string; location?: string }
interface FinanceRecord { id: number; amount: number; type: string; description?: string; date?: string }
interface Member { id: number; firstName: string; lastName: string; membershipNumber?: string | null; membershipStatus?: string | null }

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<any[]>([]);
  const [financeSummary, setFinanceSummary] = useState<any[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [me, setMe] = useState<Member | null>(null);
  const [myRecords, setMyRecords] = useState<FinanceRecord[]>([]);
  const [activeQr, setActiveQr] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Array<{ id: number; title: string; content?: string; createdAt?: string }>>([]);
  const [providerOverview, setProviderOverview] = useState<any | null>(null);
  const [providerActivity, setProviderActivity] = useState<any[]>([]);
  const [providerVersion, setProviderVersion] = useState<{ version: string; buildTime: string | null; nodeEnv: string; checkedAt: string } | null>(null);
  const [providerVersionStatus, setProviderVersionStatus] = useState<{ current: any; expected: { version: string | null }; updateAvailable: boolean; warnings: string[] } | null>(null);
  const [providerVersionLogs, setProviderVersionLogs] = useState<any[]>([]);
  const [providerHealth, setProviderHealth] = useState<any | null>(null);
  const role = localStorage.getItem('fc_role') || 'ADMIN';
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const acknowledgeDeployment = async () => {
    try {
      await api.post('/provider/maintenance/version/ack', {});
      const logs = await api.get('/provider/maintenance/version/logs', { params: { limit: 10 } });
      setProviderVersionLogs(Array.isArray(logs.data) ? logs.data : []);
      setToast('Deployment acknowledgement logged');
      setTimeout(() => setToast(null), 2500);
    } catch (err: any) {
      setToast(err?.response?.data?.message || err.message || 'Failed to acknowledge');
      setTimeout(() => setToast(null), 2500);
    }
  };

  const fetchStats = async () => {
    try {
      setRefreshing(true);
      if (role === 'PROVIDER_ADMIN') {
        const [overview, activity, versionStatus, versionLogs, health] = await Promise.all([
          api.get('/provider/stats/overview', { params: { days: 30 } }),
          api.get('/provider/activity', { params: { limit: 25 } }),
          api.get('/provider/maintenance/version/status'),
          api.get('/provider/maintenance/version/logs', { params: { limit: 10 } }),
          api.get('/provider/maintenance/health'),
        ]);
        setProviderOverview(overview.data || null);
        setProviderActivity(Array.isArray(activity.data) ? activity.data : []);
        setProviderVersionStatus(versionStatus.data || null);
        setProviderVersion(versionStatus.data?.current || null);
        setProviderVersionLogs(Array.isArray(versionLogs.data) ? versionLogs.data : []);
        setProviderHealth(health.data || null);
      } else if (role === 'MEMBER') {
        const [ev, prof, mine, active] = await Promise.all([
          api.get('/events'),
          api.get('/members/me'),
          api.get('/finance/my'),
          api.get('/qr/active'),
        ]);
        setEvents(ev.data || []);
        setMe(prof.data || null);
        setMyRecords(mine.data || []);
        setActiveQr(active.data || null);
      } else {
        const [dash, att, fin] = await Promise.all([
          api.get('/reports/dashboard'),
          api.get('/attendance/summary/monthly'),
          api.get('/finance/summary/monthly'),
        ]);
        setData(dash.data);
        setAttendanceSummary(att.data);
        setFinanceSummary(fin.data);
      }
      if (role !== 'MEMBER' && role !== 'PROVIDER_ADMIN') {
        try {
          const anns = await api.get('/announcements');
          const all: any[] = anns.data || [];
          const mins = all.filter(a => {
            const t = String(a.title || '').toLowerCase();
            const c = String(a.content || '').toLowerCase();
            return t.includes('minute') || c.includes('minute');
          }).slice(0,5);
          setReminders(mins);
        } catch {}
      }
    } catch (err: any) {
      setToast(err?.response?.data?.message || err.message || 'Failed to load dashboard');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchStats(); }, [role]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [autoRefresh, role]);

  // Admin/Clerk/Pastor charts
  const financeLabels = financeSummary.map((s: any) => `${s.year}-${String(s.month).padStart(2, '0')}`);
  const incomeData = financeSummary.map((s: any) => s.income || 0);
  const expenseData = financeSummary.map((s: any) => s.expense || 0);
  const financeChart = {
    labels: financeLabels,
    datasets: [
      { label: 'Income', data: incomeData, backgroundColor: 'rgba(34,197,94,0.7)' },
      { label: 'Expense', data: expenseData, backgroundColor: 'rgba(239,68,68,0.7)' },
    ],
  };

  const attLabels = attendanceSummary.map((s: any) => `${s.year}-${String(s.month).padStart(2, '0')}`);
  const attTotals = attendanceSummary.map((s: any) => s.total || 0);
  const attendanceChart = {
    labels: attLabels,
    datasets: [
      { label: 'Attendance', data: attTotals, backgroundColor: 'rgba(59,130,246,0.7)' },
    ],
  };

  const providerCreatedChart = {
    labels: (providerOverview?.createdSeries?.labels || []).map((d: string) => String(d).slice(5)),
    datasets: [
      { label: 'New Tenants', data: (providerOverview?.createdSeries?.values || []), backgroundColor: 'rgba(59,130,246,0.7)' },
    ],
  };

  const providerStatusChart = {
    labels: ['Active', 'Suspended', 'Archived'],
    datasets: [
      { label: 'Tenants', data: [providerOverview?.tenants?.active || 0, providerOverview?.tenants?.suspended || 0, providerOverview?.tenants?.archived || 0], backgroundColor: ['rgba(34,197,94,0.7)','rgba(234,179,8,0.7)','rgba(239,68,68,0.7)'] },
    ],
  };

  // Member helpers
  const upcoming = useMemo(() => {
    const now = new Date();
    return (events || []).filter(e => new Date(e.date) >= now).sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0,5);
  }, [events]);
  const myTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    (myRecords || []).forEach(r => { totals[r.type] = (totals[r.type] || 0) + (r.amount || 0); });
    return totals;
  }, [myRecords]);

  const register = async (eventId: number) => {
    if (!me?.id) {
      setToast('No linked member profile for your account');
      return;
    }
    try {
      await api.post(`/events/${eventId}/register`, { memberId: me.id });
      setToast('Registered for event');
    } catch (err: any) {
      setToast(err?.response?.data?.message || err.message || 'Registration failed');
    } finally {
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <div className="container space-y-4">
      {toast && (
        <div className="p-2 border border-green-300 bg-green-50 text-green-700 rounded">{toast}</div>
      )}

      {role === 'PROVIDER_ADMIN' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="card">
            <div className="text-sm">Tenants</div>
            <div className="text-3xl font-bold">{providerOverview?.tenants?.total ?? '—'}</div>
            <div className="mt-2 text-xs text-gray-600">Active {providerOverview?.tenants?.active ?? '—'} · Suspended {providerOverview?.tenants?.suspended ?? '—'} · Archived {providerOverview?.tenants?.archived ?? '—'}</div>
          </div>
          <div className="card">
            <div className="text-sm">Health</div>
            <div className="text-3xl font-bold">{providerHealth?.db?.ok ? 'OK' : '—'}</div>
            <div className="mt-2 text-xs text-gray-600">Uptime {typeof providerHealth?.uptimeSec === 'number' ? `${providerHealth.uptimeSec}s` : '—'}</div>
          </div>
          <div className="card lg:col-span-2">
            <div className="text-sm">Actions</div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <a className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" href="/provider/tenants">Tenants</a>
              <a className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" href="/account/password">Password</a>
              <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={fetchStats} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
              <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} /> Auto-refresh</label>
            </div>
          </div>

          <div className="card lg:col-span-4">
            <h3 className="text-lg font-semibold mb-2">Deployment Verification</h3>
            {(providerVersionStatus?.updateAvailable || (providerVersionStatus?.warnings || []).length > 0) && (
              <div className="mb-3 p-3 border rounded bg-yellow-50 text-yellow-800 text-sm">
                <div className="font-semibold">Update Notice</div>
                {providerVersionStatus?.updateAvailable && (
                  <div>Update available: expected {providerVersionStatus?.expected?.version || '—'} · current {providerVersion?.version || '—'}</div>
                )}
                {(providerVersionStatus?.warnings || []).map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="p-3 border rounded">
                <div className="text-gray-600">Backend Version</div>
                <div className="font-semibold">{providerVersion?.version || '—'}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-gray-600">Build Time</div>
                <div className="font-semibold">{providerVersion?.buildTime ? new Date(providerVersion.buildTime).toLocaleString() : '—'}</div>
              </div>
              <div className="p-3 border rounded">
                <div className="text-gray-600">Checked</div>
                <div className="font-semibold">{providerVersion?.checkedAt ? new Date(providerVersion.checkedAt).toLocaleString() : '—'}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-xs text-gray-600">Set `APP_VERSION`, `BUILD_SHA`, `BUILD_TIME`, and optionally `EXPECTED_APP_VERSION`.</div>
              <div className="flex items-center gap-2">
                <button className="btn" onClick={fetchStats} disabled={refreshing}>{refreshing ? 'Checking…' : 'Verify Now'}</button>
                <button className="btn" onClick={acknowledgeDeployment} disabled={refreshing}>Acknowledge</button>
              </div>
            </div>
          </div>

          <div className="card lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">Tenant Status</h3>
            <Bar data={providerStatusChart} options={{ responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Status Distribution' } } }} />
          </div>
          <div className="card lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">Tenant Creation</h3>
            <Bar data={providerCreatedChart} options={{ responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'New Tenants (30 days)' } } }} />
          </div>

          <div className="card lg:col-span-4">
            <h3 className="text-lg font-semibold mb-2">Recent Verification Activity</h3>
            {providerVersionLogs.length === 0 ? (
              <div className="text-sm text-gray-600">No verification logs.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Action</th>
                      <th className="p-2">User</th>
                      <th className="p-2">At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerVersionLogs.map((l, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">{l.action}</td>
                        <td className="p-2">{l?.user?.email || l?.user?.name || '—'}</td>
                        <td className="p-2">{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card lg:col-span-4">
            <h3 className="text-lg font-semibold mb-2">Recent Provider Activity</h3>
            {providerActivity.length === 0 ? (
              <div className="text-sm text-gray-600">No activity logs.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="p-2">Action</th>
                      <th className="p-2">User</th>
                      <th className="p-2">Tenant</th>
                      <th className="p-2">At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerActivity.map((l: any, i: number) => (
                      <tr key={l?.id || i} className="border-t">
                        <td className="p-2">{l.action}</td>
                        <td className="p-2">{l?.user?.email || l?.user?.name || '—'}</td>
                        <td className="p-2">{l?.tenant?.name || l?.tenant?.slug || '—'}</td>
                        <td className="p-2">{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {role !== 'MEMBER' && role !== 'PROVIDER_ADMIN' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card"><div className="text-sm">Total Members</div><div className="text-3xl font-bold">{data?.membersCount ?? '...'}</div></div>
          <div className="card"><div className="text-sm">Upcoming Events</div><div className="text-3xl font-bold">{data?.eventsUpcoming ?? '...'}</div></div>
          <div className="card"><div className="text-sm">Finance Months</div><div className="text-3xl font-bold">{data?.financeSummary?.length ?? '...'}</div></div>
        </div>
      )}

      {['ADMIN','CLERK'].includes(role) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Minutes Reminders</h3>
            {reminders.length === 0 ? (
              <div className="text-sm text-gray-600">No reminders.</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {reminders.map(r => (
                  <li key={r.id} className="border rounded p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      {r.createdAt && <div className="text-xs text-gray-600">{new Date(r.createdAt).toLocaleString()}</div>}
                    </div>
                    <a href="/minutes" className="btn">Open Minutes</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Finance Summary</h3>
            <Bar data={financeChart} options={{ responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Income vs Expense' } } }} />
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Attendance Summary</h3>
            <Bar data={attendanceChart} options={{ responsive: true, plugins: { legend: { position: 'top' }, title: { display: true, text: 'Attendance per Month' } } }} />
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Management Shortcuts</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <a href="/members?register=1" className="btn">Add New Member</a>
              <a href="/finance" className="btn">Finance</a>
              <a href="/attendance" className="btn">Attendance</a>
              <a href="/events" className="btn">Events</a>
              <a href="/ministries" className="btn">Departments</a>
              <a href="/announcements" className="btn">Announcements</a>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button className="btn" onClick={fetchStats} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
              <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={autoRefresh} onChange={e=>setAutoRefresh(e.target.checked)} /> Auto-refresh</label>
            </div>
          </div>
        </div>
      )}

      {role === 'PASTOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Reports</h3>
            <p className="text-sm">Review church metrics and trends. See events and sermon planning.</p>
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">Quick Links</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <a href="/reports" className="btn">Reports</a>
              <a href="/events" className="btn">Events</a>
              <a href="/sermons" className="btn">Sermons</a>
              <a href="/announcements" className="btn">Announcements</a>
              <a href="/announcements?audience=DEPARTMENT_HEADS" className="btn">Message Department Heads</a>
            </div>
          </div>
        </div>
      )}

      {role === 'MEMBER' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {activeQr && (
            <div className="card lg:col-span-3">
              <h3 className="text-lg font-semibold mb-2">Quick Access</h3>
              <div className="flex flex-col items-center gap-2">
                {activeQr.qrImagePath ? (
                  <img src={`${api.defaults.baseURL}/uploads/${activeQr.qrImagePath}`} alt="QR" className="border rounded w-48 h-48" />
                ) : null}
                <div className="text-sm text-center">{activeQr.title}</div>
                {typeof activeQr.scanCount === 'number' && (<div className="text-xs text-gray-600">Scans: {activeQr.scanCount}</div>)}
              </div>
            </div>
          )}
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">My Membership</h3>
            {me ? (
              <div className="text-sm space-y-1">
                <div><span className="text-gray-600">Status:</span> <span className="font-medium">{me.membershipStatus || 'Unknown'}</span></div>
                <div><span className="text-gray-600">Number:</span> <span className="font-medium">{me.membershipNumber || 'Not assigned'}</span></div>
                
              </div>
            ) : (
              <div className="text-sm text-gray-600">No linked member profile.</div>
            )}
          </div>
          <div className="card lg:col-span-2">
            <h3 className="text-lg font-semibold mb-2">Upcoming Events</h3>
            {upcoming.length === 0 ? (
              <div className="text-sm text-gray-600">No upcoming events.</div>
            ) : (
              <ul className="space-y-2">
                {upcoming.map(e => (
                  <li key={e.id} className="border rounded p-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-sm text-gray-600">{new Date(e.date).toLocaleString()} {e.location ? `· ${e.location}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="px-3 py-2 bg-faith-gold text-white rounded" onClick={() => register(e.id)}>Register</button>
                      <a className="px-3 py-2 bg-faith-blue text-white rounded" href="/events">Details</a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <h3 className="text-lg font-semibold mb-2">My Contributions</h3>
            {myRecords.length === 0 ? (
              <div className="text-sm text-gray-600">No contributions recorded.</div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                  {Object.entries(myTotals).map(([type, amt]) => (
                    <div key={type} className="p-2 border rounded"><div className="text-gray-600">{type}</div><div className="font-semibold">{amt.toFixed(2)}</div></div>
                  ))}
                </div>
                <ul className="space-y-1 text-sm">
                  {myRecords.slice(0,5).map(r => (
                    <li key={r.id} className="border rounded p-2 flex items-center justify-between">
                      <span>{r.type} · {(r.amount || 0).toFixed(2)}</span>
                      <span className="text-gray-600">{r.date ? new Date(r.date).toLocaleDateString() : ''}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-2">
              <a href="/sermons" className="btn">View Sermon Archives</a>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-2">AI Insights</h3>
        <p className="text-sm">Use the AI Assistant (bottom right) to generate a weekly summary of member engagement.</p>
      </div>
    </div>
  );
}
