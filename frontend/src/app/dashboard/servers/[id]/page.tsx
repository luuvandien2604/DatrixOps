'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Cpu, HardDrive, Activity, ShieldCheck, Box, Server as ServerIcon, TerminalSquare, CalendarClock, Network, Search, CircleCheck, CircleX, CircleHelp, Play, Square, RotateCw, RefreshCw, LoaderCircle, Copy } from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import WebTerminal from '@/components/WebTerminal';
import CustomSelect from '@/components/CustomSelect';

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
  external_id?: string;
  source: string;
  owner?: string;
  schedule: string;
  command: string;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  last_status?: string;
  discovered_at: string;
  executions?: CronExecution[];
}

interface CronExecution {
  id: string;
  started_at: string;
  completed_at?: string;
  status: string;
  exit_code?: number;
  output?: string;
  created_at: string;
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
  latest_agent_version?: string;
  update_available?: boolean;
  auto_update_agent?: boolean;
  active_agent_update_task?: AgentUpdateTask;
  os_info?: string | {
    os_name?: string;
    os_family?: string;
    platform?: string;
    version?: string;
    cpu_usage?: number;
    memory_used?: number;
    memory_total?: number;
    disk_used?: number;
    disk_total?: number;
    disk_usage?: number;
    terminal_channel_connected?: boolean;
    terminal_channel_error?: string;
    terminal_supported?: boolean;
    terminal_unsupported_reason?: string;
  };
  snapshot?: string;
  inventory?: string;
  inventory_updated_at?: string;
  provider?: string;
  region?: string;
  environment?: string;
}

interface AgentUpdateTask {
  id: string;
  status: string;
  result?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string;
}

interface ScriptPolicy {
  id: string;
  name: string;
  description: string;
  os_family: string;
  category: string;
  requires_confirmation: boolean;
  timeout_seconds: number;
  output_limit_bytes: number;
}

interface ScriptRunState {
  taskId?: string;
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed' | 'expired' | 'timed_out';
  result?: string;
}

type ServiceAction = 'start' | 'stop' | 'restart' | 'reload';

const MIN_SERVICE_CONTROL_AGENT_VERSION = '1.3.0';
const MIN_TERMINAL_AGENT_VERSION = '1.4.1';
const MIN_SCRIPT_LIBRARY_AGENT_VERSION = '1.5.2';

