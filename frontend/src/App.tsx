import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, Link, useNavigate } from 'react-router-dom';
import HeaderBrandingTitle from './components/HeaderBrandingTitle';
import SidebarBrandingTitle from './components/SidebarBrandingTitle';
import SidebarImageManager from './components/SidebarImageManager';
import api from './api/client';
import { lazy, Suspense } from 'react';
import Login from './pages/Login';
import ProviderLogin from './pages/ProviderLogin';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import Members from './pages/Members';
import Announcements from './pages/Announcements';
import Attendance from './pages/Attendance';
import Finance from './pages/Finance';
import Events from './pages/Events';
import Ministries from './pages/Ministries';
import Sermons from './pages/Sermons';
import Minutes from './pages/Minutes';
import Reports from './pages/Reports';
import Councils from './pages/Councils';
import Committees from './pages/Committees';
import CouncilDetails from './pages/CouncilDetails';
import CommitteeDetails from './pages/CommitteeDetails';
// import DemographicsSummary from './components/DemographicsSummary';
import Demographics from './pages/Demographics';
import Programs from './pages/Programs';
import QRAdmin from './pages/QRAdmin';
import CellGroups from './pages/CellGroups';
import Suggestions from './pages/Suggestions';
import MinistryMembers from './pages/MinistryMembers';
import MinistryDelete from './pages/MinistryDelete';
import MinistryDetails from './pages/MinistryDetails';
import MemberDetails from './pages/MemberDetails';
import Settings from './pages/Settings';
import MemberQR from './pages/MemberQR';
import Signup from './pages/Signup';
import ChangePassword from './pages/ChangePassword';
import Tenants from './pages/Tenants';
import TenantManage from './pages/TenantManage';
import SMS from './pages/SMS';
const CommunionScan = lazy(() => import('./pages/CommunionScan'));

