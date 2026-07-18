'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Cpu, HardDrive, Activity, ShieldCheck, Box, Server as ServerIcon, TerminalSquare, CalendarClock, Network, Search, CircleCheck, CircleX, CircleHelp } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

interface TopProcess {
  pid: number;
  name: string;
  cpu: number;
  ram: number;
  user: string;
}

interface ServiceStatus {
  name: string;
  display_name?: string;
  status: string;
  sub_status?: string;
  startup_type?: string;
  source?: string;
  description?: string;
  last_checked_at?: string;
}

interface SystemInfo {
  kernel: string;
  uptime: number;
  public_ip: string;
  virtualization: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpu: string;
  ram: string;
}

interface InventoryDisk {
  device: string;
  mountpoint: string;
  file_system: string;
  total_bytes: number;
}

interface Inventory {
  hostname: string;
  architecture: string;
  platform: string;
  platform_version: string;
  kernel_version: string;
  cpu_model: string;
  logical_cores: number;
  physical_cores: number;
  memory_total: number;
  boot_time: number;
  agent_version: string;
  private_ips: string[];
  disks: InventoryDisk[];
  collected_at: string;
}

interface CronJob {
  id: string;
  source: string;
  owner?: string;
  schedule: string;
  command: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  discovered_at: string;
}

interface Snapshot {
  system_info?: SystemInfo;
  inventory?: Inventory;
  top_processes?: TopProcess[];
  services?: ServiceStatus[];
  docker_containers?: DockerContainer[];
  package_update?: number;
}

interface ServerDetails {
  id: string;
  name: string;
  status: string;
  ip_address: string;
  os_info?: string;
  snapshot?: string;
  inventory?: string;
  inventory_updated_at?: string;
  provider?: string;
  region?: string;
  environment?: string;
}

