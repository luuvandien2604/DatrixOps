import type { Metadata } from 'next';
import DocsHomeContent from '../DocsHomeContent';

export const metadata: Metadata = {
  title: 'DatrixOps Documentation',
  description: 'Guides for installing DatrixOps, monitoring servers, managing Agents, and troubleshooting.',
  alternates: {
    canonical: 'https://datrixops.vandien.space/docs/en',
    languages: {
      'vi-VN': 'https://datrixops.vandien.space/docs',
      'en-US': 'https://datrixops.vandien.space/docs/en',
    },
  },
};

export default function EnglishDocsHome() {
  return <DocsHomeContent locale="en" />;
}
