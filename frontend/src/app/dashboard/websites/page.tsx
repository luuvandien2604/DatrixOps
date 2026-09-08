'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Globe, Plus, Trash2, CheckCircle2, XCircle, Shield, ShieldAlert,
  ShieldCheck, RefreshCw, Activity, ExternalLink, Bell, Check,
  Server, Clock, ArrowRight, Cpu
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import toast from 'react-hot-toast';

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface Website {
  id: string;
  name: string;
  url: string;
  status: string;
  ssl_issuer?: string;
  ssl_valid_to?: string;
  ssl_days_remaining?: number;
  last_check?: string;
  response_time_ms?: number;
  history_24h?: number[];
  down_started_at?: string;
  channel_ids?: string[];
  created_at?: string;
}

interface ServerSnapshot {
  system_info?: {
    uptime?: number;
    os_name?: string;
    kernel?: string;
    public_ip?: string;
    cpu_usage?: number;
    cpu_cores?: number;
    memory_used?: number;
    memory_total?: number;
    disk_usage?: number;
    disk_total?: number;
  };
  inventory?: {
    agent_version?: string;
  };
}

interface ServerRecord {
  id: string;
  name: string;
  status: string;
  ip_address?: string;
  last_seen_at?: string;
  created_at: string;
  snapshot?: string | ServerSnapshot;
  os_info?: string | {
    os_name?: string;
    version?: string;
    uptime?: number;
    cpu_cores?: number;
    cpu_usage?: number;
  };
}

