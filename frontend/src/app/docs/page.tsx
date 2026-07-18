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
    <div className="docs-index">
      <span className="section-eyebrow">DatrixOps knowledge base</span>
      <h1>Tài liệu <em>hướng dẫn.</em></h1>
      <p className="docs-index-lede">Từ lần kết nối agent đầu tiên đến vận hành một hạ tầng hoàn chỉnh—mọi hướng dẫn đều được tổ chức để bạn tìm thấy câu trả lời nhanh.</p>
      <DocsList docs={docs} />
    </div>
  );
}
