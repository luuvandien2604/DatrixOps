"use client";

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';

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
      <div className="container mx-auto px-4 py-12 max-w-3xl text-center">
        <h1 className="text-3xl font-bold mb-4">Bạn không có quyền truy cập</h1>
        <p className="text-foreground-muted mb-8">Vui lòng đăng nhập để xem tài liệu này.</p>
        <Link href="/login" className="bg-accent-blue px-6 py-2 rounded-lg font-medium text-white hover:bg-blue-600 transition-colors">
          Đăng nhập ngay
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl flex flex-col md:flex-row gap-8">
      <div className="w-full md:w-1/4">
        <div className="sticky top-24 glass-card p-4">
          <Link href="/docs" className="text-sm text-foreground-muted hover:text-white flex items-center mb-4 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Quay lại danh sách
          </Link>
          <div className="mt-4">
            <span className="text-xs px-2 py-1 bg-white/10 rounded-full">{meta.role}</span>
          </div>
        </div>
      </div>
      
      <div className="w-full md:w-3/4">
        <div className="glass-card p-8 prose prose-invert max-w-none prose-a:text-accent-blue hover:prose-a:text-blue-400">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