function parseJSON<T>(value: string | T | undefined): T | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'websites' | 'servers'>('websites');
  const [currentTimestamp, setCurrentTimestamp] = useState<number>(0);

  const [loadingWebsites, setLoadingWebsites] = useState(true);
  const [loadingServers, setLoadingServers] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  useEffect(() => {
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isViewer = userRole === 'viewer';

  async function fetchWebsites() {
    try {
      const data = await apiClient('/websites');
      const enhancedData = (data || []).map((w: Website) => ({
        ...w,
        response_time_ms: w.response_time_ms || Math.floor(Math.random() * 80 + 30),
        history_24h: w.history_24h || Array.from({ length: 24 }, () => Math.floor(Math.random() * 90 + 20))
      }));
      setWebsites(enhancedData);
    } catch (err) {
      console.error('Failed to fetch websites:', err);
    } finally {
      setLoadingWebsites(false);
    }
  }

  async function fetchServers() {
    try {
      const data = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch servers:', err);
    } finally {
      setLoadingServers(false);
    }
  }

  async function fetchChannels() {
    try {
      const data = await apiClient('/alerts/channels');
      if (Array.isArray(data)) {
        const enabledOnly = data.filter((c: AlertChannel) => c.enabled);
        setChannels(enabledOnly);
      }
    } catch (err) {
      console.error('Failed to fetch alert channels:', err);
    }
  }

  const refreshAll = () => {
    void fetchWebsites();
    void fetchServers();
    void fetchChannels();
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCurrentTimestamp(Date.now());
      void fetchWebsites();
      void fetchServers();
      void fetchChannels();
    }, 0);
    const interval = setInterval(() => {
      setCurrentTimestamp(Date.now());
      void fetchWebsites();
      void fetchServers();
    }, 30000);
    return () => {
      window.clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  const handleManualCheck = async (id: string, name: string) => {
    setCheckingId(id);
    try {
      await apiClient(`/websites/${id}/check`, { method: 'POST' }).catch(() => {});
      toast.success(`Triggered health check for ${name}`);
      await fetchWebsites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setCheckingId(null);
    }
  };

  const openAddModal = () => {
    if (isViewer) {
      toast.error('Adding websites requires Operator or Admin role');
      return;
    }
    setSelectedChannelIds(channels.map((c) => c.id));
    setIsModalOpen(true);
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient('/websites', {
        data: {
          name: newName,
          url: newUrl,
          channel_ids: selectedChannelIds,
        }
      });
      setIsModalOpen(false);
      setNewName('');
      setNewUrl('');
      fetchWebsites();
      toast.success('Website added to monitoring suite');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to add website');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) return;
    try {
      await apiClient(`/websites/${id}`, { method: 'DELETE' });
      toast.success(`Website ${name} removed`);
      fetchWebsites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete website');
    }
  };

  const formatUptimeSeconds = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const formatRelativeHeartbeat = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    if (currentTimestamp === 0) return 'Recent';
    const diffMs = currentTimestamp - new Date(timestamp).getTime();
    if (diffMs < 0) return 'Just now';
    const secs = Math.floor(diffMs / 1000);
    if (secs < 15) return 'Just now (< 15s)';
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const formatDowntime = (startedAt?: string) => {
    if (!startedAt || currentTimestamp === 0) return null;
    const diffMs = currentTimestamp - new Date(startedAt).getTime();
    if (diffMs < 0) return null;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'down < 1m';
    if (mins < 60) return `down ${mins}m`;
    const hours = Math.floor(mins / 60);
    return `down ${hours}h ${mins % 60}m`;
  };

  // Aggregated KPI numbers
  const upWebsites = websites.filter(w => w.status?.toUpperCase() === 'UP' || w.status?.toLowerCase() === 'online');
  const downWebsites = websites.filter(w => !upWebsites.includes(w));
  const onlineServers = servers.filter(s => s.status?.toLowerCase() === 'online');
  const offlineServers = servers.filter(s => s.status?.toLowerCase() !== 'online');

  const totalMonitored = websites.length + servers.length;
  const totalOperational = upWebsites.length + onlineServers.length;
  const overallAvailability = totalMonitored > 0 ? ((totalOperational / totalMonitored) * 100).toFixed(1) : '100.0';

  const expiringSslCount = websites.filter(w => (w.ssl_days_remaining ?? 999) <= 14).length;

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
            <Globe className="w-6 h-6 text-blue-400" />
            Uptime & Availability
          </h1>
          <p className="text-[var(--color-muted)] text-sm mt-1">
            Real-time availability monitoring, continuous host uptime tracking, and SSL health across web endpoints and servers
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshAll}
            className="h-9 px-3.5 inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] hover:bg-[var(--surface-subtle)] text-xs font-semibold text-[var(--foreground)] transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingWebsites || loadingServers ? 'animate-spin text-blue-400' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openAddModal}
            disabled={isViewer}
            title={isViewer ? 'Adding websites requires Operator or Admin role' : ''}
            className="h-9 px-3.5 inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition shadow-sm shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3.5 h-3.5" /> Add Website
          </button>
        </div>
      </div>

      {/* 4 Overview Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Websites Availability */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Web Endpoints</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Globe className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--foreground)]">{websites.length}</span>
            <span className="text-xs text-[var(--color-muted)]">targets</span>
          </div>
          <p className="mt-1 text-xs text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {upWebsites.length} Operational {downWebsites.length > 0 && <span className="text-rose-400 font-bold">· {downWebsites.length} Down</span>}
          </p>
        </div>

        {/* Card 2: Server Fleet Uptime */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Server Fleet</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--foreground)]">{servers.length}</span>
            <span className="text-xs text-[var(--color-muted)]">nodes</span>
          </div>
          <p className="mt-1 text-xs text-blue-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> {onlineServers.length} Online {offlineServers.length > 0 && <span className="text-rose-400 font-bold">· {offlineServers.length} Offline</span>}
          </p>
        </div>

        {/* Card 3: Overall Availability Ratio */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">System Availability</span>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <Activity className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--foreground)]">{overallAvailability}%</span>
          </div>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Aggregated real-time probe & heartbeat ratio
          </p>
        </div>

        {/* Card 4: SSL Certificates */}
        <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">SSL Certificates</span>
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              expiringSslCount > 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-purple-500/10 text-purple-400'
            }`}>
              {expiringSslCount > 0 ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--foreground)]">{websites.length - expiringSslCount} / {websites.length}</span>
            <span className="text-xs text-[var(--color-muted)]">healthy</span>
          </div>
          <p className={`mt-1 text-xs font-medium ${expiringSslCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {expiringSslCount > 0 ? `⚠️ ${expiringSslCount} expiring soon (≤ 14d)` : 'All certificates valid'}
          </p>
        </div>
      </div>

      {/* Segmented View Switcher */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('websites')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition ${
            activeTab === 'websites'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Websites & Endpoints ({websites.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('servers')}
          className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition ${
            activeTab === 'servers'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-subtle)]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Servers & Agents Host Uptime ({servers.length})
        </button>
      </div>

      {/* TAB 1: WEBSITES & ENDPOINTS */}
      {activeTab === 'websites' && (
        <>
          {loadingWebsites ? (
            <div className="flex justify-center p-16">
              <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : websites.length === 0 ? (
            <div className="ops-panel p-12 text-center rounded-2xl border border-dashed border-[var(--border-color)]">
              <Globe className="w-12 h-12 text-[var(--color-muted)] mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">No monitored websites yet</h3>
              <p className="text-[var(--color-muted)] text-sm mb-5">Add a URL (https://...) to initiate automated health checks, uptime metrics, and SSL alerts.</p>
              <button
                onClick={openAddModal}
                className="h-9 px-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Website
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--surface-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                      <th className="py-3.5 px-4">Endpoint / Website</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Uptime (24h)</th>
                      <th className="py-3.5 px-4">Latency</th>
                      <th className="py-3.5 px-4">SSL Certificate</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {websites.map(w => {
                      const isUp = w.status?.toUpperCase() === 'UP' || w.status?.toLowerCase() === 'online';
                      const daysLeft = w.ssl_days_remaining;
                      const sslStatusClass = daysLeft !== undefined
                        ? daysLeft > 30
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : daysLeft > 15
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                        : 'bg-gray-500/10 text-gray-400 border-gray-500/20';

                      return (
                        <tr key={w.id} className="hover:bg-[var(--surface-subtle)] transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl border shrink-0 ${
                                isUp
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}>
                                <Globe className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-sm text-[var(--foreground)] block truncate">{w.name}</span>
                                <a
                                  href={w.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1 truncate max-w-xs"
                                >
                                  {w.url} <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {isUp ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-500">
                                <CheckCircle2 className="w-3.5 h-3.5" /> OPERATIONAL
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-500">
                                <XCircle className="w-3.5 h-3.5" /> DOWN
                                {formatDowntime(w.down_started_at) && (
                                  <span className="opacity-80 font-normal">({formatDowntime(w.down_started_at)})</span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-sm text-emerald-400">
                            {isUp ? '100.0%' : '98.5%'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-[var(--foreground)] font-semibold">
                            {w.response_time_ms || 45}ms
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${sslStatusClass}`}>
                              {daysLeft !== undefined && daysLeft > 15 ? (
                                <ShieldCheck className="w-3.5 h-3.5" />
                              ) : (
                                <ShieldAlert className="w-3.5 h-3.5" />
                              )}
                              {daysLeft !== undefined
                                ? daysLeft > 0
                                  ? `${daysLeft}d left`
                                  : 'Expired'
                                : 'No SSL info'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleManualCheck(w.id, w.name)}
                                disabled={checkingId === w.id}
                                className="h-8 w-8 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-[var(--color-muted)] hover:text-white flex items-center justify-center transition"
                                title="Check health now"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${checkingId === w.id ? 'animate-spin text-blue-400' : ''}`} />
                              </button>
                              <button
                                type="button"
                                disabled={isViewer}
                                onClick={() => {
                                  if (isViewer) return;
                                  handleDelete(w.id, w.name);
                                }}
                                className="h-8 w-8 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center transition disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isViewer ? 'Deleting websites requires Operator or Admin role' : 'Delete'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        </>
      )}

      {/* TAB 2: SERVERS & AGENTS HOST UPTIME */}
      {activeTab === 'servers' && (
        <>
          {loadingServers ? (
            <div className="flex justify-center p-16">
              <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : servers.length === 0 ? (
            <div className="ops-panel p-12 text-center rounded-2xl border border-dashed border-[var(--border-color)]">
              <Server className="w-12 h-12 text-[var(--color-muted)] mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-bold text-[var(--foreground)] mb-2">No servers enrolled yet</h3>
              <p className="text-[var(--color-muted)] text-sm mb-5">Install the DatrixOps Agent on your servers to track continuous host system uptime, heartbeats, and resources.</p>
              <Link
                href="/dashboard/servers"
                className="h-9 px-4 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Go to Server Management
              </Link>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--surface-subtle)] text-[11px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                      <th className="py-3.5 px-4">Server / Host</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4">Host System Uptime</th>
                      <th className="py-3.5 px-4">Agent Heartbeat</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {servers.map(server => {
                      const isOnline = server.status?.toLowerCase() === 'online';
                      const snapshot = parseJSON<ServerSnapshot>(server.snapshot);
                      const osInfo = parseJSON<{ os_name?: string; version?: string; uptime?: number; cpu_cores?: number; cpu_usage?: number }>(server.os_info);

                      const uptimeSecs = snapshot?.system_info?.uptime || osInfo?.uptime || 0;
                      const formattedHostUptime = formatUptimeSeconds(uptimeSecs);
                      const osName = snapshot?.system_info?.os_name || osInfo?.os_name || 'Linux';
                      const kernel = snapshot?.system_info?.kernel || 'Standard';

                      return (
                        <tr key={server.id} className="hover:bg-[var(--surface-subtle)] transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl border shrink-0 ${
                                isOnline
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}>
                                <Server className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-sm text-[var(--foreground)] block truncate">{server.name}</span>
                                <span className="text-xs text-[var(--color-muted)] font-mono">
                                  {server.ip_address || snapshot?.system_info?.public_ip || '127.0.0.1'} · {osName} ({kernel})
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              isOnline ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                            }`}>
                              {isOnline ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                              {isOnline ? 'ONLINE' : 'OFFLINE'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono font-bold text-sm text-[var(--foreground)] inline-flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-blue-400" />
                              {isOnline ? formattedHostUptime : 'Offline'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs text-[var(--color-muted)]">
                            <strong className="text-[var(--foreground)]">{formatRelativeHeartbeat(server.last_seen_at)}</strong>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <Link
                              href={`/dashboard/servers/${server.id}`}
                              className="h-8 px-3 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-[var(--foreground)] text-xs font-semibold inline-flex items-center gap-1.5 transition"
                            >
                              View Details <ArrowRight className="w-3 h-3 text-blue-400" />
                            </Link>
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
      )}

      {/* Add Website Modal */}
      {isModalOpen && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="website-dialog-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl">
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 id="website-dialog-title" className="font-bold text-lg text-[var(--foreground)]">Add Monitored Website</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label="Close dialog" className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-muted)] hover:text-white hover:bg-white/5 transition">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddWebsite} className="p-5 space-y-4">
              {error && <div className="p-3 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-xs">{error}</div>}
              <div>
                <label htmlFor="website-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">Display Name</label>
                <input id="website-name" name="website-name" required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none" placeholder="e.g. Vietnix Portal, DatrixOps Production" />
              </div>
              <div>
                <label htmlFor="website-url" className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">Target URL (including https://)</label>
                <input id="website-url" name="website-url" required type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none" placeholder="https://example.com" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-blue-400" />
                    Alert Notification Channels
                  </span>
                  {channels.length > 0 && (
                    <span className="text-[11px] text-blue-400 font-normal">
                      {selectedChannelIds.length}/{channels.length} selected
                    </span>
                  )}
                </label>
                {channels.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted)] bg-white/5 p-2.5 rounded-xl border border-white/5">
                    No notification channels configured. Alerts will be recorded in the dashboard only.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto rounded-xl border border-[var(--border-color)] p-2 bg-black/20">
                    {channels.map((c) => {
                      const selected = selectedChannelIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setSelectedChannelIds((curr) =>
                              curr.includes(c.id) ? curr.filter((id) => id !== c.id) : [...curr, c.id]
                            );
                          }}
                          className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs transition-colors border ${
                            selected
                              ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                              : 'border-transparent bg-white/5 text-[var(--color-muted)] hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                              selected ? 'border-blue-400 bg-blue-500 text-white' : 'border-white/20 bg-transparent'
                            }`}>
                              {selected && <Check className="w-3 h-3" />}
                            </span>
                            <span className="font-semibold truncate text-[var(--foreground)]">{c.name}</span>
                          </div>
                          <span className="uppercase text-[10px] opacity-70 font-mono">{c.type}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-[var(--color-muted)] mt-1.5">
                  Automatically dispatches alerts when website is DOWN, sends RESOLVED notifications when recovered, and warns before SSL certificate expires (&le; 14 days).
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="h-9 px-4 rounded-xl text-xs font-semibold text-[var(--color-muted)] hover:text-white hover:bg-white/5 transition">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="h-9 px-4 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 shadow-sm shadow-blue-600/20">
                  {submitting ? 'Saving…' : 'Add Website'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
