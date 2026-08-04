'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Command, Database, Loader2, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { ThemeToggle } from '@/components/ThemeToggle';

type SetupStatus = {
  configured: boolean;
  database: string;
  system_name: string;
  timezone: string;
  public_url: string;
};

export default function SetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [systemName, setSystemName] = useState('DatrixOps');
  const [timezone, setTimezone] = useState('UTC');
  const [publicURL, setPublicURL] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient('/setup/status')
      .then((data: SetupStatus) => {
        if (!active) return;
        setStatus(data);
        setSystemName(data.system_name || 'DatrixOps');
        setTimezone(data.timezone === 'UTC'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
          : data.timezone);
        setPublicURL(data.public_url || window.location.origin);
      })
      .catch((setupError: unknown) => {
        if (active) setError(setupError instanceof Error ? setupError.message : 'Unable to read setup status');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!status?.configured) return;
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    router.replace(token ? '/dashboard' : '/login');
  }, [router, status?.configured]);

  const completeSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient('/setup/complete', {
        data: {
          email,
          password,
          system_name: systemName,
          timezone,
          public_url: publicURL,
        },
      });
      router.push('/login?setup=complete');
    } catch (setupError: unknown) {
      setError(setupError instanceof Error ? setupError.message : 'Unable to complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main id="main-content" className="auth-shell">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-primary)]" aria-label="Loading setup status" />
      </main>
    );
  }

  if (status?.configured) {
    return (
      <main id="main-content" className="auth-shell">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--accent-primary)]" aria-label="Redirecting from setup" />
      </main>
    );
  }

  return (
    <main id="main-content" className="auth-shell py-12">
      <ThemeToggle className="auth-theme-toggle" />
      <section className="auth-card ops-panel !max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex items-center gap-2">
            <span className="brand-orbit"><Command className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[var(--accent-primary)]">OPS</span></span>
          </div>
          <h1>Initialize <em>DatrixOps.</em></h1>
          <p>Create the only public bootstrap administrator and configure this self-hosted instance.</p>
        </div>

        <div className="mb-6 flex items-center gap-3 rounded-lg border border-[var(--status-healthy)]/30 bg-[var(--status-healthy)]/10 px-4 py-3 text-sm">
          <Database className="h-4 w-4 text-[var(--status-healthy)]" />
          <span className="font-medium">Database connection verified</span>
          <CheckCircle2 className="ml-auto h-4 w-4 text-[var(--status-healthy)]" />
        </div>

        {error && <div role="alert" aria-live="polite" className="auth-message is-error">{error}</div>}

        <form onSubmit={completeSetup} className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="mb-3 text-sm font-semibold">Administrator</h2>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="setup-email" className="auth-label">Email address</label>
            <input id="setup-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="auth-input" placeholder="admin@example.com" />
          </div>
          <div>
            <label htmlFor="setup-password" className="auth-label">Password</label>
            <input id="setup-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="auth-input" placeholder="At least 12 characters" />
          </div>
          <div>
            <label htmlFor="setup-confirm-password" className="auth-label">Confirm password</label>
            <input id="setup-confirm-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="auth-input" />
          </div>

          <div className="md:col-span-2 mt-2">
            <h2 className="mb-3 text-sm font-semibold">Instance settings</h2>
          </div>
          <div>
            <label htmlFor="setup-system-name" className="auth-label">System name</label>
            <input id="setup-system-name" required maxLength={120} value={systemName} onChange={(event) => setSystemName(event.target.value)} className="auth-input" />
          </div>
          <div>
            <label htmlFor="setup-timezone" className="auth-label">Timezone</label>
            <input id="setup-timezone" required value={timezone} onChange={(event) => setTimezone(event.target.value)} className="auth-input" placeholder="Asia/Ho_Chi_Minh" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="setup-public-url" className="auth-label">Public URL</label>
            <input id="setup-public-url" type="url" required value={publicURL} onChange={(event) => setPublicURL(event.target.value)} className="auth-input" placeholder="https://monitor.example.com" />
            <p className="mt-2 text-xs text-[var(--text-secondary)]">Used for Agent enrollment, alert links and release downloads. HTTPS is required outside localhost.</p>
          </div>

          <button type="submit" disabled={submitting} className="auth-submit md:col-span-2">
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Completing setup…</> : <>Complete initial setup <ShieldCheck className="h-4 w-4" /></>}
          </button>
        </form>
      </section>
    </main>
  );
}
