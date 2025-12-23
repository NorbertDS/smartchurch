import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

type Tenant = { id: number; name: string; slug: string; status: string; createdAt: string; archivedAt?: string | null; config?: any };
type TenantOption = { id: number; name: string; slug: string };

export default function TenantManage() {
  const { id } = useParams();
  const tid = Number(id);
  const navigate = useNavigate();
  const [t, setT] = useState<Tenant | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [billing, setBilling] = useState<{ plan: string; seats: string; period: 'monthly'|'quarterly'|'yearly'; pricePreview: string; renewPreview: string; overridePrice: string }>({ plan: 'basic', seats: '50', period: 'monthly', pricePreview: '', renewPreview: '', overridePrice: '' });
  const [branding, setBranding] = useState<{ logoUrl: string; primaryColor: string }>({ logoUrl: '', primaryColor: '' });
  const [regional, setRegional] = useState<{ timezone: string; currency: string }>({ timezone: 'Africa/Nairobi', currency: 'KES' });
  const [features, setFeatures] = useState<{ members: boolean; finance: boolean; attendance: boolean; reports: boolean }>({ members: true, finance: true, attendance: true, reports: true });
  const [logs, setLogs] = useState<any[]>([]);
  const [logQuery, setLogQuery] = useState('');
  const [verified, setVerified] = useState<{ at: string; computedFeatures: any } | null>(null);
  const [maintenanceTenants, setMaintenanceTenants] = useState<TenantOption[]>([]);
  const [maintenanceTenantId, setMaintenanceTenantId] = useState<number>(() => tid);
  const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
  const [reauthModal, setReauthModal] = useState<{ open: boolean; action: 'FULL' | 'TENANT' | null }>({ open: false, action: null });
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthOtp, setReauthOtp] = useState('');
  const [reauthNeedOtp, setReauthNeedOtp] = useState(false);
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [reauthTokenExpAt, setReauthTokenExpAt] = useState<number>(0);
  const [restartOpId, setRestartOpId] = useState<string | null>(null);
  const [restartStatus, setRestartStatus] = useState<any | null>(null);
  const [restartWorking, setRestartWorking] = useState(false);

  async function load() {
    setError(''); setInfo('');
    try {
      const { data } = await api.get(`/provider/tenants/${tid}`);
      setT(data);
      const b = (data?.config?.billing) || {};
      setBilling({ plan: String(b.plan || 'basic'), seats: String(b.seats || '50'), period: String(b.period || 'monthly') as any, pricePreview: String(b.price || b.priceCalculated || ''), renewPreview: String(b.renewAt || ''), overridePrice: '' });
      const br = (data?.config?.branding) || {};
      setBranding({ logoUrl: String(br.logoUrl || ''), primaryColor: String(br.primaryColor || '#1E3A8A') });
      const rg = (data?.config?.regional) || {};
      setRegional({ timezone: String(rg.timezone || 'Africa/Nairobi'), currency: String(rg.currency || 'KES') });
      const ff = (data?.config?.features) || {};
      setFeatures({ members: Boolean(ff.members ?? true), finance: Boolean(ff.finance ?? true), attendance: Boolean(ff.attendance ?? true), reports: Boolean(ff.reports ?? true) });
      const { data: l } = await api.get(`/provider/tenants/${tid}/audit-logs?limit=50`);
      setLogs(l || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tenant');
    }
  }

  useEffect(() => { if (!isNaN(tid)) load(); }, [tid]);
  useEffect(() => { if (!isNaN(tid)) setMaintenanceTenantId(tid); }, [tid]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/provider/tenants', { params: { pageSize: 100 } });
        const items = (data?.items || []) as any[];
        setMaintenanceTenants(items.map((x) => ({ id: Number(x.id), name: String(x.name || ''), slug: String(x.slug || '') })));
      } catch {}
    })();
  }, []);

  async function loadMaintenanceLogs() {
    try {
      const { data } = await api.get('/provider/maintenance/restart/logs', { params: { limit: 25 } });
      setMaintenanceLogs(Array.isArray(data) ? data : []);
    } catch {}
  }

  useEffect(() => {
    loadMaintenanceLogs();
  }, []);

  function hasValidReauth() {
    return !!reauthToken && Date.now() < reauthTokenExpAt;
  }

  async function openReauthFor(action: 'FULL' | 'TENANT') {
    setReauthModal({ open: true, action });
    setReauthPassword('');
    setReauthOtp('');
    setReauthNeedOtp(false);
  }

  async function submitReauth() {
    setError('');
    setInfo('');
    try {
      const payload: any = { password: reauthPassword };
      if (reauthOtp.trim()) payload.otp = reauthOtp.trim();
      const { data } = await api.post('/provider/maintenance/reauth', payload);
      const token = String(data?.reauthToken || '');
      const expiresInSec = Number(data?.expiresInSec || 0);
      if (!token) throw new Error('Re-authentication failed');
      setReauthToken(token);
      setReauthTokenExpAt(Date.now() + Math.max(1, expiresInSec) * 1000 - 5000);
      setReauthModal({ open: false, action: null });
      setReauthPassword('');
      setReauthOtp('');
      setReauthNeedOtp(false);
      if (reauthModal.action) await performRestart(reauthModal.action, token);
    } catch (e: any) {
      const needOtp = e?.response?.data?.require2fa === true;
      if (needOtp) setReauthNeedOtp(true);
      setError(e?.response?.data?.message || e?.message || 'Re-authentication failed');
    }
  }

  async function requestRestart(action: 'FULL' | 'TENANT') {
    setError('');
    setInfo('');
    if (action === 'FULL') {
      const ok = window.confirm('Full system restart will restart the whole server for all tenants. Continue?');
      if (!ok) return;
    } else {
      const ok = window.confirm('Restart this tenant? This is a logical restart simulation and will be logged.');
      if (!ok) return;
    }
    if (!hasValidReauth()) return openReauthFor(action);
    await performRestart(action, reauthToken as string);
  }

  async function performRestart(action: 'FULL' | 'TENANT', token: string) {
    setRestartWorking(true);
    setRestartOpId(null);
    setRestartStatus(null);
    try {
      if (action === 'FULL') {
        const { data } = await api.post('/provider/maintenance/restart/full', {}, { headers: { 'x-reauth-token': token } });
        const opId = String(data?.operationId || '');
        if (opId) setRestartOpId(opId);
        setInfo(String(data?.message || 'Restart scheduled'));
      } else {
        const tenantId = Number(maintenanceTenantId);
        if (!tenantId || !isFinite(tenantId)) {
          setError('Select a valid tenant');
          return;
        }
        const { data } = await api.post('/provider/maintenance/restart/tenant', { tenantId }, { headers: { 'x-reauth-token': token } });
        const opId = String(data?.operationId || '');
        if (opId) setRestartOpId(opId);
        setInfo('Tenant restart initiated');
      }
      loadMaintenanceLogs();
    } catch (e: any) {
      const retryAfter = Number(e?.response?.headers?.['retry-after'] || 0);
      const base = e?.response?.data?.message || 'Failed to initiate restart';
      setError(retryAfter ? `${base} Retry-After: ${retryAfter}s` : base);
    } finally {
      setRestartWorking(false);
    }
  }

  useEffect(() => {
    if (!restartOpId) return;
    let stopped = false;
    const interval = window.setInterval(async () => {
      if (stopped) return;
      try {
        const { data } = await api.get(`/provider/maintenance/restart/status/${encodeURIComponent(restartOpId)}`);
        setRestartStatus(data);
        const st = String(data?.status || '');
        if (st === 'COMPLETED' || st === 'FAILED') {
          stopped = true;
          window.clearInterval(interval);
          loadMaintenanceLogs();
        }
      } catch {}
    }, 1000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [restartOpId]);

  async function assignAdmin(reset = false) {
    setError(''); setInfo('');
    try {
      const { data } = await api.post(`/provider/tenants/${tid}/bootstrap-admin`, reset ? { reset: true } : {});
      if (data?.tempPassword) setInfo(`Admin ready. Email: ${data.email} · Temp Password: ${data.tempPassword}`);
      else setInfo(data?.status === 'exists' ? `Admin exists. Email: ${data?.email}` : `Admin created. Email: ${data?.email}`);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to assign admin');
    }
  }

  async function saveBasics() {
    if (!t) return;
    setError(''); setInfo('');
    try {
      const body = { name: t.name, slug: t.slug };
      const { data } = await api.put(`/provider/tenants/${tid}`, body);
      setT(data);
      setInfo('Basics updated');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update basics');
    }
  }

  function recalc() {
    try {
      const seats = Number(billing.seats || '0');
      const months = billing.period === 'yearly' ? 12 : billing.period === 'quarterly' ? 3 : 1;
      const rates: Record<string, number> = { basic: 0.4, pro: 1.0, enterprise: 2.0 };
      const rate = rates[billing.plan] ?? rates.basic;
      const price = seats * rate * months;
      const start = new Date();
      const renew = new Date(start.getTime()); renew.setMonth(renew.getMonth() + months);
      setBilling((v) => ({ ...v, pricePreview: String(price), renewPreview: renew.toISOString().slice(0,10) }));
    } catch {}
  }

  useEffect(() => { recalc(); }, [billing.plan, billing.period, billing.seats]);

  async function saveBranding() {
    setError(''); setInfo('');
    try { await api.put(`/provider/tenants/${tid}/config`, { branding }); setInfo('Branding updated'); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to update branding'); }
  }

  async function saveRegional() {
    setError(''); setInfo('');
    try { await api.put(`/provider/tenants/${tid}/config`, { regional }); setInfo('Regional settings updated'); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to update regional'); }
  }

  async function saveFeatures() {
    setError(''); setInfo('');
    try {
      await api.put(`/provider/tenants/${tid}/config`, { features });
      setInfo('Feature flags updated');
      await load();
      await verifyConfig();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update features');
    }
  }

  async function verifyConfig() {
    setError('');
    setInfo('');
    try {
      const { data } = await api.get(`/provider/tenants/${tid}/config/verify`);
      setVerified({ at: String(data?.verifiedAt || new Date().toISOString()), computedFeatures: data?.computedFeatures || {} });
      setInfo('Config verified');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to verify config');
    }
  }

  async function searchLogs() {
    setError('');
    try { const { data: l } = await api.get(`/provider/tenants/${tid}/audit-logs?limit=50&q=${encodeURIComponent(logQuery)}`); setLogs(l || []); } catch {}
  }

  async function clearAuditLogs() {
    setError('');
    setInfo('');
    const q = logQuery.trim();
    const ok = window.confirm(q ? `Delete audit logs matching "${q}"?` : 'Delete all audit logs for this tenant?');
    if (!ok) return;
    try {
      const { data } = await api.delete(`/provider/tenants/${tid}/audit-logs`, { params: q ? { q } : undefined });
      const deleted = Number(data?.deleted || 0);
      setInfo(`Deleted ${deleted} audit log(s)`);
      setLogs([]);
      if (q) await searchLogs();
      else await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete audit logs');
    }
  }

  async function saveBilling() {
    setError(''); setInfo('');
    try {
      const price = billing.overridePrice ? Number(billing.overridePrice || '0') : undefined;
      const body = { plan: billing.plan, seats: Number(billing.seats||'0'), period: billing.period, startAt: new Date().toISOString(), price };
      await api.put(`/provider/tenants/${tid}/billing`, body);
      setInfo('Billing updated');
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to update billing');
    }
  }

  async function suspend() { setError(''); setInfo(''); try { await api.patch(`/provider/tenants/${tid}/suspend`); setInfo('Suspended'); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to suspend'); } }
  async function activate() { setError(''); setInfo(''); try { await api.patch(`/provider/tenants/${tid}/activate`); setInfo('Activated'); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to activate'); } }
  async function archive() { setError(''); setInfo(''); try { await api.patch(`/provider/tenants/${tid}/archive`); setInfo('Archived'); await load(); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to archive'); } }

  // Provider cannot enter tenant context unless logging in as tenant admin separately

  if (!t) return (<div className="p-4">Loading…</div>);

  return (
    <div className="container space-y-6">
      <h2 className="text-2xl font-bold mb-2">Manage Tenant</h2>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {info && <div className="text-green-700 mb-2">{info}</div>}
      <div className="card mb-4 p-6 space-y-3">
        <div className="font-semibold">Basics</div>
        <label className="block">
          <span className="text-sm">Name</span>
          <input className="fc-input" value={t.name} onChange={e=>setT(prev=>({ ...(prev as Tenant), name: e.target.value }))} />
        </label>
        <label className="block">
          <span className="text-sm">Slug</span>
          <input className="fc-input" value={t.slug} onChange={e=>setT(prev=>({ ...(prev as Tenant), slug: e.target.value }))} />
        </label>
        <div><span className="text-sm">Status:</span> {t.status}{t.archivedAt ? ' · archived' : ''}</div>
        <div><span className="text-sm">Created:</span> {new Date(t.createdAt).toLocaleString()}</div>
        <button className="btn-primary mt-2" onClick={saveBasics}>Save Basics</button>
      </div>
      <div className="card mb-4 p-6">
        <div className="font-semibold mb-2">Administrative Actions</div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={()=>assignAdmin(false)}>Assign Default Admin</button>
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={()=>assignAdmin(true)}>Reset Admin Password</button>
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={activate}>Activate</button>
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={suspend}>Suspend</button>
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={archive}>Archive</button>
        </div>
      </div>
      <div className="card mb-4 p-6 space-y-3">
        <div className="font-semibold">System Maintenance</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <div className="text-sm text-gray-600">Tenant restart</div>
            <select className="fc-input" value={String(maintenanceTenantId || '')} onChange={(e) => setMaintenanceTenantId(Number(e.target.value || '0'))}>
              <option value="">Select tenant</option>
              {maintenanceTenants.map((x) => (
                <option key={x.id} value={x.id}>{x.name} ({x.slug})</option>
              ))}
            </select>
            <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" disabled={restartWorking} onClick={() => requestRestart('TENANT')}>Restart Tenant</button>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-gray-600">Full system restart</div>
            <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" disabled={restartWorking} onClick={() => requestRestart('FULL')}>Restart Server</button>
            <div className="text-xs text-gray-600">Production requires `ENABLE_PROVIDER_RESTART=true`.</div>
          </div>
        </div>
        {restartOpId && (
          <div className="text-sm">
            <div>Operation: <span className="font-mono">{restartOpId}</span></div>
            <div>Status: {String(restartStatus?.status || 'pending')}</div>
          </div>
        )}
        {reauthModal.open && (
          <div className="border rounded p-4 bg-white dark:bg-gray-800 space-y-3">
            <div className="font-semibold text-sm">Re-authentication required</div>
            <label className="block">
              <span className="text-sm">Password</span>
              <input className="fc-input" type="password" value={reauthPassword} onChange={(e) => setReauthPassword(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm">Two-factor code {reauthNeedOtp ? '(required)' : '(optional)'}</span>
              <input className="fc-input" value={reauthOtp} onChange={(e) => setReauthOtp(e.target.value)} />
            </label>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={submitReauth}>Confirm</button>
              <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => setReauthModal({ open: false, action: null })}>Cancel</button>
            </div>
          </div>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm">Restart Logs</div>
            <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={loadMaintenanceLogs}>Refresh</button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Action</th>
                  <th className="p-2 text-left">Tenant</th>
                  <th className="p-2 text-left">At</th>
                </tr>
              </thead>
              <tbody>
                {maintenanceLogs.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{l.action}</td>
                    <td className="p-2">{l?.tenant?.name || l?.tenant?.slug || '—'}</td>
                    <td className="p-2">{l.timestamp ? new Date(l.timestamp).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="font-semibold mb-2">Branding</div>
          {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" className="h-12 mb-2" />}
          <label className="block mb-2">
            <span className="text-sm">Logo URL</span>
            <input className="fc-input" value={branding.logoUrl} onChange={e=>setBranding(v=>({ ...v, logoUrl: e.target.value }))} />
          </label>
          <label className="block mb-2">
            <span className="text-sm">Upload Logo</span>
            <input className="fc-input" type="file" accept="image/*" onChange={async (e)=>{
              const file = e.target.files?.[0];
              if (!file) return;
              setError(''); setInfo('');
              const form = new FormData(); form.append('logo', file);
              try {
                const res = await fetch(`/provider/tenants/${tid}/branding/logo`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('fc_token') || ''}` }, body: form });
                if (!res.ok) throw new Error('Upload failed');
                const data = await res.json();
                setBranding(v=>({ ...v, logoUrl: data.url })); setInfo('Logo uploaded');
              } catch (e: any) { setError(e?.message || 'Failed to upload logo'); }
            }} />
          </label>
          <label className="block mb-2">
            <span className="text-sm">Primary Color</span>
            <input className="fc-input" value={branding.primaryColor} onChange={e=>setBranding(v=>({ ...v, primaryColor: e.target.value }))} />
          </label>
          <button className="btn-primary" onClick={saveBranding}>Save Branding</button>
        </div>
        <div className="card p-6">
          <div className="font-semibold mb-2">Regional Settings</div>
          <label className="block mb-2"><span className="text-sm">Timezone</span>
            <select className="fc-input" value={regional.timezone} onChange={e=>setRegional(v=>({ ...v, timezone: e.target.value }))}>
              <option value="Africa/Nairobi">Africa/Nairobi</option>
              <option value="Africa/Lagos">Africa/Lagos</option>
              <option value="Africa/Johannesburg">Africa/Johannesburg</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <label className="block mb-2"><span className="text-sm">Currency</span>
            <select className="fc-input" value={regional.currency} onChange={e=>setRegional(v=>({ ...v, currency: e.target.value }))}>
              <option value="KES">KES</option>
              <option value="NGN">NGN</option>
              <option value="ZAR">ZAR</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <button className="btn-primary" onClick={saveRegional}>Save Regional</button>
        </div>
      </div>
      <div className="card mt-4 p-6">
        <div className="font-semibold mb-2">Feature Flags</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={features.members} onChange={e=>setFeatures(v=>({ ...v, members: e.target.checked }))} /><span>Members</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={features.finance} onChange={e=>setFeatures(v=>({ ...v, finance: e.target.checked }))} /><span>Finance</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={features.attendance} onChange={e=>setFeatures(v=>({ ...v, attendance: e.target.checked }))} /><span>Attendance</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={features.reports} onChange={e=>setFeatures(v=>({ ...v, reports: e.target.checked }))} /><span>Reports</span></label>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <button className="btn-primary" onClick={saveFeatures}>Save Feature Flags</button>
          <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={verifyConfig}>Verify Config</button>
        </div>
        {verified?.at && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-gray-600">Verified: {new Date(verified.at).toLocaleString()}</div>
            <pre className="text-xs p-2 border rounded overflow-auto">{JSON.stringify(verified.computedFeatures || {}, null, 2)}</pre>
          </div>
        )}
      </div>
      <div className="card mt-4 p-6">
        <div className="font-semibold mb-2">Audit Logs</div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="flex gap-2">
            <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={load}>Refresh</button>
            <button className="btn border hover:bg-gray-100 dark:hover:bg-gray-700" onClick={clearAuditLogs}>Clear</button>
          </div>
        </div>
        <div className="flex gap-2 mb-2">
          <input className="fc-input" placeholder="Search action" value={logQuery} onChange={e=>setLogQuery(e.target.value)} />
          <button className="btn-primary" onClick={searchLogs}>Search</button>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><th className="p-2 text-left">Action</th><th className="p-2 text-left">Entity</th><th className="p-2 text-left">At</th></tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (<tr key={i}><td className="p-2">{l.action}</td><td className="p-2">{l.entityType}</td><td className="p-2">{new Date(l.timestamp).toLocaleString()}</td></tr>))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card mb-4 p-6">
        <div className="font-semibold mb-2">Billing</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="block">
              <span className="text-sm">Plan</span>
              <select className="fc-input" value={billing.plan} onChange={e=>setBilling(v=>({ ...v, plan: e.target.value as any }))}>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm">Seats</span>
              <input className="fc-input" type="number" min="1" value={billing.seats} onChange={e=>setBilling(v=>({ ...v, seats: e.target.value }))} />
            </label>
            <label className="block">
              <span className="text-sm">Billing Period</span>
              <select className="fc-input" value={billing.period} onChange={e=>setBilling(v=>({ ...v, period: e.target.value as any }))}>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <div>
              <div className="text-sm text-gray-600">Calculated Price</div>
              <div className="text-lg font-semibold">{billing.pricePreview ? `$${billing.pricePreview}` : '—'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-600">Next Renewal</div>
              <div className="text-lg font-semibold">{billing.renewPreview || '—'}</div>
            </div>
            <label className="block">
              <span className="text-sm">Override Price (optional)</span>
              <input className="fc-input" type="number" value={billing.overridePrice} onChange={e=>setBilling(v=>({ ...v, overridePrice: e.target.value }))} />
            </label>
          </div>
        </div>
        <div className="mt-3">
          <button className="btn-primary" onClick={saveBilling}>Save Billing</button>
        </div>
      </div>
    </div>
  );
}
