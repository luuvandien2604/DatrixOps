'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleAlert, RefreshCw, RotateCcw, ServerCog, UploadCloud, Zap } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';

type FleetServer = { id: string; name: string; status: string; group_name?: string; tags?: string[]; owner_email: string };
type FleetAction = 'agent_update' | 'agent_restart' | 'vps_reboot';

const ACTIONS: Record<FleetAction, { label: string; description: string }> = {
  agent_update: { label: 'Update agents', description: 'Install the current signed agent release.' },
  agent_restart: { label: 'Restart agents', description: 'Restart only the agent process.' },
  vps_reboot: { label: 'Reboot hosts', description: 'Reboot the selected operating systems.' },
};

export default function ManageServersPage() {
  const [servers, setServers] = useState<FleetServer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<FleetAction | null>(null);
  const [message, setMessage] = useState('');
  const [isSuperadmin, setIsSuperadmin] = useState<boolean | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient('/admin/servers');
      setServers(Array.isArray(data) ? data : []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load fleet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => setIsSuperadmin(getUserRole() === 'superadmin'), []);
  useEffect(() => {
    if (isSuperadmin == null) return;
    if (isSuperadmin) void fetchServers(); else setLoading(false);
  }, [fetchServers, isSuperadmin]);

  const selectedServers = useMemo(() => servers.filter((server) => selected.has(server.id)), [selected, servers]);
  const toggleAll = () => setSelected((current) => current.size === servers.length ? new Set() : new Set(servers.map((server) => server.id)));
  const toggleServer = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const runFleetAction = async (action: FleetAction) => {
    if (selectedServers.length === 0) return;
    if (action === 'vps_reboot' && !confirm(`Reboot ${selectedServers.length} selected hosts?`)) return;
    setRunningAction(action);
    const results = await Promise.allSettled(selectedServers.map((server) =>
      apiClient(`/admin/servers/${server.id}/tasks`, { data: { type: action } }),
    ));
    const succeeded = results.filter((result) => result.status === 'fulfilled').length;
    setMessage(`${ACTIONS[action].label}: ${succeeded}/${results.length} tasks queued successfully.`);
    setRunningAction(null);
  };

  if (isSuperadmin == null) return <div className="glass-card p-10 text-center text-[var(--color-muted)]">Checking access…</div>;
  if (!isSuperadmin) return <div className="glass-card p-10 text-center"><CircleAlert className="mx-auto h-8 w-8 text-[var(--rose)]" /><h2 className="mt-4">Superadmin access required</h2></div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="panel-kicker">Fleet automation</p><h1>Operate the <em>fleet.</em></h1><p className="mt-3 text-[var(--color-muted)]">Queue safe lifecycle actions across multiple agents without exposing arbitrary shell access.</p></div>
        <button type="button" onClick={() => void fetchServers()} className="liquid-button secondary" disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {(Object.entries(ACTIONS) as [FleetAction, typeof ACTIONS[FleetAction]][]).map(([action, config]) => (
          <button key={action} type="button" disabled={selected.size === 0 || runningAction != null} onClick={() => void runFleetAction(action)} className="glass-card p-5 text-left transition hover:-translate-y-0.5">
            {action === 'agent_update' ? <UploadCloud className="h-5 w-5 text-[var(--mint)]" /> : action === 'agent_restart' ? <RotateCcw className="h-5 w-5 text-[var(--violet)]" /> : <Zap className="h-5 w-5 text-[var(--amber)]" />}
            <strong className="mt-4 block text-[var(--foreground)]">{config.label}</strong>
            <span className="mt-1 block text-sm text-[var(--color-muted)]">{config.description}</span>
          </button>
        ))}
      </section>

      {message && <div className="monitoring-live-strip"><ServerCog className="h-4 w-4" />{message}</div>}

      <section className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] p-5"><div><p className="panel-kicker">Selection</p><h2 className="panel-title">{selected.size} of {servers.length} selected</h2></div></div>
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th><input className="fleet-checkbox" type="checkbox" checked={servers.length > 0 && selected.size === servers.length} onChange={toggleAll} aria-label="Select all servers" /></th><th>Server</th><th>Owner</th><th>Group</th><th>Tags</th><th>Status</th></tr></thead>
            <tbody>
              {servers.map((server) => <tr key={server.id}><td><input className="fleet-checkbox" type="checkbox" checked={selected.has(server.id)} onChange={() => toggleServer(server.id)} aria-label={`Select ${server.name}`} /></td><td className="font-semibold text-[var(--foreground)]">{server.name}</td><td>{server.owner_email}</td><td>{server.group_name || 'Ungrouped'}</td><td>{server.tags?.join(', ') || '—'}</td><td><span className={`status-pill ${server.status === 'online' ? 'good' : 'warning'}`}>{server.status}</span></td></tr>)}
              {!loading && servers.length === 0 && <tr><td colSpan={6} className="py-12 text-center">No servers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
