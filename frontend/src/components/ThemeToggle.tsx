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
      aria-label={mounted ? `Chuyển sang giao diện ${targetTheme === 'light' ? 'sáng' : 'tối'}` : 'Đổi giao diện'}
      title={mounted ? `Chuyển sang ${targetTheme === 'light' ? 'Light mode' : 'Dark mode'}` : 'Theme'}
      suppressHydrationWarning
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
