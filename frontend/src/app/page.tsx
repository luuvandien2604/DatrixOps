'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

type SetupStatus = {
  configured: boolean;
};

function hasStoredToken() {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('access_token') || sessionStorage.getItem('access_token'));
}

export default function CommunityRootPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const routeInstance = async () => {
      setError('');
      try {
        const status = await apiClient('/setup/status') as SetupStatus;
        if (!active) return;

        if (!status.configured) {
          router.replace('/setup');
          return;
        }

        if (!hasStoredToken()) {
          router.replace('/login');
          return;
        }

        try {
          await apiClient('/auth/me');
          if (active) router.replace('/dashboard');
        } catch {
          if (active) router.replace('/login');
        }
      } catch (routeError) {
        if (!active) return;
        setError(routeError instanceof Error ? routeError.message : 'Unable to reach this DatrixOps instance');
      }
    };

    void routeInstance();
    return () => {
      active = false;
    };
  }, [router]);

  if (error) {
    return (
      <main id="main-content" className="auth-shell">
        <section className="auth-card ops-panel text-center">
          <h1>Instance unavailable</h1>
          <p>{error}</p>
          <button type="button" className="auth-submit mt-7" onClick={() => window.location.reload()}>
            Retry <RefreshCw className="h-4 w-4" />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-shell">
      <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-primary)]" aria-label="Routing to your DatrixOps instance" />
    </main>
  );
}
