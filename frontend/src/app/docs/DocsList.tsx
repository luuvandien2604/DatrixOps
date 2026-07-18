"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DocMeta } from '@/lib/docs';
import { ArrowUpRight, BookOpenText } from 'lucide-react';

export default function DocsList({ docs }: { docs: DocMeta[] }) {
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

  // Filter docs based on authentication
  const visibleDocs = docs.filter(doc => {
    if (doc.role === 'public') return true;
    if (doc.role === 'user' && isAuthenticated) return true;
    // Tạm thời nếu là admin thì cũng cần role tương ứng (chưa triển khai role admin nên cho phép user xem)
    if (doc.role === 'admin' && isAuthenticated) return true; 
    return false;
  });

  return (
    <div className="docs-grid">
      {visibleDocs.length === 0 ? (
        <p className="text-foreground-muted">Không có tài liệu nào hiển thị.</p>
      ) : (
        visibleDocs.map(doc => (
          <Link href={`/docs/${doc.slug}`} key={doc.slug} className="docs-card glass-card">
            <div className="docs-card-icon"><BookOpenText className="h-5 w-5" /></div>
            <span className="docs-role">{doc.role}</span>
            <h2>{doc.title}</h2>
            {doc.description && <p>{doc.description}</p>}
            <div className="docs-card-link">
              Đọc hướng dẫn <ArrowUpRight className="h-4 w-4" />
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
