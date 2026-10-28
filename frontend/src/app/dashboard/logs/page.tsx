'use client';
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/purity */

import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/lib/apiClient';
import { copyTextToClipboard } from '@/lib/clipboard';
import CustomSelect from '@/components/CustomSelect';
import {
  Check,
  Clock,
  Copy,
  Download,
  FileText,
  Loader2,
  PauseCircle,
  Search,
  Terminal,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/components/LanguageContext';

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
  snapshot?: string | {
    services?: Array<{ name: string; status?: string; source?: string }>;
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

type LogTimeRange = '15m' | '1h' | '3h' | '6h' | '24h' | '7d' | 'all' | 'custom';

export default function LogsPage() {
  const { t, isVi } = useLanguage();
  const [servers, setServers] = useState<LogServer[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>('all');
  const [logLevel, setLogLevel] = useState<string>('all');
  const [logType, setLogType] = useState<LogType>('all');
  const [timeRange, setTimeRange] = useState<LogTimeRange>('all');
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('00:00');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('23:59');
  const [timeRangeError, setTimeRangeError] = useState('');
  const [remoteLogSource, setRemoteLogSource] = useState('journal');
  const [remoteLogUnit, setRemoteLogUnit] = useState('');
  const [remoteLogLines, setRemoteLogLines] = useState('200');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [fetchingRemoteLogs, setFetchingRemoteLogs] = useState(false);

  const getCustomRange = React.useCallback(() => {
    if (!fromDate && !toDate) return { fromISO: '', toISO: '', fromTs: 0, toTs: Infinity, error: '' };
    let fromTs = 0;
    let toTs = Infinity;
    let fromISO = '';
    let toISO = '';

    if (fromDate) {
      const dt = new Date(`${fromDate}T${fromTime || '00:00'}:00`);
      if (isNaN(dt.getTime())) return { fromISO: '', toISO: '', fromTs: 0, toTs: Infinity, error: t('Invalid start date', 'Ngày bắt đầu không hợp lệ') };
      if (dt.getTime() > Date.now() + 5 * 60 * 1000) {
        return { fromISO: '', toISO: '', fromTs: 0, toTs: Infinity, error: t('Time window cannot be in the future.', 'Khoảng thời gian không thể ở tương lai.') };
      }
      fromTs = dt.getTime();
      fromISO = dt.toISOString();
    }
    if (toDate) {
      const dt = new Date(`${toDate}T${toTime || '23:59'}:59`);
      if (isNaN(dt.getTime())) return { fromISO: '', toISO: '', fromTs: 0, toTs: Infinity, error: t('Invalid end date', 'Ngày kết thúc không hợp lệ') };
      toTs = dt.getTime();
      toISO = dt.toISOString();
    }
    if (fromTs > 0 && toTs < Infinity && fromTs > toTs) {
      return { fromISO: '', toISO: '', fromTs: 0, toTs: Infinity, error: t('Start time cannot be after end time.', 'Thời gian bắt đầu không thể sau thời gian kết thúc.') };
    }
    return { fromISO, toISO, fromTs, toTs, error: '' };
  }, [fromDate, fromTime, toDate, toTime, t]);

  const loadLogs = React.useCallback(async () => {
    setTimeRangeError('');
    if (timeRange === 'custom') {
      const range = getCustomRange();
      if (range.error) {
        setTimeRangeError(range.error);
        return;
      }
    }

    setLoading(true);
    setLoadError(null);
    try {
      let auditUrl = '/audit-logs';
      const params = new URLSearchParams();
      if (timeRange !== 'all' && timeRange !== 'custom') {
        params.set('range', timeRange);
      } else if (timeRange === 'custom') {
        const range = getCustomRange();
        if (range.fromISO) params.set('from', range.fromISO);
        if (range.toISO) params.set('to', range.toISO);
      }
      if (params.toString()) {
        auditUrl += `?${params.toString()}`;
      }

      const [serverData, auditData] = await Promise.all([
        apiClient('/servers').catch(() => []),
        apiClient(auditUrl),
      ]);

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
      console.error(err);
      setLogs([]);
      setLoadError(err instanceof Error ? err.message : t('Failed to load logs', 'Không thể tải nhật ký'));
    } finally {
      setLoading(false);
    }
  }, [timeRange, getCustomRange, t]);

  useEffect(() => {
    void loadLogs();
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const sId = sp.get('server_id');
      const src = sp.get('source');
      const unit = sp.get('unit');
      const q = sp.get('q');
      if (sId) setSelectedServerId(sId);
      if (src) setRemoteLogSource(src);
      if (unit) setRemoteLogUnit(unit);
      if (q) setSearchQuery(q);
    }
  }, [loadLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const now = Date.now();
    let fromTs = 0;
    let toTs = Infinity;

    if (timeRange === '15m') fromTs = now - 15 * 60 * 1000;
    else if (timeRange === '1h') fromTs = now - 60 * 60 * 1000;
    else if (timeRange === '3h') fromTs = now - 3 * 3600 * 1000;
    else if (timeRange === '6h') fromTs = now - 6 * 3600 * 1000;
    else if (timeRange === '24h') fromTs = now - 24 * 3600 * 1000;
    else if (timeRange === '7d') fromTs = now - 7 * 86400 * 1000;
    else if (timeRange === 'custom') {
      const range = getCustomRange();
      if (!range.error) {
        fromTs = range.fromTs;
        toTs = range.toTs;
      }
    }

    return logs.filter(log => {
      if (fromTs > 0 || toTs < Infinity) {
        const logTs = new Date(log.timestamp).getTime();
        if (!isNaN(logTs)) {
          if (logTs < fromTs || logTs > toTs) return false;
        }
      }

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
  }, [logs, selectedServerId, logLevel, logType, timeRange, getCustomRange, searchQuery]);

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
  const availableServices = (() => {
    if (!selectedServer?.snapshot) return [];
    try {
      const snap = typeof selectedServer.snapshot === 'string'
        ? JSON.parse(selectedServer.snapshot)
        : selectedServer.snapshot;
      const svcs: Array<{ name: string; status?: string }> = Array.isArray(snap?.services) ? snap.services : [];
      return svcs
        .map(s => s.name?.trim())
        .filter((name): name is string => Boolean(name));
    } catch {
      return [];
    }
  })();
  const selectedServerIsLinux = ['linux', 'ubuntu', 'debian', 'centos', 'rocky', 'alma', 'fedora', 'alpine']
    .some(marker => selectedServerOS.includes(marker));
  const selectedServerSupportsLogRead = versionAtLeast(selectedServerAgentVersion, MIN_LOG_READ_AGENT_VERSION);
  const canFetchRemoteLogs = selectedServerId !== 'all'
    && selectedServer?.status === 'online'
    && selectedServerIsLinux
    && selectedServerSupportsLogRead;

  const remoteLogReadiness = (() => {
    if (fetchingRemoteLogs) return t('Fetching log snapshot…', 'Đang truy vấn nhật ký…');
    if (selectedServerId === 'all') return t('Select a server to fetch logs', 'Chọn một máy chủ để truy vấn nhật ký');
    if (!selectedServer) return t('Selected server is unavailable', 'Máy chủ được chọn không khả dụng');
    if (selectedServer.status !== 'online') return t('Selected server is offline', 'Máy chủ đang ngoại tuyến');
    if (!selectedServerIsLinux) return t('Only online Linux agents are supported', 'Chỉ hỗ trợ agent Linux đang trực tuyến');
    if (!selectedServerSupportsLogRead) {
      return t(
        `Update Agent to ${MIN_LOG_READ_AGENT_VERSION}+ before reading logs${selectedServerAgentVersion ? ` (current ${selectedServerAgentVersion})` : ''}`,
        `Cập nhật Agent lên ${MIN_LOG_READ_AGENT_VERSION}+ để xem nhật ký${selectedServerAgentVersion ? ` (hiện tại ${selectedServerAgentVersion})` : ''}`
      );
    }
    return t('Ready to fetch read-only logs', 'Sẵn sàng truy vấn nhật ký');
  })();

  const fetchLogsLabel = t('Fetch logs', 'Truy vấn nhật ký');

  const copyAllLogs = async () => {
    const text = visibleLogs.map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] [${l.server_name}] [${l.source}] ${l.message}`).join('\n');
    try {
      await copyTextToClipboard(text);
      setCopied(true);
      toast.success(t('Logs copied to clipboard', 'Đã sao chép nhật ký vào bộ nhớ tạm'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('Failed to copy logs', 'Không thể sao chép nhật ký'));
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
    toast.success(t('Log file downloaded', 'Đã tải xuống tệp nhật ký'));
  };

  const fetchRemoteLogs = async () => {
    if (!canFetchRemoteLogs || !selectedServer) {
      toast.error(remoteLogReadiness);
      return;
    }
    setFetchingRemoteLogs(true);
    try {
      let sinceVal = '';
      if (timeRange === '15m') sinceVal = '15 minutes ago';
      else if (timeRange === '1h') sinceVal = '1 hour ago';
      else if (timeRange === '3h') sinceVal = '3 hours ago';
      else if (timeRange === '6h') sinceVal = '6 hours ago';
      else if (timeRange === '24h') sinceVal = '24 hours ago';
      else if (timeRange === '7d') sinceVal = '7 days ago';
      else if (timeRange === 'custom' && fromDate) {
        sinceVal = `${fromDate} ${fromTime || '00:00'}:00`;
      }

      const effectiveUnit = remoteLogUnit.trim();
      const q = searchQuery.trim();

      const payload: Record<string, string> = {
        source: remoteLogSource,
        unit: effectiveUnit,
        lines: remoteLogLines,
      };
      if (q) {
        payload.grep = q;
      }
      if (sinceVal) {
        payload.since = sinceVal;
      }
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
        toast.error(t('Log read task is still running. Try again in a few seconds.', 'Tác vụ đọc nhật ký vẫn đang chạy. Thử lại sau vài giây.'));
        return;
      }
      const finalStatus = taskResult.status;
      const resultText = taskResult.result || '';
      const agentDoesNotSupportLogRead = resultText.toLowerCase().includes('unknown task type: log_read');
      const displayText = agentDoesNotSupportLogRead
        ? `Agent update required: read-only log fetch needs Agent ${MIN_LOG_READ_AGENT_VERSION} or newer. This agent has not activated the log_read handler yet.`
        : resultText;
      if (agentDoesNotSupportLogRead) {
        toast.error(t(`Update this agent to ${MIN_LOG_READ_AGENT_VERSION}+ before fetching logs`, `Cập nhật agent lên ${MIN_LOG_READ_AGENT_VERSION}+ trước khi xem nhật ký`));
      }
      const now = new Date().toISOString();
      const remoteEntries = displayText.split('\n').filter(Boolean).slice(-500).map((line, index) => {
        let entryTs = now;
        const isoMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^\s]*)/);
        if (isoMatch) {
          const parsed = new Date(isoMatch[1]);
          if (!isNaN(parsed.getTime())) {
            entryTs = parsed.toISOString();
          }
        }
        return {
          id: `remote-${task.id}-${index}`,
          timestamp: entryTs,
          server_id: selectedServer.id,
          server_name: selectedServer.name,
          level: finalStatus === 'failed' || agentDoesNotSupportLogRead ? 'error' as const : classifyLineLevel(line),
          source: `agent:${remoteLogSource}${effectiveUnit ? `:${effectiveUnit}` : ''}`,
          message: line,
        };
      });
      setLogs((current) => [...remoteEntries, ...current].slice(0, 1000));
      setLogType('all');
      if (timeRange === 'custom') {
        setTimeRange('all');
      }
      toast.success(t(`Fetched ${remoteEntries.length} log lines`, `Đã nhận ${remoteEntries.length} dòng nhật ký`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to fetch remote logs', 'Không thể truy vấn nhật ký từ xa'));
    } finally {
      setFetchingRemoteLogs(false);
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-blue-500" />
            {t('Log Explorer', 'Trình khám phá nhật ký')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] text-xs font-semibold text-[var(--color-muted)] opacity-60 cursor-not-allowed inline-flex items-center gap-1.5"
            title={t('Continuous live tail will be enabled after the read-only fetch path is stable', 'Tính năng Live tail sẽ mở sau khi hoàn thiện luồng truy vấn')}
          >
            <PauseCircle className="w-3.5 h-3.5" />
            {t('Live tail next', 'Live tail sắp có')}
          </button>

          <button
            disabled={visibleLogs.length === 0}
            onClick={copyAllLogs}
            className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? t('Copied', 'Đã chép') : t('Copy', 'Sao chép')}
          </button>

          <button
            disabled={visibleLogs.length === 0}
            onClick={downloadLogs}
            className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {t('Export', 'Xuất file')}
          </button>
        </div>
      </div>

      {/* Unified Control & Filter Panel */}
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 space-y-3.5">
        {/* Main Filter Row */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${remoteLogSource === 'journal' ? 'lg:grid-cols-6' : 'lg:grid-cols-5'} gap-3`}>
          {/* Server Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
              {t('Server Source', 'Nguồn máy chủ')}
            </label>
            <CustomSelect
              value={selectedServerId}
              onChange={setSelectedServerId}
              options={[
                { value: 'all', label: t('All Servers Fleet', 'Tất cả máy chủ') },
                ...servers.map(s => ({ value: s.id, label: s.name, subLabel: s.ip_address || 'No IP' }))
              ]}
              className="w-full text-xs"
            />
          </div>

          {/* Log Source Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
              {t('Log Source', 'Nguồn nhật ký')}
            </label>
            <CustomSelect
              value={remoteLogSource}
              onChange={setRemoteLogSource}
              options={[
                { value: 'journal', label: 'systemd journal' },
                { value: 'nginx_access', label: 'Nginx access log' },
                { value: 'nginx_error', label: 'Nginx error log' },
                { value: 'mysql_error', label: 'MySQL/MariaDB error log' },
              ]}
              className="w-full text-xs"
            />
          </div>

          {/* Unit Selector when journal */}
          {remoteLogSource === 'journal' && (
            <div>
              <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
                {t('Unit / Service', 'Unit / Dịch vụ')}
              </label>
              <input
                type="text"
                list="server-services-list"
                placeholder="e.g. apache2, nginx..."
                value={remoteLogUnit}
                onChange={e => setRemoteLogUnit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedServer) {
                    e.preventDefault();
                    void fetchRemoteLogs();
                  }
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-xs text-[var(--foreground)] outline-none focus:border-blue-500 transition duration-100 font-mono"
              />
              <datalist id="server-services-list">
                {availableServices.map(svc => (
                  <option key={svc} value={svc} />
                ))}
              </datalist>
            </div>
          )}

          {/* Time Range Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
              {t('Time Range', 'Khoảng thời gian')}
            </label>
            <CustomSelect
              value={timeRange}
              onChange={(val) => setTimeRange(val as LogTimeRange)}
              options={[
                { value: 'all', label: t('All Time Available', 'Tất cả thời gian') },
                { value: 'custom', label: t('Custom Range', 'Tùy chỉnh khoảng') },
                { value: '15m', label: t('Last 15 minutes', '15 phút qua') },
                { value: '1h', label: t('Last 1 hour', '1 giờ qua') },
                { value: '3h', label: t('Last 3 hours', '3 giờ qua') },
                { value: '6h', label: t('Last 6 hours', '6 giờ qua') },
                { value: '24h', label: t('Last 24 hours', '24 giờ qua') },
                { value: '7d', label: t('Last 7 days', '7 ngày qua') },
              ]}
              className="w-full text-xs"
            />
          </div>

          {/* Log Level Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
              {t('Log Level', 'Mức độ Log')}
            </label>
            <CustomSelect
              value={logLevel}
              onChange={setLogLevel}
              options={[
                { value: 'all', label: t('All Levels (INFO, WARN, ERROR)', 'Tất cả (INFO, WARN, ERROR)') },
                { value: 'info', label: 'INFO' },
                { value: 'warn', label: 'WARN' },
                { value: 'error', label: 'ERROR' },
                { value: 'debug', label: 'DEBUG' },
              ]}
              className="w-full text-xs"
            />
          </div>

          {/* Search Query */}
          <div>
            <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
              {t('Filter Keyword', 'Từ khóa lọc')}
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none z-10" />
              <input
                type="text"
                placeholder={t('Search message text (Enter to fetch)...', 'Nội dung tìm kiếm (Enter để tìm)...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedServer) {
                    e.preventDefault();
                    void fetchRemoteLogs();
                  }
                }}
                style={{ paddingLeft: '32px' }}
                className="w-full pr-2.5 py-1.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-xs text-[var(--foreground)] outline-none focus:border-blue-500 transition duration-100"
              />
            </div>
          </div>
        </div>

        {/* Custom Range Sub-bar */}
        {timeRange === 'custom' && (
          <div className="pt-2.5 border-t border-[var(--border-subtle)] text-xs space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-semibold text-blue-500 flex items-center gap-1 shrink-0 text-xs">
                <Clock className="w-3.5 h-3.5" /> {t('Time Window:', 'Khoảng thời gian:')}
              </span>
              <div className="flex items-center gap-1.5">
                <label className="text-[var(--color-muted)] font-medium text-xs">{t('From:', 'Từ:')}</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setTimeRangeError(''); }}
                  className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-[var(--foreground)] text-xs outline-none focus:border-blue-500 font-mono"
                />
                <input
                  type="time"
                  value={fromTime}
                  onChange={(e) => { setFromTime(e.target.value); setTimeRangeError(''); }}
                  className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-[var(--foreground)] text-xs outline-none focus:border-blue-500 w-20 font-mono"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[var(--color-muted)] font-medium text-xs">{t('To:', 'Đến:')}</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setTimeRangeError(''); }}
                  className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-[var(--foreground)] text-xs outline-none focus:border-blue-500 font-mono"
                />
                <input
                  type="time"
                  value={toTime}
                  onChange={(e) => { setToTime(e.target.value); setTimeRangeError(''); }}
                  className="px-2 py-1 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-[var(--foreground)] text-xs outline-none focus:border-blue-500 w-20 font-mono"
                />
              </div>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => { setFromDate(''); setToDate(''); setFromTime('00:00'); setToTime('23:59'); setTimeRangeError(''); }}
                  className="text-xs text-rose-500 hover:underline ml-2"
                >
                  {t('Clear Range', 'Xóa khoảng')}
                </button>
              )}
            </div>
            {timeRangeError && (
              <div className="text-xs font-semibold text-rose-500 flex items-center gap-1">
                ⚠️ {timeRangeError}
              </div>
            )}
          </div>
        )}

        {/* Action Row inside the Unified Panel */}
        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-32">
              <CustomSelect
                value={remoteLogLines}
                onChange={setRemoteLogLines}
                options={[
                  { value: '100', label: t('100 lines', '100 dòng') },
                  { value: '200', label: t('200 lines', '200 dòng') },
                  { value: '500', label: t('500 lines', '500 dòng') },
                ]}
                className="w-full text-xs"
              />
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-sm border ${
              canFetchRemoteLogs
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
            }`}>
              {remoteLogReadiness}
            </span>
          </div>

          <button
            type="button"
            onClick={() => void fetchRemoteLogs()}
            disabled={!canFetchRemoteLogs || fetchingRemoteLogs}
            className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition duration-100 disabled:opacity-50"
            title={remoteLogReadiness}
          >
            {fetchingRemoteLogs ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Terminal className="h-3.5 w-3.5" />}
            {fetchingRemoteLogs ? t('Fetching…', 'Đang truy vấn…') : fetchLogsLabel}
          </button>
        </div>
      </div>

      {/* Terminal Log Console Window */}
      <div className="overflow-hidden rounded-md border border-[var(--border-default)] bg-slate-950 text-slate-100 font-mono text-xs">
        {/* Terminal Header Bar */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900 border-b border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold text-slate-200">live-stream.log</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              {loading ? t('loading', 'đang tải') : `${filteredLogs.length} ${t('entries', 'bản ghi')}`}
            </span>
            {filteredLogs.length > MAX_VISIBLE_LOGS && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                {t('showing latest', 'hiển thị mới nhất')} {MAX_VISIBLE_LOGS}
              </span>
            )}
          </div>

          <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            {selectedServer ? `${selectedServer.name} · ${remoteLogSource.toUpperCase().replace('_', ' ')}` : t('AUDIT STREAM', 'LUỒNG AUDIT')}
          </span>
        </div>

        {/* Console Body */}
        <div className="p-3 max-h-[550px] overflow-y-auto space-y-1 custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center text-slate-500 font-sans text-xs">
              {t('Loading operational log records...', 'Đang tải bản ghi nhật ký vận hành...')}
            </div>
          ) : loadError ? (
            <div className="py-12 text-center text-rose-400 font-sans text-xs">
              {t('Unable to load logs:', 'Không thể tải nhật ký:')} {loadError}
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-sans space-y-2.5">
              <p className="text-xs">
                {searchQuery.trim()
                  ? t(`No log lines matching "${searchQuery.trim()}" found.`, `Không tìm thấy dòng nhật ký nào khớp với "${searchQuery.trim()}".`)
                  : selectedServer
                  ? t(`No ${remoteLogSource.replace('_', ' ')} logs loaded yet for ${selectedServer.name}.`, `Chưa có nhật ký ${remoteLogSource.replace('_', ' ')} cho ${selectedServer.name}.`)
                  : t('No log records match the current filters.', 'Không có nhật ký nào khớp với bộ lọc hiện tại.')}
              </p>
              {selectedServer && (
                <button
                  type="button"
                  onClick={() => void fetchRemoteLogs()}
                  disabled={fetchingRemoteLogs}
                  className="h-7 px-3 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 mx-auto transition duration-100"
                >
                  <Terminal className="w-3 h-3" />
                  {fetchingRemoteLogs ? t('Fetching…', 'Đang truy vấn…') : `${t('Fetch', 'Truy vấn')} ${remoteLogSource.replace('_', ' ')} logs`}
                </button>
              )}
            </div>
          ) : (
            visibleLogs.map((log, idx) => (
              <div key={log.id || idx} className="flex flex-col sm:flex-row sm:items-start gap-2 hover:bg-slate-900/80 px-2 py-1 rounded transition-colors duration-75 group leading-relaxed">
                <span className="text-slate-500 shrink-0 select-none text-[11px] min-w-[130px] font-mono tabular-nums">
                  {new Date(log.timestamp).toLocaleString(isVi ? 'vi-VN' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour12: false,
                  })}
                </span>

                <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 font-mono ${
                  log.level === 'error'
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : log.level === 'warn'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}>
                  {log.level}
                </span>

                <span className="text-blue-400 font-semibold shrink-0 w-32 truncate" title={log.server_name}>
                  [{log.server_name}]
                </span>

                <span className="text-slate-400 font-semibold shrink-0 w-28 truncate" title={log.source}>
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
