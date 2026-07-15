'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { 
  LayoutDashboard, Server, Activity, Bell, Zap, FileText, Network, Shield,
  Settings, Users, Sliders, List, CloudFog, DatabaseBackup, Search, Moon, Sun, User, Globe
} from 'lucide-react';
import { getUserRole } from '@/lib/apiClient';

const navGroups = [
  {
    title: 'GIÁM SÁT',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Servers', path: '/dashboard/servers', icon: Server },
      { name: 'Website & SSL', path: '/dashboard/websites', icon: Globe },
      { name: 'Monitoring', path: '/dashboard/monitoring', icon: Activity },
      { name: 'Alerts', path: '/dashboard/alerts', icon: Bell },
      { name: 'Performance', path: '/dashboard/performance', icon: Zap },
      { name: 'Logs', path: '/dashboard/logs', icon: FileText },
      { name: 'Network', path: '/dashboard/network', icon: Network },
      { name: 'Security', path: '/dashboard/security', icon: Shield },
    ]
  },
  {
    title: 'QUẢN LÝ',
    items: [
      { name: 'Quản lý Server', path: '/dashboard/manage/servers', icon: Server },
      { name: 'Người dùng & Phân quyền', path: '/dashboard/manage/users', icon: Users },
      { name: 'Cấu hình hệ thống', path: '/dashboard/manage/config', icon: Sliders },
      { name: 'Nhật ký hoạt động', path: '/dashboard/manage/audit', icon: List },
      { name: 'API & Tích hợp', path: '/dashboard/manage/api', icon: CloudFog },
      { name: 'Sao lưu & Khôi phục', path: '/dashboard/manage/backup', icon: DatabaseBackup },
    ]
  },
  {
    title: 'TRỢ GIÚP',
    items: [
      { name: 'Tài liệu (Docs)', path: '/docs', icon: FileText },
    ]
  }
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { theme, setTheme } = useTheme();
  
  const [role, setRole] = useState('user');
  React.useEffect(() => {
    setRole(getUserRole());
  }, []);

  // Mock health percentage for the signature gradient (95% healthy)
  const healthPercentage = 95;
  const signatureColor = healthPercentage > 90 ? 'from-emerald-500 to-emerald-300' 
                       : healthPercentage > 70 ? 'from-amber-500 to-amber-300' 
                       : 'from-rose-500 to-rose-300';

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    router.push('/login');
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden flex flex-col transition-colors duration-300">
      {/* Signature Element - Health Bar */}
      <div className={`h-[3px] w-full bg-gradient-to-r ${signatureColor} z-50`} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`bg-[var(--background)] border-r border-[var(--color-muted)]/10 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-[240px]' : 'w-[80px]'}`}>
          <div className="p-4 flex items-center justify-between border-b border-[var(--color-muted)]/10 h-16 shrink-0">
            {isSidebarOpen ? (
              <h1 className="text-xl font-bold text-[var(--foreground)] tracking-wide truncate">DatrixOps</h1>
            ) : (
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center mx-auto text-white font-bold">D</div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
            {navGroups.map((group, idx) => {
              if (group.title === 'QUẢN LÝ' && role !== 'superadmin') {
                return null;
              }
              return (
              <div key={idx} className="mb-6">
                {isSidebarOpen && (
                  <h3 className="px-5 text-xs font-semibold text-[var(--color-muted)] mb-3 tracking-wider">
                    {group.title}
                  </h3>
                )}
                <ul className="space-y-1 px-2">
                  {group.items.map((item) => {
                    const isActive = pathname === item.path;
                    const Icon = item.icon;
                    return (
                      <li key={item.path}>
                        <Link href={item.path}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ${
                            isActive 
                              ? 'bg-blue-500/10 text-blue-500 relative' 
                              : 'text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--foreground)]'
                          }`}
                        >
                          {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-blue-500 rounded-r" />}
                          <Icon className="w-5 h-5 shrink-0" />
                          {isSidebarOpen && <span className="font-medium">{item.name}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )})}
          </div>

          <div className="p-4 border-t border-[var(--color-muted)]/10">
            <Link href="/dashboard/settings"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[var(--color-muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--foreground)] transition-all ${
                pathname === '/dashboard/settings' ? 'bg-blue-500/10 text-blue-500' : ''
              }`}
            >
              <Settings className={`w-5 h-5 shrink-0 ${!isSidebarOpen && 'mx-auto'}`} />
              {isSidebarOpen && <span className="text-sm font-medium">Settings</span>}
            </Link>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Nav */}
          <header className="h-16 shrink-0 border-b border-[var(--color-muted)]/10 flex items-center justify-between px-6 bg-[var(--background)]/80 backdrop-blur-md z-10 transition-colors duration-300">
            <div className="flex items-center gap-4 flex-1">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[var(--color-muted)] hover:text-[var(--foreground)] lg:hidden">
                <List className="w-5 h-5" />
              </button>
              
              {/* Search */}
              <div className="relative max-w-md w-full hidden md:block">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
                <input 
                  type="text" 
                  placeholder="Search (⌘K)" 
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder-[var(--color-muted)]"
                />
              </div>
            </div>

            <div className="flex items-center gap-5">
              <button className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors relative">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-[10px] font-bold flex items-center justify-center rounded-full text-white border border-[var(--background)]">
                  3
                </span>
              </button>
              
              <button onClick={toggleTheme} className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
                {theme === 'light' ? <Moon className="w-5 h-5 animate-in spin-in-180" /> : <Sun className="w-5 h-5 animate-in spin-in-180" />}
              </button>
              
              <div className="flex items-center gap-3 pl-5 border-l border-white/10 cursor-pointer group" onClick={handleLogout} title="Click to logout">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">Admin User</p>
                  <p className="text-xs text-[var(--color-muted)]">Administrator</p>
                </div>
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white border border-white/10">
                  <User className="w-4 h-4" />
                </div>
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6 relative">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
