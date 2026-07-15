'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Clock, Shield, Database, Activity, Server, AlertTriangle } from 'lucide-react';

interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: any;
  created_at: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await apiClient('/audit-logs');
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (type: string) => {
    switch(type) {
      case 'SERVER': return <Server className="w-4 h-4 text-blue-400" />;
      case 'ALERT': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      default: return <Activity className="w-4 h-4 text-emerald-400" />;
    }
  };

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-500" />
          Audit Logs
        </h1>
        <p className="text-[var(--color-muted)]">Track all system activities and changes</p>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--color-muted)]/10 flex justify-between items-center bg-black/5 dark:bg-white/5">
          <h2 className="font-semibold text-sm">Recent Activity</h2>
          <button onClick={fetchLogs} className="text-xs text-blue-400 hover:text-blue-300">Refresh</button>
        </div>
        
        {loading ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm animate-pulse">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">No recent activity</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-[var(--color-muted)] uppercase bg-black/5 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-4 rounded-tl-lg">Time</th>
                  <th className="px-6 py-4">Resource</th>
                  <th className="px-6 py-4">Action</th>
                  <th className="px-6 py-4 rounded-tr-lg">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-muted)]/10">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-[var(--color-muted)] flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getActionIcon(log.resource_type)}
                        <span className="font-medium text-[var(--foreground)]">{log.resource_type}</span>
                        <span className="text-[var(--color-muted)] text-xs truncate max-w-[150px]">{log.resource_id}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[var(--color-muted)] max-w-xs truncate">
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
