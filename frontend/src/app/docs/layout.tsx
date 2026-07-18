'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowUpRight, ChevronRight, Command, Menu, X
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="docs-shell flex min-h-screen flex-col text-[var(--foreground)]">
      <a href="#docs-content" className="skip-link">Skip to documentation</a>
      <header className="docs-header sticky top-0 z-50 w-full">
        <div className="container mx-auto flex h-[72px] items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="-ml-2 p-2 text-[var(--color-muted)] hover:text-[var(--foreground)] lg:hidden"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label={isMobileMenuOpen ? 'Close documentation navigation' : 'Open documentation navigation'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Link href="/docs" className="flex items-center gap-3 font-semibold tracking-tight">
              <span className="brand-orbit"><Command className="h-4 w-4" /></span>
              <span className="tracking-[.08em]">DATRIX<span className="text-[#9b8cff]">OPS</span> <span className="font-normal tracking-normal text-white/40">/ Docs</span></span>
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <nav aria-label="Documentation utilities" className="hidden items-center gap-6 text-sm font-medium text-[var(--color-muted)] md:flex">
              <Link href="/" className="hover:text-[var(--foreground)] transition-colors">Trang chủ</Link>
              <Link href="/dashboard" className="hover:text-[var(--foreground)] transition-colors">Dashboard</Link>
              <a href="https://github.com/luuvandien2604/DatrixOps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 transition-colors hover:text-[var(--foreground)]">GitHub <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </nav>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 flex-1 flex">
        <aside className={`
          docs-aside fixed inset-y-0 left-0 z-40 w-64 pt-16
          lg:static lg:pt-0 lg:block
          transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          <nav aria-label="Documentation sections" className="custom-scrollbar h-full overflow-y-auto px-4 py-8">
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
                          aria-current={isActive ? 'page' : undefined}
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
          </nav>
        </aside>

        {isMobileMenuOpen && (
          <button
            type="button"
            aria-label="Close documentation navigation"
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <main id="docs-content" className="docs-content min-w-0 flex-1 py-10 lg:px-12">
          <div className="w-full max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
