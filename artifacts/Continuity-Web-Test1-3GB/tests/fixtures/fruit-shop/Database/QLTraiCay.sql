-- Script for the teacher's "fruit" exercise (don't edit)
create database QLTraiCay
go
use QLTraiCay
go
/* Supplier table: code is char, not identity */
create table NhaCungCap (
    MaNCC char(10) not null,
    TenNCC nvarchar(150) not null,
    DienThoai varchar(20) null,
    constraint PK_NhaCungCap primary key (MaNCC)
)
go
create table TraiCay (
    MaTC int identity(1,1) not null,
    TenTC nvarchar(100) not null,
    Gia decimal(18, 2) not null,
    NgayNhap datetime null,
    MaNCC char(10) not null,
    constraint PK_TraiCay primary key clustered (MaTC asc)
)
go
alter table TraiCay add constraint FK_TraiCay_NCC foreign key (MaNCC) references NhaCungCap (MaNCC)
go
insert into NhaCungCap values ('NCC01', N'Vườn (Tiền Giang), loại 1', '0909')
insert into TraiCay (TenTC, Gia, MaNCC) values (N'Xoài cát; ngọt', 35000, 'NCC01')
