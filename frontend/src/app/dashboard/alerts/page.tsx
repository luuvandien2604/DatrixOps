'use client';

import React, { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Bell, ShieldAlert, Plus, Trash2 } from 'lucide-react';

interface AlertRule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  duration_minutes: number;
  enabled: boolean;
}

interface AlertChannel {
  id: string;
  name: string;
  type: string;
  config: any;
  enabled: boolean;
}

export default function AlertsPage() {
  const [activeTab, setActiveTab] = useState('rules');
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<AlertChannel[]>([]);

  // Forms
  const [ruleName, setRuleName] = useState('');
  const [ruleMetric, setRuleMetric] = useState('cpu');
  const [ruleOperator, setRuleOperator] = useState('>');
  const [ruleThreshold, setRuleThreshold] = useState('90');

  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('telegram');
  const [channelToken, setChannelToken] = useState('');
  const [channelChatId, setChannelChatId] = useState('');
  const [channelWebhook, setChannelWebhook] = useState('');

  useEffect(() => {
    fetchRules();
    fetchChannels();
  }, []);

  const fetchRules = async () => {
    try {
      const data = await apiClient('/alerts/rules');
      setRules(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChannels = async () => {
    try {
      const data = await apiClient('/alerts/channels');
      setChannels(data);
    } catch (e) {
      console.error(e);
    }
  };

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient('/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          name: ruleName,
          metric: ruleMetric,
          operator: ruleOperator,
          threshold: parseFloat(ruleThreshold),
          duration_minutes: 1
        })
      });
      fetchRules();
      setRuleName('');
    } catch (e) {
      console.error(e);
    }
  };

  const createChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let config = {};
      if (channelType === 'telegram') {
        config = { bot_token: channelToken, chat_id: channelChatId };
      } else {
        config = { webhook_url: channelWebhook };
      }

      await apiClient('/alerts/channels', {
        method: 'POST',
        body: JSON.stringify({
          name: channelName,
          type: channelType,
          config
        })
      });
      fetchChannels();
      setChannelName('');
      setChannelToken('');
      setChannelChatId('');
      setChannelWebhook('');
    } catch (e) {
      console.error(e);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Xóa rule này?')) return;
    try {
      await apiClient(`/alerts/rules/${id}`, { method: 'DELETE' });
      fetchRules();
    } catch (e) {
      console.error(e);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm('Xóa channel này?')) return;
    try {
      await apiClient(`/alerts/channels/${id}`, { method: 'DELETE' });
      fetchChannels();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">Cảnh báo (Alerts)</h1>
      </div>

      <div role="tablist" aria-label="Alert configuration" className="flex gap-4 border-b border-[var(--border-color)]">
        <button type="button" role="tab" aria-selected={activeTab === 'rules'} onClick={() => setActiveTab('rules')} className={`pb-3 text-sm font-medium transition-colors ${activeTab === 'rules' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Quy tắc (Rules)</button>
        <button type="button" role="tab" aria-selected={activeTab === 'channels'} onClick={() => setActiveTab('channels')} className={`pb-3 text-sm font-medium transition-colors ${activeTab === 'channels' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Kênh nhận (Channels)</button>
      </div>

      {activeTab === 'rules' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="font-semibold mb-4 text-[var(--foreground)] flex items-center gap-2">
              <Plus className="w-4 h-4" /> Thêm Rule mới
            </h3>
            <form onSubmit={createRule} className="space-y-4">
              <div>
                <label htmlFor="rule-name" className="block text-sm text-[var(--color-muted)] mb-1">Tên cảnh báo</label>
                <input id="rule-name" name="rule-name" required value={ruleName} onChange={e => setRuleName(e.target.value)} type="text" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" placeholder="VD: CPU quá tải" />
              </div>
              <div>
                <label htmlFor="rule-metric" className="block text-sm text-[var(--color-muted)] mb-1">Chỉ số</label>
                <select id="rule-metric" name="rule-metric" value={ruleMetric} onChange={e => setRuleMetric(e.target.value)} className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white">
                  <option value="cpu" className="bg-[#0B0F14]">CPU Usage</option>
                  <option value="ram" className="bg-[#0B0F14]">RAM Usage</option>
                  <option value="status" className="bg-[#0B0F14]">Trạng thái Offline</option>
                </select>
              </div>
              {ruleMetric !== 'status' && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label htmlFor="rule-operator" className="block text-sm text-[var(--color-muted)] mb-1">Điều kiện</label>
                    <select id="rule-operator" name="rule-operator" value={ruleOperator} onChange={e => setRuleOperator(e.target.value)} className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white">
                      <option value=">" className="bg-[#0B0F14]">Lớn hơn (&gt;)</option>
                      <option value="<" className="bg-[#0B0F14]">Nhỏ hơn (&lt;)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label htmlFor="rule-threshold" className="block text-sm text-[var(--color-muted)] mb-1">Ngưỡng (%)</label>
                    <input id="rule-threshold" name="rule-threshold" required value={ruleThreshold} onChange={e => setRuleThreshold(e.target.value)} type="number" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" />
                  </div>
                </div>
              )}
              <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                Thêm Rule
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            {rules.map(rule => (
              <div key={rule.id} className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-[var(--foreground)]">{rule.name}</h4>
                  <p className="text-sm text-[var(--color-muted)] mt-1">
                    {rule.metric === 'status' ? 'Cảnh báo khi Server Offline' : `${rule.metric.toUpperCase()} ${rule.operator} ${rule.threshold}%`}
                  </p>
                </div>
                <button type="button" aria-label={`Xoá quy tắc ${rule.name}`} onClick={() => deleteRule(rule.id)} className="text-rose-500 hover:text-rose-400 p-2"><Trash2 className="w-5 h-5"/></button>
              </div>
            ))}
            {rules.length === 0 && <div className="p-8 text-center text-[var(--color-muted)] border border-[var(--border-color)] rounded-xl border-dashed">Chưa có quy tắc nào.</div>}
          </div>
        </div>
      )}

      {activeTab === 'channels' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="font-semibold mb-4 text-[var(--foreground)] flex items-center gap-2">
              <Plus className="w-4 h-4" /> Thêm Channel
            </h3>
            <form onSubmit={createChannel} className="space-y-4">
              <div>
                <label htmlFor="channel-name" className="block text-sm text-[var(--color-muted)] mb-1">Tên kênh</label>
                <input id="channel-name" name="channel-name" required value={channelName} onChange={e => setChannelName(e.target.value)} type="text" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" placeholder="VD: Kênh IT Support" />
              </div>
              <div>
                <label htmlFor="channel-type" className="block text-sm text-[var(--color-muted)] mb-1">Nền tảng</label>
                <select id="channel-type" name="channel-type" value={channelType} onChange={e => setChannelType(e.target.value)} className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white">
                  <option value="telegram" className="bg-[#0B0F14]">Telegram Bot</option>
                  <option value="discord" className="bg-[#0B0F14]">Discord Webhook</option>
                </select>
              </div>
              {channelType === 'telegram' ? (
                <>
                  <div>
                    <label htmlFor="channel-token" className="block text-sm text-[var(--color-muted)] mb-1">Bot Token</label>
                    <input id="channel-token" name="channel-token" required value={channelToken} onChange={e => setChannelToken(e.target.value)} type="text" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" />
                  </div>
                  <div>
                    <label htmlFor="channel-chat-id" className="block text-sm text-[var(--color-muted)] mb-1">Chat ID</label>
                    <input id="channel-chat-id" name="channel-chat-id" required value={channelChatId} onChange={e => setChannelChatId(e.target.value)} type="text" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" />
                  </div>
                </>
              ) : (
                <div>
                  <label htmlFor="channel-webhook" className="block text-sm text-[var(--color-muted)] mb-1">Webhook URL</label>
                  <input id="channel-webhook" name="channel-webhook" required value={channelWebhook} onChange={e => setChannelWebhook(e.target.value)} type="url" className="w-full bg-transparent border border-[var(--border-color)] rounded-lg p-2 text-sm text-white" />
                </div>
              )}
              
              <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors">
                Lưu Kênh
              </button>
            </form>
          </div>

          <div className="md:col-span-2 space-y-4">
            {channels.map(ch => (
              <div key={ch.id} className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-4 flex justify-between items-center">
                <div>
                  <h4 className="font-medium text-[var(--foreground)] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-blue-400" /> {ch.name}
                  </h4>
                  <p className="text-sm text-[var(--color-muted)] mt-1 uppercase text-xs font-semibold tracking-wider">
                    {ch.type}
                  </p>
                </div>
                <button type="button" aria-label={`Xoá kênh ${ch.name}`} onClick={() => deleteChannel(ch.id)} className="text-rose-500 hover:text-rose-400 p-2"><Trash2 className="w-5 h-5"/></button>
              </div>
            ))}
            {channels.length === 0 && <div className="p-8 text-center text-[var(--color-muted)] border border-[var(--border-color)] rounded-xl border-dashed">Chưa có kênh nào.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
