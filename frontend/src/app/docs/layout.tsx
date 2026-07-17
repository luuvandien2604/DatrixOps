'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Menu, X, Moon, Sun, ChevronRight, Command
} from 'lucide-react';

const docsNavigation = [
  {
    title: 'Bắt đầu',
    items: [
      { name: 'Giới thiệu', path: '/docs/introduction' },
      { name: 'Cài đặt Agent', path: '/docs/agent-installation' },
      { name: 'Tổng quan Dashboard', path: '/docs/dashboard-overview' },
    ]
  },
  {
    title: 'Quản lý Server',
    items: [
      { name: 'Servers', path: '/docs/servers' },
    ]
  },
  {
    title: 'Cảnh báo & Giám sát',
    items: [
      { name: 'Alerts', path: '/docs/alerts' },
      { name: 'Websites & SSL', path: '/docs/websites' },
    ]
  },
  {
    title: 'Quản trị',
    items: [
      { name: 'API Keys', path: '/docs/api-keys' },
      { name: 'Audit Log', path: '/docs/audit-log' },
    ]
  },
  {
    title: 'Khắc phục sự cố',
    items: [
      { name: 'Lỗi thường gặp', path: '/docs/troubleshooting' },
    ]
  },
  {
    title: 'Vận hành Agent',
    items: [
      { name: 'Quản lý Service Agent', path: '/docs/agent-service-management' },
    ]
  }
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="docs-shell min-h-screen text-[var(--foreground)] font-sans flex flex-col">
      {/* Header */}
      <header className="docs-header sticky top-0 z-50 w-full">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden p-2 -ml-2 text-[var(--color-muted)] hover:text-[var(--foreground)]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/docs" className="flex items-center gap-3 font-semibold tracking-tight">
              <span className="brand-orbit"><Command className="h-4 w-4" /></span>
              <span>DatrixOps <span className="text-[#9b8cff]">Docs</span></span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[var(--color-muted)]">
              <Link href="/" className="hover:text-[var(--foreground)] transition-colors">Trang chủ</Link>
              <Link href="/dashboard" className="hover:text-[var(--foreground)] transition-colors">Dashboard</Link>
              <a href="https://github.com/luuvandien2604/DatrixOps" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--foreground)] transition-colors">GitHub</a>
            </nav>
            <div className="w-px h-5 bg-white/10 hidden md:block"></div>
            <button onClick={toggleTheme} className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors p-2">
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 flex-1 flex">
        {/* Sidebar */}
        <aside className={`
          docs-aside fixed inset-y-0 left-0 z-40 w-64 pt-16
          lg:static lg:pt-0 lg:block
          transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="h-full overflow-y-auto py-8 px-4 custom-scrollbar">
            {docsNavigation.map((group, idx) => (
              <div key={idx} className="mb-8">
                <h4 className="docs-group-title">{group.title}</h4>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                      <li key={item.path}>
                        <Link
                          href={item.path}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`docs-link ${isActive
                            ? 'is-active'
                            : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white/5'
                            }`}
                        >
                          {isActive && <ChevronRight className="w-4 h-4 shrink-0" />}
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Overlay for mobile */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="docs-content flex-1 min-w-0 py-8 lg:px-12">
          <div className="prose prose-invert prose-blue max-w-4xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
