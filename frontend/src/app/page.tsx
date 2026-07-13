'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/apiClient';

interface Server {
  id: string;
  name: string;
  ip_address: string;
  status: string;
  agent_token?: string; // Only available immediately after creation
  os_info?: string;
  created_at: string;
}

export default function DashboardPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServerName, setNewServerName] = useState('');
  const [newServerIp, setNewServerIp] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [newToken, setNewToken] = useState('');

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
      } else {
        setError(err.message || 'Failed to fetch servers');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    setNewToken('');

    try {
      const data = await apiClient('/servers', {
        data: { name: newServerName, ip_address: newServerIp }
      });
      setNewToken(data.agent_token);
      setServers([data, ...servers]);
      setNewServerName('');
      setNewServerIp('');
    } catch (err: any) {
      setAddError(err.message || 'Failed to add server');
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this server? All its metrics will be lost.')) return;
    
    try {
      await apiClient(`/servers/${id}`, { method: 'DELETE' });
      setServers(servers.filter(s => s.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete server');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    router.push('/login');
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <nav className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-white tracking-wide">DatrixOps</h1>
        <button onClick={handleLogout} className="text-gray-400 hover:text-white transition-colors text-sm">
          Logout
        </button>
      </nav>

      <main className="max-w-6xl mx-auto p-6 mt-8">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-semibold text-white">Servers</h2>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg shadow-lg shadow-blue-500/20 transition-all font-medium text-sm"
          >
            + Add Server
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl mb-6">
            {error}
          </div>
        )}

        {servers.length === 0 ? (
          <div className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-12 text-center">
            <h3 className="text-xl text-gray-300 mb-2">No servers found</h3>
            <p className="text-gray-500 mb-6">You haven't added any servers to monitor yet.</p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Add your first server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {servers.map((server) => {
              let osInfo = null;
              if (server.os_info) {
                try {
                  osInfo = JSON.parse(server.os_info);
                } catch (e) {}
              }

              return (
                <div key={server.id} className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-xl relative overflow-hidden group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">{server.name}</h3>
                      <p className="text-gray-400 text-sm font-mono">{server.ip_address || 'No IP'}</p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      server.status === 'online' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    }`}>
                      {server.status.toUpperCase()}
                    </div>
                  </div>
                  
                  {server.status === 'online' && osInfo ? (
                    <div className="mt-4 flex-1 space-y-4">
                      {/* CPU Usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">CPU Usage</span>
                          <span className="text-white font-mono">{osInfo.cpu_usage?.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full transition-all duration-1000 ${
                              osInfo.cpu_usage > 90 ? 'bg-red-500' : osInfo.cpu_usage > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`} 
                            style={{ width: `${Math.min(osInfo.cpu_usage, 100)}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* RAM Usage */}
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-400">RAM Usage</span>
                          <span className="text-white font-mono">
                            {((osInfo.memory_used || 0) / 1024 / 1024 / 1024).toFixed(1)} / {((osInfo.memory_total || 0) / 1024 / 1024 / 1024).toFixed(1)} GB
                          </span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full transition-all duration-1000 ${
                              (osInfo.memory_used / osInfo.memory_total) > 0.9 ? 'bg-red-500' : (osInfo.memory_used / osInfo.memory_total) > 0.7 ? 'bg-amber-500' : 'bg-blue-500'
                            }`} 
                            style={{ width: `${Math.min((osInfo.memory_used / osInfo.memory_total) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      {/* System Info */}
                      <div className="pt-2 text-xs text-gray-500 flex justify-between border-t border-gray-700/50 mt-4">
                        <span>OS: {osInfo.os_name || 'Unknown'}</span>
                        <span>Cores: {osInfo.cpu_cores || '-'}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex-1 flex items-center justify-center border-t border-gray-700/50 pt-4">
                      <span className="text-gray-500 text-sm">No metrics available</span>
                    </div>
                  )}
                  
                  <div className="mt-4 pt-4 border-t border-gray-700/50 flex justify-end">
                    <button 
                      onClick={() => handleDelete(server.id)}
                      className="text-gray-500 hover:text-red-400 text-sm transition-colors opacity-0 group-hover:opacity-100"
                    >
                      Delete Server
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Add Server Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-2xl p-8 w-full max-w-md border border-gray-700 shadow-2xl">
            <h3 className="text-2xl font-bold text-white mb-6">Add New Server</h3>
            
            {newToken ? (
              <div>
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-5 rounded-xl mb-6">
                  <h4 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Server added successfully!
                  </h4>
                  
                  <div className="mb-4">
                    <p className="text-gray-300 text-sm mb-2 font-medium">Option 1: 1-Click Install (Recommended)</p>
                    <p className="text-gray-500 text-xs mb-2">Run this command on your VPS to automatically download, install, and start the DatrixOps Agent as a background service.</p>
                    <div className="relative group">
                      <pre className="bg-gray-900 p-4 rounded-lg font-mono text-sm text-gray-300 overflow-x-auto border border-gray-700 select-all whitespace-pre-wrap break-all">
                        {`curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- ${newToken}`}
                      </pre>
                    </div>
                  </div>

                  <div className="border-t border-gray-700/50 pt-4">
                    <p className="text-gray-300 text-sm mb-2 font-medium">Option 2: Manual Installation</p>
                    <div className="flex gap-3">
                      <a 
                        href={`https://datrixops.vandien.space/datrixops-agent`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-center text-white text-sm py-2 rounded-lg transition-colors"
                      >
                        Download Linux Binary
                      </a>
                      <div className="flex-1 text-center bg-gray-900 border border-gray-700 p-2 rounded-lg text-gray-400 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap" title={newToken}>
                        Token: {newToken}
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => { setShowAddModal(false); setNewToken(''); }}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-lg transition-colors font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddServer} className="space-y-5">
                {addError && <div className="text-red-400 text-sm">{addError}</div>}
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">Server Name</label>
                  <input
                    type="text"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    required
                    placeholder="e.g. Production Database"
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white outline-none transition-all"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">IP Address (Optional)</label>
                  <input
                    type="text"
                    value={newServerIp}
                    onChange={(e) => setNewServerIp(e.target.value)}
                    placeholder="192.168.1.1"
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white outline-none transition-all"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={addLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl transition-colors font-medium disabled:opacity-50"
                  >
                    {addLoading ? 'Adding...' : 'Add Server'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
