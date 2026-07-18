'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, LockKeyhole } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiClient('/auth/login', {
        data: { email, password },
      });
      
      // Store tokens
      if (rememberMe) {
        localStorage.setItem('access_token', data.access_token);
        localStorage.setItem('refresh_token', data.refresh_token);
      } else {
        sessionStorage.setItem('access_token', data.access_token);
        sessionStorage.setItem('refresh_token', data.refresh_token);
      }
      
      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main id="main-content" className="auth-shell">
      <Link href="/" className="auth-back"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
      <div className="auth-liquid auth-liquid-one" />
      <div className="auth-liquid auth-liquid-two" />
      <div className="auth-card glass-card">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="brand-orbit"><Command className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[#86f2cf]">OPS</span></span>
          </Link>
          <div className="auth-icon"><LockKeyhole className="h-5 w-5" /></div>
          <h1>Welcome <em>back.</em></h1>
          <p>Sign in to your infrastructure control plane.</p>
        </div>

        {error && (
          <div role="alert" aria-live="polite" className="auth-message is-error">
             <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="auth-label">Email address</label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="auth-label">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="auth-input"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              id="remember"
              name="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="auth-checkbox"
            />
            <label htmlFor="remember" className="text-sm text-[var(--color-muted)] cursor-pointer select-none">
              Remember me for 30 days
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading ? 'Authenticating...' : <>Sign in <ArrowRight className="h-4 w-4" /></>}
          </button>
          
          <div className="text-center pt-4">
            <p className="text-[var(--color-muted)] text-sm">
              Don't have an account?{' '}
              <Link href="/register" className="auth-link">
                Register here
              </Link>
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
