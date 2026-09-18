'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Cpu, Activity, ShieldCheck, Box, Server as ServerIcon, Network, Search, CircleCheck, CircleX, CircleHelp, Play, Square, RotateCw, RefreshCw, LoaderCircle, Layers, Radio, Zap, ExternalLink, X, Plus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { apiClient, getUserRole } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import WebTerminal from '@/components/WebTerminal';
import CustomSelect from '@/components/CustomSelect';

interface NetworkTargetProbe {
  id: string;
  target_id?: string;
  name: string;
  tag: string;
  host: string;
  port: number;
  location?: string;
  is_gateway?: boolean;
  probe_method: string; // "ICMP" | "TCP"
  probe_status: string; // "success" | "timeout" | "refused" | "unavailable"
  total_probes: number;
  successful_probes: number;
  failed_probes: number;
  packet_loss: number | null; // null for TCP (N/A)
  latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  status: string; // "optimal" | "warning" | "critical" | "reachable" | "unreachable"
  error_message?: string;
}

interface NetworkPillarResult {
  status: string; // "optimal" | "warning" | "critical" | "unavailable" | "reachable"
  latency_ms: number;
  packet_loss: number | null;
  total_probes: number;
  successful_probes: number;
  failed_probes: number;
  measurement_method: string; // "ICMP" | "TCP" | "MIXED"
  summary: string;
}

interface NetworkAlertEvaluation {
  is_triggered: boolean;
  severity: 'none' | 'warning' | 'critical';
  reasons: string[];
  suggested_action?: string;
}

interface NetworkDiagnosticReport {
  server_id: string;
  server_name: string;
  timestamp: string;
  sample_size: number;
  gateway?: NetworkPillarResult;
  groups: Record<string, NetworkPillarResult>;
  group_order?: string[];
  probes: NetworkTargetProbe[];
  alert_evaluation: NetworkAlertEvaluation;
  server_telemetry?: {
    primary_uplink?: string;
    default_gateway?: string;
    gateway_latency_ms?: number;
    gateway_packet_loss?: number;
    dns_latency_ms?: number;
    dns_resolvable?: boolean;
    active_errors?: number;
    active_dropped?: number;
    lifetime_errors?: number;
    lifetime_dropped?: number;
    error_rate_per_min?: number;
    drop_rate_per_min?: number;
    status?: string;
    status_reason?: string;
  };
}

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

interface NetworkInterfaceInfo {
  name: string;
  is_physical: boolean;
  is_up: boolean;
  ip_addresses: string[];
  mac_address: string;
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  errors_in: number;
  errors_out: number;
  drop_in: number;
  drop_out: number;
  delta_errors_in: number;
  delta_errors_out: number;
  delta_drop_in: number;
  delta_drop_out: number;
  error_rate_per_min: number;
  drop_rate_per_min: number;
}

interface NetworkSample {
  timestamp: number;
  rx_bytes_per_sec: number;
  tx_bytes_per_sec: number;
  delta_drops: number;
  delta_errors: number;
  gateway_loss: number;
  gateway_latency_ms: number;
}

interface NetworkDiagnostics {
  status: 'healthy' | 'warning' | 'critical' | string;
  primary_uplink: string;
  default_gateway: string;
  gateway_reachable: boolean;
  gateway_packet_loss: number;
  gateway_latency_ms: number;
  dns_resolvable: boolean;
  dns_latency_ms: number;
  internet_connected: boolean;
  transient_errors: boolean;
  persistent_errors: boolean;
  diagnosis: string;
  recent_samples?: NetworkSample[];
  interfaces?: NetworkInterfaceInfo[];
}

