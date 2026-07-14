'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { 
  BookOpen, Terminal, Server, Activity, Menu, X, Moon, Sun, Home, ChevronRight
} from 'lucide-react';

const docsNavigation = [
  {
    title: 'Bắt đầu',
    items: [
      { name: 'Giới thiệu', path: '/docs' },
      { name: 'Cài đặt Agent', path: '/docs/installation' },
      { name: 'Yêu cầu hệ thống', path: '/docs/requirements' },
    ]
  },
  {
    title: 'Tính năng',
    items: [
      { name: 'Giám sát tài nguyên', path: '/docs/monitoring' },
      { name: 'Cảnh báo (Alerts)', path: '/docs/alerts' },
      { name: 'Phân quyền', path: '/docs/permissions' },
    ]
  },
  {
    title: 'Khắc phục sự cố',
    items: [
      { name: 'Server báo "Chưa có dữ liệu"', path: '/docs/troubleshooting/no-data' },
      { name: 'Lỗi cài đặt Windows', path: '/docs/troubleshooting/windows' },
    ]
  }
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[var(--background)]/80 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              className="lg:hidden p-2 -ml-2 text-[var(--color-muted)] hover:text-[var(--foreground)]"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/docs" className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white">D</div>
              <span>DatrixOps <span className="text-blue-500">Docs</span></span>
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
          fixed inset-y-0 left-0 z-40 w-64 bg-[var(--background)] border-r border-white/10 pt-16
          lg:static lg:pt-0 lg:block
          transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <div className="h-full overflow-y-auto py-8 px-4 custom-scrollbar">
            {docsNavigation.map((group, idx) => (
              <div key={idx} className="mb-8">
                <h4 className="font-semibold text-[var(--foreground)] mb-3 text-sm">{group.title}</h4>
                <ul className="space-y-1.5">
                  {group.items.map((item) => {
                    const isActive = pathname === item.path;
                    return (
                      <li key={item.path}>
                        <Link 
                          href={item.path}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                            isActive 
                              ? 'bg-blue-500/10 text-blue-500 font-medium' 
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
        <main className="flex-1 min-w-0 py-8 lg:px-12">
          <div className="prose prose-invert prose-blue max-w-4xl w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
