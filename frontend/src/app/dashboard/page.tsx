'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, ChevronRight, CircleAlert,
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
            className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] dark:border-[#1E293B] bg-white dark:bg-[#111827] px-3 py-1.5 text-xs font-sans font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-slate-800"
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
    <div className="font-sans">
      {/* 1. Page Header (Clean, directly on background, no box/border) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] dark:text-white font-sans">
            {t('Infrastructure Overview', 'Tổng quan hạ tầng')}
          </h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-[#64748B] dark:text-[#94A3B8] font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>{t('Live telemetry', 'Đo đạc trực tiếp')}</span>
            <span>·</span>
            <span>
              {t('Snapshot:', 'Thời điểm:')}{' '}
              <span className="font-mono tabular-nums text-[#0F172A] dark:text-slate-200">
                {formatSnapshotTime(overview?.generated_at)}
              </span>
            </span>
            <span>·</span>
            <span>
              {refreshing
                ? t('Updating...', 'Đang cập nhật...')
                : t('Auto-refresh 15s', 'Tự động làm mới 15s')}
            </span>
            {error && <span className="text-red-500 font-medium">[{error}]</span>}
          </div>
        </div>

        {/* 2 Control Buttons Only */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            className="h-8 px-3 rounded-md text-xs font-medium font-sans bg-white dark:bg-[#0F1623] border border-[#CBD5E1] dark:border-[#1E293B] text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors duration-100 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{t('Refresh', 'Làm mới')}</span>
          </button>

          <Link
            href="/dashboard/servers"
            className="h-8 px-3.5 rounded-md text-xs font-medium font-sans bg-[#2563EB] hover:bg-[#1D4ED8] dark:hover:bg-[#3B82F6] text-white flex items-center gap-1.5 transition-colors duration-100"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t('Add server', 'Thêm máy chủ')}</span>
          </Link>
        </div>
      </div>

      {/* 2. 5-Column Metric Cards Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mb-5 font-sans">
        {/* Card 1: Agents Online */}
        <div className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] font-sans">
              {t('Agents Online', 'Agent trực tuyến')}
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] tracking-tight my-1">
            {online}/{total}
          </div>
          <div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2 mb-1.5">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${health}%` }} />
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans truncate">
              {total > 0 ? `${health}% ` + t('healthy heartbeats', 'nhịp tim ổn định') : t('No agents', 'Chưa có agent')}
            </p>
          </div>
        </div>

        {/* Card 2: Fleet Health */}
        <div className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] font-sans">
              {t('Fleet Health', 'Sức khỏe cụm')}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${fleetStatus.tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] tracking-tight my-1">
            {total > 0 ? `${health}%` : '—'}
          </div>
          <div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2 mb-1.5">
              <div
                className={`h-full rounded-full transition-all ${fleetStatus.tone === 'good' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${health}%` }}
              />
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans truncate">
              {offline} {t('offline', 'ngoại tuyến')} · {warning} {t('alerted', 'cảnh báo')}
            </p>
          </div>
        </div>

        {/* Card 3: Average CPU */}
        <div className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] font-sans">
              {t('Average CPU', 'CPU trung bình')}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${(summary?.average_cpu ?? 0) >= 75 ? 'bg-amber-500' : 'bg-blue-500'}`} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] tracking-tight my-1">
            {hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
          </div>
          <div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2 mb-1.5">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, summary?.average_cpu ?? 0))}%` }}
              />
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans truncate">
              {hasLiveMetrics ? t('Cluster load average', 'Tải trung bình cụm') : t('No metrics', 'Chưa có số liệu')}
            </p>
          </div>
        </div>

        {/* Card 4: Memory Used */}
        <div className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] font-sans">
              {t('Memory Used', 'RAM đã dùng')}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${(summary?.average_memory ?? 0) >= 80 ? 'bg-amber-500' : 'bg-blue-500'}`} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] tracking-tight my-1">
            {hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
          </div>
          <div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2 mb-1.5">
              <div
                className="h-full bg-blue-600 dark:bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, summary?.average_memory ?? 0))}%` }}
              />
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans truncate">
              {hasLiveMemory ? (
                <>
                  <span className="font-mono tabular-nums">{formatBytes(summary?.memory_used ?? 0)}</span> /{' '}
                  <span className="font-mono tabular-nums">{formatBytes(summary?.memory_total ?? 0)}</span>
                </>
              ) : (
                t('No metrics', 'Chưa có số liệu')
              )}
            </p>
          </div>
        </div>

        {/* Card 5: Open Incidents */}
        <div className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[#64748B] dark:text-[#94A3B8] font-sans">
              {t('Open Incidents', 'Sự cố đang mở')}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${(summary?.open_incidents ?? 0) > 0 ? 'bg-red-500' : 'bg-emerald-500'}`} />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[#0F172A] dark:text-[#F8FAFC] tracking-tight my-1">
            {summary?.open_incidents ?? 0}
          </div>
          <div>
            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-2 mb-1.5">
              <div
                className={`h-full rounded-full transition-all ${(summary?.open_incidents ?? 0) > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${(summary?.open_incidents ?? 0) > 0 ? 100 : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans truncate">
              {warning > 0
                ? `${warning} ` + t('affected servers', 'máy chủ bị ảnh hưởng')
                : t('All systems operational', 'Toàn bộ ổn định')}
            </p>
          </div>
        </div>
      </section>

      {/* 3. Split Grid (2/3 Resource Load + 1/3 Active Incidents) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5 items-stretch font-sans">
        {/* Left: Resource Load Area Chart (lg:col-span-2) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          {/* Card Header on 1 single row */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-[#E2E8F0] dark:border-[#1E293B]">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">
                {t('Resource Load', 'Tải tài nguyên')}
              </h2>
              <div className="flex items-center gap-3 text-xs text-[#64748B] dark:text-[#94A3B8] font-sans">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-blue-600 shrink-0" />
                  CPU <strong className="font-mono tabular-nums text-[#0F172A] dark:text-white font-medium">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-xs bg-teal-500 shrink-0" />
                  RAM <strong className="font-mono tabular-nums text-[#0F172A] dark:text-white font-medium">{latestMetric ? `${latestMetric.ram}%` : '—'}</strong>
                </span>
              </div>
            </div>

            {/* Time range selector (1H 2H 12H 24H) */}
            <div className="inline-flex p-0.5 rounded-md bg-slate-100 dark:bg-[#090D16] border border-[#E2E8F0] dark:border-[#1E293B]">
              {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setRange(item)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-xs transition-colors ${
                    range === item
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#64748B] dark:text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Area Chart View */}
          <div className="min-h-[260px] flex-1">
            {chartData.length > 0 ? (
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="overviewCpuFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="overviewRamFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14B8A6" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#14B8A6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="t"
                      stroke="#94A3B8"
                      fontSize={11}
                      fontFamily="monospace"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0', strokeOpacity: 0.5 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface-1, #0F1623)',
                        borderColor: 'var(--border-default, #1E293B)',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                      labelFormatter={(label) => label}
                      formatter={(value: unknown, name: unknown) => [`${value}%`, String(name)]}
                    />
                    <Area
                      type="monotone"
                      dataKey="ram"
                      name="RAM"
                      stroke="#14B8A6"
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

        {/* Right: Active Incidents (lg:col-span-1) */}
        <div className="lg:col-span-1 bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md p-4 flex flex-col justify-between shadow-none">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2E8F0] dark:border-[#1E293B]">
              <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">
                {t('Active Incidents', 'Sự cố đang mở')}
              </h2>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-full ${
                  incidents.length > 0
                    ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {incidents.length} {t('firing', 'cảnh báo')}
              </span>
            </div>

            {/* Status box: Flat card, NO nested boxes */}
            {incidents.length === 0 ? (
              <div className="p-3.5 rounded-md bg-[#F8FAFC] dark:bg-[#090D16]/60 border border-[#E2E8F0] dark:border-[#1E293B]/80 font-sans">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-sans">
                  <span>✓</span>
                  <span>{t('All systems operational', 'Toàn bộ hệ thống ổn định')}</span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8] font-sans mt-1 leading-relaxed">
                  {t(
                    'No active alerts firing across monitored agents. Heartbeats are operating within nominal limits.',
                    'Không có cảnh báo nào đang kích hoạt. Nhịp tim các máy chủ hoạt động bình thường.'
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {incidents.slice(0, 3).map((incident) => (
                  <IncidentRow
                    key={`${incident.rule_id}-${incident.server_id}`}
                    incident={incident}
                    isVi={isVi}
                  />
                ))}
              </div>
            )}

            {/* Fleet Node Matrix (Compact list, NO outer border box) */}
            <div className="mt-4">
              <div className="flex justify-between text-[11px] font-medium text-[#64748B] dark:text-[#94A3B8] mb-2 font-sans">
                <span>{t('Fleet Nodes', 'Máy chủ cụm')}</span>
                <span className="font-mono tabular-nums font-normal">
                  {online}/{total} {t('online', 'trực tuyến')}
                </span>
              </div>

              {servers.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {servers.slice(0, 6).map((s) => (
                    <Link
                      key={s.id}
                      href={`/dashboard/servers/${s.id}`}
                      className="px-2.5 py-1.5 rounded bg-[#F8FAFC] dark:bg-[#090D16]/60 border border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between text-xs font-medium text-[#0F172A] dark:text-[#F8FAFC] hover:border-slate-400 dark:hover:border-slate-600 transition-colors"
                    >
                      <span className="truncate max-w-[90px] font-sans">{s.name}</span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          s.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                      />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans">
                  {t('No agents enrolled.', 'Chưa có máy chủ đăng ký.')}
                </p>
              )}
            </div>
          </div>

          {/* Open Incident Center button */}
          <Link
            href="/dashboard/alerts"
            className="w-full h-8 mt-4 rounded-md text-xs font-medium font-sans bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-800 text-[#0F172A] dark:text-[#F8FAFC] flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>{t('Open Incident Center', 'Mở trung tâm sự cố')}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </Link>
        </div>
      </section>

      {/* 4. Server Activity Data Table (NO VERTICAL BORDERS) */}
      <section className="bg-white dark:bg-[#0F1623] border border-[#E2E8F0] dark:border-[#1E293B] rounded-md overflow-hidden shadow-none font-sans">
        {/* Table Top Bar */}
        <div className="px-4 py-3 border-b border-[#E2E8F0] dark:border-[#1E293B] flex items-center justify-between font-sans">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">
              {t('Server Activity', 'Hoạt động máy chủ')}
            </h2>
            <span className="px-2 py-0.5 text-[11px] font-mono rounded-full bg-slate-100 dark:bg-slate-800 text-[#64748B] dark:text-[#94A3B8]">
              {servers.length} {t('nodes', 'máy chủ')}
            </span>
          </div>

          <Link
            href="/dashboard/servers"
            className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline font-sans"
          >
            {t('View all nodes →', 'Xem tất cả máy chủ →')}
          </Link>
        </div>

        {/* Clean Modern Data Table */}
        {servers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] dark:bg-[#090D16]/60 border-b border-[#E2E8F0] dark:border-[#1E293B] text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-[#94A3B8] font-sans">
                  <th className="py-2.5 px-4">{t('Server', 'Máy chủ')}</th>
                  <th className="py-2.5 px-4">{t('Status', 'Trạng thái')}</th>
                  <th className="py-2.5 px-4">{t('CPU Load', 'Tải CPU')}</th>
                  <th className="py-2.5 px-4">{t('Memory Load', 'Bộ nhớ')}</th>
                  <th className="py-2.5 px-4">{t('Heartbeat', 'Nhịp tim')}</th>
                  <th className="py-2.5 px-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E293B] text-xs">
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
    <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
      <td className="py-3 px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
            <Server className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <p className="font-sans font-medium text-[#0F172A] dark:text-[#F8FAFC] truncate max-w-[200px] sm:max-w-[280px]">
              {server.name}
            </p>
            <p className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums truncate">
              {server.ip_address ?? t('No IP assigned', 'Chưa gán IP')}
            </p>
          </div>
        </div>
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-sans ${
            online
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              : 'bg-red-500/10 text-red-700 dark:text-red-400'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`} />
          {online ? t('Online', 'Trực tuyến') : t('Offline', 'Ngoại tuyến')}
        </span>
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        {canShowMetrics ? (
          <div className="flex items-center gap-2.5">
            <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 dark:bg-blue-500"
                style={{ width: `${Math.min(100, Math.max(0, server.cpu_usage))}%` }}
              />
            </div>
            <span className="font-mono font-medium text-xs text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              {roundMetric(server.cpu_usage)}%
            </span>
          </div>
        ) : (
          <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8]">—</span>
        )}
      </td>
      <td className="py-3 px-4 whitespace-nowrap">
        {canShowMetrics ? (
          <div className="flex items-center gap-2.5">
            <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 dark:bg-blue-500"
                style={{ width: `${Math.min(100, Math.max(0, memoryPercent))}%` }}
              />
            </div>
            <span className="font-mono font-medium text-xs text-[#0F172A] dark:text-[#F8FAFC] tabular-nums">
              {roundMetric(memoryPercent)}%
            </span>
            {server.memory_total > 0 && (
              <span className="font-mono text-[11px] text-[#64748B] dark:text-[#94A3B8] tabular-nums hidden sm:inline">
                ({formatBytes(server.memory_used)} / {formatBytes(server.memory_total)})
              </span>
            )}
          </div>
        ) : (
          <span className="font-mono text-xs text-[#64748B] dark:text-[#94A3B8]">—</span>
        )}
      </td>
      <td className="py-3 px-4 font-mono text-xs text-[#64748B] dark:text-[#94A3B8] tabular-nums whitespace-nowrap">
        {formatRelativeTime(server.last_seen_at, isVi)}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <Link
          href={`/dashboard/servers/${server.id}`}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium font-sans text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
        >
          {t('Manage', 'Quản lý')}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </td>
    </tr>
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
      ? 'Heartbeat > 60s'
      : `${incident.metric.toUpperCase()} ${incident.operator} ${roundMetric(incident.threshold)}%`;

  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-md bg-[#F8FAFC] dark:bg-[#090D16]/60 border border-red-500/20 font-sans">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-red-500/10 text-red-500">
        {renderIncidentIcon(incident.metric)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">
          {incident.rule_name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans">
          <span className="font-medium text-slate-700 dark:text-slate-300">{incident.server_name}</span> ·{' '}
          <span className="font-mono tabular-nums">{valueDescription}</span> · {formatRelativeTime(incident.last_triggered_at, isVi)}
        </p>
      </div>
      <CircleAlert className="w-3.5 h-3.5 shrink-0 text-red-500" />
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
    <div className="grid h-full min-h-32 place-items-center rounded-md border border-dashed border-[#E2E8F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#090D16]/60 p-6 text-center font-sans">
      <div>
        <Icon className="mx-auto h-5 w-5 text-[#64748B] dark:text-[#94A3B8] opacity-60" />
        <p className="mt-2 text-xs font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">{title}</p>
        <p className="mt-0.5 text-[11px] text-[#64748B] dark:text-[#94A3B8] font-sans">{description}</p>
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
    <div className="flex min-h-64 items-center justify-center p-8 font-sans">
      <div className="max-w-md w-full rounded-md border border-[#E2E8F0] dark:border-[#1E293B] bg-white dark:bg-[#0F1623] p-6 text-center shadow-none">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400">
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CircleAlert className="h-5 w-5" />}
        </div>
        <h2 className="text-sm font-semibold text-[#0F172A] dark:text-[#F8FAFC] font-sans">{title}</h2>
        <p className="mt-1 text-xs text-[#64748B] dark:text-[#94A3B8] font-sans">{description}</p>
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
  if (total === 0) return { label: t('No data', 'Chưa có dữ liệu'), tone: 'warning' };
  if (incidents > 0 || online < total) return { label: t('Attention', 'Cần chú ý'), tone: 'warning' };
  return { label: t('Operational', 'Hoạt động tốt'), tone: 'good' };
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
  if (!value) return 'No data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
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
