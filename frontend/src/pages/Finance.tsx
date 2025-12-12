import { useEffect, useState } from "react";
import TitleEditable from "../components/TitleEditable";
import api from "../api/client";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface FinanceRecord {
  id: number;
  amount: number;
  type: "TITHE" | "OFFERING" | "DONATION" | "PLEDGE" | "EXPENSE";
  description?: string;
  date?: string;
  category?: string;
}

interface MonthlySummaryItem {
  month: number;
  year: number;
  income?: number;
  expense?: number;
}

export default function Finance() {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [summary, setSummary] = useState<MonthlySummaryItem[]>([]);
  const [byTypeTotals, setByTypeTotals] = useState<Record<string, number> | null>(null);
  const [byCategoryTotals, setByCategoryTotals] = useState<Record<string, number> | null>(null);
  const [amount, setAmount] = useState<string>("");
  const [type, setType] = useState<FinanceRecord["type"]>("TITHE");
  const [category, setCategory] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aiText, setAiText] = useState<string>("");
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|null);

  const load = async () => {
    try {
      setLoading(true);
      if (role === 'ADMIN') {
        const [listRes, summaryRes, byTypeRes, byCatRes] = await Promise.all([
          api.get('/finance/records'),
          api.get('/finance/summary/monthly'),
          api.get('/finance/summary/by-type'),
          api.get('/finance/summary/expense-category'),
        ]);
        setRecords(listRes.data || []);
        setSummary(summaryRes.data || []);
        setByTypeTotals(byTypeRes.data || null);
        setByCategoryTotals(byCatRes.data || null);
      } else {
        const myRes = await api.get('/finance/my');
        setRecords(myRes.data || []);
        setSummary([]);
        setByTypeTotals(null);
        setByCategoryTotals(null);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const addRecord = async () => {
    try {
      setLoading(true);
      setError(null);
      if (role !== 'ADMIN') {
        throw new Error('Only admins can add finance records');
      }
      await api.post('/finance/records', {
        amount: Number(amount),
        type,
        description,
        category: type === 'EXPENSE' ? category || undefined : undefined,
      });
      setAmount("");
      setDescription("");
      setCategory("");
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Failed to add record");
    } finally {
      setLoading(false);
    }
  };

  const generateAISummary = async () => {
    try {
      setAiLoading(true);
      const res = await api.post("/ai/assist", {
        scope: "finance",
        prompt: "Summarize this month's contributions vs last month and suggest actions.",
      });
      setAiText(res.data?.text || "No summary available");
    } catch (err: any) {
      setAiText(err?.response?.data?.message || err.message || "Failed to generate AI summary");
    } finally {
      setAiLoading(false);
    }
  };

  const labels = summary.map((s) => `${s.year}-${String(s.month).padStart(2, "0")}`);
  const incomeData = summary.map((s) => s.income || 0);
  const expenseData = summary.map((s) => s.expense || 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Income",
        data: incomeData,
        backgroundColor: "rgba(34,197,94,0.7)",
      },
      {
        label: "Expense",
        data: expenseData,
        backgroundColor: "rgba(239,68,68,0.7)",
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: { display: true, text: "Monthly Finance Summary" },
    },
  };

  // Export helpers
  const exportExcel = () => {
    const rows = records.map(r => ({
      Date: r.date ? new Date(r.date).toLocaleDateString() : '-',
      Type: r.type,
      Category: r.category || '-',
      Description: r.description || '-',
      Amount: r.amount,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Finance');
    XLSX.writeFile(wb, 'finance-records.xlsx');
    setExportOpen(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const head = [["Date","Type","Category","Description","Amount"]];
    const body = records.map(r => [
      r.date ? new Date(r.date).toLocaleDateString() : '-',
      r.type,
      r.category || '-',
      r.description || '-',
      `$${r.amount.toFixed(2)}`,
    ]);
    autoTable(doc, { head, body });
    doc.save('finance-records.pdf');
    setExportOpen(false);
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <TitleEditable storageKey="finance" defaultValue="Finance" className="text-2xl font-semibold" />
        <div className="flex items-center gap-2 relative">
          <button className="btn" onClick={()=> setExportOpen(o=>!o)}>Export</button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-gray-800 border rounded shadow">
              <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportExcel}>Excel (.xlsx)</button>
              <button className="block w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700" onClick={exportPDF}>PDF (.pdf)</button>
            </div>
          )}
          <button className="btn" onClick={()=>window.print()}>Print</button>
        </div>
      </div>
      {error && (
        <div className="mt-3 p-3 border border-red-300 bg-red-50 text-red-700 rounded">{error}</div>
      )}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {role === 'ADMIN' && (
        <div className="bg-white dark:bg-gray-800 rounded shadow p-4 lg:col-span-2">
          <h2 className="text-lg font-medium mb-3">Monthly Summary</h2>
          <Bar data={chartData} options={chartOptions} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="border rounded p-3">
              <h3 className="font-medium mb-2">Totals by Type</h3>
              {!byTypeTotals && <p className="text-sm text-gray-500">No data</p>}
              {byTypeTotals && (
                <ul className="space-y-1 text-sm">
                  {Object.entries(byTypeTotals).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span>{k}</span>
                      <span className="font-semibold">${v.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border rounded p-3">
              <h3 className="font-medium mb-2">Expenses by Category</h3>
              {!byCategoryTotals && <p className="text-sm text-gray-500">No data</p>}
              {byCategoryTotals && (
                <ul className="space-y-1 text-sm">
                  {Object.entries(byCategoryTotals).map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between">
                      <span>{k}</span>
                      <span className="font-semibold">${v.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
          <h2 className="text-lg font-medium mb-3">{role === 'ADMIN' ? 'Add Record' : 'My Contributions'}</h2>
          <div className="grid grid-cols-1 gap-3">
            {role === 'ADMIN' && (
            <div>
              <label className="text-sm">Type</label>
              <select
                className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                value={type}
                onChange={(e) => setType(e.target.value as FinanceRecord["type"])}
              >
                <option value="TITHE">Tithe</option>
                <option value="OFFERING">Offering</option>
                <option value="DONATION">Donation</option>
                <option value="PLEDGE">Pledge</option>
                <option value="EXPENSE">Expense</option>
              </select>
            </div>
            )}
            {role === 'ADMIN' && type === "EXPENSE" && (
              <div>
                <label className="text-sm">Category</label>
                <select
                  className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">Select Category</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Welfare">Welfare</option>
                  <option value="Utilities">Utilities</option>
                  <option value="Missions">Missions</option>
                  <option value="Admin">Admin</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            )}
            {role === 'ADMIN' ? (
              <>
                <div>
                  <label className="text-sm">Amount</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm">Description</label>
                  <input
                    type="text"
                    className="mt-1 px-3 py-2 border rounded w-full bg-gray-50 dark:bg-gray-900"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div>
                  <button
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
                    onClick={addRecord}
                    disabled={loading || !amount}
                  >
                    {loading ? "Saving..." : "Add"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600">Below are your recent contributions.</div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="text-md font-medium mb-2">Recent Records</h3>
            <ul className="space-y-2 text-sm">
              {records.slice(0, 8).map((r) => (
                <li key={r.id} className="border rounded p-2 flex items-center justify-between">
                  <span>
                    <span className={r.type === "EXPENSE" ? "text-red-600" : "text-green-600"}>{r.type}</span> · {r.description || "-"}
                  </span>
                  <span className="font-semibold">${r.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {role === 'ADMIN' && (
          <div className="bg-white dark:bg-gray-800 rounded shadow p-4">
            <h2 className="text-lg font-medium mb-3">AI Financial Summary</h2>
            <div className="flex items-center gap-2">
              <button
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50"
                onClick={generateAISummary}
                disabled={aiLoading}
              >
                {aiLoading ? "Generating..." : "Generate"}
              </button>
            </div>
            {aiText && (
              <div className="mt-3 p-3 border rounded bg-gray-50 dark:bg-gray-900 text-sm whitespace-pre-wrap">
                {aiText}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