export default function ServerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [server, setServer] = useState<ServerDetails | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [logsModal, setLogsModal] = useState<{isOpen: boolean, containerId: string, logs: string, loading: boolean}>({isOpen: false, containerId: '', logs: '', loading: false});

  useEffect(() => {
    fetchServer();
    const interval = setInterval(fetchServer, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const fetchServer = async () => {
    try {
      const data = await apiClient(`/servers/${params.id}`);
      setServer(data);
      if (data.snapshot && data.snapshot !== '{}') {
        const nextSnapshot = JSON.parse(data.snapshot) as Snapshot;
        setSnapshot(nextSnapshot);
        setInventory(nextSnapshot.inventory || null);
      }
      if (data.inventory && data.inventory !== '{}') {
        setInventory(JSON.parse(data.inventory));
      }
      try {
        const jobs = await apiClient(`/servers/${params.id}/cron-jobs`);
        setCronJobs(Array.isArray(jobs) ? jobs : []);
      } catch (cronError) {
        console.error('Unable to load cron jobs', cronError);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDockerAction = async (action: string, containerId: string) => {
    try {
      if (action === 'docker_logs') {
        setLogsModal({isOpen: true, containerId, logs: 'Requesting container logs...', loading: true});
      } else {
        alert(`${action} command sent to container ${containerId}. Execution may take about 15 seconds.`);
      }

      const task = await apiClient(`/servers/${params.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          type: action,
          payload: JSON.stringify({ container_id: containerId })
        })
      });

      if (action === 'docker_logs') {
        // Poll for task result
        const pollLogs = setInterval(async () => {
          try {
            const res = await apiClient(`/servers/${params.id}/tasks/${task.id}`);
            if (res.status === 'completed') {
              setLogsModal({isOpen: true, containerId, logs: res.result || 'No logs available.', loading: false});
              clearInterval(pollLogs);
            } else if (['failed', 'expired', 'timed_out'].includes(res.status)) {
              setLogsModal({isOpen: true, containerId, logs: `Unable to retrieve logs:\n${res.result || `Task ${res.status}`}`, loading: false});
              clearInterval(pollLogs);
            }
          } catch (e) {
             console.error("Log polling failed", e);
             clearInterval(pollLogs);
          }
        }, 2000); // poll every 2s
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred while sending the command.');
      if (action === 'docker_logs') {
        setLogsModal(prev => ({...prev, loading: false, logs: 'The API request failed.'}));
      }
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-[var(--color-muted)]">Loading server information...</div>;
  }

  if (!server) {
    return <div className="p-12 text-center text-[var(--color-muted)]">Server not found.</div>;
  }

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, exponent)).toFixed(exponent > 2 ? 1 : 0)} ${units[exponent]}`;
  };

  const formatTimestamp = (value?: string) => value
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value))
    : 'Unknown';

  const reportedServices = snapshot?.services || [];
  const reportedServiceManager = reportedServices.find(service => service.source)?.source;
  const monitoredOS = inventory?.platform || (server.os_info ? (() => {
    try { return JSON.parse(server.os_info).os_name; } catch { return 'Unknown OS'; }
  })() : 'Unknown OS');
  const normalizedOS = `${inventory?.platform || ''} ${monitoredOS}`.toLowerCase();
  const osFamily = normalizedOS.includes('windows') || reportedServiceManager === 'windows-scm'
    ? 'windows'
    : normalizedOS.includes('darwin') || normalizedOS.includes('mac') || reportedServiceManager === 'launchd'
      ? 'macos'
      : normalizedOS.includes('linux') || reportedServiceManager === 'systemd' || ['ubuntu', 'debian', 'centos', 'fedora', 'alpine'].some(name => normalizedOS.includes(name))
        ? 'linux'
        : 'unknown';
  const serviceManager = osFamily === 'macos' ? 'launchd' : osFamily === 'windows' ? 'windows-scm' : 'systemd';
  const serviceContent = osFamily === 'macos'
    ? {
        tab: 'Launch Services',
        title: 'launchd services',
        description: 'Reported from macOS system and console-user launchd domains.',
        stopped: 'Not loaded',
        missing: 'Label not found',
        search: 'Search launchd labels',
      }
    : osFamily === 'windows'
      ? {
          tab: 'Windows Services',
          title: 'Windows services',
          description: 'Reported by the Windows Service Control Manager.',
          stopped: 'Stopped',
          missing: 'Not installed',
          search: 'Search Windows services',
        }
      : {
          tab: 'System Services',
          title: 'systemd services',
          description: 'Reported from systemd unit state and unit-file configuration.',
          stopped: 'Inactive',
          missing: 'Unit not found',
          search: 'Search systemd units',
        };
  const tabs: Array<[string, string]> = [
    ['overview', 'Overview'],
    ['inventory', 'Inventory'],
    ...(osFamily === 'windows' ? [] : [['cron', osFamily === 'macos' ? 'Cron Jobs' : 'Cron Monitoring'] as [string, string]]),
    ['processes', 'Processes'],
    ['services', serviceContent.tab],
    ['docker', osFamily === 'macos' || osFamily === 'windows' ? 'Containers' : 'Docker'],
  ];
  // Old agents sent a Linux-only list without a service manager. Do not show
  // those entries as valid launchd or Windows services.
  const services = reportedServices.filter(service =>
    osFamily === 'unknown'
      || (osFamily === 'linux' && !service.source)
      || service.source === serviceManager,
  );
  const hasIncompatibleLegacyServices = reportedServices.length > services.length;
  const filteredServices = services.filter(service => {
    const matchesStatus = serviceFilter === 'all' || service.status === serviceFilter;
    const query = serviceSearch.trim().toLowerCase();
    const matchesSearch = !query || [service.name, service.display_name, service.description, service.source]
      .some(value => value?.toLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });
  const serviceCounts = services.reduce<Record<string, number>>((counts, service) => {
    counts[service.status] = (counts[service.status] || 0) + 1;
    return counts;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/servers')} className="p-2 hover:bg-[var(--background-card)] rounded-lg text-[var(--color-muted)] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
            {server.name}
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${server.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
              {server.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </h1>
          <p className="text-[var(--color-muted)] text-sm mt-1 flex items-center gap-2">
            <ServerIcon className="w-4 h-4" /> {server.ip_address || (snapshot?.system_info?.public_ip) || 'Unknown IP'}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Server detail views" className="flex gap-4 overflow-x-auto border-b border-[var(--border-color)]">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`whitespace-nowrap pb-3 text-sm font-semibold transition-colors ${activeTab === key ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="text-sm font-medium text-[var(--color-muted)] mb-4 flex items-center gap-2"><Cpu className="w-4 h-4" /> SYSTEM INFORMATION</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Operating System</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{server.os_info ? JSON.parse(server.os_info).os_name : 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Kernel Version</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{snapshot?.system_info?.kernel || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Virtualization Platform</span>
                <span className="text-sm font-medium text-[var(--foreground)] uppercase">{snapshot?.system_info?.virtualization || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Uptime</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{snapshot?.system_info?.uptime ? formatUptime(snapshot.system_info.uptime) : 'N/A'}</span>
              </div>
            </div>
          </div>
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="text-sm font-medium text-[var(--color-muted)] mb-4 flex items-center gap-2"><Box className="w-4 h-4" /> PACKAGE UPDATES</h3>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-blue-500/10 rounded-xl text-blue-500">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-[var(--color-muted)]">Packages awaiting upgrade</p>
                <div className="text-2xl font-bold text-[var(--foreground)]">{snapshot?.package_update || 0} <span className="text-sm font-normal text-[var(--color-muted)]">packages</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {!inventory ? (
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-12 text-center text-[var(--color-muted)]">
              Inventory has not been reported by this agent yet.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Hostname', value: inventory.hostname || 'Unknown', icon: ServerIcon },
                  { label: 'Operating system', value: [inventory.platform, inventory.platform_version].filter(Boolean).join(' ') || 'Unknown', icon: ShieldCheck },
                  { label: 'CPU', value: `${inventory.physical_cores || 'Unknown'} physical / ${inventory.logical_cores || 'Unknown'} logical`, icon: Cpu },
                  { label: 'Installed memory', value: formatBytes(inventory.memory_total), icon: HardDrive },
                  { label: 'Provider', value: server.provider || 'Unassigned', icon: Box },
                  { label: 'Region', value: server.region || 'Unassigned', icon: Network },
                  { label: 'Environment', value: server.environment || 'Unassigned', icon: Activity },
                  { label: 'Agent version', value: inventory.agent_version || 'Unknown', icon: ShieldCheck },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--color-muted)]"><Icon className="h-4 w-4" /> {label}</div>
                    <p className="break-words text-base font-semibold text-[var(--foreground)]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Cpu className="h-4 w-4" /> Hardware and agent</h3>
                  <dl className="space-y-3 text-sm">
                    {[
                      ['CPU model', inventory.cpu_model || 'Unknown'],
                      ['Architecture', inventory.architecture || 'Unknown'],
                      ['Kernel', inventory.kernel_version || 'Unknown'],
                      ['Agent version', inventory.agent_version || 'Unknown'],
                      ['Collected at', formatTimestamp(inventory.collected_at)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4">
                        <dt className="text-[var(--color-muted)]">{label}</dt>
                        <dd className="break-all font-medium text-[var(--foreground)] sm:text-right">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><Network className="h-4 w-4" /> Private addresses</h3>
                  <div className="flex flex-wrap gap-2">
                    {inventory.private_ips?.length ? inventory.private_ips.map(ip => (
                      <code key={ip} className="rounded-full border border-[var(--border-color)] bg-[var(--background)] px-3 py-1.5 text-sm text-[var(--foreground)]">{ip}</code>
                    )) : <span className="text-sm text-[var(--color-muted)]">No private addresses reported.</span>}
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--background-card)]">
                <div className="border-b border-[var(--border-color)] p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><HardDrive className="h-4 w-4" /> Filesystems</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[var(--background)] text-[var(--color-muted)]">
                      <tr><th className="px-6 py-3">Device</th><th className="px-6 py-3">Mountpoint</th><th className="px-6 py-3">Filesystem</th><th className="px-6 py-3">Capacity</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {inventory.disks?.map(disk => (
                        <tr key={`${disk.device}-${disk.mountpoint}`}>
                          <td className="px-6 py-3 font-medium text-[var(--foreground)]">{disk.device}</td>
                          <td className="px-6 py-3 text-[var(--foreground)]">{disk.mountpoint}</td>
                          <td className="px-6 py-3 text-[var(--color-muted)]">{disk.file_system || 'Unknown'}</td>
                          <td className="px-6 py-3 text-[var(--foreground)]">{formatBytes(disk.total_bytes)}</td>
                        </tr>
                      ))}
                      {!inventory.disks?.length && <tr><td colSpan={4} className="px-6 py-8 text-center text-[var(--color-muted)]">No filesystem inventory reported.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'cron' && (
        <div className="overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--background-card)]">
          <div className="border-b border-[var(--border-color)] p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]"><CalendarClock className="h-4 w-4" /> DISCOVERED CRON JOBS</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">Schedules are reported by the agent. Run history remains Unknown until execution telemetry is available.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[var(--background)] text-[var(--color-muted)]">
                <tr><th className="px-6 py-3">Schedule</th><th className="px-6 py-3">Command</th><th className="px-6 py-3">Source</th><th className="px-6 py-3">Owner</th><th className="px-6 py-3">Last run</th><th className="px-6 py-3">Next run</th><th className="px-6 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {cronJobs.map(job => (
                  <tr key={job.id}>
                    <td className="px-6 py-4"><code className="rounded bg-[var(--background)] px-2 py-1 font-semibold text-[var(--foreground)]">{job.schedule}</code></td>
                    <td className="max-w-md break-all px-6 py-4 font-mono text-xs text-[var(--foreground)]">{job.command}</td>
                    <td className="px-6 py-4 text-[var(--color-muted)]">{job.source}</td>
                    <td className="px-6 py-4 text-[var(--color-muted)]">{job.owner || 'Unknown'}</td>
                    <td className="px-6 py-4 text-[var(--color-muted)]">{formatTimestamp(job.last_run_at)}</td>
                    <td className="px-6 py-4 text-[var(--color-muted)]">{formatTimestamp(job.next_run_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${job.enabled ? 'border-emerald-500/30 text-emerald-500' : 'border-[var(--border-color)] text-[var(--color-muted)]'}`}>{job.enabled ? (job.last_status || 'Discovered') : 'Not reported'}</span>
                    </td>
                  </tr>
                ))}
                {!cronJobs.length && <tr><td colSpan={7} className="px-6 py-10 text-center text-[var(--color-muted)]">No cron jobs have been reported by this server.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'processes' && (
        <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2"><Activity className="w-4 h-4" /> TOP RESOURCE-CONSUMING PROCESSES</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--background)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">PID</th>
                  <th className="px-6 py-3 font-medium">{osFamily === 'windows' ? 'Process' : 'Command'}</th>
                  <th className="px-6 py-3 font-medium">{osFamily === 'windows' ? 'Account' : 'User'}</th>
                  <th className="px-6 py-3 font-medium">CPU %</th>
                  <th className="px-6 py-3 font-medium">RAM %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {snapshot?.top_processes?.map(p => (
                  <tr key={p.pid} className="hover:bg-[var(--background)] transition-colors">
                    <td className="px-6 py-3 text-[var(--color-muted)]">{p.pid}</td>
                    <td className="px-6 py-3 font-medium text-[var(--foreground)]">{p.name}</td>
                    <td className="px-6 py-3 text-[var(--color-muted)]">{p.user}</td>
                    <td className="px-6 py-3 text-rose-400">{p.cpu.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-blue-400">{p.ram.toFixed(1)}%</td>
                  </tr>
                ))}
                {!snapshot?.top_processes?.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--color-muted)]">No process data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-5">
          {hasIncompatibleLegacyServices && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-[var(--foreground)]">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="font-semibold">This snapshot contains a service list from an older agent.</p>
                  <p className="mt-1 leading-6 text-[var(--color-muted)]">Linux service names were hidden because this server is identified as {monitoredOS}. Update and restart the agent to collect native {serviceContent.title}.</p>
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Running', value: serviceCounts.running || 0, icon: CircleCheck, tone: 'text-emerald-500' },
              { label: serviceContent.stopped, value: serviceCounts.stopped || 0, icon: CircleX, tone: 'text-rose-500' },
              { label: serviceContent.missing, value: serviceCounts.not_installed || 0, icon: TerminalSquare, tone: 'text-[var(--color-muted)]' },
              { label: 'Unknown', value: serviceCounts.unknown || 0, icon: CircleHelp, tone: 'text-amber-500' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5">
                <div className={`flex items-center gap-2 text-sm font-semibold ${tone}`}><Icon className="h-4 w-4" />{label}</div>
                <p className="mt-3 text-2xl font-semibold text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)]">
            <div className="flex flex-col gap-4 border-b border-[var(--border-color)] p-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--foreground)]">{serviceContent.title} on {monitoredOS}</h3>
                <p className="mt-1 text-sm text-[var(--color-muted)]">{serviceContent.description} Configure DATRIXOPS_SERVICES to replace the {osFamily === 'unknown' ? 'platform' : osFamily} defaults.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative">
                  <span className="sr-only">Search services</span>
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--color-muted)]" />
                  <input value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} className="w-full rounded-full border border-[var(--border-color)] bg-[var(--background)] py-2 pl-9 pr-4 text-sm text-[var(--foreground)] outline-none focus:border-blue-500 sm:w-64" placeholder={serviceContent.search} />
                </label>
                <label>
                  <span className="sr-only">Filter service status</span>
                  <select value={serviceFilter} onChange={event => setServiceFilter(event.target.value)} className="w-full rounded-full border border-[var(--border-color)] bg-[var(--background)] px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:border-blue-500">
                    <option value="all">All statuses</option>
                    <option value="running">Running</option>
                    <option value="stopped">{serviceContent.stopped}</option>
                    <option value="not_installed">{serviceContent.missing}</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
              {filteredServices.map(service => {
                const statusLabel = service.status === 'stopped'
                  ? serviceContent.stopped
                  : service.status === 'not_installed'
                    ? serviceContent.missing
                    : service.status.replace(/_/g, ' ');
                const statusStyle = service.status === 'running'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                  : service.status === 'stopped'
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                    : service.status === 'unknown'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                      : 'border-[var(--border-color)] bg-[var(--background)] text-[var(--color-muted)]';
                return (
                  <article key={service.name} className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-[var(--foreground)]">{service.display_name || service.name}</h4>
                        <p className="mt-1 truncate font-mono text-xs text-[var(--color-muted)]">{service.name}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusStyle}`}>{statusLabel}</span>
                    </div>
                    {service.description && <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">{service.description}</p>}
                    <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border-color)] pt-4 text-sm">
                      <div><dt className="text-[var(--color-muted)]">Manager</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.source === 'windows-scm' ? 'Windows SCM' : service.source || 'Unknown'}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">{osFamily === 'macos' ? 'Loading model' : 'Startup'}</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.startup_type || 'Unknown'}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">{osFamily === 'macos' ? 'launchd state' : 'Native state'}</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.sub_status || '—'}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">Checked</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{formatTimestamp(service.last_checked_at)}</dd></div>
                    </dl>
                  </article>
                );
              })}
              {!filteredServices.length && (
                <div className="col-span-full p-10 text-center text-[var(--color-muted)]">
                  {services.length
                    ? `No ${serviceContent.title} match the current filters.`
                    : hasIncompatibleLegacyServices
                      ? `Native ${serviceContent.title} will appear after the agent is updated.`
                      : `No ${serviceContent.title} have been reported by this agent.`}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'docker' && (
        <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2"><Box className="w-4 h-4" /> {osFamily === 'macos' || osFamily === 'windows' ? 'Local containers' : 'Docker containers'}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{osFamily === 'macos' || osFamily === 'windows' ? 'Containers reported through the local Docker-compatible engine.' : 'Containers reported through the local Docker Engine.'}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--background)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Image</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">CPU %</th>
                  <th className="px-6 py-3 font-medium">RAM %</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {snapshot?.docker_containers?.map(c => (
                  <tr key={c.id} className="hover:bg-[var(--background)] transition-colors">
                    <td className="px-6 py-3 font-medium text-[var(--foreground)]">{c.name}</td>
                    <td className="px-6 py-3 text-[var(--color-muted)] truncate max-w-xs">{c.image}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium border ${c.state === 'running' ? 'border-emerald-500/30 text-emerald-500' : 'border-[var(--border-color)] text-[var(--color-muted)]'}`}>
                        {c.state.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-rose-400">{c.cpu}</td>
                    <td className="px-6 py-3 text-blue-400">{c.ram}</td>
                    <td className="px-6 py-3 flex gap-2">
                      {c.state !== 'running' && (
                        <button onClick={() => handleDockerAction('docker_start', c.id)} className="text-emerald-500 hover:text-emerald-400 text-xs border border-emerald-500/30 px-2 py-1 rounded">Start</button>
                      )}
                      {c.state === 'running' && (
                        <>
                          <button onClick={() => handleDockerAction('docker_stop', c.id)} className="text-rose-500 hover:text-rose-400 text-xs border border-rose-500/30 px-2 py-1 rounded">Stop</button>
                          <button onClick={() => handleDockerAction('docker_restart', c.id)} className="text-amber-500 hover:text-amber-400 text-xs border border-amber-500/30 px-2 py-1 rounded">Restart</button>
                        </>
                      )}
                      <button onClick={() => handleDockerAction('docker_logs', c.id)} className="text-blue-500 hover:text-blue-400 text-xs border border-blue-500/30 px-2 py-1 rounded">Logs</button>
                    </td>
                  </tr>
                ))}
                {!snapshot?.docker_containers?.length && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--color-muted)]">{osFamily === 'macos' || osFamily === 'windows' ? 'No local containers were reported.' : 'No Docker containers were reported.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="container-logs-title" className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-[var(--border-color)]">
              <h3 id="container-logs-title" className="font-semibold text-[var(--foreground)]">Container Logs <span className="text-[var(--color-muted)] text-sm font-normal">({logsModal.containerId})</span></h3>
              <button type="button" onClick={() => setLogsModal({isOpen: false, containerId: '', logs: '', loading: false})} aria-label="Close container logs" className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-sm bg-[var(--background)] text-[var(--foreground)] whitespace-pre-wrap">
              {logsModal.loading ? (
                <div className="flex items-center gap-3 text-blue-400 animate-pulse">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  {logsModal.logs}
                </div>
              ) : (
                logsModal.logs
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
