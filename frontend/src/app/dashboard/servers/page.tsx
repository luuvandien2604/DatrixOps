'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient, getUserRole } from '@/lib/apiClient';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  Server, RefreshCw, TerminalSquare, FileText, Play, Trash2, XCircle, AlertTriangle,
  UploadCloud, LoaderCircle, CircleCheck, CircleX, Copy, Check, Search,
  LayoutGrid, LayoutList, ToggleLeft, ToggleRight, CheckSquare, Square, ShieldCheck, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/components/LanguageContext';

const isNewerVersion = (target: string | undefined, current: string | undefined) => {
  if (!target) return false;
  if (!current) return true;
  const parse = (value: string) => value.replace(/^v/i, "").split(".").map(part => Number.parseInt(part, 10) || 0);
  const targetParts = parse(target);
  const currentParts = parse(current);
  for (let index = 0; index < Math.max(targetParts.length, currentParts.length); index += 1) {
    if ((targetParts[index] || 0) > (currentParts[index] || 0)) return true;
    if ((targetParts[index] || 0) < (currentParts[index] || 0)) return false;
  }
  return false;
};

type AgentUpdateTask = { id: string; status: string; result?: string };
type ServerSnapshot = {
  system_info?: { public_ip?: string };
  inventory?: { agent_version?: string };
};
type ServerOSInfo = {
  version?: string;
  cpu_usage?: number;
  cpu_cores?: number;
  memory_used?: number;
  memory_total?: number;
  disk_total?: number;
  disk_usage?: number;
  os_name?: string;
  remote_uninstall_supported?: boolean;
  snapshot?: ServerSnapshot;
};
type ServerRecord = {
  id: string;
  name: string;
  status: string;
  ip_address?: string;
  group_name?: string;
  tags?: string[];
  provider?: string;
  region?: string;
  environment?: string;
  os_info?: string | ServerOSInfo;
  snapshot?: string | ServerSnapshot;
  inventory?: string | { agent_version?: string };
  version?: string;
  update_available?: boolean;
  latest_agent_version?: string;
  auto_update_agent?: boolean;
  deletion_status?: string;
  active_agent_update_task?: AgentUpdateTask;
  enrollment_token?: string;
  agent_token?: string;
};
type SystemInfo = {
  agent_version?: string;
  agent_artifact_base_url?: string;
  agent_release_layout?: string;
  update_check?: { latest_version?: string; latest_agent_version?: string };
};
type StatusFilter = 'all' | 'online' | 'offline' | 'critical' | 'update_available';

