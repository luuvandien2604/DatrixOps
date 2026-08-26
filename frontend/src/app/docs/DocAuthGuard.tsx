'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock, LogIn, ArrowRight } from 'lucide-react';
import type { DocLocale } from '@/lib/docs';

interface DocAuthGuardProps {
  children: ReactNode;
  authRequired?: boolean;
  cloudOnly?: boolean;
  locale: DocLocale;
}

export default function DocAuthGuard({
  children,
  authRequired,
  cloudOnly,
  locale,
}: DocAuthGuardProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    setIsAuthenticated(Boolean(token));
  }, []);

  // Nếu tài liệu không yêu cầu xác thực hoặc bảo vệ Cloud
  if (!authRequired && !cloudOnly) {
    return <>{children}</>;
  }

  // Tránh flash nội dung trong lúc check auth ở client
  if (!mounted) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  const isEnglish = locale === 'en';

  // Trường hợp 1: Người dùng chưa đăng nhập
  if (authRequired && !isAuthenticated) {
    const loginHref = `/login?redirect=${encodeURIComponent(pathname)}`;
    return (
      <div className="ops-panel surface-regular my-8 overflow-hidden rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-8 text-center sm:p-12">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-[var(--foreground)] sm:text-2xl">
          {isEnglish ? 'Restricted Internal Documentation' : 'Tài liệu nội bộ bảo mật'}
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-muted)] sm:text-base leading-relaxed">
          {isEnglish
            ? 'This document outlines standard operating and release procedures for DatrixOps Cloud. You must sign in to your Cloud account to view this content.'
            : 'Tài liệu này chứa hướng dẫn quy trình phát triển và vận hành nội bộ của DatrixOps Cloud. Bạn cần đăng nhập vào tài khoản Cloud để xem nội dung.'}
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href={loginHref}
            className="ops-button primary inline-flex items-center gap-2 px-6 py-2.5 font-semibold text-sm shadow-lg shadow-blue-500/20"
          >
            <LogIn className="h-4 w-4" />
            {isEnglish ? 'Sign In to Access Docs' : 'Đăng nhập vào Cloud để đọc'}
          </Link>
          <Link
            href={isEnglish ? '/docs' : '/docs/vi'}
            className="ops-button secondary inline-flex items-center gap-2 text-sm text-[var(--color-muted)] hover:text-[var(--foreground)]"
          >
            {isEnglish ? 'Back to Public Docs' : 'Quay lại tài liệu chung'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // Trường hợp 2: Đã xác thực hoặc thỏa mãn điều kiện
  return <>{children}</>;
}
