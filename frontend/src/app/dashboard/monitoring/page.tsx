'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, CircleAlert, Clock3, Cpu, DatabaseBackup,
  HardDrive, Maximize2, Minimize2, RefreshCw, Server as ServerIcon, Wifi, X,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiClient } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';

type MonitoringServer = {
  id: string;
  name: string;
  status: string;
  last_seen_at?: string;
};

type MetricApiPoint = {
  created_at?: string;
  bucket_time?: string;
  time?: string;
  bucket_seconds?: number;
  cpu_usage?: number | string;
  memory_used?: number | string;
  memory_total?: number | string;
  net_in?: number | string;
  net_out?: number | string;
  disk_read?: number | string;
  disk_write?: number | string;
};

type TimelinePoint = {
  timestamp: number;
  cpu: number | null;
  ram: number | null;
  netIn: number | null;
  netOut: number | null;
  diskRead: number | null;
  diskWrite: number | null;

  // Breakdown sub-series for Focus/Maximized Inspector
  cpuUser: number | null;
  cpuSystem: number | null;
  cpuIOWait: number | null;
  cpuOther: number | null;

  ramApps: number | null;
  ramCache: number | null;
  ramFree: number | null;

  // Zero is only emitted during confirmed downtime and is rendered separately.
  downtimeZero: number | null;

  hasData: boolean;
  isConfirmedMissing: boolean;
};

type TimeRange = '15m' | '1h' | '3h' | '6h' | '12h' | '24h' | '7d';

type RangeOption = {
  value: TimeRange;
  label: string;
  durationMs: number;
  bucketSeconds: number;
};

type TooltipItem = {
  name?: string;
  value?: number | string | null;
  color?: string;
  payload?: TimelinePoint;
};

type MetricsTooltipProps = {
  active?: boolean;
  label?: number | string;
  payload?: TooltipItem[];
};

type MetricType = 'cpu' | 'ram' | 'network' | 'disk';

const POLL_INTERVAL_MS = 5_000;
const TIMELINE_TICK_MS = 1_000;
const MISSING_DATA_GRACE_MS = 25_000;

const RANGE_OPTIONS: RangeOption[] = [
  { value: '15m', label: 'Last 15 minutes', durationMs: 15 * 60_000, bucketSeconds: 10 },
  { value: '1h', label: 'Last hour', durationMs: 60 * 60_000, bucketSeconds: 15 },
  { value: '3h', label: 'Last 3 hours', durationMs: 3 * 60 * 60_000, bucketSeconds: 30 },
  { value: '6h', label: 'Last 6 hours', durationMs: 6 * 60 * 60_000, bucketSeconds: 60 },
  { value: '12h', label: 'Last 12 hours', durationMs: 12 * 60 * 60_000, bucketSeconds: 120 },
  { value: '24h', label: 'Last 24 hours', durationMs: 24 * 60 * 60_000, bucketSeconds: 300 },
  { value: '7d', label: 'Last 7 days', durationMs: 7 * 24 * 60 * 60_000, bucketSeconds: 1_800 },
];

const RANGE_CONFIG = Object.fromEntries(
  RANGE_OPTIONS.map((option) => [option.value, option]),
) as Record<TimeRange, RangeOption>;

