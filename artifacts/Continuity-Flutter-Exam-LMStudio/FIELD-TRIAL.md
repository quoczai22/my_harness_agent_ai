# Chạy thử kit trên máy thật (nghiệm thu)

Lượt chạy thử này dùng để biết kit có dùng được trong điều kiện phòng thi hay không: máy 8 GB RAM, không mạng, đề chụp bằng điện thoại. Kết quả trên máy chuẩn bị kit **không** thay thế được lượt chạy này.

## Chuẩn bị

1. **Máy đích**: Windows 10/11 64-bit, RAM 8 GB, CPU có AVX2. Máy chưa cài Flutter, Dart hay Git (PATH không có `flutter`, `dart`, `git`).
2. **Cài LM Studio offline** theo `Harness-LMStudio-Offline-Kit/OFFLINE-SETUP.md` (có bước chép runtime và kiểm tra AVX2). Chép nguyên thư mục `Continuity-Flutter-Exam-LMStudio` (kể cả `sdk/` và `tools/pdf/`) sang máy.
3. **Ngắt mạng**: tắt Wi-Fi và rút cáp mạng **trước** khi chạy.
4. **Đề chụp bằng điện thoại**: chụp các trang đề thật, ghép thành một file PDF (≤ 10 MB, ≤ 20 trang).
5. **Bản chép tay đã xác nhận**: gõ lại chính xác chữ trên các trang đó vào một file `.txt` (UTF-8), đọc lại một lần. File này là "đáp án" để đo kit đọc đề đúng đến đâu. Không đưa file này hay file PDF vào git.

## Chạy

Mở cửa sổ lệnh trong thư mục kit:

```
Run-Field-Trial.cmd -Pdf "D:\de-thi\de-chup.pdf" -Transcript "D:\de-thi\de-chup.txt" -PhonePhoto
```

- `-PhonePhoto`: chỉ thêm khi PDF thật sự ghép từ ảnh chụp điện thoại.
- `-Screen LoginScreen`: tùy chọn, chọn màn hình để thử sinh code. Mặc định kit lấy tên `...Screen` đầu tiên trong đề.
- `-SkipModel`: chỉ ghi điều kiện máy và kiểm tra kit, không chạy model.

Script chỉ đọc. Nó không tải gì, không ghi vào project của bạn; mọi thứ nằm trong `tests\results\trial-<thời gian>\`, thư mục này git bỏ qua. Xóa thư mục đó sau khi xem nếu không muốn giữ đề.

## Đọc kết quả (`report.md`)

- **Trạng thái field trial**: chỉ là `RUN` khi mọi điều kiện đều được ghi nhận: RAM ≤ 8 GB, AVX2, không có Internet, PATH sạch, kit nguyên vẹn, LM Studio chạy được, PDF ảnh chụp và bản chép tay. Thiếu bất kỳ điều kiện nào thì là `NOT RUN`; số đo khi đó chỉ là chạy khô.
- **RAM đỉnh / RAM trống thấp nhất** theo từng giai đoạn: nạp model, đọc PDF, sinh file, phân tích. RAM trống xuống quá thấp (dưới khoảng 500 MB) nghĩa là máy 8 GB đang rất sát giới hạn.
- **Độ chính xác đọc đề**: tỉ lệ từ khớp, và các chi tiết quan trọng (số, tên lớp, route, khóa JSON, `@`). Chỉ cần sai một chi tiết quan trọng là code có thể sai, nên luôn sửa lại đề bằng `EDIT` khi dùng thật.
- **Sinh code**: số lỗi biên dịch qua các vòng tự sửa, lỗi còn lại, kết quả checklist. Kit không chạy ứng dụng, nên hành vi app vẫn phải tự kiểm.

Gửi lại `report.md` (không cần gửi đề) để ghi vào hồ sơ nghiệm thu.
