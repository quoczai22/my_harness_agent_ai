namespace FruitShop.Models;

// Sinh từ file SQL: bảng TraiCay
public class TraiCay
{
    public int MaTC { get; set; } // IDENTITY: không INSERT
    public string TenTC { get; set; } = "";
    public decimal Gia { get; set; }
    public DateTime? NgayNhap { get; set; }
    public string MaNCC { get; set; } = "";
    public string? TenNhaCungCap { get; set; } // lấy bằng JOIN NhaCungCap
}