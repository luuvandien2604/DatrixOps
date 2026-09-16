'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from 'react';
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
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import CustomSelect from '@/components/CustomSelect';
import ConfirmModal from '@/components/ConfirmModal';

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
type AlertCategory = 'status' | 'container' | 'service' | 'metric' | 'website';

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

  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchRules(), fetchChannels(), fetchServers(), fetchWebsites()]);
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

    const isSpecialMetric = ruleMetric === 'status' || ruleMetric === 'container' || ruleMetric === 'service' || ruleMetric === 'website' || ruleMetric === 'ssl';
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
          operator: isSpecialMetric ? '==' : ruleOperator,
          threshold: ruleMetric === 'ssl' ? (threshold || 14) : isSpecialMetric ? 0 : threshold,
          duration_minutes: duration,
          server_id: (selectedServerId === 'all' || selectedCategory === 'website') ? null : selectedServerId,
          channel_ids: selectedChannelIds,
          repeat_interval_minutes: Number.parseInt(ruleRepeatInterval, 10) || 0,
          target_name: (ruleMetric === 'container' || ruleMetric === 'service' || ruleMetric === 'website' || ruleMetric === 'ssl') ? (ruleTargetName.trim() || null) : null,
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
    setEditOperator(rule.operator || '>');
    setEditThreshold(rule.threshold ?? 0);
    setEditDuration(rule.duration_minutes || 1);
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
        target_name: (editMetric === 'container' || editMetric === 'service') ? (editTargetName.trim() || null) : null,
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

  // Filter rules list
  const filteredRules = rules.filter((rule) => {
    if (ruleStatusFilter === 'active' && !rule.enabled) return false;
    if (ruleStatusFilter === 'disabled' && rule.enabled) return false;

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

  const enabledChannels = channels.filter((channel) => channel.enabled);

  return (
    <div className="space-y-6">
      {/* Top Heading */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
          Alert Center
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Monitor server health, Docker containers, systemd services, resource thresholds, and website uptime.
        </p>
      </div>

      {/* Global Alerts / Messages */}
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
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative w-full sm:w-80 md:w-96">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)] z-10" />
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

            {/* Status Filter */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[var(--color-muted)] font-medium">Status:</span>
              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="h-9 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-3 text-xs font-medium text-[var(--foreground)] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition cursor-pointer"
              >
                <option value="all">All Statuses ({rules.length})</option>
                <option value="active">Active only ({rules.filter((r) => r.enabled).length})</option>
                <option value="disabled">Disabled only ({rules.filter((r) => !r.enabled).length})</option>
              </select>
            </div>
          </div>          {/* Rules Full-Width List */}
          <div className="space-y-3">
            {filteredRules.map((rule) => {
              const isOffline = rule.metric === 'status';
              const isDocker = rule.metric === 'container';
              const isService = rule.metric === 'service';
              const isWebsite = rule.metric === 'website';
              const isSSL = rule.metric === 'ssl';

              return (
                <div
                  key={rule.id}
                  className={`flex flex-col gap-3 rounded-xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${
                    rule.enabled
                      ? 'border-[var(--border-color)] bg-[var(--background-card)] hover:shadow-sm'
                      : 'border-[var(--border-color)]/50 bg-[var(--background-card)]/50 opacity-75'
                  }`}
                >
                  {/* Left: Icon & Streamlined Info */}
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Themed Icon */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                      isOffline
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-800/40'
                        : isDocker
                          ? 'bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800/40'
                          : isService
                            ? 'bg-purple-50 text-purple-700 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/40'
                            : (isWebsite || isSSL)
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/40'
                              : 'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/40'
                    }`}>
                      {isOffline && <Server className="h-5 w-5" />}
                      {isDocker && <Box className="h-5 w-5" />}
                      {isService && <Layers className="h-5 w-5" />}
                      {(isWebsite || isSSL) && <Globe2 className="h-5 w-5" />}
                      {!isOffline && !isDocker && !isService && !isWebsite && !isSSL && <Activity className="h-5 w-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Row 1: Name & Badges */}
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-[var(--foreground)] truncate text-sm">{rule.name}</h4>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
                            rule.enabled
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                              : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                          }`}
                        >
                          {rule.enabled ? 'Active' : 'Disabled'}
                        </span>

                        {/* Category / Condition Badge */}
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                          isOffline
                            ? 'bg-cyan-50 text-cyan-800 border-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800/60'
                            : isDocker
                              ? 'bg-blue-50 text-blue-800 border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
                              : isService
                                ? 'bg-purple-50 text-purple-800 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/60'
                                : (isWebsite || isSSL)
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                  : 'bg-amber-50 text-amber-800 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                        }`}>
                          {isOffline && `Server Offline (${rule.duration_minutes}m)`}
                          {isDocker && `Docker: ${rule.target_name || '*'}`}
                          {isService && `Service: ${rule.target_name || '*'}`}
                          {isWebsite && 'Website DOWN'}
                          {isSSL && `SSL Expiry (≤ ${rule.threshold || 14}d)`}
                          {!isOffline && !isDocker && !isService && !isWebsite && !isSSL && `${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}% (${rule.duration_minutes}m)`}
                        </span>
                      </div>

                      {/* Row 2: Target, Repeat & Channel Chips */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-xs">
                        <span className="flex items-center gap-1 font-medium text-[var(--foreground)] opacity-90">
                          {(isWebsite || isSSL) ? (
                            <>
                              <Globe2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              {rule.target_name ? rule.target_name : 'All websites'}
                            </>
                          ) : (
                            <>
                              <Server className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                              {rule.server_name ? rule.server_name : 'All servers'}
                            </>
                          )}
                        </span>

                        {rule.repeat_interval_minutes && rule.repeat_interval_minutes > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200/80 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60">
                            <Clock className="h-3 w-3" />
                            Repeat {rule.repeat_interval_minutes}m
                          </span>
                        ) : null}

                        {/* Linked Channels */}
                        <div className="flex flex-wrap items-center gap-1">
                          {(rule.channels ?? []).length > 0 ? (
                            rule.channels.map((channel) => (
                              <span
                                key={channel.id}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                              >
                                {channel.name} ({channel.type})
                              </span>
                            ))
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                              Dashboard only
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    {/* EDIT RULE BUTTON */}
                    <button
                      type="button"
                      disabled={isViewer}
                      onClick={() => openEditModal(rule)}
                      title={isViewer ? 'Editing rules requires Operator or Admin role' : 'Edit alert rule'}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-subtle)] px-2.5 py-1.5 text-xs font-bold text-[var(--foreground)] transition hover:bg-[var(--border-color)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Pencil className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                      Edit
                    </button>

                    {/* TEST RULE BUTTON */}
                    <button
                      type="button"
                      disabled={testingRuleId === rule.id || !rule.channels || rule.channels.length === 0}
                      onClick={() => void testAlertRule(rule.id, rule.name)}
                      title="Send a simulated test alert for this rule to linked channels"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60 px-3 py-1.5 text-xs font-semibold transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {testingRuleId === rule.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Test
                    </button>

                    {/* SWITCH TOGGLE */}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => toggleRule(rule.id, rule.enabled)}
                      title={rule.enabled ? 'Click to disable alert' : 'Click to enable alert'}
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
                      className="p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg transition"
                      title="Delete rule"
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
        /* TAB 2: CREATE ALERT - DIRECT INTEGRATED FORM */
        /* ========================================================================= */
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[var(--foreground)]">Create Alert Rule</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Define automated conditions to monitor system health, workloads, and web endpoints.
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

          {/* Form */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Alert Rule Parameters
            </h3>

            <form onSubmit={createRule} className="mt-6 space-y-6">
              {/* Category Selector integrated directly into form */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">
                  Alert Category
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {[
                    { id: 'status', label: 'Server Offline', icon: Server },
                    { id: 'container', label: 'Docker Container', icon: Box },
                    { id: 'service', label: 'Systemd Service', icon: Layers },
                    { id: 'metric', label: 'Resource Thresholds', icon: Activity },
                    { id: 'website', label: 'Website & SSL', icon: Globe2 },
                  ].map((cat) => {
                    const isSelected = selectedCategory === cat.id;
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategory(cat.id as AlertCategory)}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/15 text-blue-400 ring-1 ring-blue-500 shadow-sm'
                            : 'border-[var(--border-color)] bg-[var(--surface-subtle)] text-[var(--color-muted)] hover:text-[var(--foreground)] hover:border-[var(--border-color)]'
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
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

                {/* Target Agent / Website */}
                {selectedCategory === 'website' ? (
                  <div>
                    <label htmlFor="rule-website" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Globe2 className="h-4 w-4 text-emerald-500" /> Target Monitored Website
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
                        { value: 'all', label: 'All Monitored Websites' },
                        ...websites.map((w) => ({
                          value: w.name,
                          label: w.name,
                          subLabel: w.url,
                        })),
                      ]}
                      className="w-full"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Select a specific website or apply universally across all monitored sites.
                    </p>
                  </div>
                ) : (
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
                )}
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

              {selectedCategory === 'website' && (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                      Alert Trigger Condition
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {[
                        {
                          id: 'website_down',
                          metric: 'website',
                          threshold: '0',
                          label: 'Website DOWN',
                          desc: 'Immediately on HTTP fail / timeout',
                          defaultName: ruleTargetName ? `Website Down: ${ruleTargetName}` : 'Website Down Alert',
                        },
                        {
                          id: 'ssl_14d',
                          metric: 'ssl',
                          threshold: '14',
                          label: 'SSL Expiring (≤ 14 days)',
                          desc: 'Critical renewal warning',
                          defaultName: ruleTargetName ? `SSL Expiration (<= 14d): ${ruleTargetName}` : 'SSL Certificate Expiration Alert (<= 14 days)',
                        },
                        {
                          id: 'ssl_30d',
                          metric: 'ssl',
                          threshold: '30',
                          label: 'SSL Expiring (≤ 30 days)',
                          desc: 'Early renewal notice',
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
                            className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                              isSelected
                                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-bold ring-1 ring-emerald-500'
                                : 'border-[var(--border-color)] bg-[var(--background-card)] text-[var(--color-muted)] hover:border-emerald-500/40'
                            }`}
                          >
                            <span className="text-sm font-semibold">{item.label}</span>
                            <span className="mt-0.5 text-[11px] opacity-75">{item.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    {ruleMetric === 'website'
                      ? 'Monitored probe: Alerts immediately as soon as a website probe fails or returns non-2xx status code.'
                      : `Monitored probe: Alerts when SSL certificate has ${ruleThreshold || 14} days or less remaining before expiration.`}
                  </div>
                </div>
              )}

              {/* RE-NOTIFICATION INTERVAL */}
              <div className="max-w-md pt-2">
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
                      onClick={() => {
                        if (channel.usage_count && channel.usage_count > 0) {
                          setErrorMessage(`This channel is currently used by ${channel.usage_count} alert rule(s). Please unlink or delete those rules first.`);
                          return;
                        }
                        setDeleteChannelTarget(channel);
                      }}
                      className="p-1.5 text-rose-600 hover:bg-rose-100 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg transition"
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
                className="h-8 inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)] transition"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>

              {unreadIncidentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllIncidentsRead()}
                  className="h-8 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-500 shadow-sm transition"
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
                      className={`relative overflow-hidden rounded-2xl border transition-all ${
                        isFiring
                          ? 'border-l-4 border-l-rose-500 border-[var(--border-color)] bg-[var(--background-card)]'
                          : isResolved
                            ? 'border-l-4 border-l-emerald-500 border-[var(--border-color)] bg-[var(--background-card)]'
                            : isReminder
                              ? 'border-l-4 border-l-amber-500 border-[var(--border-color)] bg-[var(--background-card)]'
                              : 'border-l-4 border-l-blue-500 border-[var(--border-color)] bg-[var(--background-card)]'
                      } p-5 shadow-sm hover:shadow-md`}
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
                            <p className="text-xs text-[var(--color-muted)] mt-0.5">
                              Rule: {ruleName}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge Pill */}
                        <div className="flex items-center gap-2 shrink-0">
                          {isUnread && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 px-2.5 py-0.5 text-[10px] font-bold text-blue-500 uppercase tracking-wider">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                              Unread
                            </span>
                          )}
                          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold tracking-wide border ${
                            isFiring
                              ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
                              : isResolved
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                                : isReminder
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                                  : 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60'
                          }`}>
                            {isFiring ? 'Failed' : isResolved ? 'Active' : isReminder ? 'Reminder' : 'Test'}
                          </span>
                        </div>
                      </div>

                      {/* 2-Column Key/Value Grid */}
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-y-3.5 gap-x-6">
                        <div>
                          <span className="block text-xs text-[var(--color-muted)] mb-0.5 font-normal">Server</span>
                          <span className="font-bold text-[var(--foreground)] text-sm tracking-wide">{serverName}</span>
                        </div>

                        {isResolved ? (
                          <>
                            <div>
                              <span className="block text-xs text-[var(--color-muted)] mb-0.5 font-normal">Downtime</span>
                              <span className="font-bold text-[var(--foreground)] text-sm tracking-wide">{downtime}</span>
                            </div>
                            <div>
                              <span className="block text-xs text-[var(--color-muted)] mb-0.5 font-normal">Failed at</span>
                              <span className="font-bold text-[var(--foreground)] text-sm tracking-wide">{failedAt}</span>
                            </div>
                            <div>
                              <span className="block text-xs text-[var(--color-muted)] mb-0.5 font-normal">Recovered at</span>
                              <span className="font-bold text-[var(--foreground)] text-sm tracking-wide">{recoveredAt}</span>
                            </div>
                          </>
                        ) : (
                          <div>
                            <span className="block text-xs text-[var(--color-muted)] mb-0.5 font-normal">Failed at</span>
                            <span className="font-bold text-[var(--foreground)] text-sm tracking-wide">{failedAt}</span>
                          </div>
                        )}
                      </div>

                      {/* Horizontal Divider */}
                      <div className="border-t border-[var(--border-color)] my-3.5" />

                      {/* Footer */}
                      <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                        <span className="font-normal">DatrixOps Monitoring</span>
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => void markIncidentRead(item.id)}
                            className="text-[11px] font-semibold text-blue-500 hover:text-blue-400 transition flex items-center gap-1.5"
                          >
                            <Check className="h-3.5 w-3.5" /> Mark as read
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

              {incidents.filter((item) => {
                if (incidentFilter === 'unread') return !item.read_at;
                if (incidentFilter === 'read') return Boolean(item.read_at);
                return true;
              }).length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center text-xs text-[var(--color-muted)]">
                  {incidentFilter === 'unread'
                    ? 'No unread incidents! All notifications have been reviewed.'
                    : incidentFilter === 'read'
                      ? 'No read incidents yet.'
                      : 'No incidents recorded yet. All systems operating normally.'}
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
                  className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
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
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
                    />
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
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
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
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
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
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
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
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500 outline-none"
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
                  className="h-9 px-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-subtle)] hover:bg-[var(--border-color)] text-xs font-semibold text-[var(--foreground)] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition inline-flex items-center gap-2 disabled:opacity-50"
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
