'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, Check, ChevronRight, CircleAlert,
  Cpu, Database, Plus, RefreshCw, Server, Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { useLanguage } from '@/components/LanguageContext';

type DashboardRange = '1H' | '2H' | '12H' | '24H';

type DashboardServer = {
  id: string;
  name: string;
  ip_address?: string;
  status: 'online' | 'offline' | string;
  cpu_usage: number;
  memory_used: number;
  memory_total: number;
  has_metrics: boolean;
  last_seen_at?: string;
};

type DashboardMetric = {
  bucket_time: string;
  cpu_usage: number;
  memory_usage: number;
};

type DashboardIncident = {
  rule_id: string;
  server_id: string;
  rule_name: string;
  server_name: string;
  metric: string;
  operator: string;
  threshold: number;
  status: string;
  last_triggered_at?: string;
};

type DashboardOverview = {
  generated_at: string;
  range: string;
  summary: {
    total_servers: number;
    online_servers: number;
    offline_servers: number;
    warning_servers: number;
    average_cpu: number;
    average_memory: number;
    memory_used: number;
    memory_total: number;
    open_incidents: number;
  };
  servers: DashboardServer[];
  metrics: DashboardMetric[];
  incidents: DashboardIncident[];
};

type ChartPoint = {
  t: string;
  cpu: number;
  ram: number;
};

const POLL_INTERVAL_MS = 15_000;

