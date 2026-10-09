'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Command, KeyRound, CheckCircle2 } from 'lucide-react';
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
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    if (password.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
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
        setError(msg || 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
      } else {
        setError('Không thể đặt lại mật khẩu. Vui lòng thử lại.');
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
        <h1>Thiết lập mật khẩu mới</h1>
        <p>Nhập mật khẩu mới cho tài khoản của bạn.</p>
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
            <span className="text-base">Đổi mật khẩu thành công!</span>
          </div>
          <p className="text-[var(--color-muted)]">
            Mật khẩu của bạn đã được cập nhật. Đang chuyển hướng đến trang đăng nhập...
          </p>
          <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
            Đăng nhập ngay <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : !token ? (
        <div className="space-y-4 text-sm text-[var(--color-muted)]">
          <div className="p-4 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] space-y-2">
            <p className="font-medium text-[var(--color-foreground)]">Thiếu mã xác nhận đặt lại mật khẩu</p>
            <p>
              Đường dẫn này không chứa mã token hợp lệ. Vui lòng yêu cầu lại từ trang Quên mật khẩu hoặc đổi mật khẩu trực tiếp trên máy chủ qua SSH:
            </p>
            <pre className="p-2 rounded bg-black/40 text-[var(--mint)] font-mono text-xs overflow-x-auto">
              datrix reset-password
            </pre>
          </div>
          <Link href="/login" className="auth-submit flex items-center justify-center gap-2">
            Quay lại trang Đăng nhập
          </Link>
        </div>
      ) : (
        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label htmlFor="new-password" className="auth-label">Mật khẩu mới</label>
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
            <label htmlFor="confirm-password" className="auth-label">Xác nhận mật khẩu mới</label>
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
            {loading ? 'Đang cập nhật...' : <>Lưu mật khẩu mới <ArrowRight className="h-4 w-4" /></>}
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
        <ArrowLeft className="h-4 w-4" /> Quay lại đăng nhập
      </Link>
      <ThemeToggle className="auth-theme-toggle" />
      <Suspense fallback={<div className="text-center p-8 text-sm text-[var(--color-muted)]">Đang tải...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
