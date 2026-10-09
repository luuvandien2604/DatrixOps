'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { apiClient } from '@/lib/apiClient';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      await apiClient('/auth/reset-password', {
        data: {
          token,
          email: emailParam,
          new_password: password,
        },
      });
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 2500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message.replace(/^\[[A-Za-z0-9_]+\]\s*/, '');
        setError(msg || 'Invalid or expired reset token.');
      } else {
        setError('Failed to reset password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card ops-panel">
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
          <span className="brand-orbit"><Command className="h-4 w-4" /></span>
          <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[var(--mint)]">OPS</span></span>
        </Link>
        <div className="auth-icon"><KeyRound className="h-5 w-5" /></div>
        <h1>Set new password</h1>
        <p>Choose a secure password for your account.</p>
      </div>

      {error && (
        <div role="alert" aria-live="polite" className="auth-message is-error mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          {error}
        </div>
      )}

      {success ? (
        <div className="p-4 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-sm space-y-4 text-center">
          <div className="flex items-center justify-center gap-2 text-[var(--mint)] font-medium">
            <CheckCircle2 className="h-6 w-6" />
            <span className="text-base">Password reset successfully!</span>
          </div>
          <p className="text-[var(--color-muted)]">
            Your password has been updated. Redirecting to sign in page...
          </p>
          <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
            Sign in now <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : !token ? (
        <div className="space-y-5 text-sm text-center">
          <div className="p-5 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] space-y-3">
            <div className="flex items-center justify-center gap-2 text-rose-400 font-medium">
              <AlertCircle className="h-5 w-5" />
              <span>Invalid or expired link</span>
            </div>
            <p className="text-[var(--color-muted)] text-xs leading-relaxed">
              This password reset link is missing a security token or has already expired. Please request a new link to continue.
            </p>
          </div>
          <Link href="/forgot-password" className="auth-submit flex items-center justify-center gap-2">
            Request new reset link <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="pt-2 text-center text-sm text-[var(--color-muted)]">
            <Link href="/login" className="auth-link">Back to sign in</Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label htmlFor="new-password" className="auth-label">New password</label>
            <input
              id="new-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="auth-input"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="auth-label">Confirm new password</label>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="auth-input"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="auth-submit">
            {loading ? 'Updating...' : <>Save new password <ArrowRight className="h-4 w-4" /></>}
          </button>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main id="main-content" className="auth-shell">
      <Link href="/login" className="auth-back">
        <ArrowLeft className="h-4 w-4" /> Back to sign in
      </Link>
      <ThemeToggle className="auth-theme-toggle" />
      <Suspense fallback={<div className="text-center p-8 text-sm text-[var(--color-muted)]">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
