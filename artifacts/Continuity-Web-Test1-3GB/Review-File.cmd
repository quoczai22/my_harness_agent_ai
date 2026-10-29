@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" (echo Drag a Python file onto this script, or run: Review-File.cmd path\to\file.py & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Review-File.ps1" -PythonPath "%~f1"
pause