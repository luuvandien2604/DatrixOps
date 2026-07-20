import Link from 'next/link';
import { ArrowRight, BookOpenCheck, MonitorUp, RadioTower, ShieldCheck, Wrench } from 'lucide-react';
import { docsNavigationByLocale, type DocLocale } from '@/lib/docs';

const icons = [BookOpenCheck, MonitorUp, RadioTower, ShieldCheck, Wrench, BookOpenCheck, Wrench];

export default function DocsHomeContent({ locale }: { locale: DocLocale }) {
  const navigation = docsNavigationByLocale[locale];
  const prefix = locale === 'en' ? '/docs/en' : '/docs';
  const copy = locale === 'en' ? {
    eyebrow: 'DatrixOps Documentation',
    title: <>Infrastructure monitoring,<br /><em>without guesswork.</em></>,
    description: 'From your first Agent to operating an entire server fleet—these guides describe what DatrixOps supports today and how to verify every result.',
    start: 'Get started',
    troubleshoot: 'Troubleshooting',
  } : {
    eyebrow: 'DatrixOps Documentation',
    title: <>Giám sát hạ tầng,<br /><em>không cần đoán.</em></>,
    description: 'Từ Agent đầu tiên đến vận hành toàn bộ đội server—tài liệu này giải thích đúng những gì DatrixOps đang hỗ trợ và cách kiểm tra kết quả ở mỗi bước.',
    start: 'Bắt đầu sử dụng',
    troubleshoot: 'Xử lý sự cố',
  };

  return (
    <div className="docs-home">
      <div className="docs-home-hero">
        <span className="docs-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
        <div className="docs-home-actions">
          <Link href={`${prefix}/getting-started/account-and-first-server`}>{copy.start} <ArrowRight /></Link>
          <Link href={`${prefix}/troubleshooting/common-issues`}>{copy.troubleshoot}</Link>
        </div>
      </div>
      <section className="docs-home-grid" aria-label={locale === 'en' ? 'Documentation groups' : 'Nhóm tài liệu'}>
        {navigation.map((group, index) => {
          const Icon = icons[index] ?? BookOpenCheck;
          return (
            <article key={group.slug}>
              <Icon aria-hidden="true" />
              <h2>{group.label}</h2>
              <p>{group.items[0]?.description}</p>
              <ul>
                {group.items.map((item) => <li key={item.slug}><Link href={`${prefix}/${item.slug}`}>{item.title}<ArrowRight /></Link></li>)}
              </ul>
            </article>
          );
        })}
      </section>
    </div>
  );
}
