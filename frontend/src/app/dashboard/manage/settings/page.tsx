'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from 'react';
import { 
  Check, CircleAlert, Eye, EyeOff, Globe, Mail, 
  RefreshCw, Save, Send, Settings, ShieldAlert, Sparkles 
} from 'lucide-react';
import { apiClient, getUserRole } from '@/lib/apiClient';
import { useLanguage } from '@/components/LanguageContext';

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
  const { t } = useLanguage();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(() => {
    const role = getUserRole();
    return role === 'admin' || role === 'superadmin' || role === 'owner' ? true : null;
  });
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
      setError(err instanceof Error ? err.message : t('Unable to load system settings', 'Không thể tải cài đặt hệ thống'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
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

      setSuccessMsg(t('System settings and SMTP configuration saved successfully.', 'Đã lưu cài đặt hệ thống và cấu hình SMTP thành công.'));
      if (smtpPassword) {
        setSmtpPasswordSet(true);
        setSmtpPassword('');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('Failed to save settings', 'Không thể lưu cài đặt'));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testRecipient) {
      setTestResult({ success: false, message: t('Please enter a recipient email address', 'Vui lòng nhập địa chỉ email người nhận') });
      return;
    }
    if (!smtpHost) {
      setTestResult({ success: false, message: t('Please enter an SMTP Host before running connection test', 'Vui lòng nhập SMTP Host trước khi chạy kiểm tra kết nối') });
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const res = await apiClient('/system/settings/test-smtp', {
        method: 'POST',
        data: {
          to_email: testRecipient,
          smtp_host: smtpHost,
          smtp_port: Number(smtpPort),
          smtp_username: smtpUsername,
          smtp_password: smtpPassword,
          smtp_from_email: smtpFromEmail,
          smtp_from_name: smtpFromName,
          smtp_encryption: smtpEncryption,
        },
      });
      setTestResult({
        success: true,
        message: res.message || t(`Test email dispatched successfully to ${testRecipient}!`, `Đã gửi email thử nghiệm thành công đến ${testRecipient}!`),
      });
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : t('SMTP connection or delivery failed', 'Kết nối SMTP hoặc gửi email thất bại'),
      });
    } finally {
      setTesting(false);
    }
  };

  if (isAdmin === false) {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <div className="h-10 w-10 mx-auto mb-3 rounded-sm bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h2 className="text-base font-bold mb-1.5 text-[var(--foreground)]">{t('Access Restricted', 'Quyền truy cập bị hạn chế')}</h2>
        <p className="text-xs text-[var(--color-muted)] leading-relaxed">
          {t('Only administrators have permission to configure system parameters and SMTP relays.', 'Chỉ quản trị viên mới có quyền cấu hình tham số hệ thống và máy chủ SMTP.')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl pb-20">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-sm bg-[var(--surface-2)] border border-[var(--border-default)]">
              <Settings className="h-4 w-4 text-blue-500" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)]">
              {t('System & SMTP Settings', 'Cài đặt Hệ thống & SMTP')}
            </h1>
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-1">
            {t('Configure instance metadata, public routing domain, and transactional email (SMTP) relay.', 'Cấu hình siêu dữ liệu phiên bản, tên miền định tuyến công khai và email giao dịch (SMTP).')}
          </p>
        </div>

        <button
          type="button"
          onClick={fetchSettings}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-sm bg-[var(--surface-1)] border border-[var(--border-default)] text-[var(--foreground)] hover:bg-[var(--surface-2)] transition duration-100 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          {t('Refresh', 'Làm mới')}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
          <CircleAlert className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: General Settings */}
        <section className="p-5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] space-y-4">
          <div className="border-b border-[var(--border-subtle)] pb-3">
            <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              {t('General Instance Configuration', 'Cấu hình Hệ thống Chung')}
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {t('Public address used for password reset links and notification hyperlinks.', 'Địa chỉ công khai được dùng cho liên kết đặt lại mật khẩu và thông báo.')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-system-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Instance Name', 'Tên phiên bản')}
              </label>
              <input
                id="settings-system-name"
                type="text"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
                placeholder="DatrixOps"
              />
            </div>

            <div>
              <label htmlFor="settings-timezone" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Default Timezone', 'Múi giờ mặc định')}
              </label>
              <input
                id="settings-timezone"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500 font-mono"
                placeholder="UTC or Asia/Ho_Chi_Minh"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="settings-public-url" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Public URL (Base Address)', 'URL Công khai (Địa chỉ gốc)')}
              </label>
              <input
                id="settings-public-url"
                type="url"
                value={publicUrl}
                onChange={(e) => setPublicUrl(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500 font-mono"
                placeholder="https://datrixops.example.com"
              />
              <p className="text-[11px] text-[var(--color-muted)] mt-1">
                {t('Must include scheme (e.g., https://). Used to generate email password reset links.', 'Bắt buộc bao gồm giao thức (ví dụ: https://). Dùng để tạo link đặt lại mật khẩu.')}
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Transactional SMTP Relay */}
        <section className="p-5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                <Mail className="h-4 w-4 text-blue-500" />
                {t('Transactional Email (SMTP Relay)', 'Email Giao dịch (SMTP Relay)')}
              </h2>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                {t('Required for automated password resets, user invitations, and system delivery.', 'Bắt buộc cho đặt lại mật khẩu tự động, mời thành viên và gửi cảnh báo.')}
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                checked={smtpEnabled}
                onChange={(e) => setSmtpEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              <span className="ml-2.5 text-xs font-semibold">
                {smtpEnabled
                  ? <span className="text-emerald-500">{t('Enabled', 'Đã bật')}</span>
                  : <span className="text-[var(--color-muted)]">{t('Disabled', 'Đã tắt')}</span>}
              </span>
            </label>
          </div>

          {/* Quick Presets */}
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              {t('Quick Presets:', 'Mẫu cấu hình nhanh:')}
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={() => applyPreset('gmail')}
                className="px-2.5 py-1 text-xs rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] transition duration-100"
              >
                Google Gmail
              </button>
              <button
                type="button"
                onClick={() => applyPreset('office365')}
                className="px-2.5 py-1 text-xs rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] transition duration-100"
              >
                Microsoft 365
              </button>
              <button
                type="button"
                onClick={() => applyPreset('sendgrid')}
                className="px-2.5 py-1 text-xs rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] transition duration-100"
              >
                SendGrid
              </button>
              <button
                type="button"
                onClick={() => applyPreset('resend')}
                className="px-2.5 py-1 text-xs rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-[var(--foreground)] transition duration-100"
              >
                Resend
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="settings-smtp-host" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('SMTP Host', 'Máy chủ SMTP')}
              </label>
              <input
                id="settings-smtp-host"
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500 font-mono"
                placeholder="smtp.gmail.com"
                required={smtpEnabled}
              />
            </div>

            <div>
              <label htmlFor="settings-smtp-port" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Port', 'Cổng')}
              </label>
              <input
                id="settings-smtp-port"
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500 font-mono"
                placeholder="587"
                min={1}
                max={65535}
                required={smtpEnabled}
              />
            </div>

            <div>
              <label htmlFor="settings-smtp-encryption" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Encryption Mode', 'Chế độ mã hóa')}
              </label>
              <select
                id="settings-smtp-encryption"
                value={smtpEncryption}
                onChange={(e) => setSmtpEncryption(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
              >
                <option value="tls">STARTTLS (Port 587)</option>
                <option value="ssl">SSL / TLS (Port 465)</option>
                <option value="none">None (Plaintext / Port 25)</option>
              </select>
            </div>

            <div>
              <label htmlFor="settings-smtp-user" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Username', 'Tên đăng nhập')}
              </label>
              <input
                id="settings-smtp-user"
                type="text"
                value={smtpUsername}
                onChange={(e) => setSmtpUsername(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
                placeholder="user@example.com"
                autoComplete="off"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="settings-smtp-password" className="block text-xs font-semibold text-[var(--foreground)]">
                  {t('Password / App Key', 'Mật khẩu / Khóa ứng dụng')}
                </label>
                {smtpPasswordSet && (
                  <span className="text-[10px] text-emerald-500 font-medium">✓ {t('Saved', 'Đã lưu')}</span>
                )}
              </div>
              <div className="relative">
                <input
                  id="settings-smtp-password"
                  type={showPassword ? 'text' : 'password'}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 pr-8 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
                  placeholder={smtpPasswordSet ? '•••••••• (unchanged)' : t('Enter SMTP password', 'Nhập mật khẩu SMTP')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted)] hover:text-[var(--foreground)]"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="settings-from-email" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Sender Email (From)', 'Email người gửi (From)')}
              </label>
              <input
                id="settings-from-email"
                type="email"
                value={smtpFromEmail}
                onChange={(e) => setSmtpFromEmail(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
                placeholder="noreply@example.com"
                required={smtpEnabled}
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="settings-from-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                {t('Sender Display Name', 'Tên hiển thị người gửi')}
              </label>
              <input
                id="settings-from-name"
                type="text"
                value={smtpFromName}
                onChange={(e) => setSmtpFromName(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500"
                placeholder="DatrixOps System"
              />
            </div>
          </div>

          {/* Test Email Delivery Subsection */}
          <div className="pt-3 border-t border-[var(--border-subtle)]">
            <h3 className="text-xs font-bold mb-1.5 flex items-center gap-1.5 text-[var(--foreground)]">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" /> {t('Live Connection Test', 'Kiểm tra kết nối trực tiếp')}
            </h3>
            <p className="text-[11px] text-[var(--color-muted)] mb-2.5">
              {t('Send a test verification message to ensure your credentials and firewall allow outbound delivery.', 'Gửi thư thử nghiệm để đảm bảo thông tin đăng nhập và tường lửa cho phép chuyển tiếp email.')}
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="recipient@example.com"
                className="px-2.5 py-1.5 rounded-sm border border-[var(--border-default)] bg-[var(--surface-2)] text-xs text-[var(--foreground)] outline-none focus:border-blue-500 sm:max-w-xs"
              />
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testing || !testRecipient || !smtpHost}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-sm bg-[var(--surface-2)] border border-[var(--border-default)] text-xs font-semibold hover:bg-[var(--surface-3)] text-[var(--foreground)] disabled:opacity-50 transition duration-100 cursor-pointer"
              >
                {testing ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" /> {t('Testing...', 'Đang thử...')}
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" /> {t('Send Test Email', 'Gửi Email Thử')}
                  </>
                )}
              </button>
            </div>

            {testResult && (
              <div
                className={`mt-2.5 p-2.5 rounded-sm text-xs leading-relaxed border ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                }`}
              >
                <strong>{testResult.success ? `${t('Success', 'Thành công')}: ` : `${t('Error', 'Lỗi')}: `}</strong>
                {testResult.message}
              </div>
            )}
          </div>
        </section>

        {/* Submit action */}
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="h-8 px-4 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> {t('Saving changes...', 'Đang lưu thay đổi...')}
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> {t('Save Configuration', 'Lưu Cấu hình')}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
