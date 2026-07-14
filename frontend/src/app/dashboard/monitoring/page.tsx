'use client';

import React from 'react';
import { Cpu, HardDrive, Wifi, DatabaseBackup } from 'lucide-react';
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

export default function MonitoringPage() {
  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Giám sát tài nguyên</h1>
          <p className="text-sm text-[var(--color-muted)]">Phân tích hiệu năng hệ thống chi tiết qua các biểu đồ</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CPU Line Chart */}
        <div className="glass-card p-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Cpu className="w-5 h-5 text-blue-400" />
              CPU Usage Trend (24h)
            </h3>
          </div>
          <div className="h-72">
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
            <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
              <DatabaseBackup className="w-5 h-5 text-emerald-400" />
              Memory Usage
            </h3>
          </div>
          <div className="h-72">
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
            <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Wifi className="w-5 h-5 text-purple-400" />
              Network Throughput
            </h3>
          </div>
          <div className="h-72">
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
            <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-amber-400" />
              Disk I/O
            </h3>
          </div>
          <div className="h-72">
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
      </div>
    </div>
  );
}
