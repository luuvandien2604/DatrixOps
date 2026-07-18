'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Cpu, HardDrive, Activity, ShieldCheck, Box, Server as ServerIcon, TerminalSquare } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';

interface TopProcess {
  pid: number;
  name: string;
  cpu: number;
  ram: number;
  user: string;
}

interface ServiceStatus {
  name: string;
  status: string;
}

interface SystemInfo {
  kernel: string;
  uptime: number;
  public_ip: string;
  virtualization: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  cpu: string;
  ram: string;
}

interface Snapshot {
  system_info?: SystemInfo;
  top_processes?: TopProcess[];
  services?: ServiceStatus[];
  docker_containers?: DockerContainer[];
  package_update?: number;
}

interface ServerDetails {
  id: string;
  name: string;
  status: string;
  ip_address: string;
  os_info?: string;
  snapshot?: string;
}

export default function ServerDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const [server, setServer] = useState<ServerDetails | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [logsModal, setLogsModal] = useState<{isOpen: boolean, containerId: string, logs: string, loading: boolean}>({isOpen: false, containerId: '', logs: '', loading: false});

  useEffect(() => {
    fetchServer();
    const interval = setInterval(fetchServer, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const fetchServer = async () => {
    try {
      const data = await apiClient(`/servers/${params.id}`);
      setServer(data);
      if (data.snapshot && data.snapshot !== '{}') {
        setSnapshot(JSON.parse(data.snapshot));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDockerAction = async (action: string, containerId: string) => {
    try {
      if (action === 'docker_logs') {
        setLogsModal({isOpen: true, containerId, logs: 'Đang gửi yêu cầu lấy logs...', loading: true});
      } else {
        alert(`Đã gửi lệnh ${action} cho container ${containerId}. Sẽ mất khoảng 15s để thực thi.`);
      }

      const task = await apiClient(`/servers/${params.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          type: action,
          payload: JSON.stringify({ container_id: containerId })
        })
      });

      if (action === 'docker_logs') {
        // Poll for task result
        const pollLogs = setInterval(async () => {
          try {
            const res = await apiClient(`/servers/${params.id}/tasks/${task.id}`);
            if (res.status === 'completed') {
              setLogsModal({isOpen: true, containerId, logs: res.result || 'Không có logs.', loading: false});
              clearInterval(pollLogs);
            } else if (res.status === 'failed') {
              setLogsModal({isOpen: true, containerId, logs: `Lỗi khi lấy logs:\n${res.result}`, loading: false});
              clearInterval(pollLogs);
            }
          } catch (e) {
             console.error("Lỗi poll logs", e);
             clearInterval(pollLogs);
          }
        }, 2000); // poll every 2s
      }
    } catch (err) {
      console.error(err);
      alert('Có lỗi xảy ra khi gửi lệnh.');
      if (action === 'docker_logs') {
        setLogsModal(prev => ({...prev, loading: false, logs: 'Có lỗi xảy ra khi gọi API.'}));
      }
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-[var(--color-muted)]">Đang tải thông tin máy chủ...</div>;
  }

  if (!server) {
    return <div className="p-12 text-center text-[var(--color-muted)]">Không tìm thấy máy chủ.</div>;
  }

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    return `${d}d ${h}h ${m}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/dashboard/servers')} className="p-2 hover:bg-[var(--background-card)] rounded-lg text-[var(--color-muted)] transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
            {server.name}
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${server.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
              {server.status === 'online' ? 'Online' : 'Offline'}
            </span>
          </h1>
          <p className="text-[var(--color-muted)] text-sm mt-1 flex items-center gap-2">
            <ServerIcon className="w-4 h-4" /> {server.ip_address || (snapshot?.system_info?.public_ip) || 'Unknown IP'}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Server detail views" className="flex gap-4 overflow-x-auto border-b border-[var(--border-color)]">
        <button type="button" role="tab" aria-selected={activeTab === 'overview'} onClick={() => setActiveTab('overview')} className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors ${activeTab === 'overview' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Tổng quan (Overview)</button>
        <button type="button" role="tab" aria-selected={activeTab === 'processes'} onClick={() => setActiveTab('processes')} className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors ${activeTab === 'processes' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Tiến trình (Processes)</button>
        <button type="button" role="tab" aria-selected={activeTab === 'services'} onClick={() => setActiveTab('services')} className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors ${activeTab === 'services' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Dịch vụ (Services)</button>
        <button type="button" role="tab" aria-selected={activeTab === 'docker'} onClick={() => setActiveTab('docker')} className={`whitespace-nowrap pb-3 text-sm font-medium transition-colors ${activeTab === 'docker' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-[var(--color-muted)] hover:text-[var(--foreground)]'}`}>Docker</button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="text-sm font-medium text-[var(--color-muted)] mb-4 flex items-center gap-2"><Cpu className="w-4 h-4" /> THÔNG TIN HỆ THỐNG</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Hệ điều hành</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{server.os_info ? JSON.parse(server.os_info).os_name : 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Phiên bản Kernel</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{snapshot?.system_info?.kernel || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Nền tảng ảo hoá</span>
                <span className="text-sm font-medium text-[var(--foreground)] uppercase">{snapshot?.system_info?.virtualization || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[var(--color-muted)]">Thời gian hoạt động (Uptime)</span>
                <span className="text-sm font-medium text-[var(--foreground)]">{snapshot?.system_info?.uptime ? formatUptime(snapshot.system_info.uptime) : 'N/A'}</span>
              </div>
            </div>
          </div>
          <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5">
            <h3 className="text-sm font-medium text-[var(--color-muted)] mb-4 flex items-center gap-2"><Box className="w-4 h-4" /> BẢN CẬP NHẬT GÓI</h3>
            <div className="flex items-center gap-4">
              <div className="p-4 bg-blue-500/10 rounded-xl text-blue-500">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm text-[var(--color-muted)]">Các gói (Packages) chờ nâng cấp</p>
                <div className="text-2xl font-bold text-[var(--foreground)]">{snapshot?.package_update || 0} <span className="text-sm font-normal text-[var(--color-muted)]">packages</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'processes' && (
        <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2"><Activity className="w-4 h-4" /> TOP TIẾN TRÌNH (NGỐN TÀI NGUYÊN)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0B0F14] text-[var(--color-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">PID</th>
                  <th className="px-6 py-3 font-medium">Tên (Command)</th>
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">CPU %</th>
                  <th className="px-6 py-3 font-medium">RAM %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {snapshot?.top_processes?.map(p => (
                  <tr key={p.pid} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 text-[var(--color-muted)]">{p.pid}</td>
                    <td className="px-6 py-3 font-medium text-[var(--foreground)]">{p.name}</td>
                    <td className="px-6 py-3 text-[var(--color-muted)]">{p.user}</td>
                    <td className="px-6 py-3 text-rose-400">{p.cpu.toFixed(1)}%</td>
                    <td className="px-6 py-3 text-blue-400">{p.ram.toFixed(1)}%</td>
                  </tr>
                ))}
                {!snapshot?.top_processes?.length && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-[var(--color-muted)]">Chưa có dữ liệu tiến trình</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {snapshot?.services?.map(s => (
            <div key={s.name} className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.status === 'running' ? 'bg-emerald-500/10 text-emerald-500' : s.status === 'stopped' ? 'bg-rose-500/10 text-rose-500' : 'bg-gray-500/10 text-gray-500'}`}>
                  <TerminalSquare className="w-5 h-5" />
                </div>
                <h3 className="font-semibold text-[var(--foreground)]">{s.name}</h3>
              </div>
              <span className={`px-2 py-1 text-xs rounded-full font-medium border ${s.status === 'running' ? 'border-emerald-500/30 text-emerald-500' : s.status === 'stopped' ? 'border-rose-500/30 text-rose-500' : 'border-gray-500/30 text-gray-500'}`}>
                {s.status.toUpperCase()}
              </span>
            </div>
          ))}
          {!snapshot?.services?.length && (
            <div className="col-span-full p-12 text-center text-[var(--color-muted)] bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl">
              Chưa có dữ liệu dịch vụ.
            </div>
          )}
        </div>
      )}

      {activeTab === 'docker' && (
        <div className="bg-[var(--background-card)] border border-[var(--border-color)] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[var(--border-color)]">
            <h3 className="text-sm font-medium text-[var(--color-muted)] flex items-center gap-2"><Box className="w-4 h-4" /> DANH SÁCH DOCKER CONTAINERS</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0B0F14] text-[var(--color-muted)]">
                <tr>
                  <th className="px-6 py-3 font-medium">Tên</th>
                  <th className="px-6 py-3 font-medium">Image</th>
                  <th className="px-6 py-3 font-medium">Trạng thái</th>
                  <th className="px-6 py-3 font-medium">CPU %</th>
                  <th className="px-6 py-3 font-medium">RAM %</th>
                  <th className="px-6 py-3 font-medium">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {snapshot?.docker_containers?.map(c => (
                  <tr key={c.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3 font-medium text-[var(--foreground)]">{c.name}</td>
                    <td className="px-6 py-3 text-[var(--color-muted)] truncate max-w-xs">{c.image}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full font-medium border ${c.state === 'running' ? 'border-emerald-500/30 text-emerald-500' : 'border-gray-500/30 text-gray-500'}`}>
                        {c.state.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-rose-400">{c.cpu}</td>
                    <td className="px-6 py-3 text-blue-400">{c.ram}</td>
                    <td className="px-6 py-3 flex gap-2">
                      {c.state !== 'running' && (
                        <button onClick={() => handleDockerAction('docker_start', c.id)} className="text-emerald-500 hover:text-emerald-400 text-xs border border-emerald-500/30 px-2 py-1 rounded">Start</button>
                      )}
                      {c.state === 'running' && (
                        <>
                          <button onClick={() => handleDockerAction('docker_stop', c.id)} className="text-rose-500 hover:text-rose-400 text-xs border border-rose-500/30 px-2 py-1 rounded">Stop</button>
                          <button onClick={() => handleDockerAction('docker_restart', c.id)} className="text-amber-500 hover:text-amber-400 text-xs border border-amber-500/30 px-2 py-1 rounded">Restart</button>
                        </>
                      )}
                      <button onClick={() => handleDockerAction('docker_logs', c.id)} className="text-blue-500 hover:text-blue-400 text-xs border border-blue-500/30 px-2 py-1 rounded">Logs</button>
                    </td>
                  </tr>
                ))}
                {!snapshot?.docker_containers?.length && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--color-muted)]">Không tìm thấy Docker container nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs Modal */}
      {logsModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="container-logs-title" className="bg-[#0B0F14] border border-[var(--border-color)] rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center p-4 border-b border-[var(--border-color)]">
              <h3 id="container-logs-title" className="font-semibold text-white">Container Logs <span className="text-[var(--color-muted)] text-sm font-normal">({logsModal.containerId})</span></h3>
              <button type="button" onClick={() => setLogsModal({isOpen: false, containerId: '', logs: '', loading: false})} aria-label="Đóng nhật ký container" className="text-[var(--color-muted)] hover:text-white transition-colors">
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 font-mono text-sm bg-black text-gray-300 whitespace-pre-wrap">
              {logsModal.loading ? (
                <div className="flex items-center gap-3 text-blue-400 animate-pulse">
                  <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  {logsModal.logs}
                </div>
              ) : (
                logsModal.logs
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
