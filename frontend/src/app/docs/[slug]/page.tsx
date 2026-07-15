import { getDocBySlug, getAllDocs } from '@/lib/docs';
import { notFound } from 'next/navigation';
import DocViewer from './DocViewer';

export async function generateStaticParams() {
  const docs = getAllDocs();
  return docs.map((doc) => ({
    slug: doc.slug,
  }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);
  if (!doc) {
    return { title: 'Not Found | DatrixOps' };
  }
  return {
    title: `${doc.meta.title} | Tài liệu DatrixOps`,
    description: doc.meta.description,
  };
}

export default async function DocPage({ params }: { params: { slug: string } }) {
  const doc = getDocBySlug(params.slug);
  
  if (!doc) {
    notFound();
  }

  return <DocViewer meta={doc.meta} content={doc.content} />;
}