const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function parseJSON<T>(value: string | T | undefined): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export default function ServersPage() {
  const { t, isVi } = useLanguage();
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const statusFilterTabs = React.useMemo(() => [
    { id: 'all' as StatusFilter, label: t('All', 'Tất cả') },
    { id: 'online' as StatusFilter, label: t('Online', 'Trực tuyến') },
    { id: 'offline' as StatusFilter, label: t('Offline', 'Ngoại tuyến') },
    { id: 'critical' as StatusFilter, label: t('Critical', 'Sự cố') },
    { id: 'update_available' as StatusFilter, label: t('Update Available', 'Có bản cập nhật') },
  ], [t]);

  // Search & Filter & View state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Bulk Selection state
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  // Modals state
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [generatedAgentToken, setGeneratedAgentToken] = useState<string | null>(null);
  const [selectedOs, setSelectedOs] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [customServices, setCustomServices] = useState('');
  const [installCommandCopied, setInstallCommandCopied] = useState(false);
  const [isSelfMonitorModalOpen, setIsSelfMonitorModalOpen] = useState(false);
  const [selfMonitorCopied, setSelfMonitorCopied] = useState(false);

  // Confirmation dialogs
  const [serverToRestart, setServerToRestart] = useState<{ id: string; name: string } | null>(null);
  const [confirmRestartText, setConfirmRestartText] = useState('');

  const [serverToDelete, setServerToDelete] = useState<{
    id: string;
    name: string;
    status: string;
    deletionStatus?: string;
    uninstallSupported: boolean;
  } | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [isDeletingServer, setIsDeletingServer] = useState(false);

  // Edit Meta
  const [editMetaServer, setEditMetaServer] = useState<ServerRecord | null>(null);
  const [editServerName, setEditServerName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editEnvironment, setEditEnvironment] = useState('');

  // Update Agent
  const [serverToUpdate, setServerToUpdate] = useState<{ id: string; name: string; currentVersion: string; targetVersion: string; hasUpdate: boolean } | null>(null);
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [isUpdateAllOpen, setIsUpdateAllOpen] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [agentUpdateTasks, setAgentUpdateTasks] = useState<Record<string, AgentUpdateTask>>({});
  const [updatingAutoUpdatePolicyId, setUpdatingAutoUpdatePolicyId] = useState<string | null>(null);

  // Role permissions
  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  const [checkingUpdateServerId, setCheckingUpdateServerId] = useState<string | null>(null);
  const [systemData, setSystemData] = useState<SystemInfo | null>(null);

  const refreshLatestAgentVersion = useCallback(async () => {
    try {
      let candidate = "1.5.13";
      try {
        const info: SystemInfo = await apiClient("/system/info?_t=" + Date.now());
        if (info?.agent_version) {
          candidate = info.agent_version;
        } else if (info?.update_check?.latest_agent_version) {
          candidate = info.update_check.latest_agent_version;
        }
      } catch {}

      try {
        const res = await fetch(`https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/agent/version.txt?_t=${Date.now()}`);
        if (res.ok) {
          const txt = (await res.text()).trim();
          if (/^\d+\.\d+\.\d+/.test(txt)) {
            if (isNewerVersion(txt, candidate)) {
              candidate = txt;
            }
          }
        }
      } catch {}

      const clean = candidate.replace(/^v/i, "").trim();
      setSystemData(prev => ({
        ...prev,
        agent_version: clean,
        agent_artifact_base_url: `https://github.com/luuvandien2604/DatrixOps/releases/download/agent-v${clean}`,
      }));
    } catch {}
  }, []);

  const handleCheckUpdateForServer = async (server: ServerRecord) => {
    try {
      setCheckingUpdateServerId(server.id);
      let latestVer = '1.5.13';

      try {
        const currentSystem: SystemInfo = await apiClient('/system/info');
        if (currentSystem?.agent_version) {
          latestVer = currentSystem.agent_version;
        } else if (currentSystem?.update_check?.latest_agent_version) {
          latestVer = currentSystem.update_check.latest_agent_version;
        }
      } catch {}

      try {
        const res = await fetch(`https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/agent/version.txt?_t=${Date.now()}`);
        if (res.ok) {
          const rawTxt = (await res.text()).trim();
          if (/^\d+\.\d+\.\d+/.test(rawTxt)) {
            if (isNewerVersion(rawTxt, latestVer)) {
              latestVer = rawTxt;
            }
          }
        }
      } catch {}

      const osInfo = parseJSON<ServerOSInfo>(server.os_info);
      const inventory = parseJSON<{ agent_version?: string }>(server.inventory);
      const snapshot = parseJSON<ServerSnapshot>(server.snapshot);
      const runningVerRaw = osInfo?.version || inventory?.agent_version || snapshot?.inventory?.agent_version || server?.version || '1.5.12';

      const cleanRunning = runningVerRaw.replace(/^v/i, '').trim();
      const cleanTarget = latestVer.replace(/^v/i, '').trim();
      const hasUpdate = isNewerVersion(cleanTarget, cleanRunning);

      setServerToUpdate({
        id: server.id,
        name: server.name,
        currentVersion: `v${cleanRunning}`,
        targetVersion: `v${cleanTarget}`,
        hasUpdate,
      });

      if (!hasUpdate) {
        toast.success(`${server.name} is running the latest Agent (v${cleanRunning})`);
      }
    } catch {
      toast.error('Failed to check for updates');
    } finally {
      setCheckingUpdateServerId(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    apiClient('/auth/me')
      .then((u) => {
        if (mounted && u?.role) setUserRole(u.role);
      })
      .catch(() => {});

    apiClient('/system/info')
      .then((info: SystemInfo) => {
        if (!mounted) return;
        const candidate = info?.agent_version || '1.5.13';
        setSystemData(info);

        fetch(`https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/agent/version.txt?_t=${Date.now()}`)
          .then(async res => {
            if (mounted && res.ok) {
              const txt = (await res.text()).trim();
              if (/^\d+\.\d+\.\d+/.test(txt) && isNewerVersion(txt, candidate)) {
                setSystemData(prev => ({
                  ...prev,
                  agent_version: txt.replace(/^v/i, ''),
                  agent_artifact_base_url: `https://github.com/luuvandien2604/DatrixOps/releases/download/agent-v${txt.replace(/^v/i, '')}`,
                }));
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const isAdmin = userRole !== 'viewer';
  const isViewer = userRole === 'viewer';

  const router = useRouter();

  const fetchServers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data: ServerRecord[] = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
      setLastRefreshedAt(new Date());
      setAgentUpdateTasks(current => {
        const next = { ...current };
        for (const server of Array.isArray(data) ? data : []) {
          if (server.active_agent_update_task) {
            next[server.id] = server.active_agent_update_task;
          } else if (next[server.id] && !['pending', 'processing'].includes(next[server.id].status)) {
            delete next[server.id];
          }
        }
        return next;
      });
    } catch (err: unknown) {
      const message = errorMessage(err, 'Unable to load servers');
      if (message.includes('token') || message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const data: ServerRecord[] = await apiClient('/servers');
        if (!cancelled) {
          setServers(Array.isArray(data) ? data : []);
          setLastRefreshedAt(new Date());
          setAgentUpdateTasks(current => {
            const next = { ...current };
            for (const server of Array.isArray(data) ? data : []) {
              if (server.active_agent_update_task) {
                next[server.id] = server.active_agent_update_task;
              } else if (next[server.id] && !['pending', 'processing'].includes(next[server.id].status)) {
                delete next[server.id];
              }
            }
            return next;
          });
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message = errorMessage(err, 'Unable to load servers');
          if (message.includes('token') || message.includes('UNAUTHORIZED')) {
            router.push('/login');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadInitial();
    const interval = setInterval(() => fetchServers(true), 20_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchServers, router]);

  useEffect(() => {
    const activeEntries = Object.entries(agentUpdateTasks).filter(([, task]) => ['pending', 'processing'].includes(task.status));
    if (!activeEntries.length) return;

    const interval = window.setInterval(async () => {
      const nextTasks = { ...agentUpdateTasks };
      await Promise.all(activeEntries.map(async ([serverId, task]) => {
        try {
          const updatedTask: AgentUpdateTask = await apiClient(`/servers/${serverId}/tasks/${task.id}`);
          nextTasks[serverId] = updatedTask;
          if (updatedTask.status === 'completed') {
            toast.success('Agent update completed and confirmed');
          } else if (['failed', 'expired', 'timed_out'].includes(updatedTask.status)) {
            toast.error(updatedTask.result || `Agent update ${updatedTask.status}`);
          }
        } catch (error: unknown) {
          toast.error(errorMessage(error, 'Unable to refresh agent update status'));
        }
      }));
      setAgentUpdateTasks(nextTasks);
      fetchServers(true);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [agentUpdateTasks, fetchServers]);

  // Toggle Auto-Update Policy for a single server
  const toggleAutoUpdatePolicy = async (serverId: string, currentEnabled: boolean, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    if (!isAdmin) {
      toast.error('Changing auto-update policy requires Admin role permission.');
      return;
    }
    try {
      setUpdatingAutoUpdatePolicyId(serverId);
      const newStatus = !currentEnabled;
      await apiClient(`/servers/${serverId}/agent-update-policy`, {
        method: 'PUT',
        data: { enabled: newStatus }
      });
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, auto_update_agent: newStatus } : s));
      toast.success(`Auto-update ${newStatus ? 'enabled' : 'disabled'} for server`);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update auto-update policy'));
    } finally {
      setUpdatingAutoUpdatePolicyId(null);
    }
  };

  // Bulk set auto update policy
  const handleBulkAutoUpdate = async (enable: boolean) => {
    if (!selectedServerIds.length) return;
    if (!isAdmin) {
      toast.error('Changing auto-update policy requires Admin role permission.');
      return;
    }
    setIsBulkProcessing(true);
    let successCount = 0;
    try {
      await Promise.all(
        selectedServerIds.map(async (id) => {
          try {
            await apiClient(`/servers/${id}/agent-update-policy`, {
              method: 'PUT',
              data: { enabled: enable }
            });
            successCount++;
          } catch (e) {
            console.error(`Failed auto update toggle for ${id}`, e);
          }
        })
      );
      if (successCount > 0) {
        toast.success(`Auto-update ${enable ? 'enabled' : 'disabled'} for ${successCount} server(s)`);
        fetchServers(true);
      } else {
        toast.error('Failed to update auto-update policy. Check your permissions.');
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Bulk auto-update policy error'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Bulk update agents
  const handleBulkUpdateAgents = async () => {
    if (!selectedServerIds.length) return;
    if (isViewer) {
      toast.error('Triggering agent updates requires Operator or Admin role permission.');
      return;
    }
    setIsBulkProcessing(true);
    let queuedCount = 0;
    try {
      await Promise.all(
        selectedServerIds.map(async (id) => {
          try {
            const task: AgentUpdateTask = await apiClient(`/servers/${id}/tasks`, {
              method: 'POST',
              data: { type: 'agent_update', payload: '{}', timeout_seconds: 300 }
            });
            setAgentUpdateTasks(current => ({ ...current, [id]: task }));
            queuedCount++;
          } catch (e) {
            console.error(`Failed to queue update for ${id}`, e);
          }
        })
      );
      if (queuedCount > 0) {
        toast.success(`Queued agent update for ${queuedCount} server(s)`);
        fetchServers(true);
      } else {
        toast.error('Failed to queue agent updates. Check your permissions.');
      }
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Bulk agent update error'));
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Filtered servers logic
  const filteredServers = servers.filter(server => {
    const osInfo = parseJSON<ServerOSInfo>(server.os_info);
    const ip = server.ip_address || osInfo?.snapshot?.system_info?.public_ip || '';
    const nameMatch = server.name.toLowerCase().includes(searchQuery.toLowerCase());
    const ipMatch = ip.toLowerCase().includes(searchQuery.toLowerCase());
    const groupMatch = server.group_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const tagMatch = server.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!(nameMatch || ipMatch || groupMatch || tagMatch)) return false;

    if (statusFilter === 'online') return server.status === 'online';
    if (statusFilter === 'offline') return server.status !== 'online';
    if (statusFilter === 'critical') return server.status === 'online' && Number(osInfo?.cpu_usage || 0) > 90;
    if (statusFilter === 'update_available') return Boolean(server.update_available);

    return true;
  });

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
  };

  // Select all toggle
  const isAllSelected = filteredServers.length > 0 && filteredServers.every(s => selectedServerIds.includes(s.id));
  const onlineCount = servers.filter(server => server.status === 'online').length;
  const offlineCount = servers.length - onlineCount;
  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedServerIds([]);
    } else {
      setSelectedServerIds(filteredServers.map(s => s.id));
    }
  };

  const toggleSelectServer = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedServerIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const closeDeleteDialog = () => {
    if (isDeletingServer) return;
    setServerToDelete(null);
    setConfirmDeleteText('');
  };

  const requestServerDeletion = async (force: boolean) => {
    if (!serverToDelete || confirmDeleteText !== serverToDelete.name) return;

    try {
      setIsDeletingServer(true);
      const endpoint = force
        ? `/servers/${serverToDelete.id}?force=true`
        : `/servers/${serverToDelete.id}`;
      const result = await apiClient(endpoint, { method: 'DELETE' });

      if (force) {
        toast.success(`Server ${serverToDelete.name} record deleted`);
      } else {
        toast.success(result?.message || `Agent uninstall queued for ${serverToDelete.name}`);
      }

      setServerToDelete(null);
      setConfirmDeleteText('');
      await fetchServers(true);
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Unable to delete server'));
    } finally {
      setIsDeletingServer(false);
    }
  };

  useEffect(() => {
    const resetCopiedState = window.setTimeout(() => setInstallCommandCopied(false), 0);
    return () => window.clearTimeout(resetCopiedState);
  }, [selectedOs, customServices, generatedAgentToken]);

  const getInstallCommand = () => {
    const controlPlaneOrigin = typeof window === 'undefined' ? '' : window.location.origin;
    const services = customServices.trim();
    const agentVersion = (systemData?.agent_version || '1.5.13').replace(/^v/i, '').trim();
    const defaultArtifactUrl = `https://github.com/luuvandien2604/DatrixOps/releases/download/agent-v${agentVersion}`;
    const agentArtifactBaseUrl = (systemData?.agent_artifact_base_url && systemData.agent_artifact_base_url.includes(agentVersion))
      ? systemData.agent_artifact_base_url
      : defaultArtifactUrl;
    const isHttp = controlPlaneOrigin.startsWith('http://');
    const isLocalhost = controlPlaneOrigin.includes('localhost') || controlPlaneOrigin.includes('127.0.0.1');
    const allowInsecureFlag = isHttp && !isLocalhost;
    const shellInsecureArg = allowInsecureFlag ? ' --allow-insecure-http' : '';
    const powershellInsecureArg = allowInsecureFlag ? ' -AllowInsecureHttp' : '';
    const shellServicesArgument = services ? ` --services "${services}"` : '';
    const powershellServicesArgument = services ? ` -Services "${services}"` : '';
    const agentReleaseLayout = systemData?.agent_release_layout || 'legacy_direct';
    switch (selectedOs) {
      case 'linux':
        return `curl -fsSL ${agentArtifactBaseUrl}/install.sh | sudo bash -s -- --server ${controlPlaneOrigin} --token ${generatedAgentToken} --agent-version ${agentVersion} --agent-artifact-base-url ${agentArtifactBaseUrl} --agent-release-layout ${agentReleaseLayout}${shellInsecureArg}${shellServicesArgument}`;
      case 'macos':
        return `curl -fsSL ${agentArtifactBaseUrl}/install-mac.sh | sudo bash -s -- --server ${controlPlaneOrigin} --token ${generatedAgentToken} --agent-version ${agentVersion} --agent-artifact-base-url ${agentArtifactBaseUrl} --agent-release-layout ${agentReleaseLayout}${shellInsecureArg}${shellServicesArgument}`;
      case 'windows':
        return `Invoke-WebRequest -Uri "${controlPlaneOrigin}/install.ps1" -OutFile "install.ps1"; .\\install.ps1 -Token "${generatedAgentToken}" -ServerUrl "${controlPlaneOrigin}" -AgentVersion "${agentVersion}" -AgentArtifactBaseUrl "${agentArtifactBaseUrl}" -AgentReleaseLayout "${agentReleaseLayout}"${powershellInsecureArg}${powershellServicesArgument}`;
      default:
        return '';
    }
  };

  const copyInstallCommand = async () => {
    const command = getInstallCommand();
    try {
      await copyTextToClipboard(command);
      setInstallCommandCopied(true);
      toast.success('Install command copied to clipboard');
      window.setTimeout(() => setInstallCommandCopied(false), 2500);
    } catch {
      setInstallCommandCopied(false);
      toast.error('Unable to copy install command');
    }
  };

  const selfHostServer = servers.find(
    s => s.name?.toLowerCase().includes('control plane') ||
         s.name?.toLowerCase().includes('datrixops') ||
         s.name?.toLowerCase() === 'server' ||
         s.tags?.includes('self-host') ||
         s.tags?.includes('control-plane')
  );
  const isSelfHostOnline = selfHostServer?.status === 'online';

  const handleSelfMonitorClick = () => {
    if (!isAdmin) return;
    setIsSelfMonitorModalOpen(true);
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {t('Server Management', 'Quản lý máy chủ')}
          </h1>
          <p className="mt-1 font-mono text-xs text-[var(--color-muted)]">
            {servers.length} {t('agents', 'máy chủ')} · {onlineCount} {t('online', 'trực tuyến')} · {offlineCount} {t('offline', 'ngoại tuyến')} · {t('Last refresh:', 'Lần làm mới gần nhất:')} {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString(isVi ? 'vi-VN' : 'en-US') : t('Waiting for data', 'Đang đợi dữ liệu')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSelfMonitorClick}
            disabled={!isAdmin}
            title={!isAdmin ? t('Self-monitoring requires Admin role permission', 'Yêu cầu quyền Quản trị') : ''}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--accent-primary)]/40 bg-[var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            {t('Self-Monitor This VPS', 'Giám sát VPS máy chủ này')}
          </button>
          <button
            type="button"
            onClick={() => setIsUpdateAllOpen(true)}
            disabled={!isAdmin || servers.length === 0 || isUpdatingAll}
            title={!isAdmin ? t('Updating all agents requires Admin role permission', 'Yêu cầu quyền Quản trị') : ''}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UploadCloud className="h-3.5 w-3.5 text-[var(--color-muted)]" />
            {t('Update all agents', 'Cập nhật tất cả Agent')}
          </button>
          <button
            onClick={() => fetchServers()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : 'text-[var(--color-muted)]'}`} />
            {t('Refresh', 'Làm mới')}
          </button>
          <button
            onClick={() => { refreshLatestAgentVersion(); setIsAddServerModalOpen(true); }}
            disabled={!isAdmin}
            title={!isAdmin ? t('Adding servers requires Admin role permission', 'Yêu cầu quyền Quản trị') : ''}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Server className="w-3.5 h-3.5" />
            {t('+ Add Server', '+ Thêm máy chủ')}
          </button>
        </div>
      </div>

      {/* Control Toolbar: Search, Status Filter, View Toggle */}
      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5 w-full">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none z-10" />
            <input
              type="text"
              placeholder={t('Search by name, IP, group or tag...', 'Tìm theo tên, IP, nhóm hoặc thẻ...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '34px' }}
              className="w-full pr-7 py-1.5 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded text-xs text-[var(--foreground)] placeholder:[var(--color-muted)] outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)] hover:text-[var(--foreground)]"
                title={t('Clear search', 'Xóa tìm kiếm')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1 w-full overflow-x-auto sm:w-auto">
            {statusFilterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-100 ${
                  statusFilter === tab.id
                    ? 'bg-[var(--accent-primary)] text-white font-semibold'
                    : 'bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] p-0.5 self-end md:self-auto">
          <button
            onClick={() => setViewMode('table')}
            title={t('Table View', 'Xem dạng bảng')}
            className={`rounded p-1 text-xs transition-colors ${viewMode === 'table' ? 'bg-[var(--surface-1)] text-[var(--foreground)] shadow-xs' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}
          >
            <LayoutList className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            title={t('Grid Card View', 'Xem dạng lưới')}
            className={`rounded p-1 text-xs transition-colors ${viewMode === 'grid' ? 'bg-[var(--surface-1)] text-[var(--foreground)] shadow-xs' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Sticky Bulk Action Bar */}
      {selectedServerIds.length > 0 && (
        <div className="sticky top-4 z-40 rounded-md border border-blue-500/30 bg-[var(--surface-1)] p-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-5 w-5 rounded-full bg-[var(--accent-primary)] text-white font-mono font-bold text-xs">
              {selectedServerIds.length}
            </span>
            <span className="text-xs font-semibold text-[var(--foreground)]">
              {selectedServerIds.length} {t('server(s) selected', 'máy chủ đã chọn')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulkAutoUpdate(true)}
              disabled={!isAdmin || isBulkProcessing}
              title={!isAdmin ? t('Changing auto-update policy requires Admin role', 'Cần quyền Quản trị') : ''}
              className="inline-flex items-center gap-1.5 rounded border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ToggleRight className="w-3.5 h-3.5" />
              {t('Enable Auto-Update', 'Bật tự cập nhật')}
            </button>
            <button
              onClick={() => handleBulkAutoUpdate(false)}
              disabled={!isAdmin || isBulkProcessing}
              title={!isAdmin ? t('Changing auto-update policy requires Admin role', 'Cần quyền Quản trị') : ''}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ToggleLeft className="w-3.5 h-3.5" />
              {t('Disable Auto-Update', 'Tắt tự cập nhật')}
            </button>
            <button
              onClick={handleBulkUpdateAgents}
              disabled={isViewer || isBulkProcessing}
              title={isViewer ? t('Triggering agent updates requires Operator or Admin role', 'Cần quyền Quản trị hoặc Vận hành') : ''}
              className="inline-flex items-center gap-1.5 rounded border border-amber-500/35 bg-amber-500/12 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              {t('Trigger Agent Update', 'Kích hoạt cập nhật Agent')}
            </button>
            <button
              onClick={() => setSelectedServerIds([])}
              className="rounded px-2.5 py-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              {t('Clear Selection', 'Bỏ chọn')}
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        /* Table View */
        <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[var(--surface-2)] border-b border-[var(--border-subtle)] font-mono text-[10px] uppercase text-[var(--color-muted)]">
                  <th className="py-2.5 px-3 w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors flex items-center"
                      title={isAllSelected ? t('Deselect all', 'Bỏ chọn tất cả') : t('Select all', 'Chọn tất cả')}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-4 font-bold">{t('Host', 'Máy chủ')}</th>
                  <th className="py-2.5 px-4 font-bold">{t('Connection', 'Địa chỉ IP')}</th>
                  <th className="py-2.5 px-4 font-bold">{t('Platform', 'Hệ điều hành')}</th>
                  <th className="min-w-[180px] py-2.5 px-4 font-bold">{t('Resources', 'Tài nguyên')}</th>
                  <th className="py-2.5 px-4 font-bold">{t('Update policy', 'Chính sách Agent')}</th>
                  <th className="py-2.5 px-4 font-bold">{t('Health', 'Trạng thái')}</th>
                  <th className="py-2.5 px-4 text-right font-bold">{t('Actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-xs text-[var(--color-muted)]">
                      {servers.length === 0 ? (
                        t('No servers found. Add your first server to start monitoring.', 'Chưa có máy chủ nào. Thêm máy chủ đầu tiên để bắt đầu giám sát.')
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <span>No servers match the active search or status filter.</span>
                          <button type="button" onClick={clearFilters} className="ops-button secondary">
                            Clear filters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredServers.map((server) => {
                    const osInfo = parseJSON<ServerOSInfo>(server.os_info);
                    const serverSnapshot = parseJSON<ServerSnapshot>(server.snapshot);

                    const updateAvailable = Boolean(server.update_available);
                    const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
                    const isOffline = server.status !== 'online';
                    const agentIPAddress = server.ip_address || serverSnapshot?.system_info?.public_ip || osInfo?.snapshot?.system_info?.public_ip || '';
                    const updateTask = agentUpdateTasks[server.id] || server.active_agent_update_task;
                    const updateInProgress = Boolean(updateTask && ['pending', 'processing'].includes(updateTask.status));
                    const updateStalled = Boolean(updateTask?.status === 'completed' && updateAvailable);
                    const updateFailed = Boolean(updateTask && (['failed', 'expired', 'timed_out'].includes(updateTask.status) || updateStalled) && updateAvailable);
                    const isCheckingUpdate = checkingUpdateServerId === server.id;
                    const UpdateIcon = updateInProgress || isCheckingUpdate
                      ? LoaderCircle
                      : updateFailed
                        ? CircleX
                        : updateAvailable
                          ? UploadCloud
                          : CircleCheck;

                    const runningAgentVersion = osInfo?.version || serverSnapshot?.inventory?.agent_version || 'Unknown';
                    const updateTitle = isViewer
                      ? 'Updating agent requires Operator or Admin role'
                      : updateInProgress
                        ? 'Updating agent...'
                        : isCheckingUpdate
                          ? 'Checking for updates...'
                          : updateFailed
                            ? `Update failed: click to retry updating agent to ${latestAgentVersion || 'latest version'}`
                            : updateAvailable
                              ? `Update Agent to ${latestAgentVersion || 'latest version'}`
                              : `Agent is up to date (${runningAgentVersion}). Click to check for updates`;
                    const updateBadgeLabel = updateInProgress
                      ? updateTask?.status === 'processing' ? 'Updating agent...' : 'Update queued...'
                      : updateFailed
                        ? updateStalled ? 'Update needs retry' : `Update ${updateTask?.status}`
                        : latestAgentVersion
                          ? `Update available: ${latestAgentVersion}`
                          : 'Update available';
                    const UpdateBadgeIcon = updateInProgress ? LoaderCircle : updateFailed ? CircleX : UploadCloud;
                    const liveInfo = isOffline ? null : osInfo;
                    const isCritical = Boolean(liveInfo && Number(liveInfo.cpu_usage || 0) > 90);
                    const isSelected = selectedServerIds.includes(server.id);

                    // Compute pure numerical text for CPU, RAM, Disk
                    const cpuText = liveInfo ? `${Number(liveInfo.cpu_usage || 0).toFixed(1)}%` : '—';
                    const ramPct = liveInfo && Number(liveInfo.memory_total || 0) > 0
                      ? ((Number(liveInfo.memory_used || 0) / Number(liveInfo.memory_total)) * 100).toFixed(1)
                      : null;
                    const ramText = ramPct ? `${ramPct}%` : '—';

                    const diskPct = liveInfo && Number(liveInfo.disk_total || 0) > 0 ? Number(liveInfo.disk_usage || 0).toFixed(1) : null;
                    const diskText = diskPct !== null ? `${diskPct}%` : '—';

                    return (
                      <tr
                        key={server.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open ${server.name}`}
                        onClick={() => router.push(`/dashboard/servers/${server.id}`)}
                        onKeyDown={event => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            router.push(`/dashboard/servers/${server.id}`);
                          }
                        }}
                        className={`group cursor-pointer hover:bg-[var(--surface-2)] transition-colors focus-visible:outline-none ${isSelected ? 'bg-blue-500/10' : ''}`}
                      >
                        <td className="py-2.5 px-3">
                          <button
                            onClick={e => toggleSelectServer(server.id, e)}
                            className="flex items-center text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-xs text-[var(--foreground)] transition-colors group-hover:text-[var(--accent-primary)]">
                              {server.name}
                            </span>
                            {server.group_name && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[9px] font-mono font-medium">
                                {server.group_name}
                              </span>
                            )}
                            {server.tags && server.tags.map((tItem: string) => (
                              <span key={tItem} className="px-1.5 py-0.5 bg-blue-500/10 text-[var(--accent-primary)] border border-blue-500/20 rounded text-[9px] font-mono uppercase">
                                {tItem}
                              </span>
                            ))}
                          </div>
                          {server.deletion_status && server.deletion_status !== 'active' && (
                            <div className={`mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                              server.deletion_status === 'failed'
                                ? 'border-rose-500/35 bg-rose-500/10 text-rose-500'
                                : 'border-amber-500/35 bg-amber-500/15 text-amber-500'
                            }`}>
                              <LoaderCircle className={`h-2.5 w-2.5 ${server.deletion_status !== 'failed' ? 'animate-spin' : ''}`} />
                              {server.deletion_status === 'pending'
                                ? t('Waiting for Agent uninstall', 'Chờ gỡ cài đặt Agent')
                                : server.deletion_status === 'uninstalling'
                                  ? t('Uninstalling Agent', 'Đang gỡ cài đặt Agent')
                                  : t('Agent uninstall failed', 'Gỡ cài đặt Agent thất bại')}
                            </div>
                          )}
                          {(updateInProgress || updateFailed) && (
                            <div className={`mt-1.5 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-mono font-semibold ${
                              updateFailed
                                ? 'border-rose-500/35 bg-rose-500/10 text-rose-500'
                                : 'border-amber-500/35 bg-amber-500/15 text-amber-500'
                            }`}>
                              <UpdateBadgeIcon className={`h-2.5 w-2.5 ${updateInProgress ? 'animate-spin' : ''}`} />
                              {updateBadgeLabel}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4 font-mono tabular-nums text-xs text-[var(--foreground)]">
                          {agentIPAddress || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-xs">
                          <div className="text-[var(--foreground)] truncate max-w-[140px]">{osInfo ? osInfo.os_name : t('Unknown', 'Không xác định')}</div>
                          <div className="text-[11px] font-mono text-[var(--color-muted)] mt-0.5">{osInfo ? `${osInfo.cpu_cores} Cores` : '—'}</div>
                        </td>

                        <td className="py-2.5 px-4">
                          <div className="resource-values">
                            <ResourceValue label="CPU" value={cpuText} numericValue={liveInfo?.cpu_usage} />
                            <ResourceValue label="RAM" value={ramText} numericValue={ramPct == null ? undefined : Number(ramPct)} />
                            <ResourceValue label="DISK" value={diskText} numericValue={diskPct == null ? undefined : Number(diskPct)} />
                          </div>
                        </td>

                        {/* Auto-Update Toggle Button */}
                        <td className="py-2.5 px-4">
                          <button
                            type="button"
                            disabled={!isAdmin || updatingAutoUpdatePolicyId === server.id}
                            onClick={e => toggleAutoUpdatePolicy(server.id, Boolean(server.auto_update_agent), e)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors cursor-pointer ${
                              server.auto_update_agent
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25'
                                : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:bg-[var(--border-subtle)]'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                            title={!isAdmin ? t('Changing auto-update policy requires Admin role', 'Cần quyền Quản trị') : server.auto_update_agent ? t('Click to disable auto-update', 'Nhấp để tắt tự cập nhật') : t('Click to enable auto-update', 'Nhấp để bật tự cập nhật')}
                          >
                            {updatingAutoUpdatePolicyId === server.id ? (
                              <LoaderCircle className="w-3 h-3 animate-spin" />
                            ) : server.auto_update_agent ? (
                              <ToggleRight className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <ToggleLeft className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                            )}
                            {server.auto_update_agent ? t('Enabled', 'Bật') : t('Disabled', 'Tắt')}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-4">
                          <div className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border ${
                            server.status === 'online'
                              ? isCritical ? 'bg-rose-500/15 text-rose-500 border-rose-500/30' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                              : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              server.status === 'online' ? (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') : 'bg-zinc-400'
                            }`} />
                            {server.status === 'online' ? (isCritical ? t('CRITICAL', 'SỰ CỐ') : t('ONLINE', 'TRỰC TUYẾN')) : t('OFFLINE', 'NGOẠI TUYẾN')}
                          </div>
                        </td>

                        {/* Quick Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <div className="server-quick-actions flex items-center justify-end gap-1">
                            <button
                              disabled={!isAdmin}
                              onClick={event => {
                                event.stopPropagation();
                                if (!isAdmin) return;
                                setEditMetaServer(server);
                                setEditServerName(server.name || '');
                                setEditGroupName(server.group_name || '');
                                setEditTags((server.tags || []).join(', '));
                                setEditProvider(server.provider || '');
                                setEditRegion(server.region || '');
                                setEditEnvironment(server.environment || '');
                              }}
                              className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-amber-500/20 text-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              title={!isAdmin ? t('Editing server metadata requires Admin role', 'Cần quyền Quản trị') : t('Edit Group & Tags', 'Chỉnh sửa nhóm & thẻ')}
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={isViewer}
                              onClick={event => {
                                event.stopPropagation();
                                if (isViewer) return;
                                router.push(`/dashboard/servers/${server.id}?view=terminal`);
                              }}
                              className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-blue-500/20 text-[var(--accent-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              title={isViewer ? t('Terminal access requires Operator or Admin role', 'Cần quyền Vận hành hoặc Quản trị') : t('Open Web Terminal', 'Mở Web Terminal')}
                            >
                              <TerminalSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                router.push(`/dashboard/monitoring?server_id=${server.id}`);
                              }}
                              className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-purple-500/20 text-purple-400 transition-colors cursor-pointer"
                              title={t('View Telemetry Metrics', 'Xem số liệu đo lường')}
                            >
                              <Activity className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                if (isViewer || isCheckingUpdate || updateInProgress) return;
                                handleCheckUpdateForServer(server);
                              }}
                              disabled={isViewer || updateInProgress || isCheckingUpdate}
                              className={`rounded-md border p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                                updateAvailable || updateFailed
                                  ? 'border-amber-500/40 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25'
                                  : isCheckingUpdate || updateInProgress
                                    ? 'border-blue-500/30 bg-blue-500/10 text-[var(--accent-primary)]'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-emerald-500 hover:bg-[var(--border-subtle)]'
                              }`}
                              title={updateTitle}
                            >
                              <UpdateIcon className={`h-3.5 w-3.5 ${updateInProgress || isCheckingUpdate ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              disabled={isViewer}
                              onClick={event => {
                                event.stopPropagation();
                                if (isViewer) return;
                                setServerToRestart({ id: server.id, name: server.name });
                              }}
                              className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-rose-500/20 text-rose-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              title={isViewer ? t('Executing commands requires Operator or Admin role', 'Cần quyền Vận hành hoặc Quản trị') : t('Restart Server', 'Khởi động lại')}
                            >
                              <Play className="w-3.5 h-3.5 rotate-180" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                if (!isAdmin) return;
                                setServerToDelete({
                                  id: server.id,
                                  name: server.name,
                                  status: server.status,
                                  deletionStatus: server.deletion_status,
                                  uninstallSupported: Boolean(osInfo?.remote_uninstall_supported),
                                });
                              }}
                              disabled={!isAdmin || ['pending', 'uninstalling'].includes(server.deletion_status ?? '')}
                              className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-rose-500/20 text-rose-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              title={!isAdmin ? t('Deleting servers requires Admin role', 'Cần quyền Quản trị') : t('Delete Server', 'Xóa máy chủ')}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Grid Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredServers.length === 0 ? (
            <div className="col-span-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] py-12 text-center text-xs text-[var(--color-muted)]">
              {servers.length === 0 ? (
                t('No servers found. Add your first server to start monitoring.', 'Chưa có máy chủ nào. Thêm máy chủ đầu tiên để bắt đầu giám sát.')
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <span>{t('No servers match the active search or status filter.', 'Không có máy chủ nào khớp với bộ lọc.')}</span>
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer">
                    {t('Clear filters', 'Xóa bộ lọc')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredServers.map((server) => {
              const osInfo = parseJSON<ServerOSInfo>(server.os_info);
              const serverSnapshot = parseJSON<ServerSnapshot>(server.snapshot);

              const updateAvailable = Boolean(server.update_available);
              const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
              const isOffline = server.status !== 'online';
              const updateTask = agentUpdateTasks[server.id] || server.active_agent_update_task;
              const updateInProgress = Boolean(updateTask && ['pending', 'processing'].includes(updateTask.status));
              const updateStalled = Boolean(updateTask?.status === 'completed' && updateAvailable);
              const updateFailed = Boolean(updateTask && (['failed', 'expired', 'timed_out'].includes(updateTask.status) || updateStalled));
              const isCheckingUpdate = checkingUpdateServerId === server.id;
              const UpdateIcon = updateInProgress || isCheckingUpdate
                ? LoaderCircle
                : updateFailed
                  ? CircleX
                  : updateAvailable
                    ? UploadCloud
                    : CircleCheck;

              const liveInfo = isOffline ? null : osInfo;
              const isCritical = Boolean(liveInfo && Number(liveInfo.cpu_usage || 0) > 90);
              const isSelected = selectedServerIds.includes(server.id);
              const runningAgentVersion = osInfo?.version || serverSnapshot?.inventory?.agent_version || 'Unknown';
              const updateTitle = isViewer
                ? t('Updating agent requires Operator or Admin role', 'Cần quyền Vận hành hoặc Quản trị')
                : updateInProgress
                  ? t('Updating agent...', 'Đang cập nhật agent...')
                  : isCheckingUpdate
                    ? t('Checking for updates...', 'Đang kiểm tra cập nhật...')
                    : updateFailed
                      ? `${t('Update failed: click to retry updating agent to', 'Cập nhật thất bại: nhấp để thử lại cập nhật lên')} ${latestAgentVersion || 'latest version'}`
                      : updateAvailable
                        ? `${t('Update Agent to', 'Cập nhật Agent lên')} ${latestAgentVersion || 'latest version'}`
                        : `${t('Agent is up to date', 'Agent đã là bản mới nhất')} (${runningAgentVersion}). ${t('Click to check for updates', 'Nhấp để kiểm tra bản cập nhật')}`;

              return (
                <div
                  key={server.id}
                  onClick={() => router.push(`/dashboard/servers/${server.id}`)}
                  className={`rounded-md border p-4 cursor-pointer transition-colors hover:border-[var(--accent-primary)]/40 relative flex flex-col justify-between ${
                    isSelected ? 'border-[var(--accent-primary)] bg-blue-500/10' : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2.5 mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => toggleSelectServer(server.id, e)}
                          className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors"
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4 text-[var(--accent-primary)]" /> : <Square className="w-4 h-4" />}
                        </button>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                            <h3 className="font-bold text-[var(--foreground)] text-sm group-hover:text-[var(--accent-primary)] transition-colors">
                              {server.name}
                            </h3>
                            {server.group_name && (
                              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[9px] font-mono font-medium">
                                {server.group_name}
                              </span>
                            )}
                            {server.tags && server.tags.map((tItem: string) => (
                              <span key={tItem} className="px-1.5 py-0.2 bg-blue-500/10 text-[var(--accent-primary)] border border-blue-500/20 rounded text-[9px] font-mono uppercase">
                                {tItem}
                              </span>
                            ))}
                          </div>
                          <span className="font-mono tabular-nums text-xs text-[var(--color-muted)]">{server.ip_address || '—'}</span>
                        </div>
                      </div>
                      <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider uppercase border ${
                        server.status === 'online'
                          ? isCritical ? 'bg-rose-500/15 text-rose-500 border-rose-500/30' : 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                          : 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30'
                      }`}>
                        {server.status === 'online' ? (isCritical ? t('CRITICAL', 'SỰ CỐ') : t('ONLINE', 'TRỰC TUYẾN')) : t('OFFLINE', 'NGOẠI TUYẾN')}
                      </div>
                    </div>

                    {/* Stats Grid: Monospaced Numbers Only */}
                    <div className="grid grid-cols-3 gap-2 bg-[var(--surface-2)] p-2.5 rounded-md border border-[var(--border-subtle)] my-2.5 text-center font-mono tabular-nums">
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-0.5">CPU</div>
                        <div className={`text-xs font-semibold ${liveInfo && Number(liveInfo.cpu_usage || 0) > 90 ? 'text-rose-500 font-bold' : 'text-[var(--foreground)]'}`}>
                          {liveInfo ? `${Number(liveInfo.cpu_usage || 0).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-0.5">RAM</div>
                        <div className="text-xs font-semibold text-[var(--foreground)]">
                          {liveInfo && Number(liveInfo.memory_total || 0) > 0 ? `${((Number(liveInfo.memory_used || 0) / Number(liveInfo.memory_total)) * 100).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-0.5">DISK</div>
                        <div className="text-xs font-semibold text-[var(--foreground)]">
                          {liveInfo && Number(liveInfo.disk_total || 0) > 0 ? `${Number(liveInfo.disk_usage || 0).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action Bar */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-[var(--border-subtle)] text-xs">
                    {/* Auto Update Policy Toggle */}
                    <button
                      type="button"
                      onClick={e => toggleAutoUpdatePolicy(server.id, Boolean(server.auto_update_agent), e)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-colors cursor-pointer ${
                        server.auto_update_agent
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-500'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)]'
                      }`}
                    >
                      {server.auto_update_agent ? <ToggleRight className="w-3.5 h-3.5 text-emerald-500" /> : <ToggleLeft className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
                      {t('Auto-Update', 'Tự cập nhật')}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setEditMetaServer(server);
                          setEditServerName(server.name || '');
                          setEditGroupName(server.group_name || '');
                          setEditTags((server.tags || []).join(', '));
                          setEditProvider(server.provider || '');
                          setEditRegion(server.region || '');
                          setEditEnvironment(server.environment || '');
                        }}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-amber-500/20 text-amber-500 transition-colors cursor-pointer"
                        title={t('Edit Group & Tags', 'Chỉnh sửa nhóm & thẻ')}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/servers/${server.id}?view=terminal`); }}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-blue-500/20 text-[var(--accent-primary)] transition-colors cursor-pointer"
                        title={t('Web Terminal', 'Web Terminal')}
                      >
                        <TerminalSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/monitoring?server_id=${server.id}`); }}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-purple-500/20 text-purple-400 transition-colors cursor-pointer"
                        title={t('View Telemetry Metrics', 'Xem số liệu đo lường')}
                      >
                        <Activity className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          if (isViewer || isCheckingUpdate || updateInProgress) return;
                          handleCheckUpdateForServer(server);
                        }}
                        disabled={isViewer || updateInProgress || isCheckingUpdate}
                        className={`rounded-md border p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
                          updateAvailable || updateFailed
                            ? 'border-amber-500/40 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25'
                            : isCheckingUpdate || updateInProgress
                              ? 'border-blue-500/30 bg-blue-500/10 text-[var(--accent-primary)]'
                              : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-emerald-500 hover:bg-[var(--border-subtle)]'
                        }`}
                        title={updateTitle}
                      >
                        <UpdateIcon className={`h-3.5 w-3.5 ${updateInProgress || isCheckingUpdate ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setServerToRestart({ id: server.id, name: server.name }); }}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-rose-500/20 text-rose-500 transition-colors cursor-pointer"
                        title={t('Restart Server', 'Khởi động lại')}
                      >
                        <Play className="w-3.5 h-3.5 rotate-180" />
                      </button>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setServerToDelete({
                            id: server.id,
                            name: server.name,
                            status: server.status,
                            deletionStatus: server.deletion_status,
                            uninstallSupported: Boolean(osInfo?.remote_uninstall_supported),
                          });
                        }}
                        disabled={['pending', 'uninstalling'].includes(server.deletion_status ?? '')}
                        className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-rose-500/20 text-rose-500 transition-colors disabled:opacity-50 cursor-pointer"
                        title={t('Delete Server', 'Xóa máy chủ')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Host VPS Self-Monitoring Modal */}
      {isSelfMonitorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="self-monitor-title" className="w-full max-w-xl rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[var(--accent-primary)]">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 id="self-monitor-title" className="text-sm font-bold text-[var(--foreground)]">
                    {t('Host VPS Self-Monitoring', 'Tự giám sát VPS máy chủ')}
                  </h2>
                  <p className="text-[11px] text-[var(--color-muted)]">
                    {t('Dedicated internal monitoring service for DatrixOps CE', 'Dịch vụ giám sát nội bộ chuyên dụng cho DatrixOps CE')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close self-monitor dialog"
                onClick={() => setIsSelfMonitorModalOpen(false)}
                className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Current Status */}
              <div className="flex items-center justify-between p-3 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                <div>
                  <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider font-semibold font-mono">
                    {t('Service Status', 'Trạng thái dịch vụ')}
                  </div>
                  <div className="text-xs font-semibold text-[var(--foreground)] mt-0.5 font-mono">
                    {selfHostServer?.name || 'Control Plane'}
                  </div>
                </div>
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  isSelfHostOnline
                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-500 border-rose-500/30'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isSelfHostOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                  {isSelfHostOnline ? t('ONLINE', 'TRỰC TUYẾN') : t('OFFLINE', 'NGOẠI TUYẾN')}
                </div>
              </div>

              {/* Description */}
              <div className="text-xs text-[var(--color-muted)] leading-relaxed space-y-2">
                <p>
                  {t(
                    'DatrixOps Community Edition includes a dedicated internal background service (datrixops-self-monitor) to monitor this host VPS directly.',
                    'DatrixOps Community Edition tích hợp dịch vụ chạy nền nội bộ (datrixops-self-monitor) chuyên biệt để tự giám sát trực tiếp VPS này.'
                  )}
                </p>
                <p>
                  {t(
                    'This service is completely independent from the standard Agent (datrixops-agent). You can safely monitor this machine locally in CE while concurrently installing the DatrixOps Agent to report to DatrixOps Cloud without any conflict.',
                    'Dịch vụ này hoàn toàn độc lập với Agent tiêu chuẩn (datrixops-agent). Bạn có thể yên tâm tự giám sát máy chủ cục bộ trên CE mà vẫn cài đặt thêm Agent báo cáo về DatrixOps Cloud mà không gặp xung đột.'
                  )}
                </p>
              </div>

              {/* Command Box */}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                  {t('Activation / Repair Command (run on host VPS via SSH):', 'Lệnh kích hoạt / sửa chữa (chạy trên VPS qua SSH):')}
                </label>
                <div className="relative overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]">
                  <div className="overflow-x-auto py-2.5 pl-3.5 pr-24 font-mono text-xs text-emerald-400">
                    <code>sudo datrix repair-self-monitor</code>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText('sudo datrix repair-self-monitor');
                        setSelfMonitorCopied(true);
                        toast.success(t('Command copied to clipboard', 'Đã sao chép lệnh vào clipboard'));
                        setTimeout(() => setSelfMonitorCopied(false), 2500);
                      } catch {
                        toast.error(t('Unable to copy command', 'Không thể sao chép lệnh'));
                      }
                    }}
                    className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                      selfMonitorCopied
                        ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--border-subtle)]'
                    }`}
                  >
                    {selfMonitorCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {selfMonitorCopied ? t('Copied', 'Đã chép') : t('Copy', 'Sao chép')}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--color-muted)]">
                  {t('This command configures and starts datrixops-self-monitor.service.', 'Lệnh này thiết lập và khởi động datrixops-self-monitor.service.')}
                </p>
              </div>

              <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsSelfMonitorModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Close', 'Đóng')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {isAddServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="add-server-title" className="w-full max-w-2xl rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--border-subtle)] pb-3">
              <h2 id="add-server-title" className="text-sm font-bold text-[var(--foreground)]">
                {t('Add New Server', 'Thêm máy chủ mới')}
              </h2>
              <button
                type="button"
                aria-label="Close add server dialog"
                onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); }}
                className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs space-y-4">
              {!generatedAgentToken ? (
                <>
                  <p className="text-[var(--color-muted)] leading-relaxed">
                    {t(
                      'Each server receives a unique Agent Token. Enter a recognizable name for this server:',
                      'Mỗi máy chủ nhận một Agent Token duy nhất. Nhập tên nhận diện cho máy chủ này:'
                    )}
                  </p>
                  <div>
                    <label htmlFor="new-server-name" className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-1.5">
                      {t('Server Name', 'Tên máy chủ')}
                    </label>
                    <input
                      id="new-server-name"
                      name="new-server-name"
                      type="text"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                      placeholder="production-db-01"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => setIsAddServerModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                    >
                      {t('Cancel', 'Hủy')}
                    </button>
                    <button
                      onClick={async () => {
                        if (!newServerName.trim()) return;
                        try {
                          const [res, sysInfo] = await Promise.all([
                            apiClient('/servers', { method: 'POST', data: { name: newServerName.trim() } }),
                            apiClient('/system/info?_t=' + Date.now()).catch(() => null)
                          ]);
                          if (sysInfo) setSystemData(sysInfo);
                          setGeneratedAgentToken(res.enrollment_token || res.agent_token);
                          toast.success(t('Installation command created successfully!', 'Đã tạo lệnh cài đặt thành công!'));
                        } catch (err: unknown) {
                          toast.error(errorMessage(err, t('Unable to create installation token', 'Không thể tạo token cài đặt')));
                        }
                      }}
                      disabled={!newServerName.trim()}
                      className="px-3.5 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-md transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {t('Generate Install Command', 'Tạo lệnh cài đặt')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-muted)] leading-relaxed">
                    {t(
                      'Server created successfully. Select an operating system and run the command with Administrator or root privileges.',
                      'Máy chủ đã được tạo. Chọn hệ điều hành và chạy lệnh với quyền root / Administrator.'
                    )}
                  </p>

                  <div className="flex gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                    {(['linux', 'macos', 'windows'] as const).map((os) => (
                      <button
                        key={os}
                        onClick={() => setSelectedOs(os)}
                        className={`px-3 py-1 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
                          selectedOs === os
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                        }`}
                      >
                        {os === 'macos' ? 'macOS' : os.toUpperCase()}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label htmlFor="custom-services" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                      {t('Services to monitor', 'Dịch vụ cần giám sát')} <span className="normal-case font-normal font-mono">({t('optional', 'tùy chọn')})</span>
                    </label>
                    <input
                      id="custom-services"
                      value={customServices}
                      onChange={event => setCustomServices(event.target.value.replace(/[^A-Za-z0-9._@,$ \-]/g, ''))}
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)] transition-colors font-mono"
                      placeholder={selectedOs === 'linux' ? 'nginx,postgresql,docker,ssh' : selectedOs === 'macos' ? 'com.openssh.sshd,homebrew.mxcl.nginx' : 'EventLog,Schedule,WinRM,sshd'}
                    />
                  </div>

                  <div className="relative overflow-hidden rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)]">
                    <div className="overflow-x-auto py-3 pl-3.5 pr-24">
                      <code className="block whitespace-nowrap font-mono text-xs font-medium leading-5 text-emerald-400">
                        {getInstallCommand()}
                      </code>
                    </div>

                    <button
                      type="button"
                      onClick={() => void copyInstallCommand()}
                      className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                        installCommandCopied
                          ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                          : 'border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--border-subtle)]'
                      }`}
                    >
                      {installCommandCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {installCommandCopied ? t('Copied', 'Đã chép') : t('Copy', 'Sao chép')}
                    </button>
                  </div>

                  <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); fetchServers(); }}
                      className="px-3.5 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                    >
                      {t('Done', 'Hoàn tất')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Restart Confirm Dialog */}
      {serverToRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="alertdialog" aria-modal="true" aria-labelledby="restart-server-title" className="w-full max-w-md rounded-md border border-rose-500/30 bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <h2 id="restart-server-title" className="text-sm font-bold text-[var(--foreground)]">
                {t('Restart Server?', 'Khởi động lại máy chủ?')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-[var(--color-muted)] leading-relaxed">
                {t('You are about to restart the server', 'Bạn sắp khởi động lại máy chủ')}{' '}
                <strong className="text-[var(--foreground)] font-mono">{serverToRestart.name}</strong>.
              </p>
              <div>
                <label htmlFor="restart-server-confirmation" className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1 uppercase tracking-wider">
                  {t('Type', 'Nhập')} &quot;{serverToRestart.name}&quot; {t('to confirm', 'để xác nhận')}
                </label>
                <input
                  id="restart-server-confirmation"
                  type="text"
                  value={confirmRestartText}
                  onChange={(e) => setConfirmRestartText(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] focus:outline-none focus:border-rose-500 font-mono transition-colors"
                  placeholder={serverToRestart.name}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => { setServerToRestart(null); setConfirmRestartText(''); }}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  disabled={confirmRestartText !== serverToRestart.name}
                  onClick={async () => {
                    if (!serverToRestart) return;
                    try {
                      await apiClient(`/servers/${serverToRestart.id}/tasks`, {
                        method: 'POST',
                        data: { type: 'vps_reboot', payload: '{}' }
                      });
                      toast.success(t(`Restart command sent to ${serverToRestart.name}`, `Đã gửi lệnh khởi động lại đến ${serverToRestart.name}`));
                      setServerToRestart(null);
                      setConfirmRestartText('');
                    } catch (err: unknown) {
                      toast.error(errorMessage(err, t('Unable to send restart command', 'Không thể gửi lệnh khởi động lại')));
                    }
                  }}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                >
                  {t('Restart Server', 'Khởi động lại')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {serverToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-server-title" className="w-full max-w-lg rounded-md border border-rose-500/40 bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <Trash2 className="w-4 h-4 text-rose-500" />
              </div>
              <h2 id="delete-server-title" className="text-sm font-bold text-[var(--foreground)]">
                {serverToDelete.uninstallSupported
                  ? t('Uninstall Agent and Delete Server?', 'Gỡ cài đặt Agent và xóa máy chủ?')
                  : t('Delete Server Record?', 'Xóa bản ghi máy chủ?')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <p className="text-[var(--color-muted)] leading-relaxed">
                {serverToDelete.uninstallSupported ? (
                  <>
                    {t(
                      'DatrixOps will ask the online Agent on',
                      'DatrixOps sẽ yêu cầu Agent trực tuyến trên'
                    )}{' '}
                    <strong className="text-[var(--foreground)] font-mono">{serverToDelete.name}</strong>{' '}
                    {t('to uninstall and delete its service.', 'tự gỡ cài đặt và xóa dịch vụ của mình.')}
                  </>
                ) : (
                  <>
                    {t('Remove', 'Gỡ bỏ')}{' '}
                    <strong className="text-[var(--foreground)] font-mono">{serverToDelete.name}</strong>{' '}
                    {t(
                      'from your DatrixOps dashboard. Remote agent self-uninstallation is supported on Linux. On macOS/Windows, you can stop or remove the local agent service manually if needed.',
                      'khỏi bảng điều khiển DatrixOps. Tự động gỡ cài đặt từ xa được hỗ trợ trên Linux. Trên macOS/Windows, bạn có thể dừng hoặc gỡ dịch vụ cục bộ thủ công.'
                    )}
                  </>
                )}
              </p>
              <div>
                <label htmlFor="delete-server-confirmation" className="block text-[11px] font-semibold text-[var(--color-muted)] mb-1 uppercase tracking-wider">
                  {t('Type', 'Nhập')} &quot;{serverToDelete.name}&quot; {t('to confirm', 'để xác nhận')}
                </label>
                <input
                  id="delete-server-confirmation"
                  type="text"
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] focus:outline-none focus:border-rose-500 font-mono transition-colors"
                  placeholder={serverToDelete.name}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={closeDeleteDialog}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  disabled={confirmDeleteText !== serverToDelete.name || isDeletingServer}
                  onClick={() => requestServerDeletion(true)}
                  className={`px-3.5 py-1.5 rounded-md font-semibold text-xs transition-colors cursor-pointer ${
                    !serverToDelete.uninstallSupported
                      ? 'bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white'
                      : 'border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50'
                  }`}
                >
                  {serverToDelete.uninstallSupported ? t('Delete Record Only', 'Chỉ xóa bản ghi') : t('Confirm Delete', 'Xác nhận xóa')}
                </button>
                {serverToDelete.uninstallSupported && (
                  <button
                    disabled={confirmDeleteText !== serverToDelete.name || isDeletingServer || serverToDelete.status !== 'online'}
                    onClick={() => requestServerDeletion(false)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-md transition-colors cursor-pointer"
                  >
                    {t('Uninstall Agent & Delete', 'Gỡ cài đặt Agent & Xóa')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meta Dialog */}
      {editMetaServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-server-title" className="w-full max-w-xl rounded-md border border-amber-500/30 bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <FileText className="w-4 h-4 text-amber-500" />
              </div>
              <h2 id="edit-server-title" className="text-sm font-bold text-[var(--foreground)]">
                {t('Edit Server Info', 'Chỉnh sửa thông tin máy chủ')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
                  {t('Server Name', 'Tên máy chủ')}
                </label>
                <input
                  type="text"
                  value={editServerName}
                  onChange={(e) => setEditServerName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] outline-none focus:border-amber-500 transition-colors"
                  placeholder="e.g. Server, Web-01, Database"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
                  {t('Group Name', 'Tên nhóm')}
                </label>
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] outline-none focus:border-amber-500 transition-colors"
                  placeholder="e.g. Production"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-muted)] uppercase mb-1">
                  {t('Tags (comma separated)', 'Thẻ (ngăn cách bởi dấu phẩy)')}
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs text-[var(--foreground)] outline-none focus:border-amber-500 font-mono transition-colors"
                  placeholder="e.g. web, database, vietnam"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  onClick={() => setEditMetaServer(null)}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  onClick={async () => {
                    const tagsArray = editTags.split(',').map(tItem => tItem.trim()).filter(Boolean);
                    try {
                      await apiClient(`/servers/${editMetaServer.id}/meta`, {
                        method: 'PUT',
                        data: {
                          name: editServerName.trim(),
                          group_name: editGroupName.trim(),
                          tags: tagsArray,
                          provider: editProvider.trim(),
                          region: editRegion.trim(),
                          environment: editEnvironment.trim()
                        }
                      });
                      fetchServers();
                      toast.success(t('Server information updated!', 'Đã cập nhật thông tin máy chủ!'));
                      setEditMetaServer(null);
                    } catch (err: unknown) {
                      toast.error(errorMessage(err, t('Unable to update server information', 'Không thể cập nhật thông tin máy chủ')));
                    }
                  }}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
                >
                  {t('Save Changes', 'Lưu thay đổi')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Agent Modal */}
      {serverToUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="alertdialog" aria-modal="true" className={`w-full max-w-md rounded-md border bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5 ${serverToUpdate.hasUpdate ? 'border-cyan-500/35' : 'border-emerald-500/35'}`}>
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              {serverToUpdate.hasUpdate ? (
                <RefreshCw className="w-4 h-4 text-cyan-400" />
              ) : (
                <CircleCheck className="w-4 h-4 text-emerald-400" />
              )}
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {serverToUpdate.hasUpdate ? t('Update Available', 'Có bản cập nhật mới') : t('Agent Up to Date', 'Agent đã là bản mới nhất')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              {serverToUpdate.hasUpdate ? (
                <p className="text-[var(--color-muted)] leading-relaxed">
                  {t(
                    'A newer Agent release is available for',
                    'Đã có phiên bản Agent mới hơn cho'
                  )}{' '}
                  <strong className="text-[var(--foreground)] font-mono">{serverToUpdate.name}</strong>.{' '}
                  {t('Would you like to update now?', 'Bạn có muốn cập nhật ngay bây giờ không?')}
                </p>
              ) : (
                <p className="text-[var(--color-muted)] leading-relaxed">
                  {t(
                    'The Agent on',
                    'Agent trên máy chủ'
                  )}{' '}
                  <strong className="text-[var(--foreground)] font-mono">{serverToUpdate.name}</strong>{' '}
                  {t('is already running the latest release. No update is required.', 'đang chạy phiên bản mới nhất. Không cần cập nhật.')}
                </p>
              )}

              <div className="p-3 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">{t('Current Version:', 'Phiên bản hiện tại:')}</span>
                  <span className="font-semibold text-[var(--foreground)] font-mono tabular-nums">{serverToUpdate.currentVersion}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--color-muted)]">{t('Latest Release:', 'Bản mới nhất:')}</span>
                  <span className="font-semibold text-emerald-400 font-mono tabular-nums">{serverToUpdate.targetVersion}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[var(--border-subtle)]">
                  <span className="text-[var(--color-muted)]">{t('Status:', 'Trạng thái:')}</span>
                  {serverToUpdate.hasUpdate ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-500 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> {t('Upgrade Available', 'Có bản nâng cấp')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-500 font-mono">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {t('Fully Up to Date', 'Đã cập nhật mới nhất')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                {serverToUpdate.hasUpdate ? (
                  <>
                    <button
                      onClick={() => setServerToUpdate(null)}
                      className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                    >
                      {t('Cancel', 'Hủy')}
                    </button>
                    <button
                      disabled={isUpdatingAgent}
                      onClick={async () => {
                        setIsUpdatingAgent(true);
                        try {
                          const target = serverToUpdate.targetVersion.replace(/^v/i, '');
                          const task: AgentUpdateTask = await apiClient(`/servers/${serverToUpdate.id}/tasks`, {
                            method: 'POST',
                            data: {
                              type: 'agent_update',
                              payload: JSON.stringify({ target_version: target }),
                              timeout_seconds: 300
                            }
                          });
                          setAgentUpdateTasks(current => ({ ...current, [serverToUpdate.id]: task }));
                          toast.success(t(`Update task dispatched for ${serverToUpdate.name} to v${target}`, `Đã phát lệnh cập nhật cho ${serverToUpdate.name} lên v${target}`));
                          setServerToUpdate(null);
                          fetchServers(true);
                        } catch (err: unknown) {
                          toast.error(errorMessage(err, t('Error updating agent', 'Lỗi khi cập nhật agent')));
                        } finally {
                          setIsUpdatingAgent(false);
                        }
                      }}
                      className="px-3.5 py-1.5 bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-70 rounded-md font-bold transition-colors text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingAgent ? 'animate-spin' : ''}`} />
                      {isUpdatingAgent ? t('Queueing…', 'Đang xếp hàng…') : `${t('Start Update', 'Bắt đầu cập nhật')} (${serverToUpdate.targetVersion})`}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setServerToUpdate(null)}
                    className="px-3.5 py-1.5 bg-emerald-600 text-white hover:bg-emerald-500 rounded-md font-bold transition-colors text-xs cursor-pointer"
                  >
                    {t('Close', 'Đóng')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update All Modal */}
      {isUpdateAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-lg rounded-md border border-emerald-500/30 bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5 pb-2.5 border-b border-[var(--border-subtle)]">
              <UploadCloud className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-bold text-[var(--foreground)]">
                {t('Update all agents?', 'Cập nhật tất cả Agent?')}
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <p className="leading-relaxed text-[var(--color-muted)]">
                {t(
                  `This queues the current agent release for all ${servers.length} servers in your workspace.`,
                  `Thao tác này sẽ đưa bản phát hành mới nhất vào hàng đợi cập nhật cho tất cả ${servers.length} máy chủ trong hệ thống.`
                )}
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  disabled={isUpdatingAll}
                  onClick={() => setIsUpdateAllOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  type="button"
                  disabled={isUpdatingAll}
                  onClick={async () => {
                    setIsUpdatingAll(true);
                    try {
                      const result = await apiClient('/servers/actions/update-agents', { method: 'POST', data: {} });
                      toast.success(t(
                        `${result.queued} agent update${result.queued === 1 ? '' : 's'} queued; ${result.skipped} skipped.`,
                        `Đã xếp hàng cập nhật cho ${result.queued} agent; bỏ qua ${result.skipped}.`
                      ));
                      setIsUpdateAllOpen(false);
                    } catch (err: unknown) {
                      toast.error(errorMessage(err, t('Unable to queue all agent updates', 'Không thể xếp hàng cập nhật agent')));
                    } finally {
                      setIsUpdatingAll(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {isUpdatingAll ? t('Queueing updates…', 'Đang xếp hàng cập nhật…') : t('Update all agents', 'Cập nhật tất cả Agent')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResourceValue({
  label,
  value,
  numericValue,
}: {
  label: 'CPU' | 'RAM' | 'DISK';
  value: string;
  numericValue?: number;
}) {
  const tone = numericValue == null
    ? 'var(--text-tertiary)'
    : numericValue >= 85
      ? 'var(--status-critical)'
      : numericValue >= 70
        ? 'var(--status-warning)'
        : 'var(--text-primary)';

  return (
    <span className="resource-value">
      <b>{label}</b>
      <span className="resource-meter" aria-hidden="true">
        <i
          style={{
            width: `${Math.max(0, Math.min(100, numericValue ?? 0))}%`,
            backgroundColor: tone,
          }}
        />
      </span>
      <code style={{ color: tone }}>{value}</code>
    </span>
  );
}
