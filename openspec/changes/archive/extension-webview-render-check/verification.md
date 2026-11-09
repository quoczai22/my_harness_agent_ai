# Verification

## Kết quả thực tế

- `npm test`: **92/92 passed** trên version 0.3.5.
- `npm run test:webview`: **exit 0** với Code.exe đã cài (`C:\Users\kienq\AppData\Local\Programs\Microsoft VS Code\Code.exe`), workspace, user-data và extensions tạm riêng. Runner đã bỏ các biến môi trường `VSCODE_*` và `ELECTRON_*`. Thư mục tạm của lượt thành công (`C:\Users\kienq\AppData\Local\Temp\continuity-webview-95EUsC`) đã được xóa (`Test-Path` = `False`).
- Webview thật mở `continuity.assistant.chat`, vẽ trang 1 `test-fixtures/scanned.pdf`: JPEG **1598 × 773**, **18.639 byte**, **7/1089** điểm lấy mẫu có màu khác trắng; pdf.js báo **worker=real**. Log có `getDocument resolved` và `canvas rendered`.
- LM Studio trên `127.0.0.1:1234` có `qwen3.5-2b` VLM đã nạp. Bản chép trả về: `Câu 1: Ảnh chụp đề - không có lớp chữ`.
- `npm run package`: thành công, VSIX 0.3.5 gồm **207 file, 1.56 MB**. Đã kiểm tra archive không chứa `dist/integration` hoặc `test-webview`. `code --install-extension continuity-workflow.vsix --force` thành công; `code --list-extensions --show-versions` hiện `quoczai22.continuity-vscode@0.3.5`.
- `git diff --check`: đạt.

## Lỗi 0.3.4 phát hiện và cách sửa

Trong VS Code webview thật, pdf.js được import nhưng `getDocument()` không trả về: worker của pdf.js được tạo qua URL `blob:` chứa lệnh import tới URL vendor khác origin; worker không khởi tạo xong và phép vẽ bị timeout 30 giây. Test trước đó bằng browser thường không phát hiện được. Code 0.3.5 tải worker chỉ từ `dist/vendor/pdfjs` qua webview resource URI, tạo Blob cùng origin của webview, khởi tạo Worker module trực tiếp và truyền `GlobalWorkerOptions.workerPort` cho pdf.js. Worker được kết thúc và Blob URL được thu hồi sau khi vẽ. Lượt test thật sau sửa xác nhận `worker=real` và ảnh không trắng.

## Giới hạn

- Bài test xác minh vẽ một trang scan và một lần gọi VLM trong profile tạm; chưa kiểm chứng thao tác Xác nhận/Hủy qua UI bằng tay hay nhiều trang trong cùng phiên.
- Lần đầu chạy trong sandbox không tìm được Code.exe do `%LOCALAPPDATA%` bị chuyển hướng; runner hiện dò thêm `%USERPROFILE%\AppData\Local`. Lần chạy sandbox tiếp theo Code.exe thoát mã `2147483651` trước test. Lần chạy ngoài sandbox bằng cùng runner đã hoàn tất; không có bằng chứng lỗi ở VS Code cài sẵn.

Không tải, commit hoặc push.
