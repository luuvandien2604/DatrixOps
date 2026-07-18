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
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

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

const POLL_INTERVAL_MS = 5_000;

export default function OverviewDashboard() {
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
      const message = err instanceof Error ? err.message : 'Không thể tải dữ liệu dashboard';
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
    void fetchOverview(true);
    const interval = window.setInterval(() => void fetchOverview(), POLL_INTERVAL_MS);
    return () => {
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
  // Mini bars are also data-driven: binary heartbeat and active firing states.
  const fleetBars = servers.slice(0, 7).map((server) => server.status === 'online' ? 100 : 0);
  const incidentBars = incidents.slice(0, 7).map(() => 100);

  if (loading && !overview) {
    return <DashboardMessage title="Đang đồng bộ dữ liệu thật" description="Đang lấy heartbeat, metrics và alert state mới nhất từ hệ thống." loading />;
  }

  if (!overview && error) {
    return (
      <DashboardMessage
        title="Không thể tải dữ liệu"
        description={error}
        action={<button type="button" onClick={() => void fetchOverview(true)} className="liquid-button secondary"><RefreshCw className="h-4 w-4" />Thử lại</button>}
      />
    );
  }

  const fleetStatus = getFleetStatus(total, online, incidents.length);

  return (
    <div className="mx-auto max-w-[1540px] space-y-6">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[var(--mint)]">
            <Activity className="h-3 w-3" />
            Live infrastructure
            <span className="live-data-dot" aria-hidden="true" />
          </div>
          <h1 className="liquid-title">Infrastructure, <em>as it is now.</em></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/42">
            Dữ liệu thật từ heartbeat của DatrixOps Agent, tự động làm mới mỗi {POLL_INTERVAL_MS / 1000} giây.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-white/35" aria-live="polite">
            <span>Snapshot: {formatSnapshotTime(overview?.generated_at)}</span>
            <span aria-hidden="true">·</span>
            <span>{refreshing ? 'Đang nhận dữ liệu mới…' : 'Auto-refresh đang bật'}</span>
            {error && <span className="text-[var(--rose)]">Lần cập nhật gần nhất lỗi: {error}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void fetchOverview(true)} className="liquid-button secondary" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Đồng bộ ngay
          </button>
          <Link href="/dashboard/servers" className="liquid-button primary"><Plus className="h-4 w-4" />Thêm server</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Server}
          label="Fleet online"
          value={`${online}/${total}`}
          note={total > 0 ? `${health}% heartbeat hợp lệ` : 'Chưa có server'}
          color="var(--mint)"
          bars={fleetBars}
        />
        <MetricCard
          icon={Cpu}
          label="Average CPU"
          value={hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
          note={hasLiveMetrics ? 'Trung bình server online' : 'Chưa có metrics'}
          color="var(--violet)"
          bars={cpuBars}
        />
        <MetricCard
          icon={MemoryStick}
          label="Memory used"
          value={hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
          note={hasLiveMemory ? `${formatBytes(summary?.memory_used ?? 0)} / ${formatBytes(summary?.memory_total ?? 0)}` : 'Chưa có metrics'}
          color="var(--sky)"
          bars={memoryBars}
        />
        <MetricCard
          icon={BellRing}
          label="Open incidents"
          value={String(summary?.open_incidents ?? 0)}
          note={warning > 0 ? `${warning} server bị ảnh hưởng` : 'Không có alert firing'}
          color="var(--rose)"
          bars={incidentBars}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_.75fr]">
        <div className="liquid-panel min-h-[390px] p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div><p className="panel-kicker">Fleet telemetry</p><h2 className="panel-title">Resource load</h2></div>
            <div className="range-picker" aria-label="Khoảng thời gian biểu đồ">
              {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
                <button type="button" key={item} onClick={() => setRange(item)} className={range === item ? 'active' : ''} aria-pressed={range === item}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4 flex gap-6 text-xs">
            <span className="flex items-center gap-2 text-white/45"><i className="h-2 w-2 rounded-full bg-[var(--violet)]" />CPU <b className="font-mono text-white">{latestMetric ? `${latestMetric.cpu}%` : '—'}</b></span>
            <span className="flex items-center gap-2 text-white/45"><i className="h-2 w-2 rounded-full bg-[var(--mint)]" />Memory <b className="font-mono text-white">{latestMetric ? `${latestMetric.ram}%` : '—'}</b></span>
          </div>
          <div className="h-[260px]">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpuLiquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--violet-strong)" stopOpacity=".42" /><stop offset="1" stopColor="var(--violet-strong)" stopOpacity="0" /></linearGradient>
                    <linearGradient id="ramLiquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--mint)" stopOpacity=".28" /><stop offset="1" stopColor="var(--mint)" stopOpacity="0" /></linearGradient>
                  </defs>
                  <Tooltip contentStyle={{ background: 'var(--tooltip-background)', border: '1px solid var(--border-color)', borderRadius: 12, fontSize: 11 }} />
                  <Area type="monotone" dataKey="ram" name="Memory" stroke="var(--mint)" strokeWidth={2} fill="url(#ramLiquid)" isAnimationActive={false} />
                  <Area type="monotone" dataKey="cpu" name="CPU" stroke="var(--violet)" strokeWidth={2} fill="url(#cpuLiquid)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyPanel icon={Activity} title="Chưa có telemetry trong khoảng này" description="Biểu đồ sẽ xuất hiện khi agent gửi metrics." />
            )}
          </div>
        </div>

        <div className="liquid-panel overflow-hidden p-6">
          <div className="flex items-start justify-between">
            <div><p className="panel-kicker">Global status</p><h2 className="panel-title">Fleet health</h2></div>
            <span className={`status-pill ${fleetStatus.tone}`}>{fleetStatus.label}</span>
          </div>
          <div className="relative mx-auto my-7 grid h-44 w-44 place-items-center">
            <div className="health-ring" style={{ '--health': `${health * 3.6}deg` } as React.CSSProperties} />
            <div className="text-center"><p className="font-mono text-4xl font-medium">{total > 0 ? `${health}%` : '—'}</p><p className="mt-1 text-[10px] uppercase tracking-[.2em] text-white/35">heartbeat score</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/[.06] pt-5 text-center">
            <HealthStat label="Online" value={online} color="text-[var(--mint)]" />
            <HealthStat label="Alerted" value={warning} color="text-[var(--amber)]" />
            <HealthStat label="Offline" value={offline} color="text-[var(--rose)]" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_.95fr]">
        <div className="liquid-panel overflow-hidden">
          <div className="flex items-center justify-between p-6"><div><p className="panel-kicker">Agent network</p><h2 className="panel-title">Server activity</h2></div><Link href="/dashboard/servers" className="text-xs text-white/45 hover:text-white">Xem tất cả <ChevronRight className="inline h-3 w-3" /></Link></div>
          {servers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="server-table">
                <thead><tr><th>Server</th><th>Status</th><th>CPU</th><th>Memory</th><th>Heartbeat</th><th></th></tr></thead>
                <tbody>{servers.slice(0, 6).map((server) => <ServerRow key={server.id} server={server} />)}</tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 pb-6"><EmptyPanel icon={Server} title="Chưa có server" description="Kết nối agent đầu tiên để bắt đầu nhận dữ liệu thật." /></div>
          )}
        </div>

        <div className="liquid-panel p-6">
          <div className="flex items-start justify-between">
            <div><p className="panel-kicker">Needs attention</p><h2 className="panel-title">Active incidents</h2></div>
            <Link href="/dashboard/alerts" className={incidents.length > 0 ? 'status-pill warning' : 'status-pill good'}>{incidents.length} open</Link>
          </div>
          {incidents.length > 0 ? (
            <div className="mt-5 space-y-3">
              {incidents.slice(0, 4).map((incident) => <Incident key={`${incident.rule_id}-${incident.server_id}`} incident={incident} />)}
            </div>
          ) : (
            <div className="mt-5"><EmptyPanel icon={Check} title="Không có incident đang firing" description="Alert state hiện tại của fleet đang ổn định." /></div>
          )}
          <Link href="/dashboard/alerts" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/[.07] py-3 text-xs text-white/50 transition hover:bg-white/[.04] hover:text-white">Mở incident center <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, note, color, bars }: { icon: LucideIcon; label: string; value: string; note: string; color: string; bars: number[] }) {
  return (
    <div className="metric-card">
      <div className="flex items-start justify-between">
        <div className="metric-icon" style={{ color }}><Icon className="h-4 w-4" /></div>
        {bars.length > 0 ? <div className="mini-bars">{bars.map((height, index) => <i key={index} style={{ height: `${Math.max(0, Math.min(height, 100))}%`, background: color }} />)}</div> : <span className="text-[9px] text-white/25">NO DATA</span>}
      </div>
      <p className="mt-5 text-[11px] uppercase tracking-[.16em] text-white/35">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2"><p className="font-mono text-3xl">{value}</p><p className="mb-1 max-w-[130px] text-right text-[10px]" style={{ color }}>{note}</p></div>
    </div>
  );
}

