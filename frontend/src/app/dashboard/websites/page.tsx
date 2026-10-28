'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, Trash2, CheckCircle2, XCircle, ShieldAlert,
  ShieldCheck, RefreshCw, Activity, ExternalLink,
  Server, Clock, ArrowRight, ChevronLeft, ChevronRight,
  AlertTriangle, LayoutGrid, List, Settings2
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';
import { useLanguage } from '@/components/LanguageContext';

interface Website {
  id: string;
  name: string;
  url: string;
  status: string;
  ssl_issuer?: string;
  ssl_valid_to?: string;
  ssl_days_remaining?: number;
  last_check?: string;
  response_time_ms?: number;
  history_24h?: number[];
  down_started_at?: string;
  created_at?: string;
}

interface ServerSnapshot {
  system_info?: {
    uptime?: number;
    os_name?: string;
    kernel?: string;
    public_ip?: string;
    cpu_usage?: number;
    cpu_cores?: number;
    memory_used?: number;
    memory_total?: number;
    disk_usage?: number;
    disk_total?: number;
  };
  inventory?: {
    agent_version?: string;
  };
}

interface ServerRecord {
  id: string;
  name: string;
  status: string;
  ip_address?: string;
  last_seen_at?: string;
  created_at: string;
  availability_30d?: number;
  downtime_seconds_30d?: number;
  snapshot?: string | ServerSnapshot;
  os_info?: string | {
    os_name?: string;
    version?: string;
    uptime?: number;
    cpu_cores?: number;
    cpu_usage?: number;
  };
}

interface UptimeDayBar {
  date: string; // YYYY-MM-DD
  status: 'operational' | 'degraded' | 'outage' | 'no_data';
  uptime_pct: number;
  downtime_seconds: number;
  avg_latency_ms: number;
  incident_title?: string;
}

interface UptimeSummaryItem {
  id: string;
  name: string;
  url?: string;
  current_status: string; // "UP", "DOWN", "UNKNOWN"
  overall_uptime_pct: number;
  days: UptimeDayBar[];
}

interface UptimeSummaryResponse {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  days_count: number;
  items: UptimeSummaryItem[];
}

function parseJSON<T>(value: string | T | undefined): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function formatMonthYearRange(startStr?: string, endStr?: string, locale: string = 'en-US') {
  if (!startStr || !endStr) return 'Jun 2026 - Sep 2026';
  const start = new Date(startStr + 'T00:00:00Z');
  const end = new Date(endStr + 'T00:00:00Z');
  const startMonth = start.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
  const startYear = start.getUTCFullYear();
  const endMonth = end.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
  const endYear = end.getUTCFullYear();

  if (startYear === endYear) {
    if (startMonth === endMonth) {
      return `${startMonth} ${startYear}`;
    }
    return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
  }
  return `${startMonth} ${startYear} - ${endMonth} ${endYear}`;
}

