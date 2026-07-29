'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import {
  Server, RefreshCw, TerminalSquare, FileText, Play, Trash2, XCircle, AlertTriangle,
  UploadCloud, LoaderCircle, CircleCheck, CircleX, Copy, Check, Search, Filter,
  LayoutGrid, LayoutList, ToggleLeft, ToggleRight, CheckSquare, Square, ShieldCheck, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Search & Filter & View state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'critical' | 'update_available'>('all');
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
  const [editMetaServer, setEditMetaServer] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editEnvironment, setEditEnvironment] = useState('');

  // Update Agent
  const [serverToUpdate, setServerToUpdate] = useState<{ id: string; name: string } | null>(null);
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [isUpdateAllOpen, setIsUpdateAllOpen] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [agentUpdateTasks, setAgentUpdateTasks] = useState<Record<string, { id: string; status: string; result?: string }>>({});
  const [updatingAutoUpdatePolicyId, setUpdatingAutoUpdatePolicyId] = useState<string | null>(null);

  const router = useRouter();

  const fetchServers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiClient('/servers');
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
    } catch (err: any) {
      if (err.message.includes('token') || err.message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchServers();
    const interval = setInterval(() => fetchServers(true), 20_000);
    return () => clearInterval(interval);
  }, [fetchServers]);

  useEffect(() => {
    const activeEntries = Object.entries(agentUpdateTasks).filter(([, task]) => ['pending', 'processing'].includes(task.status));
    if (!activeEntries.length) return;

    const interval = window.setInterval(async () => {
      const nextTasks = { ...agentUpdateTasks };
      await Promise.all(activeEntries.map(async ([serverId, task]) => {
        try {
          const updatedTask = await apiClient(`/servers/${serverId}/tasks/${task.id}`);
          nextTasks[serverId] = updatedTask;
          if (updatedTask.status === 'completed') {
            toast.success('Agent update completed and confirmed');
          } else if (['failed', 'expired', 'timed_out'].includes(updatedTask.status)) {
            toast.error(updatedTask.result || `Agent update ${updatedTask.status}`);
          }
        } catch (error: any) {
          toast.error(error.message || 'Unable to refresh agent update status');
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
    try {
      setUpdatingAutoUpdatePolicyId(serverId);
      const newStatus = !currentEnabled;
      await apiClient(`/servers/${serverId}/agent-update-policy`, {
        method: 'PUT',
        data: { enabled: newStatus }
      });
      setServers(prev => prev.map(s => s.id === serverId ? { ...s, auto_update_agent: newStatus } : s));
      toast.success(`Auto-update ${newStatus ? 'enabled' : 'disabled'} for server`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update auto-update policy');
    } finally {
      setUpdatingAutoUpdatePolicyId(null);
    }
  };

  // Bulk set auto update policy
  const handleBulkAutoUpdate = async (enable: boolean) => {
    if (!selectedServerIds.length) return;
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
      toast.success(`Auto-update ${enable ? 'enabled' : 'disabled'} for ${successCount} server(s)`);
      fetchServers(true);
    } catch (err: any) {
      toast.error(err.message || 'Bulk auto-update policy error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Bulk update agents
  const handleBulkUpdateAgents = async () => {
    if (!selectedServerIds.length) return;
    setIsBulkProcessing(true);
    let queuedCount = 0;
    try {
      await Promise.all(
        selectedServerIds.map(async (id) => {
          try {
            const task = await apiClient(`/servers/${id}/tasks`, {
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
      toast.success(`Queued agent update for ${queuedCount} server(s)`);
      fetchServers(true);
    } catch (err: any) {
      toast.error(err.message || 'Bulk agent update error');
    } finally {
      setIsBulkProcessing(false);
    }
  };

  // Filtered servers logic
  const filteredServers = servers.filter(server => {
    let osInfo = null;
    try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) { }
    const ip = server.ip_address || osInfo?.snapshot?.system_info?.public_ip || '';
    const nameMatch = server.name.toLowerCase().includes(searchQuery.toLowerCase());
    const ipMatch = ip.toLowerCase().includes(searchQuery.toLowerCase());
    const groupMatch = server.group_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const tagMatch = server.tags?.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (!(nameMatch || ipMatch || groupMatch || tagMatch)) return false;

    if (statusFilter === 'online') return server.status === 'online';
    if (statusFilter === 'offline') return server.status !== 'online';
    if (statusFilter === 'critical') return server.status === 'online' && osInfo?.cpu_usage > 90;
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
    } catch (err: any) {
      toast.error(err.message || 'Unable to delete server');
    } finally {
      setIsDeletingServer(false);
    }
  };

  useEffect(() => {
    setInstallCommandCopied(false);
  }, [selectedOs, customServices, generatedAgentToken]);

  const getInstallCommand = () => {
    const services = customServices.trim();
    const shellServicesArgument = services ? ` "${services}"` : '';
    const powershellServicesArgument = services ? ` -Services "${services}"` : '';
    switch (selectedOs) {
      case 'linux':
        return `curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- ${generatedAgentToken}${shellServicesArgument}`;
      case 'macos':
        return `curl -sL https://datrixops.vandien.space/install-mac.sh | sudo bash -s -- ${generatedAgentToken}${shellServicesArgument}`;
      case 'windows':
        return `Invoke-WebRequest -Uri "https://datrixops.vandien.space/install.ps1" -OutFile "install.ps1"; .\\install.ps1 -Token "${generatedAgentToken}"${powershellServicesArgument}`;
      default:
        return '';
    }
  };

  const copyInstallCommand = async () => {
    const command = getInstallCommand();
    try {
      await navigator.clipboard.writeText(command);
      setInstallCommandCopied(true);
      toast.success('Install command copied to clipboard');
      window.setTimeout(() => setInstallCommandCopied(false), 2500);
    } catch {
      setInstallCommandCopied(false);
      toast.error('Unable to copy install command');
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Server Management</h1>
          <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">
            {servers.length} agents · {onlineCount} online · {offlineCount} offline
          </p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Manage agent state, versions, connectivity and operational actions.</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Last refresh: {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString('en-US') : 'Waiting for data'} · Auto-refresh 20s
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsUpdateAllOpen(true)}
            disabled={servers.length === 0 || isUpdatingAll}
            className="ops-button secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            Update all agents
          </button>
          <button onClick={() => fetchServers()} className="ops-button secondary">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-[var(--color-muted)]'}`} />
            Refresh
          </button>
          <button
            onClick={() => setIsAddServerModalOpen(true)}
            className="ops-button primary">
            <Server className="w-4 h-4" />
            + Add Server
          </button>
        </div>
      </div>

      {/* Control Toolbar: Search, Status Filter, View Toggle */}
      <div className="ops-panel surface-regular no-hover-lift p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 flex-col sm:flex-row items-center gap-3 w-full">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted)] pointer-events-none z-10" />
            <input
              type="text"
              placeholder="Search by name, IP, group or tag..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '44px' }}
              className="w-full pr-8 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-[var(--foreground)] placeholder-[var(--color-muted)] outline-none focus:border-blue-500 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)] hover:text-white">
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Pills */}
          <div className="server-filter-tabs w-full overflow-x-auto sm:w-auto">
            {[
              { id: 'all', label: 'All' },
              { id: 'online', label: 'Online' },
              { id: 'offline', label: 'Offline' },
              { id: 'critical', label: 'Critical' },
              { id: 'update_available', label: 'Update Available' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`server-filter-tab ${statusFilter === tab.id ? 'is-active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="server-view-toggle self-end md:self-auto">
          <button
            onClick={() => setViewMode('table')}
            title="Table View"
            className={`server-view-button ${viewMode === 'table' ? 'is-active' : ''}`}
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            title="Grid Card View"
            className={`server-view-button ${viewMode === 'grid' ? 'is-active' : ''}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sticky Bulk Action Bar */}
      {selectedServerIds.length > 0 && (
        <div className="sticky top-4 z-40 ops-panel surface-elevated status-tone-info p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white font-bold text-xs">
              {selectedServerIds.length}
            </span>
            <span className="text-sm font-semibold text-[var(--foreground)]">Server(s) selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleBulkAutoUpdate(true)}
              disabled={isBulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/35 bg-emerald-500/12 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/18 disabled:border-[var(--border-default)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-tertiary)] dark:text-emerald-300 dark:hover:bg-emerald-500/25"
            >
              <ToggleRight className="w-3.5 h-3.5" />
              Enable Auto-Update
            </button>
            <button
              onClick={() => handleBulkAutoUpdate(false)}
              disabled={isBulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] disabled:border-[var(--border-default)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-tertiary)]"
            >
              <ToggleLeft className="w-3.5 h-3.5" />
              Disable Auto-Update
            </button>
            <button
              onClick={handleBulkUpdateAgents}
              disabled={isBulkProcessing}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/35 bg-amber-500/12 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/18 disabled:border-[var(--border-default)] disabled:bg-[var(--surface-3)] disabled:text-[var(--text-tertiary)] dark:text-amber-300 dark:hover:bg-amber-500/25"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              Trigger Agent Update
            </button>
            <button
              onClick={() => setSelectedServerIds([])}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'table' ? (
        /* Table View */
        <div className="ops-panel surface-subtle no-hover-lift data-table-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.02] border-b border-white/5">
                  <th className="py-4 px-4 w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="text-[var(--color-muted)] hover:text-white transition-colors flex items-center"
                      title={isAllSelected ? 'Deselect all' : 'Select all'}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-4 px-6">Host</th>
                  <th className="py-4 px-6">Connection</th>
                  <th className="py-4 px-6">Platform</th>
                  <th className="min-w-[220px] py-4 px-6">Resources</th>
                  <th className="py-4 px-6">Update policy</th>
                  <th className="py-4 px-6">Health</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredServers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-[var(--color-muted)]">
                      {servers.length === 0 ? (
                        'No servers found. Add your first server to start monitoring.'
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
                    let osInfo = null;
                    let serverSnapshot = null;
                    try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) { }
                    try {
                      if (server.snapshot) {
                        serverSnapshot = typeof server.snapshot === 'string' ? JSON.parse(server.snapshot) : server.snapshot;
                      }
                    } catch (e) { }

                    const updateAvailable = Boolean(server.update_available);
                    const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
                    const isOffline = server.status !== 'online';
                    const agentIPAddress = server.ip_address || serverSnapshot?.system_info?.public_ip || osInfo?.snapshot?.system_info?.public_ip || '';
                    const updateTask = agentUpdateTasks[server.id] || server.active_agent_update_task;
                    const updateInProgress = Boolean(updateTask && ['pending', 'processing'].includes(updateTask.status));
                    const updateStalled = Boolean(updateTask?.status === 'completed' && updateAvailable);
                    const updateConfirmed = Boolean(updateTask && !updateAvailable);
                    const updateFailed = Boolean(updateTask && (['failed', 'expired', 'timed_out'].includes(updateTask.status) || updateStalled));
                    const UpdateIcon = updateInProgress ? LoaderCircle : updateConfirmed ? CircleCheck : RefreshCw;
                    const updateBadgeLabel = updateInProgress
                      ? updateTask?.status === 'processing' ? 'Updating agent...' : 'Update queued...'
                      : updateFailed
                        ? updateStalled ? 'Update needs retry' : `Update ${updateTask?.status}`
                        : latestAgentVersion
                          ? `Update available: ${latestAgentVersion}`
                          : 'Update available';
                    const UpdateBadgeIcon = updateInProgress ? LoaderCircle : updateFailed ? CircleX : UploadCloud;
                    const liveInfo = isOffline ? null : osInfo;
                    const isCritical = liveInfo && liveInfo.cpu_usage > 90;
                    const isSelected = selectedServerIds.includes(server.id);
                    const runningAgentVersion = osInfo?.version || serverSnapshot?.inventory?.agent_version || 'Unknown';

                    // Compute pure numerical text for CPU, RAM, Disk
                    const cpuText = liveInfo ? `${liveInfo.cpu_usage.toFixed(1)}%` : '—';
                    const ramPct = liveInfo ? ((liveInfo.memory_used / liveInfo.memory_total) * 100).toFixed(1) : null;
                    const ramText = ramPct ? `${ramPct}%` : '—';

                    const diskPct = liveInfo && liveInfo.disk_total > 0 ? Number(liveInfo.disk_usage || 0).toFixed(1) : null;
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
                        className={`group cursor-pointer transition-colors focus-visible:outline-none ${isSelected ? 'is-row-selected' : ''}`}
                      >
                        <td className="py-4 px-4">
                          <button
                            onClick={e => toggleSelectServer(server.id, e)}
                            className="flex items-center text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-4 px-6">
                          <div className="host-identity">
                            <span className="font-medium text-[var(--foreground)] transition-colors group-hover:text-blue-400">
                              {server.name}
                            </span>
                            <span className="agent-version-inline" title="Running agent version">
                              v{runningAgentVersion}
                            </span>
                          </div>
                          {server.deletion_status && server.deletion_status !== 'active' && (
                            <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              server.deletion_status === 'failed'
                                ? 'border-rose-500/35 bg-rose-500/10 text-rose-500'
                                : 'border-amber-500/35 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                            }`}>
                              <LoaderCircle className={`h-3 w-3 ${server.deletion_status !== 'failed' ? 'animate-spin' : ''}`} />
                              {server.deletion_status === 'pending'
                                ? 'Waiting for Agent uninstall'
                                : server.deletion_status === 'uninstalling'
                                  ? 'Uninstalling Agent'
                                  : 'Agent uninstall failed'}
                            </div>
                          )}
                          {(updateAvailable || updateInProgress || updateFailed) && (
                            <div className={`mt-2 inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[10px] font-semibold ${
                              updateFailed
                                ? 'border-rose-500/35 bg-rose-500/10 text-rose-500'
                                : 'border-amber-500/35 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                            }`}>
                              <UpdateBadgeIcon className={`h-3 w-3 ${updateInProgress ? 'animate-spin' : ''}`} />
                              {updateBadgeLabel}
                            </div>
                          )}
                          {server.group_name && <div className="mt-1 text-xs font-semibold text-emerald-400">{server.group_name}</div>}
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {server.tags && server.tags.map((t: string) => (
                              <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] uppercase">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-sm text-[var(--foreground)]">
                          {agentIPAddress || '—'}
                        </td>
                        <td className="py-4 px-6 text-sm">
                          <div className="text-[var(--foreground)]">{osInfo ? osInfo.os_name : 'Unknown'}</div>
                          <div className="text-xs text-[var(--color-muted)] mt-1">{osInfo ? `${osInfo.cpu_cores} Cores` : '—'}</div>
                        </td>

                        <td className="py-4 px-6">
                          <div className="resource-values">
                            <ResourceValue label="CPU" value={cpuText} numericValue={liveInfo?.cpu_usage} />
                            <ResourceValue label="RAM" value={ramText} numericValue={ramPct == null ? undefined : Number(ramPct)} />
                            <ResourceValue label="DISK" value={diskText} numericValue={diskPct == null ? undefined : Number(diskPct)} />
                          </div>
                        </td>

                        {/* Auto-Update Toggle Button */}
                        <td className="py-4 px-6">
                          <button
                            type="button"
                            disabled={updatingAutoUpdatePolicyId === server.id}
                            onClick={e => toggleAutoUpdatePolicy(server.id, Boolean(server.auto_update_agent), e)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                              server.auto_update_agent
                                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                : 'border-gray-500/30 bg-gray-500/10 text-gray-400 hover:bg-gray-500/20'
                            }`}
                            title={server.auto_update_agent ? 'Click to disable auto-update' : 'Click to enable auto-update'}
                          >
                            {updatingAutoUpdatePolicyId === server.id ? (
                              <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                            ) : server.auto_update_agent ? (
                              <ToggleRight className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-gray-400" />
                            )}
                            {server.auto_update_agent ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="py-4 px-6">
                          <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            server.status === 'online'
                              ? isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-gray-500/10 text-[var(--color-muted)] border-gray-500/20'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${
                              server.status === 'online' ? (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-500'
                            }`}></div>
                            {server.status === 'online' ? (isCritical ? 'CRITICAL' : 'ONLINE') : 'OFFLINE'}
                          </div>
                        </td>

                        {/* Quick Actions */}
                        <td className="py-4 px-6 text-right">
                          <div className="server-quick-actions flex items-center justify-end gap-2">
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setEditMetaServer(server);
                                setEditGroupName(server.group_name || '');
                                setEditTags((server.tags || []).join(', '));
                                setEditProvider(server.provider || '');
                                setEditRegion(server.region || '');
                                setEditEnvironment(server.environment || '');
                              }}
                              className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors"
                              title="Edit Group & Tags"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                router.push(`/dashboard/servers/${server.id}?view=terminal`);
                              }}
                              className="p-1.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20 hover:text-blue-300"
                              title="Open Web Terminal"
                            >
                              <TerminalSquare className="w-4 h-4" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                router.push(`/dashboard/monitoring?server_id=${server.id}`);
                              }}
                              className="p-1.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 transition-colors hover:bg-purple-500/20 hover:text-purple-300"
                              title="View Telemetry Metrics"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setServerToUpdate({ id: server.id, name: server.name });
                              }}
                              disabled={updateInProgress}
                              className={`rounded border p-1.5 transition-colors disabled:cursor-wait ${
                                updateAvailable || updateInProgress || updateFailed
                                  ? 'border-amber-500/45 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300'
                                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              }`}
                              title={
                                updateInProgress
                                  ? 'Updating agent...'
                                  : updateAvailable
                                    ? `Update Agent to ${latestAgentVersion}`
                                    : 'Reinstall Agent release'
                              }
                            >
                              <UpdateIcon className={`h-4 w-4 ${updateInProgress ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                              onClick={event => {
                                event.stopPropagation();
                                setServerToRestart({ id: server.id, name: server.name });
                              }}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors"
                              title="Restart"
                            >
                              <Play className="w-4 h-4 rotate-180" />
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
                              disabled={['pending', 'uninstalling'].includes(server.deletion_status)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServers.length === 0 ? (
            <div className="col-span-full ops-panel surface-subtle no-hover-lift py-12 text-center text-[var(--color-muted)]">
              {servers.length === 0 ? (
                'No servers found. Add your first server to start monitoring.'
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <span>No servers match the active search or status filter.</span>
                  <button type="button" onClick={clearFilters} className="ops-button secondary">
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredServers.map((server) => {
              let osInfo = null;
              let serverSnapshot = null;
              try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) { }
              try {
                if (server.snapshot) {
                  serverSnapshot = typeof server.snapshot === 'string' ? JSON.parse(server.snapshot) : server.snapshot;
                }
              } catch (e) { }

              const updateAvailable = Boolean(server.update_available);
              const latestAgentVersion = typeof server.latest_agent_version === 'string' ? server.latest_agent_version : '';
              const isOffline = server.status !== 'online';
              const updateTask = agentUpdateTasks[server.id] || server.active_agent_update_task;
              const updateInProgress = Boolean(updateTask && ['pending', 'processing'].includes(updateTask.status));
              const updateStalled = Boolean(updateTask?.status === 'completed' && updateAvailable);
              const updateFailed = Boolean(updateTask && (['failed', 'expired', 'timed_out'].includes(updateTask.status) || updateStalled));
              const UpdateIcon = updateInProgress ? LoaderCircle : updateTask && !updateAvailable ? CircleCheck : RefreshCw;

              const liveInfo = isOffline ? null : osInfo;
              const isCritical = liveInfo && liveInfo.cpu_usage > 90;
              const isSelected = selectedServerIds.includes(server.id);
              const runningAgentVersion = osInfo?.version || serverSnapshot?.inventory?.agent_version || 'Unknown';

              return (
                <div
                  key={server.id}
                  onClick={() => router.push(`/dashboard/servers/${server.id}`)}
                  className={`ops-panel surface-regular p-5 cursor-pointer transition-all hover:border-blue-500/40 relative flex flex-col justify-between ${
                    isSelected ? 'border-blue-500 bg-blue-500/10' : ''
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={e => toggleSelectServer(server.id, e)}
                          className="text-[var(--color-muted)] hover:text-white transition-colors"
                        >
                          {isSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}
                        </button>
                        <div>
                          <div className="host-identity">
                            <h3 className="font-bold text-[var(--foreground)] text-base group-hover:text-blue-400 transition-colors">
                              {server.name}
                            </h3>
                            <span className="agent-version-inline" title="Running agent version">
                              v{runningAgentVersion}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-[var(--color-muted)]">{server.ip_address || '—'}</span>
                        </div>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                        server.status === 'online'
                          ? isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/20'
                      }`}>
                        {server.status === 'online' ? (isCritical ? 'CRITICAL' : 'ONLINE') : 'OFFLINE'}
                      </div>
                    </div>

                    {/* Group & Tags */}
                    {(server.group_name || (server.tags && server.tags.length > 0)) && (
                      <div className="flex items-center gap-1.5 flex-wrap mb-3">
                        {server.group_name && (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-semibold">
                            {server.group_name}
                          </span>
                        )}
                        {server.tags && server.tags.map((t: string) => (
                          <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] uppercase">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Stats Grid: Monospaced Numbers Only */}
                    <div className="grid grid-cols-3 gap-2 bg-white/[0.02] p-3 rounded-lg border border-white/5 my-3 text-center font-mono">
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-1">CPU</div>
                        <div className={`text-sm font-semibold ${liveInfo && liveInfo.cpu_usage > 90 ? 'text-rose-400 font-bold' : 'text-[var(--foreground)]'}`}>
                          {liveInfo ? `${liveInfo.cpu_usage.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-1">RAM</div>
                        <div className="text-sm font-semibold text-[var(--foreground)]">
                          {liveInfo ? `${((liveInfo.memory_used / liveInfo.memory_total) * 100).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--color-muted)] uppercase tracking-wider mb-1">DISK</div>
                        <div className="text-sm font-semibold text-[var(--foreground)]">
                          {liveInfo && liveInfo.disk_total > 0 ? `${Number(liveInfo.disk_usage || 0).toFixed(1)}%` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action Bar */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                    {/* Auto Update Policy Toggle */}
                    <button
                      type="button"
                      onClick={e => toggleAutoUpdatePolicy(server.id, Boolean(server.auto_update_agent), e)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border transition-all ${
                        server.auto_update_agent
                          ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                          : 'border-gray-500/30 bg-gray-500/10 text-gray-400'
                      }`}
                    >
                      {server.auto_update_agent ? <ToggleRight className="w-3.5 h-3.5 text-emerald-400" /> : <ToggleLeft className="w-3.5 h-3.5 text-gray-400" />}
                      Auto-Update
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setEditMetaServer(server);
                          setEditGroupName(server.group_name || '');
                          setEditTags((server.tags || []).join(', '));
                          setEditProvider(server.provider || '');
                          setEditRegion(server.region || '');
                          setEditEnvironment(server.environment || '');
                        }}
                        className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors"
                        title="Edit Group & Tags"
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/servers/${server.id}?view=terminal`); }}
                        className="p-1.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                        title="Web Terminal"
                      >
                        <TerminalSquare className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/monitoring?server_id=${server.id}`); }}
                        className="p-1.5 rounded border border-purple-500/20 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                        title="View Telemetry Metrics"
                      >
                        <Activity className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={event => {
                          event.stopPropagation();
                          setServerToUpdate({ id: server.id, name: server.name });
                        }}
                        disabled={updateInProgress}
                        className={`rounded border p-1.5 transition-colors disabled:cursor-wait ${
                          updateAvailable || updateInProgress || updateFailed
                            ? 'border-amber-500/45 bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 dark:text-amber-300'
                            : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                        title={
                          updateInProgress
                            ? 'Updating agent...'
                            : updateAvailable
                              ? `Update Agent to ${latestAgentVersion}`
                              : 'Reinstall Agent release'
                        }
                      >
                        <UpdateIcon className={`h-3.5 w-3.5 ${updateInProgress ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setServerToRestart({ id: server.id, name: server.name }); }}
                        className="p-1.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                        title="Restart Server"
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
                        disabled={['pending', 'uninstalling'].includes(server.deletion_status)}
                        className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors disabled:opacity-50"
                        title="Delete Server"
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

      {/* Add Server Modal */}
      {isAddServerModalOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="add-server-title" className="ops-modal flex w-full max-w-2xl flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5">
              <h2 id="add-server-title" className="text-xl font-bold text-[var(--foreground)]">Add New Server</h2>
              <button type="button" aria-label="Close add server dialog" onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); }} className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {!generatedAgentToken ? (
                <>
                  <p className="text-[var(--color-muted)] mb-6">
                    Each server receives a unique <strong>Agent Token</strong>. Enter a recognizable name for this server:
                  </p>
                  <div className="mb-6">
                    <label htmlFor="new-server-name" className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Server Name</label>
                    <input
                      id="new-server-name"
                      name="new-server-name"
                      type="text"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-[var(--foreground)] outline-none transition-all text-sm"
                      placeholder="production-db-01"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setIsAddServerModalOpen(false)} className="px-6 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!newServerName.trim()) return;
                        try {
                          const res = await apiClient('/servers', { method: 'POST', data: { name: newServerName.trim() } });
                          setGeneratedAgentToken(res.agent_token);
                          toast.success('Installation command created successfully!');
                        } catch (err: any) {
                          toast.error(err.message || 'Unable to create installation token');
                        }
                      }}
                      disabled={!newServerName.trim()}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 rounded-lg font-medium transition-colors">
                      Generate Install Command
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-muted)] mb-4">
                    Server created successfully. Select an operating system and run the command with Administrator or root privileges.
                  </p>

                  <div className="flex gap-2 mb-4 border-b border-white/10 pb-2">
                    <button
                      onClick={() => setSelectedOs('linux')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'linux' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      Linux
                    </button>
                    <button
                      onClick={() => setSelectedOs('macos')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'macos' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      macOS
                    </button>
                    <button
                      onClick={() => setSelectedOs('windows')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'windows' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      Windows
                    </button>
                  </div>

                  <div className="mb-4">
                    <label htmlFor="custom-services" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Services to monitor <span className="normal-case font-normal">(optional)</span></label>
                    <input
                      id="custom-services"
                      value={customServices}
                      onChange={event => setCustomServices(event.target.value.replace(/[^A-Za-z0-9._@,$ \-]/g, ''))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
                      placeholder={selectedOs === 'linux' ? 'nginx,postgresql,docker,ssh' : selectedOs === 'macos' ? 'com.openssh.sshd,homebrew.mxcl.nginx' : 'EventLog,Schedule,WinRM,sshd'}
                    />
                  </div>

                  <div className="relative mb-3 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-950 shadow-inner dark:border-white/10 dark:bg-black/50">
                    <div className="overflow-x-auto py-4 pl-4 pr-32">
                      <code className="block whitespace-nowrap font-mono text-sm font-medium leading-6 text-emerald-300">
                        {getInstallCommand()}
                      </code>
                    </div>

                    <button
                      type="button"
                      onClick={() => void copyInstallCommand()}
                      className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors ${
                        installCommandCopied
                          ? 'border-emerald-300/40 bg-emerald-400/20 text-emerald-100'
                          : 'border-white/15 bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {installCommandCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {installCommandCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); fetchServers(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                      Done
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
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="restart-server-title" className="ops-modal flex w-full max-w-md flex-col overflow-hidden border-rose-500/30">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <h2 id="restart-server-title" className="text-xl font-bold text-[var(--foreground)]">Restart Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                You are about to restart the server <strong className="text-[var(--foreground)]">{serverToRestart.name}</strong>.
              </p>
              <div className="mb-6">
                <label htmlFor="restart-server-confirmation" className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToRestart.name}" to confirm
                </label>
                <input
                  id="restart-server-confirmation"
                  type="text"
                  value={confirmRestartText}
                  onChange={(e) => setConfirmRestartText(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-rose-500"
                  placeholder={serverToRestart.name}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => { setServerToRestart(null); setConfirmRestartText(''); }} className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
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
                      toast.success(`Restart command sent to ${serverToRestart.name}`);
                      setServerToRestart(null);
                      setConfirmRestartText('');
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to send restart command');
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                  Restart Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {serverToDelete && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-server-title" className="ops-modal flex w-full max-w-lg flex-col overflow-hidden border-rose-500/30">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <Trash2 className="w-6 h-6 text-rose-500" />
              <h2 id="delete-server-title" className="text-xl font-bold text-[var(--foreground)]">Uninstall Agent and Delete Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                DatrixOps will ask the online Agent on <strong className="text-[var(--foreground)]">{serverToDelete.name}</strong> to uninstall and delete.
              </p>
              <div className="mb-6">
                <label htmlFor="delete-server-confirmation" className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToDelete.name}" to confirm
                </label>
                <input
                  id="delete-server-confirmation"
                  type="text"
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-rose-500"
                  placeholder={serverToDelete.name}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={closeDeleteDialog} className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button
                  disabled={confirmDeleteText !== serverToDelete.name || isDeletingServer}
                  onClick={() => requestServerDeletion(true)}
                  className="px-4 py-2 border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 disabled:opacity-50 rounded-lg font-medium transition-colors">
                  Delete Record Only
                </button>
                <button
                  disabled={confirmDeleteText !== serverToDelete.name || isDeletingServer || serverToDelete.status !== 'online'}
                  onClick={() => requestServerDeletion(false)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                  Uninstall Agent & Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meta Dialog */}
      {editMetaServer && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="edit-server-title" className="ops-modal flex w-full max-w-2xl flex-col overflow-hidden border-amber-500/30">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-amber-500/5">
              <FileText className="w-6 h-6 text-amber-500" />
              <h2 id="edit-server-title" className="text-xl font-bold text-[var(--foreground)]">Edit Server Info</h2>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Group Name</label>
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. Production"
                />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Tags (comma separated)</label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. web, database, vietnam"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setEditMetaServer(null)} className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm transition-colors text-[var(--color-muted)]">
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
                    try {
                      await apiClient(`/servers/${editMetaServer.id}/meta`, {
                        method: 'PUT',
                        data: { group_name: editGroupName.trim(), tags: tagsArray, provider: editProvider.trim(), region: editRegion.trim(), environment: editEnvironment.trim() }
                      });
                      fetchServers();
                      toast.success('Server information updated!');
                      setEditMetaServer(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to update server information');
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Agent Modal */}
      {serverToUpdate && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" className="ops-modal flex w-full max-w-md flex-col overflow-hidden border-amber-500/35">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-amber-500/10">
              <RefreshCw className="w-6 h-6 text-amber-400" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Update Agent?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-6">
                You are about to send an update command to <strong className="text-[var(--foreground)]">{serverToUpdate.name}</strong>.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setServerToUpdate(null)} className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button
                  disabled={isUpdatingAgent}
                  onClick={async () => {
                    setIsUpdatingAgent(true);
                    try {
                      const task = await apiClient(`/servers/${serverToUpdate.id}/tasks`, {
                        method: 'POST',
                        data: { type: 'agent_update', payload: '{}', timeout_seconds: 300 }
                      });
                      setAgentUpdateTasks(current => ({ ...current, [serverToUpdate.id]: task }));
                      toast.success(`Update queued for ${serverToUpdate.name}`);
                      setServerToUpdate(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Error updating agent');
                    } finally {
                      setIsUpdatingAgent(false);
                    }
                  }}
                  className="px-4 py-2 bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-70 rounded-lg font-bold transition-colors">
                  {isUpdatingAgent ? 'Queueing…' : 'Start Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update All Modal */}
      {isUpdateAllOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" className="ops-modal flex w-full max-w-lg flex-col overflow-hidden border-emerald-500/30">
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] bg-emerald-500/5 p-6">
              <UploadCloud className="h-6 w-6 text-emerald-500" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Update all agents?</h2>
            </div>
            <div className="p-6">
              <p className="leading-6 text-[var(--color-muted)]">
                This queues the current agent release for all {servers.length} servers in your workspace.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isUpdatingAll} onClick={() => setIsUpdateAllOpen(false)} className="rounded-lg px-4 py-2 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)]">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingAll}
                  onClick={async () => {
                    setIsUpdatingAll(true);
                    try {
                      const result = await apiClient('/servers/actions/update-agents', { method: 'POST', data: {} });
                      toast.success(`${result.queued} agent update${result.queued === 1 ? '' : 's'} queued; ${result.skipped} skipped.`);
                      setIsUpdateAllOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to queue all agent updates');
                    } finally {
                      setIsUpdatingAll(false);
                    }
                  }}
                  className="ops-button"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isUpdatingAll ? 'Queueing updates…' : 'Update all agents'}
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
