'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Languages, Menu, Search, X } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import type { DocEntry, DocLocale, DocsNavigation } from '@/lib/docs';

export default function DocsShell({
  children,
  navigationByLocale,
  searchIndexByLocale,
}: {
  children: ReactNode;
  navigationByLocale: Record<DocLocale, DocsNavigation>;
  searchIndexByLocale: Record<DocLocale, DocEntry[]>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const locale: DocLocale = pathname === '/docs/en' || pathname.startsWith('/docs/en/') ? 'en' : 'vi';
  const navigation = navigationByLocale[locale];
  const searchIndex = searchIndexByLocale[locale];
  const copy = locale === 'en' ? {
    skip: 'Skip navigation',
    openMenu: 'Open table of contents',
    docs: 'DatrixOps documentation',
    search: 'Search documentation',
    searchPlaceholder: 'Search for a topic…',
    closeSearch: 'Close search',
    closeMenu: 'Close table of contents',
    noResults: 'No matching documentation found.',
    navigation: 'Documentation navigation',
    language: 'Documentation language',
  } : {
    skip: 'Bỏ qua điều hướng',
    openMenu: 'Mở mục lục',
    docs: 'Tài liệu DatrixOps',
    search: 'Tìm kiếm tài liệu',
    searchPlaceholder: 'Nhập chủ đề cần tìm…',
    closeSearch: 'Đóng tìm kiếm',
    closeMenu: 'Đóng mục lục',
    noResults: 'Không tìm thấy bài viết phù hợp.',
    navigation: 'Điều hướng tài liệu',
    language: 'Ngôn ngữ tài liệu',
  };

  const localizedPath = (slug: string) => locale === 'en' ? `/docs/en/${slug}` : `/docs/${slug}`;
  const switchLocale = (nextLocale: DocLocale) => {
    if (nextLocale === locale) return;
    const contentPath = locale === 'en'
      ? pathname.replace(/^\/docs\/en\/?/, '')
      : pathname.replace(/^\/docs\/?/, '');
    const target = nextLocale === 'en'
      ? `/docs/en${contentPath ? `/${contentPath}` : ''}`
      : `/docs${contentPath ? `/${contentPath}` : ''}`;
    router.push(target);
  };

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
      <a href="#docs-content" className="skip-link">{copy.skip}</a>
      <header className="docs-header">
        <div className="docs-header-inner">
          <button className="docs-menu-button" type="button" onClick={() => setMenuOpen(true)} aria-label={copy.openMenu} aria-expanded={menuOpen} aria-controls="docs-sidebar">
            <Menu aria-hidden="true" />
          </button>
          <Link href={locale === 'en' ? '/docs/en' : '/docs'} className="docs-brand" aria-label="DatrixOps Documentation">
            <span className="docs-brand-mark"><BookOpen aria-hidden="true" /></span>
            <span>DATRIX<span>OPS</span></span>
            <i>Docs</i>
          </Link>
          <button className="docs-search-trigger" type="button" onClick={() => setSearchOpen(true)}>
            <Search aria-hidden="true" />
            <span>{copy.search}</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="docs-header-actions">
            <label className="docs-language">
              <Languages aria-hidden="true" />
              <span className="sr-only">{copy.language}</span>
              <select value={locale} onChange={(event) => switchLocale(event.target.value as DocLocale)} aria-label={copy.language}>
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
              </select>
            </label>
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
            <span>{copy.docs}</span>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label={copy.closeMenu}><X /></button>
          </div>
          <nav aria-label={copy.navigation}>
            {navigation.map((group) => (
              <section key={group.slug}>
                <h2>{group.label}</h2>
                <ul>
                  {group.items.map((item) => {
                    const href = localizedPath(item.slug);
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
        {menuOpen && <button className="docs-sidebar-scrim" type="button" aria-label={copy.closeMenu} onClick={() => setMenuOpen(false)} />}
        <main id="docs-content" className="docs-main">{children}</main>
      </div>

      {searchOpen && (
        <div className="docs-search-overlay" role="dialog" aria-modal="true" aria-label={copy.search} onMouseDown={() => setSearchOpen(false)}>
          <div className="docs-search-dialog" onMouseDown={(event) => event.stopPropagation()}>
            <label>
              <Search aria-hidden="true" />
              <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchPlaceholder} />
              <button type="button" onClick={() => setSearchOpen(false)} aria-label={copy.closeSearch}><X /></button>
            </label>
            <div className="docs-search-results">
              {results.length > 0 ? results.map((doc) => (
                <Link key={doc.slug} href={localizedPath(doc.slug)} onClick={() => { setSearchOpen(false); setQuery(''); }}>
                  <span>{doc.title}<small>{doc.groupLabel}</small></span>
                  <p>{doc.description}</p>
                </Link>
              )) : <p className="docs-search-empty">{copy.noResults}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
