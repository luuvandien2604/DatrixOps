'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Filter,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Server as ServerIcon,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/apiClient';

interface ServerOption {
  id: string;
  name: string;
  status: string;
  ip_address?: string;
}

interface NetworkTargetResult {
  id: string;
  target_id: string;
  latency_ms?: number;
  min_latency_ms?: number;
  max_latency_ms?: number;
  packet_loss?: number;
  total_probes: number;
  successful_probes: number;
  failed_probes: number;
  status: string;
  measured_at: string;
}

interface NetworkTargetWithLatest {
  id: string;
  agent_id: string;
  server_name?: string;
  name: string;
  host: string;
  port: number;
  tag: string;
  probe_method: string;
  probes_per_run: number;
  alert_latency_warning_ms?: number;
  alert_latency_critical_ms?: number;
  alert_loss_critical_pct?: number;
  enabled: boolean;
  is_gateway: boolean;
  created_at: string;
  updated_at: string;
  latest_result?: NetworkTargetResult;
}

interface TagQualityOverview {
  tag: string;
  total_targets: number;
  total_agents: number;
  critical_agents: number;
  warning_agents: number;
  optimal_agents: number;
  avg_latency_ms: number;
  max_loss_pct: number;
  status: 'optimal' | 'warning' | 'critical';
  is_wide_area_issue: boolean;
  agent_ids: string[];
}

interface NetworkTargetPreset {
  name: string;
  host: string;
  port: number;
  tag: string;
  probe_method: string;
  probes_per_run: number;
  alert_latency_warning_ms?: number;
  alert_latency_critical_ms?: number;
  alert_loss_critical_pct?: number;
  is_gateway?: boolean;
  description: string;
}

