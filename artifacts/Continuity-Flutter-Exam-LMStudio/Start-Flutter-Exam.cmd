@echo off
setlocal
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Flutter-Exam.ps1"
if errorlevel 1 pause
