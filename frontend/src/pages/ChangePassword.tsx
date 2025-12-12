import { useEffect, useState } from 'react';
import api from '../api/client';

interface UserItem { id: number; name: string; email: string; role: 'ADMIN'|'CLERK'|'PASTOR'|'MEMBER' }

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selfLoading, setSelfLoading] = useState(false);
  const [selfMsg, setSelfMsg] = useState<string| null>(null);

  const role = (localStorage.getItem('fc_role') || 'ADMIN') as UserItem['role'];

  const [users, setUsers] = useState<UserItem[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      if (!['ADMIN','CLERK'].includes(role)) return;
      try {
        const { data } = await api.get('/auth/users');
        setUsers(data || []);
      } catch { /* ignore */ }
    };
    loadUsers();
  }, [role]);

  const changeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSelfMsg(null);
    if (!currentPassword || !newPassword) { setSelfMsg('Enter current and new password'); return; }
    if (newPassword !== confirmPassword) { setSelfMsg('New passwords do not match'); return; }
    try {
      setSelfLoading(true);
      await api.patch('/auth/me/password', { currentPassword, newPassword });
      setSelfMsg('Password updated');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setSelfMsg(err?.response?.data?.message || 'Failed to update password');
    } finally {
      setSelfLoading(false);
      setTimeout(()=> setSelfMsg(null), 3000);
    }
  };

  const resetUserPassword = async () => {
    setAdminMsg(null);
    if (!selectedUserId || !adminNewPassword) { setAdminMsg('Select a user and enter a password'); return; }
    try {
      setAdminLoading(true);
      await api.patch(`/auth/users/${selectedUserId}/password`, { newPassword: adminNewPassword });
      setAdminMsg('Password reset for user');
      setSelectedUserId(''); setAdminNewPassword('');
    } catch (err: any) {
      setAdminMsg(err?.response?.data?.message || 'Failed to reset password');
    } finally {
      setAdminLoading(false);
      setTimeout(()=> setAdminMsg(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <nav className="text-sm text-gray-600">
        <a className="hover:underline" href="/dashboard">Dashboard</a>
        <span> / </span>
        <span>Change Password</span>
      </nav>

      <section className="p-4 bg-white dark:bg-gray-800 rounded shadow max-w-xl">
        <h3 className="font-semibold mb-2">Change Your Password</h3>
        {selfMsg && <div className="p-2 border rounded bg-green-50 text-green-700 mb-2">{selfMsg}</div>}
        <form onSubmit={changeOwnPassword} className="space-y-3">
          <label className="block">
            <span className="text-sm">Current Password</span>
            <input type="password" className="input" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm">New Password</span>
            <input type="password" className="input" value={newPassword} onChange={e=>setNewPassword(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm">Confirm New Password</span>
            <input type="password" className="input" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
          </label>
          <button className="btn-gold" type="submit" disabled={selfLoading}>{selfLoading ? 'Updating…' : 'Update Password'}</button>
        </form>
      </section>

      {['ADMIN','CLERK'].includes(role) && (
        <section className="p-4 bg-white dark:bg-gray-800 rounded shadow max-w-xl">
          <h3 className="font-semibold mb-2">Admin: Reset Any User Password</h3>
          {adminMsg && <div className="p-2 border rounded bg-green-50 text-green-700 mb-2">{adminMsg}</div>}
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm">Select User</span>
              <select className="input" value={selectedUserId} onChange={e=>setSelectedUserId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose user…</option>
                {users.map(u => (<option key={u.id} value={u.id}>{u.name} · {u.email} ({u.role})</option>))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm">New Password</span>
              <input type="password" className="input" value={adminNewPassword} onChange={e=>setAdminNewPassword(e.target.value)} />
            </label>
            <button className="btn-gold" onClick={resetUserPassword} disabled={adminLoading}>{adminLoading ? 'Resetting…' : 'Reset Password'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
