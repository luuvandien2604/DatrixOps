'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Language = 'en' | 'vi';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  isVi: boolean;
  t: (en: string, vi: string) => string;
}

const defaultContext: LanguageContextType = {
  lang: 'en',
  setLang: () => {},
  isVi: false,
  t: (en: string, vi: string) => vi || en,
};

const LanguageContext = createContext<LanguageContextType>(defaultContext);

const STORAGE_KEY = 'datrixops_dashboard_lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('vi');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
      if (saved === 'en' || saved === 'vi') {
        setLangState(saved);
      } else {
        // Detect browser language if no preference set
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('vi')) {
          setLangState('vi');
        } else {
          setLangState('en');
        }
      }
    } catch {
      // LocalStorage might be disabled in private browsing
    }
  }, []);

  const setLang = (nextLang: Language) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {
      // Ignore storage errors
    }
  };

  const isVi = mounted ? lang === 'vi' : true;

  const t = (en: string, vi: string): string => {
    return isVi ? vi : en;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, isVi, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
