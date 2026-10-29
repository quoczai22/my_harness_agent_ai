using Microsoft.AspNetCore.Mvc;

namespace NoLayout.Controllers;
public class HomeController : Controller
{
    public IActionResult Index()
    {
        ViewBag.HoTen = "Sinh viên";
        return View();
    }
}
