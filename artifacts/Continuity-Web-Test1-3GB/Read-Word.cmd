@echo off
setlocal
chcp 65001 >nul
if "%~1"=="" (
  echo Drag a .docx file onto this file, or run: Read-Word.cmd "path\to\file.docx"
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Read-Word.ps1" -DocxPath "%~f1" -Question "%~2"
pause