'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity, Bell, BookOpen, ChevronLeft, ChevronRight, CircleUserRound,
  Command, DatabaseBackup, FileText, Gauge, Globe2, KeyRound, LogOut, Menu,
  ScrollText, Search, Server, ServerCog, Settings2, ShieldCheck, SlidersHorizontal,
  Users, X, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getUserRole } from '@/lib/apiClient';

type NavDefinition = {
  label: string;
  href: string;
  icon: LucideIcon;
  count?: number;
};

const primaryNav: NavDefinition[] = [
  { label: 'Overview', href: '/dashboard', icon: Gauge },
  { label: 'Servers', href: '/dashboard/servers', icon: Server },
  { label: 'Uptime', href: '/dashboard/websites', icon: Globe2 },
  { label: 'Metrics', href: '/dashboard/monitoring', icon: Activity },
  { label: 'Alerts', href: '/dashboard/alerts', icon: Bell, count: 2 },
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

  useEffect(() => setRole(getUserRole()), []);

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
        className={`liquid-nav-item ${active ? 'is-active' : ''} ${collapsed ? 'justify-center' : ''}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.count && <span className="ml-auto rounded-full bg-[#ff7a90]/15 px-2 py-0.5 text-[10px] text-[#ff98aa]">{item.count}</span>}
      </Link>
    );
  };

  return (
    <div className="liquid-shell min-h-screen text-[#f6f8fb]">
      <div className="liquid-aurora" aria-hidden="true" />

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-full border border-white/10 bg-black/60 p-3 backdrop-blur-xl lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && <button type="button" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}

      <aside aria-label="Dashboard navigation" className={`liquid-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
        <div className="flex h-20 items-center gap-3 px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <div className="brand-orbit"><Command className="h-4 w-4" /></div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-[0.16em]">DATRIX<span className="text-[#aebdff]">OPS</span></p>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/35">control plane</p>
              </div>
            )}
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} className="ml-auto lg:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
        </div>

        <div className="px-3">
          <div className={`agent-pulse-card ${collapsed ? 'items-center px-2' : ''}`}>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#70f2be] opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#70f2be]" />
            </span>
            {!collapsed && <div><p className="text-xs font-medium">Agent network</p><p className="text-[10px] text-white/40">12 of 12 connected</p></div>}
          </div>
        </div>

        <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-5">
          <p className={`nav-eyebrow ${collapsed ? 'text-center' : ''}`}>{collapsed ? '•' : 'Workspace'}</p>
          <div className="space-y-1">{primaryNav.map((item) => <NavItem item={item} key={item.href} />)}</div>
          <p className={`nav-eyebrow mt-7 ${collapsed ? 'text-center' : ''}`}>{collapsed ? '•' : 'Observe'}</p>
          <div className="space-y-1">{observeNav.map((item) => <NavItem item={item} key={item.href} />)}</div>
          {role === 'superadmin' && <>
            <p className={`nav-eyebrow mt-7 ${collapsed ? 'text-center' : ''}`}>{collapsed ? '•' : 'Admin'}</p>
            <div className="space-y-1">{adminNav.map((item) => <NavItem item={item} key={item.href} />)}</div>
          </>}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <Link href="/docs" className={`liquid-nav-item ${collapsed ? 'justify-center' : ''}`}><BookOpen className="h-[18px] w-[18px]" />{!collapsed && <span>Documentation</span>}</Link>
          <Link href="/dashboard/settings" className={`liquid-nav-item ${collapsed ? 'justify-center' : ''}`}><CircleUserRound className="h-[18px] w-[18px]" />{!collapsed && <span>Workspace settings</span>}</Link>
          <button type="button" onClick={logout} className={`liquid-nav-item w-full ${collapsed ? 'justify-center' : ''}`}><LogOut className="h-[18px] w-[18px]" />{!collapsed && <span>Sign out</span>}</button>
        </div>
        <button type="button" onClick={() => setCollapsed(!collapsed)} className="sidebar-collapse hidden lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>

      <div className={`dashboard-stage ${collapsed ? 'is-expanded' : ''}`}>
        <header className="liquid-topbar">
          <div className="hidden items-center gap-2 text-xs text-white/35 md:flex">
            <span className="text-white/75">Datrix Cloud</span><span>/</span><span>Production</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" className="topbar-action hidden sm:flex" aria-label="Search dashboard"><Search className="h-4 w-4" /><span>Search</span><kbd>⌘ K</kbd></button>
            <Link href="/dashboard/alerts" aria-label="Open alerts" className="topbar-icon relative"><Bell className="h-4 w-4" /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#ff7a90]" /></Link>
            <div className="ml-1 flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.035] py-1.5 pl-1.5 pr-3">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#dfe4ff] via-[#3150ff] to-[#090b12] text-[10px] font-bold">DA</div>
              <div className="hidden sm:block"><p className="text-[11px] font-medium">DevOps Admin</p><p className="text-[9px] text-[#70f2be]">● Online</p></div>
            </div>
          </div>
        </header>
        <main id="main-content" className="relative min-h-[calc(100vh-72px)] px-4 pb-12 pt-7 sm:px-6 xl:px-10">{children}</main>
      </div>
    </div>
  );
}
