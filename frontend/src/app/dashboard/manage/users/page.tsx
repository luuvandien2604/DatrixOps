'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, RefreshCw, Server, ShieldCheck, UserRound, Users } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';

type ManagedUser = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  server_count: number;
};

export default function ManageUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient('/admin/users');
      setUsers(Array.isArray(data) ? data : []);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to load workspace users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => setIsSuperadmin(getUserRole() === 'superadmin'), []);
  useEffect(() => {
    if (isSuperadmin == null) return;
    if (isSuperadmin) void fetchUsers();
    else setLoading(false);
  }, [fetchUsers, isSuperadmin]);

  if (isSuperadmin == null) return <div className="glass-card p-10 text-center text-[var(--color-muted)]">Checking access…</div>;
  if (!isSuperadmin) {
    return (
      <div className="glass-card mx-auto max-w-xl p-10 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-[var(--rose)]" />
        <h1 className="mt-5">Restricted <em>workspace.</em></h1>
        <p className="mt-4 text-[var(--color-muted)]">Superadmin access is required to view tenant and operator information.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="panel-kicker">Administration</p>
          <h1>Team <em>access.</em></h1>
          <p className="mt-3 text-[var(--color-muted)]">A live, read-only inventory of users, roles, and owned infrastructure.</p>
        </div>
        <button type="button" onClick={() => void fetchUsers()} className="liquid-button secondary" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      {error && (
        <div className="monitoring-empty-notice"><CircleAlert className="h-4 w-4" />{error}</div>
      )}

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] p-5">
          <div><p className="panel-kicker">Directory</p><h2 className="panel-title">{users.length} operators</h2></div>
          <Users className="h-5 w-5 text-[var(--violet)]" />
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Operator</th><th>Role</th><th>Servers</th><th>Created</th></tr></thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><span className="flex items-center gap-3"><span className="metric-icon h-9 w-9"><UserRound className="h-4 w-4" /></span><span><strong className="block text-[var(--foreground)]">{user.email}</strong><small className="font-mono text-[var(--color-muted)]">{user.id.slice(0, 8)}</small></span></span></td>
                  <td><span className={`status-pill ${user.role === 'superadmin' ? 'warning' : 'good'}`}>{user.role}</span></td>
                  <td><span className="inline-flex items-center gap-2"><Server className="h-4 w-4 text-[var(--color-muted)]" />{user.server_count}</span></td>
                  <td>{new Date(user.created_at).toLocaleString('en-US')}</td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td colSpan={4} className="py-12 text-center">No users found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
