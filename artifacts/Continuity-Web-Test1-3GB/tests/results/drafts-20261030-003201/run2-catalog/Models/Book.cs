namespace Catalog.Models;

// Sinh từ file SQL: bảng Book
public class Book
{
    public int BookId { get; set; } // IDENTITY: không INSERT
    public string Title { get; set; } = "";
    public int PublisherId { get; set; }
    public string? TenPublisher { get; set; } // lấy bằng JOIN Publisher
}