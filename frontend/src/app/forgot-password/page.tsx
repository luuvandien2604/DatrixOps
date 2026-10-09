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
      // For security, still show success message unless server error
      if (err instanceof Error && err.message.includes('rate limit')) {
        setError('Quá nhiều yêu cầu. Vui lòng đợi trong giây lát.');
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
        <ArrowLeft className="h-4 w-4" /> Quay lại đăng nhập
      </Link>
      <ThemeToggle className="auth-theme-toggle" />
      <div className="auth-card ops-panel">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6 hover:opacity-80 transition-opacity">
            <span className="brand-orbit"><Command className="h-4 w-4" /></span>
            <span className="text-sm font-semibold tracking-[.15em]">DATRIX<span className="text-[var(--mint)]">OPS</span></span>
          </Link>
          <div className="auth-icon"><KeyRound className="h-5 w-5" /></div>
          <h1>Đặt lại mật khẩu</h1>
          <p>Khôi phục quyền truy cập vào tài khoản quản trị của bạn.</p>
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
                <span>Yêu cầu đặt lại đã được tiếp nhận</span>
              </div>
              <p className="text-[var(--color-muted)] leading-relaxed">
                Nếu tài khoản <strong>{email}</strong> tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến email này (nếu đã cấu hình gửi mail SMTP).
              </p>
            </div>

            <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border-color)] text-xs text-[var(--color-muted)] space-y-2">
              <div className="flex items-center gap-2 font-medium text-[var(--color-foreground)]">
                <Terminal className="h-4 w-4 text-[var(--mint)]" />
                <span>Quản trị viên máy chủ (Server Admin):</span>
              </div>
              <p>
                Bạn có thể đặt lại mật khẩu ngay lập tức từ terminal máy chủ mà không cần email bằng lệnh:
              </p>
              <pre className="p-2 rounded bg-black/40 text-[var(--mint)] font-mono text-xs overflow-x-auto">
                datrix reset-password
              </pre>
            </div>

            <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
              Quay lại trang Đăng nhập <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="reset-email" className="auth-label">Email tài khoản</label>
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
              {loading ? 'Đang xử lý...' : <>Tiếp tục <ArrowRight className="h-4 w-4" /></>}
            </button>

            <div className="p-4 rounded-lg bg-[var(--background-secondary)] border border-[var(--border-color)] text-xs text-[var(--color-muted)] space-y-1 mt-4">
              <div className="flex items-center gap-1.5 font-medium text-[var(--color-foreground)]">
                <Terminal className="h-3.5 w-3.5 text-[var(--mint)]" />
                <span>Đặt lại mật khẩu trực tiếp qua SSH:</span>
              </div>
              <p>
                Trên terminal máy chủ, gõ <code>datrix</code> và chọn <strong>Reset user password</strong> để đổi mật khẩu trong 5 giây.
              </p>
            </div>

            <p className="pt-2 text-center text-sm text-[var(--color-muted)]">
              Nhớ mật khẩu? <Link href="/login" className="auth-link">Đăng nhập</Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
