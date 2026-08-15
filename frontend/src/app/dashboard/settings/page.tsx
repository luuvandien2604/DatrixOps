'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/apiClient';
import { dataOwnershipLabel, deploymentLabel, DatrixOpsEdition, DeploymentMode } from '@/lib/edition';
import { copyTextToClipboard } from '@/lib/clipboard';
import { Activity, Check, Copy, Database, ExternalLink, Play, Plus, RotateCcw, ServerCog, Settings2, ShieldCheck, Trash2, Webhook } from 'lucide-react';

interface DeploymentInfo {
  edition: DatrixOpsEdition;
  deployment_mode: DeploymentMode;
  data_ownership: 'customer-controlled' | 'provider-managed';
  system_name: string;
  timezone: string;
  public_url: string;
  agent_release_url: string;
  agent_version: string;
  setup_completed: boolean;
  registration_enabled: boolean;
  control_plane: { version: string; commit: string };
  retention: { metrics_days: number; operational_days: number };
  features: {
    web_terminal: boolean;
    remote_scripts: boolean;
    service_controls: boolean;
    read_only_logs: boolean;
  };
}

interface WebhookEndpoint {
  id: string;
  name: string;
  url_display: string;
  signing_secret?: string;
  events: string[];
  enabled: boolean;
  last_delivery_status?: string;
  last_delivery_at?: string;
  last_delivery_error?: string;
  created_at: string;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  webhook_name: string;
  event_type: string;
  event_id?: string;
  status: string;
  status_code?: number;
  latency_ms?: number;
  attempt_count?: number;
  max_attempts?: number;
  next_attempt_at?: string;
  delivered_at?: string;
  error_message?: string;
  created_at: string;
}

const eventLabels: Record<string, string> = {
  'server.offline': 'Server offline',
  'server.online': 'Server online',
  'server.degraded': 'Server degraded',
  'cron.failed': 'Cron failed',
  'service.down': 'Service down',
  'agent.update_failed': 'Agent update failed',
  'agent.update_resolved': 'Agent update resolved',
};

const defaultEvents = ['server.offline', 'server.degraded', 'cron.failed', 'service.down', 'agent.update_failed'];

