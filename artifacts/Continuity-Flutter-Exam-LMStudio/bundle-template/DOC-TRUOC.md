# Bộ ôn thi Flutter — chạy một lần là lên

## Cần gì

- Windows 10/11 64-bit, CPU có AVX2, RAM 8 GB trở lên. Không cần mạng, không cần quyền admin.
- Chép **nguyên** thư mục này (khoảng 6,2 GB) vào ổ cứng, ví dụ `C:\Flutter-Exam-Bundle`. Dùng USB định dạng exFAT hoặc NTFS (FAT32 không chép được file lớn).

## Chạy

1. Ngắt mạng (tắt Wi-Fi, rút cáp) nếu đang chuẩn bị cho phòng thi.
2. Đóng LM Studio nếu đang mở.
3. Nhấp đúp **`CHAY-DE-THI.cmd`**.

Lần đầu, script tự làm (khoảng 3–8 phút):
- kiểm tra máy và bộ cài;
- cài LM Studio cho tài khoản này nếu chưa có;
- chép runtime;
- trỏ LM Studio vào thư mục model của bộ cài (cấu hình cũ được sao lưu);
- bật server, nạp model;
- mở kit Flutter.

Từ lần sau chỉ mất vài chục giây.

Khi thấy dấu nhắc `flutter`, gõ `/help`. Các bước làm bài (`/new`, `/pdf`, `/screens`, `/file`, `/check`) có trong `kit\README.md`.

## Nếu có lỗi

- Mọi bước được ghi vào `logs\setup-<thời gian>.log`. Script dừng ở đâu sẽ ghi rõ lý do bằng tiếng Việt.
- "LM Studio đang mở": đóng cửa sổ LM Studio rồi chạy lại.
- "CPU không có AVX2": máy này không dùng được bộ cài.
- Cài im lặng không được: script mở trình cài đặt thường, bạn bấm Next/Install đến khi xong.
- Chạy lại `CHAY-DE-THI.cmd` luôn an toàn. Muốn kiểm tra lại toàn bộ mã băm thì chạy `CHAY-DE-THI.cmd -FullVerify`.

## Nghiệm thu trên máy thật

Xem `kit\FIELD-TRIAL.md` và chạy `kit\Run-Field-Trial.cmd` với đề chụp bằng điện thoại.
