'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Bell,
  Box,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Globe2,
  Layers,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Send,
  Server,
  Trash2,
  Wifi,
  X,
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';
import ConfirmModal from '@/components/ConfirmModal';

interface NetworkTargetOption {
  id: string;
  agent_id: string;
  server_name?: string;
  name: string;
  host: string;
  port: number;
  tag: string;
  probe_method: string;
  probes_per_run?: number;
  is_gateway: boolean;
  enabled: boolean;
}

interface RuleChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface AlertServer {
  id: string;
  name: string;
  status: string;
  ip_address?: string;
  hostname?: string;
}

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  duration_minutes: number;
  enabled: boolean;
  server_id?: string | null;
  server_ids?: string[];
  server_name?: string | null;
  channel_ids: string[];
  channels: RuleChannel[];
  repeat_interval_minutes?: number;
  target_name?: string | null;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  usage_count: number;
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
  channel_ids?: string[];
}

interface IncidentNotification {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  server_name?: string | null;
  rule_name?: string | null;
  metadata?: {
    failed_at?: string;
    recovered_at?: string;
    downtime_duration?: string;
    rule_name?: string;
    server_name?: string;
    target_name?: string;
    current_value?: number;
    threshold?: number;
    operator?: string;
    metric?: string;
  } | null;
  read_at?: string | null;
  created_at: string;
}

function formatIncidentDate(dateStr?: string | null) {
  if (!dateStr) return '';
  if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) return dateStr;
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return dateStr;
  }
}

type AlertTab = 'rules' | 'create' | 'channels' | 'incidents';
type AlertCategory = 'status' | 'container' | 'service' | 'metric' | 'website' | 'network';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.replace(/^\[[^\]]+\]\s*/, '');
  }
  return fallback;
};

function DiscordIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function TelegramIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.18 3.35-1.39 3.73-1.39.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .36z" />
    </svg>
  );
}

