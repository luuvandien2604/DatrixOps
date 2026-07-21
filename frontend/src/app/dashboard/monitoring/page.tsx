'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, ChevronDown, CircleAlert, Clock3, Cpu, DatabaseBackup,
  HardDrive, RefreshCw, Server as ServerIcon, Wifi,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiClient } from '@/lib/apiClient';

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
  hasData: boolean;
  isConfirmedMissing: boolean;
};

type MissingInterval = {
  start: number;
  end: number;
};

type GapAnalysis = {
  intervals: MissingInterval[];
  sustainedMissingTimestamps: Set<number>;
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

const POLL_INTERVAL_MS = 5_000;
const TIMELINE_TICK_MS = 1_000;
const MISSING_DATA_GRACE_MS = 25_000;

// Keep this resolution synchronized with ListMetrics in the backend.
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
  const activeMetricsRequest = useRef<AbortController | null>(null);
  const router = useRouter();

  const fetchServers = useCallback(async () => {
    try {
      const data = await apiClient('/servers');
      const nextServers = Array.isArray(data) ? data as MonitoringServer[] : [];
      setServers(nextServers);
      setSelectedServerId((current) => {
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
    const interval = window.setInterval(() => void fetchServers(), 10_000);
    return () => window.clearInterval(interval);
  }, [fetchServers]);

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
  const gapAnalysis = useMemo(
    () => analyzeTimelineGaps(timeline, effectiveBucketSeconds * 1_000, now),
    [effectiveBucketSeconds, now, timeline],
  );
  const chartTimeline = useMemo(
    () => timeline.filter(
      (point) =>
        point.hasData ||
        !point.isConfirmedMissing ||
        gapAnalysis.sustainedMissingTimestamps.has(point.timestamp),
    ),
    [gapAnalysis.sustainedMissingTimestamps, timeline],
  );
  const selectedServer = servers.find((server) => server.id === selectedServerId);
  const serverOnline = selectedServer?.status === 'online';
  const dataPoints = timeline.reduce((total, point) => total + (point.hasData ? 1 : 0), 0);
  const xDomain: [number, number] = [now - rangeConfig.durationMs, now];
  const chartContext = {
    data: chartTimeline,
    domain: xDomain,
    range: timeRange,
    missingIntervals: gapAnalysis.intervals,
  };

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="panel-kicker mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5" />
            Continuous telemetry
          </p>
          <h1>Resource <em>monitoring.</em></h1>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            The timeline keeps moving while an agent is offline, with every telemetry gap clearly preserved.
          </p>
        </div>

        <div className="monitoring-toolbar">
          <div className="monitoring-control monitoring-server-control">
            <ServerIcon className="monitoring-control-icon" aria-hidden="true" />
            <label htmlFor="monitoring-server" className="sr-only">Select server</label>
            <select
              id="monitoring-server"
              name="monitoring-server"
              value={selectedServerId}
              onChange={(event) => setSelectedServerId(event.target.value)}
              className="monitoring-server-select"
            >
              {servers.length === 0 && <option value="">No servers available</option>}
              {servers.map((server) => (
                <option key={server.id} value={server.id}>{server.name}</option>
              ))}
            </select>
            <ChevronDown className="monitoring-control-chevron" aria-hidden="true" />
          </div>

          {selectedServer && (
            <span className={`monitoring-server-status ${serverOnline ? 'is-online' : 'is-offline'}`}>
              <span className={`status-dot ${serverOnline ? 'online' : 'offline'}`} />
              {serverOnline ? 'Online' : 'Offline'}
            </span>
          )}

          <div className="monitoring-control monitoring-range-control">
            <Clock3 className="monitoring-control-icon" aria-hidden="true" />
            <label htmlFor="monitoring-range" className="sr-only">Select time range</label>
            <select
              id="monitoring-range"
              name="monitoring-range"
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              className="monitoring-range-select"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="monitoring-control-chevron" aria-hidden="true" />
          </div>

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
        <div className="glass-card p-12 text-center">
          <ServerIcon className="mx-auto mb-4 h-10 w-10 text-[var(--color-muted)] opacity-45" />
          <h2 className="text-xl">No servers to monitor</h2>
          <p className="mt-2 text-[var(--color-muted)]">Connect a DatrixOps Agent to start receiving metrics.</p>
        </div>
      ) : (
        <>
          {!initialLoading && metricsLoaded && dataPoints === 0 && (
            <div className="monitoring-empty-notice">
              <CircleAlert className="h-4 w-4" />
              No metrics were received in this range. The timeline remains live and every missing interval is highlighted.
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <MetricChartCard
              title="CPU Usage (%)"
              icon={<Cpu className="h-5 w-5 text-[var(--violet)]" />}
              rangeLabel={rangeConfig.label}
              loading={initialLoading}
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
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Memory Usage (%)"
              icon={<DatabaseBackup className="h-5 w-5 text-[var(--mint)]" />}
              rangeLabel={rangeConfig.label}
              loading={initialLoading}
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
                </AreaChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Network Throughput (KB/s)"
              icon={<Wifi className="h-5 w-5 text-[var(--sky)]" />}
              rangeLabel={rangeConfig.label}
              loading={initialLoading}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  <Line type="monotone" dataKey="netIn" name="Receive" stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="netOut" name="Send" stroke="var(--sky)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>

            <MetricChartCard
              title="Disk I/O (KB/s)"
              icon={<HardDrive className="h-5 w-5 text-[var(--amber)]" />}
              rangeLabel={rangeConfig.label}
              loading={initialLoading}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartContext.data}>
                  <ChartScaffolding {...chartContext} />
                  <Tooltip content={<MetricsTooltip />} />
                  <Line type="monotone" dataKey="diskRead" name="Read" stroke="var(--amber)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="diskWrite" name="Write" stroke="var(--rose)" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </MetricChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function MetricChartCard({
  title,
  icon,
  rangeLabel,
  loading,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  rangeLabel: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-card monitoring-chart-card p-5 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        <span className="text-xs text-[var(--color-muted)]">{rangeLabel}</span>
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
  missingIntervals,
  percentAxis = false,
  fixedPercentDomain = false,
}: {
  data: TimelinePoint[];
  domain: [number, number];
  range: TimeRange;
  missingIntervals: MissingInterval[];
  percentAxis?: boolean;
  fixedPercentDomain?: boolean;
}) {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
      {missingIntervals.map((interval) => (
        <ReferenceArea
          key={`${interval.start}-${interval.end}`}
          x1={interval.start}
          x2={interval.end}
          fill="var(--rose)"
          fillOpacity={0.055}
          strokeOpacity={0}
          ifOverflow="hidden"
        />
      ))}
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
        tickFormatter={(value) => percentAxis ? `${value}%` : formatCompactNumber(Number(value))}
        domain={fixedPercentDomain ? [0, 100] : percentAxis ? [0, 'auto'] : [0, 'auto']}
      />
    </>
  );
}

function MetricsTooltip({ active, label, payload }: MetricsTooltipProps) {
  if (!active) return null;
  const timestamp = Number(label);
  const point = payload?.[0]?.payload;
  const visibleItems = (payload ?? []).filter((item) => item.value != null);

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
        </div>
      )}
    </div>
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
    timeline.push({
      timestamp,
      cpu: metric ? toFiniteMetric(metric.cpu_usage) : null,
      ram: metric ? calculateMemoryPercent(metric.memory_used, metric.memory_total) : null,
      netIn: metric ? toKilobytes(metric.net_in) : null,
      netOut: metric ? toKilobytes(metric.net_out) : null,
      diskRead: metric ? toKilobytes(metric.disk_read) : null,
      diskWrite: metric ? toKilobytes(metric.disk_write) : null,
      hasData,
      isConfirmedMissing: !hasData && timestamp < now - MISSING_DATA_GRACE_MS,
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

  // Compatibility for API responses from before bucket_seconds was exposed.
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

function analyzeTimelineGaps(
  timeline: TimelinePoint[],
  bucketMs: number,
  now: number,
): GapAnalysis {
  const intervals: MissingInterval[] = [];
  const sustainedMissingTimestamps = new Set<number>();
  const minimumOfflineGapMs = Math.max(30_000, bucketMs * 3);
  let runStartIndex: number | null = null;

  const commitRun = (endIndex: number, endTimestamp: number) => {
    if (runStartIndex == null) return;
    const startTimestamp = timeline[runStartIndex].timestamp;
    if (endTimestamp - startTimestamp >= minimumOfflineGapMs) {
      intervals.push({ start: startTimestamp, end: endTimestamp });
      for (let index = runStartIndex; index < endIndex; index += 1) {
        sustainedMissingTimestamps.add(timeline[index].timestamp);
      }
    }
    runStartIndex = null;
  };

  timeline.forEach((point, index) => {
    if (point.isConfirmedMissing) {
      if (runStartIndex == null) runStartIndex = index;
      return;
    }
    commitRun(index, point.timestamp);
  });

  if (runStartIndex != null) {
    const endTimestamp = Math.min(now, (timeline.at(-1)?.timestamp ?? now) + bucketMs);
    commitRun(timeline.length, endTimestamp);
  }

  return { intervals, sustainedMissingTimestamps };
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
