'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, KeyRound, Terminal, CheckCircle2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { apiClient } from '@/lib/apiClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient('/auth/forgot-password', {
        data: { email },
      });
      setSubmitted(true);
    } catch (err: unknown) {
      // For security, still show success message unless rate limited
      if (err instanceof Error && err.message.includes('rate limit')) {
        setError('Too many requests. Please wait a moment and try again.');
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="auth-shell">
      <Link href="/login" className="auth-back">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
      <ThemeToggle className="auth-theme-toggle" />
      <div className="auth-card ops-panel">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="brand-orbit"><Command className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[var(--mint)]">OPS</span></span>
          </Link>
          <div className="auth-icon"><KeyRound className="h-5 w-5" /></div>
          <h1>Reset your password</h1>
          <p>Recover access to your account.</p>
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="auth-message is-error mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {error}
          </div>
        )}

        {submitted ? (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-sm space-y-3">
              <div className="flex items-center gap-2 text-[var(--mint)] font-medium">
                <CheckCircle2 className="h-5 w-5" />
                <span>Password reset request submitted</span>
              </div>
              <p className="text-[var(--color-muted)] leading-relaxed">
                If an account exists for <strong>{email}</strong>, password reset instructions have been dispatched (requires configured SMTP).
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border-color)] text-xs text-[var(--color-muted)] space-y-2">
              <div className="flex items-center gap-2 font-medium text-[var(--color-foreground)]">
                <Terminal className="h-4 w-4 text-[var(--mint)]" />
                <span>Server Administrator:</span>
              </div>
              <p>
                You can reset any user password directly from your server terminal via SSH:
              </p>
              <pre className="p-2 rounded bg-black/40 text-[var(--mint)] font-mono text-xs overflow-x-auto">
                datrix reset-password
              </pre>
            </div>

            <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
              Back to sign in <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reset-email" className="auth-label">Account email</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="auth-input"
                placeholder="admin@example.com"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Processing...' : <>Continue <ArrowRight className="h-4 w-4" /></>}
            </button>

            <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border-color)] text-xs text-[var(--color-muted)] space-y-1 mt-4">
              <div className="flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                <Terminal className="h-3.5 w-3.5 text-[var(--mint)]" />
                <span>Reset password directly via SSH:</span>
              </div>
              <p>
                On the server host, run <code>datrix</code> and select <strong>Reset user password</strong> to update credentials instantly.
              </p>
            </div>

            <p className="pt-2 text-center text-sm text-[var(--color-muted)]">
              Remember your password? <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