function AlertsPageInner() {
  const searchParams = useSearchParams();
  const paramTab = searchParams.get('tab');
  const paramCategory = searchParams.get('category');
  const paramTarget = searchParams.get('target');
  const paramServerId = searchParams.get('server_id');
  const paramMetric = searchParams.get('metric');

  const [activeTab, setActiveTab] = useState<AlertTab>('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [servers, setServers] = useState<AlertServer[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [incidents, setIncidents] = useState<IncidentNotification[]>([]);
  const [networkTargets, setNetworkTargets] = useState<NetworkTargetOption[]>([]);
  const [unreadIncidentsCount, setUnreadIncidentsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  const [savingRule, setSavingRule] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [testingNewChannel, setTestingNewChannel] = useState(false);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  // Edit Rule modal state
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [editName, setEditName] = useState('');
  const [editMetric, setEditMetric] = useState('cpu');
  const [editOperator, setEditOperator] = useState('>');
  const [editThreshold, setEditThreshold] = useState(80);
  const [editDuration, setEditDuration] = useState(5);
  const [editRepeat, setEditRepeat] = useState(60);
  const [editServerId, setEditServerId] = useState('');
  const [editTargetName, setEditTargetName] = useState('');
  const [editChannelIds, setEditChannelIds] = useState<string[]>([]);
  const [editServerSearchQuery, setEditServerSearchQuery] = useState('');
  const [editWebsiteSearchQuery, setEditWebsiteSearchQuery] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Delete Confirm Modal states
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<AlertRule | null>(null);
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<AlertChannel | null>(null);
  const [deletingRule, setDeletingRule] = useState(false);
  const [deletingChannel, setDeletingChannel] = useState(false);

  // Rules Tab Filter States
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<'all' | AlertCategory>('all');
  const [ruleStatusFilter, setRuleStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'unread' | 'read'>('all');

  // Create Alert Form State
  const [selectedCategory, setSelectedCategory] = useState<AlertCategory>('status');
  const [ruleName, setRuleName] = useState('Server Offline Alert');
  const [ruleMetric, setRuleMetric] = useState('status');
  const [ruleTargetName, setRuleTargetName] = useState('');
  const [ruleRepeatInterval, setRuleRepeatInterval] = useState('0');
  const [ruleOperator, setRuleOperator] = useState('>');
  const [ruleThreshold, setRuleThreshold] = useState('90');
  const [ruleDuration, setRuleDuration] = useState('1');
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [scopeSearchQuery, setScopeSearchQuery] = useState('');
  const [selectedWebsiteIds, setSelectedWebsiteIds] = useState<string[]>([]);
  const [websiteSearchQuery, setWebsiteSearchQuery] = useState('');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [showCustomDuration, setShowCustomDuration] = useState(false);

  // Auto-initialize selectedServerIds when servers are fetched or paramServerId changes
  useEffect(() => {
    if (servers.length > 0) {
      if (paramServerId && servers.some((s) => s.id === paramServerId)) {
        setSelectedServerIds([paramServerId]);
      } else {
        setSelectedServerIds((cur) => (cur.length === 0 ? servers.map((s) => s.id) : cur));
      }
    }
  }, [servers, paramServerId]);

  // Auto-initialize selectedWebsiteIds when websites are fetched or paramTarget changes
  useEffect(() => {
    if (websites.length > 0) {
      if (paramTarget && websites.some((w) => w.name === paramTarget)) {
        const found = websites.find((w) => w.name === paramTarget);
        if (found) setSelectedWebsiteIds([found.id]);
      } else {
        setSelectedWebsiteIds((cur) => (cur.length === 0 ? websites.map((w) => w.id) : cur));
      }
    }
  }, [websites, paramTarget]);

  // Sync with URL query parameters (e.g. from /dashboard/network or /dashboard/servers/[id])
  useEffect(() => {
    if (paramTab === 'create' || paramTab === 'rules' || paramTab === 'channels' || paramTab === 'incidents') {
      setActiveTab(paramTab as AlertTab);
    }
    if (
      paramCategory === 'network' ||
      paramCategory === 'status' ||
      paramCategory === 'metric' ||
      paramCategory === 'container' ||
      paramCategory === 'service' ||
      paramCategory === 'website'
    ) {
      setSelectedCategory(paramCategory as AlertCategory);
      if (paramCategory === 'network') {
        const met = paramMetric === 'network_loss' ? 'network_loss' : 'network_latency';
        setRuleMetric(met);
        const tgt = paramTarget || '';
        setRuleTargetName(tgt);
        if (paramServerId) setSelectedServerIds([paramServerId]);
        if (tgt) {
          setRuleName(`Network ${met === 'network_loss' ? 'Packet Loss' : 'Latency'}: ${tgt}`);
        }
      } else if (paramCategory === 'website') {
        setRuleMetric(paramMetric === 'ssl' ? 'ssl' : 'website');
        if (paramTarget) {
          setRuleTargetName(paramTarget);
          const found = websites.find((w) => w.name === paramTarget);
          if (found) setSelectedWebsiteIds([found.id]);
        }
      }
    }
  }, [paramTab, paramCategory, paramTarget, paramServerId, paramMetric, websites]);

  // Channel form state
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('telegram');
  const [channelToken, setChannelToken] = useState('');
  const [channelChatId, setChannelChatId] = useState('');
  const [channelWebhook, setChannelWebhook] = useState('');
  const [channelSMTPHost, setChannelSMTPHost] = useState('');
  const [channelSMTPPort, setChannelSMTPPort] = useState('587');
  const [channelSMTPUsername, setChannelSMTPUsername] = useState('');
  const [channelSMTPPassword, setChannelSMTPPassword] = useState('');
  const [channelEmailFrom, setChannelEmailFrom] = useState('');
  const [channelEmailTo, setChannelEmailTo] = useState('');
  const [channelUseTLS, setChannelUseTLS] = useState(false);

  // Channel edit state
  const [editingChannel, setEditingChannel] = useState<AlertChannel | null>(null);
  const [editChannelName, setEditChannelName] = useState('');
  const [editChannelType, setEditChannelType] = useState('telegram');
  const [editChannelToken, setEditChannelToken] = useState('');
  const [editChannelChatId, setEditChannelChatId] = useState('');
  const [editChannelWebhook, setEditChannelWebhook] = useState('');
  const [editChannelSMTPHost, setEditChannelSMTPHost] = useState('');
  const [editChannelSMTPPort, setEditChannelSMTPPort] = useState('587');
  const [editChannelSMTPUsername, setEditChannelSMTPUsername] = useState('');
  const [editChannelSMTPPassword, setEditChannelSMTPPassword] = useState('');
  const [editChannelEmailFrom, setEditChannelEmailFrom] = useState('');
  const [editChannelEmailTo, setEditChannelEmailTo] = useState('');
  const [editChannelUseTLS, setEditChannelUseTLS] = useState(false);
  const [savingEditChannel, setSavingEditChannel] = useState(false);
  const [testingEditChannel, setTestingEditChannel] = useState(false);

  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  useEffect(() => {
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isViewer = userRole === 'viewer';

  // Handle category change on create rule form
  const handleSelectCategory = (cat: AlertCategory) => {
    setSelectedCategory(cat);
    setErrorMessage('');
    setShowCustomDuration(false);
    setScopeSearchQuery('');
    setWebsiteSearchQuery('');
    if (cat === 'status') {
      setRuleMetric('status');
      setRuleName('Server Offline Alert');
      setRuleDuration('1');
      setRuleTargetName('');
    } else if (cat === 'container') {
      setRuleMetric('container');
      setRuleName(ruleTargetName ? `Docker: ${ruleTargetName}` : 'Docker Container Alert');
      setRuleDuration('1');
    } else if (cat === 'service') {
      setRuleMetric('service');
      setRuleName(ruleTargetName ? `Service: ${ruleTargetName}` : 'Systemd Service Alert');
      setRuleDuration('1');
    } else if (cat === 'metric') {
      setRuleMetric('cpu');
      setRuleName('High CPU Usage (> 90%)');
      setRuleOperator('>');
      setRuleThreshold('90');
      setRuleDuration('1');
      setRuleTargetName('');
    } else if (cat === 'network') {
      setRuleMetric('network_latency');
      setRuleName('High Network Latency (> 100ms)');
      setRuleOperator('>');
      setRuleThreshold('100');
      setRuleDuration('1');
      setRuleTargetName('');
    } else if (cat === 'website') {
      setRuleMetric('website');
      setRuleName('Website Down Alert');
      setRuleOperator('==');
      setRuleThreshold('0');
      setRuleDuration('1');
      setRuleTargetName('');
    }
  };

  async function fetchRules() {
    try {
      const data = await apiClient('/alerts/rules');
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to load alert rules.'));
    }
  }

  async function fetchChannels() {
    try {
      const data = await apiClient('/alerts/channels');
      setChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to load notification channels.'));
    }
  }

  async function fetchServers() {
    try {
      const data = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to load servers.'));
    }
  }

  async function fetchWebsites() {
    try {
      const data = await apiClient('/websites');
      setWebsites(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function fetchIncidents() {
    setLoadingIncidents(true);
    try {
      const data = await apiClient('/alerts/notifications?limit=50');
      setIncidents(data?.items || []);
      setUnreadIncidentsCount(data?.unread_count || 0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingIncidents(false);
    }
  }

  async function fetchNetworkTargets() {
    try {
      const data = await apiClient('/network-targets');
      setNetworkTargets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load network targets:', error);
    }
  }

  // Discovered tags and targets for Network Quality
  const discoveredNetworkTags = useMemo(() => {
    const set = new Set<string>();
    networkTargets.forEach((t) => {
      if (t.tag) set.add(t.tag);
    });
    return Array.from(set);
  }, [networkTargets]);

  const toggleServer = (serverId: string) => {
    setSelectedServerIds((current) =>
      current.includes(serverId)
        ? current.filter((id) => id !== serverId)
        : [...current, serverId]
    );
  };

  const toggleAllServers = () => {
    if (selectedServerIds.length === servers.length) {
      setSelectedServerIds([]);
    } else {
      setSelectedServerIds(servers.map((s) => s.id));
    }
  };

  const filteredServers = useMemo(() => {
    if (!scopeSearchQuery.trim()) return servers;
    const q = scopeSearchQuery.trim().toLowerCase();
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        (s.ip_address && s.ip_address.toLowerCase().includes(q))
    );
  }, [servers, scopeSearchQuery]);

  const toggleWebsite = (websiteId: string) => {
    setSelectedWebsiteIds((current) =>
      current.includes(websiteId)
        ? current.filter((id) => id !== websiteId)
        : [...current, websiteId]
    );
  };

  const toggleAllWebsites = () => {
    if (selectedWebsiteIds.length === websites.length) {
      setSelectedWebsiteIds([]);
    } else {
      setSelectedWebsiteIds(websites.map((w) => w.id));
    }
  };

  const filteredWebsites = useMemo(() => {
    if (!websiteSearchQuery.trim()) return websites;
    const q = websiteSearchQuery.trim().toLowerCase();
    return websites.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.url && w.url.toLowerCase().includes(q))
    );
  }, [websites, websiteSearchQuery]);

  const filteredEditServers = useMemo(() => {
    if (!editServerSearchQuery.trim()) return servers;
    const q = editServerSearchQuery.trim().toLowerCase();
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.hostname && s.hostname.toLowerCase().includes(q)) ||
        (s.ip_address && s.ip_address.toLowerCase().includes(q))
    );
  }, [servers, editServerSearchQuery]);

  const filteredEditWebsites = useMemo(() => {
    if (!editWebsiteSearchQuery.trim()) return websites;
    const q = editWebsiteSearchQuery.trim().toLowerCase();
    return websites.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.url && w.url.toLowerCase().includes(q))
    );
  }, [websites, editWebsiteSearchQuery]);

  const relevantNetworkTargets = useMemo(() => {
    if (selectedServerIds.length > 0 && selectedServerIds.length < servers.length) {
      const serverSet = new Set(selectedServerIds);
      return networkTargets.filter((t) => serverSet.has(t.agent_id));
    }
    return networkTargets;
  }, [networkTargets, selectedServerIds, servers.length]);

  const matchedNetworkTargets = useMemo(() => {
    if (selectedCategory !== 'network') return [];
    const filter = ruleTargetName.trim().toLowerCase();
    return relevantNetworkTargets.filter((t) => {
      if (!filter) return true;
      return (
        t.name.toLowerCase().includes(filter) ||
        t.tag.toLowerCase().includes(filter) ||
        t.host.toLowerCase().includes(filter)
      );
    });
  }, [selectedCategory, ruleTargetName, relevantNetworkTargets]);

  const codeSummary = useMemo(() => {
    // Condition code
    let cond = '';
    if (selectedCategory === 'status') {
      const sec = Number(ruleDuration || 1) * 60;
      cond = `heartbeat_missing > ${sec}s`;
    } else if (selectedCategory === 'metric') {
      cond = `${ruleMetric} ${ruleOperator} ${ruleThreshold}% (${ruleDuration}m)`;
    } else if (selectedCategory === 'network') {
      const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
      const target = ruleTargetName ? `[${ruleTargetName}]` : 'all_targets';
      cond = `network_${ruleMetric === 'network_latency' ? 'latency' : 'loss'}${target} ${ruleOperator} ${ruleThreshold}${unit} (${ruleDuration}m)`;
    } else if (selectedCategory === 'container') {
      cond = `container[${ruleTargetName || '*'}] != running`;
    } else if (selectedCategory === 'service') {
      cond = `service[${ruleTargetName || '*'}] != active`;
    } else if (selectedCategory === 'website') {
      if (ruleMetric === 'ssl') {
        cond = `ssl_expires <= ${ruleThreshold}d`;
      } else {
        cond = `http_status != 200`;
      }
    }

    // Scope code
    let scope = '';
    if (selectedCategory === 'website') {
      if (selectedWebsiteIds.length === 0) {
        scope = 'no sites selected';
      } else if (selectedWebsiteIds.length === websites.length) {
        scope = `all (${websites.length} site${websites.length === 1 ? '' : 's'})`;
      } else if (selectedWebsiteIds.length === 1) {
        const sName = websites.find((w) => w.id === selectedWebsiteIds[0])?.name || '1 site';
        scope = `site (${sName})`;
      } else {
        scope = `${selectedWebsiteIds.length} sites`;
      }
    } else {
      if (selectedServerIds.length === 0) {
        scope = 'no agents selected';
      } else if (selectedServerIds.length === servers.length) {
        scope = `all (${servers.length} agent${servers.length === 1 ? '' : 's'})`;
      } else if (selectedServerIds.length === 1) {
        const sName = servers.find((s) => s.id === selectedServerIds[0])?.name || '1 agent';
        scope = `agent (${sName})`;
      } else {
        scope = `${selectedServerIds.length} agents`;
      }
    }

    // Notify code
    let notify = '';
    if (selectedChannelIds.length === 0) {
      notify = 'notify none';
    } else {
      const selectedNames = channels
        .filter((c) => selectedChannelIds.includes(c.id))
        .map((c) => c.name.toLowerCase());
      notify = `notify ${selectedNames.join(', ')}`;
    }

    // Repeat code
    let repeat = 'repeat once';
    if (ruleRepeatInterval === '15') repeat = 'repeat every 15m';
    else if (ruleRepeatInterval === '30') repeat = 'repeat every 30m';
    else if (ruleRepeatInterval === '60') repeat = 'repeat every 1h';
    else if (ruleRepeatInterval === '120') repeat = 'repeat every 2h';

    return { cond, scope, notify, repeat };
  }, [
    selectedCategory,
    ruleDuration,
    ruleMetric,
    ruleOperator,
    ruleThreshold,
    ruleTargetName,
    selectedServerIds,
    selectedWebsiteIds,
    servers,
    websites,
    selectedChannelIds,
    channels,
    ruleRepeatInterval,
  ]);

  const refreshAllData = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchRules(), fetchChannels(), fetchServers(), fetchWebsites(), fetchIncidents(), fetchNetworkTargets()]);
      setSuccessMessage('Alert Center data refreshed.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchRules(), fetchChannels(), fetchServers(), fetchWebsites(), fetchIncidents(), fetchNetworkTargets()]);
      setLoading(false);
    };
    void loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'incidents') {
      void fetchIncidents();
    }
  }, [activeTab]);

  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  };

  const getChannelConfig = () => {
    if (channelType === 'telegram') {
      return { bot_token: channelToken.trim(), chat_id: channelChatId.trim() };
    }
    if (channelType === 'discord') {
      return { webhook_url: channelWebhook.trim() };
    }
    return {
      smtp_host: channelSMTPHost.trim(),
      smtp_port: Number.parseInt(channelSMTPPort, 10) || 587,
      username: channelSMTPUsername.trim(),
      password: channelSMTPPassword,
      from: channelEmailFrom.trim(),
      to: channelEmailTo.trim(),
      use_tls: channelUseTLS,
    };
  };

  const testNewChannel = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (channelType === 'discord') {
      const trimmed = channelWebhook.trim();
      if (!trimmed.startsWith('https://discord.com/api/webhooks/') && !trimmed.startsWith('https://discordapp.com/api/webhooks/')) {
        setErrorMessage('Please enter a valid Discord Webhook URL (starting with https://discord.com/api/webhooks/...).');
        return;
      }
    } else if (channelType === 'telegram') {
      if (!channelToken.trim() || !channelChatId.trim()) {
        setErrorMessage('Please enter both Telegram Bot Token and Chat ID.');
        return;
      }
    } else if (channelType === 'email') {
      if (!channelSMTPHost.trim() || !channelEmailFrom.trim() || !channelEmailTo.trim()) {
        setErrorMessage('Please enter SMTP host, From, and Recipient addresses.');
        return;
      }
    }

    setTestingNewChannel(true);
    try {
      await apiClient('/alerts/channels/test', {
        method: 'POST',
        body: JSON.stringify({
          name: channelName.trim() || 'Test Channel',
          type: channelType,
          config: getChannelConfig(),
        }),
      });
      setSuccessMessage('Test notification sent successfully! Please verify your notification channel.');
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Failed to send test notification. Please verify channel configuration.'));
    } finally {
      setTestingNewChannel(false);
    }
  };

  const testExistingChannel = async (id: string, name: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTestingChannelId(id);
    try {
      await apiClient(`/alerts/channels/${id}/test`, { method: 'POST' });
      setSuccessMessage(`Test notification sent to channel "${name}" successfully!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, `Failed to send test notification to channel "${name}".`));
    } finally {
      setTestingChannelId(null);
    }
  };

  const testAlertRule = async (id: string, name: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTestingRuleId(id);
    try {
      const res = await apiClient(`/alerts/rules/${id}/test`, { method: 'POST' });
      setSuccessMessage(res?.message || `Test alert sent for rule "${name}" successfully!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, `Failed to send test alert for rule "${name}".`));
    } finally {
      setTestingRuleId(null);
    }
  };

  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (selectedChannelIds.length === 0) {
      setErrorMessage('Please select at least one notification channel (Discord, Telegram, or Email).');
      return;
    }

    if (selectedCategory === 'website') {
      if (selectedWebsiteIds.length === 0) {
        setErrorMessage('Please select at least one website in scope.');
        return;
      }
    } else {
      if (selectedServerIds.length === 0) {
        setErrorMessage('Please select at least one agent in scope.');
        return;
      }
    }

    const isSpecialMetric = ruleMetric === 'status' || ruleMetric === 'container' || ruleMetric === 'service' || ruleMetric === 'website' || ruleMetric === 'ssl';
    if (ruleMetric === 'container' || ruleMetric === 'service') {
      if (!ruleTargetName.trim()) {
        setErrorMessage(`Please enter the ${ruleMetric === 'container' ? 'Container' : 'Service'} name to monitor.`);
        return;
      }
    }

    const threshold = Number.parseFloat(ruleThreshold);
    if (!isSpecialMetric) {
      if (ruleMetric === 'network_latency') {
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 60000) {
          setErrorMessage('Network latency threshold must be between 0 and 60,000 ms.');
          return;
        }
      } else {
        if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
          setErrorMessage('Threshold percentage must be between 0 and 100%.');
          return;
        }
      }
    }
    const duration = Number.parseInt(ruleDuration, 10);
    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
      setErrorMessage('Duration must be between 1 and 1440 minutes.');
      return;
    }

    setSavingRule(true);
    try {
      const isFleetWide = selectedServerIds.length === servers.length || selectedServerIds.length === 0;
      const isSingleServer = selectedServerIds.length === 1;

      const payloadServerId = selectedCategory === 'website'
        ? null
        : isSingleServer
        ? selectedServerIds[0]
        : null;

      const payloadServerIds = selectedCategory === 'website'
        ? []
        : (!isFleetWide && !isSingleServer)
        ? selectedServerIds
        : [];

      let payloadTargetName: string | null = null;
      if (selectedCategory === 'website') {
        if (selectedWebsiteIds.length === 1) {
          const site = websites.find((w) => w.id === selectedWebsiteIds[0]);
          payloadTargetName = site?.name || ruleTargetName.trim() || null;
        } else {
          payloadTargetName = ruleTargetName.trim() || null;
        }
      } else if (
        ruleMetric === 'container' ||
        ruleMetric === 'service' ||
        ruleMetric === 'network_latency' ||
        ruleMetric === 'network_loss'
      ) {
        payloadTargetName = ruleTargetName.trim() || null;
      }

      const resData = await apiClient('/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName.trim(),
          metric: ruleMetric,
          operator: isSpecialMetric ? '==' : ruleOperator,
          threshold: ruleMetric === 'ssl' ? (threshold || 14) : isSpecialMetric ? 0 : threshold,
          duration_minutes: duration,
          server_id: payloadServerId,
          server_ids: payloadServerIds,
          channel_ids: selectedChannelIds,
          repeat_interval_minutes: Number.parseInt(ruleRepeatInterval, 10) || 0,
          target_name: payloadTargetName,
        }),
      });

      if (Array.isArray(resData)) {
        setRules((current) => [...resData, ...current]);
        setSuccessMessage(`${resData.length} alert rules created successfully!`);
      } else {
        setRules((current) => [resData, ...current]);
        setSuccessMessage(`Alert rule "${resData?.name || ruleName.trim()}" created successfully!`);
      }
      setActiveTab('rules');

      // Reset form
      setRuleName('Server Offline Alert');
      setSelectedCategory('status');
      setRuleMetric('status');
      setRuleTargetName('');
      setRuleRepeatInterval('0');
      setRuleThreshold('90');
      setRuleDuration('1');
      setSelectedServerIds(servers.map((s) => s.id));
      setSelectedWebsiteIds(websites.map((w) => w.id));
      setScopeSearchQuery('');
      setWebsiteSearchQuery('');
      setSelectedChannelIds([]);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to create alert rule.'));
    } finally {
      setSavingRule(false);
    }
  };

  const openEditModal = (rule: AlertRule) => {
    setEditingRule(rule);
    setEditName(rule.name);
    setEditMetric(rule.metric);
    setEditOperator(rule.operator);
    setEditThreshold(rule.threshold);
    setEditDuration(rule.duration_minutes);
    setEditRepeat(rule.repeat_interval_minutes || 0);
    setEditServerId(rule.server_id || '');
    setEditTargetName(rule.target_name || '');
    setEditChannelIds(rule.channels && rule.channels.length > 0 ? rule.channels.map((c) => c.id) : rule.channel_ids || []);
    setEditServerSearchQuery('');
    setEditWebsiteSearchQuery('');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (!editName.trim()) {
      setErrorMessage('Rule name is required.');
      return;
    }
    if (editChannelIds.length === 0) {
      setErrorMessage('Please select at least one notification channel.');
      return;
    }
    setSavingEdit(true);
    setErrorMessage('');
    try {
      const payload = {
        name: editName.trim(),
        metric: editMetric,
        operator: (editMetric === 'status' || editMetric === 'container' || editMetric === 'service') ? '==' : editOperator,
        threshold: (editMetric === 'status' || editMetric === 'container' || editMetric === 'service') ? 0 : Number(editThreshold),
        duration_minutes: Number(editDuration),
        repeat_interval_minutes: Number(editRepeat),
        server_id: editServerId && editServerId !== 'all' ? editServerId : null,
        target_name: (editMetric === 'container' || editMetric === 'service' || editMetric === 'network_latency' || editMetric === 'network_loss' || editMetric === 'website' || editMetric === 'ssl') ? (editTargetName.trim() || null) : null,
        channel_ids: editChannelIds,
      };
      await apiClient(`/alerts/rules/${editingRule.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setSuccessMessage(`Alert rule "${editName.trim()}" updated successfully!`);
      setEditingRule(null);
      await fetchRules();
    } catch (err: unknown) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to update alert rule.'));
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleEditChannel = (channelId: string) => {
    setEditChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId]
    );
  };

  const toggleRule = async (ruleId: string, currentEnabled: boolean) => {
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const updated = await apiClient(`/alerts/rules/${ruleId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      setRules((current) =>
        current.map((r) => (r.id === ruleId ? { ...r, enabled: updated.enabled } : r))
      );
      setSuccessMessage(updated.enabled ? 'Alert rule enabled.' : 'Alert rule disabled.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to update alert rule status.'));
    }
  };

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setSavingChannel(true);

    try {
      if (channelType === 'discord') {
        const trimmed = channelWebhook.trim();
        if (!trimmed.startsWith('https://discord.com/api/webhooks/') && !trimmed.startsWith('https://discordapp.com/api/webhooks/')) {
          setErrorMessage('Please enter a valid Discord Webhook URL (starting with https://discord.com/api/webhooks/...).');
          setSavingChannel(false);
          return;
        }
      }

      const config = getChannelConfig();
      const createdChannel = await apiClient('/alerts/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: channelName.trim(),
          type: channelType,
          config,
        }),
      });

      setChannels((current) => [createdChannel, ...current]);
      setSelectedChannelIds((current) =>
        current.includes(createdChannel.id) ? current : [...current, createdChannel.id],
      );
      setChannelName('');
      setChannelToken('');
      setChannelChatId('');
      setChannelWebhook('');
      setChannelSMTPHost('');
      setChannelSMTPPort('587');
      setChannelSMTPUsername('');
      setChannelSMTPPassword('');
      setChannelEmailFrom('');
      setChannelEmailTo('');
      setChannelUseTLS(false);
      setSuccessMessage(`Notification channel "${createdChannel.name}" created successfully!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to create notification channel.'));
    } finally {
      setSavingChannel(false);
    }
  };

  const confirmDeleteRule = async () => {
    if (!deleteRuleTarget) return;
    if (isViewer) {
      setErrorMessage('Deleting alert rules requires Admin or Operator role.');
      setDeleteRuleTarget(null);
      return;
    }
    setDeletingRule(true);
    setErrorMessage('');

    try {
      await apiClient(`/alerts/rules/${deleteRuleTarget.id}`, { method: 'DELETE' });
      setRules((current) => current.filter((rule) => rule.id !== deleteRuleTarget.id));
      setSuccessMessage(`Alert rule "${deleteRuleTarget.name}" deleted.`);
      setDeleteRuleTarget(null);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete alert rule.'));
    } finally {
      setDeletingRule(false);
    }
  };

  const confirmDeleteChannel = async () => {
    if (!deleteChannelTarget) return;
    if (isViewer) {
      setErrorMessage('Deleting notification channels requires Admin or Operator role.');
      setDeleteChannelTarget(null);
      return;
    }
    setDeletingChannel(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiClient(`/alerts/channels/${deleteChannelTarget.id}`, { method: 'DELETE' });
      setChannels((current) => current.filter((item) => item.id !== deleteChannelTarget.id));
      setSelectedChannelIds((current) => current.filter((channelId) => channelId !== deleteChannelTarget.id));
      setSuccessMessage(`Notification channel "${deleteChannelTarget.name}" deleted.`);
      setDeleteChannelTarget(null);
    } catch (error) {
      console.error(error);
      await Promise.all([fetchRules(), fetchChannels(), fetchServers()]);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete notification channel.'));
    } finally {
      setDeletingChannel(false);
    }
  };

  const openEditChannelModal = (channel: AlertChannel) => {
    setEditingChannel(channel);
    setEditChannelName(channel.name);
    setEditChannelType(channel.type);

    const cfg = (channel.config || {}) as Record<string, unknown>;
    setEditChannelToken('');
    setEditChannelWebhook('');
    setEditChannelSMTPPassword('');

    if (channel.type === 'telegram') {
      setEditChannelChatId(typeof cfg.chat_id === 'string' ? cfg.chat_id : '');
      setEditChannelSMTPHost('');
      setEditChannelSMTPPort('587');
      setEditChannelSMTPUsername('');
      setEditChannelEmailFrom('');
      setEditChannelEmailTo('');
      setEditChannelUseTLS(false);
    } else if (channel.type === 'discord') {
      setEditChannelChatId('');
      setEditChannelSMTPHost('');
      setEditChannelSMTPPort('587');
      setEditChannelSMTPUsername('');
      setEditChannelEmailFrom('');
      setEditChannelEmailTo('');
      setEditChannelUseTLS(false);
    } else if (channel.type === 'email') {
      setEditChannelChatId('');
      setEditChannelSMTPHost(typeof cfg.smtp_host === 'string' ? cfg.smtp_host : '');
      setEditChannelSMTPPort(cfg.smtp_port ? String(cfg.smtp_port) : '587');
      setEditChannelSMTPUsername(typeof cfg.username === 'string' ? cfg.username : '');
      setEditChannelEmailFrom(typeof cfg.from === 'string' ? cfg.from : '');
      setEditChannelEmailTo(typeof cfg.to === 'string' ? cfg.to : '');
      setEditChannelUseTLS(Boolean(cfg.use_tls));
    }
  };

  const getEditChannelConfig = () => {
    if (editChannelType === 'telegram') {
      const cfg: Record<string, unknown> = {
        chat_id: editChannelChatId.trim(),
      };
      if (editChannelToken.trim()) {
        cfg.bot_token = editChannelToken.trim();
      }
      return cfg;
    }
    if (editChannelType === 'discord') {
      const cfg: Record<string, unknown> = {};
      if (editChannelWebhook.trim()) {
        cfg.webhook_url = editChannelWebhook.trim();
      }
      return cfg;
    }
    const cfg: Record<string, unknown> = {
      smtp_host: editChannelSMTPHost.trim(),
      smtp_port: Number.parseInt(editChannelSMTPPort, 10) || 587,
      username: editChannelSMTPUsername.trim(),
      from: editChannelEmailFrom.trim(),
      to: editChannelEmailTo.trim(),
      use_tls: editChannelUseTLS,
    };
    if (editChannelSMTPPassword) {
      cfg.password = editChannelSMTPPassword;
    }
    return cfg;
  };

  const handleSaveEditChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingChannel) return;
    if (isViewer) {
      setErrorMessage('Editing notification channels requires Admin or Operator role.');
      return;
    }
    if (!editChannelName.trim()) {
      setErrorMessage('Channel display name is required.');
      return;
    }
    if (editChannelType === 'discord' && editChannelWebhook.trim()) {
      const trimmed = editChannelWebhook.trim();
      if (!trimmed.startsWith('https://discord.com/api/webhooks/') && !trimmed.startsWith('https://discordapp.com/api/webhooks/')) {
        setErrorMessage('Please enter a valid Discord Webhook URL (starting with https://discord.com/api/webhooks/...).');
        return;
      }
    }
    if (editChannelType === 'telegram' && !editChannelChatId.trim()) {
      setErrorMessage('Telegram Chat ID is required.');
      return;
    }
    if (editChannelType === 'email') {
      if (!editChannelSMTPHost.trim() || !editChannelEmailFrom.trim() || !editChannelEmailTo.trim()) {
        setErrorMessage('Please enter SMTP host, From, and Recipient addresses.');
        return;
      }
    }

    setSavingEditChannel(true);
    setErrorMessage('');
    try {
      const payload = {
        name: editChannelName.trim(),
        type: editChannelType,
        config: getEditChannelConfig(),
      };
      const updated = await apiClient(`/alerts/channels/${editingChannel.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      setChannels((current) =>
        current.map((ch) => (ch.id === editingChannel.id ? { ...ch, ...updated } : ch))
      );
      setSuccessMessage(`Notification channel "${editChannelName.trim()}" updated successfully!`);
      setEditingChannel(null);
    } catch (err: unknown) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to update notification channel.'));
    } finally {
      setSavingEditChannel(false);
    }
  };

  const testEditChannel = async () => {
    if (!editingChannel) return;
    setErrorMessage('');
    setSuccessMessage('');

    const hasNewSecret = Boolean(
      (editChannelType === 'telegram' && editChannelToken.trim()) ||
      (editChannelType === 'discord' && editChannelWebhook.trim()) ||
      (editChannelType === 'email' && editChannelSMTPPassword)
    );

    setTestingEditChannel(true);
    try {
      if (hasNewSecret) {
        if (editChannelType === 'discord') {
          const trimmed = editChannelWebhook.trim();
          if (!trimmed.startsWith('https://discord.com/api/webhooks/') && !trimmed.startsWith('https://discordapp.com/api/webhooks/')) {
            setErrorMessage('Please enter a valid Discord Webhook URL (starting with https://discord.com/api/webhooks/...).');
            setTestingEditChannel(false);
            return;
          }
        }
        await apiClient('/alerts/channels/test', {
          method: 'POST',
          body: JSON.stringify({
            name: editChannelName.trim() || 'Test Channel',
            type: editChannelType,
            config: getEditChannelConfig(),
          }),
        });
      } else {
        await apiClient(`/alerts/channels/${editingChannel.id}/test`, { method: 'POST' });
      }
      setSuccessMessage(`Test notification sent successfully to "${editChannelName || editingChannel.name}"!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Failed to send test notification. Please verify channel configuration.'));
    } finally {
      setTestingEditChannel(false);
    }
  };

  const markAllIncidentsRead = async () => {
    try {
      await apiClient('/alerts/notifications/read-all', { method: 'POST' });
      setIncidents((current) =>
        current.map((item) => ({ ...item, read_at: new Date().toISOString() })),
      );
      setUnreadIncidentsCount(0);
      setSuccessMessage('All notifications marked as read.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to update notification status.'));
    }
  };

  const markIncidentRead = async (id: string) => {
    try {
      await apiClient(`/alerts/notifications/${id}/read`, { method: 'PATCH' });
      setIncidents((current) =>
        current.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)),
      );
      setUnreadIncidentsCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error(error);
    }
  };

  // Filtered rules list
  const filteredRules = useMemo(() => {
    return rules.filter((rule) => {
      // Status filter
      if (ruleStatusFilter === 'active' && !rule.enabled) return false;
      if (ruleStatusFilter === 'disabled' && rule.enabled) return false;

      // Category filter
      if (ruleCategoryFilter !== 'all') {
        if (ruleCategoryFilter === 'status' && rule.metric !== 'status') return false;
        if (ruleCategoryFilter === 'container' && rule.metric !== 'container') return false;
        if (ruleCategoryFilter === 'service' && rule.metric !== 'service') return false;
        if (ruleCategoryFilter === 'metric' && !['cpu', 'ram', 'disk'].includes(rule.metric)) return false;
        if (ruleCategoryFilter === 'website' && !['website', 'ssl'].includes(rule.metric)) return false;
        if (ruleCategoryFilter === 'network' && !['network_latency', 'network_loss'].includes(rule.metric)) return false;
      }

      // Search query
      if (ruleSearchQuery.trim()) {
        const q = ruleSearchQuery.toLowerCase();
        const matchName = rule.name.toLowerCase().includes(q);
        const matchMetric = rule.metric.toLowerCase().includes(q);
        const matchTarget = (rule.target_name || '').toLowerCase().includes(q);
        const matchServer = (rule.server_name || '').toLowerCase().includes(q);
        return matchName || matchMetric || matchTarget || matchServer;
      }
      return true;
    });
  }, [rules, ruleStatusFilter, ruleCategoryFilter, ruleSearchQuery]);

  const enabledChannels = channels.filter((channel) => channel.enabled);

  // High-level KPI values
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const activeFiringCount = incidents.filter(
    (i) => (i.kind === 'alert_firing' || i.severity === 'critical' || i.kind === 'website_down') && !i.read_at,
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      {activeTab !== 'create' && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
              Alert Center
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void refreshAllData()}
              disabled={refreshing}
              className="ops-button secondary flex items-center gap-2"
              title="Refresh alert rules, channels and incident telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-blue-500' : 'text-[var(--color-muted)]'}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              disabled={isViewer}
              title={isViewer ? 'Creating rules requires Operator or Admin role' : 'Create new alert rule'}
              className="ops-button primary flex items-center gap-2 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>+ Create Alert Rule</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Alerts / Status Banner */}
      {(errorMessage || successMessage) && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium shadow-sm transition-all animate-in fade-in ${
            errorMessage
              ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {errorMessage ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{errorMessage || successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMessage(''); setSuccessMessage(''); }}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top 4 KPI Summary Metric Cards & Main Tab Navigation (Hidden when on Create Studio) */}
      {activeTab !== 'create' && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Active Rules Card */}
            <div className="metric-card surface-regular status-tone-healthy p-4">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--mint)' }}>
                  <Bell className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  POLICIES
                </span>
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[.16em] text-[var(--color-muted)]">
                Active Rules
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono text-3xl font-semibold text-[var(--foreground)]">
                  {activeRulesCount}
                  <span className="text-lg font-normal text-[var(--color-muted)]">/{rules.length}</span>
                </p>
                <p className="mb-0.5 text-right text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  {rules.length > 0 ? `${Math.round((activeRulesCount / rules.length) * 100)}% active` : 'No rules'}
                </p>
              </div>
            </div>

            {/* Firing Incidents Card */}
            <div className={`metric-card surface-regular ${activeFiringCount > 0 ? 'status-tone-critical' : 'status-tone-healthy'} p-4`}>
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: activeFiringCount > 0 ? 'var(--rose)' : 'var(--mint)' }}>
                  <Flame className="h-4 w-4" />
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${activeFiringCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {activeFiringCount > 0 ? 'FIRING' : 'HEALTHY'}
                </span>
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[.16em] text-[var(--color-muted)]">
                Open Incidents
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono text-3xl font-semibold text-[var(--foreground)]">
                  {activeFiringCount}
                </p>
                <p className={`mb-0.5 text-right text-[10px] font-medium ${activeFiringCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {activeFiringCount > 0 ? `${activeFiringCount} require action` : 'All systems clear'}
                </p>
              </div>
            </div>

            {/* Notification Channels Card */}
            <div className="metric-card surface-regular status-tone-info p-4">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--violet)' }}>
                  <Radio className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  ROUTING
                </span>
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[.16em] text-[var(--color-muted)]">
                Connected Channels
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono text-3xl font-semibold text-[var(--foreground)]">
                  {channels.filter((c) => c.enabled).length}
                </p>
                <p className="mb-0.5 text-right text-[10px] font-medium text-purple-600 dark:text-purple-400">
                  {channels.length > 0 ? `${channels.length} delivery endpoints` : 'None linked'}
                </p>
              </div>
            </div>

            {/* Coverage Card */}
            <div className="metric-card surface-regular status-tone-info p-4">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--sky)' }}>
                  <Server className="h-4 w-4" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  TARGETS
                </span>
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[.16em] text-[var(--color-muted)]">
                Fleet Coverage
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono text-3xl font-semibold text-[var(--foreground)]">
                  {servers.length + websites.length}
                </p>
                <p className="mb-0.5 text-right text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {servers.length} servers · {websites.length} sites
                </p>
              </div>
            </div>
          </section>

          {/* Main Tab Navigation Bar */}
          <div className="border-b border-[var(--border-color)]">
            <nav role="tablist" aria-label="Alert Sections" className="flex flex-wrap gap-2 sm:gap-6">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'rules'}
                onClick={() => { setActiveTab('rules'); setErrorMessage(''); setSuccessMessage(''); }}
                className={`relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all ${
                  activeTab === 'rules'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Bell className="h-4 w-4" />
                <span>Alert Rules</span>
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                  {rules.length}
                </span>
                {activeTab === 'rules' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => { setActiveTab('create'); setErrorMessage(''); setSuccessMessage(''); }}
                className="relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all text-[var(--color-muted)] hover:text-[var(--foreground)]"
              >
                <Plus className="h-4 w-4" />
                <span>Create Alert Rule</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'channels'}
                onClick={() => { setActiveTab('channels'); setErrorMessage(''); setSuccessMessage(''); }}
                className={`relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all ${
                  activeTab === 'channels'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Radio className="h-4 w-4" />
                <span>Notification Channels</span>
                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-bold text-[var(--color-muted)]">
                  {channels.length}
                </span>
                {activeTab === 'channels' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'incidents'}
                onClick={() => { setActiveTab('incidents'); setErrorMessage(''); setSuccessMessage(''); }}
                className={`relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all ${
                  activeTab === 'incidents'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Flame className="h-4 w-4" />
                <span>Incident Stream</span>
                {unreadIncidentsCount > 0 && (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    {unreadIncidentsCount} new
                  </span>
                )}
                {activeTab === 'incidents' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
                )}
              </button>
            </nav>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-[var(--color-muted)]">
          <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-500" /> Loading alert configuration…
        </div>
      ) : activeTab === 'rules' ? (
        /* ========================================================================= */
        /* TAB 1: ALERT RULES LIST */
        /* ========================================================================= */
        <div className="space-y-4">
          {/* Controls Bar: Search, Category Quick Filter, Status Filter */}
          <div className="ops-panel surface-regular no-hover-lift p-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)] z-10" />
              <input
                type="text"
                value={ruleSearchQuery}
                onChange={(e) => setRuleSearchQuery(e.target.value)}
                placeholder="Search alert rules by name, target, or server..."
                style={{ paddingLeft: '40px', paddingRight: '32px' }}
                className="h-9 w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
              {ruleSearchQuery && (
                <button
                  type="button"
                  onClick={() => setRuleSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 z-10"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category and Status Filter Group */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Category Select */}
              <select
                value={ruleCategoryFilter}
                onChange={(e) => setRuleCategoryFilter(e.target.value as 'all' | AlertCategory)}
                className="h-8 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
              >
                <option value="all">All Categories</option>
                <option value="status">Server Offline</option>
                <option value="metric">Resource Thresholds</option>
                <option value="network">Network Quality</option>
                <option value="container">Docker Container</option>
                <option value="service">Systemd Service</option>
                <option value="website">Website & SSL</option>
              </select>

              {/* Status Select */}
              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="h-8 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
              >
                <option value="all">All Statuses ({rules.length})</option>
                <option value="active">Active ({rules.filter((r) => r.enabled).length})</option>
                <option value="disabled">Disabled ({rules.filter((r) => !r.enabled).length})</option>
              </select>
            </div>
          </div>

          {/* Rules List Cards */}
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const isOffline = rule.metric === 'status';
              const isDocker = rule.metric === 'container';
              const isService = rule.metric === 'service';
              const isWebsite = rule.metric === 'website';
              const isSSL = rule.metric === 'ssl';
              const isNetwork = rule.metric === 'network_latency' || rule.metric === 'network_loss';

              return (
                <div
                  key={rule.id}
                  className={`ops-panel surface-regular p-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between transition-all ${
                    rule.enabled ? '' : 'opacity-70 bg-opacity-40'
                  }`}
                >
                  {/* Left: Category Icon & Metadata */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Themed Icon Badge */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        isOffline
                          ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30'
                          : isDocker
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                            : isService
                              ? 'bg-purple-500/10 text-purple-500 border-purple-500/30'
                              : isWebsite || isSSL
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                : isNetwork
                                  ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30'
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                      }`}
                    >
                      {isOffline && <Server className="h-5 w-5" />}
                      {isDocker && <Box className="h-5 w-5" />}
                      {isService && <Layers className="h-5 w-5" />}
                      {(isWebsite || isSSL) && <Globe2 className="h-5 w-5" />}
                      {isNetwork && <Wifi className="h-5 w-5" />}
                      {!isOffline && !isDocker && !isService && !isWebsite && !isSSL && !isNetwork && <Activity className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-[var(--foreground)] truncate text-sm sm:text-base">{rule.name}</h4>
                        {isNetwork && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <Wifi className="w-2.5 h-2.5" />
                            {rule.target_name ? `Target: ${rule.target_name}` : 'All Targets'}
                          </span>
                        )}
                        {rule.server_name ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-subtle)] text-[var(--color-muted)] border border-[var(--border-color)]">
                            <Server className="w-2.5 h-2.5" />
                            {rule.server_name}
                          </span>
                        ) : rule.metric !== 'website' && rule.metric !== 'ssl' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Server className="w-2.5 h-2.5" />
                            All servers
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-muted)] flex-wrap">
                        <span>
                          Condition: <strong className="text-[var(--foreground)] font-mono">{rule.metric} {rule.operator} {rule.threshold}{rule.metric === 'network_latency' ? 'ms' : '%'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Duration: <strong className="text-[var(--foreground)] font-mono">{rule.duration_minutes}m</strong>
                        </span>
                        {rule.channels && rule.channels.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-[11px]">
                              {rule.channels.length} channel{rule.channels.length > 1 ? 's' : ''} ({rule.channels.map(c => c.name).join(', ')})
                            </span>
                          </>
                        )}
                        {isNetwork && (
                          <>
                            <span>•</span>
                            <Link href="/dashboard/network" className="text-blue-400 hover:underline inline-flex items-center gap-0.5 text-[11px]">
                              Network Targets ↗
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions: Edit, Test, Switch, Delete */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {/* EDIT RULE BUTTON */}
                    <button
                      type="button"
                      disabled={isViewer}
                      onClick={() => openEditModal(rule)}
                      title={isViewer ? 'Editing rules requires Operator or Admin role' : 'Edit alert rule'}
                      className="ops-button secondary flex items-center gap-1.5 px-2.5 py-1 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-500" />
                      <span>Edit</span>
                    </button>

                    {/* TEST SIMULATION BUTTON */}
                    <button
                      type="button"
                      disabled={testingRuleId === rule.id || !rule.channels || rule.channels.length === 0}
                      onClick={() => void testAlertRule(rule.id, rule.name)}
                      title="Send a simulated test alert for this rule to linked notification channels"
                      className="ops-button secondary flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-500 hover:text-blue-400"
                    >
                      {testingRuleId === rule.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>Test</span>
                    </button>

                    {/* SWITCH TOGGLE */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => toggleRule(rule.id, rule.enabled)}
                      title={rule.enabled ? 'Click to disable alert rule' : 'Click to enable alert rule'}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        rule.enabled ? 'bg-emerald-600' : 'bg-slate-400 dark:bg-slate-700'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          rule.enabled ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>

                    {/* DELETE */}
                    <button
                      type="button"
                      aria-label={`Delete rule ${rule.name}`}
                      onClick={() => setDeleteRuleTarget(rule)}
                      className="p-1.5 text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 rounded-lg transition"
                      title="Delete rule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredRules.length === 0 && (
              <div className="ops-panel surface-regular p-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
                <h3 className="mt-3 font-semibold text-[var(--foreground)]">No alert rules found</h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Try adjusting your search or filters, or create a new automated alert rule.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="mt-4 ops-button primary inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" /> + Create Alert Rule
                </button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'create' ? (
        /* ========================================================================= */
        /* TAB 2: CREATE ALERT RULE STUDIO (OPTION A3 - SINGLE BLOCK UX)            */
        /* ========================================================================= */
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-blue-500 hover:underline font-medium cursor-pointer"
            >
              Alerts
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-blue-500 hover:underline font-medium cursor-pointer"
            >
              Rules
            </button>
            <span>/</span>
            <span className="text-[var(--foreground)] font-medium">New</span>
          </div>

          {/* Header Title with Subtitle Tag */}
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              Create alert rule
            </h2>
            <span className="font-mono text-xs text-[var(--color-muted)] font-normal hidden sm:inline">
              option A3 · single block
            </span>
          </div>

          {/* Category Navigation (Underline Tab Bar) */}
          <div className="border-b border-[var(--border-color)] flex items-center gap-6 overflow-x-auto no-scrollbar">
            {[
              { id: 'status', label: 'Server offline' },
              { id: 'metric', label: 'Resource usage' },
              { id: 'network', label: 'Network quality' },
              { id: 'container', label: 'Docker container' },
              { id: 'service', label: 'Systemd service' },
              { id: 'website', label: 'Website & SSL' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id as AlertCategory)}
                  className={`pb-2.5 text-sm font-semibold whitespace-nowrap transition cursor-pointer select-none border-b-2 -mb-px ${
                    isSelected
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400 font-bold'
                      : 'border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)] font-medium'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Unified Single Block Card */}
          <form onSubmit={createRule} className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-xs divide-y divide-[var(--border-color)] overflow-hidden">
            {/* 1. CONDITION SECTION */}
            {selectedCategory === 'status' && (
              <div className="p-6 space-y-3">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · HEARTBEAT MISSING FOR
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { val: '1', label: '1m' },
                    { val: '2', label: '2m' },
                    { val: '5', label: '5m' },
                    { val: '10', label: '10m' },
                    { val: '15', label: '15m' },
                  ].map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => {
                        setShowCustomDuration(false);
                        setRuleDuration(opt.val);
                      }}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        !showCustomDuration && ruleDuration === opt.val
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomDuration(true)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      showCustomDuration || !['1', '2', '5', '10', '15'].includes(ruleDuration)
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    custom
                  </button>
                  {(showCustomDuration || !['1', '2', '5', '10', '15'].includes(ruleDuration)) && (
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={ruleDuration}
                        onChange={(e) => setRuleDuration(e.target.value)}
                        className="w-20 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="min"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">min</span>
                    </div>
                  )}
                </div>
                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  interval 10s → fires after {Number(ruleDuration || 1) * 6} missed heartbeats
                </div>
              </div>
            )}

            {selectedCategory === 'metric' && (
              <div className="p-6 space-y-4">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · RESOURCE USAGE THRESHOLD
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">Resource Metric</label>
                    <CustomSelect
                      value={ruleMetric}
                      onChange={(val) => {
                        setRuleMetric(val);
                        setRuleName(`High ${val.toUpperCase()} Alert (> ${ruleThreshold}%)`);
                      }}
                      options={[
                        { value: 'cpu', label: 'CPU Usage (%)' },
                        { value: 'ram', label: 'RAM Memory (%)' },
                        { value: 'disk', label: 'Disk Storage (%)' },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">Condition</label>
                    <CustomSelect
                      value={ruleOperator}
                      onChange={setRuleOperator}
                      options={[
                        { value: '>', label: 'Greater than (>)' },
                        { value: '<', label: 'Less than (<)' },
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Threshold: <span className="font-mono text-amber-500 font-bold">{ruleThreshold}%</span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['70', '80', '85', '90', '95'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setRuleThreshold(p);
                          setRuleName(`High ${ruleMetric.toUpperCase()} Alert (> ${p}%)`);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                          ruleThreshold === p
                            ? 'bg-amber-500 text-white shadow-xs'
                            : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={ruleThreshold}
                        onChange={(e) => {
                          setRuleThreshold(e.target.value);
                          setRuleName(`High ${ruleMetric.toUpperCase()} Alert (> ${e.target.value}%)`);
                        }}
                        className="w-20 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Custom %"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Continuous Duration Before Firing
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['1', '2', '5', '10', '15'].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setRuleDuration(min)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                          ruleDuration === min
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  evaluates every 10s → fires when {ruleMetric.toUpperCase()} {ruleOperator} {ruleThreshold}% continuously for {ruleDuration}m
                </div>
              </div>
            )}

            {selectedCategory === 'network' && (
              <div className="p-6 space-y-4">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · NETWORK QUALITY PROBES
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">Network Metric</label>
                    <CustomSelect
                      value={ruleMetric}
                      onChange={(val) => {
                        setRuleMetric(val);
                        if (val === 'network_latency') {
                          setRuleThreshold('100');
                          setRuleName(ruleTargetName ? `Network Latency: ${ruleTargetName} (> 100ms)` : 'High Network Latency (> 100ms)');
                        } else {
                          setRuleThreshold('10');
                          setRuleName(ruleTargetName ? `Packet Loss: ${ruleTargetName} (> 10%)` : 'High Packet Loss (> 10%)');
                        }
                      }}
                      options={[
                        { value: 'network_latency', label: 'Round-Trip Latency (ms)', subLabel: 'Socket / Ping response time' },
                        { value: 'network_loss', label: 'Packet Loss (%)', subLabel: 'ICMP probe drop percentage' },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">Condition</label>
                    <CustomSelect
                      value={ruleOperator}
                      onChange={setRuleOperator}
                      options={[
                        { value: '>', label: 'Greater than (>)' },
                        { value: '<', label: 'Less than (<)' },
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Monitored Target or Tag Group
                    </label>
                    <Link href="/dashboard/network" className="text-[11px] text-blue-500 hover:underline">
                      Manage Targets ↗
                    </Link>
                  </div>
                  <CustomSelect
                    value={
                      ruleTargetName === ''
                        ? '__ALL__'
                        : discoveredNetworkTags.includes(ruleTargetName)
                        ? `tag:${ruleTargetName}`
                        : relevantNetworkTargets.some((t) => t.name === ruleTargetName)
                        ? `target:${ruleTargetName}`
                        : '__CUSTOM__'
                    }
                    onChange={(val) => {
                      if (val === '__ALL__') {
                        setRuleTargetName('');
                        const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                        const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                        setRuleName(`Network ${mName} Alert (${ruleOperator} ${ruleThreshold}${unit})`);
                      } else if (val.startsWith('tag:')) {
                        const tag = val.replace('tag:', '');
                        setRuleTargetName(tag);
                        const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                        const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                        setRuleName(`Network ${mName}: Tag [${tag}] (${ruleOperator} ${ruleThreshold}${unit})`);
                      } else if (val.startsWith('target:')) {
                        const targetName = val.replace('target:', '');
                        setRuleTargetName(targetName);
                        const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                        const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                        setRuleName(`Network ${mName}: ${targetName} (${ruleOperator} ${ruleThreshold}${unit})`);
                      }
                    }}
                    options={[
                      {
                        value: '__ALL__',
                        label: `All Network Targets (${relevantNetworkTargets.length} active)`,
                        subLabel: 'Universal — monitors all probe targets across the fleet',
                      },
                      ...discoveredNetworkTags.map((tag) => ({
                        value: `tag:${tag}`,
                        label: `Tag Group: ${tag}`,
                        subLabel: `${relevantNetworkTargets.filter((t) => t.tag === tag).length} targets`,
                      })),
                      ...relevantNetworkTargets.map((t) => ({
                        value: `target:${t.name}`,
                        label: `Target: ${t.name} (${t.host})`,
                        subLabel: `${t.probe_method} • Tag: ${t.tag}`,
                      })),
                    ]}
                    className="w-full"
                  />
                  {matchedNetworkTargets.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[11px] text-[var(--color-muted)] font-mono">Applies to:</span>
                      {matchedNetworkTargets.slice(0, 5).map((t) => (
                        <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-subtle)] border border-[var(--border-color)] text-[var(--foreground)]">
                          {t.name}
                        </span>
                      ))}
                      {matchedNetworkTargets.length > 5 && (
                        <span className="text-[10px] text-[var(--color-muted)] font-mono">+{matchedNetworkTargets.length - 5} more</span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Threshold: <span className="font-mono text-indigo-400 font-bold">{ruleThreshold}{ruleMetric === 'network_latency' ? 'ms' : '%'}</span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(ruleMetric === 'network_latency' ? ['30', '50', '100', '200', '500'] : ['5', '10', '20', '50']).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setRuleThreshold(p);
                          const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                          const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                          setRuleName(ruleTargetName ? `Network ${mName}: ${ruleTargetName} (${ruleOperator} ${p}${unit})` : `Network ${mName} Alert (${ruleOperator} ${p}${unit})`);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                          ruleThreshold === p
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {p}{ruleMetric === 'network_latency' ? 'ms' : '%'}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min="0"
                        max={ruleMetric === 'network_latency' ? 60000 : 100}
                        value={ruleThreshold}
                        onChange={(e) => {
                          setRuleThreshold(e.target.value);
                          const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                          const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                          setRuleName(ruleTargetName ? `Network ${mName}: ${ruleTargetName} (${ruleOperator} ${e.target.value}${unit})` : `Network ${mName} Alert (${ruleOperator} ${e.target.value}${unit})`);
                        }}
                        className="w-20 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="Custom"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">{ruleMetric === 'network_latency' ? 'ms' : '%'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Continuous Duration
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['1', '2', '5', '10', '15'].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setRuleDuration(min)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition cursor-pointer ${
                          ruleDuration === min
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  probes every 10s → fires when {ruleMetric === 'network_latency' ? 'latency' : 'packet loss'} {ruleOperator} {ruleThreshold}{ruleMetric === 'network_latency' ? 'ms' : '%'} for {ruleDuration}m
                </div>
              </div>
            )}

            {selectedCategory === 'container' && (
              <div className="p-6 space-y-3">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · DOCKER CONTAINER STATE
                </div>
                <div>
                  <label htmlFor="container-name" className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Container Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="container-name"
                    required
                    value={ruleTargetName}
                    onChange={(e) => {
                      setRuleTargetName(e.target.value);
                      setRuleName(e.target.value ? `Docker: ${e.target.value}` : 'Docker Container Alert');
                    }}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-xs text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="e.g. nginx, postgres, redis, api-gateway"
                  />
                </div>
                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  triggers immediately when container status != running or healthcheck fails
                </div>
              </div>
            )}

            {selectedCategory === 'service' && (
              <div className="p-6 space-y-3">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · SYSTEMD SERVICE STATE
                </div>
                <div>
                  <label htmlFor="service-name" className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Systemd Service Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="service-name"
                    required
                    value={ruleTargetName}
                    onChange={(e) => {
                      setRuleTargetName(e.target.value);
                      setRuleName(e.target.value ? `Service: ${e.target.value}` : 'Systemd Service Alert');
                    }}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-xs text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 outline-none"
                    placeholder="e.g. nginx, mariadb, docker, sshd"
                  />
                </div>
                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  triggers immediately when unit status != active or enters failed state
                </div>
              </div>
            )}

            {selectedCategory === 'website' && (
              <div className="p-6 space-y-3">
                <div className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  CONDITION · ENDPOINT HEALTH & SSL
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    {
                      metric: 'website',
                      threshold: '0',
                      label: 'Website DOWN',
                      defaultName: ruleTargetName ? `Website Down: ${ruleTargetName}` : 'Website Down Alert',
                    },
                    {
                      metric: 'ssl',
                      threshold: '14',
                      label: 'SSL Expiring (≤ 14 days)',
                      defaultName: ruleTargetName ? `SSL Expiration (<= 14d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 14 days)',
                    },
                    {
                      metric: 'ssl',
                      threshold: '30',
                      label: 'SSL Expiring (≤ 30 days)',
                      defaultName: ruleTargetName ? `SSL Expiration (<= 30d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 30 days)',
                    },
                  ].map((item) => {
                    const isSelected = ruleMetric === item.metric && (item.metric === 'website' || ruleThreshold === item.threshold);
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          setRuleMetric(item.metric);
                          setRuleThreshold(item.threshold);
                          setRuleName(item.defaultName);
                        }}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'border border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="font-mono text-xs text-[var(--color-muted)] pt-1">
                  monitors HTTP availability and SSL/TLS certificate lifetime
                </div>
              </div>
            )}

            {/* 2. SCOPE SECTION */}
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {selectedCategory === 'website'
                    ? `SCOPE · ${
                        selectedWebsiteIds.length === websites.length && websites.length > 0
                          ? 'ALL SITES'
                          : `${selectedWebsiteIds.length} OF ${websites.length} SITES`
                      } SELECTED`
                    : `SCOPE · ${
                        selectedServerIds.length === servers.length && servers.length > 0
                          ? 'ALL AGENTS'
                          : `${selectedServerIds.length} OF ${servers.length} AGENTS`
                      } SELECTED`}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {selectedCategory === 'website' ? (
                    websites.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllWebsites}
                        className="text-blue-500 hover:underline font-medium cursor-pointer"
                      >
                        {selectedWebsiteIds.length === websites.length ? 'deselect all' : 'select all'}
                      </button>
                    )
                  ) : (
                    servers.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllServers}
                        className="text-blue-500 hover:underline font-medium cursor-pointer"
                      >
                        {selectedServerIds.length === servers.length ? 'deselect all' : 'select all'}
                      </button>
                    )
                  )}
                </div>
              </div>

              {selectedCategory === 'website' ? (
                <>
                  {websites.length > 3 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none" />
                      <input
                        type="text"
                        value={websiteSearchQuery}
                        onChange={(e) => setWebsiteSearchQuery(e.target.value)}
                        placeholder="Search websites by name, URL..."
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] pl-9 pr-8 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                      />
                      {websiteSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setWebsiteSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {websites.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">No websites monitored yet.</p>
                    </div>
                  ) : filteredWebsites.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">No websites matching &quot;{websiteSearchQuery}&quot;</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl bg-[var(--surface-subtle)]/30">
                      {filteredWebsites.map((site) => {
                        const isSelected = selectedWebsiteIds.includes(site.id);
                        const isUp = site.status === 'up' || site.status === 'online';
                        return (
                          <div
                            key={site.id}
                            onClick={() => toggleWebsite(site.id)}
                            className={`flex items-center justify-between px-4 py-2.5 transition cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/5' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-color)] bg-[var(--background-card)]'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isUp ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--foreground)] truncate">
                                  {site.name}
                                </p>
                                <p className="text-[10px] text-[var(--color-muted)] font-mono truncate">
                                  {site.url}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono text-[var(--color-muted)] shrink-0 ml-3">
                              <span
                                className={`text-[11px] font-semibold ${
                                  isUp ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {site.status || 'unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {servers.length > 3 && (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none" />
                      <input
                        type="text"
                        value={scopeSearchQuery}
                        onChange={(e) => setScopeSearchQuery(e.target.value)}
                        placeholder="Search agents by name, IP, hostname..."
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] pl-9 pr-8 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                      />
                      {scopeSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setScopeSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {servers.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">No server agents connected.</p>
                    </div>
                  ) : filteredServers.length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">No agents matching &quot;{scopeSearchQuery}&quot;</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl bg-[var(--surface-subtle)]/30">
                      {filteredServers.map((server) => {
                        const isSelected = selectedServerIds.includes(server.id);
                        const isOnline = server.status === 'online';
                        return (
                          <div
                            key={server.id}
                            onClick={() => toggleServer(server.id)}
                            className={`flex items-center justify-between px-4 py-2.5 transition cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/5' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-color)] bg-[var(--background-card)]'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                                {server.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-4 text-xs font-mono text-[var(--color-muted)] shrink-0 ml-3">
                              {server.ip_address && (
                                <span className="hidden sm:inline text-[11px]">{server.ip_address}</span>
                              )}
                              <span
                                className={`text-[11px] font-semibold ${
                                  isOnline ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {server.status || 'unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 3. NOTIFY SECTION */}
            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  NOTIFY · {selectedChannelIds.length} SELECTED
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {enabledChannels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedChannelIds.length === enabledChannels.length) {
                          setSelectedChannelIds([]);
                        } else {
                          setSelectedChannelIds(enabledChannels.map((c) => c.id));
                        }
                      }}
                      className="text-blue-500 hover:underline font-medium cursor-pointer"
                    >
                      {selectedChannelIds.length === enabledChannels.length ? 'deselect all' : 'select all'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-blue-500 hover:underline font-medium cursor-pointer"
                  >
                    + new channel
                  </button>
                </div>
              </div>

              {enabledChannels.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-[var(--border-color)] text-center">
                  <p className="text-xs text-[var(--color-muted)]">No active notification channels configured.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="mt-1 text-xs text-blue-500 font-bold hover:underline cursor-pointer"
                  >
                    Configure Telegram / Discord / Email →
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl overflow-hidden bg-[var(--surface-subtle)]/30">
                  {enabledChannels.map((channel) => {
                    const isSelected = selectedChannelIds.includes(channel.id);
                    const driver =
                      channel.type === 'email'
                        ? 'smtp'
                        : channel.type === 'telegram'
                        ? 'bot api'
                        : channel.type === 'discord'
                        ? 'webhook'
                        : channel.type;

                    return (
                      <div
                        key={channel.id}
                        onClick={() => toggleChannel(channel.id)}
                        className={`flex items-center justify-between px-4 py-2.5 transition cursor-pointer select-none ${
                          isSelected ? 'bg-blue-500/5' : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-[var(--border-color)] bg-[var(--background-card)]'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                            {channel.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-6">
                          <span className="text-xs font-mono text-[var(--color-muted)]">
                            {driver}
                          </span>
                          <span className="text-xs font-mono text-emerald-500 font-medium">
                            ok
                          </span>
                          <button
                            type="button"
                            disabled={testingChannelId === channel.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void testExistingChannel(channel.id, channel.name);
                            }}
                            className="text-xs font-mono text-blue-500 hover:underline cursor-pointer min-w-[28px] text-right"
                          >
                            {testingChannelId === channel.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : 'test'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. RULE NAME & REPEAT SECTION */}
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rule-name" className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Rule name
                  </label>
                  <input
                    id="rule-name"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-xs text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="e.g. Server Offline Alert"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    Repeat
                  </label>
                  <CustomSelect
                    value={ruleRepeatInterval}
                    onChange={setRuleRepeatInterval}
                    options={[
                      { value: '0', label: 'Once' },
                      { value: '15', label: 'Every 15m' },
                      { value: '30', label: 'Every 30m' },
                      { value: '60', label: 'Every 1h' },
                      { value: '120', label: 'Every 2h' },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* 5. CODE SUMMARY BAR */}
            <div className="bg-[#0b101b] dark:bg-[#070b12] text-slate-300 font-mono text-xs px-6 py-3.5 flex items-center gap-2 overflow-x-auto select-none no-scrollbar">
              <span className="text-cyan-400 font-bold mr-1">rule</span>
              <span className="text-white font-medium">{codeSummary.cond}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-300">{codeSummary.scope}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-300">{codeSummary.notify}</span>
              <span className="text-slate-500 mx-1">·</span>
              <span className="text-slate-400">{codeSummary.repeat}</span>
            </div>

            {/* 6. FOOTER ACTIONS & CHECKLIST */}
            {(() => {
              const isNameValid = ruleName.trim().length > 0;
              const isChannelValid = selectedChannelIds.length > 0;
              const isScopeValid =
                selectedCategory === 'website'
                  ? selectedWebsiteIds.length > 0
                  : selectedServerIds.length > 0;
              const isConditionValid =
                !(selectedCategory === 'container' || selectedCategory === 'service') ||
                ruleTargetName.trim().length > 0;
              const isFormValid = isNameValid && isChannelValid && isScopeValid && isConditionValid;

              return (
                <div className="px-6 py-4 bg-[var(--surface-subtle)]/40 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className={`inline-flex items-center gap-1 ${isConditionValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ condition
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isScopeValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ scope
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isNameValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ name
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isChannelValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ channel
                    </span>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rules')}
                      className="ops-button secondary px-4 py-2 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingRule || !isFormValid}
                      className="ops-button primary px-5 py-2 text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {savingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Create rule
                    </button>
                  </div>
                </div>
              );
            })()}
          </form>
        </div>
      ) : activeTab === 'channels' ? (
        /* ========================================================================= */
        /* TAB 3: NOTIFICATION CHANNELS */
        /* ========================================================================= */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Add Channel Form */}
          <div className="ops-panel surface-regular p-6 lg:col-span-5 space-y-5">
            <div>
              <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)] text-base">
                <Plus className="h-4 w-4 text-blue-500" /> Add Notification Channel
              </h3>
            </div>

            <form onSubmit={createChannel} autoComplete="off" className="space-y-4">
              {/* Channel Type Selector */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Type
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setChannelType('discord')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      channelType === 'discord'
                        ? 'border-[#5865F2] bg-[#5865F2]/10 text-white font-semibold shadow-xs ring-1 ring-[#5865F2]'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-[#5865F2]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <DiscordIcon className={`h-5 w-5 ${channelType === 'discord' ? 'text-[#5865F2]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Discord</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelType('telegram')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      channelType === 'telegram'
                        ? 'border-[#0088cc] bg-[#0088cc]/10 text-white font-semibold shadow-xs ring-1 ring-[#0088cc]'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-[#0088cc]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <TelegramIcon className={`h-5 w-5 ${channelType === 'telegram' ? 'text-[#0088cc]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Telegram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelType('email')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      channelType === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white font-semibold shadow-xs ring-1 ring-emerald-500'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-emerald-500/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Mail className={`h-5 w-5 ${channelType === 'email' ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Email</span>
                  </button>
                </div>
              </div>

              {/* Channel Display Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Display Name
                </label>
                <input
                  required
                  name="datrix_channel_name"
                  autoComplete="off"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                  placeholder={
                    channelType === 'discord'
                      ? 'e.g. Discord Ops Alerts'
                      : channelType === 'telegram'
                      ? 'e.g. Telegram Incident Bot'
                      : 'e.g. SRE Email Group'
                  }
                />
              </div>

              {/* Dynamic Inputs based on Channel Type */}
              {channelType === 'telegram' ? (
                <>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Bot Token
                    </label>
                    <input
                      required
                      name="datrix_bot_token"
                      autoComplete="new-password"
                      value={channelToken}
                      onChange={(e) => setChannelToken(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u..."
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Chat ID
                    </label>
                    <input
                      required
                      name="datrix_chat_id"
                      autoComplete="off"
                      value={channelChatId}
                      onChange={(e) => setChannelChatId(e.target.value)}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                      placeholder="e.g. -1001234567890 or @channel_name"
                    />
                  </div>
                </>
              ) : channelType === 'discord' ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Discord Webhook URL
                  </label>
                  <input
                    required
                    name="datrix_webhook_url"
                    autoComplete="off"
                    value={channelWebhook}
                    onChange={(e) => setChannelWebhook(e.target.value)}
                    type="url"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        SMTP Host
                      </label>
                      <input
                        required
                        name="datrix_smtp_host"
                        autoComplete="off"
                        value={channelSMTPHost}
                        onChange={(e) => setChannelSMTPHost(e.target.value)}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Port
                      </label>
                      <input
                        required
                        name="datrix_smtp_port"
                        autoComplete="off"
                        value={channelSMTPPort}
                        onChange={(e) => setChannelSMTPPort(e.target.value)}
                        type="number"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">Username</label>
                      <input
                        name="datrix_smtp_user"
                        autoComplete="off"
                        value={channelSMTPUsername}
                        onChange={(e) => setChannelSMTPUsername(e.target.value)}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="user@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">Password</label>
                      <input
                        name="datrix_smtp_pass"
                        autoComplete="new-password"
                        value={channelSMTPPassword}
                        onChange={(e) => setChannelSMTPPassword(e.target.value)}
                        type="password"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="App password"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        From Email
                      </label>
                      <input
                        required
                        name="datrix_email_from"
                        autoComplete="off"
                        value={channelEmailFrom}
                        onChange={(e) => setChannelEmailFrom(e.target.value)}
                        type="email"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="alerts@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        To Email
                      </label>
                      <input
                        required
                        name="datrix_email_to"
                        autoComplete="off"
                        value={channelEmailTo}
                        onChange={(e) => setChannelEmailTo(e.target.value)}
                        type="email"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="ops@domain.com"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="create_channel_use_tls"
                      type="checkbox"
                      checked={channelUseTLS}
                      onChange={(e) => setChannelUseTLS(e.target.checked)}
                      className="rounded border-[var(--border-color)] bg-[var(--surface-subtle)] text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="create_channel_use_tls" className="text-xs text-[var(--foreground)] font-medium cursor-pointer">
                      Use SSL/TLS
                    </label>
                  </div>
                </>
              )}

              {/* Action Buttons: TEST + SAVE */}
              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={testNewChannel}
                  disabled={testingNewChannel || savingChannel}
                  className="ops-button secondary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs text-blue-500 cursor-pointer"
                >
                  {testingNewChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>Send Test</span>
                </button>

                <button
                  type="submit"
                  disabled={savingChannel || testingNewChannel}
                  className="ops-button primary flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs cursor-pointer shadow-sm"
                >
                  {savingChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>Save Channel</span>
                </button>
              </div>
            </form>
          </div>

          {/* Configured Channels Grid */}
          <div className="space-y-4 lg:col-span-7">
            <div>
              <h3 className="font-bold text-[var(--foreground)] text-base">Configured Channels ({channels.length})</h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {channels.map((channel) => {
                const isDiscord = channel.type === 'discord';
                const isTelegram = channel.type === 'telegram';
                const isEmail = channel.type === 'email';

                const cfg = (channel.config || {}) as Record<string, unknown>;
                let detailText = '';
                if (isDiscord) {
                  const url = typeof cfg.webhook_url === 'string' ? cfg.webhook_url : '';
                  if (url) {
                    const parts = url.split('/');
                    const id = parts[parts.length - 2] || '';
                    detailText = id ? `Webhook: .../${id}` : 'Discord Webhook';
                  } else {
                    detailText = 'Discord Webhook';
                  }
                } else if (isTelegram) {
                  const cid = typeof cfg.chat_id === 'string' ? cfg.chat_id : '';
                  detailText = cid ? `Chat ID: ${cid}` : 'Telegram Bot';
                } else if (isEmail) {
                  const to = typeof cfg.to === 'string' ? cfg.to : '';
                  detailText = to ? `To: ${to}` : (typeof cfg.smtp_host === 'string' ? `Host: ${cfg.smtp_host}` : 'SMTP Email');
                }

                return (
                  <div
                    key={channel.id}
                    className="ops-panel surface-regular p-4.5 flex flex-col justify-between border border-[var(--border-color)] hover:border-slate-700/60 transition-all rounded-2xl"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                              isDiscord
                                ? 'bg-[#5865F2]/10 text-[#5865F2] border-[#5865F2]/25'
                                : isTelegram
                                ? 'bg-[#0088cc]/10 text-[#0088cc] border-[#0088cc]/25'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                            }`}
                          >
                            {isDiscord && <DiscordIcon className="h-4.5 w-4.5" />}
                            {isTelegram && <TelegramIcon className="h-4.5 w-4.5" />}
                            {isEmail && <Mail className="h-4.5 w-4.5" />}
                          </div>

                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm text-[var(--foreground)] truncate">{channel.name}</h4>
                            <span
                              className={`mt-0.5 inline-flex items-center rounded-md px-1.5 py-0.2 text-[9px] font-extrabold uppercase ${
                                isDiscord
                                  ? 'bg-[#5865F2]/15 text-[#5865F2]'
                                  : isTelegram
                                  ? 'bg-[#0088cc]/15 text-[#0088cc]'
                                  : 'bg-emerald-500/15 text-emerald-400'
                              }`}
                            >
                              {channel.type}
                            </span>
                          </div>
                        </div>

                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      </div>

                      <div className="mt-3.5 space-y-1 text-xs">
                        {detailText && (
                          <p className="font-mono text-[11px] text-[var(--color-muted)] truncate" title={detailText}>
                            {detailText}
                          </p>
                        )}
                        <p className="text-[11px] text-[var(--color-muted)]">
                          Linked to <strong className="text-[var(--foreground)]">{channel.usage_count || 0}</strong> alert rule{channel.usage_count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                      <button
                        type="button"
                        disabled={testingChannelId === channel.id}
                        onClick={() => void testExistingChannel(channel.id, channel.name)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-500 hover:text-blue-400 transition cursor-pointer"
                      >
                        {testingChannelId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Send Test
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isViewer}
                          onClick={() => openEditChannelModal(channel)}
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isViewer ? 'Editing channels requires Operator or Admin role' : 'Edit channel'}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={isViewer}
                          onClick={() => {
                            if (channel.usage_count && channel.usage_count > 0) {
                              setErrorMessage(`This channel is currently used by ${channel.usage_count} alert rule(s). Please unlink or delete those rules first.`);
                              return;
                            }
                            setDeleteChannelTarget(channel);
                          }}
                          className="p-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isViewer ? 'Deleting channels requires Operator or Admin role' : 'Delete channel'}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {channels.length === 0 && (
                <div className="col-span-1 sm:col-span-2 ops-panel surface-regular p-8 text-center flex flex-col items-center justify-center gap-2 text-xs text-[var(--color-muted)]">
                  <Radio className="h-8 w-8 opacity-40 mb-1" />
                  <p className="font-medium text-[var(--foreground)]">No notification channels configured yet.</p>
                  <p>Add Discord, Telegram, or Email on the left to receive instant alerts.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* TAB 4: INCIDENTS HISTORY */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">Incident & Recovery Timeline</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Historical timeline of FIRING and RESOLVED events with precise downtime durations.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter chips for Read / Unread */}
              <div className="flex items-center gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setIncidentFilter('all')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    incidentFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  All ({incidents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIncidentFilter('unread')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    incidentFilter === 'unread'
                      ? 'bg-blue-600 text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Unread ({unreadIncidentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIncidentFilter('read')}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    incidentFilter === 'read'
                      ? 'bg-blue-600 text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  Read ({Math.max(0, incidents.length - unreadIncidentsCount)})
                </button>
              </div>

              <button
                type="button"
                onClick={() => void fetchIncidents()}
                className="ops-button secondary flex items-center gap-1.5 h-8 text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>

              {unreadIncidentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllIncidentsRead()}
                  className="ops-button primary h-8 text-xs font-semibold"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          {loadingIncidents ? (
            <div className="flex min-h-48 items-center justify-center text-[var(--color-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" /> Loading incident timeline…
            </div>
          ) : (
            <div className="space-y-3">
              {incidents
                .filter((item) => {
                  if (incidentFilter === 'unread') return !item.read_at;
                  if (incidentFilter === 'read') return Boolean(item.read_at);
                  return true;
                })
                .map((item) => {
                  const isFiring = item.kind === 'alert_firing' || item.severity === 'critical' || item.kind === 'website_down';
                  const isResolved = item.kind === 'alert_resolved' || item.severity === 'resolved' || item.kind === 'website_up';
                  const isReminder = item.kind === 'alert_reminder';
                  const isTest = item.kind === 'test_alert';
                  const isUnread = !item.read_at;

                  const serverName = item.server_name || item.metadata?.server_name || 'Control Plane';
                  const ruleName = item.rule_name || item.metadata?.rule_name || (isTest ? 'Test Alert' : isFiring || isResolved ? 'Systemd Service Alert' : 'System Alert');
                  const failedAt = item.metadata?.failed_at || formatIncidentDate(item.created_at);
                  const recoveredAt = item.metadata?.recovered_at || (isResolved ? formatIncidentDate(item.created_at) : '');
                  const downtime = item.metadata?.downtime_duration || '1m';

                  return (
                    <div
                      key={item.id}
                      className="ops-panel surface-regular relative overflow-hidden transition-all border border-[var(--border-subtle)] hover:border-[var(--border-default)] p-5 shadow-xs hover:shadow-md"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Outline Icon */}
                          <div className="shrink-0">
                            {isFiring ? (
                              <AlertTriangle className="h-5 w-5 text-rose-500" />
                            ) : isResolved ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                            ) : isReminder ? (
                              <Clock className="h-5 w-5 text-amber-500" />
                            ) : (
                              <Send className="h-5 w-5 text-blue-500" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <h4 className="text-base font-bold text-[var(--foreground)] tracking-tight truncate">
                              {item.title}
                            </h4>
                            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                              {ruleName} · <strong className="text-[var(--foreground)]">{serverName}</strong>
                            </p>
                          </div>
                        </div>

                        {/* Status Pills */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => void markIncidentRead(item.id)}
                              className="text-[10px] font-semibold text-blue-500 hover:underline"
                            >
                              Mark read
                            </button>
                          )}
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                              isFiring
                                ? 'bg-rose-500/15 text-rose-500'
                                : isResolved
                                  ? 'bg-emerald-500/15 text-emerald-500'
                                  : isReminder
                                    ? 'bg-amber-500/15 text-amber-500'
                                    : 'bg-blue-500/15 text-blue-500'
                            }`}
                          >
                            {isFiring ? 'Firing' : isResolved ? 'Resolved' : isReminder ? 'Reminder' : 'Notification'}
                          </span>
                        </div>
                      </div>

                      {/* Incident Message */}
                      <p className="mt-3 text-xs text-[var(--color-muted)] leading-relaxed">
                        {item.message}
                      </p>

                      {/* Timestamps & Downtime Chip */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-color)] pt-3 text-[11px] text-[var(--color-muted)]">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>
                            Triggered: <strong className="text-[var(--foreground)]">{failedAt}</strong>
                          </span>
                          {recoveredAt && (
                            <span>
                              Recovered: <strong className="text-emerald-500">{recoveredAt}</strong>
                            </span>
                          )}
                        </div>

                        {isResolved && downtime && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--foreground)]">
                            <Clock className="h-3 w-3 text-emerald-500" /> Total Outage: {downtime}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {incidents.length === 0 && (
                <div className="ops-panel surface-regular p-12 text-center text-xs text-[var(--color-muted)]">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 font-semibold text-[var(--foreground)]">No incidents recorded</p>
                  <p className="mt-1">All monitored servers, containers, services, and websites are operating normally.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Alert Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-rule-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl"
          >
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 id="edit-rule-dialog-title" className="font-bold text-lg text-[var(--foreground)] flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-400" />
                Edit Alert Rule
              </h3>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                aria-label="Close dialog"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-muted)] hover:text-white hover:bg-white/5 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                  Rule Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                  placeholder="e.g. High CPU Usage Alert"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-[var(--foreground)]">
                  <span>Scope ({['website', 'ssl'].includes(editMetric) ? 'Target Website' : 'Target Server'})</span>
                  <span className="text-[11px] font-mono text-[var(--color-muted)] font-normal">
                    {['website', 'ssl'].includes(editMetric)
                      ? (editTargetName ? `Site: ${editTargetName}` : 'All websites')
                      : (!editServerId || editServerId === 'all'
                          ? 'All servers'
                          : (servers.find((s) => s.id === editServerId)?.name || 'Selected server'))}
                  </span>
                </label>

                {['website', 'ssl'].includes(editMetric) ? (
                  <div className="space-y-2">
                    {websites.length > 3 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none" />
                        <input
                          type="text"
                          value={editWebsiteSearchQuery}
                          onChange={(e) => setEditWebsiteSearchQuery(e.target.value)}
                          placeholder="Search websites by name, URL..."
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] pl-9 pr-8 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                        />
                        {editWebsiteSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setEditWebsiteSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}

                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl bg-[var(--surface-subtle)]/30">
                      {/* All websites option */}
                      <div
                        onClick={() => setEditTargetName('')}
                        className={`flex items-center justify-between px-3.5 py-2.5 transition cursor-pointer select-none ${
                          !editTargetName ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              !editTargetName
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-[var(--border-color)] bg-[var(--background-card)]'
                            }`}
                          >
                            {!editTargetName && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <span className="text-xs text-[var(--foreground)]">All websites (Entire Fleet)</span>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--color-muted)]">
                          {websites.length} sites
                        </span>
                      </div>

                      {/* Filtered websites */}
                      {filteredEditWebsites.map((site) => {
                        const isSelected = editTargetName === site.name;
                        const isUp = site.status === 'up' || site.status === 'online';
                        return (
                          <div
                            key={site.id}
                            onClick={() => setEditTargetName(site.name)}
                            className={`flex items-center justify-between px-3.5 py-2.5 transition cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-color)] bg-[var(--background-card)]'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isUp ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              <div className="min-w-0">
                                <p className="text-xs text-[var(--foreground)] truncate font-medium">{site.name}</p>
                                <p className="text-[10px] text-[var(--color-muted)] font-mono truncate">{site.url}</p>
                              </div>
                            </div>
                            <span className={`text-[11px] font-mono ${isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {site.status || 'unknown'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {servers.length > 3 && (
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-muted)] pointer-events-none" />
                        <input
                          type="text"
                          value={editServerSearchQuery}
                          onChange={(e) => setEditServerSearchQuery(e.target.value)}
                          placeholder="Search servers by name, IP, hostname..."
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] pl-9 pr-8 py-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                        />
                        {editServerSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setEditServerSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 rounded cursor-pointer"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}

                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-color)] border border-[var(--border-color)] rounded-xl bg-[var(--surface-subtle)]/30">
                      {/* All servers option */}
                      <div
                        onClick={() => setEditServerId('')}
                        className={`flex items-center justify-between px-3.5 py-2.5 transition cursor-pointer select-none ${
                          !editServerId || editServerId === 'all'
                            ? 'bg-blue-500/10 font-semibold'
                            : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              !editServerId || editServerId === 'all'
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-[var(--border-color)] bg-[var(--background-card)]'
                            }`}
                          >
                            {(!editServerId || editServerId === 'all') && (
                              <Check className="h-3 w-3 stroke-[3]" />
                            )}
                          </span>
                          <span className="text-xs text-[var(--foreground)]">All servers (Entire Agent Fleet)</span>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--color-muted)]">
                          {servers.length} agents
                        </span>
                      </div>

                      {/* Filtered individual servers */}
                      {filteredEditServers.map((server) => {
                        const isSelected = editServerId === server.id;
                        const isOnline = server.status === 'online';
                        return (
                          <div
                            key={server.id}
                            onClick={() => setEditServerId(server.id)}
                            className={`flex items-center justify-between px-3.5 py-2.5 transition cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-color)] bg-[var(--background-card)]'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <span
                                className={`h-2 w-2 rounded-full shrink-0 ${
                                  isOnline ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                              <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                                {server.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-xs font-mono text-[var(--color-muted)] shrink-0 ml-3">
                              {server.ip_address && (
                                <span className="hidden sm:inline text-[11px]">{server.ip_address}</span>
                              )}
                              <span
                                className={`text-[11px] font-semibold ${
                                  isOnline ? 'text-emerald-500' : 'text-rose-500'
                                }`}
                              >
                                {server.status || 'unknown'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Threshold & condition for metrics */}
              {['cpu', 'ram', 'disk'].includes(editMetric) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Operator
                    </label>
                    <CustomSelect
                      value={editOperator}
                      onChange={(val) => setEditOperator(val)}
                      options={[
                        { value: '>', label: '> (Greater than)' },
                        { value: '>=', label: '>= (Greater or equal)' },
                        { value: '<', label: '< (Less than)' },
                        { value: '<=', label: '<= (Less or equal)' },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Threshold (%)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={editThreshold}
                      onChange={(e) => setEditThreshold(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Threshold & condition for network metrics */}
              {['network_latency', 'network_loss'].includes(editMetric) && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Operator
                      </label>
                      <CustomSelect
                        value={editOperator}
                        onChange={(val) => setEditOperator(val)}
                        options={[
                          { value: '>', label: '> (Greater than)' },
                          { value: '<', label: '< (Less than)' },
                        ]}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Threshold ({editMetric === 'network_latency' ? 'ms' : '%'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={editMetric === 'network_latency' ? 60000 : 100}
                        required
                        value={editThreshold}
                        onChange={(e) => setEditThreshold(Number(e.target.value))}
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Target / Tag Filter (Optional)
                    </label>
                    <input
                      type="text"
                      list="edit-network-targets-list"
                      value={editTargetName}
                      onChange={(e) => setEditTargetName(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                      placeholder="Target name, tag, or host (leave blank for all targets)"
                    />
                    <datalist id="edit-network-targets-list">
                      {discoveredNetworkTags.map((tag) => (
                        <option key={tag} value={tag} label={`Tag Group: ${tag}`} />
                      ))}
                      {networkTargets.map((t) => (
                        <option key={t.id} value={t.name} label={`${t.name} (${t.host})`} />
                      ))}
                    </datalist>
                    {discoveredNetworkTags.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-[var(--color-muted)]">Quick tags:</span>
                        {discoveredNetworkTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setEditTargetName(tag)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--surface-subtle)] border border-[var(--border-color)] hover:border-blue-500 text-[var(--color-muted)] hover:text-[var(--foreground)] transition cursor-pointer"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Target Name for Container / Service */}
              {editMetric === 'container' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Docker Container Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editTargetName}
                    onChange={(e) => setEditTargetName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="e.g. nginx, redis, postgres"
                  />
                </div>
              )}

              {editMetric === 'service' && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Systemd Service Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editTargetName}
                    onChange={(e) => setEditTargetName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="e.g. apache2, nginx, docker"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    required
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Repeat Interval (Minutes)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={editRepeat}
                    onChange={(e) => setEditRepeat(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    placeholder="0 = Don't repeat"
                  />
                </div>
              </div>

              {/* Channel selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    Notification Channels · {editChannelIds.length} SELECTED
                  </label>
                  {channels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (editChannelIds.length === channels.length) {
                          setEditChannelIds([]);
                        } else {
                          setEditChannelIds(channels.map((c) => c.id));
                        }
                      }}
                      className="text-xs text-blue-500 hover:underline font-medium cursor-pointer"
                    >
                      {editChannelIds.length === channels.length ? 'deselect all' : 'select all'}
                    </button>
                  )}
                </div>
                {channels.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--color-muted)] text-center border border-[var(--border-color)] rounded-xl">
                    No notification channels configured.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-0.5">
                    {channels.map((ch) => {
                      const selected = editChannelIds.includes(ch.id);
                      return (
                        <div
                          key={ch.id}
                          onClick={() => toggleEditChannel(ch.id)}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                            selected
                              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                              : 'border-[var(--border-color)] bg-[var(--surface-subtle)] hover:border-blue-500/30'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              selected ? 'border-blue-500 bg-blue-600 text-white' : 'border-[var(--border-color)]'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[var(--foreground)] truncate">{ch.name}</p>
                            <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{ch.type}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--border-color)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="ops-button secondary px-4 py-2 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="ops-button primary px-4 py-2 text-xs flex items-center gap-2"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Notification Channel Modal */}
      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-channel-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] shadow-2xl"
          >
            <div className="p-5 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 id="edit-channel-dialog-title" className="font-bold text-lg text-[var(--foreground)] flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-400" />
                Edit Notification Channel
              </h3>
              <button
                type="button"
                onClick={() => setEditingChannel(null)}
                aria-label="Close dialog"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--color-muted)] hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditChannel} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Channel Type */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditChannelType('discord')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      editChannelType === 'discord'
                        ? 'border-[#5865F2] bg-[#5865F2]/10 text-white font-semibold shadow-xs ring-1 ring-[#5865F2]'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-[#5865F2]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <DiscordIcon className={`h-5 w-5 ${editChannelType === 'discord' ? 'text-[#5865F2]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Discord</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditChannelType('telegram')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      editChannelType === 'telegram'
                        ? 'border-[#0088cc] bg-[#0088cc]/10 text-white font-semibold shadow-xs ring-1 ring-[#0088cc]'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-[#0088cc]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <TelegramIcon className={`h-5 w-5 ${editChannelType === 'telegram' ? 'text-[#0088cc]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Telegram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditChannelType('email')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition cursor-pointer ${
                      editChannelType === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white font-semibold shadow-xs ring-1 ring-emerald-500'
                        : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:border-emerald-500/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Mail className={`h-5 w-5 ${editChannelType === 'email' ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Email</span>
                  </button>
                </div>
              </div>

              {/* Channel Display Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Display Name
                </label>
                <input
                  required
                  name="datrix_edit_channel_name"
                  autoComplete="off"
                  value={editChannelName}
                  onChange={(e) => setEditChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                  placeholder="e.g. Incident Telegram Bot"
                />
              </div>

              {/* Dynamic Inputs based on Channel Type */}
              {editChannelType === 'telegram' ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-[var(--foreground)]">
                        Bot Token
                      </label>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        Leave blank to keep existing
                      </span>
                    </div>
                    <input
                      name="datrix_edit_bot_token"
                      autoComplete="new-password"
                      value={editChannelToken}
                      onChange={(e) => setEditChannelToken(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                      placeholder="••••••••••••••••••••••••••••••••"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Chat ID
                    </label>
                    <input
                      required
                      name="datrix_edit_chat_id"
                      autoComplete="off"
                      value={editChannelChatId}
                      onChange={(e) => setEditChannelChatId(e.target.value)}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                      placeholder="e.g. -1001234567890 or @channel_name"
                    />
                  </div>
                </>
              ) : editChannelType === 'discord' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      Discord Webhook URL
                    </label>
                    <span className="text-[11px] text-[var(--color-muted)]">
                      Leave blank to keep existing
                    </span>
                  </div>
                  <input
                    name="datrix_edit_webhook_url"
                    autoComplete="off"
                    value={editChannelWebhook}
                    onChange={(e) => setEditChannelWebhook(e.target.value)}
                    type="url"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                    placeholder="https://discord.com/api/webhooks/... (leave blank to keep)"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        SMTP Host
                      </label>
                      <input
                        required
                        name="datrix_edit_smtp_host"
                        autoComplete="off"
                        value={editChannelSMTPHost}
                        onChange={(e) => setEditChannelSMTPHost(e.target.value)}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Port
                      </label>
                      <input
                        required
                        name="datrix_edit_smtp_port"
                        autoComplete="off"
                        value={editChannelSMTPPort}
                        onChange={(e) => setEditChannelSMTPPort(e.target.value)}
                        type="number"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">Username</label>
                      <input
                        name="datrix_edit_smtp_user"
                        autoComplete="off"
                        value={editChannelSMTPUsername}
                        onChange={(e) => setEditChannelSMTPUsername(e.target.value)}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="user@domain.com"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold text-[var(--foreground)]">Password</label>
                        <span className="text-[10px] text-[var(--color-muted)]">Leave blank to keep</span>
                      </div>
                      <input
                        name="datrix_edit_smtp_pass"
                        autoComplete="new-password"
                        value={editChannelSMTPPassword}
                        onChange={(e) => setEditChannelSMTPPassword(e.target.value)}
                        type="password"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        From Email
                      </label>
                      <input
                        required
                        name="datrix_edit_email_from"
                        autoComplete="off"
                        value={editChannelEmailFrom}
                        onChange={(e) => setEditChannelEmailFrom(e.target.value)}
                        type="email"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="alerts@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        To Email
                      </label>
                      <input
                        required
                        name="datrix_edit_email_to"
                        autoComplete="off"
                        value={editChannelEmailTo}
                        onChange={(e) => setEditChannelEmailTo(e.target.value)}
                        type="email"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                        placeholder="ops@domain.com"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      id="edit_channel_use_tls"
                      type="checkbox"
                      checked={editChannelUseTLS}
                      onChange={(e) => setEditChannelUseTLS(e.target.checked)}
                      className="rounded border-[var(--border-color)] bg-[var(--surface-subtle)] text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="edit_channel_use_tls" className="text-xs text-[var(--foreground)] font-medium cursor-pointer">
                      Use SSL/TLS
                    </label>
                  </div>
                </>
              )}

              {/* Action Buttons: TEST + CANCEL + SAVE */}
              <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void testEditChannel()}
                  disabled={testingEditChannel || savingEditChannel}
                  className="ops-button secondary px-3 py-2 text-xs flex items-center gap-1.5 text-blue-500 cursor-pointer disabled:opacity-40"
                >
                  {testingEditChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send Test</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    className="ops-button secondary px-4 py-2 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEditChannel || testingEditChannel}
                    className="ops-button primary px-4 py-2 text-xs flex items-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {savingEditChannel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Rule Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteRuleTarget)}
        title="Delete Alert Rule"
        message={`Are you sure you want to delete alert rule "${deleteRuleTarget?.name}"? You will no longer receive notifications for this rule.`}
        confirmText="Delete Rule"
        variant="danger"
        loading={deletingRule}
        onConfirm={() => void confirmDeleteRule()}
        onCancel={() => setDeleteRuleTarget(null)}
      />

      {/* Delete Channel Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteChannelTarget)}
        title="Delete Notification Channel"
        message={`Are you sure you want to delete notification channel "${deleteChannelTarget?.name}"? Any rules using it will no longer send notifications here.`}
        confirmText="Delete Channel"
        variant="danger"
        loading={deletingChannel}
        onConfirm={() => void confirmDeleteChannel()}
        onCancel={() => setDeleteChannelTarget(null)}
      />
    </div>
  );
}

export default function AlertsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-[var(--color-muted)]">Loading Alert Center...</div>}>
      <AlertsPageInner />
    </Suspense>
  );
}

