'use client';

import React, { useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle2,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

interface RuleChannel {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
}

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  duration_minutes: number;
  enabled: boolean;
  channel_ids: string[];
  channels: RuleChannel[];
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  enabled: boolean;
  usage_count: number;
}

type AlertTab = 'rules' | 'channels';

// getApiErrorMessage giữ nguyên thông báo lỗi có mã từ apiClient.
// Nhờ vậy lỗi 409 CHANNEL_IN_USE không bị nhầm với lỗi 500 hoặc lỗi mạng.
const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message.replace(/^\[[^\]]+\]\s*/, '');
  }
  return fallback;
};

// AlertsPage quản lý hai phần riêng biệt:
// - Channels: tạo nơi nhận thông báo.
// - Rules: tạo điều kiện cảnh báo và chọn channel sẽ nhận thông báo của rule đó.
export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState<AlertTab>('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Rule form state.
  const [ruleName, setRuleName] = useState('');
  const [ruleMetric, setRuleMetric] = useState('cpu');
  const [ruleOperator, setRuleOperator] = useState('>');
  const [ruleThreshold, setRuleThreshold] = useState('90');
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);

  // Channel form state.
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('telegram');
  const [channelToken, setChannelToken] = useState('');
  const [channelChatId, setChannelChatId] = useState('');
  const [channelWebhook, setChannelWebhook] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchRules(), fetchChannels()]);
      setLoading(false);
    };
    void loadData();
  }, []);

  // fetchRules tải rule cùng danh sách channel đã liên kết từ backend.
  const fetchRules = async () => {
    try {
      const data = await apiClient('/alerts/rules');
      setRules(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to load alert rules.'));
    }
  };

  // fetchChannels tải channel để hiển thị ở tab Channels và bộ chọn trong Rules.
  const fetchChannels = async () => {
    try {
      const data = await apiClient('/alerts/channels');
      setChannels(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to load notification channels.'));
    }
  };

  // toggleChannel thêm hoặc bỏ một channel khỏi rule đang tạo.
  const toggleChannel = (channelId: string) => {
    setSelectedChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  };

  // createRule gửi channel_ids để backend tạo rule và liên kết channel trong một transaction.
  const createRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (selectedChannelIds.length === 0) {
      setErrorMessage('Select at least one notification channel.');
      return;
    }

    const threshold = Number.parseFloat(ruleThreshold);
    if (ruleMetric !== 'status' && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
      setErrorMessage('Threshold must be between 0 and 100.');
      return;
    }

    setSavingRule(true);
    try {
      const createdRule = await apiClient('/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName.trim(),
          metric: ruleMetric,
          operator: ruleOperator,
          threshold: ruleMetric === 'status' ? 0 : threshold,
          duration_minutes: 1,
          channel_ids: selectedChannelIds,
        }),
      });

      setRules((current) => [createdRule, ...current]);
      setRuleName('');
      setRuleThreshold('90');
      setSelectedChannelIds([]);
      setSuccessMessage('Alert rule created with its notification channels.');
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to create alert rule.'));
    } finally {
      setSavingRule(false);
    }
  };

  // createChannel tạo channel, đưa channel vừa tạo vào danh sách Rules,
  // tự chọn channel đó và chuyển về tab Rules để người dùng tiếp tục tạo alert.
  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setSavingChannel(true);

    try {
      const config = channelType === 'telegram'
        ? { bot_token: channelToken.trim(), chat_id: channelChatId.trim() }
        : { webhook_url: channelWebhook.trim() };

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
      setActiveTab('rules');
      setSuccessMessage(`${createdChannel.name} is ready and selected for the new rule.`);
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to create notification channel.'));
    } finally {
      setSavingChannel(false);
    }
  };

  // deleteRule xóa rule; bảng liên kết channel được database cascade tự động.
  const deleteRule = async (id: string) => {
    if (!confirm('Delete this alert rule?')) return;
    setErrorMessage('');

    try {
      await apiClient(`/alerts/rules/${id}`, { method: 'DELETE' });
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch (error) {
      console.error(error);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete alert rule.'));
    }
  };

  // deleteChannel chỉ chặn ở giao diện khi backend xác nhận usage_count > 0.
  // Mọi lỗi khác được hiển thị đúng thông báo thay vì mặc định kết luận channel đang được dùng.
  const deleteChannel = async (id: string) => {
    const channel = channels.find((item) => item.id === id);
    if (!channel) return;

    if ((channel.usage_count ?? 0) > 0) {
      setSuccessMessage('');
      setErrorMessage(
        `This channel is used by ${channel.usage_count} alert rule${channel.usage_count === 1 ? '' : 's'}. Delete or update those rules first.`,
      );
      return;
    }

    if (!confirm(`Delete notification channel "${channel.name}"?`)) return;
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await apiClient(`/alerts/channels/${id}`, { method: 'DELETE' });
      setChannels((current) => current.filter((item) => item.id !== id));
      setSelectedChannelIds((current) => current.filter((channelId) => channelId !== id));
      setSuccessMessage('Notification channel deleted.');
    } catch (error) {
      console.error(error);
      // Đồng bộ lại usage_count vì rule có thể vừa được tạo ở tab khác hoặc phiên khác.
      await Promise.all([fetchRules(), fetchChannels()]);
      setErrorMessage(getApiErrorMessage(error, 'Unable to delete notification channel.'));
    }
  };

  const enabledChannels = channels.filter((channel) => channel.enabled);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">Alerts</h1>
      </div>

      {(errorMessage || successMessage) && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            errorMessage
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {errorMessage || successMessage}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Alert configuration"
        className="flex gap-5 border-b border-[var(--border-color)]"
      >
        {(['rules', 'channels'] as AlertTab[]).map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setActiveTab(tab);
                setErrorMessage('');
                setSuccessMessage('');
              }}
              className={`relative pb-3 text-sm font-semibold transition-colors ${
                active
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {tab === 'rules' ? 'Rules' : 'Channels'}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-blue-500"
                />
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center text-[var(--color-muted)]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading alerts…
        </div>
      ) : activeTab === 'rules' ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 md:col-span-1">
            <h3 className="mb-4 flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <Plus className="h-4 w-4" /> Add Rule
            </h3>

            <form onSubmit={createRule} className="space-y-4">
              <div>
                <label htmlFor="rule-name" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                  Alert name
                </label>
                <input
                  id="rule-name"
                  required
                  value={ruleName}
                  onChange={(event) => setRuleName(event.target.value)}
                  type="text"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                  placeholder="Example: High CPU usage"
                />
              </div>

              <div>
                <label htmlFor="rule-metric" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                  Metric
                </label>
                <select
                  id="rule-metric"
                  value={ruleMetric}
                  onChange={(event) => setRuleMetric(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] p-2 text-sm text-[var(--foreground)]"
                >
                  <option value="cpu">CPU Usage</option>
                  <option value="ram">RAM Usage</option>
                  <option value="status">Offline status</option>
                </select>
              </div>

              {ruleMetric !== 'status' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor="rule-operator" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                      Condition
                    </label>
                    <select
                      id="rule-operator"
                      value={ruleOperator}
                      onChange={(event) => setRuleOperator(event.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] p-2 text-sm text-[var(--foreground)]"
                    >
                      <option value=">">Greater than (&gt;)</option>
                      <option value="<">Less than (&lt;)</option>
                    </select>
                  </div>

                  <div className="flex-1">
                    <label htmlFor="rule-threshold" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                      Threshold (%)
                    </label>
                    <input
                      id="rule-threshold"
                      required
                      min="0"
                      max="100"
                      value={ruleThreshold}
                      onChange={(event) => setRuleThreshold(event.target.value)}
                      type="number"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                    />
                  </div>
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
                    <Bell className="h-4 w-4" /> Notification channels
                  </label>
                  {enabledChannels.length > 0 && (
                    <span className="text-xs font-medium text-[var(--color-muted)]">
                      {selectedChannelIds.length} selected
                    </span>
                  )}
                </div>

                {enabledChannels.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-[var(--border-color)] p-4 text-center">
                    <p className="text-sm text-[var(--color-muted)]">No notification channels available.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('channels')}
                      className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-500 hover:text-blue-400"
                    >
                      <Plus className="h-4 w-4" /> Create a channel
                    </button>
                  </div>
                ) : (
                  <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-[var(--border-color)] p-2">
                    {enabledChannels.map((channel) => {
                      const selected = selectedChannelIds.includes(channel.id);
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          onClick={() => toggleChannel(channel.id)}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                            selected
                              ? 'border-blue-500/50 bg-blue-500/10'
                              : 'border-transparent hover:border-[var(--border-color)] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                          }`}
                        >
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                              selected
                                ? 'border-blue-500 bg-blue-500 text-white'
                                : 'border-[var(--border-color)]'
                            }`}
                          >
                            {selected && <Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
                              {channel.name}
                            </span>
                            <span className="block text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted)]">
                              {channel.type}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={savingRule || enabledChannels.length === 0 || selectedChannelIds.length === 0}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingRule && <Loader2 className="h-4 w-4 animate-spin" />}
                Add Rule
              </button>
            </form>
          </div>

          <div className="space-y-4 md:col-span-2">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-4"
              >
                <div className="min-w-0">
                  <h4 className="font-semibold text-[var(--foreground)]">{rule.name}</h4>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">
                    {rule.metric === 'status'
                      ? 'Alert when server is offline'
                      : `${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}%`}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(rule.channels ?? []).length > 0 ? (
                      rule.channels.map((channel) => (
                        <span
                          key={channel.id}
                          className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {channel.name}
                          <span className="text-[10px] uppercase opacity-70">{channel.type}</span>
                        </span>
                      ))
                    ) : (
                      <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500">
                        Dashboard only · no channel selected
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  aria-label={`Delete rule ${rule.name}`}
                  onClick={() => deleteRule(rule.id)}
                  className="shrink-0 p-2 text-rose-500 hover:text-rose-400"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            ))}

            {rules.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-[var(--color-muted)]">
                No alert rules yet.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-5 md:col-span-1">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-[var(--foreground)]">
              <Plus className="h-4 w-4" /> Add Channel
            </h3>
            <p className="mb-4 text-sm text-[var(--color-muted)]">
              Create destinations here. They will appear in Notification channels when you add a rule.
            </p>

            <form onSubmit={createChannel} className="space-y-4">
              <div>
                <label htmlFor="channel-name" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                  Channel name
                </label>
                <input
                  id="channel-name"
                  required
                  value={channelName}
                  onChange={(event) => setChannelName(event.target.value)}
                  type="text"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                  placeholder="Example: IT Support"
                />
              </div>

              <div>
                <label htmlFor="channel-type" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                  Platform
                </label>
                <select
                  id="channel-type"
                  value={channelType}
                  onChange={(event) => setChannelType(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background-card)] p-2 text-sm text-[var(--foreground)]"
                >
                  <option value="telegram">Telegram Bot</option>
                  <option value="discord">Discord Webhook</option>
                </select>
              </div>

              {channelType === 'telegram' ? (
                <>
                  <div>
                    <label htmlFor="channel-token" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                      Bot Token
                    </label>
                    <input
                      id="channel-token"
                      required
                      value={channelToken}
                      onChange={(event) => setChannelToken(event.target.value)}
                      type="password"
                      autoComplete="off"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                    />
                  </div>
                  <div>
                    <label htmlFor="channel-chat-id" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                      Chat ID
                    </label>
                    <input
                      id="channel-chat-id"
                      required
                      value={channelChatId}
                      onChange={(event) => setChannelChatId(event.target.value)}
                      type="text"
                      className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="channel-webhook" className="mb-1 block text-sm font-medium text-[var(--color-muted)]">
                    Webhook URL
                  </label>
                  <input
                    id="channel-webhook"
                    required
                    value={channelWebhook}
                    onChange={(event) => setChannelWebhook(event.target.value)}
                    type="url"
                    autoComplete="off"
                    className="w-full rounded-lg border border-[var(--border-color)] bg-transparent p-2 text-sm text-[var(--foreground)]"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={savingChannel}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingChannel && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Channel
              </button>
            </form>
          </div>

          <div className="space-y-4 md:col-span-2">
            {channels.map((channel) => {
              const usageCount = channel.usage_count ?? 0;
              const inUse = usageCount > 0;

              return (
                <div
                  key={channel.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] p-4"
                >
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-2 font-semibold text-[var(--foreground)]">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-blue-500" />
                      <span className="truncate">{channel.name}</span>
                    </h4>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                        {channel.type}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          inUse
                            ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
                            : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {inUse
                          ? `Used by ${usageCount} rule${usageCount === 1 ? '' : 's'}`
                          : 'Not used by any rule'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={
                      inUse
                        ? `Channel ${channel.name} is used by alert rules`
                        : `Delete channel ${channel.name}`
                    }
                    title={inUse ? 'Delete or update the linked alert rules first' : 'Delete channel'}
                    onClick={() => void deleteChannel(channel.id)}
                    disabled={inUse}
                    className="shrink-0 rounded-lg p-2 text-rose-600 transition-colors hover:bg-rose-500/10 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              );
            })}

            {channels.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--border-color)] p-8 text-center text-[var(--color-muted)]">
                No notification channels yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
