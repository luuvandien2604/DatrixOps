'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/apiClient';
import { Key, Plus, Trash2, Copy, Check } from 'lucide-react';

interface APIKey {
  id: string;
  name: string;
  last_used_at: string | null;
  created_at: string;
}

export default function APIKeyPage() {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      setLoading(true);
      const data = await apiClient('/apikeys');
      setKeys(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    try {
      const data = await apiClient('/apikeys', {
        data: { name: newKeyName }
      });
      setGeneratedKey(data.raw_key);
      fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API Key?')) return;
    try {
      await apiClient(`/apikeys/${id}`, { method: 'DELETE' });
      fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewKeyName('');
    setGeneratedKey('');
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2 flex items-center gap-3">
            <Key className="w-6 h-6 text-emerald-500" />
            API Keys
          </h1>
          <p className="text-[var(--color-muted)]">Manage your Public REST API Keys for third-party integrations.</p>
        </div>
        <button 
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_15px_rgba(37,99,235,0.3)]"
        >
          <Plus className="w-4 h-4" />
          Generate New Key
        </button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm animate-pulse">Loading API keys...</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-muted)] text-sm">No API Keys found</div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-[var(--color-muted)] uppercase bg-black/5 dark:bg-white/5">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Last Used</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-muted)]/10">
              {keys.map((k) => (
                <tr key={k.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-medium text-[var(--foreground)]">{k.name}</td>
                  <td className="px-6 py-4 text-[var(--color-muted)]">{new Date(k.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-[var(--color-muted)]">
                    {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => deleteKey(k.id)}
                      className="text-rose-400 hover:text-rose-300 p-2 hover:bg-white/5 rounded-lg transition-colors"
                      title="Revoke Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="glass-card w-full max-w-md p-6 rounded-2xl border border-white/10 shadow-2xl">
            <h3 className="text-xl font-bold mb-4">Generate API Key</h3>
            
            {generatedKey ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <p className="text-sm text-amber-400 font-medium mb-1">Make sure to copy your API key now.</p>
                  <p className="text-xs text-amber-500/80">You won't be able to see it again!</p>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-black/20 rounded-lg border border-white/5">
                  <code className="text-emerald-400 text-sm flex-1 truncate">{generatedKey}</code>
                  <button 
                    onClick={copyToClipboard}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-[var(--color-muted)]" />}
                  </button>
                </div>

                <div className="flex justify-end pt-4">
                  <button 
                    onClick={closeModal}
                    className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Key Name</label>
                  <input
                    type="text"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    placeholder="e.g. CI/CD Script"
                    className="w-full px-4 py-2 bg-white/[0.02] border border-white/10 rounded-lg focus:ring-1 focus:ring-blue-500 text-sm outline-none"
                    autoFocus
                  />
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button 
                    onClick={closeModal}
                    className="hover:bg-white/5 px-4 py-2 rounded-lg text-sm transition-colors text-[var(--color-muted)]"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={createKey}
                    disabled={!newKeyName.trim()}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