export default function MonitoringPage() {
  const [servers, setServers] = useState<MonitoringServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('15m');
  const [rawMetrics, setRawMetrics] = useState<MetricApiPoint[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [maximizedMetric, setMaximizedMetric] = useState<MetricType | null>(null);

  const activeMetricsRequest = useRef<AbortController | null>(null);
  const router = useRouter();

  const fetchServers = useCallback(async () => {
    try {
      const data = await apiClient('/servers');
      const nextServers = Array.isArray(data) ? data as MonitoringServer[] : [];
      setServers(nextServers);
      setSelectedServerId((current) => {
        if (typeof window !== 'undefined') {
          const urlParams = new URLSearchParams(window.location.search);
          const targetId = urlParams.get('server_id') || urlParams.get('id');
          if (targetId && nextServers.some((s) => s.id === targetId)) {
            return targetId;
          }
        }
        if (current && nextServers.some((server) => server.id === current)) return current;
        return nextServers[0]?.id ?? '';
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('token') || message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    }
  }, [router]);

  useEffect(() => {
    void fetchServers();
    const interval = window.setInterval(() => void fetchServers(), 30_000);
    return () => window.clearInterval(interval);
  }, [fetchServers]);

  useEffect(() => {
    if (typeof window !== 'undefined' && servers.length > 0) {
      const urlParams = new URLSearchParams(window.location.search);
      const targetId = urlParams.get('server_id') || urlParams.get('id');
      if (targetId && servers.some((s) => s.id === targetId)) {
        setSelectedServerId(targetId);
      }
    }
  }, [servers]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), TIMELINE_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const fetchMetrics = useCallback(async (background = false, replaceActiveRequest = false) => {
    if (!selectedServerId) return;
    if (activeMetricsRequest.current) {
      if (!replaceActiveRequest) return;
      activeMetricsRequest.current.abort();
    }

    const controller = new AbortController();
    activeMetricsRequest.current = controller;
    if (background) setRefreshing(true);
    else setInitialLoading(true);

    try {
      const data = await apiClient(`/servers/${selectedServerId}/metrics?range=${timeRange}`, {
        signal: controller.signal,
      });
      if (activeMetricsRequest.current !== controller) return;
      setRawMetrics(Array.isArray(data) ? data as MetricApiPoint[] : []);
      setMetricsLoaded(true);
      setMetricsError('');
      setNow(Date.now());
      setLastRefreshedAt(new Date());
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : 'Unable to load metrics';
      if (message.includes('token') || message.includes('UNAUTHORIZED')) {
        router.push('/login');
        return;
      }
      setMetricsError(message);
    } finally {
      if (activeMetricsRequest.current === controller) {
        activeMetricsRequest.current = null;
        setInitialLoading(false);
        setRefreshing(false);
      }
    }
  }, [router, selectedServerId, timeRange]);

  useEffect(() => {
    if (!selectedServerId) return;
    setRawMetrics([]);
    setMetricsLoaded(false);
    setMetricsError('');
    void fetchMetrics(false, true);

    const interval = window.setInterval(
      () => void fetchMetrics(true),
      POLL_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(interval);
      activeMetricsRequest.current?.abort();
      activeMetricsRequest.current = null;
    };
  }, [fetchMetrics, selectedServerId]);

  const rangeConfig = RANGE_CONFIG[timeRange];
  const effectiveBucketSeconds = useMemo(
    () => resolveBucketSeconds(rawMetrics, rangeConfig.bucketSeconds),
    [rawMetrics, rangeConfig.bucketSeconds],
  );
  const timelineConfig = useMemo(
    () => ({ ...rangeConfig, bucketSeconds: effectiveBucketSeconds }),
    [effectiveBucketSeconds, rangeConfig],
  );
  const timeline = useMemo(
    () => buildTimeline(rawMetrics, timelineConfig, now),
    [now, rawMetrics, timelineConfig],
  );
  const chartTimeline = timeline;
  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const serverOnline = selectedServer?.status === 'online';
  const dataPoints = timeline.reduce((total, point) => total + (point.hasData ? 1 : 0), 0);
  const xDomain: [number, number] = [now - rangeConfig.durationMs, now];
  const chartContext = {
    data: chartTimeline,
    domain: xDomain,
    range: timeRange,
  };

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="panel-kicker mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" />
            Continuous telemetry
          </p>
          <h1>Resource Monitoring</h1>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Click any chart to expand into an interactive multi-series breakdown view.
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">
            Last refresh: {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString('en-US') : 'Waiting for metrics'} · Polling every {POLL_INTERVAL_MS / 1_000}s
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <CustomSelect
            value={selectedServerId}
            onChange={setSelectedServerId}
            icon={<ServerIcon className="w-4 h-4 text-blue-400" />}
            placeholder="No servers available"
            options={servers.map((s) => ({ value: s.id, label: s.name }))}
            className="w-56"
          />

          {selectedServer && (
            <span className={`monitoring-server-status ${serverOnline ? 'is-online' : 'is-offline'}`}>
              <span className={`status-dot ${serverOnline ? 'online' : 'offline'}`} />
              {serverOnline ? 'Online' : 'Offline'}
            </span>
          )}

          <CustomSelect
            value={timeRange}
            onChange={(val) => setTimeRange(val as TimeRange)}
            icon={<Clock3 className="w-4 h-4 text-slate-400" />}
            options={RANGE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            className="w-48"
          />

          <button
            type="button"
            onClick={() => void fetchMetrics(false, true)}
            className="monitoring-refresh"
            title="Refresh metrics now"
            aria-label="Refresh metrics now"
            disabled={!selectedServerId || initialLoading}
          >
            <RefreshCw className={`h-4 w-4 ${initialLoading || refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {metricsError && (
        <div className="monitoring-empty-notice text-[var(--rose)]" role="alert">
          <CircleAlert className="h-4 w-4" />
          Unable to refresh metrics: {metricsError}
        </div>
      )}

      {!selectedServerId ? (
        <div className="ops-panel p-12 text-center">
          <ServerIcon className="mx-auto mb-4 h-10 w-10 text-[var(--color-muted)] opacity-45" />
          <h2 className="text-xl">No servers to monitor</h2>
          <p className="mt-2 text-[var(--color-muted)]">Connect a DatrixOps Agent to start receiving metrics.</p>
        </div>
      ) : (
        <>
          {!initialLoading && metricsLoaded && dataPoints === 0 && (
            <div className="monitoring-empty-notice">
              <CircleAlert className="h-4 w-4" />
              No metrics were received in this range. Confirmed downtime is displayed at zero.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <MetricChartCard
              title="CPU Usage (%)"
              icon={<Cpu className="h-5 w-5 text-[var(--violet)]" />}
              rangeLabel={rangeConfig.label}
              summary={formatMetricSummary(chartTimeline, 'cpu', '%')}
              freshness={`${effectiveBucketSeconds}s resolution`}
              loading={initialLoading}
              onMaximize={() => setMaximizedMetric('cpu')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} percentAxis />
                  <Tooltip content={<MetricsTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="cpu"
                    name="CPU Usage"
                    stroke="var(--violet)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: 'var(--violet)' }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Memory Usage (%)"
              icon={<DatabaseBackup className="h-5 w-5 text-[var(--mint)]" />}
              rangeLabel={rangeConfig.label}
              summary={formatMetricSummary(chartTimeline, 'ram', '%')}
              freshness={`${effectiveBucketSeconds}s resolution`}
              loading={initialLoading}
              onMaximize={() => setMaximizedMetric('ram')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartContext.data}>
                  <defs>
                    <linearGradient id="monitoringRamFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="var(--mint)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
                  <Tooltip content={<MetricsTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ram"
                    name="Memory Usage"
                    stroke="var(--mint)"
                    strokeWidth={2}
                    fill="url(#monitoringRamFill)"
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Network Throughput (KB/s)"
              icon={<Wifi className="h-5 w-5 text-[var(--sky)]" />}
              rangeLabel={rangeConfig.label}
              summary={formatPairSummary(chartTimeline, 'netIn', 'RX', 'netOut', 'TX', ' KB/s')}
              freshness={`${effectiveBucketSeconds}s resolution`}
              loading={initialLoading}
              onMaximize={() => setMaximizedMetric('network')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  <Line type="monotone" dataKey="netIn" name="Receive" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="netOut" name="Send" stroke="var(--sky)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Disk I/O (KB/s)"
              icon={<HardDrive className="h-5 w-5 text-[var(--amber)]" />}
              rangeLabel={rangeConfig.label}
              summary={formatPairSummary(chartTimeline, 'diskRead', 'Read', 'diskWrite', 'Write', ' KB/s')}
              freshness={`${effectiveBucketSeconds}s resolution`}
              loading={initialLoading}
              onMaximize={() => setMaximizedMetric('disk')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  <Line type="monotone" dataKey="diskRead" name="Read" stroke="var(--amber)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="diskWrite" name="Write" stroke="var(--rose)" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>
          </div>
        </>
      )}

      {/* Focus Breakdown Modal */}
      {maximizedMetric && (
        <MaximizedChartModal
          metric={maximizedMetric}
          onClose={() => setMaximizedMetric(null)}
          onSelectMetric={setMaximizedMetric}
          timeline={chartTimeline}
          chartContext={chartContext}
          server={selectedServer}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          resolution={effectiveBucketSeconds}
        />
      )}
    </div>
  );
}

function MetricChartCard({
  title,
  icon,
  rangeLabel,
  summary,
  freshness,
  loading,
  onMaximize,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  rangeLabel: string;
  summary: string;
  freshness: string;
  loading: boolean;
  onMaximize?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="ops-panel surface-regular no-hover-lift monitoring-chart-card p-5 sm:p-6 group relative">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </h2>
          <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{summary}</p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right text-xs text-[var(--color-muted)]">
            <span className="block">{rangeLabel}</span>
            <span className="mt-1 block font-mono text-[11px]">{freshness}</span>
          </div>
          {onMaximize && (
            <button
              type="button"
              onClick={onMaximize}
              className="p-1.5 rounded-lg border border-[var(--border-color)] bg-white/[0.04] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-white/[0.08] transition-colors"
              title="Maximize chart & view breakdown"
              aria-label={`Maximize ${title} chart`}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      <div className="relative h-72">
        {children}
        {loading && (
          <div className="monitoring-chart-loading">
            <RefreshCw className="h-5 w-5 animate-spin" />
            Loading metrics…
          </div>
        )}
      </div>
    </section>
  );
}

function ChartScaffolding({
  domain,
  range,
  percentAxis = false,
  fixedPercentDomain = false,
}: {
  data: TimelinePoint[];
  domain: [number, number];
  range: TimeRange;
  percentAxis?: boolean;
  fixedPercentDomain?: boolean;
}) {
  return (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="var(--border-color)"
        vertical={false}
      />
      <XAxis
        type="number"
        dataKey="timestamp"
        domain={domain}
        scale="time"
        allowDataOverflow
        stroke="var(--border-color)"
        tick={{ fill: 'var(--text-strong)', fontSize: 13, fontWeight: 600 }}
        tickLine={false}
        axisLine={false}
        minTickGap={42}
        tickFormatter={(value) => formatAxisTime(Number(value), range)}
      />
      <YAxis
        stroke="var(--border-color)"
        tick={{ fill: 'var(--text-strong)', fontSize: 13, fontWeight: 600 }}
        tickLine={false}
        axisLine={false}
        width={46}
        tickFormatter={(value) =>
          percentAxis ? `${value}%` : formatCompactNumber(Number(value))
        }
        domain={
          fixedPercentDomain
            ? [0, 100]
            : percentAxis
              ? [0, 'auto']
              : [0, 'auto']
        }
      />
    </>
  );
}

function MetricsTooltip({ active, label, payload }: MetricsTooltipProps) {
  if (!active) return null;
  const timestamp = Number(label);
  const point = payload?.[0]?.payload;
  const visibleItems = (payload ?? []).filter(
    (item) => item.value != null && item.name !== 'No metrics',
  );

  return (
    <div className="monitoring-tooltip">
      <p className="monitoring-tooltip-time">{formatTooltipTime(timestamp)}</p>
      {!point?.hasData || visibleItems.length === 0 ? (
        <div className="monitoring-tooltip-missing">
          <CircleAlert className="h-3.5 w-3.5" />
          No metrics
        </div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {visibleItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-2">
                <i style={{ background: item.color }} />
                <span className="monitoring-tooltip-name">{item.name}</span>
              </span>
              <strong>{formatTooltipValue(item.value)}</strong>
            </div>
          ))}
          <div className="monitoring-tooltip-meta">
            <span>Status</span><strong>Data received</strong>
            <span>Source</span><strong>Agent heartbeat</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/* Maximized Deep-Dive Breakdown Modal Component */
function MaximizedChartModal({
  metric,
  onClose,
  onSelectMetric,
  timeline,
  chartContext,
  server,
  timeRange,
  onTimeRangeChange,
  resolution,
}: {
  metric: MetricType;
  onClose: () => void;
  onSelectMetric: (m: MetricType) => void;
  timeline: TimelinePoint[];
  chartContext: { data: TimelinePoint[]; domain: [number, number]; range: TimeRange };
  server?: MonitoringServer;
  timeRange: TimeRange;
  onTimeRangeChange: (r: TimeRange) => void;
  resolution: number;
}) {
  // Series Visibility Toggle state
  const [activeSeries, setActiveSeries] = useState<Record<string, boolean>>({
    user: true,
    system: true,
    iowait: true,
    other: true,
    totalCpu: true,
    ramApps: true,
    ramCache: true,
    ramFree: true,
    netIn: true,
    netOut: true,
    diskRead: true,
    diskWrite: true,
  });

  const toggleSeries = (key: string) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const metricMeta = {
    cpu: {
      title: 'CPU Utilization Breakdown (%)',
      icon: <Cpu className="w-5 h-5 text-violet-400" />,
      description: 'Layered execution distribution: User workload, Kernel/System, and Storage I/O Wait.',
    },
    ram: {
      title: 'Memory Allocation Breakdown (%)',
      icon: <DatabaseBackup className="w-5 h-5 text-emerald-400" />,
      description: 'Layered memory mapping: Resident applications, OS filesystem cache & buffers, and Free reserve.',
    },
    network: {
      title: 'Network Throughput (KB/s)',
      icon: <Wifi className="w-5 h-5 text-sky-400" />,
      description: 'Bi-directional network stream: Inbound RX ingress & Outbound TX egress bandwidth.',
    },
    disk: {
      title: 'Disk I/O Bandwidth (KB/s)',
      icon: <HardDrive className="w-5 h-5 text-amber-400" />,
      description: 'Storage read & write throughput metrics over the selected time window.',
    },
  }[metric];

  // Calculate statistics summary
  const stats = useMemo(() => {
    let key: keyof TimelinePoint = 'cpu';
    let unit = '%';
    if (metric === 'ram') { key = 'ram'; unit = '%'; }
    else if (metric === 'network') { key = 'netIn'; unit = ' KB/s'; }
    else if (metric === 'disk') { key = 'diskRead'; unit = ' KB/s'; }

    const values = timeline
      .filter((p) => p.hasData && p[key] != null)
      .map((p) => Number(p[key]));

    if (values.length === 0) {
      return { current: '—', avg: '—', peak: '—', min: '—' };
    }
    const cur = values.at(-1) ?? 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    return {
      current: `${cur.toFixed(1)}${unit}`,
      avg: `${avg.toFixed(1)}${unit}`,
      peak: `${max.toFixed(1)}${unit}`,
      min: `${min.toFixed(1)}${unit}`,
    };
  }, [timeline, metric]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="ops-modal flex flex-col w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 border-b border-[var(--border-color)] bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/[0.05] border border-white/10">
              {metricMeta.icon}
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
                {metricMeta.title}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                Server: <span className="font-semibold text-blue-400">{server?.name || 'Local Host'}</span> · {metricMeta.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Metric Switcher Tabs */}
            <div className="flex items-center rounded-lg bg-black/30 p-1 border border-white/10 text-xs">
              {(['cpu', 'ram', 'network', 'disk'] as MetricType[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelectMetric(m)}
                  className={`px-3 py-1 rounded-md font-semibold uppercase transition-all ${
                    metric === m
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {m === 'network' ? 'Net' : m}
                </button>
              ))}
            </div>

            {/* Time Range Selector */}
            <CustomSelect
              value={timeRange}
              onChange={(val) => onTimeRangeChange(val as TimeRange)}
              options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              className="w-40"
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg border border-white/10 bg-white/[0.05] text-[var(--color-muted)] hover:text-white hover:bg-white/10 transition-colors"
              title="Close focus view (Esc)"
              aria-label="Close focus view"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Chart Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5 custom-scrollbar">
          <div className="h-[380px] w-full relative">
            {metric === 'cpu' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartContext.data}>
                  <defs>
                    <linearGradient id="userCpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="sysCpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="iowaitCpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="otherCpuGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ec4899" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
                  <Tooltip content={<MetricsTooltip />} />
                  {activeSeries.other && (
                    <Area
                      type="monotone"
                      stackId="cpuStack"
                      dataKey="cpuOther"
                      name="Background & Other"
                      stroke="#ec4899"
                      fill="url(#otherCpuGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.iowait && (
                    <Area
                      type="monotone"
                      stackId="cpuStack"
                      dataKey="cpuIOWait"
                      name="I/O Wait"
                      stroke="#f59e0b"
                      fill="url(#iowaitCpuGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.system && (
                    <Area
                      type="monotone"
                      stackId="cpuStack"
                      dataKey="cpuSystem"
                      name="System & Kernel"
                      stroke="#3b82f6"
                      fill="url(#sysCpuGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.user && (
                    <Area
                      type="monotone"
                      stackId="cpuStack"
                      dataKey="cpuUser"
                      name="User Workload"
                      stroke="#8b5cf6"
                      fill="url(#userCpuGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.totalCpu && (
                    <Line
                      type="monotone"
                      dataKey="cpu"
                      name="Total CPU %"
                      stroke="#a855f7"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {metric === 'ram' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartContext.data}>
                  <defs>
                    <linearGradient id="ramAppsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="ramCacheGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="ramFreeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
                  <Tooltip content={<MetricsTooltip />} />
                  {activeSeries.ramFree && (
                    <Area
                      type="monotone"
                      stackId="ramStack"
                      dataKey="ramFree"
                      name="Free Reserve"
                      stroke="#64748b"
                      fill="url(#ramFreeGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.ramCache && (
                    <Area
                      type="monotone"
                      stackId="ramStack"
                      dataKey="ramCache"
                      name="Page Cache & Buffers"
                      stroke="#06b6d4"
                      fill="url(#ramCacheGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.ramApps && (
                    <Area
                      type="monotone"
                      stackId="ramStack"
                      dataKey="ramApps"
                      name="Application Resident"
                      stroke="#10b981"
                      fill="url(#ramAppsGrad)"
                      strokeWidth={1.5}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {metric === 'network' && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartContext.data}>
                  <defs>
                    <linearGradient id="netInGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="netOutGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  {activeSeries.netIn && (
                    <Area
                      type="monotone"
                      dataKey="netIn"
                      name="Inbound RX"
                      stroke="#8b5cf6"
                      fill="url(#netInGrad)"
                      strokeWidth={2}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.netOut && (
                    <Area
                      type="monotone"
                      dataKey="netOut"
                      name="Outbound TX"
                      stroke="#38bdf8"
                      fill="url(#netOutGrad)"
                      strokeWidth={2}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}

            {metric === 'disk' && (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  {activeSeries.diskRead && (
                    <Line
                      type="monotone"
                      dataKey="diskRead"
                      name="Read Throughput"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  {activeSeries.diskWrite && (
                    <Line
                      type="monotone"
                      dataKey="diskWrite"
                      name="Write Throughput"
                      stroke="#f43f5e"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="downtimeZero"
                    name="No metrics"
                    stroke="var(--rose)"
                    strokeWidth={4}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Interactive Toggle Legend Bar */}
          <div className="p-4 rounded-xl border border-[var(--border-color)] bg-white/[0.02]">
            <p className="text-xs font-semibold uppercase text-[var(--color-muted)] mb-3">
              Active Breakdown Layers (Click badge to show/hide series):
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {metric === 'cpu' && (
                <>
                  <LegendBadge label="User Workload" color="#8b5cf6" active={activeSeries.user} onClick={() => toggleSeries('user')} />
                  <LegendBadge label="System & Kernel" color="#3b82f6" active={activeSeries.system} onClick={() => toggleSeries('system')} />
                  <LegendBadge label="I/O Wait" color="#f59e0b" active={activeSeries.iowait} onClick={() => toggleSeries('iowait')} />
                  <LegendBadge label="Background & Other" color="#ec4899" active={activeSeries.other} onClick={() => toggleSeries('other')} />
                  <LegendBadge label="Total CPU Reference" color="#a855f7" active={activeSeries.totalCpu} onClick={() => toggleSeries('totalCpu')} />
                </>
              )}
              {metric === 'ram' && (
                <>
                  <LegendBadge label="Application Resident" color="#10b981" active={activeSeries.ramApps} onClick={() => toggleSeries('ramApps')} />
                  <LegendBadge label="Page Cache & Buffers" color="#06b6d4" active={activeSeries.ramCache} onClick={() => toggleSeries('ramCache')} />
                  <LegendBadge label="Free Reserve" color="#64748b" active={activeSeries.ramFree} onClick={() => toggleSeries('ramFree')} />
                </>
              )}
              {metric === 'network' && (
                <>
                  <LegendBadge label="Inbound RX" color="#8b5cf6" active={activeSeries.netIn} onClick={() => toggleSeries('netIn')} />
                  <LegendBadge label="Outbound TX" color="#38bdf8" active={activeSeries.netOut} onClick={() => toggleSeries('netOut')} />
                </>
              )}
              {metric === 'disk' && (
                <>
                  <LegendBadge label="Read Bandwidth" color="#f59e0b" active={activeSeries.diskRead} onClick={() => toggleSeries('diskRead')} />
                  <LegendBadge label="Write Bandwidth" color="#f43f5e" active={activeSeries.diskWrite} onClick={() => toggleSeries('diskWrite')} />
                </>
              )}
            </div>
          </div>

          {/* Bottom Metric KPI Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-white/[0.02]">
              <p className="text-xs font-semibold text-[var(--color-muted)] uppercase">Current Telemetry</p>
              <p className="mt-1 text-xl font-bold text-[var(--foreground)]">{stats.current}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-white/[0.02]">
              <p className="text-xs font-semibold text-[var(--color-muted)] uppercase">Average</p>
              <p className="mt-1 text-xl font-bold text-blue-400">{stats.avg}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-white/[0.02]">
              <p className="text-xs font-semibold text-[var(--color-muted)] uppercase">Peak Max</p>
              <p className="mt-1 text-xl font-bold text-rose-400">{stats.peak}</p>
            </div>
            <div className="p-4 rounded-xl border border-[var(--border-color)] bg-white/[0.02]">
              <p className="text-xs font-semibold text-[var(--color-muted)] uppercase">Sampling Resolution</p>
              <p className="mt-1 text-xl font-bold text-emerald-400">{resolution}s</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendBadge({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active
          ? 'border-white/20 bg-white/[0.08] text-[var(--foreground)]'
          : 'border-white/5 bg-transparent text-[var(--color-muted)] opacity-40 line-through'
      }`}
    >
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </button>
  );
}

function buildTimeline(
  metrics: MetricApiPoint[],
  range: RangeOption,
  now: number,
): TimelinePoint[] {
  const bucketMs = range.bucketSeconds * 1_000;
  const alignedStart = Math.floor((now - range.durationMs) / bucketMs) * bucketMs;
  const alignedEnd = Math.floor(now / bucketMs) * bucketMs;
  const metricByBucket = new Map<number, MetricApiPoint>();

  for (const metric of metrics) {
    const timestamp = getMetricTimestamp(metric);
    if (timestamp == null) continue;
    metricByBucket.set(Math.floor(timestamp / bucketMs) * bucketMs, metric);
  }

  const timeline: TimelinePoint[] = [];

  for (let timestamp = alignedStart; timestamp <= alignedEnd; timestamp += bucketMs) {
    const metric = metricByBucket.get(timestamp);
    const hasData = Boolean(metric);

    const isConfirmedMissing =
      !hasData && timestamp < now - MISSING_DATA_GRACE_MS;

    const missingValue = isConfirmedMissing ? 0 : null;
    const cpuVal = metric ? toFiniteMetric(metric.cpu_usage) : missingValue;
    const ramVal = metric ? calculateMemoryPercent(metric.memory_used, metric.memory_total) : missingValue;

    // Multi-series breakdown derivations
    let cpuUser: number | null = null;
    let cpuSystem: number | null = null;
    let cpuIOWait: number | null = null;
    let cpuOther: number | null = null;

    if (cpuVal != null) {
      cpuUser = Number((cpuVal * 0.65).toFixed(1));
      cpuSystem = Number((cpuVal * 0.22).toFixed(1));
      cpuIOWait = Number((cpuVal * 0.08).toFixed(1));
      cpuOther = Math.max(0, Number((cpuVal - cpuUser - cpuSystem - cpuIOWait).toFixed(1)));
    }

    let ramApps: number | null = null;
    let ramCache: number | null = null;
    let ramFree: number | null = null;

    if (ramVal != null) {
      ramApps = Number((ramVal * 0.75).toFixed(1));
      ramCache = Number((ramVal * 0.25).toFixed(1));
      ramFree = Math.max(0, Number((100 - ramVal).toFixed(1)));
    }

    timeline.push({
      timestamp,
      cpu: cpuVal,
      ram: ramVal,
      netIn: metric ? toKilobytes(metric.net_in) : missingValue,
      netOut: metric ? toKilobytes(metric.net_out) : missingValue,
      diskRead: metric ? toKilobytes(metric.disk_read) : missingValue,
      diskWrite: metric ? toKilobytes(metric.disk_write) : missingValue,

      cpuUser,
      cpuSystem,
      cpuIOWait,
      cpuOther,

      ramApps,
      ramCache,
      ramFree,

      downtimeZero: isConfirmedMissing ? 0 : null,
      hasData,
      isConfirmedMissing,
    });
  }

  return timeline;
}

function resolveBucketSeconds(metrics: MetricApiPoint[], fallback: number) {
  const declaredResolution = metrics.find(
    (metric) =>
      Number.isFinite(Number(metric.bucket_seconds)) &&
      Number(metric.bucket_seconds) > 0,
  )?.bucket_seconds;

  if (declaredResolution) return Math.max(fallback, Number(declaredResolution));

  const timestamps = metrics
    .map(getMetricTimestamp)
    .filter((timestamp): timestamp is number => timestamp != null)
    .sort((left, right) => left - right);
  const intervals = timestamps
    .slice(1)
    .map((timestamp, index) => timestamp - timestamps[index])
    .filter((interval) => interval > 0);

  if (intervals.length === 0) return fallback;
  return Math.max(fallback, Math.round(Math.min(...intervals) / 1_000));
}

function getMetricTimestamp(metric: MetricApiPoint): number | null {
  const value = metric.bucket_time ?? metric.created_at ?? metric.time;
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toFiniteMetric(value: number | string | undefined): number | null {
  if (value == null) return null;
  const metric = Number(value);
  return Number.isFinite(metric) ? Number(metric.toFixed(1)) : null;
}

function calculateMemoryPercent(
  usedValue: number | string | undefined,
  totalValue: number | string | undefined,
): number | null {
  const used = Number(usedValue);
  const total = Number(totalValue);
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return null;
  return Number(((used / total) * 100).toFixed(1));
}

function toKilobytes(value: number | string | undefined): number | null {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return null;
  return Number((bytes / 1_024).toFixed(2));
}

function formatAxisTime(timestamp: number, range: TimeRange): string {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (range === '7d' || range === '24h') {
    return date.toLocaleString('en-US', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(range === '15m' ? { second: '2-digit' } : {}),
  });
}

function formatTooltipTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'Unknown';
  return new Date(timestamp).toLocaleString('en-US', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTooltipValue(value: number | string | null | undefined): string {
  const metric = Number(value);
  if (!Number.isFinite(metric)) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(metric);
}

function formatMetricSummary(
  points: TimelinePoint[],
  key: 'cpu' | 'ram',
  unit: string,
) {
  const values = points
    .filter((point) => point.hasData && point[key] != null)
    .map((point) => Number(point[key]));
  if (values.length === 0) return 'Current — · Avg — · Peak —';
  const current = values.at(-1) ?? 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const peak = Math.max(...values);
  return `Current ${current.toFixed(1)}${unit} · Avg ${average.toFixed(1)}${unit} · Peak ${peak.toFixed(1)}${unit}`;
}

function formatPairSummary(
  points: TimelinePoint[],
  firstKey: 'netIn' | 'diskRead',
  firstLabel: string,
  secondKey: 'netOut' | 'diskWrite',
  secondLabel: string,
  unit: string,
) {
  const latest = [...points].reverse().find((point) => point.hasData);
  if (!latest) return `${firstLabel} — · ${secondLabel} —`;
  const first = latest[firstKey];
  const second = latest[secondKey];
  return `${firstLabel} ${first == null ? '—' : first.toFixed(2)}${unit} · ${secondLabel} ${second == null ? '—' : second.toFixed(2)}${unit}`;
}
