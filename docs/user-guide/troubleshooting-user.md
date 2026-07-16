---
title: "Lỗi thường gặp"
description: "Các sự cố thường gặp khi sử dụng DatrixOps và cách tự khắc phục."
role: "public"
order: 9
---

# Lỗi thường gặp

## Server hiện Offline dù máy chủ vẫn đang chạy

**Nguyên nhân thường gặp:** Agent trên server đã ngừng chạy hoặc mất kết nối tới hệ thống trung tâm.

**Cách kiểm tra:**
1. SSH vào server, kiểm tra Agent còn chạy không:
   ```
   systemctl status datrix-agent
   ```
2. Nếu Agent không chạy, khởi động lại:
   ```
   systemctl restart datrix-agent
   ```
3. Nếu vẫn không lên Online sau vài phút, kiểm tra log Agent:
   ```
   journalctl -u datrix-agent -f
   ```

## Không nhận được thông báo cảnh báo (Alert)

**Kiểm tra theo thứ tự:**
1. Vào **Alerts**, đảm bảo rule cảnh báo đang ở trạng thái bật (enabled).
2. Đảm bảo kênh nhận thông báo (Telegram/Discord) đang bật và thông tin cấu hình (Webhook URL, Bot Token) còn đúng.
3. Với Telegram: kiểm tra Bot đã được thêm vào đúng nhóm/kênh chat chưa.
4. Với Discord: thử gửi test trực tiếp tới Webhook URL để xác nhận URL còn hoạt động.
5. Cảnh báo được kiểm tra mỗi 1 phút — đợi ít nhất 1-2 phút sau khi vượt ngưỡng trước khi kết luận có lỗi.

## Thao tác Start/Stop/Restart Docker không có tác dụng

**Nguyên nhân:** Lệnh được gửi tới Agent và chỉ thực thi ở lần Agent báo cáo tiếp theo (thường trong vòng 10-30 giây), không phải tức thì.

**Cách kiểm tra:**
1. Đợi khoảng 30 giây rồi làm mới (refresh) trang.
2. Nếu vẫn không thay đổi, kiểm tra Agent trên server còn Online không (xem mục trên).
3. Kiểm tra Docker daemon trên server còn chạy không: `docker ps`.

## Tab Processes/Services/Docker trống dù server đang Online

**Nguyên nhân:** Dữ liệu chi tiết (khác với CPU/RAM) chỉ được cập nhật mỗi 60 giây, chậm hơn nhịp cập nhật CPU/RAM.

**Cách xử lý:** Đợi tối đa 1 phút sau khi server chuyển Online, sau đó làm mới trang.

## Không đăng nhập được / phiên đăng nhập tự động thoát

**Cách kiểm tra:**
1. Kiểm tra lại email/mật khẩu đã nhập đúng chưa.
2. Nếu đã đăng nhập thành công nhưng tự động thoát sau ít phút, thử xoá cache trình duyệt và đăng nhập lại.
3. Nếu vẫn lỗi, liên hệ quản trị viên để kiểm tra tài khoản.

## Website báo lỗi dù truy cập bình thường trên trình duyệt

**Nguyên nhân thường gặp:** URL nhập thiếu `https://`, hoặc website chặn request từ hệ thống giám sát (firewall/WAF).

**Cách kiểm tra:**
1. Vào **Websites**, kiểm tra lại URL đã nhập đầy đủ giao thức (`https://` hoặc `http://`) chưa.
2. Kiểm tra firewall/WAF của website có đang chặn IP của hệ thống giám sát không.

---

Nếu sự cố vẫn tiếp diễn sau khi đã thử các bước trên, vui lòng liên hệ quản trị viên hệ thống để được hỗ trợ kiểm tra sâu hơn.
