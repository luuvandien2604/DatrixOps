'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { Cpu, HardDrive, Wifi, DatabaseBackup, Server as ServerIcon, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

export default function MonitoringPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
  const [timeRange, setTimeRange] = useState<string>('15m');
  const [metrics, setMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // 1. Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const data = await apiClient('/servers');
      setServers(data);
      if (data.length > 0 && !selectedServerId) {
        setSelectedServerId(data[0].id);
      }
    } catch (err: any) {
      if (err.message?.includes('token') || err.message?.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    }
  };

  // 2. Fetch metrics when selectedServerId or timeRange changes or periodically
  useEffect(() => {
    if (!selectedServerId) return;

    fetchMetrics(false); // Lần đầu tiên load có xoay icon
    const interval = setInterval(() => fetchMetrics(true), 5000); // Các lần sau chạy ngầm (không xoay icon)

    return () => clearInterval(interval);
  }, [selectedServerId, timeRange]);

  const BUCKET_SECONDS: Record<string, number> = {
    '15m': 5,
    '1h': 60,
    '3h': 120,
    '6h': 300,
    '12h': 600,
    '24h': 900,
    '7d': 3600,
  };

  const formatTimeLabel = (date: Date) => {
    if (isNaN(date.getTime())) return ''; // Check invalid date
    if (timeRange === '7d' || timeRange === '24h') {
      return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // Thêm cờ isBackground để phân biệt giữa việc người dùng chủ động tải lại vs. tự động chạy ngầm
  const fetchMetrics = async (isBackground = false) => {
    try {
      if (!isBackground) setLoading(true);

      const data = await apiClient(`/servers/${selectedServerId}/metrics?range=${timeRange}`);
      if (!data || !Array.isArray(data)) return;

      const bucketSeconds = BUCKET_SECONDS[timeRange] ?? 5;
      const gapThresholdMs = bucketSeconds * 3 * 1000;

      const formatted: any[] = [];
      data.forEach((m: any, idx: number) => {
        // Fallback an toàn: Có thể backend trả về bucket_time khi downsample thay vì created_at
        const timeField = m.bucket_time || m.created_at || m.time;
        const date = new Date(timeField);

        if (idx > 0) {
          const prevTimeField = data[idx - 1].bucket_time || data[idx - 1].created_at || data[idx - 1].time;
          const prevDate = new Date(prevTimeField);

          if (date.getTime() - prevDate.getTime() > gapThresholdMs) {
            formatted.push({
              time: formatTimeLabel(new Date(prevDate.getTime() + 1000)),
              cpu: null,
              ram: null,
              netIn: null,
              netOut: null,
              diskRead: null,
              diskWrite: null,
            });
          }
        }

        // Bọc Number() an toàn trước khi .toFixed() để chống crash
        formatted.push({
          time: formatTimeLabel(date),
          cpu: m.cpu_usage != null ? Number(Number(m.cpu_usage).toFixed(1)) : null,
          ram: (m.memory_total > 0 && m.memory_used != null) ? Number(((m.memory_used / m.memory_total) * 100).toFixed(1)) : null,
          netIn: m.net_in != null ? m.net_in / 1024 : null,
          netOut: m.net_out != null ? m.net_out / 1024 : null,
          diskRead: m.disk_read != null ? m.disk_read / 1024 : null,
          diskWrite: m.disk_write != null ? m.disk_write / 1024 : null,
        });
      });
      setMetrics(formatted);
    } catch (err) {
      console.error("Failed to fetch metrics", err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const selectedServerName = servers.find(s => s.id === selectedServerId)?.name || 'Unknown Server';

  const timeRangeOptions = [
    { value: '15m', label: 'Last 15 minutes' },
    { value: '1h', label: 'Last 1 hour' },
    { value: '3h', label: 'Last 3 hours' },
    { value: '6h', label: 'Last 6 hours' },
    { value: '12h', label: 'Last 12 hours' },
    { value: '24h', label: 'Last 24 hours' },
    { value: '7d', label: 'Last 7 days' },
  ];

  const selectedTimeRangeLabel = timeRangeOptions.find(o => o.value === timeRange)?.label || 'Last 15 minutes';

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Giám sát tài nguyên</h1>
          <p className="text-sm text-[var(--color-muted)]">Phân tích hiệu năng hệ thống chi tiết qua các biểu đồ thực tế (Live Data)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <ServerIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
            <select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="pl-9 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
            >
              <option value="" disabled>Select a server</option>
              {servers.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="pl-4 pr-8 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
            >
              {timeRangeOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchMetrics(false)}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-colors text-[var(--color-muted)]"
            title="Làm mới"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </div>

      {metrics.length === 0 && !loading && (
        <div className="glass-card p-12 text-center flex flex-col items-center justify-center">
          <DatabaseBackup className="w-12 h-12 text-[var(--color-muted)] mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">Chưa có dữ liệu</h3>
          <p className="text-[var(--color-muted)]">Server này chưa gửi bất kỳ metrics nào về hệ thống. Hãy kiểm tra lại Agent.</p>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU Line Chart */}
          <div className="glass-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-400" />
                CPU Usage (%)
              </h3>
              <span className="text-xs text-[var(--color-muted)]">{selectedTimeRangeLabel}</span>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8B96A5" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 'dataMax + 10']} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}
                    itemStyle={{ color: '#E6EAF0' }}
                  />
                  <Line type="monotone" dataKey="cpu" name="CPU Usage" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3B82F6' }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Memory Area Chart */}
          <div className="glass-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                <DatabaseBackup className="w-5 h-5 text-emerald-400" />
                Memory Usage (%)
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <defs>
                    <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8B96A5" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                  <Area type="monotone" dataKey="ram" name="RAM Usage" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorRam)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Network Throughput */}
          <div className="glass-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Wifi className="w-5 h-5 text-purple-400" />
                Network Throughput (KB/s)
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8B96A5" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                  <Line type="monotone" dataKey="netIn" name="Recv (KB/s)" stroke="#8B5CF6" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="netOut" name="Sent (KB/s)" stroke="#C084FC" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Disk I/O */}
          <div className="glass-card p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-amber-400" />
                Disk I/O (KB/s)
              </h3>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="time" stroke="#8B96A5" fontSize={10} tickLine={false} axisLine={false} minTickGap={30} />
                  <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                  <Line type="monotone" dataKey="diskRead" name="Read (KB/s)" stroke="#F59E0B" strokeWidth={2} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="diskWrite" name="Write (KB/s)" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}