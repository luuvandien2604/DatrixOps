'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import {
  Search, Server, Globe2, Activity, Bell, FileText, Settings2,
  Zap, ArrowRight, Command, CornerDownLeft
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: 'Navigation' | 'Servers' | 'Quick Actions';
  icon: React.ElementType;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch servers when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      apiClient('/servers')
        .then((data) => setServers(Array.isArray(data) ? data : []))
        .catch(() => setServers([]));
    }
  }, [isOpen]);

  // Built-in pages navigation
  const staticNavigationItems: CommandItem[] = [
    {
      id: 'nav-overview',
      title: 'Dashboard Overview',
      subtitle: 'System status & key metrics summary',
      category: 'Navigation',
      icon: Activity,
      action: () => { router.push('/dashboard'); onClose(); }
    },
    {
      id: 'nav-servers',
      title: 'Server Management',
      subtitle: 'Manage server fleet & auto-update agent settings',
      category: 'Navigation',
      icon: Server,
      action: () => { router.push('/dashboard/servers'); onClose(); }
    },
    {
      id: 'nav-websites',
      title: 'Uptime & SSL Monitoring',
      subtitle: 'Monitor domain availability and SSL certificates',
      category: 'Navigation',
      icon: Globe2,
      action: () => { router.push('/dashboard/websites'); onClose(); }
    },
    {
      id: 'nav-logs',
      title: 'Unified System & Container Logs',
      subtitle: 'Real-time log viewer for agents and docker containers',
      category: 'Navigation',
      icon: FileText,
      action: () => { router.push('/dashboard/logs'); onClose(); }
    },
    {
      id: 'nav-alerts',
      title: 'Alerts & Incidents',
      subtitle: 'Active incident management and notifications',
      category: 'Navigation',
      icon: Bell,
      action: () => { router.push('/dashboard/alerts'); onClose(); }
    },
    {
      id: 'nav-settings',
      title: 'Workspace Settings',
      subtitle: 'Configure account and API keys',
      category: 'Navigation',
      icon: Settings2,
      action: () => { router.push('/dashboard/settings'); onClose(); }
    },
  ];

  // Map fetched servers into command items
  const serverItems: CommandItem[] = servers.map((s) => ({
    id: `server-${s.id}`,
    title: s.name,
    subtitle: `${s.ip_address || 'No IP'} • Status: ${s.status.toUpperCase()} • Group: ${s.group_name || 'Default'}`,
    category: 'Servers',
    icon: Server,
    action: () => { router.push(`/dashboard/servers/${s.id}`); onClose(); }
  }));

  const allItems = [...staticNavigationItems, ...serverItems];

  const filteredItems = allItems.filter(item => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
      item.category.toLowerCase().includes(q)
    );
  });

  // Handle keyboard shortcuts (Esc, Up, Down, Enter)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % (filteredItems.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  }, [isOpen, filteredItems, selectedIndex, onClose]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="glass-card w-full max-w-2xl bg-[#0B0F17] border-white/10 shadow-2xl rounded-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <Search className="w-5 h-5 text-blue-400 shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Type a command, server name, IP or page..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            className="w-full bg-transparent text-base text-[var(--foreground)] placeholder-[var(--color-muted)] outline-none"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-[var(--color-muted)] border border-white/10">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 divide-y divide-white/5 custom-scrollbar">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--color-muted)]">
              No matching commands or servers found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                    isSelected ? 'bg-blue-600/20 border border-blue-500/30' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-2 rounded-lg ${isSelected ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-[var(--color-muted)]'}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--foreground)] truncate flex items-center gap-2">
                        {item.title}
                        {item.category === 'Servers' && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            SERVER
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-[var(--color-muted)] truncate mt-0.5">{item.subtitle}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] shrink-0">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-blue-400 font-mono text-[11px]">
                        Select <CornerDownLeft className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-[var(--color-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-[10px]">↑↓</kbd> Navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-white/10 rounded font-mono text-[10px]">↵</kbd> Open</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-mono text-blue-400">
            <Command className="w-3.5 h-3.5" /> DatrixOps Command Studio
          </div>
        </div>
      </div>
    </div>
  );
}
