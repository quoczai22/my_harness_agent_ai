# Đặc tả ôn kiểm tra ASP.NET Core MVC + ADO.NET

## 1. Phạm vi bài kiểm tra

Đề có thể là **bất kỳ chủ đề nào**, không cố định là Category, Movie hay Fruitable.
Ví dụ: phim - thể loại, sách - tác giả, sản phẩm - loại sản phẩm, trái cây - nhà
cung cấp, sinh viên - lớp.

Thầy cung cấp một file SQL có dữ liệu và ít nhất hai bảng có quan hệ bằng khóa ngoại,
cùng một file HTML giao diện đơn giản. Sinh viên phải biến HTML đó thành ứng dụng
ASP.NET Core MVC và dùng ADO.NET kết nối SQL Server.

Không học thuộc tên `Category`. Khi thi phải thay tên bảng, tên cột và tên Model theo
file SQL thực tế.

## 2. Kết quả cuối cùng cần đạt

```text
HTML/Razor View
    -> Controller
    -> ADO.NET
    -> SQL Server
    -> Model/danh sách dữ liệu
    -> View hiển thị lại
```

Với bảng chính phải làm được:

```text
Xem danh sách -> Tìm kiếm -> Thêm -> Sửa -> Xóa
```

Với bảng có quan hệ phải làm được:

```text
JOIN để hiển thị tên bảng liên quan
Dropdown chọn bản ghi bảng liên quan khi thêm/sửa
```

## 3. Công cụ và thư viện

Tạo project bằng Visual Studio 2022:

```text
ASP.NET Core Web App (Model-View-Controller)
```

Chọn .NET 8 nếu máy thầy dùng .NET 8. Không dùng Entity Framework nếu đề yêu cầu
ADO.NET.

Cài thư viện trước khi tắt Wi-Fi:

```powershell
dotnet add package Microsoft.Data.SqlClient
```

## 4. Đọc file SQL trước khi lập trình

Không đoán tên bảng. Đọc SQL và ghi ra:

```text
Tên database:
Tên bảng 1 và khóa chính:
Tên bảng 2 và khóa chính:
Khóa ngoại:
Các cột cần hiển thị:
```

Ví dụ SQL có `Book` và `Author` thì `Book.AuthorId` là khóa ngoại trỏ tới
`Author.AuthorId`. Nếu đề có `Product` và `Category` thì thay toàn bộ tên tương ứng.

## 5. Cấu trúc project tối thiểu

```text
TenProject/
├── Controllers/TenBangController.cs
├── Models/ModelBangChinh.cs
├── Models/ModelBangLienQuan.cs
├── Views/TenBang/Index.cshtml
├── Views/TenBang/Create.cshtml
├── Views/TenBang/Edit.cshtml
├── Views/Shared/_Layout.cshtml
├── appsettings.json
└── Program.cs
```

Không bắt buộc tạo Repository nếu thầy không yêu cầu. Có thể viết ADO.NET trực tiếp
trong Controller theo cách đã học.

## 6. Kết nối database

Trong `appsettings.json`, tên database phải đúng file SQL:

```json
"ConnectionStrings": {
  "DefaultConnection": "Server=(localdb)\\MSSQLLocalDB;Database=TEN_DATABASE;Trusted_Connection=True;TrustServerCertificate=True"
}
```

Trong Controller:

```csharp
using Microsoft.Data.SqlClient;

private readonly string _connectionString;

public TenBangController(IConfiguration configuration)
{
    _connectionString =
        configuration.GetConnectionString("DefaultConnection");
}
```

Nếu có lỗi `Cannot open database`, kiểm tra lại tên database và SQL Server instance.

## 7. Model

Mỗi bảng tạo một Model. Tên thuộc tính phải tương ứng với cột SQL:

```csharp
public class BangChinh
{
    public int Id { get; set; }
    public string Ten { get; set; } = "";
    public int BangLienQuanId { get; set; }
    public string TenBangLienQuan { get; set; } = "";
}
```

`TenBangLienQuan` có thể là thuộc tính phụ để nhận tên từ câu lệnh `JOIN`. Nếu khóa
chính là `IDENTITY`, khi thêm mới không cần nhập hoặc INSERT khóa chính.

## 8. Chuyển HTML thành Razor View

- Phần chung như header, menu, CSS, footer đưa vào `_Layout.cshtml`.
- Phần danh sách đưa vào `Index.cshtml`.
- Form thêm đưa vào `Create.cshtml`.
- Form sửa đưa vào `Edit.cshtml`.

Trong Layout phải có:

```cshtml
@RenderBody()
```

