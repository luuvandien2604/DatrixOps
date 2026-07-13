'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { 
  Server, CheckCircle2, XCircle, Cpu, HardDrive, Wifi, AlertTriangle, 
  RefreshCw, TerminalSquare, FileText, UploadCloud, DatabaseBackup, ArrowUpRight, Play
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar
} from 'recharts';

// Mock Data for Charts
const mockChartData = Array.from({ length: 24 }, (_, i) => ({
  time: `${i}:00`,
  cpu: Math.floor(Math.random() * 40) + 20, // 20-60%
  ram: Math.floor(Math.random() * 30) + 40, // 40-70%
  netIn: Math.floor(Math.random() * 50) + 10,
  netOut: Math.floor(Math.random() * 40) + 5,
  diskRead: Math.floor(Math.random() * 100),
  diskWrite: Math.floor(Math.random() * 80),
}));

export default function MonitoringDashboard() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const data = await apiClient('/servers');
      setServers(data);
    } catch (err: any) {
      if (err.message.includes('token') || err.message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const totalServers = servers.length;
  const onlineServers = servers.filter(s => s.status === 'online').length;
  const offlineServers = totalServers - onlineServers;

  // KPI Card Component
  const KPICard = ({ title, value, icon: Icon, colorClass, subtitle }: any) => (
    <div className="glass-card p-5 group hover:-translate-y-1 transition-all duration-300">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-sm font-medium text-[var(--color-muted)] group-hover:text-white transition-colors">{title}</h3>
        <div className={`p-2 rounded-lg ${colorClass} bg-opacity-10`}>
          <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
      </div>
      <div className="flex items-end gap-2">
        <h2 className="text-2xl font-bold font-mono tracking-tight">{value}</h2>
        {subtitle && <span className="text-xs text-[var(--color-muted)] mb-1">{subtitle}</span>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Overview</h1>
          <p className="text-sm text-[var(--color-muted)]">Real-time infrastructure monitoring</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchServers} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/5 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-gray-400'}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* 1. KPI Row (8 cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-4">
        <KPICard title="Total Servers" value={totalServers} icon={Server} colorClass="bg-blue-500" />
        <KPICard title="Online" value={onlineServers} icon={CheckCircle2} colorClass="bg-emerald-500" />
        <KPICard title="Offline" value={offlineServers} icon={XCircle} colorClass="bg-gray-500" />
        <KPICard title="Avg CPU" value="34%" icon={Cpu} colorClass="bg-amber-500" />
        <KPICard title="Avg Memory" value="52%" icon={DatabaseBackup} colorClass="bg-blue-400" />
        <KPICard title="Avg Disk" value="48%" icon={HardDrive} colorClass="bg-indigo-500" />
        <KPICard title="Network" value="2.4" subtitle="Gbps" icon={Wifi} colorClass="bg-purple-500" />
        <KPICard title="Alerts" value="0" icon={AlertTriangle} colorClass="bg-emerald-500" />
      </div>

      {/* 2. Bento Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CPU Line Chart (Chiếm 2 cột) */}
        <div className="glass-card p-6 lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              CPU Usage Trend (24h)
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0B0F14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px' }}
                  itemStyle={{ color: '#E6EAF0' }}
                />
                <Line type="monotone" dataKey="cpu" stroke="#3B82F6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: '#3B82F6', stroke: '#0B0F14', strokeWidth: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Area Chart */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <DatabaseBackup className="w-5 h-5 text-emerald-400" />
              Memory Usage
            </h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockChartData}>
                <defs>
                  <linearGradient id="colorRam" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                <Area type="monotone" dataKey="ram" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorRam)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        
        {/* Network Throughput */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Wifi className="w-5 h-5 text-purple-400" />
              Network Throughput
            </h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                <Bar dataKey="netIn" stackId="a" fill="#8B5CF6" radius={[0, 0, 4, 4]} />
                <Bar dataKey="netOut" stackId="a" fill="#C084FC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Disk I/O */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              Disk I/O
            </h3>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="time" stroke="#8B96A5" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0B0F14', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '10px' }} />
                <Line type="monotone" dataKey="diskRead" stroke="#F59E0B" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="diskWrite" stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Alerts Feed */}
        <div className="glass-card p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Recent Alerts
            </h3>
            <button className="text-xs text-blue-400 hover:text-blue-300">View All</button>
          </div>
          <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 rounded-xl">
             <p className="text-sm text-[var(--color-muted)]">No active alerts. System is healthy.</p>
          </div>
        </div>
      </div>

      {/* 3. Server Status Table */}
      <div className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h3 className="font-semibold text-white text-lg">Server Status</h3>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20">
            + Add Server
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Server</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">IP Address</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">OS / Spec</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">CPU</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">RAM</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {servers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--color-muted)]">
                    No servers found. Add your first server to start monitoring.
                  </td>
                </tr>
              ) : (
                servers.map((server) => {
                  let osInfo = null;
                  try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) {}
                  
                  const isCritical = osInfo && osInfo.cpu_usage > 90;

                  return (
                    <tr key={server.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-6">
                        <div className="font-medium text-white">{server.name}</div>
                        <div className="text-xs text-[var(--color-muted)] font-mono mt-1">ID: {server.id.substring(0,8)}...</div>
                      </td>
                      <td className="py-4 px-6 font-mono text-sm text-gray-300">
                        {server.ip_address || '—'}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="text-gray-300">{osInfo ? osInfo.os_name : 'Unknown'}</div>
                        <div className="text-xs text-[var(--color-muted)] mt-1">{osInfo ? `${osInfo.cpu_cores} Cores` : '—'}</div>
                      </td>
                      <td className="py-4 px-6">
                        {osInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{osInfo.cpu_usage.toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full ${osInfo.cpu_usage > 90 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(osInfo.cpu_usage, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]">—</span>}
                      </td>
                      <td className="py-4 px-6">
                        {osInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{((osInfo.memory_used/osInfo.memory_total)*100).toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${Math.min((osInfo.memory_used/osInfo.memory_total)*100, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]">—</span>}
                      </td>
                      <td className="py-4 px-6">
                        <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          server.status === 'online' 
                            ? isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            server.status === 'online' ? (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-500'
                          }`}></div>
                          {server.status === 'online' ? (isCritical ? 'CRITICAL' : 'ONLINE') : 'OFFLINE'}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-gray-400 hover:text-white transition-colors" title="SSH">
                            <TerminalSquare className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-gray-400 hover:text-white transition-colors" title="View Logs">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors" title="Restart">
                            <Play className="w-4 h-4 rotate-180" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
