'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Eye,
  FileText,
  Filter,
  Key,
  Layers,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

interface ServerInfo {
  id: string;
  name: string;
  ip_address?: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatAuditDetails(action: string, details: Record<string, unknown> | null | undefined): string {
  if (!details || typeof details !== 'object') return 'No additional details';

  if (action === 'COMPLETE_LOG_READ') {
    const lines = details.lines ? String(details.lines) : '200';
    const source = details.source ? String(details.source).replace(/_/g, ' ') : 'systemd journal';
    const bytes = details.output_bytes ? ` (${formatBytes(Number(details.output_bytes))})` : '';
    return `Fetched ${lines} lines from ${source}${bytes}`;
  }

  if (action === 'QUEUE_TASK') {
    const type = details.type ? String(details.type).replace(/_/g, ' ') : 'task';
    const target = details.source || details.service || details.unit;
    return `Dispatched task: ${type}${target ? ` (${target})` : ''}`;
  }

  if (action === 'FORCE_DELETE' || action === 'DELETE') {
    const uninstalled = details.agent_uninstalled === true ? 'with agent uninstalled' : 'without agent uninstall';
    return `Resource removed ${uninstalled}`;
  }

  if (action === 'CREATE') {
    return details.name ? `Created resource "${details.name}"` : 'Created new resource';
  }

  if (action === 'UPDATE') {
    return details.name ? `Updated resource "${details.name}"` : 'Updated resource configuration';
  }

  // Fallback: format clean key-value summary
  const entries = Object.entries(details)
    .filter(([k]) => !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token') && !k.toLowerCase().includes('password'))
    .slice(0, 3);

  if (entries.length === 0) return 'Operational activity recorded';
  return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ');
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [servers, setServers] = useState<Record<string, ServerInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [resourceFilter, setResourceFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [timeRange, setTimeRange] = useState('all');

  // Detail Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      let url = '/audit-logs?limit=300';
      if (timeRange !== 'all') {
        url += `&range=${timeRange}`;
      }

      const [logsRes, serversRes] = await Promise.allSettled([
        apiClient(url),
        apiClient('/servers'),
      ]);

      if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) {
        setLogs(logsRes.value);
      }

      if (serversRes.status === 'fulfilled' && Array.isArray(serversRes.value)) {
        const sMap: Record<string, ServerInfo> = {};
        serversRes.value.forEach((s: ServerInfo) => {
          if (s && s.id) sMap[s.id] = s;
        });
        setServers(sMap);
      }
    } catch (err) {
      toast.error('Failed to load audit logs');
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  // Copy details JSON to clipboard
  const handleCopyJSON = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success('Event details copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Resource filter
      if (resourceFilter !== 'all' && log.resource_type.toUpperCase() !== resourceFilter.toUpperCase()) {
        return false;
      }

      // Action filter
      if (actionFilter !== 'all') {
        if (actionFilter === 'READ' && !log.action.includes('READ')) return false;
        if (actionFilter === 'TASK' && !log.action.includes('TASK')) return false;
        if (actionFilter === 'CREATE' && !log.action.includes('CREATE')) return false;
        if (actionFilter === 'DELETE' && !log.action.includes('DELETE')) return false;
        if (actionFilter === 'UPDATE' && !log.action.includes('UPDATE')) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const srv = servers[log.resource_id];
        const serverName = (srv?.name || (log.details?.server_name as string) || '').toLowerCase();
        const serverIp = (srv?.ip_address || '').toLowerCase();
        const actionStr = log.action.toLowerCase();
        const resId = log.resource_id.toLowerCase();
        const detailsStr = JSON.stringify(log.details || '').toLowerCase();

        if (
          !serverName.includes(q) &&
          !serverIp.includes(q) &&
          !actionStr.includes(q) &&
          !resId.includes(q) &&
          !detailsStr.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [logs, servers, resourceFilter, actionFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const serverOps = logs.filter((l) => l.resource_type === 'SERVER').length;
    const taskOps = logs.filter((l) => l.action.includes('TASK') || l.action.includes('READ')).length;
    const today = new Date().toDateString();
    const todayCount = logs.filter((l) => new Date(l.created_at).toDateString() === today).length;

    return { total, serverOps, taskOps, todayCount };
  }, [logs]);

  // Action badge renderer
  const renderActionBadge = (action: string) => {
    if (action === 'COMPLETE_LOG_READ' || action.includes('READ')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30">
          <FileText className="w-3.5 h-3.5" />
          Read Logs
        </span>
      );
    }
    if (action === 'QUEUE_TASK' || action.includes('TASK')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
          <Play className="w-3.5 h-3.5" />
          Queued Task
        </span>
      );
    }
    if (action.includes('DELETE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </span>
      );
    }
    if (action.includes('CREATE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Plus className="w-3.5 h-3.5" />
          Create
        </span>
      );
    }
    if (action.includes('UPDATE')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Pencil className="w-3.5 h-3.5" />
          Update
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-500/15 text-slate-300 border border-slate-500/30">
        <Activity className="w-3.5 h-3.5" />
        {action}
      </span>
    );
  };

  // Resource Icon renderer
  const getResourceIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SERVER':
        return <ServerIcon className="w-4 h-4 text-blue-400 shrink-0" />;
      case 'ALERT':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'USER':
        return <Users className="w-4 h-4 text-purple-400 shrink-0" />;
      case 'API_KEY':
      case 'KEY':
        return <Key className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1 flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-400" />
            Audit Trail
          </h1>
          <p className="text-sm text-[var(--color-muted)]">
            Transparent security log of administrative actions, task executions, and server events.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing || loading}
          className="ops-button secondary text-xs py-2 px-3 self-start sm:self-auto flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="ops-panel surface-regular p-4 rounded-xl">
          <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            Total Events
          </span>
          <div className="text-2xl font-black text-[var(--foreground)] flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            {stats.total}
          </div>
        </div>

        <div className="ops-panel surface-regular p-4 rounded-xl">
          <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            Server Operations
          </span>
          <div className="text-2xl font-black text-[var(--foreground)] flex items-center gap-2">
            <ServerIcon className="w-5 h-5 text-sky-400" />
            {stats.serverOps}
          </div>
        </div>

        <div className="ops-panel surface-regular p-4 rounded-xl">
          <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            Tasks Executed
          </span>
          <div className="text-2xl font-black text-[var(--foreground)] flex items-center gap-2">
            <Play className="w-5 h-5 text-indigo-400" />
            {stats.taskOps}
          </div>
        </div>

        <div className="ops-panel surface-regular p-4 rounded-xl">
          <span className="text-xs font-bold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            Today&apos;s Events
          </span>
          <div className="text-2xl font-black text-emerald-400 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            {stats.todayCount}
          </div>
        </div>
      </div>

      {/* Search & Filtering Toolbar */}
      <div className="ops-panel surface-regular p-4 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search by server name, IP, action, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '40px' }}
              className="w-full pr-3 py-2 text-xs rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Resource Type filter */}
            <CustomSelect
              value={resourceFilter}
              onChange={setResourceFilter}
              options={[
                { value: 'all', label: 'All Resources' },
                { value: 'SERVER', label: 'Server Ops' },
                { value: 'ALERT', label: 'Alerts' },
                { value: 'USER', label: 'User Admin' },
                { value: 'TARGET', label: 'Network Targets' },
              ]}
              icon={<Filter className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
              className="h-9 min-w-[150px] text-xs"
            />

            {/* Action Type filter */}
            <CustomSelect
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                { value: 'all', label: 'All Actions' },
                { value: 'READ', label: 'Read Logs' },
                { value: 'TASK', label: 'Task Execution' },
                { value: 'CREATE', label: 'Creations' },
                { value: 'UPDATE', label: 'Updates' },
                { value: 'DELETE', label: 'Deletions' },
              ]}
              className="h-9 min-w-[140px] text-xs"
            />

