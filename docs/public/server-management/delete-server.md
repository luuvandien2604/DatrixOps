---
title: "Gỡ Agent và xóa server"
description: "Gỡ DatrixOps Agent khỏi Linux an toàn, theo dõi trạng thái và chỉ force delete khi cần."
---

## Hai hình thức xóa

DatrixOps phân biệt rõ hai thao tác:

### Uninstall Agent & Delete

Dùng cho Linux Agent đang online và hỗ trợ remote uninstall. Backend không xóa server record ngay mà tạo task phá hủy có kiểm soát.

Luồng thực tế:

```text
Người dùng xác nhận xóa
→ Backend trả 202 Accepted
→ trạng thái Waiting for Agent uninstall
→ Agent nhận task agent_uninstall
→ trạng thái Uninstalling Agent
→ helper systemd tách rời dừng service
→ xóa service file, drop-in và binary Agent
→ helper gọi endpoint xác nhận bằng one-time token
→ Backend mới xóa server và dữ liệu liên quan
```

### Delete Record Only

Chỉ xóa dữ liệu server trong DatrixOps, không liên hệ Agent. Dùng khi:

- máy đã bị hủy;
- Agent offline vĩnh viễn;
- hệ điều hành chưa hỗ trợ remote uninstall;
- Agent quá cũ;
- remote uninstall thất bại và bạn sẽ gỡ thủ công.

> **Warning:** Nếu máy vẫn tồn tại, **Delete Record Only** có thể để lại Agent tiếp tục chạy. Sau khi server record bị xóa, Agent sẽ nhận `401` vì token không còn hợp lệ. Khi đó phải gỡ Agent trực tiếp trên máy.

## Điều kiện để gỡ từ xa

Nút **Uninstall Agent & Delete** chỉ hoạt động khi:

- Agent online với heartbeat trong khoảng gần nhất;
- máy là Linux;
- Agent báo `remote_uninstall_supported=true`;
- Agent chạy bằng `root`;
- host có `systemctl` và `systemd-run`;
- không có uninstall task khác đang `pending` hoặc `uninstalling`.

macOS và Windows hiện chưa hỗ trợ remote uninstall từ Dashboard.

## Thực hiện gỡ Agent

1. Mở trang **Servers**.
2. Nhấn biểu tượng thùng rác của server.
3. Đọc cảnh báo và nhập chuỗi xác nhận theo giao diện.
4. Chọn **Uninstall Agent & Delete**.
5. Không đóng hoặc tạo lại server record khi trạng thái đang chạy.
6. Chờ server biến mất khỏi danh sách sau khi Backend nhận callback xác nhận.

Trạng thái được hiển thị:

| Trạng thái | Ý nghĩa |
|---|---|
| `Waiting for Agent uninstall` | Task đã tạo, Agent chưa nhận |
| `Uninstalling Agent` | Agent đã chuẩn bị helper và bắt đầu gỡ |
| `Uninstall failed` | Helper hoặc callback thất bại; record được giữ để xử lý |
| Server biến mất | Gỡ hoàn tất và Backend đã hard-delete record |

## Những gì được xóa trên Linux

Remote helper cố gỡ:

```text
/etc/systemd/system/datrixops-agent.service
/etc/systemd/system/datrixops-agent.service.d/
/usr/local/bin/datrixops-agent
/usr/local/bin/datrixops-agent.update
/usr/local/bin/.datrixops-agent.update
```

Helper chạy bằng transient systemd unit tách khỏi service Agent chính. Cách này tránh helper bị systemd giết khi nó dừng `datrixops-agent.service`.

## Kiểm tra sau khi gỡ

Trên máy Linux, chạy:

```bash
echo "=== Process ==="
pgrep -a datrixops-agent || echo "Không còn Agent process"

echo "=== Service ==="
sudo systemctl status datrixops-agent --no-pager || true

echo "=== Binary ==="
test -e /usr/local/bin/datrixops-agent \
  && echo "Binary vẫn còn" \
  || echo "Binary đã được xóa"

echo "=== Service file ==="
test -e /etc/systemd/system/datrixops-agent.service \
  && echo "Service file vẫn còn" \
  || echo "Service file đã được xóa"
```

Kết quả thành công:

```text
Không còn Agent process
Unit datrixops-agent.service could not be found
Binary đã được xóa
Service file đã được xóa
```

Transient helper thường không còn trong `systemctl list-units` sau khi hoàn tất vì unit được tạo với `--collect`.

## Khi Agent offline hoặc không hỗ trợ

Dashboard sẽ không queue remote uninstall. Chọn **Delete Record Only** chỉ khi bạn hiểu rằng Agent có thể vẫn tồn tại. Gỡ thủ công trên Linux:

```bash
sudo systemctl disable --now datrixops-agent.service
sudo rm -f /etc/systemd/system/datrixops-agent.service
sudo rm -rf /etc/systemd/system/datrixops-agent.service.d
sudo rm -f /usr/local/bin/datrixops-agent
sudo rm -f /usr/local/bin/datrixops-agent.update
sudo rm -f /usr/local/bin/.datrixops-agent.update
sudo systemctl daemon-reload
sudo systemctl reset-failed datrixops-agent.service
```

## Khi trạng thái bị kẹt

Nếu server ở `Waiting for Agent uninstall` quá lâu:

1. Kiểm tra Agent còn online và token hợp lệ.
2. Xem Agent log có nhận `agent_uninstall` không.
3. Chờ timeout task; Backend sẽ chuyển trạng thái sang failed khi task stale.
4. Không force delete khi Agent vẫn có khả năng nhận task, vì việc xóa record sẽ làm token mất hiệu lực.

Nếu máy đã được gỡ sạch nhưng server vẫn ở `Uninstalling Agent`, callback xác nhận có thể thất bại. Người quản trị cần kiểm tra Backend log và endpoint `/api/v1/agent/uninstall/confirm` trước khi force delete record.