const versionAtLeast = (current: string | undefined, minimum: string) => {
  if (!current) return false;
  const parse = (value: string) => value.replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
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
  const [copiedUpdateCommand, setCopiedUpdateCommand] = useState(false);
  const [copiedCronCommandId, setCopiedCronCommandId] = useState<string | null>(null);
  const [queueingAgentUpdate, setQueueingAgentUpdate] = useState(false);
  const [agentUpdateTask, setAgentUpdateTask] = useState<AgentUpdateTask | null>(null);
  const [savingAutoUpdate, setSavingAutoUpdate] = useState(false);
  const [scriptLibrary, setScriptLibrary] = useState<ScriptPolicy[]>([]);
  const [scriptRuns, setScriptRuns] = useState<Record<string, ScriptRunState>>({});
  const [scriptLibraryError, setScriptLibraryError] = useState<string | null>(null);

  const [userRole, setUserRole] = useState<string>('user');
  useEffect(() => {
    setUserRole(getUserRole());
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';
  const isViewer = userRole === 'viewer';

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'terminal') {
      setActiveTab('terminal');
    }
    fetchServer();
    const interval = setInterval(fetchServer, 20_000); // refresh every 20s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!agentUpdateTask || ['completed', 'failed', 'expired', 'timed_out'].includes(agentUpdateTask.status)) {
      return;
    }
    const interval = window.setInterval(async () => {
      try {
        const [task] = await Promise.all([
          apiClient(`/servers/${params.id}/tasks/${agentUpdateTask.id}`),
          fetchServer(),
        ]);
        setAgentUpdateTask(task);
        if (task.status === 'completed') {
          toast.success('Agent update completed and confirmed by heartbeat');
        } else if (['failed', 'expired', 'timed_out'].includes(task.status)) {
          toast.error(task.result || `Agent update ${task.status}`);
        }
      } catch (error: any) {
        toast.error(error.message || 'Unable to refresh agent update status');
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [agentUpdateTask, params.id]);

  const fetchServer = async () => {
    try {
      const data = await apiClient(`/servers/${params.id}`);
      setServer(data);
      setAgentUpdateTask(data.active_agent_update_task || null);
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
      try {
        const scripts = await apiClient(`/servers/${params.id}/scripts`);
        setScriptLibrary(Array.isArray(scripts) ? scripts : []);
        setScriptLibraryError(null);
      } catch (scriptError: any) {
        console.error('Unable to load script library', scriptError);
        setScriptLibrary([]);
        setScriptLibraryError(scriptError.message || 'Unable to load script library');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDockerAction = async (action: string, containerId: string) => {
    if (isViewer) {
      toast.error('Docker container actions require Operator or Admin role permission.');
      return;
    }
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
    if (isViewer) {
      toast.error('System service actions require Operator or Admin role permission.');
      return;
    }

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

  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

  const cronWrapperCommand = (job: CronJob) => {
    if (!job.external_id) {
      return '';
    }
    return `datrixops-agent cron-run --external-id ${job.external_id} -- /bin/sh -lc ${shellQuote(job.command)}`;
  };

  const copyCronWrapperCommand = async (job: CronJob) => {
    const command = cronWrapperCommand(job);
    if (!command) {
      toast.error('Telemetry ID is unavailable for this cron job');
      return;
    }
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCronCommandId(job.id);
      window.setTimeout(() => setCopiedCronCommandId(current => current === job.id ? null : current), 2000);
      toast.success('Cron telemetry wrapper copied');
    } catch {
      toast.error('Unable to copy the cron wrapper command');
    }
  };

  const queueAgentUpdate = async () => {
    if (!server) return;
    if (isViewer) {
      toast.error('Agent update requires Operator or Admin role permission.');
      return;
    }
    setQueueingAgentUpdate(true);
    try {
      await apiClient(`/servers/${server.id}/tasks`, {
        method: 'POST',
        data: { type: 'agent_update', payload: '{}', timeout_seconds: 300 },
      }).then(task => {
        setAgentUpdateTask(task);
      });
      toast.success(`Agent update queued for ${server.name}`);
      await fetchServer();
    } catch (err: any) {
      toast.error(err.message || 'Unable to queue agent update');
    } finally {
      setQueueingAgentUpdate(false);
    }
  };

  const setAgentAutoUpdate = async (enabled: boolean) => {
    if (!server || savingAutoUpdate) return;
    setSavingAutoUpdate(true);
    try {
      await apiClient(`/servers/${server.id}/agent-update-policy`, {
        method: 'PUT',
        data: { enabled },
      });
      setServer(current => current ? { ...current, auto_update_agent: enabled } : current);
      toast.success(enabled ? 'Automatic Agent updates enabled' : 'Automatic Agent updates disabled');
      await fetchServer();
    } catch (error: any) {
      toast.error(error.message || 'Unable to change the automatic update policy');
    } finally {
      setSavingAutoUpdate(false);
    }
  };

  const runAllowlistedScript = async (script: ScriptPolicy) => {
    if (!server) return;
    if (server.status !== 'online') {
      toast.error('The agent must be online before a script can run');
      return;
    }
    if (script.os_family !== osFamily) {
      toast.error('This script is not available for this operating system');
      return;
    }
    if (!supportsScriptLibrary) {
      toast.error(`Script Library requires Agent ${MIN_SCRIPT_LIBRARY_AGENT_VERSION} or newer${reportedAgentVersion ? ` (current ${reportedAgentVersion})` : ''}`);
      return;
    }
    if (script.requires_confirmation && !window.confirm(`Run "${script.name}" on ${server.name}? This action is audited and limited to the allowlisted command.`)) {
      return;
    }

    setScriptRuns(current => ({
      ...current,
      [script.id]: { status: 'pending', result: 'Queued. Waiting for the agent to claim the task…' },
    }));

    try {
      const task = await apiClient(`/servers/${server.id}/tasks`, {
        method: 'POST',
        data: {
          type: 'script_run',
          payload: JSON.stringify({
            script_id: script.id,
            confirmed: script.requires_confirmation,
          }),
          timeout_seconds: script.timeout_seconds,
          idempotency_key: `script-${script.id}-${Date.now()}`,
        },
      });
      setScriptRuns(current => ({
        ...current,
        [script.id]: { taskId: task.id, status: task.status || 'pending', result: 'Task queued. Waiting for output…' },
      }));

      const maxAttempts = Math.max(8, Math.ceil((script.timeout_seconds + 10) / 2));
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 2000));
        const result = await apiClient(`/servers/${server.id}/tasks/${task.id}`);
        const status = result.status as ScriptRunState['status'];
        setScriptRuns(current => ({
          ...current,
          [script.id]: {
            taskId: task.id,
            status,
            result: result.result || (status === 'processing' ? 'Running on agent…' : 'Waiting for agent…'),
          },
        }));
        if (status === 'completed') {
          toast.success(`${script.name} completed`);
          return;
        }
        if (['failed', 'expired', 'timed_out'].includes(status)) {
          toast.error(`${script.name}: ${status}`);
          return;
        }
      }

      setScriptRuns(current => ({
        ...current,
        [script.id]: {
          taskId: task.id,
          status: 'timed_out',
          result: 'Timed out waiting for the task result. The backend timeout policy still applies.',
        },
      }));
      toast.error(`${script.name}: timed out waiting for result`);
    } catch (error: any) {
      setScriptRuns(current => ({
        ...current,
        [script.id]: { status: 'failed', result: error.message || 'Unable to queue script task' },
      }));
      toast.error(error.message || 'Unable to queue script task');
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

  const cronStatusMeta = (job: CronJob) => {
    if (!job.enabled) {
      return {
        label: 'Disabled',
        className: 'border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--color-muted)]',
      };
    }
    if (!job.last_status) {
      return {
        label: 'Not instrumented',
        className: 'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      };
    }
    const normalized = job.last_status.toLowerCase();
    if (normalized.includes('success') || normalized.includes('ok') || normalized.includes('completed')) {
      return {
        label: job.last_status,
        className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      };
    }
    if (normalized.includes('fail') || normalized.includes('error')) {
      return {
        label: job.last_status,
        className: 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-300',
      };
    }
    return {
      label: job.last_status,
      className: 'border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--foreground)]',
    };
  };

  const cronExecutionStatusClass = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'completed') {
      return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
    }
    if (normalized === 'failed' || normalized === 'timed_out') {
      return 'border-rose-500/35 bg-rose-500/10 text-rose-600 dark:text-rose-300';
    }
    return 'border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--color-muted)]';
  };

  const formatExecutionDuration = (execution: CronExecution) => {
    if (!execution.started_at || !execution.completed_at) {
      return 'Duration unknown';
    }
    const started = new Date(execution.started_at).getTime();
    const completed = new Date(execution.completed_at).getTime();
    if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) {
      return 'Duration unknown';
    }
    const seconds = Math.max(0, Math.round((completed - started) / 1000));
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}m ${remainder}s`;
  };

  const reportedServices = snapshot?.services || [];
  const reportedServiceManager = reportedServices.find(service => service.source)?.source;
  const parsedOSInfo = (() => {
    if (!server.os_info) return {};
    if (typeof server.os_info === 'object') return server.os_info;
    try {
      return JSON.parse(server.os_info) as {
        os_name?: string;
        os_family?: string;
        platform?: string;
        version?: string;
        cpu_usage?: number;
        memory_used?: number;
        memory_total?: number;
        disk_used?: number;
        disk_total?: number;
        disk_usage?: number;
        terminal_channel_connected?: boolean;
        terminal_channel_error?: string;
        terminal_supported?: boolean;
        terminal_unsupported_reason?: string;
      };
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
  const terminalSupportReported = typeof parsedOSInfo.terminal_supported === 'boolean';
  const terminalUnsupportedReasonReported = typeof parsedOSInfo.terminal_unsupported_reason === 'string'
    ? parsedOSInfo.terminal_unsupported_reason.trim()
    : '';
  const terminalEnvironmentUnsupported = terminalSupportReported
    ? parsedOSInfo.terminal_supported === false
    : osFamily !== 'linux';
  const supportsTerminalEnvironment = !terminalEnvironmentUnsupported;
  const terminalChannelConnected = parsedOSInfo.terminal_channel_connected === true;
  const terminalChannelReported = typeof parsedOSInfo.terminal_channel_connected === 'boolean';
  const terminalChannelError = typeof parsedOSInfo.terminal_channel_error === 'string'
    ? parsedOSInfo.terminal_channel_error.trim()
    : '';
  const terminalChannelDiagnostic = (() => {
    const normalized = terminalChannelError.toLowerCase();
    if (!normalized) {
      return 'Retry the connection. If it still fails, inspect the Agent log for “Terminal channel disconnected”.';
    }
    if (normalized.includes('http 401')) {
      return `The terminal endpoint rejected the Agent Token. Confirm that heartbeat and terminal use the same API host, then restart the Agent. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('http 403')) {
      return `The WebSocket handshake was blocked. Check Cloudflare/WAF rules and the origin proxy. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('http 400')) {
      return `The proxy reached the Backend but did not preserve the WebSocket Upgrade handshake. Deploy the DatrixOps gateway on port 3000, then restart the Agent. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('http 426') || normalized.includes('websocket_upgrade_required')) {
      return `The public origin bypassed the WebSocket gateway. Route it to the bundled Caddy service on port 3000, then restart the Agent. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('http 200') || normalized.includes('http 404')) {
      return `The request did not reach the WebSocket upgrade handler. Route /api/v1/agent/terminal directly to the Backend with Upgrade headers. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('http 502') || normalized.includes('http 503')) {
      return `The proxy could not reach the Backend terminal handler. Check Backend health and upstream routing. Diagnostic: ${terminalChannelError}`;
    }
    if (normalized.includes('timeout') || normalized.includes('tls') || normalized.includes('certificate')) {
      return `The Agent could not complete the secure WebSocket connection. Check DNS, time, CA certificates, firewall, and proxy timeout. Diagnostic: ${terminalChannelError}`;
    }
    return `Agent diagnostic: ${terminalChannelError}`;
  })();
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
  const terminalTabLabel = terminalEnvironmentUnsupported ? 'Terminal · Not supported' : 'Terminal';
  const tabs: Array<[string, string]> = [
    ['overview', 'Overview'],
    ['inventory', 'Inventory'],
    ...(osFamily === 'windows' ? [] : [['cron', osFamily === 'macos' ? 'Cron Jobs' : 'Cron Monitoring'] as [string, string]]),
    ['scripts', 'Script Library'],
    ['processes', 'Processes'],
    ['services', serviceContent.tab],
    ['docker', osFamily === 'macos' || osFamily === 'windows' ? 'Containers' : 'Docker'],
    ['terminal', terminalTabLabel],
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
  const supportsScriptLibrary = versionAtLeast(reportedAgentVersion, MIN_SCRIPT_LIBRARY_AGENT_VERSION);
  const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
  const updateAvailable = Boolean(server.update_available && latestAgentVersion);
  const agentUpdateInProgress = Boolean(agentUpdateTask && ['pending', 'processing'].includes(agentUpdateTask.status));
  const agentUpdateStalled = Boolean(agentUpdateTask?.status === 'completed' && updateAvailable);
  const agentUpdateFailed = Boolean(agentUpdateTask && (['failed', 'expired', 'timed_out'].includes(agentUpdateTask.status) || agentUpdateStalled));
  const agentUpdateCompleted = Boolean(agentUpdateTask && !updateAvailable);
  const AgentUpdateIcon = agentUpdateInProgress ? LoaderCircle : agentUpdateCompleted ? CircleCheck : agentUpdateFailed ? CircleX : RefreshCw;
  const agentUpdateLabel = agentUpdateInProgress
    ? agentUpdateTask?.status === 'processing' ? 'Updating agent...' : 'Queued...'
    : agentUpdateCompleted
      ? 'Update confirmed'
      : agentUpdateFailed
        ? 'Retry update'
        : 'Update agent';
  const totalCPUUsage = parsedOSInfo.cpu_usage;
  const totalMemoryUsage = parsedOSInfo.memory_total && parsedOSInfo.memory_total > 0
    ? (Number(parsedOSInfo.memory_used || 0) / Number(parsedOSInfo.memory_total)) * 100
    : undefined;
  const controlPlaneOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const manualUpdateCommand = osFamily === 'windows'
    ? `& ([scriptblock]::Create((irm ${controlPlaneOrigin}/update-agent.ps1))) -ServerUrl ${controlPlaneOrigin}`
    : `curl -fsSL ${controlPlaneOrigin}/update-agent.sh | sudo sh -s -- ${controlPlaneOrigin}`;
  const terminalDisabledReason = (() => {
    if (terminalEnvironmentUnsupported) {
      if (terminalUnsupportedReasonReported) {
        return terminalUnsupportedReasonReported;
      }
      if (osFamily === 'windows') {
        return 'Web Terminal is not supported on Windows agents. The Agent service runs outside the signed-in desktop session.';
      }
      if (osFamily === 'macos') {
        return 'Web Terminal is not supported on macOS agents. The launchd service runs outside the signed-in desktop session.';
      }
      return 'Web Terminal is supported only on Linux server agents.';
    }
    if (server.status !== 'online') {
      return 'The agent must be online before a terminal session can start.';
    }
    if (!versionAtLeast(reportedAgentVersion, MIN_TERMINAL_AGENT_VERSION)) {
      return `Agent ${MIN_TERMINAL_AGENT_VERSION} or newer is required for reverse terminal support.`;
    }
    if (!terminalChannelReported) {
      return 'This agent version does not report reverse terminal channel health. Update the agent to the latest patch release before opening Web Terminal.';
    }
    return undefined;
  })();
  const terminalCanAttempt = server.status === 'online'
    && versionAtLeast(reportedAgentVersion, MIN_TERMINAL_AGENT_VERSION)
    && supportsTerminalEnvironment
    && terminalChannelReported;
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
  const scriptRunStatusClass = (status?: ScriptRunState['status']) => {
    switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
    case 'failed':
    case 'expired':
    case 'timed_out':
      return 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300';
    case 'pending':
    case 'processing':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300';
    default:
      return 'border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--color-muted)]';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <button onClick={() => router.push('/dashboard/servers')} aria-label="Back to servers" className="mt-1 rounded-full border border-[var(--border-color)] bg-[var(--background-card)] p-2.5 text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)] shrink-0">
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
              {supportsServiceControls && updateAvailable && (
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-semibold text-amber-700 dark:text-amber-400">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Update available: {latestAgentVersion}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Metrics Button */}
        <button
          type="button"
          onClick={() => router.push(`/dashboard/monitoring?server_id=${server?.id || params.id}`)}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/20 shrink-0 self-start sm:self-center cursor-pointer"
        >
          <Activity className="w-4 h-4" /> View Metrics
        </button>
      </div>

      <div role="tablist" aria-label="Server detail views" className="flex gap-4 overflow-x-auto border-b border-[var(--border-color)]">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)} className={`whitespace-nowrap pb-3 text-sm font-semibold transition-colors ${activeTab === key ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {!supportsServiceControls && (
            <section aria-labelledby="agent-update-required-title" className="rounded-2xl border border-amber-500/40 bg-[var(--background-card)] p-5 shadow-lg shadow-black/5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-full border border-amber-500/30 bg-amber-500/15 p-2 text-[var(--amber)]">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 id="agent-update-required-title" className="text-base font-bold text-[var(--foreground)]">
                        Agent update required
                      </h2>
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-[var(--amber)]">
                        Current: {reportedAgentVersion || 'Unknown'}
                      </span>
                      <span className="rounded-full border border-[var(--border-color)] bg-[var(--background)] px-2.5 py-1 text-xs font-bold text-[var(--foreground)]">
                        Required: {MIN_SERVICE_CONTROL_AGENT_VERSION}+
                      </span>
                    </div>
                    <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-[var(--foreground)] opacity-80">
                      Update this legacy agent once to enable Start, Stop, Restart, and Reload. The in-place updater preserves its token, registration, environment, and monitored services.
                    </p>
                    <div className="mt-4 flex max-w-3xl flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-2 sm:flex-row sm:items-center sm:pl-4">
                      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap px-2 py-1 text-xs font-bold text-[var(--foreground)] sm:text-sm">
                        {manualUpdateCommand}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyUpdateCommand(manualUpdateCommand)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--background-card)] px-4 py-2 text-sm font-bold text-[var(--foreground)] transition-colors hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedUpdateCommand ? 'Copied' : 'Copy command'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
          {supportsServiceControls && updateAvailable && (
            <section aria-labelledby="agent-update-available-title" className="rounded-2xl border border-amber-500/35 bg-[var(--background-card)] p-5 shadow-lg shadow-black/5 sm:p-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-full border border-amber-500/30 bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
                    <RefreshCw className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="agent-update-available-title" className="text-base font-bold text-[var(--foreground)]">
                      Agent update available
                    </h2>
                    <p className="mt-2 text-sm font-medium leading-6 text-[var(--color-muted)]">
                      This server is running Agent {reportedAgentVersion || 'Unknown'}. The current release is Agent {latestAgentVersion}.
                    </p>
                    {agentUpdateTask && (
                      <p className={`mt-2 text-sm font-semibold ${agentUpdateFailed ? 'text-rose-500' : agentUpdateCompleted ? 'text-emerald-500' : 'text-amber-600 dark:text-amber-300'}`}>
                        {agentUpdateCompleted
                          ? 'Update confirmed by the latest heartbeat.'
                          : agentUpdateFailed
                            ? agentUpdateStalled
                              ? 'The update was staged, but the agent is still reporting the old version. Retry the update to restart the service with the new binary.'
                              : agentUpdateTask.result || `Update task ${agentUpdateTask.status}.`
                            : agentUpdateTask.status === 'processing'
                              ? 'The agent has claimed the task. Waiting for restart and version confirmation.'
                              : 'Update task is queued. Waiting for the next agent heartbeat.'}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={queueingAgentUpdate || agentUpdateInProgress || server.status !== 'online'}
                  onClick={queueAgentUpdate}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-amber-500/45 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:bg-amber-500/15 disabled:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 dark:disabled:text-amber-300"
                >
                  <AgentUpdateIcon className={`h-4 w-4 ${queueingAgentUpdate || agentUpdateInProgress ? 'animate-spin' : ''}`} />
                  {queueingAgentUpdate ? 'Queueing update...' : agentUpdateLabel}
                </button>
              </div>
            </section>
          )}

          {/* Section 1: Real-Time Telemetry Parameters */}
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5 shadow-lg">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-400" /> Real-Time Telemetry Parameters
              </span>
              <span className="text-[10px] font-mono text-[var(--color-muted)] font-normal">
                Node IP: {server.ip_address || server.id}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* CPU Usage */}
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>CPU USAGE</span>
                  <span className={totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                    {totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'HIGH' : 'NORMAL'}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-400' : 'text-[var(--foreground)]'}`}>
                  {totalCPUUsage !== undefined ? `${totalCPUUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5 mt-3">
                  <div
                    className={`h-full rounded-full ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(totalCPUUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* RAM Usage */}
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>RAM USAGE</span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {parsedOSInfo.memory_total && parsedOSInfo.memory_used ? `${(parsedOSInfo.memory_used / (1024 * 1024 * 1024)).toFixed(1)} / ${(parsedOSInfo.memory_total / (1024 * 1024 * 1024)).toFixed(1)} GB` : ''}
                  </span>
                </div>
                <div className="text-2xl font-bold text-[var(--foreground)]">
                  {totalMemoryUsage !== undefined ? `${totalMemoryUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5 mt-3">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(totalMemoryUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Disk Usage */}
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>DISK USAGE</span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {parsedOSInfo.disk_total ? `${formatBytes(parsedOSInfo.disk_used)} / ${formatBytes(parsedOSInfo.disk_total)}` : ''}
                  </span>
                </div>
                <div className="text-2xl font-bold text-[var(--foreground)]">
                  {parsedOSInfo.disk_usage !== undefined ? `${parsedOSInfo.disk_usage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/5 mt-3">
                  <div
                    className={`h-full rounded-full ${Number(parsedOSInfo.disk_usage || 0) >= 90 ? 'bg-rose-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(Number(parsedOSInfo.disk_usage || 0), 100)}%` }}
                  />
                </div>
              </div>

              {/* Uptime */}
              <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>UPTIME</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> ONLINE
                  </span>
                </div>
                <div className="text-xl font-bold text-emerald-400 mt-1">
                  {snapshot?.system_info?.uptime ? formatUptime(snapshot.system_info.uptime) : '—'}
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-3">
                  Heartbeat Active
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Static System Information & Package Security */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* System Information */}
            <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
              <h3 className="text-xs font-bold text-[var(--color-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
                <Cpu className="w-4 h-4 text-blue-400" /> System Specification & Environment
              </h3>
              <div className="space-y-3.5 text-sm">
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-[var(--color-muted)]">Operating System</span>
                  <span className="font-semibold text-[var(--foreground)]">{parsedOSInfo.os_name || monitoredOS || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-[var(--color-muted)]">Agent Version</span>
                  <span className={`font-semibold ${reportedAgentVersion ? 'text-blue-400' : 'text-amber-500'}`}>
                    {reportedAgentVersion || 'Not reported'}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-[var(--color-muted)]">Kernel Version</span>
                  <span className="font-mono text-[var(--foreground)]">{snapshot?.system_info?.kernel || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">Virtualization Platform</span>
                  <span className="font-semibold text-[var(--foreground)] uppercase">{snapshot?.system_info?.virtualization || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Package Updates & Fleet Security */}
            <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--color-muted)] mb-4 flex items-center gap-2 uppercase tracking-wider">
                  <Box className="w-4 h-4 text-blue-400" /> Package Updates & Security Status
                </h3>
                <div className="flex items-center gap-4 mt-2">
                  <div className="p-3.5 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
                    <ShieldCheck className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-muted)] font-medium">Packages awaiting upgrade</p>
                    <div className="text-2xl font-bold text-[var(--foreground)] font-mono mt-0.5">
                      {snapshot?.package_update || 0} <span className="text-sm font-normal text-[var(--color-muted)]">packages</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">Fleet Security policy</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CircleCheck className="w-3.5 h-3.5" /> Compliant
                </span>
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
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Schedules are reported by the agent. Copy a wrapper command into crontab to report real last-run time and exit status.
              {' '}<Link href="/docs/server-management/cron-telemetry" className="font-semibold text-[var(--accent-primary)] underline-offset-4 hover:underline">Read the migration guide</Link>.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-[var(--background)] text-[var(--color-muted)]">
                <tr><th className="px-6 py-3">Schedule</th><th className="px-6 py-3">Command</th><th className="px-6 py-3">Source</th><th className="px-6 py-3">Owner</th><th className="px-6 py-3">Last run</th><th className="px-6 py-3">Next run</th><th className="px-6 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {cronJobs.map(job => {
                  const statusMeta = cronStatusMeta(job);
                  const executions = job.executions || [];
                  return (
                    <React.Fragment key={job.id}>
                      <tr>
                        <td className="px-6 py-4"><code className="rounded bg-[var(--background)] px-2 py-1 font-semibold text-[var(--foreground)]">{job.schedule}</code></td>
                        <td className="max-w-md break-all px-6 py-4 font-mono text-xs text-[var(--foreground)]">
                          {job.command}
                          {job.external_id && (
                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--color-muted)]">
                              <span>Telemetry ID <code className="rounded bg-[var(--background)] px-1.5 py-0.5">{job.external_id.slice(0, 12)}</code></span>
                              <button
                                type="button"
                                onClick={() => copyCronWrapperCommand(job)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-color)] bg-[var(--surface-2)] px-2 py-1 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                                aria-label={`Copy cron telemetry wrapper for ${job.schedule}`}
                              >
                                <Copy className="h-3 w-3" />
                                {copiedCronCommandId === job.id ? 'Copied' : 'Copy wrapper'}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-[var(--color-muted)]">{job.source}</td>
                        <td className="px-6 py-4 text-[var(--color-muted)]">{job.owner || 'Unknown'}</td>
                        <td className="px-6 py-4 text-[var(--color-muted)]">{formatTimestamp(job.last_run_at)}</td>
                        <td className="px-6 py-4 text-[var(--color-muted)]">{formatTimestamp(job.next_run_at)}</td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>{statusMeta.label}</span>
                        </td>
                      </tr>
                      {executions.length > 0 && (
                        <tr className="bg-[var(--background)]/45">
                          <td className="px-6 pb-4 pt-0 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Recent runs</td>
                          <td colSpan={6} className="px-6 pb-4 pt-0">
                            <div className="grid gap-2">
                              {executions.slice(0, 3).map(execution => (
                                <div key={execution.id} className="grid gap-3 rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] px-3 py-2 text-xs md:grid-cols-[160px_120px_90px_1fr]">
                                  <span className="font-mono text-[var(--color-muted)]">{formatTimestamp(execution.started_at)}</span>
                                  <span className={`w-fit rounded-full border px-2 py-0.5 font-semibold ${cronExecutionStatusClass(execution.status)}`}>{execution.status}</span>
                                  <span className="font-mono text-[var(--foreground)]">exit {execution.exit_code ?? '—'}</span>
                                  <span className="truncate font-mono text-[var(--color-muted)]">{formatExecutionDuration(execution)}{execution.output ? ` · ${execution.output}` : ''}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!cronJobs.length && <tr><td colSpan={7} className="px-6 py-10 text-center text-[var(--color-muted)]">No cron jobs have been reported by this server.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'scripts' && (
        <div className="space-y-5">
          <section className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)]">
            <div className="flex flex-col gap-3 border-b border-[var(--border-color)] p-5 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
                  <TerminalSquare className="h-4 w-4 text-[var(--accent-primary)]" />
                  Allowlisted Script Library
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-muted)]">
                  Scripts are predefined by the control plane, validated by backend policy, executed with a per-script timeout and output cap, and audited as server tasks.
                </p>
              </div>
              <span className="w-fit rounded-md border border-[var(--border-color)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--color-muted)]">
                {scriptLibrary.length} allowlisted
              </span>
            </div>

            {osFamily === 'linux' && !supportsScriptLibrary && (
              <div className="border-b border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm font-medium text-amber-700 dark:text-amber-300">
                Script Library requires Agent {MIN_SCRIPT_LIBRARY_AGENT_VERSION} or newer. This server reports Agent {reportedAgentVersion || 'Unknown'}.
              </div>
            )}

            {osFamily !== 'linux' ? (
              <div className="p-8 text-sm leading-6 text-[var(--color-muted)]">
                Script Library is currently enabled only for Linux agents. {osFamily === 'windows' ? 'Windows' : osFamily === 'macos' ? 'macOS' : 'Unknown OS'} agents stay read-only until a native allowlist is defined for that platform.
              </div>
            ) : scriptLibraryError ? (
              <div className="p-8 text-sm font-medium text-rose-500">{scriptLibraryError}</div>
            ) : scriptLibrary.length === 0 ? (
              <div className="p-8 text-sm text-[var(--color-muted)]">No scripts are allowlisted for this server OS.</div>
            ) : (
              <div className="grid gap-4 p-5 xl:grid-cols-2">
                {scriptLibrary.map(script => {
                  const runState = scriptRuns[script.id] || { status: 'idle' as const };
                  const running = runState.status === 'pending' || runState.status === 'processing';
                  const disabled = running || server.status !== 'online' || !supportsScriptLibrary;
                  return (
                    <article key={script.id} className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] p-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-[var(--foreground)]">{script.name}</h4>
                            <span className="rounded border border-[var(--border-color)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                              {script.category}
                            </span>
                            {script.requires_confirmation && (
                              <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                Confirmation required
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">{script.description}</p>
                          <div className="mt-3 flex flex-wrap gap-2 font-mono text-[11px] text-[var(--color-muted)]">
                            <span>timeout={script.timeout_seconds}s</span>
                            <span>output_limit={script.output_limit_bytes}B</span>
                            <span>id={script.id}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => runAllowlistedScript(script)}
                          title={!supportsScriptLibrary ? `Update Agent to ${MIN_SCRIPT_LIBRARY_AGENT_VERSION}+ first` : server.status !== 'online' ? 'The agent must be online' : `Run ${script.name}`}
                          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                          {running ? 'Running' : supportsScriptLibrary ? 'Run' : 'Update agent'}
                        </button>
                      </div>

                      {runState.status !== 'idle' && (
                        <div className="mt-4 overflow-hidden rounded-lg border border-[var(--border-color)]">
                          <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--surface-2)] px-3 py-2">
                            <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold uppercase ${scriptRunStatusClass(runState.status)}`}>
                              {runState.status}
                            </span>
                            {runState.taskId && <code className="text-[11px] text-[var(--color-muted)]">task {runState.taskId.slice(0, 8)}</code>}
                          </div>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap bg-[var(--background)] p-3 font-mono text-xs leading-5 text-[var(--foreground)]">
                            {runState.result || 'Waiting for output…'}
                          </pre>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'processes' && (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: 'Total CPU usage',
                value: totalCPUUsage !== undefined ? `${totalCPUUsage.toFixed(1)}%` : 'Unavailable',
                detail: 'Current system-wide usage',
                tone: 'text-[var(--rose)]',
              },
              {
                label: 'Total RAM usage',
                value: totalMemoryUsage !== undefined ? `${totalMemoryUsage.toFixed(1)}%` : 'Unavailable',
                detail: parsedOSInfo.memory_total ? `${formatBytes(parsedOSInfo.memory_used)} of ${formatBytes(parsedOSInfo.memory_total)}` : 'Current system-wide usage',
                tone: 'text-[var(--violet)]',
              },
              {
                label: 'Processes shown',
                value: String(snapshot?.top_processes?.length || 0),
                detail: 'Highest resource consumers',
                tone: 'text-[var(--mint)]',
              },
            ].map(item => (
              <div key={item.label} className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5">
                <p className="text-sm font-semibold text-[var(--color-muted)]">{item.label}</p>
                <p className={`mt-2 text-2xl font-bold ${item.tone}`}>{item.value}</p>
                <p className="mt-1 text-xs font-medium text-[var(--color-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
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
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input value={serviceSearch} onChange={event => setServiceSearch(event.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }} className="w-full rounded-full border border-[var(--border-color)] bg-[var(--background)] py-2 text-sm text-[var(--foreground)] outline-none focus:border-blue-500 sm:w-64" placeholder={serviceContent.search} />
                </label>
                <CustomSelect
                  value={serviceFilter}
                  onChange={setServiceFilter}
                  options={[
                    { value: 'all', label: 'All statuses' },
                    { value: 'running', label: 'Running' },
                    { value: 'stopped', label: serviceContent.stopped },
                    { value: 'not_installed', label: serviceContent.missing },
                    { value: 'unknown', label: 'Unknown' },
                  ]}
                  className="w-48"
                />
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

      {activeTab === 'terminal' && (
        <WebTerminal
          serverId={server.id}
          serverName={server.name}
          enabled={terminalCanAttempt}
          unsupported={terminalEnvironmentUnsupported}
          disabledReason={terminalDisabledReason}
          channelConnected={terminalChannelConnected}
          channelDiagnostic={terminalChannelDiagnostic}
        />
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
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="service-action-title" className="ops-modal w-full max-w-md overflow-hidden">
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
                <button type="button" disabled={serviceActionBusy} onClick={handleServiceAction} className="ops-button disabled:cursor-not-allowed disabled:opacity-50">
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
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="container-logs-title" className="ops-modal flex max-h-[80vh] w-full max-w-4xl flex-col">
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
