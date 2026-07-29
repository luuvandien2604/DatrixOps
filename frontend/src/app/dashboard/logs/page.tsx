'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';
import {
  Check,
  Copy,
  Download,
  FileText,
  Loader2,
  PauseCircle,
  Search,
  Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LogEntry {
  id: string;
  timestamp: string;
  server_id?: string;
  server_name: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
}

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details?: Record<string, unknown> | null;
  created_at: string;
}

interface LogServer {
  id: string;
  name: string;
  ip_address?: string;
  status?: string;
  os_info?: string | {
    os_family?: string;
    os_name?: string;
    platform?: string;
    version?: string;
  };
}

type LogType = 'all' | 'audit' | 'system' | 'docker' | 'agent';

const MAX_VISIBLE_LOGS = 500;
const MAX_DETAIL_LENGTH = 600;
const MIN_LOG_READ_AGENT_VERSION = '1.5.2';

const versionAtLeast = (current: string | undefined, minimum: string) => {
  if (!current) return false;
  const parse = (value: string) => value.replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const currentParts = parse(current);
  const minimumParts = parse(minimum);
  for (let index = 0; index < Math.max(currentParts.length, minimumParts.length); index += 1) {
    if ((currentParts[index] || 0) > (minimumParts[index] || 0)) return true;
    if ((currentParts[index] || 0) < (minimumParts[index] || 0)) return false;
  }
  return true;
};

const classifyAuditLevel = (action: string): LogEntry['level'] => {
  const normalized = action.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('delete') || normalized.includes('uninstall')) return 'error';
  if (normalized.includes('update') || normalized.includes('restart') || normalized.includes('reboot')) return 'warn';
  return 'info';
};

const stringifyDetail = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const compactDetail = (value: unknown): string => {
  const text = stringifyDetail(value);
  return text.length > MAX_DETAIL_LENGTH ? `${text.slice(0, MAX_DETAIL_LENGTH)}...` : text;
};

