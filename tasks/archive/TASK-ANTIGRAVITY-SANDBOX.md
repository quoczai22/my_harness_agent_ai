# Work order: Continuity Core sandbox verification

## Mục tiêu

Chuẩn bị bằng chứng kỹ thuật để Manager có thể quyết định GO cho sandbox. Không triển khai vào dự án thật.

## Phạm vi được phép

- `src/store.ts`, `src/types.ts`, `src/index.ts` chỉ khi cần để hoàn tất các điều kiện bên dưới.
- `test-full.mjs`, các test chuyên biệt, `package.json`, và tài liệu sandbox liên quan.
- Dùng một file state tạm dành riêng cho test, nằm ngoài `.continuity/state.json` thật.

## Không được làm

- Không xóa, ghi đè, hoặc trỏ test vào `.continuity/state.json` thật.
- Không tự approve checkpoint.
- Không thay đổi phạm vi sang NCKH, hackathon, hoặc dự án công việc thật.
- Không commit/push khi chưa được Manager yêu cầu riêng.

## Yêu cầu nghiệm thu

1. `approveCheckpoint()` từ chối checkpoint khi task còn discussion/blocker chưa giải quyết; sau `resolveDiscussion()` thì approve thành công.
2. State phải được đọc mới từ disk ở mỗi thao tác phù hợp; một `Store` instance cũ phải thấy cập nhật do instance/process khác ghi.
3. Thêm kiểm thử đa tiến trình OS thật: ba lệnh Node độc lập với PID khác nhau:
   - Process A tạo/ghi state.
   - Process B đọc state của A rồi ghi tiếp.
   - Process C xác nhận thay đổi của B.
   Log phải có PID, đường dẫn state tạm, và assertion PASS cho từng process.
4. Chạy `npm test` thành công từ trạng thái sạch.

## Báo cáo lại Manager

Gửi đầy đủ: các file đã sửa, output `npm test` nguyên vẹn, output ba process/PID, state path test, và mọi hạn chế còn lại. Không chỉ gửi tóm tắt PASS.