            {/* Time Range filter */}
            <CustomSelect
              value={timeRange}
              onChange={setTimeRange}
              options={[
                { value: 'all', label: 'All Time' },
                { value: '1h', label: 'Last 1 Hour' },
                { value: '24h', label: 'Last 24 Hours' },
                { value: '7d', label: 'Last 7 Days' },
                { value: '30d', label: 'Last 30 Days' },
              ]}
              className="h-9 min-w-[130px] text-xs"
            />

            {(searchQuery || resourceFilter !== 'all' || actionFilter !== 'all' || timeRange !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setResourceFilter('all');
                  setActionFilter('all');
                  setTimeRange('all');
                }}
                className="h-9 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)]/40 px-3 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--color-muted)] pt-1">
          <span>
            Showing <strong className="text-[var(--foreground)]">{filteredLogs.length}</strong> of{' '}
            <strong className="text-[var(--foreground)]">{logs.length}</strong> events
          </span>
        </div>
      </div>

      {/* Main Activity Table */}
      <div className="ops-panel surface-regular rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-sm text-[var(--color-muted)] flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            Loading audit records...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-sm text-[var(--color-muted)] space-y-2">
            <Shield className="w-8 h-8 text-[var(--color-muted)] mx-auto opacity-50" />
            <p className="font-semibold text-[var(--foreground)]">No audit activity found</p>
            <p className="text-xs">No records match the current filter and search criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] font-bold text-[var(--color-muted)] uppercase bg-[var(--surface-subtle)] border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-5 py-3.5">Time</th>
                  <th className="px-5 py-3.5">Resource &amp; Server</th>
                  <th className="px-5 py-3.5">Action</th>
                  <th className="px-5 py-3.5">Activity Summary</th>
                  <th className="px-5 py-3.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {filteredLogs.map((log) => {
                  const server = servers[log.resource_id];
                  const serverName = server?.name || (log.details?.server_name as string) || '';
                  const serverIp = server?.ip_address || '';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-[var(--surface-subtle)]/70 transition-colors cursor-pointer group"
                    >
                      {/* Timestamp */}
                      <td className="px-5 py-3.5 whitespace-nowrap text-[var(--color-muted)]">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                          <div>
                            <span className="font-medium text-[var(--foreground)] block">
                              {new Date(log.created_at).toLocaleTimeString('vi-VN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false,
                              })}
                            </span>
                            <span className="text-[10px] text-[var(--color-muted)]">
                              {new Date(log.created_at).toLocaleDateString('vi-VN', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Resource & Server */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          {getResourceIcon(log.resource_type)}
                          <div>
                            {serverName ? (
                              <div className="flex items-center gap-1.5">
                                {log.resource_type === 'SERVER' ? (
                                  <Link
                                    href={`/dashboard/servers/${log.resource_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-[var(--foreground)] hover:text-blue-400 transition"
                                  >
                                    {serverName}
                                  </Link>
                                ) : (
                                  <span className="font-bold text-[var(--foreground)]">{serverName}</span>
                                )}
                                {serverIp && (
                                  <span className="text-[10px] text-[var(--color-muted)] font-mono">
                                    ({serverIp})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-bold text-[var(--foreground)]">
                                {log.resource_type}
                              </span>
                            )}
                            <div className="text-[10px] text-[var(--color-muted)] font-mono truncate max-w-[180px]">
                              {log.resource_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* Details Summary */}
                      <td className="px-5 py-3.5 text-[var(--foreground)] max-w-sm">
                        <span className="font-medium leading-relaxed">
                          {formatAuditDetails(log.action, log.details)}
                        </span>
                      </td>

                      {/* Inspect Button */}
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2.5 py-1 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:border-blue-500/40 transition inline-flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="ops-modal relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-[var(--background-card)] border border-[var(--border-color)] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-base text-[var(--foreground)]">Audit Event Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-subtle)] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    Timestamp
                  </span>
                  <span className="font-mono text-sm text-[var(--foreground)]">
                    {new Date(selectedLog.created_at).toLocaleString()}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    Action Type
                  </span>
                  <div>{renderActionBadge(selectedLog.action)}</div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    Resource Type
                  </span>
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    {getResourceIcon(selectedLog.resource_type)}
                    {selectedLog.resource_type}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    Target Server
                  </span>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {servers[selectedLog.resource_id]?.name || (selectedLog.details?.server_name as string) || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Resource ID & User ID */}
              <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-1.5 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">Resource ID:</span>
                  <span className="text-[var(--foreground)]">{selectedLog.resource_id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">Event ID:</span>
                  <span className="text-[var(--foreground)]">{selectedLog.id}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">User ID:</span>
                  <span className="text-[var(--foreground)]">{selectedLog.user_id}</span>
                </div>
              </div>

              {/* Human Summary Box */}
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-200">
                <span className="text-[10px] uppercase font-bold text-blue-300 block mb-1">
                  Summary Description
                </span>
                <span className="text-sm font-medium">
                  {formatAuditDetails(selectedLog.action, selectedLog.details)}
                </span>
              </div>

              {/* Raw Details JSON */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-[var(--foreground)]">Raw Event Payload</span>
                  <button
                    type="button"
                    onClick={() => handleCopyJSON(selectedLog.details)}
                    className="px-2 py-1 text-[11px] rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:text-blue-400 transition inline-flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-black/40 border border-[var(--border-color)] text-[var(--foreground)] font-mono text-[11px] overflow-x-auto max-h-60 custom-scrollbar">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[var(--border-color)] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="ops-button secondary text-xs py-1.5 px-4"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
