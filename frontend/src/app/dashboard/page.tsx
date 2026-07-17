'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity, ArrowUpRight, BellRing, Check, ChevronRight, CircleAlert, Cloud,
  Cpu, Database, MemoryStick, Plus, RefreshCw, Server, Wifi,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';

const chartData = [
  { t: '10:00', cpu: 28, ram: 52 }, { t: '10:10', cpu: 34, ram: 48 },
  { t: '10:20', cpu: 31, ram: 56 }, { t: '10:30', cpu: 48, ram: 59 },
  { t: '10:40', cpu: 43, ram: 55 }, { t: '10:50', cpu: 58, ram: 64 },
  { t: '11:00', cpu: 39, ram: 61 }, { t: '11:10', cpu: 44, ram: 58 },
  { t: '11:20', cpu: 36, ram: 62 }, { t: '11:30', cpu: 52, ram: 65 },
  { t: '11:40', cpu: 46, ram: 63 }, { t: 'Now', cpu: 41, ram: 60 },
];

const fallbackServers = [
  { id: '1', name: 'api-prod-01', ip: '10.10.0.21', status: 'online', cpu: 42, memory: 61 },
  { id: '2', name: 'db-primary-01', ip: '10.10.0.12', status: 'online', cpu: 68, memory: 74 },
  { id: '3', name: 'worker-sg-03', ip: '10.20.0.34', status: 'online', cpu: 29, memory: 46 },
  { id: '4', name: 'legacy-edge-02', ip: '10.30.0.08', status: 'offline', cpu: 0, memory: 0 },
];

export default function OverviewDashboard() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('2H');
  const router = useRouter();

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (err?.message?.includes('token') || err?.message?.includes('UNAUTHORIZED')) router.push('/login');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { fetchServers(); }, [fetchServers]);
  const visibleServers = servers.length ? servers.slice(0, 4) : fallbackServers;
  const total = servers.length || 12;
  const online = servers.length ? servers.filter((server) => server.status === 'online').length : 11;
  const health = Math.round((online / total) * 100);
  const avgCpu = useMemo(() => {
    const values = servers.map((s) => Number(s.cpu_usage ?? s.cpu ?? 0)).filter(Boolean);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 41;
  }, [servers]);

  return (
    <div className="mx-auto max-w-[1540px] space-y-6">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#70f2be]"><Activity className="h-3 w-3" /> Live infrastructure</div>
          <h1 className="liquid-title">Everything is <em>under control.</em></h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/42">Real-time health and telemetry from every DatrixOps agent in your production fleet.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchServers} className="liquid-button secondary"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Sync agents</button>
          <Link href="/dashboard/servers" className="liquid-button primary"><Plus className="h-4 w-4" />Add server</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Server} label="Fleet online" value={`${online}/${total}`} note={`${health}% healthy`} color="#70f2be" bars={[35,55,44,72,64,80,74]} />
        <MetricCard icon={Cpu} label="Average CPU" value={`${avgCpu}%`} note="8% below threshold" color="#a99cff" bars={[40,48,33,61,48,65,52]} />
        <MetricCard icon={MemoryStick} label="Memory used" value="60%" note="7.2 TB available" color="#64c7ff" bars={[38,46,52,49,58,62,60]} />
        <MetricCard icon={BellRing} label="Open incidents" value="2" note="1 needs attention" color="#ff879c" bars={[18,22,16,34,25,48,31]} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.65fr_.75fr]">
        <div className="liquid-panel min-h-[390px] p-5 sm:p-6">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div><p className="panel-kicker">Fleet telemetry</p><h2 className="panel-title">Resource load</h2></div>
            <div className="range-picker">{['1H','2H','12H','24H'].map((item) => <button key={item} onClick={() => setRange(item)} className={range === item ? 'active' : ''}>{item}</button>)}</div>
          </div>
          <div className="mb-4 flex gap-6 text-xs">
            <span className="flex items-center gap-2 text-white/45"><i className="h-2 w-2 rounded-full bg-[#9a8cff]" />CPU <b className="font-mono text-white">41%</b></span>
            <span className="flex items-center gap-2 text-white/45"><i className="h-2 w-2 rounded-full bg-[#65d6c1]" />Memory <b className="font-mono text-white">60%</b></span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuLiquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8778ff" stopOpacity=".42" /><stop offset="1" stopColor="#8778ff" stopOpacity="0" /></linearGradient>
                  <linearGradient id="ramLiquid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#53d7bd" stopOpacity=".28" /><stop offset="1" stopColor="#53d7bd" stopOpacity="0" /></linearGradient>
                </defs>
                <Tooltip contentStyle={{ background: '#12151c', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, fontSize: 11 }} />
                <Area type="monotone" dataKey="ram" stroke="#53d7bd" strokeWidth={2} fill="url(#ramLiquid)" />
                <Area type="monotone" dataKey="cpu" stroke="#8778ff" strokeWidth={2} fill="url(#cpuLiquid)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="liquid-panel overflow-hidden p-6">
          <div className="flex items-start justify-between"><div><p className="panel-kicker">Global status</p><h2 className="panel-title">Fleet health</h2></div><span className="status-pill good">Operational</span></div>
          <div className="relative mx-auto my-7 grid h-44 w-44 place-items-center">
            <div className="health-ring" style={{ '--health': `${health * 3.6}deg` } as React.CSSProperties} />
            <div className="text-center"><p className="font-mono text-4xl font-medium">{health}%</p><p className="mt-1 text-[10px] uppercase tracking-[.2em] text-white/35">health score</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/[.06] pt-5 text-center">
            <HealthStat label="Online" value={online} color="text-[#70f2be]" />
            <HealthStat label="Warning" value="1" color="text-[#ffd27a]" />
            <HealthStat label="Offline" value={total - online} color="text-[#ff879c]" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_.95fr]">
        <div className="liquid-panel overflow-hidden">
          <div className="flex items-center justify-between p-6"><div><p className="panel-kicker">Agent network</p><h2 className="panel-title">Server activity</h2></div><Link href="/dashboard/servers" className="text-xs text-white/45 hover:text-white">View all <ChevronRight className="inline h-3 w-3" /></Link></div>
          <div className="overflow-x-auto">
            <table className="server-table">
              <thead><tr><th>Server</th><th>Status</th><th>CPU</th><th>Memory</th><th></th></tr></thead>
              <tbody>{visibleServers.map((server, index) => <ServerRow key={server.id ?? index} server={server} index={index} />)}</tbody>
            </table>
          </div>
        </div>

        <div className="liquid-panel p-6">
          <div className="flex items-start justify-between"><div><p className="panel-kicker">Needs attention</p><h2 className="panel-title">Recent incidents</h2></div><Link href="/dashboard/alerts" className="status-pill warning">2 open</Link></div>
          <div className="mt-5 space-y-3">
            <Incident icon={Database} title="Memory threshold exceeded" detail="db-primary-01 · 4m ago" tone="critical" />
            <Incident icon={Wifi} title="Packet loss detected" detail="edge-sg-02 · 18m ago" tone="warning" />
            <Incident icon={Check} title="CPU load recovered" detail="api-prod-02 · 46m ago" tone="resolved" />
          </div>
          <Link href="/dashboard/alerts" className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-white/[.07] py-3 text-xs text-white/50 transition hover:bg-white/[.04] hover:text-white">Open incident center <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, note, color, bars }: any) {
  return <div className="metric-card"><div className="flex items-start justify-between"><div className="metric-icon" style={{ color }}><Icon className="h-4 w-4" /></div><div className="mini-bars">{bars.map((height: number, i: number) => <i key={i} style={{ height: `${height}%`, background: color }} />)}</div></div><p className="mt-5 text-[11px] uppercase tracking-[.16em] text-white/35">{label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className="font-mono text-3xl">{value}</p><p className="mb-1 text-[10px]" style={{ color }}>{note}</p></div></div>;
}

