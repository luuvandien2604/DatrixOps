import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenCheck, MonitorUp, RadioTower, ShieldCheck, Wrench } from 'lucide-react';
import { docsNavigation } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Tài liệu DatrixOps',
  description: 'Hướng dẫn cài đặt, giám sát server, quản lý Agent và xử lý sự cố DatrixOps.',
  alternates: { canonical: '/docs' },
};

const icons = [BookOpenCheck, MonitorUp, RadioTower, ShieldCheck, Wrench, BookOpenCheck, Wrench];

export default function DocsHome() {
  return (
    <div className="docs-home">
      <div className="docs-home-hero">
        <span className="docs-eyebrow">DatrixOps Documentation</span>
        <h1>Giám sát hạ tầng,<br /><em>không cần đoán.</em></h1>
        <p>Từ Agent đầu tiên đến vận hành toàn bộ đội server—tài liệu này giải thích đúng những gì DatrixOps đang hỗ trợ và cách kiểm tra kết quả ở mỗi bước.</p>
        <div className="docs-home-actions">
          <Link href="/docs/getting-started/account-and-first-server">Bắt đầu sử dụng <ArrowRight /></Link>
          <Link href="/docs/troubleshooting/common-issues">Xử lý sự cố</Link>
        </div>
      </div>
      <section className="docs-home-grid" aria-label="Nhóm tài liệu">
        {docsNavigation.map((group, index) => {
          const Icon = icons[index] ?? BookOpenCheck;
          return (
            <article key={group.slug}>
              <Icon aria-hidden="true" />
              <h2>{group.label}</h2>
              <p>{group.items[0]?.description}</p>
              <ul>
                {group.items.map((item) => <li key={item.slug}><Link href={`/docs/${item.slug}`}>{item.title}<ArrowRight /></Link></li>)}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
