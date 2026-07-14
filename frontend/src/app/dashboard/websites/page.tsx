'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, CheckCircle2, XCircle, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

interface Website {
  id: string;
  name: string;
  url: string;
  status: string;
  ssl_issuer?: string;
  ssl_valid_to?: string;
  ssl_days_remaining?: number;
  last_check?: string;
}

export default function WebsitesPage() {
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchWebsites();
    const interval = setInterval(fetchWebsites, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchWebsites = async () => {
    try {
      const data = await apiClient('/websites');
      setWebsites(data || []);
    } catch (err) {
      console.error('Failed to fetch websites:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiClient('/websites', {
        data: { name: newName, url: newUrl }
      });
      setIsModalOpen(false);
      setNewName('');
      setNewUrl('');
      fetchWebsites();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc muốn xoá website này?')) return;
    try {
      await apiClient(`/websites/${id}`, { method: 'DELETE' });
      fetchWebsites();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">Website & SSL Monitoring</h1>
          <p className="text-[var(--color-muted)] text-sm mt-1">
            Giám sát trạng thái hoạt động (Ping) và thời hạn chứng chỉ SSL tự động.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Thêm Website
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : websites.length === 0 ? (
        <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-12 text-center">
          <Globe className="w-12 h-12 text-[var(--color-muted)] mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">Chưa có Website nào</h3>
          <p className="text-[var(--color-muted)] text-sm">Thêm một URL (https://...) để hệ thống bắt đầu giám sát.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {websites.map(w => (
            <div key={w.id} className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5 hover:border-blue-500/30 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${w.status === 'UP' ? 'bg-emerald-500/10 text-emerald-500' : w.status === 'DOWN' ? 'bg-rose-500/10 text-rose-500' : 'bg-gray-500/10 text-gray-500'}`}>
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)] flex items-center gap-2">
                      {w.name}
                      {w.status === 'UP' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {w.status === 'DOWN' && <XCircle className="w-4 h-4 text-rose-500" />}
                    </h3>
                    <a href={w.url} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline">{w.url}</a>
                  </div>
                </div>
                <button onClick={() => handleDelete(w.id)} className="text-[var(--color-muted)] hover:text-rose-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-[var(--border-color)]">
                <div>
                  <div className="text-xs text-[var(--color-muted)] mb-1 flex items-center gap-1"><Shield className="w-3 h-3" /> CHỨNG CHỈ SSL</div>
                  <div className="text-sm font-medium text-[var(--foreground)] truncate">
                    {w.ssl_issuer ? w.ssl_issuer : <span className="text-gray-500">Không có SSL</span>}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-muted)] mb-1">THỜI HẠN CÒN LẠI</div>
                  <div className="flex items-center gap-1 text-sm font-medium">
                    {w.ssl_days_remaining !== undefined ? (
                      w.ssl_days_remaining > 15 ? (
                        <span className="text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {w.ssl_days_remaining} ngày</span>
                      ) : (
                        <span className="text-rose-400 flex items-center gap-1"><ShieldAlert className="w-4 h-4" /> {w.ssl_days_remaining} ngày</span>
                      )
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Thêm */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[var(--border-color)] flex justify-between items-center">
              <h3 className="font-bold text-[var(--foreground)]">Thêm Website giám sát</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--foreground)]">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddWebsite} className="p-4 space-y-4">
              {error && <div className="p-3 bg-rose-500/10 text-rose-500 border border-rose-500/20 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Tên gợi nhớ</label>
                <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full bg-[#0B0F14] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--foreground)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="VD: Trang chủ Cty" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">URL (Bao gồm https://)</label>
                <input required type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="w-full bg-[#0B0F14] border border-[var(--border-color)] rounded-lg px-3 py-2 text-[var(--foreground)] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none" placeholder="https://example.com" />
              </div>
              <div className="pt-2 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-[var(--color-muted)] hover:text-[var(--foreground)]">Huỷ</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                  {submitting ? 'Đang lưu...' : 'Thêm ngay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