interface Snapshot {
  os_family?: string;
  system_info?: SystemInfo;
  inventory?: Inventory;
  top_processes?: TopProcess[];
  services?: ServiceStatus[];
  docker_containers?: DockerContainer[];
  package_update?: number;
  network_diagnostics?: NetworkDiagnostics;
  network_interfaces?: NetworkInterfaceInfo[];
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

type ServiceAction = 'start' | 'stop' | 'restart' | 'reload';

const MIN_SERVICE_CONTROL_AGENT_VERSION = '1.3.0';
const MIN_TERMINAL_AGENT_VERSION = '1.4.1';

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const versionAtLeast = (current: string | undefined, minimum: string) => {
  if (!current || current === 'dev') return true;
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
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const [logsModal, setLogsModal] = useState<{isOpen: boolean, containerId: string, logs: string, loading: boolean}>({isOpen: false, containerId: '', logs: '', loading: false});
  const [serviceActionRequest, setServiceActionRequest] = useState<{action: ServiceAction, service: ServiceStatus} | null>(null);
  const [serviceActionBusy, setServiceActionBusy] = useState(false);
  const [queueingAgentUpdate, setQueueingAgentUpdate] = useState(false);
  const [agentUpdateTask, setAgentUpdateTask] = useState<AgentUpdateTask | null>(null);
  const [netReport, setNetReport] = useState<NetworkDiagnosticReport | null>(null);
  const [netTargetFilter, setNetTargetFilter] = useState<string>('all');
  const [historyTargetProbe, setHistoryTargetProbe] = useState<NetworkTargetProbe | null>(null);
  const [historyData, setHistoryData] = useState<{ id: string; latency_ms?: number; packet_loss?: number; measured_at: string; status: string; successful_probes: number; total_probes: number }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyRange, setHistoryRange] = useState<'6h' | '24h' | '7d'>('24h');

