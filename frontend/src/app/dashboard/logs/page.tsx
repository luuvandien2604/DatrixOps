'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';
import {
  FileText, Search, Download, Copy, Check, PauseCircle, Terminal
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LogEntry {
  id: string;
  timestamp: string;
  server_name: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

interface LogServer {
  id: string;
  name: string;
  ip_address?: string;
}

type LogType = 'all' | 'system' | 'docker' | 'agent';

export default function LogsPage() {
  const [servers, setServers] = useState<LogServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('all');
  const [logLevel, setLogLevel] = useState<string>('all');
  const [logType, setLogType] = useState<LogType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const logs: LogEntry[] = [];

  useEffect(() => {
    // Fetch server list for selector
    apiClient('/servers')
      .then(data => setServers(Array.isArray(data) ? data : []))
      .catch(() => setServers([]));

  }, []);

  const filteredLogs = logs.filter(log => {
    if (selectedServerId !== 'all') {
      const s = servers.find(item => item.id === selectedServerId);
      if (s && log.server_name !== s.name) return false;
    }
    if (logLevel !== 'all' && log.level !== logLevel) return false;
    if (logType === 'system' && !log.source.includes('systemd') && !log.source.includes('kernel')) return false;
    if (logType === 'docker' && !log.source.startsWith('docker')) return false;
    if (logType === 'agent' && !log.source.includes('agent')) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.message.toLowerCase().includes(q) ||
        log.server_name.toLowerCase().includes(q) ||
        log.source.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const copyAllLogs = async () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.server_name}] [${l.source}] ${l.message}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Logs copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  const downloadLogs = () => {
    const text = filteredLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.server_name}] [${l.source}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datrixops-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Log file downloaded');
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1 flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            Log Explorer
          </h1>
          <p className="text-sm text-[var(--color-muted)]">Search and inspect agent, system and container log streams.</p>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" disabled className="ops-button secondary" title="Log ingestion is not available from the current backend">
            <PauseCircle className="w-4 h-4" />
            Live tail unavailable
          </button>

          <button disabled={filteredLogs.length === 0} onClick={copyAllLogs} className="ops-button secondary">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>

          <button disabled={filteredLogs.length === 0} onClick={downloadLogs} className="ops-button secondary">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Control Filters */}
      <div className="ops-panel surface-regular no-hover-lift p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Selector */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Server Source</label>
          <CustomSelect
            value={selectedServerId}
            onChange={setSelectedServerId}
            options={[
              { value: 'all', label: 'All Servers Fleet' },
              ...servers.map(s => ({ value: s.id, label: s.name, subLabel: s.ip_address || 'No IP' }))
            ]}
            className="w-full"
          />
        </div>

        {/* Log Level Selector */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Log Level</label>
          <CustomSelect
            value={logLevel}
            onChange={setLogLevel}
            options={[
              { value: 'all', label: 'All Levels (INFO, WARN, ERROR)' },
              { value: 'info', label: 'INFO' },
              { value: 'warn', label: 'WARN' },
              { value: 'error', label: 'ERROR' },
              { value: 'debug', label: 'DEBUG' },
            ]}
            className="w-full"
          />
        </div>

        {/* Source Category */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Source Category</label>
          <CustomSelect
            value={logType}
            onChange={(val) => setLogType(val as LogType)}
            options={[
              { value: 'all', label: 'All Sources' },
              { value: 'agent', label: 'DatrixOps Agent' },
              { value: 'docker', label: 'Docker Containers' },
              { value: 'system', label: 'Systemd Services' },
            ]}
            className="w-full"
          />
        </div>

        {/* Search Query */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Filter Keyword</label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)] pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search message text..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '44px' }}
              className="w-full pr-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-blue-500 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Terminal Log Console Window */}
      <div className="log-console ops-panel no-hover-lift overflow-hidden rounded-xl font-mono text-xs">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-200">live-stream.log</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {filteredLogs.length} entries
            </span>
          </div>

          <span className="status-badge disabled">INGESTION UNAVAILABLE</span>
        </div>

        {/* Console Body */}
        <div className="p-4 max-h-[550px] overflow-y-auto space-y-2 custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-sans">
              No real log records are available. Agent log ingestion is not implemented by the current backend.
            </div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div key={log.id || idx} className="flex flex-col sm:flex-row sm:items-start gap-2 hover:bg-slate-900/60 p-1.5 rounded transition-colors group">
                <span className="text-slate-500 shrink-0 select-none w-24">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>

                <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0 ${
                  log.level === 'error'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : log.level === 'warn'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {log.level}
                </span>

                <span className="text-blue-400 font-semibold shrink-0 w-36 truncate" title={log.server_name}>
                  [{log.server_name}]
                </span>

                <span className="text-slate-400 font-semibold shrink-0 w-32 truncate" title={log.source}>
                  {log.source}:
                </span>

                <span className={`break-all ${
                  log.level === 'error' ? 'text-rose-300 font-semibold' : log.level === 'warn' ? 'text-amber-200' : 'text-slate-200'
                }`}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
