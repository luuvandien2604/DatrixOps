import type { Metadata } from 'next';
import DocsHomeContent from '../DocsHomeContent';

export const metadata: Metadata = {
  title: 'Tài liệu DatrixOps',
  description: 'Hướng dẫn cài đặt, giám sát server, quản lý Agent và xử lý sự cố DatrixOps.',
  alternates: {
    canonical: '/docs/vi',
    languages: {
      'en-US': '/docs',
      'vi-VN': '/docs/vi',
    },
  },
};

export default function VietnameseDocsHome() {
  return <DocsHomeContent locale="vi" />;
}
