@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" (echo Drag a text-based PDF onto this file, or run: Read-PDF.cmd "path\to\file.pdf" & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Read-PDF.ps1" -PdfPath "%~f1"
pause