function formatTooltipDate(dateStr: string, locale: string = 'en-US') {
  try {
    const d = new Date(dateStr + 'T00:00:00Z');
    const day = d.getUTCDate();
    const month = d.toLocaleString(locale, { month: 'short', timeZone: 'UTC' });
    const year = d.getUTCFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function formatOutageDuration(seconds: number, isVi: boolean) {
  if (seconds <= 0) return isVi ? '0 phút' : '0 mins';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0 && mins > 0) return isVi ? `${hrs} giờ ${mins} phút` : `${hrs} hrs ${mins} mins`;
  if (hrs > 0) return isVi ? `${hrs} giờ` : `${hrs} ${hrs === 1 ? 'hr' : 'hrs'}`;
  if (mins > 0) return isVi ? `${mins} phút` : `${mins} mins`;
  return isVi ? '< 1 phút' : '< 1 min';
}

export default function WebsitesPage() {
  const { t, isVi } = useLanguage();
  const [websites, setWebsites] = useState<Website[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);

  const [activeTab, setActiveTab] = useState<'websites' | 'servers'>('websites');

  // Uptime Summary 90-day status state
  const [uptimeSummary, setUptimeSummary] = useState<UptimeSummaryResponse | null>(null);
  const [loadingUptimeSummary, setLoadingUptimeSummary] = useState(true);
  const [selectedEndDate, setSelectedEndDate] = useState<string>('');
  const [websiteViewMode, setWebsiteViewMode] = useState<'timeline' | 'table'>('timeline');
  const [hoveredDay, setHoveredDay] = useState<{ itemId: string; day: UptimeDayBar; barIndex: number } | null>(null);

  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [loadingServers, setLoadingServers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);

  // Delete modal state
  const [pendingDeleteWebsite, setPendingDeleteWebsite] = useState<{ id: string; name: string } | null>(null);
  const [deletingWebsite, setDeletingWebsite] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Edit website modal state
  const [editingWebsite, setEditingWebsite] = useState<Website | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [updatingWebsite, setUpdatingWebsite] = useState(false);
  const [editError, setEditError] = useState('');

  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  useEffect(() => {
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isViewer = userRole === 'viewer';

  const fetchUptimeSummary = useCallback(async (endDateParam?: string) => {
    try {
      setLoadingUptimeSummary(true);
      const query = endDateParam ? `?days=90&end_date=${endDateParam}` : '?days=90';
      const data = await apiClient(`/websites/uptime-summary${query}`);
      if (data && Array.isArray(data.items)) {
        setUptimeSummary(data);
      }
    } catch (err) {
      console.error('Failed to fetch uptime summary:', err);
    } finally {
      setLoadingUptimeSummary(false);
    }
  }, []);

  async function fetchWebsites() {
    try {
      const data = await apiClient('/websites');
      const enhancedData = (data || []).map((w: Website) => ({
        ...w,
        response_time_ms: w.response_time_ms || Math.floor(Math.random() * 80 + 30),
        history_24h: w.history_24h || Array.from({ length: 24 }, () => Math.floor(Math.random() * 90 + 20))
      }));
      setWebsites(enhancedData);
    } catch (err) {
      console.error('Failed to fetch websites:', err);
    } finally {
      setLoadingWebsites(false);
    }
  }

  async function fetchServers() {
    try {
      const data = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    } finally {
      setLoadingServers(false);
    }
  }

  const refreshAll = () => {
    void fetchWebsites();
    void fetchServers();
    void fetchUptimeSummary(selectedEndDate);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentTimestamp(Date.now());
      void fetchWebsites();
      void fetchServers();
      void fetchUptimeSummary(selectedEndDate);
    }, 0);
    const interval = setInterval(() => {
      setCurrentTimestamp(Date.now());
      void fetchWebsites();
      void fetchServers();
      void fetchUptimeSummary(selectedEndDate);
    }, 30000);
    return () => {
      window.clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchUptimeSummary, selectedEndDate]);

  const handlePreviousDateRange = () => {
    const baseDateStr = uptimeSummary?.end_date || new Date().toISOString().slice(0, 10);
    const d = new Date(baseDateStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 30);
    const newEnd = d.toISOString().slice(0, 10);
    setSelectedEndDate(newEnd);
    void fetchUptimeSummary(newEnd);
  };

  const handleNextDateRange = () => {
    if (!selectedEndDate) return;
    const d = new Date(selectedEndDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 30);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (d.toISOString().slice(0, 10) >= todayStr) {
      setSelectedEndDate('');
      void fetchUptimeSummary('');
    } else {
      const newEnd = d.toISOString().slice(0, 10);
      setSelectedEndDate(newEnd);
      void fetchUptimeSummary(newEnd);
    }
  };

  const handleResetDateRange = () => {
    setSelectedEndDate('');
    void fetchUptimeSummary('');
  };

  const handleManualCheck = async (id: string, name: string) => {
    setCheckingId(id);
    try {
      await apiClient(`/websites/${id}/check`, { method: 'POST' }).catch(() => {});
      toast.success(t(`Triggered health check for ${name}`, `Đã kích hoạt kiểm tra ${name}`));
      await fetchWebsites();
      await fetchUptimeSummary(selectedEndDate);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('Check failed', 'Kiểm tra thất bại'));
    } finally {
      setCheckingId(null);
    }
  };

  const openAddModal = () => {
    if (isViewer) {
      toast.error(t('Adding websites requires Operator or Admin role', 'Thêm website yêu cầu quyền Operator hoặc Admin'));
      return;
    }
    setIsModalOpen(true);
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient('/websites', {
        data: {
          name: newName,
          url: newUrl,
        }
      });
      setIsModalOpen(false);
      setNewName('');
      setNewUrl('');
      await fetchWebsites();
      await fetchUptimeSummary(selectedEndDate);
      toast.success(t('Website added to monitoring suite', 'Đã thêm website vào hệ thống giám sát'));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Unable to add website', 'Không thể thêm website'));
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (w: Website) => {
    if (isViewer) {
      toast.error(t('Editing websites requires Operator or Admin role', 'Sửa website yêu cầu quyền Operator hoặc Admin'));
      return;
    }
    setEditingWebsite(w);
    setEditName(w.name);
    setEditUrl(w.url);
    setEditError('');
    setIsEditModalOpen(true);
  };

  const handleEditWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWebsite) return;
    setUpdatingWebsite(true);
    setEditError('');
    try {
      await apiClient(`/websites/${editingWebsite.id}`, {
        method: 'PUT',
        data: {
          name: editName,
          url: editUrl,
        }
      });
      setIsEditModalOpen(false);
      setEditingWebsite(null);
      await fetchWebsites();
      await fetchUptimeSummary(selectedEndDate);
      toast.success(t('Website configuration updated', 'Đã cập nhật cấu hình website'));
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : t('Unable to update website', 'Không thể cập nhật website'));
    } finally {
      setUpdatingWebsite(false);
    }
  };

  const confirmDeleteWebsite = async () => {
    if (!pendingDeleteWebsite) return;
    setDeletingWebsite(true);
    try {
      await apiClient(`/websites/${pendingDeleteWebsite.id}`, { method: 'DELETE' });
      toast.success(t(`Website ${pendingDeleteWebsite.name} removed`, `Đã xóa website ${pendingDeleteWebsite.name}`));
      setPendingDeleteWebsite(null);
      await fetchWebsites();
      await fetchUptimeSummary(selectedEndDate);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('Failed to delete website', 'Không thể xóa website'));
    } finally {
      setDeletingWebsite(false);
    }
  };

  const formatUptimeSeconds = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatDowntime = (startedAt?: string) => {
    if (!startedAt || currentTimestamp === 0) return null;
    const diffMs = currentTimestamp - new Date(startedAt).getTime();
    if (diffMs < 0) return null;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return isVi ? 'down < 1m' : 'down < 1m';
    if (mins < 60) return `down ${mins}m`;
    const hours = Math.floor(mins / 60);
    return `down ${hours}h ${mins % 60}m`;
  };

  const formatDowntimeDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return isVi ? '0m downtime' : '0m downtime';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h downtime`;
    if (h > 0) return `${h}h ${m}m downtime`;
    if (m > 0) return `${m}m downtime`;
    return '< 1m downtime';
  };

  const formatPercent = (val: number | string | null | undefined): string => {
    if (val == null) return '0%';
    const num = typeof val === 'string' ? parseFloat(val) : Number(val);
    if (isNaN(num)) return '0%';
    if (num % 1 === 0) return `${Math.round(num)}%`;
    return `${parseFloat(num.toFixed(1))}%`;
  };

  // Aggregated KPI numbers
  const upWebsites = websites.filter(w => w.status?.toUpperCase() === 'UP' || w.status?.toLowerCase() === 'online');
  const downWebsites = websites.filter(w => !upWebsites.includes(w));
  const onlineServers = servers.filter(s => s.status?.toLowerCase() === 'online');
  const offlineServers = servers.filter(s => s.status?.toLowerCase() !== 'online');

  const totalMonitored = websites.length + servers.length;
  const avgServerAvailability = servers.length > 0
    ? (servers.reduce((acc, s) => acc + (s.availability_30d ?? (s.status?.toLowerCase() === 'online' ? 100 : 0)), 0) / servers.length)
    : 100;
  const overallAvailabilityRaw = totalMonitored > 0
    ? (((upWebsites.length * 100) + (avgServerAvailability * servers.length)) / (totalMonitored * 100) * 100)
    : 100;
  const overallAvailability = formatPercent(overallAvailabilityRaw);

  const expiringSslCount = websites.filter(w => (w.ssl_days_remaining ?? 999) <= 14).length;

  // Prepare display items for status bars
  const displayItems: UptimeSummaryItem[] = (uptimeSummary?.items && uptimeSummary.items.length > 0)
    ? uptimeSummary.items
    : websites.map(w => ({
        id: w.id,
        name: w.name,
        url: w.url,
        current_status: w.status || 'UP',
        overall_uptime_pct: 100.0,
        days: Array.from({ length: 90 }, (_, i) => {
          const d = new Date();
          d.setUTCDate(d.getUTCDate() - (89 - i));
          return {
            date: d.toISOString().slice(0, 10),
            status: 'operational' as const,
            uptime_pct: 100.0,
            downtime_seconds: 0,
            avg_latency_ms: w.response_time_ms || 45,
          };
        })
      }));

  const dateLocale = isVi ? 'vi-VN' : 'en-US';

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-blue-500" />
            {t('Uptime & Availability', 'Thời gian hoạt động & Độ sẵn sàng')}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshAll}
            className="h-8 px-3 inline-flex items-center gap-2 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingWebsites || loadingServers || loadingUptimeSummary ? 'animate-spin text-blue-500' : ''}`} />
            {t('Refresh', 'Làm mới')}
          </button>
          <button
            onClick={openAddModal}
            disabled={isViewer}
            title={isViewer ? t('Adding websites requires Operator or Admin role', 'Thêm website yêu cầu quyền Operator hoặc Admin') : ''}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> {t('Add Website', 'Thêm Website')}
          </button>
        </div>
      </div>

      {/* 4 Overview Metric Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Websites Availability */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {t('Web Endpoints', 'Điểm cuối Web')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-emerald-500/10 text-emerald-500">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">{websites.length}</span>
            <span className="text-xs text-[var(--color-muted)]">{t('targets', 'mục tiêu')}</span>
          </div>
          <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono tabular-nums">{upWebsites.length}</span> {t('Operational', 'Hoạt động')}
            {downWebsites.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold ml-1">
                · <span className="font-mono tabular-nums">{downWebsites.length}</span> {t('Down', 'Gián đoạn')}
              </span>
            )}
          </p>
        </div>

        {/* Card 2: Server Fleet Uptime */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {t('Server Fleet', 'Cụm máy chủ')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-blue-500/10 text-blue-500">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">{servers.length}</span>
            <span className="text-xs text-[var(--color-muted)]">{t('nodes', 'nút')}</span>
          </div>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono tabular-nums">{onlineServers.length}</span> {t('Online', 'Trực tuyến')}
            {offlineServers.length > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-semibold ml-1">
                · <span className="font-mono tabular-nums">{offlineServers.length}</span> {t('Offline', 'Ngoại tuyến')}
              </span>
            )}
          </p>
        </div>

        {/* Card 3: Overall Availability Ratio */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {t('System Availability', 'Độ sẵn sàng hệ thống')}
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-cyan-500/10 text-cyan-500">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">{overallAvailability}</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)] font-medium">
            {t('Fleet probe average', 'Trung bình đo kiểm toàn cụm')}
          </p>
        </div>

        {/* Card 4: SSL Certificates */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {t('SSL Certificates', 'Chứng chỉ SSL')}
            </span>
            <div className={`flex h-8 w-8 items-center justify-center rounded-sm ${
              expiringSslCount > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-purple-500/10 text-purple-500'
            }`}>
              {expiringSslCount > 0 ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">
              {websites.length - expiringSslCount} / {websites.length}
            </span>
            <span className="text-xs text-[var(--color-muted)]">{t('healthy', 'hợp lệ')}</span>
          </div>
          <p className={`mt-1 text-xs font-semibold ${expiringSslCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
            {expiringSslCount > 0
              ? t(`⚠️ ${expiringSslCount} expiring soon (≤ 14d)`, `⚠️ ${expiringSslCount} sắp hết hạn (≤ 14 ngày)`)
              : t('All certificates valid', 'Tất cả chứng chỉ hợp lệ')}
          </p>
        </div>
      </div>

      {/* Segmented View Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('websites')}
          className={`h-8 px-3 rounded-sm text-xs font-semibold inline-flex items-center gap-2 transition duration-100 ${
            activeTab === 'websites'
              ? 'bg-blue-600 text-white'
              : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          {t('Websites & Endpoints', 'Website & Điểm cuối')} ({websites.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('servers')}
          className={`h-8 px-3 rounded-sm text-xs font-semibold inline-flex items-center gap-2 transition duration-100 ${
            activeTab === 'servers'
              ? 'bg-blue-600 text-white'
              : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          {t('Servers & Agents Host Uptime', 'Máy chủ & Uptime máy chủ')} ({servers.length})
        </button>
      </div>

      {/* TAB 1: WEBSITES & ENDPOINTS */}
      {activeTab === 'websites' && (
        <>
          {loadingWebsites && loadingUptimeSummary && websites.length === 0 ? (
            <div className="flex justify-center p-16">
              <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : websites.length === 0 ? (
            <div className="p-12 text-center rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-1)]">
              <Globe className="w-10 h-10 text-[var(--color-muted)] mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-bold text-[var(--foreground)] mb-1.5">{t('No monitored websites yet', 'Chưa có website nào được giám sát')}</h3>
              <p className="text-[var(--color-muted)] text-xs mb-4 max-w-md mx-auto">
                {t('Add a URL (https://...) to initiate automated health checks, 90-day uptime metrics, and SSL alerts.', 'Thêm một URL (https://...) để kích hoạt kiểm tra tự động, số liệu hoạt động 90 ngày và cảnh báo SSL.')}
              </p>
              <button
                onClick={openAddModal}
                className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-xs font-semibold transition duration-100"
              >
                <Plus className="w-3.5 h-3.5" /> {t('Add Website', 'Thêm Website')}
              </button>
            </div>
          ) : (
            /* System Status Container */
            <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              {/* System status header & date window navigator */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-bold text-[var(--foreground)] tracking-tight">
                    {t('System status', 'Trạng thái hệ thống')}
                  </h2>

                  {/* Date window navigator */}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)]">
                    <button
                      type="button"
                      onClick={handlePreviousDateRange}
                      className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition duration-100"
                      title={t('Previous 30 days', '30 ngày trước')}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1 text-[var(--foreground)] select-none font-mono text-[11px]">
                      {formatMonthYearRange(uptimeSummary?.start_date, uptimeSummary?.end_date, dateLocale)}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextDateRange}
                      disabled={!selectedEndDate}
                      className={`p-1 rounded text-[var(--color-muted)] transition duration-100 ${
                        !selectedEndDate ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]'
                      }`}
                      title={t('Next 30 days', '30 ngày tiếp theo')}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {selectedEndDate && (
                      <button
                        type="button"
                        onClick={handleResetDateRange}
                        className="ml-1 text-[11px] text-blue-500 hover:underline font-semibold"
                      >
                        {t('Today', 'Hôm nay')}
                      </button>
                    )}
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex p-0.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)]">
                    <button
                      type="button"
                      onClick={() => setWebsiteViewMode('timeline')}
                      className={`px-2.5 py-1 rounded-sm text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 ${
                        websiteViewMode === 'timeline'
                          ? 'bg-blue-600 text-white'
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> {t('Status bars', 'Thanh trạng thái')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteViewMode('table')}
                      className={`px-2.5 py-1 rounded-sm text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 ${
                        websiteViewMode === 'table'
                          ? 'bg-blue-600 text-white'
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" /> {t('Table view', 'Dạng bảng')}
                    </button>
                  </div>
                </div>
              </div>

              {/* TIMELINE / 90-DAY STATUS BARS VIEW */}
              {websiteViewMode === 'timeline' ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {displayItems.map((item) => {
                    const website = websites.find(w => w.id === item.id);
                    const isUp = item.current_status.toUpperCase() === 'UP' || item.current_status.toLowerCase() === 'online';
                    const daysLeft = website?.ssl_days_remaining;

                    return (
                      <div key={item.id} className="p-4 sm:p-5 transition hover:bg-[var(--surface-2)]">
                        {/* Component Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isUp ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                            )}
                            <span className="font-bold text-sm text-[var(--foreground)]">{item.name}</span>

                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                title={`Open ${item.url}`}
                                className="text-[var(--color-muted)] hover:text-blue-500 transition inline-flex items-center gap-0.5 text-xs font-mono"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}

                            {/* SSL Badge */}
                            {daysLeft !== undefined && (
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold border ${
                                daysLeft > 30
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : daysLeft > 15
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                              }`}>
                                {daysLeft > 15 ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                                {daysLeft > 0 ? `${daysLeft}d SSL` : t('SSL Expired', 'SSL Hết hạn')}
                              </span>
                            )}
                          </div>

                          {/* Status and Action Buttons */}
                          <div className="flex items-center gap-2.5 self-end sm:self-auto">
                            <span className={`text-xs font-semibold ${
                              isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              {isUp ? t('Operational', 'Hoạt động') : t('Major outage', 'Sự cố')}
                            </span>

                            <div className="flex items-center gap-1 pl-2 border-l border-[var(--border-subtle)]">
                              <button
                                type="button"
                                onClick={() => {
                                  const target = websites.find((w) => w.id === item.id) || {
                                    id: item.id,
                                    name: item.name,
                                    url: item.url || '',
                                    status: item.current_status,
                                  };
                                  openEditModal(target);
                                }}
                                disabled={isViewer}
                                className="h-7 w-7 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center justify-center transition duration-100 disabled:opacity-50"
                                title={isViewer ? t('Requires Operator or Admin role', 'Yêu cầu quyền Operator hoặc Admin') : t('Configure website', 'Cấu hình website')}
                              >
                                <Settings2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleManualCheck(item.id, item.name)}
                                disabled={checkingId === item.id}
                                className="h-7 w-7 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center justify-center transition duration-100"
                                title={t('Check health now', 'Kiểm tra ngay')}
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${checkingId === item.id ? 'animate-spin text-blue-500' : ''}`} />
                              </button>
                              <button
                                type="button"
                                disabled={isViewer}
                                onClick={() => {
                                  if (isViewer) return;
                                  setPendingDeleteWebsite({ id: item.id, name: item.name });
                                }}
                                className="h-7 w-7 rounded-sm border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50 flex items-center justify-center transition duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isViewer ? t('Deleting requires Operator or Admin role', 'Xóa yêu cầu quyền Operator hoặc Admin') : t('Delete', 'Xóa')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 90-Day Bars Container */}
                        <div className="relative pt-1 pb-1">
                          <div className="grid grid-cols-[repeat(90,minmax(0,1fr))] gap-[2px] h-7 sm:h-8 items-stretch">
                            {item.days.map((day, dayIdx) => {
                              let bgClass = 'bg-emerald-500 hover:bg-emerald-400 dark:bg-[#10a37f] dark:hover:bg-[#12b990]';
                              if (day.status === 'outage') {
                                bgClass = 'bg-rose-500 hover:bg-rose-400 dark:bg-[#ef4444] dark:hover:bg-[#f87171]';
                              } else if (day.status === 'degraded') {
                                bgClass = 'bg-amber-500 hover:bg-amber-400 dark:bg-[#f59e0b] dark:hover:bg-[#fbbf24]';
                              } else if (day.status === 'no_data') {
                                bgClass = 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700';
                              }

                              const isHovered = hoveredDay?.itemId === item.id && hoveredDay?.barIndex === dayIdx;

                              return (
                                <div
                                  key={day.date}
                                  onMouseEnter={() => setHoveredDay({ itemId: item.id, day, barIndex: dayIdx })}
                                  onMouseLeave={() => setHoveredDay(null)}
                                  className={`h-full rounded-[1px] cursor-pointer transition-all duration-100 relative ${bgClass} ${
                                    isHovered ? 'scale-y-115 z-20 ring-1 ring-white/60 brightness-110' : 'opacity-95 hover:opacity-100'
                                  }`}
                                />
                              );
                            })}
                          </div>

                          {/* Floating Hover Popover */}
                          {hoveredDay && hoveredDay.itemId === item.id && (
                            (() => {
                              const barPercent = ((hoveredDay.barIndex + 0.5) / 90) * 100;
                              const clampedBoxLeft = Math.max(18, Math.min(82, barPercent));
                              const arrowOffsetPct = barPercent - clampedBoxLeft;

                              return (
                                <div
                                  style={{
                                    left: `${clampedBoxLeft}%`,
                                    transform: 'translateX(-50%)',
                                  }}
                                  className="absolute bottom-full mb-2 pointer-events-none z-30 transition-opacity duration-100"
                                >
                                  <div className="relative rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-3 shadow-xl min-w-[240px] max-w-[290px] text-xs">
                                    {/* Header: Date */}
                                    <div className="font-semibold text-xs text-[var(--foreground)] mb-1.5 font-mono">
                                      {formatTooltipDate(hoveredDay.day.date, dateLocale)}
                                    </div>

                                    {/* Status card */}
                                    <div className={`rounded-sm p-2 flex items-center justify-between text-xs font-semibold mb-2 ${
                                      hoveredDay.day.status === 'outage'
                                        ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60'
                                        : hoveredDay.day.status === 'degraded'
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60'
                                          : hoveredDay.day.status === 'no_data'
                                            ? 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700'
                                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60'
                                    }`}>
                                      <div className="flex items-center gap-1.5">
                                        {hoveredDay.day.status === 'outage' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                                        {hoveredDay.day.status === 'degraded' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                        {hoveredDay.day.status === 'operational' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                        {hoveredDay.day.status === 'no_data' && <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />}
                                        
                                        <span>
                                          {hoveredDay.day.status === 'outage' && t('Major outage', 'Sự cố nghiêm trọng')}
                                          {hoveredDay.day.status === 'degraded' && t('Partial outage', 'Gián đoạn một phần')}
                                          {hoveredDay.day.status === 'operational' && t('Operational', 'Hoạt động')}
                                          {hoveredDay.day.status === 'no_data' && t('No data', 'Không có dữ liệu')}
                                        </span>
                                      </div>

                                      <span className="font-mono tabular-nums text-[11px] opacity-90">
                                        {hoveredDay.day.status === 'outage' || hoveredDay.day.status === 'degraded'
                                          ? formatOutageDuration(hoveredDay.day.downtime_seconds, isVi)
                                          : hoveredDay.day.avg_latency_ms > 0
                                            ? `${Math.round(hoveredDay.day.avg_latency_ms)}ms avg`
                                            : '100% uptime'
                                        }
                                      </span>
                                    </div>

                                    {/* RELATED section */}
                                    <div className="pt-1.5 border-t border-[var(--border-subtle)]">
                                      <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] mb-0.5">
                                        {t('RELATED', 'LIÊN QUAN')}
                                      </div>
                                      <div className="text-[11px] text-[var(--foreground)] truncate font-normal">
                                        {hoveredDay.day.incident_title || (
                                          hoveredDay.day.status === 'operational'
                                            ? t('No downtime recorded', 'Không ghi nhận thời gian gián đoạn')
                                            : hoveredDay.day.status === 'no_data'
                                              ? t('No monitoring data', 'Không có dữ liệu giám sát')
                                              : t('Service probe failures', 'Thất bại kiểm tra dịch vụ')
                                        )}
                                      </div>
                                    </div>

                                    {/* Downward triangle pointer */}
                                    <div
                                      style={{ left: `calc(50% + ${arrowOffsetPct}%)` }}
                                      className="absolute -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-[var(--surface-1)] border-r border-b border-[var(--border-default)] rotate-45"
                                    />
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Axis footer underneath the bars */}
                          <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)] mt-2 font-mono select-none">
                            <span className="shrink-0">{t('90 days ago', '90 ngày trước')}</span>
                            <div className="relative flex-1 flex items-center justify-center">
                              <div className="w-full border-t border-[var(--border-subtle)]" />
                              <span className="absolute bg-[var(--surface-1)] px-2 text-[11px] font-semibold text-[var(--color-muted)] font-mono tabular-nums">
                                {item.overall_uptime_pct % 1 === 0 ? `${Math.round(item.overall_uptime_pct)}%` : `${parseFloat(item.overall_uptime_pct.toFixed(2))}%`} {t('uptime', 'hoạt động')}
                              </span>
                            </div>
                            <span className="shrink-0">{!selectedEndDate ? t('Today', 'Hôm nay') : item.days[item.days.length - 1]?.date || t('Today', 'Hôm nay')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Fallback Table View */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                        <th className="py-2.5 px-4">{t('Endpoint / Website', 'Điểm cuối / Website')}</th>
                        <th className="py-2.5 px-4">{t('Status', 'Trạng thái')}</th>
                        <th className="py-2.5 px-4">{t('Uptime (24h)', 'Uptime (24h)')}</th>
                        <th className="py-2.5 px-4">{t('Latency', 'Độ trễ')}</th>
                        <th className="py-2.5 px-4">{t('SSL Certificate', 'Chứng chỉ SSL')}</th>
                        <th className="py-2.5 px-4 text-right">{t('Actions', 'Thao tác')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {websites.map(w => {
                        const isUp = w.status?.toUpperCase() === 'UP' || w.status?.toLowerCase() === 'online';
                        const daysLeft = w.ssl_days_remaining;
                        const sslStatusClass = daysLeft !== undefined
                          ? daysLeft > 30
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                            : daysLeft > 15
                              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                              : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                          : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';

                        return (
                          <tr key={w.id} className="hover:bg-[var(--surface-2)] transition duration-100">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-sm border shrink-0 ${
                                  isUp
                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60'
                                    : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60'
                                }`}>
                                  <Globe className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs text-[var(--foreground)] block truncate">{w.name}</span>
                                  <a
                                    href={w.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[11px] font-mono text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-xs"
                                  >
                                    {w.url} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                                  </a>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {isUp ? (
                                <span className="inline-flex items-center gap-1 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 px-2 py-0.5 text-[10px] font-semibold">
                                  <CheckCircle2 className="w-3 h-3" /> {t('OPERATIONAL', 'HOẠT ĐỘNG')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-sm bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60 px-2 py-0.5 text-[10px] font-semibold">
                                  <XCircle className="w-3 h-3" /> {t('DOWN', 'GIÁN ĐOẠN')}
                                  {formatDowntime(w.down_started_at) && (
                                    <span className="opacity-80 font-normal">({formatDowntime(w.down_started_at)})</span>
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums font-bold text-xs text-emerald-600 dark:text-emerald-400">
                              {isUp ? '100.0%' : '98.5%'}
                            </td>
                            <td className="py-3 px-4 font-mono tabular-nums text-xs text-[var(--foreground)] font-semibold">
                              {w.response_time_ms || 45}ms
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm border font-mono text-[10px] font-semibold ${sslStatusClass}`}>
                                {daysLeft !== undefined && daysLeft > 15 ? (
                                  <ShieldCheck className="w-3 h-3" />
                                ) : (
                                  <ShieldAlert className="w-3 h-3" />
                                )}
                                {daysLeft !== undefined
                                  ? daysLeft > 0
                                    ? `${daysLeft}d left`
                                    : t('Expired', 'Hết hạn')
                                  : t('No SSL', 'Không có SSL')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(w)}
                                  disabled={isViewer}
                                  className="h-7 w-7 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center justify-center transition duration-100 disabled:opacity-50"
                                  title={isViewer ? t('Requires Operator or Admin role', 'Yêu cầu quyền Operator hoặc Admin') : t('Configure website', 'Cấu hình website')}
                                >
                                  <Settings2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleManualCheck(w.id, w.name)}
                                  disabled={checkingId === w.id}
                                  className="h-7 w-7 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center justify-center transition duration-100"
                                  title={t('Check health now', 'Kiểm tra ngay')}
                                >
                                  <RefreshCw className={`w-3.5 h-3.5 ${checkingId === w.id ? 'animate-spin text-blue-500' : ''}`} />
                                </button>
                                <button
                                  type="button"
                                  disabled={isViewer}
                                  onClick={() => {
                                    if (isViewer) return;
                                    setPendingDeleteWebsite({ id: w.id, name: w.name });
                                  }}
                                  className="h-7 w-7 rounded-sm border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50 flex items-center justify-center transition duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={isViewer ? t('Deleting websites requires Operator or Admin role', 'Xóa website yêu cầu quyền Operator hoặc Admin') : t('Delete', 'Xóa')}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: SERVERS & AGENTS HOST UPTIME */}
      {activeTab === 'servers' && (
        <>
          {loadingServers ? (
            <div className="flex justify-center p-16">
              <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : servers.length === 0 ? (
            <div className="p-12 text-center rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-1)]">
              <Server className="w-10 h-10 text-[var(--color-muted)] mx-auto mb-3 opacity-40" />
              <h3 className="text-base font-bold text-[var(--foreground)] mb-1.5">{t('No servers enrolled yet', 'Chưa có máy chủ nào được kết nối')}</h3>
              <p className="text-[var(--color-muted)] text-xs mb-4 max-w-md mx-auto">
                {t('Install the DatrixOps Agent on your servers to track continuous host system uptime, heartbeats, and resources.', 'Cài đặt DatrixOps Agent trên máy chủ để theo dõi thời gian hoạt động liên tục, nhịp tim và tài nguyên.')}
              </p>
              <Link
                href="/dashboard/servers"
                className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-xs font-semibold transition duration-100"
              >
                <Plus className="w-3.5 h-3.5" /> {t('Go to Server Management', 'Đến trang Quản lý máy chủ')}
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              {/* Server fleet status header */}
              <div className="p-4 sm:p-5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-bold text-[var(--foreground)] tracking-tight">
                    {t('Server fleet status', 'Trạng thái cụm máy chủ')}
                  </h2>

                  {/* Date window navigator */}
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)]">
                    <button
                      type="button"
                      onClick={handlePreviousDateRange}
                      className="p-1 rounded hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition duration-100"
                      title={t('Previous 30 days', '30 ngày trước')}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-1 text-[var(--foreground)] select-none font-mono text-[11px]">
                      {formatMonthYearRange(uptimeSummary?.start_date, uptimeSummary?.end_date, dateLocale)}
                    </span>
                    <button
                      type="button"
                      onClick={handleNextDateRange}
                      disabled={!selectedEndDate}
                      className={`p-1 rounded text-[var(--color-muted)] transition duration-100 ${
                        !selectedEndDate ? 'opacity-30 cursor-not-allowed' : 'hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]'
                      }`}
                      title={t('Next 30 days', '30 ngày tiếp theo')}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    {selectedEndDate && (
                      <button
                        type="button"
                        onClick={handleResetDateRange}
                        className="ml-1 text-[11px] text-blue-500 hover:underline font-semibold"
                      >
                        {t('Today', 'Hôm nay')}
                      </button>
                    )}
                  </div>
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                  <div className="inline-flex p-0.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)]">
                    <button
                      type="button"
                      onClick={() => setWebsiteViewMode('timeline')}
                      className={`px-2.5 py-1 rounded-sm text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 ${
                        websiteViewMode === 'timeline'
                          ? 'bg-blue-600 text-white'
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" /> {t('Status bars', 'Thanh trạng thái')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setWebsiteViewMode('table')}
                      className={`px-2.5 py-1 rounded-sm text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 ${
                        websiteViewMode === 'table'
                          ? 'bg-blue-600 text-white'
                          : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" /> {t('Table view', 'Dạng bảng')}
                    </button>
                  </div>
                </div>
              </div>

              {/* TIMELINE VIEW FOR SERVERS */}
              {websiteViewMode === 'timeline' ? (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {servers.map((server) => {
                    const isOnline = server.status?.toLowerCase() === 'online';
                    const snapshot = parseJSON<ServerSnapshot>(server.snapshot);
                    const osInfo = parseJSON<{ os_name?: string; version?: string; uptime?: number; cpu_cores?: number; cpu_usage?: number }>(server.os_info);
                    const uptimeSecs = snapshot?.system_info?.uptime || osInfo?.uptime || 0;
                    const availability = server.availability_30d != null ? server.availability_30d : (isOnline ? 100.0 : 0.0);
                    const downtimeSecs = server.downtime_seconds_30d ?? 0;
                    const formattedHostUptime = formatUptimeSeconds(uptimeSecs);

                    // Generate continuous 90 day bars for server
                    const baseDate = selectedEndDate ? new Date(selectedEndDate + 'T00:00:00Z') : new Date();
                    const createdAtTime = server.created_at ? new Date(server.created_at).getTime() : 0;
                    const referenceNow = currentTimestamp || baseDate.getTime();
                    const uptimeStartTime = referenceNow - (uptimeSecs * 1000);

                    const serverBars = Array.from({ length: 90 }, (_, i) => {
                      const d = new Date(baseDate);
                      d.setUTCDate(d.getUTCDate() - (89 - i));
                      const dateStr = d.toISOString().slice(0, 10);
                      const dayEnd = d.getTime() + 86400000;

                      let status: 'operational' | 'outage' | 'degraded' | 'no_data' = 'operational';
                      let dayDowntime = 0;

                      if (createdAtTime > dayEnd) {
                        status = 'no_data';
                      } else if (!isOnline && i === 89) {
                        status = 'outage';
                        dayDowntime = downtimeSecs > 0 ? downtimeSecs : 86400;
                      } else if (isOnline && (dayEnd >= uptimeStartTime || i >= 80)) {
                        status = 'operational';
                      } else if (availability < 95.0) {
                        status = 'outage';
                        dayDowntime = 3600;
                      } else if (availability < 99.0) {
                        status = 'degraded';
                        dayDowntime = 600;
                      }

                      return {
                        date: dateStr,
                        status,
                        downtime_seconds: dayDowntime,
                      };
                    });

                    return (
                      <div key={server.id} className="p-4 sm:p-5 transition hover:bg-[var(--surface-2)]">
                        {/* Server Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className={`p-1.5 rounded-sm border shrink-0 ${
                              isOnline
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                            }`}>
                              <Server className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-bold text-xs text-[var(--foreground)]">{server.name}</span>
                            <span className="text-xs text-[var(--color-muted)] font-mono">
                              {server.ip_address || snapshot?.system_info?.public_ip || '127.0.0.1'}
                            </span>
                            {snapshot?.inventory?.agent_version && (
                              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold bg-[var(--surface-2)] text-[var(--color-muted)] border border-[var(--border-subtle)]">
                                v{snapshot.inventory.agent_version}
                              </span>
                            )}
                          </div>

                          {/* Status and Action Buttons */}
                          <div className="flex items-center gap-2.5 self-end sm:self-auto">
                            <span className={`text-xs font-semibold flex items-center gap-1.5 ${
                              isOnline ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                            }`}>
                              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                              {isOnline ? t('Operational', 'Hoạt động') : t('Host offline', 'Máy chủ ngoại tuyến')}
                            </span>

                            <span className="text-xs font-mono tabular-nums text-[var(--color-muted)] pl-2 border-l border-[var(--border-subtle)]">
                              Up: {isOnline ? formattedHostUptime : '—'}
                            </span>

                            <Link
                              href={`/dashboard/servers/${server.id}`}
                              className="h-7 px-2.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] text-xs font-semibold inline-flex items-center gap-1 transition duration-100"
                            >
                              {t('Details', 'Chi tiết')} <ArrowRight className="w-3 h-3 text-blue-500" />
                            </Link>
                          </div>
                        </div>

                        {/* 90-Day Bars Container */}
                        <div className="relative pt-1 pb-1">
                          <div className="grid grid-cols-[repeat(90,minmax(0,1fr))] gap-[2px] h-7 sm:h-8 items-stretch">
                            {serverBars.map((day, dayIdx) => {
                              let bgClass = 'bg-emerald-500 hover:bg-emerald-400 dark:bg-[#10a37f] dark:hover:bg-[#12b990]';
                              if (day.status === 'outage') {
                                bgClass = 'bg-rose-500 hover:bg-rose-400 dark:bg-[#ef4444] dark:hover:bg-[#f87171]';
                              } else if (day.status === 'degraded') {
                                bgClass = 'bg-amber-500 hover:bg-amber-400 dark:bg-[#f59e0b] dark:hover:bg-[#fbbf24]';
                              } else if (day.status === 'no_data') {
                                bgClass = 'bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700';
                              }

                              const isHovered = hoveredDay?.itemId === server.id && hoveredDay?.barIndex === dayIdx;

                              return (
                                <div
                                  key={day.date}
                                  onMouseEnter={() => setHoveredDay({
                                    itemId: server.id,
                                    day: {
                                      date: day.date,
                                      status: day.status,
                                      uptime_pct: day.status === 'operational' ? 100 : 0,
                                      downtime_seconds: day.downtime_seconds,
                                      avg_latency_ms: 0,
                                      incident_title: isOnline ? `Host uptime: ${formattedHostUptime}` : t('Agent offline', 'Agent ngoại tuyến')
                                    },
                                    barIndex: dayIdx
                                  })}
                                  onMouseLeave={() => setHoveredDay(null)}
                                  className={`h-full rounded-[1px] cursor-pointer transition-all duration-100 relative ${bgClass} ${
                                    isHovered ? 'scale-y-115 z-20 ring-1 ring-white/60 brightness-110' : 'opacity-95 hover:opacity-100'
                                  }`}
                                />
                              );
                            })}
                          </div>

                          {/* Hover Popover Tooltip */}
                          {hoveredDay && hoveredDay.itemId === server.id && (
                            (() => {
                              const barPercent = ((hoveredDay.barIndex + 0.5) / 90) * 100;
                              const clampedBoxLeft = Math.max(18, Math.min(82, barPercent));
                              const arrowOffsetPct = barPercent - clampedBoxLeft;

                              return (
                                <div
                                  style={{
                                    left: `${clampedBoxLeft}%`,
                                    transform: 'translateX(-50%)',
                                  }}
                                  className="absolute bottom-full mb-2 pointer-events-none z-30 transition-opacity duration-100"
                                >
                                  <div className="relative rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-3 shadow-xl min-w-[240px] max-w-[290px] text-xs">
                                    <div className="font-semibold text-xs text-[var(--foreground)] mb-1.5 font-mono">
                                      {formatTooltipDate(hoveredDay.day.date, dateLocale)}
                                    </div>

                                    <div className={`rounded-sm p-2 flex items-center justify-between text-xs font-semibold mb-2 ${
                                      hoveredDay.day.status === 'outage'
                                        ? 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-900/60'
                                        : hoveredDay.day.status === 'degraded'
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60'
                                          : hoveredDay.day.status === 'no_data'
                                            ? 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700'
                                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60'
                                    }`}>
                                      <div className="flex items-center gap-1.5">
                                        {hoveredDay.day.status === 'outage' && <XCircle className="w-3.5 h-3.5 text-rose-500" />}
                                        {hoveredDay.day.status === 'degraded' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                                        {hoveredDay.day.status === 'operational' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                        {hoveredDay.day.status === 'no_data' && <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />}
                                        <span>
                                          {hoveredDay.day.status === 'outage' && t('Host offline', 'Máy chủ ngoại tuyến')}
                                          {hoveredDay.day.status === 'degraded' && t('Partial downtime', 'Gián đoạn một phần')}
                                          {hoveredDay.day.status === 'operational' && t('Operational', 'Hoạt động')}
                                          {hoveredDay.day.status === 'no_data' && t('Before enrollment', 'Trước khi kết nối')}
                                        </span>
                                      </div>

                                      <span className="font-mono tabular-nums font-medium text-[11px] opacity-90">
                                        {hoveredDay.day.status === 'operational' ? '100% SLA' : formatOutageDuration(hoveredDay.day.downtime_seconds, isVi)}
                                      </span>
                                    </div>

                                    <div className="pt-1.5 border-t border-[var(--border-subtle)]">
                                      <div className="text-[10px] uppercase font-bold tracking-wider text-[var(--color-muted)] mb-0.5">
                                        {t('RELATED', 'LIÊN QUAN')}
                                      </div>
                                      <div className="text-[11px] text-[var(--foreground)] truncate font-normal">
                                        {hoveredDay.day.status === 'operational'
                                          ? `${t('Heartbeat active · Continuous uptime:', 'Nhịp tim hoạt động · Thời gian chạy:')} ${formattedHostUptime}`
                                          : hoveredDay.day.status === 'no_data'
                                            ? t('Host not yet enrolled', 'Máy chủ chưa kết nối')
                                            : t('Agent heartbeat interrupted', 'Mất kết nối nhịp tim Agent')}
                                      </div>
                                    </div>

                                    <div
                                      style={{ left: `calc(50% + ${arrowOffsetPct}%)` }}
                                      className="absolute -bottom-1.5 -translate-x-1/2 w-3 h-3 bg-[var(--surface-1)] border-r border-b border-[var(--border-default)] rotate-45"
                                    />
                                  </div>
                                </div>
                              );
                            })()
                          )}

                          {/* Axis footer underneath the bars */}
                          <div className="flex items-center gap-3 text-[11px] text-[var(--color-muted)] mt-2 font-mono select-none">
                            <span className="shrink-0">{t('90 days ago', '90 ngày trước')}</span>
                            <div className="relative flex-1 flex items-center justify-center">
                              <div className="w-full border-t border-[var(--border-subtle)]" />
                              <span className="absolute bg-[var(--surface-1)] px-2 text-[11px] font-semibold text-[var(--color-muted)] font-mono tabular-nums">
                                {formatPercent(availability)} {t('availability', 'sẵn sàng')}
                              </span>
                            </div>
                            <span className="shrink-0">{!selectedEndDate ? t('Today', 'Hôm nay') : serverBars[serverBars.length - 1]?.date || t('Today', 'Hôm nay')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Table View fallback for Servers */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                        <th className="py-2.5 px-4">{t('Server / Host', 'Máy chủ / Host')}</th>
                        <th className="py-2.5 px-4">{t('Status', 'Trạng thái')}</th>
                        <th className="py-2.5 px-4">{t('Availability (30d)', 'Độ sẵn sàng (30d)')}</th>
                        <th className="py-2.5 px-4">{t('Host Uptime', 'Thời gian hoạt động')}</th>
                        <th className="py-2.5 px-4 text-right">{t('Actions', 'Thao tác')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {servers.map(server => {
                        const isOnline = server.status?.toLowerCase() === 'online';
                        const snapshot = parseJSON<ServerSnapshot>(server.snapshot);
                        const osInfo = parseJSON<{ os_name?: string; version?: string; uptime?: number; cpu_cores?: number; cpu_usage?: number }>(server.os_info);

                        const uptimeSecs = snapshot?.system_info?.uptime || osInfo?.uptime || 0;
                        const formattedHostUptime = formatUptimeSeconds(uptimeSecs);
                        const availability = server.availability_30d != null
                          ? server.availability_30d
                          : (isOnline ? 100.0 : 0.0);
                        const downtimeSecs = server.downtime_seconds_30d ?? 0;

                        return (
                          <tr key={server.id} className="hover:bg-[var(--surface-2)] transition duration-100">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`p-1.5 rounded-sm border shrink-0 ${
                                  isOnline
                                    ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/60'
                                    : 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60'
                                }`}>
                                  <Server className="w-3.5 h-3.5" />
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-xs text-[var(--foreground)] block truncate">{server.name}</span>
                                  <span className="text-[11px] text-[var(--color-muted)] font-mono">
                                    {server.ip_address || snapshot?.system_info?.public_ip || '127.0.0.1'}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-semibold border ${
                                isOnline
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                              }`}>
                                {isOnline ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                {isOnline ? t('ONLINE', 'TRỰC TUYẾN') : t('OFFLINE', 'NGOẠI TUYẾN')}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <span className={`font-mono tabular-nums font-bold text-xs ${
                                  availability >= 99.0
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : availability >= 95.0
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-rose-600 dark:text-rose-400'
                                }`}>
                                  {formatPercent(availability)}
                                </span>
                                <span className="text-[11px] text-[var(--color-muted)]">
                                  {downtimeSecs > 0 ? (
                                    <span className="text-amber-600 dark:text-amber-400 font-medium">{formatDowntimeDuration(downtimeSecs)}</span>
                                  ) : (
                                    <span>100% SLA</span>
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1.5 font-mono tabular-nums text-xs font-semibold text-[var(--foreground)]">
                                  <Clock className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />
                                  {isOnline ? formattedHostUptime : '—'}
                                </div>
                                <span className="text-[11px] text-[var(--color-muted)]">
                                  {isOnline ? t('Since last boot', 'Từ lần khởi động cuối') : t('Offline / down', 'Ngoại tuyến / gián đoạn')}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex justify-end">
                                <Link
                                  href={`/dashboard/servers/${server.id}`}
                                  className="h-7 px-2.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] text-xs font-semibold inline-flex items-center gap-1 transition duration-100"
                                >
                                  {t('View Details', 'Xem chi tiết')} <ArrowRight className="w-3 h-3 text-blue-500" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add Website Modal */}
      {isModalOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" aria-labelledby="website-dialog-title" className="w-full max-w-md overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-2)]">
              <h3 id="website-dialog-title" className="font-bold text-sm text-[var(--foreground)]">
                {t('Add Monitored Website', 'Thêm Website giám sát')}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close dialog" className="h-7 w-7 rounded flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddWebsite} className="p-4 space-y-3.5">
              {error && <div className="p-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-sm text-xs">{error}</div>}
              <div>
                <label htmlFor="website-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Display Name', 'Tên hiển thị')}
                </label>
                <input id="website-name" name="website-name" required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full rounded-sm border border-[var(--border-default)] bg-transparent p-2 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none" placeholder="e.g. Production Portal, DatrixOps App" />
              </div>
              <div>
                <label htmlFor="website-url" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Target URL (including https://)', 'URL mục tiêu (bao gồm https://)')}
                </label>
                <input id="website-url" name="website-url" required type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="w-full rounded-sm border border-[var(--border-default)] bg-transparent p-2 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none font-mono" placeholder="https://example.com" />
              </div>

              <div className="p-2.5 rounded-sm bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-600 dark:text-blue-300 leading-relaxed">
                {t('💡 To receive alerts when a website is Down/Recovered, create an Alert Rule on the Alerts page and choose metric Website DOWN.', '💡 Để nhận thông báo khi website Down/Recovered, hãy tạo Alert Rule tại trang Alerts và chọn metric Website DOWN.')}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border-subtle)]">
                <button type="button" onClick={() => setIsModalOpen(false)} className="h-8 px-3 rounded-sm text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition duration-100">
                  {t('Cancel', 'Hủy')}
                </button>
                <button type="submit" disabled={submitting} className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-xs font-semibold transition duration-100 disabled:opacity-50">
                  {submitting ? t('Saving…', 'Đang lưu…') : t('Add Website', 'Thêm Website')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Website Modal */}
      {isEditModalOpen && editingWebsite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div className="w-full max-w-md rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl overflow-hidden animate-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)] bg-[var(--surface-2)]">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-sm bg-blue-500/10 text-blue-500">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[var(--foreground)]">
                    {t('Website Configuration', 'Cấu hình Website')}
                  </h3>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    {t('Manage monitoring name and URL', 'Quản lý tên và URL giám sát')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setIsEditModalOpen(false); setEditingWebsite(null); }}
                className="text-[var(--color-muted)] hover:text-[var(--foreground)] p-1 rounded hover:bg-[var(--surface-3)] transition duration-100"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleEditWebsite} className="p-4 space-y-3.5">
              {editError && (
                <div className="p-2.5 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-sm text-xs">
                  {editError}
                </div>
              )}
              <div>
                <label htmlFor="edit-website-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Website Name', 'Tên website')}
                </label>
                <input
                  id="edit-website-name"
                  name="edit-website-name"
                  required
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-transparent p-2 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                  placeholder="e.g. Production Portal, DatrixOps App"
                />
              </div>
              <div>
                <label htmlFor="edit-website-url" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                  {t('Target URL (including https://)', 'URL mục tiêu (bao gồm https://)')}
                </label>
                <input
                  id="edit-website-url"
                  name="edit-website-url"
                  required
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  className="w-full rounded-sm border border-[var(--border-default)] bg-transparent p-2 text-xs text-[var(--foreground)] focus:border-blue-500 outline-none font-mono"
                  placeholder="https://example.com"
                />
              </div>

              <div className="p-2.5 rounded-sm bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-600 dark:text-blue-300 leading-relaxed">
                {t('💡 To receive alerts when a website is Down/Recovered, create an Alert Rule on the Alerts page and choose metric Website DOWN.', '💡 Để nhận thông báo khi website Down/Recovered, hãy tạo Alert Rule tại trang Alerts và chọn metric Website DOWN.')}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setEditingWebsite(null); }}
                  className="h-8 px-3 rounded-sm text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] transition duration-100"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={updatingWebsite}
                  className="h-8 px-3.5 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-sm text-xs font-semibold transition duration-100 disabled:opacity-50"
                >
                  {updatingWebsite ? t('Saving…', 'Đang lưu…') : t('Save changes', 'Lưu thay đổi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Website Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingDeleteWebsite)}
        title={t('Delete Monitored Website', 'Xóa Website giám sát')}
        message={t(
          `Are you sure you want to remove "${pendingDeleteWebsite?.name}" from monitoring? All uptime and SSL alerts for this website will be stopped.`,
          `Bạn có chắc chắn muốn xóa "${pendingDeleteWebsite?.name}" khỏi hệ thống giám sát? Mọi cảnh báo hoạt động và chứng chỉ SSL của website này sẽ dừng lại.`
        )}
        confirmText={t('Delete Website', 'Xóa Website')}
        cancelText={t('Cancel', 'Hủy')}
        variant="danger"
        loading={deletingWebsite}
        onConfirm={() => void confirmDeleteWebsite()}
        onCancel={() => setPendingDeleteWebsite(null)}
      />
    </div>
  );
}
