'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Bell, BookOpen, CheckCheck, ChevronLeft, ChevronRight, CircleCheck,
  CircleUserRound, Command, DatabaseBackup, FileText, Gauge, Globe2, KeyRound,
  Loader2, LogOut, Menu, ScrollText, Search, Server, ServerCog, Settings2,
  ShieldAlert, ShieldCheck, SlidersHorizontal, Users, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import { ThemeToggle } from '@/components/ThemeToggle';

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

const primaryNav: NavDefinition[] = [
  { label: 'Overview', href: '/dashboard', icon: Gauge },
  { label: 'Servers', href: '/dashboard/servers', icon: Server },
  { label: 'Uptime', href: '/dashboard/websites', icon: Globe2 },
  { label: 'Metrics', href: '/dashboard/monitoring', icon: Activity },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell },
  { label: 'Logs', href: '/dashboard/logs', icon: FileText },
];

const observeNav: NavDefinition[] = [
  { label: 'Performance', href: '/dashboard/performance', icon: Zap },
  { label: 'Network', href: '/dashboard/network', icon: SlidersHorizontal },
  { label: 'Security', href: '/dashboard/security', icon: ShieldCheck },
];

const adminNav: NavDefinition[] = [
  { label: 'Fleet admin', href: '/dashboard/manage/servers', icon: ServerCog },
  { label: 'Team access', href: '/dashboard/manage/users', icon: Users },
  { label: 'System config', href: '/dashboard/manage/config', icon: Settings2 },
  { label: 'Backups', href: '/dashboard/manage/backup', icon: DatabaseBackup },
  { label: 'Audit trail', href: '/dashboard/manage/audit', icon: ScrollText },
  { label: 'API keys', href: '/dashboard/manage/api', icon: KeyRound },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [role, setRole] = useState('user');
  const [fleetSummary, setFleetSummary] = useState<{
    total_servers: number;
    online_servers: number;
    open_incidents: number;
  } | null>(null);
  const [fleetSyncFailed, setFleetSyncFailed] = useState(false);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<DashboardNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationError, setNotificationError] = useState('');
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setRole(getUserRole()), []);
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
    const interval = window.setInterval(() => void fetchFleetSummary(), 10_000);
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
    const interval = window.setInterval(() => void fetchNotifications(true), 10_000);
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
    const count = item.href === '/dashboard/alerts' ? fleetSummary?.open_incidents : item.count;
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
        className={[
          'liquid-nav-item',
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
        {!collapsed && Boolean(count) && <span className="nav-alert-count">{count}</span>}
      </Link>
    );
  };

  return (
    // Mọi màu chữ dùng CSS variable của theme. Không dùng text-white cố định,
    // vì text-white sẽ bị chìm khi người dùng chuyển sang giao diện sáng.
    <div className="liquid-shell min-h-screen text-[var(--foreground)]">
      <div className="liquid-aurora" aria-hidden="true" />

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="mobile-nav-trigger fixed left-4 top-4 z-40 rounded-full p-3 backdrop-blur-xl lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="mobile-nav-overlay fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      <aside
        aria-label="Dashboard navigation"
        className={`liquid-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
      >
        <div className="flex h-20 items-center gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="brand-orbit">
              <Command className="h-4 w-4" />
            </div>

            {!collapsed && (
              <div className="min-w-0">
                {/* Logo chính rõ và dày hơn. */}
                <p className="truncate text-sm font-bold tracking-[0.16em] text-[var(--foreground)]">
                  DATRIX<span className="text-[var(--violet)]">OPS</span>
                </p>

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
              {!fleetSyncFailed && (fleetSummary?.online_servers ?? 0) > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--mint)] opacity-50" />
              )}
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
                {/* Tên card đậm hơn. */}
                <p className="text-xs font-semibold text-[var(--foreground)]">Agent network</p>

                {/* Thông tin trạng thái tăng contrast. */}
                <p className="text-[10px] font-medium text-[var(--color-muted)]">
                  {fleetSyncFailed
                    ? 'Live data unavailable'
                    : fleetSummary
                      ? `${fleetSummary.online_servers} / ${fleetSummary.total_servers} connected`
                      : 'Syncing live status…'}
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
            {collapsed ? '•' : 'Workspace'}
          </p>

          <div className="space-y-1">
            {primaryNav.map((item) => (
              <NavItem item={item} key={item.href} />
            ))}
          </div>

          <p
            className={`nav-eyebrow mt-7 font-semibold text-[var(--color-muted)] ${
              collapsed ? 'text-center' : ''
            }`}
          >
            {collapsed ? '•' : 'Observe'}
          </p>

          <div className="space-y-1">
            {observeNav.map((item) => (
              <NavItem item={item} key={item.href} />
            ))}
          </div>

          {role === 'superadmin' && (
            <>
              <p
                className={`nav-eyebrow mt-7 font-semibold text-[var(--color-muted)] ${
                  collapsed ? 'text-center' : ''
                }`}
              >
                {collapsed ? '•' : 'Admin'}
              </p>

              <div className="space-y-1">
                {adminNav.map((item) => (
                  <NavItem item={item} key={item.href} />
                ))}
              </div>
            </>
          )}
        </nav>

        <div className="border-t border-[var(--border-color)] p-3">
          <Link
            href="/docs"
            className={`liquid-nav-item font-medium text-[var(--color-muted)] ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <BookOpen className="h-[18px] w-[18px] text-[var(--color-muted)]" />
            {!collapsed && <span>Documentation</span>}
          </Link>

          <Link
            href="/dashboard/settings"
            className={`liquid-nav-item font-medium text-[var(--color-muted)] ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <CircleUserRound className="h-[18px] w-[18px] text-[var(--color-muted)]" />
            {!collapsed && <span>Workspace settings</span>}
          </Link>

          <button
            type="button"
            onClick={logout}
            className={`liquid-nav-item w-full font-medium text-[var(--color-muted)] ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            <LogOut className="h-[18px] w-[18px] text-[var(--color-muted)]" />
            {!collapsed && <span>Sign out</span>}
          </button>
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
        <header className="liquid-topbar">
          {/* Breadcrumb tăng độ rõ và weight. */}
          <div className="hidden items-center gap-2 text-xs font-medium text-[var(--color-muted)] md:flex">
            <span className="font-semibold text-[var(--foreground)]">Datrix Cloud</span>
            <span className="text-[var(--color-muted)]">/</span>
            <span className="text-[var(--color-muted)]">Production</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="topbar-action hidden font-medium text-[var(--color-muted)] sm:flex"
              aria-label="Search dashboard"
            >
              <Search className="h-4 w-4 text-[var(--color-muted)]" />
              <span>Search</span>
              <kbd className="text-[var(--color-muted)]">⌘ K</kbd>
            </button>

            <ThemeToggle />

            <div ref={notificationMenuRef} className="relative">
              <button
                type="button"
                aria-label={
                  unreadNotificationCount > 0
                    ? `Open notifications, ${unreadNotificationCount} unread`
                    : 'Open notifications'
                }
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  if (!notificationsOpen) void fetchNotifications();
                }}
                className="topbar-icon relative text-[var(--color-muted)]"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--rose)] px-1 text-[9px] font-extrabold leading-none text-white shadow-sm">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--surface-raised)] shadow-2xl">
                  <div className="flex items-center justify-between gap-3 border-b border-[var(--border-color)] px-4 py-3">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">Notifications</p>
                      <p className="text-[11px] font-medium text-[var(--color-muted)]">
                        {unreadNotificationCount} unread
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void markAllNotificationsRead()}
                      disabled={unreadNotificationCount === 0}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-[var(--violet-strong)] transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all as read
                    </button>
                  </div>

                  <div className="custom-scrollbar max-h-[26rem] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="flex items-center justify-center px-4 py-10 text-sm text-[var(--color-muted)]">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notifications…
                      </div>
                    ) : notificationError && notifications.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-[var(--rose)]">
                        Unable to load notifications.
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="px-4 py-10 text-center">
                        <Bell className="mx-auto mb-3 h-7 w-7 text-[var(--color-muted)] opacity-50" />
                        <p className="text-sm font-semibold text-[var(--foreground)]">No notifications yet</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">Alert events will appear here.</p>
                      </div>
                    ) : (
                      notifications.map((notification) => {
                        const unread = !notification.read_at;
                        const resolved = notification.severity === 'resolved';
                        return (
                          <div
                            key={notification.id}
                            className={`flex gap-3 border-b border-[var(--border-color)] px-4 py-3 last:border-b-0 ${
                              unread ? 'bg-[var(--violet-wash)]' : 'bg-transparent'
                            }`}
                          >
                            <div
                              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                              style={{
                                background: resolved ? 'var(--mint-wash)' : 'rgba(194, 62, 89, 0.12)',
                                color: resolved ? 'var(--mint)' : 'var(--rose)',
                              }}
                            >
                              {resolved ? <CircleCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
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
                                <p className={`min-w-0 flex-1 truncate text-sm text-[var(--foreground)] ${unread ? 'font-bold' : 'font-semibold'}`}>
                                  {notification.title}
                                </p>
                                {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--violet-strong)]" />}
                              </div>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--color-muted)]">
                                {notification.message}
                              </p>
                              <p className="mt-1.5 text-[10px] font-semibold text-[var(--color-muted)]">
                                {formatNotificationTime(notification.created_at)}
                              </p>
                            </Link>

                            {unread && (
                              <button
                                type="button"
                                onClick={() => void markNotificationRead(notification.id)}
                                title="Mark as read"
                                aria-label={`Mark ${notification.title} as read`}
                                className="mt-0.5 h-8 w-8 shrink-0 rounded-full text-[var(--color-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                              >
                                <CircleCheck className="mx-auto h-4 w-4" />
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
                    className="block border-t border-[var(--border-color)] px-4 py-3 text-center text-xs font-bold text-[var(--violet-strong)] hover:bg-[var(--surface-hover)]"
                  >
                    Open alert settings
                  </Link>
                </div>
              )}
            </div>

            <div className="ml-1 flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--background-card)] py-1.5 pl-1.5 pr-3">
              <div className="operator-avatar">
                {role === 'superadmin' ? 'SA' : 'OP'}
              </div>

              <div className="hidden sm:block">
                {/* Tên người dùng rõ hơn. */}
                <p className="text-[11px] font-semibold text-[var(--foreground)]">
                  {role === 'superadmin' ? 'Superadmin' : 'Operator'}
                </p>

                {/* Trạng thái đăng nhập tăng nhẹ weight. */}
                <p className="text-[9px] font-medium text-[var(--mint)]">
                  ● Authenticated
                </p>
              </div>
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
    </div>
  );
}

// formatNotificationTime hiển thị thời gian tương đối ngắn trong dropdown.
function formatNotificationTime(value: string): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';

  const seconds = Math.round((timestamp - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
