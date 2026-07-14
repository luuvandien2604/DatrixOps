'use client';
import React from 'react';
import { Construction } from 'lucide-react';

export default function PerformancePage() {
  return (
    <div className="flex flex-col items-center justify-center h-[70vh] text-center">
      <div className="glass-card p-10 flex flex-col items-center max-w-md">
        <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mb-6">
          <Construction className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-[var(--foreground)] mb-3">Đang phát triển</h2>
        <p className="text-[var(--color-muted)] leading-relaxed">
          Tính năng này đang trong quá trình xây dựng. Vui lòng quay lại sau!
        </p>
      </div>
    </div>
  );
}
