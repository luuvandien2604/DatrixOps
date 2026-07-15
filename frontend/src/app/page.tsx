'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowRight, Shield, Zap, Server, Activity, TerminalSquare, CheckCircle2, ChevronRight 
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, AreaChart, Area, Tooltip
} from 'recharts';

// --- LIVE HERO CHART DATA GENERATOR ---
const generateInitialData = () => {
  return Array.from({ length: 20 }, (_, i) => ({
    time: i,
    cpu: Math.floor(Math.random() * 40) + 20,
    ram: Math.floor(Math.random() * 20) + 50,
  }));
};

export default function LandingPage() {
  const [liveData, setLiveData] = useState(generateInitialData());
  const [isScrolled, setIsScrolled] = useState(false);

  // Animate the chart in the Hero section
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveData(current => {
        const newData = [...current.slice(1)];
        const lastTime = newData[newData.length - 1].time;
        newData.push({
          time: lastTime + 1,
          cpu: Math.floor(Math.random() * 40) + 30, // Spike occasionally
          ram: Math.floor(Math.random() * 10) + 55,
        });
        return newData;
      });
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  // Handle header background on scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0B0F14] text-[#E6EAF0] font-sans overflow-x-hidden selection:bg-blue-500/30">
      {/* Signature Element - Health Bar */}
      <div className="fixed top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-400 z-50" />

      {/* Header */}
      <header className={`fixed top-[3px] left-0 right-0 z-40 transition-all duration-300 ${isScrolled ? 'bg-[#0B0F14]/80 backdrop-blur-md border-b border-white/5 py-4' : 'bg-transparent py-6'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold tracking-tighter">D</div>
            <span className="text-xl font-bold tracking-tight text-white">DatrixOps</span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#8B96A5]">
            <a href="#features" className="hover:text-white transition-colors">Tính năng</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">Cách hoạt động</a>
            <a href="#pricing" className="hover:text-white transition-colors">Bảng giá</a>
            <Link href="/docs" className="hover:text-white transition-colors text-blue-400">Tài liệu (Docs)</Link>
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-[#8B96A5] hover:text-white transition-colors hidden sm:block">
              Đăng nhập
            </Link>
            <Link href="/register" className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all shadow-[0_0_20px_rgba(59,130,246,0.3)]">
              Dùng thử miễn phí
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* HERO SECTION */}
        <section className="relative pt-40 pb-20 lg:pt-48 lg:pb-32 px-6">
          {/* Background Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
          
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center relative z-10">
            {/* Hero Copy */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium mb-6">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                DatrixOps Agent v2.0 is live
              </div>
              <h1 className="text-5xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1] mb-6">
                Dập tắt sự cố trước khi <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
                  người dùng kịp nhận ra.
                </span>
              </h1>
              <p className="text-lg text-[#8B96A5] mb-10 leading-relaxed max-w-xl">
                Nền tảng giám sát hạ tầng thời gian thực dành riêng cho đội ngũ DevOps và SRE. Phát hiện độ trễ, cảnh báo cạn kiệt tài nguyên chỉ trong vòng 3 giây.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <Link href="/register" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(59,130,246,0.4)]">
                  Bắt đầu miễn phí <ArrowRight className="w-5 h-5" />
                </Link>
                <button className="w-full sm:w-auto px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 text-white font-semibold transition-all flex items-center justify-center gap-2">
                  Xem Demo
                </button>
              </div>
            </div>

            {/* Hero Live Visual (Mock Dashboard) */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-emerald-500/20 blur-3xl rounded-3xl" />
              <div className="glass-card p-4 relative border-t border-l border-white/20">
                <div className="flex items-center gap-2 mb-4 pb-4 border-b border-white/5">
                  <div className="w-3 h-3 rounded-full bg-rose-500" />
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <div className="ml-4 text-xs font-mono text-[#8B96A5]">datrixops-production-cluster</div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                    <div className="text-xs text-[#8B96A5] mb-1">CPU Load Avg</div>
                    <div className="text-2xl font-mono text-white flex items-center gap-2">
                      {liveData[liveData.length-1].cpu}%
                      {liveData[liveData.length-1].cpu > 60 ? (
                         <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      ) : (
                         <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      )}
                    </div>
                  </div>
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                    <div className="text-xs text-[#8B96A5] mb-1">Active Alerts</div>
                    <div className="text-2xl font-mono text-emerald-400">0</div>
                  </div>
                </div>

                <div className="h-48 bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={liveData}>
                      <defs>
                        <linearGradient id="heroCpu" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.5}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Tooltip content={() => null} />
                      <Area type="monotone" dataKey="cpu" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#heroCpu)" isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="border-y border-white/5 bg-white/[0.01]">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
              <div className="pt-8 md:pt-0">
                <div className="text-4xl font-bold text-white mb-2 font-mono">10,000+</div>
                <div className="text-sm text-[#8B96A5] uppercase tracking-wider font-semibold">Server Đang Giám Sát</div>
              </div>
              <div className="pt-8 md:pt-0">
                <div className="text-4xl font-bold text-white mb-2 font-mono">99.99%</div>
                <div className="text-sm text-[#8B96A5] uppercase tracking-wider font-semibold">Uptime Trung Bình</div>
              </div>
              <div className="pt-8 md:pt-0">
                <div className="text-4xl font-bold text-white mb-2 font-mono">&lt; 3s</div>
                <div className="text-sm text-[#8B96A5] uppercase tracking-wider font-semibold">Độ trễ Cảnh báo</div>
              </div>
            </div>
          </div>
        </section>

        {/* CORE FEATURES */}
        <section id="features" className="py-24 px-6 relative">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">Mọi thứ bạn cần để ngủ ngon.</h2>
              <p className="text-lg text-[#8B96A5] max-w-2xl mx-auto">
                Không còn những đêm thức trắng dò log. DatrixOps cung cấp tầm nhìn toàn cảnh và công cụ để bạn xử lý vấn đề ngay khi nó mới manh nha.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Feature 1 */}
              <div className="glass-card p-8 group hover:-translate-y-2 transition-transform duration-300 flex flex-col">
                <div className="h-32 mb-8 relative rounded-lg border border-white/5 bg-[#0B0F14] overflow-hidden flex items-end justify-center pb-4">
                  <div className="absolute top-3 left-3 flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-bold text-rose-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                    CPU CRITICAL
                  </div>
                  <div className="w-full px-4 h-16">
                     <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={liveData.slice(10)}>
                          <Line type="step" dataKey="cpu" stroke="#F43F5E" strokeWidth={2} dot={false} isAnimationActive={false}/>
                        </LineChart>
                     </ResponsiveContainer>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Phát hiện sớm bất thường</h3>
                <p className="text-[#8B96A5] leading-relaxed flex-1">
                  Agent viết bằng Go cực nhẹ liên tục phân tích chỉ số mỗi 10 giây. Tự động nội suy xu hướng và kích hoạt cảnh báo trước khi server thực sự sập.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="glass-card p-8 group hover:-translate-y-2 transition-transform duration-300 flex flex-col">
                <div className="h-32 mb-8 relative rounded-lg border border-white/5 bg-[#0B0F14] overflow-hidden p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs text-[#8B96A5] pb-2 border-b border-white/5">
                    <span>Server</span>
                    <span>Status</span>
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-2 rounded">
                    <span className="text-sm font-mono text-white">db-primary-01</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between bg-white/[0.02] p-2 rounded">
                    <span className="text-sm font-mono text-white">worker-node-03</span>
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Quản trị tập trung</h3>
                <p className="text-[#8B96A5] leading-relaxed flex-1">
                  Kiểm soát hàng ngàn máy chủ vật lý, VPS hay Container từ một màn hình duy nhất. Phân quyền truy cập chi tiết đến từng thao tác cho team.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="glass-card p-8 group hover:-translate-y-2 transition-transform duration-300 flex flex-col">
                <div className="h-32 mb-8 relative rounded-lg border border-white/5 bg-[#0B0F14] overflow-hidden p-4 font-mono text-[11px] text-emerald-400 flex flex-col justify-center">
                  <div className="text-gray-500 mb-2"># Install DatrixOps Agent in 1 click</div>
                  <div className="text-blue-400 break-all">
                    curl -sL https://datrixops.com/install.sh | sudo bash -s -- &lt;TOKEN&gt;
                  </div>
                  <div className="mt-2 text-gray-400">&gt; Setup completed in 2.4s</div>
                </div>
                <h3 className="text-xl font-bold text-white mb-3">Triển khai thần tốc</h3>
                <p className="text-[#8B96A5] leading-relaxed flex-1">
                  Không cần cấu hình phức tạp. Không phụ thuộc thư viện hệ thống. Cài đặt hoàn tất chỉ với một dòng lệnh duy nhất trên mọi bản phân phối Linux.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className="py-24 px-6 border-y border-white/5 bg-white/[0.01]">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold text-white mb-16 text-center">Hoạt động như thế nào?</h2>
            
            <div className="grid md:grid-cols-3 gap-12 relative">
              {/* Connecting line for desktop */}
              <div className="hidden md:block absolute top-6 left-[15%] right-[15%] h-[1px] bg-gradient-to-r from-blue-500/0 via-blue-500/30 to-blue-500/0" />
              
              <div className="relative text-center">
                <div className="w-12 h-12 mx-auto bg-[#0B0F14] border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-400 font-bold font-mono text-xl mb-6 relative z-10 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  01
                </div>
                <h4 className="text-lg font-bold text-white mb-3">Cài đặt Agent</h4>
                <p className="text-[#8B96A5]">Chạy script 1-Click trên server của bạn. Agent sẽ tự động đăng ký và khởi chạy ngầm bằng systemd.</p>
              </div>

              <div className="relative text-center">
                <div className="w-12 h-12 mx-auto bg-[#0B0F14] border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-400 font-bold font-mono text-xl mb-6 relative z-10 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  02
                </div>
                <h4 className="text-lg font-bold text-white mb-3">Thiết lập Ngưỡng</h4>
                <p className="text-[#8B96A5]">Cấu hình các mức cảnh báo cho CPU, RAM, Disk qua giao diện trực quan. Gắn tag để phân loại server.</p>
              </div>

              <div className="relative text-center">
                <div className="w-12 h-12 mx-auto bg-[#0B0F14] border-2 border-blue-500 rounded-full flex items-center justify-center text-blue-400 font-bold font-mono text-xl mb-6 relative z-10 shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                  03
                </div>
                <h4 className="text-lg font-bold text-white mb-3">Giám sát & Xử lý</h4>
                <p className="text-[#8B96A5]">Nhận thông báo qua Telegram/Slack ngay khi có biến. Thực hiện Quick Actions (Restart/SSH) trực tiếp từ web.</p>
              </div>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white mb-4">Bảng giá minh bạch</h2>
              <p className="text-[#8B96A5]">Bắt đầu miễn phí, mở rộng theo quy mô doanh nghiệp.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto items-center">
              {/* Starter */}
              <div className="glass-card p-8">
                <h3 className="text-xl font-medium text-white mb-2">Starter</h3>
                <div className="text-4xl font-bold text-white mb-6 font-mono">$0<span className="text-lg text-[#8B96A5] font-sans font-normal">/mo</span></div>
                <ul className="space-y-4 mb-8 text-[#8B96A5]">
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Tối đa 5 Servers</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Data retention 7 ngày</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-emerald-500" /> Cảnh báo qua Email</li>
                </ul>
                <button className="w-full py-3 rounded-lg border border-white/10 hover:bg-white/5 text-white font-medium transition-colors">
                  Bắt đầu ngay
                </button>
              </div>

              {/* Pro */}
              <div className="glass-card p-8 border-blue-500/50 shadow-[0_15px_40px_rgba(59,130,246,0.15)] relative transform md:-translate-y-4 bg-blue-900/10">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                  PHỔ BIẾN NHẤT
                </div>
                <h3 className="text-xl font-medium text-blue-400 mb-2">Professional</h3>
                <div className="text-4xl font-bold text-white mb-6 font-mono">$29<span className="text-lg text-[#8B96A5] font-sans font-normal">/mo</span></div>
                <ul className="space-y-4 mb-8 text-gray-300">
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500" /> Lên đến 100 Servers</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500" /> Data retention 30 ngày</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500" /> Tích hợp Slack/Telegram</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-blue-500" /> Quick Actions (SSH/Restart)</li>
                </ul>
                <button className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-500/20">
                  Dùng thử 14 ngày
                </button>
              </div>

              {/* Enterprise */}
              <div className="glass-card p-8">
                <h3 className="text-xl font-medium text-white mb-2">Enterprise</h3>
                <div className="text-4xl font-bold text-white mb-6 font-mono">Custom</div>
                <ul className="space-y-4 mb-8 text-[#8B96A5]">
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-gray-500" /> Servers không giới hạn</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-gray-500" /> Lưu trữ dữ liệu vĩnh viễn</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-gray-500" /> Triển khai On-Premise</li>
                  <li className="flex items-center gap-3"><CheckCircle2 className="w-5 h-5 text-gray-500" /> Hỗ trợ kỹ thuật 24/7</li>
                </ul>
                <button className="w-full py-3 rounded-lg border border-white/10 hover:bg-white/5 text-white font-medium transition-colors">
                  Liên hệ Sales
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="relative py-32 px-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B0F14] to-blue-950/20" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-8 tracking-tight">Sẵn sàng để kiểm soát <br/>hạ tầng của bạn?</h2>
            <p className="text-xl text-[#8B96A5] mb-10">Cài đặt chỉ trong 3 giây. Không cần thẻ tín dụng.</p>
            <Link href="/register" className="inline-flex items-center gap-2 px-10 py-5 rounded-xl bg-white text-gray-900 font-bold hover:bg-gray-100 transition-all text-lg shadow-[0_0_40px_rgba(255,255,255,0.2)]">
              Tạo tài khoản miễn phí <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/5 bg-[#0B0F14] pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white font-bold tracking-tighter">D</div>
                <span className="text-xl font-bold tracking-tight text-white">DatrixOps</span>
              </div>
              <p className="text-[#8B96A5] max-w-sm">
                Giải pháp giám sát và quản trị máy chủ thời gian thực, xây dựng cho những đội ngũ kỹ thuật đòi hỏi sự chính xác tuyệt đối.
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Sản phẩm</h4>
              <ul className="space-y-3 text-[#8B96A5] text-sm">
                <li><a href="#features" className="hover:text-white transition-colors">Tính năng</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Bảng giá</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Changelog</a></li>
                <li><Link href="/docs" className="hover:text-white transition-colors">Tài liệu hướng dẫn</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-white font-semibold mb-4">Công ty</h4>
              <ul className="space-y-3 text-[#8B96A5] text-sm">
                <li><a href="#" className="hover:text-white transition-colors">Về chúng tôi</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Khách hàng</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Bảo mật</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Điều khoản</a></li>
              </ul>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/5 text-sm text-[#8B96A5]">
            <p>© 2026 DatrixOps. All rights reserved.</p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> API Systems Normal
              </span>
              <span>v2.4.0</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
