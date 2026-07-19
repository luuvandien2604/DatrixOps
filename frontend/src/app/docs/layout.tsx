import type { ReactNode } from 'react';
import DocsShell from './DocsShell';
import { docsNavigation, getAllDocs } from '@/lib/docs';

// Public Markdown is mounted read-only at /app/docs in production.
export const dynamic = 'force-dynamic';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <DocsShell navigation={docsNavigation} searchIndex={getAllDocs()}>
      {children}
    </DocsShell>
  );
}
