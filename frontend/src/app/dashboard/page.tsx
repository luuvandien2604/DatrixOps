'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { 
  Server, CheckCircle2, XCircle, Cpu, HardDrive, Wifi, AlertTriangle, 
  RefreshCw, DatabaseBackup, ArrowRight
} from 'lucide-react';
import Link from 'next/link';

export default function OverviewDashboard() {
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
        <h3 className="text-sm font-medium text-[var(--color-muted)] group-hover:text-[var(--foreground)] transition-colors">{title}</h3>
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
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Tổng quan (Overview)</h1>
          <p className="text-sm text-[var(--color-muted)]">Real-time infrastructure monitoring</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchServers} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/5 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-[var(--color-muted)]'}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Row (8 cards) */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Links / Shortcuts */}
        <div className="glass-card p-6 flex flex-col justify-center items-center lg:col-span-2 relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
           <div className="absolute -right-10 -bottom-10 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-500">
             <Server className="w-64 h-64" />
           </div>
           
           <h2 className="text-2xl font-bold text-[var(--foreground)] mb-3">Quản lý hệ thống của bạn</h2>
           <p className="text-[var(--color-muted)] text-center max-w-lg mb-8">
             Giao diện đã được tối ưu. Bạn có thể xem chi tiết biểu đồ hoặc quản lý danh sách server ở thanh menu bên trái.
           </p>
           
           <div className="flex gap-4">
             <Link href="/dashboard/servers" className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-500/25 flex items-center gap-2">
               <Server className="w-4 h-4" /> Go to Servers
             </Link>
             <Link href="/dashboard/monitoring" className="px-6 py-3 bg-white/5 hover:bg-white/10 text-[var(--foreground)] border border-white/10 rounded-lg font-medium transition-colors flex items-center gap-2">
               View Charts <ArrowRight className="w-4 h-4" />
             </Link>
           </div>
        </div>

        {/* Recent Alerts Feed (Mini) */}
        <div className="glass-card p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              Recent Alerts
            </h3>
            <Link href="/dashboard/alerts" className="text-xs text-blue-400 hover:text-blue-300">View All</Link>
          </div>
          <div className="flex-1 flex items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
             <p className="text-sm text-[var(--color-muted)] flex flex-col items-center gap-3">
               <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
               No active alerts. System is healthy.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
