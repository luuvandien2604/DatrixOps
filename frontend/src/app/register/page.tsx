'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, Server } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient('/auth/register', {
        data: { email, password },
      });
      // After successful registration, redirect to login
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="auth-shell">
      <Link href="/" className="auth-back"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
      <ThemeToggle className="auth-theme-toggle" />
      <div className="auth-liquid auth-liquid-one" />
      <div className="auth-liquid auth-liquid-two" />
      <div className="auth-card glass-card">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="brand-orbit"><Command className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[var(--mint)]">OPS</span></span>
          </Link>
          <div className="auth-icon"><Server className="h-5 w-5" /></div>
          <h1>Create <em>workspace.</em></h1>
          <p>Initialize your server monitoring control plane.</p>
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="auth-message is-error">
             <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label htmlFor="register-email" className="auth-label">Email address</label>
            <input
              id="register-email"
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

          <div>
            <label htmlFor="register-password" className="auth-label">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              className="auth-input"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading ? 'Creating Account...' : <>Create control plane <ArrowRight className="h-4 w-4" /></>}
          </button>
          
          <div className="text-center pt-4">
            <p className="text-[var(--color-muted)] text-sm">
              Already initialized?{' '}
              <Link href="/login" className="auth-link">
                Login here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
