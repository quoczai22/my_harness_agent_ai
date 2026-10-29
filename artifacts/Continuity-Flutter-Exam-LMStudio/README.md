# Continuity Flutter Exam — đề PDF, sinh file Dart qua LM Studio (offline)

Kit terminal giúp ôn thi lập trình ứng dụng Flutter: đọc đề bài từ file PDF, đọc project Flutter của bạn, rồi sinh **từng file** `.dart` dạng bản nháp. Model chạy hoàn toàn trên máy qua LM Studio (`127.0.0.1:1234`). Kit không dùng Internet, không có cloud, không ghi vào project của bạn.

## Cần có

- **LM Studio** đã cài và có model `qwen3.5-2b` (cài offline theo `Harness-LMStudio-Offline-Kit/OFFLINE-SETUP.md`). `Start-Flutter-Exam.cmd` sẽ tự chạy `lms server start` và `lms load` nếu server chưa bật.
- **Flutter SDK đi kèm** trong `sdk/flutter` (Flutter 3.47.8 stable, Dart 3.13.7), cùng bộ package offline trong `sdk/pub-cache` (cupertino_icons, flutter_lints 3–6, http, provider, shared_preferences, sqflite, path, intl). Máy thi **không cần** cài Flutter, không cần `git`, không cần mạng. Phần này nặng khoảng 3,4 GB. Nếu project dùng package ngoài danh sách này, phần kiểm tra biên dịch báo `[CHƯA KIỂM]`.
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
   - Trước khi in ra, kit **biên dịch thử** file `.dart` bằng SDK đi kèm (khoảng 6 giây mỗi lần). Có lỗi thì kit sửa nhanh kiểu IDE trước (bỏ import tới file không có, thêm `!` cho giá trị nullable, bỏ `const` sai), rồi nhờ AI sửa tối đa 2 vòng. Lỗi còn lại được in kèm bản đề xuất để bạn tự quyết.
5. `/check` kiểm tĩnh: package import có trong `pubspec.yaml`, import trỏ tới file có thật, `main()`/`runApp`, `MaterialApp`, đủ màn hình, route đặt tên đã khai báo, `StatefulWidget` có `State`, `setState` đúng chỗ, `Form`/`validator` khi đề yêu cầu kiểm tra dữ liệu, `fromJson`/`toJson` khi đề dùng JSON/API, asset đã khai báo. Mỗi mục ghi `[ĐẠT]`, `[LỖI]`, `[CHƯA KIỂM]` hoặc `[KHÔNG CẦN]`.
6. `/analyze` phân tích toàn bộ project cộng bản nháp trên **bản sao tạm** rồi xóa bản sao. Kit dùng `dart analyze` của SDK đi kèm với `pub get --offline`; nếu kit không có SDK thì dùng `flutter` trong PATH.
7. `/ask` hỏi tự do; trả lời luôn bằng tiếng Việt (model lỡ trả lời tiếng Trung thì kit hỏi lại một lần và cảnh báo nếu vẫn sai).

## Giới hạn

- `[ĐẠT]` ở `/check` chỉ là kiểm tĩnh. Muốn biết code có biên dịch được không thì xem kết quả biên dịch của `/file` và `/analyze`. "Biên dịch được" vẫn chưa có nghĩa là app chạy đúng đề: AI có thể dùng `TextField` thay vì `Form`, hoặc bỏ sót chức năng.
- Trên máy chuẩn bị kit, sau vòng tự sửa: 9/10 file AI viết và 3/4 project biên dịch sạch (xem `tests/results/`).
- Kit không chạy ứng dụng, không mở máy ảo; mục "Chạy ứng dụng" luôn `[CHƯA KIỂM]`.
- Đọc ảnh scan bằng model 2B có thể sai; chữ viết tay không được hỗ trợ.
- Bộ công cụ PDF trong `tools/pdf` là Poppler 26.09.0 (GPL), chép từ kit LM Studio; xem `tools/pdf/NOTICE.txt` và `COPYING-GPL-2.0.txt`. Các DLL đi kèm có giấy phép riêng, cần đối chiếu trước khi phát hành lại kit.

## Kiểm thử

```
powershell -NoProfile -ExecutionPolicy Bypass -File Flutter-Exam.ps1 -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File Flutter-Exam.ps1 -SelfTest -Live
```

`-SelfTest` chạy offline, không cần LM Studio (dùng server giả trên loopback, SDK giả, và nếu có thì cả SDK thật đi kèm để biên dịch thử). `-Live` gọi LM Studio thật và ghi báo cáo cùng bản nháp vào `tests/results/`.