export function Layout({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('fc_dark') === '1');
  const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|'PROVIDER_ADMIN'|null);
  const [churchName, setChurchName] = useState<string>('FaithConnect');
  const [tenantList, setTenantList] = useState<Array<{ id: number; name: string; slug: string }>>([]);
  const [activeTenantId, setActiveTenantId] = useState<number | null>(() => {
    const tid = localStorage.getItem('fc_tenant_id');
    return tid ? Number(tid) : null;
  });
  const navigate = useNavigate();
  useEffect(() => {
    const cls = document.documentElement.classList;
    dark ? cls.add('dark') : cls.remove('dark');
    localStorage.setItem('fc_dark', dark ? '1' : '0');
  }, [dark]);
  useEffect(() => {
    (async () => {
      try {
        if (role && role !== 'PROVIDER_ADMIN') {
          const res = await api.get('/settings/info');
          setChurchName(res?.data?.name || 'FaithConnect');
        } else {
          setChurchName('FaithConnect');
        }
      } catch {
        // Ignore missing tenant context for provider admin
      }
    })();
  }, [role]);
  useEffect(() => {
    (async () => {
      if (role === 'PROVIDER_ADMIN') {
        try {
          const { data } = await api.get('/provider/tenants', { params: { pageSize: 100 } });
          setTenantList((data?.items || []).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug })));
        } catch {}
      }
    })();
  }, [role]);
  function setTenant(id: number | null) {
    setActiveTenantId(id);
    try {
      if (id) localStorage.setItem('fc_tenant_id', String(id)); else localStorage.removeItem('fc_tenant_id');
    } catch {}
    // Refresh to apply in-flight headers and content
    navigate(0);
  }
  return (
    <div className="h-full flex">
      <aside className="w-64 bg-faith-blue text-white p-4 hidden md:block transition-colors duration-300">
        <div className="mb-3">
          <SidebarImageManager role={role} />
        </div>
        <div className="mb-6"><SidebarBrandingTitle /></div>
        <nav className="space-y-2">
          <Link to="/dashboard" className="block hover:underline">Dashboard</Link>
          <Link to="/members" className="block hover:underline">Members</Link>
          {role && role !== 'MEMBER' && (<Link to="/attendance" className="block hover:underline">Attendance</Link>)}
          {role && role !== 'MEMBER' && (<Link to="/finance" className="block hover:underline">Finance</Link>)}
          <Link to="/events" className="block hover:underline">Events</Link>
          {/* Programs relocated under Events tab */}
          <Link to="/cell-groups" className="block hover:underline">Cell Groups</Link>
          <Link to="/departments" className="block hover:underline">Departments</Link>
          <Link to="/sermons" className="block hover:underline">Sermons</Link>
          <Link to="/announcements" className="block hover:underline">Announcements</Link>
          <Link to="/suggestions" className="block hover:underline">Suggestion Box</Link>
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/sms" className="block hover:underline">SMS</Link>)}
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/reports" className="block hover:underline">Reports</Link>)}
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/minutes" className="block hover:underline">Minutes</Link>)}
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/councils" className="block hover:underline">Councils</Link>)}
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/committees" className="block hover:underline">Committees</Link>)}
          {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (<Link to="/demographics" className="block hover:underline">Demographics</Link>)}
          <Link to="/settings" className="block hover:underline">Settings</Link>
          {role === 'ADMIN' && (<Link to="/qr-codes" className="block hover:underline">QR Codes</Link>)}
          {role === 'PROVIDER_ADMIN' && (<Link to="/provider/tenants" className="block hover:underline">Tenants</Link>)}
          {/* System Management and Change Password available via Settings panel */}
        </nav>
        <div className="mt-6 space-y-2">
          <button className="btn-gold w-full" onClick={() => setDark(!dark)}>{dark ? 'Light Mode' : 'Dark Mode'}</button>
          <button
            className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded"
            onClick={() => { localStorage.removeItem('fc_token'); window.location.href = '/login'; }}
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 bg-gray-50 dark:bg-gray-900 transition-colors duration-300">
        <header className="flex items-center justify-between px-4 py-2 border-b bg-white dark:bg-gray-800 transition-colors duration-300">
          <div className="flex items-center">
            <HeaderBrandingTitle />
          </div>
          <div className="flex items-center gap-2">
            {/* Top-right profile access for members */}
            {role === 'MEMBER' && (
              <button
                className="px-3 py-2 bg-faith-blue text-white rounded hover:bg-blue-700"
                onClick={() => navigate('/settings?tab=profile')}
              >
                My Profile
              </button>
            )}
            {/* Visual distinction for privileged users */}
            {role && role !== 'MEMBER' && role !== 'PROVIDER_ADMIN' && (
              <span className="px-2 py-1 text-xs rounded bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">Privileged</span>
            )}
            {role === 'PROVIDER_ADMIN' && (
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">Provider Admin</span>
                <select
                  className="px-2 py-1 text-xs rounded border dark:bg-gray-700"
                  value={activeTenantId ?? ''}
                  onChange={(e) => setTenant(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">No tenant selected</option>
                  {tenantList.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>
                  ))}
                </select>
              </div>
            )}
            {role && ['ADMIN','CLERK','PASTOR'].includes(role) && (
              <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">Tenant: {churchName}</span>
            )}
          </div>
        </header>
        <div className="p-4 transition-colors duration-300">
          {children}
        </div>
      </main>
      {/** Summary overlay removed; use dedicated page instead */}
    </div>
  );
}

function Protected({ children }: { children: JSX.Element }) {
  const token = localStorage.getItem('fc_token');
  if (!token) return <Navigate to="/login" replace />;
  // Local session expiration guard based on JWT exp
  try {
    const exp = Number(localStorage.getItem('fc_token_exp') || '0');
    if (exp && Math.floor(Date.now() / 1000) > exp) {
      localStorage.removeItem('fc_token');
      localStorage.removeItem('fc_token_exp');
      return <Navigate to="/login" replace />;
    }
  } catch {}
  return children;
}

