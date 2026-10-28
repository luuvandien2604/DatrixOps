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
import { useLanguage } from '@/components/LanguageContext';

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

function formatAuditDetails(action: string, details: Record<string, unknown> | null | undefined, isVi: boolean): string {
  if (!details || typeof details !== 'object') return isVi ? 'Không có thêm chi tiết' : 'No additional details';

  if (action === 'COMPLETE_LOG_READ') {
    const lines = details.lines ? String(details.lines) : '200';
    const source = details.source ? String(details.source).replace(/_/g, ' ') : 'systemd journal';
    const bytes = details.output_bytes ? ` (${formatBytes(Number(details.output_bytes))})` : '';
    return isVi ? `Đã lấy ${lines} dòng từ ${source}${bytes}` : `Fetched ${lines} lines from ${source}${bytes}`;
  }

  if (action === 'QUEUE_TASK') {
    const type = details.type ? String(details.type).replace(/_/g, ' ') : 'task';
    const target = details.source || details.service || details.unit;
    return isVi ? `Đã xếp hàng tác vụ: ${type}${target ? ` (${target})` : ''}` : `Dispatched task: ${type}${target ? ` (${target})` : ''}`;
  }

  if (action === 'FORCE_DELETE' || action === 'DELETE') {
    const uninstalled = details.agent_uninstalled === true
      ? (isVi ? 'đã gỡ cài đặt agent' : 'with agent uninstalled')
      : (isVi ? 'chưa gỡ agent' : 'without agent uninstall');
    return isVi ? `Đã xóa tài nguyên (${uninstalled})` : `Resource removed ${uninstalled}`;
  }

  if (action === 'CREATE') {
    return details.name
      ? (isVi ? `Đã tạo tài nguyên "${details.name}"` : `Created resource "${details.name}"`)
      : (isVi ? 'Đã tạo tài nguyên mới' : 'Created new resource');
  }

  if (action === 'UPDATE') {
    return details.name
      ? (isVi ? `Đã cập nhật tài nguyên "${details.name}"` : `Updated resource "${details.name}"`)
      : (isVi ? 'Đã cập nhật cấu hình tài nguyên' : 'Updated resource configuration');
  }

  // Fallback: format clean key-value summary
  const entries = Object.entries(details)
    .filter(([k]) => !k.toLowerCase().includes('secret') && !k.toLowerCase().includes('token') && !k.toLowerCase().includes('password'))
    .slice(0, 3);

  if (entries.length === 0) return isVi ? 'Ghi nhận hoạt động vận hành' : 'Operational activity recorded';
  return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ');
}

