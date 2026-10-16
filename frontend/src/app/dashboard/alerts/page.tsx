'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
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
  Network,
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
  Zap,
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
  const [selectedServerId, setSelectedServerId] = useState('all');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

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
        if (paramServerId) setSelectedServerId(paramServerId);
        if (tgt) {
          setRuleName(`Network ${met === 'network_loss' ? 'Packet Loss' : 'Latency'}: ${tgt}`);
        }
      } else if (paramCategory === 'website') {
        setRuleMetric(paramMetric === 'ssl' ? 'ssl' : 'website');
        if (paramTarget) setRuleTargetName(paramTarget);
      }
    }
  }, [paramTab, paramCategory, paramTarget, paramServerId, paramMetric]);

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

  const [userRole, setUserRole] = useState<string>(() => getUserRole());
  useEffect(() => {
    apiClient('/auth/me').then(u => { if (u?.role) setUserRole(u.role); }).catch(() => {});
  }, []);
  const isViewer = userRole === 'viewer';

  // Handle category change on create rule form
  const handleSelectCategory = (cat: AlertCategory) => {
    setSelectedCategory(cat);
    setErrorMessage('');
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
      setSelectedServerId('all');
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

  const relevantNetworkTargets = useMemo(() => {
    if (selectedServerId && selectedServerId !== 'all') {
      return networkTargets.filter((t) => t.agent_id === selectedServerId);
    }
    return networkTargets;
  }, [networkTargets, selectedServerId]);

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

  const ruleSummaryText = useMemo(() => {
    const scopeStr = selectedServerId === 'all' ? 'All servers' : (servers.find((s) => s.id === selectedServerId)?.name || 'Selected server');
    const chCount = selectedChannelIds.length;
    const chStr = chCount === 0 ? 'No channels selected' : `${chCount} channel(s)`;

    if (selectedCategory === 'status') {
      return `Alert if heartbeat is missing for > ${ruleDuration}m on ${scopeStr} → Notify via ${chStr}`;
    }
    if (selectedCategory === 'network') {
      const metricStr = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
      const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
      const targetStr = ruleTargetName ? `target/tag "${ruleTargetName}"` : 'all targets';
      return `Alert if Network ${metricStr} on ${targetStr} is ${ruleOperator} ${ruleThreshold}${unit} for ${ruleDuration}m on ${scopeStr} → Notify via ${chStr}`;
    }
    if (selectedCategory === 'metric') {
      return `Alert if ${ruleMetric.toUpperCase()} usage is ${ruleOperator} ${ruleThreshold}% for ${ruleDuration}m on ${scopeStr} → Notify via ${chStr}`;
    }
    if (selectedCategory === 'container') {
      return `Alert if container "${ruleTargetName || '...'}" stops running on ${scopeStr} → Notify via ${chStr}`;
    }
    if (selectedCategory === 'service') {
      return `Alert if systemd service "${ruleTargetName || '...'}" fails on ${scopeStr} → Notify via ${chStr}`;
    }
    if (selectedCategory === 'website') {
      const siteStr = ruleTargetName || 'all websites';
      return ruleMetric === 'ssl'
        ? `Alert if SSL certificate expires in ≤ ${ruleThreshold} days for ${siteStr} → Notify via ${chStr}`
        : `Alert if website "${siteStr}" goes down → Notify via ${chStr}`;
    }
    return '';
  }, [selectedCategory, selectedServerId, servers, selectedChannelIds, ruleDuration, ruleMetric, ruleTargetName, ruleOperator, ruleThreshold]);

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
      const createdRule = await apiClient('/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName.trim(),
          metric: ruleMetric,
          operator: isSpecialMetric ? '==' : ruleOperator,
          threshold: ruleMetric === 'ssl' ? (threshold || 14) : isSpecialMetric ? 0 : threshold,
          duration_minutes: duration,
          server_id: (selectedServerId === 'all' || selectedCategory === 'website') ? null : selectedServerId,
          channel_ids: selectedChannelIds,
          repeat_interval_minutes: Number.parseInt(ruleRepeatInterval, 10) || 0,
          target_name: (ruleMetric === 'container' || ruleMetric === 'service' || ruleMetric === 'website' || ruleMetric === 'ssl' || ruleMetric === 'network_latency' || ruleMetric === 'network_loss') ? (ruleTargetName.trim() || null) : null,
        }),
      });

      setRules((current) => [createdRule, ...current]);
      setSuccessMessage(`Alert rule "${createdRule.name}" created successfully!`);
      setActiveTab('rules');

      // Reset form
      setRuleName('Server Offline Alert');
      setSelectedCategory('status');
      setRuleMetric('status');
      setRuleTargetName('');
      setRuleRepeatInterval('0');
      setRuleThreshold('90');
      setRuleDuration('1');
      setSelectedServerId('all');
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
        target_name: (editMetric === 'container' || editMetric === 'service' || editMetric === 'network_latency' || editMetric === 'network_loss') ? (editTargetName.trim() || null) : null,
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

          {activeTab !== 'create' && (
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
          )}
        </div>
      </div>

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

      {/* Top 4 KPI Summary Metric Cards */}
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
            aria-selected={activeTab === 'create'}
            onClick={() => { setActiveTab('create'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all ${
              activeTab === 'create'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Plus className="h-4 w-4" />
            <span>Create Alert Rule</span>
            {activeTab === 'create' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
            )}
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
            <span>Incident History</span>
            {unreadIncidentsCount > 0 ? (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
                {unreadIncidentsCount} unread
              </span>
            ) : (
              <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-bold text-[var(--color-muted)]">
                {incidents.length}
              </span>
            )}
            {activeTab === 'incidents' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
            )}
          </button>
        </nav>
      </div>

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
                        {rule.server_name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--surface-subtle)] text-[var(--color-muted)] border border-[var(--border-color)]">
                            <Server className="w-2.5 h-2.5" />
                            {rule.server_name}
                          </span>
                        )}
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
        /* TAB 2: CREATE ALERT RULE STUDIO (STREAMLINED & CLUTTER-FREE UX) */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* Header & Back Action */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-[var(--border-color)]">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-500 mb-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className="hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Alert Rules
                </button>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
                Create Alert Rule
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Configure metric thresholds, choose target scopes, and assign notification delivery channels.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="ops-button secondary text-xs self-start sm:self-auto cursor-pointer"
            >
              Cancel
            </button>
          </div>

          {/* Category Tabs: Clean Segmented Pill Navigation */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'status', label: 'Server Offline', icon: Server, color: 'text-cyan-400' },
              { id: 'metric', label: 'Resource Usage', icon: Activity, color: 'text-amber-400' },
              { id: 'network', label: 'Network Quality', icon: Wifi, color: 'text-indigo-400' },
              { id: 'container', label: 'Docker Container', icon: Box, color: 'text-blue-400' },
              { id: 'service', label: 'Systemd Service', icon: Layers, color: 'text-purple-400' },
              { id: 'website', label: 'Website & SSL', icon: Globe2, color: 'text-emerald-400' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.id;
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => handleSelectCategory(cat.id as AlertCategory)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer select-none ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-500/50'
                      : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] border border-[var(--border-color)]'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isSelected ? 'text-white' : cat.color}`} />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          <form onSubmit={createRule} className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* CARD 1: Trigger Condition & Threshold (7 cols) */}
              <div className="ops-panel surface-regular p-5 sm:p-6 lg:col-span-7 space-y-5">
                <div className="border-b border-[var(--border-color)] pb-3">
                  <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 text-xs font-bold">1</span>
                    Trigger Condition & Threshold
                  </h3>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    Define the threshold and metric criteria that will trigger this alert.
                  </p>
                </div>

                {/* Condition Body: Status (Server Offline) */}
                {selectedCategory === 'status' && (
                  <div className="space-y-4">
                    <label className="text-xs font-semibold text-[var(--foreground)] block">
                      Trigger alert if heartbeat is missing for:
                    </label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {[
                        { val: '1', label: '1 min' },
                        { val: '2', label: '2 min' },
                        { val: '5', label: '5 min' },
                        { val: '10', label: '10 min' },
                        { val: '15', label: '15 min' },
                      ].map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setRuleDuration(opt.val)}
                          className={`flex items-center justify-center rounded-xl border py-2.5 px-3 text-center transition cursor-pointer ${
                            ruleDuration === opt.val
                              ? 'border-blue-500 bg-blue-500/15 text-blue-400 font-bold ring-1 ring-blue-500 shadow-xs'
                              : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                          }`}
                        >
                          <span className="text-xs font-semibold">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Agents dispatch heartbeats every 10 seconds. An alert is triggered once missed heartbeats exceed this duration.
                    </p>
                  </div>
                )}

                {/* Condition Body: Resource Usage (CPU, RAM, Disk) */}
                {selectedCategory === 'metric' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                          Resource Metric
                        </label>
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
                        <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                          Condition
                        </label>
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
                          Threshold: <span className="font-mono font-bold text-amber-500">{ruleThreshold}%</span>
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          required
                          min="0"
                          max="100"
                          value={ruleThreshold}
                          onChange={(e) => {
                            setRuleThreshold(e.target.value);
                            setRuleName(`High ${ruleMetric.toUpperCase()} Alert (> ${e.target.value}%)`);
                          }}
                          type="number"
                          className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-center font-mono text-xs text-[var(--foreground)] outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {['70', '80', '85', '90', '95'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setRuleThreshold(preset);
                                setRuleName(`High ${ruleMetric.toUpperCase()} Alert (> ${preset}%)`);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                ruleThreshold === preset
                                  ? 'bg-amber-500/20 text-amber-500 border-amber-500/40 shadow-xs'
                                  : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {preset}%
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[var(--border-color)]">
                      <label htmlFor="metric-duration" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                        <Clock className="h-3.5 w-3.5 text-amber-500" />
                        Continuous Duration (Minutes)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="metric-duration"
                          required
                          min="1"
                          max="1440"
                          value={ruleDuration}
                          onChange={(e) => setRuleDuration(e.target.value)}
                          type="number"
                          className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex items-center gap-1.5">
                          {['1', '2', '5', '10', '15'].map((min) => (
                            <button
                              key={min}
                              type="button"
                              onClick={() => setRuleDuration(min)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                ruleDuration === min
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                                  : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {min}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Condition Body: Network Quality (Latency & Packet Loss) */}
                {selectedCategory === 'network' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                          Network Metric
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
                            { value: 'network_latency', label: 'Round-Trip Latency (ms)', subLabel: 'Socket / Ping response time' },
                            { value: 'network_loss', label: 'Packet Loss (%)', subLabel: 'ICMP probe drop percentage' },
                          ]}
                          className="w-full"
                        />
                      </div>

                      <div>
                        <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                          Condition
                        </label>
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
                          Threshold: <span className="font-mono font-bold text-indigo-400">{ruleThreshold}{ruleMetric === 'network_latency' ? 'ms' : '%'}</span>
                        </label>
                        <span className="text-[11px] text-[var(--color-muted)]">
                          {ruleMetric === 'network_latency' ? 'Allowed latency in milliseconds' : 'Allowed loss percentage'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          required
                          min="0"
                          max={ruleMetric === 'network_latency' ? 60000 : 100}
                          value={ruleThreshold}
                          onChange={(e) => {
                            setRuleThreshold(e.target.value);
                            const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                            const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                            setRuleName(ruleTargetName ? `Network ${mName}: ${ruleTargetName} (${ruleOperator} ${e.target.value}${unit})` : `Network ${mName} Alert (${ruleOperator} ${e.target.value}${unit})`);
                          }}
                          type="number"
                          className="w-28 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder={ruleMetric === 'network_latency' ? '100' : '10'}
                        />
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(ruleMetric === 'network_latency' ? ['30', '50', '100', '200', '500'] : ['5', '10', '20', '50']).map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => {
                                setRuleThreshold(preset);
                                const unit = ruleMetric === 'network_latency' ? 'ms' : '%';
                                const mName = ruleMetric === 'network_latency' ? 'Latency' : 'Packet Loss';
                                setRuleName(ruleTargetName ? `Network ${mName}: ${ruleTargetName} (${ruleOperator} ${preset}${unit})` : `Network ${mName} Alert (${ruleOperator} ${preset}${unit})`);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border transition cursor-pointer ${
                                ruleThreshold === preset
                                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-xs'
                                  : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {preset}{ruleMetric === 'network_latency' ? 'ms' : '%'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Target & Tag Filter (The Key Connection to Network Quality!) */}
                    <div className="pt-3 border-t border-[var(--border-color)] space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                          <Network className="h-3.5 w-3.5 text-indigo-400" />
                          Monitored Target or Tag Group
                        </label>
                        <Link
                          href="/dashboard/network"
                          className="text-[11px] font-semibold text-blue-400 hover:underline flex items-center gap-1"
                        >
                          Manage Targets ↗
                        </Link>
                      </div>

                      <div className="space-y-2">
                        <CustomSelect
                          value={
                            ruleTargetName === ''
                              ? '__ALL__'
                              : discoveredNetworkTags.includes(ruleTargetName)
                              ? `tag:${ruleTargetName}`
                              : relevantNetworkTargets.some(t => t.name === ruleTargetName)
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
                            ...discoveredNetworkTags.map((tag) => {
                              const count = relevantNetworkTargets.filter(t => t.tag === tag).length;
                              return {
                                value: `tag:${tag}`,
                                label: `Tag Group: ${tag}`,
                                subLabel: `${count} target(s) with this tag`,
                              };
                            }),
                            ...relevantNetworkTargets.map((t) => ({
                              value: `target:${t.name}`,
                              label: `Target: ${t.name} (${t.host}${t.port ? `:${t.port}` : ''})`,
                              subLabel: `${t.probe_method} • Tag: ${t.tag} • ${t.server_name || 'Server'}`,
                            })),
                          ]}
                          className="w-full"
                        />

                        {/* Live Target Match Feedback */}
                        <div className="p-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border-color)] text-xs">
                          {matchedNetworkTargets.length > 0 ? (
                            <div className="flex items-start gap-2">
                              <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                <p className="text-[var(--foreground)] font-medium">
                                  {ruleTargetName === '' ? (
                                    <span>Rule applies to <strong>all {matchedNetworkTargets.length} targets</strong> on the selected fleet.</span>
                                  ) : (
                                    <span>Matches <strong>{matchedNetworkTargets.length} target(s)</strong>:</span>
                                  )}
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {matchedNetworkTargets.slice(0, 4).map((t) => (
                                    <span
                                      key={t.id}
                                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--background-card)] border border-[var(--border-color)] text-[var(--color-muted)]"
                                    >
                                      {t.name} ({t.host})
                                    </span>
                                  ))}
                                  {matchedNetworkTargets.length > 4 && (
                                    <span className="text-[10px] text-[var(--color-muted)] font-medium">
                                      +{matchedNetworkTargets.length - 4} more
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2 text-amber-400">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>No targets currently match &quot;{ruleTargetName}&quot;.</span>
                              </div>
                              <Link href="/dashboard/network" className="text-blue-400 hover:underline font-semibold shrink-0">
                                Add target →
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Continuous Duration */}
                    <div className="pt-3 border-t border-[var(--border-color)]">
                      <label htmlFor="network-duration" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                        <Clock className="h-3.5 w-3.5 text-indigo-400" />
                        Continuous Duration Before Firing (Minutes)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          id="network-duration"
                          required
                          min="1"
                          max="1440"
                          value={ruleDuration}
                          onChange={(e) => setRuleDuration(e.target.value)}
                          type="number"
                          className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2 text-xs font-mono text-[var(--foreground)] outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex items-center gap-1.5">
                          {['1', '2', '5', '10', '15'].map((min) => (
                            <button
                              key={min}
                              type="button"
                              onClick={() => setRuleDuration(min)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                ruleDuration === min
                                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40'
                                  : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              {min}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Condition Body: Docker Container */}
                {selectedCategory === 'container' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="rule-target-name" className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)] mb-1.5">
                        <Box className="h-4 w-4 text-blue-500" /> Monitored Docker Container Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="rule-target-name"
                        required
                        value={ruleTargetName}
                        onChange={(e) => {
                          setRuleTargetName(e.target.value);
                          setRuleName(e.target.value ? `Docker: ${e.target.value}` : 'Docker Container Alert');
                        }}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                        placeholder="e.g. nginx, postgres, redis, api-gateway"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Triggers immediately if the specified container exits or becomes unhealthy.
                    </p>
                  </div>
                )}

                {/* Condition Body: Systemd Service */}
                {selectedCategory === 'service' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="rule-target-name" className="flex items-center gap-2 text-xs font-semibold text-[var(--foreground)] mb-1.5">
                        <Layers className="h-4 w-4 text-purple-500" /> Monitored Systemd Service Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        id="rule-target-name"
                        required
                        value={ruleTargetName}
                        onChange={(e) => {
                          setRuleTargetName(e.target.value);
                          setRuleName(e.target.value ? `Service: ${e.target.value}` : 'Systemd Service Alert');
                        }}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-purple-500 outline-none"
                        placeholder="e.g. nginx, mariadb, docker, sshd, redis-server"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--color-muted)]">
                      Triggers if the systemd unit enters failed or inactive state.
                    </p>
                  </div>
                )}

                {/* Condition Body: Website & SSL */}
                {selectedCategory === 'website' && (
                  <div className="space-y-4">
                    <div>
                      <label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">
                        Endpoint Health Trigger Condition
                      </label>
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                        {[
                          {
                            id: 'website_down',
                            metric: 'website',
                            threshold: '0',
                            label: 'Website DOWN',
                            defaultName: ruleTargetName ? `Website Down: ${ruleTargetName}` : 'Website Down Alert',
                          },
                          {
                            id: 'ssl_14d',
                            metric: 'ssl',
                            threshold: '14',
                            label: 'SSL Expiring (≤ 14 days)',
                            defaultName: ruleTargetName ? `SSL Expiration (<= 14d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 14 days)',
                          },
                          {
                            id: 'ssl_30d',
                            metric: 'ssl',
                            threshold: '30',
                            label: 'SSL Expiring (≤ 30 days)',
                            defaultName: ruleTargetName ? `SSL Expiration (<= 30d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 30 days)',
                          },
                        ].map((item) => {
                          const isSelected = ruleMetric === item.metric && (item.metric === 'website' || ruleThreshold === item.threshold);
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setRuleMetric(item.metric);
                                setRuleThreshold(item.threshold);
                                setRuleName(item.defaultName);
                              }}
                              className={`flex items-center justify-center rounded-xl border py-2.5 px-3 text-center transition cursor-pointer ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold ring-1 ring-emerald-500 shadow-xs'
                                  : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                              }`}
                            >
                              <span className="text-xs font-semibold">{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 2: Scope & Notification Delivery (5 cols) */}
              <div className="ops-panel surface-regular p-5 sm:p-6 lg:col-span-5 space-y-5">
                <div className="border-b border-[var(--border-color)] pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/15 text-blue-500 text-xs font-bold">2</span>
                      Scope & Delivery
                    </h3>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      Choose servers to monitor and select notification channels.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-xs font-semibold text-blue-500 hover:underline cursor-pointer"
                  >
                    + New Channel
                  </button>
                </div>

                {/* Scope: Server Fleet or Website */}
                <div>
                  {selectedCategory === 'website' ? (
                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                        <Globe2 className="h-4 w-4 text-emerald-500" /> Monitored Website Target
                      </label>
                      <CustomSelect
                        value={ruleTargetName || 'all'}
                        onChange={(val) => {
                          const targetVal = val === 'all' ? '' : val;
                          setRuleTargetName(targetVal);
                          if (ruleMetric === 'ssl') {
                            setRuleName(targetVal ? `SSL Expiration: ${targetVal}` : 'SSL Certificate Expiration Alert');
                          } else {
                            setRuleName(targetVal ? `Website Down: ${targetVal}` : 'Website Down Alert');
                          }
                        }}
                        options={[
                          { value: 'all', label: 'All Monitored Websites (Universal)' },
                          ...websites.map((w) => ({
                            value: w.name,
                            label: w.name,
                            subLabel: w.url,
                          })),
                        ]}
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                        <Server className="h-4 w-4 text-blue-500" /> Target Server Fleet
                      </label>
                      <CustomSelect
                        value={selectedServerId}
                        onChange={setSelectedServerId}
                        options={[
                          { value: 'all', label: 'All servers (Entire Agent Fleet)' },
                          ...servers.map((server) => ({
                            value: server.id,
                            label: server.name,
                            subLabel: server.status === 'online' ? 'Online' : 'Offline',
                          })),
                        ]}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Alert Rule Name */}
                <div>
                  <label htmlFor="rule-name" className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                    Alert Rule Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    id="rule-name"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none transition"
                    placeholder="e.g. Production Network Latency High"
                  />
                  <p className="text-[11px] text-[var(--color-muted)] mt-1">
                    Auto-generated from your condition, or customize as you prefer.
                  </p>
                </div>

                {/* Delivery Channels */}
                <div className="space-y-2.5">
                  <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                    <Radio className="h-3.5 w-3.5 text-blue-500" />
                    Delivery Channels ({selectedChannelIds.length} selected) <span className="text-rose-400">*</span>
                  </label>

                  {enabledChannels.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[var(--border-color)] p-4 text-center">
                      <p className="text-xs text-[var(--color-muted)]">No active notification channels configured.</p>
                      <button
                        type="button"
                        onClick={() => setActiveTab('channels')}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:underline cursor-pointer"
                      >
                        Configure Telegram / Discord / Email →
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {enabledChannels.map((channel) => {
                        const isSelected = selectedChannelIds.includes(channel.id);
                        return (
                          <div
                            key={channel.id}
                            onClick={() => toggleChannel(channel.id)}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer select-none ${
                              isSelected
                                ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-xs'
                                : 'border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  isSelected ? 'border-blue-500 bg-blue-600 text-white' : 'border-[var(--border-color)]'
                                }`}
                              >
                                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--foreground)] truncate">{channel.name}</p>
                                <span className="text-[9px] uppercase font-bold text-[var(--color-muted)]">{channel.type}</span>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={testingChannelId === channel.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                void testExistingChannel(channel.id, channel.name);
                              }}
                              className="text-[10px] font-semibold text-blue-400 hover:underline px-1.5 py-0.5 cursor-pointer ml-1"
                              title="Send test notification"
                            >
                              {testingChannelId === channel.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Reminder Interval */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--foreground)]">
                    <Clock className="h-3.5 w-3.5 text-purple-500" />
                    Reminder Interval
                  </label>
                  <CustomSelect
                    value={ruleRepeatInterval}
                    onChange={setRuleRepeatInterval}
                    options={[
                      { value: '0', label: 'Send once (Do not repeat)' },
                      { value: '15', label: 'Repeat every 15 minutes' },
                      { value: '30', label: 'Repeat every 30 minutes' },
                      { value: '60', label: 'Repeat every 1 hour' },
                      { value: '120', label: 'Repeat every 2 hours' },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Action & Live Summary Bar */}
            {(() => {
              const isNameValid = ruleName.trim().length > 0;
              const isChannelValid = selectedChannelIds.length > 0;
              const isTargetValid = !(selectedCategory === 'container' || selectedCategory === 'service') || ruleTargetName.trim().length > 0;
              const isFormValid = isNameValid && isChannelValid && isTargetValid;

              const disabledReason = !isNameValid
                ? 'Please provide an alert rule name.'
                : !isTargetValid
                ? `Please specify the monitored ${selectedCategory === 'container' ? 'container' : 'service'} name.`
                : !isChannelValid
                ? 'Please select at least one notification delivery channel.'
                : '';

              return (
                <div className="ops-panel surface-regular p-4 flex flex-col sm:flex-row items-center justify-between gap-4 border border-blue-500/30 bg-blue-500/5">
                  <div className="text-xs text-[var(--foreground)] flex items-center gap-2 min-w-0 w-full sm:w-auto">
                    <Zap className="h-4 w-4 text-blue-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-[var(--foreground)]">Summary: </span>
                      <span className="text-[var(--color-muted)] font-mono text-[11px] sm:text-xs">
                        {ruleSummaryText}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                    {!isFormValid && (
                      <span className="text-amber-400 text-xs flex items-center gap-1 font-medium hidden md:inline-flex">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        {disabledReason}
                      </span>
                    )}

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
                      title={disabledReason || 'Create alert rule'}
                      className="ops-button primary flex items-center gap-2 px-5 py-2 text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {savingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      Create Alert Rule
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

                      <button
                        type="button"
                        onClick={() => {
                          if (channel.usage_count && channel.usage_count > 0) {
                            setErrorMessage(`This channel is currently used by ${channel.usage_count} alert rule(s). Please unlink or delete those rules first.`);
                            return;
                          }
                          setDeleteChannelTarget(channel);
                        }}
                        className="p-1.5 text-rose-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="Delete channel"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
                <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                  Target Server
                </label>
                <CustomSelect
                  value={editServerId || 'all'}
                  onChange={(val) => setEditServerId(val === 'all' ? '' : val)}
                  options={[
                    { value: 'all', label: 'All servers (Entire Agent Fleet)' },
                    ...servers.map((s) => ({
                      value: s.id,
                      label: s.name,
                      subLabel: s.status === 'online' ? 'Online' : 'Offline',
                    })),
                  ]}
                  className="w-full"
                />
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
                <label className="mb-2 block text-xs font-semibold text-[var(--foreground)]">
                  Notification Channels
                </label>
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