export default function App() {
  function RoleRestricted({ allowed, children }: { allowed: Array<'ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|'PROVIDER_ADMIN'>; children: JSX.Element }) {
    const role = (typeof window !== 'undefined' ? localStorage.getItem('fc_role') : null) as ('ADMIN'|'CLERK'|'PASTOR'|'MEMBER'|'PROVIDER_ADMIN'|null);
    if (!role || !allowed.includes(role)) return <Navigate to="/dashboard" replace />;
    return children;
  }

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/provider/login" element={<ProviderLogin />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Protected><Layout><Dashboard /></Layout></Protected>} />
      <Route path="/members" element={<Protected><Layout><Members /></Layout></Protected>} />
      <Route path="/members/:id" element={<Protected><Layout><MemberDetails /></Layout></Protected>} />
      <Route path="/members/:id/details" element={<Protected><Layout><MemberDetails /></Layout></Protected>} />
      <Route path="/my-qr" element={<Protected><Layout><MemberQR /></Layout></Protected>} />
      <Route path="/communion-scan" element={<Protected><Layout><Suspense fallback={<div className="p-4">Loading scanner…</div>}><CommunionScan /></Suspense></Layout></Protected>} />
      <Route path="/attendance" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Attendance /></RoleRestricted></Layout></Protected>} />
      <Route path="/finance" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Finance /></RoleRestricted></Layout></Protected>} />
      <Route path="/events" element={<Protected><Layout><Events /></Layout></Protected>} />
      <Route path="/programs" element={<Protected><Layout><Programs /></Layout></Protected>} />
      <Route path="/qr-codes" element={<Protected><Layout><RoleRestricted allowed={['ADMIN']}><QRAdmin /></RoleRestricted></Layout></Protected>} />
      <Route path="/cell-groups" element={<Protected><Layout><CellGroups /></Layout></Protected>} />
      <Route path="/departments/cell-groups" element={<Navigate to="/cell-groups" replace />} />
      <Route path="/suggestions" element={<Protected><Layout><Suggestions /></Layout></Protected>} />
      <Route path="/departments" element={<Protected><Layout><Ministries /></Layout></Protected>} />
      <Route path="/departments/:id/details" element={<Protected><Layout><MinistryDetails /></Layout></Protected>} />
      <Route path="/departments/:id/members" element={<Protected><Layout><MinistryMembers /></Layout></Protected>} />
      <Route path="/departments/:id/delete" element={<Protected><Layout><MinistryDelete /></Layout></Protected>} />
      <Route path="/ministries" element={<Navigate to="/departments" replace />} />
      <Route path="/ministries/:id/*" element={<Navigate to="/departments" replace />} />
      <Route path="/sermons" element={<Protected><Layout><Sermons /></Layout></Protected>} />
      <Route path="/announcements" element={<Protected><Layout><Announcements /></Layout></Protected>} />
      <Route path="/sms" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><SMS /></RoleRestricted></Layout></Protected>} />
      <Route path="/minutes" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Minutes /></RoleRestricted></Layout></Protected>} />
      <Route path="/reports" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Reports /></RoleRestricted></Layout></Protected>} />
      <Route path="/councils" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Councils /></RoleRestricted></Layout></Protected>} />
      <Route path="/councils/:id" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><CouncilDetails /></RoleRestricted></Layout></Protected>} />
      <Route path="/committees" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Committees /></RoleRestricted></Layout></Protected>} />
      <Route path="/committees/:id" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><CommitteeDetails /></RoleRestricted></Layout></Protected>} />
      <Route path="/demographics" element={<Protected><Layout><RoleRestricted allowed={['ADMIN','CLERK','PASTOR']}><Demographics /></RoleRestricted></Layout></Protected>} />
      <Route path="/settings" element={<Protected><Layout><Settings /></Layout></Protected>} />
      <Route path="/account/password" element={<Protected><Layout><ChangePassword /></Layout></Protected>} />
      <Route path="/provider/tenants" element={<Protected><Layout><RoleRestricted allowed={['PROVIDER_ADMIN']}><Tenants /></RoleRestricted></Layout></Protected>} />
      <Route path="/provider/tenants/:id/manage" element={<Protected><Layout><RoleRestricted allowed={['PROVIDER_ADMIN']}><TenantManage /></RoleRestricted></Layout></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
