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
import { useLanguage } from '@/components/LanguageContext';

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
  const { t } = useLanguage();
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
    <div className="space-y-4">
      {/* Top Header */}
      {activeTab !== 'create' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--border-subtle)] pb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
              {t('Alert Center', 'Trung tâm Cảnh báo')}
            </h1>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Automated incident detection, fleet-wide alert policies, and multi-channel notifications.', 'Giám sát sự cố tự động, quy tắc cảnh báo toàn hạ tầng và kênh thông báo đa nền tảng.')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void refreshAllData()}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)] transition-colors duration-100"
              title={t('Refresh alert rules, channels and incident telemetry', 'Làm mới quy tắc, kênh thông báo và dữ liệu sự cố')}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-blue-500' : 'text-[var(--color-muted)]'}`} />
              <span>{t('Refresh', 'Làm mới')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setErrorMessage('');
                setSuccessMessage('');
              }}
              disabled={isViewer}
              title={isViewer ? t('Creating rules requires Operator or Admin role', 'Cần quyền Quản trị hoặc Vận hành để tạo quy tắc') : t('Create new alert rule', 'Tạo quy tắc cảnh báo mới')}
              className="inline-flex items-center gap-1.5 h-8 rounded bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors duration-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{t('+ Create Alert Rule', '+ Tạo quy tắc mới')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Global Alerts / Status Banner */}
      {(errorMessage || successMessage) && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-md border px-3.5 py-2.5 text-xs font-medium transition-all ${
            errorMessage
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {errorMessage ? (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            )}
            <span className="truncate">{errorMessage || successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMessage(''); setSuccessMessage(''); }}
            className="text-xs font-mono font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors shrink-0 ml-2"
          >
            {t('Dismiss', 'Đóng')}
          </button>
        </div>
      )}

      {/* Top 4 KPI Summary Metric Cards & Main Tab Navigation (Hidden when on Create Studio) */}
      {activeTab !== 'create' && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Active Rules Card */}
            <div className="metric-card surface-regular status-tone-healthy p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--mint)' }}>
                  <Bell className="h-4 w-4" />
                </div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  {t('POLICIES', 'QUY TẮC')}
                </span>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-[.14em] text-[var(--color-muted)] font-medium">
                {t('Active Rules', 'Quy tắc đang chạy')}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono tabular-nums text-2xl font-bold text-[var(--foreground)]">
                  {activeRulesCount}
                  <span className="text-sm font-normal text-[var(--color-muted)]">/{rules.length}</span>
                </p>
                <p className="mb-0.5 text-right font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                  {rules.length > 0 ? `${Math.round((activeRulesCount / rules.length) * 100)}% ` + t('active', 'hoạt động') : t('No rules', 'Chưa có')}
                </p>
              </div>
            </div>

            {/* Firing Incidents Card */}
            <div className={`metric-card surface-regular ${activeFiringCount > 0 ? 'status-tone-critical' : 'status-tone-healthy'} p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]`}>
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: activeFiringCount > 0 ? 'var(--rose)' : 'var(--mint)' }}>
                  <Flame className="h-4 w-4" />
                </div>
                <span className={`font-mono text-[10px] font-bold uppercase tracking-wider ${activeFiringCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {activeFiringCount > 0 ? t('FIRING', 'CẢNH BÁO') : t('HEALTHY', 'BÌNH THƯỜNG')}
                </span>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-[.14em] text-[var(--color-muted)] font-medium">
                {t('Open Incidents', 'Sự cố đang diễn ra')}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono tabular-nums text-2xl font-bold text-[var(--foreground)]">
                  {activeFiringCount}
                </p>
                <p className={`mb-0.5 text-right text-[10px] font-medium ${activeFiringCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {activeFiringCount > 0 ? `${activeFiringCount} ` + t('require action', 'cần xử lý') : t('All clear', 'An toàn')}
                </p>
              </div>
            </div>

            {/* Notification Channels Card */}
            <div className="metric-card surface-regular status-tone-info p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--violet)' }}>
                  <Radio className="h-4 w-4" />
                </div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {t('ROUTING', 'KÊNH GỬI')}
                </span>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-[.14em] text-[var(--color-muted)] font-medium">
                {t('Connected Channels', 'Kênh kết nối')}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono tabular-nums text-2xl font-bold text-[var(--foreground)]">
                  {channels.filter((c) => c.enabled).length}
                </p>
                <p className="mb-0.5 text-right text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {channels.length > 0 ? `${channels.length} ` + t('channels', 'kênh') : t('None linked', 'Chưa có')}
                </p>
              </div>
            </div>

            {/* Coverage Card */}
            <div className="metric-card surface-regular status-tone-info p-3.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)]">
              <div className="flex items-start justify-between">
                <div className="metric-icon" style={{ color: 'var(--sky)' }}>
                  <Server className="h-4 w-4" />
                </div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {t('TARGETS', 'MỤC TIÊU')}
                </span>
              </div>
              <p className="mt-3 text-[11px] uppercase tracking-[.14em] text-[var(--color-muted)] font-medium">
                {t('Fleet Coverage', 'Phạm vi giám sát')}
              </p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="font-mono tabular-nums text-2xl font-bold text-[var(--foreground)]">
                  {servers.length + websites.length}
                </p>
                <p className="mb-0.5 text-right font-mono text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  {servers.length} {t('servers', 'máy chủ')} · {websites.length} {t('sites', 'site')}
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
                className={`relative flex items-center gap-2 pb-3 text-xs font-semibold transition-colors duration-100 ${
                  activeTab === 'rules'
                    ? 'text-[var(--accent-primary)] font-bold'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>{t('Alert Rules', 'Quy tắc cảnh báo')}</span>
                <span className="font-mono rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                  {rules.length}
                </span>
                {activeTab === 'rules' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[var(--accent-primary)]" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={false}
                onClick={() => { setActiveTab('create'); setErrorMessage(''); setSuccessMessage(''); }}
                className="relative flex items-center gap-2 pb-3 text-xs font-semibold transition-colors duration-100 text-[var(--color-muted)] hover:text-[var(--foreground)]"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                <span>{t('Create Alert Rule', 'Tạo quy tắc mới')}</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'channels'}
                onClick={() => { setActiveTab('channels'); setErrorMessage(''); setSuccessMessage(''); }}
                className={`relative flex items-center gap-2 pb-3 text-xs font-semibold transition-colors duration-100 ${
                  activeTab === 'channels'
                    ? 'text-[var(--accent-primary)] font-bold'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Radio className="h-3.5 w-3.5" />
                <span>{t('Notification Channels', 'Kênh thông báo')}</span>
                <span className="font-mono rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-muted)]">
                  {channels.length}
                </span>
                {activeTab === 'channels' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[var(--accent-primary)]" />
                )}
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'incidents'}
                onClick={() => { setActiveTab('incidents'); setErrorMessage(''); setSuccessMessage(''); }}
                className={`relative flex items-center gap-2 pb-3 text-xs font-semibold transition-colors duration-100 ${
                  activeTab === 'incidents'
                    ? 'text-[var(--accent-primary)] font-bold'
                    : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                <span>{t('Incident Stream', 'Lịch sử sự cố')}</span>
                {unreadIncidentsCount > 0 && (
                  <span className="font-mono rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                    {unreadIncidentsCount} {t('new', 'mới')}
                  </span>
                )}
                {activeTab === 'incidents' && (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-[var(--accent-primary)]" />
                )}
              </button>
            </nav>
          </div>
        </>
      )}

      {loading ? (
        <div className="flex min-h-64 items-center justify-center text-xs text-[var(--color-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-[var(--accent-primary)]" /> {t('Loading alert configuration…', 'Đang tải cấu hình cảnh báo…')}
        </div>
      ) : activeTab === 'rules' ? (
        /* ========================================================================= */
        /* TAB 1: ALERT RULES LIST */
        /* ========================================================================= */
        <div className="space-y-3">
          {/* Controls Bar: Search, Category Quick Filter, Status Filter */}
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)] z-10" />
              <input
                type="text"
                value={ruleSearchQuery}
                onChange={(e) => setRuleSearchQuery(e.target.value)}
                placeholder={t('Search alert rules by name, target, or server...', 'Tìm quy tắc theo tên, đối tượng, máy chủ...')}
                style={{ paddingLeft: '34px', paddingRight: '28px' }}
                className="h-8 w-full rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {ruleSearchQuery && (
                <button
                  type="button"
                  onClick={() => setRuleSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)] p-0.5 z-10"
                  title={t('Clear search', 'Xóa tìm kiếm')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category and Status Filter Group */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Category Select */}
              <select
                value={ruleCategoryFilter}
                onChange={(e) => setRuleCategoryFilter(e.target.value as 'all' | AlertCategory)}
                className="h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
              >
                <option value="all">{t('All Categories', 'Tất cả danh mục')}</option>
                <option value="status">{t('Server Offline', 'Máy chủ mất kết nối')}</option>
                <option value="metric">{t('Resource Thresholds', 'Ngưỡng tài nguyên')}</option>
                <option value="network">{t('Network Quality', 'Chất lượng mạng')}</option>
                <option value="container">{t('Docker Container', 'Container Docker')}</option>
                <option value="service">{t('Systemd Service', 'Dịch vụ Systemd')}</option>
                <option value="website">{t('Website & SSL', 'Website & SSL')}</option>
              </select>

              {/* Status Select */}
              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-[var(--accent-primary)] focus:ring-1 focus:ring-blue-500 transition-colors cursor-pointer"
              >
                <option value="all">{t('All Statuses', 'Tất cả trạng thái')} ({rules.length})</option>
                <option value="active">{t('Active', 'Đang bật')} ({rules.filter((r) => r.enabled).length})</option>
                <option value="disabled">{t('Disabled', 'Đang tắt')} ({rules.filter((r) => !r.enabled).length})</option>
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
                  className={`rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-colors duration-100 hover:border-[var(--border-default)] ${
                    rule.enabled ? '' : 'opacity-60 bg-[var(--surface-2)]'
                  }`}
                >
                  {/* Left: Category Icon & Metadata */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Themed Icon Badge */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                        isOffline
                          ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
                          : isDocker
                            ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                            : isService
                              ? 'bg-purple-500/10 text-purple-500 border-purple-500/20'
                              : isWebsite || isSSL
                                ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                : isNetwork
                                  ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
                                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}
                    >
                      {isOffline && <Server className="h-4 w-4" />}
                      {isDocker && <Box className="h-4 w-4" />}
                      {isService && <Layers className="h-4 w-4" />}
                      {(isWebsite || isSSL) && <Globe2 className="h-4 w-4" />}
                      {isNetwork && <Wifi className="h-4 w-4" />}
                      {!isOffline && !isDocker && !isService && !isWebsite && !isSSL && !isNetwork && <Activity className="h-4 w-4" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-semibold text-[var(--foreground)] truncate text-xs sm:text-sm">{rule.name}</h4>
                        {isNetwork && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                            <Wifi className="w-2.5 h-2.5" />
                            {rule.target_name ? `${t('Target:', 'Mục tiêu:')} ${rule.target_name}` : t('All Targets', 'Tất cả mục tiêu')}
                          </span>
                        )}
                        {rule.server_name ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--surface-2)] text-[var(--color-muted)] border border-[var(--border-subtle)]">
                            <Server className="w-2.5 h-2.5" />
                            {rule.server_name}
                          </span>
                        ) : rule.metric !== 'website' && rule.metric !== 'ssl' ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Server className="w-2.5 h-2.5" />
                            {t('All servers', 'Tất cả máy chủ')}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-[var(--color-muted)] flex-wrap">
                        <span>
                          {t('Condition:', 'Điều kiện:')} <strong className="text-[var(--foreground)] font-mono">{rule.metric} {rule.operator} {rule.threshold}{rule.metric === 'network_latency' ? 'ms' : '%'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          {t('Duration:', 'Thời lượng:')} <strong className="text-[var(--foreground)] font-mono">{rule.duration_minutes}m</strong>
                        </span>
                        {rule.channels && rule.channels.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-[11px]">
                              {rule.channels.length} {t('channel(s)', 'kênh')} ({rule.channels.map(c => c.name).join(', ')})
                            </span>
                          </>
                        )}
                        {isNetwork && (
                          <>
                            <span>•</span>
                            <Link href="/dashboard/network" className="text-blue-400 hover:underline inline-flex items-center gap-0.5 text-[11px]">
                              {t('Network Targets ↗', 'Mục tiêu mạng ↗')}
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
                      title={isViewer ? t('Editing rules requires Operator or Admin role', 'Chỉnh sửa quy tắc yêu cầu quyền Quản trị hoặc Vận hành') : t('Edit alert rule', 'Chỉnh sửa quy tắc')}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)] transition-colors"
                    >
                      <Pencil className="h-3 w-3 text-blue-400" />
                      <span>{t('Edit', 'Sửa')}</span>
                    </button>

                    {/* TEST SIMULATION BUTTON */}
                    <button
                      type="button"
                      disabled={testingRuleId === rule.id || !rule.channels || rule.channels.length === 0}
                      onClick={() => void testAlertRule(rule.id, rule.name)}
                      title={t('Send a simulated test alert for this rule to linked notification channels', 'Gửi thông báo giả lập kiểm tra quy tắc này đến các kênh đã liên kết')}
                      className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-medium text-blue-400 hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {testingRuleId === rule.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      <span>{t('Test', 'Thử')}</span>
                    </button>

                    {/* SWITCH TOGGLE */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => toggleRule(rule.id, rule.enabled)}
                      title={rule.enabled ? t('Click to disable alert rule', 'Bấm để tắt quy tắc') : t('Click to enable alert rule', 'Bấm để bật quy tắc')}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-100 ease-in-out focus:outline-none ${
                        rule.enabled ? 'bg-emerald-600' : 'bg-slate-600'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-100 ease-in-out ${
                          rule.enabled ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* DELETE */}
                    <button
                      type="button"
                      aria-label={`${t('Delete rule', 'Xóa quy tắc')} ${rule.name}`}
                      onClick={() => setDeleteRuleTarget(rule)}
                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                      title={t('Delete rule', 'Xóa quy tắc')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredRules.length === 0 && (
              <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-10 text-center">
                <Bell className="mx-auto h-7 w-7 text-[var(--color-muted)] opacity-50" />
                <h3 className="mt-3 font-semibold text-[var(--foreground)] text-xs">{t('No alert rules found', 'Không tìm thấy quy tắc cảnh báo nào')}</h3>
                <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                  {t('Try adjusting your search or filters, or create a new automated alert rule.', 'Hãy thử điều chỉnh bộ lọc tìm kiếm hoặc tạo một quy tắc cảnh báo mới.')}
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="mt-4 inline-flex items-center gap-1.5 rounded bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> {t('Create Alert Rule', 'Tạo quy tắc mới')}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'create' ? (
        /* ========================================================================= */
        /* TAB 2: CREATE ALERT RULE STUDIO (OPTION A3 - SINGLE BLOCK UX)            */
        /* ========================================================================= */
        <div className="max-w-4xl mx-auto space-y-5 pb-12">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-[var(--accent-primary)] hover:underline font-medium cursor-pointer"
            >
              {t('Alerts', 'Cảnh báo')}
            </button>
            <span>/</span>
            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-[var(--accent-primary)] hover:underline font-medium cursor-pointer"
            >
              {t('Rules', 'Quy tắc')}
            </button>
            <span>/</span>
            <span className="text-[var(--foreground)] font-medium">{t('New', 'Tạo mới')}</span>
          </div>

          {/* Header Title with Subtitle Tag */}
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">
              {t('Create alert rule', 'Tạo quy tắc cảnh báo')}
            </h2>
            <span className="font-mono text-xs text-[var(--color-muted)] font-normal hidden sm:inline">
              {t('policy builder · unified block', 'trình tạo quy tắc · khối chuẩn hóa')}
            </span>
          </div>

          {/* Category Navigation (Underline Tab Bar) */}
          <div className="border-b border-[var(--border-color)] flex items-center gap-4 sm:gap-6 overflow-x-auto no-scrollbar">
            {[
              { id: 'status', label: t('Server offline', 'Máy chủ mất kết nối') },
              { id: 'metric', label: t('Resource usage', 'Sử dụng tài nguyên') },
              { id: 'network', label: t('Network quality', 'Chất lượng mạng') },
              { id: 'container', label: t('Docker container', 'Container Docker') },
              { id: 'service', label: t('Systemd service', 'Dịch vụ Systemd') },
              { id: 'website', label: t('Website & SSL', 'Website & SSL') },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id as AlertCategory)}
                  className={`pb-2.5 text-xs font-semibold whitespace-nowrap transition-colors duration-100 cursor-pointer select-none border-b-2 -mb-px ${
                    isSelected
                      ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] font-bold'
                      : 'border-transparent text-[var(--color-muted)] hover:text-[var(--foreground)] font-medium'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Unified Single Block Card */}
          <form onSubmit={createRule} className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] divide-y divide-[var(--border-subtle)] overflow-hidden">
            {/* 1. CONDITION SECTION */}
            {selectedCategory === 'status' && (
              <div className="p-4 space-y-3">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · HEARTBEAT MISSING FOR', 'ĐIỀU KIỆN · MẤT KẾT NỐI HEARTBEAT TRONG')}
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
                      className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                        !showCustomDuration && ruleDuration === opt.val
                          ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                          : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowCustomDuration(true)}
                    className={`px-3 py-1.5 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                      showCustomDuration || !['1', '2', '5', '10', '15'].includes(ruleDuration)
                        ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                        : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                    }`}
                  >
                    {t('custom', 'tùy chỉnh')}
                  </button>
                  {(showCustomDuration || !['1', '2', '5', '10', '15'].includes(ruleDuration)) && (
                    <div className="flex items-center gap-1.5 ml-1">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={ruleDuration}
                        onChange={(e) => setRuleDuration(e.target.value)}
                        className="w-20 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)]"
                        placeholder="min"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">min</span>
                    </div>
                  )}
                </div>
                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('evaluates every 10s → fires after', 'chu kỳ kiểm tra 10s → cảnh báo sau')} {Number(ruleDuration || 1) * 6} {t('missed heartbeats', 'nhịp tim bị mất')}
                </div>
              </div>
            )}

            {selectedCategory === 'metric' && (
              <div className="p-4 space-y-3.5">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · RESOURCE USAGE THRESHOLD', 'ĐIỀU KIỆN · NGƯỠNG TIÊU THỤ TÀI NGUYÊN')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                      {t('Resource Metric', 'Chỉ số tài nguyên')}
                    </label>
                    <CustomSelect
                      value={ruleMetric}
                      onChange={(val) => {
                        setRuleMetric(val);
                        setRuleName(`High ${val.toUpperCase()} Alert (> ${ruleThreshold}%)`);
                      }}
                      options={[
                        { value: 'cpu', label: t('CPU Usage (%)', 'Sử dụng CPU (%)') },
                        { value: 'ram', label: t('RAM Memory (%)', 'Bộ nhớ RAM (%)') },
                        { value: 'disk', label: t('Disk Storage (%)', 'Ổ đĩa lưu trữ (%)') },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                      {t('Condition', 'Điều kiện so sánh')}
                    </label>
                    <CustomSelect
                      value={ruleOperator}
                      onChange={setRuleOperator}
                      options={[
                        { value: '>', label: t('Greater than (>)', 'Lớn hơn (>)') },
                        { value: '<', label: t('Less than (<)', 'Nhỏ hơn (<)') },
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    {t('Threshold:', 'Ngưỡng kích hoạt:')} <span className="font-mono text-amber-500 font-bold">{ruleThreshold}%</span>
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
                        className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                          ruleThreshold === p
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
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
                        className="w-20 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)]"
                        placeholder="%"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    {t('Continuous Duration Before Firing', 'Thời gian duy trì trước khi cảnh báo')}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['1', '2', '5', '10', '15'].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setRuleDuration(min)}
                        className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                          ruleDuration === min
                            ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('evaluates every 10s → fires when', 'đánh giá mỗi 10s → kích hoạt khi')} {ruleMetric.toUpperCase()} {ruleOperator} {ruleThreshold}% {t('continuously for', 'liên tục trong')} {ruleDuration}m
                </div>
              </div>
            )}

            {selectedCategory === 'network' && (
              <div className="p-4 space-y-3.5">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · NETWORK QUALITY PROBES', 'ĐIỀU KIỆN · CHẤT LƯỢNG KẾT NỐI MẠNG')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                      {t('Network Metric', 'Chỉ số mạng')}
                    </label>
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
                        { value: 'network_latency', label: t('Round-Trip Latency (ms)', 'Độ trễ RTT (ms)'), subLabel: t('Socket / Ping response time', 'Thời gian phản hồi Ping / Socket') },
                        { value: 'network_loss', label: t('Packet Loss (%)', 'Mất gói tin (%)'), subLabel: t('ICMP probe drop percentage', 'Tỷ lệ gói tin ICMP bị rớt') },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                      {t('Condition', 'Điều kiện')}
                    </label>
                    <CustomSelect
                      value={ruleOperator}
                      onChange={setRuleOperator}
                      options={[
                        { value: '>', label: t('Greater than (>)', 'Lớn hơn (>)') },
                        { value: '<', label: t('Less than (<)', 'Nhỏ hơn (<)') },
                      ]}
                      className="w-full"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      {t('Monitored Target or Tag Group', 'Mục tiêu mạng hoặc Nhóm thẻ')}
                    </label>
                    <Link href="/dashboard/network" className="text-[11px] text-blue-400 hover:underline">
                      {t('Manage Targets ↗', 'Quản lý targets ↗')}
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
                        label: `${t('All Network Targets', 'Tất cả mục tiêu mạng')} (${relevantNetworkTargets.length} ${t('active', 'hoạt động')})`,
                        subLabel: t('Universal — monitors all probe targets across the fleet', 'Toàn cục — đo đạc tất cả targets trong cụm'),
                      },
                      ...discoveredNetworkTags.map((tag) => ({
                        value: `tag:${tag}`,
                        label: `${t('Tag Group:', 'Nhóm thẻ:')} ${tag}`,
                        subLabel: `${relevantNetworkTargets.filter((t) => t.tag === tag).length} ${t('targets', 'mục tiêu')}`,
                      })),
                      ...relevantNetworkTargets.map((target) => ({
                        value: `target:${target.name}`,
                        label: `${t('Target:', 'Mục tiêu:')} ${target.name} (${target.host})`,
                        subLabel: `${target.probe_method} • Tag: ${target.tag}`,
                      })),
                    ]}
                    className="w-full"
                  />
                  {matchedNetworkTargets.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      <span className="text-[11px] text-[var(--color-muted)] font-mono">{t('Applies to:', 'Áp dụng cho:')}</span>
                      {matchedNetworkTargets.slice(0, 5).map((t) => (
                        <span key={t.id} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--foreground)]">
                          {t.name}
                        </span>
                      ))}
                      {matchedNetworkTargets.length > 5 && (
                        <span className="text-[10px] text-[var(--color-muted)] font-mono">+{matchedNetworkTargets.length - 5} {t('more', 'khác')}</span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    {t('Threshold:', 'Ngưỡng kích hoạt:')} <span className="font-mono text-indigo-400 font-bold">{ruleThreshold}{ruleMetric === 'network_latency' ? 'ms' : '%'}</span>
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
                        className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                          ruleThreshold === p
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
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
                        className="w-20 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-1 text-xs font-mono text-[var(--foreground)] outline-none focus:border-[var(--accent-primary)]"
                        placeholder="Custom"
                      />
                      <span className="text-xs text-[var(--color-muted)] font-mono">{ruleMetric === 'network_latency' ? 'ms' : '%'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1.5 block">
                    {t('Continuous Duration', 'Thời lượng duy trì')}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['1', '2', '5', '10', '15'].map((min) => (
                      <button
                        key={min}
                        type="button"
                        onClick={() => setRuleDuration(min)}
                        className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors duration-100 cursor-pointer ${
                          ruleDuration === min
                            ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('probes every 10s → fires when', 'đo đạc mỗi 10s → cảnh báo khi')} {ruleMetric === 'network_latency' ? t('latency', 'độ trễ') : t('packet loss', 'mất gói')} {ruleOperator} {ruleThreshold}{ruleMetric === 'network_latency' ? 'ms' : '%'} {t('for', 'trong')} {ruleDuration}m
                </div>
              </div>
            )}

            {selectedCategory === 'container' && (
              <div className="p-4 space-y-3">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · DOCKER CONTAINER STATE', 'ĐIỀU KIỆN · TRẠNG THÁI DOCKER CONTAINER')}
                </div>
                <div>
                  <label htmlFor="container-name" className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                    {t('Container Name', 'Tên Docker Container')} <span className="text-rose-400">*</span>
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
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder="e.g. nginx, postgres, redis, api-gateway"
                  />
                </div>
                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('triggers immediately when container status != running or healthcheck fails', 'kích hoạt ngay khi trạng thái container != running hoặc healthcheck báo lỗi')}
                </div>
              </div>
            )}

            {selectedCategory === 'service' && (
              <div className="p-4 space-y-3">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · SYSTEMD SERVICE STATE', 'ĐIỀU KIỆN · TRẠNG THÁI DỊCH VỤ SYSTEMD')}
                </div>
                <div>
                  <label htmlFor="service-name" className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                    {t('Systemd Service Name', 'Tên dịch vụ Systemd')} <span className="text-rose-400">*</span>
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
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-2 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder="e.g. nginx, mariadb, docker, sshd"
                  />
                </div>
                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('triggers immediately when unit status != active or enters failed state', 'kích hoạt ngay khi dịch vụ != active hoặc rơi vào trạng thái failed')}
                </div>
              </div>
            )}

            {selectedCategory === 'website' && (
              <div className="p-4 space-y-3">
                <div className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('CONDITION · ENDPOINT HEALTH & SSL', 'ĐIỀU KIỆN · TRẠNG THÁI WEBSITE & CHỨNG CHỈ SSL')}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    {
                      metric: 'website',
                      threshold: '0',
                      label: t('Website DOWN', 'Website MẤT KẾT NỐI'),
                      defaultName: ruleTargetName ? `Website Down: ${ruleTargetName}` : 'Website Down Alert',
                    },
                    {
                      metric: 'ssl',
                      threshold: '14',
                      label: t('SSL Expiring (≤ 14 days)', 'SSL Sắp hết hạn (≤ 14 ngày)'),
                      defaultName: ruleTargetName ? `SSL Expiration (<= 14d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 14 days)',
                    },
                    {
                      metric: 'ssl',
                      threshold: '30',
                      label: t('SSL Expiring (≤ 30 days)', 'SSL Sắp hết hạn (≤ 30 ngày)'),
                      defaultName: ruleTargetName ? `SSL Expiration (<= 30d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 30 days)',
                    },
                  ].map((item) => {
                    const isSelected = ruleMetric === item.metric && (item.metric === 'website' || ruleThreshold === item.threshold);
                    return (
                      <button
                        key={item.metric + item.threshold}
                        type="button"
                        onClick={() => {
                          setRuleMetric(item.metric);
                          setRuleThreshold(item.threshold);
                          setRuleName(item.defaultName);
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors duration-100 cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'border border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--surface-3)]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
                <div className="font-mono text-[11px] text-[var(--color-muted)] pt-0.5">
                  {t('monitors HTTP availability and SSL/TLS certificate lifetime', 'theo dõi khả dụng HTTP và hạn chứng chỉ bảo mật SSL/TLS')}
                </div>
              </div>
            )}

            {/* 2. SCOPE SECTION */}
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {selectedCategory === 'website'
                    ? `${t('SCOPE ·', 'PHẠM VI ·')} ${
                        selectedWebsiteIds.length === websites.length && websites.length > 0
                          ? t('ALL SITES', 'TẤT CẢ SITES')
                          : `${selectedWebsiteIds.length} ${t('OF', 'TRÊN')} ${websites.length} SITES`
                      } ${t('SELECTED', 'ĐÃ CHỌN')}`
                    : `${t('SCOPE ·', 'PHẠM VI ·')} ${
                        selectedServerIds.length === servers.length && servers.length > 0
                          ? t('ALL AGENTS', 'TẤT CẢ AGENT')
                          : `${selectedServerIds.length} ${t('OF', 'TRÊN')} ${servers.length} AGENTS`
                      } ${t('SELECTED', 'ĐÃ CHỌN')}`}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  {selectedCategory === 'website' ? (
                    websites.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllWebsites}
                        className="text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                      >
                        {selectedWebsiteIds.length === websites.length ? t('deselect all', 'bỏ chọn tất cả') : t('select all', 'chọn tất cả')}
                      </button>
                    )
                  ) : (
                    servers.length > 0 && (
                      <button
                        type="button"
                        onClick={toggleAllServers}
                        className="text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                      >
                        {selectedServerIds.length === servers.length ? t('deselect all', 'bỏ chọn tất cả') : t('select all', 'chọn tất cả')}
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
                        placeholder={t('Search websites by name, URL...', 'Tìm website theo tên, URL...')}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] pl-9 pr-8 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
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
                    <div className="p-4 rounded-md border border-dashed border-[var(--border-subtle)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">{t('No websites monitored yet.', 'Chưa có website nào được giám sát.')}</p>
                    </div>
                  ) : filteredWebsites.length === 0 ? (
                    <div className="p-4 rounded-md border border-dashed border-[var(--border-subtle)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">{t('No websites matching', 'Không tìm thấy website khớp')} &quot;{websiteSearchQuery}&quot;</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md bg-[var(--surface-2)]/30">
                      {filteredWebsites.map((site) => {
                        const isSelected = selectedWebsiteIds.includes(site.id);
                        const isUp = site.status === 'up' || site.status === 'online';
                        return (
                          <div
                            key={site.id}
                            onClick={() => toggleWebsite(site.id)}
                            className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
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
                        placeholder={t('Search agents by name, IP, hostname...', 'Tìm máy chủ theo tên, IP, hostname...')}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] pl-9 pr-8 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
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
                    <div className="p-4 rounded-md border border-dashed border-[var(--border-subtle)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">{t('No server agents connected.', 'Chưa có agent máy chủ nào kết nối.')}</p>
                    </div>
                  ) : filteredServers.length === 0 ? (
                    <div className="p-4 rounded-md border border-dashed border-[var(--border-subtle)] text-center">
                      <p className="text-xs text-[var(--color-muted)]">{t('No agents matching', 'Không tìm thấy agent khớp')} &quot;{scopeSearchQuery}&quot;</p>
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md bg-[var(--surface-2)]/30">
                      {filteredServers.map((server) => {
                        const isSelected = selectedServerIds.includes(server.id);
                        const isOnline = server.status === 'online';
                        return (
                          <div
                            key={server.id}
                            onClick={() => toggleServer(server.id)}
                            className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
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
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold tracking-wider uppercase text-[var(--color-muted)] font-mono">
                  {t('NOTIFY ·', 'KÊNH THÔNG BÁO ·')} {selectedChannelIds.length} {t('SELECTED', 'ĐÃ CHỌN')}
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
                      className="text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                    >
                      {selectedChannelIds.length === enabledChannels.length ? t('deselect all', 'bỏ chọn tất cả') : t('select all', 'chọn tất cả')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                  >
                    {t('+ new channel', '+ thêm kênh mới')}
                  </button>
                </div>
              </div>

              {enabledChannels.length === 0 ? (
                <div className="p-4 rounded-md border border-dashed border-[var(--border-subtle)] text-center">
                  <p className="text-xs text-[var(--color-muted)]">{t('No active notification channels configured.', 'Chưa cấu hình kênh thông báo nào.')}</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="mt-1 text-xs text-blue-400 font-bold hover:underline cursor-pointer"
                  >
                    {t('Configure Telegram / Discord / Email →', 'Cấu hình Telegram / Discord / Email →')}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md overflow-hidden bg-[var(--surface-2)]/30">
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
                        className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                          isSelected ? 'bg-blue-500/10' : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <span className="text-xs font-semibold text-[var(--foreground)] truncate">
                            {channel.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-4">
                          <span className="text-[11px] font-mono text-[var(--color-muted)]">
                            {driver}
                          </span>
                          <span className="text-[11px] font-mono text-emerald-500 font-medium">
                            ok
                          </span>
                          <button
                            type="button"
                            disabled={testingChannelId === channel.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              void testExistingChannel(channel.id, channel.name);
                            }}
                            className="text-[11px] font-mono text-blue-400 hover:underline cursor-pointer min-w-[28px] text-right"
                          >
                            {testingChannelId === channel.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : t('test', 'thử')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. RULE NAME & REPEAT SECTION */}
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="rule-name" className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                    {t('Rule Name', 'Tên quy tắc cảnh báo')}
                  </label>
                  <input
                    id="rule-name"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    type="text"
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder="e.g. Server Offline Alert"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--foreground)] mb-1 block">
                    {t('Repeat Interval', 'Tần suất lặp lại')}
                  </label>
                  <CustomSelect
                    value={ruleRepeatInterval}
                    onChange={setRuleRepeatInterval}
                    options={[
                      { value: '0', label: t('Once (No repeat)', 'Một lần (Không lặp lại)') },
                      { value: '15', label: t('Every 15m', 'Mỗi 15 phút') },
                      { value: '30', label: t('Every 30m', 'Mỗi 30 phút') },
                      { value: '60', label: t('Every 1h', 'Mỗi 1 giờ') },
                      { value: '120', label: t('Every 2h', 'Mỗi 2 giờ') },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* 5. CODE SUMMARY BAR */}
            <div className="bg-[#090d16] dark:bg-[#070b12] text-slate-300 font-mono text-[11px] px-4 py-2.5 flex items-center gap-2 overflow-x-auto select-none no-scrollbar border-t border-[var(--border-subtle)]">
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
                <div className="px-4 py-3 bg-[var(--surface-2)]/60 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className={`inline-flex items-center gap-1 ${isConditionValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ {t('condition', 'điều kiện')}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isScopeValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ {t('scope', 'phạm vi')}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isNameValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ {t('name', 'tên')}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isChannelValid ? 'text-emerald-500 font-medium' : 'text-[var(--color-muted)] opacity-60'}`}>
                      ✓ {t('channel', 'kênh')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setActiveTab('rules')}
                      className="inline-flex items-center h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                    >
                      {t('Cancel', 'Hủy')}
                    </button>
                    <button
                      type="submit"
                      disabled={savingRule || !isFormValid}
                      className="inline-flex items-center h-8 rounded bg-[var(--accent-primary)] px-4 text-xs font-bold text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {savingRule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      {t('Create Rule', 'Tạo quy tắc')}
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Add Channel Form */}
          <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 lg:col-span-5 space-y-4">
            <div className="border-b border-[var(--border-subtle)] pb-2.5">
              <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)] text-sm">
                <Plus className="h-4 w-4 text-[var(--accent-primary)]" />
                {t('Add Notification Channel', 'Thêm kênh thông báo mới')}
              </h3>
            </div>

            <form onSubmit={createChannel} autoComplete="off" className="space-y-3.5">
              {/* Channel Type Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                  {t('Channel Type', 'Loại kênh')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannelType('discord')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2.5 text-center transition-colors duration-100 cursor-pointer ${
                      channelType === 'discord'
                        ? 'border-[#5865F2] bg-[#5865F2]/10 text-white font-semibold ring-1 ring-[#5865F2]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-[#5865F2]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <DiscordIcon className={`h-4.5 w-4.5 ${channelType === 'discord' ? 'text-[#5865F2]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Discord</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelType('telegram')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2.5 text-center transition-colors duration-100 cursor-pointer ${
                      channelType === 'telegram'
                        ? 'border-[#0088cc] bg-[#0088cc]/10 text-white font-semibold ring-1 ring-[#0088cc]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-[#0088cc]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <TelegramIcon className={`h-4.5 w-4.5 ${channelType === 'telegram' ? 'text-[#0088cc]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Telegram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setChannelType('email')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2.5 text-center transition-colors duration-100 cursor-pointer ${
                      channelType === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white font-semibold ring-1 ring-emerald-500'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-emerald-500/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Mail className={`h-4.5 w-4.5 ${channelType === 'email' ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Email</span>
                  </button>
                </div>
              </div>

              {/* Channel Display Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  {t('Channel Display Name', 'Tên hiển thị kênh')}
                </label>
                <input
                  required
                  name="datrix_channel_name"
                  autoComplete="off"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
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
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Bot Token', 'Mã Bot Token')}
                    </label>
                    <input
                      required
                      name="datrix_bot_token"
                      autoComplete="new-password"
                      value={channelToken}
                      onChange={(e) => setChannelToken(e.target.value)}
                      type="password"
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u..."
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Chat ID', 'ID cuộc trò chuyện (Chat ID)')}
                    </label>
                    <input
                      required
                      name="datrix_chat_id"
                      autoComplete="off"
                      value={channelChatId}
                      onChange={(e) => setChannelChatId(e.target.value)}
                      type="text"
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                      placeholder="e.g. -1001234567890 or @channel_name"
                    />
                  </div>
                </>
              ) : channelType === 'discord' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    {t('Discord Webhook URL', 'Đường dẫn Webhook Discord')}
                  </label>
                  <input
                    required
                    name="datrix_webhook_url"
                    autoComplete="off"
                    value={channelWebhook}
                    onChange={(e) => setChannelWebhook(e.target.value)}
                    type="url"
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('SMTP Host', 'Máy chủ SMTP')}
                      </label>
                      <input
                        required
                        name="datrix_smtp_host"
                        autoComplete="off"
                        value={channelSMTPHost}
                        onChange={(e) => setChannelSMTPHost(e.target.value)}
                        type="text"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Port', 'Cổng')}
                      </label>
                      <input
                        required
                        name="datrix_smtp_port"
                        autoComplete="off"
                        value={channelSMTPPort}
                        onChange={(e) => setChannelSMTPPort(e.target.value)}
                        type="number"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Username', 'Tên đăng nhập')}
                      </label>
                      <input
                        name="datrix_smtp_user"
                        autoComplete="off"
                        value={channelSMTPUsername}
                        onChange={(e) => setChannelSMTPUsername(e.target.value)}
                        type="text"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="user@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Password', 'Mật khẩu')}
                      </label>
                      <input
                        name="datrix_smtp_pass"
                        autoComplete="new-password"
                        value={channelSMTPPassword}
                        onChange={(e) => setChannelSMTPPassword(e.target.value)}
                        type="password"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="App password"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('From Email', 'Email người gửi')}
                      </label>
                      <input
                        required
                        name="datrix_email_from"
                        autoComplete="off"
                        value={channelEmailFrom}
                        onChange={(e) => setChannelEmailFrom(e.target.value)}
                        type="email"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="alerts@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('To Email', 'Email người nhận')}
                      </label>
                      <input
                        required
                        name="datrix_email_to"
                        autoComplete="off"
                        value={channelEmailTo}
                        onChange={(e) => setChannelEmailTo(e.target.value)}
                        type="email"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="ops@domain.com"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <input
                      id="create_channel_use_tls"
                      type="checkbox"
                      checked={channelUseTLS}
                      onChange={(e) => setChannelUseTLS(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] bg-[var(--surface-2)] text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="create_channel_use_tls" className="text-xs text-[var(--foreground)] font-medium cursor-pointer">
                      {t('Use SSL/TLS', 'Bật SSL/TLS')}
                    </label>
                  </div>
                </>
              )}

              {/* Action Buttons: TEST + SAVE */}
              <div className="flex items-center gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={testNewChannel}
                  disabled={testingNewChannel || savingChannel}
                  className="inline-flex items-center justify-center gap-1.5 flex-1 h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 text-xs font-medium text-blue-400 hover:bg-[var(--surface-3)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {testingNewChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  <span>{t('Send Test', 'Gửi thử')}</span>
                </button>

                <button
                  type="submit"
                  disabled={savingChannel || testingNewChannel}
                  className="inline-flex items-center justify-center gap-1.5 flex-1 h-8 rounded bg-[var(--accent-primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {savingChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  <span>{t('Save Channel', 'Lưu kênh')}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Configured Channels Grid */}
          <div className="space-y-3 lg:col-span-7">
            <div>
              <h3 className="font-bold text-[var(--foreground)] text-sm">
                {t('Configured Channels', 'Kênh đã cấu hình')} ({channels.length})
              </h3>
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
                    className="p-3.5 flex flex-col justify-between border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:border-[var(--border-strong)] transition-colors duration-100 rounded-md"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
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

                        <span className="shrink-0 inline-flex items-center gap-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-mono font-bold text-emerald-400 uppercase">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {t('Active', 'Hoạt động')}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-xs">
                        {detailText && (
                          <p className="font-mono text-[11px] text-[var(--color-muted)] truncate" title={detailText}>
                            {detailText}
                          </p>
                        )}
                        <p className="text-[11px] text-[var(--color-muted)]">
                          {t('Linked to', 'Liên kết với')} <strong className="text-[var(--foreground)] font-mono">{channel.usage_count || 0}</strong> {t('alert rule(s)', 'quy tắc')}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
                      <button
                        type="button"
                        disabled={testingChannelId === channel.id}
                        onClick={() => void testExistingChannel(channel.id, channel.name)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:text-[var(--accent-hover)] transition-colors cursor-pointer"
                      >
                        {testingChannelId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        {t('Send Test', 'Gửi thử')}
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isViewer}
                          onClick={() => openEditChannelModal(channel)}
                          className="p-1 text-[var(--color-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--surface-hover)] rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isViewer ? t('Editing channels requires Operator or Admin role', 'Cần quyền Quản trị hoặc Vận hành') : t('Edit channel', 'Chỉnh sửa kênh')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isViewer}
                          onClick={() => {
                            if (channel.usage_count && channel.usage_count > 0) {
                              setErrorMessage(
                                t(
                                  `This channel is currently used by ${channel.usage_count} alert rule(s). Please unlink or delete those rules first.`,
                                  `Kênh này đang được dùng bởi ${channel.usage_count} quy tắc. Vui lòng hủy liên kết các quy tắc trước khi xóa.`
                                )
                              );
                              return;
                            }
                            setDeleteChannelTarget(channel);
                          }}
                          className="p-1 text-rose-500 hover:bg-rose-500/10 rounded transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          title={isViewer ? t('Deleting channels requires Operator or Admin role', 'Cần quyền Quản trị hoặc Vận hành') : t('Delete channel', 'Xóa kênh')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {channels.length === 0 && (
                <div className="col-span-1 sm:col-span-2 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-8 text-center flex flex-col items-center justify-center gap-1.5 text-xs text-[var(--color-muted)]">
                  <Radio className="h-7 w-7 opacity-40 mb-1" />
                  <p className="font-semibold text-[var(--foreground)]">{t('No notification channels configured yet.', 'Chưa có kênh thông báo nào.')}</p>
                  <p className="text-[11px]">{t('Add Discord, Telegram, or Email on the left to receive instant alerts.', 'Thêm Discord, Telegram, hoặc Email ở biểu mẫu bên trái.')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* TAB 4: INCIDENTS HISTORY */
        /* ========================================================================= */
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-[var(--foreground)]">{t('Incident & Recovery Timeline', 'Lịch sử Sự cố & Khắc phục')}</h2>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                {t('Historical timeline of FIRING and RESOLVED events with precise downtime durations.', 'Dòng thời gian các sự kiện cảnh báo và khắc phục kèm thời lượng chi tiết.')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Filter chips for Read / Unread */}
              <div className="flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setIncidentFilter('all')}
                  className={`rounded px-2.5 py-1 font-semibold transition-colors duration-100 ${
                    incidentFilter === 'all'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t('All', 'Tất cả')} ({incidents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setIncidentFilter('unread')}
                  className={`rounded px-2.5 py-1 font-semibold transition-colors duration-100 ${
                    incidentFilter === 'unread'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t('Unread', 'Chưa đọc')} ({unreadIncidentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setIncidentFilter('read')}
                  className={`rounded px-2.5 py-1 font-semibold transition-colors duration-100 ${
                    incidentFilter === 'read'
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {t('Read', 'Đã đọc')} ({Math.max(0, incidents.length - unreadIncidentsCount)})
                </button>
              </div>

              <button
                type="button"
                onClick={() => void fetchIncidents()}
                className="inline-flex items-center gap-1.5 h-8 rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--surface-3)] hover:border-[var(--border-strong)] transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[var(--color-muted)]" /> {t('Refresh', 'Làm mới')}
              </button>

              {unreadIncidentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllIncidentsRead()}
                  className="inline-flex items-center gap-1.5 h-8 rounded bg-[var(--accent-primary)] px-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer"
                >
                  {t('Mark all as read', 'Đánh dấu đã đọc')}
                </button>
              )}
            </div>
          </div>

          {loadingIncidents ? (
            <div className="flex min-h-48 items-center justify-center text-xs text-[var(--color-muted)]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-[var(--accent-primary)]" /> {t('Loading incident timeline…', 'Đang tải dòng thời gian sự cố…')}
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
                      className={`ops-panel surface-regular relative overflow-hidden transition-all ${
                        isFiring
                          ? 'border-l-4 border-l-rose-500'
                          : isResolved
                            ? 'border-l-4 border-l-emerald-500'
                            : isReminder
                              ? 'border-l-4 border-l-amber-500'
                              : 'border-l-4 border-l-blue-500'
                      } p-5 shadow-xs hover:shadow-md`}
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
                              className="text-[10px] font-semibold text-[var(--accent-primary)] hover:underline cursor-pointer"
                            >
                              {t('Mark read', 'Đánh dấu đã đọc')}
                            </button>
                          )}
                          <span
                            className={`rounded px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                              isFiring
                                ? 'bg-rose-500/15 text-rose-500 border border-rose-500/20'
                                : isResolved
                                  ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                                  : isReminder
                                    ? 'bg-amber-500/15 text-amber-500 border border-amber-500/20'
                                    : 'bg-blue-500/15 text-blue-500 border border-blue-500/20'
                            }`}
                          >
                            {isFiring ? t('FIRING', 'CẢNH BÁO') : isResolved ? t('RESOLVED', 'ĐÃ KHẮC PHỤC') : isReminder ? t('REMINDER', 'NHẮC LẠI') : t('NOTIFICATION', 'THÔNG BÁO')}
                          </span>
                        </div>
                      </div>

                      {/* Incident Message */}
                      <p className="mt-2.5 text-xs text-[var(--color-muted)] leading-relaxed">
                        {item.message}
                      </p>

                      {/* Timestamps & Downtime Chip */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-[11px] text-[var(--color-muted)] font-mono">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span>
                            {t('Triggered:', 'Thời điểm:')} <strong className="text-[var(--foreground)]">{failedAt}</strong>
                          </span>
                          {recoveredAt && (
                            <span>
                              {t('Recovered:', 'Phục hồi:')} <strong className="text-emerald-500">{recoveredAt}</strong>
                            </span>
                          )}
                        </div>

                        {isResolved && downtime && (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-2)] border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--foreground)]">
                            <Clock className="h-3 w-3 text-emerald-500" /> {t('Total Outage:', 'Tổng thời gian:')} {downtime}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

              {incidents.length === 0 && (
                <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-10 text-center text-xs text-[var(--color-muted)]">
                  <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500 mb-2" />
                  <p className="font-semibold text-[var(--foreground)]">{t('No incidents recorded', 'Không có sự cố nào được ghi nhận')}</p>
                  <p className="mt-1 text-[11px]">{t('All monitored servers, containers, services, and websites are operating normally.', 'Tất cả máy chủ, container, dịch vụ và website đang hoạt động ổn định.')}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Alert Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-rule-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl"
          >
            <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--surface-2)]">
              <h3 id="edit-rule-dialog-title" className="font-bold text-sm text-[var(--foreground)] flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {t('Edit Alert Rule', 'Chỉnh sửa quy tắc cảnh báo')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                aria-label={t('Close dialog', 'Đóng hộp thoại')}
                className="h-7 w-7 rounded flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  {t('Rule Name', 'Tên quy tắc cảnh báo')}
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                  placeholder="e.g. High CPU Usage Alert"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-semibold text-[var(--foreground)]">
                  <span>{t('Scope', 'Phạm vi')} ({['website', 'ssl'].includes(editMetric) ? t('Target Website', 'Website mục tiêu') : t('Target Server', 'Máy chủ mục tiêu')})</span>
                  <span className="text-[11px] font-mono text-[var(--color-muted)] font-normal">
                    {['website', 'ssl'].includes(editMetric)
                      ? (editTargetName ? `${t('Site:', 'Website:')} ${editTargetName}` : t('All websites', 'Tất cả website'))
                      : (!editServerId || editServerId === 'all'
                          ? t('All servers', 'Tất cả máy chủ')
                          : (servers.find((s) => s.id === editServerId)?.name || t('Selected server', 'Máy chủ đã chọn')))}
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
                          placeholder={t('Search websites by name, URL...', 'Tìm website theo tên, URL...')}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] pl-9 pr-8 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
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

                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md bg-[var(--surface-2)]/30">
                      {/* All websites option */}
                      <div
                        onClick={() => setEditTargetName('')}
                        className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                          !editTargetName ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              !editTargetName
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
                            }`}
                          >
                            {!editTargetName && <Check className="h-3 w-3 stroke-[3]" />}
                          </span>
                          <span className="text-xs text-[var(--foreground)]">{t('All websites (Entire Fleet)', 'Tất cả website (Toàn bộ hạ tầng)')}</span>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--color-muted)]">
                          {websites.length} {t('sites', 'site')}
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
                            className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
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
                          placeholder={t('Search servers by name, IP, hostname...', 'Tìm máy chủ theo tên, IP, hostname...')}
                          className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] pl-9 pr-8 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
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

                    <div className="max-h-48 overflow-y-auto divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-md bg-[var(--surface-2)]/30">
                      {/* All servers option */}
                      <div
                        onClick={() => setEditServerId('')}
                        className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
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
                                : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
                            }`}
                          >
                            {(!editServerId || editServerId === 'all') && (
                              <Check className="h-3 w-3 stroke-[3]" />
                            )}
                          </span>
                          <span className="text-xs text-[var(--foreground)]">{t('All servers (Entire Fleet)', 'Tất cả máy chủ (Toàn bộ cụm)')}</span>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--color-muted)]">
                          {servers.length} {t('agents', 'máy chủ')}
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
                            className={`flex items-center justify-between px-3 py-2 transition-colors duration-100 cursor-pointer select-none ${
                              isSelected ? 'bg-blue-500/10 font-semibold' : 'hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected
                                    ? 'border-blue-600 bg-blue-600 text-white'
                                    : 'border-[var(--border-subtle)] bg-[var(--surface-1)]'
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
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Operator', 'Toán tử')}
                    </label>
                    <CustomSelect
                      value={editOperator}
                      onChange={(val) => setEditOperator(val)}
                      options={[
                        { value: '>', label: t('> (Greater than)', '> (Lớn hơn)') },
                        { value: '>=', label: t('>= (Greater or equal)', '>= (Lớn hơn hoặc bằng)') },
                        { value: '<', label: t('< (Less than)', '< (Nhỏ hơn)') },
                        { value: '<=', label: t('<= (Less or equal)', '<= (Nhỏ hơn hoặc bằng)') },
                      ]}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Threshold (%)', 'Ngưỡng kích hoạt (%)')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={editThreshold}
                      onChange={(e) => setEditThreshold(Number(e.target.value))}
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Threshold & condition for network metrics */}
              {['network_latency', 'network_loss'].includes(editMetric) && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Operator', 'Toán tử')}
                      </label>
                      <CustomSelect
                        value={editOperator}
                        onChange={(val) => setEditOperator(val)}
                        options={[
                          { value: '>', label: t('> (Greater than)', '> (Lớn hơn)') },
                          { value: '<', label: t('< (Less than)', '< (Nhỏ hơn)') },
                        ]}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Threshold', 'Ngưỡng kích hoạt')} ({editMetric === 'network_latency' ? 'ms' : '%'})
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={editMetric === 'network_latency' ? 60000 : 100}
                        required
                        value={editThreshold}
                        onChange={(e) => setEditThreshold(Number(e.target.value))}
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Target / Tag Filter (Optional)', 'Lọc Target / Tag (Không bắt buộc)')}
                    </label>
                    <input
                      type="text"
                      list="edit-network-targets-list"
                      value={editTargetName}
                      onChange={(e) => setEditTargetName(e.target.value)}
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                      placeholder={t('Target name, tag, or host (leave blank for all targets)', 'Tên target, tag hoặc host (để trống cho tất cả)')}
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
                        <span className="text-[11px] text-[var(--color-muted)] font-mono">{t('Quick tags:', 'Thẻ nhanh:')}</span>
                        {discoveredNetworkTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => setEditTargetName(tag)}
                            className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--surface-2)] border border-[var(--border-subtle)] hover:border-blue-500 text-[var(--color-muted)] hover:text-[var(--foreground)] transition cursor-pointer"
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
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    {t('Docker Container Name', 'Tên Docker Container')}
                  </label>
                  <input
                    type="text"
                    required
                    value={editTargetName}
                    onChange={(e) => setEditTargetName(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder="e.g. nginx, redis, postgres"
                  />
                </div>
              )}

              {editMetric === 'service' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    {t('Systemd Service Name', 'Tên dịch vụ Systemd')}
                  </label>
                  <input
                    type="text"
                    required
                    value={editTargetName}
                    onChange={(e) => setEditTargetName(e.target.value)}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder="e.g. apache2, nginx, docker"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    {t('Duration (Minutes)', 'Thời lượng (Phút)')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    required
                    value={editDuration}
                    onChange={(e) => setEditDuration(Number(e.target.value))}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    {t('Repeat Interval (Minutes)', 'Chu kỳ lặp lại (Phút)')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={editRepeat}
                    onChange={(e) => setEditRepeat(Number(e.target.value))}
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] focus:border-[var(--accent-primary)] outline-none"
                    placeholder={t("0 = Don't repeat", '0 = Không lặp lại')}
                  />
                </div>
              </div>

              {/* Channel selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-[var(--foreground)]">
                    {t('Notification Channels ·', 'Kênh thông báo ·')} {editChannelIds.length} {t('SELECTED', 'ĐÃ CHỌN')}
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
                      className="text-xs text-blue-400 hover:underline font-mono text-[11px] cursor-pointer"
                    >
                      {editChannelIds.length === channels.length ? t('deselect all', 'bỏ chọn tất cả') : t('select all', 'chọn tất cả')}
                    </button>
                  )}
                </div>
                {channels.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--color-muted)] text-center border border-[var(--border-subtle)] rounded-md">
                    {t('No notification channels configured.', 'Chưa cấu hình kênh thông báo nào.')}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-0.5">
                    {channels.map((ch) => {
                      const selected = editChannelIds.includes(ch.id);
                      return (
                        <div
                          key={ch.id}
                          onClick={() => toggleEditChannel(ch.id)}
                          className={`flex items-center gap-2.5 p-2 rounded-md border cursor-pointer transition-colors duration-100 select-none ${
                            selected
                              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                              : 'border-[var(--border-subtle)] bg-[var(--surface-2)] hover:border-blue-500/30'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              selected ? 'border-blue-500 bg-blue-600 text-white' : 'border-[var(--border-subtle)]'
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[var(--foreground)] truncate">{ch.name}</p>
                            <p className="text-[10px] uppercase font-bold text-[var(--color-muted)] font-mono">{ch.type}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2.5 border-t border-[var(--border-subtle)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                >
                  {t('Cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('Save Changes', 'Lưu thay đổi')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Notification Channel Modal */}
      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-channel-dialog-title"
            className="w-full max-w-lg overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-2xl"
          >
            <div className="p-4 border-b border-[var(--border-subtle)] flex justify-between items-center bg-[var(--surface-2)]">
              <h3 id="edit-channel-dialog-title" className="font-bold text-sm text-[var(--foreground)] flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                {t('Edit Notification Channel', 'Chỉnh sửa kênh thông báo')}
              </h3>
              <button
                type="button"
                onClick={() => setEditingChannel(null)}
                aria-label={t('Close dialog', 'Đóng hộp thoại')}
                className="h-7 w-7 rounded flex items-center justify-center text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditChannel} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
              {/* Channel Type */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  {t('Channel Type', 'Loại kênh')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditChannelType('discord')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center transition-colors duration-100 cursor-pointer ${
                      editChannelType === 'discord'
                        ? 'border-[#5865F2] bg-[#5865F2]/10 text-white font-semibold ring-1 ring-[#5865F2]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-[#5865F2]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <DiscordIcon className={`h-4.5 w-4.5 ${editChannelType === 'discord' ? 'text-[#5865F2]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Discord</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditChannelType('telegram')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center transition-colors duration-100 cursor-pointer ${
                      editChannelType === 'telegram'
                        ? 'border-[#0088cc] bg-[#0088cc]/10 text-white font-semibold ring-1 ring-[#0088cc]'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-[#0088cc]/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <TelegramIcon className={`h-4.5 w-4.5 ${editChannelType === 'telegram' ? 'text-[#0088cc]' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Telegram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditChannelType('email')}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-md border p-2 text-center transition-colors duration-100 cursor-pointer ${
                      editChannelType === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10 text-white font-semibold ring-1 ring-emerald-500'
                        : 'border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--color-muted)] hover:border-emerald-500/50 hover:text-[var(--foreground)]'
                    }`}
                  >
                    <Mail className={`h-4.5 w-4.5 ${editChannelType === 'email' ? 'text-emerald-400' : 'text-[var(--color-muted)]'}`} />
                    <span className="text-xs font-medium">Email</span>
                  </button>
                </div>
              </div>

              {/* Channel Display Name */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  {t('Channel Display Name', 'Tên hiển thị kênh')}
                </label>
                <input
                  required
                  name="datrix_edit_channel_name"
                  autoComplete="off"
                  value={editChannelName}
                  onChange={(e) => setEditChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                  placeholder="e.g. Incident Telegram Bot"
                />
              </div>

              {/* Dynamic Inputs based on Channel Type */}
              {editChannelType === 'telegram' ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-semibold text-[var(--foreground)]">
                        {t('Bot Token', 'Mã Bot Token')}
                      </label>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        {t('Leave blank to keep existing', 'Để trống để giữ nguyên')}
                      </span>
                    </div>
                    <input
                      name="datrix_edit_bot_token"
                      autoComplete="new-password"
                      value={editChannelToken}
                      onChange={(e) => setEditChannelToken(e.target.value)}
                      type="password"
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                      placeholder="••••••••••••••••••••••••••••••••"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      {t('Chat ID', 'ID Cuộc trò chuyện (Chat ID)')}
                    </label>
                    <input
                      required
                      name="datrix_edit_chat_id"
                      autoComplete="off"
                      value={editChannelChatId}
                      onChange={(e) => setEditChannelChatId(e.target.value)}
                      type="text"
                      className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                      placeholder="e.g. -1001234567890 or @channel_name"
                    />
                  </div>
                </>
              ) : editChannelType === 'discord' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-[var(--foreground)]">
                      {t('Discord Webhook URL', 'Đường dẫn Webhook Discord')}
                    </label>
                    <span className="text-[11px] text-[var(--color-muted)]">
                      {t('Leave blank to keep existing', 'Để trống để giữ nguyên')}
                    </span>
                  </div>
                  <input
                    name="datrix_edit_webhook_url"
                    autoComplete="off"
                    value={editChannelWebhook}
                    onChange={(e) => setEditChannelWebhook(e.target.value)}
                    type="url"
                    className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                    placeholder="https://discord.com/api/webhooks/... (leave blank to keep)"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('SMTP Host', 'Máy chủ SMTP')}
                      </label>
                      <input
                        required
                        name="datrix_edit_smtp_host"
                        autoComplete="off"
                        value={editChannelSMTPHost}
                        onChange={(e) => setEditChannelSMTPHost(e.target.value)}
                        type="text"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('Port', 'Cổng')}
                      </label>
                      <input
                        required
                        name="datrix_edit_smtp_port"
                        autoComplete="off"
                        value={editChannelSMTPPort}
                        onChange={(e) => setEditChannelSMTPPort(e.target.value)}
                        type="number"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">{t('Username', 'Tên đăng nhập')}</label>
                      <input
                        name="datrix_edit_smtp_user"
                        autoComplete="off"
                        value={editChannelSMTPUsername}
                        onChange={(e) => setEditChannelSMTPUsername(e.target.value)}
                        type="text"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="user@domain.com"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-[var(--foreground)]">{t('Password', 'Mật khẩu')}</label>
                        <span className="text-[10px] text-[var(--color-muted)]">{t('Leave blank to keep', 'Để trống để giữ')}</span>
                      </div>
                      <input
                        name="datrix_edit_smtp_pass"
                        autoComplete="new-password"
                        value={editChannelSMTPPassword}
                        onChange={(e) => setEditChannelSMTPPassword(e.target.value)}
                        type="password"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="••••••••••••"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('From Email', 'Email người gửi')}
                      </label>
                      <input
                        required
                        name="datrix_edit_email_from"
                        autoComplete="off"
                        value={editChannelEmailFrom}
                        onChange={(e) => setEditChannelEmailFrom(e.target.value)}
                        type="email"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="alerts@domain.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                        {t('To Email', 'Email người nhận')}
                      </label>
                      <input
                        required
                        name="datrix_edit_email_to"
                        autoComplete="off"
                        value={editChannelEmailTo}
                        onChange={(e) => setEditChannelEmailTo(e.target.value)}
                        type="email"
                        className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs font-mono text-[var(--foreground)] placeholder:text-[var(--color-muted)] focus:border-[var(--accent-primary)] outline-none transition-colors"
                        placeholder="ops@domain.com"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <input
                      id="edit_channel_use_tls"
                      type="checkbox"
                      checked={editChannelUseTLS}
                      onChange={(e) => setEditChannelUseTLS(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] bg-[var(--surface-2)] text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="edit_channel_use_tls" className="text-xs text-[var(--foreground)] font-medium cursor-pointer">
                      {t('Use SSL/TLS', 'Bật SSL/TLS')}
                    </label>
                  </div>
                </>
              )}

              {/* Action Buttons: TEST + CANCEL + SAVE */}
              <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void testEditChannel()}
                  disabled={testingEditChannel || savingEditChannel}
                  className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-primary)] hover:bg-[var(--surface-hover)] flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
                >
                  {testingEditChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{t('Send Test', 'Gửi thử')}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingChannel(null)}
                    className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                  >
                    {t('Cancel', 'Hủy')}
                  </button>
                  <button
                    type="submit"
                    disabled={savingEditChannel || testingEditChannel}
                    className="rounded bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    {savingEditChannel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {t('Save Changes', 'Lưu thay đổi')}
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
        title={t('Delete Alert Rule', 'Xóa quy tắc cảnh báo')}
        message={t(
          `Are you sure you want to delete alert rule "${deleteRuleTarget?.name}"? You will no longer receive notifications for this rule.`,
          `Bạn có chắc chắn muốn xóa quy tắc "${deleteRuleTarget?.name}"? Hệ thống sẽ ngừng kích hoạt thông báo cho quy tắc này.`
        )}
        confirmText={t('Delete Rule', 'Xóa quy tắc')}
        cancelText={t('Cancel', 'Hủy')}
        variant="danger"
        loading={deletingRule}
        onConfirm={() => void confirmDeleteRule()}
        onCancel={() => setDeleteRuleTarget(null)}
      />

      {/* Delete Channel Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteChannelTarget)}
        title={t('Delete Notification Channel', 'Xóa kênh thông báo')}
        message={t(
          `Are you sure you want to delete notification channel "${deleteChannelTarget?.name}"? Any rules using it will no longer send notifications here.`,
          `Bạn có chắc chắn muốn xóa kênh thông báo "${deleteChannelTarget?.name}"? Các quy tắc đang liên kết sẽ ngừng gửi tin đến đây.`
        )}
        confirmText={t('Delete Channel', 'Xóa kênh')}
        cancelText={t('Cancel', 'Hủy')}
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

