"use client";

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { ArrowLeft, LockKeyhole } from 'lucide-react';

interface DocMeta {
  slug: string;
  title: string;
  description?: string;
  role: string;
}

export default function DocViewer({ meta, content }: { meta: DocMeta, content: string }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  if (!mounted) return null;

  const canView = meta.role === 'public' || isAuthenticated;

  if (!canView) {
    return (
      <div className="docs-locked glass-card">
        <div className="docs-card-icon"><LockKeyhole className="h-5 w-5" /></div>
        <h1>Bạn không có quyền truy cập</h1>
        <p className="text-foreground-muted mb-8">Vui lòng đăng nhập để xem tài liệu này.</p>
        <Link href="/login" className="landing-cta primary">
          Đăng nhập ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="doc-viewer">
      <aside className="doc-viewer-meta">
        <div className="sticky top-24">
          <Link href="/docs" className="doc-back">
            <ArrowLeft className="h-4 w-4" />
            Quay lại danh sách
          </Link>
          <span className="docs-role">{meta.role}</span>
        </div>
      </aside>
      
      <article className="doc-article">
        <div className="glass-card prose prose-invert max-w-none">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
