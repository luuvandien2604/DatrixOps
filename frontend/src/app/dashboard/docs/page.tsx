'use client';

import React from 'react';
import { BookOpen, Terminal, Server as ServerIcon, Activity } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="space-y-6 pb-20 max-w-4xl mx-auto">
      <div className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2 flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-500" />
          Tài liệu Hướng dẫn (Documentation)
        </h1>
        <p className="text-[var(--color-muted)]">Hướng dẫn sử dụng và khắc phục sự cố hệ thống giám sát DatrixOps.</p>
      </div>

      <div className="space-y-8">
        {/* Vấn đề 1: Biểu đồ và Thời gian */}
        <div className="glass-card p-6 border-l-4 border-l-emerald-500">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <ServerIcon className="w-5 h-5 text-emerald-400" />
            1. Tại sao Server báo "Chưa có dữ liệu"?
          </h2>
          <div className="text-[var(--color-muted)] space-y-3 leading-relaxed text-sm">
            <p>
              Nếu Server của bạn (Ví dụ: Web Server chạy Linux) hiển thị thông báo <strong>"Chưa có dữ liệu"</strong> trên trang Monitoring, điều này có nghĩa là Backend chưa nhận được các chỉ số (Metrics) mới từ Agent cài trên Server đó.
            </p>
            <p>
              <strong>Nguyên nhân phổ biến nhất:</strong> Bạn vừa cập nhật DatrixOps lên phiên bản hỗ trợ <strong>Dữ liệu thực tế (Time Series)</strong>, nhưng <strong>Agent trên Server cũ vẫn đang chạy phiên bản phần mềm cũ</strong>. Bản cũ không hỗ trợ gửi Disk/Network nên không ghi nhận được vào DB mới.
            </p>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-emerald-400 mt-2">
              <strong className="block mb-1">✅ Cách khắc phục:</strong> Bạn cần vào trang <strong>Servers</strong>, chọn "Add Server" hoặc tạo lệnh cài đặt lại, sau đó <strong>chạy lại lệnh cài đặt trên VPS Linux/Windows của bạn</strong>. Lệnh cài đặt sẽ tự động tải Agent mới nhất đè lên bản cũ, khởi động lại và lập tức gửi dữ liệu!
            </div>
          </div>
        </div>

        {/* Vấn đề 2: Thời gian trên biểu đồ */}
        <div className="glass-card p-6 border-l-4 border-l-blue-500">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            2. Trục thời gian trên biểu đồ là bao lâu?
          </h2>
          <div className="text-[var(--color-muted)] space-y-3 leading-relaxed text-sm">
            <p>
              Biểu đồ tại trang Monitoring luôn hiển thị <strong>100 điểm dữ liệu gần nhất</strong>.
            </p>
            <p>
              Do Agent mặc định sẽ tự động cập nhật thông số (Heartbeat) gửi về máy chủ mỗi <strong>10 giây</strong> một lần, nên 100 điểm dữ liệu này tương đương với khoảng thời gian <strong>1000 giây (~16 phút 40 giây)</strong> gần nhất trong lịch sử.
            </p>
            <p className="italic opacity-80 border-t border-white/10 pt-2 mt-2">
              *Lưu ý: Nếu Server vừa mới cài đặt Agent, biểu đồ sẽ chỉ có vài điểm dữ liệu ban đầu. Sau khoảng 16 phút, biểu đồ sẽ đầy và bắt đầu cuộn (scroll) dữ liệu cũ đi để hiện dữ liệu mới.
            </p>
          </div>
        </div>

        {/* Vấn đề 3: Các cổng kết nối (Port) */}
        <div className="glass-card p-6 border-l-4 border-l-purple-500">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-purple-400" />
            3. Yêu cầu Hệ thống & Port
          </h2>
          <div className="text-[var(--color-muted)] space-y-3 leading-relaxed text-sm">
            <p>Để Agent có thể gửi dữ liệu về Dashboard, xin lưu ý cấu hình tường lửa (Firewall):</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li><strong>Đối với máy chủ cài DatrixOps Dashboard:</strong> Cần mở Port 80/443 để nhận request từ Web và từ các Agent gửi về.</li>
              <li><strong>Đối với máy chủ cần giám sát (Cài Agent):</strong> Hoàn toàn <strong>KHÔNG</strong> cần mở Port. Agent chỉ chủ động kết nối ra ngoài (Outbound) tới Dashboard, do đó an toàn tuyệt đối và không bị scan lỗ hổng.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
