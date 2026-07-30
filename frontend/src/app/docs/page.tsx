import type { Metadata } from 'next';
import DocsHomeContent from './DocsHomeContent';

export const metadata: Metadata = {
  title: 'Tài liệu DatrixOps',
  description: 'Hướng dẫn cài đặt, giám sát server, quản lý Agent và xử lý sự cố DatrixOps.',
  alternates: {
    canonical: '/docs',
    languages: {
      'vi-VN': '/docs',
      'en-US': '/docs/en',
    },
  },
};

export default function DocsHome() {
  return <DocsHomeContent locale="vi" />;
}
