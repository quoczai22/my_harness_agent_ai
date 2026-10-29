using Microsoft.AspNetCore.Mvc.Rendering;
using Catalog.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System.Collections.Generic;
using System.Linq;

namespace Catalog.Controllers
{
    public class BookController : Controller
    {
        private readonly string? _connectionString;

        public BookController(IConfiguration configuration)
        {
            _connectionString = configuration.GetConnectionString("QLSach");
        }

        public IActionResult Index(string? keyword)
        {
            List<Book> danhSach = new List<Book>();
            string sql = @"SELECT b.BookId, b.Title, b.TenPublisher
                              FROM Book b LEFT JOIN Publisher p ON b.PublisherId = p.PublisherId";
            if (!string.IsNullOrEmpty(keyword))
            {
                sql += " WHERE b.Title LIKE @keyword";
            }

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                if (!string.IsNullOrEmpty(keyword)) command.Parameters.AddWithValue("@keyword", $"%{keyword}%");
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        Book book = new Book
                        {
                            BookId = Convert.ToInt32(reader["BookId"]),
                            Title = reader["Title"].ToString()!,
                            TenPublisher = reader["TenPublisher"].ToString()!
                        };
                        danhSach.Add(book);
                    }
                }
            }

            ViewBag.Keyword = keyword;
            return View(danhSach);
        }

        public IActionResult Create()
        {
            ViewBag.SelectList = new SelectList(
                _connectionString,
                "PublisherId",
                "Name",
                null,
                new { sortOrder = "NameAsc" }
            );
            return View();
        }

        [HttpPost]
        public IActionResult Create(Book book)
        {
            if (ModelState.IsValid)
            {
                string sql = @"INSERT INTO Book (Title, PublisherId) VALUES (@Title, @PublisherId)";
                using (SqlConnection connection = new SqlConnection(_connectionString))
                using (SqlCommand command = new SqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@Title", book.Title);
                    command.Parameters.AddWithValue("@PublisherId", book.PublisherId);
                    connection.Open();
                    command.ExecuteNonQuery();
                }
                return RedirectToAction("Index");
            }
            ViewBag.SelectList = new SelectList(
                _connectionString,
                "PublisherId",
                "Name",
                null,
                new { sortOrder = "NameAsc" }
            );
            return View(book);
        }

        public IActionResult Edit(int id)
        {
            Book book = null;
            string sql = @"SELECT b.BookId, b.Title, b.PublisherId, p.Name
                              FROM Book b INNER JOIN Publisher p ON b.PublisherId = p.PublisherId
                              WHERE b.BookId = @BookId";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                command.Parameters.AddWithValue("@BookId", id);
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        book = new Book
                        {
                            BookId = Convert.ToInt32(reader["BookId"]),
                            Title = reader["Title"].ToString()!,
                            PublisherId = Convert.ToInt32(reader["PublisherId"]),
                            TenPublisher = reader["Name"].ToString()!
                        };
                    }
                }
            }

            ViewBag.SelectList = new SelectList(
                _connectionString,
                "PublisherId",
                "Name",
                book?.PublisherId ?? 0,
                new { sortOrder = "NameAsc" }
            );
            return View(book);
        }

        [HttpPost]
        public IActionResult Edit(Book book)
        {
            if (ModelState.IsValid)
            {
                string sql = @"UPDATE Book SET Title = @Title, PublisherId = @PublisherId WHERE BookId = @BookId";
                using (SqlConnection connection = new SqlConnection(_connectionString))
                using (SqlCommand command = new SqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@BookId", book.BookId);
                    command.Parameters.AddWithValue("@Title", book.Title);
                    command.Parameters.AddWithValue("@PublisherId", book.PublisherId);
                    connection.Open();
                    command.ExecuteNonQuery();
                }
                return RedirectToAction("Index");
            }
            ViewBag.SelectList = new SelectList(
                _connectionString,
                "PublisherId",
                "Name",
                book?.PublisherId ?? 0,
                new { sortOrder = "NameAsc" }
            );
            return View(book);
        }

        public IActionResult Delete(int id)
        {
            string sql = @"DELETE FROM Book WHERE BookId = @BookId";
            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                command.Parameters.AddWithValue("@BookId", id);
                connection.Open();
                command.ExecuteNonQuery();
            }
            return RedirectToAction("Index");
        }
    }
}