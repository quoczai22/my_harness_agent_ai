CREATE DATABASE SchoolDemo;
GO
CREATE TABLE Department (
    DepartmentId int IDENTITY(1,1) PRIMARY KEY,
    DepartmentName nvarchar(100) NOT NULL
);
CREATE TABLE Student (
    StudentId int IDENTITY(1,1) PRIMARY KEY,
    FullName nvarchar(100) NOT NULL,
    DepartmentId int NOT NULL,
    CONSTRAINT FK_Student_Department FOREIGN KEY (DepartmentId) REFERENCES Department(DepartmentId)
);
