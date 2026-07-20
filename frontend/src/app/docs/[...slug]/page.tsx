import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { getAdjacentDocs, getDocBySlug, type DocLocale } from '@/lib/docs';
import MarkdownArticle from '../MarkdownArticle';

export const dynamic = 'force-dynamic';

const legacyRoutes: Record<string, string> = {
  'introduction': 'introduction/what-is-datrixops',
  'agent-installation': 'getting-started/installation',
  'dashboard-overview': 'dashboard/overview',
  'servers': 'server-management/servers',
  'service-monitoring': 'server-management/servers',
  'agent-service-management': 'agent-management/updates',
  'troubleshooting-user': 'troubleshooting/common-issues',
  'features': 'introduction/what-is-datrixops',
  'alerts': 'dashboard/overview',
  'websites': 'dashboard/overview',
  'api-keys': 'security/agent-and-updates',
  'audit-log': 'security/agent-and-updates',
};

function localizedParams(slug: string[]): { locale: DocLocale; contentSlug: string[]; prefix: string } {
  if (slug[0] === 'en') return { locale: 'en', contentSlug: slug.slice(1), prefix: '/docs/en' };
  if (slug[0] === 'vi') return { locale: 'vi', contentSlug: slug.slice(1), prefix: '/docs' };
  return { locale: 'vi', contentSlug: slug, prefix: '/docs' };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const { locale, contentSlug, prefix } = localizedParams(slug);
  const doc = getDocBySlug(contentSlug, locale);
  if (!doc) return { title: locale === 'en' ? 'Documentation not found | DatrixOps' : 'Không tìm thấy tài liệu | DatrixOps' };
  const alternatePrefix = locale === 'en' ? '/docs' : '/docs/en';
  const siteURL = 'https://datrixops.vandien.space';
  return {
    title: `${doc.title} | DatrixOps Docs`,
    description: doc.description,
    alternates: {
      canonical: `${siteURL}${prefix}/${doc.slug}`,
      languages: {
        'vi-VN': `${siteURL}${locale === 'vi' ? prefix : alternatePrefix}/${doc.slug}`,
        'en-US': `${siteURL}${locale === 'en' ? prefix : alternatePrefix}/${doc.slug}`,
      },
    },
    openGraph: { title: doc.title, description: doc.description, type: 'article' },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const { locale, contentSlug, prefix } = localizedParams(slug);
  if (slug[0] === 'vi' && contentSlug.length === 0) redirect('/docs');
  const legacyTarget = legacyRoutes[contentSlug.join('/')];
  if (legacyTarget) redirect(`${prefix}/${legacyTarget}`);
  const doc = getDocBySlug(contentSlug, locale);
  if (!doc) notFound();
  const adjacent = getAdjacentDocs(doc.slug, locale);
  const copy = locale === 'en' ? {
    docs: 'Documentation',
    toc: 'On this page',
    previous: 'Previous',
    next: 'Next',
    breadcrumb: 'Breadcrumb',
    adjacent: 'Previous and next articles',
  } : {
    docs: 'Tài liệu',
    toc: 'Trong bài viết',
    previous: 'Trước',
    next: 'Tiếp theo',
    breadcrumb: 'Breadcrumb',
    adjacent: 'Bài viết trước và sau',
  };

  return (
    <div className="docs-page-layout">
      <article className="docs-article">
        <nav className="docs-breadcrumb" aria-label={copy.breadcrumb}>
          <Link href={prefix}>{copy.docs}</Link><ChevronRight />
          <span>{doc.groupLabel}</span><ChevronRight />
          <strong>{doc.title}</strong>
        </nav>
        <header className="docs-article-header">
          <span>{doc.groupLabel}</span>
          <h1>{doc.title}</h1>
          <p>{doc.description}</p>
        </header>
        <MarkdownArticle content={doc.content} />
        <nav className="docs-adjacent" aria-label={copy.adjacent}>
          {adjacent.previous ? (
            <Link href={`${prefix}/${adjacent.previous.slug}`}><ArrowLeft /><span><small>{copy.previous}</small>{adjacent.previous.title}</span></Link>
          ) : <span />}
          {adjacent.next && (
            <Link href={`${prefix}/${adjacent.next.slug}`}><span><small>{copy.next}</small>{adjacent.next.title}</span><ArrowRight /></Link>
          )}
        </nav>
      </article>
      <aside className="docs-toc" aria-label={copy.toc}>
        <div>
          <h2>{copy.toc}</h2>
          <ul>{doc.headings.map((heading) => <li key={heading.id} className={`level-${heading.level}`}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ul>
        </div>
      </aside>
    </div>
  );
}
