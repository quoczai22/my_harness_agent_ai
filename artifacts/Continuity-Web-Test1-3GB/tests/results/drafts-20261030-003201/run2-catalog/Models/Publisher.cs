namespace Catalog.Models;

// Sinh từ file SQL: bảng Publisher
public class Publisher
{
    public int PublisherId { get; set; } // IDENTITY: không INSERT
    public string Name { get; set; } = "";
}