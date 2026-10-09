'use client';

import { useCallback, useEffect, useState } from 'react';
import { 
  Check, CircleAlert, Eye, EyeOff, Globe, Mail, 
  RefreshCw, Save, Send, Server, Settings, ShieldAlert, Sparkles 
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';

type SystemSettings = {
  system_name: string;
  timezone: string;
  public_url: string;
  registration_enabled: boolean;
  smtp_enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password_set: boolean;
  smtp_from_email: string;
  smtp_from_name: string;
  smtp_encryption: string;
};

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form states
  const [systemName, setSystemName] = useState('DatrixOps');
  const [timezone, setTimezone] = useState('UTC');
  const [publicUrl, setPublicUrl] = useState('');
  const [smtpEnabled, setSmtpEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('DatrixOps');
  const [smtpEncryption, setSmtpEncryption] = useState('tls');
  const [showPassword, setShowPassword] = useState(false);

  const [testRecipient, setTestRecipient] = useState('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data: SystemSettings = await apiClient('/system/settings');
      if (data) {
        setSystemName(data.system_name || 'DatrixOps');
        setTimezone(data.timezone || 'UTC');
        setPublicUrl(data.public_url || '');
        setSmtpEnabled(Boolean(data.smtp_enabled));
        setSmtpHost(data.smtp_host || '');
        setSmtpPort(data.smtp_port || 587);
        setSmtpUsername(data.smtp_username || '');
        setSmtpPasswordSet(Boolean(data.smtp_password_set));
        setSmtpFromEmail(data.smtp_from_email || '');
        setSmtpFromName(data.smtp_from_name || 'DatrixOps');
        setSmtpEncryption(data.smtp_encryption || 'tls');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to load system settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const role = getUserRole();
    if (role === 'admin' || role === 'superadmin' || role === 'owner') {
      setIsAdmin(true);
    }
    apiClient('/auth/me')
      .then((me) => {
        if (me?.email) setTestRecipient(me.email);
        if (me?.role) {
          setIsAdmin(me.role === 'admin' || me.role === 'superadmin' || me.role === 'owner');
        }
      })
      .catch(() => {});

    fetchSettings();
  }, [fetchSettings]);

  const applyPreset = (preset: 'gmail' | 'office365' | 'sendgrid' | 'resend') => {
    setSmtpEnabled(true);
    switch (preset) {
      case 'gmail':
        setSmtpHost('smtp.gmail.com');
        setSmtpPort(587);
        setSmtpEncryption('tls');
        break;
      case 'office365':
        setSmtpHost('smtp.office365.com');
        setSmtpPort(587);
        setSmtpEncryption('tls');
        break;
      case 'sendgrid':
        setSmtpHost('smtp.sendgrid.net');
        setSmtpPort(587);
        setSmtpUsername('apikey');
        setSmtpEncryption('tls');
        break;
      case 'resend':
        setSmtpHost('smtp.resend.com');
        setSmtpPort(587);
        setSmtpUsername('resend');
        setSmtpEncryption('tls');
        break;
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccessMsg('');

    try {
      await apiClient('/system/settings', {
        method: 'PUT',
        data: {
          system_name: systemName,
          timezone,
          public_url: publicUrl,
          smtp_enabled: smtpEnabled,
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          smtp_username: smtpUsername,
          smtp_password: smtpPassword,
          smtp_from_email: smtpFromEmail,
          smtp_from_name: smtpFromName,
          smtp_encryption: smtpEncryption,
        },
      });

      setSuccessMsg('System settings and SMTP configuration saved successfully.');
      if (smtpPassword) {
        setSmtpPasswordSet(true);
        setSmtpPassword('');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testRecipient) {
      setTestResult({ success: false, message: 'Please enter a recipient email address' });
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const res = await apiClient('/system/settings/test-smtp', {
        method: 'POST',
        data: { to_email: testRecipient },
      });
      setTestResult({
        success: true,
        message: res.message || `Test email dispatched successfully to ${testRecipient}!`,
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'SMTP connection or delivery failed',
      });
    } finally {
      setTesting(false);
    }
  };

  if (isAdmin === false) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <div className="auth-icon mx-auto mb-4"><ShieldAlert className="h-6 w-6 text-rose-500" /></div>
        <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
        <p className="text-sm text-[var(--color-muted)]">
          Only administrators have permission to configure system parameters and SMTP relays.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[var(--background-card)] border border-[var(--border-color)]">
              <Settings className="h-5 w-5 text-[var(--mint)]" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight">System & SMTP Settings</h1>
          </div>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Configure instance metadata, public routing domain, and transactional email (SMTP) relay.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSettings}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--background-card)] border border-[var(--border-color)] text-[var(--color-foreground)] hover:border-[var(--mint)] transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <CircleAlert className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm flex items-center gap-3">
          <Check className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Section 1: General Settings */}
        <section className="ops-panel p-6 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] space-y-6">
          <div className="border-b border-[var(--border-color)] pb-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-[var(--mint)]" /> General Instance Configuration
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Public address used for password reset links and notification hyperlinks.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-system-name" className="auth-label">Instance Name</label>
              <input
                id="settings-system-name"
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                required
                className="auth-input"
                placeholder="DatrixOps"
              />
            </div>

            <div>
              <label htmlFor="settings-timezone" className="auth-label">Default Timezone</label>
              <input
                id="settings-timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="auth-input"
                placeholder="UTC or Asia/Ho_Chi_Minh"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="settings-public-url" className="auth-label">
                Public URL (Base Address)
              </label>
              <input
                id="settings-public-url"
                type="url"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                className="auth-input font-mono text-sm"
                placeholder="https://datrixops.example.com"
              />
              <p className="text-xs text-[var(--color-muted)] mt-1.5">
                Must include scheme (e.g., <code>https://</code>). Used to generate email password reset links.
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Transactional SMTP Relay */}
        <section className="ops-panel p-6 rounded-xl border border-[var(--border-color)] bg-[var(--background-card)] space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--border-color)] pb-4">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Mail className="h-4 w-4 text-[var(--mint)]" /> Transactional Email (SMTP Relay)
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Required for automated password resets, user invitations, and system delivery.
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={smtpEnabled}
                onChange={(e) => setSmtpEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--mint)]"></div>
              <span className="ml-3 text-sm font-medium">
                {smtpEnabled ? <span className="text-[var(--mint)]">Enabled</span> : <span className="text-[var(--color-muted)]">Disabled</span>}
              </span>
            </label>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Quick Presets:</span>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                type="button"
                onClick={() => applyPreset('gmail')}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--background-secondary)] hover:border-[var(--mint)] text-[var(--color-foreground)] transition-colors"
              >
                Google Gmail
              </button>
              <button
                type="button"
                onClick={() => applyPreset('office365')}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--background-secondary)] hover:border-[var(--mint)] text-[var(--color-foreground)] transition-colors"
              >
                Microsoft 365
              </button>
              <button
                type="button"
                onClick={() => applyPreset('sendgrid')}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--background-secondary)] hover:border-[var(--mint)] text-[var(--color-foreground)] transition-colors"
              >
                SendGrid
              </button>
              <button
                type="button"
                onClick={() => applyPreset('resend')}
                className="px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--background-secondary)] hover:border-[var(--mint)] text-[var(--color-foreground)] transition-colors"
              >
                Resend
              </button>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="settings-smtp-host" className="auth-label">SMTP Host</label>
              <input
                id="settings-smtp-host"
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="auth-input font-mono text-sm"
                placeholder="smtp.gmail.com"
                required={smtpEnabled}
              />
            </div>

            <div>
              <label htmlFor="settings-smtp-port" className="auth-label">Port</label>
              <input
                id="settings-smtp-port"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
                className="auth-input font-mono text-sm"
                placeholder="587"
                min={1}
                max={65535}
                required={smtpEnabled}
              />
            </div>

            <div>
              <label htmlFor="settings-smtp-encryption" className="auth-label">Encryption Mode</label>
              <select
                id="settings-smtp-encryption"
                value={smtpEncryption}
                onChange={(e) => setSmtpEncryption(e.target.value)}
                className="auth-input text-sm"
              >
                <option value="tls">STARTTLS (Recommended / Port 587)</option>
                <option value="ssl">SSL / TLS (Port 465)</option>
                <option value="none">None (Plaintext / Port 25)</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-smtp-user" className="auth-label">Username</label>
              <input
                id="settings-smtp-user"
                type="text"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                className="auth-input"
                placeholder="user@example.com"
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="settings-smtp-password" className="auth-label mb-0">Password / App Key</label>
                {smtpPasswordSet && (
                  <span className="text-[11px] text-[var(--mint)] font-medium">✓ Saved</span>
                )}
              </div>
              <div className="relative">
                <input
                  id="settings-smtp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  className="auth-input pr-10"
                  placeholder={smtpPasswordSet ? '•••••••• (unchanged)' : 'Enter SMTP password'}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="settings-from-email" className="auth-label">Sender Email (From)</label>
              <input
                id="settings-from-email"
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                className="auth-input"
                placeholder="noreply@example.com"
                required={smtpEnabled}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="settings-from-name" className="auth-label">Sender Display Name</label>
              <input
                id="settings-from-name"
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                className="auth-input"
                placeholder="DatrixOps System"
              />
            </div>
          </div>

          {/* Test Email Delivery Subsection */}
          <div className="pt-4 border-t border-[var(--border-color)]">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--mint)]" /> Live Connection Test
            </h3>
            <p className="text-xs text-[var(--color-muted)] mb-3">
              Send a test verification message to ensure your credentials and firewall allow outbound delivery.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="recipient@example.com"
                className="auth-input sm:max-w-xs text-sm"
              />
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testing || !smtpEnabled}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[var(--background-secondary)] border border-[var(--border-color)] text-sm font-medium hover:border-[var(--mint)] disabled:opacity-50 transition-colors"
              >
                {testing ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Testing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send Test Email
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-3 p-3 rounded-lg text-xs leading-relaxed ${
                  testResult.success
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
                }`}
              >
                <strong>{testResult.success ? 'Success: ' : 'Error: '}</strong>
                {testResult.message}
              </div>
            )}
          </div>
        </section>

        {/* Submit action */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="auth-submit !w-auto px-6 py-2.5 inline-flex items-center gap-2"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Saving changes...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save Configuration
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
