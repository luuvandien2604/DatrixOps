import type { Metadata } from 'next';
import DocsHomeContent from './DocsHomeContent';

export const metadata: Metadata = {
  title: 'DatrixOps Documentation',
  description: 'Guides for installing DatrixOps, monitoring servers, managing Agents, and troubleshooting.',
  alternates: {
    canonical: '/docs',
    languages: {
      'en-US': '/docs',
      'vi-VN': '/docs/vi',
    },
  },
};

export default function DocsHome() {
  return <DocsHomeContent locale="en" />;
}
