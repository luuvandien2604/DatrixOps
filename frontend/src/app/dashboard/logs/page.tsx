'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import {
  FileText, Server, RefreshCw, Search, Download, Copy,
  Check, Pause, Play, Terminal, AlertTriangle, Info, CheckCircle2
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

export default function LogsPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('all');
  const [logLevel, setLogLevel] = useState<string>('all');
  const [logType, setLogType] = useState<'all' | 'system' | 'docker' | 'agent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(true);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Fetch server list for selector
    apiClient('/servers')
      .then(data => setServers(Array.isArray(data) ? data : []))
      .catch(() => setServers([]));

    generateMockInitialLogs();
    setLoading(false);
  }, []);

  // Poll / Stream simulated live logs when streaming is enabled
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const newLog = generateRandomLog(selectedServerId, servers);
      setLogs(prev => [...prev.slice(-499), newLog]);
    }, 3500);

    return () => clearInterval(interval);
  }, [isStreaming, selectedServerId, servers]);

  useEffect(() => {
    if (isStreaming) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isStreaming]);

  const generateMockInitialLogs = () => {
    const mockLogs: LogEntry[] = [
      {
        id: '1',
        timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        server_name: 'prod-api-sg-01',
        level: 'info',
        source: 'datrixops-agent',
        message: 'DatrixOps Agent v1.3.2 initialized. Connected to control plane.'
      },
      {
        id: '2',
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        server_name: 'prod-api-sg-01',
        level: 'info',
        source: 'systemd',
        message: 'Started Nginx HTTP and reverse proxy server.'
      },
      {
        id: '3',
        timestamp: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
        server_name: 'prod-db-postgres-01',
        level: 'warn',
        source: 'postgresql',
        message: 'PostgreSQL: process 14202 checkpointer sleeping for 300s'
      },
      {
        id: '4',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        server_name: 'prod-api-sg-01',
        level: 'info',
        source: 'docker:app-backend',
        message: 'HTTP GET /api/v1/servers status=200 latency=14.2ms'
      },
      {
        id: '5',
        timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
        server_name: 'prod-cache-redis-01',
        level: 'info',
        source: 'redis-server',
        message: 'DB loaded from disk: 0.042 seconds, 1420 keys loaded.'
      },
      {
        id: '6',
        timestamp: new Date(Date.now() - 1000 * 30).toISOString(),
        server_name: 'prod-api-sg-01',
        level: 'error',
        source: 'docker:auth-service',
        message: 'JWT verification warning: Token cache miss for user_id=usr_8921a. Refreshed from DB.'
      }
    ];
    setLogs(mockLogs);
  };

  const generateRandomLog = (currentServerId: string, serverList: any[]): LogEntry => {
    const levels: ('info' | 'warn' | 'error' | 'debug')[] = ['info', 'info', 'info', 'warn', 'info', 'debug'];
    const sources = ['datrixops-agent', 'docker:api-gateway', 'systemd', 'nginx', 'postgresql', 'kernel'];
    const messages = [
      'Heartbeat metric report submitted successfully (latency 12ms)',
      'HTTP POST /api/v1/servers/actions/update-agents status=200',
      'CPU usage spike detected: 42.1% across 8 cores',
      'Memory cache cleanup freed 128MB resident memory',
      'SSL cert check for datrixops.vandien.space: Valid for 84 days',
      'Cron job discovery cycle completed. Found 4 scheduled tasks.'
    ];

    const targetServer = currentServerId !== 'all'
      ? serverList.find(s => s.id === currentServerId)?.name || 'prod-server-01'
      : (serverList.length > 0 ? serverList[Math.floor(Math.random() * serverList.length)].name : 'prod-api-sg-01');

    return {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      server_name: targetServer,
      level: levels[Math.floor(Math.random() * levels.length)],
      source: sources[Math.floor(Math.random() * sources.length)],
      message: messages[Math.floor(Math.random() * messages.length)]
    };
  };

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
            Unified Logs Studio
          </h1>
          <p className="text-sm text-[var(--color-muted)]">Real-time centralized log aggregator for infrastructure agents and containerized workloads</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsStreaming(!isStreaming)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border ${
              isStreaming
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25'
            }`}
          >
            {isStreaming ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isStreaming ? 'Streaming Live' : 'Stream Paused'}
          </button>

          <button onClick={copyAllLogs} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm border border-white/10 flex items-center gap-1.5 transition-colors">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>

          <button onClick={downloadLogs} className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm border border-white/10 flex items-center gap-1.5 transition-colors">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Control Filters */}
      <div className="glass-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Selector */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Server Source</label>
          <select
            value={selectedServerId}
            onChange={e => setSelectedServerId(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
          >
            <option value="all">All Servers Fleet</option>
            {servers.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.ip_address || 'No IP'})</option>
            ))}
          </select>
        </div>

        {/* Log Level Selector */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Log Level</label>
          <select
            value={logLevel}
            onChange={e => setLogLevel(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
          >
            <option value="all">All Levels (INFO, WARN, ERROR)</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </select>
        </div>

        {/* Source Category */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Source Category</label>
          <select
            value={logType}
            onChange={e => setLogType(e.target.value as any)}
            className="w-full px-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
          >
            <option value="all">All Sources</option>
            <option value="agent">DatrixOps Agent</option>
            <option value="docker">Docker Containers</option>
            <option value="system">Systemd Services</option>
          </select>
        </div>

        {/* Search Query */}
        <div>
          <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-1">Filter Keyword</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-[var(--color-muted)]" />
            <input
              type="text"
              placeholder="Search message text..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Terminal Log Console Window */}
      <div className="glass-card bg-slate-950 border-slate-800 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-200">live-stream.log</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {filteredLogs.length} entries
            </span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              LIVE STREAMS
            </span>
          </div>
        </div>

        {/* Console Body */}
        <div className="p-4 max-h-[550px] overflow-y-auto space-y-2 custom-scrollbar">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-sans">
              No logs matching the current filter criteria.
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
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
}
