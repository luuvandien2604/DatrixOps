import type { Metadata } from 'next';
import DocsHomeContent from '../DocsHomeContent';

export const metadata: Metadata = {
  title: 'DatrixOps Documentation',
  description: 'Guides for installing DatrixOps, monitoring servers, managing Agents, and troubleshooting.',
  alternates: {
    canonical: '/docs/en',
    languages: {
      'vi-VN': '/docs',
      'en-US': '/docs/en',
    },
  },
};

export default function EnglishDocsHome() {
  return <DocsHomeContent locale="en" />;
}
