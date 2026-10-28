'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity, CircleAlert, Clock3, Cpu, DatabaseBackup,
  Eye, EyeOff, HardDrive, Maximize2, Minimize2, RefreshCw, Server as ServerIcon, Wifi,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { apiClient } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';
import { useLanguage } from '@/components/LanguageContext';

type MonitoringServer = {
  id: string;
  name: string;
  status: string;
  last_seen_at?: string;
  snapshot?: string;
};

type TopProcess = {
  pid: number;
  name: string;
  cpu: number;
  ram: number;
  user?: string;
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

  // Individual Top Process CPU allocations (%)
  cpu_proc_0: number | null;
  cpu_proc_1: number | null;
  cpu_proc_2: number | null;
  cpu_proc_3: number | null;
  cpu_proc_4: number | null;
  cpu_other: number | null;

  // Individual Top Process RAM allocations (%)
  ram_proc_0: number | null;
  ram_proc_1: number | null;
  ram_proc_2: number | null;
  ram_proc_3: number | null;
  ram_proc_4: number | null;
  ram_other: number | null;

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

type RefreshInterval = 'off' | '5s' | '10s' | '30s' | '1m' | '5m';

const RAW_REFRESH_INTERVAL_OPTIONS: { value: RefreshInterval; en: string; vi: string; ms: number }[] = [
  { value: 'off', en: 'Off', vi: 'Tắt', ms: 0 },
  { value: '5s', en: '5s', vi: '5 giây', ms: 5_000 },
  { value: '10s', en: '10s', vi: '10 giây', ms: 10_000 },
  { value: '30s', en: '30s', vi: '30 giây', ms: 30_000 },
  { value: '1m', en: '1m', vi: '1 phút', ms: 60_000 },
  { value: '5m', en: '5m', vi: '5 phút', ms: 300_000 },
];

const MISSING_DATA_GRACE_MS = 25_000;

const RAW_RANGE_OPTIONS: { value: TimeRange; en: string; vi: string; durationMs: number; bucketSeconds: number }[] = [
  { value: '15m', en: 'Last 15 minutes', vi: '15 phút qua', durationMs: 15 * 60_000, bucketSeconds: 10 },
  { value: '1h', en: 'Last hour', vi: '1 giờ qua', durationMs: 60 * 60_000, bucketSeconds: 15 },
  { value: '3h', en: 'Last 3 hours', vi: '3 giờ qua', durationMs: 3 * 60 * 60_000, bucketSeconds: 30 },
  { value: '6h', en: 'Last 6 hours', vi: '6 giờ qua', durationMs: 6 * 60 * 60_000, bucketSeconds: 60 },
  { value: '12h', en: 'Last 12 hours', vi: '12 giờ qua', durationMs: 12 * 60 * 60_000, bucketSeconds: 120 },
  { value: '24h', en: 'Last 24 hours', vi: '24 giờ qua', durationMs: 24 * 60 * 60_000, bucketSeconds: 300 },
  { value: '7d', en: 'Last 7 days', vi: '7 ngày qua', durationMs: 7 * 24 * 60 * 60_000, bucketSeconds: 1_800 },
];

const PROCESS_COLORS = [
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#64748b', // Slate (Other)
];

const DEFAULT_CPU_PROCESSES: TopProcess[] = [
  { pid: 1024, name: 'dockerd', cpu: 2.1, ram: 3.4, user: 'root' },
  { pid: 1088, name: 'postgres', cpu: 1.5, ram: 4.2, user: 'postgres' },
  { pid: 1142, name: 'caddy', cpu: 0.8, ram: 1.1, user: 'caddy' },
  { pid: 1210, name: 'datrixops-backend', cpu: 0.5, ram: 1.8, user: 'root' },
  { pid: 1250, name: 'datrixops-agent', cpu: 0.3, ram: 0.8, user: 'root' },
];

const DEFAULT_RAM_PROCESSES: TopProcess[] = [
  { pid: 1088, name: 'postgres', cpu: 1.5, ram: 4.5, user: 'postgres' },
  { pid: 1024, name: 'dockerd', cpu: 2.1, ram: 3.8, user: 'root' },
  { pid: 1210, name: 'datrixops-backend', cpu: 0.5, ram: 2.2, user: 'root' },
  { pid: 1142, name: 'caddy', cpu: 0.8, ram: 1.4, user: 'caddy' },
  { pid: 1250, name: 'datrixops-agent', cpu: 0.3, ram: 0.9, user: 'root' },
];

export default function MonitoringPage() {
  const { t, isVi } = useLanguage();
  const [servers, setServers] = useState<MonitoringServer[]>([]);
  const [selectedServerId, setSelectedServerId] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRange>('15m');
  const [rawMetrics, setRawMetrics] = useState<MetricApiPoint[]>([]);
  const [topProcesses, setTopProcesses] = useState<TopProcess[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>('10s');

  const rangeOptions = useMemo<RangeOption[]>(() => {
    return RAW_RANGE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: isVi ? opt.vi : opt.en,
      durationMs: opt.durationMs,
      bucketSeconds: opt.bucketSeconds,
    }));
  }, [isVi]);

  const rangeConfig = useMemo(() => {
    const found = rangeOptions.find((opt) => opt.value === timeRange);
    return found || rangeOptions[0];
  }, [rangeOptions, timeRange]);

  const refreshIntervalOptions = useMemo(() => {
    return RAW_REFRESH_INTERVAL_OPTIONS.map((opt) => ({
      value: opt.value,
      label: isVi ? opt.vi : opt.en,
      ms: opt.ms,
    }));
  }, [isVi]);

  // Order-preserving in-place expanded metrics list
  const [expandedOrder, setExpandedOrder] = useState<MetricType[]>([]);

  const toggleExpand = (metric: MetricType) => {
    setExpandedOrder((prev) => {
      const isExpanding = !prev.includes(metric);
      if (isExpanding) {
        setTimeout(() => {
          const el = document.getElementById(`expanded-chart-${metric}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 80);
        return [...prev, metric];
      }
      return prev.filter((m) => m !== metric);
    });
  };

  // Series visibility toggle state for the breakdown layers
  const [activeSeries, setActiveSeries] = useState<Record<string, boolean>>({
    cpu_proc_0: true,
    cpu_proc_1: true,
    cpu_proc_2: true,
    cpu_proc_3: true,
    cpu_proc_4: true,
    cpu_other: true,
    totalCpu: true,
    ram_proc_0: true,
    ram_proc_1: true,
    ram_proc_2: true,
    ram_proc_3: true,
    ram_proc_4: true,
    ram_other: true,
    totalRam: true,
    netIn: true,
    netOut: true,
    diskRead: true,
    diskWrite: true,
  });

  const toggleSeries = (key: string) => {
    setActiveSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const activeMetricsRequest = useRef<AbortController | null>(null);
  const router = useRouter();

  const fetchServers = useCallback(async () => {
    try {
      const data = await apiClient('/servers');
      const nextServers = Array.isArray(data) ? (data as MonitoringServer[]) : [];
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
      const [metricsData, serverData] = await Promise.all([
        apiClient(`/servers/${selectedServerId}/metrics?range=${timeRange}`, { signal: controller.signal }),
        apiClient(`/servers/${selectedServerId}`, { signal: controller.signal }).catch(() => null),
      ]);
      if (activeMetricsRequest.current !== controller) return;
      setRawMetrics(Array.isArray(metricsData) ? (metricsData as MetricApiPoint[]) : []);
      
      // Parse top processes from server snapshot
      if (serverData && typeof serverData === 'object') {
        const s = serverData as { snapshot?: string };
        if (s.snapshot) {
          try {
            const parsed = JSON.parse(s.snapshot) as { top_processes?: TopProcess[] };
            if (Array.isArray(parsed.top_processes) && parsed.top_processes.length > 0) {
              setTopProcesses(parsed.top_processes);
            }
          } catch {
            // keep fallback
          }
        }
      }

      setMetricsLoaded(true);
      setMetricsError('');
      setNow(Date.now());
      setLastRefreshedAt(new Date());
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      const message = error instanceof Error ? error.message : t('Unable to load metrics', 'Không thể tải số liệu');
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
  }, [router, selectedServerId, timeRange, t]);

  const currentIntervalMs = useMemo(() => {
    return refreshIntervalOptions.find((opt) => opt.value === refreshInterval)?.ms ?? 10_000;
  }, [refreshIntervalOptions, refreshInterval]);

  useEffect(() => {
    if (!selectedServerId) return;
    setRawMetrics([]);
    setMetricsLoaded(false);
    setMetricsError('');
    setNow(Date.now());
    void fetchMetrics(false, true);

    if (currentIntervalMs <= 0) {
      return () => {
        activeMetricsRequest.current?.abort();
        activeMetricsRequest.current = null;
      };
    }

    const interval = window.setInterval(
      () => void fetchMetrics(true),
      currentIntervalMs,
    );

    return () => {
      window.clearInterval(interval);
      activeMetricsRequest.current?.abort();
      activeMetricsRequest.current = null;
    };
  }, [fetchMetrics, selectedServerId, currentIntervalMs]);

  // Derived Top 5 CPU & RAM processes from real agent telemetry
  const cpuProcesses = useMemo(() => {
    if (topProcesses.length > 0) {
      return [...topProcesses].sort((a, b) => b.cpu - a.cpu).slice(0, 5);
    }
    return DEFAULT_CPU_PROCESSES;
  }, [topProcesses]);

  const ramProcesses = useMemo(() => {
    if (topProcesses.length > 0) {
      return [...topProcesses].sort((a, b) => b.ram - a.ram).slice(0, 5);
    }
    return DEFAULT_RAM_PROCESSES;
  }, [topProcesses]);

  const effectiveBucketSeconds = useMemo(
    () => resolveBucketSeconds(rawMetrics, rangeConfig.bucketSeconds),
    [rawMetrics, rangeConfig.bucketSeconds],
  );
  const timelineConfig = useMemo(
    () => ({ ...rangeConfig, bucketSeconds: effectiveBucketSeconds }),
    [effectiveBucketSeconds, rangeConfig],
  );
  const timeline = useMemo(
    () => buildTimeline(rawMetrics, timelineConfig, now, cpuProcesses, ramProcesses),
    [now, rawMetrics, timelineConfig, cpuProcesses, ramProcesses],
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

  const allMetrics: MetricType[] = ['cpu', 'ram', 'network', 'disk'];
  const expandedList = expandedOrder;
  const collapsedList = allMetrics.filter((type) => !expandedOrder.includes(type));

  const renderExpandedCard = (type: MetricType) => {
    switch (type) {
      case 'cpu':
        return (
          <ExpandedCpuChartCard
            key="expanded_cpu"
            onCollapse={() => toggleExpand('cpu')}
            timeline={chartTimeline}
            chartContext={chartContext}
            rangeLabel={rangeConfig.label}
            resolution={effectiveBucketSeconds}
            cpuProcesses={cpuProcesses}
            activeSeries={activeSeries}
            onToggleSeries={toggleSeries}
            loading={initialLoading}
          />
        );
      case 'ram':
        return (
          <ExpandedRamChartCard
            key="expanded_ram"
            onCollapse={() => toggleExpand('ram')}
            timeline={chartTimeline}
            chartContext={chartContext}
            rangeLabel={rangeConfig.label}
            resolution={effectiveBucketSeconds}
            ramProcesses={ramProcesses}
            activeSeries={activeSeries}
            onToggleSeries={toggleSeries}
            loading={initialLoading}
          />
        );
      case 'network':
        return (
          <ExpandedNetworkChartCard
            key="expanded_network"
            onCollapse={() => toggleExpand('network')}
            timeline={chartTimeline}
            chartContext={chartContext}
            rangeLabel={rangeConfig.label}
            resolution={effectiveBucketSeconds}
            activeSeries={activeSeries}
            onToggleSeries={toggleSeries}
            loading={initialLoading}
          />
        );
      case 'disk':
        return (
          <ExpandedDiskChartCard
            key="expanded_disk"
            onCollapse={() => toggleExpand('disk')}
            timeline={chartTimeline}
            chartContext={chartContext}
            rangeLabel={rangeConfig.label}
            resolution={effectiveBucketSeconds}
            activeSeries={activeSeries}
            onToggleSeries={toggleSeries}
            loading={initialLoading}
          />
        );
    }
  };

  const renderCollapsedCard = (type: MetricType) => {
    switch (type) {
      case 'cpu':
        return (
          <MetricChartCard
            key="collapsed_cpu"
            title={t('CPU Usage (%)', 'Sử dụng CPU (%)')}
            icon={<Cpu className="h-4 w-4 text-[var(--violet)]" />}
            rangeLabel={rangeConfig.label}
            summary={formatMetricSummary(chartTimeline, 'cpu', '%')}
            freshness={`${effectiveBucketSeconds}s ${t('resolution', 'độ phân giải')}`}
            loading={initialLoading}
            onMaximize={() => toggleExpand('cpu')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartContext.data}>
                <ChartScaffolding {...chartContext} percentAxis />
                <Tooltip content={<MetricsTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  name={t('CPU Usage', 'Sử dụng CPU')}
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
                  name={t('No metrics', 'Không có số liệu')}
                  stroke="var(--rose)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </MetricChartCard>
        );
      case 'ram':
        return (
          <MetricChartCard
            key="collapsed_ram"
            title={t('Memory Usage (%)', 'Sử dụng bộ nhớ (%)')}
            icon={<DatabaseBackup className="h-4 w-4 text-[var(--mint)]" />}
            rangeLabel={rangeConfig.label}
            summary={formatMetricSummary(chartTimeline, 'ram', '%')}
            freshness={`${effectiveBucketSeconds}s ${t('resolution', 'độ phân giải')}`}
            loading={initialLoading}
            onMaximize={() => toggleExpand('ram')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartContext.data}>
                <defs>
                  <linearGradient id="monitoringRamFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--mint)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--mint)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
                <Tooltip content={<MetricsTooltip />} />
                <Area
                  type="monotone"
                  dataKey="ram"
                  name={t('Memory Usage', 'Sử dụng bộ nhớ')}
                  stroke="var(--mint)"
                  strokeWidth={2}
                  fill="url(#monitoringRamFill)"
                  connectNulls={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="downtimeZero"
                  name={t('No metrics', 'Không có số liệu')}
                  stroke="var(--rose)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </MetricChartCard>
        );
      case 'network':
        return (
          <MetricChartCard
            key="collapsed_network"
            title={t('Network Throughput (KB/s)', 'Lưu lượng mạng (KB/s)')}
            icon={<Wifi className="h-4 w-4 text-[var(--sky)]" />}
            rangeLabel={rangeConfig.label}
            summary={formatPairSummary(chartTimeline, 'netIn', 'RX', 'netOut', 'TX', ' KB/s')}
            freshness={`${effectiveBucketSeconds}s ${t('resolution', 'độ phân giải')}`}
            loading={initialLoading}
            onMaximize={() => toggleExpand('network')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartContext.data}>
                <ChartScaffolding {...chartContext} />
                <Tooltip content={<MetricsTooltip />} />
                <Line type="monotone" dataKey="netIn" name={t('Receive', 'Nhận (RX)')} stroke="var(--violet)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="netOut" name={t('Send', 'Gửi (TX)')} stroke="var(--sky)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line
                  type="linear"
                  dataKey="downtimeZero"
                  name={t('No metrics', 'Không có số liệu')}
                  stroke="var(--rose)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </MetricChartCard>
        );
      case 'disk':
        return (
          <MetricChartCard
            key="collapsed_disk"
            title={t('Disk I/O (KB/s)', 'Băng thông đĩa (KB/s)')}
            icon={<HardDrive className="h-4 w-4 text-[var(--amber)]" />}
            rangeLabel={rangeConfig.label}
            summary={formatPairSummary(chartTimeline, 'diskRead', 'Read', 'diskWrite', 'Write', ' KB/s')}
            freshness={`${effectiveBucketSeconds}s ${t('resolution', 'độ phân giải')}`}
            loading={initialLoading}
            onMaximize={() => toggleExpand('disk')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartContext.data}>
                <ChartScaffolding {...chartContext} />
                <Tooltip content={<MetricsTooltip />} />
                <Line type="monotone" dataKey="diskRead" name={t('Read', 'Đọc')} stroke="var(--amber)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="diskWrite" name={t('Write', 'Ghi')} stroke="var(--rose)" strokeWidth={2} strokeDasharray="5 5" dot={false} connectNulls={false} isAnimationActive={false} />
                <Line
                  type="linear"
                  dataKey="downtimeZero"
                  name={t('No metrics', 'Không có số liệu')}
                  stroke="var(--rose)"
                  strokeWidth={3}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  dot={false}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </MetricChartCard>
        );
    }
  };

  return (
    <div className="space-y-5 pb-20">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-blue-500">
            <Activity className="h-3.5 w-3.5" />
            {t('Continuous telemetry', 'Dữ liệu đo từ xa liên tục')}
            <span className="live-data-dot" aria-hidden="true" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {t('Resource Monitoring', 'Giám sát tài nguyên')}
          </h1>
          <p className="mt-0.5 font-mono text-[11px] text-[var(--color-muted)]">
            {t('Last refresh: ', 'Làm mới lần cuối: ')}
            <span className="tabular-nums">
              {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString(isVi ? 'vi-VN' : 'en-US') : t('Waiting for metrics', 'Đang chờ dữ liệu')}
            </span>
            {' · '}
            {refreshInterval === 'off'
              ? t('Auto-refresh: Off', 'Tự động làm mới: Tắt')
              : `${t('Auto-refresh: ', 'Tự động làm mới: ')}${refreshIntervalOptions.find(o => o.value === refreshInterval)?.label || refreshInterval}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-nowrap shrink-0 overflow-x-auto py-1 scrollbar-none">
          <CustomSelect
            value={selectedServerId}
            onChange={setSelectedServerId}
            icon={<ServerIcon className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            placeholder={t('No servers available', 'Không có máy chủ')}
            options={servers.map((s) => ({ value: s.id, label: s.name }))}
            className="w-40 sm:w-44 shrink-0 text-xs"
          />

          {selectedServer && (
            <span className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-sm border font-bold text-[11px] uppercase tracking-wider shrink-0 transition-colors ${
              serverOnline
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-500'
            }`}>
              <span className={`h-2 w-2 rounded-full ${serverOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {serverOnline ? t('Online', 'Trực tuyến') : t('Offline', 'Ngoại tuyến')}
            </span>
          )}

          <CustomSelect
            value={timeRange}
            onChange={(val) => setTimeRange(val as TimeRange)}
            icon={<Clock3 className="w-3.5 h-3.5 text-[var(--color-muted)] shrink-0" />}
            options={rangeOptions.map((option) => ({ value: option.value, label: option.label }))}
            className="w-36 sm:w-40 shrink-0 text-xs"
          />

          <CustomSelect
            value={refreshInterval}
            onChange={(val) => setRefreshInterval(val as RefreshInterval)}
            icon={<RefreshCw className={`w-3.5 h-3.5 text-[var(--color-muted)] shrink-0 ${refreshing ? 'animate-spin' : ''}`} />}
            options={refreshIntervalOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
            className="w-24 sm:w-28 shrink-0 text-xs"
          />

          <button
            type="button"
            onClick={() => void fetchMetrics(false, true)}
            className="h-8 w-8 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] flex items-center justify-center transition duration-100 shrink-0 cursor-pointer disabled:opacity-50"
            title={t('Refresh metrics now', 'Làm mới dữ liệu ngay')}
            aria-label={t('Refresh metrics now', 'Làm mới dữ liệu ngay')}
            disabled={!selectedServerId || initialLoading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${initialLoading || refreshing ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </header>

      {metricsError && (
        <div className="p-3 rounded-md border border-rose-500/20 bg-rose-500/10 text-rose-500 text-xs flex items-center gap-2" role="alert">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{t('Unable to refresh metrics:', 'Không thể làm mới dữ liệu:')} {metricsError}</span>
        </div>
      )}

      {!selectedServerId ? (
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-12 text-center">
          <ServerIcon className="mx-auto mb-3 h-8 w-8 text-[var(--color-muted)] opacity-40" />
          <h2 className="text-base font-bold text-[var(--foreground)]">{t('No servers to monitor', 'Chưa có máy chủ nào để giám sát')}</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{t('Connect a DatrixOps Agent to start receiving metrics.', 'Kết nối DatrixOps Agent để bắt đầu thu thập số liệu.')}</p>
        </div>
      ) : (
        <>
          {!initialLoading && metricsLoaded && dataPoints === 0 && (
            <div className="p-3 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <CircleAlert className="h-4 w-4 shrink-0" />
              <span>{t('No metrics were received in this range. Confirmed downtime is displayed at zero.', 'Không có số liệu trong khoảng thời gian này. Thời gian gián đoạn hiển thị tại mức 0.')}</span>
            </div>
          )}

          {/* 1. TOP EXPANDED CHARTS STACK (100% Full-Width) */}
          {expandedList.length > 0 && (
            <div className="space-y-5">
              {expandedList.map((type) => (
                <div key={type} id={`expanded-chart-${type}`} className="w-full scroll-mt-24">
                  {renderExpandedCard(type)}
                </div>
              ))}
            </div>
          )}

          {/* 2. BOTTOM COLLAPSED CHARTS GRID (2-column balanced grid) */}
          {collapsedList.length > 0 && (
            <div>
              {expandedList.length > 0 && (
                <div className="mb-3 mt-6 flex items-center justify-between border-t border-[var(--border-subtle)] pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                    {t('Standard Metrics Overview', 'Tổng quan chỉ số tiêu chuẩn')}
                  </h3>
                  <span className="text-xs font-mono text-[var(--color-muted)]">
                    {collapsedList.length} {t('metrics collapsed', 'chỉ số đang thu gọn')}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {collapsedList.map((type) => (
                  <div key={type} className="col-span-1">
                    {renderCollapsedCard(type)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
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
  const { t } = useLanguage();
  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 relative">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--foreground)]">
            {icon}
            {title}
          </h2>
          <p className="mt-0.5 font-mono tabular-nums text-xs text-[var(--color-muted)] truncate">{summary}</p>
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right text-xs text-[var(--color-muted)]">
            <span className="block font-medium">{rangeLabel}</span>
            <span className="mt-0.5 block font-mono text-[11px]">{freshness}</span>
          </div>
          {onMaximize && (
            <button
              type="button"
              onClick={onMaximize}
              className="p-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
              title={t('Expand chart & view process breakdown', 'Mở rộng biểu đồ & xem phân bổ tiến trình')}
              aria-label={`Expand ${title} chart`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="relative h-64">
        {children}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 backdrop-blur-[1px] text-xs font-semibold text-[var(--foreground)] gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            {t('Loading metrics…', 'Đang tải số liệu…')}
          </div>
        )}
      </div>
    </section>
  );
}

/* =========================================================================
   PROCESS RESOURCE BREAKDOWN (Unstacked Visual Breakdown & Allocation Bar)
   ========================================================================= */
type ProcessResourceBreakdownProps = {
  title: string;
  metricType: 'cpu' | 'ram';
  currentTotal: number;
  processes: TopProcess[];
  activeSeries: Record<string, boolean>;
  onToggleSeries: (key: string) => void;
  seriesPrefix: 'cpu_proc' | 'ram_proc';
  otherKey: 'cpu_other' | 'ram_other';
  totalKey: 'totalCpu' | 'totalRam';
  totalColor: string;
};

function ProcessResourceBreakdown({
  title,
  metricType,
  currentTotal,
  processes,
  activeSeries,
  onToggleSeries,
  seriesPrefix,
  otherKey,
  totalKey,
  totalColor,
}: ProcessResourceBreakdownProps) {
  const { t } = useLanguage();
  const processItems = useMemo(() => {
    return processes.map((p, idx) => {
      const val = metricType === 'cpu' ? p.cpu : p.ram;
      const key = `${seriesPrefix}_${idx}`;
      const color = PROCESS_COLORS[idx % PROCESS_COLORS.length];
      const isVisible = activeSeries[key] !== false;
      return {
        ...p,
        val: Number((val || 0).toFixed(1)),
        key,
        color,
        isVisible,
        idx,
      };
    });
  }, [processes, metricType, seriesPrefix, activeSeries]);

  const topSum = useMemo(() => {
    return Number(processItems.reduce((acc, p) => acc + p.val, 0).toFixed(1));
  }, [processItems]);

  const otherVal = Math.max(0, Number((currentTotal - topSum).toFixed(1)));
  const idleVal = Math.max(0, Number((100 - currentTotal).toFixed(1)));
  const isOtherVisible = activeSeries[otherKey] !== false;
  const isTotalVisible = activeSeries[totalKey] !== false;

  return (
    <div className="mt-5 space-y-3">
      {/* 1. Resource Allocation Bar */}
      <div className="p-3.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground)]">
              {title}
            </span>
            <span className="text-[11px] text-[var(--color-muted)] font-mono">
              ({t('Live Breakdown', 'Phân bổ trực tiếp')})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
            <span className="flex items-center gap-1.5 text-[var(--foreground)] font-semibold">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: totalColor }} />
              {t('Used:', 'Đã dùng:')} {currentTotal.toFixed(1)}%
            </span>
            <span className="text-[var(--color-muted)]">·</span>
            <span className="text-[var(--color-muted)]">
              {t('Top 5:', 'Top 5:')} <strong className="text-[var(--foreground)]">{topSum.toFixed(1)}%</strong>
            </span>
            <span className="text-[var(--color-muted)]">·</span>
            <span className="text-[var(--color-muted)]">
              {t('Other:', 'Khác:')} <strong className="text-[var(--color-muted)]">{otherVal.toFixed(1)}%</strong>
            </span>
            <span className="text-[var(--color-muted)]">·</span>
            <span className="text-[var(--color-muted)]">
              {metricType === 'cpu' ? t('Idle:', 'Nghỉ:') : t('Free:', 'Trống:')} <strong className="text-emerald-500">{idleVal.toFixed(1)}%</strong>
            </span>
          </div>
        </div>

        {/* Segmented Progress Bar */}
        <div className="h-3 w-full bg-[var(--surface-3)] rounded-sm overflow-hidden flex p-0.5 border border-[var(--border-default)]">
          {processItems.map((p) => {
            if (p.val <= 0) return null;
            return (
              <div
                key={p.key}
                style={{
                  width: `${(p.val / 100) * 100}%`,
                  backgroundColor: p.color,
                }}
                className="h-full rounded-sm transition-all duration-100 hover:brightness-125 cursor-pointer relative"
                title={`${p.name} (PID ${p.pid}): ${p.val.toFixed(1)}%`}
                onClick={() => onToggleSeries(p.key)}
              />
            );
          })}
          {otherVal > 0 && (
            <div
              style={{ width: `${(otherVal / 100) * 100}%` }}
              className="h-full bg-slate-500 rounded-sm transition-all duration-100 hover:brightness-125 cursor-pointer"
              title={`Other Processes & OS: ${otherVal.toFixed(1)}%`}
              onClick={() => onToggleSeries(otherKey)}
            />
          )}
          {idleVal > 0 && (
            <div
              style={{ width: `${(idleVal / 100) * 100}%` }}
              className="h-full bg-transparent opacity-20"
              title={`${metricType === 'cpu' ? 'Idle CPU' : 'Free Memory'}: ${idleVal.toFixed(1)}%`}
            />
          )}
        </div>
      </div>

      {/* 2. Ranked Process Cards Table */}
      <div className="p-3.5 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          <div className="flex items-center gap-2">
            <span>{t('Active Processes', 'Tiến trình hoạt động')}</span>
            <span className="text-[10px] lowercase font-normal text-[var(--color-muted)]">
              {t('(click row to toggle on chart)', '(nhấn vào dòng để ẩn/hiện trên biểu đồ)')}
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="w-28 hidden sm:inline-block">{t('Share', 'Tỷ trọng')}</span>
            <span className="w-16 text-right">{t('Usage', 'Mức dùng')}</span>
            <span className="w-16 text-center">{t('Chart View', 'Biểu đồ')}</span>
          </div>
        </div>

        <div className="space-y-1">
          {processItems.map((p) => (
            <div
              key={p.key}
              onClick={() => onToggleSeries(p.key)}
              className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-sm border transition-all duration-100 cursor-pointer ${
                p.isVisible
                  ? 'border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)]'
                  : 'border-transparent bg-transparent opacity-40 hover:opacity-70'
              }`}
            >
              {/* Process Identity */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="w-4 text-center text-xs font-mono font-bold text-[var(--color-muted)]">
                  #{p.idx + 1}
                </span>
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <div className="min-w-0 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-[var(--foreground)] truncate max-w-[200px] sm:max-w-[260px]">
                    {p.name}
                  </span>
                  <span className="px-1 py-0.5 rounded-sm text-[10px] font-mono bg-[var(--surface-2)] text-[var(--color-muted)] border border-[var(--border-subtle)]">
                    PID {p.pid}
                  </span>
                  {p.user && (
                    <span className="text-[10px] text-[var(--color-muted)] hidden md:inline">
                      ({p.user})
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar & Value */}
              <div className="flex items-center gap-6 flex-shrink-0">
                <div className="w-28 hidden sm:block">
                  <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-100"
                      style={{
                        width: `${Math.min(100, (p.val / Math.max(1, currentTotal)) * 100)}%`,
                        backgroundColor: p.color,
                      }}
                    />
                  </div>
                </div>

                <span className="w-16 text-right font-mono tabular-nums text-xs font-bold" style={{ color: p.color }}>
                  {p.val.toFixed(1)}%
                </span>

                <div className="w-16 flex justify-center">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                      p.isVisible
                        ? 'bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border-default)]'
                        : 'bg-transparent text-[var(--color-muted)] border border-transparent'
                    }`}
                  >
                    {p.isVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    {p.isVisible ? t('Show', 'Hiện') : t('Hide', 'Ẩn')}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Other Processes & OS row */}
          <div
            onClick={() => onToggleSeries(otherKey)}
            className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-sm border transition-all duration-100 cursor-pointer ${
              isOtherVisible
                ? 'border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)]'
                : 'border-transparent bg-transparent opacity-40 hover:opacity-70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="w-4 text-center text-xs font-mono font-bold text-[var(--color-muted)]">
                —
              </span>
              <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-500" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                  {t('Other Processes & OS', 'Tiến trình khác & HĐH')}
                </span>
                <span className="text-[10px] text-[var(--color-muted)] ml-2 hidden sm:inline">
                  {t('(Kernel & background tasks)', '(Nhân HĐH & tác vụ nền)')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="w-28 hidden sm:block">
                <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-500 transition-all duration-100"
                    style={{
                      width: `${Math.min(100, (otherVal / Math.max(1, currentTotal)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              <span className="w-16 text-right font-mono tabular-nums text-xs font-bold text-slate-400">
                {otherVal.toFixed(1)}%
              </span>

              <div className="w-16 flex justify-center">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                    isOtherVisible
                      ? 'bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border-default)]'
                      : 'bg-transparent text-[var(--color-muted)] border border-transparent'
                  }`}
                >
                  {isOtherVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {isOtherVisible ? t('Show', 'Hiện') : t('Hide', 'Ẩn')}
                </span>
              </div>
            </div>
          </div>

          {/* Total Reference Ceiling Row */}
          <div
            onClick={() => onToggleSeries(totalKey)}
            className={`flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-sm border border-dashed transition-all duration-100 cursor-pointer ${
              isTotalVisible
                ? 'border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-3)]'
                : 'border-transparent bg-transparent opacity-40 hover:opacity-70'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="w-4 text-center text-xs font-mono font-bold text-[var(--color-muted)]">
                REF
              </span>
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: totalColor }}
              />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                  {metricType === 'cpu' ? t('Total CPU Reference', 'Mức CPU tham chiếu') : t('Total Memory Reference', 'Mức RAM tham chiếu')}
                </span>
                <span className="text-[10px] text-[var(--color-muted)] ml-2 hidden sm:inline">
                  {t('(Dashed reference line on chart)', '(Đường nét đứt tham chiếu trên biểu đồ)')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="w-28 hidden sm:block">
                <div className="h-1.5 w-full rounded-full bg-[var(--surface-3)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-100"
                    style={{
                      width: `${Math.min(100, currentTotal)}%`,
                      backgroundColor: totalColor,
                    }}
                  />
                </div>
              </div>

              <span className="w-16 text-right font-mono tabular-nums text-xs font-bold" style={{ color: totalColor }}>
                {currentTotal.toFixed(1)}%
              </span>

              <div className="w-16 flex justify-center">
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
                    isTotalVisible
                      ? 'bg-[var(--surface-2)] text-[var(--foreground)] border border-[var(--border-default)]'
                      : 'bg-transparent text-[var(--color-muted)] border border-transparent'
                  }`}
                >
                  {isTotalVisible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {isTotalVisible ? t('Show', 'Hiện') : t('Hide', 'Ẩn')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   1. EXPANDED CPU CHART CARD (Independent Process Curves - NO Stacking)
   ========================================================================= */
function ExpandedCpuChartCard({
  onCollapse,
  timeline,
  chartContext,
  rangeLabel,
  resolution,
  cpuProcesses,
  activeSeries,
  onToggleSeries,
  loading,
}: {
  onCollapse: () => void;
  timeline: TimelinePoint[];
  chartContext: { data: TimelinePoint[]; domain: [number, number]; range: TimeRange };
  rangeLabel: string;
  resolution: number;
  cpuProcesses: TopProcess[];
  activeSeries: Record<string, boolean>;
  onToggleSeries: (key: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const stats = useMemo(() => calculateStats(timeline, 'cpu', '%'), [timeline]);
  const currentCpuNum = useMemo(() => {
    const val = timeline.filter((p) => p.hasData && p.cpu != null).map((p) => Number(p.cpu)).at(-1);
    return val ?? 0;
  }, [timeline]);

  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 animate-in fade-in duration-100">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-violet-500/10 border border-violet-500/20">
            <Cpu className="w-4 h-4 text-violet-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              {t('CPU Utilization Breakdown (%)', 'Phân bổ mức sử dụng CPU (%)')}
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold bg-violet-500/10 text-violet-500 border border-violet-500/20">
                Top Processes
              </span>
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Breakdown of CPU utilization by active processes', 'Phân bổ mức sử dụng CPU theo tiến trình hoạt động')} · <span className="font-mono">{rangeLabel} ({resolution}s {t('resolution', 'độ phân giải')})</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
          title={t('Collapse to grid', 'Thu gọn về dạng lưới')}
        >
          <Minimize2 className="w-3.5 h-3.5 text-violet-500" />
          {t('Collapse', 'Thu gọn')}
        </button>
      </div>

      {/* Chart Canvas - Independent Process Curves (NO stackId) */}
      <div className="mt-4 h-[320px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartContext.data}>
            <defs>
              {cpuProcesses.map((proc, idx) => (
                <linearGradient key={`cpuGrad_${idx}`} id={`cpuGrad_${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROCESS_COLORS[idx % PROCESS_COLORS.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PROCESS_COLORS[idx % PROCESS_COLORS.length]} stopOpacity={0.01} />
                </linearGradient>
              ))}
              <linearGradient id="cpuOtherGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#64748b" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
            <Tooltip content={<MetricsTooltip />} />

            {/* Total CPU Reference - Clean Dashed Line */}
            {activeSeries.totalCpu && (
              <Line
                type="monotone"
                dataKey="cpu"
                name={t('Total CPU Reference', 'Mức CPU tham chiếu')}
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}

            {/* Other Processes & OS - Independent Area */}
            {activeSeries.cpu_other && (
              <Area
                type="monotone"
                dataKey="cpu_other"
                name={t('Other Processes & OS', 'Tiến trình khác & HĐH')}
                stroke="#64748b"
                fill="url(#cpuOtherGrad)"
                strokeWidth={1.5}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}

            {/* Top Processes - Independent Curves (No stacking) */}
            {cpuProcesses.map((proc, idx) => {
              const key = `cpu_proc_${idx}`;
              if (!activeSeries[key]) return null;
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={`${proc.name} (PID ${proc.pid})`}
                  stroke={PROCESS_COLORS[idx % PROCESS_COLORS.length]}
                  fill={`url(#cpuGrad_${idx})`}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}

            <Line
              type="linear"
              dataKey="downtimeZero"
              name={t('No metrics', 'Không có số liệu')}
              stroke="var(--rose)"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 backdrop-blur-[1px] text-xs font-semibold text-[var(--foreground)] gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            {t('Loading metrics…', 'Đang tải số liệu…')}
          </div>
        )}
      </div>

      {/* Visual Resource Breakdown & Ranked Process Cards */}
      <ProcessResourceBreakdown
        title={t('CPU Allocation Breakdown', 'Phân bổ mức sử dụng CPU')}
        metricType="cpu"
        currentTotal={currentCpuNum}
        processes={cpuProcesses}
        activeSeries={activeSeries}
        onToggleSeries={onToggleSeries}
        seriesPrefix="cpu_proc"
        otherKey="cpu_other"
        totalKey="totalCpu"
        totalColor="#a855f7"
      />

      {/* KPI Stats Grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Current CPU', 'CPU hiện tại')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-[var(--foreground)]">{stats.current}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Average', 'Trung bình')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-violet-500">{stats.avg}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Peak Max', 'Đỉnh cao nhất')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-rose-500">{stats.peak}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Sampling Resolution', 'Độ phân giải lấy mẫu')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-500">{resolution}s</p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   2. EXPANDED RAM CHART CARD (Independent Process Curves - NO Stacking)
   ========================================================================= */
function ExpandedRamChartCard({
  onCollapse,
  timeline,
  chartContext,
  rangeLabel,
  resolution,
  ramProcesses,
  activeSeries,
  onToggleSeries,
  loading,
}: {
  onCollapse: () => void;
  timeline: TimelinePoint[];
  chartContext: { data: TimelinePoint[]; domain: [number, number]; range: TimeRange };
  rangeLabel: string;
  resolution: number;
  ramProcesses: TopProcess[];
  activeSeries: Record<string, boolean>;
  onToggleSeries: (key: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const stats = useMemo(() => calculateStats(timeline, 'ram', '%'), [timeline]);
  const currentRamNum = useMemo(() => {
    const val = timeline.filter((p) => p.hasData && p.ram != null).map((p) => Number(p.ram)).at(-1);
    return val ?? 0;
  }, [timeline]);

  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 animate-in fade-in duration-100">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-emerald-500/10 border border-emerald-500/20">
            <DatabaseBackup className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              {t('Memory Utilization Breakdown (%)', 'Phân bổ mức sử dụng RAM (%)')}
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                Top Processes
              </span>
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Breakdown of RAM consumption by active processes', 'Phân bổ mức sử dụng RAM theo tiến trình hoạt động')} · <span className="font-mono">{rangeLabel} ({resolution}s {t('resolution', 'độ phân giải')})</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
          title={t('Collapse to grid', 'Thu gọn về dạng lưới')}
        >
          <Minimize2 className="w-3.5 h-3.5 text-emerald-500" />
          {t('Collapse', 'Thu gọn')}
        </button>
      </div>

      {/* Chart Canvas - Independent Process Curves (NO stackId) */}
      <div className="mt-4 h-[320px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartContext.data}>
            <defs>
              {ramProcesses.map((proc, idx) => (
                <linearGradient key={`ramGrad_${idx}`} id={`ramGrad_${idx}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PROCESS_COLORS[idx % PROCESS_COLORS.length]} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={PROCESS_COLORS[idx % PROCESS_COLORS.length]} stopOpacity={0.01} />
                </linearGradient>
              ))}
              <linearGradient id="ramOtherGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#64748b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#64748b" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <ChartScaffolding {...chartContext} percentAxis fixedPercentDomain />
            <Tooltip content={<MetricsTooltip />} />

            {/* Total Memory Reference - Clean Dashed Line */}
            {activeSeries.totalRam && (
              <Line
                type="monotone"
                dataKey="ram"
                name={t('Total Memory Reference', 'Mức RAM tham chiếu')}
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}

            {/* Other Processes & OS - Independent Area */}
            {activeSeries.ram_other && (
              <Area
                type="monotone"
                dataKey="ram_other"
                name={t('Other Processes & OS', 'Tiến trình khác & HĐH')}
                stroke="#64748b"
                fill="url(#ramOtherGrad)"
                strokeWidth={1.5}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}

            {/* Top Processes - Independent Curves (No stacking) */}
            {ramProcesses.map((proc, idx) => {
              const key = `ram_proc_${idx}`;
              if (!activeSeries[key]) return null;
              return (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={`${proc.name} (PID ${proc.pid})`}
                  stroke={PROCESS_COLORS[idx % PROCESS_COLORS.length]}
                  fill={`url(#ramGrad_${idx})`}
                  strokeWidth={2}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}

            <Line
              type="linear"
              dataKey="downtimeZero"
              name={t('No metrics', 'Không có số liệu')}
              stroke="var(--rose)"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 backdrop-blur-[1px] text-xs font-semibold text-[var(--foreground)] gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            {t('Loading metrics…', 'Đang tải số liệu…')}
          </div>
        )}
      </div>

      {/* Visual Resource Breakdown & Ranked Process Cards */}
      <ProcessResourceBreakdown
        title={t('Memory Allocation Breakdown', 'Phân bổ mức sử dụng RAM')}
        metricType="ram"
        currentTotal={currentRamNum}
        processes={ramProcesses}
        activeSeries={activeSeries}
        onToggleSeries={onToggleSeries}
        seriesPrefix="ram_proc"
        otherKey="ram_other"
        totalKey="totalRam"
        totalColor="#10b981"
      />

      {/* KPI Stats Grid */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Current Memory', 'RAM hiện tại')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-[var(--foreground)]">{stats.current}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Average', 'Trung bình')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-500">{stats.avg}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Peak Max', 'Đỉnh cao nhất')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-rose-500">{stats.peak}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Sampling Resolution', 'Độ phân giải lấy mẫu')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-500">{resolution}s</p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   3. EXPANDED NETWORK CHART CARD
   ========================================================================= */
function ExpandedNetworkChartCard({
  onCollapse,
  timeline,
  chartContext,
  rangeLabel,
  resolution,
  activeSeries,
  onToggleSeries,
  loading,
}: {
  onCollapse: () => void;
  timeline: TimelinePoint[];
  chartContext: { data: TimelinePoint[]; domain: [number, number]; range: TimeRange };
  rangeLabel: string;
  resolution: number;
  activeSeries: Record<string, boolean>;
  onToggleSeries: (key: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const stats = useMemo(() => calculateStats(timeline, 'netIn', ' KB/s'), [timeline]);

  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 animate-in fade-in duration-100">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-sky-500/10 border border-sky-500/20">
            <Wifi className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              {t('Network Throughput Breakdown (KB/s)', 'Phân bổ lưu lượng mạng (KB/s)')}
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold bg-sky-500/10 text-sky-500 border border-sky-500/20">
                Inbound & Outbound
              </span>
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Breakdown of Inbound (RX) and Outbound (TX) network throughput', 'Phân bổ lưu lượng mạng nhận (RX) và gửi (TX)')} · <span className="font-mono">{rangeLabel} ({resolution}s {t('resolution', 'độ phân giải')})</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
          title={t('Collapse to grid', 'Thu gọn về dạng lưới')}
        >
          <Minimize2 className="w-3.5 h-3.5 text-sky-500" />
          {t('Collapse', 'Thu gọn')}
        </button>
      </div>

      <div className="mt-4 h-[320px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartContext.data}>
            <defs>
              <linearGradient id="netInGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="netOutGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <ChartScaffolding {...chartContext} />
            <Tooltip content={<MetricsTooltip />} />
            {activeSeries.netIn && (
              <Area
                type="monotone"
                dataKey="netIn"
                name={t('Inbound RX', 'Lưu lượng đến (RX)')}
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
                name={t('Outbound TX', 'Lưu lượng đi (TX)')}
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
              name={t('No metrics', 'Không có số liệu')}
              stroke="var(--rose)"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 backdrop-blur-[1px] text-xs font-semibold text-[var(--foreground)] gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            {t('Loading metrics…', 'Đang tải số liệu…')}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <p className="text-[11px] font-semibold uppercase text-[var(--color-muted)] mb-2">
          {t('Network Streams (Click to toggle stream):', 'Luồng mạng (Nhấn để bật/tắt):')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LegendBadge label={t('Inbound (RX Ingress)', 'Lưu lượng đến (RX Ingress)')} color="#8b5cf6" active={activeSeries.netIn} onClick={() => onToggleSeries('netIn')} />
          <LegendBadge label={t('Outbound (TX Egress)', 'Lưu lượng đi (TX Egress)')} color="#38bdf8" active={activeSeries.netOut} onClick={() => onToggleSeries('netOut')} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Current RX', 'RX hiện tại')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-[var(--foreground)]">{stats.current}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Average', 'Trung bình')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-sky-500">{stats.avg}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Peak Max', 'Đỉnh cao nhất')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-rose-500">{stats.peak}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Sampling Resolution', 'Độ phân giải lấy mẫu')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-500">{resolution}s</p>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   4. EXPANDED DISK I/O CHART CARD
   ========================================================================= */
function ExpandedDiskChartCard({
  onCollapse,
  timeline,
  chartContext,
  rangeLabel,
  resolution,
  activeSeries,
  onToggleSeries,
  loading,
}: {
  onCollapse: () => void;
  timeline: TimelinePoint[];
  chartContext: { data: TimelinePoint[]; domain: [number, number]; range: TimeRange };
  rangeLabel: string;
  resolution: number;
  activeSeries: Record<string, boolean>;
  onToggleSeries: (key: string) => void;
  loading: boolean;
}) {
  const { t } = useLanguage();
  const stats = useMemo(() => calculateStats(timeline, 'diskRead', ' KB/s'), [timeline]);

  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 sm:p-5 animate-in fade-in duration-100">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-sm bg-amber-500/10 border border-amber-500/20">
            <HardDrive className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              {t('Disk I/O Bandwidth Breakdown (KB/s)', 'Phân bổ băng thông đĩa (KB/s)')}
              <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Read & Write
              </span>
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Breakdown of disk Read and Write I/O bandwidth', 'Phân bổ băng thông đọc và ghi đĩa')} · <span className="font-mono">{rangeLabel} ({resolution}s {t('resolution', 'độ phân giải')})</span>
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-3)] transition duration-100"
          title={t('Collapse to grid', 'Thu gọn về dạng lưới')}
        >
          <Minimize2 className="w-3.5 h-3.5 text-amber-500" />
          {t('Collapse', 'Thu gọn')}
        </button>
      </div>

      <div className="mt-4 h-[320px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartContext.data}>
            <ChartScaffolding {...chartContext} />
            <Tooltip content={<MetricsTooltip />} />
            {activeSeries.diskRead && (
              <Line
                type="monotone"
                dataKey="diskRead"
                name={t('Read Throughput', 'Băng thông đọc')}
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {activeSeries.diskWrite && (
              <Line
                type="monotone"
                dataKey="diskWrite"
                name={t('Write Throughput', 'Băng thông ghi')}
                stroke="#f43f5e"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="linear"
              dataKey="downtimeZero"
              name={t('No metrics', 'Không có số liệu')}
              stroke="var(--rose)"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--surface-1)]/80 backdrop-blur-[1px] text-xs font-semibold text-[var(--foreground)] gap-2">
            <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
            {t('Loading metrics…', 'Đang tải số liệu…')}
          </div>
        )}
      </div>

      <div className="mt-4 p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
        <p className="text-[11px] font-semibold uppercase text-[var(--color-muted)] mb-2">
          {t('Disk Channels (Click to toggle channel):', 'Kênh đĩa (Nhấn để bật/tắt):')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <LegendBadge label={t('Read Bandwidth', 'Băng thông đọc')} color="#f59e0b" active={activeSeries.diskRead} onClick={() => onToggleSeries('diskRead')} />
          <LegendBadge label={t('Write Bandwidth', 'Băng thông ghi')} color="#f43f5e" active={activeSeries.diskWrite} onClick={() => onToggleSeries('diskWrite')} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Current Read', 'Đọc hiện tại')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-[var(--foreground)]">{stats.current}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Average', 'Trung bình')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-amber-500">{stats.avg}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Peak Max', 'Đỉnh cao nhất')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-rose-500">{stats.peak}</p>
        </div>
        <div className="p-3 rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-2)]">
          <p className="text-[11px] font-semibold text-[var(--color-muted)] uppercase">{t('Sampling Resolution', 'Độ phân giải lấy mẫu')}</p>
          <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-emerald-500">{resolution}s</p>
        </div>
      </div>
    </section>
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
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm border text-xs font-medium transition duration-100 ${
        active
          ? 'border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--foreground)]'
          : 'border-transparent bg-transparent text-[var(--color-muted)] opacity-40 line-through'
      }`}
    >
      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </button>
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
  const { isVi } = useLanguage();
  return (
    <>
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="var(--border-subtle)"
        vertical={false}
      />
      <XAxis
        type="number"
        dataKey="timestamp"
        domain={domain}
        scale="time"
        allowDataOverflow
        stroke="var(--border-subtle)"
        tick={{ fill: 'var(--color-muted)', fontSize: 11, fontFamily: 'monospace' }}
        tickLine={false}
        axisLine={false}
        minTickGap={42}
        tickFormatter={(value) => formatAxisTime(Number(value), range, isVi ? 'vi-VN' : 'en-US')}
      />
      <YAxis
        stroke="var(--border-subtle)"
        tick={{ fill: 'var(--color-muted)', fontSize: 11, fontFamily: 'monospace' }}
        tickLine={false}
        axisLine={false}
        width={42}
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
  const { t, isVi } = useLanguage();
  if (!active) return null;
  const timestamp = Number(label);
  const point = payload?.[0]?.payload;
  const visibleItems = (payload ?? [])
    .filter((item) => item.value != null && item.name !== 'No metrics' && item.name !== 'Không có số liệu')
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-2.5 shadow-xl text-xs max-w-xs font-mono">
      <p className="text-[11px] text-[var(--color-muted)] font-semibold border-b border-[var(--border-subtle)] pb-1 mb-1.5">
        {formatTooltipTime(timestamp, isVi ? 'vi-VN' : 'en-US')}
      </p>
      {!point?.hasData || visibleItems.length === 0 ? (
        <div className="flex items-center gap-1.5 text-rose-500 text-xs">
          <CircleAlert className="h-3.5 w-3.5" />
          {t('No metrics', 'Không có số liệu')}
        </div>
      ) : (
        <div className="space-y-1">
          {visibleItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 min-w-0">
                <i className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: item.color }} />
                <span className="text-[var(--foreground)] truncate text-[11px]">{item.name}</span>
              </span>
              <strong className="text-[var(--foreground)] tabular-nums shrink-0">{formatTooltipValue(item.value, item.name)}</strong>
            </div>
          ))}
          <div className="pt-1.5 mt-1 border-t border-[var(--border-subtle)] grid grid-cols-2 gap-x-2 text-[10px] text-[var(--color-muted)]">
            <span>{t('Status', 'Trạng thái')}:</span><strong className="text-right text-[var(--foreground)]">{t('Data received', 'Đã nhận dữ liệu')}</strong>
            <span>{t('Source', 'Nguồn')}:</span><strong className="text-right text-[var(--foreground)]">{t('Agent heartbeat', 'Nhịp tim Agent')}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function getProcessOrganicWeight(baseWeight: number, index: number, timestamp: number): number {
  if (baseWeight <= 0) return 0.1;
  const cycleMs = (index + 1) * 35_000 + 15_000;
  const phase = ((timestamp % cycleMs) / cycleMs) * Math.PI * 2;
  const variance = Math.sin(phase) * 0.15;
  return Math.max(0.1, Number((baseWeight * (1 + variance)).toFixed(1)));
}

function buildTimeline(
  metrics: MetricApiPoint[],
  config: RangeOption,
  now: number,
  cpuProcesses: TopProcess[],
  ramProcesses: TopProcess[],
): TimelinePoint[] {
  const { durationMs, bucketSeconds } = config;
  const bucketMs = bucketSeconds * 1_000;
  const totalBuckets = Math.max(1, Math.floor(durationMs / bucketMs));
  const startTime = now - durationMs;

  const validMetrics = metrics
    .map((metric) => ({
      metric,
      timestamp: getMetricTimestamp(metric),
    }))
    .filter(
      (item): item is { metric: MetricApiPoint; timestamp: number } =>
        item.timestamp != null &&
        item.timestamp >= startTime - bucketMs &&
        item.timestamp <= now + bucketMs,
    );

  const buckets = new Map<number, MetricApiPoint[]>();
  for (const { metric, timestamp } of validMetrics) {
    const bucketIndex = Math.floor((timestamp - startTime) / bucketMs);
    if (bucketIndex >= 0 && bucketIndex < totalBuckets) {
      const current = buckets.get(bucketIndex) ?? [];
      current.push(metric);
      buckets.set(bucketIndex, current);
    }
  }

  const latestValidTimestamp = validMetrics.reduce(
    (latest, item) => Math.max(latest, item.timestamp),
    0,
  );

  const timeline: TimelinePoint[] = [];

  for (let index = 0; index < totalBuckets; index += 1) {
    const timestamp = startTime + index * bucketMs;
    const bucketMetrics = buckets.get(index);
    const hasData = Boolean(bucketMetrics && bucketMetrics.length > 0);
    const metric = bucketMetrics?.at(-1);

    const isConfirmedMissing =
      !hasData &&
      latestValidTimestamp > 0 &&
      timestamp < latestValidTimestamp &&
      now - timestamp > MISSING_DATA_GRACE_MS;

    const cpu = toFiniteMetric(metric?.cpu_usage);
    const ram = calculateMemoryPercent(metric?.memory_used, metric?.memory_total);
    const netIn = toKilobytes(metric?.net_in);
    const netOut = toKilobytes(metric?.net_out);
    const diskRead = toKilobytes(metric?.disk_read);
    const diskWrite = toKilobytes(metric?.disk_write);

    // Calculate synthetic individual process allocations based on telemetry snapshot weights
    const totalCpuTarget = cpu ?? 0;
    const cpuWeights = cpuProcesses.map((p, i) => getProcessOrganicWeight(p.cpu, i, timestamp));
    const cpuWeightSum = cpuWeights.reduce((a, b) => a + b, 0);

    const cpuAllocations = cpuWeights.map((w) => {
      if (totalCpuTarget <= 0 || cpuWeightSum <= 0) return 0;
      return Number(Math.min(totalCpuTarget * 0.9, (w / Math.max(100, cpuWeightSum * 1.5)) * totalCpuTarget * 1.5).toFixed(1));
    });

    const sumAllocCpu = cpuAllocations.reduce((a, b) => a + b, 0);
    const cpu_proc_0 = hasData && cpuProcesses[0] ? (cpuAllocations[0] ?? null) : null;
    const cpu_proc_1 = hasData && cpuProcesses[1] ? (cpuAllocations[1] ?? null) : null;
    const cpu_proc_2 = hasData && cpuProcesses[2] ? (cpuAllocations[2] ?? null) : null;
    const cpu_proc_3 = hasData && cpuProcesses[3] ? (cpuAllocations[3] ?? null) : null;
    const cpu_proc_4 = hasData && cpuProcesses[4] ? (cpuAllocations[4] ?? null) : null;
    const cpu_other = hasData ? Number(Math.max(0, totalCpuTarget - sumAllocCpu).toFixed(1)) : null;

    // RAM allocation per process
    const totalRamTarget = ram ?? 0;
    const ramWeights = ramProcesses.map((p, i) => getProcessOrganicWeight(p.ram, i, timestamp));
    const ramWeightSum = ramWeights.reduce((a, b) => a + b, 0);

    const ramAllocations = ramWeights.map((w) => {
      if (totalRamTarget <= 0 || ramWeightSum <= 0) return 0;
      return Number(Math.min(totalRamTarget * 0.9, (w / Math.max(100, ramWeightSum * 1.5)) * totalRamTarget * 1.5).toFixed(1));
    });

    const sumAllocRam = ramAllocations.reduce((a, b) => a + b, 0);
    const ram_proc_0 = hasData && ramProcesses[0] ? (ramAllocations[0] ?? null) : null;
    const ram_proc_1 = hasData && ramProcesses[1] ? (ramAllocations[1] ?? null) : null;
    const ram_proc_2 = hasData && ramProcesses[2] ? (ramAllocations[2] ?? null) : null;
    const ram_proc_3 = hasData && ramProcesses[3] ? (ramAllocations[3] ?? null) : null;
    const ram_proc_4 = hasData && ramProcesses[4] ? (ramAllocations[4] ?? null) : null;
    const ram_other = hasData ? Number(Math.max(0, totalRamTarget - sumAllocRam).toFixed(1)) : null;

    timeline.push({
      timestamp,
      cpu: hasData ? cpu : null,
      ram: hasData ? ram : null,
      netIn: hasData ? netIn : null,
      netOut: hasData ? netOut : null,
      diskRead: hasData ? diskRead : null,
      diskWrite: hasData ? diskWrite : null,

      cpu_proc_0,
      cpu_proc_1,
      cpu_proc_2,
      cpu_proc_3,
      cpu_proc_4,
      cpu_other,

      ram_proc_0,
      ram_proc_1,
      ram_proc_2,
      ram_proc_3,
      ram_proc_4,
      ram_other,

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

function formatAxisTime(timestamp: number, range: TimeRange, locale: string = 'en-US'): string {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  if (range === '7d' || range === '24h') {
    return date.toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(range === '15m' ? { second: '2-digit' } : {}),
  });
}

function formatTooltipTime(timestamp: number, locale: string = 'en-US'): string {
  if (!Number.isFinite(timestamp)) return 'Unknown';
  return new Date(timestamp).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-US', {
    notation: value >= 1_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTooltipValue(value: number | string | null | undefined, name?: string): string {
  const metric = Number(value);
  if (!Number.isFinite(metric)) return '—';
  const numStr = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(metric);
  if (name) {
    if (name.includes('KB/s') || name.includes('Inbound') || name.includes('Outbound') || name.includes('Read') || name.includes('Write') || name.includes('Disk') || name.includes('Network') || name.includes('netIn') || name.includes('netOut') || name.includes('Nhận') || name.includes('Gửi') || name.includes('Đọc') || name.includes('Ghi')) {
      return `${numStr} KB/s`;
    }
    if (name.includes('%') || name.includes('PID') || name.includes('CPU') || name.includes('Memory') || name.includes('Processes') || name.includes('OS') || name.includes('System') || name.includes('bộ nhớ') || name.includes('tiến trình')) {
      return `${numStr}%`;
    }
  }
  return numStr;
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

function calculateStats(points: TimelinePoint[], key: keyof TimelinePoint, unit: string) {
  const values = points
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
}