Menu MVC dùng thẻ `a`:

```cshtml
<a asp-controller="TenBang" asp-action="Create">Thêm mới</a>
```

Không dùng lại đường dẫn tĩnh `create.html` sau khi đã chuyển sang MVC.

## 9. Hiển thị danh sách - SELECT

Action danh sách phải viết `SELECT`, nếu có quan hệ thì `JOIN`, mở connection, chạy
`ExecuteReader()`, dùng `reader.Read()` đọc từng dòng, đưa vào `List<Model>` rồi
`return View(list)`.

Mẫu tổng quát:

```csharp
public IActionResult Index()
{
    List<BangChinh> list = new List<BangChinh>();

    string sql = @"
        SELECT a.Id, a.Ten, a.BangLienQuanId,
               b.Ten AS TenBangLienQuan
        FROM BangChinh a
        JOIN BangLienQuan b ON a.BangLienQuanId = b.Id
        ORDER BY a.Id";

    using (SqlConnection connection =
           new SqlConnection(_connectionString))
    {
        connection.Open();

        using (SqlCommand command =
               new SqlCommand(sql, connection))
        using (SqlDataReader reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                list.Add(new BangChinh
                {
                    Id = Convert.ToInt32(reader["Id"]),
                    Ten = reader["Ten"].ToString(),
                    BangLienQuanId = Convert.ToInt32(
                        reader["BangLienQuanId"]),
                    TenBangLienQuan = reader["TenBangLienQuan"].ToString()
                });
            }
        }
    }

    return View(list);
}
```

View:

```cshtml
@model List<TenProject.Models.BangChinh>

@foreach (var item in Model)
{
    <tr>
        <td>@item.Id</td>
        <td>@item.Ten</td>
        <td>@item.TenBangLienQuan</td>
    </tr>
}
```

## 10. Tìm kiếm bằng GET

Form:

```cshtml
<form asp-action="Index" method="get">
    <input name="keyword" placeholder="Nhập từ khóa" />
    <button type="submit">Tìm kiếm</button>
</form>
```

Controller nhận Query String và dùng tham số SQL:

```csharp
public IActionResult Index(string? keyword)
{
    string sql = @"
        SELECT ...
        FROM BangChinh a
        JOIN BangLienQuan b ON ...
        WHERE @Keyword = '' OR a.Ten LIKE @Search";

    command.Parameters.AddWithValue("@Keyword", keyword ?? "");
    command.Parameters.AddWithValue(
        "@Search", "%" + (keyword ?? "") + "%");

    // ExecuteReader và đọc dữ liệu như phần danh sách
}
```

## 11. Thêm - INSERT

Luôn có một action GET mở form và một action POST ghi dữ liệu:

```csharp
[HttpGet]
public IActionResult Create()
{
    // Lấy danh sách bảng liên quan nếu cần dropdown
    return View();
}
```

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public IActionResult Create(BangChinh model)
{
    string sql = @"
        INSERT INTO BangChinh (Ten, BangLienQuanId)
        VALUES (@Ten, @BangLienQuanId)";

    using (SqlConnection connection =
           new SqlConnection(_connectionString))
    {
        connection.Open();

        using (SqlCommand command =
               new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@Ten", model.Ten);
            command.Parameters.AddWithValue(
                "@BangLienQuanId", model.BangLienQuanId);
            command.ExecuteNonQuery();
        }
    }

    return RedirectToAction("Index");
}
```

`name` của input phải trùng thuộc tính Model:

```html
<input name="Ten">
<select name="BangLienQuanId">
```

## 12. Dropdown bảng liên quan

Trong GET `Create`, lấy bảng liên quan rồi truyền bằng `ViewBag` hoặc `ViewData`:

```csharp
ViewBag.BangLienQuan = danhSachBangLienQuan;
return View();
```

Trong View:

```cshtml
<select name="BangLienQuanId">
    @foreach (var item in ViewBag.BangLienQuan)
    {
        <option value="@item.Id">@item.Ten</option>
    }
</select>
```

## 13. Sửa - UPDATE

GET lấy bản ghi cần sửa và danh sách cho dropdown:

```csharp
[HttpGet]
public IActionResult Edit(int id)
{
    // SELECT ... WHERE Id = @Id
    // Lấy danh sách bảng liên quan
    // return View(model)
}
```

POST cập nhật:

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public IActionResult Edit(BangChinh model)
{
    string sql = @"
        UPDATE BangChinh
        SET Ten = @Ten,
            BangLienQuanId = @BangLienQuanId
        WHERE Id = @Id";

    using (SqlConnection connection =
           new SqlConnection(_connectionString))
    {
        connection.Open();

        using (SqlCommand command =
               new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@Id", model.Id);
            command.Parameters.AddWithValue("@Ten", model.Ten);
            command.Parameters.AddWithValue(
                "@BangLienQuanId", model.BangLienQuanId);
            command.ExecuteNonQuery();
        }
    }

    return RedirectToAction("Index");
}
```

