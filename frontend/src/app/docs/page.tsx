import { getAllDocs } from '@/lib/docs';
import DocsList from './DocsList';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Documentation | DatrixOps',
  description: 'Guides and product information for DatrixOps',
};

export default function DocsPage() {
  const docs = getAllDocs();
  
  return (
    <div className="docs-index">
      <span className="section-eyebrow">DatrixOps knowledge base</span>
      <h1>Product <em>documentation.</em></h1>
      <p className="docs-index-lede">From connecting your first agent to operating a complete infrastructure, every guide is organized to help you find answers quickly.</p>
      <DocsList docs={docs} />
    </div>
  );
}
