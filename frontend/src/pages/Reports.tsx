import { useEffect, useState } from 'react';
import TitleEditable from "../components/TitleEditable";
import api from '../api/client';
import { printTarget } from '../utils/print';

interface FinanceSummaryItem { month: string; income: number; expense: number; }
interface DashboardData {
  membersCount: number;
  eventsUpcoming: number;
  financeSummary: FinanceSummaryItem[];
}

export default function Reports() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [tab, setTab] = useState<'dashboard'|'corner'>('dashboard');
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);
  const [cornerItems, setCornerItems] = useState<{type:'BOARD'|'BUSINESS';id:number;title:string;meetingDate:string;approvedAt?: string|null;version:number;filePath:string}[]>([]);
  const [cornerType, setCornerType] = useState<'ALL'|'BOARD'|'BUSINESS'>('ALL');
  const [cornerFrom, setCornerFrom] = useState('');
  const [cornerTo, setCornerTo] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/reports/dashboard');
        setData(res.data);
      } catch (err: any) {
        setError(err?.response?.data?.message || err.message || 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tab === 'corner' && ['ADMIN','CLERK','PASTOR'].includes(String(role))) {
      (async () => {
        try {
          const res = await api.get('/reports/corner');
          setCornerItems(res.data || []);
        } catch (e: any) {
          setError(e?.response?.data?.message || 'Failed to load reports corner');
        }
      })();
    }
  }, [tab]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Metric','Value'],
      ['Members Count', String(data.membersCount)],
      ['Upcoming Events', String(data.eventsUpcoming)],
      [],
      ['Month','Income','Expense'],
      ...data.financeSummary.map(i => [i.month, String(i.income), String(i.expense)]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'reports.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    if (!data) return;
    const html = `
    <html><head><title>Reports Export</title><style>
      body{font-family:Arial,sans-serif;padding:20px}
      h1{font-size:18px}
      table{width:100%;border-collapse:collapse;margin-top:10px}
      th,td{border:1px solid #999;padding:6px;font-size:12px;text-align:left}
      th{background:#eee}
    </style></head>
    <body>
      <h1>FaithConnect Reports</h1>
      <div>Members Count: ${data.membersCount}</div>
      <div>Upcoming Events: ${data.eventsUpcoming}</div>
      <table>
        <thead><tr><th>Month</th><th>Income</th><th>Expense</th></tr></thead>
        <tbody>
          ${data.financeSummary.map(i => `<tr><td>${i.month}</td><td>${i.income}</td><td>${i.expense}</td></tr>`).join('')}
        </tbody>
      </table>
    </body></html>`;
    const w = window.open('', 'print');
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close(); w.focus(); w.print();
    setExportOpen(false);
  };

  return (
    <div className="p-4">
      <TitleEditable storageKey="reports" defaultValue="Reports" className="text-2xl font-semibold" />
      {error && <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>}
      <div className="mt-3 flex gap-2">
        <button className={`btn ${tab==='dashboard'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('dashboard')}>Dashboard</button>
        {['ADMIN','CLERK','PASTOR'].includes(String(role)) && (
          <button className={`btn ${tab==='corner'?'bg-faith-gold text-white':''}`} onClick={()=>setTab('corner')}>Reports Corner</button>
        )}
      </div>
      {loading && tab==='dashboard' ? (
        <div>Loading...</div>
      ) : (
        <>
          {tab==='dashboard' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="card"><div className="text-sm">Members</div><div className="text-3xl font-bold">{data?.membersCount ?? '...'}</div></div>
                <div className="card"><div className="text-sm">Upcoming Events</div><div className="text-3xl font-bold">{data?.eventsUpcoming ?? '...'}</div></div>
                <div className="card"><div className="text-sm">Finance Months</div><div className="text-3xl font-bold">{data?.financeSummary?.length ?? '...'}</div></div>
              </div>

              <div className="card mt-4 printable-reports">
                <div className="print-header">
                  <div className="text-lg font-semibold">Reports</div>
                  <div className="text-xs text-gray-600">Printed on {new Date().toLocaleString()}</div>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">Finance Summary</h3>
                  <div className="flex items-center gap-2 relative">
                    <button className="btn" onClick={()=> setExportOpen(o=>!o)}>Export</button>
                    {exportOpen && (
                      <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 border rounded shadow">
                        <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportCSV}>CSV (.csv)</button>
                        <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportPDF}>PDF (.pdf)</button>
                      </div>
                    )}
                    <button className="btn" aria-label="Print" onClick={()=>printTarget('reports')}>Print</button>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left"><th className="p-2">Month</th><th className="p-2">Income</th><th className="p-2">Expense</th></tr>
                  </thead>
                  <tbody>
                    {data?.financeSummary?.map((i, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">{i.month}</td>
                        <td className="p-2">{i.income}</td>
                        <td className="p-2">{i.expense}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="print-footer"><div className="text-xs">FaithConnect • System Reports</div></div>
              </div>
            </>
          )}
          {tab==='corner' && (
            <div className="card mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold">Reports Corner (Approved)</h3>
                <div className="text-sm text-gray-600">Read-only for staff</div>
              </div>
              <div className="flex flex-wrap items-end gap-2 mb-2">
                <div className="flex flex-col">
                  <label className="text-xs">Type</label>
                  <select className="input" value={cornerType} onChange={e=>setCornerType(e.target.value as any)}>
                    <option value="ALL">All</option>
                    <option value="BOARD">Board</option>
                    <option value="BUSINESS">Business</option>
                  </select>
                </div>
                <div className="flex flex-col">
                  <label className="text-xs">Approval From</label>
                  <input type="date" className="input" value={cornerFrom} onChange={e=>setCornerFrom(e.target.value)} />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs">Approval To</label>
                  <input type="date" className="input" value={cornerTo} onChange={e=>setCornerTo(e.target.value)} />
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="p-2">Type</th>
                    <th className="p-2">Title</th>
                    <th className="p-2">Meeting Date</th>
                    <th className="p-2">Approved</th>
                    <th className="p-2">Version</th>
                    <th className="p-2">File</th>
                  </tr>
                </thead>
                <tbody>
                  {cornerItems
                    .filter(it => cornerType==='ALL' ? true : it.type === cornerType)
                    .filter(it => {
                      const a = it.approvedAt ? new Date(it.approvedAt).getTime() : null;
                      const fromOk = !cornerFrom || (a ? a >= new Date(cornerFrom).getTime() : new Date(it.meetingDate).getTime() >= new Date(cornerFrom).getTime());
                      const toOk = !cornerTo || (a ? a <= new Date(cornerTo).getTime() : new Date(it.meetingDate).getTime() <= new Date(cornerTo).getTime());
                      return fromOk && toOk;
                    })
                    .map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">{it.type}</td>
                      <td className="p-2">{it.title}</td>
                      <td className="p-2">{it.meetingDate ? new Date(it.meetingDate).toLocaleDateString() : ''}</td>
                      <td className="p-2">{it.approvedAt ? new Date(it.approvedAt).toLocaleDateString() : '—'}</td>
                      <td className="p-2">{it.version}</td>
                      <td className="p-2"><a href={it.filePath} target="_blank" rel="noreferrer" className="text-blue-600 underline">Open</a></td>
                    </tr>
                  ))}
                  {cornerItems.length === 0 && (
                    <tr><td className="p-2" colSpan={6}>No approved reports yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
