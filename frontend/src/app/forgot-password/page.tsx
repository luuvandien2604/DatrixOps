'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, KeyRound, MailCheck } from 'lucide-react';
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
      if (err instanceof Error && err.message.includes('rate limit')) {
        setError('Too many requests. Please wait a moment and try again.');
      } else {
        // Uniform response to avoid account enumeration
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
          <div className="auth-icon">
            {submitted ? <MailCheck className="h-5 w-5 text-[var(--mint)]" /> : <KeyRound className="h-5 w-5" />}
          </div>
          <h1>{submitted ? 'Check your email' : 'Forgot password'}</h1>
          <p>
            {submitted
              ? 'Password reset instructions dispatched'
              : "Enter your account email and we'll send you reset instructions."}
          </p>
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="auth-message is-error mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {error}
          </div>
        )}

        {submitted ? (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-sm space-y-3 text-center">
              <p className="text-[var(--color-foreground)] leading-relaxed">
                If an account exists for <strong className="text-[var(--mint)]">{email}</strong>, you will receive an email with a secure link to reset your password.
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                Please check your inbox as well as your spam folder. The link will expire in 60 minutes.
              </p>
            </div>

            <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
              Back to sign in <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors underline"
              >
                Didn&apos;t receive an email? Try another address
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reset-email" className="auth-label">Email address</label>
              <input
                id="reset-email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="auth-input"
                placeholder="you@example.com"
              />
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? 'Sending instructions...' : <>Send reset instructions <ArrowRight className="h-4 w-4" /></>}
            </button>

            <p className="pt-2 text-center text-sm text-[var(--color-muted)]">
              Remember your password? <Link href="/login" className="auth-link">Sign in</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
