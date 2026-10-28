'use client';

import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Bell,
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
import CustomSelect from '@/components/CustomSelect';
import { useLanguage } from '@/components/LanguageContext';

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

interface NetworkAlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  target_name?: string | null;
  server_id?: string | null;
  enabled: boolean;
}

function NetworkQualityPageInner() {
  const { t, isVi } = useLanguage();
  const searchParams = useSearchParams();
  const initialAgentFilter = searchParams.get('agent_id') || '';

  // State
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [targets, setTargets] = useState<NetworkTargetWithLatest[]>([]);
  const [overviews, setOverviews] = useState<TagQualityOverview[]>([]);
  const [presets, setPresets] = useState<NetworkTargetPreset[]>([]);
  const [alertRules, setAlertRules] = useState<NetworkAlertRule[]>([]);
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
  const loadData = useCallback(async (showToast = false, agentFilterOverride?: string) => {
    try {
      const activeAgent = agentFilterOverride !== undefined ? agentFilterOverride : selectedAgentId;
      const overviewUrl = activeAgent
        ? `/network-targets/overview?agent_id=${encodeURIComponent(activeAgent)}`
        : '/network-targets/overview';

      const [serversRes, targetsRes, overviewRes, presetsRes, rulesRes] = await Promise.all([
        apiClient('/servers') as Promise<ServerOption[]>,
        apiClient('/network-targets') as Promise<NetworkTargetWithLatest[]>,
        apiClient(overviewUrl) as Promise<TagQualityOverview[]>,
        apiClient('/network-targets/presets') as Promise<NetworkTargetPreset[]>,
        (apiClient('/alerts/rules').catch(() => [])) as Promise<NetworkAlertRule[]>,
      ]);

      setServers(serversRes || []);
      setTargets(targetsRes || []);
      setOverviews(overviewRes || []);
      setPresets(presetsRes || []);
      setAlertRules(Array.isArray(rulesRes) ? rulesRes : []);
      if (showToast) toast.success('Network quality data refreshed');
    } catch (err) {
      toast.error('Failed to load network targets: ' + (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedAgentId]);

  // Initial fetch and 30-second live polling interval
  useEffect(() => {
    const initialRequest = window.setTimeout(() => void loadData(), 0);
    const interval = window.setInterval(() => {
      void loadData(false);
    }, 30000);
    return () => {
      window.clearTimeout(initialRequest);
      window.clearInterval(interval);
    };
  }, [loadData]);

  // Unique tags discovered from targets
  const discoveredTags = useMemo(() => {
    const set = new Set<string>();
    targets.forEach((t) => {
      if (t.tag) set.add(t.tag);
    });
    return Array.from(set);
  }, [targets]);

  const serverSelectOptions = useMemo(
    () => [
      { value: '', label: `${t('All Servers', 'Tất cả máy chủ')} (${servers.length})` },
      ...servers.map((s) => ({
        value: s.id,
        label: s.name,
        subLabel: s.ip_address || (isVi ? 'Không có IP' : 'No IP'),
      })),
    ],
    [servers, t, isVi]
  );

  const tagSelectOptions = useMemo(
    () => [
      { value: 'all', label: t('All Tags', 'Tất cả thẻ') },
      ...discoveredTags.map((tag) => ({
        value: tag,
        label: `${t('Tag', 'Thẻ')}: ${tag}`,
      })),
    ],
    [discoveredTags, t]
  );

  const statusSelectOptions = useMemo(
    () => [
      { value: 'all', label: t('All Statuses', 'Tất cả trạng thái') },
      { value: 'optimal', label: t('Optimal', 'Tối ưu') },
      { value: 'warning', label: t('Warning', 'Cảnh báo') },
      { value: 'critical', label: t('Critical', 'Sự cố') },
    ],
    [t]
  );

  // Currently selected server for title / header scoping
  const selectedServer = useMemo(() => servers.find((s) => s.id === selectedAgentId), [servers, selectedAgentId]);

  // Network alert rules for targets and tags
  const networkAlertRules = useMemo(() => {
    return alertRules.filter((r) => r.metric === 'network_latency' || r.metric === 'network_loss');
  }, [alertRules]);

  const getTargetAlerts = useCallback((target: NetworkTargetWithLatest) => {
    return networkAlertRules.filter((r) => {
      if (!r.enabled) return false;
      if (r.server_id && r.server_id !== target.agent_id) return false;
      if (!r.target_name || r.target_name.trim() === '') return true; // universal
      const filter = r.target_name.toLowerCase().trim();
      return (
        target.name.toLowerCase().includes(filter) ||
        target.tag.toLowerCase().includes(filter) ||
        target.host.toLowerCase().includes(filter)
      );
    });
  }, [networkAlertRules]);

  const getTagAlerts = useCallback((tag: string) => {
    return networkAlertRules.filter((r) => {
      if (!r.enabled) return false;
      if (!r.target_name || r.target_name.trim() === '') return true;
      const filter = r.target_name.toLowerCase().trim();
      return tag.toLowerCase().includes(filter) || filter.includes(tag.toLowerCase());
    });
  }, [networkAlertRules]);

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
        // If batch targets were created for multiple agents or for agents outside the active filter, switch to All Servers view
        if (selectedAgentIds.length > 1 || (selectedAgentId && !selectedAgentIds.includes(selectedAgentId))) {
          setSelectedAgentId('');
          setSelectedTag('all');
          setSelectedStatus('all');
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('agent_id');
            window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
          }
          toast.success(`Created target "${formData.name}" across ${selectedAgentIds.length} servers (switched to All Servers view)`);
        } else {
          toast.success(`Created target "${formData.name}" on ${selectedAgentIds.length} server(s)`);
        }
      }

      setTargetModalOpen(false);
      void loadData(false, '');
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
        <span className="inline-flex items-center gap-1 rounded bg-zinc-500/15 border border-zinc-500/30 text-zinc-400 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" /> {t('Pending', 'Chờ')}
        </span>
      );
    }
    const s = status.toLowerCase();
    if (s === 'critical' || s === 'unreachable') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 border border-rose-500/30 text-rose-500 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> {t('Critical', 'Sự cố')}
        </span>
      );
    }
    if (s === 'warning') {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> {t('Warning', 'Cảnh báo')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {t('Optimal', 'Tối ưu')}
      </span>
    );
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto pb-16">
      {/* Top Banner & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-[var(--border-color)] pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-blue-500/10 text-[var(--accent-primary)] border border-blue-500/20">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
                {t('Network Quality & Targets', 'Chất lượng mạng & Mục tiêu')}
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/alerts?tab=rules&category=network"
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--foreground)] px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer"
            title={t('View alert rules configured for network quality', 'Xem các quy tắc cảnh báo mạng')}
          >
            <Bell className="w-3.5 h-3.5 text-indigo-400" />
            {t('Alert Rules', 'Quy tắc cảnh báo')}
            {networkAlertRules.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                {networkAlertRules.length}
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void loadData(true);
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-[var(--foreground)] px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('Refresh', 'Làm mới')}
          </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> {t('Add Target', 'Thêm mục tiêu')}
          </button>
        </div>
      </div>

      {/* If no targets configured at all */}
      {targets.length === 0 && !loading ? (
        <div className="rounded-md border border-[var(--border-subtle)] p-10 text-center bg-[var(--surface-1)] space-y-3">
          <div className="w-10 h-10 rounded-md bg-blue-500/10 border border-blue-500/20 text-[var(--accent-primary)] flex items-center justify-center mx-auto">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)]">{t('No Active Targets Configured', 'Chưa có mục tiêu kiểm tra mạng nào')}</h3>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> {t('Add First Target with Presets', 'Thêm mục tiêu đầu tiên')}
          </button>
        </div>
      ) : (
        <>
          {/* Overview Cards by Tag (Fleet-Wide Incident Detection) */}
          {/* Overview Cards by Tag (Fleet-Wide Incident Detection or Scoped by Server) */}
          {(overviews.length > 0 || loading) && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted)] flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {selectedServer
                    ? `${t('Network Overview by Tag', 'Tổng quan mạng theo thẻ')} — ${selectedServer.name}`
                    : t('Fleet Network Overview by Tag', 'Tổng quan chất lượng mạng toàn cụm')}
                </h2>
              </div>

              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-32 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {overviews.map((ov) => {
                    const isCrit = ov.status === 'critical';
                    const isWarn = ov.status === 'warning';
                    return (
                      <div
                        key={ov.tag}
                        className={`rounded-md border p-3.5 flex flex-col justify-between transition-colors ${
                          ov.is_wide_area_issue
                            ? 'border-rose-500/60 bg-rose-500/10'
                            : isCrit
                            ? 'border-rose-500/40 bg-[var(--surface-1)]'
                            : isWarn
                            ? 'border-amber-500/40 bg-[var(--surface-1)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="font-bold text-xs text-[var(--foreground)] truncate" title={ov.tag}>
                              {ov.tag}
                            </span>
                            {renderStatusBadge(ov.status)}
                          </div>

                          {ov.is_wide_area_issue && (
                            <div className="mb-2.5 rounded bg-rose-500/15 border border-rose-500/30 px-2 py-1 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5 animate-pulse" />
                              <span className="text-[10px] font-semibold text-rose-500 leading-tight">
                                {t('Wide-Area Alert: Multiple servers reporting critical', 'Cảnh báo diện rộng: Nhiều máy chủ gặp sự cố')}
                              </span>
                            </div>
                          )}

                          <div className="flex items-baseline gap-1.5 mb-2.5">
                            <span className="text-xl font-bold font-mono tabular-nums text-[var(--foreground)]">
                              {ov.avg_latency_ms.toFixed(1)}
                            </span>
                            <span className="text-[11px] text-[var(--color-muted)] font-medium">{t('ms avg latency', 'ms độ trễ TB')}</span>
                          </div>

                          <div className="text-[11px] space-y-1 text-[var(--color-muted)] pb-2 border-b border-[var(--border-subtle)]">
                            {!selectedAgentId && (
                              <div className="flex justify-between">
                                <span>{t('Servers Monitored:', 'Máy chủ giám sát:')}</span>
                                <span className="font-semibold text-[var(--foreground)] font-mono tabular-nums">{ov.total_agents}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span>{t('Total Targets:', 'Tổng mục tiêu:')}</span>
                              <span className="font-semibold text-[var(--foreground)] font-mono tabular-nums">{ov.total_targets}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>{t('Max Packet Loss:', 'Mất gói cao nhất:')}</span>
                              <span className={`font-mono tabular-nums font-semibold ${ov.max_loss_pct > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {ov.max_loss_pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px]">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTag(ov.tag);
                            }}
                            className="text-[var(--accent-primary)] hover:underline font-semibold cursor-pointer"
                          >
                            {t('Filter tag →', 'Lọc theo thẻ →')}
                          </button>

                          {(() => {
                            const tagAlerts = getTagAlerts(ov.tag);
                            if (tagAlerts.length > 0) {
                              return (
                                <Link
                                  href="/dashboard/alerts?tab=rules&category=network"
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:underline"
                                  title={`${tagAlerts.length} ${t('alert rule(s) active for tag', 'quy tắc cảnh báo cho thẻ')} ${ov.tag}`}
                                >
                                  <Bell className="w-3 h-3 text-indigo-400" />
                                  <span>{tagAlerts.length} {t('Alerts', 'Cảnh báo')}</span>
                                </Link>
                              );
                            }
                            return (
                              <Link
                                href={`/dashboard/alerts?tab=create&category=network&target=${encodeURIComponent(ov.tag)}&metric=network_latency`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--color-muted)] hover:text-indigo-400 hover:underline"
                                title={`${t('Set alert rule for tag', 'Tạo cảnh báo cho thẻ')} ${ov.tag}`}
                              >
                                <Bell className="w-3 h-3" />
                                <span>{t('+ Set Alert', '+ Tạo cảnh báo')}</span>
                              </Link>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Filter and Search Bar */}
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none z-10" />
                <input
                  type="text"
                  placeholder={t('Search by target name, host, or server...', 'Tìm kiếm theo tên mục tiêu, host hoặc máy chủ...')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '34px' }}
                  className="w-full pr-3 py-1.5 text-xs rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                {/* Server filter */}
                <CustomSelect
                  value={selectedAgentId}
                  onChange={(val) => {
                    setSelectedAgentId(val);
                    if (typeof window !== 'undefined') {
                      const url = new URL(window.location.href);
                      if (val) {
                        url.searchParams.set('agent_id', val);
                      } else {
                        url.searchParams.delete('agent_id');
                      }
                      window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                    }
                  }}
                  options={serverSelectOptions}
                  icon={<ServerIcon className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
                  className="h-8.5 min-w-[180px] max-w-[230px]"
                />

                {/* Tag filter */}
                <CustomSelect
                  value={selectedTag}
                  onChange={setSelectedTag}
                  options={tagSelectOptions}
                  icon={<Filter className="w-3.5 h-3.5 text-[var(--color-muted)]" />}
                  className="h-8.5 min-w-[130px] max-w-[170px]"
                />

                {/* Status filter */}
                <CustomSelect
                  value={selectedStatus}
                  onChange={setSelectedStatus}
                  options={statusSelectOptions}
                  className="h-8.5 min-w-[120px] max-w-[150px]"
                />

                {(selectedAgentId || selectedTag !== 'all' || selectedStatus !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedAgentId('');
                      setSelectedTag('all');
                      setSelectedStatus('all');
                      setSearchQuery('');
                      if (typeof window !== 'undefined') {
                        const url = new URL(window.location.href);
                        url.searchParams.delete('agent_id');
                        window.history.replaceState({}, '', url.pathname + (url.search ? url.search : ''));
                      }
                    }}
                    className="h-8.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] px-2.5 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t('Reset', 'Đặt lại')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Target Management Table */}
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)] flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  {t('Monitored Network Targets', 'Mục tiêu mạng được giám sát')} ({filteredTargets.length})
                </h3>
              </div>
            </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] font-semibold text-[var(--color-muted)] text-[11px]">
                <th className="px-3.5 py-2.5">{t('Target & Host', 'Mục tiêu & Host')}</th>
                <th className="px-3.5 py-2.5">{t('Assigned Server', 'Máy chủ gán')}</th>
                <th className="px-3.5 py-2.5">{t('Tag', 'Thẻ')}</th>
                <th className="px-3.5 py-2.5">{t('Method', 'Giao thức')}</th>
                <th className="px-3.5 py-2.5">{t('Status', 'Trạng thái')}</th>
                <th className="px-3.5 py-2.5">{t('Latency', 'Độ trễ')}</th>
                <th className="px-3.5 py-2.5">{t('Packet Loss', 'Mất gói')}</th>
                <th className="px-3.5 py-2.5">{t('Probes', 'Số mẫu')}</th>
                <th className="px-3.5 py-2.5 text-right">{t('Actions', 'Thao tác')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {filteredTargets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-[var(--color-muted)]">
                    {t('No network targets match the selected filters.', 'Không tìm thấy mục tiêu nào phù hợp với bộ lọc.')}
                  </td>
                </tr>
              ) : (
                filteredTargets.map((target) => {
                  const res = target.latest_result;
                  const lat = res?.latency_ms;
                  const isTesting = testingTargetId === target.id;

                  const targetAlerts = getTargetAlerts(target);

                  return (
                    <tr key={target.id} className="hover:bg-[var(--surface-2)] transition-colors">
                      {/* Name & Host */}
                      <td className="px-3.5 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-[var(--foreground)]">{target.name}</span>
                          {target.is_gateway && (
                            <span className="text-[9px] font-mono font-semibold px-1 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
                              Gateway
                            </span>
                          )}
                          {targetAlerts.length > 0 && (
                            <Link
                              href="/dashboard/alerts?tab=rules&category=network"
                              className="text-[9px] font-mono font-semibold px-1 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/25 inline-flex items-center gap-1 transition-colors"
                              title={`${targetAlerts.length} ${t('alert rule(s) active:', 'quy tắc cảnh báo kích hoạt:')} ${targetAlerts.map(a => a.name).join(', ')}`}
                            >
                              <Bell className="w-2.5 h-2.5" />
                              <span>{targetAlerts.length} {t('Alert', 'Cảnh báo')}</span>
                            </Link>
                          )}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-[var(--color-muted)] mt-0.5">
                          {target.host}{target.port ? `:${target.port}` : ''}
                        </div>
                      </td>

                      {/* Server */}
                      <td className="px-3.5 py-2.5">
                        <Link
                          href={`/dashboard/servers/${target.agent_id}`}
                          className="font-medium text-[var(--accent-primary)] hover:underline flex items-center gap-1.5"
                        >
                          <ServerIcon className="w-3 h-3 text-[var(--color-muted)] shrink-0" />
                          <span className="truncate max-w-[140px]">{target.server_name || target.agent_id}</span>
                        </Link>
                      </td>

                      {/* Tag */}
                      <td className="px-3.5 py-2.5">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                          {target.tag}
                        </span>
                      </td>

                      {/* Method */}
                      <td className="px-3.5 py-2.5">
                        <span className={`inline-flex items-center font-mono font-semibold px-1.5 py-0.5 rounded text-[10px] border ${
                          target.probe_method === 'TCP'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {target.probe_method}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-2.5">
                        {renderStatusBadge(res?.status)}
                      </td>

                      {/* Latency */}
                      <td className="px-3.5 py-2.5 font-mono tabular-nums">
                        {lat != null ? (
                          <span className="font-semibold text-[var(--foreground)]">
                            {lat.toFixed(1)} ms
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] italic">N/A</span>
                        )}
                      </td>

                      {/* Packet Loss */}
                      <td className="px-3.5 py-2.5 font-mono tabular-nums">
                        {res?.packet_loss != null ? (
                          <span className={res.packet_loss > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500'}>
                            {res.packet_loss}%
                          </span>
                        ) : (
                          <span className="text-[var(--color-muted)] italic">N/A</span>
                        )}
                      </td>

                      {/* Probes */}
                      <td className="px-3.5 py-2.5 font-mono tabular-nums text-[var(--color-muted)]">
                        {res ? `${res.successful_probes}/${res.total_probes}` : `${target.probes_per_run}p`}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            href={`/dashboard/alerts?tab=create&category=network&target=${encodeURIComponent(target.name)}&server_id=${target.agent_id}&metric=network_latency`}
                            title={t(`Create or manage alert rule for target "${target.name}"`, `Tạo hoặc quản lý cảnh báo cho "${target.name}"`)}
                            className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-indigo-500/15 hover:border-indigo-500/30 text-indigo-400 transition-colors cursor-pointer"
                          >
                            <Bell className="w-3.5 h-3.5" />
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleTestTargetNow(target)}
                            disabled={isTesting}
                            title={t('Test target now', 'Kiểm tra mục tiêu ngay')}
                            className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-[var(--accent-primary)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <Zap className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openHistoryModal(target)}
                            title={t('View history chart', 'Xem biểu đồ lịch sử')}
                            className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-[var(--foreground)] transition-colors cursor-pointer"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(target)}
                            title={t('Edit target', 'Chỉnh sửa mục tiêu')}
                            className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-[var(--border-subtle)] text-[var(--foreground)] transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmTarget(target)}
                            title={t('Delete target', 'Xóa mục tiêu')}
                            className="p-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] hover:bg-rose-500/20 text-rose-500 transition-colors cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)]">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-3.5">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-sm font-bold">
                  {editingTarget ? `${t('Edit Target:', 'Sửa mục tiêu:')} ${editingTarget.name}` : t('Add Network Probe Target', 'Thêm mục tiêu kiểm tra mạng')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setTargetModalOpen(false)}
                className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preset quick buttons (only on create) */}
            {!editingTarget && presets.length > 0 && (
              <div className="mb-4 p-2.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)]">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--color-muted)] block mb-1.5">
                  {t('Presets', 'Mẫu cấu hình nhanh')}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {presets.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className="px-2 py-0.5 text-[11px] font-semibold rounded-sm bg-[var(--surface-1)] border border-[var(--border-subtle)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveTarget} className="space-y-3.5 text-xs">
              {/* Target Name & Host */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    {t('Target Name', 'Tên mục tiêu')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cloudflare DNS, Viettel Core"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    {t('Host / IP Address', 'Host / Địa chỉ IP')} <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required={!formData.is_gateway}
                    placeholder={formData.is_gateway ? 'gateway (auto-resolved)' : 'e.g. 1.1.1.1 or api.github.com'}
                    disabled={formData.is_gateway}
                    value={formData.host}
                    onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50 transition-colors font-mono"
                  />
                </div>
              </div>

              {/* Tag, Port, Method */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    {t('Tag / Category', 'Thẻ / Phân loại')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. International, Domestic"
                    value={formData.tag}
                    onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none transition-colors"
                  />
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {['International', 'Domestic', 'Infrastructure', 'Custom'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setFormData({ ...formData, tag })}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    {t('Probe Method', 'Phương thức kiểm tra')}
                  </label>
                  <CustomSelect
                    value={formData.probe_method}
                    onChange={(val) => setFormData({ ...formData, probe_method: val })}
                    options={[
                      { value: 'ICMP', label: 'ICMP Ping (Loss + Latency)' },
                      { value: 'TCP', label: 'TCP Connect (Reachability + RTT)' },
                    ]}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1 text-[var(--foreground)]">
                    {t('Port', 'Cổng (Port)')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={65535}
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 0 })}
                    className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:border-[var(--accent-primary)] focus:outline-none font-mono tabular-nums transition-colors"
                  />
                </div>
              </div>

              {/* Thresholds (Optional) */}
              <div className="p-3 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] space-y-2">
                <span className="font-semibold text-[var(--foreground)] block">
                  {t('Alert Thresholds', 'Ngưỡng cảnh báo')}
                </span>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[var(--color-muted)] mb-1 text-[11px]">
                      {t('Warning Latency (ms)', 'Độ trễ cảnh báo (ms)')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 50 ms"
                      value={formData.alert_latency_warning_ms}
                      onChange={(e) => setFormData({ ...formData, alert_latency_warning_ms: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:outline-none font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--color-muted)] mb-1 text-[11px]">
                      {t('Critical Latency (ms)', 'Độ trễ sự cố (ms)')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 150 ms"
                      value={formData.alert_latency_critical_ms}
                      onChange={(e) => setFormData({ ...formData, alert_latency_critical_ms: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:outline-none font-mono tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--color-muted)] mb-1 text-[11px]">
                      {t('Critical Packet Loss (%)', 'Mất gói sự cố (%)')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Default: 20 %"
                      value={formData.alert_loss_critical_pct}
                      onChange={(e) => setFormData({ ...formData, alert_loss_critical_pct: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--foreground)] focus:outline-none font-mono tabular-nums"
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
                    className="rounded-sm border-[var(--border-subtle)] text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-[var(--foreground)]">{t('Is Default Gateway Target', 'Là Gateway mặc định')}</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="rounded-sm border-[var(--border-subtle)] text-blue-600 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-[var(--foreground)]">{t('Enabled', 'Kích hoạt')}</span>
                </label>
              </div>

              {/* Server Selection (Multi-agent Batch Add on create) */}
              {!editingTarget && (
                <div className="pt-2 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-semibold text-[var(--foreground)] block">
                      {t('Assign to Servers', 'Gán vào máy chủ')} ({selectedAgentIds.length}/{servers.length} {t('selected', 'đã chọn')})
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAgentIds(servers.map((s) => s.id))}
                        className="text-[11px] text-[var(--accent-primary)] hover:underline cursor-pointer"
                      >
                        {t('Select All', 'Chọn tất cả')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAgentIds([])}
                        className="text-[11px] text-[var(--color-muted)] hover:underline cursor-pointer"
                      >
                        {t('Clear', 'Bỏ chọn')}
                      </button>
                    </div>
                  </div>

                  <div className="max-h-36 overflow-y-auto rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2 space-y-1">
                    {servers.map((s) => {
                      const checked = selectedAgentIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2 p-1 rounded-sm hover:bg-[var(--surface-1)] cursor-pointer text-xs"
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
                            className="rounded-sm border-[var(--border-subtle)] text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium text-[var(--foreground)]">{s.name}</span>
                          <span className="text-[10px] font-mono tabular-nums text-[var(--color-muted)]">
                            ({s.ip_address || s.id})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setTargetModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] font-semibold text-xs hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={savingTarget}
                  className="px-3.5 py-1.5 rounded-md bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingTarget ? t('Saving...', 'Đang lưu...') : editingTarget ? t('Save Changes', 'Lưu thay đổi') : t('Create Target(s)', 'Tạo mục tiêu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Target History Modal */}
      {historyModalOpen && historyTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-3xl rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
                  <h3 className="text-sm font-bold">{historyTarget.name} — {t('Latency History', 'Lịch sử độ trễ')}</h3>
                </div>
                <p className="text-[11px] text-[var(--color-muted)] font-mono tabular-nums mt-0.5">
                  Host: {historyTarget.host} · {t('Server:', 'Máy chủ:')} {historyTarget.server_name || historyTarget.agent_id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Time Range Selector */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-[var(--surface-2)] p-0.5 rounded-md border border-[var(--border-subtle)]">
                {(['6h', '24h', '7d'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => openHistoryModal(historyTarget, r)}
                    className={`px-2.5 py-1 text-xs font-mono font-semibold rounded-sm transition-colors cursor-pointer ${
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
                {historyData.length} {t('data points', 'điểm dữ liệu')}
              </span>
            </div>

            {/* Chart Area */}
            <div className="h-64 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] p-2.5">
              {loadingHistory ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                  {t('Loading time-series data...', 'Đang tải dữ liệu chuỗi thời gian...')}
                </div>
              ) : historyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-[var(--color-muted)]">
                  {t('No historical measurements recorded in this range.', 'Không có bản ghi đo lường nào trong khoảng thời gian này.')}
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
                      fill="url(#latencyGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="px-3.5 py-1.5 rounded-md bg-[var(--surface-2)] border border-[var(--border-subtle)] text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                {t('Close', 'Đóng')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-md border border-rose-500/40 bg-[var(--surface-1)] p-5 text-[var(--foreground)] space-y-3.5">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-md bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{t('Delete Network Target', 'Xóa mục tiêu mạng')}</h3>
                <p className="text-[11px] text-[var(--color-muted)]">{t('This action cannot be undone.', 'Hành động này không thể hoàn tác.')}</p>
              </div>
            </div>

            <p className="text-xs text-[var(--foreground)] leading-relaxed">
              {t('Are you sure you want to delete target', 'Bạn có chắc chắn muốn xóa mục tiêu')}{' '}
              <strong className="font-mono">&ldquo;{deleteConfirmTarget.name}&rdquo;</strong>{' '}
              {t('on server', 'trên máy chủ')}{' '}
              <strong>{deleteConfirmTarget.server_name || deleteConfirmTarget.agent_id}</strong>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs font-semibold hover:bg-[var(--border-subtle)] transition-colors cursor-pointer"
              >
                {t('Cancel', 'Hủy')}
              </button>
              <button
                type="button"
                onClick={handleDeleteTarget}
                disabled={deletingTarget}
                className="px-3.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {deletingTarget ? t('Deleting...', 'Đang xóa...') : t('Confirm Delete', 'Xác nhận xóa')}
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