function NetworkQualityPageInner() {
  const searchParams = useSearchParams();
  const initialAgentFilter = searchParams.get('agent_id') || '';

  // State
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [targets, setTargets] = useState<NetworkTargetWithLatest[]>([]);
  const [overviews, setOverviews] = useState<TagQualityOverview[]>([]);
  const [presets, setPresets] = useState<NetworkTargetPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [selectedAgentId, setSelectedAgentId] = useState<string>(initialAgentFilter);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Target Add/Edit Modal
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState<NetworkTargetWithLatest | null>(null);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    host: '',
    port: 0,
    tag: 'Domestic',
    probe_method: 'ICMP',
    probes_per_run: 5,
    alert_latency_warning_ms: '',
    alert_latency_critical_ms: '',
    alert_loss_critical_pct: '',
    enabled: true,
    is_gateway: false,
  });
  const [savingTarget, setSavingTarget] = useState(false);

  // Single Target Testing state
  const [testingTargetId, setTestingTargetId] = useState<string | null>(null);

  // Target History Chart Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<NetworkTargetWithLatest | null>(null);
  const [historyData, setHistoryData] = useState<NetworkTargetResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyRange, setHistoryRange] = useState<'6h' | '24h' | '7d'>('24h');

  // Delete modal
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<NetworkTargetWithLatest | null>(null);
  const [deletingTarget, setDeletingTarget] = useState(false);

  // Fetch initial data
  const loadData = useCallback(async (showToast = false) => {
    try {
      const [serversRes, targetsRes, overviewRes, presetsRes] = await Promise.all([
        apiClient('/servers') as Promise<ServerOption[]>,
        apiClient('/network-targets') as Promise<NetworkTargetWithLatest[]>,
        apiClient('/network-targets/overview') as Promise<TagQualityOverview[]>,
        apiClient('/network-targets/presets') as Promise<NetworkTargetPreset[]>,
      ]);

      setServers(serversRes || []);
      setTargets(targetsRes || []);
      setOverviews(overviewRes || []);
      setPresets(presetsRes || []);
      if (showToast) toast.success('Network quality data refreshed');
    } catch (err) {
      toast.error('Failed to load network targets: ' + (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialRequest);
  }, [loadData]);

  // Unique tags discovered from targets
  const discoveredTags = useMemo(() => {
    const set = new Set<string>();
    targets.forEach((t) => {
      if (t.tag) set.add(t.tag);
    });
    return Array.from(set);
  }, [targets]);

  // Filtered targets
  const filteredTargets = useMemo(() => {
    return targets.filter((t) => {
      if (selectedAgentId && t.agent_id !== selectedAgentId) {
        return false;
      }
      if (selectedTag !== 'all' && t.tag.toLowerCase() !== selectedTag.toLowerCase()) {
        return false;
      }
      const st = t.latest_result?.status || 'optimal';
      if (selectedStatus !== 'all' && st.toLowerCase() !== selectedStatus.toLowerCase()) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = t.name.toLowerCase().includes(q);
        const matchHost = t.host.toLowerCase().includes(q);
        const matchServer = (t.server_name || '').toLowerCase().includes(q);
        const matchTag = t.tag.toLowerCase().includes(q);
        if (!matchName && !matchHost && !matchServer && !matchTag) {
          return false;
        }
      }
      return true;
    });
  }, [targets, selectedAgentId, selectedTag, selectedStatus, searchQuery]);

  // Open Create Target Modal
  const openCreateModal = () => {
    setEditingTarget(null);
    setSelectedAgentIds(selectedAgentId ? [selectedAgentId] : servers.map((s) => s.id));
    setFormData({
      name: '',
      host: '',
      port: 0,
      tag: 'Domestic',
      probe_method: 'ICMP',
      probes_per_run: 5,
      alert_latency_warning_ms: '',
      alert_latency_critical_ms: '',
      alert_loss_critical_pct: '',
      enabled: true,
      is_gateway: false,
    });
    setTargetModalOpen(true);
  };

  // Open Edit Target Modal
  const openEditModal = (target: NetworkTargetWithLatest) => {
    setEditingTarget(target);
    setSelectedAgentIds([target.agent_id]);
    setFormData({
      name: target.name,
      host: target.host,
      port: target.port,
      tag: target.tag,
      probe_method: target.probe_method,
      probes_per_run: target.probes_per_run,
      alert_latency_warning_ms: target.alert_latency_warning_ms?.toString() || '',
      alert_latency_critical_ms: target.alert_latency_critical_ms?.toString() || '',
      alert_loss_critical_pct: target.alert_loss_critical_pct?.toString() || '',
      enabled: target.enabled,
      is_gateway: target.is_gateway,
    });
    setTargetModalOpen(true);
  };

  // Apply a preset to form
  const applyPreset = (p: NetworkTargetPreset) => {
    setFormData((prev) => ({
      ...prev,
      name: p.name,
      host: p.host,
      port: p.port,
      tag: p.tag,
      probe_method: p.probe_method,
      probes_per_run: p.probes_per_run,
      alert_latency_warning_ms: p.alert_latency_warning_ms ? p.alert_latency_warning_ms.toString() : '',
      alert_latency_critical_ms: p.alert_latency_critical_ms ? p.alert_latency_critical_ms.toString() : '',
      alert_loss_critical_pct: p.alert_loss_critical_pct ? p.alert_loss_critical_pct.toString() : '',
      is_gateway: !!p.is_gateway,
    }));
    toast.success(`Applied preset: ${p.name}`);
  };

  // Save Target (Create batch or Update single)
  const handleSaveTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Target name is required');
      return;
    }
    if (!formData.host.trim() && !formData.is_gateway) {
      toast.error('Host IP/Domain is required');
      return;
    }
    if (selectedAgentIds.length === 0) {
      toast.error('Select at least one server for this target');
      return;
    }

    setSavingTarget(true);
    try {
      const warnMs = formData.alert_latency_warning_ms ? parseFloat(formData.alert_latency_warning_ms) : undefined;
      const critMs = formData.alert_latency_critical_ms ? parseFloat(formData.alert_latency_critical_ms) : undefined;
      const lossPct = formData.alert_loss_critical_pct ? parseFloat(formData.alert_loss_critical_pct) : undefined;

      if (editingTarget) {
        // Update single
        await apiClient(`/network-targets/${editingTarget.id}`, {
          method: 'PUT',
          data: {
            name: formData.name.trim(),
            host: formData.host.trim() || 'gateway',
            port: Number(formData.port) || 0,
            tag: formData.tag.trim() || 'default',
            probe_method: formData.probe_method,
            probes_per_run: Number(formData.probes_per_run) || 5,
            alert_latency_warning_ms: warnMs,
            alert_latency_critical_ms: critMs,
            alert_loss_critical_pct: lossPct,
            enabled: formData.enabled,
            is_gateway: formData.is_gateway,
          },
        });
        toast.success(`Updated target "${formData.name}"`);
      } else {
        // Create batch across selected agents
        await apiClient('/network-targets', {
          method: 'POST',
          data: {
            agent_ids: selectedAgentIds,
            name: formData.name.trim(),
            host: formData.host.trim() || 'gateway',
            port: Number(formData.port) || 0,
            tag: formData.tag.trim() || 'default',
            probe_method: formData.probe_method,
            probes_per_run: Number(formData.probes_per_run) || 5,
            alert_latency_warning_ms: warnMs,
            alert_latency_critical_ms: critMs,
            alert_loss_critical_pct: lossPct,
            enabled: formData.enabled,
            is_gateway: formData.is_gateway,
          },
        });
        toast.success(`Created target "${formData.name}" on ${selectedAgentIds.length} server(s)`);
      }

      setTargetModalOpen(false);
      void loadData();
    } catch (err) {
      toast.error('Failed to save target: ' + (err as Error).message);
    } finally {
      setSavingTarget(false);
    }
  };

  // Delete Target
  const handleDeleteTarget = async () => {
    if (!deleteConfirmTarget) return;
    setDeletingTarget(true);
    try {
      await apiClient(`/network-targets/${deleteConfirmTarget.id}`, { method: 'DELETE' });
      toast.success(`Deleted target "${deleteConfirmTarget.name}"`);
      setDeleteConfirmTarget(null);
      void loadData();
    } catch (err) {
      toast.error('Failed to delete target: ' + (err as Error).message);
    } finally {
      setDeletingTarget(false);
    }
  };

  // Test target now
  const handleTestTargetNow = async (target: NetworkTargetWithLatest) => {
    setTestingTargetId(target.id);
    try {
      const res = (await apiClient(`/network-targets/${target.id}/test-now`, {
        method: 'POST',
      })) as { probe: { latency_ms: number; packet_loss?: number; status: string; total_probes: number; successful_probes: number } };

      const probe = res?.probe;
      const statusText = probe?.status || 'completed';
      const lossText = probe?.packet_loss != null ? `, Loss: ${probe.packet_loss}%` : '';
      const latText = probe?.latency_ms ? `, Latency: ${probe.latency_ms.toFixed(1)}ms` : '';

      toast.success(`Tested ${target.name} [${statusText.toUpperCase()}]${latText}${lossText}`);
      void loadData();
    } catch (err) {
      toast.error(`Test failed for ${target.name}: ` + (err as Error).message);
    } finally {
      setTestingTargetId(null);
    }
  };

  // View Target History Chart Modal
  const openHistoryModal = async (target: NetworkTargetWithLatest, range: '6h' | '24h' | '7d' = '24h') => {
    setHistoryTarget(target);
    setHistoryRange(range);
    setHistoryModalOpen(true);
    setLoadingHistory(true);

    try {
      const now = new Date();
      let fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      if (range === '6h') {
        fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      } else if (range === '7d') {
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const data = (await apiClient(
        `/network-targets/${target.id}/history?from=${encodeURIComponent(fromDate.toISOString())}&to=${encodeURIComponent(now.toISOString())}&limit=150`
      )) as NetworkTargetResult[];

      setHistoryData(data || []);
    } catch (err) {
      toast.error('Failed to load target history: ' + (err as Error).message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const renderStatusBadge = (status?: string) => {
    if (!status) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 border border-zinc-500/30 text-zinc-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> Pending
        </span>
      );
    }
    const s = status.toLowerCase();
    if (s === 'critical' || s === 'unreachable') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" /> Critical
        </span>
      );
    }
    if (s === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Warning
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Optimal
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
      {/* Top Banner & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
                Network Quality & Targets
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadData(true);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-[var(--foreground)] px-3.5 py-2 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white px-4 py-2 text-xs font-bold shadow-md shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Target
          </button>
        </div>
      </div>

      {/* If no targets configured at all */}
      {targets.length === 0 && !loading ? (
        <div className="rounded-2xl border border-[var(--border-color)] p-12 text-center bg-[var(--background-card)] shadow-xs space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">No Active Targets Configured</h3>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add First Target with Presets
          </button>
        </div>
      ) : (
        <>
          {/* Overview Cards by Tag (Fleet-Wide Incident Detection) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-blue-400" /> Fleet Network Overview by Tag
              </h2>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-32 rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {overviews.map((ov) => {
                  const isCrit = ov.status === 'critical';
                  const isWarn = ov.status === 'warning';
                  return (
                    <div
                      key={ov.tag}
                      className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all ${
                        ov.is_wide_area_issue
                          ? 'border-rose-500/60 bg-rose-500/10 shadow-lg shadow-rose-500/10 ring-1 ring-rose-500/50'
                          : isCrit
                          ? 'border-rose-500/40 bg-[var(--background-card)]'
                          : isWarn
                          ? 'border-amber-500/40 bg-[var(--background-card)]'
                          : 'border-[var(--border-color)] bg-[var(--background-card)]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-bold text-sm text-[var(--foreground)] truncate" title={ov.tag}>
                            {ov.tag}
                          </span>
                          {renderStatusBadge(ov.status)}
                        </div>

                        {ov.is_wide_area_issue && (
                          <div className="mb-3 rounded-lg bg-rose-500/20 border border-rose-500/30 px-2.5 py-1.5 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5 animate-pulse" />
                            <span className="text-[11px] font-semibold text-rose-300 leading-tight">
                              Wide-Area Alert: Multiple servers reporting critical
                            </span>
                          </div>
                        )}

                        <div className="flex items-baseline gap-2 mb-3">
                          <span className="text-2xl font-bold font-mono text-[var(--foreground)]">
                            {ov.avg_latency_ms.toFixed(1)}
                          </span>
                          <span className="text-xs text-[var(--color-muted)] font-medium">ms avg latency</span>
                        </div>

                        <div className="text-xs space-y-1.5 text-[var(--color-muted)] pb-2 border-b border-[var(--border-color)]/60">
                          <div className="flex justify-between">
                            <span>Servers Monitored:</span>
                            <span className="font-semibold text-[var(--foreground)] font-mono">{ov.total_agents}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Total Targets:</span>
                            <span className="font-semibold text-[var(--foreground)] font-mono">{ov.total_targets}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Max Packet Loss:</span>
                            <span className={`font-mono font-semibold ${ov.max_loss_pct > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {ov.max_loss_pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-end text-[11px]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTag(ov.tag);
                          }}
                          className="text-blue-400 hover:underline font-semibold cursor-pointer"
                        >
                          Filter tag →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Filter and Search Bar */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-4 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-muted)] pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder="Search by target name, host, or server..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '40px' }}
                  className="w-full pr-3 py-2 text-xs rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Server filter */}
                <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] border border-[var(--border-color)] px-3 py-1.5 rounded-xl">
                  <ServerIcon className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="bg-transparent text-[var(--foreground)] font-medium focus:outline-none text-xs cursor-pointer"
                  >
                    <option value="">All Servers ({servers.length})</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.ip_address || 'No IP'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tag filter */}
                <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] border border-[var(--border-color)] px-3 py-1.5 rounded-xl">
                  <Filter className="w-3.5 h-3.5 text-[var(--color-muted)]" />
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="bg-transparent text-[var(--foreground)] font-medium focus:outline-none text-xs cursor-pointer"
                  >
                    <option value="all">All Tags</option>
                    {discoveredTags.map((t) => (
                      <option key={t} value={t}>
                        Tag: {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] border border-[var(--border-color)] px-3 py-1.5 rounded-xl">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="bg-transparent text-[var(--foreground)] font-medium focus:outline-none text-xs cursor-pointer"
                  >
                    <option value="all">All Statuses</option>
                    <option value="optimal">Optimal</option>
                    <option value="warning">Warning</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>

                {(selectedAgentId || selectedTag !== 'all' || selectedStatus !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgentId('');
                      setSelectedTag('all');
                      setSelectedStatus('all');
                      setSearchQuery('');
                    }}
                    className="text-[var(--color-muted)] hover:text-[var(--foreground)] font-medium text-xs px-2 py-1"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Target Management Table */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] overflow-hidden shadow-sm">
            <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" /> Monitored Network Targets ({filteredTargets.length})
                </h3>
              </div>
            </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--background)]/40 font-semibold text-[var(--color-muted)]">
                <th className="px-4 py-3">Target & Host</th>
                <th className="px-4 py-3">Assigned Server</th>
                <th className="px-4 py-3">Tag</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Latency</th>
                <th className="px-4 py-3">Packet Loss</th>
                <th className="px-4 py-3">Probes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-[var(--color-muted)]">
                    No network targets match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTargets.map((target) => {
                  const res = target.latest_result;
                  const lat = res?.latency_ms;
                  const isTesting = testingTargetId === target.id;

                  return (
                    <tr key={target.id} className="hover:bg-[var(--border-color)]/20 transition-colors">
                      {/* Name & Host */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)]">{target.name}</span>
                          {target.is_gateway && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                              Gateway
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-[var(--color-muted)] mt-0.5">
                          {target.host}{target.port ? `:${target.port}` : ''}
                        </div>
                      </td>

                      {/* Server */}
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/servers/${target.agent_id}`}
                          className="font-medium text-blue-400 hover:underline flex items-center gap-1.5"
                        >
                          <ServerIcon className="w-3 h-3 text-[var(--color-muted)] shrink-0" />
                          <span className="truncate max-w-[140px]">{target.server_name || target.agent_id}</span>
                        </Link>
                      </td>

                      {/* Tag */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)]">
                          {target.tag}
                        </span>
                      </td>

                      {/* Method */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center font-mono font-semibold px-2 py-0.5 rounded text-[11px] border ${
                          target.probe_method === 'TCP'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {target.probe_method}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {renderStatusBadge(res?.status)}
                      </td>

                      {/* Latency */}
                      <td className="px-4 py-3 font-mono">
                        {lat != null ? (
                          <span className="font-semibold text-[var(--foreground)]">
                            {lat.toFixed(1)} ms
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] italic">N/A</span>
                        )}
                      </td>

                      {/* Packet Loss */}
                      <td className="px-4 py-3 font-mono">
                        {res?.packet_loss != null ? (
                          <span className={res.packet_loss > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                            {res.packet_loss}%
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] italic">N/A</span>
                        )}
                      </td>

                      {/* Probes */}
                      <td className="px-4 py-3 font-mono text-[var(--color-muted)]">
                        {res ? `${res.successful_probes}/${res.total_probes}` : `${target.probes_per_run}p`}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleTestTargetNow(target)}
                            disabled={isTesting}
                            title="Test target now"
                            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-blue-400 transition cursor-pointer disabled:opacity-50"
                          >
                            <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openHistoryModal(target)}
                            title="View history chart"
                            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-[var(--foreground)] transition cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(target)}
                            title="Edit target"
                            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-[var(--foreground)] transition cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmTarget(target)}
                            title="Delete target"
                            className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-rose-500/20 text-rose-400 transition cursor-pointer"
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
    </>
  )}

      {/* Target Add/Edit Modal */}
      {targetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl p-6 text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Network className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold">
                  {editingTarget ? `Edit Target: ${editingTarget.name}` : 'Add Network Probe Target'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTargetModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--border-color)] text-[var(--color-muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preset quick buttons (only on create) */}
            {!editingTarget && presets.length > 0 && (
              <div className="mb-5 p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)] block mb-2">
                  Presets
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {presets.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] hover:border-blue-500 hover:text-blue-400 transition cursor-pointer shadow-xs"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveTarget} className="space-y-4 text-xs">
              {/* Target Name & Host */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    Target Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cloudflare DNS, Viettel Core"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    Host / IP Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required={!formData.is_gateway}
                    placeholder={formData.is_gateway ? 'gateway (auto-resolved)' : 'e.g. 1.1.1.1 or api.github.com'}
                    disabled={formData.is_gateway}
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:opacity-60"
                  />
                </div>
              </div>

              {/* Tag, Port, Method */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    Tag / Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. International, Domestic, Infrastructure"
                    value={formData.tag}
                    onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {['International', 'Domestic', 'Infrastructure', 'Custom'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setFormData({ ...formData, tag })}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-subtle)] border border-[var(--border-color)] hover:text-blue-400"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    Probe Method
                  </label>
                  <select
                    value={formData.probe_method}
                    onChange={(e) => setFormData({ ...formData, probe_method: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none cursor-pointer"
                  >
                    <option value="ICMP">ICMP Ping (Loss + Latency)</option>
                    <option value="TCP">TCP Connect (Reachability + RTT)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    Port
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Thresholds (Optional) */}
              <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] space-y-2">
                <span className="font-semibold text-[var(--foreground)] block">
                  Alert Thresholds
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[var(--color-muted)] mb-1">
                      Warning Latency (ms)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 50 ms"
                      value={formData.alert_latency_warning_ms}
                      onChange={(e) => setFormData({ ...formData, alert_latency_warning_ms: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-[var(--foreground)] focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--color-muted)] mb-1">
                      Critical Latency (ms)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 150 ms"
                      value={formData.alert_latency_critical_ms}
                      onChange={(e) => setFormData({ ...formData, alert_latency_critical_ms: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-[var(--foreground)] focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--color-muted)] mb-1">
                      Critical Packet Loss (%)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 20 %"
                      value={formData.alert_loss_critical_pct}
                      onChange={(e) => setFormData({ ...formData, alert_loss_critical_pct: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-[var(--foreground)] focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Checkboxes: Gateway & Enabled */}
              <div className="flex items-center gap-6 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_gateway}
                    onChange={(e) => {
                      const chk = e.target.checked;
                      setFormData({
                        ...formData,
                        is_gateway: chk,
                        host: chk ? 'gateway' : formData.host === 'gateway' ? '' : formData.host,
                        tag: chk ? 'Hạ tầng nội bộ' : formData.tag,
                      });
                    }}
                    className="rounded border-[var(--border-color)] text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-[var(--foreground)]">Is Default Gateway Target</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded border-[var(--border-color)] text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-[var(--foreground)]">Enabled</span>
                </label>
              </div>

              {/* Server Selection (Multi-agent Batch Add on create) */}
              {!editingTarget && (
                <div className="pt-2 border-t border-[var(--border-color)]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold text-[var(--foreground)] block">
                      Assign to Servers ({selectedAgentIds.length}/{servers.length} selected)
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAgentIds(servers.map((s) => s.id))}
                        className="text-[11px] text-blue-400 hover:underline"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentIds([])}
                        className="text-[11px] text-[var(--color-muted)] hover:underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 space-y-1">
                    {servers.map((s) => {
                      const checked = selectedAgentIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-[var(--border-color)]/50 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAgentIds([...selectedAgentIds, s.id]);
                              } else {
                                setSelectedAgentIds(selectedAgentIds.filter((id) => id !== s.id));
                              }
                            }}
                            className="rounded border-[var(--border-color)] text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium text-[var(--foreground)]">{s.name}</span>
                          <span className="text-[10px] font-mono text-[var(--color-muted)]">
                            ({s.ip_address || s.id})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setTargetModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] font-semibold text-xs hover:bg-[var(--border-color)] transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingTarget}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-500/20 transition cursor-pointer disabled:opacity-50"
                >
                  {savingTarget ? 'Saving...' : editingTarget ? 'Save Changes' : 'Create Target(s)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Target History Modal */}
      {historyModalOpen && historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-3xl rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl p-6 text-[var(--foreground)] space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  <h3 className="text-base font-bold">{historyTarget.name} — Latency History</h3>
                </div>
                <p className="text-xs text-[var(--color-muted)] font-mono mt-0.5">
                  Host: {historyTarget.host} · Server: {historyTarget.server_name || historyTarget.agent_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 rounded-lg hover:bg-[var(--border-color)] text-[var(--color-muted)] hover:text-[var(--foreground)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 bg-[var(--surface-subtle)] p-1 rounded-xl border border-[var(--border-color)]">
                {(['6h', '24h', '7d'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => openHistoryModal(historyTarget, r)}
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
                {historyData.length} data points
              </span>
            </div>

            {/* Chart Area */}
            <div className="h-64 w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-3">
              {loadingHistory ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                  Loading time-series data...
                </div>
              ) : historyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                  No historical measurements recorded in this range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
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
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload as NetworkTargetResult;
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
                      fill="url(#latencyGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-color)]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[var(--background-card)] shadow-2xl p-6 text-[var(--foreground)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Delete Network Target</h3>
                <p className="text-xs text-[var(--color-muted)]">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-[var(--foreground)]">
              Are you sure you want to delete target <strong>&ldquo;{deleteConfirmTarget.name}&rdquo;</strong> on server <strong>{deleteConfirmTarget.server_name || deleteConfirmTarget.agent_id}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] text-xs font-semibold hover:bg-[var(--border-color)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTarget}
                disabled={deletingTarget}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-500/20 disabled:opacity-50"
              >
                {deletingTarget ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NetworkQualityPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center min-h-[400px] text-sm text-[var(--color-muted)]">
          <LoaderCircle className="w-6 h-6 animate-spin text-blue-500 mr-2" /> Loading Network Quality...
        </div>
      }
    >
      <NetworkQualityPageInner />
    </Suspense>
  );
}
