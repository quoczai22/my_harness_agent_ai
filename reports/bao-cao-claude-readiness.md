# Báo cáo cho Claude — Readiness sau checkpoint #1

## Quyết định

**NO-GO cho chạy Codex + Antigravity trên project thật.**

Fix P0 checkpoint bypass trong `store.ts` đính kèm đã được Codex kiểm tra cô lập: `set_status("IMPL_IN_PROGRESS")` tại `CHECKPOINT_1` bị chặn, `approve_checkpoint` chuyển state hợp lệ, và double-approve bị từ chối. Tuy nhiên, bản source đó chưa được tích hợp/test end-to-end trong workspace hiện tại.

## Điều kiện còn thiếu

1. `approve_checkpoint` phải bị từ chối khi còn discussion blocker. Prompt mới quy định rõ điều này; cần test runtime, không chỉ đọc code.
2. State phải được đọc mới từ file cho mỗi tool call, hoặc có cơ chế đồng bộ/locking tương đương. Store cache RAM sẽ làm Codex và Antigravity dùng chung một `CONTINUITY_STATE_PATH` nhưng không thấy thay đổi của nhau hoặc ghi đè state.
3. Phải chạy test hai process song song theo Phần C của `prompts-bo-sung.md`: process B đọc đúng task do process A vừa ghi và không mất dữ liệu sau một lần ghi tiếp theo.
4. Phải chạy đầy đủ Phần A/B của MCP Inspector: checkpoint bypass, double-approve, scope verdict, discussion block approval, resolve discussion và completion.
5. Sau khi các test pass, mới tích hợp source đã sửa vào repository, chạy `npm test`, rồi đăng ký MCP cho hai client.

## Yêu cầu implementation

- Gộp các fix đã xác minh: public `set_status` không được rời `CHECKPOINT_1`/`CHECKPOINT_2`; chỉ `approve_checkpoint` gọi được transition nội bộ.
- `approve_checkpoint` kiểm tra blockers trước khi đổi trạng thái hoặc sửa checkpoint.
- State layer không được giữ một snapshot stale giữa tool calls. Bổ sung đọc state mới và cơ chế chống lost update phù hợp cho file JSON, rồi viết automated test hai instance.
- Giữ các guardrail đã có: keyword không chồng lấp, task mô tả quyền sửa test, discussion có `discussionId`, không mở change mới khi change cũ chưa đóng.

## Điều kiện GO

GO sandbox chỉ khi A, B, C của kịch bản Inspector đều pass và test tự động bao phủ ít nhất: direct checkpoint bypass, double approve, blocked approval, resolve blocker, và shared-state visibility.
