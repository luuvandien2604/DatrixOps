'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, ArrowUp, ArrowUpDown, Bell, Cpu, Activity, ShieldCheck, Box, Server as ServerIcon, Network, Search, CircleCheck, CircleX, CircleHelp, Play, Square, RotateCw, RefreshCw, LoaderCircle, Layers, Radio, Zap, ExternalLink, X, Plus, FileText } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import { apiClient, getUserRole } from '@/lib/apiClient';
import toast from 'react-hot-toast';
import WebTerminal from '@/components/WebTerminal';
import CustomSelect from '@/components/CustomSelect';
import { useLanguage } from '@/components/LanguageContext';

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
  const { t } = useLanguage();
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
  const [processSortField, setProcessSortField] = useState<'cpu' | 'ram'>('cpu');
  const [processSortOrder, setProcessSortOrder] = useState<'asc' | 'desc'>('desc');
  const [serviceActionRequest, setServiceActionRequest] = useState<{action: ServiceAction, service: ServiceStatus} | null>(null);
  const [serviceActionBusy, setServiceActionBusy] = useState(false);
  const [queueingAgentUpdate, setQueueingAgentUpdate] = useState(false);
  const [agentUpdateTask, setAgentUpdateTask] = useState<AgentUpdateTask | null>(null);
  const [netReport, setNetReport] = useState<NetworkDiagnosticReport | null>(null);
  const [netReportFailed, setNetReportFailed] = useState(false);
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
              setNetReportFailed(false);
            }
          })
          .catch(() => {
            if (isMounted) setNetReportFailed(true);
          });
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
  const terminalTabLabel = terminalEnvironmentUnsupported
    ? t('Terminal · Not supported', 'Terminal · Không hỗ trợ')
    : 'Terminal';
  const tabs: Array<[string, string]> = [
    ['overview', t('Overview', 'Tổng quan')],
    ['processes', t('Processes', 'Tiến trình')],
    ['services', t(serviceContent.tab, serviceContent.tab === 'Launch Services' ? 'Dịch vụ launchd' : serviceContent.tab === 'Windows Services' ? 'Dịch vụ Windows' : 'Dịch vụ Systemd')],
    ['network', t('Network Quality', 'Chất lượng mạng')],
    ['docker', osFamily === 'macos' || osFamily === 'windows' ? t('Containers', 'Container') : 'Docker'],
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
          className="inline-flex items-center gap-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors shrink-0 self-start sm:self-center cursor-pointer"
        >
          <Activity className="w-3.5 h-3.5" /> {t('View Metrics', 'Xem chỉ số')}
        </button>
      </div>

      <div role="tablist" aria-label="Server detail views" className="flex gap-3 overflow-x-auto border-b border-[var(--border-subtle)]">
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
              className={`whitespace-nowrap pb-2.5 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeTab === key
                  ? 'text-[var(--accent-primary)] border-b-2 border-[var(--accent-primary)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {label}
              {hasNetCritical && (
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" title="Network Critical Alert" />
              )}
              {hasNetWarning && !hasNetCritical && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Network Warning" />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">

          {supportsServiceControls && updateAvailable && (
            <section aria-labelledby="agent-update-available-title" className="rounded-md border border-amber-500/35 bg-[var(--surface-1)] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-start gap-2.5">
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/15 p-1.5 text-amber-500">
                    <RefreshCw className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 id="agent-update-available-title" className="text-sm font-bold text-[var(--foreground)]">
                      {t('Agent update available', 'Có bản cập nhật Agent mới')}
                    </h2>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      {t('This server is running Agent', 'Máy chủ này đang chạy Agent')} <span className="font-mono">{reportedAgentVersion || t('Unknown', 'Không xác định')}</span>. {t('The current release is Agent', 'Phiên bản mới nhất là Agent')} <span className="font-mono font-semibold text-emerald-500">{latestAgentVersion}</span>.
                    </p>
                    {agentUpdateTask && (
                      <p className={`mt-1 text-xs font-semibold ${agentUpdateFailed ? 'text-rose-500' : agentUpdateCompleted ? 'text-emerald-500' : 'text-amber-500'}`}>
                        {agentUpdateCompleted
                          ? t('Update confirmed by the latest heartbeat.', 'Cập nhật đã được xác nhận bởi nhịp tim mới nhất.')
                          : agentUpdateFailed
                            ? agentUpdateStalled
                              ? t('The update was staged, but the agent is still reporting the old version. Retry the update to restart the service with the new binary.', 'Bản cập nhật đã được nạp nhưng agent vẫn báo phiên bản cũ. Thử lại cập nhật.')
                              : agentUpdateTask.result || `${t('Update task', 'Tác vụ cập nhật')} ${agentUpdateTask.status}.`
                            : agentUpdateTask.status === 'processing'
                              ? t('The agent has claimed the task. Waiting for restart and version confirmation.', 'Agent đang xử lý tác vụ. Chờ khởi động lại và xác nhận phiên bản.')
                              : t('Update task is queued. Waiting for the next agent heartbeat.', 'Tác vụ đã xếp hàng. Chờ nhịp tim tiếp theo của agent.')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {agentUpdateInProgress && (
                    <button
                      type="button"
                      onClick={cancelAgentUpdate}
                      className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
                    >
                      <CircleX className="h-3.5 w-3.5" />
                      {t('Cancel task', 'Hủy tác vụ')}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={queueingAgentUpdate || (agentUpdateInProgress && server.status === 'online') || server.status !== 'online'}
                    onClick={queueAgentUpdate}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-amber-500/45 bg-amber-500/15 px-3.5 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-300 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
                  >
                    <AgentUpdateIcon className={`h-3.5 w-3.5 ${queueingAgentUpdate || agentUpdateInProgress ? 'animate-spin' : ''}`} />
                    {queueingAgentUpdate ? t('Queueing update...', 'Đang xếp hàng...') : agentUpdateLabel}
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Section 1: Real-Time Telemetry Parameters */}
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4">
            <h3 className="text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-3.5 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {t('Real-Time Telemetry Parameters', 'Thông số đo lường thời gian thực')}
              </span>
              <span className="text-[10px] font-mono text-[var(--color-muted)] font-normal">
                Node IP: {server.ip_address || server.id}
              </span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* CPU Usage */}
              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-md p-3 font-mono tabular-nums">
                <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mb-1">
                  <span>{t('CPU USAGE', 'SỬ DỤNG CPU')}</span>
                  <span className={totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-semibold'}>
                    {totalCPUUsage !== undefined && totalCPUUsage > 90 ? t('HIGH', 'CAO') : t('NORMAL', 'BÌNH THƯỜNG')}
                  </span>
                </div>
                <div className={`text-xl font-bold ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'text-rose-500' : 'text-[var(--foreground)]'}`}>
                  {totalCPUUsage !== undefined ? `${totalCPUUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-[var(--border-subtle)] mt-2.5">
                  <div
                    className={`h-full rounded-sm ${totalCPUUsage !== undefined && totalCPUUsage > 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(totalCPUUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* RAM Usage */}
              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-md p-3 font-mono tabular-nums">
                <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mb-1">
                  <span>{t('RAM USAGE', 'SỬ DỤNG RAM')}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">
                    {parsedOSInfo.memory_total && parsedOSInfo.memory_used ? `${(parsedOSInfo.memory_used / (1024 * 1024 * 1024)).toFixed(1)} / ${(parsedOSInfo.memory_total / (1024 * 1024 * 1024)).toFixed(1)} GB` : ''}
                  </span>
                </div>
                <div className="text-xl font-bold text-[var(--foreground)]">
                  {totalMemoryUsage !== undefined ? `${totalMemoryUsage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-[var(--border-subtle)] mt-2.5">
                  <div
                    className="h-full rounded-sm bg-blue-500"
                    style={{ width: `${Math.min(totalMemoryUsage || 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Disk Usage */}
              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-md p-3 font-mono tabular-nums">
                <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mb-1">
                  <span>{t('DISK USAGE', 'DUNG LƯỢNG Ổ ĐĨA')}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">
                    {parsedOSInfo.disk_total ? `${formatBytes(parsedOSInfo.disk_used)} / ${formatBytes(parsedOSInfo.disk_total)}` : ''}
                  </span>
                </div>
                <div className="text-xl font-bold text-[var(--foreground)]">
                  {parsedOSInfo.disk_usage !== undefined ? `${parsedOSInfo.disk_usage.toFixed(1)}%` : '—'}
                </div>
                <div className="h-1 overflow-hidden rounded-sm bg-[var(--border-subtle)] mt-2.5">
                  <div
                    className={`h-full rounded-sm ${Number(parsedOSInfo.disk_usage || 0) >= 90 ? 'bg-rose-500' : 'bg-amber-500'}`}
                    style={{ width: `${Math.min(Number(parsedOSInfo.disk_usage || 0), 100)}%` }}
                  />
                </div>
              </div>

              {/* Uptime */}
              <div className="bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-md p-3 font-mono tabular-nums">
                <div className="flex justify-between items-center text-[10px] text-[var(--color-muted)] mb-1">
                  <span>{t('UPTIME', 'THỜI GIAN HOẠT ĐỘNG')}</span>
                  <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase ${server.status === 'online' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${server.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} /> {server.status === 'online' ? t('ONLINE', 'TRỰC TUYẾN') : t('OFFLINE', 'NGOẠI TUYẾN')}
                  </span>
                </div>
                <div className={`text-lg font-bold mt-0.5 ${server.status === 'online' ? 'text-emerald-500' : 'text-[var(--color-muted)]'}`}>
                  {snapshot?.system_info?.uptime ? formatUptime(snapshot.system_info.uptime) : '—'}
                </div>
                <div className="text-[10px] text-[var(--color-muted)] mt-2">
                  {server.status === 'online' ? t('Heartbeat Active', 'Nhịp tim hoạt động') : t('Offline / No Heartbeat', 'Ngoại tuyến / Mất nhịp tim')}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Static System Information & Package Security */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* System Information */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4">
              <h3 className="text-xs font-bold text-[var(--color-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
                <Cpu className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {t('System Specification & Environment', 'Thông số hệ thống & Môi trường')}
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--color-muted)]">{t('Operating System', 'Hệ điều hành')}</span>
                  <span className="font-semibold text-[var(--foreground)]">{parsedOSInfo.os_name || monitoredOS || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--color-muted)]">{t('Agent Version', 'Phiên bản Agent')}</span>
                  <span className={`font-semibold font-mono ${reportedAgentVersion ? 'text-[var(--accent-primary)]' : 'text-amber-500'}`}>
                    {reportedAgentVersion || t('Not reported', 'Chưa báo cáo')}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--color-muted)]">{t('Kernel Version', 'Phiên bản Kernel')}</span>
                  <span className="font-mono tabular-nums text-[var(--foreground)]">{snapshot?.system_info?.kernel || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">{t('Virtualization Platform', 'Nền tảng ảo hóa')}</span>
                  <span className="font-semibold text-[var(--foreground)] uppercase font-mono">{snapshot?.system_info?.virtualization || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Package Updates & Fleet Security */}
            <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md p-4 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-bold text-[var(--color-muted)] mb-3 flex items-center gap-2 uppercase tracking-wider">
                  <Box className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {t('Package Updates & Security Status', 'Cập nhật gói & Trạng thái bảo mật')}
                </h3>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="p-2.5 bg-blue-500/10 rounded-md text-[var(--accent-primary)] border border-blue-500/20">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-muted)] font-medium">{t('Packages awaiting upgrade', 'Gói đang chờ nâng cấp')}</p>
                    <div className="text-xl font-bold text-[var(--foreground)] font-mono tabular-nums mt-0.5">
                      {snapshot?.package_update || 0} <span className="text-xs font-normal text-[var(--color-muted)]">{t('packages', 'gói')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs">
                <span className="text-[var(--color-muted)]">{t('Fleet Security policy', 'Chính sách bảo mật hệ thống')}</span>
                <span className="text-emerald-500 font-semibold flex items-center gap-1 font-mono text-[11px]">
                  <CircleCheck className="w-3.5 h-3.5" /> {t('Compliant', 'Tuân thủ')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'processes' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                label: t('Total CPU usage', 'Tổng mức sử dụng CPU'),
                value: totalCPUUsage !== undefined ? `${totalCPUUsage.toFixed(1)}%` : '—',
                detail: t('Current system-wide usage', 'Mức sử dụng toàn hệ thống'),
                tone: 'text-rose-500',
              },
              {
                label: t('Total RAM usage', 'Tổng mức sử dụng RAM'),
                value: totalMemoryUsage !== undefined ? `${totalMemoryUsage.toFixed(1)}%` : '—',
                detail: parsedOSInfo.memory_total ? `${formatBytes(parsedOSInfo.memory_used)} / ${formatBytes(parsedOSInfo.memory_total)}` : t('Current system-wide usage', 'Mức sử dụng toàn hệ thống'),
                tone: 'text-[var(--accent-primary)]',
              },
              {
                label: t('Processes shown', 'Số tiến trình hiển thị'),
                value: String(snapshot?.top_processes?.length || 0),
                detail: t('Highest resource consumers', 'Tiêu tốn nhiều tài nguyên nhất'),
                tone: 'text-emerald-500',
              },
            ].map(item => (
              <div key={item.label} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
                <p className="text-xs font-semibold text-[var(--color-muted)]">{item.label}</p>
                <p className={`mt-1.5 text-xl font-bold font-mono tabular-nums ${item.tone}`}>{item.value}</p>
                <p className="mt-1 text-[11px] font-medium text-[var(--color-muted)]">{item.detail}</p>
              </div>
            ))}
          </div>
          <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <h3 className="text-xs font-bold text-[var(--foreground)] uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {t('TOP RESOURCE-CONSUMING PROCESSES', 'CÁC TIẾN TRÌNH CHIẾM TÀI NGUYÊN HÀNG ĐẦU')}
              </h3>
            </div>
            <div className="overflow-x-auto">
              {(() => {
                const processes = snapshot?.top_processes || [];
                const sortedProcesses = [...processes].sort((a, b) => {
                  const valA = processSortField === 'cpu' ? a.cpu : a.ram;
                  const valB = processSortField === 'cpu' ? b.cpu : b.ram;
                  return processSortOrder === 'desc' ? valB - valA : valA - valB;
                });
                return (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] text-[11px] font-mono font-bold uppercase text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3.5 py-2">PID</th>
                        <th className="px-3.5 py-2">{osFamily === 'windows' ? t('Process', 'Tiến trình') : t('Command', 'Lệnh')}</th>
                        <th className="px-3.5 py-2">{osFamily === 'windows' ? t('Account', 'Tài khoản') : t('User', 'Người dùng')}</th>
                        <th className="px-3.5 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (processSortField === 'cpu') {
                                setProcessSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                              } else {
                                setProcessSortField('cpu');
                                setProcessSortOrder('desc');
                              }
                            }}
                            className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors cursor-pointer font-mono"
                          >
                            <span>CPU %</span>
                            {processSortField === 'cpu' ? (
                              processSortOrder === 'desc' ? (
                                <ArrowDown className="h-3 w-3 text-rose-500" />
                              ) : (
                                <ArrowUp className="h-3 w-3 text-rose-500" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                            )}
                          </button>
                        </th>
                        <th className="px-3.5 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (processSortField === 'ram') {
                                setProcessSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
                              } else {
                                setProcessSortField('ram');
                                setProcessSortOrder('desc');
                              }
                            }}
                            className="inline-flex items-center gap-1 hover:text-[var(--foreground)] transition-colors cursor-pointer font-mono"
                          >
                            <span>RAM %</span>
                            {processSortField === 'ram' ? (
                              processSortOrder === 'desc' ? (
                                <ArrowDown className="h-3 w-3 text-blue-500" />
                              ) : (
                                <ArrowUp className="h-3 w-3 text-blue-500" />
                              )
                            ) : (
                              <ArrowUpDown className="h-3 w-3 opacity-40 hover:opacity-100" />
                            )}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {sortedProcesses.map(p => (
                        <tr key={p.pid} className="hover:bg-[var(--surface-2)] transition-colors">
                          <td className="px-3.5 py-2 text-[var(--color-muted)] font-mono tabular-nums">{p.pid}</td>
                          <td className="px-3.5 py-2 font-medium text-[var(--foreground)] font-mono">{p.name}</td>
                          <td className="px-3.5 py-2 text-[var(--color-muted)] font-mono">{p.user}</td>
                          <td className="px-3.5 py-2 text-rose-500 font-mono tabular-nums font-semibold">{p.cpu.toFixed(1)}%</td>
                          <td className="px-3.5 py-2 text-blue-500 font-mono tabular-nums font-semibold">{p.ram.toFixed(1)}%</td>
                        </tr>
                      ))}
                      {!sortedProcesses.length && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
                            {t('No process data available', 'Không có dữ liệu tiến trình')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="space-y-4">
          {hasIncompatibleLegacyServices && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-[var(--foreground)]">
              <div className="flex items-start gap-2.5">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="font-semibold">{t('This snapshot contains a service list from an older agent.', 'Bản chụp này chứa danh sách dịch vụ từ agent phiên bản cũ.')}</p>
                  <p className="mt-1 leading-relaxed text-[var(--color-muted)]">
                    {t(
                      `Linux service names were hidden because this server is identified as ${monitoredOS}. Update and restart the agent to collect native ${serviceContent.title}.`,
                      `Tên dịch vụ Linux đã bị ẩn vì máy chủ này được nhận diện là ${monitoredOS}. Cập nhật và khởi động lại agent để thu thập ${serviceContent.title} nguyên bản.`
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: t('Running', 'Đang chạy'), value: serviceCounts.running || 0, icon: CircleCheck, tone: 'text-emerald-500' },
              { label: t(serviceContent.stopped, 'Đã dừng'), value: serviceCounts.stopped || 0, icon: CircleX, tone: 'text-rose-500' },
              { label: t('Unknown', 'Không rõ'), value: serviceCounts.unknown || 0, icon: CircleHelp, tone: 'text-amber-500' },
              { label: t('Total Services', 'Tổng số dịch vụ'), value: services.length, icon: Layers, tone: 'text-[var(--accent-primary)]' },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5">
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${tone}`}><Icon className="h-3.5 w-3.5" />{label}</div>
                <p className="mt-2 text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-3.5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">{serviceContent.title} on {monitoredOS}</h3>
                <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{serviceContent.description}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row text-xs">
                <label className="relative">
                  <span className="sr-only">{t('Search services', 'Tìm kiếm dịch vụ')}</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input
                    value={serviceSearch}
                    onChange={event => setServiceSearch(event.target.value)}
                    style={{ paddingLeft: '2.2rem', paddingRight: '0.75rem' }}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] py-1.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)] transition-colors sm:w-60"
                    placeholder={serviceContent.search}
                  />
                </label>
                <CustomSelect
                  value={serviceFilter}
                  onChange={setServiceFilter}
                  options={[
                    { value: 'all', label: t('All statuses', 'Tất cả trạng thái') },
                    { value: 'running', label: t('Running', 'Đang chạy') },
                    { value: 'stopped', label: t(serviceContent.stopped, 'Đã dừng') },
                    { value: 'unknown', label: t('Unknown', 'Không rõ') },
                  ]}
                  className="w-40 h-8"
                />
              </div>
            </div>

            <div className="divide-y divide-[var(--border-subtle)]">
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
                      : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)]';
                const serviceIsControllable = server.status === 'online'
                  && supportsServiceControls
                  && ['running', 'stopped'].includes(service.status)
                  && service.source === serviceManager;
                const serviceActions: Array<{action: ServiceAction, label: string, icon: typeof Play, tone: string, disabled: boolean, unavailableReason?: string}> = [
                  {
                    action: 'start',
                    label: t('Start', 'Bắt đầu'),
                    icon: Play,
                    tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20',
                    disabled: !serviceIsControllable || service.status === 'running',
                  },
                  {
                    action: 'stop',
                    label: t('Stop', 'Dừng'),
                    icon: Square,
                    tone: 'border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
                    disabled: !serviceIsControllable || service.status !== 'running',
                  },
                  {
                    action: 'restart',
                    label: t('Restart', 'Khởi động lại'),
                    icon: RotateCw,
                    tone: 'border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
                    disabled: !serviceIsControllable,
                  },
                  {
                    action: 'reload',
                    label: t('Reload', 'Tải lại'),
                    icon: RefreshCw,
                    tone: 'border-blue-500/30 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20',
                    disabled: !serviceIsControllable || service.status !== 'running' || service.source === 'windows-scm',
                    unavailableReason: service.source === 'windows-scm' ? 'Windows SCM does not provide a generic reload action.' : undefined,
                  },
                ];
                return (
                  <div
                    key={service.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 hover:bg-[var(--surface-2)] transition-colors text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          isRunning
                            ? 'bg-emerald-500'
                            : isStopped
                              ? 'bg-rose-500'
                              : isMissing
                                ? 'bg-zinc-400'
                                : 'bg-amber-500'
                        }`}
                      />
                      <div className="min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-xs text-[var(--foreground)] truncate font-mono">
                          {service.display_name || service.name}
                        </span>
                        <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded border ${statusStyle}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Link
                        href={`/dashboard/logs?server_id=${server.id}&source=journal&unit=${encodeURIComponent(service.name)}`}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]/40 transition-colors inline-flex items-center justify-center cursor-pointer"
                        title={t(`View journal logs for ${service.display_name || service.name}`, `Xem nhật ký log của ${service.display_name || service.name}`)}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Link>
                      {serviceActions.map(({ action, label, icon: Icon, tone, disabled, unavailableReason }) => (
                        <button
                          key={action}
                          type="button"
                          aria-label={label}
                          disabled={disabled}
                          title={unavailableReason || (!supportsServiceControls ? `Update the agent to version ${MIN_SERVICE_CONTROL_AGENT_VERSION} or newer.` : server.status !== 'online' ? 'The agent must be online.' : `${label} ${service.display_name || service.name}`)}
                          onClick={() => setServiceActionRequest({ action, service })}
                          className={`p-1 rounded-md border transition-colors inline-flex items-center justify-center ${tone} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!filteredServices.length && (
                <div className="p-8 text-center text-xs text-[var(--color-muted)]">
                  {services.length
                    ? `${t('No', 'Không có')} ${serviceContent.title} ${t('match the current filters.', 'phù hợp với bộ lọc.')}`
                    : hasIncompatibleLegacyServices
                      ? `${t('Native', 'Dịch vụ nguyên bản')} ${serviceContent.title} ${t('will appear after the agent is updated.', 'sẽ xuất hiện sau khi cập nhật agent.')}`
                      : `${t('No', 'Không có')} ${serviceContent.title} ${t('have been reported by this agent.', 'nào được báo cáo bởi agent này.')}`}
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
                  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">{t('Optimal', 'Tối ưu')}</span>;
                case 'reachable':
                  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-blue-500/15 text-[var(--accent-primary)] border border-blue-500/30">{t('Reachable', 'Khả dụng')}</span>;
                case 'warning':
                  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 text-amber-500 border border-amber-500/30">{t('Warning', 'Cảnh báo')}</span>;
                case 'critical':
                case 'unreachable':
                case 'offline':
                  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-rose-500/15 text-rose-500 border border-rose-500/30">{status || t('Critical', 'Sự cố')}</span>;
                default:
                  return <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider bg-zinc-500/15 text-zinc-400 border border-zinc-500/30">{status || t('Unavailable', 'Không có')}</span>;
              }
            };

            return (
              <>
                {/* Top Action Bar */}
                {(gateway || groupTags.length > 0) && (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">
                      {t('Network Quality', 'Chất lượng mạng')}
                    </h3>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/alerts?tab=create&category=network&server_id=${params.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 px-3 py-1.5 text-xs font-semibold transition-colors"
                        title={t("Set alert rules for this server's network targets", 'Thiết lập quy tắc cảnh báo cho máy chủ này')}
                      >
                        <Bell className="w-3.5 h-3.5" /> {t('Set Alert Rule', 'Tạo cảnh báo')}
                      </Link>
                      <Link
                        href={`/dashboard/network?agent_id=${params.id}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--foreground)] px-3 py-1.5 text-xs font-semibold transition-colors"
                        title={t('Open centralized network targets manager', 'Mở trang quản lý mục tiêu mạng tập trung')}
                      >
                        <Network className="w-3.5 h-3.5 text-[var(--accent-primary)]" /> {t('Manage Targets', 'Quản lý targets')} <ExternalLink className="w-3 h-3 text-[var(--color-muted)]" />
                      </Link>
                    </div>
                  </div>
                )}

                {/* Dynamic Pillar / Tag Group Cards */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {/* Gateway Uplink Card (if present) */}
                  {gateway && (
                    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                              {t('Gateway Uplink', 'Uplink Gateway')}
                            </span>
                          </div>
                          {renderStatusBadge(gateway.status)}
                        </div>
                        <div className="flex items-baseline gap-1.5 mb-2">
                          <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                            {gateway.latency_ms > 0 ? `${gateway.latency_ms.toFixed(1)}` : '< 1'}
                          </span>
                          <span className="text-xs text-[var(--color-muted)] font-medium">{t('ms latency', 'ms độ trễ')}</span>
                        </div>
                        <div className="text-xs space-y-1 text-[var(--color-muted)] pt-1 border-t border-[var(--border-subtle)]">
                          <div className="flex justify-between">
                            <span>{t('Packet Loss:', 'Mất gói:')}</span>
                            <span className={`font-mono tabular-nums font-semibold ${
                              (gateway.packet_loss ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'
                            }`}>
                              {gateway.packet_loss != null ? `${gateway.packet_loss}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t('Gateway IP:', 'IP Gateway:')}</span>
                            <span className="font-mono text-[var(--foreground)] truncate max-w-[150px]">
                              {snapshot?.network_diagnostics?.default_gateway || netReport?.server_telemetry?.default_gateway || 'Default Gateway'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{t('Sample Probes:', 'Mẫu kiểm tra:')}</span>
                            <span className="font-mono tabular-nums text-[var(--foreground)]">
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
                      <div key={tag} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] truncate" title={tag}>
                                {t('Tag:', 'Thẻ:')} {tag}
                              </span>
                            </div>
                            {renderStatusBadge(grp.status)}
                          </div>
                          <div className="flex items-baseline gap-1.5 mb-2">
                            <span className="text-2xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                              {grp.latency_ms.toFixed(1)}
                            </span>
                            <span className="text-xs text-[var(--color-muted)] font-medium">{t('ms avg latency', 'ms độ trễ TB')}</span>
                          </div>
                          <div className="text-xs space-y-1 text-[var(--color-muted)] pt-1 border-t border-[var(--border-subtle)]">
                            <div className="flex justify-between">
                              <span>{t('Packet Loss:', 'Mất gói:')}</span>
                              <span className={`font-mono tabular-nums font-semibold ${
                                (grp.packet_loss ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'
                              }`}>
                                {grp.packet_loss != null ? `${grp.packet_loss}%` : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>{t('Sample Probes:', 'Mẫu kiểm tra:')}</span>
                              <span className="font-mono tabular-nums text-[var(--foreground)]">
                                {grp.successful_probes}/{grp.total_probes} ({grp.measurement_method})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Loading state while fetching network diagnostics */}
                {!netReport && !netReportFailed && (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-10 text-center flex flex-col items-center justify-center">
                    <LoaderCircle className="w-6 h-6 text-[var(--accent-primary)] animate-spin mb-2" />
                    <p className="text-xs font-semibold text-[var(--foreground)]">{t('Evaluating network targets…', 'Đang đánh giá các mục tiêu mạng…')}</p>
                    <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{t('Probing latency and packet loss for configured network targets', 'Đang đo độ trễ và mất gói cho các mục tiêu đã cấu hình')}</p>
                  </div>
                )}

                {/* If no targets configured */}
                {netReport && !gateway && groupTags.length === 0 && (
                  <div className="rounded-md border border-dashed border-[var(--border-subtle)] p-8 text-center bg-[var(--surface-1)]">
                    <Network className="w-6 h-6 text-[var(--color-muted)] mx-auto mb-2 opacity-50" />
                    <p className="text-xs font-semibold text-[var(--foreground)]">{t('No network targets configured for this server', 'Chưa cấu hình mục tiêu kiểm tra mạng nào cho máy chủ này')}</p>
                    <Link
                      href={`/dashboard/network?agent_id=${params.id}`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3 py-1.5 text-xs font-bold transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> {t('Manage Targets', 'Quản lý targets')}
                    </Link>
                  </div>
                )}

                {/* Tested Targets Table */}
                {allProbes.length > 0 && (
                  <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
                    <div className="p-3.5 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                          <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          {t('Monitored Targets Breakdown', 'Chi tiết mục tiêu giám sát')} ({allProbes.length})
                        </h3>
                      </div>

                      {/* Tag Filter Pills */}
                      <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)] self-start sm:self-center overflow-x-auto max-w-full">
                        <button
                          type="button"
                          onClick={() => setNetTargetFilter('all')}
                          className={`px-2.5 py-0.5 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
                            netTargetFilter === 'all'
                              ? 'bg-[var(--accent-primary)] text-white'
                              : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          {t('All', 'Tất cả')} ({allProbes.length})
                        </button>
                        {discoveredTags.map((tag) => {
                          const count = allProbes.filter(p => (p.tag || 'default') === tag).length;
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => setNetTargetFilter(tag)}
                              className={`px-2.5 py-0.5 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
                                netTargetFilter.toLowerCase() === tag.toLowerCase()
                                  ? 'bg-[var(--accent-primary)] text-white'
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
                          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] font-semibold text-[var(--color-muted)] text-[11px]">
                            <th className="px-3.5 py-2">{t('Target & Host', 'Mục tiêu & Host')}</th>
                            <th className="px-3.5 py-2">{t('Tag', 'Thẻ')}</th>
                            <th className="px-3.5 py-2">{t('Method', 'Giao thức')}</th>
                            <th className="px-3.5 py-2">{t('Probes', 'Số mẫu')}</th>
                            <th className="px-3.5 py-2">{t('Packet Loss', 'Mất gói')}</th>
                            <th className="px-3.5 py-2">{t('Latency (Avg / Min–Max)', 'Độ trễ (TB / Min–Max)')}</th>
                            <th className="px-3.5 py-2">{t('Status', 'Trạng thái')}</th>
                            <th className="px-3.5 py-2 text-right">{t('History', 'Lịch sử')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {filteredProbes.map((probe) => {
                            const isTCP = probe.probe_method === 'TCP';
                            const lat = probe.latency_ms;
                            const latColor = lat <= 20 ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' :
                                             lat <= 60 ? 'text-blue-500 bg-blue-500/10 border-blue-500/20' :
                                             lat <= 120 ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' :
                                             'text-rose-500 bg-rose-500/10 border-rose-500/20';

                            return (
                              <tr
                                key={probe.id}
                                onClick={() => openProbeHistory(probe)}
                                className="hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                                title={t('Click to view latency & packet loss chart', 'Nhấp để xem biểu đồ độ trễ và mất gói')}
                              >
                                <td className="px-3.5 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-[var(--foreground)]">{probe.name}</span>
                                    {probe.is_gateway && (
                                      <span className="text-[9px] font-mono font-semibold px-1 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                        Gateway
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-mono tabular-nums text-[var(--color-muted)] mt-0.5">
                                    {probe.host}{probe.port ? `:${probe.port}` : ''}
                                  </div>
                                </td>
                                <td className="px-3.5 py-2">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                                    {probe.tag || 'default'}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2">
                                  <span className={`inline-flex items-center font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border ${
                                    isTCP
                                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  }`}>
                                    {probe.probe_method}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2 font-mono tabular-nums text-[var(--color-muted)]">
                                  <span className="text-[var(--foreground)] font-medium">{probe.successful_probes ?? 5}</span>/{probe.total_probes ?? 5}
                                </td>
                                <td className="px-3.5 py-2 font-mono tabular-nums">
                                  {probe.packet_loss != null ? (
                                    <span className={probe.packet_loss > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500 font-medium'}>
                                      {probe.packet_loss}%
                                    </span>
                                  ) : (
                                    <span className="text-[var(--color-muted)] italic" title="TCP reachability probe — packet loss not measured">
                                      N/A
                                    </span>
                                  )}
                                </td>
                                <td className="px-3.5 py-2">
                                  {probe.status === 'unreachable' || (lat === 0 && probe.failed_probes === probe.total_probes) ? (
                                    <span className="font-mono text-rose-500 font-semibold text-[11px]">Timeout</span>
                                  ) : (
                                    <div>
                                      <span className={`inline-block font-mono tabular-nums font-bold px-1.5 py-0.2 rounded border text-[11px] ${latColor}`}>
                                        {lat.toFixed(1)} ms
                                      </span>
                                      {probe.min_latency_ms > 0 && probe.max_latency_ms > 0 && (
                                        <div className="text-[10px] font-mono tabular-nums text-[var(--color-muted)] mt-0.5">
                                          {probe.min_latency_ms.toFixed(1)} – {probe.max_latency_ms.toFixed(1)} ms
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3.5 py-2">
                                  {renderStatusBadge(probe.status)}
                                </td>
                                <td className="px-3.5 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Link
                                      href={`/dashboard/alerts?tab=create&category=network&target=${encodeURIComponent(probe.name)}&server_id=${params.id}&metric=network_latency`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-indigo-500/15 hover:border-indigo-500/30 text-indigo-400 transition-colors cursor-pointer"
                                      title={t(`Create alert rule for target "${probe.name}"`, `Tạo cảnh báo cho "${probe.name}"`)}
                                    >
                                      <Bell className="w-3.5 h-3.5" />
                                    </Link>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openProbeHistory(probe);
                                      }}
                                      className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-[var(--accent-primary)] transition-colors cursor-pointer"
                                      title={t('View latency history chart', 'Xem biểu đồ lịch sử')}
                                    >
                                      <Activity className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
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
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
                    <div className="w-full max-w-2xl rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
                      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
                            <h3 className="text-sm font-bold">{historyTargetProbe.name} — {t('Latency Trend', 'Xu hướng độ trễ')}</h3>
                          </div>
                          <p className="text-[11px] text-[var(--color-muted)] font-mono tabular-nums mt-0.5">
                            Host: {historyTargetProbe.host} · {t('Tag:', 'Thẻ:')} {historyTargetProbe.tag}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoryTargetProbe(null)}
                          className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)]">
                          {(['6h', '24h', '7d'] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => openProbeHistory(historyTargetProbe, r)}
                              className={`px-2.5 py-0.5 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
                                historyRange === r
                                  ? 'bg-[var(--accent-primary)] text-white'
                                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {r.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px] text-[var(--color-muted)] font-mono tabular-nums">
                          {historyData.length} {t('probe points', 'điểm đo')}
                        </span>
                      </div>

                      <div className="h-60 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5">
                        {loadingHistory ? (
                          <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                            {t('Loading time-series data...', 'Đang tải dữ liệu chuỗi thời gian...')}
                          </div>
                        ) : historyData.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                            {t('No history records found for this target.', 'Không có bản ghi lịch sử cho mục tiêu này.')}
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
                                    <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-2 text-xs space-y-1">
                                      <p className="text-[var(--color-muted)] font-mono text-[10px]">
                                        {new Date(pt.measured_at).toLocaleString()}
                                      </p>
                                      <p className="font-bold text-[var(--foreground)] font-mono tabular-nums">
                                        {t('Latency', 'Độ trễ')}: {pt.latency_ms?.toFixed(1) ?? 'N/A'} ms
                                      </p>
                                      {pt.packet_loss != null && (
                                        <p className={`font-mono tabular-nums text-[11px] ${pt.packet_loss > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500'}`}>
                                          {t('Packet Loss', 'Mất gói')}: {pt.packet_loss}%
                                        </p>
                                      )}
                                      <p className="text-[10px] text-[var(--color-muted)] font-mono tabular-nums">
                                        {t('Status', 'Trạng thái')}: {pt.status.toUpperCase()} ({pt.successful_probes}/{pt.total_probes} {t('probes', 'mẫu')})
                                      </p>
                                    </div>
                                  );
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="latency_ms"
                                stroke="#3b82f6"
                                strokeWidth={1.5}
                                fillOpacity={1}
                                fill="url(#latencyGradAgent)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => setHistoryTargetProbe(null)}
                          className="px-3.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                        >
                          {t('Close', 'Đóng')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Host Network Interfaces & Hardware Error Counters */}
                {netIfaces.length > 0 && (
                  <div className="bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-md overflow-hidden">
                    <div className="p-3.5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                          <Network className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          {t('Host Network Interfaces & Hardware Error Counters', 'Giao diện mạng máy chủ & Bộ đếm lỗi phần cứng')}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                          {t('Kernel physical interface counters (RX/TX errors, dropped ring buffer packets, and throughput).', 'Bộ đếm giao diện vật lý kernel (lỗi RX/TX, gói drop trong ring buffer, và băng thông).')}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--color-muted)]">
                        {netIfaces.length} {t('Interfaces', 'Giao diện')}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--color-muted)]">
                            <th className="px-3.5 py-2">{t('Interface', 'Giao diện')}</th>
                            <th className="px-3.5 py-2">{t('Status', 'Trạng thái')}</th>
                            <th className="px-3.5 py-2">{t('IP Address', 'Địa chỉ IP')}</th>
                            <th className="px-3.5 py-2">{t('Drop / Error Rate', 'Tỷ lệ Drop / Lỗi')}</th>
                            <th className="px-3.5 py-2">{t('Dropped (Delta)', 'Gói bị hủy (Delta)')}</th>
                            <th className="px-3.5 py-2">{t('Throughput (I/O)', 'Lưu lượng (I/O)')}</th>
                            <th className="px-3.5 py-2">{t('Lifetime Errors', 'Tổng lỗi tích lũy')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-subtle)]">
                          {netIfaces.map((iface) => {
                            const isPrimary = iface.name === (netDiag?.primary_uplink || primaryIface?.name);
                            return (
                              <tr key={iface.name} className={`hover:bg-[var(--surface-2)] transition-colors ${isPrimary ? 'bg-blue-500/5' : ''}`}>
                                <td className="px-3.5 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-semibold text-xs text-[var(--foreground)]">{iface.name}</span>
                                    {isPrimary && (
                                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-500/15 text-[var(--accent-primary)] border border-blue-500/30">Uplink</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3.5 py-2 text-xs">
                                  <span className={`inline-flex items-center gap-1 font-mono font-semibold ${iface.is_up ? 'text-emerald-500' : 'text-[var(--color-muted)]'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${iface.is_up ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                    {iface.is_up ? 'UP' : 'DOWN'}
                                  </span>
                                </td>
                                <td className="px-3.5 py-2 text-xs font-mono tabular-nums text-[var(--color-muted)]">
                                  {iface.ip_addresses?.length ? iface.ip_addresses.join(', ') : 'N/A'}
                                </td>
                                <td className="px-3.5 py-2 text-xs font-mono tabular-nums">
                                  <div className="space-y-0.5">
                                    <div className={`flex items-center justify-between gap-2 ${(iface.drop_rate_per_min || 0) > 0 ? 'text-amber-500 font-semibold' : 'text-[var(--color-muted)]'}`}>
                                      <span>Drops:</span>
                                      <span>{(iface.drop_rate_per_min || 0).toFixed(1)}/m</span>
                                    </div>
                                    <div className={`flex items-center justify-between gap-2 ${(iface.error_rate_per_min || 0) > 0 ? 'text-rose-500 font-semibold' : 'text-[var(--color-muted)]'}`}>
                                      <span>Errors:</span>
                                      <span>{(iface.error_rate_per_min || 0).toFixed(1)}/m</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3.5 py-2 text-xs font-mono tabular-nums text-[var(--color-muted)]">
                                  +{((iface.delta_drop_in || 0) + (iface.delta_drop_out || 0))} drops
                                </td>
                                <td className="px-3.5 py-2 text-xs font-mono tabular-nums text-[var(--color-muted)]">
                                  RX: {formatBytes(iface.bytes_recv || 0)} / TX: {formatBytes(iface.bytes_sent || 0)}
                                </td>
                                <td className="px-3.5 py-2 text-xs font-mono tabular-nums text-[var(--color-muted)]">
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
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-3.5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                <Box className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {osFamily === 'macos' || osFamily === 'windows' ? t('Local Containers', 'Container cục bộ') : t('Docker Containers', 'Container Docker')}
              </h3>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                {osFamily === 'macos' || osFamily === 'windows' ? t('Containers reported through local Docker engine.', 'Container báo cáo qua Docker engine cục bộ.') : t('Containers managed on this host.', 'Container được quản lý trên máy chủ này.')}
              </p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                {(snapshot?.docker_containers || []).filter(c => c.state === 'running').length} {t('running', 'đang chạy')}
              </span>
              <span className="rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]">
                {snapshot?.docker_containers?.length || 0} {t('total', 'tổng')}
              </span>
            </div>
          </div>

          <div className="divide-y divide-[var(--border-subtle)]">
            {snapshot?.docker_containers?.map(c => {
              const isRunning = c.state === 'running';
              return (
                <div
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 hover:bg-[var(--surface-2)] transition-colors text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        isRunning ? 'bg-emerald-500' : 'bg-zinc-400'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--foreground)] truncate font-mono">{c.name}</span>
                        <span className={`text-[9px] font-mono uppercase font-bold px-1.5 py-0.2 rounded border ${
                          isRunning ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {c.state}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-muted)] truncate mt-0.5 max-w-md font-mono" title={c.image}>
                        {c.image}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      {!isRunning && (
                        <button
                          type="button"
                          onClick={() => handleDockerAction('docker_start', c.id)}
                          className="px-2 py-0.5 text-[11px] font-semibold rounded-sm border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors cursor-pointer"
                        >
                          {t('Start', 'Bắt đầu')}
                        </button>
                      )}
                      {isRunning && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDockerAction('docker_restart', c.id)}
                            className="px-2 py-0.5 text-[11px] font-semibold rounded-sm border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors cursor-pointer"
                          >
                            {t('Restart', 'Khởi động lại')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDockerAction('docker_stop', c.id)}
                            className="px-2 py-0.5 text-[11px] font-semibold rounded-sm border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors cursor-pointer"
                          >
                            {t('Stop', 'Dừng')}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDockerAction('docker_logs', c.id)}
                        className="px-2 py-0.5 text-[11px] font-semibold rounded-sm border border-blue-500/30 bg-blue-500/10 text-[var(--accent-primary)] hover:bg-blue-500/20 transition-colors cursor-pointer"
                      >
                        {t('Logs', 'Nhật ký')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {!snapshot?.docker_containers?.length && (
              <div className="p-8 text-center text-xs text-[var(--color-muted)]">
                {osFamily === 'macos' || osFamily === 'windows'
                  ? t('No local containers were reported by this agent.', 'Không có container cục bộ nào được báo cáo bởi agent này.')
                  : t('No Docker containers were reported by this agent.', 'Không có container Docker nào được báo cáo bởi agent này.')}
              </div>
            )}
          </div>
        </div>
      )}

      {serviceActionRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="alertdialog" aria-modal="true" aria-labelledby="service-action-title" className="w-full max-w-md rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <RotateCw className="h-4 w-4 text-[var(--accent-primary)]" />
              <h2 id="service-action-title" className="text-sm font-bold capitalize text-[var(--foreground)]">
                {serviceActionRequest.action} {t('service?', 'dịch vụ?')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <p className="leading-relaxed text-[var(--color-muted)]">
                {t('Send', 'Gửi lệnh')} <strong className="text-[var(--foreground)] capitalize">{serviceActionRequest.action}</strong> {t('to', 'đến')}{' '}
                <strong className="text-[var(--foreground)] font-mono">{serviceActionRequest.service.display_name || serviceActionRequest.service.name}</strong> {t('through', 'thông qua')} {serviceActionRequest.service.source}.
              </p>
              <p className="font-mono text-[11px] text-[var(--color-muted)]">{serviceActionRequest.service.name}</p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  disabled={serviceActionBusy}
                  onClick={() => setServiceActionRequest(null)}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  type="button"
                  disabled={serviceActionBusy}
                  onClick={handleServiceAction}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {serviceActionBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  <span className="capitalize">{serviceActionBusy ? t('Waiting for agent…', 'Đang chờ agent…') : `${serviceActionRequest.action} ${t('service', 'dịch vụ')}`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="container-logs-title" className="flex max-h-[80vh] w-full max-w-4xl flex-col rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] text-[var(--foreground)] overflow-hidden">
            <div className="flex justify-between items-center p-3.5 border-b border-[var(--border-subtle)]">
              <h3 id="container-logs-title" className="text-xs font-bold text-[var(--foreground)]">
                {t('Container Logs', 'Nhật ký Container')} <span className="text-[var(--color-muted)] font-mono text-[11px] font-normal">({logsModal.containerId})</span>
              </h3>
              <button
                type="button"
                onClick={() => setLogsModal({isOpen: false, containerId: '', logs: '', loading: false})}
                aria-label="Close container logs"
                className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-3.5 overflow-y-auto flex-1 font-mono text-xs bg-[var(--surface-2)] text-[var(--foreground)] whitespace-pre-wrap">
              {logsModal.loading ? (
                <div className="flex items-center gap-2.5 text-[var(--accent-primary)] animate-pulse">
                  <div className="w-3.5 h-3.5 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
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
