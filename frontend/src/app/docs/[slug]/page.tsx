import { getDocBySlug } from '@/lib/docs';
import { notFound } from 'next/navigation';
import DocViewer from './DocViewer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const doc = getDocBySlug(slug);

  if (!doc) {
    return {
      title: 'Not Found | DatrixOps',
    };
  }

  return {
    title: `${doc.meta.title} | Tài liệu DatrixOps`,
    description: doc.meta.description,
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  console.log('slug =', slug);

  const doc = getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  return <DocViewer meta={doc.meta} content={doc.content} />;
}
