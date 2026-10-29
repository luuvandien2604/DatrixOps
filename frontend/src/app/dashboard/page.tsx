'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, BellRing, Check, ChevronRight, CircleAlert,
  Cpu, Database, MemoryStick, Plus, RefreshCw, Server, Wifi,
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
      <div className="flex h-[360px] items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
        <div className="flex flex-col items-center gap-3 text-center">
          <RefreshCw className="h-5 w-5 animate-spin text-[var(--accent-primary)]" />
          <div className="text-sm font-medium text-[var(--text-primary)]">Syncing telemetry data...</div>
          <div className="text-xs text-[var(--text-secondary)]">Connecting to fleet control plane.</div>
        </div>
      </div>
    );
  }

  if (!overview && error) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-md border border-[var(--status-critical)]/40 bg-[var(--surface-1)] p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleAlert className="h-6 w-6 text-[var(--status-critical)]" />
          <div className="text-sm font-semibold text-[var(--text-primary)]">Failed to sync overview data</div>
          <div className="max-w-md text-xs text-[var(--text-secondary)]">{error}</div>
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const fleetStatus = getFleetStatus(total, online, incidents.length);

  return (
    <div className="mx-auto max-w-[1540px] space-y-4">
      {/* Top Command Bar */}
      <section className="flex flex-col gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                refreshing ? 'bg-[var(--status-warning)] animate-pulse' : 'bg-[var(--status-healthy)]'
              }`}
              aria-hidden="true"
            />
            <h1 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
              Infrastructure Overview
            </h1>
          </div>
          <div className="hidden h-4 w-px bg-[var(--border-subtle)] sm:block" />
          <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] font-sans">
            <span>
              Snapshot: <strong className="font-mono text-[var(--text-primary)] tabular-nums">{formatSnapshotTime(overview?.generated_at)}</strong>
            </span>
            <span className="text-[var(--border-default)]">·</span>
            <span>{refreshing ? 'Refreshing...' : 'Poll interval 15s'}</span>
            {error && <span className="text-[var(--status-critical)] font-mono">({error})</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchOverview(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-50"
            title="Refresh overview immediately"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/dashboard/servers"
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Server</span>
          </Link>
        </div>
      </section>

      {/* KPI Stat Cards (Operate Mode: high density, typography-focused, flat 1px border) */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Agents Online */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--border-default)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
            <span className="flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Agents Online
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono font-medium text-[var(--status-healthy)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--status-healthy)]" />
              {total > 0 ? `${health}%` : '0%'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {online}<span className="text-sm font-normal text-[var(--text-tertiary)]">/{total}</span>
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {offline > 0 ? (
                <span className="text-[var(--status-critical)] font-mono tabular-nums">{offline} offline</span>
              ) : (
                <span className="text-[var(--status-healthy)]">All online</span>
              )}
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full bg-[var(--status-healthy)] transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(health, 100))}%` }}
            />
          </div>
        </div>

        {/* Metric 2: Average CPU */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--border-default)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
              Average CPU Load
            </span>
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">Fleet Avg</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {hasLiveMetrics ? formatPercent(summary?.average_cpu) : '—'}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {hasLiveMetrics && (summary?.average_cpu ?? 0) >= 80 ? (
                <span className="text-[var(--status-critical)] font-medium">High pressure</span>
              ) : hasLiveMetrics ? (
                <span className="text-[var(--status-healthy)] font-medium">Nominal</span>
              ) : (
                <span>No metrics</span>
              )}
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className={`h-full transition-all duration-300 ${
                (summary?.average_cpu ?? 0) >= 85
                  ? 'bg-[var(--status-critical)]'
                  : (summary?.average_cpu ?? 0) >= 70
                  ? 'bg-[var(--status-warning)]'
                  : 'bg-[var(--accent-primary)]'
              }`}
              style={{ width: `${Math.max(0, Math.min(summary?.average_cpu ?? 0, 100))}%` }}
            />
          </div>
        </div>

        {/* Metric 3: Memory Used */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--border-default)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
            <span className="flex items-center gap-1.5">
              <MemoryStick className="h-3.5 w-3.5 text-[var(--status-info)]" />
              Memory Allocation
            </span>
            <span className="text-[11px] font-mono text-[var(--text-tertiary)]">Used / Total</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-mono text-2xl font-bold tracking-tight text-[var(--text-primary)] tabular-nums">
              {hasLiveMemory ? formatPercent(summary?.average_memory) : '—'}
            </div>
            <div className="font-mono text-xs text-[var(--text-secondary)] tabular-nums">
              {hasLiveMemory
                ? `${formatBytes(summary?.memory_used ?? 0)} / ${formatBytes(summary?.memory_total ?? 0)}`
                : 'No metrics'}
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full bg-[var(--status-info)] transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(summary?.average_memory ?? 0, 100))}%` }}
            />
          </div>
        </div>

        {/* Metric 4: Open Incidents */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 transition-colors hover:border-[var(--border-default)]">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] font-medium">
            <span className="flex items-center gap-1.5">
              <BellRing
                className={`h-3.5 w-3.5 ${
                  incidents.length > 0 ? 'text-[var(--status-critical)]' : 'text-[var(--status-healthy)]'
                }`}
              />
              Active Incidents
            </span>
            <span
              className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                incidents.length > 0
                  ? 'bg-[var(--status-critical)]/10 text-[var(--status-critical)] font-bold'
                  : 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
              }`}
            >
              {incidents.length > 0 ? 'FIRING' : 'CLEAR'}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div
              className={`font-mono text-2xl font-bold tracking-tight tabular-nums ${
                incidents.length > 0 ? 'text-[var(--status-critical)]' : 'text-[var(--text-primary)]'
              }`}
            >
              {summary?.open_incidents ?? 0}
            </div>
            <div className="text-xs text-[var(--text-secondary)]">
              {warning > 0 ? (
                <span className="text-[var(--status-warning)] font-mono tabular-nums">{warning} servers affected</span>
              ) : (
                <span className="text-[var(--status-healthy)]">All rules normal</span>
              )}
            </div>
          </div>
          <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className={`h-full transition-all duration-300 ${
                incidents.length > 0 ? 'bg-[var(--status-critical)]' : 'bg-[var(--status-healthy)]'
              }`}
              style={{ width: incidents.length > 0 ? '100%' : '0%' }}
            />
          </div>
        </div>
      </section>

      {/* Main Telemetry & Fleet Status Grid */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Resource Load Telemetry Chart (xl:col-span-8) */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 xl:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
                Resource Load Telemetry
              </h2>
              <div className="mt-1 flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
                  CPU: <strong className="font-mono text-[var(--text-primary)] tabular-nums">{latestMetric ? `${latestMetric.cpu}%` : '—'}</strong>
                </span>
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
                  Memory: <strong className="font-mono text-[var(--text-primary)] tabular-nums">{latestMetric ? `${latestMetric.ram}%` : '—'}</strong>
                </span>
              </div>
            </div>

            {/* Time range selector */}
            <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-0.5" role="group" aria-label="Time range">
              {(['1H', '2H', '12H', '24H'] as DashboardRange[]).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setRange(item)}
                  className={`rounded px-2.5 py-1 font-mono text-xs font-semibold transition-colors ${
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
                    <linearGradient id="chartCpuFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--accent-primary)" stopOpacity="0.25" />
                      <stop offset="1" stopColor="var(--accent-primary)" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="chartRamFill" x1="0" y1="0" x2="0" y2="1">
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
                      borderRadius: '6px',
                      fontSize: '11px',
                      color: 'var(--text-primary)',
                      fontFamily: 'monospace',
                    }}
                    labelFormatter={(label) => `Time: ${label}`}
                    formatter={(val: unknown, name: unknown) => [`${val}%`, String(name)]}
                  />
                  <Area
                    type="monotone"
                    dataKey="ram"
                    name="Memory"
                    stroke="var(--status-healthy)"
                    strokeWidth={1.5}
                    fill="url(#chartRamFill)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="cpu"
                    name="CPU"
                    stroke="var(--accent-primary)"
                    strokeWidth={1.5}
                    fill="url(#chartCpuFill)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Activity className="h-6 w-6 text-[var(--text-tertiary)]" />
                <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">No telemetry received in this window</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">Chart updates as soon as agents publish metrics.</p>
              </div>
            )}
          </div>
        </div>

        {/* Fleet Health & Node Breakdown (xl:col-span-4) */}
        <div className="flex flex-col justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 xl:col-span-4">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
                Fleet Health Status
              </h2>
              <span
                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${
                  fleetStatus.tone === 'good'
                    ? 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                    : 'bg-[var(--status-warning)]/10 text-[var(--status-warning)]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    fleetStatus.tone === 'good' ? 'bg-[var(--status-healthy)]' : 'bg-[var(--status-warning)]'
                  }`}
                />
                {fleetStatus.label}
              </span>
            </div>

            {/* Availability Ratio */}
            <div className="my-5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-[var(--text-secondary)] font-medium">Heartbeat Health Score</span>
                <span className="font-mono text-2xl font-bold text-[var(--text-primary)] tabular-nums">
                  {total > 0 ? `${health}%` : '—'}
                </span>
              </div>
              <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                <div
                  className="h-full bg-[var(--status-healthy)]"
                  style={{ width: `${total > 0 ? (online / total) * 100 : 0}%` }}
                  title={`Online: ${online}`}
                />
                <div
                  className="h-full bg-[var(--status-warning)]"
                  style={{ width: `${total > 0 ? (warning / total) * 100 : 0}%` }}
                  title={`Alerted: ${warning}`}
                />
                <div
                  className="h-full bg-[var(--status-critical)]"
                  style={{ width: `${total > 0 ? (offline / total) * 100 : 0}%` }}
                  title={`Offline: ${offline}`}
                />
              </div>
            </div>

            {/* Structured breakdown items */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-[var(--surface-2)] transition-colors">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-healthy)]" />
                  Online & Responsive
                </span>
                <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">{online}</span>
              </div>

              <div className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-[var(--surface-2)] transition-colors">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-warning)]" />
                  Alerted / High Pressure
                </span>
                <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">{warning}</span>
              </div>

              <div className="flex items-center justify-between rounded px-2 py-1.5 hover:bg-[var(--surface-2)] transition-colors">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span className="h-2 w-2 rounded-full bg-[var(--status-critical)]" />
                  Offline / Unreachable
                </span>
                <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">{offline}</span>
              </div>

              <div className="flex items-center justify-between rounded border-t border-[var(--border-subtle)] px-2 pt-2.5">
                <span className="font-medium text-[var(--text-secondary)]">Total Registered Nodes</span>
                <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">{total}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] text-[var(--text-tertiary)] flex items-center justify-between">
            <span>Uptime metric calculation</span>
            <Link href="/dashboard/monitoring" className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1">
              Monitoring <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* Bottom Grid: Server Activity Table & Incidents */}
      <section className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* Server Activity Table (xl:col-span-7) */}
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] xl:col-span-7 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
              Server Activity
            </h2>
            <Link
              href="/dashboard/servers"
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-primary)] hover:underline"
            >
              View all servers <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {servers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                    <th className="px-4 py-2.5">Server</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">CPU</th>
                    <th className="px-3 py-2.5">Memory</th>
                    <th className="px-3 py-2.5">Heartbeat</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-sans">
                  {servers.slice(0, 6).map((server) => {
                    const isOnline = server.status === 'online';
                    const memPct = server.memory_total > 0 ? (server.memory_used * 100) / server.memory_total : 0;
                    const canShow = isOnline && server.has_metrics;

                    return (
                      <tr key={server.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                            {server.name}
                          </div>
                          <div className="font-mono text-[11px] text-[var(--text-tertiary)]">
                            {server.ip_address ?? 'No IP'}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                              isOnline ? 'text-[var(--status-healthy)]' : 'text-[var(--status-critical)]'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isOnline ? 'bg-[var(--status-healthy)]' : 'bg-[var(--status-critical)]'
                              }`}
                            />
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {canShow ? (
                            <MiniBar value={server.cpu_usage} />
                          ) : (
                            <span className="font-mono text-[var(--text-tertiary)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {canShow ? (
                            <MiniBar value={memPct} />
                          ) : (
                            <span className="font-mono text-[var(--text-tertiary)]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-[var(--text-secondary)]">
                          {formatRelativeTime(server.last_seen_at)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            href={`/dashboard/servers/${server.id}`}
                            className="inline-flex items-center justify-center rounded p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-colors"
                            aria-label={`View details of ${server.name}`}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <Server className="mx-auto h-6 w-6 text-[var(--text-tertiary)]" />
              <p className="mt-2 text-xs font-medium text-[var(--text-secondary)]">No servers enrolled</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">Install an agent to view real-time activity.</p>
            </div>
          )}
        </div>

        {/* Active Incidents Panel (xl:col-span-5) */}
        <div className="flex flex-col justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 xl:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
                Active Incidents
              </h2>
              <Link
                href="/dashboard/alerts"
                className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  incidents.length > 0
                    ? 'bg-[var(--status-critical)]/10 text-[var(--status-critical)]'
                    : 'bg-[var(--status-healthy)]/10 text-[var(--status-healthy)]'
                }`}
              >
                {incidents.length} open
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
                      className="flex items-center gap-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5 transition-colors hover:border-[var(--status-critical)]/40"
                    >
                      <div className="rounded p-1.5 bg-[var(--status-critical)]/10 text-[var(--status-critical)] shrink-0">
                        {renderIncidentIcon(incident.metric)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-[var(--text-primary)]">
                          {incident.rule_name}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                          <span className="font-mono text-[var(--text-primary)]">{incident.server_name}</span> · {desc} ·{' '}
                          <span className="font-mono text-[var(--text-tertiary)]">{formatRelativeTime(incident.last_triggered_at)}</span>
                        </div>
                      </div>
                      <CircleAlert className="h-4 w-4 shrink-0 text-[var(--status-critical)]" />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="my-8 flex flex-col items-center justify-center text-center">
                <Check className="h-6 w-6 text-[var(--status-healthy)]" />
                <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">No firing incidents</p>
                <p className="text-[11px] text-[var(--text-tertiary)]">All monitoring rules are within operational bounds.</p>
              </div>
            )}
          </div>

          <Link
            href="/dashboard/alerts"
            className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            Open Incident Center <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}

function MiniBar({ value }: { value: number }) {
  const norm = Math.max(0, Math.min(value, 100));
  const color =
    norm >= 85
      ? 'bg-[var(--status-critical)] text-[var(--status-critical)]'
      : norm >= 70
      ? 'bg-[var(--status-warning)] text-[var(--status-warning)]'
      : 'bg-[var(--accent-primary)] text-[var(--text-primary)]';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div
          className={`h-full transition-all duration-200 ${
            norm >= 85 ? 'bg-[var(--status-critical)]' : norm >= 70 ? 'bg-[var(--status-warning)]' : 'bg-[var(--accent-primary)]'
          }`}
          style={{ width: `${norm}%` }}
        />
      </div>
      <span className={`font-mono text-[11px] font-medium tabular-nums ${color.split(' ')[1]}`}>
        {roundMetric(value)}%
      </span>
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
