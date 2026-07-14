'use client';

import React from 'react';
import { AlertTriangle, Bell, Clock, Server, CheckCircle2 } from 'lucide-react';

export default function AlertsPage() {
  const mockAlerts = [
    { id: 1, server: 'production-db-01', type: 'CRITICAL', message: 'CPU usage exceeded 95% for 5 minutes', time: '10 mins ago', status: 'Active' },
    { id: 2, server: 'redis-cache-02', type: 'WARNING', message: 'Memory usage at 85%', time: '1 hour ago', status: 'Active' },
    { id: 3, server: 'web-worker-05', type: 'INFO', message: 'Agent restarted successfully', time: '2 hours ago', status: 'Resolved' },
    { id: 4, server: 'storage-node-01', type: 'CRITICAL', message: 'Disk space below 5% on /dev/sda1', time: '5 hours ago', status: 'Active' },
  ];

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Cảnh báo hệ thống</h1>
          <p className="text-sm text-[var(--color-muted)]">Theo dõi và xử lý các sự cố phát sinh</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-5 border-l-4 border-l-rose-500">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-500/10 rounded-lg text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted)] font-medium">Critical Alerts</p>
              <h3 className="text-2xl font-bold text-[var(--foreground)]">2</h3>
            </div>
          </div>
        </div>
        <div className="glass-card p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-lg text-amber-500">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted)] font-medium">Warnings</p>
              <h3 className="text-2xl font-bold text-[var(--foreground)]">1</h3>
            </div>
          </div>
        </div>
        <div className="glass-card p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-[var(--color-muted)] font-medium">Resolved Today</p>
              <h3 className="text-2xl font-bold text-[var(--foreground)]">14</h3>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <h3 className="font-semibold text-[var(--foreground)]">Recent Activity</h3>
          <div className="flex gap-2">
             <button className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/10 transition-colors">Acknowledge All</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/20 border-b border-white/5">
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Severity</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Server</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Message</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Time</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {mockAlerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="py-4 px-6">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                      alert.type === 'CRITICAL' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      alert.type === 'WARNING' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                      {alert.type}
                    </div>
                  </td>
                  <td className="py-4 px-6 font-medium text-[var(--foreground)] flex items-center gap-2">
                    <Server className="w-4 h-4 text-[var(--color-muted)]" />
                    {alert.server}
                  </td>
                  <td className="py-4 px-6 text-sm text-[var(--color-muted)]">
                    {alert.message}
                  </td>
                  <td className="py-4 px-6 text-sm text-[var(--color-muted)] flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    {alert.time}
                  </td>
                  <td className="py-4 px-6 text-right">
                    {alert.status === 'Active' ? (
                      <button className="text-xs text-blue-400 hover:text-blue-300 font-medium">Acknowledge</button>
                    ) : (
                      <span className="text-xs text-emerald-500 font-medium flex items-center justify-end gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
