---
title: "Cron Execution Telemetry"
description: "Ghi nhận thời gian chạy thật, exit status và lịch sử cron bằng wrapper của Agent."
---

## Mục tiêu

Cron Discovery chỉ cho biết một job tồn tại và lịch chạy tiếp theo có thể ước tính từ schedule. Nó không thể tự biết job đã chạy thành công hay thất bại nếu cron không gửi telemetry về DatrixOps.

Cron Execution Telemetry giải quyết phần đó bằng wrapper `datrixops-agent cron-run`. Wrapper chạy command thật, giữ nguyên exit code, giới hạn output gửi về và báo lại Backend bằng Agent Token hiện có.

## Khi nào cần dùng wrapper?

Dùng wrapper cho các cron job quan trọng như:

- backup database;
- renew SSL;
- cleanup log;
- đồng bộ dữ liệu;
- job vận hành có ảnh hưởng production.

Không cần bọc mọi cron job nhỏ nếu bạn không cần last-run hoặc exit status trên dashboard.

## Cách migration một cron job

1. Mở server trong Dashboard.
2. Vào tab **Cron Monitoring**.
3. Tìm cron job cần theo dõi.
4. Bấm **Copy wrapper**.
5. Mở crontab trên server và thay phần command bằng wrapper đã copy.

Ví dụ job ban đầu:

```cron
0 2 * * * /usr/local/bin/backup-db.sh
```

Sau khi bọc telemetry:

```cron
0 2 * * * datrixops-agent cron-run --external-id <telemetry-id> -- /bin/sh -lc '/usr/local/bin/backup-db.sh'
```

Giữ nguyên 5 trường schedule ở đầu dòng. Chỉ thay command phía sau schedule.

## Quy tắc an toàn

- Không tự động sửa crontab hàng loạt.
- Không đổi lịch chạy.
- Không dùng wrapper cho command bạn chưa hiểu rõ.
- Nếu command có biến môi trường riêng, giữ nguyên trong command được bọc hoặc đưa vào script.
- Luôn thử với job ít rủi ro trước khi áp dụng cho job production quan trọng.

## Output và exit status

Wrapper chuyển stdout/stderr ra cron như bình thường, đồng thời giữ lại phần output đầu tiên để gửi về DatrixOps. Output telemetry được giới hạn để tránh lưu log quá lớn hoặc làm dashboard chậm.

Trạng thái hiển thị:

- `Not instrumented`: job đã được phát hiện nhưng chưa có execution telemetry thật.
- `completed`: command trả exit code `0`.
- `failed`: command trả exit code khác `0` hoặc không chạy được.
- `timed_out`: wrapper timeout theo tuỳ chọn `--timeout-seconds`.

## Timeout tuỳ chọn

Bạn có thể giới hạn thời gian chạy:

```cron
0 2 * * * datrixops-agent cron-run --external-id <telemetry-id> --timeout-seconds 1800 -- /bin/sh -lc '/usr/local/bin/backup-db.sh'
```

Nếu timeout xảy ra, wrapper trả exit code `124` và báo `timed_out`.

## Khi không thấy recent runs

Kiểm tra:

1. Agent đã được cập nhật lên bản có `cron-run`.
2. Cron đang gọi đúng binary `datrixops-agent` trong PATH. Nếu không chắc, dùng đường dẫn tuyệt đối tới binary.
3. Agent Token và `DATRIXOPS_SERVER_URL` vẫn có trong môi trường service/host.
4. Cron job thực sự đã chạy sau khi bạn migration.
5. Dashboard vẫn hiển thị đúng cron job và Telemetry ID.

Nếu bạn copy wrapper bằng `external_id`, command gốc có thể đổi nội dung mà vẫn gửi telemetry vào job đang hiển thị. Nếu muốn DatrixOps coi đó là job mới, để Agent discover lại crontab sau khi thay command.