const formatAuditMessage = (log: AuditLog): string => {
  const details = log.details || {};
  const detailPairs = Object.entries(details)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${compactDetail(value)}`);
  const subject = `${log.resource_type || 'RESOURCE'} ${log.resource_id || ''}`.trim();
  return `${log.action}${subject ? ` on ${subject}` : ''}${detailPairs.length ? ` | ${detailPairs.join(' ')}` : ''}`;
};

export default function LogsPage() {
  const [servers, setServers] = useState<LogServer[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>('all');
  const [logLevel, setLogLevel] = useState<string>('all');
  const [logType, setLogType] = useState<LogType>('all');
  const [remoteLogSource, setRemoteLogSource] = useState('journal');
  const [remoteLogLines, setRemoteLogLines] = useState('200');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [fetchingRemoteLogs, setFetchingRemoteLogs] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [serverData, auditData] = await Promise.all([
          apiClient('/servers').catch(() => []),
          apiClient('/audit-logs'),
        ]);

        if (cancelled) return;

        const serverList = Array.isArray(serverData) ? serverData : [];
        const serverById = new Map<string, LogServer>(serverList.map((server: LogServer) => [server.id, server]));
        const auditRows: AuditLog[] = Array.isArray(auditData) ? auditData : [];

        setServers(serverList);
        setLogs(auditRows.map((auditLog) => {
          const server = serverById.get(auditLog.resource_id);
          return {
            id: auditLog.id,
            timestamp: auditLog.created_at,
            server_id: auditLog.resource_type === 'SERVER' ? auditLog.resource_id : undefined,
            server_name: server?.name || auditLog.resource_type || 'control-plane',
            level: classifyAuditLevel(auditLog.action),
            source: `audit:${(auditLog.resource_type || 'system').toLowerCase()}`,
            message: formatAuditMessage(auditLog),
          };
        }));
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setLogs([]);
        setLoadError(err instanceof Error ? err.message : 'Failed to load logs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return logs.filter(log => {
      if (selectedServerId !== 'all') {
        if (log.server_id !== selectedServerId) return false;
      }
      if (logLevel !== 'all' && log.level !== logLevel) return false;
      if (logType === 'audit' && !log.source.startsWith('audit')) return false;
      if (logType === 'system' && !log.source.includes('systemd') && !log.source.includes('kernel')) return false;
      if (logType === 'docker' && !log.source.startsWith('docker')) return false;
      if (logType === 'agent' && !log.source.includes('agent')) return false;

      if (q) {
        return (
          log.message.toLowerCase().includes(q) ||
          log.server_name.toLowerCase().includes(q) ||
          log.source.toLowerCase().includes(q) ||
          (log.server_id || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, selectedServerId, logLevel, logType, searchQuery]);

  const visibleLogs = useMemo(() => filteredLogs.slice(0, MAX_VISIBLE_LOGS), [filteredLogs]);
  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const selectedServerOSInfo = (() => {
    if (!selectedServer?.os_info) return {};
    if (typeof selectedServer.os_info === 'object') return selectedServer.os_info;
    try {
      return JSON.parse(selectedServer.os_info) as {
        os_family?: string;
        os_name?: string;
        platform?: string;
        version?: string;
      };
    } catch {
      return {};
    }
  })();
  const selectedServerOS = (() => {
    if (!selectedServer?.os_info) return 'unknown';
    return String(
      selectedServerOSInfo.os_family ||
      selectedServerOSInfo.os_name ||
      selectedServerOSInfo.platform ||
      '',
    ).toLowerCase();
  })();
  const selectedServerAgentVersion = typeof selectedServerOSInfo.version === 'string'
    ? selectedServerOSInfo.version.trim()
    : '';
  const selectedServerIsLinux = ['linux', 'ubuntu', 'debian', 'centos', 'rocky', 'alma', 'fedora', 'alpine']
    .some(marker => selectedServerOS.includes(marker));
  const selectedServerSupportsLogRead = versionAtLeast(selectedServerAgentVersion, MIN_LOG_READ_AGENT_VERSION);
  const canFetchRemoteLogs = selectedServerId !== 'all'
    && selectedServer?.status === 'online'
    && selectedServerIsLinux
    && selectedServerSupportsLogRead;
  const remoteLogReadiness = (() => {
    if (fetchingRemoteLogs) return 'Fetching log snapshot…';
    if (selectedServerId === 'all') return 'Select one Linux server first';
    if (!selectedServer) return 'Selected server is unavailable';
    if (selectedServer.status !== 'online') return 'Selected server is offline';
    if (!selectedServerIsLinux) return 'Only online Linux agents are supported';
    if (!selectedServerSupportsLogRead) {
      return `Update Agent to ${MIN_LOG_READ_AGENT_VERSION}+ before reading logs${selectedServerAgentVersion ? ` (current ${selectedServerAgentVersion})` : ''}`;
    }
    return 'Ready to fetch read-only logs';
  })();
  const fetchLogsLabel = canFetchRemoteLogs ? 'Fetch logs' : selectedServerSupportsLogRead ? 'Select server' : 'Update agent';

  const copyAllLogs = async () => {
    const text = visibleLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.server_name}] [${l.source}] ${l.message}`).join('\n');
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
    const text = visibleLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.server_name}] [${l.source}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `datrixops-logs-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Log file downloaded');
  };

  const fetchRemoteLogs = async () => {
    if (!canFetchRemoteLogs || !selectedServer) {
      toast.error(remoteLogReadiness);
      return;
    }
    setFetchingRemoteLogs(true);
    try {
      const payload = {
        source: remoteLogSource,
        unit: '',
        lines: remoteLogLines,
      };
      const task = await apiClient(`/servers/${selectedServer.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'log_read',
          payload: JSON.stringify(payload),
          idempotency_key: `log-read-${selectedServer.id}-${remoteLogSource}-${Date.now()}`,
          timeout_seconds: 60,
        }),
      });

      let taskResult: { status: string; result?: string } | null = null;
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        taskResult = await apiClient(`/servers/${selectedServer.id}/tasks/${task.id}`);
        if (taskResult?.status === 'completed' || taskResult?.status === 'failed') break;
      }

      if (!taskResult || (taskResult.status !== 'completed' && taskResult.status !== 'failed')) {
        toast.error('Log read task is still running. Try again in a few seconds.');
        return;
      }
      const finalStatus = taskResult.status;
      const resultText = taskResult.result || '';
      const agentDoesNotSupportLogRead = resultText.toLowerCase().includes('unknown task type: log_read');
      const displayText = agentDoesNotSupportLogRead
        ? `Agent update required: read-only log fetch needs Agent ${MIN_LOG_READ_AGENT_VERSION} or newer. This agent has not activated the log_read handler yet.`
        : resultText;
      if (agentDoesNotSupportLogRead) {
        toast.error(`Update this agent to ${MIN_LOG_READ_AGENT_VERSION}+ before fetching logs`);
      }
      const now = new Date().toISOString();
      const remoteEntries = displayText.split('\n').filter(Boolean).slice(-500).map((line, index) => ({
        id: `remote-${task.id}-${index}`,
        timestamp: now,
        server_id: selectedServer.id,
        server_name: selectedServer.name,
        level: finalStatus === 'failed' || agentDoesNotSupportLogRead ? 'error' as const : classifyLineLevel(line),
        source: `agent:${remoteLogSource}`,
        message: line,
      }));
      setLogs((current) => [...remoteEntries, ...current].slice(0, 1000));
      setLogType('all');
      toast.success(`Fetched ${remoteEntries.length} log lines`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch remote logs');
    } finally {
      setFetchingRemoteLogs(false);
    }
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
          <button type="button" disabled className="ops-button secondary" title="Continuous live tail will be enabled after the read-only fetch path is stable">
            <PauseCircle className="w-4 h-4" />
            Live tail next
          </button>

          <button disabled={visibleLogs.length === 0} onClick={copyAllLogs} className="ops-button secondary">
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            Copy
          </button>

          <button disabled={visibleLogs.length === 0} onClick={downloadLogs} className="ops-button secondary">
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
              { value: 'audit', label: 'Audit Stream' },
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

      <div className="ops-panel surface-regular no-hover-lift grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_180px_220px_auto]">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-[var(--color-muted)]">Read-only agent log source</label>
          <CustomSelect
            value={remoteLogSource}
            onChange={setRemoteLogSource}
            options={[
	              { value: 'journal', label: 'systemd journal' },
	              { value: 'nginx_access', label: 'Nginx access log' },
	              { value: 'nginx_error', label: 'Nginx error log' },
	              { value: 'mysql_error', label: 'MySQL/MariaDB error log' },
	            ]}
            className="w-full"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-[var(--color-muted)]">Lines</label>
          <CustomSelect
            value={remoteLogLines}
            onChange={setRemoteLogLines}
            options={[
              { value: '100', label: '100 lines' },
              { value: '200', label: '200 lines' },
              { value: '500', label: '500 lines' },
            ]}
            className="w-full"
          />
        </div>
        <div className={`self-end rounded-md border px-3 py-2 text-xs font-semibold ${
          canFetchRemoteLogs
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }`}>
          {remoteLogReadiness}
        </div>
        <button
          type="button"
          onClick={() => void fetchRemoteLogs()}
          disabled={!canFetchRemoteLogs || fetchingRemoteLogs}
          className="ops-button primary self-end"
          title={remoteLogReadiness}
        >
          {fetchingRemoteLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
          {fetchingRemoteLogs ? 'Fetching…' : fetchLogsLabel}
        </button>
      </div>

      {/* Terminal Log Console Window */}
      <div className="log-console ops-panel no-hover-lift overflow-hidden rounded-xl font-mono text-xs">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-semibold text-slate-200">live-stream.log</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              {loading ? 'loading' : `${filteredLogs.length} entries`}
            </span>
            {filteredLogs.length > MAX_VISIBLE_LOGS && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                showing latest {MAX_VISIBLE_LOGS}
              </span>
            )}
          </div>

          <span className="status-badge disabled">AUDIT STREAM</span>
        </div>

        {/* Console Body */}
        <div className="p-4 max-h-[550px] overflow-y-auto space-y-2 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-500 font-sans">
              Loading operational log records...
            </div>
          ) : loadError ? (
            <div className="py-12 text-center text-rose-300 font-sans">
              Unable to load logs: {loadError}
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-sans">
              No log records match the current filters.
            </div>
          ) : (
            visibleLogs.map((log, idx) => (
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

function classifyLineLevel(line: string): LogEntry['level'] {
  const normalized = line.toLowerCase();
  if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('panic')) return 'error';
  if (normalized.includes('warn') || normalized.includes('denied') || normalized.includes('timeout')) return 'warn';
  if (normalized.includes('debug')) return 'debug';
  return 'info';
}
