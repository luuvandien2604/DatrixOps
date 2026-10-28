'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { copyTextToClipboard } from '@/lib/clipboard';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import { useLanguage } from '@/components/LanguageContext';

interface APIKey {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export default function APIKeyPage() {
  const { t, isVi } = useLanguage();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [pendingRevokeKey, setPendingRevokeKey] = useState<APIKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function fetchKeys() {
    try {
      setLoading(true);
      const data = await apiClient('/apikeys');
      setKeys(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialRequest = window.setTimeout(() => void fetchKeys(), 0);
    return () => window.clearTimeout(initialRequest);
  }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const data = await apiClient('/apikeys', {
        data: { name: newKeyName }
      });
      setGeneratedKey(data.raw_key);
      void fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmRevokeKey = async () => {
    if (!pendingRevokeKey) return;
    setRevoking(true);
    try {
      await apiClient(`/apikeys/${pendingRevokeKey.id}`, { method: 'DELETE' });
      setPendingRevokeKey(null);
      void fetchKeys();
    } catch (err) {
      console.error(err);
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await copyTextToClipboard(generatedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Unable to copy API key', error);
    }
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setGeneratedKey('');
  };

  return (
    <div className="space-y-5 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--foreground)] flex items-center gap-2.5">
            <Key className="w-5 h-5 text-emerald-500" />
            {t('API Keys', 'Khóa API')}
          </h1>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition duration-100 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          {t('Generate New Key', 'Tạo Khóa Mới')}
        </button>
      </div>

      <div className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-[var(--color-muted)] text-xs animate-pulse">
            {t('Loading API keys...', 'Đang tải khóa API...')}
          </div>
        ) : keys.length === 0 ? (
          <div className="p-12 text-center text-[var(--color-muted)] text-xs">
            {t('No API Keys found', 'Không tìm thấy khóa API nào')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[11px] font-bold text-[var(--color-muted)] uppercase bg-[var(--surface-2)] border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="px-4 py-2.5">{t('Name', 'Tên')}</th>
                  <th className="px-4 py-2.5">{t('Created', 'Ngày tạo')}</th>
                  <th className="px-4 py-2.5">{t('Last Used', 'Dùng lần cuối')}</th>
                  <th className="px-4 py-2.5 text-right">{t('Actions', 'Thao tác')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-[var(--surface-2)] transition duration-100">
                    <td className="px-4 py-3 font-semibold text-xs text-[var(--foreground)]">{k.name}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[11px] text-[var(--color-muted)]">
                      {new Date(k.created_at).toLocaleString(isVi ? 'vi-VN' : 'en-US')}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-[11px] text-[var(--color-muted)]">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleString(isVi ? 'vi-VN' : 'en-US') : t('Never', 'Chưa từng')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setPendingRevokeKey(k)}
                        className="h-7 w-7 rounded-sm border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/50 inline-flex items-center justify-center transition duration-100"
                        title={t('Revoke Key', 'Thu hồi Khóa')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="ops-scrim fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
          <div role="dialog" aria-modal="true" aria-labelledby="api-key-dialog-title" className="w-full max-w-md p-5 rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl animate-in zoom-in-95 duration-100">
            <h3 id="api-key-dialog-title" className="text-sm font-bold text-[var(--foreground)] mb-3">
              {t('Generate API Key', 'Tạo Khóa API')}
            </h3>
            
            {generatedKey ? (
              <div className="space-y-3.5">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-sm">
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mb-0.5">
                    {t('Make sure to copy your API key now.', 'Hãy sao chép khóa API ngay bây giờ.')}
                  </p>
                  <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80">
                    {t("You won't be able to see it again!", 'Bạn sẽ không thể nhìn thấy lại khóa này!')}
                  </p>
                </div>
                
                <div className="flex items-center gap-2 p-2.5 bg-[var(--surface-2)] rounded-sm border border-[var(--border-default)]">
                  <code className="text-emerald-500 text-xs font-mono flex-1 truncate select-all">{generatedKey}</code>
                  <button 
                    type="button"
                    onClick={copyToClipboard}
                    aria-label={t('Copy generated API key', 'Sao chép khóa API')}
                    className="p-1.5 hover:bg-[var(--surface-3)] text-[var(--color-muted)] hover:text-[var(--foreground)] rounded transition duration-100"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
                  <button 
                    onClick={closeModal}
                    className="h-8 px-3.5 rounded-sm bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs font-semibold text-[var(--foreground)] transition duration-100"
                  >
                    {t('Close', 'Đóng')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <label htmlFor="api-key-name" className="block text-xs font-semibold text-[var(--foreground)] mb-1">
                    {t('Key Name', 'Tên Khóa')}
                  </label>
                  <input
                    id="api-key-name"
                    name="api-key-name"
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. CI/CD Script, Backup Agent"
                    className="w-full px-2.5 py-1.5 bg-[var(--surface-2)] border border-[var(--border-default)] rounded-sm text-xs text-[var(--foreground)] focus:border-blue-500 outline-none"
                    autoFocus
                  />
                </div>
                
                <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-subtle)]">
                  <button 
                    onClick={closeModal}
                    className="h-8 px-3 rounded-sm border border-[var(--border-default)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] text-xs font-semibold text-[var(--foreground)] transition duration-100"
                  >
                    {t('Cancel', 'Hủy')}
                  </button>
                  <button 
                    onClick={createKey}
                    disabled={!newKeyName.trim()}
                    className="h-8 px-3.5 rounded-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition duration-100"
                  >
                    {t('Generate', 'Tạo Khóa')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke API Key Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingRevokeKey)}
        title={t('Revoke API Key', 'Thu hồi Khóa API')}
        message={t(
          `Are you sure you want to revoke API key "${pendingRevokeKey?.name}"? Any applications or CI/CD pipelines using this key will immediately lose access.`,
          `Bạn có chắc chắn muốn thu hồi khóa API "${pendingRevokeKey?.name}"? Mọi ứng dụng hoặc luồng CI/CD sử dụng khóa này sẽ mất quyền truy cập ngay lập tức.`
        )}
        confirmText={t('Revoke Key', 'Thu hồi Khóa')}
        cancelText={t('Cancel', 'Hủy')}
        variant="danger"
        loading={revoking}
        onConfirm={() => void confirmRevokeKey()}
        onCancel={() => setPendingRevokeKey(null)}
      />
    </div>
  );
}
