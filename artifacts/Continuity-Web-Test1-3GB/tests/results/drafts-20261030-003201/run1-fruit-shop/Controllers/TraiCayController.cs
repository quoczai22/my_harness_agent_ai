using FruitShop.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.AspNetCore.Mvc.Rendering;
using System.Collections.Generic;
using System.Linq;

namespace FruitShop.Controllers
{
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
            string sql = @"SELECT t.MaTC, t.TenTC, t.Gia, t.NgayNhap, t.MaNCC, nc.TenNCC
                         FROM TraiCay t
                         LEFT JOIN NhaCungCap nc ON t.MaNCC = nc.MaNCC";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                if (!string.IsNullOrEmpty(keyword))
                {
                    sql += " WHERE t.TenTC LIKE @keyword";
                    command.Parameters.AddWithValue("@keyword", "%" + keyword + "%");
                }
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        TraiCay traiCay = new TraiCay();
                        traiCay.MaTC = Convert.ToInt32(reader["MaTC"]);
                        traiCay.TenTC = reader["TenTC"].ToString()!;
                        traiCay.Gia = Convert.ToDecimal(reader["Gia"]);
                        traiCay.NgayNhap = reader["NgayNhap"] != DBNull.Value ? Convert.ToDateTime(reader["NgayNhap"]) : (DateTime?)null;
                        traiCay.MaNCC = reader["MaNCC"].ToString()!;
                        traiCay.TenNhaCungCap = reader["TenNhaCungCap"].ToString()!;
                        danhSach.Add(traiCay);
                    }
                }
            }
            ViewBag.DanhSachTraiCay = danhSach;
            ViewBag.Keyword = keyword;
            return View();
        }

        public IActionResult Create()
        {
            ViewBag.SelectListNhaCungCap = GetDataNhaCungCap();
            return View();
        }

        [HttpPost]
        public IActionResult Create(TraiCay traiCay)
        {
            string sql = @"INSERT INTO TraiCay (TenTC, Gia, NgayNhap, MaNCC) VALUES (@tenTC, @gia, @ngayNhap, @maNCC)";

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

        public IActionResult Edit(int? maTC)
        {
            if (maTC == null) return NotFound();
            ViewBag.SelectListNhaCungCap = GetDataNhaCungCap();
            TraiCay traiCay = GetDataTraiCay(maTC);
            if (traiCay == null) return NotFound();
            return View(traiCay);
        }

        [HttpPost]
        public IActionResult Edit(TraiCay traiCay)
        {
            string sql = @"UPDATE TraiCay SET TenTC = @tenTC, Gia = @gia, NgayNhap = @ngayNhap, MaNCC = @maNCC WHERE MaTC = @maTC";

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

        public IActionResult Delete(int? maTC)
        {
            if (maTC == null) return NotFound();
            TraiCay traiCay = GetDataTraiCay(maTC);
            if (traiCay == null) return NotFound();
            return View(traiCay);
        }

        [HttpPost]
        public IActionResult Delete(TraiCay traiCay)
        {
            string sql = @"DELETE FROM TraiCay WHERE MaTC = @maTC";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                command.Parameters.AddWithValue("@maTC", traiCay.MaTC);
                connection.Open();
                command.ExecuteNonQuery();
            }
            return RedirectToAction("Index");
        }

        private List<SelectListItem> GetDataNhaCungCap()
        {
            List<SelectListItem> list = new List<SelectListItem>();
            string sql = @"SELECT MaNCC, TenNCC FROM NhaCungCap";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        SelectListItem item = new SelectListItem { Value = reader["MaNCC"].ToString()!, Text = reader["TenNCC"].ToString()! };
                        list.Add(item);
                    }
                }
            }
            return list;
        }

        private TraiCay GetDataTraiCay(int? maTC)
        {
            TraiCay traiCay = new TraiCay();
            string sql = @"SELECT MaTC, TenTC, Gia, NgayNhap, MaNCC FROM TraiCay WHERE MaTC = @maTC";

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
                        traiCay.NgayNhap = reader["NgayNhap"] != DBNull.Value ? Convert.ToDateTime(reader["NgayNhap"]) : (DateTime?)null;
                        traiCay.MaNCC = reader["MaNCC"].ToString()!;
                    }
                }
            }
            return traiCay;
        }
    }
}