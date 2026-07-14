'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { Cpu, HardDrive, Wifi, DatabaseBackup, Server as ServerIcon, RefreshCw } from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

export default function MonitoringPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string>('');
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
      if (err.message.includes('token') || err.message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    }
  };

  // 2. Fetch metrics when selectedServerId changes or periodically
  useEffect(() => {
    if (!selectedServerId) return;

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [selectedServerId]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await apiClient(`/servers/${selectedServerId}/metrics`);
      
      // Format data for charts
      const formatted = data.map((m: any) => {
        const time = new Date(m.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return {
          time,
          cpu: Number(m.cpu_usage.toFixed(1)),
          ram: m.memory_total > 0 ? Number(((m.memory_used / m.memory_total) * 100).toFixed(1)) : 0,
          netIn: m.net_in / 1024, // KB/s
          netOut: m.net_out / 1024, // KB/s
          diskRead: m.disk_read / 1024, // KB/s
          diskWrite: m.disk_write / 1024, // KB/s
        };
      });
      setMetrics(formatted);
    } catch (err) {
      console.error("Failed to fetch metrics", err);
    } finally {
      setLoading(false);
    }
  };

  const selectedServerName = servers.find(s => s.id === selectedServerId)?.name || 'Unknown Server';

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
          
          <button onClick={fetchMetrics} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-colors text-[var(--color-muted)]" title="Làm mới">
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
              <span className="text-xs text-[var(--color-muted)]">Last 100 ticks</span>
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
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
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