export default function OverviewDashboard() {
  const { t, isVi } = useLanguage();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [range, setRange] = useState<DashboardRange>('2H');
  const activeRequest = useRef<AbortController | null>(null);
  const hasLoaded = useRef(false);
  const router = useRouter();

  const fetchOverview = useCallback(async (replaceActiveRequest = false) => {
    if (activeRequest.current) {
      if (!replaceActiveRequest) return;
      activeRequest.current.abort();
    }

    const controller = new AbortController();
    activeRequest.current = controller;

    if (hasLoaded.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await apiClient(`/dashboard/overview?range=${range.toLowerCase()}`, {
        signal: controller.signal,
      });
      if (activeRequest.current !== controller) return;
      setOverview(data as DashboardOverview);
      setError('');
      hasLoaded.current = true;
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Unable to load dashboard data';
      if (message.includes('token') || message.includes('UNAUTHORIZED')) {
        router.push('/login');
        return;
      }
      setError(message);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [range, router]);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void fetchOverview(true), 0);
    const interval = window.setInterval(() => void fetchOverview(), POLL_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(interval);
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [fetchOverview]);

  const summary = overview?.summary;
  const servers = overview?.servers ?? [];
  const incidents = overview?.incidents ?? [];
  const total = summary?.total_servers ?? 0;
  const online = summary?.online_servers ?? 0;
  const offline = summary?.offline_servers ?? 0;
  const warning = summary?.warning_servers ?? 0;
  const health = total > 0 ? Math.round((online / total) * 100) : 0;
  const hasLiveMetrics = servers.some((server) => server.status === 'online' && server.has_metrics);
  const hasLiveMemory = (summary?.memory_total ?? 0) > 0;

  const chartData = useMemo<ChartPoint[]>(() => {
    return (overview?.metrics ?? []).map((metric) => ({
      t: formatChartTime(metric.bucket_time, range),
      cpu: roundMetric(metric.cpu_usage),
      ram: roundMetric(metric.memory_usage),
    }));
  }, [overview?.metrics, range]);

  const latestMetric = chartData.at(-1);

  if (loading && !overview) {
    return (
      <DashboardMessage
        title={t('Syncing live telemetry', 'Đang đồng bộ dữ liệu')}
        description={t('Fetching the latest fleet heartbeats, metrics, and incident state.', 'Đang nạp nhịp tim, thông số kỹ thuật và trạng thái cảnh báo.')}
        loading
      />
    );
  }

  if (!overview && error) {
    return (
      <DashboardMessage
        title={t('Unable to load telemetry', 'Không thể tải dữ liệu')}
        description={error}
        action={
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="inline-flex items-center gap-1.5 rounded-none border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono font-bold text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('Try again', 'Thử lại')}
          </button>
        }
      />
    );
  }

  const fleetStatus = getFleetStatus(total, online, incidents.length, t);

  return (
    <div className="space-y-3">
      {/* 1. Sub-header Control Bar (Exact 48px / h-12) */}
      <header className="h-12 px-3 sm:px-4 border border-[var(--border-subtle)] bg-[var(--surface-1)] flex items-center justify-between gap-3 rounded-none">
        {/* Left: Brand / Title / Snapshot */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <h1 className="font-mono text-xs font-bold tracking-wider uppercase text-[var(--foreground)] truncate">
              INFRASTRUCTURE // OVERVIEW
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-2 border-l border-[var(--border-subtle)] pl-3 font-mono text-[11px] text-[var(--color-muted)]">
            <span>
              {t('SNAPSHOT:', 'THỜI ĐIỂM:')}{' '}
              <strong className="text-[var(--foreground)] tabular-nums">
                {formatSnapshotTime(overview?.generated_at)}
              </strong>
            </span>
            <span>·</span>
            <span>
              {refreshing
                ? t('RECEIVING DATA…', 'ĐANG ĐỒNG BỘ…')
                : t('15S AUTO-POLL', 'TỰ ĐỘNG LÀM MỚI (15S)')}
            </span>
            {error && <span className="text-rose-500 font-bold truncate">[{error}]</span>}
          </div>
        </div>

        {/* Right: Range toggles + Refresh + Add server */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Time range selector */}
          <div className="inline-flex border border-[var(--border-subtle)] bg-[var(--surface-2)] p-0.5 rounded-none">
            {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => setRange(item)}
                className={`h-7 px-2 font-mono text-[11px] font-semibold transition-colors duration-100 rounded-none ${
                  range === item
                    ? 'bg-[var(--accent-primary)] text-white font-bold'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                }`}
                aria-pressed={range === item}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            title={t('Refresh now', 'Làm mới ngay')}
            className="h-8 px-2.5 inline-flex items-center gap-1.5 border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-mono font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50 rounded-none"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin text-[var(--accent-primary)]' : ''}`} />
            <span className="hidden sm:inline">{t('Refresh', 'Làm mới')}</span>
          </button>

          {/* Add server button */}
          <Link
            href="/dashboard/servers"
            className="h-8 px-3 inline-flex items-center gap-1.5 border border-blue-600 bg-blue-600 hover:bg-blue-500 text-xs font-mono font-bold text-white transition-colors rounded-none"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('Add server', 'Thêm server')}</span>
          </Link>
        </div>
      </header>

      {/* 2. Horizontal Telemetry Ribbon (5-Column Single Continuous Grid) */}
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)] border border-[var(--border-subtle)] bg-[var(--surface-1)] rounded-none">
        {/* Cell 1: AGENTS ONLINE */}
        <div className="p-3 sm:p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {t('Agents online', 'Agent trực tuyến')}
            </span>
            <span className="px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase rounded-none border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              LIVE
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {online}/{total}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              {total > 0 ? `${health}%` : '0%'}
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] mt-2 rounded-none overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${health}%` }} />
          </div>
          <span className="mt-1.5 font-mono text-[10px] text-[var(--color-muted)] truncate">
            {total > 0 ? `${health}% ` + t('healthy heartbeats', 'nhịp tim ổn định') : t('No agents connected', 'Chưa có kết nối')}
          </span>
        </div>

        {/* Cell 2: FLEET HEALTH */}
        <div className="p-3 sm:p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {t('Fleet health', 'Sức khỏe cụm')}
            </span>
            <span
              className={`px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase rounded-none border ${
                fleetStatus.tone === 'good'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              }`}
            >
              {fleetStatus.label}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {total > 0 ? `${health}%` : '—'}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              SCORE
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] mt-2 rounded-none overflow-hidden">
            <div
              className={`h-full transition-all ${fleetStatus.tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${health}%` }}
            />
          </div>
          <span className="mt-1.5 font-mono text-[10px] text-[var(--color-muted)] truncate">
            {offline} {t('offline', 'ngoại tuyến')} · {warning} {t('alerted', 'cảnh báo')}
          </span>
        </div>

        {/* Cell 3: AVERAGE CPU */}
        <div className="p-3 sm:p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {t('Average CPU', 'CPU trung bình')}
            </span>
            <span
              className={`px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase rounded-none border ${
                (summary?.average_cpu ?? 0) >= 75
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              }`}
            >
              {(summary?.average_cpu ?? 0) >= 75 ? 'HIGH' : 'NORMAL'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              LOAD
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] mt-2 rounded-none overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, summary?.average_cpu ?? 0))}%` }}
            />
          </div>
          <span className="mt-1.5 font-mono text-[10px] text-[var(--color-muted)] truncate">
            {hasLiveMetrics ? t('Cluster load average', 'Tải TB máy chủ online') : t('No metrics', 'Chưa có số liệu')}
          </span>
        </div>

        {/* Cell 4: MEMORY USED */}
        <div className="p-3 sm:p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {t('Memory used', 'RAM đã dùng')}
            </span>
            <span
              className={`px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase rounded-none border ${
                (summary?.average_memory ?? 0) >= 80
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
              }`}
            >
              {(summary?.average_memory ?? 0) >= 80 ? 'HIGH' : 'NORMAL'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-[var(--foreground)]">
              {hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              RAM
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] mt-2 rounded-none overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, summary?.average_memory ?? 0))}%` }}
            />
          </div>
          <span className="mt-1.5 font-mono text-[10px] text-[var(--color-muted)] truncate">
            {hasLiveMemory
              ? `${formatBytes(summary?.memory_used ?? 0)} / ${formatBytes(summary?.memory_total ?? 0)}`
              : t('No metrics', 'Chưa có số liệu')}
          </span>
        </div>

        {/* Cell 5: OPEN INCIDENTS */}
        <div className="p-3 sm:p-3.5 flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-[var(--color-muted)]">
              {t('Open incidents', 'Sự cố đang mở')}
            </span>
            <span
              className={`px-1.5 py-0.2 font-mono text-[9px] font-bold uppercase rounded-none border ${
                (summary?.open_incidents ?? 0) > 0
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {(summary?.open_incidents ?? 0) > 0 ? 'CRITICAL' : 'CLEAR'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span
              className={`font-mono text-xl sm:text-2xl font-bold tabular-nums ${
                (summary?.open_incidents ?? 0) > 0 ? 'text-rose-500' : 'text-[var(--foreground)]'
              }`}
            >
              {summary?.open_incidents ?? 0}
            </span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              ALERTS
            </span>
          </div>
          <div className="h-1.5 w-full bg-[var(--surface-2)] border border-[var(--border-subtle)] mt-2 rounded-none overflow-hidden">
            <div
              className={`h-full transition-all ${
                (summary?.open_incidents ?? 0) > 0 ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${(summary?.open_incidents ?? 0) > 0 ? 100 : 0}%` }}
            />
          </div>
          <span className="mt-1.5 font-mono text-[10px] text-[var(--color-muted)] truncate">
            {warning > 0
              ? `${warning} ` + t('affected servers', 'máy chủ bị ảnh hưởng')
              : t('All systems normal', 'Toàn bộ ổn định')}
          </span>
        </div>
      </section>

      {/* 3. Split Control Grid (Resource Load 60% + Active Incidents & Fleet Status Matrix 40%) */}
      <section className="grid gap-3 lg:grid-cols-12">
        {/* Left: Resource Load Area Chart (60% width -> lg:col-span-7 xl:col-span-8) */}
        <div className="lg:col-span-7 xl:col-span-8 border border-[var(--border-subtle)] bg-[var(--surface-1)] rounded-none flex flex-col justify-between overflow-hidden">
          {/* Card Header with Integrated Fleet Counters and Legend */}
          <div className="p-3 sm:px-4 sm:py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                RESOURCE LOAD // TELEMETRY
              </h2>
            </div>

            {/* Status Chips + Metric Legend */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                <span className="px-1.5 py-0.5 text-[10px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 rounded-none">
                  ONLINE: {online}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold border border-amber-500/30 bg-amber-500/10 text-amber-400 rounded-none">
                  WARN: {warning}
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-400 rounded-none">
                  OFFLINE: {offline}
                </span>
              </div>

              <div className="hidden sm:flex items-center gap-3 border-l border-[var(--border-subtle)] pl-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                  <span className="h-2 w-2 rounded-none bg-blue-500" />
                  CPU: <strong className="text-[var(--foreground)]">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
                  <span className="h-2 w-2 rounded-none bg-cyan-400" />
                  RAM: <strong className="text-[var(--foreground)]">{latestMetric ? `${latestMetric.ram}%` : '—'}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Area Chart View */}
          <div className="p-3 sm:p-4 min-h-[290px] flex-1">
            {chartData.length > 0 ? (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="overviewCpuFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="overviewRamFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#06B6D4" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="t"
                      stroke="var(--color-muted)"
                      fontSize={10}
                      tickLine={false}
                      axisLine={{ stroke: 'var(--border-subtle)' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 0,
                        fontSize: 11,
                        fontFamily: 'monospace',
                      }}
                      labelFormatter={(label) => label}
                      formatter={(value: unknown, name: unknown) => [`${value}%`, String(name)]}
                    />
                    <Area
                      type="monotone"
                      dataKey="ram"
                      name="Memory"
                      stroke="#06B6D4"
                      strokeWidth={1.5}
                      fill="url(#overviewRamFill)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU"
                      stroke="#2563EB"
                      strokeWidth={1.5}
                      fill="url(#overviewCpuFill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyPanel
                icon={Activity}
                title={t('No telemetry in this range', 'Không có dữ liệu trong khung thời gian này')}
                description={t('The chart will populate automatically when an agent transmits metrics.', 'Biểu đồ sẽ hiển thị ngay khi Agent gửi dữ liệu.')}
              />
            )}
          </div>
        </div>

        {/* Right: Active Incidents + Fleet Status Matrix (40% width -> lg:col-span-5 xl:col-span-4) */}
        <div className="lg:col-span-5 xl:col-span-4 border border-[var(--border-subtle)] bg-[var(--surface-1)] rounded-none flex flex-col justify-between overflow-hidden">
          <div>
            {/* Header */}
            <div className="p-3 sm:px-4 sm:py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircleAlert className="h-3.5 w-3.5 text-rose-500" />
                <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                  ACTIVE INCIDENTS
                </h2>
              </div>
              <span
                className={`font-mono text-[10px] font-bold px-1.5 py-0.5 border rounded-none uppercase ${
                  incidents.length > 0
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                }`}
              >
                {incidents.length} {t('FIRING', 'CẢNH BÁO')}
              </span>
            </div>

            {/* Incidents List or All Clear Terminal View */}
            <div className="p-3 space-y-2">
              {incidents.length > 0 ? (
                incidents.slice(0, 3).map((incident) => (
                  <IncidentRow
                    key={`${incident.rule_id}-${incident.server_id}`}
                    incident={incident}
                    isVi={isVi}
                  />
                ))
              ) : (
                <div className="p-3 border border-[var(--border-subtle)] bg-[var(--surface-2)] rounded-none font-mono text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <Check className="h-3.5 w-3.5" />
                    <span>[STATUS: ALL CLEAR]</span>
                  </div>
                  <p className="text-[var(--color-muted)] text-[11px] leading-relaxed">
                    {t(
                      'Zero active alerts firing across the monitored fleet. Heartbeats and threshold evaluations are operating within nominal limits.',
                      'Không có sự cố nào đang cảnh báo trong toàn cụm. Nhịp tim và ngưỡng đo đạc đang trong hạn mức danh định.'
                    )}
                  </p>
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[10px] text-[var(--color-muted)]">
                    <span>{t('MONITORED AGENTS:', 'MÁY CHỦ GIÁM SÁT:')} <strong className="text-[var(--foreground)]">{total}</strong></span>
                    <span>{t('ACTIVE ALERTS:', 'CẢNH BÁO MỞ:')} <strong className="text-emerald-400">0</strong></span>
                  </div>
                </div>
              )}

              {/* Fleet Status Matrix: Quick Agent Node Matrix */}
              <div className="mt-3 border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 rounded-none font-mono">
                <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[var(--color-muted)] mb-2">
                  <span>{t('FLEET NODE MATRIX', 'MA TRẬN MÁY CHỦ')}</span>
                  <span className="tabular-nums">{online}/{total} {t('LIVE', 'KẾT NỐI')}</span>
                </div>
                {servers.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {servers.slice(0, 6).map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/servers/${s.id}`}
                        className="flex items-center justify-between p-1.5 border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-hover)] transition-colors rounded-none text-[10px]"
                      >
                        <span className="truncate max-w-[90px] text-[var(--foreground)] font-semibold">{s.name}</span>
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-none ${
                            s.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--color-muted)]">
                    {t('No agents enrolled in matrix.', 'Chưa có máy chủ trong danh sách.')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Link to Incident Center */}
          <div className="p-3 pt-0">
            <Link
              href="/dashboard/alerts"
              className="w-full flex items-center justify-center gap-1.5 border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-default)] py-2 text-xs font-mono font-bold text-[var(--foreground)] rounded-none transition-colors"
            >
              <span>{t('OPEN INCIDENT CENTER', 'MỞ TRUNG TÂM SỰ CỐ')}</span>
              <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4. Full-Width Server Activity Table (100% Width) */}
      <section className="w-full border border-[var(--border-subtle)] bg-[var(--surface-1)] rounded-none overflow-hidden">
        {/* Table Header Controls */}
        <div className="p-3 sm:px-4 sm:py-2.5 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] flex items-center justify-between font-mono">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-blue-500" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
              SERVER ACTIVITY // FLEET REGISTRY
            </h2>
            <span className="hidden sm:inline-block font-mono text-[10px] text-[var(--color-muted)] border border-[var(--border-subtle)] px-2 py-0.2 rounded-none bg-[var(--surface-1)]">
              {servers.length} {t('NODES', 'MÁY CHỦ')}
            </span>
          </div>

          <Link
            href="/dashboard/servers"
            className="font-mono text-xs text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
          >
            {t('VIEW ALL NODES', 'XEM TẤT CẢ')}
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Structured Table with Crisp Cell Borders */}
        {servers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  <th className="px-4 py-2.5 font-bold border-r border-[var(--border-subtle)]">{t('NODE / HOSTNAME', 'MÁY CHỦ / IP')}</th>
                  <th className="px-4 py-2.5 font-bold border-r border-[var(--border-subtle)]">{t('STATUS', 'TRẠNG THÁI')}</th>
                  <th className="px-4 py-2.5 font-bold border-r border-[var(--border-subtle)]">{t('CPU LOAD', 'TẢI CPU')}</th>
                  <th className="px-4 py-2.5 font-bold border-r border-[var(--border-subtle)]">{t('MEMORY LOAD', 'BỘ NHỚ')}</th>
                  <th className="px-4 py-2.5 font-bold border-r border-[var(--border-subtle)]">{t('HEARTBEAT', 'NHỊP TIM')}</th>
                  <th className="px-4 py-2.5 font-bold text-right">{t('ACTION', 'THAO TÁC')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {servers.map((server) => (
                  <ServerRow key={server.id} server={server} isVi={isVi} t={t} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyPanel
              icon={Server}
              title={t('No servers registered', 'Chưa có máy chủ đăng ký')}
              description={t('Enroll your first agent to start collecting realtime telemetry.', 'Cài đặt Agent đầu tiên để bắt đầu thu thập số liệu giám sát.')}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ServerRow({
  server,
  isVi,
  t,
}: {
  server: DashboardServer;
  isVi: boolean;
  t: (en: string, vi: string) => string;
}) {
  const online = server.status === 'online';
  const memoryPercent = server.memory_total > 0 ? (server.memory_used * 100) / server.memory_total : 0;
  const canShowMetrics = online && server.has_metrics;

  return (
    <tr className="hover:bg-[var(--surface-hover)] transition-colors duration-100">
      <td className="px-4 py-2.5 border-r border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-none border border-[var(--border-subtle)] bg-[var(--surface-2)]">
            <Server className="h-3 w-3 text-[var(--color-muted)]" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-[var(--foreground)] truncate max-w-[200px] sm:max-w-[280px]">
              {server.name}
            </p>
            <p className="font-mono text-[10px] text-[var(--color-muted)] truncate">
              {server.ip_address ?? t('No IP assigned', 'Chưa gán IP')}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5 border-r border-[var(--border-subtle)] whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider border rounded-none ${
            online
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-none ${online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          {online ? t('ONLINE', 'TRỰC TUYẾN') : t('OFFLINE', 'NGOẠI TUYẾN')}
        </span>
      </td>
      <td className="px-4 py-2.5 border-r border-[var(--border-subtle)] whitespace-nowrap">
        {canShowMetrics ? (
          <LoadBar value={server.cpu_usage} />
        ) : (
          <span className="font-mono text-[10px] text-[var(--color-muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 border-r border-[var(--border-subtle)] whitespace-nowrap">
        {canShowMetrics ? (
          <LoadBar
            value={memoryPercent}
            label={server.memory_total > 0 ? `(${formatBytes(server.memory_used)} / ${formatBytes(server.memory_total)})` : undefined}
          />
        ) : (
          <span className="font-mono text-[10px] text-[var(--color-muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 border-r border-[var(--border-subtle)] font-mono text-[11px] tabular-nums text-[var(--color-muted)] whitespace-nowrap">
        {formatRelativeTime(server.last_seen_at, isVi)}
      </td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        <Link
          href={`/dashboard/servers/${server.id}`}
          className="font-mono text-[11px] text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1 font-semibold"
        >
          {t('MANAGE', 'QUẢN LÝ')} <ChevronRight className="h-3 w-3" />
        </Link>
      </td>
    </tr>
  );
}

function LoadBar({ value, label }: { value: number; label?: string }) {
  const normalized = Math.max(0, Math.min(value, 100));
  const isHigh = normalized >= 85;
  const isMed = normalized >= 70;
  const barColor = isHigh ? 'bg-rose-500' : isMed ? 'bg-amber-500' : 'bg-blue-500';
  const textColor = isHigh ? 'text-rose-400' : isMed ? 'text-amber-400' : 'text-blue-400';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-none bg-[var(--surface-2)] border border-[var(--border-subtle)]">
        <div className={`h-full rounded-none ${barColor}`} style={{ width: `${normalized}%` }} />
      </div>
      <span className={`font-mono tabular-nums text-[11px] font-bold ${textColor}`}>
        {roundMetric(value)}%
      </span>
      {label && <span className="font-mono text-[10px] text-[var(--color-muted)] hidden xl:inline">{label}</span>}
    </div>
  );
}

function IncidentRow({
  incident,
  isVi,
}: {
  incident: DashboardIncident;
  isVi: boolean;
}) {
  const valueDescription =
    incident.metric === 'status'
      ? 'HEARTBEAT > 60s'
      : `${incident.metric.toUpperCase()} ${incident.operator} ${roundMetric(incident.threshold)}%`;

  return (
    <div className="flex items-center gap-2.5 rounded-none border border-rose-500/20 bg-rose-500/[0.04] p-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-none border border-rose-500/30 bg-rose-500/10 text-rose-500">
        {renderIncidentIcon(incident.metric)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-bold text-[var(--foreground)]">{incident.rule_name}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-muted)]">
          <span className="text-slate-300 dark:text-slate-200 font-semibold">{incident.server_name}</span> · {valueDescription} · {formatRelativeTime(incident.last_triggered_at, isVi)}
        </p>
      </div>
      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" />
    </div>
  );
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="grid h-full min-h-32 place-items-center rounded-none border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 text-center">
      <div>
        <Icon className="mx-auto h-5 w-5 text-[var(--color-muted)] opacity-60" />
        <p className="mt-2 font-mono text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">{description}</p>
      </div>
    </div>
  );
}

function DashboardMessage({
  title,
  description,
  loading = false,
  action,
}: {
  title: string;
  description: string;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-64 items-center justify-center p-8">
      <div className="max-w-md w-full rounded-none border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-none border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--accent-primary)]">
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CircleAlert className="h-5 w-5" />}
        </div>
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">{title}</h2>
        <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

function renderIncidentIcon(metric: string): React.ReactNode {
  if (metric === 'ram') return <Database className="h-3.5 w-3.5" />;
  if (metric === 'cpu') return <Cpu className="h-3.5 w-3.5" />;
  if (metric === 'status') return <Wifi className="h-3.5 w-3.5" />;
  return <CircleAlert className="h-3.5 w-3.5" />;
}

function getFleetStatus(
  total: number,
  online: number,
  incidents: number,
  t: (en: string, vi: string) => string
): { label: string; tone: 'good' | 'warning' } {
  if (total === 0) return { label: t('NO DATA', 'CHƯA CÓ DỮ LIỆU'), tone: 'warning' };
  if (incidents > 0 || online < total) return { label: t('ATTENTION', 'CẦN CHÚ Ý'), tone: 'warning' };
  return { label: t('OPERATIONAL', 'HOẠT ĐỘNG TỐT'), tone: 'good' };
}

function roundMetric(value: number | undefined): number {
  return Number(Number(value ?? 0).toFixed(1));
}

function formatPercent(value: number | undefined): string {
  return `${roundMetric(value)}%`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatChartTime(value: string, range: DashboardRange): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(range === '1H' || range === '2H' ? { second: '2-digit' } : {}),
  });
}

function formatSnapshotTime(value?: string): string {
  if (!value) return 'NO DATA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'UNKNOWN';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(value?: string, isVi = false): string {
  if (!value) return isVi ? 'Chưa từng' : 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return isVi ? 'Không rõ' : 'Unknown';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(isVi ? 'vi' : 'en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
