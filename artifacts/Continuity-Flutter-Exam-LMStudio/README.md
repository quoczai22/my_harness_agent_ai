# Continuity Flutter Exam — đề PDF, sinh file Dart qua LM Studio (offline)

Kit terminal giúp ôn thi lập trình ứng dụng Flutter: đọc đề bài từ file PDF, đọc project Flutter của bạn, rồi sinh **từng file** `.dart` dạng bản nháp. Model chạy hoàn toàn trên máy qua LM Studio (`127.0.0.1:1234`). Kit không dùng Internet, không có cloud, không ghi vào project của bạn.

## Cần có

- **LM Studio** đã cài và có model `qwen3.5-2b` (cài offline theo `Harness-LMStudio-Offline-Kit/OFFLINE-SETUP.md`). `Start-Flutter-Exam.cmd` sẽ tự chạy `lms server start` và `lms load` nếu server chưa bật.
- **Không bắt buộc**: Flutter SDK. Có SDK và project đã từng chạy `flutter pub get` thì `/analyze` mới chạy; không có thì mục đó ghi `[CHƯA KIỂM]`.
- Đổi model hoặc cổng trong `config.json`. Kit chỉ chấp nhận địa chỉ loopback (127.0.0.1, localhost, ::1).

## Cách dùng

1. Mở `Start-Flutter-Exam.cmd`. Gõ `/new` và nhập thư mục project Flutter (có `pubspec.yaml`). Mỗi bài một phiên; `/sessions`, `/open` để mở lại.
2. `/pdf` và nhập đường dẫn file đề (≤ 10 MB, đọc tối đa 20 trang).
   - Trang có chữ: đọc trực tiếp bằng `pdftotext`.
   - Trang là ảnh scan: model đọc ảnh (Qwen3.5-2B có khả năng nhìn) và đánh dấu `cần kiểm tra`. Model 2B có thể đọc sai dấu, JSON và tên lớp, nên luôn đọc lại.
   - Kit in toàn bộ nội dung đọc được. Gõ `YES` để dùng, `EDIT` để dán bản đã sửa (kết thúc bằng `HET DE`), `NO` để bỏ. Chỉ đề đã xác nhận mới được lưu.
   - Không có PDF thì dùng `/exam` để dán chữ.
3. `/screens` nhập tên lớp các màn hình đề yêu cầu (ví dụ `LoginScreen, NoteListScreen`). Checklist và `main.dart` dựa vào danh sách này.
4. `/file` sinh một file, ví dụ `lib/screens/login_screen.dart`. Kit in nội dung ra trước; chỉ khi gõ `SAVE` mới lưu vào `drafts/<mã phiên>/`.
   - `lib/models/<tên>.dart` khi đề có mẫu JSON: sinh lớp có `fromJson`/`toJson` thẳng từ JSON (không dùng AI), xử lý số thực, null, danh sách, object lồng nhau.
   - `lib/main.dart` khi project chưa có: `MaterialApp` với route cho các màn hình đã có lớp (không dùng AI).
   - File khác: AI viết theo đề, `pubspec.yaml` và các file liên quan; kit tự sửa import sai tên package và thêm `import 'package:flutter/material.dart'` khi thiếu, rồi báo đã sửa gì.
5. `/check` kiểm tĩnh: package import có trong `pubspec.yaml`, import trỏ tới file có thật, `main()`/`runApp`, `MaterialApp`, đủ màn hình, route đặt tên đã khai báo, `StatefulWidget` có `State`, `setState` đúng chỗ, `Form`/`validator` khi đề yêu cầu kiểm tra dữ liệu, `fromJson`/`toJson` khi đề dùng JSON/API, asset đã khai báo. Mỗi mục ghi `[ĐẠT]`, `[LỖI]`, `[CHƯA KIỂM]` hoặc `[KHÔNG CẦN]`.
6. `/analyze` chạy `flutter analyze --no-pub` trên **bản sao tạm** (project + bản nháp) rồi xóa bản sao.
7. `/ask` hỏi tự do; trả lời luôn bằng tiếng Việt (model lỡ trả lời tiếng Trung thì kit hỏi lại một lần và cảnh báo nếu vẫn sai).

## Giới hạn

- `[ĐẠT]` ở `/check` chỉ là kiểm tĩnh; không có nghĩa code biên dịch được. Máy chuẩn bị kit không có Flutter SDK nên code sinh ra **chưa được biên dịch thử**.
- Kit không chạy ứng dụng, không mở máy ảo; mục "Chạy ứng dụng" luôn `[CHƯA KIỂM]`.
- Đọc ảnh scan bằng model 2B có thể sai; chữ viết tay không được hỗ trợ.
- Bộ công cụ PDF trong `tools/pdf` là Poppler (giấy phép GPL), chép từ kit LM Studio.

## Kiểm thử

```
powershell -NoProfile -ExecutionPolicy Bypass -File Flutter-Exam.ps1 -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File Flutter-Exam.ps1 -SelfTest -Live
```

`-SelfTest` chạy offline, không cần LM Studio (dùng server giả trên loopback và SDK giả). `-Live` gọi LM Studio thật và ghi báo cáo cùng bản nháp vào `tests/results/`.
