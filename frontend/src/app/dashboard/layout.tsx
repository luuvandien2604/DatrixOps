'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Bell, BookOpen, Bot, CheckCheck, ChevronLeft, ChevronRight, CircleCheck,
  Command, FileText, Gauge, Globe2, KeyRound,
  Loader2, LogOut, Menu, Network, ScrollText, Search, Server,
  ShieldAlert, Sparkles, Users, X, Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import { editionLabel, getAppVersion } from '@/lib/edition';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CommandPalette } from '@/components/CommandPalette';
import { useLanguage } from '@/components/LanguageContext';
import { LanguageToggle } from '@/components/LanguageToggle';

type NavDefinition = {
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
};

type DashboardNotification = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  server_name?: string | null;
  read_at?: string | null;
  created_at: string;
};

type NotificationResponse = {
  items: DashboardNotification[];
  unread_count: number;
};

type UpdateCheckInfo = {
  current_version?: string;
  latest_version?: string;
  latest_agent_version?: string;
  update_available?: boolean;
  agent_update_available?: boolean;
  managed?: boolean;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t, isVi } = useLanguage();
  const pathname = usePathname();
  const router = useRouter();

  const primaryNavItems: NavDefinition[] = useMemo(() => [
    { label: t('Overview', 'Tổng quan'), href: '/dashboard', icon: Gauge },
    { label: t('Servers', 'Máy chủ'), href: '/dashboard/servers', icon: Server },
    { label: t('Network Quality', 'Chất lượng mạng'), href: '/dashboard/network', icon: Network },
    { label: t('Uptime', 'Website & SSL'), href: '/dashboard/websites', icon: Globe2 },
    { label: t('Metrics', 'Chỉ số đo đạc'), href: '/dashboard/monitoring', icon: Activity },
    { label: t('Alerts', 'Cảnh báo & Sự cố'), href: '/dashboard/alerts', icon: Bell },
    { label: t('Logs', 'Nhật ký logs'), href: '/dashboard/logs', icon: FileText },
  ], [t]);

  const adminNavItems: NavDefinition[] = useMemo(() => [
    { label: t('Team access', 'Thành viên & Quyền'), href: '/dashboard/manage/users', icon: Users },
    { label: t('Audit trail', 'Nhật ký hoạt động'), href: '/dashboard/manage/audit', icon: ScrollText },
    { label: t('API keys', 'Khóa API'), href: '/dashboard/manage/api', icon: KeyRound },
    { label: t('System settings', 'Cài đặt hệ thống'), href: '/dashboard/manage/settings', icon: Settings },
  ], [t]);

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState('user');
  const [userEmail, setUserEmail] = useState('');
  const [workspaceEdition, setWorkspaceEdition] = useState('community');
  const [systemVersion, setSystemVersion] = useState<string>(() => getAppVersion());
  const [fleetSummary, setFleetSummary] = useState<{
    total_servers: number;
    online_servers: number;
    open_incidents: number;
  } | null>(null);
  const [fleetSyncFailed, setFleetSyncFailed] = useState(false);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState('');
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  const [updateCheck, setUpdateCheck] = useState<UpdateCheckInfo | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    setRole(getUserRole());
    apiClient('/system/info')
      .then((info) => {
        if (typeof info?.edition === 'string') setWorkspaceEdition(info.edition);
        const ver = info?.control_plane?.version || info?.version;
        if (ver && ver !== 'dev') setSystemVersion(ver);
        if (info?.update_check) {
          setUpdateCheck(info.update_check);
        }
      })
      .catch(() => {});
    apiClient('/auth/me')
      .then((user) => {
        if (user) {
          if (user.role) setRole(user.role);
          if (user.username) setUserEmail(user.username);
          else if (user.email) setUserEmail(user.email);
        }
      })
      .catch(() => {
        // Fallback to JWT role if /auth/me fails
      });
  }, []);
  useEffect(() => {
    let active = true;
    let requestInFlight = false;

    const fetchFleetSummary = async () => {
      if (requestInFlight) return;
      requestInFlight = true;
      try {
        const overview = await apiClient('/dashboard/overview?range=1h');
        if (!active) return;
        setFleetSummary(overview.summary);
        setFleetSyncFailed(false);
      } catch {
        if (active) setFleetSyncFailed(true);
      } finally {
        requestInFlight = false;
      }
    };

    void fetchFleetSummary();
    const interval = window.setInterval(() => void fetchFleetSummary(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  // fetchNotifications đồng bộ danh sách và unread_count cho chuông thông báo.
  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const data = await apiClient('/alerts/notifications?limit=20') as NotificationResponse;
      setNotifications(Array.isArray(data?.items) ? data.items : []);
      setUnreadNotificationCount(Number(data?.unread_count) || 0);
      setNotificationError('');
    } catch (error) {
      if (!silent) {
        setNotificationError(error instanceof Error ? error.message : 'Unable to load notifications');
      }
    } finally {
      if (!silent) setNotificationsLoading(false);
    }
  }, []);

  // Poll 10 giây để badge tự cập nhật khi scheduler tạo alert notification mới.
  useEffect(() => {
    void fetchNotifications();
    const interval = window.setInterval(() => void fetchNotifications(true), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  // Đóng menu khi click ra ngoài hoặc nhấn Escape.
  useEffect(() => {
    if (!notificationsOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [notificationsOpen]);

  // markNotificationRead cập nhật một item và giảm badge ngay sau khi API thành công.
  const markNotificationRead = async (notificationID: string) => {
    const target = notifications.find((item) => item.id === notificationID);
    if (!target || target.read_at) return;

    try {
      await apiClient(`/alerts/notifications/${notificationID}/read`, { method: 'PATCH' });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) =>
        item.id === notificationID ? { ...item, read_at: readAt } : item,
      ));
      setUnreadNotificationCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to mark notification as read');
    }
  };

  // markAllNotificationsRead đánh dấu toàn bộ item chưa xem và ẩn badge.
  const markAllNotificationsRead = async () => {
    if (unreadNotificationCount === 0) return;
    try {
      await apiClient('/alerts/notifications/read-all', { method: 'POST' });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) =>
        item.read_at ? item : { ...item, read_at: readAt },
      ));
      setUnreadNotificationCount(0);
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to mark all notifications as read');
    }
  };

  const logout = () => {
    ['access_token', 'refresh_token'].forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    router.push('/');
  };

  const NavItem = ({ item }: { item: NavDefinition }) => {
    const active = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
        className={[
          'sidebar-nav-item',
          // Tăng độ rõ cho toàn bộ menu sidebar.
          'font-medium text-[var(--color-muted)]',
          active ? 'is-active font-semibold !text-[var(--foreground)]' : '',
          collapsed ? 'justify-center' : '',
        ].join(' ')}
      >
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${
            active ? 'text-[var(--foreground)]' : 'text-[var(--color-muted)]'
          }`}
        />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  };

  return (
    // Mọi màu chữ dùng CSS variable của theme. Không dùng text-white cố định,
    // vì text-white sẽ bị chìm khi người dùng chuyển sang giao diện sáng.
    <div className="app-shell min-h-screen text-[var(--foreground)]">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="mobile-nav-trigger fixed left-4 top-4 z-40 rounded-md p-3 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="ops-scrim mobile-nav-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        aria-label="Dashboard navigation"
        className={`shell-surface app-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      >
        <div className="flex h-20 items-center gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="brand-orbit">
              <Command className="h-4 w-4" />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="flex items-center">
                  <p className="truncate text-sm font-bold tracking-[0.16em] text-[var(--foreground)]">
                    DATRIX<span className="text-[var(--violet)]">OPS</span>
                  </p>
                </div>

                {/* Dòng phụ sáng hơn để không bị chìm trên nền tối. */}
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">
                  control plane
                </p>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="ml-auto text-[var(--foreground)] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3">
          <div className={`agent-pulse-card ${collapsed ? 'items-center px-2' : ''}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                  fleetSyncFailed
                    ? 'bg-[var(--amber)]'
                    : (fleetSummary?.online_servers ?? 0) > 0
                      ? 'bg-[var(--mint)]'
                      : 'bg-[var(--color-muted)]'
                }`}
              />
            </span>

            {!collapsed && (
              <div>
                <p className="text-xs font-semibold text-[var(--foreground)]">{t('Agent network', 'Mạng lưới Agent')}</p>
                <p className="text-[10px] font-medium text-[var(--color-muted)]">
                  {fleetSyncFailed
                    ? t('Live data unavailable', 'Mất đồng bộ dữ liệu')
                    : fleetSummary
                      ? `${fleetSummary.online_servers} / ${fleetSummary.total_servers} ${t('connected', 'kết nối')}`
                      : t('Syncing live status…', 'Đang đồng bộ…')}
                </p>
              </div>
            )}
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-5">
          <p
            className={`nav-eyebrow font-semibold text-[var(--color-muted)] ${
              collapsed ? 'text-center' : ''
            }`}
          >
            {collapsed ? '•' : t('Instance', 'Hệ thống')}
          </p>

          <div className="space-y-1">
            {primaryNavItems.map((item) => (
              <NavItem item={item} key={item.href} />
            ))}
          </div>

          {(role === 'admin' || role === 'superadmin') && (
            <>
              <p
                className={`nav-eyebrow mt-7 font-semibold text-[var(--color-muted)] ${
                  collapsed ? 'text-center' : ''
                }`}
              >
                {collapsed ? '•' : t('Admin', 'Quản trị')}
              </p>

              <div className="space-y-1">
                {adminNavItems.map((item) => (
                  <NavItem item={item} key={item.href} />
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border-color)] p-3">
          {!collapsed && (
            <div className="px-2 flex items-center justify-between text-[11px] font-mono text-[var(--color-muted)]">
              <span className="truncate">DatrixOps CE</span>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.05] text-blue-400 border border-white/10 font-bold">
                v{systemVersion}
              </span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-collapse hidden text-[var(--color-muted)] lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5" />
          )}
        </button>
      </aside>

      <div className={`dashboard-stage ${collapsed ? 'is-expanded' : ''}`}>
        <header className="shell-surface app-header">
          {/* Breadcrumb tăng độ rõ và weight. */}
          <div className="hidden items-center gap-2 text-xs font-medium text-[var(--color-muted)] md:flex">
            <span className="font-semibold text-[var(--foreground)]">{editionLabel(workspaceEdition)}</span>
            <span className="text-[var(--color-muted)]">/</span>
            <span className="text-[var(--color-muted)]">Production</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <ThemeToggle />

            {(() => {
              const serverUpdateAvailable = Boolean(updateCheck?.update_available);
              const agentUpdateAvailable = Boolean(updateCheck?.agent_update_available);
              const hasUpdateNotification = serverUpdateAvailable || agentUpdateAvailable;
              const updateCount = (serverUpdateAvailable ? 1 : 0) + (agentUpdateAvailable ? 1 : 0);
              const totalUnreadBadge = unreadNotificationCount + updateCount;

              return (
                <div ref={notificationMenuRef} className="relative">
                  <button
                    type="button"
                    aria-label={
                      totalUnreadBadge > 0
                        ? `${t('Open notifications', 'Mở thông báo')}, ${totalUnreadBadge} ${t('unread', 'chưa đọc')}`
                        : t('Open notifications', 'Mở thông báo')
                    }
                    aria-expanded={notificationsOpen}
                    onClick={() => {
                      setNotificationsOpen((current) => !current);
                      if (!notificationsOpen) void fetchNotifications();
                    }}
                    className="topbar-icon relative text-[var(--color-muted)] hover:text-[var(--foreground)]"
                  >
                    <Bell className="h-4 w-4" />
                    {totalUnreadBadge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--rose)] px-1 text-[9px] font-mono font-extrabold leading-none text-white shadow-sm">
                        {totalUnreadBadge > 99 ? '99+' : totalUnreadBadge}
                      </span>
                    )}
                  </button>

                  {notificationsOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--foreground)] shadow-lg animate-in fade-in">
                      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3 bg-[var(--surface-2)]">
                        <div>
                          <p className="text-sm font-bold text-[var(--foreground)]">{t('Notifications', 'Thông báo')}</p>
                          <p className="font-mono text-[11px] text-[var(--color-muted)]">
                            {totalUnreadBadge} {t('unread', 'chưa đọc')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void markAllNotificationsRead()}
                          disabled={unreadNotificationCount === 0}
                          className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          {t('Mark all as read', 'Đánh dấu đã đọc')}
                        </button>
                      </div>

                      <div className="custom-scrollbar max-h-[26rem] overflow-y-auto">
                        {/* Server Update notification (no action buttons) */}
                        {serverUpdateAvailable && (
                          <div className="flex gap-3 border-b border-[var(--border-color)] px-4 py-3 bg-blue-500/[0.08]">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-blue-500/20 text-blue-400">
                              <Sparkles className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 truncate text-xs font-bold text-[var(--foreground)]">
                                  {t('Server Update available', 'Bản cập nhật Server')} v{updateCheck?.latest_version}
                                </p>
                                <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-400 uppercase tracking-wide">
                                  Server
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--color-muted)]">
                                {t('New DatrixOps Server version available', 'Đã có phiên bản DatrixOps Server mới')} (v{systemVersion || updateCheck?.current_version}).
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Agent Update notification (no action buttons) */}
                        {agentUpdateAvailable && (
                          <div className="flex gap-3 border-b border-[var(--border-color)] px-4 py-3 bg-indigo-500/[0.08]">
                            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-indigo-500/20 text-indigo-400">
                              <Bot className="h-3.5 w-3.5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="min-w-0 truncate text-xs font-bold text-[var(--foreground)]">
                                  {t('Agent Update available', 'Bản cập nhật Agent')} v{updateCheck?.latest_agent_version}
                                </p>
                                <span className="shrink-0 rounded bg-indigo-500/20 px-1.5 py-0.5 text-[9px] font-mono font-bold text-indigo-400 uppercase tracking-wide">
                                  Agent
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--color-muted)]">
                                {t('New Datrix Agent version available for monitored servers.', 'Đã có phiên bản Datrix Agent mới cho các máy chủ giám sát.')}
                              </p>
                            </div>
                          </div>
                        )}

                        {notificationsLoading ? (
                          <div className="flex items-center justify-center px-4 py-10 text-xs text-[var(--color-muted)]">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--accent-primary)]" /> {t('Loading notifications…', 'Đang tải thông báo…')}
                          </div>
                        ) : notificationError && notifications.length === 0 && !hasUpdateNotification ? (
                          <div className="px-4 py-8 text-center text-xs text-[var(--rose)]">
                            {t('Unable to load notifications.', 'Không thể tải thông báo.')}
                          </div>
                        ) : notifications.length === 0 && !hasUpdateNotification ? (
                          <div className="px-4 py-10 text-center">
                            <Bell className="mx-auto mb-2 h-6 w-6 text-[var(--color-muted)] opacity-40" />
                            <p className="text-xs font-semibold text-[var(--foreground)]">{t('No notifications yet', 'Không có thông báo mới')}</p>
                            <p className="mt-1 text-[11px] text-[var(--color-muted)]">{t('Alert events will appear here.', 'Các sự kiện cảnh báo sẽ hiển thị ở đây.')}</p>
                          </div>
                        ) : (
                          notifications.map((notification) => {
                            const unread = !notification.read_at;
                            const resolved = notification.severity === 'resolved';
                            return (
                              <div
                                key={notification.id}
                                className={`flex gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0 ${
                                  unread ? 'bg-[var(--accent-subtle)]' : 'bg-transparent'
                                }`}
                              >
                                <div
                                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded"
                                  style={{
                                    background: resolved ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                    color: resolved ? 'var(--mint)' : 'var(--rose)',
                                  }}
                                >
                                  {resolved ? <CircleCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                                </div>

                                <Link
                                  href="/dashboard/alerts"
                                  onClick={() => {
                                    setNotificationsOpen(false);
                                    if (unread) void markNotificationRead(notification.id);
                                  }}
                                  className="min-w-0 flex-1"
                                >
                                  <div className="flex items-start gap-2">
                                    <p className={`min-w-0 flex-1 truncate text-xs text-[var(--foreground)] ${unread ? 'font-bold' : 'font-semibold'}`}>
                                      {notification.title}
                                    </p>
                                    {unread && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" />}
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
                                    {notification.message}
                                  </p>
                                  <p className="mt-1 font-mono text-[10px] text-[var(--color-muted)]">
                                    {formatNotificationTime(notification.created_at, isVi)}
                                  </p>
                                </Link>

                                {unread && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      void markNotificationRead(notification.id);
                                    }}
                                    title={t('Mark as read', 'Đánh dấu đã đọc')}
                                    aria-label={`Mark ${notification.title} as read`}
                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--color-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-emerald-500"
                                  >
                                    <CircleCheck className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      <Link
                        href="/dashboard/alerts"
                        onClick={() => setNotificationsOpen(false)}
                        className="block border-t border-[var(--border-color)] px-4 py-2.5 text-center text-xs font-semibold text-[var(--accent-primary)] hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        {t('Open alert settings', 'Mở cấu hình cảnh báo')}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* User Profile Avatar with Technical Popover Menu */}
            <div ref={userMenuRef} className="relative ml-1">
              <button
                type="button"
                aria-label="User profile menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] text-xs font-mono font-bold transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)] focus:outline-none"
                title={userEmail || 'User profile'}
              >
                {role === 'admin' || role === 'superadmin' ? 'AD' : role === 'viewer' ? 'VW' : 'OP'}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-60 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-1 text-[var(--foreground)] shadow-lg animate-in fade-in">
                  <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[var(--border-color)] mb-1">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[var(--accent-primary)] text-white text-xs font-mono font-bold">
                      {role === 'admin' || role === 'superadmin' ? 'AD' : role === 'viewer' ? 'VW' : 'OP'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-[var(--foreground)] truncate" title={userEmail}>
                        {userEmail || (role === 'admin' || role === 'superadmin' ? 'Administrator' : 'Operator')}
                      </p>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="text-[10px] font-mono text-[var(--color-muted)] truncate">
                          {userEmail?.includes('@') ? userEmail.split('@')[0] : (userEmail || 'admin')}
                        </span>
                        <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-blue-400 uppercase">
                          {role || 'admin'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Menu Items */}
                  <Link
                    href="/docs"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" />
                    <span>{t('Documentation', 'Tài liệu hướng dẫn')}</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      setCommandPaletteOpen(true);
                    }}
                    className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted)]" />
                      <span>{t('Quick search', 'Tìm kiếm nhanh')}</span>
                    </div>
                    <kbd className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[var(--surface-2)] text-[var(--color-muted)] border border-[var(--border-subtle)]">⌘ K</kbd>
                  </button>

                  <div className="my-1 border-t border-[var(--border-color)]" />

                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--rose)] hover:bg-[var(--rose)]/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5 shrink-0 text-[var(--rose)]" />
                    <span>{t('Sign out', 'Đăng xuất')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main
          id="main-content"
          className="relative min-h-[calc(100vh-72px)] px-4 pb-12 pt-7 sm:px-6 xl:px-10"
        >
          {children}
        </main>
      </div>
      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}

// formatNotificationTime hiển thị thời gian tương đối ngắn trong dropdown.
function formatNotificationTime(value: string, isVi = false): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(isVi ? 'vi' : 'en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
