# Verification

- Extension `npm test`: 92/92 passed.
- `npm run package`: passed; `continuity-workflow.vsix` version 0.3.4, 207 files, 1.56 MB.
- `code --install-extension continuity-workflow.vsix --force`: succeeded.
- `code --list-extensions --show-versions`: `quoczai22.continuity-vscode@0.3.4`.
- `git diff --check`: passed.
- Node tests cover the existing `test-fixtures/scanned.pdf`, fake page renderer/model, confirmation and cancellation, VLM eligibility, limits, timeout and empty transcription.

## Chưa kiểm chứng

- Chưa bấm thử luồng PDF scan trong webview VS Code thật với pdf.js worker và CSP. VS Code đang mở workspace khác; lệnh mở cửa sổ riêng `code -n D:\harness_agent` trả `EPERM` khi CLI đổi thư mục làm việc. Vì vậy chưa thể xác nhận ảnh được vẽ và gửi đến LM Studio trong giao diện thật.
- Chưa chạy phiên chép trang PDF bằng model VLM thật. Các phép thử model dùng server giả.

Không tải thư viện, không commit, không push.
