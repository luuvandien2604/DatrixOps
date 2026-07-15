"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DocMeta } from '@/lib/docs';

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
    <div className="grid gap-6 md:grid-cols-2">
      {visibleDocs.length === 0 ? (
        <p className="text-foreground-muted">Không có tài liệu nào hiển thị.</p>
      ) : (
        visibleDocs.map(doc => (
          <Link href={`/docs/${doc.slug}`} key={doc.slug} className="glass-card p-6 block hover:bg-white/5 transition-colors">
            <h2 className="text-xl font-semibold mb-2">{doc.title}</h2>
            {doc.description && <p className="text-foreground-muted">{doc.description}</p>}
            <div className="mt-4">
              <span className="text-xs px-2 py-1 bg-white/10 rounded-full">{doc.role}</span>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
