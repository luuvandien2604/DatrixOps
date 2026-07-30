'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

export default function RegisterPage() {
  const router = useRouter();

  useEffect(() => {
    apiClient('/setup/status')
      .then((status: { configured: boolean }) => {
        router.replace(status.configured ? '/login' : '/setup');
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  return (
    <main id="main-content" className="auth-shell">
      <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-primary)]" aria-label="Checking setup status" />
    </main>
  );
}
