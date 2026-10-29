'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, BellRing, Check, ChevronRight, CircleAlert,
  Cpu, Database, HardDrive, MemoryStick, Plus, RefreshCw, Server, Wifi,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

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
      <div className="flex h-96 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-[var(--accent-primary)]" />
          <div className="font-mono text-sm font-semibold tracking-wider text-[var(--text-primary)]">
            INITIALIZING MISSION CONTROL TELEMETRY...
          </div>
          <div className="text-xs text-[var(--text-secondary)]">Connecting to fleet control plane.</div>
        </div>
      </div>
    );
  }

  if (!overview && error) {
    return (
      <div className="flex h-96 items-center justify-center rounded-md border border-[var(--status-critical)]/40 bg-[var(--surface-1)] p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleAlert className="h-8 w-8 text-[var(--status-critical)]" />
          <div className="text-base font-bold text-[var(--text-primary)]">Telemetry Stream Disconnected</div>
          <div className="max-w-md font-mono text-xs text-[var(--text-secondary)]">{error}</div>
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Reconnect Telemetry
          </button>
        </div>
      </div>
    );
  }

  const fleetStatus = getFleetStatus(total, online, incidents.length);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4">
      {/* 1. MISSION CONTROL COMMAND BAR */}
      <section className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                refreshing ? 'bg-[var(--status-warning)] animate-pulse' : 'bg-[var(--status-healthy)]'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-[var(--text-primary)]">
              Mission Control Console
            </span>
          </div>

          <span className="hidden sm:inline text-[var(--border-default)]">|</span>

          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-mono">
            <span>
              STATUS: <strong className={fleetStatus.tone === 'good' ? 'text-[var(--status-healthy)]' : 'text-[var(--status-warning)]'}>{fleetStatus.label.toUpperCase()}</strong>
            </span>
            <span className="text-[var(--border-default)]">·</span>
            <span>SYNC: <strong className="text-[var(--text-primary)] tabular-nums">{formatSnapshotTime(overview?.generated_at)}</strong></span>
            <span className="text-[var(--border-default)]">·</span>
            <span className="text-[var(--text-tertiary)]">POLL: 15s</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
            title="Force immediate telemetry poll"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-[var(--accent-primary)]' : ''}`} />
            <span>Poll Telemetry</span>
          </button>
          <Link
            href="/dashboard/servers"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Enroll Agent</span>
          </Link>
        </div>
      </section>

      {/* 2. UNIFIED TELEMETRY HORIZON RIBBON (Integrated 5-cell command ticker) */}
      <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subtle)] grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 overflow-hidden">
        {/* Cell 1: Fleet Nodes */}
        <div className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Fleet Availability
            </span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
            {online}<span className="text-sm font-normal text-[var(--text-tertiary)]">/{total}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-xs font-mono text-[var(--status-healthy)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-healthy)]" />
            <span>{total > 0 ? `${health}%` : '0%'} Heartbeat SLA</span>
          </div>
        </div>

        {/* Cell 2: CPU Pressure */}
        <div className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Compute Load
            </span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
            {hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)] font-mono">
            Peak: <strong className="text-[var(--text-primary)] tabular-nums">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong> · Nominal
          </div>
        </div>

        {/* Cell 3: Memory Footprint */}
        <div className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <MemoryStick className="h-3.5 w-3.5 text-[var(--status-info)]" />
              RAM Footprint
            </span>
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
            {hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-secondary)] tabular-nums truncate">
            {hasLiveMemory ? `${formatBytes(summary?.memory_used ?? 0)} / ${formatBytes(summary?.memory_total ?? 0)}` : 'No metrics'}
          </div>
        </div>

        {/* Cell 4: Incident State */}
        <div className="p-3.5">
          <div className="flex items-center justify-between text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5">
              <BellRing className={`h-3.5 w-3.5 ${incidents.length > 0 ? 'text-[var(--status-critical)]' : 'text-[var(--status-healthy)]'}`} />
              Firing Alerts
            </span>
          </div>
          <div className={`mt-1.5 font-mono text-2xl font-bold tracking-tight tabular-nums ${incidents.length > 0 ? 'text-[var(--status-critical)]' : 'text-[var(--text-primary)]'}`}>
            {summary?.open_incidents ?? 0}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)] font-mono">
            {incidents.length > 0 ? `${warning} nodes affected` : 'All rules clear'}
          </div>
        </div>

        {/* Cell 5: Telemetry Engine Health */}
        <div className="col-span-2 md:col-span-4 lg:col-span-1 p-3.5 bg-[var(--surface-2)]/30">
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-[var(--status-healthy)]" />
            Telemetry Engine
          </div>
          <div className="mt-1.5 font-mono text-sm font-bold text-[var(--status-healthy)] flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)] animate-pulse" />
            OPERATIONAL
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
            {servers.length} agents reporting live
          </div>
        </div>
      </section>

      {/* 3. ACTIVE SERVER BLADE MATRIX (Hero component: visual live nodes) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-[var(--accent-primary)]" />
            <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Active Server Blade Matrix
            </h2>
            <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
              {online}/{total} ONLINE
            </span>
          </div>
          <Link
            href="/dashboard/servers"
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline"
          >
            Server Inventory <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {servers.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {servers.map((server) => {
              const isOnline = server.status === 'online';
              const memPct = server.memory_total > 0 ? (server.memory_used * 100) / server.memory_total : 0;
              const hasMetrics = isOnline && server.has_metrics;

              return (
                <Link
                  key={server.id}
                  href={`/dashboard/servers/${server.id}`}
                  className="group rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5 transition-all duration-150 hover:border-[var(--accent-primary)]/60 hover:bg-[var(--surface-2)]/60 shadow-xs block"
                >
                  {/* Top Blade Header */}
                  <div className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            isOnline ? 'bg-[var(--status-healthy)] animate-pulse' : 'bg-[var(--status-critical)]'
                          }`}
                        />
                        <span className="font-mono text-sm font-bold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-primary)] transition-colors">
                          {server.name}
                        </span>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--text-tertiary)] pl-4">
                        {server.ip_address ?? 'No IP assigned'}
                      </div>
                    </div>

                    <span
                      className={`font-mono text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                        isOnline
                          ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                          : 'bg-[var(--status-critical)]/10 text-[var(--status-critical)]'
                      }`}
                    >
                      {isOnline ? 'ONLINE' : 'OFFLINE'}
                    </span>
                  </div>

                  {/* Middle Live Telemetry Gauges */}
                  <div className="grid grid-cols-2 gap-3 py-3">
                    {/* CPU Gauge */}
                    <div className="rounded bg-[var(--surface-2)] p-2 border border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)]">
                        <span>CPU LOAD</span>
                        <strong className="text-[var(--text-primary)] tabular-nums">
                          {hasMetrics ? `${roundMetric(server.cpu_usage)}%` : '—'}
                        </strong>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className={`h-full transition-all duration-200 ${
                            server.cpu_usage >= 85
                              ? 'bg-[var(--status-critical)]'
                              : server.cpu_usage >= 70
                              ? 'bg-[var(--status-warning)]'
                              : 'bg-[var(--accent-primary)]'
                          }`}
                          style={{ width: `${Math.max(0, Math.min(server.cpu_usage, 100))}%` }}
                        />
                      </div>
                    </div>

                    {/* RAM Gauge */}
                    <div className="rounded bg-[var(--surface-2)] p-2 border border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-secondary)]">
                        <span>RAM ALLOC</span>
                        <strong className="text-[var(--text-primary)] tabular-nums">
                          {hasMetrics ? `${roundMetric(memPct)}%` : '—'}
                        </strong>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                        <div
                          className="h-full bg-[var(--status-info)] transition-all duration-200"
                          style={{ width: `${Math.max(0, Math.min(memPct, 100))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Blade Footer Info */}
                  <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-2 text-[11px] font-mono text-[var(--text-tertiary)]">
                    <span>Ping: <strong className="text-[var(--text-secondary)]">{formatRelativeTime(server.last_seen_at)}</strong></span>
                    <span className="inline-flex items-center gap-1 text-[var(--accent-primary)] group-hover:translate-x-0.5 transition-transform text-xs">
                      Inspect Telemetry <ArrowUpRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] p-8 text-center">
            <Server className="mx-auto h-8 w-8 text-[var(--text-tertiary)] opacity-60" />
            <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">No Server Blades Enrolled</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Enroll your first Linux node using the single-binary agent.</p>
            <Link
              href="/dashboard/servers"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white"
            >
              <Plus className="h-3.5 w-3.5" /> Enroll First Node
            </Link>
          </div>
        )}
      </section>

      {/* 4. DUAL TELEMETRY STUDIO (Multi-stream Chart 65% + Incident Feed 35%) */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Resource Load Telemetry Studio (xl:col-span-8) */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--accent-primary)]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Resource Load Telemetry Studio
                </h3>
              </div>
              <div className="mt-1.5 flex items-center gap-4 text-xs font-mono">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
                  CPU: <strong className="text-[var(--text-primary)] tabular-nums">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
                  RAM: <strong className="text-[var(--text-primary)] tabular-nums">{latestMetric ? `${latestMetric.ram}%` : '—'}</strong>
                </span>
              </div>
            </div>

            {/* Time range picker */}
            <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-0.5">
              {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setRange(item)}
                  className={`rounded px-2.5 py-1 font-mono text-xs font-bold transition-colors ${
                    range === item
                      ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                  aria-pressed={range === item}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[280px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="studioCpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--accent-primary)" stopOpacity="0.25" />
                      <stop offset="1" stopColor="var(--accent-primary)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="studioRamFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--status-healthy)" stopOpacity="0.2" />
                      <stop offset="1" stopColor="var(--status-healthy)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="t"
                    stroke="var(--border-default)"
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="var(--border-default)"
                    tick={{ fill: 'var(--text-tertiary)', fontSize: 10, fontFamily: 'monospace' }}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface-3)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                    }}
                    labelFormatter={(label) => `Timestamp: ${label}`}
                    formatter={(val: unknown, name: unknown) => [`${val}%`, String(name)]}
                  />
                  <Area
                    type="monotone"
                    dataKey="ram"
                    name="RAM"
                    stroke="var(--status-healthy)"
                    strokeWidth={1.5}
                    fill="url(#studioRamFill)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU"
                    stroke="var(--accent-primary)"
                    strokeWidth={1.5}
                    fill="url(#studioCpuFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Activity className="h-6 w-6 text-[var(--text-tertiary)]" />
                <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">NO TELEMETRY RECORDED IN SELECTED RANGE</p>
              </div>
            )}
          </div>
        </div>

        {/* Live Incident Stream & Fleet Health Breakdown (xl:col-span-4) */}
        <div className="flex flex-col justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 xl:col-span-4">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-[var(--accent-primary)]" />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Live Incidents Stream
                </h3>
              </div>
              <Link
                href="/dashboard/alerts"
                className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${
                  incidents.length > 0
                    ? 'bg-[var(--status-critical)]/10 text-[var(--status-critical)]'
                    : 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                }`}
              >
                {incidents.length} OPEN
              </Link>
            </div>

            {incidents.length > 0 ? (
              <div className="mt-3 space-y-2">
                {incidents.slice(0, 4).map((incident) => {
                  const desc =
                    incident.metric === 'status'
                      ? 'Heartbeat missing > 60s'
                      : `${incident.metric.toUpperCase()} ${incident.operator} ${roundMetric(incident.threshold)}%`;

                  return (
                    <div
                      key={`${incident.rule_id}-${incident.server_id}`}
                      className="flex items-center gap-3 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 transition-colors hover:border-[var(--status-critical)]/40"
                    >
                      <div className="rounded p-1.5 bg-[var(--status-critical)]/10 text-[var(--status-critical)] shrink-0">
                        {renderIncidentIcon(incident.metric)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                          {incident.rule_name}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)] font-mono">
                          <span>{incident.server_name}</span> · {desc}
                        </div>
                      </div>
                      <CircleAlert className="h-4 w-4 shrink-0 text-[var(--status-critical)]" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="my-6 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)]/40 p-4 text-center">
                <Check className="mx-auto h-6 w-6 text-[var(--status-healthy)]" />
                <p className="mt-2 font-mono text-xs font-bold text-[var(--text-primary)]">ALL SYSTEMS NOMINAL</p>
                <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Zero threshold violations in fleet telemetry.</p>
              </div>
            )}

            {/* Fleet Status SLA Distribution */}
            <div className="mt-4 border-t border-[var(--border-subtle)] pt-3 space-y-2 font-mono text-xs">
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
                  Responsive Nodes
                </span>
                <strong className="text-[var(--text-primary)] tabular-nums">{online}</strong>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-warning)]" />
                  Alerted / High Load
                </span>
                <strong className="text-[var(--text-primary)] tabular-nums">{warning}</strong>
              </div>
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-critical)]" />
                  Unreachable
                </span>
                <strong className="text-[var(--text-primary)] tabular-nums">{offline}</strong>
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/alerts"
            className="mt-4 flex items-center justify-center gap-1.5 rounded border border-[var(--border-default)] bg-[var(--surface-2)] py-2 font-mono text-xs font-bold text-[var(--accent-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            Launch Alert Incident Center <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function renderIncidentIcon(metric: string): React.ReactNode {
  if (metric === 'ram') return <Database className="h-3.5 w-3.5" />;
  if (metric === 'cpu') return <Cpu className="h-3.5 w-3.5" />;
  if (metric === 'status') return <Wifi className="h-3.5 w-3.5" />;
  return <CircleAlert className="h-3.5 w-3.5" />;
}

function getFleetStatus(total: number, online: number, incidents: number): { label: string; tone: 'good' | 'warning' } {
  if (total === 0) return { label: 'No Nodes', tone: 'warning' };
  if (incidents > 0 || online < total) return { label: 'Attention Required', tone: 'warning' };
  return { label: 'All Systems Nominal', tone: 'good' };
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

function formatRelativeTime(value?: string): string {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour');
  return formatter.format(Math.round(hours / 24), 'day');
}