export default function AuditLogPage() {
  const { t, isVi } = useLanguage();
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
      toast.error(t('Failed to load audit logs', 'Không thể tải nhật ký kiểm toán'));
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [timeRange, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  // Copy details JSON to clipboard
  const handleCopyJSON = (data: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    toast.success(t('Event details copied to clipboard', 'Đã sao chép chi tiết sự kiện vào bộ nhớ tạm'));
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
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
          <FileText className="w-3 h-3" />
          {t('Read Logs', 'Đọc nhật ký')}
        </span>
      );
    }
    if (action === 'QUEUE_TASK' || action.includes('TASK')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
          <Play className="w-3 h-3" />
          {t('Queued Task', 'Tác vụ')}
        </span>
      );
    }
    if (action.includes('DELETE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <Trash2 className="w-3 h-3" />
          {t('Delete', 'Xóa')}
        </span>
      );
    }
    if (action.includes('CREATE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <Plus className="w-3 h-3" />
          {t('Create', 'Tạo mới')}
        </span>
      );
    }
    if (action.includes('UPDATE')) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          <Pencil className="w-3 h-3" />
          {t('Update', 'Cập nhật')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-[var(--surface-3)] text-[var(--color-muted)] border border-[var(--border-subtle)]">
        <Activity className="w-3 h-3" />
        {action}
      </span>
    );
  };

  // Resource Icon renderer
  const getResourceIcon = (type: string) => {
    switch (type.toUpperCase()) {
      case 'SERVER':
        return <ServerIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'ALERT':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'USER':
        return <Users className="w-3.5 h-3.5 text-purple-500 shrink-0" />;
      case 'API_KEY':
      case 'KEY':
        return <Key className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />;
    }
  };

  return (
    <div className="space-y-5 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-blue-500" />
            {t('Audit Trail', 'Nhật ký kiểm toán')}
          </h1>
        </div>

        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing || loading}
          className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] self-start sm:self-auto inline-flex items-center gap-1.5 transition duration-100"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
          {t('Refresh', 'Làm mới')}
        </button>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            {t('Total Events', 'Tổng sự kiện')}
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)] flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-500" />
            {stats.total}
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            {t('Server Operations', 'Thao tác máy chủ')}
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)] flex items-center gap-2">
            <ServerIcon className="w-4 h-4 text-sky-500" />
            {stats.serverOps}
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            {t('Tasks Executed', 'Tác vụ đã thực thi')}
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)] flex items-center gap-2">
            <Play className="w-4 h-4 text-indigo-500" />
            {stats.taskOps}
          </div>
        </div>

        <div className="p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
          <span className="text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider block mb-1">
            {t("Today's Events", 'Sự kiện hôm nay')}
          </span>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-500 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {stats.todayCount}
          </div>
        </div>
      </div>

      {/* Search & Filtering Toolbar */}
      <div className="p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] space-y-2.5">
        <div className="flex flex-col sm:flex-row items-center gap-2.5">
          {/* Search bar */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted)] pointer-events-none" />
            <input
              type="text"
              placeholder={t('Search by server name, IP, action, or details...', 'Tìm kiếm theo tên máy chủ, IP, thao tác hoặc chi tiết...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
              className="w-full pr-3 py-1.5 text-xs rounded-sm bg-[var(--surface-2)] border border-[var(--border-default)] text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-blue-500 transition duration-100"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Resource Type filter */}
            <CustomSelect
              value={resourceFilter}
              onChange={setResourceFilter}
              options={[
                { value: 'all', label: t('All Resources', 'Tất cả tài nguyên') },
                { value: 'SERVER', label: t('Server Ops', 'Thao tác máy chủ') },
                { value: 'ALERT', label: t('Alerts', 'Cảnh báo') },
                { value: 'USER', label: t('User Admin', 'Quản trị người dùng') },
                { value: 'TARGET', label: t('Network Targets', 'Mục tiêu mạng') },
              ]}
              icon={<Filter className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
              className="h-8 min-w-[140px] text-xs"
            />

            {/* Action Type filter */}
            <CustomSelect
              value={actionFilter}
              onChange={setActionFilter}
              options={[
                { value: 'all', label: t('All Actions', 'Tất cả thao tác') },
                { value: 'READ', label: t('Read Logs', 'Đọc nhật ký') },
                { value: 'TASK', label: t('Task Execution', 'Thực thi tác vụ') },
                { value: 'CREATE', label: t('Creations', 'Tạo mới') },
                { value: 'UPDATE', label: t('Updates', 'Cập nhật') },
                { value: 'DELETE', label: t('Deletions', 'Xóa') },
              ]}
              className="h-8 min-w-[130px] text-xs"
            />

            {/* Time Range filter */}
            <CustomSelect
              value={timeRange}
              onChange={setTimeRange}
              options={[
                { value: 'all', label: t('All Time', 'Tất cả thời gian') },
                { value: '1h', label: t('Last 1 Hour', '1 giờ qua') },
                { value: '24h', label: t('Last 24 Hours', '24 giờ qua') },
                { value: '7d', label: t('Last 7 Days', '7 ngày qua') },
                { value: '30d', label: t('Last 30 Days', '30 ngày qua') },
              ]}
              className="h-8 min-w-[120px] text-xs"
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
                className="h-8 inline-flex items-center gap-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] px-2.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] transition duration-100 cursor-pointer"
              >
                <X className="w-3 h-3" />
                {t('Reset', 'Đặt lại')}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--color-muted)] pt-0.5">
          <span>
            {t('Showing', 'Hiển thị')}{' '}
            <strong className="text-[var(--foreground)] font-mono tabular-nums">{filteredLogs.length}</strong>{' '}
            {t('of', 'trên')}{' '}
            <strong className="text-[var(--foreground)] font-mono tabular-nums">{logs.length}</strong>{' '}
            {t('events', 'sự kiện')}
          </span>
        </div>
      </div>

      {/* Main Activity Table */}
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-[var(--color-muted)] flex flex-col items-center justify-center gap-2.5">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
            {t('Loading audit records...', 'Đang tải bản ghi kiểm toán...')}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-xs text-[var(--color-muted)] space-y-1.5">
            <Shield className="w-7 h-7 text-[var(--color-muted)] mx-auto opacity-40" />
            <p className="font-bold text-sm text-[var(--foreground)]">{t('No audit activity found', 'Không tìm thấy hoạt động kiểm toán')}</p>
            <p>{t('No records match the current filter and search criteria.', 'Không có bản ghi nào khớp với điều kiện lọc và tìm kiếm.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] font-bold text-[var(--color-muted)] uppercase bg-[var(--surface-2)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-2.5">{t('Time', 'Thời gian')}</th>
                  <th className="px-4 py-2.5">{t('Resource & Server', 'Tài nguyên & Máy chủ')}</th>
                  <th className="px-4 py-2.5">{t('Action', 'Thao tác')}</th>
                  <th className="px-4 py-2.5">{t('Activity Summary', 'Tóm tắt hoạt động')}</th>
                  <th className="px-4 py-2.5 text-right">{t('Inspect', 'Kiểm tra')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredLogs.map((log) => {
                  const server = servers[log.resource_id];
                  const serverName = server?.name || (log.details?.server_name as string) || '';
                  const serverIp = server?.ip_address || '';

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-[var(--surface-2)] transition duration-100 cursor-pointer group"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap text-[var(--color-muted)]">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                          <div>
                            <span className="font-mono tabular-nums text-xs font-semibold text-[var(--foreground)] block">
                              {new Date(log.created_at).toLocaleTimeString(isVi ? 'vi-VN' : 'en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: false,
                              })}
                            </span>
                            <span className="font-mono tabular-nums text-[10px] text-[var(--color-muted)]">
                              {new Date(log.created_at).toLocaleDateString(isVi ? 'vi-VN' : 'en-US', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Resource & Server */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {getResourceIcon(log.resource_type)}
                          <div className="min-w-0">
                            {serverName ? (
                              <div className="flex items-center gap-1.5">
                                {log.resource_type === 'SERVER' ? (
                                  <Link
                                    href={`/dashboard/servers/${log.resource_id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-bold text-xs text-[var(--foreground)] hover:text-blue-500 transition"
                                  >
                                    {serverName}
                                  </Link>
                                ) : (
                                  <span className="font-bold text-xs text-[var(--foreground)]">{serverName}</span>
                                )}
                                {serverIp && (
                                  <span className="text-[10px] text-[var(--color-muted)] font-mono">
                                    ({serverIp})
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-bold text-xs text-[var(--foreground)]">
                                {log.resource_type}
                              </span>
                            )}
                            <div className="text-[10px] text-[var(--color-muted)] font-mono truncate max-w-[160px]">
                              {log.resource_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* Details Summary */}
                      <td className="px-4 py-3 text-[var(--foreground)] max-w-sm">
                        <span className="font-medium text-xs leading-relaxed">
                          {formatAuditDetails(log.action, log.details, isVi)}
                        </span>
                      </td>

                      {/* Inspect Button */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="h-7 px-2.5 text-xs rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100 inline-flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          {t('View', 'Xem')}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-md bg-[var(--surface-1)] border border-[var(--border-default)] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--surface-2)]">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm text-[var(--foreground)]">
                  {t('Audit Event Details', 'Chi tiết sự kiện kiểm toán')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    {t('Timestamp', 'Thời gian')}
                  </span>
                  <span className="font-mono tabular-nums text-xs text-[var(--foreground)]">
                    {new Date(selectedLog.created_at).toLocaleString(isVi ? 'vi-VN' : 'en-US')}
                  </span>
                </div>

                <div className="p-3 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    {t('Action Type', 'Loại thao tác')}
                  </span>
                  <div>{renderActionBadge(selectedLog.action)}</div>
                </div>

                <div className="p-3 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    {t('Resource Type', 'Loại tài nguyên')}
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                    {getResourceIcon(selectedLog.resource_type)}
                    {selectedLog.resource_type}
                  </div>
                </div>

                <div className="p-3 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                  <span className="text-[10px] uppercase font-bold text-[var(--color-muted)] block mb-1">
                    {t('Target Server', 'Máy chủ đích')}
                  </span>
                  <span className="text-xs font-semibold text-[var(--foreground)]">
                    {servers[selectedLog.resource_id]?.name || (selectedLog.details?.server_name as string) || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Resource ID & User ID */}
              <div className="p-3 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-1 font-mono text-[11px]">
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
              <div className="p-3 rounded-sm bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-300">
                <span className="text-[10px] uppercase font-bold text-blue-500 block mb-0.5">
                  {t('Summary Description', 'Tóm tắt mô tả')}
                </span>
                <span className="text-xs font-medium">
                  {formatAuditDetails(selectedLog.action, selectedLog.details, isVi)}
                </span>
              </div>

              {/* Raw Details JSON */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-xs text-[var(--foreground)]">{t('Raw Event Payload', 'Dữ liệu sự kiện gốc')}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyJSON(selectedLog.details)}
                    className="h-6 px-2 text-[10px] font-semibold rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] transition duration-100 inline-flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    {copied ? t('Copied', 'Đã chép') : t('Copy JSON', 'Sao chép JSON')}
                  </button>
                </div>
                <pre className="p-3 rounded-sm bg-slate-950 text-slate-200 border border-[var(--border-default)] font-mono text-[11px] overflow-x-auto max-h-56 custom-scrollbar">
                  {JSON.stringify(selectedLog.details, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-2.5 border-t border-[var(--border-subtle)] flex justify-end bg-[var(--surface-2)]">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="h-7 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--foreground)] transition duration-100"
              >
                {t('Close', 'Đóng')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
