'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { Check, CircleAlert, KeyRound, RefreshCw, Server, ShieldCheck, Trash2, UserCog, UserPlus, UserRound, Users, X } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import { useLanguage } from '@/components/LanguageContext';

type ManagedUser = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  server_count: number;
};

export default function ManageUsersPage() {
  const { t, isVi } = useLanguage();
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
      setError(requestError instanceof Error ? requestError.message : t('Unable to load local users', 'Không thể tải danh sách người dùng'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        setIsAdmin(currentRole === 'admin' || currentRole === 'superadmin');
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
      setSuccessMsg(t(`User ${createEmail} created successfully.`, `Đã tạo người dùng ${createEmail} thành công.`));
      setCreateModalOpen(false);
      setCreateEmail('');
      setCreatePassword('');
      setCreateRole('operator');
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Failed to create user', 'Không thể tạo người dùng'));
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
      setSuccessMsg(t(`Role updated for ${editRoleUser.email}`, `Đã cập nhật vai trò cho ${editRoleUser.email}`));
      setEditRoleUser(null);
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Failed to update role', 'Không thể cập nhật vai trò'));
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
      setSuccessMsg(t(`Password reset successfully for ${resetPassUser.email}`, `Đã đặt lại mật khẩu thành công cho ${resetPassUser.email}`));
      setResetPassUser(null);
      setNewPassword('');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Failed to reset password', 'Không thể đặt lại mật khẩu'));
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
      setSuccessMsg(t(`User ${deleteTargetUser.email} deleted.`, `Đã xóa người dùng ${deleteTargetUser.email}.`));
      setDeleteTargetUser(null);
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : t('Failed to delete user', 'Không thể xóa người dùng'));
    } finally {
      setSubmitting(false);
    }
  };

  if (isAdmin == null) return <div className="p-10 text-center text-xs text-[var(--color-muted)] font-mono">{t('Checking access…', 'Đang kiểm tra quyền truy cập…')}</div>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-rose-500 mb-3" />
        <h1 className="text-base font-bold text-[var(--foreground)] mb-1.5">{t('Restricted workspace.', 'Không gian làm việc bị giới hạn.')}</h1>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">{t('Administrator access is required to view and manage team users.', 'Yêu cầu quyền Quản trị viên để xem và quản lý người dùng đội ngũ.')}</p>
      </div>
    );
  }

  const getRoleBadge = (role: string) => {
    const norm = role.toLowerCase();
    if (norm === 'admin' || norm === 'superadmin') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">{t('Admin', 'Quản trị viên')}</span>;
    }
    if (norm === 'viewer') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider border border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400">{t('Viewer', 'Người xem')}</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{t('Operator', 'Vận hành viên')}</span>;
  };

  return (
    <div className="space-y-5 pb-20">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-500 mb-1">{t('Administration', 'Quản trị')}</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">{t('Team & User Management', 'Quản lý Đội ngũ & Người dùng')}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchUsers()} className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] inline-flex items-center gap-1.5 transition duration-100" disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-500' : ''}`} /> {t('Refresh', 'Làm mới')}
          </button>
          <button type="button" onClick={() => { setCreateModalOpen(true); setModalError(''); }} className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white inline-flex items-center gap-1.5 transition duration-100">
            <UserPlus className="h-3.5 w-3.5" /> {t('Add User', 'Thêm Người dùng')}
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 flex items-center gap-2">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-3 bg-[var(--surface-2)]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">{t('Directory', 'Danh bạ')}</p>
            <h2 className="text-xs font-bold text-[var(--foreground)]">{users.length} {t('accounts', 'tài khoản')}</h2>
          </div>
          <Users className="h-4 w-4 text-blue-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-[11px] font-bold text-[var(--color-muted)] uppercase bg-[var(--surface-2)] border-b border-[var(--border-subtle)]">
              <tr>
                <th className="px-4 py-2.5">{t('User / Email', 'Người dùng / Email')}</th>
                <th className="px-4 py-2.5">{t('Role', 'Vai trò')}</th>
                <th className="px-4 py-2.5">{t('Owned Servers', 'Máy chủ sở hữu')}</th>
                <th className="px-4 py-2.5">{t('Created Date', 'Ngày tạo')}</th>
                <th className="px-4 py-2.5 text-right">{t('Actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-[var(--surface-2)] transition duration-100">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="h-7 w-7 rounded-sm bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                        <UserRound className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <strong className="block text-xs font-semibold text-[var(--foreground)]">{user.email}</strong>
                        <small className="font-mono text-[10px] text-[var(--color-muted)]">{user.id.slice(0, 8)}</small>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">{getRoleBadge(user.role)}</td>
                  <td className="px-4 py-3 font-mono tabular-nums">
                    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--foreground)] font-semibold">
                      <Server className="h-3.5 w-3.5 text-[var(--color-muted)]" />
                      {user.server_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-[var(--color-muted)] text-[11px]">
                    {new Date(user.created_at).toLocaleString(isVi ? 'vi-VN' : 'en-US')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        title={t('Edit Role', 'Sửa vai trò')}
                        onClick={() => {
                          setEditRoleUser(user);
                          setSelectedRole(user.role === 'superadmin' ? 'admin' : user.role);
                          setModalError('');
                        }}
                        className="h-7 px-2 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--foreground)] inline-flex items-center gap-1 transition duration-100"
                      >
                        <UserCog className="h-3 w-3" /> {t('Role', 'Vai trò')}
                      </button>
                      <button
                        type="button"
                        title={t('Reset Password', 'Đặt lại mật khẩu')}
                        onClick={() => {
                          setResetPassUser(user);
                          setNewPassword('');
                          setModalError('');
                        }}
                        className="h-7 px-2 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--foreground)] inline-flex items-center gap-1 transition duration-100"
                      >
                        <KeyRound className="h-3 w-3" /> {t('Password', 'Mật khẩu')}
                      </button>
                      <button
                        type="button"
                        title={t('Delete User', 'Xóa người dùng')}
                        onClick={() => {
                          setDeleteTargetUser(user);
                          setModalError('');
                        }}
                        className="h-7 w-7 rounded-sm border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50 flex items-center justify-center transition duration-100"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-xs text-[var(--color-muted)]">{t('No user accounts found.', 'Không tìm thấy tài khoản người dùng nào.')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* CREATE USER MODAL */}
      {createModalOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--surface-2)]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                <UserPlus className="h-4 w-4 text-blue-500" /> {t('Add New User', 'Thêm Người dùng Mới')}
              </h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--foreground)] p-1 rounded transition duration-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3.5 p-4">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-sm border border-rose-500/20">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Email Address', 'Địa chỉ Email')}
                </label>
                <input
                  type="email"
                  required
                  placeholder="operator@company.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Initial Password', 'Mật khẩu Khởi tạo')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={t('At least 6 characters', 'Tối thiểu 6 ký tự')}
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Assigned Role', 'Vai trò Phân công')}
                </label>
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                >
                  <option value="operator">{t('Operator (Standard operational access)', 'Vận hành viên (Quyền vận hành tiêu chuẩn)')}</option>
                  <option value="admin">{t('Admin (Full administrative control)', 'Quản trị viên (Toàn quyền quản trị)')}</option>
                  <option value="viewer">{t('Viewer (Read-only monitoring access)', 'Người xem (Chỉ đọc dữ liệu giám sát)')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setCreateModalOpen(false)} className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100">
                  {t('Cancel', 'Hủy')}
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition duration-100 disabled:opacity-50">
                  {submitting ? t('Creating…', 'Đang tạo…') : t('Create User', 'Tạo Người dùng')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ROLE MODAL */}
      {editRoleUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--surface-2)]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                <UserCog className="h-4 w-4 text-amber-500" /> {t('Edit Role:', 'Chỉnh sửa Vai trò:')} {editRoleUser.email}
              </h3>
              <button onClick={() => setEditRoleUser(null)} className="text-[var(--color-muted)] hover:text-[var(--foreground)] p-1 rounded transition duration-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateRole} className="space-y-3.5 p-4">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-sm border border-rose-500/20">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Select New Role', 'Chọn Vai trò Mới')}
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                >
                  <option value="admin">{t('Admin (Full administrative control)', 'Quản trị viên (Toàn quyền quản trị)')}</option>
                  <option value="operator">{t('Operator (Standard operational access)', 'Vận hành viên (Quyền vận hành tiêu chuẩn)')}</option>
                  <option value="viewer">{t('Viewer (Read-only monitoring access)', 'Người xem (Chỉ đọc dữ liệu giám sát)')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setEditRoleUser(null)} className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100">
                  {t('Cancel', 'Hủy')}
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition duration-100 disabled:opacity-50">
                  {submitting ? t('Saving…', 'Đang lưu…') : t('Update Role', 'Cập nhật Vai trò')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetPassUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-[var(--surface-2)]">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
                <KeyRound className="h-4 w-4 text-sky-500" /> {t('Reset Password:', 'Đặt lại Mật khẩu:')} {resetPassUser.email}
              </h3>
              <button onClick={() => setResetPassUser(null)} className="text-[var(--color-muted)] hover:text-[var(--foreground)] p-1 rounded transition duration-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-3.5 p-4">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-sm border border-rose-500/20">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('New Password', 'Mật khẩu Mới')}
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={t('At least 6 characters', 'Tối thiểu 6 ký tự')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setResetPassUser(null)} className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100">
                  {t('Cancel', 'Hủy')}
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition duration-100 disabled:opacity-50">
                  {submitting ? t('Updating…', 'Đang cập nhật…') : t('Save Password', 'Lưu Mật khẩu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE USER CONFIRM MODAL */}
      {deleteTargetUser && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-4 bg-rose-500/10">
              <h3 className="flex items-center gap-2 text-sm font-bold text-rose-500">
                <Trash2 className="h-4 w-4" /> {t('Confirm User Deletion', 'Xác nhận Xóa Người dùng')}
              </h3>
              <button onClick={() => setDeleteTargetUser(null)} className="text-[var(--color-muted)] hover:text-[var(--foreground)] p-1 rounded transition duration-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3.5 p-4">
              {modalError && (
                <div className="flex items-center gap-2 text-xs text-rose-500 bg-rose-500/10 p-2.5 rounded-sm border border-rose-500/20">
                  <CircleAlert className="h-4 w-4 shrink-0" /> {modalError}
                </div>
              )}
              <p className="text-xs text-[var(--foreground)] leading-relaxed">
                {t(
                  `Are you sure you want to permanently delete user account "${deleteTargetUser.email}"?`,
                  `Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản người dùng "${deleteTargetUser.email}" không?`
                )}
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setDeleteTargetUser(null)} className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100">
                  {t('Cancel', 'Hủy')}
                </button>
                <button type="button" onClick={handleDeleteUser} disabled={submitting} className="h-8 px-3.5 rounded-sm bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition duration-100 disabled:opacity-50">
                  {submitting ? t('Deleting…', 'Đang xóa…') : t('Delete Account', 'Xóa Tài khoản')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
