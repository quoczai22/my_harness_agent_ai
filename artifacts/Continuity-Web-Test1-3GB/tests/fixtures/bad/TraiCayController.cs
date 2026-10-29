using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FruitShop.Controllers;

public class ShopContext : DbContext { }

public class TraiCayController : Controller
{
    public IActionResult Index(string keyword)
    {
        var sql = "SELECT * FROM TraiCay WHERE TenTC LIKE '%" + keyword + "%'";
        return View();
    }

    [HttpPost]
    public IActionResult Create(int maTC, string tenTC)
    {
        var sql = $"INSERT INTO TraiCay (MaTC, TenTC, Gia, MaNCC) VALUES ({maTC}, N'{tenTC}', 0, 'NCC01')";
        return View();
    }

    public IActionResult Delete(int id)
    {
        var sql = "DELETE FROM TraiCay WHERE MaTC = " + id;
        return View();
    }
}
