'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, KeyRound, Plus, RefreshCw, Server, ShieldCheck, Trash2, UserCog, UserPlus, UserRound, Users, X } from 'lucide-react';
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
  const [successMsg, setSuccessMsg] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editRoleUser, setEditRoleUser] = useState<ManagedUser | null>(null);
  const [resetPassUser, setResetPassUser] = useState<ManagedUser | null>(null);
  const [deleteTargetUser, setDeleteTargetUser] = useState<ManagedUser | null>(null);

  // Form states
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState('operator');

  const [selectedRole, setSelectedRole] = useState('operator');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

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

  useEffect(() => {
    const currentRole = getUserRole();
    if (currentRole === 'admin' || currentRole === 'superadmin') {
      setIsAdmin(true);
    }
    apiClient('/auth/me')
      .then((user) => {
        if (user && user.role) {
          setIsAdmin(user.role === 'admin' || user.role === 'superadmin');
        }
      })
      .catch(() => {
        if (isAdmin == null) {
          setIsAdmin(currentRole === 'admin' || currentRole === 'superadmin');
        }
      });
  }, []);

  useEffect(() => {
    if (isAdmin == null) return;
    if (isAdmin) void fetchUsers();
    else setLoading(false);
  }, [fetchUsers, isAdmin]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError('');
    try {
      await apiClient('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: createEmail,
          password: createPassword,
          role: createRole,
        }),
      });
      setSuccessMsg(`User ${createEmail} created successfully.`);
      setCreateModalOpen(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('operator');
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRoleUser) return;
    setSubmitting(true);
    setModalError('');
    try {
      await apiClient(`/admin/users/${editRoleUser.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: selectedRole }),
      });
      setSuccessMsg(`Role updated for ${editRoleUser.email}`);
      setEditRoleUser(null);
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser) return;
    setSubmitting(true);
    setModalError('');
    try {
      await apiClient(`/admin/users/${resetPassUser.id}/password`, {
        method: 'PUT',
        body: JSON.stringify({ password: newPassword }),
      });
      setSuccessMsg(`Password reset successfully for ${resetPassUser.email}`);
      setResetPassUser(null);
      setNewPassword('');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setSubmitting(true);
    setModalError('');
    try {
      await apiClient(`/admin/users/${deleteTargetUser.id}`, {
        method: 'DELETE',
      });
      setSuccessMsg(`User ${deleteTargetUser.email} deleted.`);
      setDeleteTargetUser(null);
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setSubmitting(false);
    }
  };

  if (isAdmin == null) return <div className="ops-panel p-10 text-center text-[var(--color-muted)]">Checking access…</div>;
  if (!isAdmin) {
    return (
      <div className="ops-panel mx-auto max-w-xl p-10 text-center">
        <ShieldCheck className="mx-auto h-9 w-9 text-[var(--rose)]" />
        <h1 className="mt-5">Restricted <em>workspace.</em></h1>
        <p className="mt-4 text-[var(--color-muted)]">Administrator access is required to view and manage team users.</p>
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    const norm = role.toLowerCase();
    if (norm === 'admin' || norm === 'superadmin') {
      return <span className="status-pill warning border border-amber-500/30 bg-amber-500/10 text-amber-300">Admin</span>;
    }
    if (norm === 'viewer') {
      return <span className="status-pill border border-sky-500/30 bg-sky-500/10 text-sky-300">Viewer</span>;
    }
    return <span className="status-pill good border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Operator</span>;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="panel-kicker">Administration</p>
          <h1>Team & <em>User Management.</em></h1>
          <p className="mt-3 text-[var(--color-muted)]">Manage accounts, assign roles (Admin, Operator, Viewer), and control workspace permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void fetchUsers()} className="ops-button secondary" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => { setCreateModalOpen(true); setModalError(''); }} className="ops-button primary">
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        </div>
      </header>

      {error && (
        <div className="monitoring-empty-notice"><CircleAlert className="h-4 w-4 text-rose-400" />{error}</div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
          <Check className="h-4 w-4" /> {successMsg}
        </div>
      )}

      <section className="ops-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] p-5">
          <div><p className="panel-kicker">Directory</p><h2 className="panel-title">{users.length} accounts</h2></div>
          <Users className="h-5 w-5 text-[var(--violet)]" />
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>User / Email</th>
                <th>Role</th>
                <th>Owned Servers</th>
                <th>Created Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="flex items-center gap-3">
                      <span className="metric-icon h-9 w-9">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span>
                        <strong className="block text-[var(--foreground)]">{user.email}</strong>
                        <small className="font-mono text-[var(--color-muted)]">{user.id.slice(0, 8)}</small>
                      </span>
                    </span>
                  </td>
                  <td>{getRoleBadge(user.role)}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <Server className="h-4 w-4 text-[var(--color-muted)]" />
                      {user.server_count}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleString('en-US')}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        title="Edit Role"
                        onClick={() => {
                          setEditRoleUser(user);
                          setSelectedRole(user.role === 'superadmin' ? 'admin' : user.role);
                          setModalError('');
                        }}
                        className="ops-button secondary text-xs"
                      >
                        <UserCog className="h-3.5 w-3.5" /> Role
                      </button>
                      <button
                        type="button"
                        title="Reset Password"
                        onClick={() => {
                          setResetPassUser(user);
                          setNewPassword('');
                          setModalError('');
                        }}
                        className="ops-button secondary text-xs"
                      >
                        <KeyRound className="h-3.5 w-3.5" /> Password
                      </button>
                      <button
                        type="button"
                        title="Delete User"
                        onClick={() => {
                          setDeleteTargetUser(user);
                          setModalError('');
                        }}
                        className="ops-button secondary text-xs text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-[var(--color-muted)]">No user accounts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE USER MODAL */}
      {createModalOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="ops-modal flex w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <UserPlus className="h-5 w-5 text-[var(--accent-primary)]" /> Add New User
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-[var(--color-muted)] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4 p-5">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/30">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="operator@company.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                  Initial Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                  Assigned Role
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="operator">Operator (Standard operational access)</option>
                  <option value="admin">Admin (Full administrative control)</option>
                  <option value="viewer">Viewer (Read-only monitoring access)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="ops-button secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="ops-button primary">
                  {submitting ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ROLE MODAL */}
      {editRoleUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="ops-modal flex w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <UserCog className="h-5 w-5 text-amber-400" /> Edit Role: {editRoleUser.email}
              </h3>
              <button onClick={() => setEditRoleUser(null)} className="text-[var(--color-muted)] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateRole} className="space-y-4 p-5">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/30">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                  Select New Role
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="admin">Admin (Full administrative control)</option>
                  <option value="operator">Operator (Standard operational access)</option>
                  <option value="viewer">Viewer (Read-only monitoring access)</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button type="button" onClick={() => setEditRoleUser(null)} className="ops-button secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="ops-button primary">
                  {submitting ? 'Saving…' : 'Update Role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPassUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="ops-modal flex w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <KeyRound className="h-5 w-5 text-sky-400" /> Reset Password: {resetPassUser.email}
              </h3>
              <button onClick={() => setResetPassUser(null)} className="text-[var(--color-muted)] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-4 p-5">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/30">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button type="button" onClick={() => setResetPassUser(null)} className="ops-button secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="ops-button primary">
                  {submitting ? 'Updating…' : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRM MODAL */}
      {deleteTargetUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="ops-modal flex w-full max-w-md flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/10 p-5 bg-rose-500/10">
              <h3 className="flex items-center gap-2 text-lg font-bold text-rose-400">
                <Trash2 className="h-5 w-5" /> Confirm User Deletion
              </h3>
              <button onClick={() => setDeleteTargetUser(null)} className="text-[var(--color-muted)] hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-500/10 p-3 rounded border border-rose-500/30">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <p className="text-sm text-[var(--foreground)]">
                Are you sure you want to permanently delete user account <strong className="text-rose-300">{deleteTargetUser.email}</strong>?
              </p>
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button type="button" onClick={() => setDeleteTargetUser(null)} className="ops-button secondary">
                  Cancel
                </button>
                <button type="button" onClick={handleDeleteUser} disabled={submitting} className="ops-button danger bg-rose-600 hover:bg-rose-500 text-white">
                  {submitting ? 'Deleting…' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