  const openProbeHistory = async (probe: NetworkTargetProbe, range: '6h' | '24h' | '7d' = '24h') => {
    const targetId = probe.target_id || probe.id;
    setHistoryTargetProbe(probe);
    setHistoryRange(range);
    setLoadingHistory(true);
    try {
      const now = new Date();
      let fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (range === '6h') fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      else if (range === '7d') fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const data = (await apiClient(`/network-targets/${targetId}/history?from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=150`)) as { id: string; latency_ms?: number; packet_loss?: number; measured_at: string; status: string; successful_probes: number; total_probes: number }[];
      setHistoryData(data || []);
    } catch {
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  useEffect(() => {
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isViewer = userRole === 'viewer';

  const fetchServer = useCallback(async () => {
    try {
      const data: ServerDetails = await apiClient(`/servers/${params.id}`);
      setServer(data);
      setAgentUpdateTask(data.active_agent_update_task || null);
      if (data.snapshot && data.snapshot !== '{}') {
        const nextSnapshot = JSON.parse(data.snapshot) as Snapshot;
        setSnapshot(nextSnapshot);
        setInventory(nextSnapshot.inventory || null);
      }
      if (data.inventory && data.inventory !== '{}') {
        setInventory(JSON.parse(data.inventory) as Inventory);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tab')) {
        setActiveTab(urlParams.get('tab')!);
      } else if (urlParams.get('view') === 'terminal') {
        setActiveTab('terminal');
      }
      void fetchServer();
    }, 0);
    const interval = setInterval(() => void fetchServer(), 20_000); // refresh every 20s
    return () => {
      window.clearTimeout(initialRequest);
      clearInterval(interval);
    };
  }, [fetchServer]);

  useEffect(() => {
    let isMounted = true;
    if (activeTab === 'network' && params.id) {
      const fetchDiag = () => {
        apiClient(`/servers/${params.id}/diagnose-network`)
          .then((raw) => {
            const data = raw as unknown as NetworkDiagnosticReport;
            if (isMounted && data) {
              setNetReport(data);
            }
          })
          .catch(() => {});
      };

      fetchDiag();

      const timer = setInterval(fetchDiag, 60_000);
      return () => {
        isMounted = false;
        clearInterval(timer);
      };
    }
  }, [activeTab, params.id]);

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
      } catch (error: unknown) {
        toast.error(errorMessage(error, 'Unable to refresh agent update status'));
      }
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [agentUpdateTask, fetchServer, params.id]);

  const handleDockerAction = async (action: string, containerId: string) => {
    if (isViewer) {
      toast.error('Docker container actions require Operator or Admin role permission.');
      return;
    }
    try {
      if (action === 'docker_logs') {
        setLogsModal({isOpen: true, containerId, logs: 'Requesting container logs...', loading: true});
      } else {
        toast.success(`${action} command sent to container ${containerId}. Execution may take about 15 seconds.`);
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
      toast.error('An error occurred while sending the command.');
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
    } catch (error: unknown) {
      toast.error(errorMessage(error, `Unable to ${action} service`));
    } finally {
      setServiceActionBusy(false);
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
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Unable to queue agent update'));
    } finally {
      setQueueingAgentUpdate(false);
    }
  };

  const cancelAgentUpdate = async () => {
    if (!server) return;
    if (isViewer) {
      toast.error('Cancelling update task requires Operator or Admin role permission.');
      return;
    }
    try {
      await apiClient(`/servers/${server.id}/tasks/cancel-update`, { method: 'POST' });
      setAgentUpdateTask(null);
      toast.success('Agent update task was cancelled');
      await fetchServer();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Unable to cancel update task'));
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
    ['processes', 'Processes'],
    ['services', serviceContent.tab],
    ['network', 'Network Quality'],
    ['docker', osFamily === 'macos' || osFamily === 'windows' ? 'Containers' : 'Docker'],
    ['terminal', terminalTabLabel],
  ];
  // Old agents sent a Linux-only list without a service manager. Do not show
  // those entries as valid launchd or Windows services.
  // Only display services that are actually installed and exist on the machine.
  const services = reportedServices.filter(service =>
    (osFamily === 'unknown'
      || (osFamily === 'linux' && !service.source)
      || service.source === serviceManager)
    && service.status !== 'not_installed',
  );
  const hasIncompatibleLegacyServices =
    osFamily !== 'linux' &&
    osFamily !== 'unknown' &&
    reportedServices.some(service => !service.source || service.source !== serviceManager);
  // Heartbeat version is authoritative for the binary that is running now.
  // Inventory is only a fallback because it refreshes less frequently.
  const reportedAgentVersion = parsedOSInfo.version || inventory?.agent_version;
  const supportsServiceControls = versionAtLeast(reportedAgentVersion, MIN_SERVICE_CONTROL_AGENT_VERSION);
  const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
  const updateAvailable = Boolean(server.update_available && latestAgentVersion);
  const agentUpdateInProgress = Boolean(agentUpdateTask && ['pending', 'processing'].includes(agentUpdateTask.status));
  const agentUpdateStalled = Boolean(agentUpdateTask?.status === 'completed' && updateAvailable);
  const agentUpdateFailed = Boolean(agentUpdateTask && (['failed', 'expired', 'timed_out'].includes(agentUpdateTask.status) || agentUpdateStalled) && updateAvailable);
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
        {tabs.map(([key, label]) => {
          const isNetTab = key === 'network';
          const hasNetWarning = isNetTab && snapshot?.network_diagnostics?.status === 'warning';
          const hasNetCritical = isNetTab && snapshot?.network_diagnostics?.status === 'critical';

          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              onClick={() => setActiveTab(key)}
              className={`whitespace-nowrap pb-3 text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                activeTab === key
                  ? 'text-blue-500 border-b-2 border-blue-500'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {label}
              {hasNetCritical && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" title="Network Critical Alert" />
              )}
              {hasNetWarning && !hasNetCritical && (
                <span className="w-2 h-2 rounded-full bg-amber-500" title="Network Warning" />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">

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
                <div className="flex flex-wrap items-center gap-2.5">
                  {agentUpdateInProgress && (
                    <button
                      type="button"
                      onClick={cancelAgentUpdate}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-rose-500/35 bg-rose-500/10 px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                    >
                      <CircleX className="h-3.5 w-3.5" />
                      Cancel task
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={queueingAgentUpdate || (agentUpdateInProgress && server.status === 'online') || server.status !== 'online'}
                    onClick={queueAgentUpdate}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-amber-500/45 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:bg-amber-500/15 disabled:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 dark:disabled:text-amber-300"
                  >
                    <AgentUpdateIcon className={`h-4 w-4 ${queueingAgentUpdate || agentUpdateInProgress ? 'animate-spin' : ''}`} />
                    {queueingAgentUpdate ? 'Queueing update...' : agentUpdateLabel}
                  </button>
                </div>
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
              <div className="bg-[var(--surface-subtle)] border border-[var(--border-color)] rounded-xl p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>CPU USAGE</span>
                  <span className={totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-semibold'}>
                    {totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'HIGH' : 'NORMAL'}
                  </span>
                </div>
                <div className={`text-2xl font-bold ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-500' : 'text-[var(--foreground)]'}`}>
                  {totalCPUUsage !== undefined ? `${totalCPUUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-color)] mt-3">
                  <div
                    className={`h-full rounded-full ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(totalCPUUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* RAM Usage */}
              <div className="bg-[var(--surface-subtle)] border border-[var(--border-color)] rounded-xl p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>RAM USAGE</span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {parsedOSInfo.memory_total && parsedOSInfo.memory_used ? `${(parsedOSInfo.memory_used / (1024 * 1024 * 1024)).toFixed(1)} / ${(parsedOSInfo.memory_total / (1024 * 1024 * 1024)).toFixed(1)} GB` : ''}
                  </span>
                </div>
                <div className="text-2xl font-bold text-[var(--foreground)]">
                  {totalMemoryUsage !== undefined ? `${totalMemoryUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-color)] mt-3">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(totalMemoryUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Disk Usage */}
              <div className="bg-[var(--surface-subtle)] border border-[var(--border-color)] rounded-xl p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>DISK USAGE</span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {parsedOSInfo.disk_total ? `${formatBytes(parsedOSInfo.disk_used)} / ${formatBytes(parsedOSInfo.disk_total)}` : ''}
                  </span>
                </div>
                <div className="text-2xl font-bold text-[var(--foreground)]">
                  {parsedOSInfo.disk_usage !== undefined ? `${parsedOSInfo.disk_usage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-color)] mt-3">
                  <div
                    className={`h-full rounded-full ${Number(parsedOSInfo.disk_usage || 0) >= 90 ? 'bg-rose-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(Number(parsedOSInfo.disk_usage || 0), 100)}%` }}
                  />
                </div>
              </div>

              {/* Uptime */}
              <div className="bg-[var(--surface-subtle)] border border-[var(--border-color)] rounded-xl p-4 font-mono">
                <div className="flex justify-between items-center text-xs text-[var(--color-muted)] mb-1">
                  <span>UPTIME</span>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${server.status === 'online' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${server.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span> {server.status === 'online' ? 'ONLINE' : 'OFFLINE'}
                  </span>
                </div>
                <div className={`text-xl font-bold mt-1 ${server.status === 'online' ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`}>
                  {snapshot?.system_info?.uptime ? formatUptime(snapshot.system_info.uptime) : '—'}
                </div>
                <div className="text-[11px] text-[var(--color-muted)] mt-3">
                  {server.status === 'online' ? 'Heartbeat Active' : 'Offline / No Heartbeat'}
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
              { label: 'Unknown', value: serviceCounts.unknown || 0, icon: CircleHelp, tone: 'text-amber-500' },
              { label: 'Total Services', value: services.length, icon: Layers, tone: 'text-blue-500' },
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
                    { value: 'unknown', label: 'Unknown' },
                  ]}
                  className="w-48"
                />
              </div>
            </div>

            <div className="divide-y divide-[var(--border-color)]">
              {filteredServices.map(service => {
                const statusLabel = service.status === 'stopped'
                  ? serviceContent.stopped
                  : service.status === 'not_installed'
                    ? serviceContent.missing
                    : service.status.replace(/_/g, ' ');
                const isRunning = service.status === 'running';
                const isStopped = service.status === 'stopped';
                const isMissing = service.status === 'not_installed';
                const statusStyle = isRunning
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                  : isStopped
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-500'
                    : service.status === 'unknown'
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                      : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)]';
                const serviceIsControllable = server.status === 'online'
                  && supportsServiceControls
                  && ['running', 'stopped'].includes(service.status)
                  && service.source === serviceManager;
                const serviceActions: Array<{action: ServiceAction, label: string, icon: typeof Play, tone: string, disabled: boolean, unavailableReason?: string}> = [
                  {
                    action: 'start',
                    label: 'Start',
                    icon: Play,
                    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20',
                    disabled: !serviceIsControllable || service.status === 'running',
                  },
                  {
                    action: 'stop',
                    label: 'Stop',
                    icon: Square,
                    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
                    disabled: !serviceIsControllable || service.status !== 'running',
                  },
                  {
                    action: 'restart',
                    label: 'Restart',
                    icon: RotateCw,
                    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
                    disabled: !serviceIsControllable,
                  },
                  {
                    action: 'reload',
                    label: 'Reload',
                    icon: RefreshCw,
                    tone: 'border-blue-500/30 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20',
                    disabled: !serviceIsControllable || service.status !== 'running' || service.source === 'windows-scm',
                    unavailableReason: service.source === 'windows-scm' ? 'Windows SCM does not provide a generic reload action.' : undefined,
                  },
                ];
                return (
                  <div
                    key={service.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-[var(--background)]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                          isRunning
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                            : isStopped
                              ? 'bg-rose-500'
                              : isMissing
                                ? 'bg-slate-400'
                                : 'bg-amber-500'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[var(--foreground)] truncate">
                            {service.display_name || service.name}
                          </span>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${statusStyle}`}>
                            {statusLabel}
                          </span>
                          {service.startup_type && (
                            <span className="text-[11px] text-[var(--color-muted)] font-mono">
                              Startup: {service.startup_type}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--color-muted)] truncate mt-0.5 max-w-xl font-mono" title={service.description || service.name}>
                          {service.name}{service.description ? ` • ${service.description}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap sm:flex-nowrap">
                      {serviceActions.map(({ action, label, icon: Icon, tone, disabled, unavailableReason }) => (
                        <button
                          key={action}
                          type="button"
                          disabled={disabled}
                          title={unavailableReason || (!supportsServiceControls ? `Update the agent to version ${MIN_SERVICE_CONTROL_AGENT_VERSION} or newer.` : server.status !== 'online' ? 'The agent must be online.' : `${label} ${service.display_name || service.name}`)}
                          onClick={() => setServiceActionRequest({ action, service })}
                          className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors inline-flex items-center gap-1.5 ${tone} disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!filteredServices.length && (
                <div className="p-10 text-center text-[var(--color-muted)]">
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

      {activeTab === 'network' && (
        <div className="space-y-6">
          {(() => {
            const netDiag = snapshot?.network_diagnostics;
            const netIfaces = netDiag?.interfaces || snapshot?.network_interfaces || [];
            const primaryIface = (netIfaces as Array<{ name: string; is_default?: boolean }>).find((i) => i.is_default || i.name === netDiag?.primary_uplink) || netIfaces[0];
            const gateway = netReport?.gateway;
            const groups = netReport?.groups || {};
            const groupTags = netReport?.group_order && netReport.group_order.length > 0
              ? netReport.group_order
              : Object.keys(groups);

            const allProbes = netReport?.probes || [];
            const discoveredTags = Array.from(new Set(allProbes.map(p => p.tag || 'default')));

            const filteredProbes = netTargetFilter === 'all'
              ? allProbes
              : allProbes.filter(p => (p.tag || 'default').toLowerCase() === netTargetFilter.toLowerCase());

            const renderStatusBadge = (status?: string) => {
              switch (status?.toLowerCase()) {
                case 'optimal':
                  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Optimal</span>;
                case 'reachable':
                  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">Reachable</span>;
                case 'warning':
                  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">Warning</span>;
                case 'critical':
                case 'unreachable':
                case 'offline':
                  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-rose-500/20 text-rose-400 border border-rose-500/30">{status}</span>;
                default:
                  return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">{status || 'Unavailable'}</span>;
              }
            };

            return (
              <>
                {/* Top Action Bar */}
                {(gateway || groupTags.length > 0) && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-base font-bold text-[var(--foreground)]">Network Quality</h3>
                    <Link
                      href={`/dashboard/network?agent_id=${params.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 px-3.5 py-2 text-xs font-bold transition"
                      title="Open centralized network targets manager"
                    >
                      <Network className="w-4 h-4" /> Manage Targets <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                )}

                {/* Dynamic Pillar / Tag Group Cards */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Gateway Uplink Card (if present) */}
                  {gateway && (
                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Radio className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)]">
                              Gateway Uplink
                            </span>
                          </div>
                          {renderStatusBadge(gateway.status)}
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                          <span className="text-2xl sm:text-3xl font-bold font-mono text-[var(--foreground)]">
                            {gateway.latency_ms > 0 ? `${gateway.latency_ms.toFixed(1)}` : '< 1'}
                          </span>
                          <span className="text-xs text-[var(--color-muted)] font-medium">ms latency</span>
                        </div>
                        <div className="text-xs space-y-1.5 text-[var(--color-muted)]">
                          <div className="flex justify-between">
                            <span>Packet Loss:</span>
                            <span className={`font-mono font-semibold ${
                              (gateway.packet_loss ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                            }`}>
                              {gateway.packet_loss != null ? `${gateway.packet_loss}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Gateway IP:</span>
                            <span className="font-mono text-[var(--foreground)] truncate max-w-[150px]">
                              {snapshot?.network_diagnostics?.default_gateway || netReport?.server_telemetry?.default_gateway || 'Default Gateway'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Sample Probes:</span>
                            <span className="font-mono text-[var(--foreground)]">
                              {gateway.successful_probes}/{gateway.total_probes} ({gateway.measurement_method})
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Dynamic Tag Groups */}
                  {groupTags.map((tag) => {
                    const grp = groups[tag];
                    if (!grp) return null;
                    return (
                      <div key={tag} className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-blue-400" />
                              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] truncate" title={tag}>
                                Tag: {tag}
                              </span>
                            </div>
                            {renderStatusBadge(grp.status)}
                          </div>
                          <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-2xl sm:text-3xl font-bold font-mono text-[var(--foreground)]">
                              {grp.latency_ms.toFixed(1)}
                            </span>
                            <span className="text-xs text-[var(--color-muted)] font-medium">ms avg latency</span>
                          </div>
                          <div className="text-xs space-y-1.5 text-[var(--color-muted)]">
                            <div className="flex justify-between">
                              <span>Packet Loss:</span>
                              <span className={`font-mono font-semibold ${
                                (grp.packet_loss ?? 0) > 0 ? 'text-rose-400' : 'text-emerald-400'
                              }`}>
                                {grp.packet_loss != null ? `${grp.packet_loss}%` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Sample Probes:</span>
                              <span className="font-mono text-[var(--foreground)]">
                                {grp.successful_probes}/{grp.total_probes} ({grp.measurement_method})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* If no targets configured */}
                {!gateway && groupTags.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--border-color)] p-8 text-center bg-[var(--background-card)]">
                    <Network className="w-8 h-8 text-[var(--color-muted)] mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold text-[var(--foreground)]">No network targets configured for this server</p>
                    <Link
                      href={`/dashboard/network?agent_id=${params.id}`}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-xs font-bold transition shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" /> Manage Targets
                    </Link>
                  </div>
                )}

                {/* Tested Targets Table */}
                {allProbes.length > 0 && (
                  <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] overflow-hidden shadow-sm">
                    <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                          <Activity className="w-4 h-4 text-blue-400" /> Monitored Targets Breakdown ({allProbes.length})
                        </h3>
                      </div>

                      {/* Tag Filter Pills */}
                      <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] p-1 rounded-xl border border-[var(--border-color)] self-start sm:self-center overflow-x-auto max-w-full">
                        <button
                          type="button"
                          onClick={() => setNetTargetFilter('all')}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                            netTargetFilter === 'all'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          All ({allProbes.length})
                        </button>
                        {discoveredTags.map((tag) => {
                          const count = allProbes.filter(p => (p.tag || 'default') === tag).length;
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNetTargetFilter(tag)}
                              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                netTargetFilter.toLowerCase() === tag.toLowerCase()
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {tag} ({count})
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border-color)] bg-[var(--background)]/40 font-semibold text-[var(--color-muted)]">
                            <th className="px-4 py-3">Target &amp; Host</th>
                            <th className="px-4 py-3">Tag</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Probes</th>
                            <th className="px-4 py-3">Packet Loss</th>
                            <th className="px-4 py-3">Latency (Avg / Min–Max)</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3 text-right">History</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                          {filteredProbes.map((probe) => {
                            const isTCP = probe.probe_method === 'TCP';
                            const lat = probe.latency_ms;
                            const latColor = lat <= 20 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                             lat <= 60 ? 'text-blue-400 bg-blue-500/10 border-blue-500/20' :
                                             lat <= 120 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                                             'text-rose-400 bg-rose-500/10 border-rose-500/20';

                            return (
                              <tr
                                key={probe.id}
                                onClick={() => openProbeHistory(probe)}
                                className="hover:bg-[var(--border-color)]/20 transition-colors cursor-pointer"
                                title="Click to view latency & packet loss chart"
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-[var(--foreground)]">{probe.name}</span>
                                    {probe.is_gateway && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                        Gateway
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-mono text-[var(--color-muted)] mt-0.5">
                                    {probe.host}{probe.port ? `:${probe.port}` : ''}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)]">
                                    {probe.tag || 'default'}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center font-mono font-semibold px-2 py-0.5 rounded text-[11px] border ${
                                    isTCP
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  }`}>
                                    {probe.probe_method}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-[var(--color-muted)]">
                                  <span className="text-[var(--foreground)] font-medium">{probe.successful_probes ?? 5}</span>/{probe.total_probes ?? 5}
                                </td>
                                <td className="px-4 py-3 font-mono">
                                  {probe.packet_loss != null ? (
                                    <span className={probe.packet_loss > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-medium'}>
                                      {probe.packet_loss}%
                                    </span>
                                  ) : (
                                    <span className="text-[var(--color-muted)] italic" title="TCP reachability probe — packet loss not measured">
                                      N/A
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {probe.status === 'unreachable' || (lat === 0 && probe.failed_probes === probe.total_probes) ? (
                                    <span className="font-mono text-rose-400 font-semibold text-[11px]">Timeout</span>
                                  ) : (
                                    <div>
                                      <span className={`inline-block font-mono font-bold px-2 py-0.5 rounded border text-[11px] ${latColor}`}>
                                        {lat.toFixed(1)} ms
                                      </span>
                                      {probe.min_latency_ms > 0 && probe.max_latency_ms > 0 && (
                                        <div className="text-[10px] font-mono text-[var(--color-muted)] mt-0.5">
                                          {probe.min_latency_ms.toFixed(1)} – {probe.max_latency_ms.toFixed(1)} ms
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {renderStatusBadge(probe.status)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openProbeHistory(probe);
                                    }}
                                    className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-blue-400 transition cursor-pointer"
                                    title="View latency history chart"
                                  >
                                    <Activity className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* In-context History Modal */}
                {historyTargetProbe && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
                    <div className="w-full max-w-2xl rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl p-6 text-[var(--foreground)] space-y-4">
                      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-blue-400" />
                            <h3 className="text-base font-bold">{historyTargetProbe.name} — Latency Trend</h3>
                          </div>
                          <p className="text-xs text-[var(--color-muted)] font-mono mt-0.5">
                            Host: {historyTargetProbe.host} · Tag: {historyTargetProbe.tag}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoryTargetProbe(null)}
                          className="p-1 rounded-lg hover:bg-[var(--border-color)] text-[var(--color-muted)] hover:text-[var(--foreground)]"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] p-1 rounded-xl border border-[var(--border-color)]">
                          {(['6h', '24h', '7d'] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => openProbeHistory(historyTargetProbe, r)}
                              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                                historyRange === r
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {r.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <span className="text-xs text-[var(--color-muted)] font-mono">
                          {historyData.length} probe points
                        </span>
                      </div>

                      <div className="h-60 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
                        {loadingHistory ? (
                          <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                            Loading time-series data...
                          </div>
                        ) : historyData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                            No history records found for this target.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historyData}>
                              <defs>
                                <linearGradient id="latencyGradAgent" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <XAxis
                                dataKey="measured_at"
                                tickFormatter={(t: string) => {
                                  const d = new Date(t);
                                  return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                                }}
                                stroke="var(--color-muted)"
                                fontSize={10}
                              />
                              <YAxis
                                stroke="var(--color-muted)"
                                fontSize={10}
                                unit=" ms"
                                domain={['auto', 'auto']}
                              />
                              <RechartsTooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload || !payload.length) return null;
                                  const pt = payload[0].payload as { latency_ms?: number; packet_loss?: number; measured_at: string; status: string; successful_probes: number; total_probes: number };
                                  return (
                                    <div className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] p-2.5 shadow-xl text-xs space-y-1">
                                      <p className="text-[var(--color-muted)] font-mono text-[10px]">
                                        {new Date(pt.measured_at).toLocaleString()}
                                      </p>
                                      <p className="font-bold text-[var(--foreground)] font-mono">
                                        Latency: {pt.latency_ms?.toFixed(1) ?? 'N/A'} ms
                                      </p>
                                      {pt.packet_loss != null && (
                                        <p className={`font-mono text-[11px] ${pt.packet_loss > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}`}>
                                          Packet Loss: {pt.packet_loss}%
                                        </p>
                                      )}
                                      <p className="text-[10px] text-[var(--color-muted)]">
                                        Status: {pt.status.toUpperCase()} ({pt.successful_probes}/{pt.total_probes} probes)
                                      </p>
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="latency_ms"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#latencyGradAgent)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => setHistoryTargetProbe(null)}
                          className="px-4 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-color)]"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Host Network Interfaces & Hardware Error Counters */}
                {netIfaces.length > 0 && (
                  <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-sm">
                    <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                          <Network className="w-4 h-4 text-blue-500" /> Host Network Interfaces & Hardware Error Counters
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                          Kernel physical interface counters (RX/TX errors, dropped ring buffer packets, and throughput).
                        </p>
                      </div>
                      <span className="text-xs text-[var(--color-muted)]">
                        {netIfaces.length} Interfaces
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border-color)] bg-[var(--background)]/30 text-xs font-semibold text-[var(--color-muted)]">
                            <th className="px-4 py-3">Interface</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">IP Address</th>
                            <th className="px-4 py-3">Drop / Error Rate</th>
                            <th className="px-4 py-3">Dropped (Delta)</th>
                            <th className="px-4 py-3">Throughput (I/O)</th>
                            <th className="px-4 py-3">Lifetime Errors</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-color)]">
                          {netIfaces.map((iface) => {
                            const isPrimary = iface.name === (netDiag?.primary_uplink || primaryIface?.name);
                            return (
                              <tr key={iface.name} className={`hover:bg-[var(--border-color)]/20 transition-colors ${isPrimary ? 'bg-blue-500/5' : ''}`}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-semibold text-xs text-[var(--foreground)]">{iface.name}</span>
                                    {isPrimary && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Uplink</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  <span className={`inline-flex items-center gap-1 font-semibold ${iface.is_up ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${iface.is_up ? 'bg-emerald-400' : 'bg-gray-400'}`} />
                                    {iface.is_up ? 'UP' : 'DOWN'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted)]">
                                  {iface.ip_addresses?.length ? iface.ip_addresses.join(', ') : 'N/A'}
                                </td>
                                <td className="px-4 py-3 text-xs">
                                  <div className="space-y-0.5">
                                    <div className={`flex items-center justify-between gap-2 ${(iface.drop_rate_per_min || 0) > 0 ? 'text-amber-400 font-semibold' : 'text-[var(--color-muted)]'}`}>
                                      <span>Drops:</span>
                                      <span>{(iface.drop_rate_per_min || 0).toFixed(1)}/m</span>
                                    </div>
                                    <div className={`flex items-center justify-between gap-2 ${(iface.error_rate_per_min || 0) > 0 ? 'text-rose-400 font-semibold' : 'text-[var(--color-muted)]'}`}>
                                      <span>Errors:</span>
                                      <span>{(iface.error_rate_per_min || 0).toFixed(1)}/m</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted)]">
                                  +{((iface.delta_drop_in || 0) + (iface.delta_drop_out || 0))} drops
                                </td>
                                <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted)]">
                                  RX: {formatBytes(iface.bytes_recv || 0)} / TX: {formatBytes(iface.bytes_sent || 0)}
                                </td>
                                <td className="px-4 py-3 text-xs font-mono text-[var(--color-muted)]">
                                  Errs: {((iface.errors_in || 0) + (iface.errors_out || 0)).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
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
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-color)] p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                <Box className="w-4 h-4 text-[var(--accent-primary)]" />
                {osFamily === 'macos' || osFamily === 'windows' ? 'Local Containers' : 'Docker Containers'}
              </h3>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                {osFamily === 'macos' || osFamily === 'windows' ? 'Containers reported through local Docker engine.' : 'Containers managed on this host.'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                {(snapshot?.docker_containers || []).filter(c => c.state === 'running').length} running
              </span>
              <span className="rounded-full bg-[var(--surface-subtle)] border border-[var(--border-color)] px-2.5 py-1 text-xs font-semibold text-[var(--color-muted)]">
                {snapshot?.docker_containers?.length || 0} total
              </span>
            </div>
          </div>

          <div className="divide-y divide-[var(--border-color)]">
            {snapshot?.docker_containers?.map(c => {
              const isRunning = c.state === 'running';
              return (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-[var(--background)]/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                        isRunning ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-slate-500'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--foreground)] truncate">{c.name}</span>
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                          isRunning ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                        }`}>
                          {c.state}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-muted)] truncate mt-0.5 max-w-md font-mono" title={c.image}>
                        {c.image}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                      {!isRunning && (
                        <button
                          type="button"
                          onClick={() => handleDockerAction('docker_start', c.id)}
                          className="px-2.5 py-1 text-xs font-semibold rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        >
                          Start
                        </button>
                      )}
                      {isRunning && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDockerAction('docker_restart', c.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors"
                          >
                            Restart
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDockerAction('docker_stop', c.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                          >
                            Stop
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDockerAction('docker_logs', c.id)}
                        className="px-2.5 py-1 text-xs font-semibold rounded-md border border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors"
                      >
                        Logs
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!snapshot?.docker_containers?.length && (
              <div className="p-8 text-center text-xs text-[var(--color-muted)]">
                {osFamily === 'macos' || osFamily === 'windows'
                  ? 'No local containers were reported by this agent.'
                  : 'No Docker containers were reported by this agent.'}
              </div>
            )}
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
