'use client';

import { Languages } from 'lucide-react';
import { useLanguage } from './LanguageContext';

type LanguageToggleProps = {
  className?: string;
  showText?: boolean;
};

export function LanguageToggle({ className = '', showText = false }: LanguageToggleProps) {
  const { lang, setLang, isVi } = useLanguage();

  const toggleLanguage = () => {
    setLang(isVi ? 'en' : 'vi');
  };

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2.5 py-1 text-xs font-semibold text-[var(--foreground)] transition-colors duration-100 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
      aria-label={isVi ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}
      title={isVi ? 'Đổi ngôn ngữ sang English' : 'Switch language to Tiếng Việt'}
    >
      <Languages className="h-3.5 w-3.5 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
      <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)]">
        {lang.toUpperCase()}
      </span>
      {showText && (
        <span className="text-xs text-[var(--color-muted)] font-normal">
          {isVi ? 'Tiếng Việt' : 'English'}
        </span>
      )}
    </button>
  );
}

