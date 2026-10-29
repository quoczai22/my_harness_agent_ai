using Catalog.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using System;
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
            string sql = @"SELECT b.BookId, b.Title, b.PublisherId, p.Name AS TenPublisher
                             FROM Book b INNER JOIN Publisher p ON b.PublisherId = p.PublisherId";

            if (keyword != null)
            {
                sql += " WHERE b.Title LIKE @keyword";
            }

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                if (keyword != null) command.Parameters.AddWithValue("@keyword", "%" + keyword + "%");
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        Book sach = new Book();
                        sach.BookId = Convert.ToInt32(reader["BookId"]);
                        sach.Title = reader["Title"].ToString()!;
                        sach.PublisherId = Convert.ToInt32(reader["PublisherId"]);
                        sach.TenPublisher = reader["TenPublisher"].ToString()!;
                        danhSach.Add(sach);
                    }
                }
            }

            ViewBag.Keyword = keyword;
            return View(danhSach);
        }

        public IActionResult Create()
        {
            ViewBag.Publishers = GetPublisherList();
            return View();
        }

        [HttpPost]
        public IActionResult Create(Book book)
        {
            if (ModelState.IsValid)
            {
                string sql = @"INSERT INTO Book (Title, PublisherId) VALUES (@title, @publisherId)";

                using (SqlConnection connection = new SqlConnection(_connectionString))
                using (SqlCommand command = new SqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@title", book.Title);
                    command.Parameters.AddWithValue("@publisherId", book.PublisherId);
                    connection.Open();
                    command.ExecuteNonQuery();
                }

                return RedirectToAction("Index");
            }

            ViewBag.Publishers = GetPublisherList();
            return View(book);
        }

        public IActionResult Edit(int id)
        {
            ViewBag.Publishers = GetPublisherList();
            Book book = GetBookById(id);
            return View(book);
        }

        [HttpPost]
        public IActionResult Edit(Book book)
        {
            if (ModelState.IsValid)
            {
                string sql = @"UPDATE Book SET Title = @title, PublisherId = @publisherId WHERE BookId = @bookId";

                using (SqlConnection connection = new SqlConnection(_connectionString))
                using (SqlCommand command = new SqlCommand(sql, connection))
                {
                    command.Parameters.AddWithValue("@title", book.Title);
                    command.Parameters.AddWithValue("@publisherId", book.PublisherId);
                    command.Parameters.AddWithValue("@bookId", book.BookId);
                    connection.Open();
                    command.ExecuteNonQuery();
                }

                return RedirectToAction("Index");
            }

            ViewBag.Publishers = GetPublisherList();
            return View(book);
        }

        public IActionResult Delete(int id)
        {
            string sql = @"DELETE FROM Book WHERE BookId = @bookId";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                command.Parameters.AddWithValue("@bookId", id);
                connection.Open();
                command.ExecuteNonQuery();
            }

            return RedirectToAction("Index");
        }

        private List<Publisher> GetPublisherList()
        {
            List<Publisher> publishers = new List<Publisher>();
            string sql = @"SELECT PublisherId, Name FROM Publisher";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    while (reader.Read())
                    {
                        Publisher publisher = new Publisher();
                        publisher.PublisherId = Convert.ToInt32(reader["PublisherId"]);
                        publisher.Name = reader["Name"].ToString()!;
                        publishers.Add(publisher);
                    }
                }
            }

            return publishers;
        }

        private Book GetBookById(int id)
        {
            Book book = new Book();
            string sql = @"SELECT BookId, Title, PublisherId FROM Book WHERE BookId = @bookId";

            using (SqlConnection connection = new SqlConnection(_connectionString))
            using (SqlCommand command = new SqlCommand(sql, connection))
            {
                command.Parameters.AddWithValue("@bookId", id);
                connection.Open();
                using (SqlDataReader reader = command.ExecuteReader())
                {
                    if (reader.Read())
                    {
                        book.BookId = Convert.ToInt32(reader["BookId"]);
                        book.Title = reader["Title"].ToString()!;
                        book.PublisherId = Convert.ToInt32(reader["PublisherId"]);
                    }
                }
            }

            return book;
        }
    }
}