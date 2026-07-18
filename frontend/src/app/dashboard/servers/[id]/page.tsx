'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Cpu, HardDrive, Activity, ShieldCheck, Box, Server as ServerIcon, TerminalSquare, CalendarClock, Network, Search, CircleCheck, CircleX, CircleHelp, Play, Square, RotateCw, RefreshCw, LoaderCircle, Copy } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import toast from 'react-hot-toast';

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
  os_family?: string;
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
  os_family?: string;
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
  os_info?: string | { os_name?: string; os_family?: string; platform?: string; version?: string };
  snapshot?: string;
  inventory?: string;
  inventory_updated_at?: string;
  provider?: string;
  region?: string;
  environment?: string;
}

type ServiceAction = 'start' | 'stop' | 'restart' | 'reload';
type AgentUpdateState = {
  phase: 'idle' | 'waiting' | 'failed';
  message?: string;
};

const MIN_SERVICE_CONTROL_AGENT_VERSION = '1.3.0';

const versionAtLeast = (current: string | undefined, minimum: string) => {
  if (!current) return false;
  const parse = (value: string) => value.split('.').map(part => Number.parseInt(part, 10) || 0);
  const currentParts = parse(current);
  const minimumParts = parse(minimum);
  for (let index = 0; index < Math.max(currentParts.length, minimumParts.length); index += 1) {
    if ((currentParts[index] || 0) > (minimumParts[index] || 0)) return true;
    if ((currentParts[index] || 0) < (minimumParts[index] || 0)) return false;
  }
  return true;
};

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
  const [serviceActionRequest, setServiceActionRequest] = useState<{action: ServiceAction, service: ServiceStatus} | null>(null);
  const [serviceActionBusy, setServiceActionBusy] = useState(false);
  const [queueingAgentUpdate, setQueueingAgentUpdate] = useState(false);
  const [agentUpdateState, setAgentUpdateState] = useState<AgentUpdateState>({ phase: 'idle' });
  const [copiedUpdateCommand, setCopiedUpdateCommand] = useState(false);

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

  const handleServiceAction = async () => {
    if (!serviceActionRequest?.service.source) return;

    const { action, service } = serviceActionRequest;
    setServiceActionBusy(true);
    try {
      const task = await apiClient(`/servers/${params.id}/tasks`, {
        method: 'POST',
        data: {
          type: `service_${action}`,
          payload: JSON.stringify({
            service_name: service.name,
            service_manager: service.source,
          }),
          timeout_seconds: 90,
        },
      });

      for (let attempt = 0; attempt < 45; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        const result = await apiClient(`/servers/${params.id}/tasks/${task.id}`);
        if (result.status === 'completed') {
          try {
            const actionResult = JSON.parse(result.result || '{}') as { service?: ServiceStatus };
            if (actionResult.service) {
              setSnapshot(current => current ? {
                ...current,
                services: current.services?.map(item => item.name === service.name && item.source === service.source
                  ? actionResult.service as ServiceStatus
                  : item),
              } : current);
            }
          } catch {
            // Successful responses from older compatible agents may be plain text.
          }
          toast.success(`${service.display_name || service.name}: ${action} completed`);
          setServiceActionRequest(null);
          return;
        }
        if (['failed', 'expired', 'timed_out'].includes(result.status)) {
          throw new Error(result.result || `Service task ${result.status}`);
        }
      }
      throw new Error('Timed out waiting for the agent response');
    } catch (error: any) {
      toast.error(error.message || `Unable to ${action} service`);
    } finally {
      setServiceActionBusy(false);
    }
  };

  const queueAgentUpdate = async () => {
    if (!supportsServiceControls) {
      const message = `Agent ${reportedAgentVersion || 'unknown'} cannot reliably claim modern update tasks. Run the token-free in-place update command once, then use Update All Agents for future releases.`;
      setAgentUpdateState({ phase: 'failed', message });
      toast.error('This legacy agent requires a one-time in-place update.');
      return;
    }

    setQueueingAgentUpdate(true);
    setAgentUpdateState({ phase: 'waiting', message: 'Sending the update command to the running agent…' });
    try {
      const task = await apiClient(`/servers/${params.id}/tasks`, {
        method: 'POST',
        data: { type: 'agent_update', payload: '{}', timeout_seconds: 300 },
      });

      setAgentUpdateState({ phase: 'waiting', message: 'Update queued. Waiting for the agent to acknowledge the task…' });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        const result = await apiClient(`/servers/${params.id}/tasks/${task.id}`);
        if (result.status === 'completed') {
          setAgentUpdateState({
            phase: 'waiting',
            message: `The agent acknowledged the update. Waiting for it to restart and report version ${MIN_SERVICE_CONTROL_AGENT_VERSION} or newer…`,
          });
          toast.success('Update acknowledged. Verifying the running agent version…');
          await fetchServer();
          return;
        }
        if (['failed', 'expired', 'timed_out'].includes(result.status)) {
          throw new Error(result.result || `Agent update task ${result.status}`);
        }
      }
      throw new Error('The agent did not acknowledge the update within two minutes');
    } catch (error: any) {
      setAgentUpdateState({ phase: 'failed', message: error.message || 'Unable to update the agent' });
      toast.error(error.message || 'Unable to queue agent update');
    } finally {
      setQueueingAgentUpdate(false);
    }
  };

  const copyUpdateCommand = async (command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedUpdateCommand(true);
      window.setTimeout(() => setCopiedUpdateCommand(false), 2000);
      toast.success('Token-free update command copied');
    } catch {
      toast.error('Unable to copy the update command');
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
  const parsedOSInfo = (() => {
    if (!server.os_info) return {};
    if (typeof server.os_info === 'object') return server.os_info;
    try {
      return JSON.parse(server.os_info) as { os_name?: string; os_family?: string; platform?: string; version?: string };
    } catch {
      return {};
    }
  })();
  const explicitOSFamily = (snapshot?.os_family || inventory?.os_family || parsedOSInfo.os_family)?.toLowerCase();
  const monitoredOS = inventory?.platform || parsedOSInfo.os_name || parsedOSInfo.platform || explicitOSFamily || 'Unknown OS';
  const normalizedOS = `${inventory?.platform || ''} ${monitoredOS}`.toLowerCase();
  const osFamily = explicitOSFamily === 'windows' || normalizedOS.includes('windows') || reportedServiceManager === 'windows-scm'
    ? 'windows'
    : explicitOSFamily === 'macos' || explicitOSFamily === 'darwin' || normalizedOS.includes('darwin') || normalizedOS.includes('mac') || reportedServiceManager === 'launchd'
      ? 'macos'
      : explicitOSFamily === 'linux' || normalizedOS.includes('linux') || reportedServiceManager === 'systemd' || ['ubuntu', 'debian', 'centos', 'fedora', 'alpine'].some(name => normalizedOS.includes(name))
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
  // Heartbeat version is authoritative for the binary that is running now.
  // Inventory is only a fallback because it refreshes less frequently.
  const reportedAgentVersion = parsedOSInfo.version || inventory?.agent_version;
  const supportsServiceControls = versionAtLeast(reportedAgentVersion, MIN_SERVICE_CONTROL_AGENT_VERSION);
  const manualUpdateCommand = osFamily === 'windows'
    ? 'irm https://datrixops.vandien.space/update-agent.ps1 | iex'
    : 'curl -fsSL https://datrixops.vandien.space/update-agent.sh | sudo sh';
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
      <div className="flex items-start gap-4">
        <button onClick={() => router.push('/dashboard/servers')} aria-label="Back to servers" className="mt-1 rounded-full border border-[var(--border-color)] bg-[var(--background-card)] p-2.5 text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="break-words text-4xl font-bold tracking-tight text-[var(--foreground)] sm:text-5xl">
            {server.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm">
            <span className="flex items-center gap-2 text-[var(--color-muted)]">
              <ServerIcon className="h-4 w-4" />
              {server.ip_address || snapshot?.system_info?.public_ip || 'Unknown IP'}
            </span>
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${
              server.status === 'online'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'
            }`}>
              <span className={`h-2 w-2 rounded-full ${server.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {server.status === 'online' ? 'Online' : 'Offline'}
            </span>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 font-semibold ${
              supportsServiceControls
                ? 'border-[var(--border-color)] bg-[var(--background-card)] text-[var(--foreground)]'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            }`}>
              Agent {reportedAgentVersion || 'version unknown'}
            </span>
            {!supportsServiceControls && (
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                Update required
              </span>
            )}
          </div>
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
                <span className="text-sm font-medium text-[var(--foreground)]">{parsedOSInfo.os_name || monitoredOS || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Running Agent Version</span>
                <span className={`text-sm font-semibold ${reportedAgentVersion ? 'text-[var(--foreground)]' : 'text-amber-500'}`}>
                  {reportedAgentVersion || 'Not reported'}
                </span>
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
                  { label: 'Running agent version', value: reportedAgentVersion || 'Unknown', icon: ShieldCheck },
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
                      ['Running agent version', reportedAgentVersion || 'Unknown'],
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
          {!supportsServiceControls && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-5 text-sm text-[var(--foreground)]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                  <div>
                    <p className="font-semibold">Agent {MIN_SERVICE_CONTROL_AGENT_VERSION} or newer is required for service controls.</p>
                    <p className="mt-1 leading-6 text-[var(--color-muted)]">This agent reports version {reportedAgentVersion || 'unknown'}. Update the agent before using Start, Stop, Restart, or Reload.</p>
                    <p className="mt-2 leading-6 text-[var(--color-muted)]">
                      Agents older than {MIN_SERVICE_CONTROL_AGENT_VERSION} cannot reliably read the current task response. Run this token-free command once; later releases can use Update All Agents.
                    </p>
                    <div className="mt-3 flex max-w-3xl items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-2 pl-4">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs font-semibold text-[var(--foreground)] sm:text-sm">
                        {manualUpdateCommand}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyUpdateCommand(manualUpdateCommand)}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--background-card)] px-3 py-2 font-semibold text-[var(--foreground)] transition-colors hover:border-blue-500"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedUpdateCommand ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    {agentUpdateState.message && (
                      <p className={`mt-2 font-medium leading-6 ${agentUpdateState.phase === 'failed' ? 'text-rose-500' : 'text-blue-500'}`}>
                        {agentUpdateState.message}
                      </p>
                    )}
                    {agentUpdateState.phase === 'waiting' && (
                      <p className="mt-2 leading-6 text-[var(--color-muted)]">
                        Task acknowledgement does not confirm that the binary was replaced. Controls unlock only after a heartbeat reports version {MIN_SERVICE_CONTROL_AGENT_VERSION} or newer.
                      </p>
                    )}
                  </div>
                </div>
                <button type="button" disabled={queueingAgentUpdate || (supportsServiceControls && server.status !== 'online')} onClick={() => supportsServiceControls ? queueAgentUpdate() : copyUpdateCommand(manualUpdateCommand)} className="liquid-button shrink-0 disabled:cursor-not-allowed disabled:opacity-50">
                  {queueingAgentUpdate ? <LoaderCircle className="h-4 w-4 animate-spin" /> : supportsServiceControls ? <RefreshCw className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {queueingAgentUpdate ? 'Queueing…' : supportsServiceControls ? 'Update agent now' : 'Copy update command'}
                </button>
              </div>
            </div>
          )}
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
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }} className="w-full rounded-full border border-[var(--border-color)] bg-[var(--background)] py-2 text-sm text-[var(--foreground)] outline-none focus:border-blue-500 sm:w-64" placeholder={serviceContent.search} />
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
                const serviceIsControllable = server.status === 'online'
                  && supportsServiceControls
                  && ['running', 'stopped'].includes(service.status)
                  && service.source === serviceManager;
                const serviceActions: Array<{action: ServiceAction, label: string, icon: typeof Play, tone: string, disabled: boolean, unavailableReason?: string}> = [
                  {
                    action: 'start',
                    label: 'Start',
                    icon: Play,
                    tone: 'text-emerald-500 hover:border-emerald-500/50 hover:bg-emerald-500/10',
                    disabled: !serviceIsControllable || service.status === 'running',
                  },
                  {
                    action: 'stop',
                    label: 'Stop',
                    icon: Square,
                    tone: 'text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/10',
                    disabled: !serviceIsControllable || service.status !== 'running',
                  },
                  {
                    action: 'restart',
                    label: 'Restart',
                    icon: RotateCw,
                    tone: 'text-amber-500 hover:border-amber-500/50 hover:bg-amber-500/10',
                    disabled: !serviceIsControllable,
                  },
                  {
                    action: 'reload',
                    label: 'Reload',
                    icon: RefreshCw,
                    tone: 'text-blue-500 hover:border-blue-500/50 hover:bg-blue-500/10',
                    disabled: !serviceIsControllable || service.status !== 'running' || service.source === 'windows-scm',
                    unavailableReason: service.source === 'windows-scm' ? 'Windows SCM does not provide a generic reload action.' : undefined,
                  },
                ];
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
                      <div><dt className="text-[var(--color-muted)]">Manager</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.source === 'windows-scm' ? 'Windows SCM' : service.source || `${serviceManager} (legacy snapshot)`}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">{osFamily === 'macos' ? 'Loading model' : 'Startup'}</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.startup_type || 'Unknown'}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">{osFamily === 'macos' ? 'launchd state' : 'Native state'}</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{service.sub_status || '—'}</dd></div>
                      <div><dt className="text-[var(--color-muted)]">Checked</dt><dd className="mt-1 font-medium text-[var(--foreground)]">{formatTimestamp(service.last_checked_at)}</dd></div>
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--border-color)] pt-4">
                      {serviceActions.map(({ action, label, icon: Icon, tone, disabled, unavailableReason }) => (
                        <button
                          key={action}
                          type="button"
                          disabled={disabled}
                          title={unavailableReason || (!supportsServiceControls ? `Update the agent to version ${MIN_SERVICE_CONTROL_AGENT_VERSION} or newer.` : server.status !== 'online' ? 'The agent must be online.' : `${label} ${service.display_name || service.name}`)}
                          onClick={() => setServiceActionRequest({ action, service })}
                          className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold transition-colors ${tone} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border-color)] disabled:hover:bg-transparent`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
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

      {serviceActionRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="service-action-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl">
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] p-6">
              <RotateCw className="h-5 w-5 text-blue-500" />
              <h2 id="service-action-title" className="text-xl font-semibold capitalize text-[var(--foreground)]">{serviceActionRequest.action} service?</h2>
            </div>
            <div className="p-6">
              <p className="leading-6 text-[var(--color-muted)]">
                Send <strong className="text-[var(--foreground)]">{serviceActionRequest.action}</strong> to{' '}
                <strong className="text-[var(--foreground)]">{serviceActionRequest.service.display_name || serviceActionRequest.service.name}</strong> through {serviceActionRequest.service.source}.
              </p>
              <p className="mt-3 font-mono text-xs text-[var(--color-muted)]">{serviceActionRequest.service.name}</p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={serviceActionBusy} onClick={() => setServiceActionRequest(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background)] disabled:opacity-50">
                  Cancel
                </button>
                <button type="button" disabled={serviceActionBusy} onClick={handleServiceAction} className="liquid-button disabled:cursor-not-allowed disabled:opacity-50">
                  {serviceActionBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="capitalize">{serviceActionBusy ? 'Waiting for agent…' : `${serviceActionRequest.action} service`}</span>
                </button>
              </div>
            </div>
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
