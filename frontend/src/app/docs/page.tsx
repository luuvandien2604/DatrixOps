'use client';

import React from 'react';
import { BookOpen, Server as ServerIcon, Activity, Terminal } from 'lucide-react';

export default function DocsPage() {
  return (
    <div className="space-y-10">
      <div className="border-b border-white/10 pb-8">
        <h1 className="text-4xl font-extrabold text-[var(--foreground)] mb-4 flex items-center gap-3 tracking-tight">
          <BookOpen className="w-10 h-10 text-blue-500" />
          Tài liệu Hướng dẫn
        </h1>
        <p className="text-lg text-[var(--color-muted)]">
          Chào mừng bạn đến với tài liệu hướng dẫn sử dụng DatrixOps. Tại đây cung cấp đầy đủ thông tin về cách cài đặt, cấu hình và xử lý các sự cố thường gặp.
        </p>
      </div>

      <div className="space-y-10">
        <section>
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6 flex items-center gap-2">
            <ServerIcon className="w-6 h-6 text-emerald-400" />
            1. Khắc phục: Server báo "Chưa có dữ liệu"
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 text-[var(--color-muted)]">
            <p>
              Nếu Server của bạn hiển thị thông báo <strong>"Chưa có dữ liệu"</strong> trên trang Monitoring, điều này có nghĩa là Backend chưa nhận được các chỉ số (Metrics) mới từ Agent cài trên Server đó.
            </p>
            <p>
              <strong>Nguyên nhân phổ biến nhất:</strong> Bạn vừa cập nhật DatrixOps lên phiên bản hỗ trợ <strong>Dữ liệu thực tế (Time Series)</strong>, nhưng Agent trên Server cũ vẫn đang chạy phiên bản phần mềm cũ. Bản cũ không hỗ trợ gửi Disk/Network nên không ghi nhận được vào Database mới.
            </p>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5 text-emerald-400 mt-4">
              <strong className="block text-emerald-300 text-lg mb-2">✅ Cách khắc phục:</strong>
              Bạn cần vào trang <strong>Servers</strong>, chọn "Add Server" hoặc tạo lệnh cài đặt lại, sau đó <strong>chạy lại lệnh cài đặt trên VPS Linux/Windows của bạn</strong>. Lệnh cài đặt sẽ tự động tải Agent mới nhất đè lên bản cũ, khởi động lại và lập tức gửi dữ liệu!
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6 flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-400" />
            2. Trục thời gian trên biểu đồ Monitoring
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 text-[var(--color-muted)]">
            <p>
              Biểu đồ tại trang Monitoring luôn hiển thị dữ liệu theo khoảng thời gian bạn chọn (VD: Last 15 minutes, Last 24 hours).
            </p>
            <p>
              Do Agent mặc định sẽ tự động cập nhật thông số (Heartbeat) gửi về máy chủ mỗi <strong>10 giây</strong> một lần, nếu bạn chọn khung thời gian lớn (ví dụ 7 ngày), hệ thống sẽ tự động <strong>gộp nhóm dữ liệu (Downsampling)</strong> để tránh làm quá tải trình duyệt:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-sm mt-2">
              <li><strong>Dưới 1 giờ:</strong> Hiển thị chi tiết từng 10 giây.</li>
              <li><strong>1 giờ - 6 giờ:</strong> Gộp trung bình mỗi 1 phút.</li>
              <li><strong>6 giờ - 24 giờ:</strong> Gộp trung bình mỗi 10 phút.</li>
              <li><strong>24 giờ - 7 ngày:</strong> Gộp trung bình mỗi 1 giờ.</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6 flex items-center gap-2">
            <Terminal className="w-6 h-6 text-purple-400" />
            3. Yêu cầu Hệ thống & Port (Firewall)
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4 text-[var(--color-muted)]">
            <p>Để Agent có thể gửi dữ liệu về Dashboard, xin lưu ý cấu hình tường lửa (Firewall):</p>
            <ul className="list-disc pl-6 space-y-3 mt-2">
              <li>
                <strong>Đối với máy chủ cài DatrixOps Dashboard (Backend):</strong> Cần mở Port <code>80</code> và <code>443</code> để nhận request từ Web và từ các Agent gửi về.
              </li>
              <li>
                <strong>Đối với máy chủ cần giám sát (Cài Agent):</strong> Hoàn toàn <strong>KHÔNG</strong> cần mở Port. Agent chỉ chủ động kết nối ra ngoài (Outbound) tới Dashboard, do đó an toàn tuyệt đối và không bị scan lỗ hổng.
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
