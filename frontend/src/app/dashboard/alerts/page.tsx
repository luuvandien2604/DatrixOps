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
  const [ruleName, setRuleName] = useState('Cảnh báo Máy chủ Mất kết nối (Offline)');
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

  // Khi người dùng bấm chuyển danh mục cảnh báo trên form tạo rule
  const handleSelectCategory = (cat: AlertCategory) => {
    setSelectedCategory(cat);
    setErrorMessage('');
    if (cat === 'status') {
      setRuleMetric('status');
      setRuleName('Cảnh báo Máy chủ Mất kết nối (Offline)');
      setRuleDuration('1');
      setRuleTargetName('');
    } else if (cat === 'container') {
      setRuleMetric('container');
      setRuleName(ruleTargetName ? `Giám sát Docker: ${ruleTargetName}` : 'Giám sát Docker Container');
      setRuleDuration('1');
    } else if (cat === 'service') {
      setRuleMetric('service');
      setRuleName(ruleTargetName ? `Giám sát Service: ${ruleTargetName}` : 'Giám sát Systemd Service');
      setRuleDuration('1');
    } else if (cat === 'metric') {
      setRuleMetric('cpu');
      setRuleName('Cảnh báo CPU cao (> 90%)');
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
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải danh sách quy tắc cảnh báo.'));
    }
  }

  async function fetchChannels() {
    try {
      const data = await apiClient('/alerts/channels');
      setChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải danh sách kênh thông báo.'));
    }
  }

  async function fetchServers() {
    try {
      const data = await apiClient('/servers');
      setServers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Không thể tải danh sách máy chủ/agents.'));
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

  // testNewChannel gửi thông báo thử nghiệm với cấu hình vừa nhập trước khi lưu
  const testNewChannel = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (channelType === 'discord') {
      const trimmed = channelWebhook.trim();
      if (!trimmed.startsWith('https://discord.com/api/webhooks/') && !trimmed.startsWith('https://discordapp.com/api/webhooks/')) {
        setErrorMessage('Vui lòng nhập đầy đủ Discord Webhook URL (bắt đầu bằng https://discord.com/api/webhooks/...).');
        return;
      }
    } else if (channelType === 'telegram') {
      if (!channelToken.trim() || !channelChatId.trim()) {
        setErrorMessage('Vui lòng nhập đầy đủ Telegram Bot Token và Chat ID.');
        return;
      }
    } else if (channelType === 'email') {
      if (!channelSMTPHost.trim() || !channelEmailFrom.trim() || !channelEmailTo.trim()) {
        setErrorMessage('Vui lòng nhập đầy đủ thông tin SMTP host, From và Recipient.');
        return;
      }
    }

    setTestingNewChannel(true);
    try {
      await apiClient('/alerts/channels/test', {
        method: 'POST',
        body: JSON.stringify({
          name: channelName.trim() || 'Kênh thử nghiệm',
          type: channelType,
          config: getChannelConfig(),
        }),
      });
      setSuccessMessage('Đã gửi thông báo thử nghiệm thành công! Vui lòng kiểm tra ứng dụng nhận tin.');
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Không thể gửi thông báo thử nghiệm. Vui lòng kiểm tra lại cấu hình.'));
    } finally {
      setTestingNewChannel(false);
    }
  };

  // testExistingChannel gửi thông báo thử nghiệm cho channel đã lưu trong danh sách
  const testExistingChannel = async (id: string, name: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTestingChannelId(id);
    try {
      await apiClient(`/alerts/channels/${id}/test`, { method: 'POST' });
      setSuccessMessage(`Đã gửi thông báo thử nghiệm đến kênh "${name}" thành công!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, `Gửi thông báo thử nghiệm đến kênh "${name}" thất bại.`));
    } finally {
      setTestingChannelId(null);
    }
  };

  // testAlertRule kích hoạt bắn cảnh báo mô phỏng cho một quy tắc cụ thể
  const testAlertRule = async (id: string, name: string) => {
    setErrorMessage('');
    setSuccessMessage('');
    setTestingRuleId(id);
    try {
      const res = await apiClient(`/alerts/rules/${id}/test`, { method: 'POST' });
      setSuccessMessage(res?.message || `Đã gửi thông báo cảnh báo thử nghiệm cho quy tắc "${name}" thành công!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, `Gửi cảnh báo thử nghiệm cho quy tắc "${name}" thất bại.`));
    } finally {
      setTestingRuleId(null);
    }
  };

  // createRule tạo rule mới và tự động chuyển về Tab Rules
  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (selectedChannelIds.length === 0) {
      setErrorMessage('Vui lòng chọn ít nhất một kênh nhận thông báo (Discord, Telegram, hoặc Email).');
      return;
    }

    const isSpecialMetric = ruleMetric === 'status' || ruleMetric === 'container' || ruleMetric === 'service';
    if (ruleMetric === 'container' || ruleMetric === 'service') {
      if (!ruleTargetName.trim()) {
        setErrorMessage(`Vui lòng nhập tên ${ruleMetric === 'container' ? 'Container' : 'Service'} cần theo dõi.`);
        return;
      }
    }

    const threshold = Number.parseFloat(ruleThreshold);
    if (!isSpecialMetric && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
      setErrorMessage('Ngưỡng phần trăm phải nằm trong khoảng từ 0 đến 100%.');
      return;
    }
    const duration = Number.parseInt(ruleDuration, 10);
    if (!Number.isFinite(duration) || duration < 1 || duration > 1440) {
      setErrorMessage('Thời gian duy trì điều kiện phải từ 1 đến 1440 phút.');
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
      setSuccessMessage(`Đã tạo quy tắc cảnh báo "${createdRule.name}" thành công!`);
      setActiveTab('rules');

      // Reset form
      setRuleName('Cảnh báo Máy chủ Mất kết nối (Offline)');
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
      setErrorMessage(getApiErrorMessage(error, 'Không thể tạo quy tắc cảnh báo.'));
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
      setSuccessMessage(updated.enabled ? 'Đã bật quy tắc cảnh báo.' : 'Đã tắt quy tắc cảnh báo.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể cập nhật trạng thái quy tắc cảnh báo.'));
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
          setErrorMessage('Vui lòng nhập đầy đủ Discord Webhook URL (bắt đầu bằng https://discord.com/api/webhooks/...).');
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
      setSuccessMessage(`Đã tạo kênh thông báo "${createdChannel.name}" thành công!`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Không thể tạo kênh thông báo.'));
    } finally {
      setSavingChannel(false);
    }
  };

  const deleteRule = async (id: string) => {
    if (isViewer) {
      setErrorMessage('Chỉ Admin hoặc Operator mới có quyền xóa quy tắc cảnh báo.');
      return;
    }
    if (!confirm('Bạn có chắc chắn muốn xóa quy tắc cảnh báo này?')) return;
    setErrorMessage('');

    try {
      await apiClient(`/alerts/rules/${id}`, { method: 'DELETE' });
      setRules((current) => current.filter((rule) => rule.id !== id));
      setSuccessMessage('Đã xóa quy tắc cảnh báo.');
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Không thể xóa quy tắc cảnh báo.'));
    }
  };

  const deleteChannel = async (id: string) => {
    if (isViewer) {
      setErrorMessage('Chỉ Admin hoặc Operator mới có quyền xóa kênh thông báo.');
      return;
    }
    const channel = channels.find((item) => item.id === id);
    if (!channel) return;

    if ((channel.usage_count ?? 0) > 0) {
      setSuccessMessage('');
      setErrorMessage(
        `Kênh này đang được sử dụng bởi ${channel.usage_count} quy tắc cảnh báo. Vui lòng gỡ liên kết hoặc xóa các quy tắc đó trước.`,
      );
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn xóa kênh thông báo "${channel.name}"?`)) return;
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiClient(`/alerts/channels/${id}`, { method: 'DELETE' });
      setChannels((current) => current.filter((item) => item.id !== id));
      setSelectedChannelIds((current) => current.filter((channelId) => channelId !== id));
      setSuccessMessage('Đã xóa kênh thông báo.');
    } catch (error) {
      console.error(error);
      await Promise.all([fetchRules(), fetchChannels(), fetchServers()]);
      setErrorMessage(getApiErrorMessage(error, 'Không thể xóa kênh thông báo.'));
    }
  };

  const markAllIncidentsRead = async () => {
    try {
      await apiClient('/alerts/notifications/read-all', { method: 'POST' });
      setIncidents((current) =>
        current.map((item) => ({ ...item, read_at: new Date().toISOString() })),
      );
      setUnreadIncidentsCount(0);
      setSuccessMessage('Đã đánh dấu tất cả thông báo là đã xem.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Không thể cập nhật trạng thái thông báo.'));
    }
  };

  // Thống kê số lượng rules theo từng loại
  const offlineRules = rules.filter((r) => r.metric === 'status');
  const dockerRules = rules.filter((r) => r.metric === 'container');
  const serviceRules = rules.filter((r) => r.metric === 'service');
  const metricRules = rules.filter((r) => ['cpu', 'ram', 'disk'].includes(r.metric));

  // Bộ lọc danh sách rules
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
            Trung Tâm Cảnh Báo (Alerts)
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Giám sát trạng thái máy chủ, Docker container, dịch vụ systemd, tài nguyên và website uptime.
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
            <Plus className="h-4 w-4" /> Tạo Cảnh Báo Mới
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
            Đóng
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
            <span>Quy tắc cảnh báo</span>
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
            <span>Tạo Cảnh Báo Mới</span>
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
            <span>Kênh thông báo</span>
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
            <span>Lịch sử sự cố & Phục hồi</span>
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
          <Loader2 className="mr-2 h-6 w-6 animate-spin text-blue-500" /> Đang tải cấu hình cảnh báo…
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
                  {offlineRules.length} quy tắc
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Server Offline</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Phát hiện máy chủ mất heartbeat (1m, 2m, 5m).
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-cyan-600 dark:text-cyan-400">
                <span>{ruleCategoryFilter === 'status' ? '✓ Đang lọc' : 'Click để lọc'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('status');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-cyan-500"
                >
                  + Thêm
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
                  {dockerRules.length} quy tắc
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Docker Container</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Bắt lỗi container Exited, Dead hoặc Unhealthy.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-blue-600 dark:text-blue-400">
                <span>{ruleCategoryFilter === 'container' ? '✓ Đang lọc' : 'Click để lọc'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('container');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-blue-500"
                >
                  + Thêm
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
                  {serviceRules.length} quy tắc
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">Systemd Service</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Cảnh báo dịch vụ hệ thống dừng hoặc failed.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-purple-600 dark:text-purple-400">
                <span>{ruleCategoryFilter === 'service' ? '✓ Đang lọc' : 'Click để lọc'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('service');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-purple-500"
                >
                  + Thêm
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
                  {metricRules.length} quy tắc
                </span>
              </div>
              <h3 className="mt-3 font-semibold text-[var(--foreground)]">CPU / RAM / Disk</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Cảnh báo ngưỡng quá tải tài nguyên phần cứng.
              </p>
              <div className="mt-3 flex items-center justify-between text-xs font-medium text-amber-600 dark:text-amber-400">
                <span>{ruleCategoryFilter === 'metric' ? '✓ Đang lọc' : 'Click để lọc'}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectCategory('metric');
                    setActiveTab('create');
                  }}
                  className="rounded px-1.5 py-0.5 text-[11px] font-bold underline hover:text-amber-500"
                >
                  + Thêm
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
                Tất cả ({rules.length})
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
                  placeholder="Tìm kiếm theo tên quy tắc..."
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent py-1.5 pl-8 pr-3 text-xs text-[var(--foreground)] placeholder-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={ruleStatusFilter}
                onChange={(e) => setRuleStatusFilter(e.target.value as 'all' | 'active' | 'disabled')}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] px-2.5 py-1.5 text-xs text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">Trạng thái: Tất cả</option>
                <option value="active">Đang bật (Active)</option>
                <option value="disabled">Đang tắt (Disabled)</option>
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
                          ? `Kích hoạt cảnh báo khi máy chủ ngừng gửi heartbeat quá ${rule.duration_minutes} phút`
                          : isDocker
                            ? `Cảnh báo khi Docker container "${rule.target_name || '*'}" bị dừng (exited/dead) hoặc unhealthy`
                            : isService
                              ? `Cảnh báo khi systemd service "${rule.target_name || '*'}" không ở trạng thái active (running)`
                              : `Cảnh báo khi ${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}% liên tục quá ${rule.duration_minutes} phút`}
                      </p>

                      {/* Meta Tags */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs">
                        <span className="flex items-center gap-1 font-medium text-[var(--foreground)]">
                          <Server className="h-3.5 w-3.5 text-blue-500" />
                          {rule.server_name ? `Máy chủ: ${rule.server_name}` : 'Áp dụng: Toàn bộ máy chủ'}
                        </span>

                        {rule.repeat_interval_minutes && rule.repeat_interval_minutes > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-400">
                            <Clock className="h-3 w-3" />
                            Nhắc lại mỗi {rule.repeat_interval_minutes}m
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
                              Chỉ hiển thị Dashboard
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
                      title="Gửi ngay một thông báo thử nghiệm của quy tắc này tới Discord/Telegram/Email"
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
                      title={rule.enabled ? 'Click để tắt cảnh báo' : 'Click để bật cảnh báo'}
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
                <h3 className="mt-3 font-semibold text-[var(--foreground)]">Không tìm thấy quy tắc cảnh báo nào</h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Hãy thử thay đổi bộ lọc hoặc bấm nút bên dưới để tạo quy tắc mới.
                </p>
                <button
                  type="button"
                  onClick={() => { setActiveTab('create'); }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  <Plus className="h-4 w-4" /> Tạo Cảnh Báo Ngay
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
              <h2 className="text-xl font-bold text-[var(--foreground)]">Chọn Loại Cảnh Báo Cần Thiết Lập</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Bấm vào 1 trong 4 loại bên dưới. Giao diện cấu hình sẽ tự động thay đổi tương ứng.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('rules')}
              className="text-xs font-semibold text-blue-500 hover:text-blue-400"
            >
              ← Quay lại danh sách Rules
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
                  Khuyến nghị
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Server Offline</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Kích hoạt ngay khi máy chủ ngừng gửi heartbeat quá thời gian quy định (1m, 2m, 5m).
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                {selectedCategory === 'status' ? '✓ Đang chọn' : 'Chọn loại này →'}
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
                  Mới
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Docker Container</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Tự động bắt lỗi khi container chỉ định bị dừng (exited/dead) hoặc unhealthy.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-blue-600 dark:text-blue-400">
                {selectedCategory === 'container' ? '✓ Đang chọn' : 'Chọn loại này →'}
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
                  Mới
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Systemd Service</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Cảnh báo khi dịch vụ hệ điều hành (Nginx, MariaDB, Docker...) không ở trạng thái active.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-purple-600 dark:text-purple-400">
                {selectedCategory === 'service' ? '✓ Đang chọn' : 'Chọn loại này →'}
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
                  Ngưỡng tải
                </span>
              </div>
              <h3 className="mt-4 font-bold text-[var(--foreground)]">Tài Nguyên Phần Cứng</h3>
              <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                Cảnh báo khi mức tiêu thụ CPU, RAM hoặc ổ đĩa Disk vượt ngưỡng quá tải.
              </p>
              <div className="mt-4 flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
                {selectedCategory === 'metric' ? '✓ Đang chọn' : 'Chọn loại này →'}
              </div>
            </div>
          </div>

          {/* Detailed Tailored Form */}
          <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--background-card)] p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Thiết Lập Thông Số Cảnh Báo
            </h3>

            <form onSubmit={createRule} className="mt-6 space-y-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Rule Name */}
                <div>
                  <label htmlFor="rule-name" className="mb-1.5 block text-sm font-semibold text-[var(--foreground)]">
                    Tên quy tắc cảnh báo
                  </label>
                  <input
                    id="rule-name"
                    required
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    type="text"
                    className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                    placeholder="Ví dụ: Cảnh báo Server sập nguồn"
                  />
                </div>

                {/* Target Agent */}
                <div>
                  <label htmlFor="rule-server" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    <Server className="h-4 w-4 text-blue-500" /> Máy chủ áp dụng
                  </label>
                  <CustomSelect
                    value={selectedServerId}
                    onChange={setSelectedServerId}
                    options={[
                      { value: 'all', label: 'Tất cả máy chủ (Toàn bộ Agent Fleet)' },
                      ...servers.map((server) => ({
                        value: server.id,
                        label: server.name,
                        subLabel: server.status === 'online' ? 'Online' : 'Offline',
                      })),
                    ]}
                    className="w-full"
                  />
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                    Chọn máy chủ cụ thể hoặc áp dụng tự động cho toàn bộ hệ thống.
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
                        <h4 className="font-semibold text-[var(--foreground)]">Ngưỡng phát hiện Offline (Phút)</h4>
                        <p className="text-xs text-[var(--color-muted)] mt-0.5">
                          Hệ thống đã loại bỏ double-waiting: Khi Agent không gửi tín hiệu quá mốc thời gian này, cảnh báo sẽ kích hoạt ngay!
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[
                          { val: '1', label: '1 phút', desc: 'Nhanh nhất (Khuyên dùng)' },
                          { val: '2', label: '2 phút', desc: 'Ổn định mạng chập chờn' },
                          { val: '5', label: '5 phút', desc: 'Dung thứ cao' },
                          { val: '10', label: '10 phút', desc: 'Server phụ' },
                          { val: '15', label: '15 phút', desc: 'Bảo trì dài' },
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
                      <Box className="h-4 w-4 text-blue-500" /> Tên Docker Container cần giám sát
                    </label>
                    <input
                      id="rule-target-name"
                      required
                      value={ruleTargetName}
                      onChange={(e) => {
                        setRuleTargetName(e.target.value);
                        setRuleName(e.target.value ? `Giám sát Docker: ${e.target.value}` : 'Giám sát Docker Container');
                      }}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                      placeholder="Ví dụ: nginx, web_app, postgres, redis, api_gateway"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Nhập chính xác tên container đang chạy trên Docker (xem từ lệnh <code className="font-mono text-blue-400">docker ps</code>).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    <span className="inline-flex h-2 w-2 rounded-full bg-blue-500" />
                    Điều kiện kích hoạt: Container bị dừng (Exited), Unhealthy hoặc Crash (Exit code != 0).
                  </div>
                </div>
              )}

              {selectedCategory === 'service' && (
                <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-4">
                  <div>
                    <label htmlFor="rule-target-name" className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                      <Layers className="h-4 w-4 text-purple-500" /> Tên Systemd Service cần giám sát
                    </label>
                    <input
                      id="rule-target-name"
                      required
                      value={ruleTargetName}
                      onChange={(e) => {
                        setRuleTargetName(e.target.value);
                        setRuleName(e.target.value ? `Giám sát Service: ${e.target.value}` : 'Giám sát Systemd Service');
                      }}
                      type="text"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-purple-500"
                      placeholder="Ví dụ: nginx, mariadb, docker, ssh, redis-server"
                    />
                    <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                      Nhập tên dịch vụ hệ thống (ví dụ: <code className="font-mono text-purple-400">nginx</code> hoặc <code className="font-mono text-purple-400">nginx.service</code>).
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-400">
                    <span className="inline-flex h-2 w-2 rounded-full bg-purple-500" />
                    Điều kiện kích hoạt: Dịch vụ không ở trạng thái active (running) hoặc failed.
                  </div>
                </div>
              )}

              {selectedCategory === 'metric' && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Chỉ số tài nguyên
                      </label>
                      <CustomSelect
                        value={ruleMetric}
                        onChange={(val) => {
                          setRuleMetric(val);
                          setRuleName(`Cảnh báo ${val.toUpperCase()} cao (> ${ruleThreshold}%)`);
                        }}
                        options={[
                          { value: 'cpu', label: 'CPU Usage (%)' },
                          { value: 'ram', label: 'RAM Memory (%)' },
                          { value: 'disk', label: 'Ổ đĩa Disk (%)' },
                        ]}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Điều kiện so sánh
                      </label>
                      <CustomSelect
                        value={ruleOperator}
                        onChange={setRuleOperator}
                        options={[
                          { value: '>', label: 'Lớn hơn (>)' },
                          { value: '<', label: 'Nhỏ hơn (<)' },
                        ]}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-[var(--foreground)]">
                        Ngưỡng cảnh báo (%)
                      </label>
                      <input
                        required
                        min="0"
                        max="100"
                        value={ruleThreshold}
                        onChange={(e) => {
                          setRuleThreshold(e.target.value);
                          setRuleName(`Cảnh báo ${ruleMetric.toUpperCase()} cao (> ${e.target.value}%)`);
                        }}
                        type="number"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="metric-duration" className="mb-1 flex items-center gap-1 text-xs font-semibold text-[var(--foreground)]">
                      <Clock className="h-3.5 w-3.5" /> Thời gian vi phạm liên tục trước khi báo (Phút)
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
                      Chỉ số phải liên tục vượt ngưỡng trong suốt số phút này mới gửi thông báo (tránh cảnh báo ảo khi CPU tăng đột biến ngắn).
                    </p>
                  </div>
                </div>
              )}

              {/* RE-NOTIFICATION & RESOLVED NOTIFICATION SETTINGS */}
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 pt-2">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
                    <Clock className="h-4 w-4 text-purple-500" /> Nhắc lại cảnh báo (Re-notification)
                  </label>
                  <CustomSelect
                    value={ruleRepeatInterval}
                    onChange={setRuleRepeatInterval}
                    options={[
                      { value: '0', label: 'Chỉ gửi 1 lần (Không nhắc lại)' },
                      { value: '15', label: 'Mỗi 15 phút nếu sự cố tiếp diễn' },
                      { value: '30', label: 'Mỗi 30 phút nếu sự cố tiếp diễn' },
                      { value: '60', label: 'Mỗi 1 giờ nếu sự cố tiếp diễn' },
                      { value: '120', label: 'Mỗi 2 giờ nếu sự cố tiếp diễn' },
                    ]}
                    className="w-full"
                  />
                  <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                    Hệ thống sẽ định kỳ gửi lại cảnh báo kèm nhãn [REMINDER] cho đến khi sự cố được khắc phục.
                  </p>
                </div>

                <div className="flex flex-col justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Thông báo khôi phục (Resolved Notification)
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)] leading-relaxed">
                    Tự động gửi thông báo xanh <code className="font-mono text-emerald-400">[RESOLVED]</code> kèm <strong>tổng thời gian downtime thực tế</strong> (ví dụ: 2m 15s) ngay khi máy chủ/dịch vụ hồi phục bình thường!
                  </p>
                </div>
              </div>

              {/* NOTIFICATION CHANNELS SELECTOR WITH DIRECT TEST BUTTONS */}
              <div className="space-y-2 pt-2 border-t border-[var(--border-color)]">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                      <Bell className="h-4 w-4 text-blue-500" /> Chọn Kênh Nhận Thông Báo
                    </label>
                    <p className="text-xs text-[var(--color-muted)]">
                      Chọn ít nhất 1 kênh để nhận cảnh báo tức thời. Có thể bấm &quot;Test&quot; thử ngay tại đây.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveTab('channels')}
                    className="text-xs font-semibold text-blue-500 hover:text-blue-400"
                  >
                    + Thêm Kênh Mới
                  </button>
                </div>

                {enabledChannels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border-color)] p-6 text-center">
                    <p className="text-sm text-[var(--color-muted)]">Chưa có kênh thông báo nào.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels')}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-500 underline"
                    >
                      Bấm vào đây để cấu hình Discord / Telegram / Email →
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
                            title="Bấm để bắn thông báo thử nghiệm tới kênh này"
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
                  Hủy / Quay lại
                </button>

                <button
                  type="submit"
                  disabled={savingRule || enabledChannels.length === 0 || selectedChannelIds.length === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingRule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Tạo Quy Tắc Cảnh Báo
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
              <Plus className="h-4 w-4 text-blue-500" /> Thêm Kênh Nhận Thông Báo
            </h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Kết nối Discord Webhook, Telegram Bot hoặc Email SMTP để nhận cảnh báo tức thời.
            </p>

            <form onSubmit={createChannel} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  Tên kênh hiển thị
                </label>
                <input
                  required
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  type="text"
                  className="w-full rounded-xl border border-[var(--border-color)] bg-transparent p-2.5 text-sm text-[var(--foreground)] focus:ring-1 focus:ring-blue-500"
                  placeholder="Ví dụ: Discord IT Alerts"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-[var(--foreground)]">
                  Loại nền tảng
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
                      Tạo từ <code className="font-mono text-blue-400">@BotFather</code> trên Telegram.
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
                      placeholder="Ví dụ: -1001234567890 hoặc ID cá nhân"
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
                    Lấy trong: Discord → Channel Settings → Integrations → Webhooks.
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
                  Gửi Thử Nghiệm
                </button>

                <button
                  type="submit"
                  disabled={savingChannel || testingNewChannel}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  {savingChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Lưu Kênh
                </button>
              </div>
            </form>
          </div>

          {/* Channels List */}
          <div className="space-y-4 lg:col-span-2">
            <div>
              <h3 className="font-bold text-[var(--foreground)] text-base">Danh Sách Kênh Đã Cấu Hình ({channels.length})</h3>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Các kênh thông báo đang hoạt động sẽ nhận tin cảnh báo từ các rule tương ứng.
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
                      Đang được sử dụng bởi <strong>{channel.usage_count}</strong> quy tắc cảnh báo.
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
                      Gửi thử nghiệm (Test)
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteChannel(channel.id)}
                      className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                      title="Xóa kênh"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              {channels.length === 0 && (
                <div className="col-span-2 rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-xs text-[var(--color-muted)]">
                  Chưa có kênh thông báo nào. Vui lòng thêm Telegram, Discord hoặc Email ở bên trái.
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
              <h2 className="text-xl font-bold text-[var(--foreground)]">Cảnh Báo Giám Sát Website & Chứng Chỉ SSL</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Tự động gửi cảnh báo đỏ khi website DOWN, cảnh báo xanh [RESOLVED] khi phục hồi, và cảnh báo cam khi SSL còn dưới 14 ngày.
              </p>
            </div>

            <Link
              href="/dashboard/websites"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:underline"
            >
              Quản lý chi tiết tại trang Uptime <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loadingWebsites ? (
            <div className="flex min-h-48 items-center justify-center text-[var(--color-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" /> Đang tải danh sách Website…
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
                            Chứng chỉ SSL
                          </span>
                          <span className={`font-bold ${
                            isSslCritical ? 'text-rose-500' : isSslWarning ? 'text-amber-500' : 'text-emerald-500'
                          }`}>
                            {isSslCritical ? 'Đã hết hạn' : isSslWarning ? `Còn ${sslDays} ngày (Cảnh báo)` : `Còn ${sslDays} ngày`}
                          </span>
                        </div>
                        {site.ssl_valid_to && (
                          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                            Hạn dùng: {new Date(site.ssl_valid_to).toLocaleDateString('vi-VN')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-[var(--border-color)] pt-3 text-xs">
                      <span className="text-[var(--color-muted)]">
                        Độ trễ: <strong>{site.response_time_ms || 0}ms</strong>
                      </span>

                      <Link
                        href="/dashboard/websites"
                        className="font-bold text-blue-500 hover:underline"
                      >
                        Chỉnh sửa kênh nhận tin →
                      </Link>
                    </div>
                  </div>
                );
              })}

              {websites.length === 0 && (
                <div className="col-span-3 rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center text-xs text-[var(--color-muted)]">
                  Chưa có website nào trong hệ thống giám sát Uptime.
                  <div className="mt-3">
                    <Link
                      href="/dashboard/websites"
                      className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      + Thêm Website Giám Sát Ngay
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
              <h2 className="text-xl font-bold text-[var(--foreground)]">Lịch Sử Sự Cố & Phục Hồi (Incidents Timeline)</h2>
              <p className="mt-1 text-sm text-[var(--color-muted)]">
                Dòng thời gian ghi nhận thực tế các sự cố FIRING và RESOLVED kèm tổng thời gian gián đoạn (Downtime).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void fetchIncidents()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-subtle)]"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Làm mới
              </button>

              {unreadIncidentsCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllIncidentsRead()}
                  className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  Đánh dấu đã đọc tất cả
                </button>
              )}
            </div>
          </div>

          {loadingIncidents ? (
            <div className="flex min-h-48 items-center justify-center text-[var(--color-muted)]">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-500" /> Đang tải lịch sử sự cố…
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
                          {isFiring ? 'SỰ CỐ ĐANG DIỄN RA' : isResolved ? 'ĐÃ KHÔI PHỤC' : isReminder ? 'NHẮC LẠI' : 'THỬ NGHIỆM'}
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
                        <span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {incidents.length === 0 && (
                <div className="rounded-xl border border-dashed border-[var(--border-color)] p-12 text-center text-xs text-[var(--color-muted)]">
                  Chưa có sự cố nào được ghi nhận. Hệ thống đang vận hành hoàn toàn an toàn và ổn định.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