function HealthStat({ label, value, color }: { label: string; value: number; color: string }) {
  return <div><p className={`font-mono text-lg ${color}`}>{value}</p><p className="mt-1 text-[9px] uppercase tracking-[.16em] text-white/30">{label}</p></div>;
}

function ServerRow({ server }: { server: DashboardServer }) {
  const online = server.status === 'online';
  const memoryPercent = server.memory_total > 0 ? server.memory_used * 100 / server.memory_total : 0;
  const canShowMetrics = online && server.has_metrics;

  return (
    <tr>
      <td><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.04]"><Cloud className="h-3.5 w-3.5 text-white/50" /></span><div><p className="font-mono text-xs text-white/80">{server.name}</p><p className="mt-1 text-[9px] text-white/25">{server.ip_address ?? 'Chưa có IP'}</p></div></div></td>
      <td><span className={`status-dot ${online ? 'online' : 'offline'}`} />{online ? 'Online' : 'Offline'}</td>
      <td>{canShowMetrics ? <LoadBar value={server.cpu_usage} /> : <span className="text-white/25">—</span>}</td>
      <td>{canShowMetrics ? <LoadBar value={memoryPercent} /> : <span className="text-white/25">—</span>}</td>
      <td><span className="text-[10px] text-white/38">{formatRelativeTime(server.last_seen_at)}</span></td>
      <td><Link href={`/dashboard/servers/${server.id}`} aria-label={`Xem ${server.name}`}><ChevronRight className="h-4 w-4 text-white/25" /></Link></td>
    </tr>
  );
}

function LoadBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(value, 100));
  return <div className="flex items-center gap-2"><span className="h-1 w-14 overflow-hidden rounded-full bg-white/[.06]"><i className="block h-full rounded-full" style={{ width: `${normalized}%`, background: 'linear-gradient(90deg, var(--violet-strong), var(--mint))' }} /></span><span className="font-mono text-[10px] text-white/45">{roundMetric(value)}%</span></div>;
}

function Incident({ incident }: { incident: DashboardIncident }) {
  const Icon = getIncidentIcon(incident.metric);
  const valueDescription = incident.metric === 'status'
    ? 'Heartbeat quá 60 giây'
    : `${incident.metric.toUpperCase()} ${incident.operator} ${roundMetric(incident.threshold)}%`;

  return (
    <div className="incident-row">
      <span className="incident-icon critical"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><p className="truncate text-xs text-white/80">{incident.rule_name}</p><p className="mt-1 truncate text-[10px] text-white/30">{incident.server_name} · {valueDescription} · {formatRelativeTime(incident.last_triggered_at)}</p></div>
      <CircleAlert className="ml-auto h-4 w-4 shrink-0 text-[var(--rose)]" />
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <div className="grid h-full min-h-36 place-items-center rounded-xl border border-dashed border-white/[.07] bg-white/[.012] p-5 text-center"><div><Icon className="mx-auto h-5 w-5 text-white/25" /><p className="mt-3 text-xs text-white/60">{title}</p><p className="mt-1 text-[10px] text-white/28">{description}</p></div></div>;
}

function DashboardMessage({ title, description, loading = false, action }: { title: string; description: string; loading?: boolean; action?: React.ReactNode }) {
  return <div className="feature-preview"><section className="glass-card"><div className="feature-preview-icon">{loading ? <RefreshCw className="h-6 w-6 animate-spin" /> : <CircleAlert className="h-6 w-6" />}</div><h1>{title}</h1><p>{description}</p>{action && <div className="mt-7">{action}</div>}</section></div>;
}

function getIncidentIcon(metric: string): LucideIcon {
  if (metric === 'ram') return Database;
  if (metric === 'cpu') return Cpu;
  if (metric === 'status') return Wifi;
  return CircleAlert;
}

function getFleetStatus(total: number, online: number, incidents: number): { label: string; tone: 'good' | 'warning' } {
  if (total === 0) return { label: 'No data', tone: 'warning' };
  if (incidents > 0 || online < total) return { label: 'Attention', tone: 'warning' };
  return { label: 'Operational', tone: 'good' };
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
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    ...(range === '1H' || range === '2H' ? { second: '2-digit' } : {}),
  });
}

function formatSnapshotTime(value?: string): string {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatRelativeTime(value?: string): string {
  if (!value) return 'Chưa từng';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không xác định';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