export default function SettingsPage() {
  const [webhooks, setWebhooks] = useState<WebhookEndpoint[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [allowedEvents, setAllowedEvents] = useState<string[]>([]);
  const [deploymentInfo, setDeploymentInfo] = useState<DeploymentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [copiedSecretId, setCopiedSecretId] = useState<string | null>(null);
  const [copiedPublicURL, setCopiedPublicURL] = useState(false);
  const [form, setForm] = useState({
    name: '',
    url: '',
    signingSecret: '',
    events: defaultEvents,
    enabled: true,
  });

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const [webhookData, deliveryData, systemData] = await Promise.all([
        apiClient('/webhooks'),
        apiClient('/webhooks/deliveries?limit=20'),
        apiClient('/system/info'),
      ]);
      setWebhooks(Array.isArray(webhookData.items) ? webhookData.items : []);
      setAllowedEvents(Array.isArray(webhookData.allowed_events) ? webhookData.allowed_events : []);
      setDeliveries(Array.isArray(deliveryData) ? deliveryData : []);
      setDeploymentInfo(systemData);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initialRequest);
  }, [refresh]);

  const activeCount = useMemo(() => webhooks.filter((webhook) => webhook.enabled).length, [webhooks]);

  const toggleEvent = (event: string) => {
    setForm((current) => ({
      ...current,
      events: current.events.includes(event)
        ? current.events.filter((item) => item !== event)
        : [...current.events, event],
    }));
  };

  const createWebhook = async () => {
    if (!form.name.trim() || !form.url.trim() || form.events.length === 0) return;
    try {
      setMessage('');
      const created: WebhookEndpoint = await apiClient('/webhooks', {
        data: {
          name: form.name.trim(),
          url: form.url.trim(),
          signing_secret: form.signingSecret.trim(),
          events: form.events,
          enabled: form.enabled,
        },
      });
      setWebhooks((current) => [created, ...current]);
      setForm({ name: '', url: '', signingSecret: '', events: defaultEvents, enabled: true });
      setMessage('Webhook created. Copy the signing secret now; it is shown only once.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create webhook');
    }
  };

  const updateWebhook = async (webhook: WebhookEndpoint, data: Record<string, unknown>) => {
    try {
      setBusyId(webhook.id);
      setMessage('');
      const updated: WebhookEndpoint = await apiClient(`/webhooks/${webhook.id}`, {
        method: 'PATCH',
        data,
      });
      setWebhooks((current) => current.map((item) => item.id === webhook.id ? updated : item));
      if (updated.signing_secret) {
        setMessage('Signing secret rotated. Copy it now; it is shown only once.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update webhook');
    } finally {
      setBusyId(null);
    }
  };

  const deleteWebhook = async (webhook: WebhookEndpoint) => {
    if (!confirm(`Delete webhook "${webhook.name}"? Delivery history for this endpoint will also be removed.`)) return;
    try {
      setBusyId(webhook.id);
      await apiClient(`/webhooks/${webhook.id}`, { method: 'DELETE' });
      setWebhooks((current) => current.filter((item) => item.id !== webhook.id));
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete webhook');
    } finally {
      setBusyId(null);
    }
  };

  const testWebhook = async (webhook: WebhookEndpoint) => {
    try {
      setBusyId(webhook.id);
      setMessage('');
      const result = await apiClient(`/webhooks/${webhook.id}/test`, { method: 'POST' });
      setMessage(`Test delivered · HTTP ${result.status_code} · ${result.latency_ms}ms`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Webhook test failed');
    } finally {
      setBusyId(null);
      await refresh();
    }
  };

  const copySecret = async (webhook: WebhookEndpoint) => {
    if (!webhook.signing_secret) return;
    await copyTextToClipboard(webhook.signing_secret);
    setCopiedSecretId(webhook.id);
    window.setTimeout(() => setCopiedSecretId((current) => current === webhook.id ? null : current), 2000);
  };

  const copyPublicURL = async () => {
    if (!deploymentInfo?.public_url) return;
    await copyTextToClipboard(deploymentInfo.public_url);
    setCopiedPublicURL(true);
    window.setTimeout(() => setCopiedPublicURL(false), 2000);
  };

  const renderStatus = (status?: string) => {
    if (!status) return <span className="text-[var(--text-tertiary)]">No deliveries</span>;
    const tone = status === 'delivered' ? 'var(--status-healthy)' : 'var(--status-critical)';
    return (
      <span
        className="inline-flex rounded-md border px-2 py-1 text-xs font-semibold"
        style={{
          color: tone,
          background: `color-mix(in srgb, ${tone} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${tone} 28%, transparent)`,
        }}
      >
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <Settings2 className="h-6 w-6 text-[var(--accent-primary)]" />
            <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">Instance Settings</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Configure outbound integrations and operational defaults for this control plane.
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--text-tertiary)]">
            {webhooks.length} webhook(s) · {activeCount} enabled · HMAC-SHA256 signed deliveries
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} className="ops-button secondary">
          <RotateCcw className="h-4 w-4" />
          Refresh
        </button>
      </section>

      {message && (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--text-primary)]">
          {message}
        </div>
      )}

      {deploymentInfo && (
        <section className="ops-panel">
          <div className="flex flex-col gap-4 border-b border-[var(--border-default)] p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <ServerCog className="h-5 w-5 text-[var(--accent-primary)]" />
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Deployment & data ownership</h2>
                <span className="status-badge">
                  {deploymentInfo.edition === 'cloud' ? 'CLOUD' : 'COMMUNITY'}
                </span>
                <span className="status-badge">
                  {deploymentLabel(deploymentInfo.deployment_mode).toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {deploymentInfo.deployment_mode === 'self-hosted'
                  ? 'This control plane and its PostgreSQL data are operated on infrastructure controlled by your organization.'
                  : 'This control plane is operated as a managed service; confirm data residency and support terms with the provider.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyPublicURL()} className="ops-button secondary">
                {copiedPublicURL ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedPublicURL ? 'Copied' : 'Copy public URL'}
              </button>
              <Link href="/docs/deployment/self-hosted" className="ops-button primary">
                <ExternalLink className="h-4 w-4" />
                Deployment guide
              </Link>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                <ServerCog className="h-4 w-4" /> Control plane
              </div>
              <div className="mt-3 break-all font-mono text-sm font-semibold text-[var(--text-primary)]">{deploymentInfo.public_url}</div>
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                {deploymentInfo.system_name} · {deploymentInfo.timezone}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                <Database className="h-4 w-4" /> Data ownership
              </div>
              <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                {dataOwnershipLabel(deploymentInfo.data_ownership)}
              </div>
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                Metrics {deploymentInfo.retention.metrics_days}d · Operations {deploymentInfo.retention.operational_days}d
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                <ShieldCheck className="h-4 w-4" /> Access policy
              </div>
              <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                Registration {deploymentInfo.registration_enabled ? 'enabled' : 'closed'}
              </div>
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                Initial setup {deploymentInfo.setup_completed ? 'completed' : 'required'}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">
                <Activity className="h-4 w-4" /> Release
              </div>
              <div className="mt-3 font-mono text-sm font-semibold text-[var(--text-primary)]">Agent {deploymentInfo.agent_version}</div>
              <div className="mt-2 font-mono text-xs text-[var(--text-secondary)]">
                Control plane {deploymentInfo.control_plane.version}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border-default)] px-5 py-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--text-secondary)]">Advanced feature policy</div>
            <div className="flex flex-wrap gap-2">
              {[
                ['Web Terminal', deploymentInfo.features.web_terminal],
                ['Remote scripts', deploymentInfo.features.remote_scripts],
                ['Service controls', deploymentInfo.features.service_controls],
                ['Read-only logs', deploymentInfo.features.read_only_logs],
              ].map(([label, enabled]) => (
                <span key={String(label)} className={`status-badge ${enabled ? 'healthy' : 'disabled'}`}>
                  {String(label)} · {enabled ? 'Enabled' : 'Disabled'}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="ops-panel">
        <div className="border-b border-[var(--border-default)] p-5">
          <div className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-[var(--accent-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">System Webhooks</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Send operational events to external systems. URLs are masked after saving; signing secrets are shown only once.
          </p>
        </div>

        <div className="grid gap-5 p-5 lg:grid-cols-[420px_1fr]">
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Add webhook endpoint</h3>
            <div className="space-y-4">
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Name
                <input
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  className="ops-control mt-1 w-full px-3"
                  placeholder="Incident automation"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                HTTPS endpoint URL
                <input
                  value={form.url}
                  onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))}
                  className="ops-control mt-1 w-full px-3 font-mono"
                  placeholder="https://example.com/datrixops/webhook"
                />
              </label>
              <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                Signing secret (optional)
                <input
                  value={form.signingSecret}
                  onChange={(event) => setForm((current) => ({ ...current, signingSecret: event.target.value }))}
                  className="ops-control mt-1 w-full px-3 font-mono"
                  placeholder="Generated automatically if blank"
                />
              </label>

              <div>
                <div className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">Events</div>
                <div className="grid gap-2">
                  {(allowedEvents.length ? allowedEvents : defaultEvents).map((event) => (
                    <label key={event} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={form.events.includes(event)}
                        onChange={() => toggleEvent(event)}
                        className="h-4 w-4 accent-[var(--accent-primary)]"
                      />
                      <span>{eventLabels[event] || event}</span>
                      <code className="text-xs text-[var(--text-tertiary)]">{event}</code>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 accent-[var(--accent-primary)]"
                />
                Enable deliveries immediately
              </label>

              <button type="button" onClick={() => void createWebhook()} className="ops-button primary w-full">
                <Plus className="h-4 w-4" />
                Add webhook
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--border-default)]">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                <tr>
                  <th className="px-4 py-3">Endpoint</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">Last delivery</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {loading ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-secondary)]">Loading webhooks...</td></tr>
                ) : webhooks.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-[var(--text-secondary)]">No system webhooks configured.</td></tr>
                ) : webhooks.map((webhook) => (
                  <tr key={webhook.id} className="bg-[var(--surface-1)] hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-4 align-top">
                      <div className="font-semibold text-[var(--text-primary)]">{webhook.name}</div>
                      <div className="mt-1 font-mono text-xs text-[var(--text-secondary)]">{webhook.url_display}</div>
                      {webhook.signing_secret && (
                        <button
                          type="button"
                          onClick={() => void copySecret(webhook)}
                          className="mt-2 inline-flex items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]"
                        >
                          {copiedSecretId === webhook.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedSecretId === webhook.id ? 'Copied secret' : 'Copy one-time secret'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {webhook.events.map((event) => (
                          <code key={event} className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                            {event}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      {renderStatus(webhook.last_delivery_status)}
                      <div className="mt-1 font-mono text-xs text-[var(--text-tertiary)]">
                        {webhook.last_delivery_at ? new Date(webhook.last_delivery_at).toLocaleString() : 'Never'}
                      </div>
                      {webhook.last_delivery_error && (
                        <div className="mt-1 max-w-[260px] truncate text-xs text-[var(--status-critical)]">{webhook.last_delivery_error}</div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right align-top">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === webhook.id}
                          onClick={() => void updateWebhook(webhook, { enabled: !webhook.enabled })}
                          className="ops-button secondary"
                        >
                          {webhook.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === webhook.id || !webhook.enabled}
                          onClick={() => void testWebhook(webhook)}
                          className="ops-button secondary"
                          title="Send test delivery"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === webhook.id}
                          onClick={() => void updateWebhook(webhook, { rotate_secret: true })}
                          className="ops-button secondary"
                          title="Rotate signing secret"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={busyId === webhook.id}
                          onClick={() => void deleteWebhook(webhook)}
                          className="ops-button secondary text-[var(--status-critical)]"
                          title="Delete webhook"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="ops-panel">
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-5">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--accent-primary)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent deliveries</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Last 20 system webhook delivery attempts, including retry state.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Webhook</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Status</th>
	                <th className="px-4 py-3">Attempt</th>
	                <th className="px-4 py-3">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {deliveries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-[var(--text-secondary)]">No webhook deliveries recorded yet.</td></tr>
              ) : deliveries.map((delivery) => (
                <tr key={delivery.id} className="hover:bg-[var(--surface-hover)]">
                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">{new Date(delivery.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[var(--text-primary)]">{delivery.webhook_name}</td>
	                  <td className="px-4 py-3">
	                    <div className="font-mono text-xs text-[var(--text-secondary)]">{delivery.event_type}</div>
	                    {delivery.event_id && <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">{delivery.event_id}</div>}
	                  </td>
	                  <td className="px-4 py-3">{renderStatus(delivery.status)}</td>
	                  <td className="px-4 py-3 font-mono text-xs text-[var(--text-secondary)]">
	                    {delivery.attempt_count ?? 0}/{delivery.max_attempts ?? 3}
	                    {delivery.latency_ms != null && <span className="ml-2 text-[var(--text-tertiary)]">{delivery.latency_ms}ms</span>}
	                  </td>
	                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
	                    {delivery.error_message || (delivery.status_code ? `HTTP ${delivery.status_code}` : '—')}
	                    {delivery.next_attempt_at && (
	                      <div className="mt-1 font-mono text-[11px] text-[var(--text-tertiary)]">
	                        retry {new Date(delivery.next_attempt_at).toLocaleString()}
	                      </div>
	                    )}
	                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
