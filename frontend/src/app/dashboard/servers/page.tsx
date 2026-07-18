'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';
import {
  Server, RefreshCw, TerminalSquare, FileText, Play, Trash2, XCircle, AlertTriangle, UploadCloud
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ServersPage() {
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals state
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [generatedAgentToken, setGeneratedAgentToken] = useState<string | null>(null);
  const [selectedOs, setSelectedOs] = useState<'linux' | 'macos' | 'windows'>('linux');
  const [customServices, setCustomServices] = useState('');

  // Keep both id and name for confirmation dialogs.
  const [serverToRestart, setServerToRestart] = useState<{ id: string, name: string } | null>(null);
  const [confirmRestartText, setConfirmRestartText] = useState('');

  const [serverToDelete, setServerToDelete] = useState<{ id: string, name: string } | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState('');

  // Edit Meta
  const [editMetaServer, setEditMetaServer] = useState<any>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editEnvironment, setEditEnvironment] = useState('');

  // Update Agent
  const [serverToUpdate, setServerToUpdate] = useState<{ id: string, name: string } | null>(null);
  const [isUpdatingAgent, setIsUpdatingAgent] = useState(false);
  const [isUpdateAllOpen, setIsUpdateAllOpen] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  // Safe hand-off to the operator's local SSH client. Browser terminal/tunnel
  // support remains a separate architecture item.
  const [sshServer, setSSHServer] = useState<{name: string, ipAddress: string} | null>(null);
  const [sshUsername, setSSHUsername] = useState('root');
  const [sshPort, setSSHPort] = useState('22');

  const router = useRouter();

  useEffect(() => {
    fetchServers();
    // Refresh every five seconds so CPU, RAM, and status stay near real time.
    // Production agents report every ten seconds, so faster polling adds no new data.
    const interval = setInterval(() => fetchServers(true), 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchServers = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiClient('/servers');
      setServers(data);
    } catch (err: any) {
      if (err.message.includes('token') || err.message.includes('UNAUTHORIZED')) {
        router.push('/login');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const getInstallCommand = () => {
    const services = customServices.trim();
    const shellServicesArgument = services ? ` "${services}"` : '';
    const powershellServicesArgument = services ? ` -Services "${services}"` : '';
    switch (selectedOs) {
      case 'linux':
        return `curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- ${generatedAgentToken}${shellServicesArgument}`;
      case 'macos':
        return `curl -sL https://datrixops.vandien.space/install-mac.sh | sudo bash -s -- ${generatedAgentToken}${shellServicesArgument}`;
      case 'windows':
        return `Invoke-WebRequest -Uri "https://datrixops.vandien.space/install.ps1" -OutFile "install.ps1"; .\\install.ps1 -Token "${generatedAgentToken}"${powershellServicesArgument}`;
      default:
        return '';
    }
  };

  const getSSHCommand = () => sshServer
    ? `ssh -p ${sshPort || '22'} ${sshUsername || 'root'}@${sshServer.ipAddress}`
    : '';

  return (
    <div className="space-y-6 pb-20">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-1">Server Management</h1>
          <p className="text-sm text-[var(--color-muted)]">Manage and monitor your server fleet</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setIsUpdateAllOpen(true)}
            disabled={servers.length === 0 || isUpdatingAll}
            className="liquid-button secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            Update all agents
          </button>
          <button onClick={() => fetchServers()} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-medium transition-colors border border-white/5 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : 'text-[var(--color-muted)]'}`} />
            Refresh
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
                  let serverSnapshot = null;
                  try { if (server.os_info) osInfo = JSON.parse(server.os_info); } catch (e) { }
                  try {
                    if (server.snapshot) {
                      serverSnapshot = typeof server.snapshot === 'string' ? JSON.parse(server.snapshot) : server.snapshot;
                    }
                  } catch (e) { }

                  const isOffline = server.status !== 'online';
                  const agentIPAddress = server.ip_address || serverSnapshot?.system_info?.public_ip || osInfo?.snapshot?.system_info?.public_ip || '';
                  // os_info remains available after an agent disconnects.
                  // Do not present stale CPU or RAM values as live telemetry.
                  const liveInfo = isOffline ? null : osInfo;

                  const isCritical = liveInfo && liveInfo.cpu_usage > 90;

                  return (
                    <tr
                      key={server.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`Open ${server.name}`}
                      onClick={() => router.push(`/dashboard/servers/${server.id}`)}
                      onKeyDown={event => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          router.push(`/dashboard/servers/${server.id}`);
                        }
                      }}
                      className="group cursor-pointer transition-colors hover:bg-white/[0.035] focus-visible:bg-white/[0.035] focus-visible:outline-none"
                    >
                      <td className="py-4 px-6">
                        <div className="font-medium text-[var(--foreground)] transition-colors group-hover:text-blue-400">{server.name}</div>
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
                        {agentIPAddress || '—'}
                      </td>
                      <td className="py-4 px-6 text-sm">
                        <div className="text-[var(--foreground)]">{osInfo ? osInfo.os_name : 'Unknown'}</div>
                        <div className="text-xs text-[var(--color-muted)] mt-1">{osInfo ? `${osInfo.cpu_cores} Cores` : '—'}</div>
                      </td>
                      <td className="py-4 px-6">
                        {liveInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{liveInfo.cpu_usage.toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full ${liveInfo.cpu_usage > 90 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(liveInfo.cpu_usage, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]" title={isOffline ? 'Agent is offline' : undefined}>—</span>}
                      </td>
                      <td className="py-4 px-6">
                        {liveInfo ? (
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm min-w-[3rem]">{((liveInfo.memory_used / liveInfo.memory_total) * 100).toFixed(1)}%</span>
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: `${Math.min((liveInfo.memory_used / liveInfo.memory_total) * 100, 100)}%` }}></div>
                            </div>
                          </div>
                        ) : <span className="text-[var(--color-muted)]" title={isOffline ? 'Agent is offline' : undefined}>—</span>}
                      </td>
                      <td className="py-4 px-6">
                        <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium border ${server.status === 'online'
                          ? isCritical ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-gray-500/10 text-[var(--color-muted)] border-gray-500/20'
                          }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${server.status === 'online' ? (isCritical ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500') : 'bg-gray-500'
                            }`}></div>
                          {server.status === 'online' ? (isCritical ? 'CRITICAL' : 'ONLINE') : 'OFFLINE'}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        {/* Keep actions visible without hover-dependent discovery. */}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setEditMetaServer(server);
                              setEditGroupName(server.group_name || '');
                              setEditTags((server.tags || []).join(', '));
                              setEditProvider(server.provider || '');
                              setEditRegion(server.region || '');
                              setEditEnvironment(server.environment || '');
                            }}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 rounded border border-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors" title="Edit Group & Tags">
                            <FileText className="w-4 h-4" />
                          </button>
                          <button
                            disabled={!agentIPAddress}
                            onClick={event => {
                              event.stopPropagation();
                              if (!agentIPAddress) return;
                              setSSHUsername('root');
                              setSSHPort('22');
                              setSSHServer({ name: server.name, ipAddress: agentIPAddress });
                            }}
                            className="p-1.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400 transition-colors hover:bg-blue-500/20 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-35"
                            title={agentIPAddress ? 'Open local SSH connection' : 'IP address is unavailable'}
                          >
                            <TerminalSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setServerToUpdate({ id: server.id, name: server.name });
                            }}
                            className="p-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded border border-emerald-500/20 text-emerald-400 hover:text-emerald-300 transition-colors" title="Update Agent">
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setServerToRestart({ id: server.id, name: server.name });
                            }}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors" title="Restart">
                            <Play className="w-4 h-4 rotate-180" />
                          </button>
                          <button
                            onClick={event => {
                              event.stopPropagation();
                              setServerToDelete({ id: server.id, name: server.name });
                            }}
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

      {sshServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-labelledby="ssh-connect-title" className="glass-card w-full max-w-lg overflow-hidden border-blue-500/30 bg-[var(--background-card)]">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] p-6">
              <div className="flex items-center gap-3">
                <TerminalSquare className="h-6 w-6 text-blue-500" />
                <div>
                  <h2 id="ssh-connect-title" className="text-xl font-bold text-[var(--foreground)]">Connect with SSH</h2>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">{sshServer.name}</p>
                </div>
              </div>
              <button type="button" aria-label="Close SSH connection dialog" onClick={() => setSSHServer(null)} className="text-[var(--color-muted)] transition-colors hover:text-[var(--foreground)]">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-5 p-6">
              <p className="text-sm leading-6 text-[var(--color-muted)]">
                This opens your operating system&apos;s local SSH application; it is not an embedded browser terminal. The command is copied automatically as a fallback, and credentials and private keys remain on your device.
              </p>
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Username</span>
                  <input value={sshUsername} onChange={event => setSSHUsername(event.target.value.replace(/[^A-Za-z0-9._-]/g, ''))} className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] outline-none focus:border-blue-500" />
                </label>
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Port</span>
                  <input inputMode="numeric" value={sshPort} onChange={event => setSSHPort(event.target.value.replace(/\D/g, '').slice(0, 5))} className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--background)] px-4 py-2 text-[var(--foreground)] outline-none focus:border-blue-500" />
                </label>
              </div>
              <div>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Host</span>
                <div className="rounded-xl border border-[var(--border-color)] bg-[var(--background)] px-4 py-3 font-mono text-sm text-[var(--foreground)]">{sshServer.ipAddress}</div>
              </div>
              <div className="rounded-xl border border-[var(--border-color)] bg-black/25 px-4 py-3 font-mono text-sm text-emerald-500">
                {getSSHCommand()}
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => setSSHServer(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background)]">Cancel</button>
                <button
                  type="button"
                  disabled={!sshUsername || !sshPort}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(getSSHCommand());
                      toast.success('SSH command copied');
                    } catch {
                      toast.error('Clipboard access was denied');
                    }
                  }}
                  className="liquid-button secondary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Copy command
                </button>
                <button
                  type="button"
                  disabled={!sshUsername || !sshPort || Number(sshPort) < 1 || Number(sshPort) > 65535}
                  onClick={async () => {
                    const host = sshServer.ipAddress.includes(':') ? `[${sshServer.ipAddress}]` : sshServer.ipAddress;
                    try {
                      await navigator.clipboard.writeText(getSSHCommand());
                      toast.success('SSH command copied; opening your local SSH application');
                    } catch {
                      toast('Opening your local SSH application');
                    }
                    window.location.href = `ssh://${encodeURIComponent(sshUsername)}@${host}:${sshPort}`;
                  }}
                  className="liquid-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <TerminalSquare className="h-4 w-4" />
                  Open local SSH app
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {isAddServerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="add-server-title" className="glass-card w-full max-w-2xl bg-[#0B0F14] border-white/10 overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-white/5">
              <h2 id="add-server-title" className="text-xl font-bold text-[var(--foreground)]">Add New Server</h2>
              <button type="button" aria-label="Close add server dialog" onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); }} className="text-[var(--color-muted)] hover:text-[var(--foreground)] transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6">
              {!generatedAgentToken ? (
                <>
                  <p className="text-[var(--color-muted)] mb-6">
                    Each server receives a unique <strong>Agent Token</strong>. Enter a recognizable name for this server:
                  </p>
                  <div className="mb-6">
                    <label htmlFor="new-server-name" className="block text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-2">Server Name</label>
                    <input
                      id="new-server-name"
                      name="new-server-name"
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
                          toast.success('Installation command created successfully!');
                        } catch (err: any) {
                          toast.error(err.message || 'Unable to create installation token');
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
                    Server created successfully. Select an operating system and run the command with Administrator or root privileges.
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

                  <div className="mb-4">
                    <label htmlFor="custom-services" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">Services to monitor <span className="normal-case font-normal">(optional)</span></label>
                    <input
                      id="custom-services"
                      value={customServices}
                      onChange={event => setCustomServices(event.target.value.replace(/[^A-Za-z0-9._@,$ \-]/g, ''))}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-blue-500"
                      placeholder={selectedOs === 'linux' ? 'nginx,postgresql,docker,ssh' : selectedOs === 'macos' ? 'com.openssh.sshd,homebrew.mxcl.nginx' : 'EventLog,Schedule,WinRM,sshd'}
                    />
                    <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">Leave blank to use the recommended defaults for {selectedOs === 'macos' ? 'macOS' : selectedOs === 'windows' ? 'Windows' : 'Linux'}. Use comma-separated native service identifiers.</p>
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
                    <button onClick={() => { setIsAddServerModalOpen(false); setGeneratedAgentToken(null); setNewServerName(''); setCustomServices(''); fetchServers(); }} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
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
          <div role="alertdialog" aria-modal="true" aria-labelledby="restart-server-title" className="glass-card w-full max-w-md bg-[#0B0F14] border-rose-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <h2 id="restart-server-title" className="text-xl font-bold text-[var(--foreground)]">Restart Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                You are about to restart the server <strong className="text-[var(--foreground)]">{serverToRestart.name}</strong>. This action may cause downtime.
              </p>
              <div className="mb-6">
                <label htmlFor="restart-server-confirmation" className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToRestart.name}" to confirm
                </label>
                <input
                  id="restart-server-confirmation"
                  name="restart-server-confirmation"
                  type="text"
                  value={confirmRestartText}
                  onChange={(e) => setConfirmRestartText(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-[var(--foreground)] focus:outline-none focus:border-rose-500"
                  placeholder={serverToRestart.name}
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
                  disabled={confirmRestartText !== serverToRestart.name}
                  onClick={async () => {
                    if (!serverToRestart) return;
                    try {
                      await apiClient(`/servers/${serverToRestart.id}/tasks`, {
                        method: 'POST',
                        data: { type: 'vps_reboot', payload: '{}' }
                      });
                      toast.success(`Restart command sent to ${serverToRestart.name}`);
                      setServerToRestart(null);
                      setConfirmRestartText('');
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to send restart command');
                    }
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
          <div role="alertdialog" aria-modal="true" aria-labelledby="delete-server-title" className="glass-card w-full max-w-md bg-[#0B0F14] border-rose-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-rose-500/5">
              <Trash2 className="w-6 h-6 text-rose-500" />
              <h2 id="delete-server-title" className="text-xl font-bold text-[var(--foreground)]">Delete Server?</h2>
            </div>
            <div className="p-6">
              <p className="text-[var(--color-muted)] mb-4">
                You are about to permanently delete the server <strong className="text-[var(--foreground)]">{serverToDelete.name}</strong>. All associated metrics and data will be lost.
              </p>
              <div className="mb-6">
                <label htmlFor="delete-server-confirmation" className="block text-xs font-medium text-[var(--color-muted)] mb-2 uppercase tracking-wider">
                  Type "{serverToDelete.name}" to confirm
                </label>
                <input
                  id="delete-server-confirmation"
                  name="delete-server-confirmation"
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
                      toast.success(`Server ${serverToDelete.name} deleted successfully`);
                      setServerToDelete(null);
                      setConfirmDeleteText('');
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to delete server');
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
          <div role="dialog" aria-modal="true" aria-labelledby="edit-server-title" className="glass-card w-full max-w-2xl bg-[var(--background-card)] border-amber-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-amber-500/5">
              <FileText className="w-6 h-6 text-amber-500" />
              <h2 id="edit-server-title" className="text-xl font-bold text-[var(--foreground)]">Edit Server Info</h2>
            </div>
            <div className="p-6">
              <div className="mb-4">
                <label htmlFor="server-group-name" className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Group Name</label>
                <input
                  id="server-group-name"
                  name="server-group-name"
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. Production"
                />
              </div>
              <div className="mb-6">
                <label htmlFor="server-tags" className="block text-xs font-semibold text-[var(--color-muted)] uppercase mb-2">Tags (comma separated)</label>
                <input
                  id="server-tags"
                  name="server-tags"
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[var(--foreground)] outline-none focus:border-amber-500"
                  placeholder="e.g. web, database, vietnam"
                />
              </div>
              <div className="mb-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="server-provider" className="mb-2 block text-xs font-semibold uppercase text-[var(--color-muted)]">Provider</label>
                  <input id="server-provider" value={editProvider} onChange={(event) => setEditProvider(event.target.value)} className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-amber-500" placeholder="AWS" />
                </div>
                <div>
                  <label htmlFor="server-region" className="mb-2 block text-xs font-semibold uppercase text-[var(--color-muted)]">Region</label>
                  <input id="server-region" value={editRegion} onChange={(event) => setEditRegion(event.target.value)} className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-amber-500" placeholder="ap-southeast-1" />
                </div>
                <div>
                  <label htmlFor="server-environment" className="mb-2 block text-xs font-semibold uppercase text-[var(--color-muted)]">Environment</label>
                  <input id="server-environment" value={editEnvironment} onChange={(event) => setEditEnvironment(event.target.value)} className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-amber-500" placeholder="Production" />
                </div>
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
                        data: {
                          group_name: editGroupName.trim(),
                          tags: tagsArray,
                          provider: editProvider.trim(),
                          region: editRegion.trim(),
                          environment: editEnvironment.trim(),
                        }
                      });
                      fetchServers();
                      toast.success('Server information updated!');
                      setEditMetaServer(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to update server information');
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
          <div role="alertdialog" aria-modal="true" aria-labelledby="update-agent-title" className="glass-card w-full max-w-md bg-[#0B0F14] border-emerald-500/30 overflow-hidden flex flex-col">
            <div className="flex items-center gap-3 p-6 border-b border-white/5 bg-emerald-500/5">
              <RefreshCw className="w-6 h-6 text-emerald-500" />
              <h2 id="update-agent-title" className="text-xl font-bold text-[var(--foreground)]">Update Agent?</h2>
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
                  disabled={isUpdatingAgent}
                  onClick={async () => {
                    setIsUpdatingAgent(true);
                    try {
                      await apiClient(`/servers/${serverToUpdate.id}/tasks`, {
                        method: 'POST',
                        data: { type: 'agent_update', payload: '{}', timeout_seconds: 300 }
                      });
                      toast.success(`Update command sent to ${serverToUpdate.name}`);
                      setServerToUpdate(null);
                    } catch (err: any) {
                      toast.error(err.message || 'Error updating agent');
                    } finally {
                      setIsUpdatingAgent(false);
                    }
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                  {isUpdatingAgent ? 'Queueing…' : 'Start Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isUpdateAllOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div role="alertdialog" aria-modal="true" aria-labelledby="update-all-agents-title" className="glass-card flex w-full max-w-lg flex-col overflow-hidden border border-emerald-500/30 bg-[var(--background-card)]">
            <div className="flex items-center gap-3 border-b border-[var(--border-color)] bg-emerald-500/5 p-6">
              <UploadCloud className="h-6 w-6 text-emerald-500" />
              <h2 id="update-all-agents-title" className="text-xl font-bold text-[var(--foreground)]">Update all agents?</h2>
            </div>
            <div className="p-6">
              <p className="leading-6 text-[var(--color-muted)]">
                This queues the current agent release for all {servers.length} servers in your workspace. Online agents will update on their next heartbeat; offline agents can claim the task when they reconnect within 24 hours.
              </p>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                Agents that already have a pending or processing update will be skipped. Legacy agents older than 1.3.0 require the one-time token-free in-place update before they can process dashboard update tasks.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button type="button" disabled={isUpdatingAll} onClick={() => setIsUpdateAllOpen(false)} className="rounded-lg px-4 py-2 font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--background)] disabled:opacity-50">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isUpdatingAll}
                  onClick={async () => {
                    setIsUpdatingAll(true);
                    try {
                      const result = await apiClient('/servers/actions/update-agents', { method: 'POST', data: {} });
                      toast.success(`${result.queued} agent update${result.queued === 1 ? '' : 's'} queued; ${result.skipped} skipped.`);
                      setIsUpdateAllOpen(false);
                    } catch (err: any) {
                      toast.error(err.message || 'Unable to queue all agent updates');
                    } finally {
                      setIsUpdatingAll(false);
                    }
                  }}
                  className="liquid-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadCloud className="h-4 w-4" />
                  {isUpdatingAll ? 'Queueing updates…' : 'Update all agents'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
