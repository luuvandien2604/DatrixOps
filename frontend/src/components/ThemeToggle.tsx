'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = !mounted || resolvedTheme !== 'light';
  const targetTheme = isDark ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={() => setTheme(targetTheme)}
      aria-label={mounted ? `Switch to ${targetTheme === 'light' ? 'light' : 'dark'} mode` : 'Change theme'}
      title={mounted ? `Switch to ${targetTheme === 'light' ? 'light mode' : 'dark mode'}` : 'Theme'}
      suppressHydrationWarning
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