## 14. Xóa - DELETE

Với form MVC thông thường dùng POST:

```csharp
[HttpPost]
[ValidateAntiForgeryToken]
public IActionResult Delete(int id)
{
    string sql = "DELETE FROM BangChinh WHERE Id = @Id";

    using (SqlConnection connection =
           new SqlConnection(_connectionString))
    {
        connection.Open();

        using (SqlCommand command =
               new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@Id", id);
            command.ExecuteNonQuery();
        }
    }

    return RedirectToAction("Index");
}
```

View:

```cshtml
<form asp-action="Delete" method="post">
    @Html.AntiForgeryToken()
    <input type="hidden" name="id" value="@item.Id" />
    <button type="submit">Xóa</button>
</form>
```

`HTTP DELETE` thường dành cho API hoặc JavaScript `fetch`. Với form MVC mà thầy
đang hướng dẫn, dùng `[HttpPost]` cho xóa là đúng.

## 15. Kiến thức cơ bản có thể hỏi

```text
Model     -> đại diện dữ liệu và nhận dữ liệu form
ViewBag   -> truyền dữ liệu phụ sang View, ví dụ dropdown
ViewData  -> truyền dữ liệu phụ bằng key
TempData  -> truyền thông báo sau Redirect
Controller-> nhận request và điều phối xử lý
View      -> hiển thị HTML/Razor
Route     -> /{controller}/{action}/{id?}
Areas     -> nhóm khu vực như Admin nếu đề yêu cầu
```

Ví dụ `TempData`:

```csharp
TempData["Message"] = "Lưu thành công";
return RedirectToAction("Index");
```

## 16. Các lệnh ADO.NET phải nhớ

```text
SELECT  -> ExecuteReader()
INSERT  -> ExecuteNonQuery()
UPDATE  -> ExecuteNonQuery()
DELETE  -> ExecuteNonQuery()
```

```text
SqlConnection -> kết nối SQL Server
SqlCommand    -> chứa và chạy câu SQL
SqlDataReader -> đọc kết quả SELECT
Parameters    -> truyền dữ liệu vào câu SQL
```

## 17. Checklist trước khi nộp

- [ ] Đúng tên database trong connection string.
- [ ] Project chạy được.
- [ ] HTML đã chia thành Layout và các View.
- [ ] Có Model cho các bảng cần dùng.
- [ ] Hiển thị dữ liệu thật từ SQL.
- [ ] Có SELECT, INSERT, UPDATE, DELETE.
- [ ] Có tìm kiếm nếu HTML có ô tìm kiếm.
- [ ] Có JOIN nếu đề có hai bảng quan hệ.
- [ ] Dropdown gửi đúng khóa ngoại.
- [ ] `name` của input trùng thuộc tính Model.
- [ ] Mỗi INSERT/UPDATE/DELETE đều có `ExecuteNonQuery()`.
- [ ] Sau khi lưu/xóa có `RedirectToAction("Index")`.
- [ ] Không INSERT khóa chính nếu cột là `IDENTITY`.

## 18. Thứ tự làm bài trong phòng thi

```text
1. Đọc SQL, xác định bảng, khóa chính, khóa ngoại.
2. Tạo project MVC.
3. Cài Microsoft.Data.SqlClient.
4. Sửa connection string.
5. Tạo Model.
6. Chia HTML thành Layout và View.
7. Làm SELECT hiển thị danh sách.
8. Làm tìm kiếm.
9. Làm CREATE/INSERT.
10. Làm dropdown bảng liên quan.
11. Làm EDIT/UPDATE.
12. Làm DELETE.
13. Kiểm tra dữ liệu thật trong SQL Server.
14. Nếu còn thời gian, bổ sung TempData, Areas và Bootstrap.
```

## 19. Kết luận

Đề không bắt học thuộc một bài cố định. Cần học quy trình thay tên:

```text
Tên bảng SQL
    -> Model
    -> Controller
    -> SELECT/INSERT/UPDATE/DELETE
    -> View
    -> form và input name
```

Đổi được quy trình này từ Movie sang Book, Product, Fruit, Student hoặc bất kỳ
chủ đề nào khác thì có thể làm được đề mới.
