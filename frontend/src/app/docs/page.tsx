import { getAllDocs } from '@/lib/docs';
import DocsList from './DocsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tài liệu hướng dẫn | DatrixOps',
  description: 'Hướng dẫn sử dụng và thông tin về hệ thống DatrixOps',
};

export default function DocsPage() {
  const docs = getAllDocs();
  
  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <h1 className="text-4xl font-bold mb-8">Tài liệu hướng dẫn</h1>
      <DocsList docs={docs} />
    </div>
  );
}
