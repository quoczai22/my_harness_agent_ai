CREATE DATABASE CatalogDemo;
GO
CREATE TABLE [dbo].[Publisher] (
    [PublisherId] int IDENTITY(1,1) PRIMARY KEY,
    [Name] nvarchar(100) NOT NULL
);
CREATE TABLE [dbo].[Book] (
    [BookId] int IDENTITY(1,1) PRIMARY KEY,
    [Title] nvarchar(100) NOT NULL,
    [PublisherId] int NOT NULL,
    CONSTRAINT FK_Book_Publisher FOREIGN KEY ([PublisherId]) REFERENCES [dbo].[Publisher]([PublisherId])
);
