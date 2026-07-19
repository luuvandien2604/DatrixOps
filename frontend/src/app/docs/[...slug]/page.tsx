import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react';
import { getAdjacentDocs, getDocBySlug } from '@/lib/docs';
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

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDocBySlug(slug);
  if (!doc) return { title: 'Không tìm thấy tài liệu | DatrixOps' };
  return {
    title: `${doc.title} | DatrixOps Docs`,
    description: doc.description,
    alternates: { canonical: `/docs/${doc.slug}` },
    openGraph: { title: doc.title, description: doc.description, type: 'article' },
  };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const legacyTarget = legacyRoutes[slug.join('/')];
  if (legacyTarget) redirect(`/docs/${legacyTarget}`);
  const doc = getDocBySlug(slug);
  if (!doc) notFound();
  const adjacent = getAdjacentDocs(doc.slug);

  return (
    <div className="docs-page-layout">
      <article className="docs-article">
        <nav className="docs-breadcrumb" aria-label="Breadcrumb">
          <Link href="/docs">Tài liệu</Link><ChevronRight />
          <span>{doc.groupLabel}</span><ChevronRight />
          <strong>{doc.title}</strong>
        </nav>
        <header className="docs-article-header">
          <span>{doc.groupLabel}</span>
          <h1>{doc.title}</h1>
          <p>{doc.description}</p>
        </header>
        <MarkdownArticle content={doc.content} />
        <nav className="docs-adjacent" aria-label="Bài viết trước và sau">
          {adjacent.previous ? (
            <Link href={`/docs/${adjacent.previous.slug}`}><ArrowLeft /><span><small>Trước</small>{adjacent.previous.title}</span></Link>
          ) : <span />}
          {adjacent.next && (
            <Link href={`/docs/${adjacent.next.slug}`}><span><small>Tiếp theo</small>{adjacent.next.title}</span><ArrowRight /></Link>
          )}
        </nav>
      </article>
      <aside className="docs-toc" aria-label="Mục lục bài viết">
        <div>
          <h2>Trong bài viết</h2>
          <ul>{doc.headings.map((heading) => <li key={heading.id} className={`level-${heading.level}`}><a href={`#${heading.id}`}>{heading.text}</a></li>)}</ul>
        </div>
      </aside>
    </div>
  );
}
