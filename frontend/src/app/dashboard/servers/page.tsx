'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import { 
  Server, RefreshCw, TerminalSquare, FileText, Play, Trash2, XCircle, AlertTriangle, Eye
} from 'lucide-react';
import Link from 'next/link';

export default function ServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modals state
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [generatedAgentToken, setGeneratedAgentToken] = useState<string | null>(null);
  const [selectedOs, setSelectedOs] = useState<'linux' | 'macos' | 'windows'>('linux');
  
  const [serverToRestart, setServerToRestart] = useState<string | null>(null);
  const [confirmRestartText, setConfirmRestartText] = useState('');
  
  const [serverToDelete, setServerToDelete] = useState<{id: string, name: string} | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  // Edit Meta
  const [editMetaServer, setEditMetaServer] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editTags, setEditTags] = useState('');

  // Update Agent
  const [serverToUpdate, setServerToUpdate] = useState<{id: string, name: string} | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const data = await apiClient('/servers');
      setServers(data);
    } catch (err: any) {
      if (err.message.includes('token') || err.message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  const getInstallCommand = () => {
    switch (selectedOs) {
      case 'linux':
        return `curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- ${generatedAgentToken}`;
      case 'macos':
        return `curl -sL https://datrixops.vandien.space/install-mac.sh | sudo bash -s -- ${generatedAgentToken}`;
      case 'windows':
        return `Invoke-WebRequest -Uri "https://datrixops.vandien.space/install.ps1" -OutFile "install.ps1"; .\\install.ps1 -Token "${generatedAgentToken}"`;
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Quản lý Servers</h1>
          <p className="text-sm text-[var(--color-muted)]">Quản lý và giám sát danh sách máy chủ của bạn</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchServers} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/5 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-[var(--color-muted)]'}`} />
            Làm mới
          </button>
          <button 
            onClick={() => setIsAddServerModalOpen(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-500/20 text-white flex items-center gap-2">
            <Server className="w-4 h-4" />
            + Add Server
          </button>
        </div>
      </div>

      {/* Server Status Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/[0.02] border-b border-white/5">
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Server</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">IP Address</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">OS / Spec</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">CPU</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">RAM</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">Status</th>
                <th className="py-4 px-6 text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider text-right">Quick Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {servers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[var(--color-muted)]">
                    No servers found. Add your first server to start monitoring.
                  </td>
                </tr>
              ) : (
                servers.map((server) => {
                  let osInfo = null;
                  try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) {}
                  
                  const isCritical = osInfo && osInfo.cpu_usage > 90;

                  return (
                    <tr key={server.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="py-4 px-6">
                        <Link href={`/dashboard/servers/${server.id}`} className="font-medium text-[var(--foreground)] hover:text-blue-400 transition-colors">
                          {server.name}
                        </Link>
                        {server.group_name && <div className="mt-1 text-xs font-semibold text-emerald-400">{server.group_name}</div>}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {server.tags && server.tags.map((t: string) => (
                            <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[10px] uppercase">
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 font-mono text-sm text-[var(--foreground)]">
                        {server.ip_address || '—'}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="text-[var(--foreground)]">{osInfo ? osInfo.os_name : 'Unknown'}</div>
                        <div className="text-xs text-[var(--color-muted)] mt-1">{osInfo ? `${osInfo.cpu_cores} Cores` : '—'}</div>
                      </td>
                      <td className="py-4 px-6">
                        {osInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{osInfo.cpu_usage.toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full ${osInfo.cpu_usage > 90 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(osInfo.cpu_usage, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]">—</span>}
                      </td>
                      <td className="py-4 px-6">
                        {osInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{((osInfo.memory_used/osInfo.memory_total)*100).toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${Math.min((osInfo.memory_used/osInfo.memory_total)*100, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]">—</span>}
                      </td>
                      <td className="py-4 px-6">
                        <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          server.status === 'online' 
                            ? isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-gray-500/10 text-[var(--color-muted)] border-gray-500/20'
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            server.status === 'online' ? (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-500'
                          }`}></div>
                          {server.status === 'online' ? (isCritical ? 'CRITICAL' : 'ONLINE') : 'OFFLINE'}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => router.push(`/dashboard/servers/${server.id}`)} className="p-1.5 bg-blue-500/10 hover:bg-blue-500/20 rounded border border-blue-500/20 text-blue-400 hover:text-blue-300 transition-colors" title="View Details">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              setEditMetaServer(server);
                              setEditGroupName(server.group_name || '');
                              setEditTags((server.tags || []).join(', '));
                            }}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors" title="Edit Group & Tags">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 bg-white/5 hover:bg-white/10 rounded border border-white/5 text-[var(--color-muted)] opacity-50 cursor-not-allowed transition-colors" title="SSH (Sắp ra mắt)">
                            <TerminalSquare className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setServerToUpdate({id: server.id, name: server.name})}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors" title="Update Agent">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setServerToRestart(server.name)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors" title="Restart">
                            <Play className="w-4 h-4 rotate-180" />
                          </button>
                          <button 
                            onClick={() => setServerToDelete({id: server.id, name: server.name})}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors" title="Delete">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Server Modal */}
      {isAddServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-2xl bg-[#0B0F14] border-white/10 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-white/5">
              <h2 className="text-xl font-bold text-[var(--foreground)]">Add New Server</h2>
              <button onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); }} className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {!generatedAgentToken ? (
                <>
                  <p className="text-[var(--color-muted)] mb-6">
                    Mỗi server sẽ được cấp một <strong>Agent Token</strong> riêng biệt để định danh. Vui lòng nhập tên gợi nhớ cho server này:
                  </p>
                  <div className="mb-6">
                    <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Server Name</label>
                    <input
                      type="text"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      className="w-full px-4 py-3 bg-white/[0.02] border border-white/10 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-[var(--foreground)] outline-none transition-all text-sm"
                      placeholder="production-db-01"
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => setIsAddServerModalOpen(false)} className="px-6 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                      Cancel
                    </button>
                    <button 
                      onClick={async () => {
                        if (!newServerName.trim()) return;
                        try {
                          const res = await apiClient('/servers', { method: 'POST', data: { name: newServerName.trim() } });
                          setGeneratedAgentToken(res.agent_token);
                        } catch (err: any) {
                          alert(err.message || 'Error generating token');
                        }
                      }}
                      disabled={!newServerName.trim()}
                      className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 rounded-lg font-medium transition-colors">
                      Generate Install Command
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[var(--color-muted)] mb-4">
                    Đã tạo thành công. Vui lòng chọn hệ điều hành và chạy lệnh (với quyền Admin/Root) để cài đặt Agent.
                  </p>
                  
                  {/* OS Tabs */}
                  <div className="flex gap-2 mb-4 border-b border-white/10 pb-2">
                    <button 
                      onClick={() => setSelectedOs('linux')} 
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'linux' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      Linux
                    </button>
                    <button 
                      onClick={() => setSelectedOs('macos')} 
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'macos' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      macOS
                    </button>
                    <button 
                      onClick={() => setSelectedOs('windows')} 
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${selectedOs === 'windows' ? 'bg-blue-600/20 text-blue-400' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>
                      Windows
                    </button>
                  </div>

                  <div className="bg-black/50 border border-white/10 rounded-lg p-4 font-mono text-sm mb-6 overflow-x-auto relative group">
                    <div className="text-emerald-400 whitespace-nowrap">
                      {getInstallCommand()}
                    </div>
                    <button 
                      onClick={() => navigator.clipboard.writeText(getInstallCommand())}
                      className="absolute top-2 right-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-sans opacity-0 group-hover:opacity-100 transition-opacity">
                      Copy
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); fetchServers(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Restart Confirm Dialog */}
      {serverToRestart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md bg-[#0B0F14] border-rose-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Restart Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                You are about to restart the server <strong className="text-[var(--foreground)]">{serverToRestart}</strong>. This action may cause downtime.
              </p>
              <div className="mb-6">
                <label className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToRestart}" to confirm
                </label>
                <input 
                  type="text" 
                  value={confirmRestartText}
                  onChange={(e) => setConfirmRestartText(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-rose-500"
                  placeholder={serverToRestart}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setServerToRestart(null);
                    setConfirmRestartText('');
                  }} 
                  className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button 
                  disabled={confirmRestartText !== serverToRestart}
                  onClick={() => {
                    alert(`Restart command sent to ${serverToRestart}`);
                    setServerToRestart(null);
                    setConfirmRestartText('');
                  }} 
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Restart Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {serverToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md bg-[#0B0F14] border-rose-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <Trash2 className="w-6 h-6 text-rose-500" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Delete Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                You are about to permanently delete the server <strong className="text-[var(--foreground)]">{serverToDelete.name}</strong>. All associated metrics and data will be lost.
              </p>
              <div className="mb-6">
                <label className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToDelete.name}" to confirm
                </label>
                <input 
                  type="text" 
                  value={confirmDeleteText}
                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-rose-500"
                  placeholder={serverToDelete.name}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => {
                    setServerToDelete(null);
                    setConfirmDeleteText('');
                  }} 
                  className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button 
                  disabled={confirmDeleteText !== serverToDelete.name}
                  onClick={async () => {
                    try {
                      await apiClient(`/servers/${serverToDelete.id}`, { method: 'DELETE' });
                      fetchServers();
                      setServerToDelete(null);
                      setConfirmDeleteText('');
                    } catch (err: any) {
                      alert(err.message || 'Error deleting server');
                    }
                  }} 
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors">
                  Delete Server
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Meta Confirm Dialog */}
      {editMetaServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md bg-[#0B0F14] border-amber-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-amber-500/5">
              <FileText className="w-6 h-6 text-amber-500" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Edit Server Info</h2>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Group Name</label>
                <input 
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. Production"
                />
              </div>
              <div className="mb-6">
                <label className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Tags (comma separated)</label>
                <input 
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. web, database, vietnam"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setEditMetaServer(null)}
                  className="px-4 py-2 hover:bg-white/5 rounded-lg text-sm transition-colors text-[var(--color-muted)]"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    const tagsArray = editTags.split(',').map(t => t.trim()).filter(Boolean);
                    try {
                      await apiClient(`/servers/${editMetaServer.id}/meta`, {
                        method: 'PUT',
                        data: { group_name: editGroupName.trim(), tags: tagsArray }
                      });
                      fetchServers();
                      setEditMetaServer(null);
                    } catch (err: any) {
                      alert(err.message || 'Error updating server');
                    }
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Update Agent Confirm Dialog */}
      {serverToUpdate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-card w-full max-w-md bg-[#0B0F14] border-emerald-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-emerald-500/5">
              <RefreshCw className="w-6 h-6 text-emerald-500" />
              <h2 className="text-xl font-bold text-[var(--foreground)]">Update Agent?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-6">
                You are about to send an update command to <strong className="text-[var(--foreground)]">{serverToUpdate.name}</strong>. The agent will restart and download the latest version automatically.
              </p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setServerToUpdate(null)} 
                  className="px-4 py-2 hover:bg-white/5 text-[var(--foreground)] rounded-lg font-medium transition-colors">
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await apiClient(`/servers/${serverToUpdate.id}/tasks`, { 
                        method: 'POST',
                        data: { type: 'agent_update', payload: '{}' }
                      });
                      alert(`Update command sent to ${serverToUpdate.name}`);
                      setServerToUpdate(null);
                    } catch (err: any) {
                      alert(err.message || 'Error updating agent');
                    }
                  }} 
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors">
                  Start Update
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
