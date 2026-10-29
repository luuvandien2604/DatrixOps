'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type NavDefinition = {
  label: string;
  href: string;
  icon: LucideIcon;
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

const primaryNav: NavDefinition[] = [
  { label: 'Overview', href: '/dashboard', icon: Gauge },
  { label: 'Servers', href: '/dashboard/servers', icon: Server },
  { label: 'Network Quality', href: '/dashboard/network', icon: Network },
  { label: 'Uptime', href: '/dashboard/websites', icon: Globe2 },
  { label: 'Metrics', href: '/dashboard/monitoring', icon: Activity },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell },
  { label: 'Logs', href: '/dashboard/logs', icon: FileText },
];

const adminNav: NavDefinition[] = [
  { label: 'Team access', href: '/dashboard/manage/users', icon: Users },
  { label: 'Audit trail', href: '/dashboard/manage/audit', icon: ScrollText },
  { label: 'API keys', href: '/dashboard/manage/api', icon: KeyRound },
  { label: 'System settings', href: '/dashboard/manage/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
        setCommandPaletteOpen((prev) => !prev);
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
      .catch(() => {});
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

  const fetchNotifications = useCallback(async (silent = false) => {
    if (!silent) setNotificationsLoading(true);
    try {
      const data = (await apiClient('/alerts/notifications?limit=20')) as NotificationResponse;
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

  useEffect(() => {
    void fetchNotifications();
    const interval = window.setInterval(() => void fetchNotifications(true), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

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

  const markNotificationRead = async (notificationID: string) => {
    const target = notifications.find((item) => item.id === notificationID);
    if (!target || target.read_at) return;

    try {
      await apiClient(`/alerts/notifications/${notificationID}/read`, { method: 'PATCH' });
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.id === notificationID ? { ...item, read_at: readAt } : item)),
      );
      setUnreadNotificationCount((current) => Math.max(0, current - 1));
    } catch (error) {
      setNotificationError(error instanceof Error ? error.message : 'Unable to mark notification as read');
    }
  };

  const markAllNotificationsRead = async () => {
    if (unreadNotificationCount === 0) return;
    try {
      await apiClient('/alerts/notifications/read-all', { method: 'POST' });
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
      );
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
        title={item.label}
        aria-current={active ? 'page' : undefined}
        onClick={() => setMobileOpen(false)}
        className={`group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-xs font-medium transition-colors ${
          active
            ? 'bg-[var(--surface-selected)] text-[var(--text-primary)] font-semibold shadow-xs'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
        } ${collapsed ? 'justify-center px-0' : ''}`}
      >
        {/* Precision 1px active indicator bar on left edge */}
        {active && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--accent-primary)]" />
        )}
        <Icon
          className={`h-4 w-4 shrink-0 transition-colors ${
            active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
          }`}
        />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--background-root)] text-[var(--text-primary)] flex">
      {/* Mobile nav trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-40 rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation"
        />
      )}

      {/* Modern High-Precision Shell Sidebar */}
      <aside
        aria-label="Dashboard navigation"
        className={`fixed top-0 bottom-0 left-0 z-50 flex flex-col border-r border-[var(--border-subtle)] bg-[var(--background-sidebar)] transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Header / Brand Monogram */}
        <div className={`flex h-14 items-center border-b border-[var(--border-subtle)] px-3.5 ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--surface-3)] border border-[var(--border-default)] text-[var(--accent-primary)] shadow-xs">
              <Command className="h-4 w-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <span className="font-mono text-sm font-bold tracking-wider text-[var(--text-primary)]">
                  DATRIX<span className="text-[var(--accent-primary)]">OPS</span>
                </span>
                <div className="text-[10px] font-mono tracking-widest text-[var(--text-tertiary)] uppercase leading-none">
                  Control Plane
                </div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Pulse Ticker */}
        <div className="p-2 border-b border-[var(--border-subtle)]">
          <div
            className={`flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 ${
              collapsed ? 'justify-center' : 'gap-2.5'
            }`}
            title={
              fleetSyncFailed
                ? 'Telemetry offline'
                : fleetSummary
                ? `${fleetSummary.online_servers}/${fleetSummary.total_servers} nodes online`
                : 'Telemetry syncing'
            }
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                fleetSyncFailed
                  ? 'bg-[var(--status-warning)]'
                  : (fleetSummary?.online_servers ?? 0) > 0
                  ? 'bg-[var(--status-healthy)] animate-pulse'
                  : 'bg-[var(--text-tertiary)]'
              }`}
            />
            {!collapsed && (
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--text-primary)]">Agent Network</span>
                  <span className="font-mono text-[11px] font-semibold text-[var(--status-healthy)]">
                    {fleetSummary ? `${fleetSummary.online_servers}/${fleetSummary.total_servers}` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4 custom-scrollbar">
          <div>
            {!collapsed && (
              <div className="px-2 mb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Instance
              </div>
            )}
            <div className="space-y-0.5">
              {primaryNav.map((item) => (
                <NavItem item={item} key={item.href} />
              ))}
            </div>
          </div>

          {(role === 'admin' || role === 'superadmin') && (
            <div>
              {!collapsed && (
                <div className="px-2 mb-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Admin
                </div>
              )}
              <div className="space-y-0.5">
                {adminNav.map((item) => (
                  <NavItem item={item} key={item.href} />
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-[var(--border-subtle)] p-2">
          {!collapsed ? (
            <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-mono text-[var(--text-tertiary)]">
              <span>DatrixOps CE</span>
              <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 font-bold text-[var(--accent-primary)] border border-[var(--border-subtle)]">
                v{systemVersion}
              </span>
            </div>
          ) : (
            <div className="text-center font-mono text-[10px] font-bold text-[var(--accent-primary)]">
              v{systemVersion}
            </div>
          )}

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="mt-1 flex w-full items-center justify-center rounded py-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors hidden lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>
      </aside>

      {/* Main Content Stage */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-200 ${
          collapsed ? 'lg:pl-16' : 'lg:pl-60'
        }`}
      >
        {/* Top Command Bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--background-header)]/95 backdrop-blur-sm px-4 sm:px-6">
          <div className="flex items-center gap-4 min-w-0">
            {/* Quick Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{editionLabel(workspaceEdition)}</span>
              <span>/</span>
              <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Production</span>
            </div>

            {/* Quick Search Bar (Command Palette trigger) */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-all shadow-xs"
            >
              <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <span className="hidden md:inline">Quick search or command...</span>
              <kbd className="hidden sm:inline-block rounded border border-[var(--border-default)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--text-tertiary)]">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right Header Utilities */}
          <div className="flex items-center gap-2.5">
            <ThemeToggle />

            {/* Notification Bell */}
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
                    aria-label={totalUnreadBadge > 0 ? `Notifications (${totalUnreadBadge} unread)` : 'Notifications'}
                    aria-expanded={notificationsOpen}
                    onClick={() => {
                      setNotificationsOpen((prev) => !prev);
                      if (!notificationsOpen) void fetchNotifications();
                    }}
                    className="relative flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shadow-xs"
                  >
                    <Bell className="h-4 w-4" />
                    {totalUnreadBadge > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--status-critical)] px-1 font-mono text-[9px] font-bold text-white shadow-xs">
                        {totalUnreadBadge > 99 ? '99+' : totalUnreadBadge}
                      </span>
                    )}
                  </button>

                  {notificationsOpen && (
                    <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-primary)] shadow-xl animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5 bg-[var(--surface-2)]">
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">System Notifications</p>
                          <p className="text-[11px] text-[var(--text-secondary)]">{totalUnreadBadge} unread alerts</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void markAllNotificationsRead()}
                          disabled={unreadNotificationCount === 0}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline disabled:opacity-40"
                        >
                          <CheckCheck className="h-3.5 w-3.5" /> Mark all read
                        </button>
                      </div>

                      <div className="max-h-80 overflow-y-auto divide-y divide-[var(--border-subtle)] custom-scrollbar">
                        {serverUpdateAvailable && (
                          <div className="flex gap-2.5 p-3 bg-blue-500/10">
                            <Sparkles className="h-4 w-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                            <div className="text-xs">
                              <p className="font-semibold text-[var(--text-primary)]">
                                CE Server Update v{updateCheck?.latest_version}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                                A newer version of DatrixOps Server is available.
                              </p>
                            </div>
                          </div>
                        )}

                        {agentUpdateAvailable && (
                          <div className="flex gap-2.5 p-3 bg-indigo-500/10">
                            <Bot className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                            <div className="text-xs">
                              <p className="font-semibold text-[var(--text-primary)]">
                                Agent Update v{updateCheck?.latest_agent_version}
                              </p>
                              <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                                Newer monitoring agent binary is available for your nodes.
                              </p>
                            </div>
                          </div>
                        )}

                        {notificationsLoading ? (
                          <div className="flex items-center justify-center py-8 text-xs text-[var(--text-secondary)]">
                            <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--accent-primary)]" /> Loading notifications...
                          </div>
                        ) : notificationError && notifications.length === 0 && !hasUpdateNotification ? (
                          <div className="py-6 text-center text-xs text-[var(--status-critical)]">
                            Unable to load notifications.
                          </div>
                        ) : notifications.length === 0 && !hasUpdateNotification ? (
                          <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">
                            <Bell className="mx-auto mb-2 h-5 w-5 opacity-40" />
                            No new notifications
                          </div>
                        ) : (
                          notifications.map((notification) => {
                            const unread = !notification.read_at;
                            const resolved = notification.severity === 'resolved';

                            return (
                              <div
                                key={notification.id}
                                className={`flex gap-3 p-3 text-xs transition-colors ${
                                  unread ? 'bg-[var(--surface-selected)]' : 'hover:bg-[var(--surface-hover)]'
                                }`}
                              >
                                <div className="mt-0.5 shrink-0">
                                  {resolved ? (
                                    <CircleCheck className="h-4 w-4 text-[var(--status-healthy)]" />
                                  ) : (
                                    <ShieldAlert className="h-4 w-4 text-[var(--status-critical)]" />
                                  )}
                                </div>
                                <Link
                                  href="/dashboard/alerts"
                                  onClick={() => {
                                    setNotificationsOpen(false);
                                    if (unread) void markNotificationRead(notification.id);
                                  }}
                                  className="min-w-0 flex-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <p className={`truncate ${unread ? 'font-bold text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`}>
                                      {notification.title}
                                    </p>
                                    <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0">
                                      {formatNotificationTime(notification.created_at)}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--text-secondary)]">
                                    {notification.message}
                                  </p>
                                </Link>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <Link
                        href="/dashboard/alerts"
                        onClick={() => setNotificationsOpen(false)}
                        className="block border-t border-[var(--border-subtle)] bg-[var(--surface-2)] p-2 text-center text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                      >
                        View Alert Incident Center
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* User Profile Avatar */}
            <div ref={userMenuRef} className="relative">
              <button
                type="button"
                aria-label="User profile menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] font-mono text-xs font-bold text-[var(--accent-primary)] hover:border-[var(--accent-primary)] transition-all shadow-xs"
                title={userEmail || 'User profile'}
              >
                {role === 'admin' || role === 'superadmin' ? 'AD' : role === 'viewer' ? 'VW' : 'OP'}
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 z-50 w-60 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-1 text-[var(--text-primary)] shadow-xl animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-[var(--border-subtle)]">
                    <p className="font-mono text-xs font-bold text-[var(--text-primary)] truncate" title={userEmail}>
                      {userEmail || 'operator'}
                    </p>
                    <span className="inline-block rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--accent-primary)] uppercase">
                      {role}
                    </span>
                  </div>

                  <div className="py-1">
                    <Link
                      href="/docs"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Documentation</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setCommandPaletteOpen(true);
                      }}
                      className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <Search className="h-3.5 w-3.5" />
                        <span>Command palette</span>
                      </span>
                      <kbd className="font-mono text-[9px] text-[var(--text-tertiary)]">⌘K</kbd>
                    </button>
                  </div>

                  <div className="border-t border-[var(--border-subtle)] pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Viewport */}
        <main id="main-content" className="flex-1 p-4 sm:p-6 xl:p-8">
          {children}
        </main>
      </div>

      <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </div>
  );
}

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