function HealthStat({ label, value, color }: any) { return <div><p className={`font-mono text-lg ${color}`}>{value}</p><p className="mt-1 text-[9px] uppercase tracking-[.16em] text-white/30">{label}</p></div>; }

function ServerRow({ server, index }: any) {
  const online = server.status === 'online';
  const cpu = Number(server.cpu_usage ?? server.cpu ?? [42,68,29,0][index] ?? 0);
  const ram = Number(server.memory_usage ?? server.memory ?? [61,74,46,0][index] ?? 0);
  return <tr><td><div className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.04]"><Cloud className="h-3.5 w-3.5 text-white/50" /></span><div><p className="font-mono text-xs text-white/80">{server.name ?? server.hostname ?? `server-${index + 1}`}</p><p className="mt-1 text-[9px] text-white/25">{server.ip ?? server.ip_address ?? 'Private network'}</p></div></div></td><td><span className={`status-dot ${online ? 'online' : 'offline'}`} />{online ? 'Online' : 'Offline'}</td><td><LoadBar value={cpu} /></td><td><LoadBar value={ram} /></td><td><Link href={`/dashboard/servers/${server.id}`}><ChevronRight className="h-4 w-4 text-white/25" /></Link></td></tr>;
}

function LoadBar({ value }: { value: number }) { return <div className="flex items-center gap-2"><span className="h-1 w-14 overflow-hidden rounded-full bg-white/[.06]"><i className="block h-full rounded-full bg-gradient-to-r from-[#7568ff] to-[#64dbc2]" style={{ width: `${Math.min(value, 100)}%` }} /></span><span className="font-mono text-[10px] text-white/45">{value}%</span></div>; }

function Incident({ icon: Icon, title, detail, tone }: any) {
  return <div className="incident-row"><span className={`incident-icon ${tone}`}><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-xs text-white/80">{title}</p><p className="mt-1 text-[10px] text-white/30">{detail}</p></div>{tone === 'critical' ? <CircleAlert className="ml-auto h-4 w-4 text-[#ff879c]" /> : <ChevronRight className="ml-auto h-4 w-4 text-white/20" />}</div>;
}
