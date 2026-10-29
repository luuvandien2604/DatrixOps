'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Bell, BookOpen, Bot, CheckCheck, CircleCheck,
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
  { label: 'Team', href: '/dashboard/manage/users', icon: Users },
  { label: 'Audit Trail', href: '/dashboard/manage/audit', icon: ScrollText },
  { label: 'API Keys', href: '/dashboard/manage/api', icon: KeyRound },
  { label: 'Settings', href: '/dashboard/manage/settings', icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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

  const isTabActive = (href: string) => {
    if (href === '/dashboard') return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[var(--background-root)] text-[var(--text-primary)] flex flex-col font-sans">
      {/* 1. TOP COMMAND BAR (Sticky Header) */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[var(--surface-1)]/95 backdrop-blur-md">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
          {/* Left: Brand Monogram & Environment Context */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--surface-3)] border border-[var(--border-default)] text-[var(--accent-primary)] group-hover:border-[var(--accent-primary)] transition-colors shadow-xs">
                <Command className="h-4 w-4" />
              </div>
              <span className="font-mono text-sm font-bold tracking-wider text-[var(--text-primary)]">
                DATRIX<span className="text-[var(--accent-primary)]">OPS</span>
              </span>
            </Link>

            <span className="text-[var(--border-default)] hidden sm:inline">/</span>

            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-mono">
              <span className="font-semibold text-[var(--text-primary)]">{editionLabel(workspaceEdition)}</span>
              <span>·</span>
              <span className="text-[10px] rounded bg-[var(--surface-2)] px-1.5 py-0.5 border border-[var(--border-subtle)] font-bold text-[var(--accent-primary)]">
                v{systemVersion}
              </span>
            </div>
          </div>

          {/* Center: Command Palette Search Bar */}
          <div className="flex-1 max-w-md hidden md:block">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="w-full flex items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-all shadow-xs"
            >
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <span>Search nodes, metrics, rules...</span>
              </span>
              <kbd className="rounded border border-[var(--border-default)] bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--text-tertiary)]">
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right: Telemetry Health, Notifications, Theme, User */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Fleet Status Badge */}
            <div
              className="hidden lg:flex items-center gap-2 rounded px-2.5 py-1 text-xs font-mono border border-[var(--border-subtle)] bg-[var(--surface-2)]"
              title={fleetSyncFailed ? 'Telemetry Offline' : 'Live Fleet Telemetry'}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  fleetSyncFailed
                    ? 'bg-[var(--status-warning)]'
                    : (fleetSummary?.online_servers ?? 0) > 0
                    ? 'bg-[var(--status-healthy)] animate-pulse'
                    : 'bg-[var(--text-tertiary)]'
                }`}
              />
              <span className="font-bold text-[var(--text-primary)] tabular-nums">
                {fleetSummary ? `${fleetSummary.online_servers}/${fleetSummary.total_servers} NODES` : 'SYNCING'}
              </span>
            </div>

            <ThemeToggle />

            {/* Notifications Menu */}
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
                    <div className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-96 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-primary)] shadow-2xl animate-in fade-in slide-in-from-top-2">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5 bg-[var(--surface-2)]">
                        <div>
                          <p className="text-xs font-bold text-[var(--text-primary)]">System Alerts & Notifications</p>
                          <p className="text-[11px] text-[var(--text-secondary)] font-mono">{totalUnreadBadge} unread</p>
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
                            No active alerts or events
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
                        className="block border-t border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 text-center text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                      >
                        View Alert Incident Center
                      </Link>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* User Profile */}
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
                <div className="absolute right-0 top-full mt-2 z-50 w-60 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-1 text-[var(--text-primary)] shadow-2xl animate-in fade-in slide-in-from-top-2">
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

            {/* Mobile menu trigger */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] md:hidden"
              aria-label="Toggle navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 2. SUB-NAVIGATION TABS (Horizontal Command Bar) */}
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)]/80 backdrop-blur-xs overflow-x-auto custom-scrollbar">
          <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 h-10">
            {primaryNav.map((item) => {
              const active = isTabActive(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex items-center gap-2 px-3 h-full text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-[var(--text-primary)] font-bold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)]'}`} />
                  <span>{item.label}</span>
                  {/* 2px active bottom accent line */}
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--accent-primary)] rounded-t" />
                  )}
                </Link>
              );
            })}

            {(role === 'admin' || role === 'superadmin') && (
              <>
                <span className="h-3.5 w-px bg-[var(--border-subtle)] mx-1" />
                {adminNav.map((item) => {
                  const active = isTabActive(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative flex items-center gap-2 px-3 h-full text-xs font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'text-[var(--text-primary)] font-bold'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${active ? 'text-[var(--accent-primary)]' : 'text-[var(--text-tertiary)]'}`} />
                      <span>{item.label}</span>
                      {active && (
                        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-[var(--accent-primary)] rounded-t" />
                      )}
                    </Link>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs md:hidden flex flex-col">
          <div className="bg-[var(--surface-1)] border-b border-[var(--border-subtle)] p-4 flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-[var(--text-primary)]">NAVIGATION</span>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-[var(--surface-1)]">
            <div className="space-y-1">
              <div className="text-[10px] font-mono font-bold uppercase text-[var(--text-tertiary)] mb-2">Instance</div>
              {primaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded text-xs ${
                    isTabActive(item.href)
                      ? 'bg-[var(--surface-selected)] text-[var(--accent-primary)] font-bold'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>

            {(role === 'admin' || role === 'superadmin') && (
              <div className="space-y-1 pt-2 border-t border-[var(--border-subtle)]">
                <div className="text-[10px] font-mono font-bold uppercase text-[var(--text-tertiary)] mb-2">Admin</div>
                {adminNav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded text-xs ${
                      isTabActive(item.href)
                        ? 'bg-[var(--surface-selected)] text-[var(--accent-primary)] font-bold'
                        : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. FULL-WIDTH VIEWPORT */}
      <main id="main-content" className="flex-1 w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {children}
      </main>

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
