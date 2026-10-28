'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, BellRing, Check, ChevronRight, CircleAlert, Cloud,
  Cpu, Database, MemoryStick, Plus, RefreshCw, Server, Wifi,
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
  const cpuBars = chartData.slice(-7).map((point) => point.cpu);
  const memoryBars = chartData.slice(-7).map((point) => point.ram);

  if (loading && !overview) {
    return (
      <DashboardMessage
        title={t('Syncing live data', 'Đang đồng bộ dữ liệu')}
        description={t('Fetching the latest heartbeat, metrics, and alert state.', 'Đang nạp nhịp tim, thông số kỹ thuật và trạng thái cảnh báo.')}
        loading
      />
    );
  }

  if (!overview && error) {
    return (
      <DashboardMessage
        title={t('Unable to load data', 'Không thể tải dữ liệu')}
        description={error}
        action={
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
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
    <div className="mx-auto max-w-[1540px] space-y-5">
      {/* Top Header */}
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-mono font-bold text-emerald-500 uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            {t('Live telemetry', 'Đo đạc trực tiếp')}
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {t('Infrastructure Overview', 'Tổng quan hạ tầng')}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)] font-mono" aria-live="polite">
            <span>{t('Snapshot:', 'Thời điểm:')} {formatSnapshotTime(overview?.generated_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{refreshing ? t('Receiving fresh data…', 'Đang cập nhật…') : t('Auto-refresh is on (15s)', 'Tự động làm mới (15s)')}</span>
            {error && <span className="text-[var(--rose)]">{t('Refresh failed:', 'Lỗi cập nhật:')} {error}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-2)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50"
            disabled={refreshing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('Refresh now', 'Làm mới')}
          </button>
          <Link
            href="/dashboard/servers"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('Add server', 'Thêm máy chủ')}
          </Link>
        </div>
      </section>

      {/* KPI Cards Grid */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Server}
          label={t('Agents online', 'Agent trực tuyến')}
          value={`${online}/${total}`}
          note={total > 0 ? `${health}% ` + t('healthy heartbeats', 'nhịp tim ổn định') : t('No servers', 'Chưa có máy chủ')}
          color="var(--mint)"
          bars={[]}
          tint="healthy"
          emptyLabel="LIVE"
        />
        <MetricCard
          icon={Cpu}
          label={t('Average CPU', 'CPU trung bình')}
          value={hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
          note={hasLiveMetrics ? t('Online server average', 'Trung bình máy chủ online') : t('No metrics', 'Chưa có số liệu')}
          color="var(--violet)"
          bars={cpuBars}
          tint="info"
        />
        <MetricCard
          icon={MemoryStick}
          label={t('Memory used', 'RAM đã dùng')}
          value={hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
          note={hasLiveMemory ? `${formatBytes(summary?.memory_used ?? 0)} / ${formatBytes(summary?.memory_total ?? 0)}` : t('No metrics', 'Chưa có số liệu')}
          color="var(--sky)"
          bars={memoryBars}
          tint="info"
        />
        <MetricCard
          icon={BellRing}
          label={t('Open incidents', 'Sự cố đang mở')}
          value={String(summary?.open_incidents ?? 0)}
          note={warning > 0 ? `${warning} ` + t('affected servers', 'máy chủ bị ảnh hưởng') : t('No firing alerts', 'Không có cảnh báo')}
          color="var(--rose)"
          bars={[]}
          tint={warning > 0 ? 'critical' : 'healthy'}
          emptyLabel={warning > 0 ? 'ACTIVE' : 'CLEAR'}
        />
      </section>

      {/* Charts & Fleet Health Section */}
      <section className="grid gap-3 xl:grid-cols-[1.65fr_.75fr]">
        {/* Resource Load Area Chart */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 min-h-[380px]">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                {t('Fleet telemetry', 'Đo đạc toàn cụm')}
              </p>
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {t('Resource load', 'Tải tài nguyên')}
              </h2>
            </div>
            <div className="inline-flex rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] p-0.5 text-xs">
              {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setRange(item)}
                  className={`rounded px-2.5 py-0.5 font-mono text-[11px] font-semibold transition-colors duration-100 ${
                    range === item ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                  aria-pressed={range === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3 flex gap-5 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
              CPU: <strong className="text-[var(--foreground)] font-bold">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong>
            </span>
            <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
              <span className="h-2 w-2 rounded-full bg-[var(--mint)]" />
              RAM: <strong className="text-[var(--foreground)] font-bold">{latestMetric ? `${latestMetric.ram}%` : '—'}</strong>
            </span>
          </div>

          <div className="h-[250px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="overviewCpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="overviewRamFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--mint)" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="var(--mint)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="t" hide />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                      fontSize: 11,
                      fontFamily: 'monospace',
                    }}
                    labelFormatter={(label) => label}
                    formatter={(value: unknown, name: unknown) => [`${value}%`, String(name)]}
                  />
                  <Area type="monotone" dataKey="ram" name="Memory" stroke="var(--mint)" strokeWidth={1.5} fill="url(#overviewRamFill)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="cpu" name="CPU" stroke="var(--accent-primary)" strokeWidth={1.5} fill="url(#overviewCpuFill)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel
                icon={Activity}
                title={t('No telemetry in this range', 'Không có dữ liệu trong khung thời gian này')}
                description={t('The chart will appear when an agent sends metrics.', 'Biểu đồ sẽ xuất hiện khi có agent gửi dữ liệu.')}
              />
            )}
          </div>
        </div>

        {/* Fleet Health Donut Card */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                {t('Global status', 'Trạng thái tổng thể')}
              </p>
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {t('Fleet health', 'Sức khỏe toàn cụm')}
              </h2>
            </div>
            <span
              className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${
                fleetStatus.tone === 'good'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              {fleetStatus.label}
            </span>
          </div>

          <div className="relative mx-auto my-6 grid h-40 w-40 place-items-center">
            <div className="health-ring" style={{ '--health': `${health * 3.6}deg` } as React.CSSProperties} />
            <div className="text-center">
              <p className="font-mono text-3xl font-bold text-[var(--foreground)]">
                {total > 0 ? `${health}%` : '—'}
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wider font-mono text-[var(--color-muted)]">
                {t('heartbeat score', 'điểm nhịp tim')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-4 text-center">
            <HealthStat label={t('Online', 'Trực tuyến')} value={online} color="text-emerald-500" />
            <HealthStat label={t('Alerted', 'Cảnh báo')} value={warning} color="text-amber-500" />
            <HealthStat label={t('Offline', 'Ngoại tuyến')} value={offline} color="text-rose-500" />
          </div>
        </div>
      </section>

      {/* Servers Table & Active Incidents */}
      <section className="grid gap-3 xl:grid-cols-[1.45fr_.95fr]">
        {/* Server Activity Table */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-[var(--border-subtle)]">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                {t('Agent network', 'Mạng lưới Agent')}
              </p>
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {t('Server activity', 'Hoạt động máy chủ')}
              </h2>
            </div>
            <Link
              href="/dashboard/servers"
              className="text-xs font-semibold text-[var(--accent-primary)] hover:underline inline-flex items-center gap-0.5"
            >
              {t('View all', 'Xem tất cả')} <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {servers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] font-mono text-[10px] uppercase text-[var(--color-muted)]">
                    <th className="px-4 py-2.5 font-bold">{t('Server', 'Máy chủ')}</th>
                    <th className="px-4 py-2.5 font-bold">{t('Status', 'Trạng thái')}</th>
                    <th className="px-4 py-2.5 font-bold">{t('CPU', 'CPU')}</th>
                    <th className="px-4 py-2.5 font-bold">{t('Memory', 'Bộ nhớ')}</th>
                    <th className="px-4 py-2.5 font-bold">{t('Heartbeat', 'Nhịp tim')}</th>
                    <th className="px-4 py-2.5 font-bold text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {servers.slice(0, 6).map((server) => (
                    <ServerRow key={server.id} server={server} isVi={isVi} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8">
              <EmptyPanel
                icon={Server}
                title={t('No servers', 'Chưa có máy chủ')}
                description={t('Connect your first agent to start receiving live data.', 'Cài đặt Agent đầu tiên để bắt đầu nhận dữ liệu.')}
              />
            </div>
          )}
        </div>

        {/* Active Incidents Panel */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                  {t('Needs attention', 'Cần chú ý')}
                </p>
                <h2 className="text-sm font-bold text-[var(--foreground)]">
                  {t('Active incidents', 'Sự cố đang diễn ra')}
                </h2>
              </div>
              <Link
                href="/dashboard/alerts"
                className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  incidents.length > 0
                    ? 'bg-rose-500/15 text-rose-500 border border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}
              >
                {incidents.length} {t('open', 'sự cố')}
              </Link>
            </div>

            {incidents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {incidents.slice(0, 4).map((incident) => (
                  <IncidentRow
                    key={`${incident.rule_id}-${incident.server_id}`}
                    incident={incident}
                    isVi={isVi}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4">
                <EmptyPanel
                  icon={Check}
                  title={t('No firing incidents', 'Không có sự cố nào')}
                  description={t('The fleet\'s current alert state is stable.', 'Trạng thái cảnh báo toàn cụm đang ổn định.')}
                />
              </div>
            )}
          </div>

          <Link
            href="/dashboard/alerts"
            className="mt-4 flex items-center justify-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] py-2 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] transition-colors"
          >
            {t('Open incident center', 'Mở trung tâm sự cố')} <ArrowUpRight className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  color,
  bars,
  emptyLabel = 'NO DATA',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  color: string;
  bars: number[];
  tint?: 'info' | 'healthy' | 'warning' | 'critical';
  emptyLabel?: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-[var(--border-subtle)] bg-[var(--surface-2)]" style={{ color }}>
          <Icon className="h-4 w-4" />
        </div>
        {bars.length > 0 ? (
          <div className="mini-bars flex items-end gap-1 h-5">
            {bars.map((height, index) => (
              <i
                key={index}
                className="w-1 rounded-xs"
                style={{ height: `${Math.max(4, Math.min(height, 100))}%`, background: color }}
              />
            ))}
          </div>
        ) : (
          <span className="font-mono text-[9px] font-bold uppercase text-[var(--color-muted)]">{emptyLabel}</span>
        )}
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-[var(--color-muted)] font-medium">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="font-mono tabular-nums text-2xl font-bold text-[var(--foreground)]">{value}</p>
        <p className="mb-0.5 text-right font-mono text-[10px] truncate max-w-[140px]" style={{ color }}>
          {note}
        </p>
      </div>
    </div>
  );
}

function HealthStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <p className={`font-mono tabular-nums text-xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase font-mono tracking-wider text-[var(--color-muted)]">{label}</p>
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
    <tr className="hover:bg-[var(--surface-hover)] transition-colors">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--border-subtle)] bg-[var(--surface-2)]">
            <Cloud className="h-3.5 w-3.5 text-[var(--color-muted)]" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-[var(--foreground)] truncate">{server.name}</p>
            <p className="font-mono text-[10px] text-[var(--color-muted)] truncate">{server.ip_address ?? t('No IP', 'Chưa có IP')}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
          <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          {online ? t('Online', 'Trực tuyến') : t('Offline', 'Ngoại tuyến')}
        </span>
      </td>
      <td className="px-4 py-2.5">
        {canShowMetrics ? <LoadBar value={server.cpu_usage} /> : <span className="text-[var(--color-muted)]">—</span>}
      </td>
      <td className="px-4 py-2.5">
        {canShowMetrics ? <LoadBar value={memoryPercent} /> : <span className="text-[var(--color-muted)]">—</span>}
      </td>
      <td className="px-4 py-2.5 font-mono text-[10px] text-[var(--color-muted)]">
        {formatRelativeTime(server.last_seen_at, isVi)}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Link href={`/dashboard/servers/${server.id}`} aria-label={`Open ${server.name}`}>
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted)] hover:text-[var(--foreground)]" />
        </Link>
      </td>
    </tr>
  );
}

function LoadBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(value, 100));
  const pressure = normalized >= 85 ? 'var(--status-critical)' : normalized >= 70 ? 'var(--status-warning)' : 'var(--accent-primary)';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded bg-[var(--border-subtle)]">
        <div className="h-full rounded" style={{ width: `${normalized}%`, background: pressure }} />
      </div>
      <span className="font-mono text-[10px] font-semibold" style={{ color: pressure }}>
        {roundMetric(value)}%
      </span>
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
      ? 'Heartbeat > 60s'
      : `${incident.metric.toUpperCase()} ${incident.operator} ${roundMetric(incident.threshold)}%`;

  return (
    <div className="flex items-center gap-2.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-rose-500/10 text-rose-500">
        {renderIncidentIcon(incident.metric)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--foreground)]">{incident.rule_name}</p>
        <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--color-muted)]">
          {incident.server_name} · {valueDescription} · {formatRelativeTime(incident.last_triggered_at, isVi)}
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
    <div className="grid h-full min-h-32 place-items-center rounded border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] p-4 text-center">
      <div>
        <Icon className="mx-auto h-5 w-5 text-[var(--color-muted)] opacity-50" />
        <p className="mt-2 text-xs font-semibold text-[var(--foreground)]">{title}</p>
        <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{description}</p>
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
      <div className="max-w-md rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--accent-primary)]">
          {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <CircleAlert className="h-5 w-5" />}
        </div>
        <h2 className="text-base font-bold text-[var(--foreground)]">{title}</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">{description}</p>
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
