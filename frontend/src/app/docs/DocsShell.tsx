'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, BookOpen, Menu, Search, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { DocEntry } from '@/lib/docs';

interface NavigationGroup {
  label: string;
  slug: string;
  items: Array<Omit<DocEntry, 'groupLabel'>>;
}

export default function DocsShell({
  children,
  navigation,
  searchIndex,
}: {
  children: ReactNode;
  navigation: NavigationGroup[];
  searchIndex: DocEntry[];
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchInput.current?.focus(), 0);
  }, [searchOpen]);

  const normalizedQuery = query.trim().toLocaleLowerCase('vi');
  const results = normalizedQuery
    ? searchIndex.filter((doc) => `${doc.title} ${doc.description} ${doc.groupLabel} ${doc.searchText ?? ''}`.toLocaleLowerCase('vi').includes(normalizedQuery))
    : searchIndex;

  return (
    <div className="docs-shell">
      <a href="#docs-content" className="skip-link">Bỏ qua điều hướng</a>
      <header className="docs-header">
        <div className="docs-header-inner">
          <button className="docs-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Mở mục lục" aria-expanded={menuOpen} aria-controls="docs-sidebar">
            <Menu aria-hidden="true" />
          </button>
          <Link href="/docs" className="docs-brand" aria-label="DatrixOps Documentation">
            <span className="docs-brand-mark"><BookOpen aria-hidden="true" /></span>
            <span>DATRIX<span>OPS</span></span>
            <i>Docs</i>
          </Link>
          <button className="docs-search-trigger" type="button" onClick={() => setSearchOpen(true)}>
            <Search aria-hidden="true" />
            <span>Tìm kiếm tài liệu</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="docs-header-actions">
            <ThemeToggle />
            <Link href="/dashboard">Dashboard</Link>
            <a href="https://github.com/luuvandien2604/DatrixOps" target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      <div className="docs-layout">
        <aside id="docs-sidebar" className={`docs-sidebar ${menuOpen ? 'is-open' : ''}`}>
          <div className="docs-sidebar-mobile-head">
            <span>Tài liệu DatrixOps</span>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Đóng mục lục"><X /></button>
          </div>
          <nav aria-label="Điều hướng tài liệu">
            {navigation.map((group) => (
              <section key={group.slug}>
                <h2>{group.label}</h2>
                <ul>
                  {group.items.map((item) => {
                    const href = `/docs/${item.slug}`;
                    const active = pathname === href;
                    return (
                      <li key={item.slug}>
                        <Link href={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''} onClick={() => setMenuOpen(false)}>
                          {item.title}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </nav>
        </aside>
        {menuOpen && <button className="docs-sidebar-scrim" type="button" aria-label="Đóng mục lục" onClick={() => setMenuOpen(false)} />}
        <main id="docs-content" className="docs-main">{children}</main>
      </div>

      {searchOpen && (
        <div className="docs-search-overlay" role="dialog" aria-modal="true" aria-label="Tìm kiếm tài liệu" onMouseDown={() => setSearchOpen(false)}>
          <div className="docs-search-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <label>
              <Search aria-hidden="true" />
              <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nhập chủ đề cần tìm…" />
              <button type="button" onClick={() => setSearchOpen(false)} aria-label="Đóng tìm kiếm"><X /></button>
            </label>
            <div className="docs-search-results">
              {results.length > 0 ? results.map((doc) => (
                <Link key={doc.slug} href={`/docs/${doc.slug}`} onClick={() => { setSearchOpen(false); setQuery(''); }}>
                  <span>{doc.title}<small>{doc.groupLabel}</small></span>
                  <p>{doc.description}</p>
                </Link>
              )) : <p className="docs-search-empty">Không tìm thấy bài viết phù hợp.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
