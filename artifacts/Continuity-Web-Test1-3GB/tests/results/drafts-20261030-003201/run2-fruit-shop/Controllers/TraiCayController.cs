using FruitShop.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Mvc.Rendering;

namespace FruitShop.Controllers;

public class TraiCayController : Controller
{
    private readonly string? _connectionString;

    public TraiCayController(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("QLTraiCay");
    }

    public IActionResult Index(string? keyword)
    {
        List<TraiCay> danhSach = new List<TraiCay>();
        string sql = @"SELECT tc.MaTC, tc.TenTC, tc.Gia, tc.NgayNhap, tc.MaNCC,
                              nc.TenNCC
                       FROM TraiCay tc
                       LEFT JOIN NhaCungCap nc ON tc.MaNCC = nc.MaNCC";
        if (keyword != null) sql += " WHERE tc.TenTC LIKE @keyword";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            if (keyword != null) command.Parameters.AddWithValue("@keyword", $"%{keyword}%");
            connection.Open();
            using (SqlDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    TraiCay traiCay = new TraiCay();
                    traiCay.MaTC = Convert.ToInt32(reader["MaTC"]);
                    traiCay.TenTC = reader["TenTC"].ToString()!;
                    traiCay.Gia = Convert.ToDecimal(reader["Gia"]);
                    traiCay.NgayNhap = reader["NgayNhap"] == DBNull.Value ? null : Convert.ToDateTime(reader["NgayNhap"]);
                    traiCay.MaNCC = reader["MaNCC"].ToString()!;
                    traiCay.TenNhaCungCap = reader["TenNhaCungCap"] == DBNull.Value ? "" : reader["TenNhaCungCap"].ToString()!;
                    danhSach.Add(traiCay);
                }
            }
        }

        ViewBag.TenTC = keyword;
        return View(danhSach);
    }

    public IActionResult ThemMoi()
    {
        ViewBag.SelectListNhaCungCap = new SelectList(
            GetNhaCungCap(),
            nameof(NhaCungCap.MaNCC),
            nameof(NhaCungCap.TenNCC));

        return View();
    }

    [HttpPost]
    public IActionResult ThemMoi(TraiCay traiCay)
    {
        if (!ModelState.IsValid) return View(traiCay);

        string sql = @"INSERT INTO TraiCay (TenTC, Gia, NgayNhap, MaNCC)
                        VALUES (@tenTC, @gia, @ngayNhap, @maNCC)";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@tenTC", traiCay.TenTC);
            command.Parameters.AddWithValue("@gia", traiCay.Gia);
            command.Parameters.AddWithValue("@ngayNhap", traiCay.NgayNhap);
            command.Parameters.AddWithValue("@maNCC", traiCay.MaNCC);
            connection.Open();
            command.ExecuteNonQuery();
        }

        return RedirectToAction("Index");
    }

    public IActionResult Sua(int maTC)
    {
        ViewBag.SelectListNhaCungCap = new SelectList(
            GetNhaCungCap(),
            nameof(NhaCungCap.MaNCC),
            nameof(NhaCungCap.TenNCC));

        TraiCay traiCay = GetTraiCay(maTC);
        if (traiCay == null) return NotFound();

        return View(traiCay);
    }

    [HttpPost]
    public IActionResult Sua(TraiCay traiCay)
    {
        if (!ModelState.IsValid) return View(traiCay);

        string sql = @"UPDATE TraiCay
                        SET TenTC = @tenTC, Gia = @gia, NgayNhap = @ngayNhap, MaNCC = @maNCC
                        WHERE MaTC = @maTC";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@tenTC", traiCay.TenTC);
            command.Parameters.AddWithValue("@gia", traiCay.Gia);
            command.Parameters.AddWithValue("@ngayNhap", traiCay.NgayNhap);
            command.Parameters.AddWithValue("@maNCC", traiCay.MaNCC);
            command.Parameters.AddWithValue("@maTC", traiCay.MaTC);
            connection.Open();
            command.ExecuteNonQuery();
        }

        return RedirectToAction("Index");
    }

    public IActionResult Xoa(int maTC)
    {
        TraiCay traiCay = GetTraiCay(maTC);
        if (traiCay == null) return NotFound();

        string sql = @"DELETE FROM TraiCay WHERE MaTC = @maTC";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@maTC", maTC);
            connection.Open();
            command.ExecuteNonQuery();
        }

        return RedirectToAction("Index");
    }

    private List<NhaCungCap> GetNhaCungCap()
    {
        List<NhaCungCap> nhaCungCapList = new List<NhaCungCap>();
        string sql = @"SELECT MaNCC, TenNCC, DienThoai FROM NhaCungCap";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            connection.Open();
            using (SqlDataReader reader = command.ExecuteReader())
            {
                while (reader.Read())
                {
                    NhaCungCap nhaCungCap = new NhaCungCap();
                    nhaCungCap.MaNCC = reader["MaNCC"].ToString()!;
                    nhaCungCap.TenNCC = reader["TenNCC"].ToString()!;
                    nhaCungCap.DienThoai = reader["DienThoai"] == DBNull.Value ? "" : reader["DienThoai"].ToString()!;
                    nhaCungCapList.Add(nhaCungCap);
                }
            }
        }

        return nhaCungCapList;
    }

    private TraiCay GetTraiCay(int maTC)
    {
        TraiCay traiCay = new TraiCay();
        string sql = @"SELECT MaTC, TenTC, Gia, NgayNhap, MaNCC
                        FROM TraiCay WHERE MaTC = @maTC";

        using (SqlConnection connection = new SqlConnection(_connectionString))
        using (SqlCommand command = new SqlCommand(sql, connection))
        {
            command.Parameters.AddWithValue("@maTC", maTC);
            connection.Open();
            using (SqlDataReader reader = command.ExecuteReader())
            {
                if (reader.Read())
                {
                    traiCay.MaTC = Convert.ToInt32(reader["MaTC"]);
                    traiCay.TenTC = reader["TenTC"].ToString()!;
                    traiCay.Gia = Convert.ToDecimal(reader["Gia"]);
                    traiCay.NgayNhap = reader["NgayNhap"] == DBNull.Value ? null : Convert.ToDateTime(reader["NgayNhap"]);
                    traiCay.MaNCC = reader["MaNCC"].ToString()!;
                }
            }
        }

        return traiCay;
    }
}