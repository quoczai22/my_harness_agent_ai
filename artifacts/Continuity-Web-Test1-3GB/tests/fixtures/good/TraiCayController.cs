using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Rendering;
using Microsoft.Data.SqlClient;
using FruitShop.Models;

namespace FruitShop.Controllers;

public class TraiCayController : Controller
{
    private readonly string _connectionString;

    public TraiCayController(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DefaultConnection") ?? "";
    }

    public IActionResult Index(string? keyword)
    {
        var list = new List<TraiCay>();
        using var conn = new SqlConnection(_connectionString);
        var sql = "SELECT t.MaTC, t.TenTC, t.Gia, t.NgayNhap, t.MaNCC, n.TenNCC FROM TraiCay t JOIN NhaCungCap n ON t.MaNCC = n.MaNCC WHERE (@keyword IS NULL OR t.TenTC LIKE @keyword)";
        using var cmd = new SqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("@keyword", string.IsNullOrWhiteSpace(keyword) ? (object)DBNull.Value : "%" + keyword + "%");
        conn.Open();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new TraiCay
            {
                MaTC = (int)reader["MaTC"],
                TenTC = (string)reader["TenTC"],
                Gia = (decimal)reader["Gia"],
                NgayNhap = reader["NgayNhap"] as DateTime?,
                MaNCC = (string)reader["MaNCC"],
                TenNhaCungCap = (string)reader["TenNCC"]
            });
        }
        return View(list);
    }

    public IActionResult Create()
    {
        ViewBag.MaNCC = new SelectList(GetNhaCungCap(), "MaNCC", "TenNCC");
        return View();
    }

    [HttpPost]
    public IActionResult Create(TraiCay model)
    {
        using var conn = new SqlConnection(_connectionString);
        using var cmd = new SqlCommand("INSERT INTO TraiCay (TenTC, Gia, NgayNhap, MaNCC) VALUES (@TenTC, @Gia, @NgayNhap, @MaNCC)", conn);
        AddParameters(cmd, model);
        conn.Open();
        cmd.ExecuteNonQuery();
        return RedirectToAction("Index");
    }

    public IActionResult Edit(int id)
    {
        TraiCay? item = null;
        using var conn = new SqlConnection(_connectionString);
        using var cmd = new SqlCommand("SELECT MaTC, TenTC, Gia, NgayNhap, MaNCC FROM TraiCay WHERE MaTC = @MaTC", conn);
        cmd.Parameters.AddWithValue("@MaTC", id);
        conn.Open();
        using var reader = cmd.ExecuteReader();
        if (reader.Read())
        {
            item = new TraiCay
            {
                MaTC = (int)reader["MaTC"],
                TenTC = (string)reader["TenTC"],
                Gia = (decimal)reader["Gia"],
                NgayNhap = reader["NgayNhap"] as DateTime?,
                MaNCC = (string)reader["MaNCC"]
            };
        }
        if (item == null) return NotFound();
        ViewBag.MaNCC = new SelectList(GetNhaCungCap(), "MaNCC", "TenNCC", item.MaNCC);
        return View(item);
    }

    [HttpPost]
    public IActionResult Edit(TraiCay model)
    {
        using var conn = new SqlConnection(_connectionString);
        using var cmd = new SqlCommand("UPDATE TraiCay SET TenTC = @TenTC, Gia = @Gia, NgayNhap = @NgayNhap, MaNCC = @MaNCC WHERE MaTC = @MaTC", conn);
        AddParameters(cmd, model);
        cmd.Parameters.AddWithValue("@MaTC", model.MaTC);
        conn.Open();
        cmd.ExecuteNonQuery();
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult Delete(int id)
    {
        using var conn = new SqlConnection(_connectionString);
        using var cmd = new SqlCommand("DELETE FROM TraiCay WHERE MaTC = @MaTC", conn);
        cmd.Parameters.AddWithValue("@MaTC", id);
        conn.Open();
        cmd.ExecuteNonQuery();
        return RedirectToAction("Index");
    }

    private static void AddParameters(SqlCommand cmd, TraiCay model)
    {
        cmd.Parameters.AddWithValue("@TenTC", model.TenTC);
        cmd.Parameters.AddWithValue("@Gia", model.Gia);
        cmd.Parameters.AddWithValue("@NgayNhap", (object?)model.NgayNhap ?? DBNull.Value);
        cmd.Parameters.AddWithValue("@MaNCC", model.MaNCC);
    }

    private List<NhaCungCap> GetNhaCungCap()
    {
        var list = new List<NhaCungCap>();
        using var conn = new SqlConnection(_connectionString);
        using var cmd = new SqlCommand("SELECT MaNCC, TenNCC FROM NhaCungCap", conn);
        conn.Open();
        using var reader = cmd.ExecuteReader();
        while (reader.Read())
        {
            list.Add(new NhaCungCap { MaNCC = (string)reader["MaNCC"], TenNCC = (string)reader["TenNCC"] });
        }
        return list;
    }
}
