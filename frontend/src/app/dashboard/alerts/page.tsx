'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bell,
  Box,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Globe2,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';

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
  read_at?: string | null;
  created_at: string;
}

type AlertTab = 'rules' | 'create' | 'channels' | 'websites' | 'incidents';
type AlertCategory = 'status' | 'container' | 'service' | 'metric';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.replace(/^\[[^\]]+\]\s*/, '');
  }
  return fallback;
};

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<AlertTab>('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [servers, setServers] = useState<AlertServer[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [incidents, setIncidents] = useState<IncidentNotification[]>([]);
  const [unreadIncidentsCount, setUnreadIncidentsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [loadingWebsites, setLoadingWebsites] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);

  const [savingRule, setSavingRule] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [testingNewChannel, setTestingNewChannel] = useState(false);
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  const [testingRuleId, setTestingRuleId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Rules Tab Filter States
  const [ruleCategoryFilter, setRuleCategoryFilter] = useState<'all' | 'status' | 'container' | 'service' | 'metric'>('all');
  const [ruleStatusFilter, setRuleStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [ruleSearchQuery, setRuleSearchQuery] = useState('');

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
    setLoadingWebsites(true);
    try {
      const data = await apiClient('/websites');
      setWebsites(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingWebsites(false);
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

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchRules(), fetchChannels(), fetchServers()]);
      setLoading(false);
    };
    void loadData();
  }, []);

  useEffect(() => {
    if (activeTab === 'websites') {
      void fetchWebsites();
    } else if (activeTab === 'incidents') {
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

  // testNewChannel sends a verification notification with current unsaved form values
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

  // testExistingChannel triggers a test notification for an existing saved channel
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

  // testAlertRule triggers a simulated alert for a specific rule
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

  // createRule creates a new rule and navigates back to Rules tab
  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (selectedChannelIds.length === 0) {
      setErrorMessage('Please select at least one notification channel (Discord, Telegram, or Email).');
      return;
    }

    const isSpecialMetric = ruleMetric === 'status' || ruleMetric === 'container' || ruleMetric === 'service';
    if (ruleMetric === 'container' || ruleMetric === 'service') {
      if (!ruleTargetName.trim()) {
        setErrorMessage(`Please enter the ${ruleMetric === 'container' ? 'Container' : 'Service'} name to monitor.`);
        return;
      }
    }

    const threshold = Number.parseFloat(ruleThreshold);
    if (!isSpecialMetric && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
      setErrorMessage('Threshold percentage must be between 0 and 100%.');
      return;
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
          operator: isSpecialMetric ? '!=' : ruleOperator,
          threshold: isSpecialMetric ? 0 : threshold,
          duration_minutes: duration,
          server_id: selectedServerId === 'all' ? null : selectedServerId,
          channel_ids: selectedChannelIds,
          repeat_interval_minutes: Number.parseInt(ruleRepeatInterval, 10) || 0,
          target_name: (ruleMetric === 'container' || ruleMetric === 'service') ? ruleTargetName.trim() : null,
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

  const deleteRule = async (id: string) => {
    if (isViewer) {
      setErrorMessage('Deleting alert rules requires Admin or Operator role.');
      return;
    }
    if (!confirm('Are you sure you want to delete this alert rule?')) return;
    setErrorMessage('');

    try {
      await apiClient(`/alerts/rules/${id}`, { method: 'DELETE' });
      setRules((current) => current.filter((rule) => rule.id !== id));
      setSuccessMessage('Alert rule deleted.');
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete alert rule.'));
    }
  };

  const deleteChannel = async (id: string) => {
    if (isViewer) {
      setErrorMessage('Deleting notification channels requires Admin or Operator role.');
      return;
    }
    const channel = channels.find((item) => item.id === id);
    if (!channel) return;

    if ((channel.usage_count ?? 0) > 0) {
      setSuccessMessage('');
      setErrorMessage(
        `This channel is currently used by ${channel.usage_count} alert rule(s). Please unlink or delete those rules first.`,
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete notification channel "${channel.name}"?`)) return;
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiClient(`/alerts/channels/${id}`, { method: 'DELETE' });
      setChannels((current) => current.filter((item) => item.id !== id));
      setSelectedChannelIds((current) => current.filter((channelId) => channelId !== id));
      setSuccessMessage('Notification channel deleted.');
    } catch (error) {
      console.error(error);
      await Promise.all([fetchRules(), fetchChannels(), fetchServers()]);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete notification channel.'));
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

  // Rule counts by category
  const offlineRules = rules.filter((r) => r.metric === 'status');
  const dockerRules = rules.filter((r) => r.metric === 'container');
  const serviceRules = rules.filter((r) => r.metric === 'service');
  const metricRules = rules.filter((r) => ['cpu', 'ram', 'disk'].includes(r.metric));

  // Filter rules list
  const filteredRules = rules.filter((rule) => {
    if (ruleCategoryFilter === 'status' && rule.metric !== 'status') return false;
    if (ruleCategoryFilter === 'container' && rule.metric !== 'container') return false;
    if (ruleCategoryFilter === 'service' && rule.metric !== 'service') return false;
    if (ruleCategoryFilter === 'metric' && !['cpu', 'ram', 'disk'].includes(rule.metric)) return false;

    if (ruleStatusFilter === 'active' && !rule.enabled) return false;
    if (ruleStatusFilter === 'disabled' && rule.enabled) return false;

    if (ruleSearchQuery.trim()) {
      const q = ruleSearchQuery.toLowerCase();
      const matchName = rule.name.toLowerCase().includes(q);
      const matchTarget = (rule.target_name || '').toLowerCase().includes(q);
      const matchServer = (rule.server_name || '').toLowerCase().includes(q);
      return matchName || matchTarget || matchServer;
    }
    return true;
  });

  const enabledChannels = channels.filter((channel) => channel.enabled);

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            Alert Center
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Monitor server health, Docker containers, systemd services, resource thresholds, and website uptime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('create');
              setErrorMessage('');
              setSuccessMessage('');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            <Plus className="h-4 w-4" /> Create Alert Rule
          </button>
        </div>
      </div>

      {/* Global Alerts / Messages */}
      {(errorMessage || successMessage) && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium shadow-sm transition-all animate-in fade-in ${
            errorMessage
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {errorMessage ? <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
            <span>{errorMessage || successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => { setErrorMessage(''); setSuccessMessage(''); }}
            className="text-xs font-semibold underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Tab Navigation Bar */}
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
            <span>Alert Rules</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'rules'
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--surface-subtle)] text-[var(--color-muted)]'
            }`}>
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
            <span>Create Alert</span>
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
            <Bell className="h-4 w-4" />
            <span>Notification Channels</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              activeTab === 'channels'
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'bg-[var(--surface-subtle)] text-[var(--color-muted)]'
            }`}>
              {channels.length}
            </span>
            {activeTab === 'channels' && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500" />
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'websites'}
            onClick={() => { setActiveTab('websites'); setErrorMessage(''); setSuccessMessage(''); }}
            className={`relative flex items-center gap-2 pb-3.5 text-sm font-semibold transition-all ${
              activeTab === 'websites'
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Globe2 className="h-4 w-4" />
            <span>Website & SSL</span>
            {activeTab === 'websites' && (
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
            {unreadIncidentsCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-bold text-white">
                {unreadIncidentsCount}
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
        /* TAB 1: RULES - FULL WIDTH VIEW */
        /* ========================================================================= */
        <div className="space-y-6">
          {/* 4 Summary & Quick Action Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Server Offline */}
            <div
              onClick={() => setRuleCategoryFilter(ruleCategoryFilter === 'status' ? 'all' : 'status')}
              className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                ruleCategoryFilter === 'status'
                  ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500 shadow-md'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-cyan-500/50 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-500">
                  <Server className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                  {offlineRules.length} {offlineRules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Server Offline</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Detect lost server heartbeats (1m, 2m, 5m).
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-cyan-600 dark:text-cyan-400">
                <span>{ruleCategoryFilter === 'status' ? '✓ Filter active' : 'Click to filter'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('status');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-cyan-500"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Card 2: Docker Container */}
            <div
              onClick={() => setRuleCategoryFilter(ruleCategoryFilter === 'container' ? 'all' : 'container')}
              className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                ruleCategoryFilter === 'container'
                  ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 shadow-md'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-blue-500/50 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15 text-blue-500">
                  <Box className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                  {dockerRules.length} {dockerRules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Docker Container</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Alert on container Exited, Dead or Unhealthy states.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
                <span>{ruleCategoryFilter === 'container' ? '✓ Filter active' : 'Click to filter'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('container');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-blue-500"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Card 3: Systemd Service */}
            <div
              onClick={() => setRuleCategoryFilter(ruleCategoryFilter === 'service' ? 'all' : 'service')}
              className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                ruleCategoryFilter === 'service'
                  ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500 shadow-md'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-purple-500/50 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/15 text-purple-500">
                  <Layers className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-xs font-bold text-purple-600 dark:text-purple-400">
                  {serviceRules.length} {serviceRules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Systemd Service</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Alert when system services stop or fail.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-purple-600 dark:text-purple-400">
                <span>{ruleCategoryFilter === 'service' ? '✓ Filter active' : 'Click to filter'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('service');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-purple-500"
                >
                  + Add
                </button>
              </div>
            </div>

            {/* Card 4: Metrics CPU/RAM/Disk */}
            <div
              onClick={() => setRuleCategoryFilter(ruleCategoryFilter === 'metric' ? 'all' : 'metric')}
              className={`group cursor-pointer rounded-xl border p-4 transition-all duration-200 ${
                ruleCategoryFilter === 'metric'
                  ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500 shadow-md'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-amber-500/50 hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500">
                  <Activity className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                  {metricRules.length} {metricRules.length === 1 ? 'rule' : 'rules'}
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">CPU / RAM / Disk</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Alert on hardware resource threshold overutilization.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400">
                <span>{ruleCategoryFilter === 'metric' ? '✓ Filter active' : 'Click to filter'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('metric');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-amber-500"
                >
                  + Add
                </button>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRuleCategoryFilter('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ruleCategoryFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                All ({rules.length})
              </button>
              <button
                type="button"
                onClick={() => setRuleCategoryFilter('status')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ruleCategoryFilter === 'status'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Server className="h-3.5 w-3.5" /> Server Offline ({offlineRules.length})
              </button>
              <button
                type="button"
                onClick={() => setRuleCategoryFilter('container')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ruleCategoryFilter === 'container'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Box className="h-3.5 w-3.5" /> Docker ({dockerRules.length})
              </button>
              <button
                type="button"
                onClick={() => setRuleCategoryFilter('service')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ruleCategoryFilter === 'service'
                    ? 'bg-purple-600 text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Systemd ({serviceRules.length})
              </button>
              <button
                type="button"
                onClick={() => setRuleCategoryFilter('metric')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  ruleCategoryFilter === 'metric'
                    ? 'bg-amber-600 text-white'
                    : 'bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <Activity className="h-3.5 w-3.5" /> Metrics ({metricRules.length})
              </button>
            </div>

            {/* Status & Search */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  type="text"
                  value={ruleSearchQuery}
                  onChange={(e) => setRuleSearchQuery(e.target.value)}
                  placeholder="Search by rule name, target, or server..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent py-1.5 pl-8 pr-3 text-xs text-[var(--foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active only</option>
                <option value="disabled">Disabled only</option>
              </select>
            </div>
          </div>

          {/* Rules Full-Width List */}
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const isOffline = rule.metric === 'status';
              const isDocker = rule.metric === 'container';
              const isService = rule.metric === 'service';

              return (
                <div
                  key={rule.id}
                  className={`flex flex-col gap-4 rounded-xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${
                    rule.enabled
                      ? 'border-[var(--border-color)] bg-[var(--background-card)] hover:shadow-sm'
                      : 'border-[var(--border-color)]/50 bg-[var(--background-card)]/50 opacity-75'
                  }`}
                >
                  {/* Left: Icon & Info */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {/* Themed Icon */}
                    <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      isOffline
                        ? 'bg-cyan-500/15 text-cyan-500'
                        : isDocker
                          ? 'bg-blue-500/15 text-blue-500'
                          : isService
                            ? 'bg-purple-500/15 text-purple-500'
                            : 'bg-amber-500/15 text-amber-500'
                    }`}>
                      {isOffline && <Server className="h-5 w-5" />}
                      {isDocker && <Box className="h-5 w-5" />}
                      {isService && <Layers className="h-5 w-5" />}
                      {!isOffline && !isDocker && !isService && <Activity className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Name & Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-[var(--foreground)] truncate">{rule.name}</h4>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            rule.enabled
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                          }`}
                        >
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </span>

                        {/* Category Badge */}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isOffline
                            ? 'bg-cyan-500/15 text-cyan-500 border border-cyan-500/30'
                            : isDocker
                              ? 'bg-blue-500/15 text-blue-500 border border-blue-500/30'
                              : isService
                                ? 'bg-purple-500/15 text-purple-500 border border-purple-500/30'
                                : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                        }`}>
                          {isOffline && 'Server Offline'}
                          {isDocker && `Docker: ${rule.target_name || '*'}`}
                          {isService && `Service: ${rule.target_name || '*'}`}
                          {!isOffline && !isDocker && !isService && `${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}%`}
                        </span>
                      </div>

                      {/* Rule Trigger Description */}
                      <p className="mt-1 text-xs text-[var(--color-muted)]">
                        {isOffline
                          ? `Trigger alert when server stops reporting heartbeats for more than ${rule.duration_minutes} min`
                          : isDocker
                            ? `Alert when Docker container "${rule.target_name || '*'}" is stopped (exited/dead) or unhealthy`
                            : isService
                              ? `Alert when systemd service "${rule.target_name || '*'}" is not active (running)`
                              : `Alert when ${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}% continuously for ${rule.duration_minutes} min`}
                      </p>

                      {/* Meta Tags */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-medium text-[var(--foreground)]">
                          <Server className="h-3.5 w-3.5 text-blue-500" />
                          {rule.server_name ? `Server: ${rule.server_name}` : 'Applies to: All servers'}
                        </span>

                        {rule.repeat_interval_minutes && rule.repeat_interval_minutes > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-400">
                            <Clock className="h-3 w-3" />
                            Repeat every {rule.repeat_interval_minutes}m
                          </span>
                        ) : null}

                        {/* Linked Channels */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(rule.channels ?? []).length > 0 ? (
                            rule.channels.map((channel) => (
                              <span
                                key={channel.id}
                                className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500 uppercase"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {channel.name} ({channel.type})
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                              Dashboard only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* TEST ALERT BUTTON */}
                    <button
                      type="button"
                      disabled={testingRuleId === rule.id || !rule.channels || rule.channels.length === 0}
                      onClick={() => void testAlertRule(rule.id, rule.name)}
                      title="Send a simulated test alert for this rule to linked channels"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-500 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {testingRuleId === rule.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Test Alert
                    </button>

                    {/* SWITCH TOGGLE */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => toggleRule(rule.id, rule.enabled)}
                      title={rule.enabled ? 'Click to disable alert' : 'Click to enable alert'}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        rule.enabled ? 'bg-emerald-500' : 'bg-slate-700'
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
                      onClick={() => deleteRule(rule.id)}
                      className="p-1.5 text-rose-500 transition hover:bg-rose-500/10 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredRules.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-[var(--color-muted)]" />
                <h3 className="mt-3 font-semibold text-[var(--foreground)]">No alert rules found</h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Try adjusting your search or filters, or click below to create a new alert rule.
                </p>
                <button
                  type="button"
                  onClick={() => { setActiveTab('create'); }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" /> Create Alert Rule
                </button>
              </div>
            )}
          </div>
        </div>
      ) : activeTab === 'create' ? (
        /* ========================================================================= */
        /* TAB 2: CREATE ALERT - 4 CATEGORY SELECTOR CARDS + DEDICATED FORM */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">Select Alert Category</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Choose one of the 4 categories below. Configuration options adapt automatically.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-xs font-semibold text-blue-500 hover:text-blue-400"
            >
              ← Back to Alert Rules
            </button>
          </div>

          {/* 4 Large Visual Category Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: Server Offline */}
            <div
              onClick={() => handleSelectCategory('status')}
              className={`cursor-pointer rounded-2xl border p-5 transition-all duration-200 ${
                selectedCategory === 'status'
                  ? 'border-cyan-500 bg-cyan-500/10 ring-2 ring-cyan-500 shadow-lg'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-cyan-500/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  selectedCategory === 'status' ? 'bg-cyan-500 text-white' : 'bg-cyan-500/15 text-cyan-500'
                }`}>
                  <Server className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                  Recommended
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Server Offline</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Trigger immediately when a server stops reporting heartbeats beyond the configured threshold (1m, 2m, 5m).
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                {selectedCategory === 'status' ? '✓ Selected' : 'Select category →'}
              </div>
            </div>

            {/* Card 2: Docker Container */}
            <div
              onClick={() => handleSelectCategory('container')}
              className={`cursor-pointer rounded-2xl border p-5 transition-all duration-200 ${
                selectedCategory === 'container'
                  ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500 shadow-lg'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-blue-500/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  selectedCategory === 'container' ? 'bg-blue-500 text-white' : 'bg-blue-500/15 text-blue-500'
                }`}>
                  <Box className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  New
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Docker Container</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Automatically detect when a specified container stops (exited/dead) or becomes unhealthy.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400">
                {selectedCategory === 'container' ? '✓ Selected' : 'Select category →'}
              </div>
            </div>

            {/* Card 3: Systemd Service */}
            <div
              onClick={() => handleSelectCategory('service')}
              className={`cursor-pointer rounded-2xl border p-5 transition-all duration-200 ${
                selectedCategory === 'service'
                  ? 'border-purple-500 bg-purple-500/10 ring-2 ring-purple-500 shadow-lg'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-purple-500/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  selectedCategory === 'service' ? 'bg-purple-500 text-white' : 'bg-purple-500/15 text-purple-500'
                }`}>
                  <Layers className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-purple-600 dark:text-purple-400">
                  New
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Systemd Service</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Alert when operating system services (Nginx, MariaDB, Docker...) stop or enter a failed state.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-purple-600 dark:text-purple-400">
                {selectedCategory === 'service' ? '✓ Selected' : 'Select category →'}
              </div>
            </div>

            {/* Card 4: Metrics CPU/RAM/Disk */}
            <div
              onClick={() => handleSelectCategory('metric')}
              className={`cursor-pointer rounded-2xl border p-5 transition-all duration-200 ${
                selectedCategory === 'metric'
                  ? 'border-amber-500 bg-amber-500/10 ring-2 ring-amber-500 shadow-lg'
                  : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-amber-500/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                  selectedCategory === 'metric' ? 'bg-amber-500 text-white' : 'bg-amber-500/15 text-amber-500'
                }`}>
                  <Activity className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Metrics
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Resource Thresholds</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Alert when CPU, RAM or Disk storage utilization exceeds safety thresholds.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
                {selectedCategory === 'metric' ? '✓ Selected' : 'Select category →'}
              </div>
            </div>
          </div>

          {/* Detailed Tailored Form */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Alert Rule Parameters
            </h3>

            <form onSubmit={createRule} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Rule Name */}
                <div>
                  <label htmlFor="rule-name" className="mb-1.5 block text-sm font-semibold text-[var(--foreground)]">
                    Alert Rule Name
                  </label>
                  <input
                    id="rule-name"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Production Server Offline Alert"
                  />
                </div>

                {/* Target Agent */}
                <div>
                  <label htmlFor="rule-server" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    <Server className="h-4 w-4 text-blue-500" /> Target Server
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
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                    Select a specific server or apply universally across all connected servers.
                  </p>
                </div>
              </div>

              {/* DEDICATED FIELDS PER CATEGORY */}
              {selectedCategory === 'status' && (
                <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Server className="h-5 w-5 text-cyan-500 shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-3">
                      <div>
                        <h4 className="font-semibold text-[var(--foreground)]">Heartbeat Loss Threshold (Minutes)</h4>
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">
                          Zero double-waiting: alerts fire immediately once an agent has not reported for this duration.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[
                          { val: '1', label: '1 min', desc: 'Fastest (Recommended)' },
                          { val: '2', label: '2 min', desc: 'Flaky network tolerance' },
                          { val: '5', label: '5 min', desc: 'High tolerance' },
                          { val: '10', label: '10 min', desc: 'Secondary servers' },
                          { val: '15', label: '15 min', desc: 'Maintenance windows' },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => setRuleDuration(opt.val)}
                            className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition ${
                              ruleDuration === opt.val
                                ? 'border-cyan-500 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 font-bold ring-1 ring-cyan-500'
                                : 'border-[var(--border-color)] bg-[var(--background-card)] text-[var(--color-muted)] hover:border-cyan-500/40'
                            }`}
                          >
                            <span className="text-sm font-semibold">{opt.label}</span>
                            <span className="mt-0.5 text-[10px] opacity-75">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {selectedCategory === 'container' && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-4">
                  <div>
                    <label htmlFor="rule-target-name" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Box className="h-4 w-4 text-blue-500" /> Docker Container Name
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
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. nginx, web_app, postgres, redis, api_gateway"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Enter the exact container name as listed in <code className="font-mono text-blue-400">docker ps</code>.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    Trigger condition: Container is stopped (Exited), Dead, Unhealthy, or Crashed (Exit code != 0).
                  </div>
                </div>
              )}

              {selectedCategory === 'service' && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-4">
                  <div>
                    <label htmlFor="rule-target-name" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Layers className="h-4 w-4 text-purple-500" /> Systemd Service Name
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
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-purple-500"
                      placeholder="e.g. nginx, mariadb, docker, ssh, redis-server"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Enter the systemd service name (e.g. <code className="font-mono text-purple-400">nginx</code> or <code className="font-mono text-purple-400">nginx.service</code>).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-400">
                    <span className="inline-flex h-2 w-2 rounded-full bg-purple-500" />
                    Trigger condition: Service is inactive (stopped) or in failed state.
                  </div>
                </div>
              )}

              {selectedCategory === 'metric' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                        Comparison Operator
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

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Threshold (%)
                      </label>
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
                        className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="metric-duration" className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--foreground)]">
                      <Clock className="h-3.5 w-3.5" /> Continuous duration before alerting (Minutes)
                    </label>
                    <input
                      id="metric-duration"
                      required
                      min="1"
                      max="1440"
                      value={ruleDuration}
                      onChange={(e) => setRuleDuration(e.target.value)}
                      type="number"
                      className="w-full max-w-xs rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                    />
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Metric must exceed the threshold continuously for this duration before alerting (prevents false alarms from temporary spikes).
                    </p>
                  </div>
                </div>
              )}

              {/* RE-NOTIFICATION & RESOLVED NOTIFICATION SETTINGS */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
                    <Clock className="h-4 w-4 text-purple-500" /> Re-notification Interval
                  </label>
                  <CustomSelect
                    value={ruleRepeatInterval}
                    onChange={setRuleRepeatInterval}
                    options={[
                      { value: '0', label: 'Send once (Do not repeat)' },
                      { value: '15', label: 'Every 15 minutes while ongoing' },
                      { value: '30', label: 'Every 30 minutes while ongoing' },
                      { value: '60', label: 'Every 1 hour while ongoing' },
                      { value: '120', label: 'Every 2 hours while ongoing' },
                    ]}
                    className="w-full"
                  />
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                    Periodically resends alerts labeled with [REMINDER] until the incident is resolved.
                  </p>
                </div>

                <div className="flex flex-col justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Resolved Notification
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                    Automatically sends a green <code className="font-mono text-emerald-400">[RESOLVED]</code> notification with <strong>exact downtime duration</strong> (e.g. 2m 15s) when the service recovers!
                  </p>
                </div>
              </div>

              {/* NOTIFICATION CHANNELS SELECTOR WITH DIRECT TEST BUTTONS */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-blue-500" /> Select Notification Channels
                    </label>
                    <p className="text-xs text-[var(--color-muted)]">
                      Select at least 1 channel for instant incident delivery. You can test each channel directly.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-xs font-semibold text-blue-500 hover:text-blue-400"
                  >
                    + Add New Channel
                  </button>
                </div>

                {enabledChannels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-color)] p-6 text-center">
                    <p className="text-sm text-[var(--color-muted)]">No notification channels configured.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels')}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-500 underline"
                    >
                      Click here to configure Discord / Telegram / Email →
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {enabledChannels.map((channel) => {
                      const selected = selectedChannelIds.includes(channel.id);
                      return (
                        <div
                          key={channel.id}
                          className={`flex items-center justify-between rounded-xl border p-3 transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500'
                              : 'border-[var(--border-color)] bg-[var(--background-card)] hover:border-blue-500/30'
                          }`}
                        >
                          <div
                            onClick={() => toggleChannel(channel.id)}
                            className="flex cursor-pointer items-center gap-2.5 min-w-0 flex-1"
                          >
                            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              selected ? 'border-blue-500 bg-blue-600 text-white' : 'border-[var(--border-color)]'
                            }`}>
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[var(--foreground)] truncate">{channel.name}</p>
                              <p className="text-[10px] uppercase font-bold text-[var(--color-muted)]">{channel.type}</p>
                            </div>
                          </div>

                          {/* Instant Test Button */}
                          <button
                            type="button"
                            disabled={testingChannelId === channel.id}
                            onClick={() => void testExistingChannel(channel.id, channel.name)}
                            title="Send test notification to this channel"
                            className="shrink-0 rounded-lg border border-[var(--border-color)] px-2 py-1 text-[11px] font-semibold text-blue-500 hover:bg-blue-500/10"
                          >
                            {testingChannelId === channel.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setActiveTab('rules')}
                  className="rounded-xl border border-[var(--border-color)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingRule || enabledChannels.length === 0 || selectedChannelIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Create Alert Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : activeTab === 'channels' ? (
        /* ========================================================================= */
        /* TAB 3: CHANNELS */
        /* ========================================================================= */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Add Channel Form */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 lg:col-span-1">
            <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)] text-base">
              <Plus className="h-4 w-4 text-blue-500" /> Add Notification Channel
            </h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Connect Discord Webhook, Telegram Bot, or SMTP Email for real-time alerting.
            </p>

            <form onSubmit={createChannel} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Display Name
                </label>
                <input
                  required
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. Discord IT Alerts"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  Channel Type
                </label>
                <CustomSelect
                  value={channelType}
                  onChange={setChannelType}
                  options={[
                    { value: 'telegram', label: 'Telegram Bot' },
                    { value: 'discord', label: 'Discord Webhook' },
                    { value: 'email', label: 'Email (SMTP Server)' },
                  ]}
                  className="w-full"
                />
              </div>

              {channelType === 'telegram' ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      Bot Token
                    </label>
                    <input
                      required
                      value={channelToken}
                      onChange={(e) => setChannelToken(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)]"
                      placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    />
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                      Generated via <code className="font-mono text-blue-400">@BotFather</code> on Telegram.
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                      Chat ID
                    </label>
                    <input
                      required
                      value={channelChatId}
                      onChange={(e) => setChannelChatId(e.target.value)}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)]"
                      placeholder="e.g. -1001234567890 or personal Chat ID"
                    />
                  </div>
                </>
              ) : channelType === 'discord' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                    Discord Webhook URL
                  </label>
                  <input
                    required
                    value={channelWebhook}
                    onChange={(e) => setChannelWebhook(e.target.value)}
                    type="url"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)]"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                    In Discord: Channel Settings → Integrations → Webhooks → Copy Webhook URL.
                  </p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">SMTP Host</label>
                      <input
                        required
                        value={channelSMTPHost}
                        onChange={(e) => setChannelSMTPHost(e.target.value)}
                        type="text"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)]"
                        placeholder="smtp.gmail.com"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">Port</label>
                      <input
                        required
                        value={channelSMTPPort}
                        onChange={(e) => setChannelSMTPPort(e.target.value)}
                        type="number"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)]"
                        placeholder="587"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">Username</label>
                    <input
                      value={channelSMTPUsername}
                      onChange={(e) => setChannelSMTPUsername(e.target.value)}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">Password / App Password</label>
                    <input
                      value={channelSMTPPassword}
                      onChange={(e) => setChannelSMTPPassword(e.target.value)}
                      type="password"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">From & To Email</label>
                    <input
                      required
                      value={channelEmailFrom}
                      onChange={(e) => setChannelEmailFrom(e.target.value)}
                      type="email"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)] mb-1.5"
                      placeholder="From: alerts@domain.com"
                    />
                    <input
                      required
                      value={channelEmailTo}
                      onChange={(e) => setChannelEmailTo(e.target.value)}
                      type="email"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2 text-xs text-[var(--foreground)]"
                      placeholder="To: admin@domain.com"
                    />
                  </div>
                </>
              )}

              {/* Action Buttons: TEST + SAVE */}
              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={testNewChannel}
                  disabled={testingNewChannel || savingChannel}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-500 hover:bg-blue-500/20"
                >
                  {testingNewChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Test
                </button>

                <button
                  type="submit"
                  disabled={savingChannel || testingNewChannel}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  {savingChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Save Channel
                </button>
              </div>
            </form>
          </div>

          {/* Channels List */}
          <div className="space-y-4 lg:col-span-2">
            <div>
              <h3 className="font-bold text-[var(--foreground)] text-base">Configured Channels ({channels.length})</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Active notification channels receiving alerts from configured rules.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  className="flex flex-col justify-between rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-4 shadow-sm"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-[var(--foreground)]">{channel.name}</h4>
                        <span className="mt-1 inline-flex items-center rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-extrabold uppercase text-blue-500 border border-blue-500/20">
                          {channel.type}
                        </span>
                      </div>

                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                        Active
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-[var(--color-muted)]">
                      Used by <strong>{channel.usage_count}</strong> alert rule{channel.usage_count === 1 ? '' : 's'}.
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3">
                    <button
                      type="button"
                      disabled={testingChannelId === channel.id}
                      onClick={() => void testExistingChannel(channel.id, channel.name)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-500 hover:text-blue-400"
                    >
                      {testingChannelId === channel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Send Test
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteChannel(channel.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      title="Delete channel"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {channels.length === 0 && (
                <div className="col-span-2 rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--color-muted)]">
                  No notification channels configured yet. Add Telegram, Discord, or Email on the left.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'websites' ? (
        /* ========================================================================= */
        /* TAB 4: WEBSITES & SSL MONITORING */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">Website & SSL Certificate Monitoring</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Automated downtime alerts, [RESOLVED] recovery notifications, and SSL certificate expiration warnings.
              </p>
            </div>

            <Link
              href="/dashboard/websites"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:underline"
            >
              Manage websites in Uptime <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loadingWebsites ? (
            <div className="flex min-h-48 items-center justify-center text-[var(--color-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" /> Loading website monitoring data…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {websites.map((site) => {
                const isOnline = site.status === 'online';
                const sslDays = site.ssl_days_remaining ?? 0;
                const isSslCritical = sslDays <= 0;
                const isSslWarning = sslDays > 0 && sslDays <= 14;

                return (
                  <div
                    key={site.id}
                    className="flex flex-col justify-between rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-4 shadow-sm"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-[var(--foreground)] truncate">{site.name}</h4>
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-500 hover:underline truncate max-w-full"
                          >
                            {site.url} <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                          isOnline ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
                        }`}>
                          {isOnline ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                          {isOnline ? 'ONLINE' : 'DOWN'}
                        </span>
                      </div>

                      {/* SSL Status */}
                      <div className="mt-4 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] p-2.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-[var(--foreground)] flex items-center gap-1">
                            {isSslCritical ? (
                              <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                            ) : isSslWarning ? (
                              <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                            )}
                            SSL Certificate
                          </span>
                          <span className={`font-bold ${
                            isSslCritical ? 'text-rose-500' : isSslWarning ? 'text-amber-500' : 'text-emerald-500'
                          }`}>
                            {isSslCritical ? 'Expired' : isSslWarning ? `${sslDays} days left (Warning)` : `${sslDays} days left`}
                          </span>
                        </div>
                        {site.ssl_valid_to && (
                          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                            Expires: {new Date(site.ssl_valid_to).toLocaleDateString('en-US')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3 text-xs">
                      <span className="text-[var(--color-muted)]">
                        Latency: <strong>{site.response_time_ms || 0}ms</strong>
                      </span>

                      <Link
                        href="/dashboard/websites"
                        className="font-bold text-blue-500 hover:underline"
                      >
                        Configure channels →
                      </Link>
                    </div>
                  </div>
                );
              })}

              {websites.length === 0 && (
                <div className="col-span-3 rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center text-xs text-[var(--color-muted)]">
                  No websites registered in Uptime monitoring.
                  <div className="mt-3">
                    <Link
                      href="/dashboard/websites"
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      + Add Monitored Website
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ========================================================================= */
        /* TAB 5: INCIDENTS HISTORY */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">Incident & Recovery Timeline</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Historical timeline of FIRING and RESOLVED events with precise downtime durations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchIncidents()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>

              {unreadIncidentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllIncidentsRead()}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
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
              {incidents.map((item) => {
                const isFiring = item.kind === 'alert_firing' || item.severity === 'critical';
                const isResolved = item.kind === 'alert_resolved' || item.severity === 'resolved';
                const isReminder = item.kind === 'alert_reminder';
                const isTest = item.kind === 'test_alert';

                return (
                  <div
                    key={item.id}
                    className={`flex items-start gap-4 rounded-xl border p-4 transition ${
                      isFiring
                        ? 'border-rose-500/30 bg-rose-500/5'
                        : isResolved
                          ? 'border-emerald-500/30 bg-emerald-500/5'
                          : 'border-[var(--border-color)] bg-[var(--background-card)]'
                    }`}
                  >
                    {/* Status Badge Icon */}
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      isFiring
                        ? 'bg-rose-500 text-white'
                        : isResolved
                          ? 'bg-emerald-500 text-white'
                          : isReminder
                            ? 'bg-purple-500 text-white'
                            : 'bg-amber-500 text-white'
                    }`}>
                      {isFiring && <AlertTriangle className="h-5 w-5" />}
                      {isResolved && <CheckCircle2 className="h-5 w-5" />}
                      {isReminder && <Clock className="h-5 w-5" />}
                      {isTest && <Send className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                          isFiring
                            ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                            : isResolved
                              ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                              : 'bg-purple-500/15 text-purple-500 border border-purple-500/30'
                        }`}>
                          {isFiring ? 'FIRING' : isResolved ? 'RESOLVED' : isReminder ? 'REMINDER' : 'TEST'}
                        </span>

                        <h4 className="font-semibold text-[var(--foreground)]">{item.title}</h4>
                      </div>

                      <p className="mt-1 text-xs text-[var(--foreground)] font-medium leading-relaxed">
                        {item.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-muted)]">
                        {item.server_name && (
                          <span className="flex items-center gap-1 font-semibold text-[var(--foreground)]">
                            <Server className="h-3 w-3" /> {item.server_name}
                          </span>
                        )}
                        <span>{new Date(item.created_at).toLocaleString('en-US')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {incidents.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center text-xs text-[var(--color-muted)]">
                  No incidents recorded yet. All systems operating normally.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
