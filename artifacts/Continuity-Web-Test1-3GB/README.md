# Continuity Web Exam 3GB — ôn thi ASP.NET Core MVC + ADO.NET

`Start-Web-Exam.cmd` chạy model Qwen2.5-Coder-3B local bằng llama.cpp, không cần Ollama hay Internet. Đặc tả gốc nằm trong `reference/Ghi-chep-MVC-ADO.NET.md` (đi kèm kit, không cần đường dẫn OneDrive). Ba bài mẫu .NET 8 trong `reference-examples/` chỉ để học **cấu trúc**; kit luôn đọc tên bảng/cột từ file SQL thật của đề.

## Cách dùng

1. `/new` rồi nhập thư mục project bài đang làm (đường dẫn trên máy trường có thể khác, không sao). Mỗi bài một phiên riêng; `/sessions` liệt kê, `/open` mở lại sau khi tắt máy.
2. `/exam` dán chữ đề, kết thúc bằng một dòng `HET DE`. Có thể dán nhiều lần; kit chỉ nhận đề khi gặp `HET DE`.
3. `/schema` xem database, bảng, khóa chính, cột `IDENTITY` và khóa ngoại mà kit đọc được từ các file `.sql` (kể cả file SSMS xuất ra dạng UTF-16).
4. `/view` đính kèm file `.html`/`.cshtml` mẫu nếu nằm ngoài project. File `.html` trong project được tự tìm.
5. `/ask` hỏi và nhận trả lời ngay trên chat (luôn bằng tiếng Việt; nếu model lỡ trả lời tiếng Trung, kit tự hỏi lại một lần và cảnh báo nếu vẫn sai).
6. `/file` sinh một file. Kit in nội dung ra trước; chỉ khi gõ `SAVE` mới lưu vào `drafts/<mã phiên>/`. Project gốc không bao giờ bị ghi.
   - `Views/Shared/_Layout.cshtml`: nếu có trang mẫu, kit tách header/nav/footer/CSS chung thành layout mới (đổi link `*.html` thành `asp-action`, escape `@`). Nếu không có trang mẫu, tạo layout Bootstrap/HTML đơn giản. Không dùng AI.
   - `Models/<TênBảng>.cs`: sinh thẳng từ SQL (đúng tên cột, kiểu, nullable, thêm thuộc tính `Ten...` để nhận tên từ JOIN). Không dùng AI.
   - Controller, view khác: AI viết theo đề, schema và các Model đã có.
7. `/check` đối chiếu checklist mục 17 của đặc tả: tên database, `Microsoft.Data.SqlClient`, không EF, layout, Model khớp cột, SELECT/INSERT/UPDATE/DELETE, tham số SQL, tìm kiếm, JOIN, dropdown khóa ngoại, `name` input, `RedirectToAction("Index")`, xóa bằng POST, không INSERT cột IDENTITY. Mỗi mục ghi `[ĐẠT]`, `[LỖI]`, `[CHƯA KIỂM]` hoặc `[KHÔNG CẦN]`.
8. `/build` chạy `dotnet build` trên **bản sao tạm** (project + bản nháp), chỉ lấy package từ NuGet cache trên máy, rồi xóa bản sao. Cần .NET SDK phù hợp; project MVC5 thì kit từ chối và nhắc build bằng Visual Studio.

Kit chỉ đọc file chữ (`.cs`, `.cshtml`, `.html`, `.css`, `.js`, `.sql`, `.csproj`, `.json`), bỏ qua `bin`, `obj`, `wwwroot/lib`, và che mật khẩu trong connection string. Không đọc PDF/ảnh, không chạy SQL, không đụng database.

## Giới hạn

- "Build được" không có nghĩa là chạy đúng: kit không chạy ứng dụng và không kết nối SQL Server. Mục "Chạy app và hiển thị dữ liệu thật" luôn là `[CHƯA KIỂM]` — phải tự thử trong Visual Studio.
- Code do model 3B viết vẫn có thể sai; dùng `/check` và `/build`, rồi đọc lại trước khi chép vào project.
- Mỗi lượt hỏi mất khoảng 20–90 giây tùy độ dài trên máy chuẩn bị kit; máy trường chưa được thử.

## Kiểm thử

```
powershell -NoProfile -ExecutionPolicy Bypass -File Study-Exam.ps1 -SelfTest
powershell -NoProfile -ExecutionPolicy Bypass -File Study-Exam.ps1 -SelfTest -Live
```

`-SelfTest` chạy offline (không gọi model): phân tích SQL của 6 schema khác nhau, nhận đề nhiều phần, phiên tách biệt/khởi động lại, đọc thư mục ở đường dẫn khác nhau, che bí mật, tách layout, sinh Model, chặn ghi ngoài `drafts/`, checklist trên lời giải đúng và sai, và `dotnet build` thật nếu máy có SDK. `-Live` thêm phần chạy model thật và ghi báo cáo vào `tests/results/`.
